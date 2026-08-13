// ============================================================
// AI TRADER — SOL auto-sell rules
// ============================================================
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS, isStorableResource } from '../data/resources.js';
import { isDemandedType, getSellPrice } from './market.js';
import { addLog, fmt, addCoins } from '../helpers.js';

/**
 * state.autoTradeRules: {
 *   [resourceType]: { enabled, keepPct 0-100, demandOnly }
 * }
 */
export function ensureAutoTradeState() {
  if (!state.autoTradeRules || typeof state.autoTradeRules !== 'object') {
    state.autoTradeRules = {};
  }
  return state.autoTradeRules;
}

export function getAutoTradeRule(type) {
  ensureAutoTradeState();
  const r = state.autoTradeRules[type];
  if (!r) return { enabled: false, keepPct: 50, demandOnly: true };
  return {
    enabled: !!r.enabled,
    keepPct: Math.max(0, Math.min(100, Math.floor(Number(r.keepPct) || 0))),
    demandOnly: r.demandOnly !== false,
  };
}

export function setAutoTradeRule(type, patch) {
  if (!isStorableResource(type)) return;
  ensureAutoTradeState();
  const cur = getAutoTradeRule(type);
  state.autoTradeRules[type] = {
    enabled: patch.enabled != null ? !!patch.enabled : cur.enabled,
    keepPct: patch.keepPct != null
      ? Math.max(0, Math.min(100, Math.floor(Number(patch.keepPct) || 0)))
      : cur.keepPct,
    demandOnly: patch.demandOnly != null ? !!patch.demandOnly : cur.demandOnly,
  };
  try { saveGame(); } catch (_) { /* ignore */ }
}

/** Sell surplus per rules at SOL open. */
export function runAutoTradePass() {
  if (!state.researchUnlocks?.ai_trader) return;
  ensureAutoTradeState();

  let totalEarned = 0;
  let lines = 0;

  for (const type of Object.keys(RESOURCE_DEFS)) {
    if (!isStorableResource(type)) continue;
    const rule = getAutoTradeRule(type);
    if (!rule.enabled) continue;
    if (rule.demandOnly && !isDemandedType(type)) continue;

    const have = state.resources[type] || 0;
    if (have <= 0) continue;
    const keep = Math.floor(have * (rule.keepPct / 100));
    const sell = have - keep;
    if (sell <= 0) continue;

    const price = getSellPrice(type);
    const earned = sell * price;
    if (!addCoins(earned)) continue;
    state.resources[type] = have - sell;
    totalEarned += earned;
    lines += 1;
  }

  if (lines > 0) {
    addLog(`💰 AI Trader sold ${lines} lot${lines > 1 ? 's' : ''} for $${fmt(totalEarned)}.`);
    try { saveGame(); } catch (_) { /* ignore */ }
    if (window.isHdrPanelOpen?.('market')) {
      window.openHdrPanel?.('market', { refresh: true, preserveScroll: true });
    }
  }
}
