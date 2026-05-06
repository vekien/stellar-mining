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
  isPowerStationModule,
  isPowerPoleModule,
  getModuleInventoryTotal,
  getPowerFuelOptions,
  formatPowerFuelRate,
  getPowerNetworkState,
  getPowerModuleNetworkInfo,
  POWER_RESOURCE_CONSUMPTION,
  getPowerFuelOutput,
  hasPowerStationFuel,
  getNoFuelNetworkIds,
} from '../data/modules.js';
import { getStoragePowerUsage, isStorageOperational } from '../data/storage.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { gridToWorld } from '../render/camera.js';
import { BASE_COL, BASE_ROW, GRID_COLS, GRID_ROWS, TILE_W, TILE_H } from '../constants.js';

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
  const moduleDef = getCraft('modules', module.type || STORAGE_FACILITY_ID);
  const tier = Math.max(1, module.level || 1);
  return {
    coins: (moduleDef?.cost || 0) * tier,
    reqs: Object.fromEntries(Object.entries(moduleDef?.reqs || {}).map(([r, n]) => [r, n * tier])),
  };
}

function getModuleInvestedCoins(module) {
  const moduleDef = getCraft('modules', module.type || STORAGE_FACILITY_ID);
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
    if (cell.col === BASE_COL && cell.row === BASE_ROW) {
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

function completeCraftModule(moduleType) {
  const timer = state.moduleCraftTimers?.[moduleType];
  if (!timer) return;
  delete state.moduleCraftTimers[moduleType];
  if (!Array.isArray(state.unplacedModuleQueue)) state.unplacedModuleQueue = [];
  state.unplacedModuleQueue.push(moduleType);
  state.unplacedModules = state.unplacedModuleQueue.length;
  const moduleDef = getCraft('modules', moduleType);
  addLog(`✅ ${moduleDef?.name || 'Module'} ready to place.`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
}

function scheduleModuleCraftCompletion(moduleType, endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.moduleCraftTimers?.[moduleType];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftModule(moduleType);
    else scheduleModuleCraftCompletion(moduleType, timer.endsAt);
  }, wait + 5);
}

export function openModuleModal(moduleId) {
  state.selectedModule = moduleId;
  renderModuleModal();
  document.getElementById('storage-modal-overlay').style.display = 'flex';
}

export function openStorageModal(moduleId) {
  openModuleModal(moduleId);
}

export function closeStorageModal(e) {
  if (e && e.target !== document.getElementById('storage-modal-overlay')) return;
  document.getElementById('storage-modal-overlay').style.display = 'none';
  state.selectedModule = null;
}

function renderStatRows(rows) {
  return rows.map(([label, value]) => `<tr><td style="color:#4a7aaa;padding:4px 0;">${label}</td><td style="color:#cde;font-weight:bold;text-align:right;">${value}</td></tr>`).join('');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setTextIfChanged(id, text) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el.textContent !== text) el.textContent = text;
  return el;
}

function setHtmlIfChanged(id, html) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (el.innerHTML !== html) el.innerHTML = html;
  return el;
}

