// ============================================================
// MAIN MISSION RUNTIME — one active story mission
// ============================================================
import { state, saveGame } from '../state.js';
import { MISSION_DEFS, getMissionDef, MISSION_ORDER } from '../data/missions.js';
import { BASE_COL, BASE_ROW } from '../constants.js';
import { BASE_RANGE } from '../data/base.js';
import { addLog } from '../helpers.js';
import { showOnce, showTransmissionMessage } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';
import { grantKeyItem } from './keyItems.js';
import { nodeWorldPos } from '../render/camera.js';
import { RESOURCE_DEFS } from '../data/resources.js';

const DECRYPT_MS = 2 * 60 * 1000; // ~2 minutes wall time

/**
 * Non-linear decrypt curve (monotonic 0→1).
 * Time still takes DECRYPT_MS, but displayed % jumps / stalls.
 * Control points: [elapsed01, progress01]
 */
const DECRYPT_CURVE = [
  [0.00, 0.00],
  [0.06, 0.08],
  [0.10, 0.09],  // stall
  [0.14, 0.22],  // jump
  [0.22, 0.28],
  [0.28, 0.29],  // stall
  [0.34, 0.48],  // jump
  [0.48, 0.55],
  [0.55, 0.57],  // crawl
  [0.62, 0.71],
  [0.70, 0.74],
  [0.78, 0.88],  // jump
  [0.88, 0.91],
  [0.94, 0.96],
  [1.00, 1.00],
];

function sampleDecryptCurve(t01) {
  const t = Math.max(0, Math.min(1, t01));
  for (let i = 1; i < DECRYPT_CURVE.length; i++) {
    const [t0, p0] = DECRYPT_CURVE[i - 1];
    const [t1, p1] = DECRYPT_CURVE[i];
    if (t <= t1) {
      const u = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      // slight ease within segment
      const s = u * u * (3 - 2 * u);
      return p0 + (p1 - p0) * s;
    }
  }
  return 1;
}

function getDecryptElapsed01(b) {
  if (!b) return 0;
  const startWall = b.decryptStartedAtWall
    || (b.decryptEndsAtWall ? b.decryptEndsAtWall - DECRYPT_MS : 0);
  if (!startWall) return 0;
  return Math.max(0, Math.min(1, (Date.now() - startWall) / DECRYPT_MS));
}

function emptyMissionRt(def) {
  return {
    status: 'active', // active | ready | completed | locked
    stageIndex: 0,
    done: {},
    flags: {},
  };
}

export function ensureMissions() {
  if (!state.missions || typeof state.missions !== 'object') state.missions = {};
  if (!state.missionBeacon || typeof state.missionBeacon !== 'object') {
    state.missionBeacon = null;
  }
  // Unlock first mission at base tier 3+
  const bl = state.base?.level || 1;
  if (bl >= 3 && !state.missions.distress_beacon) {
    startMission('distress_beacon');
  }
  // Normalize existing
  for (const id of Object.keys(state.missions)) {
    const def = getMissionDef(id);
    const rt = state.missions[id];
    if (!def || !rt) continue;
    if (!rt.done) rt.done = {};
    if (!rt.flags) rt.flags = {};
    if (!['active', 'ready', 'completed', 'locked'].includes(rt.status)) rt.status = 'active';
    rt.stageIndex = Math.max(0, Math.min(def.stages.length - 1, Math.floor(rt.stageIndex || 0)));
  }
  return state.missions;
}

export function startMission(id) {
  const def = getMissionDef(id);
  if (!def) return false;
  if (!state.missions) state.missions = {};
  // Only one active main mission
  for (const [mid, rt] of Object.entries(state.missions)) {
    if (rt.status === 'active' && mid !== id) {
      // don't force-complete others; block start
      return false;
    }
  }
  if (state.missions[id]?.status === 'completed') return false;
  state.missions[id] = emptyMissionRt(def);
  if (id === 'distress_beacon') spawnDistressBeacon(true);
  addLog(`◈ Mission started: ${def.name}`);
  const sera = NPCS.sera?.transmissionLines?.mission_distress_start;
  if (sera) {
    setTimeout(() => showOnce('mission_distress_start', sera, null, 'sera', { kind: 'mission' }), 800);
  }
  try { window.openLeftHud?.('mission', { force: true }); } catch (_) { /* ignore */ }
  try { saveGame(); } catch (_) { /* ignore */ }
  window.patchMissionsPanel?.(true);
  window.patchMissionTracker?.(true);
  return true;
}

