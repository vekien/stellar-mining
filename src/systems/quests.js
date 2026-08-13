// ============================================================
// QUEST RUNTIME — progress, stage advance, claim, tracking
// ============================================================
import { state, saveGame } from '../state.js';
import { QUEST_DEFS, getQuestDef } from '../data/quests.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';
import { refresh } from '../ui/refresh.js';
import { addLog, fmt, addCoins } from '../helpers.js';
import { getResearchPointCap } from './research/definitions.js';
import { updateHeaderRP } from '../ui/ui.js';
import {
  ensureDailyQuests,
  evaluateDailyQuests,
  getDailyQuestsUiEntries,
  claimDailyQuest,
} from './dailyQuests.js';

const TRACK_CAP = 3;

function emptyProgress(def) {
  return {
    status: 'active', // active | ready | completed
    stageIndex: 0,
    done: {},
    flags: {},
    rewards: null,
  };
}

function normalizeQuestRuntime(rt, def) {
  if (!rt || typeof rt !== 'object') return emptyProgress(def);
  if (rt.status !== 'active' && rt.status !== 'ready' && rt.status !== 'completed') rt.status = 'active';
  rt.stageIndex = Math.max(0, Math.floor(Number(rt.stageIndex) || 0));
  if (rt.status === 'completed') {
    rt.stageIndex = Math.max(rt.stageIndex, (def?.stages?.length || 1) - 1);
  } else if (def?.stages?.length) {
    rt.stageIndex = Math.min(rt.stageIndex, def.stages.length - 1);
  }
  if (!rt.done || typeof rt.done !== 'object') rt.done = {};
  if (!rt.flags || typeof rt.flags !== 'object') rt.flags = {};
  return rt;
}

function ensureTrackedQuestsInner() {
  if (!Array.isArray(state.trackedQuests)) state.trackedQuests = [];
  // Auto-track tutorial while active/ready
  const tut = state.quests?.tutorial;
  if (tut && (tut.status === 'active' || tut.status === 'ready')) {
    if (!state.trackedQuests.includes('tutorial')) {
      state.trackedQuests = ['tutorial', ...state.trackedQuests.filter((id) => id !== 'tutorial')].slice(0, TRACK_CAP);
    }
  }
  // Drop tracks for missing/completed quests
  state.trackedQuests = state.trackedQuests.filter((id) => {
    if (id === 'tutorial') {
      const st = state.quests?.tutorial?.status;
      return st === 'active' || st === 'ready';
    }
    if (String(id).startsWith('daily_')) {
      const q = state.dailyQuests?.quests?.find((x) => x.id === id);
      return q && (q.status === 'active' || q.status === 'ready');
    }
    const st = state.quests?.[id]?.status;
    return st === 'active' || st === 'ready';
  }).slice(0, TRACK_CAP);
  return state.trackedQuests;
}

export function ensureTrackedQuests() {
  ensureQuests();
  return ensureTrackedQuestsInner();
}

export function isQuestTracked(id) {
  ensureTrackedQuests();
  return state.trackedQuests.includes(id);
}

export function toggleTrackQuest(id) {
  ensureTrackedQuests();
  const i = state.trackedQuests.indexOf(id);
  if (i >= 0) {
    state.trackedQuests.splice(i, 1);
  } else {
    if (state.trackedQuests.length >= TRACK_CAP) {
      addLog(`⚠ Track up to ${TRACK_CAP} quests (unpin one first).`);
      return false;
    }
    state.trackedQuests.push(id);
  }
  try { saveGame(); } catch (_) { /* ignore */ }
  window.patchQuestsPanel?.(true);
  return true;
}

export function ensureQuests() {
  if (!state.quests || typeof state.quests !== 'object') state.quests = {};
  if (!state.quests.tutorial) {
    state.quests.tutorial = emptyProgress(QUEST_DEFS.tutorial);
    const veteran =
      (state.tutStep || 0) >= 11
      || (state.base?.level || 1) > 1
      || (state.ships?.length || 0) > 2
      || !!state.seenMsgs?.['first_craft_assigned'];
    if (veteran) {
      state.quests.tutorial.status = 'completed';
      state.quests.tutorial.stageIndex = QUEST_DEFS.tutorial.stages.length - 1;
      state.quests.tutorial.flags = { claimed: true };
    }
  } else {
    state.quests.tutorial = normalizeQuestRuntime(state.quests.tutorial, QUEST_DEFS.tutorial);
  }
  ensureDailyQuests();
  ensureTrackedQuestsInner();
  return state.quests;
}

export function isTutorialComplete() {
  ensureQuests();
  return state.quests.tutorial?.status === 'completed';
}

export function isQuestActive(id) {
  ensureQuests();
  const st = state.quests[id]?.status;
  return st === 'active' || st === 'ready';
}