export function renderModuleModal() {
  const module = getModuleById(state.selectedModule);
  const body = document.getElementById('storage-modal-body');
  const title = document.getElementById('storage-modal-title');
  if (!module || !body) return;
  const moduleDef = getModuleDef(module.type);
  const buyPowerCost = isStorageModule(module) ? getModuleUpgradeCost(module).coins * 5 : 0;
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  if (title) title.textContent = moduleDef.panelTitle;
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding:10px 10px 9px;border:1px solid #2a5090;border-radius:6px;background:linear-gradient(180deg, rgba(10,30,70,0.55) 0%, rgba(6,16,48,0.5) 100%);box-shadow: inset 0 0 16px rgba(60,150,255,0.1);margin-bottom:8px;">
      <div style="display:flex;flex-direction:row;flex-wrap:nowrap;align-content:space-around;justify-content:space-between;width:100%;align-items:center;">
      <div style="padding:6px 8px;">
        <span id="storage-modal-name" style="font-family:'Orbitron', sans-serif;font-size:19px;font-weight:900;letter-spacing:2.5px;color:#8fd2ff;text-shadow:0 0 10px rgba(90,190,255,0.25);text-transform:uppercase;line-height:1.1;margin:0;"></span>
        <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" style="background:none;border:none;color:#6ad;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 4px;opacity:0.9;vertical-align:middle;">✎</button>
      </div>
      <div style="padding:6px 8px;">
        <div id="storage-tier-pill" style="font-size:19px;font-family:'Orbitron',sans-serif;font-weight:700;letter-spacing:2px;padding:2px 10px;border-radius:4px;"></div>
      </div>
      </div>
    </div>
    <div style="padding:8px 10px;border:1px solid #2a6040;border-radius:6px;background:rgba(12,45,26,0.16);margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:18px;color:#cde;">HEALTH</span><span id="storage-health-value" style="font-size:17px;padding:2px 8px;line-height:1.2;font-weight:bold;"></span></div>
      <div style="height:5px;background:#0a1530;border-radius:3px;overflow:hidden;margin-bottom:6px;">
        <div id="storage-health-bar" style="height:100%;border-radius:3px;transition:width 0.4s;"></div>
      </div>
    </div>
    ${isStorageModule(module) ? `
    <div style="border-top:1px solid #1a3a6e;margin:8px 0;padding-top:8px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ POWER</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:13px;color:#5a8ab0;"><span style="cursor:help;" onmouseover="showHintTooltip(event, 'Power usage scales with stored cargo: 1/s at empty, up to 10/s at full capacity.');" onmouseout="hideTooltip()">Power Usage</span><span id="storage-power-usage" style="color:#cde;font-weight:bold;"></span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0 6px;font-size:13px;color:#5a8ab0;"><span>Power Capacity</span><span id="storage-power-value" style="color:#48f;font-weight:bold;"></span></div>
      <div style="background:#0a1428;border-radius:3px;height:5px;margin-bottom:8px;overflow:hidden;"><div id="storage-power-bar" style="height:100%;background:linear-gradient(90deg,#1a6aff,#48f);transition:width 0.3s;"></div></div>
      <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO POWER</div>
      <button id="storage-buy-power-btn" class="btn primary" style="width:100%;font-size:12px;margin-top:8px;display:none;" onclick="buyStoragePower(${module.id})">BUY POWER <span style="color:#ffe066;">- $${fmt(buyPowerCost)}</span></button>
    </div>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin:10px 0 6px;">◈ STORAGE</div>
    <div style="padding:8px 10px;border:1px solid #2a4a7a;border-radius:6px;background:rgba(10,20,50,0.28);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:16px;color:#cde;">STORAGE USED</span><span id="storage-used-value" style="font-size:17px;color:#ffe066;font-weight:bold;"></span></div>
      <div style="height:5px;background:#0a1530;border-radius:3px;overflow:hidden;"><div id="storage-used-bar" style="height:100%;background:linear-gradient(90deg,#caa020,#ffe066);border-radius:3px;transition:width 0.4s;"></div></div>
    </div>
    ` : ''}
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px;">
      ${renderStatRows(moduleDef.summary(module))}
    </table>
    ${isStorageModule(module) ? `
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ INVENTORY</div>
    <div id="storage-inventory-list" style="background:rgba(10,20,50,0.35);border:1px solid #1a3a6e;border-radius:4px;padding:8px;max-height:180px;overflow-y:auto;"></div>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin:10px 0 6px;">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : (isPowerStationModule(module) || isPowerPoleModule(module)) ? `
    ${(isPowerStationModule(module) || isPowerPoleModule(module)) ? `
    <div id="power-station-no-fuel-warning" class="storage-no-power-warning" style="display:none;margin-bottom:8px;">WARNING: NO FUEL</div>
    ` : ''}
    ${isPowerStationModule(module) ? `
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ FUEL</div>
    <div class="power-station-panel">
      <div class="power-station-row">
        <span class="power-station-label">Power Source</span>
        <select id="power-station-fuel-select" class="power-station-select" onchange="setPowerStationFuel(${module.id}, this.value)"></select>
      </div>
      <div id="power-station-fuel-rate" class="power-station-subtle"></div>
      <div id="power-station-fuel-cost" class="power-station-cost"></div>
      <div class="power-station-row power-station-fuel-row"><span class="power-station-value-label">STORED FUEL</span><span id="power-station-used-value" class="power-station-value"></span></div>
      <div class="power-station-bar"><div id="power-station-used-bar" class="power-station-bar-fill"></div></div>
    </div>
    ` : ''}
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    <div id="storage-inventory-list" style="background:rgba(10,20,50,0.35);border:1px solid #1a3a6e;border-radius:4px;padding:8px;max-height:180px;overflow-y:auto;"></div>
    ` : ''}
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin:10px 0 6px;">◈ UPGRADE</div>
    <div id="storage-upgrade-reqs" class="bp-craft-reqs" style="margin-bottom:8px;"></div>
    ${(isPowerPoleModule(module) || isPowerStationModule(module) || isStorageModule(module))
      ? `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
          <button id="storage-upgrade-btn" class="btn primary" style="width:100%;font-size:11px;" onclick="upgradeStorageFacility(${module.id})">UPGRADE</button>
          <button class="btn" style="width:100%;font-size:11px;background:rgba(20,50,80,0.6);border-color:#2a6a8a;color:#8ab;" onclick="startMoveStorage(${module.id})">MOVE</button>
          <button class="btn" style="width:100%;font-size:11px;background:rgba(20,30,60,0.6);border-color:#2a4a7a;color:#8ab;" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
          <button class="btn danger" style="width:100%;font-size:11px;" onclick="confirmSellStorage(${module.id})">SELL</button>
        </div>`
      : `<button id="storage-upgrade-btn" class="btn primary" style="width:100%;font-size:12px;margin-bottom:6px;" onclick="upgradeStorageFacility(${module.id})"></button>
        <button class="btn" style="width:100%;font-size:12px;margin-bottom:6px;background:rgba(20,50,80,0.6);border-color:#2a6a8a;color:#8ab;" onclick="startMoveStorage(${module.id})">↔ MOVE ${moduleDef.name.toUpperCase()}</button>
        <button class="btn" style="width:100%;font-size:12px;margin-bottom:6px;background:rgba(20,30,60,0.6);border-color:#2a4a7a;color:#8ab;" onclick="openStorageRenameOverlay(${module.id})">✎ RENAME ${moduleDef.name.toUpperCase()}</button>
        <button class="btn danger" style="width:100%;font-size:12px;" onclick="confirmSellStorage(${module.id})">⊘ SELL ${moduleDef.name.toUpperCase()}</button>`}
  `;
  patchModuleModal();
}

export function renderStorageModal() {
  renderModuleModal();
}

export function patchModuleModal() {
  const module = getModuleById(state.selectedModule);
  const title = document.getElementById('storage-modal-title');
  if (!module || !title) return;
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  title.textContent = moduleDef.panelTitle;
  document.getElementById('storage-modal-name').textContent = `⬡ ${module.name}`;
  document.getElementById('storage-tier-pill').textContent = `TIER ${toRoman(moduleTier)}`;
  document.getElementById('storage-tier-pill').style.color = isLightColor(tierColor) ? '#111' : '#fff';
  document.getElementById('storage-tier-pill').style.background = tierColor;
  document.getElementById('storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  document.getElementById('storage-health-value').style.color = hpColor;
  document.getElementById('storage-health-bar').style.width = `${hpPct}%`;
  document.getElementById('storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const canUpgrade = !atMaxTier && state.coins >= upgradeCost.coins && Object.entries(upgradeCost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  setHtmlIfChanged('storage-upgrade-reqs', `<span class="bp-craft-req ${state.coins >= upgradeCost.coins ? 'met' : 'unmet'}">$${fmt(upgradeCost.coins)}</span>${Object.entries(upgradeCost.reqs).map(([r, n]) => `<span class="bp-craft-req ${(state.resources[r] || 0) >= n ? 'met' : 'unmet'}">${RESOURCE_DEFS[r].label}: ${n}</span>`).join('')}`);
  const upBtn = document.getElementById('storage-upgrade-btn');
  upBtn.textContent = atMaxTier ? '★ MAX TIER' : (isPowerPoleModule(module) || isPowerStationModule(module) || isStorageModule(module)) ? 'UPGRADE' : `⬆ UPGRADE ${moduleDef.name.toUpperCase()}`;
  upBtn.disabled = !canUpgrade || (isStorageModule(module) && (module.power || 0) <= 0);

  const invRows = Object.entries(module.inventory || {})
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amt]) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(26,58,110,0.35);"><span style="color:${RESOURCE_DEFS[type].color}">${RESOURCE_DEFS[type].label}</span><span style="color:#ffe066">${fmt(amt)}</span></div>`)
    .join('');

  if (isStorageModule(module)) {
    const buyPowerCost = upgradeCost.coins * 5;
    const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
    const currentPowerUsage = getStoragePowerUsage(module);
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    setTextIfChanged('storage-used-value', `${fmt(getStorageTotalInventory(module))} / ${fmt(module.storageCapacity)}`);
    document.getElementById('storage-used-bar').style.width = `${Math.max(0, Math.min(100, (getStorageTotalInventory(module) / Math.max(1, module.storageCapacity)) * 100))}%`;
    setTextIfChanged('storage-power-usage', `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`);
    setTextIfChanged('storage-power-value', `${fmt(module.power || 0)} / ${fmt(module.powerCapacity)}`);
    document.getElementById('storage-power-bar').style.width = `${powerPct}%`;
    const noPower = (module.power || 0) <= 0;
    document.getElementById('storage-no-power-warning').style.display = noPower ? '' : 'none';
    const buyPowerBtn = document.getElementById('storage-buy-power-btn');
    buyPowerBtn.style.display = noPower ? '' : 'none';
    buyPowerBtn.disabled = state.coins < buyPowerCost;
    document.getElementById('storage-inventory-list').innerHTML = invRows || '<div style="font-size:12px;color:#4a6a8a;">No stored resources yet.</div>';
    const summaryEl = document.getElementById('power-station-link-summary');
    if (summaryEl && summaryEl.dataset.networkSig !== networkSig) {
      const tooltipLines = [
        ...linkedStations.map((station) => `POWER STATION: ${escapeHtml(station.name)}`),
        ...linkedPoles.map((pole) => `POLE: ${escapeHtml(pole.name)}`),
        ...linkedStorages.map((storage) => `STORAGE: ${escapeHtml(storage.name)}`),
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Storage Facilities` : '',
      ].filter(Boolean);
      const tooltipText = tooltipLines.length ? tooltipLines.join('<br>') : 'No linked modules.';
      summaryEl.dataset.networkSig = networkSig;
      summaryEl.textContent = summaryParts.join(' • ') || 'No linked modules';
      summaryEl.onmouseover = (event) => showHintTooltip(event, tooltipText);
      summaryEl.onmouseout = () => hideTooltip();
    }
  } else if (isPowerStationModule(module) || isPowerPoleModule(module)) {
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const noFuelIds = getNoFuelNetworkIds(state.modules);
    const noFuelWarning = document.getElementById('power-station-no-fuel-warning');
    const fuelCost = POWER_RESOURCE_CONSUMPTION * linkedStorages.length;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    if (isPowerStationModule(module)) {
      const fuelSelect = document.getElementById('power-station-fuel-select');
      if (fuelSelect) {
        const optionsHtml = getPowerFuelOptions().map((option) => `<option value="${option.type}" ${module.fuelResource === option.type ? 'selected' : ''}>${option.label}</option>`).join('');
        if (fuelSelect.innerHTML !== optionsHtml) fuelSelect.innerHTML = optionsHtml;
      }
      const fuelType = module.fuelResource || 'iron';
      const fuelName = RESOURCE_DEFS[fuelType].label;
      const powerOutput = getPowerFuelOutput(fuelType);
      const noFuel = !hasPowerStationFuel(module);
      const perStorageText = `Per storage: ${POWER_RESOURCE_CONSUMPTION} ${fuelName} -> +${powerOutput} power/second`;
      const networkLoadText = linkedStorages.length > 0
        ? `Current load: ${linkedStorages.length} storages -> ${fuelCost} ${fuelName} consumed each second`
        : 'Current load: no connected storage facilities';
      setTextIfChanged('power-station-fuel-rate', perStorageText);
      setTextIfChanged('power-station-fuel-cost', networkLoadText);
      setTextIfChanged('power-station-used-value', `${fmt(getModuleInventoryTotal(module))} / ${fmt(module.resourceCapacity || 0)}`);
      document.getElementById('power-station-used-bar').style.width = `${Math.max(0, Math.min(100, (getModuleInventoryTotal(module) / Math.max(1, module.resourceCapacity || 1)) * 100))}%`;
      if (noFuelWarning) noFuelWarning.style.display = noFuel ? '' : 'none';
    } else if (isPowerPoleModule(module)) {
      if (noFuelWarning) noFuelWarning.style.display = noFuelIds.has(module.id) ? '' : 'none';
    }
    const summaryEl = document.getElementById('power-station-link-summary');
    if (summaryEl && summaryEl.dataset.networkSig !== networkSig) {
      const tooltipLines = [
        ...linkedStations.map((station) => `POWER STATION: ${escapeHtml(station.name)}`),
        ...linkedPoles.map((pole) => `POLE: ${escapeHtml(pole.name)}`),
        ...linkedStorages.map((storage) => `STORAGE: ${escapeHtml(storage.name)}`),
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Storage Facilities` : '',
      ].filter(Boolean);
      const tooltipText = tooltipLines.length ? tooltipLines.join('<br>') : 'No linked modules.';
      summaryEl.dataset.networkSig = networkSig;
      summaryEl.textContent = summaryParts.join(' • ') || 'No linked modules';
      summaryEl.onmouseover = (event) => showHintTooltip(event, tooltipText);
      summaryEl.onmouseout = () => hideTooltip();
    }
    setHtmlIfChanged('storage-inventory-list', invRows || '<div style="font-size:12px;color:#4a6a8a;">No stored fuel yet.</div>');
  }
}

export function patchStorageModal() {
  patchModuleModal();
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
  if (isStorageModule(module) && (module.power || 0) <= 0) return;
  spendCoins(cost.coins);
  for (const [r, n] of Object.entries(cost.reqs)) state.resources[r] -= n;
  module.level++;
  const nextStats = getModuleStats(module.type, module.level);
  const prevMaxHealth = module.maxHealth;
  module.maxHealth = nextStats.maxHealth;
  module.health = Math.min(module.health + (module.maxHealth - prevMaxHealth), module.maxHealth);
  Object.assign(module, nextStats);
  if (isStorageModule(module)) module.power = Math.min(module.power, module.powerCapacity);
  addLog(`${module.name} upgraded to Tier ${module.level}.`);
  if (refresh.ui) refresh.ui();
  patchModuleModal();
};

window.buyStoragePower = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || !isStorageModule(module)) return;
  const cost = getModuleUpgradeCost(module).coins * 5;
  if (state.coins < cost) return;
  spendCoins(cost);
  module.power = module.powerCapacity;
  addLog(`${module.name} restored to full power for ${fmt(cost)}¢.`);
  if (refresh.ui) refresh.ui();
  patchModuleModal();
};

