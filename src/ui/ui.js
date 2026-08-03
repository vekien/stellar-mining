// ============================================================
// UI ORCHESTRATOR — renderUI, updateHeader, renderResources
// ============================================================
import { state } from '../state.js';
import { setHeaderCoinCb } from '../helpers.js';
import { refresh } from './refresh.js';
import { renderShipsList, renderFleetFilters, renderActionPanel } from './fleet.js';
import { renderCraftTracker } from './craftTracker.js';
import { renderBasePanel } from './basePanel.js';
import { renderTutPointers } from './tutorial.js';

let _hdrCache = {};
export function updateHeaderCoins() {
  // Coin-gated craft tracks need a live refresh
  if ((state.trackedCrafts || []).length) renderCraftTracker();
  // HQ support affordability while raid panel is open
  window.patchHqSupportPanel?.();
}
export function updateHeaderShips() {
  /* nav no longer shows fleet counts */
}
export function updateHeaderRP() {
  /* nav no longer shows RP counts */
}
function hasActiveCraftTimers() {
  const now = Date.now();
  for (const job of (state.craftQueue || [])) {
    if (job && now < (job.endsAt || 0)) return true;
  }
  return false;
}

export function updateHeaderCraft() {
  const btn = document.getElementById('hdr-btn-craft');
  if (btn) {
    const crafting = hasActiveCraftTimers();
    if (_hdrCache.hdrCraftActive !== crafting) {
      _hdrCache.hdrCraftActive = crafting;
      btn.classList.toggle('hdr-btn-crafting', crafting);
    }
  }
}
export function updateHeader() {
  updateHeaderCoins();
  updateHeaderCraft();
}

export function renderResources() {
  /* depot strip removed — inventory lives in Resources panel */
}

// Live resource dependents (craft tracker) without depot DOM
export function patchResources() {
  renderCraftTracker();
}

export function invalidateResourceBar() { /* no-op: depot removed */ }
export function renderUI() {
  patchResources();
  if (!state.renamingShip) renderShipsList();
  else renderFleetFilters();
  renderActionPanel();
  renderBasePanel();
  renderTutPointers();
  renderCraftTracker();
  updateHeaderCraft();
}

// Populate the refresh hub — called once at boot by main.js
export function initRefresh() {
  refresh.ui        = renderUI;
  refresh.header    = updateHeader;
  refresh.resources = patchResources;
  refresh.basePanel = renderBasePanel;
  setHeaderCoinCb(updateHeaderCoins);
}

// Expose for legacy window.xxx calls from dynamically-rendered HTML
window.renderUI      = renderUI;
window.updateHeader  = updateHeader;
window.renderBasePanel = renderBasePanel;
window.renderActionPanel = renderActionPanel;
