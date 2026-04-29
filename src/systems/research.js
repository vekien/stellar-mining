// ============================================================
// RESEARCH SYSTEM
// ============================================================
import { state } from '../state.js';
import { RESEARCH_TREE } from '../data/research.js';
import { addLog } from '../helpers.js';
import { refresh } from '../ui/refresh.js';

window.purchaseResearch = function(unlockId) {
  let def = null;
  for (const tier of RESEARCH_TREE) for (const u of tier.unlocks) if (u.id === unlockId) { def = u; break; }
  if (!def) return;
  if (!def.repeatable && state.researchUnlocks[unlockId]) { addLog('Already unlocked.'); return; }
  if (state.rp < def.cost) { addLog('⚠ Not enough Research Points.'); return; }
  state.rp -= def.cost;
  if (def.id === 'hp_boost') {
    state.base.maxHealth += 5000;
    state.base.health = Math.min(state.base.health + 5000, state.base.maxHealth);
    state.hpBoostCount++;
    addLog(`💪 HP Boost applied! Base max health: ${state.base.maxHealth.toLocaleString()}`);
  } else {
    state.researchUnlocks[unlockId] = true;
    addLog(`🔬 Research unlocked: ${def.name}`);
  }
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  // Re-open research panel to reflect new state
  if (window.openHdrPanel) { window._hdrPanelOpen = null; window.openHdrPanel('research'); }
};
