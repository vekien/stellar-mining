// ============================================================
// HEADER PANELS — SOL overview, research, market, fleet, codex
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFTS, CRAFT_SHIPS as CRAFT_RECIPES, getCraft } from '../data/crafts.js';
import {
  SHIP_DEFS, SHIP_TIER_COSTS, toRoman,
  formatFlySpeed, formatMineSpeedPercent, formatLoadSpeed, formatAtkRatePercent,
  profileMax,
  CARGO_PROFILE, FLY_SPEED_PROFILE, MINE_SPEED_PROFILE, LOAD_SPEED_PROFILE,
  HP_PROFILE, ATTACK_PROFILE, ATK_RATE_PROFILE,
} from '../data/ships.js';
import { NODE_BANDS, CRASHED_SHIP_NODE_TYPE } from '../data/nodes.js';
import { BASE_MAX_SHIPS, BASE_UPGRADE_COSTS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { RESEARCH_TREE, getRepeatableCount, getRepeatableMax, getResearchPointCap } from '../data/research.js';
import { TURRET_BASE_STATS } from '../data/turrets.js';
import { MODULE_DEFS, getModuleDef, getModuleStats, getPowerFuelOutput, POWER_DISABLED_RESOURCES, POWER_RESOURCE_CONSUMPTION, STORAGE_FACILITY_ID, DRONE_LAB_ID, isDroneLabModule } from '../data/modules.js';
import { fmt, resourceIconHtml } from '../helpers.js';
import { getSellPrice } from '../systems/market.js';
import { cancelTurretPlacement } from './turretUI.js';
import { cancelStoragePlacement } from './storageUI.js';
import { renderBasePanel } from './basePanel.js';
import { removeReassignTooltip, renderTutPointers } from './tutorial.js';

// Keep craft timer progress bars live while the CRAFT panel is open
setInterval(() => {
  if (window._hdrPanelOpen !== 'craft') return;
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!overlay?.classList.contains('open')) return;
  for (const [recipeId, timer] of Object.entries(state.shipCraftTimers || {})) {
    if (!timer || Date.now() >= timer.endsAt) continue;
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillEl  = document.getElementById(`craft-fill-${recipeId}`);
    const labelEl = document.getElementById(`craft-label-${recipeId}`);
    if (fillEl)  fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
  for (const [turretType, timer] of Object.entries(state.turretCraftTimers || {})) {
    if (!timer || Date.now() >= timer.endsAt) continue;
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillEl  = document.getElementById(`craft-turret-fill-${turretType}`);
    const labelEl = document.getElementById(`craft-turret-label-${turretType}`);
    if (fillEl)  fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
  for (const [moduleType, timer] of Object.entries(state.buildingCraftTimers || {})) {
    if (!timer || Date.now() >= timer.endsAt) continue;
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillEl  = document.getElementById(`craft-building-fill-${moduleType}`);
    const labelEl = document.getElementById(`craft-building-label-${moduleType}`);
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
  for (const [droneKey, timer] of Object.entries(state.droneCraftTimers || {})) {
    if (!timer || Date.now() >= timer.endsAt) continue;
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillEl  = document.getElementById(`craft-drone-fill-${droneKey}`);
    const labelEl = document.getElementById(`craft-drone-label-${droneKey}`);
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
}, 100);

let _hdrPanelOpen = null;
let _codexTab = 'crew';
let _craftTab = 'ships';
let _craftShipRoleTab = 'mining';
let _fleetCompSig = '';
let _fleetSortKey = 'name';
let _fleetSortDir = 1;
let _stockpileMineableKeys = null;
let _selectedTransmissionIndex = 0;

function renderTransmissionsPanel(body) {
  body.innerHTML = `
    <div class="tx-layout">
      <div class="tx-list-card">
        <div class="tx-list-title">RECENT SIGNALS</div>
        <div id="tx-list" class="tx-list"></div>
      </div>
      <div id="tx-detail" class="tx-detail-card"></div>
    </div>`;
  patchTransmissionsPanel();
}

export function patchTransmissionsPanel() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (_hdrPanelOpen !== 'transmissions' || !overlay?.classList.contains('open')) return;
  const history = Array.isArray(state.transmissionHistory) ? state.transmissionHistory.slice(0, 20) : [];
  const listEl = document.getElementById('tx-list');
  const detailEl = document.getElementById('tx-detail');
  if (!listEl || !detailEl) return;
  if (!history.length) {
    listEl.innerHTML = '<div class="tx-empty">No transmissions recorded yet.</div>';
    detailEl.innerHTML = '<div class="tx-empty">No transmission selected.</div>';
    return;
  }
  _selectedTransmissionIndex = Math.max(0, Math.min(_selectedTransmissionIndex, history.length - 1));
  const selected = history[_selectedTransmissionIndex];
  listEl.innerHTML = history.map((entry, idx) => `
    <button onclick="selectTransmissionHistory(${idx})" class="tx-item${idx===_selectedTransmissionIndex?' active':''}">
      <div class="tx-item-top">
        <span class="tx-item-name">${entry.npcName || 'Unknown'}</span>
      </div>
      <div class="tx-item-meta">SOL ${entry.sol} - ${entry.solTime || '--:--'} - ${entry.npcRole || ''}</div>
    </button>`).join('');
  detailEl.innerHTML = `
    <div class="tx-detail-head">
      <div>
        <div class="tx-detail-name">${selected.npcName || 'Unknown'}</div>
        <div class="tx-detail-role">${selected.npcRole || ''}</div>
      </div>
      <div class="tx-detail-time">SOL ${selected.sol} · ${selected.solTime || '--:--'}</div>
    </div>
    <div class="transmission-history-body">${selected.text || ''}</div>`;
}

window.selectTransmissionHistory = function(idx) {
  _selectedTransmissionIndex = idx;
  patchTransmissionsPanel();
};

function getResourceAbundanceHint(resourceKey) {
  const firstBand = NODE_BANDS.find((band) => band.types.includes(resourceKey));
  if (!firstBand) return 'Unknown';
  if (firstBand.minLevel <= 4) return 'Abundant';
  if (firstBand.minLevel <= 8) return 'Uncommon';
  return 'Rare';
}

// Expose for research.js (re-opens after purchase)
window.openHdrPanel  = openHdrPanel;
window.patchSolPanel = patchSolPanel;
window.patchTransmissionsPanel = patchTransmissionsPanel;
window._hdrPanelOpen = null;
// Sync module-level var when research.js pokes the global
Object.defineProperty(window, '_hdrPanelOpen', {
  get: () => _hdrPanelOpen,
  set: (v) => { _hdrPanelOpen = v; },
});

export function closeHdrPanel(e) {
  if (e && e.target !== document.getElementById('hdr-modal-overlay')) return;
  document.getElementById('hdr-modal-overlay').classList.remove('open');
  _hdrPanelOpen = null;
}

export function dismissHdrModal() {
  document.getElementById('hdr-modal-overlay').classList.remove('open');
  _hdrPanelOpen = null;
}

export function refreshHdrPanelIfOpen() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!_hdrPanelOpen || !overlay?.classList.contains('open')) return;

  // Avoid re-rendering static or partially-refreshed panels on interval.
  if (_hdrPanelOpen === 'codex') return;
  if (_hdrPanelOpen === 'sol') return;
  if (_hdrPanelOpen === 'command') return;
  if (_hdrPanelOpen === 'craft') return;
  if (_hdrPanelOpen === 'research') return;
  if (_hdrPanelOpen === 'stats') return;
  if (_hdrPanelOpen === 'resources') return;
  if (_hdrPanelOpen === 'market') return;
  if (_hdrPanelOpen === 'transmissions') return;
  if (_hdrPanelOpen === 'fleet') {
    refreshFleetPanelPartial();
    return;
  }

  const current = _hdrPanelOpen;
  _hdrPanelOpen = null;
  openHdrPanel(current);
}

export function patchSolPanel(what) {
  if (_hdrPanelOpen !== 'sol') return;
  if (what === 'sol') {
    const el = document.getElementById('sol-sector-label');
    if (el) el.textContent = `◈ KEPLER-7 SECTOR — SOL ${state.sol}`;
  }
  if (what === 'power') {
    const shipPow   = getFleetShipPower();
    const turretPow = getFleetTurretPower();
    const basePow   = getFleetBasePower();
    const el = document.getElementById('sol-fleet-power');
    const bd = document.getElementById('sol-fleet-breakdown');
    if (el) el.textContent = shipPow + turretPow + basePow;
    if (bd) bd.textContent = `SHP ${shipPow} · TUR ${turretPow} · BASE ${basePow}`;
  }
}

function getShipRank(ship) {
  return Math.min(10, Math.max(1, ship.mineTier || ship.tier || 1));
}

function getFleetShipPower() {
  return state.ships.reduce((sum, ship) => sum + getShipRank(ship), 0);
}

function getFleetTurretPower() {
  return state.turrets.reduce((sum, turret) => sum + ((turret.level || 1) * 2), 0);
}

function getFleetBasePower() {
  return (state.base.level || 1) * 10;
}

function getFleetTypeCounts() {
  const typeCounts = {};
  for (const s of state.ships) {
    const typeName = CRAFT_RECIPES.find(r => r.id === s.type)?.name || 'Starter';
    typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
  }
  return typeCounts;
}

function getShipTypeName(ship) {
  return CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';
}

function getShipStatusLabel(ship) {
  return ship.status === 'flying' ? '▶ Flying'
    : ship.status === 'mining' ? '⛏ Mining'
    : ship.status === 'returning' ? '◀ Returning'
    : ship.status === 'holding' ? '◌ Holding'
    : '— Idle';
}

function getShipNodeLabel(ship) {
  const node = state.nodes.find(n => n.id === ship.targetNode);
  return node ? RESOURCE_DEFS[node.type].label : '—';
}

function getShipDepotLabel(ship) {
  if (ship.depotType === 'storage' && ship.depotId !== null) {
    const storage = state.modules.find(module => module.id === ship.depotId);
    return storage?.name || '—';
  }
  if (ship.depotType === 'research_lab' && ship.depotId !== null) {
    const lab = state.modules.find(module => module.id === ship.depotId);
    return lab?.name || '—';
  }
  if (ship.depotType === 'power_station' && ship.depotId !== null) {
    const station = state.modules.find(module => module.id === ship.depotId);
    return station?.name || '—';
  }
  return state.base.name || 'Base Station';
}

function getShipTierValue(ship) {
  return ship.tier || ship.mineTier || 1;
}

function shipTierPill(ship) {
  const t = getShipTierValue(ship);
  const c = MINE_TIERS[t]?.color || '#8ab';
  return `<span style="font-family:'Cinzel',serif;font-size:13px;font-weight:600;padding:2px 8px;border-radius:3px;border:1px solid ${c}44;background:${c}18;color:${c};">${toRoman(t)}</span>`;
}

function getShipSellValue(ship) {
  const stats = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;
  let upgradeCost = 0;
  for (let i = 0; i < ship.capacityLevel;  i++) upgradeCost += Math.floor(40  * Math.pow(1.10, i));
  for (let i = 0; i < ship.flySpeedLevel;  i++) upgradeCost += Math.floor(60  * Math.pow(1.10, i));
  for (let i = 0; i < ship.mineSpeedLevel; i++) upgradeCost += Math.floor(60  * Math.pow(1.10, i));
  for (let t = stats.mineTier + 1; t <= ship.mineTier; t++) upgradeCost += SHIP_TIER_COSTS[t] || 0;
  return Math.max(10, upgradeCost);
}

function getFleetSortValue(ship, key) {
  if (key === 'name') return ship.name || '';
  if (key === 'type') return getShipTypeName(ship);
  if (key === 'role') return SHIP_DEFS[ship.type]?.role || 'mining';
  if (key === 'tier') return getShipTierValue(ship);
  if (key === 'node') return getShipNodeLabel(ship);
  if (key === 'depot') return getShipDepotLabel(ship);
  if (key === 'status') return getShipStatusLabel(ship);
  if (key === 'cargo') return ship.cargo || 0;
  if (key === 'level') return (ship.capacityLevel || 0) + (ship.flySpeedLevel || 0) + (ship.mineSpeedLevel || 0);
  if (key === 'sell') return getShipSellValue(ship);
  return ship.name || '';
}

function getSortedFleetShips() {
  const list = [...state.ships];
  list.sort((a, b) => {
    const av = getFleetSortValue(a, _fleetSortKey);
    const bv = getFleetSortValue(b, _fleetSortKey);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
    if (cmp === 0) cmp = (a.id || 0) - (b.id || 0);
    return cmp * _fleetSortDir;
  });
  return list;
}

function sortArrowFor(key) {
  if (_fleetSortKey !== key) return '↕';
  return _fleetSortDir === 1 ? '▲' : '▼';
}

function fleetHeaderCell(label, key) {
  return `<th class="ships-sort-head" onclick="sortFleetManifest('${key}')">${label} <span class="ships-sort-arrow${_fleetSortKey===key?' active':''}">${sortArrowFor(key)}</span></th>`;
}

function buildFleetCompositionHtml(typeCounts, shipCount, maxShips) {
  const compositionHeaders = Object.keys(typeCounts);
  const compositionValues = compositionHeaders.map((key) => typeCounts[key]);
  if (!compositionHeaders.length) return '<div class="ships-empty">No ships in fleet yet.</div>';
  const countStr = (shipCount !== undefined && maxShips !== undefined) ? `${shipCount}/${maxShips} SHIPS — ` : '';
  return `<div class="ships-comp-title">◈ ${countStr}FLEET COMPOSITION</div>
    <table class="ships-comp-table">
      <tr>${compositionHeaders.map(name => `<td class="ships-comp-head">${name}</td>`).join('')}</tr>
      <tr>${compositionValues.map(value => `<td class="ships-comp-val">${value}</td>`).join('')}</tr>
    </table>`;
}

function refreshFleetPanelPartial() {
  const body = document.getElementById('hdr-modal-body');
  if (!body) return;
  const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 5;
  const countEl = body.querySelector('#fleet-count');
  if (countEl) countEl.textContent = `Fleet ${state.ships.length}/${maxShips}`;

  const sig = JSON.stringify(getFleetTypeCounts());
  const compWrap = body.querySelector('#fleet-composition-wrap');
  if (compWrap && sig !== _fleetCompSig) {
    compWrap.innerHTML = buildFleetCompositionHtml(getFleetTypeCounts());
    _fleetCompSig = sig;
  }

  const rows = body.querySelectorAll('tr[data-ship-id]');
  if (rows.length !== state.ships.length) {
    const current = _hdrPanelOpen;
    _hdrPanelOpen = null;
    openHdrPanel(current);
    return;
  }
  const sortedShips = getSortedFleetShips();
  const tbody = body.querySelector('.fleet-table tbody');
  if (tbody) {
    for (const ship of sortedShips) {
      const row = body.querySelector(`tr[data-ship-id="${ship.id}"]`);
      if (row) tbody.appendChild(row);
    }
  }

  for (const ship of sortedShips) {
    const row = body.querySelector(`tr[data-ship-id="${ship.id}"]`);
    if (!row) {
      const current = _hdrPanelOpen;
      _hdrPanelOpen = null;
      openHdrPanel(current);
      return;
    }
    const status = getShipStatusLabel(ship);
    const nodeLabel = getShipNodeLabel(ship);
    const depotLabel = getShipDepotLabel(ship);
    const tier = shipTierPill(ship);
    const cargo = `${ship.cargo}/${ship.capacity}`;

    const nodeEl = row.querySelector('[data-cell="node"]');
    const depotEl = row.querySelector('[data-cell="depot"]');
    const statusEl = row.querySelector('[data-cell="status"]');
    const cargoEl = row.querySelector('[data-cell="cargo"]');
    const tierEl = row.querySelector('[data-cell="tier"]');
    if (nodeEl && nodeEl.textContent !== nodeLabel) nodeEl.textContent = nodeLabel;
    if (depotEl && depotEl.textContent !== depotLabel) depotEl.textContent = depotLabel;
    if (statusEl && statusEl.textContent !== status) statusEl.textContent = status;
    if (cargoEl && cargoEl.textContent !== cargo) cargoEl.textContent = cargo;
    if (tierEl && tierEl.innerHTML !== tier) tierEl.innerHTML = tier;
  }
}

window.sortFleetManifest = function(key) {
  if (_fleetSortKey === key) _fleetSortDir *= -1;
  else { _fleetSortKey = key; _fleetSortDir = 1; }
  if (_hdrPanelOpen === 'fleet') {
    const current = _hdrPanelOpen;
    _hdrPanelOpen = null;
    openHdrPanel(current);
  }
};

export function handleBasePanelOverlayClick(e) {
  return;
}

function switchCodexTab(tab) {
  _codexTab = tab;
  _hdrPanelOpen = null; // prevent toggle-off
  openHdrPanel('codex');
}
window.switchCodexTab = switchCodexTab;

function normalizeCraftTab(tab) {
  if (tab === 'modules' || tab === 'buildings') return 'storage';
  return tab;
}

function switchCraftTab(tab) {
  _craftTab = normalizeCraftTab(tab);
  _hdrPanelOpen = null;
  openHdrPanel('craft');
}
window.setCraftTab = switchCraftTab;

function switchCraftShipRoleTab(tab) {
  _craftShipRoleTab = tab;
  _hdrPanelOpen = null;
  openHdrPanel('craft');
}
window.setCraftShipRoleTab = switchCraftShipRoleTab;

// ── Stats helpers ───────────────────────────────────────────
function buildStatsData() {
  const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 20;
  const assigned = state.ships.filter(s => s.targetNode !== null && s.targetNode !== undefined).length;
  const idle     = state.ships.length - assigned;

  const accessibleNodes = state.nodes.filter(n => n.minLevel <= state.base.level);
  const nodesByType = {};
  for (const node of accessibleNodes) {
    if (!nodesByType[node.type]) nodesByType[node.type] = { total: 0, occupied: 0, yield: 0, mineable: false };
    nodesByType[node.type].total++;
  }
  // Mark types that at least one ship can mine
  for (const s of state.ships) {
    for (const type of Object.keys(nodesByType)) {
      const tierNum = parseInt(Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(type))?.[0] || '99');
      if (s.mineTier >= tierNum) nodesByType[type].mineable = true;
    }
  }
  for (const s of state.ships) {
    if (s.targetNode === null || s.targetNode === undefined) continue;
    const node = state.nodes.find(n => n.id === s.targetNode);
    if (!node || !nodesByType[node.type]) continue;
    nodesByType[node.type].occupied++;
    if (s.status !== 'idle') nodesByType[node.type].yield += (60 / (1.5 / s.mineSpeed));
  }

  const totalNodes = accessibleNodes.length;
  const occupiedNodes = Object.values(nodesByType).reduce((a, v) => a + v.occupied, 0);
  return { maxShips, assigned, idle, totalNodes, occupiedNodes, nodesByType };
}