export function getActiveMission() {
  ensureMissions();
  for (const id of MISSION_ORDER) {
    const rt = state.missions[id];
    if (rt && (rt.status === 'active' || rt.status === 'ready')) {
      return { def: getMissionDef(id), rt };
    }
  }
  // any other active
  for (const [id, rt] of Object.entries(state.missions)) {
    if (rt.status === 'active' || rt.status === 'ready') {
      return { def: getMissionDef(id), rt };
    }
  }
  return null;
}

export function getMissionRuntime(id) {
  ensureMissions();
  return state.missions[id] || null;
}

function markObjective(missionId, objId) {
  const rt = state.missions[missionId];
  if (!rt || rt.status !== 'active' || rt.done[objId]) return false;
  rt.done[objId] = true;
  return true;
}

function stageComplete(def, rt) {
  const stage = def.stages[rt.stageIndex];
  if (!stage) return false;
  return stage.objectives.every((o) => rt.done[o.id]);
}

function advanceMission(missionId) {
  const def = getMissionDef(missionId);
  const rt = state.missions[missionId];
  if (!def || !rt || rt.status !== 'active') return;
  rt.stageIndex += 1;
  if (rt.stageIndex >= def.stages.length) {
    rt.stageIndex = def.stages.length - 1;
    // Hang as active on last stage for now (no rewards/complete)
    rt.flags.storyHang = true;
  }
  try { saveGame(); } catch (_) { /* ignore */ }
  window.patchMissionsPanel?.(true);
  window.patchMissionTracker?.(true);
}

export function notifyMissionObjective(missionId, objId) {
  ensureMissions();
  const def = getMissionDef(missionId);
  const rt = state.missions[missionId];
  if (!def || !rt || rt.status !== 'active') return;
  if (!markObjective(missionId, objId)) return;
  if (stageComplete(def, rt) && !rt.flags.storyHang) {
    advanceMission(missionId);
  } else {
    try { saveGame(); } catch (_) { /* ignore */ }
    window.patchMissionsPanel?.(true);
    window.patchMissionTracker?.(true);
  }
}

// ── Distress beacon ──────────────────────────────────────────

function chebyshev(c1, r1, c2, r2) {
  return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2));
}

export function spawnDistressBeacon(force = false) {
  if (state.missionBeacon && !force) return state.missionBeacon;
  const range = BASE_RANGE[(state.base?.level || 1) - 1] || 14;
  // Place in outer half of visible range, not on base footprint
  let col = BASE_COL;
  let row = BASE_ROW;
  for (let attempt = 0; attempt < 40; attempt++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.floor(range * (0.45 + Math.random() * 0.4));
    col = Math.round(BASE_COL + Math.cos(ang) * dist);
    row = Math.round(BASE_ROW + Math.sin(ang) * dist);
    const d = chebyshev(col, row, BASE_COL, BASE_ROW);
    if (d >= 4 && d <= range - 1) break;
  }
  state.missionBeacon = {
    id: 'distress_beacon_1',
    missionId: 'distress_beacon',
    col,
    row,
    // idle | decrypting | ready | claimed
    phase: 'idle',
    decryptStartedAt: null,
    decryptEndsAt: null,
    pulse: 0,
  };
  try { saveGame(); } catch (_) { /* ignore */ }
  return state.missionBeacon;
}

export function getMissionBeacon() {
  ensureMissions();
  const active = getActiveMission();
  if (!active || active.def.id !== 'distress_beacon') return null;
  if (active.rt.status === 'completed') return null;
  // Ensure beacon exists while mission active (before claimed)
  if (!state.missionBeacon) spawnDistressBeacon(true);
  if (state.missionBeacon?.phase === 'claimed' && active.rt.stageIndex >= 3) {
    // still show nothing on map after claimed
    return null;
  }
  if (state.missionBeacon?.phase === 'claimed') return null;
  return state.missionBeacon;
}

export function inspectBeacon() {
  const b = getMissionBeacon();
  if (!b) return;
  notifyMissionObjective('distress_beacon', 'find_beacon');
  state.selectedBeacon = true;
  window.openBeaconModal?.();
}

