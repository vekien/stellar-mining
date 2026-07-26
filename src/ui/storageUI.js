// ============================================================
// MODULE UI — craft timers, placement, and modal
// ============================================================
import { state } from '../state.js';
import { addLog, fmt, resourceIconHtml, spendCoins, addCoins, isLightColor, showHintTooltip, hideTooltip } from '../helpers.js';
import { refresh } from './refresh.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
  placeFloatingWindow,
} from './floatingWindow.js';
import { getCraft } from '../data/crafts.js';
import {
  STORAGE_FACILITY_ID,
  DRONE_LAB_ID,
  getModuleDef,
  getModuleStats,
  getModuleFootprintCells,
  moduleContainsCell,
  normalizeModule,
  isStorageModule,
  isResearchLabModule,
  isDroneLabModule,
  isPoweredBuildingModule,
  isPowerStationModule,
  isPowerPoleModule,
  isLabTowerModule,
  getModuleInventoryTotal,
  getPowerFuelOptions,
  formatPowerFuelRate,
  getPowerNetworkState,
  getPowerModuleNetworkInfo,
  getLabModuleNetworkInfo,
  getPowerResourceConsumption,
  getPowerFuelOutput,
  getPowerStationEffectiveOutput,
  hasPowerStationFuel,
  getNoFuelNetworkIds,
  invalidateNetworkCache,
} from '../data/modules.js';
import { getStoragePowerUsage, isStorageOperational } from '../data/storage.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { cam, focusOn, gridToWorld } from '../render/camera.js';
import { BASE_COL, BASE_ROW, GRID_COLS, GRID_ROWS, TILE_W, TILE_H, isBaseFootprintCell } from '../constants.js';

function getModuleCraftTimeMs(moduleType = STORAGE_FACILITY_ID) {
  return getModuleDef(moduleType).craftTimeMs || 15000;
}

function getModuleById(moduleId) {
  return state.modules.find((module) => module.id === moduleId) || null;
}

function getModuleLabel(moduleOrType) {
  return getModuleDef(typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type).name;
}

function getModuleFootprintLabel(moduleOrType) {
  const size = getModuleDef(typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type).footprintSize || 1;
  return `${size}x${size}`;
}

function getModuleUpgradeCost(module) {
  const moduleDef = getCraft('buildings', module.type || STORAGE_FACILITY_ID);
  const tier = Math.max(1, module.level || 1);
  return {
    coins: (moduleDef?.cost || 0) * tier,
    reqs: Object.fromEntries(Object.entries(moduleDef?.reqs || {}).map(([r, n]) => [r, n * tier])),
  };
}

function getModuleInvestedCoins(module) {
  const moduleDef = getCraft('buildings', module.type || STORAGE_FACILITY_ID);
  let total = moduleDef?.cost || 0;
  for (let lvl = 1; lvl < (module.level || 1); lvl++) total += (moduleDef?.cost || 0) * lvl;
  return total;
}

export function getModuleWorldPos(module) {
  const w = gridToWorld(module.col, module.row);
  return { x: w.x, y: w.y };
}

export function getStorageTotalInventory(storage) {
  return getModuleInventoryTotal(storage);
}

export function getModuleAtCell(col, row) {
  return state.modules.find((module) => moduleContainsCell(module, col, row)) || null;
}