function buildStatsHtml() {
  const { maxShips, assigned, idle, totalNodes, occupiedNodes, nodesByType } = buildStatsData();

  const statCard = (label, value, color = '#ffe066') =>
    `<div class="resources-stat-card">
      <div class="resources-stat-label">${label}</div>
      <div class="resources-stat-value" style="color:${color};" id="stat-${label.replace(/\s/g,'_')}">${value}</div>
    </div>`;

  const nodeRows = Object.entries(nodesByType).map(([type, d]) => {
    const def = RESOURCE_DEFS[type];
    if (!def) return '';
    const tierEntry = Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(type));
    const tierColor = tierEntry ? (MINE_TIERS[tierEntry[0]].color || '#8ab') : '#8ab';
    const unoccupied = d.total - d.occupied;
    const allFull = unoccupied === 0;
    const noShips = d.occupied === 0 && d.mineable;
    const unmined = !d.mineable;
    const rowBg = unmined ? 'background:rgba(20,20,30,0.3);opacity:0.5;' : noShips ? 'background:rgba(80,10,10,0.35);' : '';
    const suffix = unmined
      ? `<div style="font-size:11px;color:#4a5a7a;min-width:100px;text-align:right;font-style:italic;">no ship can mine</div>`
      : unoccupied > 0
        ? `<div style="font-size:12px;color:#f66;min-width:60px;text-align:right;">${unoccupied} empty</div>`
        : `<div style="min-width:60px;"></div>`;
    return `<div id="stats-node-${type}" data-occ="${d.occupied}" style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid #0e1e3a;${rowBg}">
      ${resourceIconHtml(type, 16)}
      <div style="flex:1;color:#8ab;font-size:14px;">${def.label}</div>
      <div style="font-size:11px;color:${tierColor};font-family:'Orbitron',sans-serif;letter-spacing:1px;margin-right:8px;">T${tierEntry?.[0]??'?'}</div>
      <div style="font-size:14px;font-weight:bold;color:${allFull?'#4d8':'#ffe066'};">${d.occupied}/${d.total}</div>
      ${suffix}
    </div>`;
  }).join('');

  // Resource stockpile per tier — only show resources at least one ship can mine
  const mineableSet = new Set(Object.entries(nodesByType).filter(([,d]) => d.mineable).map(([k]) => k));
  _stockpileMineableKeys = mineableSet;
  const stockpileSections = Object.entries(MINE_TIERS).map(([tier, tierInfo]) => {
    const isCurrentTier = Number(tier) === state.base.level;
    const cards = tierInfo.resources.map(k => {
      const def = RESOURCE_DEFS[k];
      if (!def) return '';
      const d = nodesByType[k];
      if (!d || !d.mineable) return '';
      const v = state.resources[k] || 0;
      const noShips = d.occupied === 0;
      const cardBorder = noShips ? 'border-color:#803020;border-left-color:#f44;' : '';
      const cardBg = noShips ? 'background:rgba(60,10,10,0.45);' : 'background:rgba(10,20,50,0.6);';
      const alert = noShips
        ? `<span id="stockpile-alert-${k}" style="color:#f44;font-size:14px;margin-left:4px;cursor:help;" onmouseover="showHintTooltip(event,'No ships assigned — this resource is not being mined')" onmouseout="hideTooltip()">⚠</span>`
        : `<span id="stockpile-alert-${k}" style="display:none;"></span>`;
      return `<div id="stockpile-card-${k}" class="resources-stock-card${noShips?' no-ships':''}" style="border-left-color:${def.color};">
        ${resourceIconHtml(k, 14)}
        <span class="resources-stock-name">${def.label}${alert}</span>
        <span id="stockpile-val-${k}" class="resources-stock-value" style="color:${v===0?'#4a6a8a':'#ffe066'};">${fmt(v)}</span>
        <span class="resources-stock-nodes">(${d.total} Nodes)</span>
      </div>`;
    }).filter(Boolean).join('');
    if (!cards) return '';
    return `<div class="resources-tier-wrap">
      <div class="resources-tier-title" style="color:${tierInfo.color};border-bottom:1px solid ${tierInfo.color}55;">${tierInfo.label}${isCurrentTier ? ' <span style="color:#ffe066;text-shadow:0 0 8px rgba(255,224,102,0.45);">★</span>' : ''}</div>
      <div class="resources-grid">${cards}</div>
    </div>`;
  }).join('');

  return `
    <div class="resources-stats-row">
      ${statCard('SHIPS', `${state.ships.length}/${maxShips}`)}
      ${statCard('ASSIGNED', assigned, assigned > 0 ? '#4d8' : '#f88')}
      ${statCard('IDLE', idle, idle > 0 ? '#f88' : '#4d8')}
      ${statCard('NODES', `${occupiedNodes}/${totalNodes}`, occupiedNodes === totalNodes ? '#4d8' : '#ffe066')}
    </div>
    <div class="resources-section-title">◈ RESOURCE STOCKPILE</div>
    ${stockpileSections || '<div class="resources-empty">No accessible nodes yet.</div>'}
    <div class="resources-section-title yield">◈ YIELD RATE</div>
    <div class="resources-yield-list" id="stats-yield-list">
      ${buildYieldHtml(nodesByType)}
    </div>`;
}

