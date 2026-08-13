// ============================================================
// DAILY QUESTS — 3 rotating SOL objectives (research unlock)
// ============================================================
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS, isStorableResource } from '../data/resources.js';
import { addLog, fmt, addCoins } from '../helpers.js';
import { getResearchPointCap } from './research/definitions.js';
import { updateHeaderRP } from '../ui/ui.js';
import {
  ensureLifetimeGained,
  getLifetimeCoins,
  getLifetimeResource,
  recordLifetimeResource,
} from './lifetime.js';
import {
  hasFactionsUnlocked,
  pickFactionId,
  addFactionRep,
  ensureFactionRep,
} from './factions.js';
import { getFactionDef } from '../data/factions.js';

const DAILY_COUNT = 3;
const HISTORY_CAP = 80;

/** Floor targets so early / zero-lifetime still has a real goal. */
const MIN_COIN_TARGET = 500;
const MIN_RES_TARGET = 500;
/** Lifetime % band for targets (of all-time gains). */
const COIN_PCT_MIN = 0.08;
const COIN_PCT_MAX = 0.16;
const RES_PCT_MIN = 0.12;
const RES_PCT_MAX = 0.22;
/** Soft caps so mid-late game stays finishable in a SOL. */
const COIN_TARGET_SOFT_CAP = 2_500_000;
const RES_TARGET_SOFT_CAP = 250_000;

export function ensureQuestHistory() {
  if (!Array.isArray(state.questHistory)) state.questHistory = [];
  return state.questHistory;
}

/** Push a completed quest snapshot (dedupe by id). */
export function archiveQuestCompletion(snap) {
  if (!snap?.id) return;
  ensureQuestHistory();
  state.questHistory = [
    {
      id: snap.id,
      name: snap.name || 'Quest',
      desc: snap.desc || '',
      kind: snap.kind || 'daily',
      sol: snap.sol || state.sol || 1,
      rewards: snap.rewards || null,
    },
    ...state.questHistory.filter((h) => h.id !== snap.id),
  ].slice(0, HISTORY_CAP);
}

function archiveDailyBoard(quests) {
  if (!Array.isArray(quests)) return;
  for (const q of quests) {
    if (q.status === 'completed') {
      archiveQuestCompletion({
        id: q.id,
        name: q.name,
        desc: q.desc,
        kind: 'daily',
        sol: state.dailyQuests?.sol || state.sol || 1,
        rewards: q.rewards,
      });
    }
  }
}

function tier() {
  return Math.max(1, Math.min(10, Math.floor(state.base?.level || 1)));
}

function resourcesAtOrBelowTier(t) {
  const out = [];
  for (let i = 1; i <= t; i++) {
    const def = MINE_TIERS[i];
    if (def?.resources) out.push(...def.resources.filter((r) => isStorableResource(r)));
  }
  return out;
}

function roundStep(n, step) {
  const s = Math.max(1, step);
  return Math.max(s, Math.floor(n / s) * s);
}

/**
 * Scale a daily target from lifetime gains.
 * @param {number} lifetime all-time gained
 * @param {{ min: number, pctMin: number, pctMax: number, step: number, softCap: number }} opts
 */
function scaleFromLifetime(lifetime, opts) {
  const life = Math.max(0, Math.floor(Number(lifetime) || 0));
  const pct = opts.pctMin + Math.random() * Math.max(0, opts.pctMax - opts.pctMin);
  let target = Math.floor(life * pct);
  // Also respect current holdings so stocked-up players get a real push
  target = Math.max(target, Math.floor((opts.holdings || 0) * (opts.holdPct || 0.1)));
  target = Math.max(opts.min, target);
  if (opts.softCap > 0) target = Math.min(opts.softCap, target);
  return roundStep(target, opts.step);
}

