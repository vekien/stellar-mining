// ============================================================
// UI ORCHESTRATOR — renderUI, updateHeader, renderResources
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { BASE_MAX_SHIPS } from '../data/nodes.js';
import { SOL_DURATION } from '../constants.js';
import { fmt, showTooltip, hideTooltip } from '../helpers.js';
import { refresh } from './refresh.js';
import { renderShipsList, renderFleetFilters, renderActionPanel, renderTab } from './fleet.js';
import { renderBasePanel } from './basePanel.js';
import { renderTutPointers } from './tutorial.js';

export function updateHeader() {
  const maxShips   = BASE_MAX_SHIPS[(state.base.level - 1)] || 20;
  const rpCap      = 2 + (state.base.level - 1);
  const dayProgress = state.solTimer / SOL_DURATION;
  const solHours   = Math.floor(dayProgress * 24);
  const solMins    = Math.floor((dayProgress * 24 * 60) % 60);
  document.getElementById('hdr-sol').textContent   = `${state.sol} · ${String(solHours).padStart(2,'0')}:${String(solMins).padStart(2,'0')}`;
  document.getElementById('hdr-rp').textContent    = `${state.rp}/${rpCap}`;
  document.getElementById('hdr-coins').textContent = fmt(state.coins) + '¢';
  document.getElementById('hdr-ships').textContent = `${state.ships.length}/${maxShips}`;
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
      <div class="res-pill-dot" style="background:${def.color};box-shadow:0 0 5px ${def.color}88"></div>
      <span class="res-pill-letter" style="color:${def.color}">${def.label[0]}</span>
      <span class="res-pill-qty">${fmt(state.resources[type] || 0)}</span>
    `;
    pill.addEventListener('mousemove', e => showTooltip(e, type));
    pill.addEventListener('mouseleave', hideTooltip);
    bar.appendChild(pill);
  }
}

export function renderUI() {
  renderResources();
  if (!state.renamingShip) renderShipsList();
  else renderFleetFilters();
  renderActionPanel();
  renderTab();
  updateHeader();
  renderBasePanel();
  renderTutPointers();
}

// Populate the refresh hub — called once at boot by main.js
export function initRefresh() {
  refresh.ui        = renderUI;
  refresh.header    = updateHeader;
  refresh.basePanel = renderBasePanel;
}

// Expose for legacy window.xxx calls from dynamically-rendered HTML
window.renderUI      = renderUI;
window.updateHeader  = updateHeader;
window.renderBasePanel = renderBasePanel;
window.renderActionPanel = renderActionPanel;