function buildYieldHtml(nodesByType) {
  const entries = Object.entries(nodesByType).filter(([,d]) => d.yield > 0);
  if (!entries.length) return '<div class="resources-yield-empty">No active mining.</div>';
  return entries.map(([type, d]) => {
    const def = RESOURCE_DEFS[type];
    return `<div class="resources-yield-pill">
      ${resourceIconHtml(type, 13)}
      <span class="resources-yield-name">${def.label}</span>
      <span class="resources-yield-val" id="stats-yield-${type}">${Math.round(d.yield)}/m</span>
    </div>`;
  }).join('');
}

function patchStockpileCards(nodesByType) {
  // If the set of mineable resources changed, full rebuild is needed
  const newKeys = Object.entries(nodesByType).filter(([,d]) => d.mineable).map(([k]) => k).sort().join(',');
  const curKeys = _stockpileMineableKeys ? [..._stockpileMineableKeys].sort().join(',') : null;
  if (curKeys !== newKeys) {
    const body = document.getElementById('hdr-modal-body');
    if (body) body.innerHTML = buildStatsHtml();
    return;
  }
  for (const [k, d] of Object.entries(nodesByType)) {
    if (!d.mineable) continue;
    const def = RESOURCE_DEFS[k];
    if (!def) continue;
    const card = document.getElementById(`stockpile-card-${k}`);
    if (!card) continue;
    const noShips = d.occupied === 0;
    card.classList.toggle('no-ships', noShips);
    card.style.borderLeftColor = noShips ? '#f44' : def.color;
    const alertEl = document.getElementById(`stockpile-alert-${k}`);
    if (alertEl) alertEl.style.display = noShips ? '' : 'none';
    const valEl = document.getElementById(`stockpile-val-${k}`);
    if (valEl) {
      const v = state.resources[k] || 0;
      const txt = fmt(v);
      if (valEl.textContent !== txt) {
        valEl.textContent = txt;
        valEl.style.color = v === 0 ? '#4a6a8a' : '#ffe066';
      }
    }
  }
}

window.patchStockpileCards = function() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (_hdrPanelOpen !== 'resources' || !overlay?.classList.contains('open')) return;
  patchStockpileCards(buildStatsData().nodesByType);
};

export function patchStatsPanel() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (_hdrPanelOpen !== 'resources' || !overlay?.classList.contains('open')) return;
  const { maxShips, assigned, idle, totalNodes, occupiedNodes, nodesByType } = buildStatsData();

  const set = (id, val) => { const el = document.getElementById(id); if (el && el.textContent !== String(val)) el.textContent = val; };
  set('stat-SHIPS', `${state.ships.length}/${maxShips}`);
  set('stat-ASSIGNED', assigned);
  set('stat-IDLE', idle);
  set('stat-NODES', `${occupiedNodes}/${totalNodes}`);

  patchStockpileCards(nodesByType);

  for (const [type, d] of Object.entries(nodesByType)) {
    set(`stats-yield-${type}`, `${Math.round(d.yield)}/m`);
  }
  // Patch yield list only if set changed
  const yieldEl = document.getElementById('stats-yield-list');
  if (yieldEl) {
    const hasYield = Object.values(nodesByType).some(d => d.yield > 0);
    const hasEl    = yieldEl.querySelector('[id^="stats-yield-"]');
    if (hasYield !== !!hasEl) yieldEl.innerHTML = buildYieldHtml(nodesByType);
  }
}