window.startMoveStorage = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  state.movingModule = moduleId;
  state.selectedModule = null;
  state.placingModule = true;
  state.placingModuleType = module.type || STORAGE_FACILITY_ID;
  document.getElementById('storage-modal-overlay').style.display = 'none';
  addLog(`↔ Click a valid ${getModuleFootprintLabel(module)} area to move ${module.name}. Press Esc to cancel.`);
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.confirmSellStorage = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  const refundCoins = getModuleInvestedCoins(module);
  const body = document.getElementById('storage-modal-body');
  if (!body) return;
  body.innerHTML = `
    <div style="text-align:center;padding:12px 0;">
      <div style="font-size:14px;color:#cde;margin-bottom:8px;">⊘ Sell this ${getModuleLabel(module).toLowerCase()}?</div>
      <div style="font-size:12px;color:#8ab;margin-bottom:16px;">You will recover:<br><span style="color:#6fff9a;font-weight:bold;">$${fmt(refundCoins)}</span></div>
      <div style="display:flex;gap:8px;">
        <button class="btn danger" style="flex:1;" onclick="sellStorageFacility(${moduleId},${refundCoins})">⊘ CONFIRM SELL</button>
        <button class="btn" style="flex:1;" onclick="renderStorageModal()">CANCEL</button>
      </div>
    </div>`;
};