export function getModuleAtWorld(wx, wy) {
  for (const module of state.modules) {
    if (isStorageModule(module)) continue;
    const pos = gridToWorld(module.col, module.row);
    const dx = wx - pos.x;
    const dy = wy - (pos.y + TILE_H / 2);
    if ((dx * dx) + (dy * dy) < (34 * 34)) return module;
  }
  const col = Math.round((wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2);
  const row = Math.round((wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2);
  return getModuleAtCell(col, row);
}

export function getStorageAtCell(col, row) {
  return getModuleAtCell(col, row);
}

export function canPlaceModuleAt(moduleType, col, row, ignoreId = null) {
  const moduleName = getModuleLabel(moduleType).toLowerCase();
  const cells = getModuleFootprintCells(moduleType, col, row);
  for (const cell of cells) {
    if (cell.col < 0 || cell.col >= GRID_COLS || cell.row < 0 || cell.row >= GRID_ROWS) {
      return { ok: false, reason: `⚠ ${getModuleLabel(moduleType)} footprint must fit fully inside the map.` };
    }
    if (isBaseFootprintCell(cell.col, cell.row)) {
      return { ok: false, reason: `⚠ Cannot place ${moduleName} on the base.` };
    }
    const onNode = state.nodes.some(n => n.gr[0] === cell.col && n.gr[1] === cell.row && n.minLevel <= state.base.level);
    if (onNode) return { ok: false, reason: `⚠ Cannot place ${moduleName} on a resource node.` };
    const onTurret = state.turrets.some(t => t.col === cell.col && t.row === cell.row);
    if (onTurret) return { ok: false, reason: `⚠ Cannot place ${moduleName} on a turret tile.` };
    const onModule = state.modules.some(module => module.id !== ignoreId && moduleContainsCell(module, cell.col, cell.row));
    if (onModule) return { ok: false, reason: '⚠ Modules cannot overlap.' };
  }
  return { ok: true, reason: '' };
}

export function canPlaceStorageAt(col, row, ignoreId = null) {
  return canPlaceModuleAt(STORAGE_FACILITY_ID, col, row, ignoreId);
}

function completeCraftBuilding(moduleType) {
  const timer = state.buildingCraftTimers?.[moduleType];
  if (!timer) return;
  delete state.buildingCraftTimers[moduleType];
  if (!Array.isArray(state.unplacedModuleQueue)) state.unplacedModuleQueue = [];
  state.unplacedModuleQueue.push(moduleType);
  state.unplacedModules = state.unplacedModuleQueue.length;
  const moduleDef = getCraft('buildings', moduleType);
  addLog(`✅ ${moduleDef?.name || 'Building'} ready to place.`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
}

function scheduleBuildingCraftCompletion(moduleType, endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.buildingCraftTimers?.[moduleType];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftBuilding(moduleType);
    else scheduleBuildingCraftCompletion(moduleType, timer.endsAt);
  }, wait + 5);
}

function getStorageModalHost() {
  return document.getElementById('storage-modal-host');
}

function getOpenStorageModalWindows() {
  const host = getStorageModalHost();
  return host ? [...host.querySelectorAll('.storage-modal-window')] : [];
}

function getStorageModalWindow(moduleId) {
  const host = getStorageModalHost();
  return host ? host.querySelector(`.storage-modal-window[data-module-id="${moduleId}"]`) : null;
}

function bringStorageModalToFront(modal) {
  bringFloatingToFront(modal);
}

function buildPowerStationInfoTooltip({ fuelCost, fuelName, powerOutputText, totalLoadText, netDeltaText, statusLabel, noFuel }) {
  const keyStyle = 'color:#8bd6ff;font-weight:700;';
  const valueStyle = 'color:#ffe066;font-weight:700;';
  const statusColor = statusLabel === 'Deficit' ? '#ff8a8a' : statusLabel === 'Balanced' ? '#ffe066' : '#6fff9a';
  return [
    `This power station uses <span style="${keyStyle}">Input</span> of <span style="${valueStyle}">${fuelCost} ${fuelName}</span> per second.`,
    noFuel
      ? `This generates <span style="${keyStyle}">Output</span> of <span style="${valueStyle}">${powerOutputText}/s</span> electricity because there is no ${fuelName} in reserve right now.`
      : `This generates <span style="${keyStyle}">Output</span> of <span style="${valueStyle}">${powerOutputText}/s</span> electricity.`,
    `The current <span style="${keyStyle}">Load</span> on the network is <span style="${valueStyle}">${totalLoadText}/s</span> - this is how much electricity is being demanded.`,
    `The <span style="${keyStyle}">Status</span> shows that you're producing <span style="color:${statusColor};font-weight:700;">${netDeltaText}/s ${statusLabel}</span> from this power station.`,
  ].join('<br>');
}

function applyStorageModalPosition(modal, left = null, top = null) {
  const overlay = document.getElementById('storage-modal-overlay');
  applyFloatingPosition(overlay, modal, left, top);
}

function initStorageModalDrag(modal) {
  const overlay = document.getElementById('storage-modal-overlay');
  if (!overlay || !modal) return;
  const layoutKey = `module:${modal.dataset.moduleId}`;
  initFloatingDrag(modal, overlay, {
    handleSelector: '.storage-modal-drag-handle',
    layoutKey,
    onFocus: () => {
      const moduleId = Number(modal.dataset.moduleId);
      if (Number.isFinite(moduleId)) state.selectedModule = moduleId;
    },
    isActive: () => overlay.style.display === 'flex',
  });
  initFloatingResize(modal, overlay, {
    minW: 420,
    minH: 300,
    layoutKey,
    isActive: () => overlay.style.display === 'flex',
  });
}

function ensureStorageModalWindow(moduleId) {
  let modal = getStorageModalWindow(moduleId);
  if (modal) return modal;
  const host = getStorageModalHost();
  if (!host) return null;
  modal = document.createElement('div');
  modal.className = 'storage-modal-window';
  modal.dataset.moduleId = String(moduleId);
  modal.style.cssText = 'position:absolute;width:600px;background:linear-gradient(160deg,#0a1428 0%,#060c1a 100%);border:1px solid #2a5090;border-radius:7px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.8);pointer-events:all;';
  modal.innerHTML = `<div class="panel-shell-head storage-modal-drag-handle"><div class="panel-shell-title storage-modal-title">BUILDING</div><button class="panel-shell-close" onclick="closeStorageModal(${moduleId})">✕</button></div><div class="storage-modal-body" style="padding:14px;"></div>`;
  host.appendChild(modal);
  const overlay = document.getElementById('storage-modal-overlay');
  placeFloatingWindow(overlay, modal, `module:${moduleId}`);
  initStorageModalDrag(modal);
  return modal;
}

export function openModuleModal(moduleId) {
  state.selectedModule = moduleId;
  const overlay = document.getElementById('storage-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
  const modal = ensureStorageModalWindow(moduleId);
  if (modal) {
    renderModuleModal(moduleId, modal);
    const layoutKey = `module:${moduleId}`;
    const place = () => centerFloatingWindow(overlay, modal, layoutKey);
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    bringStorageModalToFront(modal);
  }
}

export function openStorageModal(moduleId) {
  openModuleModal(moduleId);
}

export function closeStorageModal(arg = null) {
  const overlay = document.getElementById('storage-modal-overlay');
  if (typeof arg === 'number') {
    const modal = getStorageModalWindow(arg);
    if (modal) modal.remove();
  }
  const openWindows = getOpenStorageModalWindows();
  if (!openWindows.length) {
    if (overlay) overlay.style.display = 'none';
    state.selectedModule = null;
  } else {
    const topWindow = openWindows.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
    state.selectedModule = Number(topWindow?.dataset.moduleId) || state.selectedModule;
  }
}

function renderStatRows(rows) {
  return rows.map(([label, value]) => `<tr><td class="module-stat-label">${label}</td><td class="module-stat-value">${value}</td></tr>`).join('');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setTextIfChangedIn(root, selector, text) {
  const el = root?.querySelector(selector);
  if (!el) return null;
  if (el.textContent !== text) el.textContent = text;
  return el;
}

function setHtmlIfChangedIn(root, selector, html) {
  const el = root?.querySelector(selector);
  if (!el) return null;
  if (el.innerHTML !== html) el.innerHTML = html;
  return el;
}

function buildLabLinkedResourcesHtml(module, info) {
  if (!info.resources.length) return '<div class="module-empty-note">No linked resources in range.</div>';
  const counts = new Map();
  for (const entry of info.resources) {
    const resourceType = entry.node.type;
    counts.set(resourceType, (counts.get(resourceType) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      const tierA = RESOURCE_DEFS[a[0]] ? (RESOURCE_DEFS[a[0]].label || a[0]) : a[0];
      const tierB = RESOURCE_DEFS[b[0]] ? (RESOURCE_DEFS[b[0]].label || b[0]) : b[0];
      return tierA.localeCompare(tierB);
    })
    .map(([resourceType, count]) => {
      const def = RESOURCE_DEFS[resourceType];
      const tier = def ? ((Object.entries(MINE_TIERS).find(([, tierDef]) => tierDef.resources.includes(resourceType))?.[0]) || '?') : '?';
      return `<div class="module-resource-row">
        <span class="module-resource-name" style="color:${def?.color || '#cde'};">
          <span class="module-resource-dot" style="background:${def?.color || '#cde'};box-shadow:0 0 6px ${def?.color || '#cde'}88;"></span>
          <span>${def?.label || resourceType}</span>
        </span>
        <span class="module-resource-meta">${count}x T${tier}</span>
      </div>`;
    }).join('');
}

function buildPowerConsumerListHtml(linkedStorages, linkedTurrets) {
  const consumers = [
    ...linkedStorages.map((storage) => ({
      kind: 'module',
      id: storage.id,
      name: storage.name,
      label: getModuleLabel(storage).toUpperCase(),
      usage: getStoragePowerUsage(storage),
      color: '#8ff0c4',
    })),
    ...linkedTurrets.map((turret) => ({
      kind: 'turret',
      id: turret.id,
      name: turret.name || getCraft('turrets', turret.type)?.name || 'Turret',
      label: getCraft('turrets', turret.type)?.name?.toUpperCase() || 'TURRET',
      usage: turret.powerUsage || 0,
      color: '#ffe066',
    })),
  ].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));

  if (!consumers.length) return '<div class="module-empty-note">No linked consumers.</div>';
  return consumers.map((consumer) => `
    <div class="module-resource-row">
      <button class="btn module-btn-small" style="width:auto;padding:4px 8px;min-width:0;background:rgba(10,20,50,0.52);border-color:#2a5090;color:${consumer.color};" onclick="focusPowerNetworkTarget('${consumer.kind}', ${consumer.id})">${escapeHtml(consumer.name)}</button>
      <span class="module-resource-meta">${escapeHtml(consumer.label)} · ${consumer.usage.toFixed(1).replace(/\.0$/, '')}/s</span>
    </div>
  `).join('');
}

window.focusPowerNetworkTarget = function(kind, id) {
  if (kind === 'turret') {
    const turret = state.turrets.find((entry) => entry.id === id);
    if (!turret) return;
    const pos = gridToWorld(turret.col, turret.row);
    focusOn(pos.x, pos.y + 16, cam.zoom);
    if (window.openTurretModal) window.openTurretModal(id);
    return;
  }
  const module = state.modules.find((entry) => entry.id === id);
  if (!module) return;
  const pos = gridToWorld(module.col, module.row);
  focusOn(pos.x, pos.y, cam.zoom);
  openStorageModal(id);
};

export function renderModuleModal(moduleId = state.selectedModule, modalRoot = null) {
  const module = getModuleById(moduleId);
  const modal = modalRoot || getStorageModalWindow(moduleId);
  const body = modal?.querySelector('.storage-modal-body');
  const title = modal?.querySelector('.storage-modal-title');
  if (!module || !body || !modal) return;
  const moduleDef = getModuleDef(module.type);
  const summaryRows = moduleDef.summary(module);
  const buyPowerCost = isPoweredBuildingModule(module) ? getModuleUpgradeCost(module).coins * 5 : 0;
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  if (title) title.textContent = moduleDef.panelTitle;
  body.innerHTML = `
    <div class="storage-modal-hero">
      <div class="storage-modal-hero-row">
      <div class="storage-modal-hero-pad">
        <span id="storage-modal-name" class="storage-modal-name"></span>
        <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
      </div>
      <div class="storage-modal-hero-pad">
        <div id="storage-tier-pill" class="storage-modal-tier-pill"></div>
      </div>
      </div>
    </div>
    <div class="module-health-card">
      <div class="module-health-head"><span class="module-health-label">HEALTH</span><span id="storage-health-value" class="module-health-value"></span></div>
      <div class="module-health-track">
        <div id="storage-health-bar" class="module-health-bar"></div>
      </div>
    </div>
    ${(isPowerStationModule(module) || isPoweredBuildingModule(module) || isPowerPoleModule(module) || isLabTowerModule(module)) ? `<div id="module-operational-banner" class="module-status-banner module-status-banner-online">ONLINE</div>` : ''}
    ${isPoweredBuildingModule(module) ? `
    <div class="module-divider-top">
      <div class="module-section-label-tight">◈ POWER</div>
      <div class="storage-power-panel">
        <div class="storage-power-head">
          <span class="storage-power-icon">ϟ</span>
          <span class="storage-power-title">POWER GRID</span>
        </div>
        <table class="storage-power-table">
          <thead>
            <tr>
              <th><span style="cursor:help;" onmouseover="showHintTooltip(event, '${isDroneLabModule(module) ? 'Power usage scales with drone count: 1/s per drone deployed.' : 'Power usage scales with stored cargo: 1/s at empty, up to 10/s at full capacity.'}');" onmouseout="hideTooltip()">Usage</span></th>
              <th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td id="storage-power-usage"></td>
              <td id="storage-power-value"></td>
            </tr>
          </tbody>
        </table>
        <div class="module-bar-row">
          <span class="storage-power-icon">ϟ</span>
          <div class="module-meter-track" style="flex:1;"><div id="storage-power-bar" class="module-meter-bar" style="background:linear-gradient(90deg,#caa020,#ffe066);transition:width 0.3s;"></div></div>
        </div>
      </div>
      <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO POWER</div>
      <button id="storage-buy-power-btn" class="btn primary module-btn-medium" style="display:none;margin-top:8px;" onclick="buyStoragePower(${module.id})">BUY POWER <span style="color:#ffe066;">- $${fmt(buyPowerCost)}</span></button>
    </div>
    <div class="module-section-label">◈ ${isDroneLabModule(module) ? 'DRONE BAY' : isResearchLabModule(module) ? 'RESEARCH INTAKE' : 'STORAGE'}</div>
    <div class="module-meter-card">
      <div class="module-meter-head"><span class="module-meter-label">${isDroneLabModule(module) ? 'DRONES' : isResearchLabModule(module) ? 'THROUGHPUT' : 'STORAGE USED'}</span><span id="storage-used-value" class="module-meter-value"></span></div>
      <div class="module-meter-track"><div id="storage-used-bar" class="module-meter-bar" style="background:${isDroneLabModule(module) ? 'linear-gradient(90deg,#1a6aff,#5af)' : 'linear-gradient(90deg,#1a6aff,#48f)'};"></div></div>
    </div>
    ` : ''}
    ${summaryRows.length ? `<table class="module-summary-table">${renderStatRows(summaryRows)}</table>` : ''}
    ${(isPowerPoleModule(module) || isLabTowerModule(module)) ? `
    <div class="module-divider-top">
      <div class="module-section-label-tight">◈ ${isLabTowerModule(module) ? 'LAB RELAY' : 'RELAY'}</div>
      <div class="storage-power-panel">
        <div class="storage-power-head">
          <span class="storage-power-title">RELAY RANGE</span>
        </div>
        <div class="relay-range-row">
          <span id="relay-range-value" class="relay-range-value"></span>
          <span id="relay-range-blocks" class="relay-range-blocks"></span>
        </div>
      </div>
    </div>
    ` : ''}
    ${isPowerPoleModule(module) ? `
    <div class="module-section-label">◈ POWER LOAD</div>
    <div class="power-station-fuel-table-wrap">
      <table class="power-station-fuel-table">
        <thead>
          <tr>
            <th>Output</th>
            <th>Load</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td id="power-pole-network-output"></td>
            <td id="power-pole-network-load"></td>
            <td id="power-pole-network-status"></td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}
    ${isDroneLabModule(module) ? `
    <div class="module-section-label">◈ DRONE STATUS</div>
    <div id="drone-bay-status-list" class="module-scroll-panel compact"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : isStorageModule(module) ? `
    <div class="module-section-label-tight">◈ INVENTORY</div>
    <div id="storage-inventory-list" class="module-scroll-panel"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : isResearchLabModule(module) ? `
    <div class="module-section-label">◈ LINKED RESOURCES</div>
    <div id="lab-linked-resources" class="module-scroll-panel compact"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : isLabTowerModule(module) ? `
    <div class="module-section-label">◈ LINKED RESOURCES</div>
    <div id="lab-linked-resources" class="module-scroll-panel compact"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : (isPowerStationModule(module) || isPowerPoleModule(module)) ? `
    ${(isPowerStationModule(module) || isPowerPoleModule(module)) ? `
    <div id="power-station-no-fuel-warning" class="storage-no-power-warning" style="display:none;margin-bottom:8px;">WARNING: NO FUEL</div>
    ` : ''}
    ${isPowerStationModule(module) ? `
    <div class="module-section-label-tight">◈ FUEL</div>
    <div class="power-station-panel">
      <div class="power-station-row">
        <span class="power-station-power-label"><span class="storage-power-icon">ϟ</span><span class="storage-power-title">POWER SOURCE</span><span id="power-station-info-badge" class="power-station-info-badge">INFO</span></span>
        <select id="power-station-fuel-select" class="power-station-select" onchange="setPowerStationFuel(${module.id}, this.value)"></select>
      </div>
      <div class="power-station-fuel-table-wrap">
        <table class="power-station-fuel-table">
          <thead>
            <tr>
              <th>Input</th>
              <th>Output</th>
              <th>Load</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td id="power-station-fuel-rate"></td>
              <td id="power-station-fuel-output"></td>
              <td id="power-station-fuel-cost"></td>
              <td id="power-station-fuel-status"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="power-station-row power-station-fuel-row"><span id="power-station-used-label" class="power-station-value-label">△ FUEL</span><span id="power-station-used-value" class="power-station-value"></span></div>
      <div class="power-station-bar"><div id="power-station-used-bar" class="power-station-bar-fill"></div></div>
    </div>
    ` : ''}
    <div class="module-section-label-tight">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
      ${(isPowerStationModule(module) || isPowerPoleModule(module)) ? '<div id="power-station-network-consumers" class="module-scroll-panel compact" style="margin-top:8px;"></div>' : ''}
    </div>
    <div id="storage-inventory-list" class="module-scroll-panel"></div>
    ` : ''}
    <div class="module-section-label">◈ UPGRADE</div>
    <div id="storage-upgrade-reqs" class="bp-craft-reqs" style="margin-bottom:8px;"></div>
    ${(isPowerPoleModule(module) || isLabTowerModule(module) || isPowerStationModule(module) || isPoweredBuildingModule(module))
      ? `<div class="module-upgrade-grid">
          <button id="storage-upgrade-btn" class="btn primary module-btn-small" onclick="upgradeStorageFacility(${module.id})">UPGRADE</button>
          <button class="btn module-btn-small module-btn-move" onclick="startMoveStorage(${module.id})">MOVE</button>
          <button class="btn module-btn-small module-btn-rename" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
          <button class="btn danger module-btn-small" onclick="confirmSellStorage(${module.id})">SELL</button>
        </div>`
      : `<button id="storage-upgrade-btn" class="btn primary module-btn-medium" onclick="upgradeStorageFacility(${module.id})"></button>
        <button class="btn module-btn-medium module-btn-move" onclick="startMoveStorage(${module.id})">↔ MOVE ${moduleDef.name.toUpperCase()}</button>
        <button class="btn module-btn-medium module-btn-rename" onclick="openStorageRenameOverlay(${module.id})">✎ RENAME ${moduleDef.name.toUpperCase()}</button>
        <button class="btn danger module-btn-medium" onclick="confirmSellStorage(${module.id})">⊘ SELL ${moduleDef.name.toUpperCase()}</button>`}
  `;
  patchModuleModal(moduleId, modal);
}

export function renderStorageModal(moduleId = state.selectedModule) {
  renderModuleModal(moduleId);
}

export function patchModuleModal(moduleId = state.selectedModule, modalRoot = null) {
  const module = getModuleById(moduleId);
  const modal = modalRoot || getStorageModalWindow(moduleId);
  const title = modal?.querySelector('.storage-modal-title');
  if (!module || !title || !modal) return;
  const qs = (selector) => modal.querySelector(selector);
  if (!qs('#storage-modal-name')) { renderModuleModal(moduleId, modal); return; }
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  qs('#storage-tier-pill').textContent = `TIER ${toRoman(moduleTier)}`;
  qs('#storage-tier-pill').style.color = isLightColor(tierColor) ? '#111' : '#fff';
  qs('#storage-tier-pill').style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const canUpgrade = !atMaxTier && state.coins >= upgradeCost.coins && Object.entries(upgradeCost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', `<span class="bp-craft-req ${state.coins >= upgradeCost.coins ? 'met' : 'unmet'}">$${fmt(upgradeCost.coins)}</span>${Object.entries(upgradeCost.reqs).map(([r, n]) => `<span class="bp-craft-req ${(state.resources[r] || 0) >= n ? 'met' : 'unmet'}">${RESOURCE_DEFS[r].label}: ${n}</span>`).join('')}`);
  const upBtn = qs('#storage-upgrade-btn');
  upBtn.textContent = atMaxTier ? '★ MAX TIER' : (isPowerPoleModule(module) || isLabTowerModule(module) || isPowerStationModule(module) || isPoweredBuildingModule(module)) ? 'UPGRADE' : `⬆ UPGRADE ${moduleDef.name.toUpperCase()}`;
  upBtn.disabled = !canUpgrade || (isPoweredBuildingModule(module) && (module.power || 0) <= 0);

  const invRows = Object.entries(module.inventory || {})
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amt]) => `<div class="module-inventory-row"><span style="display:flex;align-items:center;gap:8px;color:${RESOURCE_DEFS[type].color}">${resourceIconHtml(type, 14)}${RESOURCE_DEFS[type].label}</span><span style="color:#ffe066">${fmt(amt)}</span></div>`)
    .join('');

  if (isPoweredBuildingModule(module)) {
    const buyPowerCost = upgradeCost.coins * 5;
    const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
    const currentPowerUsage = getStoragePowerUsage(module);
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const linkedTurrets = networkInfo.turrets;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedTurrets.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    const activeDroneCount = isDroneLabModule(module) ? (state.drones || []).filter(d => d.labId === module.id).length : 0;
    setTextIfChangedIn(modal, '#storage-used-value', isDroneLabModule(module) ? `${activeDroneCount} / ${module.droneCapacity || 2}` : isResearchLabModule(module) ? 'ACTIVE' : `${fmt(getStorageTotalInventory(module))} / ${fmt(module.storageCapacity)}`);
    qs('#storage-used-bar').style.width = `${isDroneLabModule(module) ? Math.max(0, Math.min(100, (activeDroneCount / Math.max(1, module.droneCapacity || 2)) * 100)) : isResearchLabModule(module) ? 100 : Math.max(0, Math.min(100, (getStorageTotalInventory(module) / Math.max(1, module.storageCapacity)) * 100))}%`;
    setTextIfChangedIn(modal, '#storage-power-usage', `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`);
    setTextIfChangedIn(modal, '#storage-power-value', `${fmt(module.power || 0)} / ${fmt(module.powerCapacity)}`);
    qs('#storage-power-bar').style.width = `${powerPct}%`;
    const noPower = (module.power || 0) <= 0;
    qs('#storage-no-power-warning').style.display = noPower ? '' : 'none';
    const buyPowerBtn = qs('#storage-buy-power-btn');
    buyPowerBtn.style.display = noPower ? '' : 'none';
    buyPowerBtn.disabled = state.coins < buyPowerCost;
    if (isStorageModule(module)) qs('#storage-inventory-list').innerHTML = invRows || '<div class="module-empty-note">No stored resources yet.</div>';
    const summaryEl = qs('#power-station-link-summary');
    if (summaryEl && summaryEl.dataset.networkSig !== networkSig) {
      const tooltipLines = [
        ...linkedStations.map((station) => `POWER STATION: ${escapeHtml(station.name)}`),
        ...linkedPoles.map((pole) => `POLE: ${escapeHtml(pole.name)}`),
        ...linkedStorages.map((storage) => `${escapeHtml(getModuleLabel(storage).toUpperCase())}: ${escapeHtml(storage.name)}`),
        ...linkedTurrets.map((turret) => `TURRET: ${escapeHtml(turret.name || getCraft('turrets', turret.type)?.name || 'Turret')}`),
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Powered Buildings` : '',
        linkedTurrets.length > 0 ? `${linkedTurrets.length}x Turrets` : '',
      ].filter(Boolean);
      const tooltipText = tooltipLines.length ? tooltipLines.join('<br>') : 'No linked modules.';
      summaryEl.dataset.networkSig = networkSig;
      summaryEl.textContent = summaryParts.join(' • ') || 'No linked modules';
      summaryEl.onmouseover = (event) => showHintTooltip(event, tooltipText);
      summaryEl.onmouseout = () => hideTooltip();
    }
    if (isResearchLabModule(module)) {
      const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
      setHtmlIfChangedIn(modal, '#lab-linked-resources', buildLabLinkedResourcesHtml(module, labInfo));
    }
    if (isDroneLabModule(module)) {
      const labDrones = (state.drones || []).filter(d => d.labId === module.id);
      const droneStatusHtml = labDrones.length
        ? labDrones.map(d => {
            const isScanning = d.status === 'scanning';
            const isFlying   = d.status === 'flying';
            const isLaunching = d.status === 'idle' && d.taskNodeId !== null;
            const statusText = isScanning
              ? `<span style="color:#40ffcc">Scanning and Salvaging a: Crashed Ship</span>`
              : isFlying
              ? `<span style="color:#4ab8ff">Flying to Crashed Ship</span>`
              : isLaunching
              ? `<span style="color:#ffe066">Launching…</span>`
              : `<span style="color:#556">Idle</span>`;
            return `<div class="module-inventory-row"><span style="color:#8af">${d.name}</span>${statusText}</div>`;
          }).join('')
        : '<div class="module-empty-note">No drones deployed.</div>';
      setHtmlIfChangedIn(modal, '#drone-bay-status-list', droneStatusHtml);
    }
  } else if (isPowerStationModule(module) || isPowerPoleModule(module) || isLabTowerModule(module)) {
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
    const networkState = getPowerNetworkState(state.modules, state.turrets);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const linkedTurrets = networkInfo.turrets;
    const noFuelIds = getNoFuelNetworkIds(state.modules, state.turrets);
    const noFuelWarning = document.getElementById('power-station-no-fuel-warning');
    const inputQty = getPowerResourceConsumption(module);
    const linkedConsumers = linkedStorages.length + linkedTurrets.length;
    const fuelCost = inputQty * linkedConsumers;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedTurrets.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    if (isPowerStationModule(module)) {
      const fuelSelect = qs('#power-station-fuel-select');
      if (fuelSelect) {
        const optionsHtml = getPowerFuelOptions().map((option) => `<option value="${option.type}" ${module.fuelResource === option.type ? 'selected' : ''}>${option.label}</option>`).join('');
        if (fuelSelect.innerHTML !== optionsHtml) fuelSelect.innerHTML = optionsHtml;
      }
      const fuelType = module.fuelResource || 'iron';
      const fuelName = RESOURCE_DEFS[fuelType].label;
      const powerOutput = getPowerStationEffectiveOutput(module, linkedConsumers);
      const powerOutputText = powerOutput.toFixed(1).replace(/\.0$/, '');
      const noFuel = !hasPowerStationFuel(module);
      const offline = (module.health || 0) <= 0 || noFuel;
      const inputText = `${fuelCost} ${fuelName}`;
      const outputText = `${powerOutputText}/s`;
      const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0) + linkedTurrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
      const totalLoadText = totalLoad.toFixed(1).replace(/\.0$/, '');
      const netDelta = powerOutput - totalLoad;
      const netDeltaText = `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}`;
      const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
      const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
      const facilityLabel = linkedConsumers === 1 ? 'Consumer' : 'Consumers';
      const operationalBanner = qs('#module-operational-banner');
      const deficitWarning = qs('#power-station-deficit-warning');
      const infoBadge = qs('#power-station-info-badge');
      setTextIfChangedIn(modal, '#power-station-fuel-rate', inputText);
      setTextIfChangedIn(modal, '#power-station-fuel-output', outputText);
      setHtmlIfChangedIn(modal, '#power-station-fuel-cost', `${totalLoadText}/s<div class="power-station-fuel-sub">(${linkedConsumers} ${facilityLabel})</div>`);
      setHtmlIfChangedIn(modal, '#power-station-fuel-status', `<span style="color:${statusColor};">${netDeltaText}/s</span><div class="power-station-fuel-sub" style="color:${statusColor};">${statusLabel}</div>`);
      const selectedFuelStored = module.inventory?.[fuelType] || 0;
      setTextIfChangedIn(modal, '#power-station-used-label', `△ FUEL: ${fuelName.toUpperCase()}`);
      setTextIfChangedIn(modal, '#power-station-used-value', `${fmt(selectedFuelStored)} / ${fmt(module.resourceCapacity || 0)}`);
      qs('#power-station-used-bar').style.width = `${Math.max(0, Math.min(100, (selectedFuelStored / Math.max(1, module.resourceCapacity || 1)) * 100))}%`;
      if (infoBadge) {
        const tooltipText = buildPowerStationInfoTooltip({ fuelCost, fuelName, powerOutputText, totalLoadText, netDeltaText, statusLabel, noFuel });
        infoBadge.onmouseover = (event) => showHintTooltip(event, tooltipText);
        infoBadge.onmouseout = () => hideTooltip();
      }
      if (noFuelWarning) {
        noFuelWarning.textContent = `WARNING: NO ${fuelName.toUpperCase()}`;
        noFuelWarning.style.display = noFuel ? '' : 'none';
      }
      if (deficitWarning) deficitWarning.style.display = (!noFuel && netDelta < 0) ? '' : 'none';
      if (operationalBanner) {
        operationalBanner.textContent = offline ? 'OFFLINE' : 'ONLINE';
        operationalBanner.className = `module-status-banner ${offline ? 'module-status-banner-offline' : 'module-status-banner-online'}`;
      }
      setHtmlIfChangedIn(modal, '#power-station-network-consumers', buildPowerConsumerListHtml(linkedStorages, linkedTurrets));
    } else if (isPowerPoleModule(module)) {
      const operationalBanner = qs('#module-operational-banner');
      if (operationalBanner) {
        const online = (module.health || 0) > 0;
        operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
        operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
      }
      setTextIfChangedIn(modal, '#relay-range-value', `${module.relayRange || 0} TILES`);
      setTextIfChangedIn(modal, '#relay-range-blocks', Array.from({ length: Math.max(0, module.relayRange || 0) }, () => '■').join(' '));
      const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0) + linkedTurrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
      const activeStations = linkedStations.filter((station) => (station.health || 0) > 0 && hasPowerStationFuel(station));
      const offlineStations = linkedStations.filter((station) => (station.health || 0) > 0 && !hasPowerStationFuel(station));
      const totalOutput = activeStations.reduce((sum, station) => sum + getPowerStationEffectiveOutput(station, ((networkState.stationLinkedStorages.get(station.id) || []).length + (networkState.stationLinkedTurrets.get(station.id) || []).length)), 0);
      const totalOutputText = totalOutput.toFixed(1).replace(/\.0$/, '');
      const offlineOutput = offlineStations.reduce((sum, station) => sum + getPowerFuelOutput(station.fuelResource || 'iron'), 0);
      const netDelta = totalOutput - totalLoad;
      const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
      const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
      setHtmlIfChangedIn(modal, '#power-pole-network-output', `${totalOutputText}/s${offlineOutput > 0 ? `<div class="power-station-fuel-sub" style="color:#ff8a8a;">(-${offlineOutput}/s offline)</div>` : ''}`);
      setHtmlIfChangedIn(modal, '#power-pole-network-load', `${totalLoad.toFixed(1).replace(/\.0$/, '')}/s<div class="power-station-fuel-sub">(${linkedConsumers} Consumers)</div>`);
      setHtmlIfChangedIn(modal, '#power-pole-network-status', `<span style="color:${statusColor};">${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}/s</span><div class="power-station-fuel-sub" style="color:${statusColor};">${statusLabel}</div>`);
      setHtmlIfChangedIn(modal, '#power-station-network-consumers', buildPowerConsumerListHtml(linkedStorages, linkedTurrets));
      if (noFuelWarning) noFuelWarning.style.display = noFuelIds.has(module.id) ? '' : 'none';
    } else if (isLabTowerModule(module)) {
      const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
      const operationalBanner = qs('#module-operational-banner');
      if (operationalBanner) {
        const online = (module.health || 0) > 0;
        operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
        operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
      }
      setTextIfChangedIn(modal, '#relay-range-value', `${module.relayRange || 0} TILES`);
      setHtmlIfChangedIn(modal, '#relay-range-blocks', `<span style="color:#8ff0c4;">${Array.from({ length: Math.max(0, module.relayRange || 0) }, () => '■').join(' ')}</span>`);
      setHtmlIfChangedIn(modal, '#lab-linked-resources', buildLabLinkedResourcesHtml(module, labInfo));
      const summaryEl = qs('#power-station-link-summary');
      if (summaryEl) {
        const towerSig = `${labInfo.labs.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${labInfo.towers.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${labInfo.resources.map((entry) => `${entry.tower.id}:${entry.node.id}`).sort().join(',')}`;
        if (summaryEl.dataset.networkSig !== towerSig) {
          const tooltipLines = [
            ...labInfo.labs.map((lab) => `RESEARCH LAB: ${escapeHtml(lab.name)}`),
            ...labInfo.towers.map((tower) => `LAB TOWER: ${escapeHtml(tower.name)}`),
          ];
          const summaryParts = [
            labInfo.labs.length > 0 ? `${labInfo.labs.length}x Research Labs` : '',
            (labInfo.towers.length + 1) > 0 ? `${labInfo.towers.length + 1}x Lab Towers` : '',
            labInfo.resources.length > 0 ? `${labInfo.resources.length}x Linked Nodes` : '',
          ].filter(Boolean);
          summaryEl.dataset.networkSig = towerSig;
          summaryEl.textContent = summaryParts.join(' • ') || 'No linked lab network';
          summaryEl.onmouseover = (event) => showHintTooltip(event, tooltipLines.join('<br>') || 'No linked lab network.');
          summaryEl.onmouseout = () => hideTooltip();
        }
      }
    }
    const summaryEl = qs('#power-station-link-summary');
    if (summaryEl && summaryEl.dataset.networkSig !== networkSig) {
      const tooltipLines = [
        ...linkedStations.map((station) => `POWER STATION: ${escapeHtml(station.name)}`),
        ...linkedPoles.map((pole) => `POLE: ${escapeHtml(pole.name)}`),
        ...linkedStorages.map((storage) => `${escapeHtml(getModuleLabel(storage).toUpperCase())}: ${escapeHtml(storage.name)}`),
        ...linkedTurrets.map((turret) => `TURRET: ${escapeHtml(turret.name || getCraft('turrets', turret.type)?.name || 'Turret')}`),
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Powered Buildings` : '',
        linkedTurrets.length > 0 ? `${linkedTurrets.length}x Turrets` : '',
      ].filter(Boolean);
      const tooltipText = tooltipLines.length ? tooltipLines.join('<br>') : 'No linked modules.';
      summaryEl.dataset.networkSig = networkSig;
      summaryEl.textContent = summaryParts.join(' • ') || 'No linked modules';
      summaryEl.onmouseover = (event) => showHintTooltip(event, tooltipText);
      summaryEl.onmouseout = () => hideTooltip();
    }
    setHtmlIfChangedIn(modal, '#storage-inventory-list', invRows || '<div class="module-empty-note">No stored fuel yet.</div>');
  }

  if (isPoweredBuildingModule(module)) {
    const operationalBanner = qs('#module-operational-banner');
    if (operationalBanner) {
      const online = isStorageOperational(module);
      operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
      operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
    }
  }
}

export function patchStorageModal() {
  const windows = getOpenStorageModalWindows();
  for (const modal of windows) {
    const moduleId = Number(modal.dataset.moduleId);
    if (Number.isFinite(moduleId)) patchModuleModal(moduleId, modal);
  }
}

export function cancelModulePlacement() {
  if (!state.placingModule) return;
  state.placingModule = false;
  state.placingModuleType = null;
  state.movingModule = null;
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = '';
  if (refresh.ui) refresh.ui();
}

export function cancelStoragePlacement() {
  cancelModulePlacement();
}

window.upgradeStorageFacility = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || module.level >= 10) return;
  const cost = getModuleUpgradeCost(module);
  if (state.coins < cost.coins) return;
  for (const [r, n] of Object.entries(cost.reqs)) if ((state.resources[r] || 0) < n) return;
  if (isPoweredBuildingModule(module) && (module.power || 0) <= 0) return;
  spendCoins(cost.coins);
  for (const [r, n] of Object.entries(cost.reqs)) state.resources[r] -= n;
  module.level++;
  const nextStats = getModuleStats(module.type, module.level);
  const prevMaxHealth = module.maxHealth;
  module.maxHealth = nextStats.maxHealth;
  module.health = Math.min(module.health + (module.maxHealth - prevMaxHealth), module.maxHealth);
  Object.assign(module, nextStats);
  if (isPoweredBuildingModule(module)) module.power = Math.min(module.power, module.powerCapacity);
  invalidateNetworkCache();
  addLog(`${module.name} upgraded to Tier ${module.level}.`);
  if (refresh.ui) refresh.ui();
  patchModuleModal(moduleId);
};

window.buyStoragePower = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || !isPoweredBuildingModule(module)) return;
  const cost = getModuleUpgradeCost(module).coins * 5;
  if (state.coins < cost) return;
  spendCoins(cost);
  module.power = module.powerCapacity;
  addLog(`${module.name} restored to full power for ${fmt(cost)}¢.`);
  if (refresh.ui) refresh.ui();
  patchModuleModal(moduleId);
};

window.startMoveStorage = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  state.movingModule = moduleId;
  if (state.selectedModule === moduleId) state.selectedModule = null;
  state.placingModule = true;
  state.placingModuleType = module.type || STORAGE_FACILITY_ID;
  closeStorageModal(moduleId);
  addLog(`↔ Click a valid ${getModuleFootprintLabel(module)} area to move ${module.name}. Press Esc to cancel.`);
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.confirmSellStorage = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  const refundCoins = getModuleInvestedCoins(module);
  const label = getModuleLabel(module);
  if (window.openModuleSellOverlay) {
    window.openModuleSellOverlay(moduleId, module.name, label, refundCoins);
    return;
  }
};

window.sellStorageFacility = function(moduleId, refundCoins) {
  const module = getModuleById(moduleId);
  if (!module) return;
  if (!addCoins(refundCoins)) return;
  if (isPoweredBuildingModule(module) || isPowerStationModule(module)) {
    for (const ship of state.ships) {
      if ((ship.depotType === 'storage' || ship.depotType === 'power_station') && ship.depotId === moduleId) {
        ship.depotType = 'base';
        ship.depotId = null;
        if (ship.status === 'returning' && ship.cargo > 0) {
          const base = gridToWorld(BASE_COL, BASE_ROW);
          ship.destX = base.x;
          ship.destY = base.y + TILE_H / 2 - 20;
        }
      }
      if ((ship.pickupType === 'storage' || ship.pickupType === 'power_station') && ship.pickupId === moduleId) {
        ship.pickupType = null;
        ship.pickupId = null;
      }
    }
  }
  state.modules = state.modules.filter(entry => entry.id !== moduleId);
  invalidateNetworkCache();
  closeStorageModal(moduleId);
  addLog(`${module.name} sold — recovered ${fmt(refundCoins)}¢.`);
  if (refresh.ui) refresh.ui();
};

window.setPowerStationFuel = function(moduleId, fuelResource) {
  const module = getModuleById(moduleId);
  if (!module || !isPowerStationModule(module)) return;
  module.fuelResource = fuelResource;
  renderModuleModal(moduleId);
};

window.startCraftBuilding = function(moduleType = STORAGE_FACILITY_ID) {
  const moduleDef = getCraft('buildings', moduleType);
  const moduleConfig = getModuleDef(moduleType);
  if (!moduleDef) return;
  if (!state.researchUnlocks[moduleConfig.unlockId]) return;
  if (state.buildingCraftTimers?.[moduleType] && Date.now() < state.buildingCraftTimers[moduleType].endsAt) return;
  if (state.coins < moduleDef.cost) return;
  for (const [r, n] of Object.entries(moduleDef.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(moduleDef.cost);
  for (const [r, n] of Object.entries(moduleDef.reqs)) state.resources[r] -= n;
  const durationMs = getModuleCraftTimeMs(moduleType);
  const now = Date.now();
  if (!state.buildingCraftTimers) state.buildingCraftTimers = {};
  state.buildingCraftTimers[moduleType] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: ${moduleDef.name} (${Math.ceil(durationMs / 1000)}s)`);
  scheduleBuildingCraftCompletion(moduleType, now + durationMs);
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
};