function scaleCoinTarget() {
  const t = tier();
  const min = Math.max(MIN_COIN_TARGET, 400 * t);
  return scaleFromLifetime(getLifetimeCoins(), {
    min,
    pctMin: COIN_PCT_MIN,
    pctMax: COIN_PCT_MAX,
    holdings: state.coins || 0,
    holdPct: 0.08,
    step: min >= 5000 ? 100 : 50,
    softCap: COIN_TARGET_SOFT_CAP,
  });
}

function scaleResourceTarget(res) {
  const t = tier();
  const min = Math.max(MIN_RES_TARGET, 350 * t);
  const life = getLifetimeResource(res);
  const hold = Math.floor(state.resources[res] || 0);
  return scaleFromLifetime(Math.max(life, hold), {
    min,
    pctMin: RES_PCT_MIN,
    pctMax: RES_PCT_MAX,
    holdings: hold,
    holdPct: 0.12,
    step: min >= 2000 ? 25 : 5,
    softCap: RES_TARGET_SOFT_CAP,
  });
}

/** Reward coin payout scaled to the resource target + economy. */
function scaleCoinReward(fromResourceTarget, res) {
  const t = tier();
  const unit = Math.max(1, RESOURCE_DEFS[res]?.sellPrice || 2);
  const fromRes = Math.floor(fromResourceTarget * unit * (0.12 + Math.random() * 0.1));
  const fromLife = Math.floor(getLifetimeCoins() * (0.015 + Math.random() * 0.02));
  const min = Math.max(100, 80 * t);
  const raw = Math.max(min, fromRes, fromLife);
  return roundStep(Math.min(raw, 500_000), 25);
}

/** Resource reward for cash-flow quests. */
function scaleResourceReward(res) {
  const t = tier();
  const min = Math.max(25, 20 * t);
  const life = getLifetimeResource(res);
  const amt = scaleFromLifetime(life, {
    min,
    pctMin: 0.02,
    pctMax: 0.05,
    holdings: state.resources[res] || 0,
    holdPct: 0.03,
    step: 5,
    softCap: Math.max(min * 20, 15_000),
  });
  return amt;
}

function pickResource(t) {
  const pool = resourcesAtOrBelowTier(t);
  if (!pool.length) return 'iron';
  // Prefer resources the player has actually produced / holds
  const engaged = pool.filter((r) => getLifetimeResource(r) > 0 || (state.resources[r] || 0) > 0);
  const top = MINE_TIERS[t]?.resources?.filter((r) => isStorableResource(r)) || [];
  const topEngaged = top.filter((r) => engaged.includes(r));
  let use = pool;
  if (Math.random() < 0.5 && topEngaged.length) use = topEngaged;
  else if (Math.random() < 0.7 && engaged.length) use = engaged;
  else if (Math.random() < 0.45 && top.length) use = top;
  return use[Math.floor(Math.random() * use.length)];
}

function emptyDailyBoard() {
  return { sol: 0, quests: [] };
}

export function ensureDailyQuests() {
  if (!state.dailyQuests || typeof state.dailyQuests !== 'object') {
    state.dailyQuests = emptyDailyBoard();
  }
  if (!Array.isArray(state.dailyQuests.quests)) state.dailyQuests.quests = [];
  return state.dailyQuests;
}

function factionRepReward() {
  const t = tier();
  // Scale with base tier so ranks (100 / 300 / 800 / 1500 / 3000) stay reachable
  return 25 + t * 15; // T1:40 … T10:175
}

