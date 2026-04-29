// ============================================================
// BASE SYSTEM — repair, upgrade
// ============================================================
import { state } from '../state.js';
import { BASE_UPGRADE_COSTS, BASE_RANGE, BASE_MAX_SHIPS } from '../data/nodes.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { spawnRangePulse, spawnNodeUnlock } from '../render/animations.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';

export function getRepairCost(amount) {
  return { coins: amount }; // 1:1 coin per HP
}

window.repairBase = function(amount) {
  const missing = state.base.maxHealth - state.base.health;
  const actual = Math.min(amount, missing);
  if (actual <= 0) return;
  const cost = getRepairCost(actual);
  if (state.coins < cost.coins) { addLog('⚠ Not enough coins to repair.'); return; }
  state.coins -= cost.coins;
  state.base.health = Math.min(state.base.maxHealth, state.base.health + actual);
  addLog(`🔧 Base repaired +${fmt(actual)} HP → ${fmt(state.base.health)}/${fmt(state.base.maxHealth)}`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (refresh.basePanel) refresh.basePanel();
};

window.upgradeBase = function() {
  const bl = state.base.level;
  const cost = BASE_UPGRADE_COSTS[bl];
  if (!cost || state.coins < cost) return;
  state.coins -= cost;
  state.base.level++;
  state.base.maxHealth = 10000 + (state.base.level - 1) * 5000;
  state.base.health = state.base.maxHealth;
  spawnRangePulse(BASE_RANGE[state.base.level-1]);
  const newNodes = state.nodes.filter(n => n.minLevel === state.base.level);
  newNodes.forEach((node, i) => {
    node.fadeAge = 0; node.fadeDuration = 1.2;
    setTimeout(() => spawnNodeUnlock(node), 300 + i * 200);
  });
  addLog(`⬆ Base upgraded to Level ${state.base.level}!`);
  const newShips = CRAFT_RECIPES.filter(r => r.mineTier === state.base.level);
  if (newShips.length > 0) {
    const names = newShips.map(r => `<strong>${r.name}</strong>`).join(' and ');
    setTimeout(() => showOnce('base_unlock_' + state.base.level, NPCS.rigs.transmissionLines.base_unlock(names), 25, 'rigs'), 1000);
  }
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
};