window.beginPlacingBuilding = function(moduleType = STORAGE_FACILITY_ID) {
  const queue = Array.isArray(state.unplacedModuleQueue) ? state.unplacedModuleQueue : [];
  if (!queue.includes(moduleType) && !state.movingModule) return;
  state.placingModule = true;
  state.placingModuleType = moduleType;
  if (window.dismissHdrModal) window.dismissHdrModal();
  if (window.dismissBasePanel) window.dismissBasePanel();
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.syncBuildingCraftTimers = function() {
  if (!state.buildingCraftTimers) return;
  for (const [moduleType, timer] of Object.entries(state.buildingCraftTimers)) {
    if (!timer?.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftBuilding(moduleType);
    else scheduleBuildingCraftCompletion(moduleType, timer.endsAt);
  }
};

function completeCraftDrone() {
  const timer = state.droneCraftTimers?.['drone'];
  if (!timer) return;
  delete state.droneCraftTimers['drone'];
  const availableLab = state.modules.find(m => isDroneLabModule(m) && (m.droneCount || 0) < (m.droneCapacity || 2));
  if (availableLab) {
    availableLab.droneCount = (availableLab.droneCount || 0) + 1;
    addLog(`✅ Drone ready — assigned to ${availableLab.name}.`);
  } else {
    addLog(`✅ Drone built — no Drone Lab with available capacity.`);
  }
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
}

function scheduleDroneCraftCompletion(endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.droneCraftTimers?.['drone'];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftDrone();
    else scheduleDroneCraftCompletion(timer.endsAt);
  }, wait + 5);
}

