// ============================================================
// MODULE UI — craft timers, placement, and modal
// ============================================================
import { state } from '../state.js';
import { addLog, fmt, spendCoins, addCoins, isLightColor, showHintTooltip, hideTooltip } from '../helpers.js';
import { refresh } from './refresh.js';
import { getCraft } from '../data/crafts.js';
import {
  STORAGE_FACILITY_ID,
  getModuleDef,
  getModuleStats,
  getModuleFootprintCells,
  moduleContainsCell,
  normalizeModule,
  isStorageModule,
  isResearchLabModule,
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
  hasPowerStationFuel,
  getNoFuelNetworkIds,
} from '../data/modules.js';
import { getStoragePowerUsage, isStorageOperational } from '../data/storage.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { gridToWorld } from '../render/camera.js';
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
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
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

let _storageModalTopZ = 0;

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

function clampStorageModalPosition(left, top, modal) {
  const overlay = document.getElementById('storage-modal-overlay');
  if (!overlay || !modal) return { left, top };
  const overlayRect = overlay.getBoundingClientRect();
  const modalRect = modal.getBoundingClientRect();
  const maxLeft = Math.max(0, overlayRect.width - modalRect.width);
  const maxTop = Math.max(0, overlayRect.height - modalRect.height);
  return {
    left: Math.max(0, Math.min(maxLeft, left)),
    top: Math.max(0, Math.min(maxTop, top)),
  };
}

function bringStorageModalToFront(modal) {
  if (!modal) return;
  _storageModalTopZ += 1;
  modal.style.zIndex = String(_storageModalTopZ);
}

function applyStorageModalPosition(modal, left = null, top = null) {
  const overlay = document.getElementById('storage-modal-overlay');
  if (!overlay || !modal) return;
  if (left === null || top === null) {
    const overlayRect = overlay.getBoundingClientRect();
    const modalRect = modal.getBoundingClientRect();
    left = Number.isFinite(Number(modal.dataset.left)) ? Number(modal.dataset.left) : Math.max(24, Math.round((overlayRect.width - modalRect.width) / 2));
    top = Number.isFinite(Number(modal.dataset.top)) ? Number(modal.dataset.top) : 24;
  }
  const nextPos = clampStorageModalPosition(left, top, modal);
  modal.dataset.left = String(nextPos.left);
  modal.dataset.top = String(nextPos.top);
  modal.style.left = `${nextPos.left}px`;
  modal.style.top = `${nextPos.top}px`;
}

