// ============================================================
// STORAGE UI — craft timers, placement, and modal
// ============================================================
import { state, makeEmptyResources } from '../state.js';
import { addLog, fmt, spendCoins, addCoins, isLightColor } from '../helpers.js';
import { refresh } from './refresh.js';
import { getCraft } from '../data/crafts.js';
import {
  STORAGE_FACILITY_ID,
  getStorageFacilityStats,
  getStorageFootprintCells,
  storageContainsCell,
  isStorageOperational,
  getStoragePowerUsage,
} from '../data/storage.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { gridToWorld } from '../render/camera.js';
import { BASE_COL, BASE_ROW, GRID_COLS, GRID_ROWS, TILE_H } from '../constants.js';

const STORAGE_CRAFT_TIME_MS = {
  storage_facility: 15000,
};

function getStorageCraftTimeMs(moduleType = STORAGE_FACILITY_ID) {
  return STORAGE_CRAFT_TIME_MS[moduleType] || STORAGE_CRAFT_TIME_MS.storage_facility;
}

function ensureStorageFacilityShape(storage) {
  const stats = getStorageFacilityStats(storage.level || 1);
  storage.name = storage.name || `Storage Facility #${storage.id}`;
  storage.type = storage.type || STORAGE_FACILITY_ID;
  storage.level = Math.max(1, storage.level || 1);
  storage.maxHealth = Math.max(storage.maxHealth || 0, stats.maxHealth);
  storage.health = Math.min(storage.health ?? storage.maxHealth, storage.maxHealth);
  storage.storageCapacity = Math.max(storage.storageCapacity || 0, stats.storageCapacity);
  storage.powerUsage = Number.isFinite(storage.powerUsage) ? storage.powerUsage : stats.powerUsage;
  storage.powerCapacity = Math.max(storage.powerCapacity || 0, stats.powerCapacity);
  storage.power = Math.max(0, Math.min(Number.isFinite(storage.power) ? storage.power : storage.powerCapacity, storage.powerCapacity));
  storage.inventory = { ...makeEmptyResources(), ...(storage.inventory || {}) };
}

export function getStorageUpgradeCost(storage) {
  const moduleDef = getCraft('modules', storage.type || STORAGE_FACILITY_ID);
  const tier = Math.max(1, storage.level || 1);
  return {
    coins: (moduleDef?.cost || 0) * tier,
    reqs: Object.fromEntries(Object.entries(moduleDef?.reqs || {}).map(([r, n]) => [r, n * tier])),
  };
}

function getStorageInvestedCoins(storage) {
  const moduleDef = getCraft('modules', storage.type || STORAGE_FACILITY_ID);
  let total = moduleDef?.cost || 0;
  for (let lvl = 1; lvl < (storage.level || 1); lvl++) total += (moduleDef?.cost || 0) * lvl;
  return total;
}

export function getStorageWorldPos(storage) {
  const w = gridToWorld(storage.col, storage.row);
  return { x: w.x, y: w.y };
}

export function getStorageTotalInventory(storage) {
  return Object.values(storage.inventory || {}).reduce((sum, n) => sum + (n || 0), 0);
}

export function getStorageAtCell(col, row) {
  return state.storageFacilities.find(storage => storageContainsCell(storage, col, row)) || null;
}

export function canPlaceStorageAt(col, row, ignoreId = null) {
  const cells = getStorageFootprintCells(col, row);
  for (const cell of cells) {
    if (cell.col < 0 || cell.col >= GRID_COLS || cell.row < 0 || cell.row >= GRID_ROWS) {
      return { ok: false, reason: '⚠ Storage facility footprint must fit fully inside the map.' };
    }
    if (cell.col === BASE_COL && cell.row === BASE_ROW) {
      return { ok: false, reason: '⚠ Cannot place storage facility on the base.' };
    }
    const onNode = state.nodes.some(n => n.gr[0] === cell.col && n.gr[1] === cell.row && n.minLevel <= state.base.level);
    if (onNode) return { ok: false, reason: '⚠ Cannot place storage facility on a resource node.' };
    const onTurret = state.turrets.some(t => t.col === cell.col && t.row === cell.row);
    if (onTurret) return { ok: false, reason: '⚠ Cannot place storage facility on a turret tile.' };
    const onStorage = state.storageFacilities.some(s => s.id !== ignoreId && storageContainsCell(s, cell.col, cell.row));
    if (onStorage) return { ok: false, reason: '⚠ Storage facilities cannot overlap.' };
  }
  return { ok: true, reason: '' };
}