export function getQuestRuntime(id) {
  ensureQuests();
  return state.quests[id] || null;
}

export function getQuestStage(id) {
  const def = getQuestDef(id);
  const rt = getQuestRuntime(id);
  if (!def || !rt || (rt.status !== 'active' && rt.status !== 'ready')) return null;
  return def.stages[rt.stageIndex] || null;
}

export function isObjectiveDone(questId, objId) {
  return !!getQuestRuntime(questId)?.done?.[objId];
}

export function isBaseUpgradeLocked() {
  return !isTutorialComplete();
}

export function isShipCraftLocked(shipType) {
  if (isTutorialComplete()) return false;
  if (shipType === 'scout') return false;
  return true;
}

function markObjective(questId, objId) {
  ensureQuests();
  const rt = state.quests[questId];
  if (!rt || rt.status !== 'active' || rt.done[objId]) return false;
  rt.done[objId] = true;
  return true;
}

function stageObjectivesComplete(def, rt) {
  const stage = def.stages[rt.stageIndex];
  if (!stage) return false;
  return stage.objectives.every((o) => rt.done[o.id]);
}

function tutorialRewards() {
  return {
    coins: 500,
    resources: { iron: 40, copper: 30 },
    rp: 1,
    rep: 0, // standing only from faction quests
  };
}

function advanceStage(questId) {
  const def = getQuestDef(questId);
  const rt = getQuestRuntime(questId);
  if (!def || !rt || rt.status !== 'active') return;
  const prev = def.stages[rt.stageIndex];
  rt.stageIndex += 1;
  if (rt.stageIndex >= def.stages.length) {
    // Await manual claim
    rt.stageIndex = def.stages.length - 1;
    rt.status = 'ready';
    rt.rewards = questId === 'tutorial' ? tutorialRewards() : (rt.rewards || null);
    addLog(`◎ Quest fulfilled: ${def.name} — claim your reward.`);
  } else {
    onStageAdvanced(questId, prev, def.stages[rt.stageIndex]);
  }
  try { saveGame(); } catch (_) { /* ignore */ }
  if (refresh.ui) refresh.ui();
  window.patchQuestsPanel?.();
  window.renderTutPointers?.();
}

function onStageAdvanced(questId, prevStage, nextStage) {
  if (questId !== 'tutorial') return;
  const byte = NPCS.byte?.transmissionLines;
  if (!byte) return;
  if (nextStage?.id === 'craft_scout') {
    setTimeout(() => showOnce('quest_tut_craft', byte.quest_craft_scout, 16, 'byte'), 600);
    if ((state.tutStep || 0) < 5) state.tutStep = 5;
  } else if (nextStage?.id === 'assign_both') {
    setTimeout(() => showOnce('quest_tut_assign', byte.quest_assign_both, 16, 'byte'), 600);
    if ((state.tutStep || 0) < 9) state.tutStep = 9;
  } else if (nextStage?.id === 'trade_sell') {
    setTimeout(() => showOnce('quest_tut_trade', byte.quest_trade_sell, 16, 'byte'), 600);
    if ((state.tutStep || 0) < 10) state.tutStep = 10;
  } else if (nextStage?.id === 'upgrade_ship') {
    setTimeout(() => showOnce('quest_tut_upgrade', byte.quest_upgrade_ship || byte.rigs_upgrades, 16, 'byte'), 600);
    state.upgradesTutActive = true;
    if ((state.tutStep || 0) < 11) state.tutStep = 11;
  }
}

function onQuestClaimed(questId) {
  if (questId !== 'tutorial') return;
  const byte = NPCS.byte?.transmissionLines;
  if (byte?.quest_complete) {
    setTimeout(() => showOnce('quest_tut_done', byte.quest_complete, 18, 'byte'), 700);
  }
  state.redirectTutActive = false;
  state.redirectTargetType = null;
  state.upgradesTutActive = false;
  if ((state.tutStep || 0) < 12) state.tutStep = 12;
  // drop tutorial track
  if (Array.isArray(state.trackedQuests)) {
    state.trackedQuests = state.trackedQuests.filter((id) => id !== 'tutorial');
  }
}

function grantRewards(rewards) {
  if (!rewards) return;
  if (rewards.coins > 0) addCoins(rewards.coins);
  if (rewards.resources) {
    for (const [type, amt] of Object.entries(rewards.resources)) {
      if (amt > 0) {
        state.resources[type] = (state.resources[type] || 0) + amt;
        import('./lifetime.js').then((m) => m.recordLifetimeResource?.(type, amt)).catch(() => {});
      }
    }
  }
  if (rewards.rp > 0) {
    const cap = getResearchPointCap(state.base.level);
    state.rp = Math.min(cap, (state.rp || 0) + rewards.rp);
    updateHeaderRP();
  }
  // Generic rep removed — use factionId + factionRep via factions system
  if (rewards.factionId && rewards.factionRep > 0) {
    import('./factions.js').then((m) => {
      if (m.hasFactionsUnlocked?.()) m.addFactionRep?.(rewards.factionId, rewards.factionRep);
    }).catch(() => {});
  }
}

