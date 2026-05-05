// ============================================================
// MARKET — sell prices and selling resources
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog, fmt, addCoins } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';

export function getSellPrice(type) {
  let base = RESOURCE_DEFS[type].sellPrice;
  // Market Influence: permanent 10% bonus
  if (state.researchUnlocks?.market_influence) base = Math.round(base * 1.10);
  // SOL demand boost (primary)
  if (state.marketBoost && state.marketBoost.type === type) {
    const mult = state.marketBoost.multiplier ?? 1.5;
    return Math.round(base * mult);
  }
  // Extra demands (multi_demand)
  if (state.extraDemands?.length) {
    const extra = state.extraDemands.find(d => d.type === type);
    if (extra) return Math.round(base * (extra.multiplier ?? 1.5));
  }
  return base;
}

window.sellResource = function(type, amount) {
  const have = state.resources[type] || 0;
  const sell = Math.min(have, amount);
  if (sell <= 0) return;
  const price = getSellPrice(type);
  const earned = sell * price;
  state.resources[type] -= sell;
  addCoins(earned);
  const boosted = state.marketBoost?.type === type ? ' ✦' : '';
  addLog(`💰 Sold ${fmt(sell)}x ${RESOURCE_DEFS[type].label} for ${fmt(earned)} coins${boosted}`);
  if (state.coins >= 50000) {
    showOnce('sera_base_upgrade', NPCS.sera.transmissionLines.sera_base_upgrade, 35, 'sera');
  }
  if (refresh.ui) refresh.ui();
};