function makeDailyQuest(kind, sol, slot, usedRes, opts = {}) {
  const t = tier();
  const factionId = opts.factionId || null;
  const faction = factionId ? getFactionDef(factionId) : null;
  const isFaction = !!faction;
  const namePrefix = isFaction ? `Daily Faction: ${faction.shortName}` : 'Daily';

  if (kind === 'gain_coins') {
    const target = scaleCoinTarget();
    const resReward = pickResource(t);
    const resAmt = scaleResourceReward(resReward);
    const rp = Math.random() < 0.35 ? 1 : 0;
    const rewards = {
      coins: 0,
      resources: { [resReward]: resAmt },
      rp,
      rep: 0,
      factionId: null,
      factionRep: 0,
    };
    if (isFaction) {
      rewards.factionId = factionId;
      rewards.factionRep = factionRepReward();
    }
    return {
      id: `daily_${sol}_${slot}_coins_${Math.floor(Math.random() * 1e6)}`,
      name: isFaction ? `${namePrefix} · Cash Flow` : 'Daily: Cash Flow',
      desc: `Earn $${fmt(target)} from any source.`,
      type: 'gain_coins',
      target,
      progress: 0,
      baseline: getLifetimeCoins(),
      progressMode: 'lifetime',
      status: 'active',
      issuedSol: sol,
      factionId: isFaction ? factionId : null,
      rewards,
    };
  }
  let res = pickResource(t);
  let guard = 0;
  while (usedRes.has(res) && guard++ < 8) res = pickResource(t);
  usedRes.add(res);
  const target = scaleResourceTarget(res);
  const label = RESOURCE_DEFS[res]?.label || res;
  const coinReward = scaleCoinReward(target, res);
  const rp = Math.random() < 0.3 ? 1 : 0;
  const rewards = {
    coins: coinReward,
    resources: {},
    rp,
    rep: 0,
    factionId: null,
    factionRep: 0,
  };
  if (isFaction) {
    rewards.factionId = factionId;
    rewards.factionRep = factionRepReward();
  }
  return {
    id: `daily_${sol}_${slot}_${res}_${Math.floor(Math.random() * 1e6)}`,
    name: isFaction ? `${namePrefix} · ${label} Drive` : `Daily: ${label} Drive`,
    desc: `Gain ${fmt(target)} ${label} (haul total — selling does not reset progress).`,
    type: 'gain_resource',
    resource: res,
    target,
    progress: 0,
    baseline: getLifetimeResource(res),
    progressMode: 'lifetime',
    status: 'active',
    issuedSol: sol,
    factionId: isFaction ? factionId : null,
    rewards,
  };
}

/**
 * Refresh daily board:
 * - Incomplete (active/ready) quests carry over across SOLs
 * - Only completed slots are replaced with new quests
 * - Board stays at DAILY_COUNT open slots max
 */
export function rollDailyQuests(force = false) {
  ensureDailyQuests();
  ensureLifetimeGained();
  if (!state.researchUnlocks?.daily_quests) {
    state.dailyQuests = emptyDailyBoard();
    return;
  }
  const sol = state.sol || 1;
  // Already refreshed this SOL (unless forced empty first unlock)
  if (!force && state.dailyQuests.sol === sol && state.dailyQuests.quests.length) return;

  const prev = Array.isArray(state.dailyQuests.quests) ? state.dailyQuests.quests : [];

  // Archive finished; keep open quests (active + ready to claim)
  const completed = prev.filter((q) => q.status === 'completed');
  archiveDailyBoard(completed);
  const kept = prev.filter((q) => q.status === 'active' || q.status === 'ready');

  const usedRes = new Set(kept.filter((q) => q.resource).map((q) => q.resource));
  const need = Math.max(0, DAILY_COUNT - kept.length);
  const fresh = [];

  if (need > 0) {
    ensureFactionRep();
    const factionsOn = hasFactionsUnlocked();
    // Prefer a mix when filling multiple; single slot = random
    const kinds = [];
    if (need >= 2) {
      kinds.push('gain_coins', 'gain_resource');
      while (kinds.length < need) kinds.push(Math.random() < 0.5 ? 'gain_resource' : 'gain_coins');
    } else {
      kinds.push(Math.random() < 0.5 ? 'gain_coins' : 'gain_resource');
    }
    // ~1 in 3 new slots become faction dailies when unlocked (at least one if filling 3)
    let factionSlots = 0;
    if (factionsOn) {
      if (need >= 3) factionSlots = 1 + (Math.random() < 0.35 ? 1 : 0);
      else if (need === 2) factionSlots = Math.random() < 0.55 ? 1 : 0;
      else factionSlots = Math.random() < 0.4 ? 1 : 0;
    }
    const factionIdx = new Set();
    while (factionIdx.size < factionSlots) factionIdx.add(Math.floor(Math.random() * need));
    for (let i = 0; i < need; i++) {
      const fid = factionIdx.has(i) ? pickFactionId() : null;
      fresh.push(makeDailyQuest(kinds[i], sol, kept.length + i, usedRes, { factionId: fid }));
    }
  }

  state.dailyQuests = { sol, quests: [...kept, ...fresh] };

  if (fresh.length && kept.length) {
    addLog(`◎ Daily quests: ${fresh.length} new · ${kept.length} carried over (SOL ${sol}).`);
  } else if (fresh.length) {
    addLog(`◎ Daily quests posted for SOL ${sol}.`);
  } else if (kept.length) {
    addLog(`◎ Daily quests carried over — finish them for new ones (SOL ${sol}).`);
  }

  try { saveGame(); } catch (_) { /* ignore */ }
  window.patchQuestsPanel?.();
}