export function claimQuest(questId) {
  // Daily board
  if (String(questId).startsWith('daily_')) {
    return claimDailyQuest(questId);
  }
  ensureQuests();
  const def = getQuestDef(questId);
  const rt = state.quests[questId];
  if (!def || !rt || rt.status !== 'ready') return false;
  const granted = rt.rewards || (questId === 'tutorial' ? tutorialRewards() : null);
  if (granted) rt.rewards = granted;
  grantRewards(granted);
  rt.status = 'completed';
  rt.flags = { ...(rt.flags || {}), claimed: true };
  try {
    import('./dailyQuests.js').then((m) => m.archiveQuestCompletion?.({
      id: questId,
      name: def.name,
      desc: def.desc,
      kind: def.kind || 'story',
      sol: state.sol || 1,
      rewards: granted,
    })).catch(() => {});
  } catch (_) { /* ignore */ }
  onQuestClaimed(questId);
  addLog(`✓ Quest claimed: ${def.name}`);
  try {
    import('../ui/transmissions.js').then((m) => m.showQuestRewardToast?.(questId, def.name, granted)).catch(() => {});
  } catch (_) { /* ignore */ }
  try { saveGame(); } catch (_) { /* ignore */ }
  if (refresh.ui) refresh.ui();
  window.patchQuestsPanel?.();
  window.renderTutPointers?.();
  return true;
}

export function notifyShipUpgraded() {
  ensureQuests();
  const rt = state.quests.tutorial;
  if (!rt || rt.status !== 'active') {
    state.upgradesTutActive = false;
    document.querySelectorAll('.tut-pointer').forEach((el) => el.remove());
    return;
  }
  const def = QUEST_DEFS.tutorial;
  const stage = def.stages[rt.stageIndex];
  if (!stage || stage.id !== 'upgrade_ship') return;
  for (const obj of stage.objectives) {
    if (obj.type === 'upgrade_ship') {
      if (markObjective('tutorial', obj.id) && stageObjectivesComplete(def, rt)) {
        state.upgradesTutActive = false;
        document.querySelectorAll('.tut-pointer').forEach((el) => el.remove());
        advanceStage('tutorial');
      }
    }
  }
}

export function evaluateCollectObjectives() {
  ensureQuests();
  evaluateDailyQuests();
  const rt = state.quests.tutorial;
  if (!rt || rt.status !== 'active') {
    window.patchQuestsPanel?.();
    return;
  }
  const def = QUEST_DEFS.tutorial;
  const stage = def.stages[rt.stageIndex];
  if (!stage || stage.id !== 'gather') {
    window.patchQuestsPanel?.();
    return;
  }

  let anyNew = false;
  for (const obj of stage.objectives) {
    if (obj.type !== 'collect') continue;
    if (rt.done[obj.id]) continue;
    const have = state.resources[obj.resource] || 0;
    if (have >= obj.amount) {
      markObjective('tutorial', obj.id);
      anyNew = true;
      onGatherObjectiveComplete(obj);
    }
  }
  if (anyNew && stageObjectivesComplete(def, rt)) {
    advanceStage('tutorial');
    return;
  }
  if (anyNew) {
    try { saveGame(); } catch (_) { /* ignore */ }
    window.renderTutPointers?.();
  }
  window.patchQuestsPanel?.();
}

function onGatherObjectiveComplete(obj) {
  const rt = state.quests.tutorial;
  if (!rt) return;
  const copperDone = !!rt.done.copper50;
  const ironDone = !!rt.done.iron75;
  if (copperDone && ironDone) {
    state.redirectTutActive = false;
    state.redirectTargetType = null;
    return;
  }
  if (copperDone && !ironDone) {
    state.redirectTutActive = true;
    state.redirectTargetType = 'iron';
    setTimeout(() => showOnce('quest_tut_switch_iron', NPCS.byte.transmissionLines.quest_switch_resource('iron'), 14, 'byte'), 500);
  } else if (ironDone && !copperDone) {
    state.redirectTutActive = true;
    state.redirectTargetType = 'copper';
    setTimeout(() => showOnce('quest_tut_switch_copper', NPCS.byte.transmissionLines.quest_switch_resource('copper'), 14, 'byte'), 500);
  }
}

export function notifyShipCrafted(shipType) {
  ensureQuests();
  const rt = state.quests.tutorial;
  if (!rt || rt.status !== 'active') return;
  const def = QUEST_DEFS.tutorial;
  const stage = def.stages[rt.stageIndex];
  if (!stage || stage.id !== 'craft_scout') return;
  for (const obj of stage.objectives) {
    if (obj.type === 'craft_ship' && obj.shipType === shipType) {
      if (markObjective('tutorial', obj.id) && stageObjectivesComplete(def, rt)) {
        advanceStage('tutorial');
      }
    }
  }
}