function completeCraftStorage(moduleType) {
  const timer = state.storageCraftTimers?.[moduleType];
  if (!timer) return;
  delete state.storageCraftTimers[moduleType];
  if (!Array.isArray(state.unplacedStorageQueue)) state.unplacedStorageQueue = [];
  state.unplacedStorageQueue.push(moduleType);
  state.unplacedStorages = state.unplacedStorageQueue.length;
  const moduleDef = getCraft('modules', moduleType);
  addLog(`✅ ${moduleDef?.name || 'Storage Facility'} ready to place.`);
  if (refresh.ui) refresh.ui();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
}

function scheduleStorageCraftCompletion(moduleType, endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.storageCraftTimers?.[moduleType];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftStorage(moduleType);
    else scheduleStorageCraftCompletion(moduleType, timer.endsAt);
  }, wait + 5);
}

export function openStorageModal(storageId) {
  state.selectedStorage = storageId;
  renderStorageModal();
  document.getElementById('storage-modal-overlay').style.display = 'flex';
}

export function closeStorageModal(e) {
  if (e && e.target !== document.getElementById('storage-modal-overlay')) return;
  document.getElementById('storage-modal-overlay').style.display = 'none';
  state.selectedStorage = null;
}

export function renderStorageModal() {
  const storage = state.storageFacilities.find(s => s.id === state.selectedStorage);
  const body = document.getElementById('storage-modal-body');
  const title = document.getElementById('storage-modal-title');
  if (!storage || !body) return;
  const buyPowerCost = getStorageUpgradeCost(storage).coins * 5;
  const storageTier = Math.max(1, Math.min(10, storage.level || 1));
  const tierColor = MINE_TIERS[storageTier]?.color || '#8ab';
  if (title) title.textContent = 'STORAGE FACILITY';
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding:10px 10px 9px;border:1px solid #2a5090;border-radius:6px;background:linear-gradient(180deg, rgba(10,30,70,0.55) 0%, rgba(6,16,48,0.5) 100%);box-shadow: inset 0 0 16px rgba(60,150,255,0.1);margin-bottom:8px;">
      <div style="display:flex;flex-direction:row;flex-wrap:nowrap;align-content:space-around;justify-content:space-between;width:100%;align-items:center;">
      <div style="padding:6px 8px;">
        <span id="storage-modal-name" style="font-family:'Orbitron', sans-serif;font-size:19px;font-weight:900;letter-spacing:2.5px;color:#8fd2ff;text-shadow:0 0 10px rgba(90,190,255,0.25);text-transform:uppercase;line-height:1.1;margin:0;"></span>
        <button onclick="openStorageRenameOverlay(${storage.id})" title="Rename Storage" style="background:none;border:none;color:#6ad;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 4px;opacity:0.9;vertical-align:middle;">✎</button>
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
    <div style="border-top:1px solid #1a3a6e;margin:8px 0;padding-top:8px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ POWER</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:13px;color:#5a8ab0;"><span>Power Usage</span><span id="storage-power-usage" style="color:#cde;font-weight:bold;"></span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0 6px;font-size:13px;color:#5a8ab0;"><span>Power Capacity</span><span id="storage-power-value" style="color:#48f;font-weight:bold;"></span></div>
      <div style="background:#0a1428;border-radius:3px;height:5px;margin-bottom:8px;overflow:hidden;"><div id="storage-power-bar" style="height:100%;background:linear-gradient(90deg,#1a6aff,#48f);transition:width 0.3s;"></div></div>
      <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO POWER</div>
      <button id="storage-buy-power-btn" class="btn primary" style="width:100%;font-size:12px;margin-top:8px;display:none;" onclick="buyStoragePower(${storage.id})">BUY POWER <span style="color:#ffe066;">- $${fmt(buyPowerCost)}</span></button>
    </div>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin:10px 0 6px;">◈ STORAGE</div>
    <div style="padding:8px 10px;border:1px solid #2a4a7a;border-radius:6px;background:rgba(10,20,50,0.28);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><span style="font-size:16px;color:#cde;">STORAGE USED</span><span id="storage-used-value" style="font-size:17px;color:#ffe066;font-weight:bold;"></span></div>
      <div style="height:5px;background:#0a1530;border-radius:3px;overflow:hidden;"><div id="storage-used-bar" style="height:100%;background:linear-gradient(90deg,#caa020,#ffe066);border-radius:3px;transition:width 0.4s;"></div></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px;">
      <tr><td style="color:#4a7aaa;padding:4px 0;">Storage Capacity</td><td id="storage-capacity-value" style="color:#cde;font-weight:bold;text-align:right;"></td></tr>
      <tr><td style="color:#4a7aaa;padding:4px 0;">Footprint</td><td style="color:#cde;font-weight:bold;text-align:right;">3x3</td></tr>
      <tr><td style="color:#4a7aaa;padding:4px 0;">Operational</td><td id="storage-operational-value" style="font-weight:bold;text-align:right;"></td></tr>
    </table>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ INVENTORY</div>
    <div id="storage-inventory-list" style="background:rgba(10,20,50,0.35);border:1px solid #1a3a6e;border-radius:4px;padding:8px;max-height:180px;overflow-y:auto;"></div>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin:10px 0 6px;">◈ UPGRADE</div>
    <div id="storage-upgrade-reqs" class="bp-craft-reqs" style="margin-bottom:8px;"></div>
    <button id="storage-upgrade-btn" class="btn primary" style="width:100%;font-size:12px;margin-bottom:6px;" onclick="upgradeStorageFacility(${storage.id})"></button>
    <button class="btn" style="width:100%;font-size:12px;margin-bottom:6px;background:rgba(20,50,80,0.6);border-color:#2a6a8a;color:#8ab;" onclick="startMoveStorage(${storage.id})">↔ MOVE STORAGE</button>
    <button class="btn" style="width:100%;font-size:12px;margin-bottom:6px;background:rgba(20,30,60,0.6);border-color:#2a4a7a;color:#8ab;" onclick="openStorageRenameOverlay(${storage.id})">✎ RENAME STORAGE</button>
    <button class="btn danger" style="width:100%;font-size:12px;" onclick="confirmSellStorage(${storage.id})">⊘ SELL STORAGE</button>
  `;
  patchStorageModal();
}

export function patchStorageModal() {
  const storage = state.storageFacilities.find(s => s.id === state.selectedStorage);
  const title = document.getElementById('storage-modal-title');
  if (!storage || !title) return;
  const hpPct = Math.round((storage.health / Math.max(1, storage.maxHealth)) * 100);
  const powerPct = Math.round(((storage.power || 0) / Math.max(1, storage.powerCapacity || 1)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const storageTier = Math.max(1, Math.min(10, storage.level || 1));
  const tierColor = MINE_TIERS[storageTier]?.color || '#8ab';
  const upgradeCost = getStorageUpgradeCost(storage);
  const buyPowerCost = upgradeCost.coins * 5;
  const atMaxTier = storage.level >= 10;
  const canUpgrade = !atMaxTier && (storage.power || 0) > 0 && state.coins >= upgradeCost.coins && Object.entries(upgradeCost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  const invRows = Object.entries(storage.inventory || {})
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amt]) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(26,58,110,0.35);"><span style="color:${RESOURCE_DEFS[type].color}">${RESOURCE_DEFS[type].label}</span><span style="color:#ffe066">${fmt(amt)}</span></div>`)
    .join('');
  title.textContent = 'STORAGE FACILITY';
  document.getElementById('storage-modal-name').textContent = `⬡ ${storage.name}`;
  document.getElementById('storage-tier-pill').textContent = `TIER ${toRoman(storageTier)}`;
  document.getElementById('storage-tier-pill').style.color = isLightColor(tierColor) ? '#111' : '#fff';
  document.getElementById('storage-tier-pill').style.background = tierColor;
  document.getElementById('storage-health-value').textContent = `${fmt(storage.health)} / ${fmt(storage.maxHealth)}`;
  document.getElementById('storage-health-value').style.color = hpColor;
  document.getElementById('storage-used-value').textContent = `${fmt(getStorageTotalInventory(storage))} / ${fmt(storage.storageCapacity)}`;
  document.getElementById('storage-health-bar').style.width = `${hpPct}%`;
  document.getElementById('storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';
  document.getElementById('storage-used-bar').style.width = `${Math.max(0, Math.min(100, (getStorageTotalInventory(storage) / Math.max(1, storage.storageCapacity)) * 100))}%`;
  const currentPowerUsage = getStoragePowerUsage(storage);
  document.getElementById('storage-power-usage').textContent = `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`;
  document.getElementById('storage-power-value').textContent = `${fmt(storage.power || 0)} / ${fmt(storage.powerCapacity)}`;
  document.getElementById('storage-power-bar').style.width = `${powerPct}%`;
  const noPower = (storage.power || 0) <= 0;
  document.getElementById('storage-no-power-warning').style.display = noPower ? '' : 'none';
  const buyPowerBtn = document.getElementById('storage-buy-power-btn');
  buyPowerBtn.style.display = noPower ? '' : 'none';
  buyPowerBtn.disabled = state.coins < buyPowerCost;
  document.getElementById('storage-capacity-value').textContent = fmt(storage.storageCapacity);
  const op = document.getElementById('storage-operational-value');
  op.textContent = isStorageOperational(storage) ? 'ONLINE' : '▲ OFFLINE';
  op.style.color = isStorageOperational(storage) ? '#4d8' : '#ff6060';
  document.getElementById('storage-inventory-list').innerHTML = invRows || '<div style="font-size:12px;color:#4a6a8a;">No stored resources yet.</div>';
  document.getElementById('storage-upgrade-reqs').innerHTML = `<span class="bp-craft-req ${state.coins >= upgradeCost.coins ? 'met' : 'unmet'}">$${fmt(upgradeCost.coins)}</span>${Object.entries(upgradeCost.reqs).map(([r, n]) => `<span class="bp-craft-req ${(state.resources[r] || 0) >= n ? 'met' : 'unmet'}">${RESOURCE_DEFS[r].label}: ${n}</span>`).join('')}`;
  const upBtn = document.getElementById('storage-upgrade-btn');
  upBtn.textContent = atMaxTier ? '★ MAX TIER' : '⬆ UPGRADE STORAGE';
  upBtn.disabled = !canUpgrade;
}

