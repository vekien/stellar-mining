// ============================================================
// HEADER PANELS — SOL overview, research, market, fleet, codex
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFTS, CRAFT_SHIPS as CRAFT_RECIPES, getCraft } from '../data/crafts.js';
import {
  SHIP_DEFS, SHIP_TIER_COSTS, toRoman,
  formatFlySpeed, formatMineSpeedPercent, formatLoadSpeedPercent, formatAtkRatePercent,
  profileMax,
  CARGO_PROFILE, FLY_SPEED_PROFILE, MINE_SPEED_PROFILE, LOAD_SPEED_PROFILE,
  HP_PROFILE, ATTACK_PROFILE, ATK_RATE_PROFILE,
} from '../data/ships.js';
import { NODE_BANDS } from '../data/nodes.js';
import { BASE_MAX_SHIPS, BASE_UPGRADE_COSTS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { RESEARCH_TREE, DEFENSE_DAMAGE_REDUCTION } from '../data/research.js';
import { TURRET_BASE_STATS } from '../data/turrets.js';
import { fmt } from '../helpers.js';
import { getSellPrice } from '../systems/market.js';
import { cancelTurretPlacement } from './turretUI.js';
import { renderBasePanel } from './basePanel.js';
import { removeReassignTooltip, renderTutPointers } from './tutorial.js';

// Keep craft timer progress bars live while the CRAFT panel is open
setInterval(() => {
  if (window._hdrPanelOpen !== 'craft') return;
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!overlay?.classList.contains('open')) return;
  if (!state.shipCraftTimers) return;
  for (const [recipeId, timer] of Object.entries(state.shipCraftTimers)) {
    if (!timer || Date.now() >= timer.endsAt) continue;
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillEl  = document.getElementById(`craft-fill-${recipeId}`);
    const labelEl = document.getElementById(`craft-label-${recipeId}`);
    if (fillEl)  fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
}, 100);

let _hdrPanelOpen = null;
let _codexTab = 'crew';
let _fleetCompSig = '';
let _fleetSortKey = 'name';
let _fleetSortDir = 1;
let _stockpileMineableKeys = null;

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
  if (_hdrPanelOpen === 'resources') return;
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

  // Resource stockpile per tier — only show resources at least one ship can mine
  const mineableSet = new Set(Object.entries(nodesByType).filter(([,d]) => d.mineable).map(([k]) => k));
  _stockpileMineableKeys = mineableSet;
  const stockpileSections = Object.entries(MINE_TIERS).map(([tier, tierInfo]) => {
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
      return `<div id="stockpile-card-${k}" style="border:1px solid #1a3a6e;border-left:5px solid ${def.color};border-radius:6px;padding:8px 10px;display:flex;align-items:center;gap:8px;${cardBg}${cardBorder}">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${def.color};flex-shrink:0;box-shadow:0 0 6px ${def.color}99;"></span>
        <span style="font-family:'Orbitron',sans-serif;font-size:12px;color:#cde;letter-spacing:1px;flex:1;">${def.label}${alert}</span>
        <span id="stockpile-val-${k}" style="font-size:15px;font-weight:bold;color:${v===0?'#4a6a8a':'#ffe066'};font-family:'Share Tech Mono',monospace;">${fmt(v)}</span>
        <span style="margin-left:6px;font-size:11px;color:#cde;">(${d.total} Nodes)</span>
      </div>`;
    }).filter(Boolean).join('');
    if (!cards) return '';
    return `<div style="margin-bottom:14px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:${tierInfo.color};margin-bottom:7px;padding-bottom:4px;border-bottom:1px solid ${tierInfo.color}55;">${tierInfo.label}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">${cards}</div>
    </div>`;
  }).join('');

  return `
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      ${statCard('SHIPS', `${state.ships.length}/${maxShips}`)}
      ${statCard('ASSIGNED', assigned, assigned > 0 ? '#4d8' : '#f88')}
      ${statCard('IDLE', idle, idle > 0 ? '#f88' : '#4d8')}
      ${statCard('NODES', `${occupiedNodes}/${totalNodes}`, occupiedNodes === totalNodes ? '#4d8' : '#ffe066')}
    </div>
    <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:10px;">◈ RESOURCE STOCKPILE</div>
    ${stockpileSections || '<div style="padding:10px;color:#3a5a7a;font-size:14px;">No accessible nodes yet.</div>'}
    <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:8px;margin-top:4px;">◈ YIELD RATE</div>
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
    card.style.borderColor = noShips ? '#803020' : '#1a3a6e';
    card.style.borderLeftColor = noShips ? '#f44' : def.color;
    card.style.background = noShips ? 'rgba(60,10,10,0.45)' : 'rgba(10,20,50,0.6)';
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
  const MODAL_WIDTHS = { fleet: '1100px', codex: '1200px' };
  document.getElementById('hdr-modal').style.width = MODAL_WIDTHS[type] || '';

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

    // Advance tutorial: step 5 (point at CRAFT button) → step 6 (point at SHIPS tab)
    if (state.tutStep === 5) { state.tutStep = 6; requestAnimationFrame(() => renderTutPointers()); }

    const bl = state.base.level;
    const maxShips = BASE_MAX_SHIPS[bl - 1] || 5;
    const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;
    const atCap = (state.ships.length + activeCraftCount) >= maxShips;
    const activeCraftTab = body.dataset.craftTab || 'ships';

    const craftTabDefs = [
      { id: 'ships',   label: 'SHIPS',   icon: '▲' },
      { id: 'defense', label: 'DEFENSE', icon: '🛡' },
      { id: 'modules', label: 'MODULES', icon: '⬡' },
    ];
    const tabBar = craftTabDefs.map(t =>
      `<button id="craft-tab-${t.id}" onclick="setCraftTab('${t.id}')" style="flex:1;padding:8px 4px;background:${activeCraftTab===t.id?'rgba(30,60,120,0.7)':'transparent'};border:none;border-bottom:2px solid ${activeCraftTab===t.id?'#4af':'transparent'};color:${activeCraftTab===t.id?'#4af':'#4a6a8a'};font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:1px;cursor:pointer;">${t.icon} ${t.label}</button>`
    ).join('');

    let tabContent = '';

    if (activeCraftTab === 'ships') {
      const ROLE_META = {
        mining:    { label: '⛏  MINING SHIPS',    color: '#60d090' },
        transport: { label: '▲  CARGO TRANSPORT',  color: '#80d0ff' },
        combat:    { label: '⚔  COMBAT SHIPS',     color: '#ff6060' },
        garrison:  { label: '🛡  GARRISON',         color: '#ff8c40' },
      };

      const roleOrder = ['mining', 'transport', 'combat', 'garrison'];
      let items = atCap
        ? `<div style="font-size:16px;color:#f88;background:rgba(60,10,10,0.4);border:1px solid #803020;border-radius:3px;padding:6px 8px;margin-bottom:8px;text-align:center;">⚠ Ship capacity full (${state.ships.length + activeCraftCount}/${maxShips}).<br>Upgrade the Base or sell a ship.</div>`
        : '';

      for (const role of roleOrder) {
        const meta = ROLE_META[role];
        const groupRecipes = CRAFT_RECIPES.filter(r => {
          const s = SHIP_DEFS[r.id];
          return s && (s.role || 'mining') === role && s.mineTier <= bl;
        });
        if (!groupRecipes.length) continue;

        items += `<div style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:${meta.color};margin:12px 0 8px;padding-bottom:5px;border-bottom:1px solid ${meta.color}33;">${meta.label}</div>`;

        for (const recipe of groupRecipes) {
          const stats     = SHIP_DEFS[recipe.id] || SHIP_DEFS.scout;
          const sc        = meta.color;
          const tierColor = MINE_TIERS[stats.mineTier]?.color || '#fff';
          const reqsMet   = Object.entries(recipe.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
          const canCraft  = reqsMet && !atCap;

          let reqsHtml = '';
          for (const [r, n] of Object.entries(recipe.reqs)) {
            const met = (state.resources[r] || 0) >= n;
            reqsHtml += `<span class="bp-craft-req ${met?'met':'unmet'}" style="font-size:14px;">${RESOURCE_DEFS[r].label}: ${n}</span>`;
          }

          const ic = 'color:#4a7aaa;';
          let statsHtml = '';
          if (stats.role === 'combat' || stats.role === 'garrison') {
            statsHtml = `<div style="display:flex;gap:10px;font-size:14px;flex-wrap:wrap;">
              <span style="color:#cde;"><span style="${ic}">❤</span> ${(stats.hp||0).toLocaleString()}</span>
              <span style="color:#cde;"><span style="${ic}">⚔</span> ${stats.attack||0} atk</span>
            </div>`;
          } else if (stats.role === 'transport') {
            statsHtml = `<div style="display:flex;gap:10px;font-size:14px;flex-wrap:wrap;">
              <span style="color:#cde;"><span style="${ic}">▲</span> ${stats.capacity}u</span>
              <span style="color:#cde;"><span style="${ic}">✈</span> ${formatFlySpeed(stats.flySpeed)}</span>
            </div>`;
          } else {
            statsHtml = `<div style="display:flex;gap:10px;font-size:14px;flex-wrap:wrap;">
              <span style="color:#cde;"><span style="${ic}">▲</span> ${stats.capacity}u</span>
              <span style="color:#cde;"><span style="${ic}">✈</span> ${formatFlySpeed(stats.flySpeed)}</span>
              <span style="color:#cde;"><span style="${ic}">⛏</span> ${formatMineSpeedPercent(stats.mineSpeed)}</span>
            </div>`;
          }

          const craftTimer = state.shipCraftTimers?.[recipe.id];
          const timerActive = !!(craftTimer && Date.now() < craftTimer.endsAt);
          const remainMs  = timerActive ? Math.max(0, craftTimer.endsAt - Date.now()) : 0;
          const remainSec = Math.ceil(remainMs / 1000);
          const pct = timerActive ? Math.max(0, Math.min(100, ((craftTimer.durationMs - remainMs) / craftTimer.durationMs) * 100)) : 0;
          const builtNoticeUntil  = state.shipCraftNotices?.[recipe.id] || 0;
          const builtNoticeActive = Date.now() < builtNoticeUntil;

          const buildBtn = builtNoticeActive
            ? `<button class="btn bp-craft-btn bp-craft-btn-ready" style="width:100%;margin-top:6px;" disabled><span class="bp-craft-btn-label">SHIP BUILT AND DEPLOYED!</span></button>`
            : timerActive
            ? `<button class="btn bp-craft-btn bp-craft-btn-crafting" style="width:100%;margin-top:6px;" disabled><span class="bp-craft-btn-fill" id="craft-fill-${recipe.id}" style="width:${pct}%;"></span><span class="bp-craft-btn-label" id="craft-label-${recipe.id}">CRAFTING ${remainSec}s</span></button>`
            : `<button class="btn ${atCap?'danger':'primary'}" style="width:100%;margin-top:6px;" ${!canCraft?'disabled':''} onclick="startCraftShip('${recipe.id}')">BUILD SHIP</button>`;

          items += `<div class="bp-craft-item">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="color:${sc};font-size:15px;filter:drop-shadow(0 0 5px ${sc}66);">▲</span>
              <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
                <span style="font-family:'Orbitron',sans-serif;font-size:15px;font-weight:700;color:#e8eef8;letter-spacing:1px;text-transform:uppercase;">${recipe.name}</span>
                <span style="font-size:13px;color:#5a7a9a;font-style:italic;">${recipe.desc}</span>
              </div>
              <span style="font-size:13px;padding:2px 8px;border-radius:3px;border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};font-family:'Cinzel',serif;font-weight:600;flex-shrink:0;">${toRoman(stats.mineTier)}</span>
              <span style="font-size:13px;padding:2px 8px;border-radius:3px;border:1px solid ${sc}33;background:${sc}12;color:${sc};font-family:'Orbitron',sans-serif;letter-spacing:1px;flex-shrink:0;text-transform:uppercase;">${stats.role||'mining'}</span>
            </div>
            <table style="width:100%;border-collapse:collapse;border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
              <tr>
                <th style="padding:6px 0;color:#3a6a9a;font-size:11px;letter-spacing:1px;text-align:left;border-bottom:1px solid #1a3a6e;border-right:1px solid #1a3a6e;font-family:'Orbitron',sans-serif;font-weight:600;background:rgba(6,14,38,0.6);">REQUIRED RESOURCES</th>
                <th style="padding:6px 10px;color:#3a6a9a;font-size:11px;letter-spacing:1px;text-align:left;border-bottom:1px solid #1a3a6e;font-family:'Orbitron',sans-serif;font-weight:600;background:rgba(6,14,38,0.6);">SHIP STATS</th>
              </tr>
              <tr>
                <td style="padding:8px 0;vertical-align:top;border-right:1px solid #1a3a6e;width:50%;"><div class="bp-craft-reqs" style="margin-top:0;">${reqsHtml}</div></td>
                <td style="padding:8px 10px;vertical-align:middle;width:50%;">${statsHtml}</td>
              </tr>
            </table>
            ${buildBtn}
          </div>`;
        }
      }

      if (items === '' || (atCap && items.trim().endsWith('</div>'))) {
        items += `<div style="font-size:14px;color:#4a6a8a;text-align:center;padding:20px;">No ships available at current base tier.</div>`;
      }

      tabContent = `<div style="font-size:12px;color:#3a6a9a;margin-bottom:10px;display:flex;align-items:center;gap:8px;"><span>Ships in fleet: <strong style="color:#cde;">${state.ships.length + activeCraftCount}</strong> / ${maxShips}</span></div><div class="bp-craft-grid">${items}</div>`;

      // Tutorial scroll-to
      if (state.tutStep === 7) {
        requestAnimationFrame(() => {
          const btn = document.querySelector('#hdr-modal-body .bp-craft-item .btn');
          if (btn?.scrollIntoView) btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }

    } else if (activeCraftTab === 'defense') {
      const turretsUnlocked = state.researchUnlocks['turrets'];
      const defenseUnlocked = state.researchUnlocks['defense'];
      const turretCount = (state.turrets || []).length;
      let defHtml = '';

      if (!turretsUnlocked && !defenseUnlocked) {
        defHtml = `<div style="padding:16px;background:rgba(20,50,100,0.2);border:1px solid #1a3a6e;border-radius:4px;text-align:center;color:#4a6a8a;font-size:15px;">
          🔒 No defense systems unlocked yet.<br><br>
          <span style="font-size:13px;">Visit the <strong style="color:#8ab">Research panel</strong> to unlock Turret Systems.</span>
        </div>`;
      }

      if (defenseUnlocked) {
        defHtml += `<div style="background:rgba(10,30,60,0.5);border:1px solid #2a4a7a;border-radius:5px;padding:10px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:20px;">🛡</span>
            <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#ffe066;letter-spacing:1px;">ARMOR PLATING</div>
            <span style="margin-left:auto;font-size:12px;color:#4d8;background:rgba(20,60,30,0.4);border:1px solid #2a6040;border-radius:3px;padding:1px 6px;">ACTIVE</span>
          </div>
          <div style="font-size:14px;color:#5a7a9a;">Incoming base damage reduced by <strong style="color:#cde;">${Math.round(DEFENSE_DAMAGE_REDUCTION * 100)}%</strong>.</div>
        </div>`;
      }

      if (turretsUnlocked) {
        const turretCraft = getCraft('turrets', 'turret');
        const canCoins = state.coins >= turretCraft.cost;
        const reqsMet  = Object.entries(turretCraft.reqs).map(([r, n]) => [(state.resources[r] || 0) >= n, r, n]);
        const canBuild = canCoins && reqsMet.every(([met]) => met);
        const pill    = (met, label) => `<span class="bp-craft-req" style="font-size:14px;border-color:${met?'#7a6010':'#802020'};background:${met?'rgba(60,45,0,0.4)':'rgba(60,10,10,0.4)'};color:${met?'#ffe066':'#f88'};">${label}</span>`;
        const resPill = (met, label) => `<span class="bp-craft-req ${met?'met':'unmet'}" style="font-size:14px;">${label}</span>`;
        const resPills = reqsMet.map(([met, r, n]) => resPill(met, `${r[0].toUpperCase()+r.slice(1)}: ${n}`)).join('');
        defHtml += `<div style="background:rgba(10,30,60,0.5);border:1px solid #2a4a7a;border-radius:5px;padding:10px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:20px;">🔫</span>
            <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">TURRET SYSTEMS</div>
            <span style="margin-left:auto;font-size:13px;color:#8ab;">${turretCount} built</span>
          </div>
          <div style="font-size:14px;color:#5a7a9a;margin-bottom:8px;">Build turrets on free map tiles to defend your base. Each turret has ${TURRET_BASE_STATS.health.toLocaleString()} HP, ${TURRET_BASE_STATS.damage} damage and ${TURRET_BASE_STATS.range}-tile range.</div>
          <div class="bp-craft-reqs" style="margin-bottom:8px;">${pill(canCoins, '$' + turretCraft.cost)}${resPills}</div>
          ${state.unplacedTurrets > 0
            ? `<button class="btn primary" style="width:100%;font-size:14px;" onclick="beginPlacingTurret()">🔫 PLACE TURRET (${state.unplacedTurrets})</button>`
            : `<button class="btn primary" style="width:100%;font-size:14px;" ${canBuild?'':'disabled'} onclick="startPlaceTurret()">🔫 BUILD TURRET</button>`
          }
        </div>`;
      }

      tabContent = defHtml;

    } else {
      tabContent = `<div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:24px;text-align:center;opacity:0.6;margin-top:8px;">
        <div style="font-size:22px;margin-bottom:8px;">⬡</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:#4af;margin-bottom:8px;">COMING SOON</div>
        <div style="font-size:12px;color:#4a6a8a;">More fabrication options will be available in a future update.</div>
      </div>`;
    }

    body.innerHTML = `<div style="display:flex;border-bottom:1px solid #1a3a6e;margin-bottom:14px;">${tabBar}</div>${tabContent}`;
    body.dataset.craftTab = activeCraftTab;
    window.setCraftTab = (id) => {
      body.dataset.craftTab = id;
      if (id === 'ships' && state.tutStep === 6) { state.tutStep = 7; }
      _hdrPanelOpen = null;
      openHdrPanel('craft');
    };
  }

  // ── RESEARCH ───────────────────────────────────────────────
  else if (type === 'research') {
    const rpCap = state.base.level * (state.base.level + 1) / 2;
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
          <div style="font-size:13px;color:#6f97bc;margin-top:2px;">+1 per SOL</div>
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
      { id: 'resources',label: 'Resources' },
      { id: 'ships',    label: 'Ships' },
      { id: 'upgrades', label: 'Base Upgrades' },
      { id: 'research', label: 'Research' },
      { id: 'sector',   label: 'Sector' },
      { id: 'trade',    label: 'Trade' },
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
        const abundanceColor = abundanceHint === 'Abundant' ? '#78d69c' : abundanceHint === 'Uncommon' ? '#ffd36b' : '#ff8c8c';
        const boost = state.marketBoost && state.marketBoost.type === key;
        const mult = state.marketBoost?.multiplier ?? 1.5;
        const sellDisplay = boost ? `<span style="color:#ffe066;">$${Math.round(def.sellPrice * mult)} ★ BOOSTED</span>` : `<span class="codex-resources-sell">$${def.sellPrice}</span>`;
        return `<div class="codex-resources-card" style="border-left: 8px solid ${def.color};">
          <div class="codex-resources-header">
            <div class="codex-resources-dot" style="background:${def.color};box-shadow:0 0 8px ${def.color}88;"></div>
            <div class="codex-resources-name">${def.label}</div>
            <span class="codex-resources-tier-pill" style="border:1px solid ${tierInfo.color}44;background:${tierInfo.color}18;color:${tierInfo.color};">${tierInfo.label}</span>
          </div>
          <div class="codex-resources-blurb">${def.blurb || 'Industrial resource used by frontier fleet operations.'}</div>
          <div class="codex-resources-stats">
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">SELL PRICE</span><br><span class="codex-resources-stat-value">${sellDisplay}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">MINE TIER</span><br><span class="codex-resources-stat-value">${tierInfo.label}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">FOUND IN BELT</span><br><span class="codex-resources-stat-value" style="color:${abundanceColor};">${abundanceHint}</span></div>
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
            withMax(formatLoadSpeedPercent(s.loadSpeed || 0), profileMax(LOAD_SPEED_PROFILE, id) !== null ? `${Math.round(profileMax(LOAD_SPEED_PROFILE, id)*10)}%` : null),
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
    } else if (_codexTab === 'upgrades') {
      tabContent = `<div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin:12px 0 8px;">◈ BASE UPGRADE COSTS</div>
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

    // ── RESEARCH ────────────────────────────────────────────────
    if (_codexTab === 'research') {
      const rpCapTable = [1,3,6,10,15,21,28,36,45,55];
      const rpCapRows = rpCapTable.map((cap, i) =>
        `<tr>
          <td class="codex-ships-td" style="color:${MINE_TIERS[i+1]?.color||'#8ab'};">Tier ${i+1}</td>
          <td class="codex-ships-td codex-ships-td-stat">${cap} RP</td>
        </tr>`
      ).join('');

      const researchItems = [
        {
          icon: '💪', name: 'HP Boost',
          tier: 'Base Tier 1', cost: '1 RP per purchase', max: '10 purchases (+25,000 HP total)',
          purpose: 'Increases base station max health by 2,500 HP per purchase. Stacks up to 10 times for a total of +25,000 HP on top of your base tier health.',
        },
        {
          icon: '🔫', name: 'Turret Systems',
          tier: 'Base Tier 3', cost: '1 RP', max: 'One-time unlock',
          purpose: 'Unlocks the ability to construct and place defensive turrets on the map. Turrets automatically engage enemy ships within their range and are essential for base defense during raids.',
        },
        {
          icon: '🛡', name: 'Armor Plating',
          tier: 'Base Tier 3', cost: '2 RP', max: 'One-time unlock',
          purpose: 'Permanently reduces all incoming damage to the base station by 10%. Stacks with turret defense. Recommended before advancing into higher-threat sectors.',
        },
      ];

      const itemCards = researchItems.map(r => `
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
            <span style="font-size:24px;line-height:1;">${r.icon}</span>
            <div style="flex:1;">
              <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">${r.name}</div>
              <div style="font-size:11px;color:#4a7aaa;margin-top:1px;letter-spacing:1px;">${r.tier}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:#ffe066;">${r.cost}</div>
              <div style="font-size:10px;color:#4a6a8a;margin-top:1px;">${r.max}</div>
            </div>
          </div>
          <div style="font-size:13px;color:#6a8aaa;line-height:1.4;border-top:1px solid #1a3a5a;padding-top:8px;">${r.purpose}</div>
        </div>`).join('');

      tabContent = `
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin-bottom:10px;">◈ RESEARCH TREE</div>
        ${itemCards}
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin:16px 0 10px;">◈ RESEARCH POINT CAP PER BASE TIER</div>
        <div style="font-size:13px;color:#6a8aaa;margin-bottom:10px;">You earn +1 Research Point per SOL. The cap increases as your base tier advances.</div>
        <table class="codex-ships-table">
          <thead><tr>
            <th class="codex-ships-th" style="color:#4af;">BASE TIER</th>
            <th class="codex-ships-th" style="color:#4af;">MAX RP</th>
          </tr></thead>
          <tbody>${rpCapRows}</tbody>
        </table>`;

    // ── SECTOR ────────────────────────────────────────────────
    } else if (_codexTab === 'sector') {
      tabContent = `
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin-bottom:10px;">◈ GALAXY: ANDROMEDA</div>
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;margin-bottom:6px;">THE SECTOR</div>
          <div style="font-size:13px;color:#6a8aaa;line-height:1.5;">
            You are operating in the <strong style="color:#cde;">Andromeda Galaxy</strong>, deep within an unmapped asteroid belt designated <strong style="color:#cde;">Sector 7-G</strong>.
            Rich in raw minerals and volatile compounds, this sector was flagged by long-range probes as a high-yield extraction zone.
            Your base station was deployed here to begin resource extraction and establish a permanent frontier presence.
          </div>
        </div>

        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin:16px 0 10px;">◈ SOL — SOLAR DAY</div>
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="font-size:13px;color:#6a8aaa;line-height:1.5;">
            One <strong style="color:#ffe066;">SOL</strong> represents a single solar day in this sector — approximately <strong style="color:#cde;">3 Earth minutes</strong> in real time.
            Each SOL triggers market demand shifts, awards Research Points, and advances your operational timeline.
            Events such as solar flares and comet impacts are tied to SOL progression — the higher your SOL count, the greater the risk.
          </div>
        </div>

        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin:16px 0 10px;">◈ FLEET POWER</div>
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="font-size:13px;color:#6a8aaa;line-height:1.5;">
            Fleet Power is a combined rating of your operational strength. It is calculated from three sources:
          </div>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="font-family:'Orbitron',sans-serif;font-size:10px;color:#4af;letter-spacing:1px;width:80px;flex-shrink:0;">SHIPS</span>
              <span style="color:#8ab;">Sum of all ship upgrade levels (cargo + fly speed + mine/load speed)</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="font-family:'Orbitron',sans-serif;font-size:10px;color:#ff8c40;letter-spacing:1px;width:80px;flex-shrink:0;">TURRETS</span>
              <span style="color:#8ab;">Sum of all placed turret levels</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;">
              <span style="font-family:'Orbitron',sans-serif;font-size:10px;color:#60d090;letter-spacing:1px;width:80px;flex-shrink:0;">BASE</span>
              <span style="color:#8ab;">Your current base tier level</span>
            </div>
          </div>
        </div>

        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin:16px 0 10px;">◈ SECTOR STATUS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;">
            <div style="font-family:'Orbitron',sans-serif;font-size:10px;color:#4a7aaa;letter-spacing:1px;margin-bottom:6px;">PIRATE STATUS</div>
            <div style="font-size:13px;color:#4a6a8a;font-style:italic;">— Data unavailable —</div>
          </div>
          <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;">
            <div style="font-family:'Orbitron',sans-serif;font-size:10px;color:#4a7aaa;letter-spacing:1px;margin-bottom:6px;">THREAT LEVEL</div>
            <div style="font-size:13px;color:#4a6a8a;font-style:italic;">— Data unavailable —</div>
          </div>
        </div>`;

    // ── TRADE ────────────────────────────────────────────────
    } else if (_codexTab === 'trade') {
      tabContent = `
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin-bottom:10px;">◈ MARKET DEMAND</div>
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="font-size:13px;color:#6a8aaa;line-height:1.5;">
            Every SOL, the market shifts demand to a random resource accessible in your sector.
            The <strong style="color:#ffe066;">boosted resource</strong> sells at a multiplied rate between <strong style="color:#cde;">1.2×</strong> and <strong style="color:#cde;">2.0×</strong> its base price for that SOL.
            Only resources from nodes reachable at your current base tier are eligible for the demand boost.
            Watch the trade panel each SOL — timing your sales around demand spikes is one of the most effective ways to grow your credits quickly.
          </div>
        </div>

        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin:16px 0 10px;">◈ BASE SELL PRICES</div>
        <div style="font-size:13px;color:#6a8aaa;margin-bottom:10px;">Prices below reflect standard market rate. Demand boosts apply on top of these values each SOL.</div>
        <table class="codex-ships-table">
          <thead><tr>
            <th class="codex-ships-th" style="color:#4af;">RESOURCE</th>
            <th class="codex-ships-th" style="color:#4af;">TIER</th>
            <th class="codex-ships-th" style="color:#4af;">BASE PRICE</th>
          </tr></thead>
          <tbody>
            ${Object.entries(RESOURCE_DEFS).map(([key, def]) => {
              const tierInfo = (() => { for (const [t,td] of Object.entries(MINE_TIERS)) if (td.resources.includes(key)) return td; return null; })();
              return `<tr>
                <td class="codex-ships-td" style="color:#e8eef8;font-family:'Orbitron',sans-serif;font-size:11px;">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${def.color};margin-right:7px;vertical-align:middle;"></span>${def.label}
                </td>
                <td class="codex-ships-td"><span style="font-size:11px;padding:1px 6px;border-radius:3px;border:1px solid ${tierInfo?.color||'#8ab'}44;background:${tierInfo?.color||'#8ab'}18;color:${tierInfo?.color||'#8ab'};">${tierInfo?.label||'—'}</span></td>
                <td class="codex-ships-td codex-ships-td-stat">$${def.sellPrice}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#4af;letter-spacing:2px;margin:16px 0 10px;">◈ TAX & TRADE FEES</div>
        <div style="background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:12px 14px;">
          <div style="font-size:13px;color:#4a6a8a;font-style:italic;">— Trade fee data pending sector clearance —</div>
        </div>`;
    }

    body.innerHTML = `<div style="display:flex;gap:14px;align-items:flex-start;">${tabBar}<div style="flex:1;min-width:0;">${tabContent}</div></div>`;
  }
}

// Global onclick bindings used by HTML
window.closeHdrPanel  = closeHdrPanel;
window.dismissHdrModal = dismissHdrModal;
window.handleBasePanelOverlayClick = handleBasePanelOverlayClick;
