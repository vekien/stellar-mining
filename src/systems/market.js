// ============================================================
// MARKET — sell prices and selling resources
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';

export function getSellPrice(type) {
  const base = RESOURCE_DEFS[type].sellPrice;
  if (state.marketBoost && state.marketBoost.type === type) {
    const mult = state.marketBoost.multiplier ?? 1.5;
    return Math.round(base * mult);
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
  state.coins += earned;
  const boosted = state.marketBoost?.type === type ? ' ✦' : '';
  addLog(`💰 Sold ${fmt(sell)}x ${RESOURCE_DEFS[type].label} for ${fmt(earned)} coins${boosted}`);
  // Sera explains base upgrades once player hits 50k coins
  if (state.coins >= 50000) {
    showOnce('sera_base_upgrade', NPCS.sera.transmissionLines.sera_base_upgrade, 35, 'sera');
  }
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
};
