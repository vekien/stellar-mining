// ============================================================
// BASE SYSTEM — repair, upgrade
// ============================================================
import { state } from '../state.js';
import { BASE_UPGRADE_COSTS, BASE_RANGE, BASE_MAX_SHIPS, BASE_TIER_REQS } from '../data/base.js';
import { BASE_COL, BASE_ROW } from '../constants.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { CRASHED_SHIP_NODE_TYPE } from '../data/nodes.js';
import { addLog, fmt, addCoins, spendCoins } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { spawnRangePulse, spawnNodeUnlock } from '../render/animations.js';
import { focusOnBase, cam } from '../render/camera.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';
import { patchSolPanel } from '../ui/panels.js';
import { invalidateResourceBar, updateHeaderRP, updateHeaderShips } from '../ui/ui.js';
import { HEALTH_INCREASE_HP_PER_PURCHASE } from '../data/research.js';
import { getResearchPointCap } from '../data/research.js';
import { spawnDrone } from './drones.js';
import { isBaseUpgradeLocked } from './quests.js';
import { getFactionBaseHpMult, getFactionRpCapBonus } from './factions.js';

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
  if (isBaseUpgradeLocked()) {
    addLog('⚠ Complete the Tutorial quest before upgrading the Base.');
    return;
  }
  const bl = state.base.level;
  const prevRange = BASE_RANGE[(bl - 1)] || 6;
  const cost = BASE_UPGRADE_COSTS[bl];
  if (!cost || state.coins < cost) return;
  const resReqs = BASE_TIER_REQS[bl + 1];
  if (resReqs) {
    for (const [r, n] of Object.entries(resReqs)) {
      if ((state.resources[r] || 0) < n) return;
    }
  }
  spendCoins(cost);
  if (resReqs) {
    for (const [r, n] of Object.entries(resReqs)) state.resources[r] -= n;
  }
  state.base.level++;
  const newRange = BASE_RANGE[(state.base.level - 1)] || prevRange;
  state.baseRangeAnim = {
    from: prevRange,
    to: newRange,
    start: performance.now(),
    duration: 950,
  };
  const hpBoostBonus = (state.hpBoostCount || 0) * HEALTH_INCREASE_HP_PER_PURCHASE;
  const baseHp = Math.round((10000 + (state.base.level - 1) * 10000 + hpBoostBonus) * getFactionBaseHpMult());
  state.base.maxHealth = baseHp;
  state.base.health = state.base.maxHealth;
  const rpCap = getResearchPointCap(state.base.level) + getFactionRpCapBonus();
  const rpBefore = state.rp || 0;
  state.rp = Math.min(rpBefore + 5, rpCap);
  const rpGained = Math.max(0, (state.rp || 0) - rpBefore);
  updateHeaderRP();
  updateHeaderShips();
  spawnRangePulse(BASE_RANGE[state.base.level-1]);
  const newNodes = state.nodes.filter(n => n.minLevel === state.base.level);
  newNodes.forEach((node, i) => {
    node.fadeAge = 0; node.fadeDuration = 1.2;
    setTimeout(() => spawnNodeUnlock(node), 300 + i * 200);
  });

  // Derelicts only when unlocked AND inside the new visible range
  const halfR = BASE_RANGE[state.base.level - 1] || 6;
  const newlyVisibleCrashed = state.nodes.filter((n) => {
    if (n.type !== CRASHED_SHIP_NODE_TYPE) return false;
    if ((n.minLevel || 1) > state.base.level) return false;
    const dist = Math.max(Math.abs(n.gr[0] - BASE_COL), Math.abs(n.gr[1] - BASE_ROW));
    if (dist > halfR) return false;
    // Newly unlocked this tier, or newly inside range (was beyond prevRange)
    return (n.minLevel || 1) === state.base.level || dist > prevRange;
  });
  if (newlyVisibleCrashed.length) {
    const [col, row] = newlyVisibleCrashed[0].gr;
    const msgKey = `zoe_crashed_ship_${state.base.level}_${col}_${row}`;
    setTimeout(() => showOnce(msgKey, NPCS.zoe.transmissionLines.crashed_ship_detected(col, row), 20, 'zoe'), 1400);
    newlyVisibleCrashed.forEach((node, i) => {
      setTimeout(() => spawnDrone(node, 'crashed_ship'), 2200 + i * 600);
    });
  }

  addLog(`⬆ Base upgraded to Tier ${state.base.level}!${rpGained > 0 ? ` (+${rpGained} RP)` : ''}`);

  if (state.base.level === 2) {
    setTimeout(() => showOnce('juno_base_lv2_upgrade', NPCS.juno.transmissionLines.base_lv2_upgrade, 28, 'juno'), 900);
    setTimeout(() => showOnce('rigs_base_lv2_hauler', NPCS.rigs.transmissionLines.base_lv2_hauler, 14, 'rigs'), 3200);
    setTimeout(() => showOnce('vane_rp_upgrade', NPCS.vane.transmissionLines.vane_rp_upgrade, 14, 'vane'), 5200);
  }
  if (state.base.level === 3) {
    setTimeout(() => showOnce('dax_lv3_intro', NPCS.dax.transmissionLines.dax_lv3_intro, 18, 'dax'), 900);
    setTimeout(() => showOnce('kai_lv3_intro', NPCS.kai.transmissionLines.kai_lv3_intro, 18, 'kai'), 3200);
    setTimeout(() => showOnce('rigs_base_lv3_hauler', NPCS.rigs.transmissionLines.base_lv3_hauler, 14, 'rigs'), 5200);
    import('./missions.js').then((m) => m.onBaseLevelUp?.(3)).catch(() => {});
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
