// ============================================================
// HEADER PANELS — SOL overview, research, market, fleet, codex
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { SHIP_DEFS, SHIP_TIER_COSTS, toRoman } from '../data/ships.js';
import { NODE_BANDS } from '../data/nodes.js';
import { BASE_MAX_SHIPS, BASE_UPGRADE_COSTS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { RESEARCH_TREE } from '../data/research.js';
import { fmt } from '../helpers.js';
import { getSellPrice } from '../systems/market.js';
import { cancelTurretPlacement } from './turretUI.js';
import { renderBasePanel } from './basePanel.js';
import { removeReassignTooltip } from './tutorial.js';

let _hdrPanelOpen = null;
let _codexTab = 'crew';
let _fleetCompSig = '';
let _fleetSortKey = 'name';
let _fleetSortDir = 1;

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
    const shipPow   = state.ships.reduce((s, sh) => s + (sh.capacityLevel||0) + (sh.flySpeedLevel||0) + (sh.mineSpeedLevel||0), 0);
    const turretPow = state.turrets.reduce((s, t) => s + (t.level||1), 0);
    const basePow   = state.base.level || 1;
    const el = document.getElementById('sol-fleet-power');
    const bd = document.getElementById('sol-fleet-breakdown');
    if (el) el.textContent = shipPow + turretPow + basePow;
    if (bd) bd.textContent = `SHP ${shipPow} · TUR ${turretPow} · BASE ${basePow}`;
  }
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
    : '— Idle';
}

function getShipNodeLabel(ship) {
  const node = state.nodes.find(n => n.id === ship.targetNode);
  return node ? RESOURCE_DEFS[node.type].label : '—';
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
  return `<th onclick="sortFleetManifest('${key}')" style="cursor:pointer;user-select:none;white-space:nowrap;">${label} <span style="color:${_fleetSortKey===key?'#8fc3ff':'#4a6a8a'};font-size:11px;">${sortArrowFor(key)}</span></th>`;
}