export function startBeaconDecrypt() {
  const b = state.missionBeacon;
  if (!b || b.phase !== 'idle') return false;
  const now = performance.now();
  const wall = Date.now();
  b.phase = 'decrypting';
  b.decryptStartedAt = now;
  b.decryptEndsAt = now + DECRYPT_MS;
  b.decryptStartedAtWall = wall;
  b.decryptEndsAtWall = wall + DECRYPT_MS;
  addLog('◈ Beacon decrypt started — cracking sealed layers…');
  try { saveGame(); } catch (_) { /* ignore */ }
  window.patchBeaconModal?.();
  return true;
}

export function tickMissionBeacon(dt) {
  const b = state.missionBeacon;
  if (!b) return;
  b.pulse = (b.pulse || 0) + dt;
  if (b.phase === 'decrypting') {
    const wallEnd = b.decryptEndsAtWall || 0;
    const perfEnd = b.decryptEndsAt || 0;
    const done = (wallEnd && Date.now() >= wallEnd)
      || (perfEnd && performance.now() >= perfEnd)
      || getBeaconDecryptProgress() >= 0.999;
    if (done) {
      b.phase = 'ready';
      b.decryptEndsAt = null;
      b.decryptProgress = 1;
      notifyMissionObjective('distress_beacon', 'decrypt_beacon');
      addLog('◈ Beacon decrypt complete — Data Box ready for retrieval');
      try { saveGame(); } catch (_) { /* ignore */ }
      window.patchBeaconModal?.();
      window.patchMissionTracker?.(true);
    }
  }
}

export function getBeaconDecryptRemainingMs() {
  const b = state.missionBeacon;
  if (!b || b.phase !== 'decrypting') return 0;
  if (b.decryptEndsAtWall) return Math.max(0, b.decryptEndsAtWall - Date.now());
  if (b.decryptEndsAt) return Math.max(0, b.decryptEndsAt - performance.now());
  return 0;
}

/** Display progress 0–1 (non-linear). Completes after ~DECRYPT_MS. */
export function getBeaconDecryptProgress() {
  const b = state.missionBeacon;
  if (!b) return 0;
  if (b.phase === 'ready' || b.phase === 'claimed') return 1;
  if (b.phase !== 'decrypting') return 0;
  return sampleDecryptCurve(getDecryptElapsed01(b));
}

/** Integer 0–100 for UI. */
export function getBeaconDecryptPercent() {
  return Math.max(0, Math.min(100, Math.floor(getBeaconDecryptProgress() * 100)));
}

/** Can ships be ordered to pick up the data box? */
export function canRetrieveBeaconItem() {
  const b = state.missionBeacon;
  if (!b || b.phase !== 'ready') return false;
  const rt = state.missions?.distress_beacon;
  if (!rt || rt.status !== 'active') return false;
  // Not already carried by a ship
  if ((state.ships || []).some((s) => s.missionCargo === 'data_box')) return false;
  return true;
}

function resumeShipAfterMission(ship, job) {
  if (!ship) return;
  // Restore prior depot if we forced base for the mission
  if (job?.resumeDepotType) {
    ship.depotType = job.resumeDepotType;
    ship.depotId = job.resumeDepotId ?? null;
  }
  const nodeId = job?.resumeNodeId;
  if (nodeId == null || !Number.isFinite(nodeId)) {
    ship.targetNode = null;
    ship.status = 'idle';
    return;
  }
  const node = (state.nodes || []).find((n) => n.id === nodeId);
  const occupied = (state.ships || []).some((s) => s.id !== ship.id && s.targetNode === nodeId);
  if (!node || occupied || (node.minLevel || 1) > (state.base?.level || 1)) {
    ship.targetNode = null;
    ship.status = 'idle';
    addLog(`◈ ${ship.name} free after mission — original node unavailable`);
    return;
  }
  ship.targetNode = nodeId;
  ship.status = 'flying';
  const pos = nodeWorldPos(node);
  ship.destX = pos.x;
  ship.destY = pos.y - 20;
  ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
  const label = RESOURCE_DEFS[node.type]?.label || 'node';
  addLog(`◈ ${ship.name} resuming ${label} route after mission`);
}

