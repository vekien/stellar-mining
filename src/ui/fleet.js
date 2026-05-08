// ============================================================
// FLEET UI — ship list, filters, action panel, trade tab
// ============================================================
import { state } from '../state.js';
import { isStorageModule, isPowerStationModule, getModuleFreeCapacity } from '../data/modules.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import {
  SHIP_DEFS, TIER_COLORS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
  UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST,
  UPGRADE_LOAD_COST, UPGRADE_HP_COST, UPGRADE_ATTACK_COST, UPGRADE_ATK_RATE_COST,
  upgradeTotalCost, toRoman,
  formatFlySpeed, formatMineSpeedPercent, formatLoadSpeed, formatAtkRatePercent,
  capacityFromTierAndLevel, flySpeedFromLevel, mineSpeedFromLevel,
  loadSpeedFromLevel, hpFromLevel, attackFromLevel, atkRateFromLevel, getShipSalvageRewards,
} from '../data/ships.js';
import { SHIP_TIER_REQS } from '../data/base.js';
import { BASE_POS, cam, ZOOM_MAX_V, focusOn, gridToWorld } from '../render/camera.js';
import { TILE_H } from '../constants.js';
import { fmt, addLog } from '../helpers.js';
import { refresh } from './refresh.js';
import { getSellPrice } from '../systems/market.js';
import { removeReassignTooltip, showReassignTooltip, checkTradeTutorial, renderTutPointers } from './tutorial.js';
import { cancelTurretPlacement } from './turretUI.js';
import { cancelStoragePlacement } from './storageUI.js';

let _fleetFiltersVisible = false;

window.toggleFleetFilters = function() {
  _fleetFiltersVisible = !_fleetFiltersVisible;
  const el = document.getElementById('fleet-filters');
  const btn = document.getElementById('fleet-filter-toggle');
  if (el) el.style.display = _fleetFiltersVisible ? '' : 'none';
  if (btn) btn.style.color = _fleetFiltersVisible ? '#9bd6ff' : '#4a8ab0';
};

let _sellOverlayShipId = null;
let _sellOverlayMode = 'sell';
let _sellOverlayValue = 0;

const ROLE_LABELS = { mining: 'Mining', transport: 'Transport', combat: 'Combat', garrison: 'Garrison', unique: 'Unique' };

export function getShipCargoSummary(ship) {
  const cargoEntries = Object.entries(ship.cargoManifest || {}).filter(([, amount]) => amount > 0);
  return cargoEntries.length
    ? cargoEntries.map(([resourceType, amount]) => `${RESOURCE_DEFS[resourceType]?.label || resourceType} ${fmt(amount)}`).join(' + ')
    : ship.cargo > 0 && ship.cargoResource
      ? `${RESOURCE_DEFS[ship.cargoResource]?.label || ship.cargoResource} ${fmt(ship.cargo)}`
      : 'None';
}

function getShipPickupLabel(ship) {
  if (ship.pickupType === 'storage' && ship.pickupId !== null) {
    return state.modules.find(module => module.id === ship.pickupId && isStorageModule(module))?.name || 'Storage';
  }
  if (ship.pickupType === 'power_station' && ship.pickupId !== null) {
    return state.modules.find(module => module.id === ship.pickupId && isPowerStationModule(module))?.name || 'Power Station';
  }
  return state.base.name || 'Base Station';
}

export function getShipTransportSummary(ship) {
  if (ship.loadingPickup) {
    return { label: 'Loading', value: getShipCargoSummary(ship) };
  }
  if (ship.unloadingDepot) {
    return { label: 'Unloading', value: getShipCargoSummary(ship) };
  }
  const cargoSummary = getShipCargoSummary(ship);
  if (cargoSummary === 'None') {
    return { label: 'Returning', value: getShipPickupLabel(ship) };
  }
  return { label: 'Transporting', value: cargoSummary };
}

