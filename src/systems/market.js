// ============================================================
// MARKET — sell prices and selling resources
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { BASE_MAX_SHIPS } from '../data/base.js';
import { addLog, fmt, addCoins } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';

export function isDemandedType(type) {
  if (state.marketBoost?.type === type) return true;
  return !!state.extraDemands?.some((d) => d.type === type);
}

/** SOL base-price variance percent for a resource (−25…+25, 0 = flat). */
export function getMarketVariancePct(type) {
  const n = Number(state.marketVariance?.[type]);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.max(-25, Math.min(25, Math.round(n)));
}

/** Demand bonus as whole percent extra (e.g. 1.57× → 57). */
export function getDemandBonusPct(type) {
  let mult = null;
  if (state.marketBoost?.type === type) mult = state.marketBoost.multiplier ?? 1.5;
  else if (state.extraDemands?.length) {
    const extra = state.extraDemands.find((d) => d.type === type);
    if (extra) mult = extra.multiplier ?? 1.5;
  }
  if (!Number.isFinite(mult) || mult <= 1) return 0;
  return Math.max(0, Math.round((mult - 1) * 100));
}

function getBaseSellPrice(type) {
  let base = RESOURCE_DEFS[type]?.sellPrice || 0;
  if (state.researchUnlocks?.market_influence) base = Math.round(base * 1.10);
  return base;
}

export function getSellPrice(type) {
  let price = getBaseSellPrice(type);
  const variancePct = getMarketVariancePct(type);
  if (variancePct !== 0) {
    price = Math.max(1, Math.round(price * (1 + variancePct / 100)));
  }
  // Demand is additive on top of variance (multiplier on the varied price)
  if (state.marketBoost && state.marketBoost.type === type) {
    const mult = state.marketBoost.multiplier ?? 1.5;
    return Math.max(1, Math.round(price * mult));
  }
  if (state.extraDemands?.length) {
    const extra = state.extraDemands.find((d) => d.type === type);
    if (extra) return Math.max(1, Math.round(price * (extra.multiplier ?? 1.5)));
  }
  return Math.max(0, price);
}

window.sellResource = function(type, amount) {
  const have = state.resources[type] || 0;
  const sell = Math.min(have, amount);
  if (sell <= 0) return;
  const price = getSellPrice(type);
  const earned = sell * price;
  if (!addCoins(earned)) return;
  state.resources[type] -= sell;
  const boosted = isDemandedType(type) ? ' ✦' : '';
  addLog(`💰 Sold ${fmt(sell)}x ${RESOURCE_DEFS[type].label} for ${fmt(earned)} coins${boosted}`);
  const maxBaseTier = BASE_MAX_SHIPS.length;
  if (state.coins >= 50000 && state.base.level < maxBaseTier) {
    showOnce('sera_base_upgrade', NPCS.sera.transmissionLines.sera_base_upgrade, 35, 'sera');
  }
  if (refresh.ui) refresh.ui();
};