function initStorageModalDrag(modal) {
  const overlay = document.getElementById('storage-modal-overlay');
  const handle = modal?.querySelector('.storage-modal-drag-handle');
  if (!overlay || !modal || !handle || modal.dataset.dragReady === '1') return;
  modal.dataset.dragReady = '1';
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.panel-shell-close')) return;
    const modalRect = modal.getBoundingClientRect();
    dragging = true;
    offsetX = event.clientX - modalRect.left;
    offsetY = event.clientY - modalRect.top;
    bringStorageModalToFront(modal);
    document.body.style.userSelect = 'none';
    event.preventDefault();
  });

  modal.addEventListener('mousedown', () => {
    bringStorageModalToFront(modal);
    const moduleId = Number(modal.dataset.moduleId);
    if (Number.isFinite(moduleId)) state.selectedModule = moduleId;
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const overlayRect = overlay.getBoundingClientRect();
    const nextLeft = event.clientX - overlayRect.left - offsetX;
    const nextTop = event.clientY - overlayRect.top - offsetY;
    applyStorageModalPosition(modal, nextLeft, nextTop);
    event.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
  });

  window.addEventListener('resize', () => {
    if (overlay.style.display === 'flex') applyStorageModalPosition(modal);
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
  const overlayRect = overlay?.getBoundingClientRect();
  const modalRect = modal.getBoundingClientRect();
  const offset = getOpenStorageModalWindows().length - 1;
  const baseLeft = overlayRect ? Math.round((overlayRect.width - modalRect.width) / 2) : 96;
  const baseTop = 56;
  applyStorageModalPosition(modal, baseLeft + (offset * 20), baseTop + (offset * 20));
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
    applyStorageModalPosition(modal);
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
      <div class="module-health-track" style="margin-bottom:6px;">
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
              <th><span style="cursor:help;" onmouseover="showHintTooltip(event, 'Power usage scales with stored cargo: 1/s at empty, up to 10/s at full capacity.');" onmouseout="hideTooltip()">Usage</span></th>
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
    <div class="module-section-label">◈ ${isResearchLabModule(module) ? 'RESEARCH INTAKE' : 'STORAGE'}</div>
    <div class="module-meter-card">
      <div class="module-meter-head"><span class="module-meter-label">${isResearchLabModule(module) ? 'THROUGHPUT' : 'STORAGE USED'}</span><span id="storage-used-value" class="module-meter-value"></span></div>
      <div class="module-meter-track"><div id="storage-used-bar" class="module-meter-bar" style="background:linear-gradient(90deg,#1a6aff,#48f);"></div></div>
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
    <div class="power-station-panel">
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
    </div>
    ` : ''}
    ${isStorageModule(module) ? `
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
        <span class="power-station-power-label"><span class="storage-power-icon">ϟ</span><span class="storage-power-title">POWER SOURCE</span></span>
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
    .map(([type, amt]) => `<div class="module-inventory-row"><span style="color:${RESOURCE_DEFS[type].color}">${RESOURCE_DEFS[type].label}</span><span style="color:#ffe066">${fmt(amt)}</span></div>`)
    .join('');

  if (isPoweredBuildingModule(module)) {
    const buyPowerCost = upgradeCost.coins * 5;
    const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
    const currentPowerUsage = getStoragePowerUsage(module);
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    setTextIfChangedIn(modal, '#storage-used-value', isResearchLabModule(module) ? 'ACTIVE' : `${fmt(getStorageTotalInventory(module))} / ${fmt(module.storageCapacity)}`);
    qs('#storage-used-bar').style.width = `${isResearchLabModule(module) ? 100 : Math.max(0, Math.min(100, (getStorageTotalInventory(module) / Math.max(1, module.storageCapacity)) * 100))}%`;
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
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Powered Buildings` : '',
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
  } else if (isPowerStationModule(module) || isPowerPoleModule(module) || isLabTowerModule(module)) {
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const noFuelIds = getNoFuelNetworkIds(state.modules);
    const noFuelWarning = document.getElementById('power-station-no-fuel-warning');
    const inputQty = getPowerResourceConsumption(module);
    const fuelCost = inputQty * linkedStorages.length;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    if (isPowerStationModule(module)) {
      const fuelSelect = qs('#power-station-fuel-select');
      if (fuelSelect) {
        const optionsHtml = getPowerFuelOptions().map((option) => `<option value="${option.type}" ${module.fuelResource === option.type ? 'selected' : ''}>${option.label}</option>`).join('');
        if (fuelSelect.innerHTML !== optionsHtml) fuelSelect.innerHTML = optionsHtml;
      }
      const fuelType = module.fuelResource || 'iron';
      const fuelName = RESOURCE_DEFS[fuelType].label;
      const powerOutput = getPowerFuelOutput(fuelType);
      const noFuel = !hasPowerStationFuel(module);
      const offline = (module.health || 0) <= 0 || noFuel;
      const inputText = `${fuelCost} ${fuelName}`;
      const outputText = `${powerOutput}/s`;
      const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0);
      const netDelta = powerOutput - totalLoad;
      const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
      const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
      const facilityLabel = linkedStorages.length === 1 ? 'Building' : 'Buildings';
      const operationalBanner = qs('#module-operational-banner');
      const deficitWarning = qs('#power-station-deficit-warning');
      setTextIfChangedIn(modal, '#power-station-fuel-rate', inputText);
      setTextIfChangedIn(modal, '#power-station-fuel-output', outputText);
      setHtmlIfChangedIn(modal, '#power-station-fuel-cost', `${totalLoad.toFixed(1).replace(/\.0$/, '')}/s<div class="power-station-fuel-sub">(${linkedStorages.length} ${facilityLabel})</div>`);
      setHtmlIfChangedIn(modal, '#power-station-fuel-status', `<span style="color:${statusColor};">${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}/s</span><div class="power-station-fuel-sub" style="color:${statusColor};">${statusLabel}</div>`);
      const selectedFuelStored = module.inventory?.[fuelType] || 0;
      setTextIfChangedIn(modal, '#power-station-used-label', `△ FUEL: ${fuelName.toUpperCase()}`);
      setTextIfChangedIn(modal, '#power-station-used-value', `${fmt(selectedFuelStored)} / ${fmt(module.resourceCapacity || 0)}`);
      qs('#power-station-used-bar').style.width = `${Math.max(0, Math.min(100, (selectedFuelStored / Math.max(1, module.resourceCapacity || 1)) * 100))}%`;
      if (noFuelWarning) {
        noFuelWarning.textContent = `WARNING: NO ${fuelName.toUpperCase()}`;
        noFuelWarning.style.display = noFuel ? '' : 'none';
      }
      if (deficitWarning) deficitWarning.style.display = (!noFuel && netDelta < 0) ? '' : 'none';
      if (operationalBanner) {
        operationalBanner.textContent = offline ? 'OFFLINE' : 'ONLINE';
        operationalBanner.className = `module-status-banner ${offline ? 'module-status-banner-offline' : 'module-status-banner-online'}`;
      }
    } else if (isPowerPoleModule(module)) {
      const operationalBanner = qs('#module-operational-banner');
      if (operationalBanner) {
        const online = (module.health || 0) > 0;
        operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
        operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
      }
      setTextIfChangedIn(modal, '#relay-range-value', `${module.relayRange || 0} TILES`);
      setTextIfChangedIn(modal, '#relay-range-blocks', Array.from({ length: Math.max(0, module.relayRange || 0) }, () => '■').join(' '));
      const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0);
      const activeStations = linkedStations.filter((station) => (station.health || 0) > 0 && hasPowerStationFuel(station));
      const offlineStations = linkedStations.filter((station) => (station.health || 0) > 0 && !hasPowerStationFuel(station));
      const totalOutput = activeStations.reduce((sum, station) => sum + getPowerFuelOutput(station.fuelResource || 'iron'), 0);
      const offlineOutput = offlineStations.reduce((sum, station) => sum + getPowerFuelOutput(station.fuelResource || 'iron'), 0);
      const netDelta = totalOutput - totalLoad;
      const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
      const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
      setHtmlIfChangedIn(modal, '#power-pole-network-output', `${totalOutput}/s${offlineOutput > 0 ? `<div class="power-station-fuel-sub" style="color:#ff8a8a;">(-${offlineOutput}/s offline)</div>` : ''}`);
      setHtmlIfChangedIn(modal, '#power-pole-network-load', `${totalLoad.toFixed(1).replace(/\.0$/, '')}/s<div class="power-station-fuel-sub">(${linkedStorages.length} Buildings)</div>`);
      setHtmlIfChangedIn(modal, '#power-pole-network-status', `<span style="color:${statusColor};">${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}/s</span><div class="power-station-fuel-sub" style="color:${statusColor};">${statusLabel}</div>`);
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
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Powered Buildings` : '',
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
  const body = getStorageModalWindow(moduleId)?.querySelector('.storage-modal-body');
  if (!body) return;
  body.innerHTML = `
    <div class="module-confirm-wrap">
      <div class="module-confirm-title">⊘ Sell this ${getModuleLabel(module).toLowerCase()}?</div>
      <div class="module-confirm-value">You will recover:<br><span style="color:#6fff9a;font-weight:bold;">$${fmt(refundCoins)}</span></div>
      <div class="module-confirm-actions">
        <button class="btn danger module-confirm-btn" onclick="sellStorageFacility(${moduleId},${refundCoins})">⊘ CONFIRM SELL</button>
        <button class="btn module-confirm-btn" onclick="renderStorageModal(${moduleId})">CANCEL</button>
      </div>
    </div>`;
};

window.sellStorageFacility = function(moduleId, refundCoins) {
  const module = getModuleById(moduleId);
  if (!module) return;
  if (!addCoins(refundCoins)) return;
  if (isPoweredBuildingModule(module) || isPowerStationModule(module)) {
    for (const ship of state.ships) {
      if ((ship.depotType === 'storage' || ship.depotType === 'power_station' || ship.depotType === 'research_lab') && ship.depotId === moduleId) {
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
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
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

state.modules = (state.modules || []).map((module, index) => normalizeModule(module, index + 1));
window.syncBuildingCraftTimers();
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
