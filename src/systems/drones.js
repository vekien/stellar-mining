// ============================================================
// DRONE SYSTEM — spawn, tick, status
// ============================================================
import { state } from '../state.js';
import { nodeWorldPos, gridToWorld } from '../render/camera.js';
import { isDroneLabModule } from '../data/modules.js';
import { NULLWELL_COLLAPSE_RATE } from './research/definitions.js';

const DRONE_FLY_SPEED        = 100;
const DRONE_ARRIVAL_RADIUS   = 8;
const DRONE_LAUNCH_DELAY_MIN = 1.5;
const DRONE_LAUNCH_DELAY_MAX = 3.5;
const BH_ORBIT_MIN = 18;
const BH_ORBIT_MAX = 42;

// ── Task type definitions (extend here for anomalies, relics, ruins…) ──
export const DRONE_TASK_DEFS = {
  crashed_ship: {
    flyLabel:  'Flying to Crashed Ship',
    scanLabel: 'Scanning and Salvaging: Crashed Ship',
  },
  black_hole: {
    flyLabel:  'Flying to Black Hole',
    scanLabel: 'Damping singularity (Nullwell)',
  },
  // anomaly:  { flyLabel: 'Flying to Anomaly',  scanLabel: 'Investigating Anomaly' },
  // relic:    { flyLabel: 'Flying to Relic',    scanLabel: 'Examining Relic'       },
  // ruin:     { flyLabel: 'Flying to Ruins',    scanLabel: 'Surveying Ruins'       },
};

function isDroneFree(drone) {
  if (!drone) return false;
  if (drone.taskType === 'black_hole') return false;
  if (drone.returningHome) return false;
  // Truly idle at lab — no active salvage task
  return drone.status === 'idle' && (drone.taskNodeId == null || drone.taskNodeId === undefined);
}

function recallDroneToLab(drone) {
  if (!drone) return;
  drone.taskType = null;
  drone.taskLabel = '';
  drone.taskNodeId = null;
  drone.bhTarget = false;
  const lab = (state.modules || []).find((m) => m.id === drone.labId);
  if (lab && (lab.health || 0) > 0) {
    const labPos = gridToWorld(lab.col, lab.row);
    drone.destX = labPos.x;
    drone.destY = labPos.y;
    drone.flightTotalDist = Math.hypot(drone.destX - drone.x, drone.destY - drone.y);
    drone.returningHome = true;
    drone.status = 'flying';
    drone.launchDelay = 0;
  } else {
    drone.returningHome = false;
    drone.status = 'idle';
  }
}

function assignDroneToBlackHole(drone, bh) {
  if (!drone || !bh) return;
  const taskDef = DRONE_TASK_DEFS.black_hole;
  drone.taskType = 'black_hole';
  drone.taskLabel = taskDef.scanLabel;
  drone.taskNodeId = null;
  drone.bhTarget = true;
  drone.returningHome = false;
  drone.destX = bh.wx;
  drone.destY = bh.wy;
  drone.flightTotalDist = Math.hypot(drone.destX - drone.x, drone.destY - drone.y);
  drone.launchDelay = 0.4 + Math.random() * 1.2;
  drone.status = 'idle'; // brief launch delay, then flying
  drone.scanMoveTimer = 0;
}

/**
 * Nullwell Protocol: free drones deploy to the active black hole and
 * accelerate its collapse while on-station.
 */
export function tickBlackHoleDrones(dt) {
  if (!state.researchUnlocks?.nullwell_protocol) return;
  const drones = state.drones || [];
  const bh = state.blackHole;

  if (!bh) {
    for (const d of drones) {
      if (d.taskType === 'black_hole') recallDroneToLab(d);
    }
    return;
  }

  // Dispatch free drones
  for (const d of drones) {
    if (isDroneFree(d)) assignDroneToBlackHole(d, bh);
  }

  // On-station dampers burn black-hole lifetime
  let dampers = 0;
  for (const d of drones) {
    if (d.taskType === 'black_hole' && d.status === 'scanning') dampers += 1;
  }
  if (dampers > 0) {
    bh.age = (bh.age || 0) + dt * dampers * NULLWELL_COLLAPSE_RATE;
  }
}

// Active drone count for a lab — derived from live state, never a stored field
export function getActiveLabDroneCount(labId) {
  return (state.drones || []).filter(d => d.labId === labId).length;
}