export function cancelStoragePlacement() {
  if (!state.placingStorage) return;
  state.placingStorage = false;
  state.placingStorageType = null;
  state.movingStorage = null;
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = '';
  if (refresh.ui) refresh.ui();
}

window.upgradeStorageFacility = function(storageId) {
  const storage = state.storageFacilities.find(s => s.id === storageId);
  if (!storage || storage.level >= 10) return;
  const cost = getStorageUpgradeCost(storage);
  if (state.coins < cost.coins) return;
  for (const [r, n] of Object.entries(cost.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(cost.coins);
  for (const [r, n] of Object.entries(cost.reqs)) state.resources[r] -= n;
  storage.level++;
  const nextStats = getStorageFacilityStats(storage.level);
  const prevMaxHealth = storage.maxHealth;
  storage.maxHealth = nextStats.maxHealth;
  storage.health = Math.min(storage.health + (storage.maxHealth - prevMaxHealth), storage.maxHealth);
  storage.storageCapacity = nextStats.storageCapacity;
  storage.powerUsage = nextStats.powerUsage;
  storage.powerCapacity = nextStats.powerCapacity;
  storage.power = Math.min(storage.power, storage.powerCapacity);
  addLog(`${storage.name} upgraded to Tier ${storage.level}.`);
  if (refresh.ui) refresh.ui();
  patchStorageModal();
};

window.buyStoragePower = function(storageId) {
  const storage = state.storageFacilities.find(s => s.id === storageId);
  if (!storage) return;
  const cost = getStorageUpgradeCost(storage).coins * 5;
  if (state.coins < cost) return;
  spendCoins(cost);
  storage.power = storage.powerCapacity;
  addLog(`${storage.name} restored to full power for ${fmt(cost)}¢.`);
  if (refresh.ui) refresh.ui();
  patchStorageModal();
};

window.startMoveStorage = function(storageId) {
  const storage = state.storageFacilities.find(s => s.id === storageId);
  if (!storage) return;
  state.movingStorage = storageId;
  state.selectedStorage = null;
  state.placingStorage = true;
  state.placingStorageType = storage.type || STORAGE_FACILITY_ID;
  document.getElementById('storage-modal-overlay').style.display = 'none';
  addLog('↔ Click a valid 3x3 area to move the storage facility. Press Esc to cancel.');
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.confirmSellStorage = function(storageId) {
  const storage = state.storageFacilities.find(s => s.id === storageId);
  if (!storage) return;
  const refundCoins = getStorageInvestedCoins(storage);
  const body = document.getElementById('storage-modal-body');
  if (!body) return;
  body.innerHTML = `
    <div style="text-align:center;padding:12px 0;">
      <div style="font-size:14px;color:#cde;margin-bottom:8px;">⊘ Sell this storage facility?</div>
      <div style="font-size:12px;color:#8ab;margin-bottom:16px;">You will recover:<br><span style="color:#6fff9a;font-weight:bold;">$${fmt(refundCoins)}</span></div>
      <div style="display:flex;gap:8px;">
        <button class="btn danger" style="flex:1;" onclick="sellStorageFacility(${storageId},${refundCoins})">⊘ CONFIRM SELL</button>
        <button class="btn" style="flex:1;" onclick="renderStorageModal()">CANCEL</button>
      </div>
    </div>`;
};

window.sellStorageFacility = function(storageId, refundCoins) {
  const storage = state.storageFacilities.find(s => s.id === storageId);
  if (!storage) return;
  if (!addCoins(refundCoins)) return;
  for (const ship of state.ships) {
    if (ship.depotType === 'storage' && ship.depotId === storageId) {
      ship.depotType = 'base';
      ship.depotId = null;
      if (ship.status === 'returning' && ship.cargo > 0) {
        const base = gridToWorld(BASE_COL, BASE_ROW);
        ship.destX = base.x;
        ship.destY = base.y + TILE_H / 2 - 20;
      }
    }
  }
  state.storageFacilities = state.storageFacilities.filter(s => s.id !== storageId);
  document.getElementById('storage-modal-overlay').style.display = 'none';
  state.selectedStorage = null;
  addLog(`${storage.name} sold — recovered ${fmt(refundCoins)}¢.`);
  if (refresh.ui) refresh.ui();
};

window.startCraftModule = function(moduleType = STORAGE_FACILITY_ID) {
  const moduleDef = getCraft('modules', moduleType);
  if (!moduleDef) return;
  if (!state.researchUnlocks.storage_facilities) return;
  if (state.storageCraftTimers?.[moduleType] && Date.now() < state.storageCraftTimers[moduleType].endsAt) return;
  if (state.coins < moduleDef.cost) return;
  for (const [r, n] of Object.entries(moduleDef.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(moduleDef.cost);
  for (const [r, n] of Object.entries(moduleDef.reqs)) state.resources[r] -= n;
  const durationMs = getStorageCraftTimeMs(moduleType);
  const now = Date.now();
  if (!state.storageCraftTimers) state.storageCraftTimers = {};
  state.storageCraftTimers[moduleType] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: ${moduleDef.name} (${Math.ceil(durationMs / 1000)}s)`);
  scheduleStorageCraftCompletion(moduleType, now + durationMs);
  if (refresh.ui) refresh.ui();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
};

window.beginPlacingStorage = function(moduleType = STORAGE_FACILITY_ID) {
  const queue = Array.isArray(state.unplacedStorageQueue) ? state.unplacedStorageQueue : [];
  if (!queue.includes(moduleType) && !state.movingStorage) return;
  state.placingStorage = true;
  state.placingStorageType = moduleType;
  if (window.dismissHdrModal) window.dismissHdrModal();
  if (window.dismissBasePanel) window.dismissBasePanel();
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.syncStorageCraftTimers = function() {
  if (!state.storageCraftTimers) return;
  for (const [moduleType, timer] of Object.entries(state.storageCraftTimers)) {
    if (!timer?.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftStorage(moduleType);
    else scheduleStorageCraftCompletion(moduleType, timer.endsAt);
  }
};

for (const storage of state.storageFacilities) ensureStorageFacilityShape(storage);
window.syncStorageCraftTimers();
window.openStorageModal = openStorageModal;
window.closeStorageModal = closeStorageModal;
window.renderStorageModal = renderStorageModal;
window.patchStorageModal = patchStorageModal;
window.cancelStoragePlacement = cancelStoragePlacement;