window.startCraftDrone = function() {
  const droneDef = getCraft('drones', 'drone');
  if (!droneDef) return;
  if (!state.researchUnlocks['drone_crafting']) return;
  if (state.droneCraftTimers?.['drone'] && Date.now() < state.droneCraftTimers['drone'].endsAt) return;
  if (state.coins < droneDef.cost) return;
  for (const [r, n] of Object.entries(droneDef.reqs || {})) if ((state.resources[r] || 0) < n) return;
  spendCoins(droneDef.cost);
  for (const [r, n] of Object.entries(droneDef.reqs || {})) state.resources[r] -= n;
  const durationMs = droneDef.craftTimeMs || 1000;
  const now = Date.now();
  if (!state.droneCraftTimers) state.droneCraftTimers = {};
  state.droneCraftTimers['drone'] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: Drone (${Math.ceil(durationMs / 1000)}s)`);
  scheduleDroneCraftCompletion(now + durationMs);
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
};

window.syncDroneCraftTimers = function() {
  if (!state.droneCraftTimers) return;
  for (const [, timer] of Object.entries(state.droneCraftTimers)) {
    if (!timer?.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftDrone();
    else scheduleDroneCraftCompletion(timer.endsAt);
  }
};

state.modules = (state.modules || []).map((module, index) => normalizeModule(module, index + 1));
window.syncBuildingCraftTimers();
window.syncDroneCraftTimers();
window.openStorageModal = openStorageModal;
window.openModuleModal = openModuleModal;
window.closeStorageModal = closeStorageModal;
window.renderStorageModal = renderStorageModal;
window.renderModuleModal = renderModuleModal;
window.patchStorageModal = patchStorageModal;
window.patchModuleModal = patchModuleModal;
window.cancelStoragePlacement = cancelStoragePlacement;
window.showHintTooltip = showHintTooltip;
window.hideTooltip = hideTooltip;