function getFirstAvailableDroneLab() {
  return state.modules.find(m =>
    isDroneLabModule(m) &&
    (m.health || 0) > 0 &&
    getActiveLabDroneCount(m.id) < (m.droneCapacity || 2),
  ) || null;
}

// ── Spawn ──────────────────────────────────────────────────────
// taskType must be a key of DRONE_TASK_DEFS (defaults to 'crashed_ship')
export function spawnDrone(targetNode, taskType = 'crashed_ship') {
  const lab = getFirstAvailableDroneLab();
  if (!lab) return null;

  // One drone per node at most
  const alreadyAssigned = (state.drones || []).some(d => d.taskNodeId === targetNode.id);
  if (alreadyAssigned) return null;

  if (!state.drones) state.drones = [];
  if (!Number.isFinite(state.droneIdCounter) || state.droneIdCounter < 1) state.droneIdCounter = 1;

  const id      = state.droneIdCounter++;
  const labPos  = gridToWorld(lab.col, lab.row);
  const nodePos = nodeWorldPos(targetNode);
  const destX   = nodePos.x;
  const destY   = nodePos.y - 20;
  const taskDef = DRONE_TASK_DEFS[taskType] || DRONE_TASK_DEFS.crashed_ship;

  const drone = {
    id,
    labId:           lab.id,
    name:            `Drone #${id}`,
    status:          'idle',    // 'idle' | 'flying' | 'scanning'
    taskType,
    taskLabel:       taskDef.scanLabel,
    launchDelay:     DRONE_LAUNCH_DELAY_MIN + Math.random() * (DRONE_LAUNCH_DELAY_MAX - DRONE_LAUNCH_DELAY_MIN),
    taskNodeId:      targetNode.id,
    x:               labPos.x,
    y:               labPos.y,
    destX,
    destY,
    heading:         0,
    flightTotalDist: Math.hypot(destX - labPos.x, destY - labPos.y),
    flySpeed:        DRONE_FLY_SPEED,
    spawnAge:        0,          // drives materialise animation in renderer
  };

  state.drones.push(drone);
  return drone;
}