/** Sync progress from lifetime gains vs roll baselines. */
export function evaluateDailyQuests() {
  if (!state.researchUnlocks?.daily_quests) return;
  ensureDailyQuests();
  ensureLifetimeGained();
  let changed = false;
  for (const q of state.dailyQuests.quests) {
    if (q.status !== 'active') continue;
    let prog = 0;
    if (q.type === 'gain_coins') {
      if (q.progressMode === 'lifetime') {
        prog = Math.max(0, getLifetimeCoins() - Math.floor(q.baseline || 0));
      } else {
        // Legacy stockpile/wallet delta
        prog = Math.max(0, Math.floor((state.coins || 0) - (q.baseline || 0)));
      }
    } else if (q.type === 'gain_resource' && q.resource) {
      if (q.progressMode === 'lifetime') {
        prog = Math.max(0, getLifetimeResource(q.resource) - Math.floor(q.baseline || 0));
      } else {
        prog = Math.max(0, Math.floor((state.resources[q.resource] || 0) - (q.baseline || 0)));
      }
    }
    if (prog !== q.progress) {
      q.progress = prog;
      changed = true;
    }
    if (q.progress >= q.target) {
      q.progress = q.target;
      q.status = 'ready';
      changed = true;
      addLog(`◎ Daily quest ready: ${q.name}`);
    }
  }
  if (changed) {
    try { saveGame(); } catch (_) { /* ignore */ }
    window.patchQuestsPanel?.();
  }
}

export function claimDailyQuest(questId) {
  ensureDailyQuests();
  const q = state.dailyQuests.quests.find((x) => x.id === questId);
  if (!q || q.status !== 'ready') return false;

  const r = q.rewards || {};
  if (r.coins > 0) addCoins(r.coins);
  if (r.resources) {
    for (const [type, amt] of Object.entries(r.resources)) {
      if (amt > 0) {
        state.resources[type] = (state.resources[type] || 0) + amt;
        recordLifetimeResource(type, amt);
      }
    }
  }
  if (r.rp > 0) {
    const cap = getResearchPointCap(state.base.level);
    state.rp = Math.min(cap, (state.rp || 0) + r.rp);
    updateHeaderRP();
  }
  // Only faction-tagged dailies grant standing
  const fId = r.factionId || q.factionId;
  const fRep = Math.floor(Number(r.factionRep) || 0);
  if (fId && fRep > 0 && hasFactionsUnlocked()) {
    addFactionRep(fId, fRep);
  }

  q.status = 'completed';
  archiveQuestCompletion({
    id: q.id,
    name: q.name,
    desc: q.desc,
    kind: 'daily',
    sol: state.dailyQuests?.sol || state.sol || 1,
    rewards: q.rewards,
    factionId: fId || null,
  });
  // Untrack
  if (Array.isArray(state.trackedQuests)) {
    state.trackedQuests = state.trackedQuests.filter((id) => id !== questId);
  }
  addLog(`✓ Claimed daily: ${q.name}`);
  try {
    import('../ui/transmissions.js').then((m) => m.showQuestRewardToast?.(q.id, q.name, q.rewards)).catch(() => {});
  } catch (_) { /* ignore */ }
  try { saveGame(); } catch (_) { /* ignore */ }
  import('../ui/refresh.js').then((m) => m.refresh?.ui?.()).catch(() => {});
  window.patchQuestsPanel?.(true);
  return true;
}

