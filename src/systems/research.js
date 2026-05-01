// ============================================================
// RESEARCH SYSTEM
// ============================================================
import { state } from '../state.js';
import { RESEARCH_TREE } from '../data/research.js';
import { addLog } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { updateHeaderRP } from '../ui/ui.js';

const HP_BOOST_MAX = 10;

window.purchaseResearch = function(unlockId) {
  let def = null;
  for (const tier of RESEARCH_TREE) for (const u of tier.unlocks) if (u.id === unlockId) { def = u; break; }
  if (!def) return;
  if (!def.repeatable && state.researchUnlocks[unlockId]) { addLog('Already unlocked.'); return; }
  if (def.id === 'hp_boost' && (state.hpBoostCount || 0) >= HP_BOOST_MAX) { addLog(`⚠ HP Boost is maxed (${HP_BOOST_MAX}/${HP_BOOST_MAX}).`); return; }
  if (state.rp < def.cost) { addLog('⚠ Not enough Research Points.'); return; }
  state.rp -= def.cost;
  updateHeaderRP();

  const trackUnlock = (id, name, amount = 1) => {
    const existing = state.researchUnlocksList.find(r => r.id === id);
    if (existing) existing.qty += amount;
    else state.researchUnlocksList.push({ id, name, qty: amount });
  };

  if (def.id === 'hp_boost') {
    state.base.maxHealth += 2500;
    state.base.health = Math.min(state.base.health + 2500, state.base.maxHealth);
    state.hpBoostCount++;
    trackUnlock(def.id, def.name, 1);
    addLog(`💪 HP Boost applied! Base max health: ${state.base.maxHealth.toLocaleString()}`);
  } else {
    state.researchUnlocks[unlockId] = true;
    trackUnlock(def.id, def.name, 1);
    addLog(`🔬 Research unlocked: ${def.name}`);
  }
  if (refresh.ui) refresh.ui();
  // Re-open research panel to reflect new state
  if (window.openHdrPanel) { window._hdrPanelOpen = null; window.openHdrPanel('research'); }
};