function buildFleetCompositionHtml(typeCounts, shipCount, maxShips) {
  const compositionHeaders = Object.keys(typeCounts);
  const compositionValues = compositionHeaders.map((key) => typeCounts[key]);
  if (!compositionHeaders.length) return '<div style="font-size:13px;color:#3a5a7a;margin-bottom:12px;">No ships in fleet yet.</div>';
  const countStr = (shipCount !== undefined && maxShips !== undefined) ? `${shipCount}/${maxShips} SHIPS — ` : '';
  return `<div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ ${countStr}FLEET COMPOSITION</div>
    <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #3a6aa8;border-radius:4px;overflow:hidden;margin-bottom:12px;box-shadow:0 0 0 1px rgba(110,170,255,0.18) inset;">
      <tr>${compositionHeaders.map(name => `<td style="padding:8px 10px;color:#8ab;font-size:13px;border-bottom:1px solid #2a4f80;">${name}</td>`).join('')}</tr>
      <tr>${compositionValues.map(value => `<td style="padding:8px 10px;color:#cde;font-size:18px;font-weight:bold;">${value}</td>`).join('')}</tr>
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
    const tier = shipTierPill(ship);
    const cargo = `${ship.cargo}/${ship.capacity}`;

    const nodeEl = row.querySelector('[data-cell="node"]');
    const statusEl = row.querySelector('[data-cell="status"]');
    const cargoEl = row.querySelector('[data-cell="cargo"]');
    const tierEl = row.querySelector('[data-cell="tier"]');
    if (nodeEl && nodeEl.textContent !== nodeLabel) nodeEl.textContent = nodeLabel;
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
  if (e.target === document.getElementById('base-panel-overlay')) {
    state.basePanelOpen = false;
    renderBasePanel();
  }
}

function switchCodexTab(tab) {
  _codexTab = tab;
  _hdrPanelOpen = null; // prevent toggle-off
  openHdrPanel('codex');
}
window.switchCodexTab = switchCodexTab;

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
    `<div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:10px 14px;flex:1;min-width:0;text-align:center;">
      <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4a6a8a;margin-bottom:6px;">${label}</div>
      <div style="font-size:20px;font-weight:bold;color:${color};font-family:'Share Tech Mono',monospace;" id="stat-${label.replace(/\s/g,'_')}">${value}</div>
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
      <div style="width:10px;height:10px;border-radius:50%;background:${def.color};flex-shrink:0;box-shadow:0 0 6px ${def.color}88;"></div>
      <div style="flex:1;color:#8ab;font-size:14px;">${def.label}</div>
      <div style="font-size:11px;color:${tierColor};font-family:'Orbitron',sans-serif;letter-spacing:1px;margin-right:8px;">T${tierEntry?.[0]??'?'}</div>
      <div style="font-size:14px;font-weight:bold;color:${allFull?'#4d8':'#ffe066'};">${d.occupied}/${d.total}</div>
      ${suffix}
    </div>`;
  }).join('');

  return `
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      ${statCard('SHIPS', `${state.ships.length}/${maxShips}`)}
      ${statCard('ASSIGNED', assigned, assigned > 0 ? '#4d8' : '#f88')}
      ${statCard('IDLE', idle, idle > 0 ? '#f88' : '#4d8')}
      ${statCard('NODES', `${occupiedNodes}/${totalNodes}`, occupiedNodes === totalNodes ? '#4d8' : '#ffe066')}
    </div>
    <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ NODE ASSIGNMENTS</div>
    <div style="background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:5px;overflow:hidden;margin-bottom:16px;" id="stats-nodes-list">
      ${nodeRows || '<div style="padding:10px;color:#3a5a7a;font-size:14px;">No accessible nodes yet.</div>'}
    </div>
    <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ YIELD RATE</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;" id="stats-yield-list">
      ${buildYieldHtml(nodesByType)}
    </div>`;
}

function buildYieldHtml(nodesByType) {
  const entries = Object.entries(nodesByType).filter(([,d]) => d.yield > 0);
  if (!entries.length) return '<div style="color:#3a5a7a;font-size:14px;padding:4px 0;">No active mining.</div>';
  return entries.map(([type, d]) => {
    const def = RESOURCE_DEFS[type];
    return `<div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:8px 14px;display:flex;align-items:center;gap:8px;">
      <div style="width:8px;height:8px;border-radius:50%;background:${def.color};"></div>
      <span style="color:#8ab;font-size:13px;">${def.label}</span>
      <span style="color:#ffe066;font-weight:bold;font-size:14px;" id="stats-yield-${type}">${Math.round(d.yield)}/m</span>
    </div>`;
  }).join('');
}

export function patchStatsPanel() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (_hdrPanelOpen !== 'stats' || !overlay?.classList.contains('open')) return;
  const { maxShips, assigned, idle, totalNodes, occupiedNodes, nodesByType } = buildStatsData();

  const set = (id, val) => { const el = document.getElementById(id); if (el && el.textContent !== String(val)) el.textContent = val; };
  set('stat-SHIPS', `${state.ships.length}/${maxShips}`);
  set('stat-ASSIGNED', assigned);
  set('stat-IDLE', idle);
  set('stat-NODES', `${occupiedNodes}/${totalNodes}`);

  for (const [type, d] of Object.entries(nodesByType)) {
    set(`stats-yield-${type}`, `${Math.round(d.yield)}/m`);
    const row = document.getElementById(`stats-node-${type}`);
    if (row) {
      const unoccupied = d.total - d.occupied;
      const allFull = unoccupied === 0;
      const countEl = row.querySelector('[data-count]');
      // Update via full node row if count changed — rows are cheap, list stays stable
      const current = row.getAttribute('data-occ');
      if (current !== String(d.occupied)) {
        row.setAttribute('data-occ', d.occupied);
        const unmined = !d.mineable;
        const noShips = d.occupied === 0 && d.mineable;
        row.style.background = unmined ? 'rgba(20,20,30,0.3)' : noShips ? 'rgba(80,10,10,0.35)' : '';
        row.style.opacity = unmined ? '0.5' : '';
        const def = RESOURCE_DEFS[type];
        const tierEntry = Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(type));
        const tierColor = tierEntry ? (MINE_TIERS[tierEntry[0]].color || '#8ab') : '#8ab';
        const suffix = unmined
          ? `<div style="font-size:11px;color:#4a5a7a;min-width:100px;text-align:right;font-style:italic;">no ship can mine</div>`
          : unoccupied > 0
            ? `<div style="font-size:12px;color:#f66;min-width:60px;text-align:right;">${unoccupied} empty</div>`
            : `<div style="min-width:60px;"></div>`;
        row.innerHTML = `
          <div style="width:10px;height:10px;border-radius:50%;background:${def.color};flex-shrink:0;box-shadow:0 0 6px ${def.color}88;"></div>
          <div style="flex:1;color:#8ab;font-size:14px;">${def.label}</div>
          <div style="font-size:11px;color:${tierColor};font-family:'Orbitron',sans-serif;letter-spacing:1px;margin-right:8px;">T${tierEntry?.[0]??'?'}</div>
          <div style="font-size:14px;font-weight:bold;color:${allFull?'#4d8':'#ffe066'};">${d.occupied}/${d.total}</div>
          ${suffix}`;
      }
    }
  }
  // Patch yield list only if set changed
  const yieldEl = document.getElementById('stats-yield-list');
  if (yieldEl) {
    const hasYield = Object.values(nodesByType).some(d => d.yield > 0);
    const hasEl    = yieldEl.querySelector('[id^="stats-yield-"]');
    if (hasYield !== !!hasEl) yieldEl.innerHTML = buildYieldHtml(nodesByType);
  }
}

export function openHdrPanel(type) {
  const overlay = document.getElementById('hdr-modal-overlay');
  const heading = document.getElementById('hdr-modal-heading');
  const body    = document.getElementById('hdr-modal-body');

  if (_hdrPanelOpen === type && overlay.classList.contains('open')) {
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
  if (type === 'market' && state.tutStep === 10) {
    state.tutStep = 11;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }
  _hdrPanelOpen = type;
  overlay.classList.add('open');
  document.getElementById('hdr-modal').style.width = type === 'fleet' ? '1100px' : '';

  if (type === 'research' && state.seenMsgs['dax_lv3_intro'] && state.seenMsgs['kai_lv3_intro']) {
    state.seenMsgs['lv3_research_pointer_done'] = true;
    document.querySelectorAll('#tut-ptr-research-lv3').forEach(el => el.remove());
  }

  // ── SOL OVERVIEW ───────────────────────────────────────────
  if (type === 'sol') {
    heading.textContent = 'SECTOR OVERVIEW';
    const shipPow   = state.ships.reduce((s, sh) => s + (sh.capacityLevel||0) + (sh.flySpeedLevel||0) + (sh.mineSpeedLevel||0), 0);
    const turretPow = state.turrets.reduce((s, t) => s + (t.level||1), 0);
    const basePow   = state.base.level || 1;
    const fleetPower = shipPow + turretPow + basePow;
    body.innerHTML = `
      <div style="margin-bottom:14px;padding:10px 12px;background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:28px;font-weight:800;letter-spacing:5px;color:#b060ff;text-shadow:0 0 24px #9030ffaa,0 0 8px #6010cc88;margin-top:-8px;">ANDROMEDA</div>
        <div id="sol-sector-label" style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ KEPLER-7 SECTOR — SOL ${state.sol}</div>
        <div style="font-size:14px;color:#5a8aaa;line-height:1.25;margin-bottom:8px;">Deep in the outer rim, where stellar winds thin and ancient ore drifts unclaimed — your operation pushes further each cycle.</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#4af;letter-spacing:1px;">1 SOL = 3 EARTH MINUTES</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:rgba(5,30,80,0.45);border:1px solid #1a5aaa;border-radius:5px;padding:10px 12px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:4px;">◈ FLEET POWER</div>
          <div id="sol-fleet-power" style="font-size:20px;font-weight:bold;color:#4af;line-height:1;">${fleetPower}</div>
          <div id="sol-fleet-breakdown" style="font-size:10px;color:#3a6a9a;margin-top:4px;">SHP ${shipPow} · TUR ${turretPow} · BASE ${basePow}</div>
        </div>
        <div style="background:rgba(80,10,10,0.35);border:1px solid #802030;border-radius:5px;padding:10px 12px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#f88;margin-bottom:4px;">⚑ PIRATE STATUS</div>
          <div style="font-size:15px;font-weight:bold;color:#f88;">Unknown</div>
        </div>
        <div style="background:rgba(80,50,0,0.35);border:1px solid #805020;border-radius:5px;padding:10px 12px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#fa8;margin-bottom:4px;">⬡ THREAT LEVEL</div>
          <div style="font-size:15px;font-weight:bold;color:#fa8;">Moderate</div>
        </div>
      </div>
      <div style="border-top:1px solid #1a3a6e;padding-top:14px;margin-top:2px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:10px;">◈ GALAXY PROBE — COMING SOON</div>
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:14px;text-align:center;opacity:0.5;">
          <div style="font-size:22px;margin-bottom:6px;">🛸</div>
          <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:4px;">DEEP SPACE PROBES</div>
          <div style="font-size:12px;color:#4a6a8a;">Launch probes to distant systems to discover rare resources, anomalies, and uncharted territories.</div>
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
    const tabBar = cmdTabs.map(t => `<button onclick="setCmdTab('${t.id}')" style="flex:1;padding:8px 4px;background:${activeCmd===t.id?'rgba(30,60,120,0.7)':'transparent'};border:none;border-bottom:2px solid ${activeCmd===t.id?'#4af':'transparent'};color:${activeCmd===t.id?'#4af':'#4a6a8a'};font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:1px;cursor:pointer;">${t.icon} ${t.label}</button>`).join('');
    const placeholders = {
      missions: { icon: '◈', title: 'MAIN MISSIONS', desc: 'Story-driven command missions with NPC transmissions, objectives, and sector-altering consequences. Follow the Andromeda narrative arc.' },
      quests:   { icon: '⬡', title: 'ACTIVE QUESTS', desc: 'Rotating short-term objectives refreshed each SOL. Collect resources, hit milestones, and earn bonus rewards.' },
      bounties: { icon: '⚑', title: 'BOUNTY BOARD',  desc: 'Pirate targets and faction contracts posted each SOL. Requires combat capability. Rewards scale with threat level.' },
      rep:      { icon: '★', title: 'REPUTATION',    desc: 'Your standing with Outer Rim Collective, Helix Corp, Vanguard Fleet, and the Black Market. Affects prices, access, and story outcomes.' },
    };
    const p = placeholders[activeCmd];
    body.innerHTML = `
      <div style="display:flex;border-bottom:1px solid #1a3a6e;margin-bottom:14px;">${tabBar}</div>
      <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:20px;text-align:center;opacity:0.6;">
        <div style="font-size:28px;margin-bottom:8px;">${p.icon}</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:13px;letter-spacing:2px;color:#4af;margin-bottom:10px;">${p.title}</div>
        <div style="font-size:13px;color:#4a6a8a;line-height:1.6;max-width:340px;margin:0 auto;">${p.desc}</div>
        <div style="margin-top:16px;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:3px;color:#2a4a6a;">— COMING SOON —</div>
      </div>`;
    body.dataset.cmdTab = activeCmd;
    window.setCmdTab = (id) => { body.dataset.cmdTab = id; _hdrPanelOpen = null; openHdrPanel('command'); };
  }

  // ── CRAFT ─────────────────────────────────────────────────
  else if (type === 'craft') {
    heading.textContent = 'FABRICATION';
    const craftSections = [
      { icon: '💾', title: 'COMPONENTS',   desc: 'Craft intermediate components like Computers, MicroProcessors, and Flux Capacitors required for advanced ship construction.' },
      { icon: '⚡', title: 'POWER CELLS',  desc: 'Fabricate power cells and energy modules to fuel base infrastructure and power-hungry upgrades.' },
      { icon: '🛡', title: 'MODULES',      desc: 'Build defensive and utility modules that slot into ships or the base station for enhanced capabilities.' },
    ];
    body.innerHTML = `
      <div style="font-size:13px;color:#5a8aaa;margin-bottom:14px;line-height:1.5;">The Fabricator converts raw resources into refined components, unlocking advanced ship builds and base upgrades.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${craftSections.map(s => `
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:14px;display:flex;align-items:flex-start;gap:12px;opacity:0.6;">
          <span style="font-size:22px;flex-shrink:0;">${s.icon}</span>
          <div>
            <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:5px;">${s.title}</div>
            <div style="font-size:12px;color:#4a6a8a;line-height:1.5;">${s.desc}</div>
          </div>
          <div style="margin-left:auto;font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#2a4a6a;flex-shrink:0;align-self:center;">SOON</div>
        </div>`).join('')}
      </div>`;
  }

  // ── RESEARCH ───────────────────────────────────────────────
  else if (type === 'research') {
    const rpCap = 2 + (state.base.level - 1);
    const formatResearchDesc = (desc) => desc.replace(/(\d[\d,]*(?:\.\d+)?(?:\s*HP|%)?)/g, '<span style="color:#ffe066;">$1</span>');
    heading.textContent = 'RESEARCH';
    let treeHtml = '';
    for (const tier of RESEARCH_TREE) {
      const tierLocked = tier.minBaseLevel && state.base.level < tier.minBaseLevel;
      treeHtml += `<div style="margin-bottom:12px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:${tierLocked?'#3a5a7a':'#4af'};margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #1a3a6e;">
          ${tier.label}${tierLocked?' <span style="color:#f88;font-size:11px;">— Requires Base Upgrade</span>':''}
        </div>`;
      for (const u of tier.unlocks) {
        const isUnlocked = state.researchUnlocks[u.id];
        const canAfford  = state.rp >= u.cost;
        const tierReqMet = !tier.minBaseLevel || state.base.level >= tier.minBaseLevel;
        const count = u.id === 'hp_boost' ? state.hpBoostCount : (isUnlocked ? 1 : 0);
        const capReached = u.id === 'hp_boost' && count >= 10;
        const purchasable = tierReqMet && canAfford && (!isUnlocked || u.repeatable) && !capReached;
        treeHtml += `<div style="background:rgba(10,20,50,0.5);border:1px solid ${isUnlocked?'#2a5090':'#1a2a4a'};border-radius:5px;padding:10px;margin-bottom:6px;${tierLocked?'opacity:0.4;':''}">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <span style="font-size:18px;flex-shrink:0;">${u.icon}</span>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;gap:8px;">
                <div style="font-family:'Orbitron',sans-serif;font-size:16px;color:${isUnlocked?'#ffe066':'#cde'};letter-spacing:1px;">${u.name}</div>
                ${u.repeatable && count > 0 ? `<span style="font-size:16px;color:#ffe066;">×${count}</span>` : ''}
                ${isUnlocked && !u.repeatable ? `<span style="font-size:10px;color:#4d8;background:rgba(20,60,30,0.4);border:1px solid #2a6040;border-radius:3px;padding:1px 5px;">✓ UNLOCKED</span>` : ''}
              </div>
              <div style="font-size:14px;color:#5a7a9a;margin-top:2px;line-height:1.25;margin-bottom:8px;">${formatResearchDesc(u.desc)}</div>
              ${(!isUnlocked || u.repeatable) && tierReqMet ? `
              <button class="btn${purchasable?' primary':''}" style="font-size:12px;padding:5px 16px;" ${purchasable?'':'disabled'} onclick="purchaseResearch('${u.id}')">
                ${capReached ? 'MAXED' : `<span style="color:${canAfford?'#ffe066':'#f88'};margin-right:6px;">${u.cost} RP</span> — UNLOCK`}
              </button>` : ''}
            </div>
          </div>
        </div>`;
      }
      treeHtml += '</div>';
    }
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0 12px;border-bottom:1px solid #1a3a6e;margin-bottom:12px;">
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:3px;">RESEARCH POINTS</div>
          <div style="font-size:24px;color:#ffe066;font-weight:bold;">🔬 ${state.rp} <span style="font-size:14px;color:#4a6a8a;">/ ${rpCap}</span></div>
          <div style="font-size:13px;color:#6f97bc;margin-top:2px;">+1 per SOL · cap increases with base level</div>
        </div>
      </div>
      ${treeHtml}`;
  }

  // ── MARKET ─────────────────────────────────────────────────
  else if (type === 'market') {
    heading.textContent = 'TRADE';
    const hasAny = Object.values(state.resources).some(v => v > 0);
    let tradeHtml = '';
    if (state.marketBoost) {
      const bd = RESOURCE_DEFS[state.marketBoost.type];
      const boostMult = state.marketBoost.multiplier ?? 1.5;
      tradeHtml += `<div style="background:linear-gradient(180deg, rgba(10,30,70,0.9) 0%, rgba(6,16,48,0.94) 100%);border:1px solid #4aa8ff;border-radius:6px;padding:10px 12px;margin-bottom:12px;text-align:center;line-height:1.2;box-shadow:0 0 16px rgba(80,170,255,0.35), 0 0 28px rgba(60,140,255,0.18), inset 0 0 16px rgba(90,180,255,0.14);">
        <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:1.5px;color:#9be89b;margin-bottom:4px;">SOL ${state.sol} - DEMAND</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:20px;font-weight:700;color:${bd.color};text-shadow:0 0 10px ${bd.color}55;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${bd.color};display:inline-block;box-shadow:0 0 8px ${bd.color}aa;"></span>
          <span>${bd.label}<span style="display:inline-block;width:22px;"></span><span style="color:#ffe066;">${boostMult}x!</span></span>
        </div>
      </div>`;
    }
    if (!hasAny) {
      tradeHtml += `<div style="padding:14px;text-align:center;color:#3a5a7a;font-size:13px;">⏳ No resources to sell yet.</div>`;
    } else {
      tradeHtml += '<div class="sell-grid">';
      for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
        const amt = state.resources[type] || 0;
        if (amt <= 0) continue;
        const sellAmt = amt < 100 ? 1 : amt < 1000 ? 10 : amt < 10000 ? 25 : 100;
        const price   = getSellPrice(type);
        const earnedSellAmt = sellAmt * price;
        const earnedAll = amt * price;
        const boosted = state.marketBoost?.type === type;
        const priceHtml = boosted
          ? `<span style="color:#6fff9a;font-size:14px;flex-shrink:0">$${price} <span title="Market boosted this SOL — ${state.marketBoost?.multiplier ?? 1.5}× sell price!" style="cursor:help;">✦</span></span>`
          : `<span style="color:#6fff9a;font-size:14px;flex-shrink:0">$${price}</span>`;
        tradeHtml += `<div class="sell-row">
          <span style="width:9px;height:9px;border-radius:50%;background:${def.color};display:inline-block;flex-shrink:0"></span>
          ${priceHtml}
          <span class="res-name-s">${def.label}</span>
          <span class="res-qty">${fmt(amt)}</span>
          <button class="sell-btn-s" onmousedown="sellResource('${type}',${sellAmt});_hdrPanelOpen=null;openHdrPanel('market')">SELL ${fmt(sellAmt)} <span style="color:#ffe066">· $${fmt(earnedSellAmt)}</span></button>
          <button class="sell-btn-s" onmousedown="sellResource('${type}',100);_hdrPanelOpen=null;openHdrPanel('market')" ${amt < 100 ? 'disabled' : ''}>SELL 100 <span style="color:#ffe066">· $${fmt(100 * price)}</span></button>
          <button class="sell-btn-s" onmousedown="sellResource('${type}',${amt});_hdrPanelOpen=null;openHdrPanel('market')">ALL <span style="color:#ffe066">· $${fmt(earnedAll)}</span></button>
        </div>`;
      }
      tradeHtml += '</div>';
    }
    const totalResources = Object.values(state.resources).reduce((sum, n) => sum + (n || 0), 0);
    body.innerHTML = `
      <div style="padding:12px 0 14px;border-bottom:1px solid #1a3a6e;margin-bottom:12px;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;align-items:end;">
        <div>
          <div style="font-size:30px;color:#ffe066;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">$${fmt(state.coins)}</div>
          <div style="font-size:13px;color:#7fa4c8;margin-top:4px;letter-spacing:0.8px;">CURRENT BALANCE</div>
        </div>
        <div>
          <div style="font-size:22px;color:#cde;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">${fmt(totalResources)}</div>
          <div style="font-size:13px;color:#7fa4c8;margin-top:4px;letter-spacing:0.8px;">CURRENT RESOURCES</div>
        </div>
        <div>
          <div style="font-size:22px;color:#cde;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">0%</div>
          <div style="font-size:13px;color:#7fa4c8;margin-top:4px;letter-spacing:0.8px;">TAX RATE</div>
        </div>
      </div>
      <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ SELL RESOURCES</div>
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
    const noWrap  = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    const rows = getSortedFleetShips().map(s => {
      const typeName = getShipTypeName(s);
      const status = getShipStatusLabel(s);
      const role = (SHIP_DEFS[s.type]?.role || 'mining');
      const totalLevel = (s.capacityLevel || 0) + (s.flySpeedLevel || 0) + (s.mineSpeedLevel || 0);
      const sellVal = getShipSellValue(s);
      return `<tr data-ship-id="${s.id}">
        <td style="color:#ffe066;font-weight:bold;">${totalLevel}</td>
        <td style="${noWrap}">${s.name}</td>
        <td style="${noWrap}">${typeName}</td>
        <td style="text-transform:capitalize;${noWrap}">${role}</td>
        <td data-cell="tier">${shipTierPill(s)}</td>
        <td data-cell="node" style="${noWrap}">${getShipNodeLabel(s)}</td>
        <td data-cell="status" style="${noWrap}">${status}</td>
        <td data-cell="cargo" style="color:#ffe066;${noWrap}">${s.cargo}/${s.capacity}</td>
        <td style="color:#6fff9a;${noWrap}">${fmtSell(sellVal)}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `
      <div id="fleet-composition-wrap">${compositionHtml}</div>
      <table class="fleet-table" style="table-layout:fixed;width:100%;">
        <colgroup>
          <col style="width:5%;">
          <col style="width:17%;">
          <col style="width:14%;">
          <col style="width:9%;">
          <col style="width:7%;">
          <col style="width:12%;">
          <col style="width:12%;">
          <col style="width:12%;">
          <col style="width:12%;">
        </colgroup>
        <thead><tr>${fleetHeaderCell('LV', 'level')}${fleetHeaderCell('NAME', 'name')}${fleetHeaderCell('TYPE', 'type')}${fleetHeaderCell('ROLE', 'role')}${fleetHeaderCell('TIER', 'tier')}${fleetHeaderCell('NODE', 'node')}${fleetHeaderCell('STATUS', 'status')}${fleetHeaderCell('CARGO', 'cargo')}${fleetHeaderCell('SELL', 'sell')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── OPERATIONS STATS ───────────────────────────────────────
  else if (type === 'stats') {
    heading.textContent = 'OPERATIONS STATS';
    body.innerHTML = buildStatsHtml();
  }

  // ── CODEX ──────────────────────────────────────────────────
  else if (type === 'codex') {
    heading.textContent = 'CODEX';
    const codexTabs = [
      { id: 'crew', label: 'Crew & Contacts' },
      { id: 'events', label: 'Events' },
      { id: 'resources', label: 'Resources' },
      { id: 'ships', label: 'Ships' },
      { id: 'upgrades', label: 'Base Upgrades' },
    ];
    const tabBar = `<div style="width:190px;flex-shrink:0;border-right:1px solid #1a3a6e;padding-right:10px;">
      ${codexTabs.map(tab => `<button onclick="event.stopPropagation();switchCodexTab('${tab.id}')" style="width:100%;text-align:left;padding:9px 10px;margin-bottom:6px;font-family:'Orbitron',monospace;font-size:11px;letter-spacing:1.3px;border:1px solid ${_codexTab===tab.id?'#2f6fb8':'#1a3458'};border-left:3px solid ${_codexTab===tab.id?'#4af':'#24466f'};border-radius:4px;background:${_codexTab===tab.id?'rgba(16,48,90,0.45)':'rgba(8,18,40,0.4)'};color:${_codexTab===tab.id?'#8fd0ff':'#5f7fa0'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">${tab.label}</button>`).join('')}
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

    } else if (_codexTab === 'resources') {
      const resourceTier = {};
      for (const [tier, def] of Object.entries(MINE_TIERS)) {
        for (const r of def.resources) {
          if (!resourceTier[r]) resourceTier[r] = { tier: Number(tier), label: def.label, color: def.color };
        }
      }
      tabContent = Object.entries(RESOURCE_DEFS).map(([key, def]) => {
        const tierInfo = resourceTier[key];
        const abundanceHint = getResourceAbundanceHint(key);
        const boost = state.marketBoost && state.marketBoost.type === key;
        const mult = state.marketBoost?.multiplier ?? 1.5;
        const sellDisplay = boost ? `<span style="color:#ffe066;">$${Math.round(def.sellPrice * mult)} ★ BOOSTED</span>` : `<span style="color:#6fff9a;">$${def.sellPrice}</span>`;
        return `<div style="background:rgba(10,20,50,0.5);border:1px solid #1e3a6e;border-left:3px solid ${def.color};border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:14px;height:14px;border-radius:50%;background:${def.color};flex-shrink:0;box-shadow:0 0 8px ${def.color}88;"></div>
            <div style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;color:#e8eef8;letter-spacing:1px;flex:1;">${def.label}</div>
            <span style="font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid ${tierInfo.color}44;background:${tierInfo.color}18;color:${tierInfo.color};font-family:'Orbitron',sans-serif;letter-spacing:1px;">${tierInfo.label}</span>
          </div>
          <div style="font-size:14px;color:#6a8aaa;line-height:1.25;margin-bottom:10px;">${def.blurb || 'Industrial resource used by frontier fleet operations.'}</div>
          <div style="display:flex;align-items:stretch;font-size:11px;border-top:1px solid #1a3a5a;padding-top:10px;">
             <div style="flex:1;padding-right:16px;"><span style="color:#3a6a9a;font-size:12px;letter-spacing:0.5px;">SELL PRICE</span><br><span style="color:#4d8;font-family:'Share Tech Mono',monospace;font-size:16px;">${sellDisplay}</span></div>
             <div style="width:1px;background:#1e3a6e;align-self:stretch;margin:0 4px;"></div>
             <div style="flex:1;padding:0 16px;"><span style="color:#3a6a9a;font-size:12px;letter-spacing:0.5px;">MINE TIER</span><br><span style="color:#cde;font-family:'Share Tech Mono',monospace;font-size:16px;">${tierInfo.label}</span></div>
             <div style="width:1px;background:#1e3a6e;align-self:stretch;margin:0 4px;"></div>
             <div style="flex:1;padding-left:16px;"><span style="color:#3a6a9a;font-size:12px;letter-spacing:0.5px;">FOUND IN BELT</span><br><span style="color:${abundanceHint === 'Abundant' ? '#78d69c' : abundanceHint === 'Uncommon' ? '#ffd36b' : '#ff8c8c'};font-family:'Share Tech Mono',monospace;font-size:16px;">${abundanceHint}</span></div>
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

      const ROLE_GROUPS = [
        {
          role: 'mining',    label: '⛏  MINING SHIPS',    color: '#60d090',
          cols: ['SHIP','TIER','CARGO','FLY SPD','MINE SPD','TURN RAD'],
          row: (id, s) => [s.capacity, `${s.flySpeed.toFixed(2)}x`, `${s.mineSpeed.toFixed(2)}x`, s.turnRadius.toFixed(2)],
        },
        {
          role: 'transport', label: '▲  CARGO TRANSPORT',  color: '#80d0ff',
          cols: ['SHIP','TIER','CARGO','FLY SPD','TURN RAD'],
          row: (id, s) => [s.capacity, `${s.flySpeed.toFixed(2)}x`, s.turnRadius.toFixed(2)],
        },
        {
          role: 'combat',    label: '⚔  COMBAT SHIPS',    color: '#ff6060',
          cols: ['SHIP','TIER','HP','ATTACK','ATK RATE','FLY SPD'],
          row: (id, s) => [(s.hp||0).toLocaleString(), s.attack||0, `${s.attackSpeed||0}x`, `${s.flySpeed.toFixed(2)}x`],
        },
        {
          role: 'garrison',  label: '🛡  GARRISON',        color: '#ff8c40',
          cols: ['SHIP','TIER','HP','ATTACK','RANGE','ATK RATE'],
          row: (id, s) => [(s.hp||0).toLocaleString(), s.attack||0, `${s.range||0} tiles`, `${s.attackSpeed||0}x`],
        },
        {
          role: 'unique',    label: '★  UNIQUE SHIPS',    color: '#ffffff',
          cols: ['SHIP','TIER','HP','CARGO','FLY SPD','ATTACK'],
          row: (id, s) => [(s.hp||0).toLocaleString(), s.capacity, `${s.flySpeed.toFixed(2)}x`, s.attack||'—'],
        },
      ];

      const thStyle = 'text-align:left;padding:6px 8px;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;';
      const tdStyle = 'padding:7px 8px;border-bottom:1px solid rgba(26,58,110,0.4);';

      tabContent = ROLE_GROUPS.map(group => {
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
            <td style="${tdStyle}">
              <div style="color:#e8eef8;font-family:'Orbitron',sans-serif;font-size:12px;letter-spacing:1px;"><span style="color:${group.color};margin-right:5px;">➤</span>${shipName}</div>
              ${shipDesc ? `<div style="color:#5a7a9a;font-size:12px;font-style:italic;margin-top:2px;">${shipDesc}</div>` : ''}
            </td>
            <td style="${tdStyle}"><span style="font-size:13px;padding:2px 7px;border-radius:3px;border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};font-family:'Cinzel',serif;font-weight:600;">${toRoman(stats.mineTier)}</span></td>
            ${cells.map(c => `<td style="${tdStyle}color:#cde;font-family:'Share Tech Mono',monospace;">${c}</td>`).join('')}
          </tr>`;
        }).join('');

        const extraCols = group.cols.length - 2;
        const colW = `${Math.floor(56 / extraCols)}%`;
        return `<div style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:${group.color};margin:14px 0 7px;padding-bottom:5px;border-bottom:1px solid ${group.color}33;">${group.label}</div>
          <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;margin-bottom:4px;table-layout:fixed;">
            <colgroup>
              <col style="width:34%;"><col style="width:10%;">
              ${group.cols.slice(2).map(() => `<col style="width:${colW};">`).join('')}
            </colgroup>
            <thead><tr>
              <th style="${thStyle}color:${group.color};">SHIP</th>
              <th style="${thStyle}color:${group.color};">TIER</th>
              ${group.cols.slice(2).map(c => `<th style="${thStyle}color:${group.color};">${c}</th>`).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }).join('');
    } else if (_codexTab === 'upgrades') {
      tabContent = `<div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin:12px 0 8px;">◈ BASE UPGRADE COSTS</div>
        <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">LEVEL</th>
              <th style="text-align:right;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">COST</th>
            </tr>
          </thead>
          <tbody>
            ${BASE_UPGRADE_COSTS.map((cost, idx) => idx === 0 ? '' : `<tr>
              <td style="padding:6px 8px;color:#8ab;border-bottom:1px solid rgba(26,58,110,0.4);">Lv ${idx} -> Lv ${idx + 1}</td>
              <td style="padding:6px 8px;text-align:right;color:#ffe066;font-weight:bold;border-bottom:1px solid rgba(26,58,110,0.4);">$${fmt(cost)}</td>
            </tr>`).join('')}
          </tbody>
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

    body.innerHTML = `<div style="display:flex;gap:14px;align-items:flex-start;">${tabBar}<div style="flex:1;min-width:0;">${tabContent}</div></div>`;
  }
}

// Global onclick bindings used by HTML
window.closeHdrPanel  = closeHdrPanel;
window.dismissHdrModal = dismissHdrModal;
window.handleBasePanelOverlayClick = handleBasePanelOverlayClick;