export function getShipTransportStatusHtml(ship) {
  const summary = getShipTransportSummary(ship);
  const cargoEntries = Object.entries(ship.cargoManifest || {}).filter(([, amount]) => amount > 0);
  if (!cargoEntries.length) {
    return `<div style="font-size:12px;color:#cde;line-height:1.4;">${summary.value}</div>`;
  }
  const rows = cargoEntries
    .sort((a, b) => b[1] - a[1])
    .map(([resourceType, amount]) => {
      const def = RESOURCE_DEFS[resourceType];
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(26,58,110,0.35);">
        <span style="display:flex;align-items:center;gap:7px;color:${def?.color || '#cde'};min-width:0;">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${def?.color || '#cde'};flex:0 0 auto;"></span>
          <span>${def?.label || resourceType}</span>
        </span>
        <span style="color:#ffe066;flex:0 0 auto;">${fmt(amount)}</span>
      </div>`;
    }).join('');
  return `<div style="background:rgba(10,20,50,0.35);border:1px solid #1a3a6e;border-radius:4px;padding:8px;max-height:132px;overflow-y:auto;">${rows}</div>`;
}

export function getShipTransportSummaryLabel(ship) {
  return getShipTransportSummary(ship).label;
}

export function getShipStatusMeta(ship) {
  if (ship.loadingPickup) return { badge: 'LOADING', message: '⇣ Loading', color: '#ffd966' };
  if (ship.unloadingDepot) return { badge: 'UNLOADING', message: '⇡ Unloading', color: '#9bd6ff' };
  if (ship.status === 'flying') return { badge: 'EN ROUTE', message: '▶ En Route', color: '#48f' };
  if (ship.status === 'mining') return { badge: 'MINING', message: '⛏ Mining', color: '#c6f' };
  if (ship.status === 'returning' || ship.status === 'pausing') return { badge: 'RETURNING', message: '↩ Returning', color: '#fa6' };
  if (ship.status === 'holding') return { badge: 'HOLDING', message: '◌ Holding Pattern', color: '#f88' };
  return { badge: 'IDLE', message: '● Idle', color: '#4d8' };
}

export function getShipRouteError(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const pickupKey = (ship.pickupType === null || ship.pickupType === undefined || ship.pickupType === '') ? '' : `${ship.pickupType}:${ship.pickupId ?? ''}`;
  const depotKey = `${ship.depotType || 'base'}:${ship.depotId ?? ''}`;
  return role === 'transport' && pickupKey && pickupKey === depotKey
    ? 'Invalid route: Pick Up and Dropoff cannot be the same location.'
    : '';
}

export function getShipHoldingReason(ship) {
  const storageModules = state.modules.filter(isStorageModule);
  const powerStations = state.modules.filter(isPowerStationModule);
  const assignedDepot = ship.depotId !== null && (ship.depotType === 'storage' || ship.depotType === 'power_station')
    ? [...storageModules, ...powerStations].find(s => s.id === ship.depotId) || null
    : null;
  return ship.status === 'holding'
    ? assignedDepot
      ? ship.depotType === 'storage' && (assignedDepot.power || 0) <= 0
        ? `Blocked: ${assignedDepot.name} has no power`
        : getModuleFreeCapacity(assignedDepot) < (ship.depotType === 'power_station' ? ship.cargo : 1)
          ? `Blocked: ${assignedDepot.name} is full`
          : (assignedDepot.health || 0) <= 0
            ? `Blocked: ${assignedDepot.name} is fully damaged`
            : 'Blocked: assigned depot unavailable'
      : (state.base.health || 0) <= 0
        ? `Blocked: ${state.base.name || 'Base Station'} is fully damaged`
        : 'Blocked: assigned depot unavailable'
    : '';
}

export function renderFleetFilters() {
  const container = document.getElementById('fleet-filters');
  if (!container) return;
  const ff = state.fleetFilter;

  const types = [...new Set(state.ships.map(s =>
    CRAFT_RECIPES.find(r => r.id === s.type)?.name || 'Starter'
  ))];

  const nodeTypes = [...new Set(state.ships.map(s => {
    if (s.targetNode === null) return null;
    const n = state.nodes.find(n => n.id === s.targetNode);
    return n ? RESOURCE_DEFS[n.type].label : null;
  }).filter(Boolean))];

  function makeRow(labelText, control) {
    const row = document.createElement('div');
    row.className = 'ff-row';
    const label = document.createElement('span');
    label.className = 'ff-label';
    label.textContent = labelText;
    const controlWrap = document.createElement('div');
    controlWrap.className = 'ff-control';
    controlWrap.appendChild(control);
    row.appendChild(label);
    row.appendChild(controlWrap);
    return row;
  }

  function makeSelect(options, value, onChange) {
    const sel = document.createElement('select');
    sel.className = 'fleet-select';
    options.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt.value;
      el.textContent = opt.label;
      sel.appendChild(el);
    });
    sel.value = value ?? '';
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }

  container.innerHTML = '';

  const typeSelect = makeSelect(
    [{ value: '', label: 'All Types' }, ...types.map(t => ({ value: t, label: t.replace(' Ship', '').replace(' Runner', '') }))],
    ff.type,
    (v) => { ff.type = v || null; renderShipsList(); }
  );
  container.appendChild(makeRow('Type', typeSelect));

  const roles = [...new Set(state.ships.map(s => SHIP_DEFS[s.type]?.role).filter(Boolean))];
  const roleSelect = makeSelect(
    [{ value: '', label: 'All Roles' }, ...roles.map(r => ({ value: r, label: ROLE_LABELS[r] || r }))],
    ff.role,
    (v) => { ff.role = v || null; renderShipsList(); }
  );
  container.appendChild(makeRow('Role', roleSelect));

  const nodeSelect = makeSelect(
    [{ value: '', label: 'All Nodes' }, ...nodeTypes.map(nt => ({ value: nt, label: nt }))],
    ff.node,
    (v) => { ff.node = v || null; renderShipsList(); }
  );
  container.appendChild(makeRow('Node', nodeSelect));

  const sortSelect = makeSelect(
    [
      { value: 'none',     label: 'No Sort' },
      { value: 'fly',      label: 'Fly Speed' },
      { value: 'mine',     label: 'Mine Speed' },
      { value: 'capacity', label: 'Cargo Size' },
      { value: 'level',    label: 'Level' },
      { value: 'node',     label: 'Node Type' },
    ],
    ff.sort || 'none',
    (v) => {
      if (v === 'none') { ff.sort = null; ff.sortDir = 1; }
      else { ff.sort = v; }
      renderShipsList();
    }
  );

  const sortWrap = document.createElement('div');
  sortWrap.className = 'ff-sort-wrap';
  sortWrap.appendChild(sortSelect);

  const sortDirBtn = document.createElement('button');
  sortDirBtn.className = 'fleet-sort-dir';
  sortDirBtn.type = 'button';
  sortDirBtn.textContent = ff.sortDir === -1 ? '↓' : '↑';
  sortDirBtn.title = ff.sortDir === -1 ? 'Descending' : 'Ascending';
  sortDirBtn.disabled = !ff.sort;
  sortDirBtn.onclick = () => {
    if (!ff.sort) return;
    ff.sortDir *= -1;
    renderShipsList();
  };
  sortWrap.appendChild(sortDirBtn);
  container.appendChild(makeRow('Sort', sortWrap));

  const clearRow = document.createElement('div');
  clearRow.className = 'ff-row ff-row-clear';

  const idleToggle = document.createElement('button');
  idleToggle.className = 'fleet-filter' + (ff.idleOnly ? ' active' : '');
  idleToggle.textContent = 'Idle';
  idleToggle.onclick = () => { ff.idleOnly = !ff.idleOnly; renderShipsList(); };

  const holdingToggle = document.createElement('button');
  holdingToggle.className = 'fleet-filter' + (ff.holdingOnly ? ' active' : '');
  holdingToggle.textContent = 'Holding';
  holdingToggle.onclick = () => { ff.holdingOnly = !ff.holdingOnly; renderShipsList(); };

  const clr = document.createElement('button');
  clr.className = 'fleet-filter fleet-filter-clear';
  clr.textContent = 'Clear';
  clr.onclick = () => {
    Object.assign(state.fleetFilter, { type:null, role:null, node:null, idleOnly:false, holdingOnly:false, sort:null, sortDir:1 });
    renderShipsList();
  };
  clearRow.appendChild(idleToggle);
  clearRow.appendChild(holdingToggle);
  clearRow.appendChild(clr);
  container.appendChild(clearRow);
}

export function renderShipsList() {
  renderFleetFilters();
  const ff = state.fleetFilter;
  const list = document.getElementById('ships-list');
  list.innerHTML = '';

  let ships = state.ships.filter(ship => {
    if (ff.idleOnly && ship.status !== 'idle') return false;
    if (ff.holdingOnly && ship.status !== 'holding') return false;
    if (ff.type) {
      const typeName = CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';
      if (typeName !== ff.type) return false;
    }
    if (ff.role) {
      if ((SHIP_DEFS[ship.type]?.role || '') !== ff.role) return false;
    }
    if (ff.node) {
      const node = ship.targetNode !== null ? state.nodes.find(n => n.id === ship.targetNode) : null;
      const nodeLabel = node ? RESOURCE_DEFS[node.type].label : null;
      if (nodeLabel !== ff.node) return false;
    }
    return true;
  });

  if (ff.sort === 'level') {
    ships = [...ships].sort((a, b) => {
      const la = _overallLevel(a), lb = _overallLevel(b);
      return (lb - la) * ff.sortDir * -1;
    });
  } else if (ff.sort === 'capacity') {
    ships = [...ships].sort((a, b) => (a.capacity - b.capacity) * ff.sortDir);
  } else if (ff.sort === 'fly') {
    ships = [...ships].sort((a, b) => (a.flySpeed - b.flySpeed) * ff.sortDir);
  } else if (ff.sort === 'mine') {
    ships = [...ships].sort((a, b) => (a.mineSpeed - b.mineSpeed) * ff.sortDir);
  } else if (ff.sort === 'node') {
    ships = [...ships].sort((a, b) => {
      const la = a.targetNode !== null ? (RESOURCE_DEFS[state.nodes.find(n => n.id === a.targetNode)?.type]?.label ?? '') : '';
      const lb = b.targetNode !== null ? (RESOURCE_DEFS[state.nodes.find(n => n.id === b.targetNode)?.type]?.label ?? '') : '';
      return la.localeCompare(lb) * ff.sortDir;
    });
  }

  if (ships.length === 0) {
    list.innerHTML = '<div style="color:#3a5a7a;font-size:12px;padding:4px 0">No ships match filters.</div>';
    return;
  }

  const canvas = document.getElementById('main-canvas');

  for (const ship of ships) {
    const isSelected = state.selectedShip === ship.id;
    const card = document.createElement('div');
    card.className = `ship-card ${isSelected?'selected':''} ${ship.status!=='idle'?'busy':''}`;
    const role    = SHIP_DEFS[ship.type]?.role || 'mining';
    const hasCargo = role === 'mining' || role === 'transport' || role === 'unique';
    const pct = hasCargo ? ship.cargo / Math.max(1, ship.capacity) * 100 : 0;
    const statusMeta = getShipStatusMeta(ship);

    const safeTierNum = Math.min(10, Math.max(1, ship.mineTier || 1));
    const tierRarityColor = TIER_COLORS[safeTierNum] || '#e8eaf0';
    const overallLevel = _overallLevel(ship);
    const typeLabel = CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';
    const targetNode = ship.targetNode !== null && ship.targetNode !== undefined ? state.nodes.find(n => n.id === ship.targetNode) : null;
    const resDef = targetNode ? RESOURCE_DEFS[targetNode.type] : null;

    // ROW 1: tier pill, name, type pill
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:5px;';

    const tierPill = document.createElement('span');
    tierPill.style.cssText = `font-family:'Cinzel',serif;font-size:13px;font-weight:600;color:${tierRarityColor};background:rgba(0,0,0,0.35);border:1px solid ${tierRarityColor}55;border-radius:3px;padding:1px 5px;flex-shrink:0;`;
    tierPill.textContent = toRoman(safeTierNum);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ship-name';
    nameSpan.style.cssText = `color:${tierRarityColor};font-size:15px;font-weight:400;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    nameSpan.textContent = `Lv${overallLevel}: ${ship.name}`;

    const typePill = document.createElement('span');
    typePill.style.cssText = 'font-size:12px;color:#9bd6ff;font-style:italic;background:none;border:none;padding:0;flex-shrink:0;letter-spacing:0.4px;text-transform:uppercase;';
    typePill.textContent = typeLabel;

    row1.appendChild(tierPill);
    row1.appendChild(nameSpan);
    row1.appendChild(typePill);

    // ROW 2: status badge, resource dot+label, cargo text
    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:5px;';

    const statusBadge = document.createElement('span');
    statusBadge.id = `ship-status-${ship.id}`;
    statusBadge.className = `ship-status ${ship.status}`;
    statusBadge.textContent = statusMeta.badge;
    row2.appendChild(statusBadge);

    if (resDef) {
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:50%;background:${resDef.color};flex-shrink:0;`;
      const resLabel = document.createElement('span');
      resLabel.style.cssText = `font-size:15px;color:${resDef.color};`;
      resLabel.textContent = resDef.label;
      const cargoText = document.createElement('span');
      cargoText.id = `cargo-text-${ship.id}`;
      cargoText.style.cssText = 'font-size:14px;color:#8ab;margin-left:auto;';
      cargoText.textContent = `${ship.cargo} / ${ship.capacity}`;
      row2.appendChild(dot);
      row2.appendChild(resLabel);
      row2.appendChild(cargoText);
    } else {
      if ((ship.mineSpeed || 0) > 0) {
        const unassignedLabel = document.createElement('span');
        unassignedLabel.style.cssText = 'font-size:13px;color:#f55;font-weight:600;letter-spacing:0.5px;';
        unassignedLabel.textContent = 'UNASSIGNED';
        row2.appendChild(unassignedLabel);
      }
      if (hasCargo) {
        const cargoText = document.createElement('span');
        cargoText.id = `cargo-text-${ship.id}`;
        cargoText.style.cssText = 'font-size:14px;color:#8ab;margin-left:auto;';
        cargoText.textContent = `${ship.cargo} / ${ship.capacity}`;
        row2.appendChild(cargoText);
      }
    }

    // ROW 3: cargo bar (only for ships with cargo)
    if (hasCargo) {
      const bar = document.createElement('div'); bar.className = 'ship-cargo-bar';
      const fill = document.createElement('div'); fill.className = 'ship-cargo-fill';
      fill.id = `cargo-fill-${ship.id}`;
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      card.appendChild(row1); card.appendChild(row2); card.appendChild(bar);
    } else {
      card.appendChild(row1); card.appendChild(row2);
    }

    card.addEventListener('mouseenter', () => { state.hoveredShip = ship.id; });
    card.addEventListener('mouseleave', () => { if (state.hoveredShip === ship.id) state.hoveredShip = null; });

    card.addEventListener('click', () => {
      if (state.renamingShip) return;
      if (state.tutStep === 3 && !state.seenMsgs['tut_mining_done']) {
        state.tutStep = 4; state.seenMsgs['tut_mining_done'] = true;
        document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
      }
      if (state.tutStep === 8) {
        state.tutStep = 9;
        document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
        checkTradeTutorial();
      }
      if (state.pendingAssign && state.pendingAssign !== ship.id) {
        state.pendingAssign = null; canvas.style.cursor = '';
      }
      if (isSelected) {
        state.selectedShip = null; state.pendingAssign = null; state.followShip = null;
        canvas.style.cursor = ''; removeReassignTooltip();
      } else {
        cancelTurretPlacement();
        cancelStoragePlacement();
        state.selectedShip = ship.id;
        if (state.tutStep === 0) {
          state.tutStep = 1;
          const ironNode = state.nodes.find(n => n.type === 'iron' && n.minLevel <= state.base.level);
          if (ironNode) {
            const w = gridToWorld(ironNode.gr[0], ironNode.gr[1]);
            focusOn(w.x, w.y, cam.zoom);
          }
        }
        state.pendingAssign = ship.id; canvas.style.cursor = 'crosshair';
        showReassignTooltip(ship);
      }
      if (refresh.ui) refresh.ui();
    });

    list.appendChild(card);
  }
}

// Overall level shown in ship card — role-aware
function _overallLevel(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  if (role === 'mining')    return (ship.capacityLevel||0) + (ship.flySpeedLevel||0) + (ship.mineSpeedLevel||0);
  if (role === 'transport') return (ship.capacityLevel||0) + (ship.flySpeedLevel||0) + (ship.loadSpeedLevel||0);
  if (role === 'combat')    return (ship.hpLevel||0) + (ship.attackLevel||0) + (ship.atkRateLevel||0) + (ship.flySpeedLevel||0);
  if (role === 'unique')    return 400; // all 4 stats at 100
  return (ship.capacityLevel||0) + (ship.flySpeedLevel||0);
}

export function renderActionPanel() {
  const actionPanel   = document.getElementById('action-panel');
  const titleEl       = document.getElementById('action-panel-title');
  const panel         = document.getElementById('action-content');
  const upgradeDrawer = document.getElementById('ship-upgrade-drawer');
  const upgradeTitle  = document.getElementById('ship-upgrade-title');
  const upgradeContent = document.getElementById('ship-upgrade-content');

  if (!state.selectedShip) {
    if (actionPanel) actionPanel.style.display = 'none';
    if (upgradeDrawer) upgradeDrawer.classList.remove('open');
    if (upgradeContent) upgradeContent.innerHTML = '';
    titleEl.textContent = '◉ COMMAND';
    panel.innerHTML = '<div style="color:#456;font-size:13px;">Select a ship to view its data.</div>';
    return;
  }
  if (actionPanel) actionPanel.style.display = 'none';
  const ship = state.ships.find(s => s.id === state.selectedShip);
  if (!ship) {
    titleEl.textContent = '◉ COMMAND';
    panel.innerHTML = '';
    if (upgradeDrawer) upgradeDrawer.classList.remove('open');
    if (upgradeContent) upgradeContent.innerHTML = '';
    return;
  }

  titleEl.textContent = `◈ ${ship.name}`;

  const safeTier    = Math.min(10, Math.max(1, ship.mineTier || 1));
  const tierDef     = MINE_TIERS[safeTier];
  const tierColor   = TIER_COLORS[safeTier] || '#e8eaf0';
  const node        = ship.targetNode !== null ? state.nodes.find(n => n.id === ship.targetNode) : null;
  const nodeLabel   = node ? `${RESOURCE_DEFS[node.type].label} Node` : '—';
  const statusMeta = getShipStatusMeta(ship);
  const statusMsg = statusMeta.message;
  const statusColor = statusMeta.color;

  const stats    = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;
  const isIdle   = ship.status === 'idle';
  const typeLabel = CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';

  let upgradeCost = 0;
  for (let i = 0; i < ship.capacityLevel;  i++) upgradeCost += Math.floor(40 * Math.pow(1.10, i));
  for (let i = 0; i < ship.flySpeedLevel;  i++) upgradeCost += Math.floor(60 * Math.pow(1.10, i));
  for (let i = 0; i < ship.mineSpeedLevel; i++) upgradeCost += Math.floor(60 * Math.pow(1.10, i));
  for (let t = stats.mineTier + 1; t <= ship.mineTier; t++) upgradeCost += SHIP_TIER_COSTS[t] || 0;
  const sellVal = Math.max(10, upgradeCost);

  panel.innerHTML = '';

  if (upgradeDrawer && upgradeTitle && upgradeContent) {
    upgradeTitle.textContent = `◈ ${ship.name} UPGRADES`;
    upgradeContent.innerHTML = buildShipDrawerContent({ ship, statusMsg, statusColor, nodeLabel, typeLabel, tierColor, tierDef, isIdle, sellVal });
    upgradeDrawer.classList.add('open');
    requestAnimationFrame(() => renderTutPointers());
    setTimeout(() => renderTutPointers(), 240);
  }
}

function buildShipDrawerContent({ ship, statusMsg, statusColor, nodeLabel, typeLabel, tierColor, tierDef, isIdle, sellVal }) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const roleLabel = ROLE_LABELS[role] || role;
  const isUnique = SHIP_DEFS[ship.type]?.unique === true;
  const storageModules = state.modules.filter(isStorageModule);
  const powerStations = state.modules.filter(isPowerStationModule);
  const holdingReason = getShipHoldingReason(ship);
  const routeError = getShipRouteError(ship);
  const transportSummary = getShipTransportSummary(ship);

  // ── Info section ───────────────────────────────────────────────
  let infoRows = `
    <div class="ship-data-row">
      <span class="ship-data-label">Status</span>
      <span class="ship-data-value" id="action-panel-status" style="color:${statusColor}">${statusMsg}</span>
    </div>
    <div class="ship-data-row">
      <span class="ship-data-label">Ship Role</span>
      <span class="ship-data-value" style="color:#9bd6ff">${roleLabel}</span>
    </div>
    <div class="ship-data-row">
      <span class="ship-data-label">Ship Type</span>
      <span class="ship-data-value" style="color:#5a8ab0">${typeLabel}</span>
    </div>`;

  if (role === 'mining') {
    infoRows += `<div class="ship-data-row">
      <span class="ship-data-label">Assigned Node</span>
      <span class="ship-data-value" style="${nodeLabel !== '—' ? '' : 'color:#f55;'}">${nodeLabel !== '—' ? nodeLabel : 'UNASSIGNED'}</span>
    </div>`;
  }

  if (role !== 'transport') {
    infoRows += `<div class="ship-data-row">
      <span class="ship-data-label">Mining Tier</span>
      <span class="ship-data-value" style="color:${tierColor}">${tierDef.label}</span>
    </div>`;
  }

  infoRows += `<div class="ship-data-row">
    <span class="ship-data-label">Range from Base</span>
    <span class="ship-data-value" id="action-panel-dist" style="color:#8ab;">${(function(){ const bp=BASE_POS(); const d=Math.round(Math.hypot(ship.x-bp.x,ship.y-bp.y)/36); return d===0?'<span style="color:#6fff9a">At Base</span>':`${d} tiles`; })()}</span>
  </div>`;

  // ── Stats section (role-appropriate) ───────────────────────────
  let statsRows = '';
  if (role === 'mining') {
    statsRows = `
      <div class="ship-data-row">
        <span class="ship-data-label">CARGO</span>
        <span class="ship-data-value" id="action-panel-cargo">${ship.cargo} / ${ship.capacity}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">FLY SPD</span>
        <span class="ship-data-value">${formatFlySpeed(ship.flySpeed)}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">MINE SPD</span>
        <span class="ship-data-value">${formatMineSpeedPercent(ship.mineSpeed)}</span>
      </div>`;
  } else if (role === 'transport') {
    statsRows = `
      <div class="ship-data-row">
        <span class="ship-data-label">CARGO</span>
        <span class="ship-data-value" id="action-panel-cargo">${ship.cargo} / ${ship.capacity}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">FLY SPD</span>
        <span class="ship-data-value">${formatFlySpeed(ship.flySpeed)}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">LOAD SPD</span>
        <span class="ship-data-value">${formatLoadSpeed(ship.loadSpeed || 0)}</span>
      </div>`;
  } else if (role === 'combat' || role === 'garrison') {
    statsRows = `
      <div class="ship-data-row">
        <span class="ship-data-label">HP</span>
        <span class="ship-data-value">${(ship.hp || 0).toLocaleString()}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">ATTACK</span>
        <span class="ship-data-value">${ship.attack || 0}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">ATK RATE</span>
        <span class="ship-data-value">${formatAtkRatePercent(ship.attackSpeed || 0)}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">FLY SPD</span>
        <span class="ship-data-value">${formatFlySpeed(ship.flySpeed)}</span>
      </div>`;
  } else if (role === 'unique') {
    statsRows = `
      ${(ship.hp || 0) > 0 ? `<div class="ship-data-row"><span class="ship-data-label">HP</span><span class="ship-data-value">${(ship.hp||0).toLocaleString()}</span></div>` : ''}
      ${(ship.capacity || 0) > 0 ? `<div class="ship-data-row"><span class="ship-data-label">CARGO</span><span class="ship-data-value" id="action-panel-cargo">${ship.cargo} / ${ship.capacity}</span></div>` : ''}
      <div class="ship-data-row">
        <span class="ship-data-label">FLY SPD</span>
        <span class="ship-data-value">${formatFlySpeed(ship.flySpeed)}</span>
      </div>
      ${(ship.attack || 0) > 0 ? `<div class="ship-data-row"><span class="ship-data-label">ATTACK</span><span class="ship-data-value">${ship.attack||0}</span></div>` : ''}
      ${(ship.mineSpeed || 0) > 0 ? `<div class="ship-data-row"><span class="ship-data-label">MINE SPD</span><span class="ship-data-value">${formatMineSpeedPercent(ship.mineSpeed)}</span></div>` : ''}`;
  }

  const depotOptions = `<option value="base" ${ship.depotType === 'base' ? 'selected' : ''}>${state.base.name || 'Base Station'}</option>`
    + storageModules.map(storage => `<option value="storage:${storage.id}" ${ship.depotType === 'storage' && ship.depotId === storage.id ? 'selected' : ''}>${storage.name}</option>`).join('')
    + powerStations.map(station => `<option value="power_station:${station.id}" ${ship.depotType === 'power_station' && ship.depotId === station.id ? 'selected' : ''}>${station.name}</option>`).join('');
  const pickupOptions = `<option value="" ${(ship.pickupType === null || ship.pickupType === undefined || ship.pickupType === '') ? 'selected' : ''}></option>`
    + `<option value="base" ${ship.pickupType === 'base' ? 'selected' : ''}>${state.base.name || 'Base Station'}</option>`
    + storageModules.map(storage => `<option value="storage:${storage.id}" ${ship.pickupType === 'storage' && ship.pickupId === storage.id ? 'selected' : ''}>${storage.name}</option>`).join('')
    + powerStations.map(station => `<option value="power_station:${station.id}" ${ship.pickupType === 'power_station' && ship.pickupId === station.id ? 'selected' : ''}>${station.name}</option>`).join('');
  const depotHtml = (ship.capacity || 0) > 0
    ? `<div style="border-top:1px solid #1a3a6e;margin:8px 0;padding-top:8px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ DEPOT</div>
        <div class="ship-data-section">
          ${role === 'transport' ? `<div class="ship-data-row" style="align-items:flex-start;">
            <span class="ship-data-label">Pick Up</span>
            <select id="action-panel-pickup-select" onchange="setShipPickup(${ship.id}, this.value)" style="min-width:190px;background:rgba(10,20,50,0.75);border:1px solid #2a4a7a;border-radius:4px;color:#cde;padding:5px 8px;font-family:'Share Tech Mono',monospace;font-size:12px;">
              ${pickupOptions}
            </select>
          </div>` : ''}
          <div class="ship-data-row" style="align-items:flex-start;">
            <span class="ship-data-label">Dropoff</span>
            <select id="action-panel-depot-select" onchange="setShipDepot(${ship.id}, this.value)" style="min-width:190px;background:rgba(10,20,50,0.75);border:1px solid #2a4a7a;border-radius:4px;color:#cde;padding:5px 8px;font-family:'Share Tech Mono',monospace;font-size:12px;">
              ${depotOptions}
            </select>
          </div>
          ${role === 'transport' ? `<div style="margin-top:8px;">
            <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;" id="action-panel-transporting-label">${transportSummary.label}</div>
            <div id="action-panel-transporting">${getShipTransportStatusHtml(ship)}</div>
          </div>` : ''}
          <div id="action-panel-route-error" style="margin-top:8px;padding:8px 10px;border:1px solid rgba(255,120,120,0.65);border-radius:6px;background:rgba(70,15,15,0.22);color:#ff9a9a;font-size:12px;line-height:1.4;display:${routeError ? 'block' : 'none'};">${routeError || ''}</div>
          <div id="action-panel-holding-reason" style="margin-top:8px;padding:8px 10px;border:1px solid rgba(255,214,102,0.65);border-radius:6px;background:rgba(70,55,8,0.18);color:#ffd966;font-size:12px;line-height:1.4;display:${holdingReason ? 'block' : 'none'};">${holdingReason || ''}</div>
        </div>
      </div>`
    : '';

  const statsHtml = `
    <div class="ship-data-section">${infoRows}</div>
    ${depotHtml}
    <div style="border-top:1px solid #1a3a6e;margin:8px 0;padding-top:8px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ STATS</div>
      <div class="ship-data-section">${statsRows}</div>
    </div>`;

  // ── Actions ────────────────────────────────────────────────────
  const canMine = (ship.mineSpeed || 0) > 0;
  const actionsHtml = (role === 'combat' || role === 'garrison')
    ? `<div style="font-size:12px;color:#4a6a8a;margin:8px 0;padding:8px;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;">⚔ Combat vessel — cannot be assigned to nodes.</div>`
    : role === 'transport'
    ? ``
    : !canMine
    ? `<div style="font-size:12px;color:#4a6a8a;margin:8px 0;padding:8px;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;">⊘ No mining equipment — cannot be assigned to a node.</div>`
    : isIdle
    ? `<div class="cmd-status-text" style="color:#ffe066;font-size:12px;margin:8px 0 6px;">⬡ Click a node on the map to assign.</div>
       <div style="font-size:11px;color:#456;margin-bottom:8px;">Dimmed nodes need a higher tier.<br>Press <span style="color:#8ab">Esc</span> to deselect.</div>`
    : `<div class="ship-action-row" style="margin-top:8px;">
         <button class="btn danger" style="flex:1;font-size:12px" onclick="recallShip(${ship.id})">⟵ RECALL</button>
       </div>`;

  const followBtn = `<button class="btn" style="flex:1;font-size:12px;${state.followShip === ship.id ? 'background:rgba(0,180,255,0.18);border-color:#00b4ff;color:#00e5ff;' : 'background:rgba(10,30,70,0.5);border-color:#2a4a7a;color:#6af;'}" onclick="toggleFollowShip(${ship.id})">${state.followShip === ship.id ? '◉ UNFOLLOW' : '◎ FOLLOW'}</button>`;
  const bottomActions = `<div class="ship-action-row">
    ${followBtn}
    <button class="btn" style="flex:1;font-size:12px;background:rgba(20,30,60,0.6);border-color:#2a4a7a;color:#8ab" onclick="openRenameOverlay(${ship.id})">✎ RENAME</button>
  </div><div class="ship-action-row" style="margin-top:8px;">
    <button class="btn" style="flex:1;font-size:12px;background:rgba(40,20,10,0.6);border-color:#604020;color:#c87" ${state.ships.length <= 1 ? 'disabled title="Cannot sell your last ship"' : ''} onclick="openSellOverlay(${ship.id}, ${sellVal})">SELL <span style="color:#6fff9a;">$${fmt(sellVal)}</span></button>
    <button class="btn" style="flex:1;font-size:12px;background:rgba(30,45,20,0.6);border-color:#4f6a32;color:#9fd28c" ${state.ships.length <= 1 ? 'disabled title="Cannot salvage your last ship"' : ''} onclick="openSalvageOverlay(${ship.id})">♻ SALVAGE</button>
  </div>`;

  return statsHtml
    + '<div style="border-top:1px solid #1a3a6e;margin:8px 0;padding-top:8px;"><div id="upgrades-section-header" style="font-family:\'Orbitron\',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ UPGRADES</div>'
    + buildUpgradesSection(ship.id)
    + '</div>'
    + actionsHtml
    + bottomActions;
}

window.toggleFollowShip = function(shipId) {
  if (state.followShip === shipId) {
    state.followShip = null;
  } else {
    state.followShip = shipId;
    cam.zoom = Math.min(3.0, ZOOM_MAX_V);
  }
  if (refresh.ui) refresh.ui();
};

// Called by home button — focus base and unfollow
window.goHome = function() {
  state.followShip = null;
  window.resetView?.();
  if (refresh.ui) refresh.ui();
};

function getShipDispositionWarning(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  if (role !== 'transport' || (ship.cargo || 0) <= 0) return 'This cannot be undone.';
  return 'This cannot be undone.<br><span style="color:#ff9a9a;">Warning: loaded transport cargo will be lost.</span>';
}

window.openSellOverlay = function(shipId) {
  if (state.ships.length <= 1) return;
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  const sellVal = arguments[1] ?? 0;
  _sellOverlayShipId = shipId;
  _sellOverlayMode = 'sell';
  _sellOverlayValue = sellVal;
  const titleEl = document.getElementById('sell-overlay-title');
  const hintEl = document.getElementById('sell-overlay-hint');
  const confirmEl = document.getElementById('sell-overlay-confirm');
  const nameEl  = document.getElementById('sell-ship-name');
  const valueEl = document.getElementById('sell-ship-value');
  if (titleEl) titleEl.textContent = '⊘ Sell Ship';
  if (nameEl)  nameEl.textContent  = ship.name;
  if (valueEl) valueEl.textContent = `$${fmt(sellVal)}`;
  if (hintEl) hintEl.innerHTML = getShipDispositionWarning(ship);
  if (confirmEl) confirmEl.textContent = 'CONFIRM SELL';
  const overlay = document.getElementById('sell-overlay');
  if (overlay) overlay.classList.add('show');
};

window.openSalvageOverlay = function(shipId) {
  if (state.ships.length <= 1) return;
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  const salvage = getShipSalvageRewards(ship);
  _sellOverlayShipId = shipId;
  _sellOverlayMode = 'salvage';
  _sellOverlayValue = 0;
  const titleEl = document.getElementById('sell-overlay-title');
  const hintEl = document.getElementById('sell-overlay-hint');
  const confirmEl = document.getElementById('sell-overlay-confirm');
  const nameEl  = document.getElementById('sell-ship-name');
  const valueEl = document.getElementById('sell-ship-value');
  if (titleEl) titleEl.textContent = '♻ Salvage Ship';
  if (nameEl)  nameEl.textContent  = ship.name;
  if (valueEl) valueEl.innerHTML = salvage.map(({ type, amount }) => `<span style="color:${RESOURCE_DEFS[type]?.color || '#6fff9a'};">${fmt(amount)} ${RESOURCE_DEFS[type]?.label || type}</span>`).join(' + ');
  if (hintEl) hintEl.innerHTML = getShipDispositionWarning(ship);
  if (confirmEl) confirmEl.textContent = 'CONFIRM SALVAGE';
  const overlay = document.getElementById('sell-overlay');
  if (overlay) overlay.classList.add('show');
};

window.closeSellOverlay = function() {
  _sellOverlayShipId = null;
  _sellOverlayMode = 'sell';
  _sellOverlayValue = 0;
  const overlay = document.getElementById('sell-overlay');
  if (overlay) overlay.classList.remove('show');
};

window.confirmSellOverlay = function() {
  if (_sellOverlayShipId !== null) {
    if (_sellOverlayMode === 'salvage') window.salvageShip(_sellOverlayShipId);
    else window.sellShip(_sellOverlayShipId, _sellOverlayValue);
  }
  window.closeSellOverlay();
};

// ── Upgrades section (role-aware) ──────────────────────────────────────────
function buildUpgradesSection(shipId) {
  const s2 = state.ships.find(s => s.id === shipId); if (!s2) return '';
  const role = SHIP_DEFS[s2.type]?.role || 'mining';
  const isUnique = SHIP_DEFS[s2.type]?.unique === true;

  if (isUnique) {
    return '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #ffffff44;border-radius:5px;padding:10px;font-size:12px;color:#ffe066;letter-spacing:1px;">★ LEGENDARY — ALL STATS MAXED</div>';
  }

  const st   = Math.min(10, Math.max(1, s2.mineTier || 1));
  const tc   = TIER_COLORS[st];
  const td   = MINE_TIERS[st];
  const nt   = st < 10 ? st + 1 : null;
  const tCost = nt ? SHIP_TIER_COSTS[nt] : null;
  const blockedByBase = nt && nt > state.base.level;
  const canAffordTier = nt && state.coins >= tCost;
  const cap  = TIER_UPGRADE_CAP[st];

  const tierResReqs = nt ? (SHIP_TIER_REQS[nt] || null) : null;
  const tierResMet  = tierResReqs ? Object.entries(tierResReqs).every(([r, n]) => (state.resources[r] || 0) >= n) : true;
  const canUpgradeTier = !blockedByBase && canAffordTier && tierResMet;

  let tierReqsHtml = '';
  if (nt && tierResReqs) {
    tierReqsHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;justify-content:center;">';
    for (const [r, n] of Object.entries(tierResReqs)) {
      const met = (state.resources[r] || 0) >= n;
      tierReqsHtml += `<span style="font-size:11px;padding:1px 5px;border-radius:3px;border:1px solid ${met?'#2a6040':'#802020'};background:${met?'rgba(20,60,30,0.4)':'rgba(60,10,10,0.35)'};color:${met?'#4d8':'#f88'};">${RESOURCE_DEFS[r]?.label ?? r}: ${n}</span>`;
    }
    tierReqsHtml += '</div>';
  }

  const tierBlock = nt
    ? '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #2a5090;border-radius:5px;padding:8px;margin-bottom:6px;">'
      + '<div style="font-size:9px;letter-spacing:2px;color:#4a7aaa;margin-bottom:4px;font-family:Orbitron,sans-serif;">SHIP TIER</div>'
      + '<div style="margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:8px;">'
      + `<span style="font-size:14px;font-weight:bold;color:${tc}">${td.label}</span>`
      + '<span style="color:#7aa7d8;font-size:13px;line-height:1;">➜</span>'
      + `<span style="font-size:14px;font-weight:bold;color:${TIER_COLORS[nt]}">${MINE_TIERS[nt].label}</span></div>`
      + tierReqsHtml
      + (blockedByBase ? `<div style="font-size:13px;color:#fa8;margin-bottom:6px;">Requires Base Tier ${nt}</div>` : '')
      + (blockedByBase ? '' : `<button class="btn ${canUpgradeTier ? 'primary' : 'danger'}" style="width:100%;font-size:13px;" onclick="upgradeShip(${s2.id},'mineTier',1)" ${canUpgradeTier ? '' : 'disabled'}>⬆ UPGRADE T${nt} — <span style="color:#ffe066;">$${fmt(tCost)}</span></button>`)
      + '</div>'
    : '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #2a5090;border-radius:5px;padding:6px;margin-bottom:6px;font-size:11px;color:#ffe066;">★ MAX TIER</div>';

  const row = (label, lv, currentVal, nextVal, cost, chunk, stat) =>
    '<div class="upgrade-row">'
    + `<span class="upgrade-label">Lv${lv} ${label}</span>`
    + `<span class="upgrade-val">${currentVal} <span style="color:#4a6a8a;">➜</span> <span style="color:#6fff9a;">${nextVal}</span></span>`
    + `<span class="upgrade-cost">${chunk > 0 ? '$'+fmt(cost) : '—'}</span>`
    + `<button class="upgrade-btn" onclick="upgradeShip(${s2.id},'${stat}',${chunk})" ${chunk <= 0 || state.coins < cost ? 'disabled' : ''}>${chunk <= 0 ? 'MAX' : chunk > 1 ? '×'+chunk : '↑'}</button>`
    + '</div>';

  let rows = '';

  if (role === 'mining') {
    const capAtM   = s2.capacityLevel  >= cap;
    const flyAtM   = s2.flySpeedLevel  >= cap;
    const mineAtM  = s2.mineSpeedLevel >= cap;
    const capChk   = capAtM  ? 0 : 1;
    const flyChk   = flyAtM  ? 0 : 1;
    const mineChk  = mineAtM ? 0 : 1;
    const capCost  = capChk  > 0 ? upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  capChk)  : 0;
    const flyCost  = flyChk  > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  flyChk)  : 0;
    const mineCost = mineChk > 0 ? upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', mineChk) : 0;
    const nextCap  = capChk  > 0 ? capacityFromTierAndLevel(s2.type, s2.mineTier, s2.capacityLevel  + 1, s2.capacity) : 'MAX';
    const nextFly  = flyChk  > 0 ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1))                   : 'MAX';
    const nextMine = mineChk > 0 ? formatMineSpeedPercent(mineSpeedFromLevel(s2.type, s2.mineSpeedLevel + 1))         : 'MAX';
    rows  = row('CARGO',    s2.capacityLevel,  s2.capacity,                           nextCap,  capCost,  capChk,  'capacity')
          + row('FLY SPD',  s2.flySpeedLevel,  formatFlySpeed(s2.flySpeed),            nextFly,  flyCost,  flyChk,  'flySpeed')
          + row('MINE SPD', s2.mineSpeedLevel, formatMineSpeedPercent(s2.mineSpeed),   nextMine, mineCost, mineChk, 'mineSpeed');

  } else if (role === 'transport') {
    const loadLv   = s2.loadSpeedLevel || 0;
    const capAtM   = s2.capacityLevel >= cap;
    const flyAtM   = s2.flySpeedLevel >= cap;
    const loadAtM  = loadLv >= cap;
    const capChk   = capAtM  ? 0 : 1;
    const flyChk   = flyAtM  ? 0 : 1;
    const loadChk  = loadAtM ? 0 : 1;
    const capCost  = capChk  > 0 ? upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  capChk)  : 0;
    const flyCost  = flyChk  > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  flyChk)  : 0;
    const loadCost = loadChk > 0 ? upgradeTotalCost(UPGRADE_LOAD_COST, s2, 'loadSpeed', loadChk) : 0;
    const nextCap  = capChk  > 0 ? capacityFromTierAndLevel(s2.type, s2.mineTier, s2.capacityLevel  + 1, s2.capacity) : 'MAX';
    const nextFly  = flyChk  > 0 ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1))                   : 'MAX';
    const nextLoad = loadChk > 0 ? formatLoadSpeed(loadSpeedFromLevel(s2.type, loadLv + 1))                    : 'MAX';
    rows  = row('CARGO',    s2.capacityLevel, s2.capacity,                          nextCap,  capCost,  capChk,  'capacity')
          + row('FLY SPD',  s2.flySpeedLevel, formatFlySpeed(s2.flySpeed),           nextFly,  flyCost,  flyChk,  'flySpeed')
          + row('LOAD SPD', loadLv,           formatLoadSpeed(s2.loadSpeed||0), nextLoad, loadCost, loadChk, 'loadSpeed');

  } else if (role === 'combat') {
    const hpLv     = s2.hpLevel      || 0;
    const atkLv    = s2.attackLevel  || 0;
    const rateLv   = s2.atkRateLevel || 0;
    const flyAtM   = s2.flySpeedLevel >= cap;
    const hpAtM    = hpLv   >= cap;
    const atkAtM   = atkLv  >= cap;
    const rateAtM  = rateLv >= cap;
    const flyChk   = flyAtM  ? 0 : 1;
    const hpChk    = hpAtM   ? 0 : 1;
    const atkChk   = atkAtM  ? 0 : 1;
    const rateChk  = rateAtM ? 0 : 1;
    const flyCost  = flyChk  > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,      s2, 'flySpeed', flyChk)  : 0;
    const hpCost   = hpChk   > 0 ? upgradeTotalCost(UPGRADE_HP_COST,       s2, 'hp',       hpChk)   : 0;
    const atkCost  = atkChk  > 0 ? upgradeTotalCost(UPGRADE_ATTACK_COST,   s2, 'attack',   atkChk)  : 0;
    const rateCost = rateChk > 0 ? upgradeTotalCost(UPGRADE_ATK_RATE_COST, s2, 'atkRate',  rateChk) : 0;
    const nextFly  = flyChk  > 0 ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1))           : 'MAX';
    const nextHp   = hpChk   > 0 ? String(hpFromLevel(s2.type, hpLv + 1).toLocaleString())                    : 'MAX';
    const nextAtk  = atkChk  > 0 ? String(attackFromLevel(s2.type, atkLv + 1))                                : 'MAX';
    const nextRate = rateChk > 0 ? formatAtkRatePercent(atkRateFromLevel(s2.type, rateLv + 1))                 : 'MAX';
    rows  = row('HP',       hpLv,              (s2.hp||0).toLocaleString(),           nextHp,   hpCost,   hpChk,   'hp')
          + row('ATTACK',   atkLv,             String(s2.attack||0),                   nextAtk,  atkCost,  atkChk,  'attack')
          + row('ATK RATE', rateLv,            formatAtkRatePercent(s2.attackSpeed||0), nextRate, rateCost, rateChk, 'atkRate')
          + row('FLY SPD',  s2.flySpeedLevel,  formatFlySpeed(s2.flySpeed),            nextFly,  flyCost,  flyChk,  'flySpeed');

  } else {
    // Garrison or other — just fly speed
    const flyAtM  = s2.flySpeedLevel >= cap;
    const flyChk  = flyAtM ? 0 : 1;
    const flyCost = flyChk > 0 ? upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', flyChk) : 0;
    const nextFly = flyChk > 0 ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1)) : 'MAX';
    rows = row('FLY SPD', s2.flySpeedLevel, formatFlySpeed(s2.flySpeed), nextFly, flyCost, flyChk, 'flySpeed');
  }

  // All-upgrade buttons
  function allCost(levels) {
    const n = levels === 'max';
    let total = 0;
    if (role === 'mining') {
      const c = n ? cap - s2.capacityLevel  : Math.min(levels, cap - s2.capacityLevel);
      const f = n ? cap - s2.flySpeedLevel  : Math.min(levels, cap - s2.flySpeedLevel);
      const m = n ? cap - s2.mineSpeedLevel : Math.min(levels, cap - s2.mineSpeedLevel);
      if (c > 0) total += upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  c);
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  f);
      if (m > 0) total += upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', m);
    } else if (role === 'transport') {
      const c = n ? cap - s2.capacityLevel           : Math.min(levels, cap - s2.capacityLevel);
      const f = n ? cap - s2.flySpeedLevel           : Math.min(levels, cap - s2.flySpeedLevel);
      const l = n ? cap - (s2.loadSpeedLevel||0)     : Math.min(levels, cap - (s2.loadSpeedLevel||0));
      if (c > 0) total += upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  c);
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  f);
      if (l > 0) total += upgradeTotalCost(UPGRADE_LOAD_COST, s2, 'loadSpeed', l);
    } else if (role === 'combat') {
      const f = n ? cap - s2.flySpeedLevel           : Math.min(levels, cap - s2.flySpeedLevel);
      const h = n ? cap - (s2.hpLevel||0)            : Math.min(levels, cap - (s2.hpLevel||0));
      const a = n ? cap - (s2.attackLevel||0)        : Math.min(levels, cap - (s2.attackLevel||0));
      const r = n ? cap - (s2.atkRateLevel||0)       : Math.min(levels, cap - (s2.atkRateLevel||0));
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST,      s2, 'flySpeed', f);
      if (h > 0) total += upgradeTotalCost(UPGRADE_HP_COST,       s2, 'hp',       h);
      if (a > 0) total += upgradeTotalCost(UPGRADE_ATTACK_COST,   s2, 'attack',   a);
      if (r > 0) total += upgradeTotalCost(UPGRADE_ATK_RATE_COST, s2, 'atkRate',  r);
    }
    return total;
  }

  function allBtn(levels, label) {
    const cost = allCost(levels);
    const disabled = cost <= 0 || state.coins < cost;
    return '<button class="btn" style="flex:1;font-size:11px;padding:3px 0;background:rgba(10,20,50,0.6);border-color:#2a4a7a;color:' + (disabled ? '#345' : '#9bd6ff') + ';" onclick="upgradeShipAll(' + s2.id + ',\'' + levels + '\')" ' + (disabled ? 'disabled' : '') + '>'
      + label + (cost > 0 ? '<br><span style="font-size:10px;color:#ffe066;">$' + fmt(cost) + '</span>' : '')
      + '</button>';
  }

  const allRow = '<div style="display:flex;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid #1a3560;">'
    + allBtn(5,     '+5 ALL')
    + allBtn(10,    '+10 ALL')
    + allBtn('max', 'MAX ALL')
    + '</div>';

  return tierBlock + rows + allRow;
}

export function renderTab() {
  const content = document.getElementById('tab-content');
  if (state.activeTab === 'trade') {
    const hasAny = Object.values(state.resources).some(v => v > 0);
    if (!hasAny) {
      content.innerHTML = `<div style="margin-top:10px;padding:14px;background:rgba(10,25,60,0.5);border:1px solid #1a3a6e;border-radius:4px;text-align:center;color:#3a5a7a;font-size:13px;line-height:1.7">⏳ Waiting for resources...<br><span style="font-size:11px;color:#2a4060">Assign a ship to start mining.</span></div>`;
      return;
    }
    const demandMap = new Map();
    if (state.marketBoost?.type) demandMap.set(state.marketBoost.type, state.marketBoost.multiplier ?? 1.5);
    for (const d of (state.extraDemands || [])) demandMap.set(d.type, d.multiplier ?? 1.5);
    let html = '';
    if (demandMap.size) {
      const demandLines = Array.from(demandMap.entries()).map(([type, mult]) => {
        const def = RESOURCE_DEFS[type];
        return `<span style="font-weight:bold;color:${def.color}">${def.label}</span> <span style="color:#ffe066;font-weight:bold">${mult}×</span>`;
      });
      html += `<div style="font-size:14px;background:rgba(20,60,10,0.6);border:1px solid #4a8020;border-radius:4px;padding:8px 10px;margin-bottom:8px;text-align:center;line-height:1.5">${demandLines.join('<span style="color:#6a8;"> · </span>')}</div>`;
    }
    html += '<div class="sell-grid">';
    for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
      const amt = state.resources[type] || 0;
      if (amt <= 0) continue;
      const sellAmt = amt < 100 ? 1 : amt < 1000 ? 10 : amt < 10000 ? 25 : 100;
      const price   = getSellPrice(type);
      const boostMult = demandMap.get(type);
      const boosted = Number.isFinite(boostMult);
      const priceHtml = boosted
        ? `<span style="color:#6fff9a;font-size:12px;flex-shrink:0">$${price} <span title="Market boosted this SOL — ${boostMult}× sell price!" style="cursor:help;">✦</span></span>`
        : `<span style="color:#6fff9a;font-size:12px;flex-shrink:0">$${price}</span>`;
      html += `<div class="sell-row">
        <span style="width:9px;height:9px;border-radius:50%;background:${def.color};display:inline-block;flex-shrink:0"></span>
        ${priceHtml}
        <span class="res-name-s">${def.label}</span>
        <span class="res-qty">${fmt(amt)}</span>
        <button class="sell-btn-s" onclick="sellResource('${type}',${sellAmt})">SELL ${fmt(sellAmt)}</button>
        <button class="sell-btn-s" onclick="sellResource('${type}',100)" ${amt < 100 ? 'disabled' : ''}>SELL 100</button>
        <button class="sell-btn-s" onclick="sellResource('${type}',${amt})">ALL</button>
      </div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  }
}