export function evaluateAssignObjectives() {
  ensureQuests();
  const rt = state.quests.tutorial;
  if (!rt || rt.status !== 'active') return;
  const def = QUEST_DEFS.tutorial;
  const stage = def.stages[rt.stageIndex];
  if (!stage || stage.id !== 'assign_both') return;

  const types = new Set();
  for (const s of state.ships || []) {
    if (s.targetNode == null) continue;
    const node = (state.nodes || []).find((n) => n.id === s.targetNode);
    if (node?.type) types.add(node.type);
  }
  for (const obj of stage.objectives) {
    if (obj.type !== 'ships_on_diff_resources') continue;
    if (types.size >= (obj.amount || 2) && (state.ships || []).filter((s) => s.targetNode != null).length >= (obj.amount || 2)) {
      if (markObjective('tutorial', obj.id) && stageObjectivesComplete(def, rt)) {
        advanceStage('tutorial');
      }
    }
  }
}

export function notifyResourceSold(type, amount) {
  ensureQuests();
  evaluateDailyQuests();
  const rt = state.quests.tutorial;
  if (!rt || rt.status !== 'active') return;
  const def = QUEST_DEFS.tutorial;
  const stage = def.stages[rt.stageIndex];
  if (!stage || stage.id !== 'trade_sell') return;
  if (amount <= 0) return;
  for (const obj of stage.objectives) {
    if (obj.type === 'sell_resource') {
      if (markObjective('tutorial', obj.id) && stageObjectivesComplete(def, rt)) {
        advanceStage('tutorial');
      }
    }
  }
}

/** Coins gained (deposit sell etc.) — refresh daily. */
export function notifyCoinsGained() {
  evaluateDailyQuests();
}

export function evaluateAllQuests() {
  ensureQuests();
  evaluateCollectObjectives();
  evaluateAssignObjectives();
  evaluateDailyQuests();
}

export function getQuestsUiModel() {
  ensureQuests();
  const active = [];
  const ready = [];
  const completed = [];
  const seen = new Set();
  for (const def of Object.values(QUEST_DEFS)) {
    const rt = state.quests[def.id] || emptyProgress(def);
    const entry = { def, rt };
    seen.add(def.id);
    if (rt.status === 'completed') completed.push(entry);
    else if (rt.status === 'ready') ready.push(entry);
    else active.push(entry);
  }
  const daily = getDailyQuestsUiEntries();
  for (const e of daily.active) {
    if (seen.has(e.def.id)) continue;
    seen.add(e.def.id);
    if (e.rt.status === 'ready') ready.push(e);
    else active.push(e);
  }
  for (const e of daily.completed) {
    if (seen.has(e.def.id)) continue;
    seen.add(e.def.id);
    completed.push(e);
  }
  return { active, ready, completed };
}

export function getTrackedQuestsUiModel() {
  ensureTrackedQuests();
  const { active, ready } = getQuestsUiModel();
  const open = [...ready, ...active];
  const tracked = open.filter((e) => state.trackedQuests.includes(e.def.id));
  // Always show ready even if not tracked? User said pin/track is what left panel shows
  return tracked.length ? tracked : open.filter((e) => e.def.id === 'tutorial' && e.rt.status !== 'completed');
}

export function formatRewards(rewards) {
  if (!rewards || typeof rewards !== 'object') return '';
  const parts = [];
  const coins = Math.floor(Number(rewards.coins) || 0);
  const rp = Math.floor(Number(rewards.rp) || 0);
  const rep = Math.floor(Number(rewards.rep) || 0);
  if (coins > 0) parts.push(`$${fmt(coins)}`);
  if (rewards.resources && typeof rewards.resources === 'object') {
    for (const [type, amt] of Object.entries(rewards.resources)) {
      const n = Math.floor(Number(amt) || 0);
      if (n > 0) {
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        parts.push(`${fmt(n)} ${label}`);
      }
    }
  }
  if (rp > 0) parts.push(`${rp} RP`);
  if (rewards.factionId && rewards.factionRep > 0) {
    parts.push(`+${Math.floor(rewards.factionRep)} standing`);
  } else if (rep > 0) {
    parts.push(`+${rep} Rep`);
  }
  return parts.join(' · ');
}

// Boot
ensureQuests();

if (typeof window !== 'undefined') {
  window.isTutorialComplete = isTutorialComplete;
  window.isBaseUpgradeLocked = isBaseUpgradeLocked;
  window.claimQuest = claimQuest;
  window.toggleTrackQuest = toggleTrackQuest;
}