window.sellStorageFacility = function(moduleId, refundCoins) {
  const module = getModuleById(moduleId);
  if (!module) return;
  if (!addCoins(refundCoins)) return;
  if (isStorageModule(module) || isPowerStationModule(module)) {
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
    }
  }
  state.modules = state.modules.filter(entry => entry.id !== moduleId);
  document.getElementById('storage-modal-overlay').style.display = 'none';
  state.selectedModule = null;
  addLog(`${module.name} sold — recovered ${fmt(refundCoins)}¢.`);
  if (refresh.ui) refresh.ui();
};

window.setPowerStationFuel = function(moduleId, fuelResource) {
  const module = getModuleById(moduleId);
  if (!module || !isPowerStationModule(module)) return;
  module.fuelResource = fuelResource;
  patchModuleModal();
};

window.startCraftModule = function(moduleType = STORAGE_FACILITY_ID) {
  const moduleDef = getCraft('modules', moduleType);
  const moduleConfig = getModuleDef(moduleType);
  if (!moduleDef) return;
  if (!state.researchUnlocks[moduleConfig.unlockId]) return;
  if (state.moduleCraftTimers?.[moduleType] && Date.now() < state.moduleCraftTimers[moduleType].endsAt) return;
  if (state.coins < moduleDef.cost) return;
  for (const [r, n] of Object.entries(moduleDef.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(moduleDef.cost);
  for (const [r, n] of Object.entries(moduleDef.reqs)) state.resources[r] -= n;
  const durationMs = getModuleCraftTimeMs(moduleType);
  const now = Date.now();
  if (!state.moduleCraftTimers) state.moduleCraftTimers = {};
  state.moduleCraftTimers[moduleType] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: ${moduleDef.name} (${Math.ceil(durationMs / 1000)}s)`);
  scheduleModuleCraftCompletion(moduleType, now + durationMs);
  if (refresh.ui) refresh.ui();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
};

window.beginPlacingStorage = function(moduleType = STORAGE_FACILITY_ID) {
  const queue = Array.isArray(state.unplacedModuleQueue) ? state.unplacedModuleQueue : [];
  if (!queue.includes(moduleType) && !state.movingModule) return;
  state.placingModule = true;
  state.placingModuleType = moduleType;
  if (window.dismissHdrModal) window.dismissHdrModal();
  if (window.dismissBasePanel) window.dismissBasePanel();
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.syncStorageCraftTimers = function() {
  if (!state.moduleCraftTimers) return;
  for (const [moduleType, timer] of Object.entries(state.moduleCraftTimers)) {
    if (!timer?.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftModule(moduleType);
    else scheduleModuleCraftCompletion(moduleType, timer.endsAt);
  }
};

state.modules = (state.modules || []).map((module, index) => normalizeModule(module, index + 1));
window.syncStorageCraftTimers();
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
