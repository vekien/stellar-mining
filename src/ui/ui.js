// ============================================================
// UI ORCHESTRATOR — renderUI, updateHeader, renderResources
// ============================================================
import { state } from '../state.js';
import { fmt, setHeaderCoinCb } from '../helpers.js';
import { refresh } from './refresh.js';
import { renderShipsList, renderFleetFilters, renderActionPanel } from './fleet.js';
import { renderCraftTracker } from './craftTracker.js';
import { renderBasePanel } from './basePanel.js';
import { renderTutPointers } from './tutorial.js';

let _hdrCache = {};

function playCoinGainFx(gained) {
  if (!(gained > 0)) return;
  const btn = document.getElementById('hdr-coins-btn');
  if (!btn) return;

  // Soft gold flash on the currency island
  btn.classList.remove('coin-gain-flash');
  // reflow so the animation can restart on rapid gains
  void btn.offsetWidth;
  btn.classList.add('coin-gain-flash');
  clearTimeout(btn._coinFlashTimer);
  btn._coinFlashTimer = setTimeout(() => btn.classList.remove('coin-gain-flash'), 650);
}

/** @param {number} [gained] positive when coins increased via addCoins */
export function updateHeaderCoins(gained = 0) {
  const val = fmt(state.coins || 0);
  if (_hdrCache.hdrCoins !== val) {
    _hdrCache.hdrCoins = val;
    const el = document.getElementById('hdr-coins');
    if (el) el.textContent = val;
  }
  if (gained > 0) playCoinGainFx(gained);
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
  window.patchQuestsPanel?.();
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
