// ============================================================
// RESEARCH SYSTEM
// ============================================================
import { state } from '../../state.js';
import {
  RESEARCH_TREE,
  HEALTH_INCREASE_HP_PER_PURCHASE, HEALTH_INCREASE_MAX_PURCHASES,
  SHIELD_MAX_PURCHASES, ANTI_COMET_MAX_PURCHASES,
  SOLAR_SHIELD_MAX_PURCHASES, AUTO_REGEN_MAX_PURCHASES,
  getRepeatableCount, getRepeatableMax,
} from './definitions.js';
import { addLog } from '../../helpers.js';
import { refresh } from '../../ui/refresh.js';
import { updateHeaderRP } from '../../ui/ui.js';
import { rollMarketDemands } from '../sol.js';
import { saveGame } from '../../state.js';

// ── Compute current max shield from purchases ─────────────────
export function getMaxShield() {
  const pct = (state.shieldBoostCount || 0) * 0.05;
  return Math.floor(state.base.maxHealth * pct);
}

window.purchaseResearch = function(unlockId) {
  let def = null;
  let defTier = null;
  for (const tier of RESEARCH_TREE) {
    for (const u of tier.unlocks) { if (u.id === unlockId) { def = u; defTier = tier; break; } }
    if (def) break;
  }
  if (!def) return;

  const tierLocked = defTier?.minBaseLevel && state.base.level < defTier.minBaseLevel;
  if (tierLocked) { addLog('⚠ Base tier requirement not met.'); return; }

  const isUnlocked   = state.researchUnlocks[unlockId];
  const currentCount = getRepeatableCount(unlockId, state);
  const maxCount     = getRepeatableMax(unlockId);
  const cost         = def.repeatable ? (def.cost * (currentCount + 1)) : def.cost;

  if (!def.repeatable && isUnlocked) { addLog('Already unlocked.'); return; }
  if (def.repeatable && currentCount >= maxCount) { addLog(`⚠ ${def.name} is maxed (${maxCount}/${maxCount}).`); return; }
  if (state.rp < cost) { addLog('⚠ Not enough Research Points.'); return; }

  state.rp -= cost;
  updateHeaderRP();

  const trackUnlock = (id, name, amount = 1) => {
    const existing = state.researchUnlocksList.find(r => r.id === id);
    if (existing) existing.qty += amount;
    else state.researchUnlocksList.push({ id, name, qty: amount });
  };

  switch (unlockId) {
    case 'health_increase':
      state.base.maxHealth += HEALTH_INCREASE_HP_PER_PURCHASE;
      state.base.health = Math.min(state.base.health + HEALTH_INCREASE_HP_PER_PURCHASE, state.base.maxHealth);
      state.hpBoostCount++;
      trackUnlock(unlockId, def.name, 1);
      addLog(`▲ Health Increase applied! Base max health: ${state.base.maxHealth.toLocaleString()}`);
      break;

    case 'shield_increase':
      state.shieldBoostCount++;
      // Top up shield to new max
      const newMaxShield = getMaxShield();
      state.base.shield = Math.min((state.base.shield || 0) + Math.floor(state.base.maxHealth * 0.05), newMaxShield);
      trackUnlock(unlockId, def.name, 1);
      addLog(`◈ Shield Increase applied! Max shield: ${newMaxShield.toLocaleString()}`);
      break;

    case 'anti_comet':
      state.antiCometCount++;
      trackUnlock(unlockId, def.name, 1);
      addLog(`◇ Anti-Comet Defenses upgraded! Intercept chance: ${(state.antiCometCount * 5)}%`);
      break;

    case 'solar_shield':
      state.solarShieldCount++;
      trackUnlock(unlockId, def.name, 1);
      addLog(`□ Solar Radiation Shielding upgraded! Flare reduction: ${(state.solarShieldCount * 8)}%`);
      break;

    case 'auto_regen':
      state.autoRegenCount++;
      trackUnlock(unlockId, def.name, 1);
      addLog(`○ Auto Regeneration upgraded! Regen rate: ${state.autoRegenCount * 5} HP/s`);
      break;

    case 'market_influence':
      state.researchUnlocks[unlockId] = true;
      trackUnlock(unlockId, def.name, 1);
      addLog(`▲ Market Influence active! All sell prices increased by 10%.`);
      break;

    case 'multi_demand':
      state.researchUnlocks[unlockId] = true;
      trackUnlock(unlockId, def.name, 1);
      rollMarketDemands();
      addLog(`■ Multi-Demand active! 3 resources are now in demand each SOL.`);
      break;

    default:
      state.researchUnlocks[unlockId] = true;
      trackUnlock(unlockId, def.name, 1);
      addLog(`+ Research unlocked: ${def.name}`);
      break;
  }

  if (refresh.ui) refresh.ui();
  if (refresh.basePanel) refresh.basePanel();
  saveGame();
  // Re-open research panel to reflect new state
  if (window.openHdrPanel) { window.openHdrPanel('research', { refresh: true, preserveScroll: true }); }
};
