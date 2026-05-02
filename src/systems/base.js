// ============================================================
// BASE SYSTEM — repair, upgrade
// ============================================================
import { state } from '../state.js';
import { BASE_UPGRADE_COSTS, BASE_RANGE, BASE_MAX_SHIPS } from '../data/base.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { addLog, fmt, addCoins, spendCoins } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { spawnRangePulse, spawnNodeUnlock } from '../render/animations.js';
import { focusOnBase, cam } from '../render/camera.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';
import { patchSolPanel } from '../ui/panels.js';
import { invalidateResourceBar, updateHeaderRP, updateHeaderShips } from '../ui/ui.js';

export function getRepairCost(amount) {
  return { coins: amount }; // 1:1 coin per HP
}

window.repairBase = function(amount) {
  const missing = state.base.maxHealth - state.base.health;
  const actual = Math.min(amount, missing);
  if (actual <= 0) return;
  const cost = getRepairCost(actual);
  if (state.coins < cost.coins) { addLog('⚠ Not enough coins to repair.'); return; }
  spendCoins(cost.coins);
  state.base.health = Math.min(state.base.maxHealth, state.base.health + actual);
  addLog(`🔧 Base repaired +${fmt(actual)} HP → ${fmt(state.base.health)}/${fmt(state.base.maxHealth)}`);
  if (refresh.ui) refresh.ui();
  if (refresh.basePanel) refresh.basePanel();
};

window.upgradeBase = function() {
  const bl = state.base.level;
  const cost = BASE_UPGRADE_COSTS[bl];
  if (!cost || state.coins < cost) return;
  spendCoins(cost);
  state.base.level++;
  const hpBoostBonus = (state.hpBoostCount || 0) * 2500;
  state.base.maxHealth = 10000 + (state.base.level - 1) * 10000 + hpBoostBonus;
  state.base.health = state.base.maxHealth;
  const rpCap = 2 + (state.base.level - 1);
  state.rp = Math.min(state.rp + 1, rpCap);
  updateHeaderRP();
  updateHeaderShips();
  spawnRangePulse(BASE_RANGE[state.base.level-1]);
  const newNodes = state.nodes.filter(n => n.minLevel === state.base.level);
  newNodes.forEach((node, i) => {
    node.fadeAge = 0; node.fadeDuration = 1.2;
    setTimeout(() => spawnNodeUnlock(node), 300 + i * 200);
  });
  addLog(`⬆ Base upgraded to Level ${state.base.level}!`);

  if (state.base.level === 2) {
    setTimeout(() => showOnce('juno_base_lv2_upgrade', NPCS.juno.transmissionLines.base_lv2_upgrade, 28, 'juno'), 900);
    setTimeout(() => showOnce('rigs_base_lv2_hauler', NPCS.rigs.transmissionLines.base_lv2_hauler, 14, 'rigs'), 3200);
    setTimeout(() => showOnce('vane_rp_upgrade', NPCS.vane.transmissionLines.vane_rp_upgrade, 14, 'vane'), 5200);
  }
  if (state.base.level === 3) {
    setTimeout(() => showOnce('dax_lv3_intro', NPCS.dax.transmissionLines.dax_lv3_intro, 18, 'dax'), 900);
    setTimeout(() => showOnce('kai_lv3_intro', NPCS.kai.transmissionLines.kai_lv3_intro, 18, 'kai'), 3200);
  }

  const newShips = CRAFT_RECIPES.filter(r => r.mineTier === state.base.level);
  if (newShips.length > 0) {
    const names = newShips.map(r => `<strong>${r.name}</strong>`).join(' and ');
    setTimeout(() => showOnce('base_unlock_' + state.base.level, NPCS.rigs.transmissionLines.base_unlock(names), 25, 'rigs'), 1000);
  }

  // UX: center camera on base and close base panel after upgrade
  focusOnBase(cam.zoom);
  state.basePanelOpen = false;

  patchSolPanel('power');
  invalidateResourceBar();
  if (refresh.ui) refresh.ui();
  if (refresh.basePanel) refresh.basePanel();
};