// ── Tick ──────────────────────────────────────────────────────
export function tickDrone(drone, dt) {
  drone.spawnAge = (drone.spawnAge || 0) + dt;

  // Sit idle for launchDelay seconds, then begin flight
  const pendingLaunch = drone.status === 'idle'
    && (drone.taskNodeId != null || drone.taskType === 'black_hole');
  if (pendingLaunch) {
    drone.launchDelay = (drone.launchDelay ?? 0) - dt;
    if (drone.launchDelay <= 0) {
      drone.launchDelay = 0;
      // Refresh BH dest in case it moved/scale-changed
      if (drone.taskType === 'black_hole' && state.blackHole) {
        drone.destX = state.blackHole.wx;
        drone.destY = state.blackHole.wy;
      }
      drone.status = 'flying';
    }
    return;
  }

  if (drone.status === 'flying') {
    // Track live black hole while en route
    if (drone.taskType === 'black_hole') {
      if (!state.blackHole) {
        recallDroneToLab(drone);
        return;
      }
      drone.destX = state.blackHole.wx;
      drone.destY = state.blackHole.wy;
    }

    const dx   = drone.destX - drone.x;
    const dy   = drone.destY - drone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DRONE_ARRIVAL_RADIUS) {
      if (drone.returningHome) {
        drone.returningHome = false;
        drone.status = 'idle';
        drone.taskType = null;
        drone.taskLabel = '';
        return;
      }
      if (drone.taskType === 'black_hole') {
        drone.status = 'scanning';
        drone.scanMoveTimer = 0;
        return;
      }
      drone.status = 'scanning';
      return;
    }

    // Smooth heading toward destination
    const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
    let da = targetAngle - drone.heading;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    drone.heading += Math.sign(da) * Math.min(Math.abs(da), 6 * dt);

    const moveAngle   = drone.heading - Math.PI / 2;
    const step        = Math.min(drone.flySpeed * dt, dist);
    const directBlend = Math.max(0, Math.min(1, 1 - dist / 60));
    const hx = Math.cos(moveAngle), hy = Math.sin(moveAngle);
    const tx = dx / dist,           ty = dy / dist;
    drone.x += (hx * (1 - directBlend) + tx * directBlend) * step;
    drone.y += (hy * (1 - directBlend) + ty * directBlend) * step;

  } else if (drone.status === 'scanning') {
    // Nullwell damping orbit around black hole
    if (drone.taskType === 'black_hole') {
      const bh = state.blackHole;
      if (!bh) {
        recallDroneToLab(drone);
        return;
      }
      drone.scanMoveTimer = (drone.scanMoveTimer ?? 0) - dt;
      if (drone.scanMoveTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const radius = BH_ORBIT_MIN + Math.random() * (BH_ORBIT_MAX - BH_ORBIT_MIN);
        drone.destX = bh.wx + Math.cos(angle) * radius;
        drone.destY = bh.wy + Math.sin(angle) * radius;
        drone.scanMoveTimer = 2.5 + Math.random() * 3.5;
      }
      const dx   = drone.destX - drone.x;
      const dy   = drone.destY - drone.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const SCAN_SPEED = 36;
        const step = Math.min(SCAN_SPEED * dt, dist);
        const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
        let da = targetAngle - drone.heading;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        drone.heading += Math.sign(da) * Math.min(Math.abs(da), 4 * dt);
        const moveAngle   = drone.heading - Math.PI / 2;
        const directBlend = Math.max(0, Math.min(1, 1 - dist / 40));
        const hx = Math.cos(moveAngle), hy = Math.sin(moveAngle);
        const tx = dx / dist,           ty = dy / dist;
        drone.x += (hx * (1 - directBlend) + tx * directBlend) * step;
        drone.y += (hy * (1 - directBlend) + ty * directBlend) * step;
      }
      return;
    }

    const node = state.nodes.find(n => n.id === drone.taskNodeId);
    if (!node) {
      drone.status     = 'idle';
      drone.taskNodeId = null;
      drone.taskLabel  = '';
      return;
    }

    // Count down to next reposition around the target
    drone.scanMoveTimer = (drone.scanMoveTimer ?? 0) - dt;
    if (drone.scanMoveTimer <= 0) {
      const nodePos = nodeWorldPos(node);
      const angle   = Math.random() * Math.PI * 2;
      const radius  = 8 + Math.random() * 20;   // 8–28 px from node centre
      drone.destX = nodePos.x + Math.cos(angle) * radius;
      drone.destY = (nodePos.y - 20) + Math.sin(angle) * radius;
      drone.scanMoveTimer = 5 + Math.random() * 5; // 5–10 s
    }

    // Drift slowly toward current scan waypoint
    const dx   = drone.destX - drone.x;
    const dy   = drone.destY - drone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      const SCAN_SPEED = 28;
      const step = Math.min(SCAN_SPEED * dt, dist);
      const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
      let da = targetAngle - drone.heading;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      drone.heading += Math.sign(da) * Math.min(Math.abs(da), 3 * dt);
      const moveAngle   = drone.heading - Math.PI / 2;
      const directBlend = Math.max(0, Math.min(1, 1 - dist / 40));
      const hx = Math.cos(moveAngle), hy = Math.sin(moveAngle);
      const tx = dx / dist,           ty = dy / dist;
      drone.x += (hx * (1 - directBlend) + tx * directBlend) * step;
      drone.y += (hy * (1 - directBlend) + ty * directBlend) * step;
    }
  }
}

// ── Status helpers (used by UI) ───────────────────────────────
export function getDronesForLab(labId) {
  return (state.drones || []).filter(d => d.labId === labId);
}

export function getDroneStatusText(drone) {
  if (drone.returningHome) return 'Returning to lab';
  if (drone.taskType === 'black_hole') {
    if (drone.status === 'scanning') return DRONE_TASK_DEFS.black_hole.scanLabel;
    if (drone.status === 'flying') return DRONE_TASK_DEFS.black_hole.flyLabel;
    if (drone.status === 'idle') return 'Launching Nullwell…';
  }
  const def = DRONE_TASK_DEFS[drone.taskType] || DRONE_TASK_DEFS.crashed_ship;
  if (drone.status === 'scanning') return def.scanLabel;
  if (drone.status === 'flying')   return def.flyLabel;
  if (drone.status === 'idle' && drone.taskNodeId !== null) return 'Launching…';
  return 'Idle';
}