export function getDailyQuestsUiEntries() {
  ensureDailyQuests();
  ensureQuestHistory();
  const active = [];
  const completed = [];
  const seen = new Set();
  if (state.researchUnlocks?.daily_quests) {
    for (const q of state.dailyQuests.quests) {
      const entry = dailyToUiEntry(q);
      if (q.status === 'completed') {
        completed.push(entry);
        seen.add(q.id);
      } else if (q.status !== 'expired') {
        active.push(entry);
      }
    }
  }
  // History archive (older completed dailies / snapshots)
  for (const h of state.questHistory) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    completed.push(historyToUiEntry(h));
  }
  return { active, completed };
}

function historyToUiEntry(h) {
  const rewardLine = h.rewards || null;
  const def = {
    id: h.id,
    name: h.name || 'Quest',
    desc: h.desc || '',
    kind: h.kind || 'daily',
    stages: [{
      id: 'main',
      title: h.name || 'Quest',
      blurb: h.desc || '',
      objectives: [{ id: 'main', type: 'daily', label: 'Completed', amount: 1 }],
    }],
    rewards: rewardLine,
  };
  const rt = {
    status: 'completed',
    stageIndex: 0,
    done: { main: true },
    progress: { main: 1 },
    targets: { main: 1 },
    flags: { daily: true, archived: true, sol: h.sol || 0 },
    rewards: rewardLine,
  };
  return { def, rt, daily: h };
}

/** Shape daily quest like { def, rt } for shared UI. */
export function dailyToUiEntry(q) {
  // ensure faction fields flow to UI
  if (q.factionId && q.rewards && !q.rewards.factionId) {
    q.rewards.factionId = q.factionId;
    q.rewards.factionRep = q.rewards.factionRep || 0;
  }
  const pct = Math.min(100, Math.round(((q.progress || 0) / Math.max(1, q.target || 1)) * 100));
  const label = q.type === 'gain_coins'
    ? `Earn $${fmt(q.target)}`
    : `Gain ${fmt(q.target)} ${RESOURCE_DEFS[q.resource]?.label || q.resource}`;
  const def = {
    id: q.id,
    name: q.name,
    desc: q.desc,
    kind: 'daily',
    factionId: q.factionId || q.rewards?.factionId || null,
    stages: [{
      id: 'main',
      title: q.name,
      blurb: q.desc,
      objectives: [{ id: 'main', type: 'daily', label, amount: q.target }],
    }],
    rewards: q.rewards,
  };
  const rt = {
    status: q.status === 'ready' ? 'ready' : (q.status === 'completed' || q.status === 'expired' ? 'completed' : 'active'),
    stageIndex: 0,
    done: q.status === 'ready' || q.status === 'completed' ? { main: true } : {},
    progress: { main: q.progress || 0 },
    targets: { main: q.target || 1 },
    flags: { daily: true, pct, factionId: def.factionId },
    rewards: q.rewards,
  };
  return { def, rt, daily: q };
}

export function onSolDailyQuests() {
  if (!state.researchUnlocks?.daily_quests) return;
  rollDailyQuests(true);
}