export function openHdrPanel(type, options = {}) {
  const overlay = document.getElementById('hdr-modal-overlay');
  const modal = document.getElementById('hdr-modal');
  const heading = document.getElementById('hdr-modal-heading');
  const body    = document.getElementById('hdr-modal-body');

  if (_hdrPanelOpen === type && overlay.classList.contains('open') && !options.refresh) {
    overlay.classList.remove('open');
    _hdrPanelOpen = null;
    return;
  }

  // Opening any header panel clears active ship selection.
  state.selectedShip = null;
  state.pendingAssign = null;
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = '';
  removeReassignTooltip();

  if (state.basePanelOpen) { state.basePanelOpen = false; if (window.renderBasePanel) window.renderBasePanel(); }
  cancelTurretPlacement();
  cancelStoragePlacement();
  if (type === 'market' && state.tutStep === 10) {
    state.tutStep = 11;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }
  _hdrPanelOpen = type;
  overlay.classList.add('open');
  const _modalBody = document.getElementById('hdr-modal-body');
  if (_modalBody && !options.preserveScroll) _modalBody.scrollTop = 0;
  if (modal) {
    modal.classList.remove('hdr-modal-fleet', 'hdr-modal-codex');
    if (type === 'fleet') modal.classList.add('hdr-modal-fleet');
    if (type === 'codex') modal.classList.add('hdr-modal-codex');
  }

  if (type === 'research' && state.seenMsgs['dax_lv3_intro'] && state.seenMsgs['kai_lv3_intro']) {
    state.seenMsgs['lv3_research_pointer_done'] = true;
    document.querySelectorAll('#tut-ptr-research-lv3').forEach(el => el.remove());
  }

  // ── SOL OVERVIEW ───────────────────────────────────────────
  if (type === 'sol') {
    heading.textContent = 'SECTOR OVERVIEW';
    const shipPow   = getFleetShipPower();
    const turretPow = getFleetTurretPower();
    const basePow   = getFleetBasePower();
    const fleetPower = shipPow + turretPow + basePow;
    body.innerHTML = `
      <div class="overview-hero">
        <div class="overview-galaxy">ANDROMEDA</div>
        <div id="sol-sector-label" class="overview-sector">◈ KEPLER-7 SECTOR — SOL ${state.sol}</div>
        <div class="overview-blurb">Deep in the outer rim, where stellar winds thin and ancient ore drifts unclaimed — your operation pushes further each cycle.</div>
      </div>
      <div class="overview-grid">
        <div class="overview-card power">
          <div class="overview-card-label power">◈ FLEET POWER</div>
          <div id="sol-fleet-power" class="overview-card-val power">${fleetPower}</div>
          <div id="sol-fleet-breakdown" class="overview-breakdown">SHP ${shipPow} · TUR ${turretPow} · BASE ${basePow}</div>
        </div>
        <div class="overview-card pirate">
          <div class="overview-card-label pirate">⚑ PIRATE STATUS</div>
          <div class="overview-card-val pirate">Unknown</div>
        </div>
        <div class="overview-card threat">
          <div class="overview-card-label threat">⬡ THREAT LEVEL</div>
          <div class="overview-card-val threat">Moderate</div>
        </div>
      </div>
      <div class="overview-probe-wrap">
        <div class="overview-probe-title">◈ GALAXY PROBE — COMING SOON</div>
        <div class="overview-probe-card">
          <div class="overview-probe-icon">🛸</div>
          <div class="overview-probe-name">DEEP SPACE PROBES</div>
          <div class="overview-probe-desc">Launch probes to distant systems to discover rare resources, anomalies, and uncharted territories.</div>
        </div>
      </div>`;
  }

  // ── COMMAND ────────────────────────────────────────────────
  else if (type === 'command') {
    heading.textContent = 'COMMAND';
    const cmdTabs = [
      { id: 'missions', label: 'MISSIONS', icon: '◈' },
      { id: 'quests',   label: 'QUESTS',   icon: '⬡' },
      { id: 'bounties', label: 'BOUNTIES', icon: '⚑' },
      { id: 'rep',      label: 'REP',      icon: '★' },
    ];
    const activeCmd = body.dataset.cmdTab || 'missions';
    const tabBar = cmdTabs.map(t => `<button class="command-tab${activeCmd===t.id?' active':''}" onclick="setCmdTab('${t.id}')">${t.icon} ${t.label}</button>`).join('');
    const placeholders = {
      missions: { icon: '◈', title: 'MAIN MISSIONS', desc: 'Story-driven command missions with NPC transmissions, objectives, and sector-altering consequences. Follow the Andromeda narrative arc.' },
      quests:   { icon: '⬡', title: 'ACTIVE QUESTS', desc: 'Rotating short-term objectives refreshed each SOL. Collect resources, hit milestones, and earn bonus rewards.' },
      bounties: { icon: '⚑', title: 'BOUNTY BOARD',  desc: 'Pirate targets and faction contracts posted each SOL. Requires combat capability. Rewards scale with threat level.' },
      rep:      { icon: '★', title: 'REPUTATION',    desc: 'Your standing with Outer Rim Collective, Helix Corp, Vanguard Fleet, and the Black Market. Affects prices, access, and story outcomes.' },
    };
    const p = placeholders[activeCmd];
    body.innerHTML = `
      <div class="command-tabs">${tabBar}</div>
      <div class="command-card">
        <div class="command-icon">${p.icon}</div>
        <div class="command-title">${p.title}</div>
        <div class="command-desc">${p.desc}</div>
        <div class="command-soon">— COMING SOON —</div>
      </div>`;
    body.dataset.cmdTab = activeCmd;
    window.setCmdTab = (id) => { body.dataset.cmdTab = id; _hdrPanelOpen = null; openHdrPanel('command'); };
  }

  // ── TRANSMISSIONS ──────────────────────────────────────────
  else if (type === 'transmissions') {
    heading.textContent = 'TRANSMISSIONS';
    renderTransmissionsPanel(body);
  }

  // ── CRAFT ─────────────────────────────────────────────────
  else if (type === 'craft') {
    heading.textContent = 'CRAFTING & FABRICATION';

    // Advance tutorial: step 5 (point at CRAFT button) → step 6 (point at SHIPS tab)
    if (state.tutStep === 5) { state.tutStep = 6; requestAnimationFrame(() => renderTutPointers()); }

    const bl = state.base.level;
    const maxShips = BASE_MAX_SHIPS[bl - 1] || 5;
    const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;
    const atCap = (state.ships.length + activeCraftCount) >= maxShips;
    const activeCraftTab = normalizeCraftTab(_craftTab || 'ships');

    const craftTabDefs = [
      { id: 'ships',   label: 'SHIPS' },
      { id: 'defense', label: 'DEFENSE' },
      { id: 'storage', label: 'STORAGE' },
      { id: 'power', label: 'POWER' },
      { id: 'research', label: 'RESEARCH' },
      { id: 'drones', label: 'DRONES' },
    ];
    const navBar = `<div class="craft-nav">${craftTabDefs.map(t =>
      `<button id="craft-tab-${t.id}" class="craft-nav-btn${activeCraftTab===t.id?' active':''}" onclick="setCraftTab('${t.id}')">${t.label}</button>`
    ).join('')}</div>`;

    let tabContent = '';

    if (activeCraftTab === 'ships') {
      const ROLE_META = {
        mining:    { label: '⛏  MINING SHIPS',    color: '#60d090' },
        transport: { label: '▲  CARGO TRANSPORT',  color: '#80d0ff' },
        combat:    { label: '⚔  COMBAT SHIPS',     color: '#ff6060' },
        garrison:  { label: '🛡  GARRISON',         color: '#ff8c40' },
      };

      const roleOrder = ['mining', 'transport', 'combat', 'garrison'];
      const activeShipRoleTab = _craftShipRoleTab || 'mining';
      const shipRoleTabs = `<div class="craft-subtabs">${roleOrder.map((role) => {
        const meta = ROLE_META[role];
        return `<button class="craft-subtab${activeShipRoleTab===role?' active':''}" onclick="setCraftShipRoleTab('${role}')" style="${activeShipRoleTab===role ? `border-color:${meta.color};color:${meta.color};background:${meta.color}12;` : ''}">${meta.label}</button>`;
      }).join('')}</div>`;
      let items = atCap
        ? `<div class="craft-cap-warning">⚠ Ship capacity full (${state.ships.length + activeCraftCount}/${maxShips}).<br>Upgrade the Base or sell a ship.</div>`
        : '';

      const activeRoleMeta = ROLE_META[activeShipRoleTab];
      const groupRecipes = CRAFT_RECIPES.filter(r => {
        const s = SHIP_DEFS[r.id];
        return s && (s.role || 'mining') === activeShipRoleTab && s.mineTier <= bl;
      });

      if (groupRecipes.length) {
        items += `<div class="craft-role-header" style="color:${activeRoleMeta.color};border-bottom:1px solid ${activeRoleMeta.color}33;">${activeRoleMeta.label}</div>`;

        for (const recipe of groupRecipes) {
          const stats     = SHIP_DEFS[recipe.id] || SHIP_DEFS.scout;
          const sc        = activeRoleMeta.color;
          const tierColor = MINE_TIERS[stats.mineTier]?.color || '#fff';
          const reqsMet   = Object.entries(recipe.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
          const canCraft  = reqsMet && !atCap;

          let reqsHtml = '';
          for (const [r, n] of Object.entries(recipe.reqs)) {
            const met = (state.resources[r] || 0) >= n;
            reqsHtml += `<span class="bp-craft-req ${met?'met':'unmet'}">${RESOURCE_DEFS[r].label}: ${n}</span>`;
          }

          let statsHtml = '';
          if (stats.role === 'combat' || stats.role === 'garrison') {
            statsHtml = `
              <span class="craft-stat">HP <span style="color:#ffe066;">${(stats.hp||0).toLocaleString()}</span></span>
              <span class="craft-stat">DAMAGE <span style="color:#ffe066;">${stats.attack||0}</span></span>`;
          } else if (stats.role === 'transport') {
            statsHtml = `
              <span class="craft-stat">CAPACITY <span style="color:#ffe066;">${stats.capacity}u</span></span>
              <span class="craft-stat">SPEED <span style="color:#ffe066;">${formatFlySpeed(stats.flySpeed)}</span></span>
              <span class="craft-stat">LOAD SPD <span style="color:#ffe066;">${formatLoadSpeed(stats.loadSpeed || 0)}</span></span>`;
          } else {
            statsHtml = `
              <span class="craft-stat">CAPACITY <span style="color:#ffe066;">${stats.capacity}u</span></span>
              <span class="craft-stat">SPEED <span style="color:#ffe066;">${formatFlySpeed(stats.flySpeed)}</span></span>
              <span class="craft-stat">MINE RATE <span style="color:#ffe066;">${formatMineSpeedPercent(stats.mineSpeed)}</span></span>`;
          }

          const craftTimer = state.shipCraftTimers?.[recipe.id];
          const timerActive = !!(craftTimer && Date.now() < craftTimer.endsAt);
          const remainMs  = timerActive ? Math.max(0, craftTimer.endsAt - Date.now()) : 0;
          const remainSec = Math.ceil(remainMs / 1000);
          const pct = timerActive ? Math.max(0, Math.min(100, ((craftTimer.durationMs - remainMs) / craftTimer.durationMs) * 100)) : 0;
          const builtNoticeUntil  = state.shipCraftNotices?.[recipe.id] || 0;
          const builtNoticeActive = Date.now() < builtNoticeUntil;

          const buildBtn = builtNoticeActive
            ? `<button class="btn bp-craft-btn bp-craft-btn-ready craft-btn-full" disabled><span class="bp-craft-btn-label">SHIP BUILT AND DEPLOYED!</span></button>`
            : timerActive
            ? `<button class="btn bp-craft-btn bp-craft-btn-crafting craft-btn-full" disabled><span class="bp-craft-btn-fill" id="craft-fill-${recipe.id}" style="width:${pct}%;"></span><span class="bp-craft-btn-label" id="craft-label-${recipe.id}">CRAFTING ${remainSec}s</span></button>`
            : `<button class="btn ${atCap?'danger':'primary'} craft-btn-full" ${!canCraft?'disabled':''} onclick="startCraftShip('${recipe.id}')">BUILD SHIP</button>`;

          items += `<div class="bp-craft-item">
            <div class="craft-item-head">
              <span class="craft-item-role-icon" style="color:${sc};filter:drop-shadow(0 0 5px ${sc}66);">▲</span>
              <div class="craft-item-title-wrap">
                <span class="craft-item-title">${recipe.name}</span>
                <span class="craft-item-desc">${recipe.desc}</span>
              </div>
              <span class="craft-item-tier-pill" style="border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};">${toRoman(stats.mineTier)}</span>
              <span class="craft-item-role-pill" style="border:1px solid ${sc}33;background:${sc}12;color:${sc};">${stats.role||'mining'}</span>
            </div>
            <div class="craft-stats-row craft-ships-stats-row" style="margin:0 0 8px 0;gap:8px;">${statsHtml}</div>
            <div class="bp-craft-reqs" style="margin:0 0 8px 0;">${reqsHtml}</div>
            ${buildBtn}
          </div>`;
        }
      }

      if (!groupRecipes.length) {
        items += `<div class="craft-empty">No ships available at current base tier.</div>`;
      }

      tabContent = `${shipRoleTabs}<div class="bp-craft-grid">${items}</div>`;

      // Tutorial scroll-to
      if (state.tutStep === 7) {
        requestAnimationFrame(() => {
          const btn = document.querySelector('#hdr-modal-body .bp-craft-item .btn');
          if (btn?.scrollIntoView) btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }

    } else if (activeCraftTab === 'defense') {
      const turretsUnlocked = state.researchUnlocks['turrets'];
      const turretCount = (state.turrets || []).length;
      let defHtml = '';

      if (!turretsUnlocked) {
        defHtml = `<div class="craft-defense-empty">
          🔒 No defense systems unlocked yet.<br><br>
          <span style="font-size:13px;">Visit the <strong style="color:#8ab">Research panel</strong> to unlock Automatic Turret.</span>
        </div>`;
      }

      if (turretsUnlocked) {
        const queue = Array.isArray(state.unplacedTurretQueue) ? state.unplacedTurretQueue : Array.from({ length: state.unplacedTurrets || 0 }, () => 'turret');
        const queuedCount = (id) => queue.filter(t => t === id).length;
        const pill = (met, label) => `<span class="bp-craft-req ${met?'met':'unmet'}">${label}</span>`;
        const turretCards = [
          { id: 'turret', unlocked: true, desc: 'Build automatic turrets on free map tiles to defend your base.', stats: ['5,000 -> 10,000 HP', '100', '1/s -> 5/s', '2 tiles (MAX 5)'] },
          { id: 'laser_turret', unlocked: !!state.researchUnlocks['laser_turrets'], desc: 'Fires a single heavy beam burst for big damage, then must recharge before firing again.', stats: ['8,000 -> 16,000 HP', '500', '15s -> 5s', '4 tiles (MAX 12)'] },
          { id: 'emp_turret', unlocked: !!state.researchUnlocks['emp_turrets'], desc: 'Stuns enemy ships so they cannot move or fire, while also dropping their defenses.', stats: ['15,000 -> 30,000 HP', 'STUN 2s', '60s -> 45s', '3 tiles (MAX 15)'] },
        ];
        for (const card of turretCards) {
          if (!card.unlocked) continue;
          const craft = getCraft('turrets', card.id);
          if (!craft) continue;
          const canCoins = state.coins >= craft.cost;
          const reqsMet = Object.entries(craft.reqs).map(([r, n]) => [(state.resources[r] || 0) >= n, r, n]);
          const canBuild = canCoins && reqsMet.every(([met]) => met);
          const resPills = reqsMet.map(([met, r, n]) => pill(met, `${r[0].toUpperCase() + r.slice(1)}: ${n}`)).join('');
          const queued = queuedCount(card.id);
          const craftTimer = state.turretCraftTimers?.[card.id];
          const timerActive = !!(craftTimer && Date.now() < craftTimer.endsAt);
          const remainMs = timerActive ? Math.max(0, craftTimer.endsAt - Date.now()) : 0;
          const remainSec = Math.ceil(remainMs / 1000);
          const pct = timerActive ? Math.max(0, Math.min(100, ((craftTimer.durationMs - remainMs) / craftTimer.durationMs) * 100)) : 0;
          const builtCount = (state.turrets || []).filter(t => t.type === card.id).length;
          defHtml += `<div class="craft-defense-card">
            <div class="craft-defense-head">
              <div class="craft-defense-title">${craft.name.toUpperCase()}</div>
              <span class="craft-defense-meta" style="color:#ffe066;">${builtCount} built</span>
            </div>
            <div class="craft-defense-desc">${card.desc}</div>
            <div class="craft-stats-row craft-ships-stats-row" style="margin:0 0 8px 0;gap:8px;">
              <span class="craft-stat">HP <span style="color:#ffe066;">${card.stats[0]}</span></span>
              <span class="craft-stat">DAMAGE <span style="color:#ffe066;">${card.stats[1]}</span></span>
              <span class="craft-stat">FIRE RATE <span style="color:#ffe066;">${card.stats[2]}</span></span>
              <span class="craft-stat">RANGE <span style="color:#ffe066;">${card.stats[3]}</span></span>
            </div>
            <div class="bp-craft-reqs" style="margin-bottom:8px;">${pill(canCoins, '$' + craft.cost)}${resPills}</div>
            ${queued > 0
              ? `<button class="btn place craft-defense-btn" onclick="beginPlacingTurret('${card.id}')">PLACE ${craft.name.toUpperCase()} (${queued})</button>`
              : timerActive
              ? `<button class="btn bp-craft-btn bp-craft-btn-crafting craft-defense-btn" disabled><span class="bp-craft-btn-fill" id="craft-turret-fill-${card.id}" style="width:${pct}%;"></span><span class="bp-craft-btn-label" id="craft-turret-label-${card.id}">CRAFTING ${remainSec}s</span></button>`
              : `<button class="btn primary craft-defense-btn" ${canBuild ? '' : 'disabled'} onclick="startPlaceTurret('${card.id}')">BUILD ${craft.name.toUpperCase()}</button>`}
          </div>`;
        }
      }

      tabContent = defHtml;

    } else if (activeCraftTab === 'storage' || activeCraftTab === 'power' || activeCraftTab === 'research' || activeCraftTab === 'drones') {
      const queue = Array.isArray(state.unplacedModuleQueue) ? state.unplacedModuleQueue : Array.from({ length: state.unplacedModules || 0 }, () => 'storage_facility');
      const moduleTabIds = {
        storage: new Set(['storage_facility']),
        power: new Set(['power_station', 'power_pole']),
        research: new Set(['research_lab', 'lab_tower']),
        drones: new Set(['drone_lab']),
      };
      const tabLabel = activeCraftTab.charAt(0).toUpperCase() + activeCraftTab.slice(1);
      const unlockedBuildings = Object.values(MODULE_DEFS).filter(module => state.researchUnlocks[module.unlockId] && moduleTabIds[activeCraftTab].has(module.id));
      if (!unlockedBuildings.length) {
        tabContent = `<div class="craft-defense-empty">
            🔒 ${tabLabel} fabrication is still locked.<br><br>
            <span style="font-size:13px;">Unlock placeable <strong style="color:#8ab">${tabLabel}</strong> modules in the Research panel first.</span>
          </div>`;
      } else {
        tabContent = unlockedBuildings.map((moduleConfig) => {
          const moduleDef = getCraft('buildings', moduleConfig.id);
          const queued = queue.filter(t => t === moduleConfig.id).length;
          const builtCount = (state.modules || []).filter(module => module.type === moduleConfig.id).length;
          const timer = state.buildingCraftTimers?.[moduleConfig.id];
          const timerActive = !!(timer && Date.now() < timer.endsAt);
          const remainMs = timerActive ? Math.max(0, timer.endsAt - Date.now()) : 0;
          const remainSec = Math.ceil(remainMs / 1000);
          const pct = timerActive ? Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100)) : 0;
          const canCoins = state.coins >= (moduleDef?.cost || 0);
          const reqPills = moduleDef
            ? Object.entries(moduleDef.reqs).map(([r, n]) => `<span class="bp-craft-req ${(state.resources[r] || 0) >= n ? 'met' : 'unmet'}">${RESOURCE_DEFS[r].label}: ${n}</span>`).join('')
            : '';
          const canBuild = !!moduleDef && canCoins && Object.entries(moduleDef.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
          const statsHtml = moduleConfig.cardStats(1).map(([label, value]) => `<span class="craft-stat">${label} <span style="color:#ffe066;">${value}</span></span>`).join('');
          const buildLabel = moduleConfig.id === 'storage_facility' ? 'BUILD STORAGE' : `BUILD ${moduleDef?.name?.toUpperCase() || getModuleDef(moduleConfig.id).name.toUpperCase()}`;
          const placeLabel = moduleConfig.id === 'storage_facility' ? 'PLACE STORAGE' : `PLACE ${moduleDef?.name?.toUpperCase() || getModuleDef(moduleConfig.id).name.toUpperCase()}`;
          return `<div class="craft-defense-card">
              <div class="craft-defense-head">
                <div class="craft-defense-title">${moduleDef?.name?.toUpperCase() || moduleConfig.name.toUpperCase()}</div>
                <span class="craft-defense-meta" style="color:#ffe066;">${builtCount} built</span>
              </div>
              <div class="craft-defense-desc">${moduleDef?.desc || ''}</div>
              <div class="craft-stats-row craft-ships-stats-row" style="margin:0 0 8px 0;gap:8px;">${statsHtml}</div>
              <div class="bp-craft-reqs" style="margin-bottom:8px;"><span class="bp-craft-req ${canCoins ? 'met' : 'unmet'}">$${fmt(moduleDef?.cost || 0)}</span>${reqPills}</div>
              ${queued > 0
                ? `<button class="btn place craft-defense-btn" onclick="beginPlacingBuilding('${moduleConfig.id}')">${placeLabel} (${queued})</button>`
                : timerActive
                ? `<button class="btn bp-craft-btn bp-craft-btn-crafting craft-defense-btn" disabled><span class="bp-craft-btn-fill" id="craft-building-fill-${moduleConfig.id}" style="width:${pct}%;"></span><span class="bp-craft-btn-label" id="craft-building-label-${moduleConfig.id}">CRAFTING ${remainSec}s</span></button>`
                : `<button class="btn primary craft-defense-btn" ${canBuild ? '' : 'disabled'} onclick="startCraftBuilding('${moduleConfig.id}')">${buildLabel}</button>`}
            </div>`;
        }).join('');

      // Drone crafting section — shown below drone lab building card on the drones tab
      if (activeCraftTab === 'drones') {
        const droneDef = getCraft('drones', 'drone');
        const droneLabsBuilt = (state.modules || []).filter(m => m.type === DRONE_LAB_ID);
        const droneTimer = state.droneCraftTimers?.['drone'];
        const droneTimerActive = !!(droneTimer && Date.now() < droneTimer.endsAt);
        const droneRemainMs = droneTimerActive ? Math.max(0, droneTimer.endsAt - Date.now()) : 0;
        const droneRemainSec = Math.ceil(droneRemainMs / 1000);
        const dronePct = droneTimerActive ? Math.max(0, Math.min(100, ((droneTimer.durationMs - droneRemainMs) / droneTimer.durationMs) * 100)) : 0;
        const droneCanCoins = state.coins >= (droneDef?.cost || 0);
        const droneReqPills = droneDef
          ? Object.entries(droneDef.reqs).map(([r, n]) => `<span class="bp-craft-req ${(state.resources[r] || 0) >= n ? 'met' : 'unmet'}">${RESOURCE_DEFS[r].label}: ${n}</span>`).join('')
          : '';
        const droneCanBuild = !!droneDef && droneCanCoins && Object.entries(droneDef?.reqs || {}).every(([r, n]) => (state.resources[r] || 0) >= n);
        const totalDroneCount = (state.drones || []).length;
        const totalDroneCapacity = droneLabsBuilt.reduce((sum, m) => sum + (m.droneCapacity || 2), 0);
        const dronesFull = totalDroneCount >= totalDroneCapacity && droneLabsBuilt.length > 0;

        const droneCraftingUnlocked = !!state.researchUnlocks['drone_crafting'];
        if (droneDef && droneLabsBuilt.length > 0) {
          const droneStatusHtml = `<div style="font-size:12px;color:#8ab;margin-bottom:8px;">Drone capacity across ${droneLabsBuilt.length} lab${droneLabsBuilt.length > 1 ? 's' : ''}: <span style="color:#ffe066;">${totalDroneCount} / ${totalDroneCapacity}</span></div>`;
          tabContent += `<div class="craft-defense-card" style="margin-top:12px;border-color:#2a5090;">
            <div class="craft-defense-head">
              <div class="craft-defense-title">◬ DRONE</div>
              <span class="craft-defense-meta" style="color:#ffe066;">${totalDroneCount} active</span>
            </div>
            <div class="craft-defense-desc">${droneDef.desc}</div>
            ${droneStatusHtml}
            <div class="craft-stats-row craft-ships-stats-row" style="margin:0 0 8px 0;gap:8px;">
              <span class="craft-stat">CRAFT TIME <span style="color:#ffe066;">1s</span></span>
              <span class="craft-stat">POWER <span style="color:#ffe066;">1/s each</span></span>
            </div>
            <div class="bp-craft-reqs" style="margin-bottom:8px;"><span class="bp-craft-req ${droneCanCoins ? 'met' : 'unmet'}">$${fmt(droneDef.cost)}</span>${droneReqPills}</div>
            ${!droneCraftingUnlocked
              ? `<button class="btn craft-defense-btn" disabled>🔒 UNLOCK DRONE IN RESEARCH</button>`
              : dronesFull
              ? `<button class="btn craft-defense-btn" disabled>◬ ALL LABS AT CAPACITY</button>`
              : droneTimerActive
              ? `<button class="btn bp-craft-btn bp-craft-btn-crafting craft-defense-btn" disabled><span class="bp-craft-btn-fill" id="craft-drone-fill-drone" style="width:${dronePct}%;"></span><span class="bp-craft-btn-label" id="craft-drone-label-drone">CRAFTING ${droneRemainSec}s</span></button>`
              : `<button class="btn primary craft-defense-btn" ${droneCanBuild ? '' : 'disabled'} onclick="startCraftDrone()">◬ BUILD DRONE</button>`}
          </div>`;
        }
      }
      }
    } else {
      tabContent = `<div class="craft-placeholder">
        <div class="craft-placeholder-icon">⬡</div>
        <div class="craft-placeholder-title">COMING SOON</div>
        <div class="craft-placeholder-desc">More fabrication options will be available in a future update.</div>
      </div>`;
    }

    body.innerHTML = `<div class="craft-layout">${navBar}<div class="craft-content">${tabContent}</div></div>`;
    if (activeCraftTab === 'ships' && state.tutStep === 6) { state.tutStep = 7; }
  }

  // ── RESEARCH ───────────────────────────────────────────────
  else if (type === 'research') {
    const rpCap = getResearchPointCap(state.base.level);
    const formatResearchDesc = (desc) => desc.replace(/(\d[\d,]*(?:\.\d+)?(?:\s*HP|%)?)/g, '<span style="color:#ffe066;">$1</span>');
    heading.textContent = 'RESEARCH';
    let treeHtml = '';
    for (const tier of RESEARCH_TREE) {
      const tierLocked = tier.minBaseLevel && state.base.level < tier.minBaseLevel;
      const tierCol = tierLocked ? '#3a5a7a' : (MINE_TIERS[tier.tier]?.color || '#4af');
      treeHtml += `<div class="research-tier-wrap">
        <div class="research-tier-title" style="color:${tierCol};border-bottom:1px solid ${tierCol}44;">
          TIER ${toRoman(tier.tier)}${tierLocked?` <span style="color:#f88;font-size:11px;">— Requires Base Upgrade</span>`:''}
        </div>`;
      for (const u of tier.unlocks) {
        const isUnlocked = state.researchUnlocks[u.id];
        const tierReqMet = !tier.minBaseLevel || state.base.level >= tier.minBaseLevel;
        const count      = getRepeatableCount(u.id, state);
        const maxCount   = getRepeatableMax(u.id);
        const nextCost   = u.repeatable ? (u.cost * (count + 1)) : u.cost;
        const canAfford  = state.rp >= nextCost;
        const capReached = u.repeatable && count >= maxCount;
        const purchasable = tierReqMet && canAfford && (!isUnlocked || u.repeatable) && !capReached;
        const nextGain = (() => {
          if (!u.repeatable) return '';
          if (u.id === 'health_increase') return 'Next: +8,000 HP';
          if (u.id === 'shield_increase') return 'Next: +5% shield';
          if (u.id === 'anti_comet') return 'Next: +5% intercept';
          if (u.id === 'solar_shield') return 'Next: +8% flare resist';
          if (u.id === 'auto_regen') return 'Next: +5 HP/s';
          return 'Next upgrade bonus';
        })();
        treeHtml += `<div class="research-card ${isUnlocked?'unlocked':''} ${tierLocked?'locked':''}">
          <div class="research-row">
            <div class="research-main">
              <div class="research-copy">
              <div class="research-title-row">
                <div class="research-title ${isUnlocked?'unlocked':''}"><span class="research-title-bullet">•</span>${u.name}</div>
                ${u.repeatable && count > 0 ? `<span class="research-count">×${count}</span>` : ''}
                ${isUnlocked && !u.repeatable ? `<span class="research-badge">✓ UNLOCKED</span>` : ''}
              </div>
              <div class="research-desc">${formatResearchDesc(u.desc)}</div>
              ${u.repeatable && !capReached ? `<div class="research-next">${nextGain}</div>` : ''}
              </div>
              ${(!isUnlocked || u.repeatable) && tierReqMet ? `<div class="research-action">
                <button class="btn research-btn${purchasable?' primary':''}" ${purchasable?'':'disabled'} onclick="purchaseResearch('${u.id}')">
                  ${capReached ? 'MAXED' : `<span style="color:#ffe066;">${nextCost} RP</span><br>${u.repeatable ? 'UPGRADE' : 'UNLOCK'} ${u.repeatable ? `x${count + 1}` : ''}`}
                </button>
              </div>` : ''}
            </div>
          </div>
        </div>`;
      }
      treeHtml += '</div>';
    }
    body.innerHTML = `
      <div class="research-header">
        <div>
          <div class="research-header-title">RESEARCH POINTS</div>
          <div class="research-header-points">🔬 ${state.rp} <span class="research-header-cap">/ ${rpCap}</span></div>
          <div class="research-header-rate">+1 per SOL</div>
        </div>
      </div>
      ${treeHtml}`;
  }

  // ── MARKET ─────────────────────────────────────────────────
  else if (type === 'market') {
    heading.textContent = 'TRADE';
    const hasAny = Object.values(state.resources).some(v => v > 0);
    const demandMap = new Map();
    if (state.marketBoost?.type) demandMap.set(state.marketBoost.type, state.marketBoost.multiplier ?? 1.5);
    for (const d of (state.extraDemands || [])) demandMap.set(d.type, d.multiplier ?? 1.5);
    let tradeHtml = '';
    if (demandMap.size) {
      const demandCells = Array.from(demandMap.entries()).map(([type, mult]) => {
        const def = RESOURCE_DEFS[type];
        return `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:6px 8px;border:1px solid rgba(255,255,255,0.12);border-radius:4px;background:rgba(10,25,50,0.35);color:${def.color};text-shadow:0 0 10px ${def.color}55;">
          ${resourceIconHtml(type, 16)}
          <span>${def.label}<span class="trade-demand-gap"></span><span class="trade-demand-mult">${mult}x!</span></span>
        </div>`;
      }).join('');
      tradeHtml += `<div class="trade-demand-card">
        <div class="trade-demand-title">SOL ${state.sol} - DEMAND</div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">${demandCells}</div>
      </div>`;
    }
    if (!hasAny) {
      tradeHtml += `<div class="trade-empty">⏳ No resources to sell yet.</div>`;
    } else {
      const defaultSellQty = (amt) => {
        if (amt >= 10000) return 1000;
        if (amt >= 1000) return 100;
        if (amt >= 100) return 10;
        return 1;
      };
      tradeHtml += '<div class="sell-grid">';
      for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
        const amt = state.resources[type] || 0;
        if (amt <= 0) continue;
        const sellAmt = defaultSellQty(amt);
        const price   = getSellPrice(type);
        const earnedAll = amt * price;
        const boostMult = demandMap.get(type);
        const boosted = Number.isFinite(boostMult);
        const priceHtml = boosted
          ? `<span class="trade-price">$${price} <span class="trade-price-boost" title="Market boosted this SOL — ${boostMult}× sell price!">✦</span></span>`
          : `<span class="trade-price">$${price}</span>`;
        tradeHtml += `<div class="sell-row">
          ${resourceIconHtml(type, 14)}
          ${priceHtml}
          <span class="res-name-s">${def.label}</span>
          <span class="res-qty">${fmt(amt)}</span>
          <div class="trade-actions">
            <input id="sell-qty-${type}" type="number" min="1" max="${amt}" step="1" value="${sellAmt}" class="sell-qty-input" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()">
            <button class="sell-btn-s" onmousedown="const _inp=document.getElementById('sell-qty-${type}');const _raw=Math.floor(Number(_inp?.value||0));const _qty=Math.max(1,Math.min(${amt},Number.isFinite(_raw)?_raw:1));if(_inp)_inp.value=_qty;sellResource('${type}',_qty);openHdrPanel('market',{refresh:true,preserveScroll:true})">SELL QTY</button>
            <button class="sell-btn-s sell-btn-all" onmousedown="sellResource('${type}',${amt});openHdrPanel('market',{refresh:true,preserveScroll:true})">SELL ALL <span class="trade-sell-earned">$${fmt(earnedAll)}</span></button>
          </div>
        </div>`;
      }
      tradeHtml += '</div>';
    }
    const totalResources = Object.values(state.resources).reduce((sum, n) => sum + (n || 0), 0);
    body.innerHTML = `
      <div class="trade-summary">
        <div>
          <div class="trade-summary-value-lg">$${fmt(state.coins)}</div>
          <div class="trade-summary-label">CURRENT BALANCE</div>
        </div>
        <div>
          <div class="trade-summary-value">${fmt(totalResources)}</div>
          <div class="trade-summary-label">CURRENT RESOURCES</div>
        </div>
        <div>
          <div class="trade-summary-value">0%</div>
          <div class="trade-summary-label">TAX RATE</div>
        </div>
      </div>
      <div class="trade-section-title">◈ SELL RESOURCES</div>
      ${tradeHtml}`;
  }

  // ── FLEET MANIFEST ─────────────────────────────────────────
  else if (type === 'fleet') {
    const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 5;
    heading.textContent = 'FLEET MANIFEST';
    const typeCounts = getFleetTypeCounts();
    const compositionHtml = buildFleetCompositionHtml(typeCounts, state.ships.length, maxShips);
    _fleetCompSig = JSON.stringify(typeCounts);
    const fmtSell = v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`;
    const rows = getSortedFleetShips().map(s => {
      const typeName = getShipTypeName(s);
      const status = getShipStatusLabel(s);
      const role = (SHIP_DEFS[s.type]?.role || 'mining');
      const totalLevel = (s.capacityLevel || 0) + (s.flySpeedLevel || 0) + (s.mineSpeedLevel || 0);
      const sellVal = getShipSellValue(s);
      const depotLabel = getShipDepotLabel(s);
      return `<tr data-ship-id="${s.id}">
        <td class="ships-lv">${totalLevel}</td>
        <td class="ships-nowrap">${s.name}</td>
        <td class="ships-nowrap">${typeName}</td>
        <td class="ships-role ships-nowrap">${role}</td>
        <td data-cell="tier">${shipTierPill(s)}</td>
        <td data-cell="node" class="ships-nowrap">${getShipNodeLabel(s)}</td>
        <td data-cell="depot" class="ships-nowrap">${depotLabel}</td>
        <td data-cell="status" class="ships-nowrap">${status}</td>
        <td data-cell="cargo" class="ships-cargo ships-nowrap">${s.cargo}/${s.capacity}</td>
        <td class="ships-sell ships-nowrap">${fmtSell(sellVal)}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `
      <div id="fleet-composition-wrap">${compositionHtml}</div>
      <table class="fleet-table ships-table-fixed">
        <colgroup>
          <col style="width:5%;">
          <col style="width:17%;">
          <col style="width:14%;">
          <col style="width:9%;">
          <col style="width:7%;">
          <col style="width:14%;">
          <col style="width:12%;">
          <col style="width:10%;">
          <col style="width:9%;">
          <col style="width:10%;">
        </colgroup>
        <thead><tr>${fleetHeaderCell('LV', 'level')}${fleetHeaderCell('NAME', 'name')}${fleetHeaderCell('TYPE', 'type')}${fleetHeaderCell('ROLE', 'role')}${fleetHeaderCell('TIER', 'tier')}${fleetHeaderCell('NODE', 'node')}${fleetHeaderCell('DROP OFF', 'depot')}${fleetHeaderCell('STATUS', 'status')}${fleetHeaderCell('CARGO', 'cargo')}${fleetHeaderCell('SELL', 'sell')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── RESOURCES ──────────────────────────────────────────────
  else if (type === 'resources') {
    heading.textContent = 'RESOURCES';
    body.innerHTML = buildStatsHtml();
  }

  // ── CODEX ──────────────────────────────────────────────────
  else if (type === 'codex') {
    heading.textContent = 'CODEX';
    const codexTabs = [
      { id: 'crew',     label: 'Crew & Contacts' },
      { id: 'events',   label: 'Events' },
      { id: 'discoveries', label: 'Discoveries' },
      { id: 'resources',label: 'Resources' },
      { id: 'ships',    label: 'Ships' },
      { id: 'turrets',  label: 'Turrets' },
      { id: 'storage',  label: 'Storage' },
      { id: 'research', label: 'Research' },
      { id: 'upgrades', label: 'Base Upgrades' },
      { id: 'sector',   label: 'Sector' },
      { id: 'trade',    label: 'Trade' },
    ];
    const tabBar = `<div class="codex-nav">
      ${codexTabs.map(tab => `<button onclick="event.stopPropagation();switchCodexTab('${tab.id}')" class="codex-nav-btn${_codexTab===tab.id?' active':''}">${tab.label}</button>`).join('')}
    </div>`;

    let tabContent = '';

    if (_codexTab === 'crew') {
      const groups = [
        { label: '◈ Star Command · ISV Hyperion', ids: ['juno','sera'] },
        { label: '◈ The Marauder · Pirate Crew',  ids: ['vex','scarlett'] },
        { label: '◈ Sector Specialists',           ids: ['rigs','vane','zoe','doran','kade','dax','kai'] },
        { label: '◈ Unknown',                      ids: ['architect','android'] },
      ];
      for (const group of groups) {
        const members = group.ids.map(id => NPCS[id]).filter(Boolean);
        if (!members.length) continue;
        tabContent += `<div class="codex-group-label">${group.label}</div>`;
        tabContent += members.map(npc => {
          return `<div class="codex-card">
            <img class="codex-avatar large" src="${npc.portrait}" alt="${npc.name}">
            <div class="codex-info">
              <div class="codex-name">${npc.name}</div>
              <div class="codex-title">${npc.ship}</div>
              <div class="codex-bio">${npc.bio}</div>
            </div>
          </div>`;
        }).join('');
      }

    } else if (_codexTab === 'discoveries') {
      const crashedShipDef = RESOURCE_DEFS[CRASHED_SHIP_NODE_TYPE];
      const discovered = state.nodes.some((node) => node.type === CRASHED_SHIP_NODE_TYPE);
      tabContent = `<div class="codex-group-label codex-section-title">◈ BELT DISCOVERIES</div>
        <div class="codex-card" style="align-items:flex-start;gap:14px;${discovered ? '' : 'opacity:0.6;'}">
          <img src="assets/images/crashed_ships/crashed_ship_1.png" alt="Crashed Ship" style="width:84px;height:84px;object-fit:contain;image-rendering:auto;filter:drop-shadow(0 0 10px rgba(180,200,255,0.15));">
          <div class="codex-info">
            <div class="codex-name">${crashedShipDef.label}</div>
            <div class="codex-title">${discovered ? 'RECORDED ANOMALY' : 'UNCONFIRMED SIGNAL'}</div>
            <div class="codex-bio">${discovered ? crashedShipDef.blurb : 'A fragmented contact is rumored to drift somewhere in the sector. Locate it to add it to your navigational records.'}</div>
          </div>
        </div>`;

    } else if (_codexTab === 'resources') {
      const resourceTier = {};
      const boostMap = new Map();
      if (state.marketBoost?.type) boostMap.set(state.marketBoost.type, state.marketBoost.multiplier ?? 1.5);
      for (const d of (state.extraDemands || [])) boostMap.set(d.type, d.multiplier ?? 1.5);
      for (const [tier, def] of Object.entries(MINE_TIERS)) {
        for (const r of def.resources) {
          if (!resourceTier[r]) resourceTier[r] = { tier: Number(tier), label: def.label, color: def.color };
        }
      }
      tabContent = Object.entries(RESOURCE_DEFS).filter(([, def]) => !def.special).map(([key, def]) => {
        const tierInfo = resourceTier[key] || { label: def.special ? 'SPECIAL' : 'UNKNOWN', color: def.color || '#8ab' };
        const abundanceHint = getResourceAbundanceHint(key);
        const abundanceColor = abundanceHint === 'Abundant' ? '#78d69c' : abundanceHint === 'Uncommon' ? '#ffd36b' : '#ff8c8c';
        const mult = boostMap.get(key);
        const boost = Number.isFinite(mult);
        const sellDisplay = boost ? `<span style="color:#ffe066;">$${Math.round(def.sellPrice * mult)} ★ BOOSTED</span>` : `<span class="codex-resources-sell">$${def.sellPrice}</span>`;
        const powerOutput = getPowerFuelOutput(key);
        const powerDisplay = POWER_DISABLED_RESOURCES.has(key) || powerOutput <= 0
          ? `<span class="codex-resources-stat-value" style="color:#4a6a8a;">Not usable</span>`
          : `<span class="codex-resources-stat-value" style="color:#ffe066;">${POWER_RESOURCE_CONSUMPTION} ${def.label} = ${powerOutput}/s</span>`;
        return `<div class="codex-resources-card" style="border-left: 5px solid ${def.color};">
          <div class="codex-resources-header">
            <div class="codex-resources-icon-wrap">${resourceIconHtml(key, 64)}</div>
            <div class="codex-resources-copy">
              <div class="codex-resources-title-row">
                <div class="codex-resources-name">${def.label}</div>
                <span class="codex-resources-tier-pill" style="border:1px solid ${tierInfo.color}44;background:${tierInfo.color}18;color:${tierInfo.color};">${tierInfo.label}</span>
              </div>
              <div class="codex-resources-blurb">${def.blurb || 'Industrial resource used by frontier fleet operations.'}</div>
            </div>
          </div>
          <div class="codex-resources-stats">
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">SELL PRICE</span><br><span class="codex-resources-stat-value">${sellDisplay}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">MINE TIER</span><br><span class="codex-resources-stat-value">${tierInfo.label}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">FOUND IN BELT</span><br><span class="codex-resources-stat-value" style="color:${abundanceColor};">${abundanceHint}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">POWER OUTPUT</span><br>${powerDisplay}</div>
          </div>
        </div>`;
      }).join('');

    } else if (_codexTab === 'ships') {
      const UNIQUE_NAMES = {
        sentinel:  { name: 'Sentinel',       desc: 'Alien AI hunter — recovered from deep space wreckage' },
        serenity:  { name: 'Serenity',       desc: 'Firefly-class transport — "You can\'t take the sky from me"' },
        normandy:  { name: 'Normandy SR-2',  desc: 'Stealth frigate — fastest vessel ever commissioned' },
        ebon_hawk: { name: 'Ebon Hawk',      desc: 'Legendary smuggler vessel from a galaxy far, far away' },
      };

      // Helper: wraps a base value + optional MAX annotation in green
      const withMax = (base, maxVal) => {
        if (maxVal === null || maxVal === undefined) return String(base);
        return `${base} <span class="codex-ships-max">(${maxVal})</span>`;
      };

      const ROLE_GROUPS = [
        {
          role: 'mining', label: '⛏  MINING SHIPS', color: '#60d090',
          cols: ['SHIP','TIER','CARGO','FLY SPD','MINE SPD'],
          row: (id, s) => [
            withMax(s.capacity, profileMax(CARGO_PROFILE, id)),
            withMax(formatFlySpeed(s.flySpeed), profileMax(FLY_SPEED_PROFILE, id) !== null ? formatFlySpeed(profileMax(FLY_SPEED_PROFILE, id)) : null),
            withMax(formatMineSpeedPercent(s.mineSpeed), profileMax(MINE_SPEED_PROFILE, id) !== null ? `${Math.round(profileMax(MINE_SPEED_PROFILE, id)*10)}%` : null),
          ],
        },
        {
          role: 'transport', label: '▲  CARGO TRANSPORT', color: '#80d0ff',
          cols: ['SHIP','TIER','CARGO','FLY SPD','LOAD SPD'],
          row: (id, s) => [
            withMax(s.capacity, profileMax(CARGO_PROFILE, id)),
            withMax(formatFlySpeed(s.flySpeed), profileMax(FLY_SPEED_PROFILE, id) !== null ? formatFlySpeed(profileMax(FLY_SPEED_PROFILE, id)) : null),
            withMax(formatLoadSpeed(s.loadSpeed || 0), profileMax(LOAD_SPEED_PROFILE, id) !== null ? formatLoadSpeed(profileMax(LOAD_SPEED_PROFILE, id)) : null),
          ],
        },
        {
          role: 'combat', label: '⚔  COMBAT SHIPS', color: '#ff6060',
          cols: ['SHIP','TIER','HP','ATTACK','ATK RATE','FLY SPD'],
          row: (id, s) => [
            withMax((s.hp||0).toLocaleString(), profileMax(HP_PROFILE, id) !== null ? profileMax(HP_PROFILE, id).toLocaleString() : null),
            withMax(s.attack||0, profileMax(ATTACK_PROFILE, id)),
            withMax(formatAtkRatePercent(s.attackSpeed||0), profileMax(ATK_RATE_PROFILE, id) !== null ? `${Math.round(profileMax(ATK_RATE_PROFILE, id)*100)}%` : null),
            withMax(formatFlySpeed(s.flySpeed), profileMax(FLY_SPEED_PROFILE, id) !== null ? formatFlySpeed(profileMax(FLY_SPEED_PROFILE, id)) : null),
          ],
        },
        {
          role: 'garrison', label: '🛡  GARRISON', color: '#ff8c40',
          cols: ['SHIP','TIER','HP','ATTACK','RANGE','ATK RATE'],
          row: (id, s) => [
            (s.hp||0).toLocaleString(),
            s.attack||0,
            `${s.range||0} tiles`,
            formatAtkRatePercent(s.attackSpeed||0),
          ],
        },
        {
          role: 'unique', label: '★  UNIQUE SHIPS', color: '#ffffff',
          cols: ['SHIP','TIER','HP','CARGO','FLY SPD','ATTACK'],
          row: (id, s) => [
            (s.hp||0).toLocaleString(),
            s.capacity,
            formatFlySpeed(s.flySpeed),
            s.attack||'—',
          ],
        },
      ];

      tabContent = `<div class="codex-group-label codex-section-title">◈ SHIP CATALOG</div>` + ROLE_GROUPS.map(group => {
        const ships = Object.entries(SHIP_DEFS).filter(([,s]) => (s.role||'mining') === group.role);
        if (!ships.length) return '';

        const rows = ships.map(([shipId, stats]) => {
          const recipe    = CRAFT_RECIPES.find(r => r.id === shipId);
          const info      = UNIQUE_NAMES[shipId];
          const shipName  = recipe?.name || info?.name || shipId;
          const shipDesc  = recipe?.desc || info?.desc || '';
          const tierColor = MINE_TIERS[stats.mineTier]?.color || '#8ab';
          const cells     = group.row(shipId, stats);
          return `<tr>
            <td class="codex-ships-td">
              <div class="codex-ships-name"><span class="codex-ships-name-arrow" style="color:${group.color};">➤</span>${shipName}</div>
              ${shipDesc ? `<div class="codex-ships-desc">${shipDesc}</div>` : ''}
            </td>
            <td class="codex-ships-td">
              <span class="codex-ships-tier-pill" style="border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};">${toRoman(stats.mineTier)}</span>
            </td>
            ${cells.map(c => `<td class="codex-ships-td codex-ships-td-stat">${c}</td>`).join('')}
          </tr>`;
        }).join('');

        const extraCols = group.cols.length - 2;
        const colW = `${Math.floor(56 / extraCols)}%`;
        return `<div class="codex-ships-group-header" style="color:${group.color};border-bottom:1px solid ${group.color}33;">${group.label}</div>
          <table class="codex-ships-table">
            <colgroup>
              <col class="col-ship"><col class="col-tier">
              ${group.cols.slice(2).map(() => `<col style="width:${colW};">`).join('')}
            </colgroup>
            <thead><tr>
              <th class="codex-ships-th" style="color:${group.color};">SHIP</th>
              <th class="codex-ships-th" style="color:${group.color};">TIER</th>
              ${group.cols.slice(2).map(c => `<th class="codex-ships-th" style="color:${group.color};">${c}</th>`).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }).join('');
    } else if (_codexTab === 'turrets') {
      const turretDefs = [
        { id: 'turret', name: 'Automatic Turret', tier: 'Tier III', color: '#4a90e2', stats: [{ label: 'HEALTH', value: '5,000 -> 10,000 HP' }, { label: 'DAMAGE', value: '100 (+25/rank)' }, { label: 'FIRE RATE', value: '1/s (rank10: 5/s)' }, { label: 'RANGE', value: '2 tiles (MAX 5)' }], desc: 'Baseline autonomous defense platform. Tracks and fires automatically at hostile ships entering range.' },
        { id: 'laser_turret', name: 'Laser Turret', tier: 'Tier V', color: '#ffd700', stats: [{ label: 'HEALTH', value: '8,000 -> 16,000 HP' }, { label: 'DAMAGE', value: '500 (+40/rank)' }, { label: 'FIRE RATE', value: '15s (rank10: 5s)' }, { label: 'RANGE', value: '4 tiles (MAX 12)' }], desc: 'Fires a single high-damage beam burst, then enters a long recharge cycle before it can fire again.' },
        { id: 'emp_turret', name: 'EMP Turret', tier: 'Tier VII', color: '#ff60b0', stats: [{ label: 'HEALTH', value: '15,000 -> 30,000 HP' }, { label: 'DAMAGE', value: 'STUN 2s (rank10: 8s)' }, { label: 'FIRE RATE', value: '60s (rank10: 45s)' }, { label: 'RANGE', value: '3 tiles (MAX 15)' }, { label: 'POWER DRIVE', value: '200 (rank10: 800)' }], desc: 'Control platform that disables ship movement and firing while also dropping active defenses.' },
      ];
      const formatTurretStatValue = (value) => String(value)
        .replace(/\((\+[^)]*\/rank)\)/gi, '<span class="codex-turret-inc">($1)</span>')
        .replace(/\((rank10:[^)]+)\)/gi, '<span class="codex-turret-inc">($1)</span>')
        .replace(/\((MAX\s*\d+)\)/gi, '<br><span class="codex-turret-inc">($1)</span>');
      const turretRows = turretDefs.map(t => {
        return `<tr>
          <td class="codex-ships-td">
            <div class="codex-ships-name"><span class="codex-ships-name-arrow" style="color:${t.color};">➤</span>${t.name}</div>
            <div class="codex-ships-desc">${t.desc}</div>
          </td>
          <td class="codex-ships-td"><span class="codex-ships-tier-pill" style="border:1px solid ${t.color}44;background:${t.color}18;color:${t.color};">${t.tier.replace('Tier ', '')}</span></td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[0].value)}</td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[1].value)}</td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[2].value)}</td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[3].value)}</td>
        </tr>`;
      }).join('');

      tabContent = `<div class="codex-group-label codex-section-title">◈ DEFENSE TURRETS</div>
        <table class="codex-ships-table">
          <colgroup>
            <col class="col-ship">
            <col class="col-tier">
            <col style="width:14%;">
            <col style="width:14%;">
            <col style="width:14%;">
            <col style="width:14%;">
          </colgroup>
          <thead><tr>
            <th class="codex-ships-th" style="color:#4af;">TURRET</th>
            <th class="codex-ships-th" style="color:#4af;">TIER</th>
            <th class="codex-ships-th" style="color:#4af;">HEALTH</th>
            <th class="codex-ships-th" style="color:#4af;">DAMAGE</th>
            <th class="codex-ships-th" style="color:#4af;">FIRE RATE</th>
            <th class="codex-ships-th" style="color:#4af;">RANGE</th>
          </tr></thead>
          <tbody>${turretRows}</tbody>
        </table>`;
    } else if (_codexTab === 'storage') {
      const baseStorageStats = getModuleStats(STORAGE_FACILITY_ID, 1);
      tabContent = `
        <div class="codex-group-label codex-section-title">◈ STORAGE FACILITIES</div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">INDEPENDENT DEPOTS</div>
          <div class="codex-info-body">
            Storage Facilities are <strong style="color:#cde;">3x3 depot modules</strong> that ships can unload into instead of the Base Station.
            Cargo stored here is tracked in a <strong style="color:#cde;">separate inventory</strong> and does not automatically add to your global resource totals.
          </div>
        </div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">BASELINE STATS</div>
          <div class="codex-info-body">
            Health: <strong style="color:#ffe066;">${fmt(baseStorageStats.maxHealth)}</strong><br>
            Storage Capacity: <strong style="color:#ffe066;">${fmt(baseStorageStats.storageCapacity)}</strong><br>
            Power Capacity: <strong style="color:#ffe066;">${fmt(baseStorageStats.powerCapacity)}</strong><br>
            Power Usage: <strong style="color:#ffe066;">1/s to 10/s</strong> depending on how full the facility is.
          </div>
        </div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">POWER LOAD</div>
          <div class="codex-info-body">
            Storage power draw is dynamic. At <strong style="color:#cde;">0% usage</strong>, the facility drains <strong style="color:#ffe066;">1 power per second</strong>.
            At <strong style="color:#cde;">100% storage used</strong>, it drains <strong style="color:#ffe066;">10 power per second</strong>.
            As stored cargo rises, the power draw scales linearly between those values.
          </div>
        </div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">OFFLINE STATE</div>
          <div class="codex-info-body">
            If a facility loses all power or is fully destroyed, ships assigned to it cannot unload and will enter a <strong style="color:#cde;">holding pattern</strong> nearby until the depot becomes available again.
          </div>
        </div>`;
    } else if (_codexTab === 'upgrades') {
      const rpCapTable = Array.from({ length: 10 }, (_, i) => getResearchPointCap(i + 1));
      const rpCapRows = rpCapTable.map((cap, i) =>
        `<tr>
          <td class="codex-ships-td" style="color:${MINE_TIERS[i+1]?.color||'#8ab'};">Tier ${i+1}</td>
          <td class="codex-ships-td codex-ships-td-stat">${cap} RP</td>
        </tr>`
      ).join('');
      tabContent = `<div class="codex-group-label codex-section-title">◈ BASE UPGRADE COSTS</div>
        <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">TIER</th>
              <th style="text-align:right;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">COST</th>
            </tr>
          </thead>
          <tbody>
            ${BASE_UPGRADE_COSTS.map((cost, idx) => idx === 0 ? '' : `<tr>
              <td style="padding:6px 8px;color:#8ab;border-bottom:1px solid rgba(26,58,110,0.4);">Tier ${idx} → Tier ${idx + 1}</td>
              <td style="padding:6px 8px;text-align:right;color:#ffe066;font-weight:bold;border-bottom:1px solid rgba(26,58,110,0.4);">$${fmt(cost)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="codex-group-label codex-section-title">◈ RESEARCH POINT CAP PER BASE TIER</div>
        <div style="font-size:13px;color:#6a8aaa;margin-bottom:10px;">You earn +1 Research Point per SOL. The cap increases as your base tier advances.</div>
        <table class="codex-ships-table">
          <thead><tr>
            <th class="codex-ships-th" style="color:#4af;">BASE TIER</th>
            <th class="codex-ships-th" style="color:#4af;">MAX RP</th>
          </tr></thead>
          <tbody>${rpCapRows}</tbody>
        </table>`;
    } else {
      // Events tab
      const eventDefs = [
        {
          id: 'solar_flare', icon: '☀', label: 'Solar Flare',
          desc: 'An electromagnetic surge that destroys a percentage of exposed resource stockpiles. Oxygen is shielded.',
          effect: '⚡ Destroys a portion of your resource stockpile — Oxygen is immune. The higher the SOL, the greater the loss.',
        },
        {
          id: 'comet', icon: '☄', label: 'Comet Impact',
          desc: 'A comet strikes the base station, dealing structural damage that scales with SOL number. Repair via the Base Station.',
          effect: '💥 Deals direct damage to your base HP. Damage scales with SOL progression — repair from the Tower panel.',
        },
        {
          id: 'black_hole', icon: '●', label: 'Black Hole',
          desc: 'A temporary spatial anomaly forms somewhere in the sector, slowing ships that cross through its field until it collapses.',
          effect: '🌀 Lasts about 60 seconds. Ships whose route crosses the anomaly are slowed to 20% speed while it is active.',
        },
      ];
      tabContent = eventDefs.map(ev => {
        const count = state.eventCounts[ev.id] || 0;
        const encountered = count > 0;
        return `<div style="background:rgba(10,20,50,0.5);border:1px solid ${encountered?'#2a4a7a':'#1a2a4a'};border-radius:5px;padding:12px;margin-bottom:8px;${encountered?'':'opacity:0.5;'}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <span style="font-size:40px;line-height:1;padding-top:2px;">${ev.icon}</span>
              <div>
                <div style="font-family:'Orbitron',sans-serif;font-size:14px;color:${encountered?'#cde':'#4a6a8a'};letter-spacing:1px;">${ev.label}</div>
                <div style="font-size:10px;color:#3a5a7a;margin-top:1px;">${encountered?'ENCOUNTERED':'UNDISCOVERED'}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:'Orbitron',monospace;font-size:18px;color:${encountered?'#ffe066':'#3a5a7a'};font-weight:bold;">${count}</div>
              <div style="font-size:10px;color:#3a5a7a;">TIMES</div>
            </div>
          </div>
          <div style="font-size:14px;color:${encountered?'#7a9ab8':'#3a5a7a'};line-height:1.25;margin-bottom:${encountered?'8px':'0'};">${encountered ? ev.desc : '???'}</div>
          ${encountered ? `<div style="font-size:14px;color:#ffe066;line-height:1.35;border-top:1px solid #1a3a5a;padding-top:8px;">${ev.effect}</div>` : ''}
        </div>`;
      }).join('');
    }

    // ── RESEARCH ────────────────────────────────────────────────
    if (_codexTab === 'research') {
      const rows = RESEARCH_TREE.flatMap(tier => tier.unlocks.map(u => {
        const tierColor = MINE_TIERS[tier.tier]?.color || '#8ab';
        const maxCount = getRepeatableMax(u.id);
        const costLabel = u.repeatable ? `${u.cost} RP / level` : `${u.cost} RP`;
        const limitLabel = u.repeatable ? `MAX ${maxCount}` : 'ONE-TIME';
        return `<tr>
          <td class="codex-ships-td">
            <div class="codex-research-name"><span class="codex-research-icon">•</span>${u.name}</div>
            <div class="codex-ships-desc">${u.desc}</div>
          </td>
          <td class="codex-ships-td"><span class="codex-ships-tier-pill" style="border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};">${toRoman(tier.tier)}</span></td>
          <td class="codex-ships-td codex-ships-td-stat">${costLabel}</td>
          <td class="codex-ships-td codex-ships-td-stat">${limitLabel}</td>
        </tr>`;
      })).join('');

      tabContent = `<div class="codex-group-label codex-section-title">◈ RESEARCH TREE</div>
        <table class="codex-ships-table codex-research-table">
          <colgroup>
            <col style="width:56%;">
            <col style="width:10%;">
            <col style="width:17%;">
            <col style="width:17%;">
          </colgroup>
          <thead><tr>
            <th class="codex-ships-th">RESEARCH</th>
            <th class="codex-ships-th">TIER</th>
            <th class="codex-ships-th">COST</th>
            <th class="codex-ships-th">LIMIT</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

    // ── SECTOR ────────────────────────────────────────────────
    } else if (_codexTab === 'sector') {
      tabContent = `
        <div class="codex-group-label codex-section-title">◈ GALAXY: ANDROMEDA</div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">THE SECTOR</div>
          <div class="codex-info-body">
            You are operating in the <strong style="color:#cde;">Andromeda Galaxy</strong>, deep within an unmapped asteroid belt designated <strong style="color:#cde;">Sector 7-G</strong>.
            Rich in raw minerals and volatile compounds, this sector was flagged by long-range probes as a high-yield extraction zone.
            Your base station was deployed here to begin resource extraction and establish a permanent frontier presence.
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ SOL — SOLAR DAY</div>
        <div class="codex-info-card">
          <div class="codex-info-body">
            One <strong style="color:#ffe066;">SOL</strong> represents a single solar day in this sector — approximately <strong style="color:#cde;">3 Earth minutes</strong> in real time.
            Each SOL triggers market demand shifts, awards Research Points, and advances your operational timeline.
            Events such as solar flares and comet impacts are tied to SOL progression — the higher your SOL count, the greater the risk.
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ FLEET POWER</div>
        <div class="codex-info-card">
          <div class="codex-info-body">
            Fleet Power is a combined rating of your operational strength. It is calculated from three sources:
          </div>
          <div class="codex-sector-list">
            <div class="codex-sector-item">
              <span class="codex-sector-key ships">SHIPS</span>
              <span class="codex-sector-val">1 point per ship rank. A rank 10 ship contributes 10 Fleet Power.</span>
            </div>
            <div class="codex-sector-item">
              <span class="codex-sector-key turrets">TURRETS</span>
              <span class="codex-sector-val">2 points per turret rank.</span>
            </div>
            <div class="codex-sector-item">
              <span class="codex-sector-key base">BASE</span>
              <span class="codex-sector-val">10 points per base rank.</span>
            </div>
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ SECTOR STATUS</div>
        <div class="codex-sector-status-grid">
          <div class="codex-info-card codex-info-card-tight">
            <div class="codex-info-card-subtitle">PIRATE STATUS</div>
            <div class="codex-info-pending">— Data unavailable —</div>
          </div>
          <div class="codex-info-card codex-info-card-tight">
            <div class="codex-info-card-subtitle">THREAT LEVEL</div>
            <div class="codex-info-pending">— Data unavailable —</div>
          </div>
        </div>`;

    // ── TRADE ────────────────────────────────────────────────
    } else if (_codexTab === 'trade') {
      tabContent = `
        <div class="codex-group-label codex-section-title">◈ MARKET DEMAND</div>
        <div class="codex-trade-card">
          <div class="codex-trade-body">
            Every SOL, the market shifts demand to a random resource accessible in your sector.
            The <strong class="codex-trade-emph">boosted resource</strong> sells at a multiplied rate between <strong class="codex-trade-emph-soft">1.2×</strong> and <strong class="codex-trade-emph-soft">2.0×</strong> its base price for that SOL.
            Only resources from nodes reachable at your current base tier are eligible for the demand boost.
            Watch the trade panel each SOL — timing your sales around demand spikes is one of the most effective ways to grow your credits quickly.
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ BASE SELL PRICES</div>
        <div class="codex-trade-note">Prices below reflect standard market rate. Demand boosts apply on top of these values each SOL.</div>
        <table class="codex-ships-table">
          <thead><tr>
            <th class="codex-ships-th codex-trade-th">RESOURCE</th>
            <th class="codex-ships-th codex-trade-th">TIER</th>
            <th class="codex-ships-th codex-trade-th">BASE PRICE</th>
          </tr></thead>
          <tbody>
            ${Object.entries(RESOURCE_DEFS).map(([key, def]) => {
              const tierInfo = (() => { for (const [t,td] of Object.entries(MINE_TIERS)) if (td.resources.includes(key)) return td; return null; })();
              return `<tr>
                <td class="codex-ships-td codex-trade-resource">
                  ${resourceIconHtml(key, 16, 'margin-right:7px;')}${def.label}
                </td>
                <td class="codex-ships-td"><span class="codex-trade-tier-pill" style="border-color:${tierInfo?.color||'#8ab'}44;background:${tierInfo?.color||'#8ab'}18;color:${tierInfo?.color||'#8ab'};">${tierInfo?.label||'—'}</span></td>
                <td class="codex-ships-td codex-ships-td-stat">$${def.sellPrice}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        <div class="codex-group-label codex-section-title">◈ TAX & TRADE FEES</div>
        <div class="codex-trade-card">
          <div class="codex-trade-pending">— Trade fee data pending sector clearance —</div>
        </div>`;
    }

    body.innerHTML = `<div class="codex-layout">${tabBar}<div class="codex-content">${tabContent}</div></div>`;
  }
}

// Global onclick bindings used by HTML
window.closeHdrPanel  = closeHdrPanel;
window.dismissHdrModal = dismissHdrModal;
window.handleBasePanelOverlayClick = handleBasePanelOverlayClick;