export function assignShipRetrieveBeacon(shipId) {
  if (!canRetrieveBeaconItem()) return false;
  const ship = (state.ships || []).find((s) => s.id === shipId);
  const b = state.missionBeacon;
  if (!ship || !b || ship.destroyed) return false;
  // Remember prior mining assignment so we can restore after delivery
  const resumeNodeId = Number.isFinite(ship.targetNode) ? ship.targetNode : null;
  const resumeDepotType = ship.depotType || 'base';
  const resumeDepotId = ship.depotId ?? null;
  // Clear combat/mine target; start mission leg
  ship.targetNode = null;
  ship.missionJob = {
    type: 'retrieve_beacon',
    phase: 'to_base', // to_base → to_beacon → to_base_deliver → done
    beaconId: b.id,
    itemId: 'data_box',
    resumeNodeId,
    resumeDepotType,
    resumeDepotId,
  };
  // Head to base first to dump cargo
  ship.status = 'returning';
  ship.destX = null; // tick will resolve base
  ship.depotType = 'base';
  ship.depotId = null;
  addLog(`◈ ${ship.name} tasked: recover Data Box from distress beacon`);
  try { saveGame(); } catch (_) { /* ignore */ }
  window.patchSelectedShipModal?.();
  return true;
}

/** Called when ship arrives at base during mission job or with mission cargo. */
export function onShipMissionBaseArrive(ship) {
  if (!ship?.missionJob && ship?.missionCargo !== 'data_box') return false;
  const job = ship.missionJob;

  // Delivering data box
  if (ship.missionCargo === 'data_box' && (!job || job.phase === 'to_base_deliver' || job.phase === 'done')) {
    const resumeJob = job ? { ...job } : null;
    ship.missionCargo = null;
    ship.missionJob = null;
    grantKeyItem('data_box');
    notifyMissionObjective('distress_beacon', 'retrieve_box');
    // Mark await flag and hang
    const rt = state.missions.distress_beacon;
    if (rt) {
      rt.done.await_sera = true;
      rt.flags.sera_analyzing = true;
      rt.flags.storyHang = true;
      // push to last stage index
      const def = getMissionDef('distress_beacon');
      if (def) rt.stageIndex = def.stages.length - 1;
    }
    if (state.missionBeacon) state.missionBeacon.phase = 'claimed';
    const sera = NPCS.sera?.transmissionLines?.mission_databox_secured;
    if (sera) {
      setTimeout(() => showTransmissionMessage(sera, null, 'sera', { kind: 'mission' }), 600);
    }
    addLog('◈ Data Box delivered to base — Sera begins analysis');
    // Return ship to its prior mining node
    resumeShipAfterMission(ship, resumeJob);
    try { saveGame(); } catch (_) { /* ignore */ }
    window.patchMissionsPanel?.(true);
    window.patchMissionTracker?.(true);
    window.patchSelectedShipModal?.();
    return true;
  }

  if (job?.type === 'retrieve_beacon' && job.phase === 'to_base') {
    // Cargo dumped by normal return logic; proceed to beacon
    job.phase = 'to_beacon';
    ship.status = 'flying';
    // dest set in tick via mission
    return true;
  }
  return false;
}

export function onShipMissionBeaconArrive(ship) {
  const job = ship.missionJob;
  const b = state.missionBeacon;
  if (!job || job.type !== 'retrieve_beacon' || job.phase !== 'to_beacon') return false;
  if (!b || b.phase !== 'ready') return false;
  // Pick up
  ship.missionCargo = 'data_box';
  b.phase = 'claimed';
  job.phase = 'to_base_deliver';
  ship.status = 'returning';
  addLog(`◈ ${ship.name} secured the Data Box — returning to base`);
  try { saveGame(); } catch (_) { /* ignore */ }
  return true;
}

export function getMissionsUiModel() {
  ensureMissions();
  const active = [];
  const completed = [];
  for (const id of MISSION_ORDER) {
    const def = getMissionDef(id);
    const rt = state.missions[id];
    if (!def || !rt) continue;
    const entry = { def, rt };
    if (rt.status === 'completed') completed.push(entry);
    else active.push(entry);
  }
  // If none started yet but base < 3, show locked teaser
  return { active, completed, lockedPreview: !state.missions.distress_beacon && (state.base?.level || 1) < 3 };
}

export function onBaseLevelUp(level) {
  if (level >= 3) {
    ensureMissions();
    if (!state.missions.distress_beacon) startMission('distress_beacon');
  }
}

// Boot-safe
export function bootMissions() {
  ensureMissions();
}
