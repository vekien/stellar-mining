// ============================================================
// MARKET — sell prices and selling resources
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { showOnce } from '../ui/transmissions.js';

export function getSellPrice(type) {
  const base = RESOURCE_DEFS[type].sellPrice;
  if (state.marketBoost && state.marketBoost.type === type) return Math.round(base * 1.5);
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
    showOnce('sera_base_upgrade',
      `Commander, Admiral Sera here. Your operation is growing fast — I'd strongly recommend <strong>upgrading your Base Station</strong>.<br><br>` +
      `A higher base level increases your <strong>ship capacity</strong>, expands your <strong>map range</strong> to reach richer nodes, and unlocks heavier ship classes in the Craft tab.<br><br>` +
      `Click the <strong>Base Station</strong> on the map and hit Upgrade when you're ready.`,
      35, 'sera'
    );
  }
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
};
