// ============================================================
// SOL HISTORY — snapshots for Overview → Statistics charts
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';

export const SOL_HISTORY_MAX = 30;

function sumResources(resources = {}) {
  let total = 0;
  for (const v of Object.values(resources || {})) {
    total += Math.max(0, Number(v) || 0);
  }
  return total;
}

function cloneResources(resources = {}) {
  const out = {};
  for (const key of Object.keys(RESOURCE_DEFS)) {
    out[key] = Math.max(0, Math.floor(Number(resources?.[key]) || 0));
  }
  return out;
}

/** Capture economy snapshot for the current SOL (keeps last 30). */
export function recordSolSnapshot() {
  if (!state.solHistory) state.solHistory = [];
  const snap = {
    sol: Math.max(1, Math.floor(state.sol || 1)),
    coins: Math.max(0, Math.floor(state.coins || 0)),
    resources: cloneResources(state.resources),
    totalResources: sumResources(state.resources),
    ships: (state.ships || []).filter((s) => !s.isHqSupport).length,
    rp: Math.max(0, Math.floor(state.rp || 0)),
  };
  const hist = state.solHistory;
  const last = hist[hist.length - 1];
  if (last && last.sol === snap.sol) {
    hist[hist.length - 1] = snap;
  } else {
    hist.push(snap);
  }
  while (hist.length > SOL_HISTORY_MAX) hist.shift();
  return snap;
}

export function getSolHistory() {
  if (!Array.isArray(state.solHistory)) state.solHistory = [];
  return state.solHistory;
}

/** Ensure at least one point exists so charts aren't empty. */
export function ensureSolHistorySeed() {
  if (!Array.isArray(state.solHistory)) state.solHistory = [];
  if (!state.solHistory.length) recordSolSnapshot();
}

export function normalizeSolHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const sol = Math.max(1, Math.floor(entry.sol || 1));
    const resources = cloneResources(entry.resources || {});
    out.push({
      sol,
      coins: Math.max(0, Math.floor(entry.coins || 0)),
      resources,
      totalResources: Number.isFinite(entry.totalResources)
        ? Math.max(0, Math.floor(entry.totalResources))
        : sumResources(resources),
      ships: Math.max(0, Math.floor(entry.ships || 0)),
      rp: Math.max(0, Math.floor(entry.rp || 0)),
    });
  }
  // Keep chronological unique sols (last write wins)
  out.sort((a, b) => a.sol - b.sol);
  const dedup = [];
  for (const s of out) {
    if (dedup.length && dedup[dedup.length - 1].sol === s.sol) {
      dedup[dedup.length - 1] = s;
    } else {
      dedup.push(s);
    }
  }
  return dedup.slice(-SOL_HISTORY_MAX);
}
