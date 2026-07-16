// ============================================================
// UI ORCHESTRATOR — renderUI, updateHeader, renderResources
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { BASE_MAX_SHIPS } from '../data/base.js';
import { getResearchPointCap } from '../data/research.js';
import { SOL_DURATION } from '../constants.js';
import { fmt, resourceIconHtml, showTooltip, hideTooltip, setHeaderCoinCb } from '../helpers.js';
import { refresh } from './refresh.js';
import { renderShipsList, renderFleetFilters, renderActionPanel } from './fleet.js';
import { renderCraftTracker } from './craftTracker.js';
import { renderBasePanel } from './basePanel.js';
import { renderTutPointers } from './tutorial.js';

let _hdrCache = {};
function setIfChanged(id, val) {
  if (_hdrCache[id] === val) return;
  _hdrCache[id] = val;
  document.getElementById(id).textContent = val;
}
export function updateHeaderCoins() {
  setIfChanged('hdr-coins', '$' + fmt(state.coins));
  // Coin-gated craft tracks need a live refresh
  if ((state.trackedCrafts || []).length) renderCraftTracker();
}
export function updateHeaderShips() {
  const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 20;
  setIfChanged('hdr-ships', `${state.ships.length}/${maxShips}`);
}
export function updateHeaderRP() {
  const rpCap = getResearchPointCap(state.base.level);
  setIfChanged('hdr-rp', `${state.rp}/${rpCap}`);
}
function hasActiveCraftTimers() {
  const now = Date.now();
  const tables = [
    state.shipCraftTimers,
    state.turretCraftTimers,
    state.buildingCraftTimers,
    state.droneCraftTimers,
  ];
  for (const table of tables) {
    if (!table) continue;
    for (const timer of Object.values(table)) {
      if (timer && now < timer.endsAt) return true;
    }
  }
  return false;
}

export function updateHeaderCraft() {
  const queuedTurrets = Array.isArray(state.unplacedTurretQueue) ? state.unplacedTurretQueue.length : (state.unplacedTurrets || 0);
  const queuedModules = Array.isArray(state.unplacedModuleQueue) ? state.unplacedModuleQueue.length : (state.unplacedModules || 0);
  const total = queuedTurrets + queuedModules;
  const el = document.getElementById('hdr-craft');
  if (el) {
    const text = total > 0 ? String(total) : '';
    if (_hdrCache.hdrCraftText !== text) {
      _hdrCache.hdrCraftText = text;
      el.textContent = text;
    }
    const display = total > 0 ? '' : 'none';
    if (_hdrCache.hdrCraftDisplay !== display) {
      _hdrCache.hdrCraftDisplay = display;
      el.style.display = display;
    }
  }

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
  updateHeaderShips();
  updateHeaderRP();
  updateHeaderCraft();
}

export function renderResources() {
  const bar = document.getElementById('resource-bar');
  if (!bar) return;
  bar.innerHTML = '<span class="res-label">DEPOT</span>';
  for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
    const tierNum = parseInt(Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(type))?.[0] || '99');
    if (tierNum > state.base.level) continue;
    const pill = document.createElement('div');
    pill.className = 'res-pill';
    pill.innerHTML = `
      ${resourceIconHtml(type, 14)}
      <span class="res-pill-qty" id="res-qty-${type}">${fmt(state.resources[type] || 0)}</span>
    `;
    pill.addEventListener('mousemove', e => showTooltip(e, type));
    pill.addEventListener('mouseleave', hideTooltip);
    bar.appendChild(pill);
  }
}

// Patch only the qty numbers in the depot bar — no DOM rebuild
export function patchResources() {
  for (const [type] of Object.entries(RESOURCE_DEFS)) {
    const el = document.getElementById(`res-qty-${type}`);
    if (el) {
      const text = fmt(state.resources[type] || 0);
      if (el.textContent !== text) el.textContent = text;
    }
  }
  // Craft tracker requirements depend on live resource totals
  renderCraftTracker();
}

let _resourceBarBuilt = false;
export function invalidateResourceBar() { _resourceBarBuilt = false; }
export function renderUI() {
  if (!_resourceBarBuilt) { renderResources(); _resourceBarBuilt = true; }
  else patchResources();
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
