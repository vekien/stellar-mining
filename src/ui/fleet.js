// ============================================================
// FLEET UI — ship list, filters, action panel, trade tab
// ============================================================
import { state } from '../state.js';
import { isStorageModule, isPowerStationModule, getModuleFreeCapacity, getPowerStationResourceFreeCapacity, getDepotModules } from '../data/modules.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import {
  SHIP_DEFS, TIER_COLORS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
  UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST, UPGRADE_MINE_BONUS_COST,
  UPGRADE_LOAD_COST, UPGRADE_HP_COST, UPGRADE_ATTACK_COST, UPGRADE_ATK_RATE_COST,
  upgradeTotalCost, toRoman,
  formatFlySpeed, formatMineSpeedPercent, formatMineBonusPercent, formatLoadSpeed, formatAtkRatePercent,
  capacityFromTierAndLevel, flySpeedFromLevel, mineSpeedFromLevel, mineBonusFromLevel, mineBonusUpgradeCap,
  loadSpeedFromLevel, hpFromLevel, attackFromLevel, atkRateFromLevel, getShipSalvageRewards,
} from '../data/ships.js';
import { SHIP_TIER_REQS } from '../data/base.js';
import { BASE_POS, cam, ZOOM_MAX_V, focusOn, gridToWorld } from '../render/camera.js';
import { TILE_H } from '../constants.js';
import { fmt, addLog, getResourceIconPath, resourceIconHtml } from '../helpers.js';
import { refresh } from './refresh.js';
import { getSellPrice } from '../systems/market.js';
import { removeReassignTooltip, showReassignTooltip, checkTradeTutorial, renderTutPointers } from './tutorial.js';
import { cancelTurretPlacement } from './turretUI.js';
import { cancelStoragePlacement } from './storageUI.js';
import {
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
} from './floatingWindow.js';
import { bindTippyIn, setHtmlDestroyingTippies } from './tippy.js';

let _fleetFiltersVisible = false;
let _renderedActionShipId = null;
let _shipModalTab = 'details';
let _shipModalInited = false;
const SHIP_LAYOUT_KEY = 'ship-modal';

const ROLE_ACCENTS = {
  mining: '#60d090',
  transport: '#80d0ff',
  combat: '#ff7070',
  garrison: '#ff9a4a',
  unique: '#ffe066',
};

const ROLE_PRIMARY_TAB = {
  mining: { id: 'primary', label: 'ASSIGNMENT', icon: 'flag' },
  transport: { id: 'primary', label: 'ROUTE', icon: 'route' },
  combat: { id: 'primary', label: 'COMBAT', icon: 'swords' },
  garrison: { id: 'primary', label: 'DEFENSE', icon: 'shield' },
  unique: { id: 'primary', label: 'STATUS', icon: 'star' },
};

window.toggleFleetFilters = function() {
  _fleetFiltersVisible = !_fleetFiltersVisible;
  const el = document.getElementById('fleet-filters');
  const btn = document.getElementById('fleet-filter-toggle');
  if (el) el.classList.toggle('is-hidden', !_fleetFiltersVisible);
  if (btn) btn.style.color = _fleetFiltersVisible ? '#9bd6ff' : '#4a8ab0';
};

let _sellOverlayCtx = null;

const ROLE_LABELS = { mining: 'Mining', transport: 'Transport', combat: 'Combat', garrison: 'Garrison', unique: 'Unique' };

function isMineableCargoType(resourceType) {
  const def = RESOURCE_DEFS[resourceType];
  return !!(def && !def.special && !def.noIcon);
}

export function getShipCargoSummary(ship) {
  const cargoEntries = Object.entries(ship.cargoManifest || {})
    .filter(([resourceType, amount]) => amount > 0 && isMineableCargoType(resourceType));
  if (cargoEntries.length) {
    return cargoEntries.map(([resourceType, amount]) => `${RESOURCE_DEFS[resourceType]?.label || resourceType} ${fmt(amount)}`).join(' + ');
  }
  if (ship.cargo > 0 && ship.cargoResource && isMineableCargoType(ship.cargoResource)) {
    return `${RESOURCE_DEFS[ship.cargoResource]?.label || ship.cargoResource} ${fmt(ship.cargo)}`;
  }
  return ship.cargo > 0 ? fmt(ship.cargo) : 'None';
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

function getShipDepotFilterKey(ship) {
  return ship.depotType === 'base' ? 'base' : `${ship.depotType}:${ship.depotId}`;
}

function getShipDepotFilterLabel(ship) {
  if (ship.depotType === 'storage' && ship.depotId !== null) {
    return state.modules.find(module => module.id === ship.depotId && isStorageModule(module))?.name || 'Storage';
  }
  if (ship.depotType === 'power_station' && ship.depotId !== null) {
    return state.modules.find(module => module.id === ship.depotId && isPowerStationModule(module))?.name || 'Power Station';
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
  const cargoEntries = Object.entries(ship.cargoManifest || {})
    .filter(([resourceType, amount]) => amount > 0 && isMineableCargoType(resourceType));
  if (!cargoEntries.length) {
    return `<div style="font-size:12px;color:#cde;line-height:1.4;">${summary.value}</div>`;
  }
  const rows = cargoEntries
    .sort((a, b) => b[1] - a[1])
    .map(([resourceType, amount]) => {
      const def = RESOURCE_DEFS[resourceType];
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(26,58,110,0.35);">
        <span style="display:flex;align-items:center;gap:7px;color:${def?.color || '#cde'};min-width:0;">
          ${resourceIconHtml(resourceType, 14)}
          <span>${def?.label || resourceType}</span>
        </span>
        <span style="color:#ffe066;flex:0 0 auto;">${fmt(amount)}</span>
      </div>`;
    }).join('');
  return `<div data-transport-scroll="1" style="background:rgba(10,20,50,0.35);border:1px solid #1a3a6e;border-radius:4px;padding:8px;max-height:132px;overflow-y:auto;">${rows}</div>`;
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

function depotHasRoomForShip(depot, ship) {
  if (!depot || !ship) return false;
  if (ship.depotType === 'power_station') {
    const cargoType = ship.cargoResource
      || Object.entries(ship.cargoManifest || {}).find(([, n]) => n > 0)?.[0]
      || null;
    if (!cargoType) return true;
    const need = ship.cargoManifest?.[cargoType] || ship.cargo || 1;
    return getPowerStationResourceFreeCapacity(depot, cargoType) >= Math.min(need, 1);
  }
  return getModuleFreeCapacity(depot) >= 1;
}

export function getShipHoldingReason(ship) {
  const assignedDepot = ship.depotId !== null && (ship.depotType === 'storage' || ship.depotType === 'power_station')
    ? getDepotModules(state.modules).find(s => s.id === ship.depotId) || null
    : null;
  return ship.status === 'holding'
    ? assignedDepot
      ? ship.depotType === 'storage' && (assignedDepot.power || 0) <= 0
        ? `Blocked: ${assignedDepot.name} has no power`
        : !depotHasRoomForShip(assignedDepot, ship)
          ? ship.depotType === 'power_station' && ship.cargoResource
            ? `Blocked: ${assignedDepot.name} is full of ${ship.cargoResource}`
            : `Blocked: ${assignedDepot.name} is full`
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
  const activeEl = document.activeElement;
  const restoreSearchFocus = activeEl?.id === 'fleet-search-input';
  const searchSelectionStart = restoreSearchFocus ? activeEl.selectionStart : null;
  const searchSelectionEnd = restoreSearchFocus ? activeEl.selectionEnd : null;

  const types = [...new Set(state.ships.map(s =>
    CRAFT_RECIPES.find(r => r.id === s.type)?.name || 'Starter'
  ))];

  const nodeTypes = [...new Set(state.ships.map(s => {
    if (s.targetNode === null) return null;
    const n = state.nodes.find(n => n.id === s.targetNode);
    return n ? RESOURCE_DEFS[n.type].label : null;
  }).filter(Boolean))];

  const depotOptions = [...new Map(state.ships.map((ship) => [
    getShipDepotFilterKey(ship),
    { value: getShipDepotFilterKey(ship), label: getShipDepotFilterLabel(ship) },
  ])).values()];

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

  function makeInput(value, placeholder, onInput) {
    const input = document.createElement('input');
    input.id = 'fleet-search-input';
    input.className = 'fleet-select';
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = value || '';
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  container.innerHTML = '';

  const searchInput = makeInput(
    ff.search,
    'Search',
    (v) => { ff.search = v; renderShipsList(); }
  );
  container.appendChild(makeRow('Search', searchInput));

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

  const depotSelect = makeSelect(
    [{ value: '', label: 'All Depots' }, ...depotOptions],
    ff.depot,
    (v) => { ff.depot = v || null; renderShipsList(); }
  );
  container.appendChild(makeRow('Depot', depotSelect));

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
    Object.assign(state.fleetFilter, { search:'', type:null, role:null, node:null, depot:null, idleOnly:false, holdingOnly:false, sort:null, sortDir:1 });
    renderShipsList();
  };
  clearRow.appendChild(idleToggle);
  clearRow.appendChild(holdingToggle);
  clearRow.appendChild(clr);
  container.appendChild(clearRow);

  if (restoreSearchFocus) {
    const searchInputEl = document.getElementById('fleet-search-input');
    if (searchInputEl) {
      searchInputEl.focus();
      if (searchSelectionStart !== null && searchSelectionEnd !== null) {
        searchInputEl.setSelectionRange(searchSelectionStart, searchSelectionEnd);
      }
    }
  }
}

export function renderShipsList() {
  renderFleetFilters();
  const ff = state.fleetFilter;
  const list = document.getElementById('ships-list');
  list.innerHTML = '';

  let ships = state.ships.filter(ship => {
    if (ff.search && !ship.name.toLowerCase().includes(ff.search.trim().toLowerCase())) return false;
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
    if (ff.depot && getShipDepotFilterKey(ship) !== ff.depot) return false;
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

    if (resDef && !resDef.special && !resDef.noIcon) {
      const dot = document.createElement('img');
      dot.src = getResourceIconPath(targetNode?.type);
      dot.alt = resDef.label;
      dot.className = 'resource-icon';
      dot.style.cssText = 'width:14px;height:14px;flex-shrink:0;';
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
    } else if (resDef?.special) {
      // Special map nodes (crashed ships, etc.) — label only, not ore cargo
      const resLabel = document.createElement('span');
      resLabel.style.cssText = `font-size:14px;color:${resDef.color || '#8ab'};`;
      resLabel.textContent = resDef.label;
      row2.appendChild(resLabel);
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
  if (role === 'mining')    return (ship.capacityLevel||0) + (ship.flySpeedLevel||0) + (ship.mineSpeedLevel||0) + (ship.mineBonusLevel||0);
  if (role === 'transport') return (ship.capacityLevel||0) + (ship.flySpeedLevel||0) + (ship.loadSpeedLevel||0);
  if (role === 'combat')    return (ship.hpLevel||0) + (ship.attackLevel||0) + (ship.atkRateLevel||0) + (ship.flySpeedLevel||0);
  if (role === 'unique')    return 400; // all 4 stats at 100
  return (ship.capacityLevel||0) + (ship.flySpeedLevel||0);
}

function msIcon(name, fill = false) {
  return `<span class="ms-icon${fill ? ' ms-icon-fill' : ''}">${name}</span>`;
}

function getShipSellValue(ship) {
  const stats = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;
  let upgradeCost = 0;
  for (let i = 0; i < (ship.capacityLevel || 0); i++) upgradeCost += Math.floor(40 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.flySpeedLevel || 0); i++) upgradeCost += Math.floor(60 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.mineSpeedLevel || 0); i++) upgradeCost += Math.floor(60 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.mineBonusLevel || 0); i++) upgradeCost += Math.floor(70 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.loadSpeedLevel || 0); i++) upgradeCost += Math.floor(60 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.hpLevel || 0); i++) upgradeCost += Math.floor(80 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.attackLevel || 0); i++) upgradeCost += Math.floor(75 * Math.pow(1.10, i));
  for (let i = 0; i < (ship.atkRateLevel || 0); i++) upgradeCost += Math.floor(70 * Math.pow(1.10, i));
  for (let t = (stats.mineTier || 1) + 1; t <= (ship.mineTier || 1); t++) upgradeCost += SHIP_TIER_COSTS[t] || 0;
  return Math.max(10, upgradeCost);
}

function getShipDistanceInfo(ship) {
  const bp = BASE_POS();
  const d = Math.round(Math.hypot(ship.x - bp.x, ship.y - bp.y) / 36);
  if (d === 0) return { text: 'At Base', tiles: 0, atBase: true };
  return { text: String(d), tiles: d, atBase: false };
}

function getShipTypeLabel(ship) {
  return CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';
}

function buildDepotOptionsHtml(ship) {
  const depotModules = getDepotModules(state.modules);
  const storageModules = depotModules.filter(isStorageModule);
  const powerStations = depotModules.filter(isPowerStationModule);
  return `<option value="base" ${ship.depotType === 'base' || ship.depotType === 'research_lab' ? 'selected' : ''}>${state.base.name || 'Base Station'}</option>`
    + storageModules.map(storage => `<option value="storage:${storage.id}" ${ship.depotType === 'storage' && ship.depotId === storage.id ? 'selected' : ''}>${storage.name}</option>`).join('')
    + powerStations.map(station => `<option value="power_station:${station.id}" ${ship.depotType === 'power_station' && ship.depotId === station.id ? 'selected' : ''}>${station.name}</option>`).join('');
}

function buildPickupOptionsHtml(ship) {
  const depotModules = getDepotModules(state.modules);
  const storageModules = depotModules.filter(isStorageModule);
  const powerStations = depotModules.filter(isPowerStationModule);
  return `<option value="" ${(ship.pickupType === null || ship.pickupType === undefined || ship.pickupType === '') ? 'selected' : ''}>— None —</option>`
    + `<option value="base" ${ship.pickupType === 'base' ? 'selected' : ''}>${state.base.name || 'Base Station'}</option>`
    + storageModules.map(storage => `<option value="storage:${storage.id}" ${ship.pickupType === 'storage' && ship.pickupId === storage.id ? 'selected' : ''}>${storage.name}</option>`).join('')
    + powerStations.map(station => `<option value="power_station:${station.id}" ${ship.pickupType === 'power_station' && ship.pickupId === station.id ? 'selected' : ''}>${station.name}</option>`).join('');
}

function initShipModalChrome() {
  if (_shipModalInited) return;
  const overlay = document.getElementById('ship-modal-overlay');
  const modal = document.getElementById('ship-modal');
  if (!overlay || !modal) return;
  initFloatingDrag(modal, overlay, {
    handleSelector: '.ship-modal-drag-handle',
    layoutKey: SHIP_LAYOUT_KEY,
    isActive: () => overlay.style.display === 'flex',
  });
  initFloatingResize(modal, overlay, {
    minW: 720,
    minH: 420,
    layoutKey: SHIP_LAYOUT_KEY,
    isActive: () => overlay.style.display === 'flex',
  });
  _shipModalInited = true;
}

function openShipModalWindow() {
  initShipModalChrome();
  const overlay = document.getElementById('ship-modal-overlay');
  const modal = document.getElementById('ship-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  const place = () => centerFloatingWindow(overlay, modal, SHIP_LAYOUT_KEY);
  place();
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(place);
  });
  bringFloatingToFront(modal);
}

export function closeShipModal() {
  const overlay = document.getElementById('ship-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  const body = document.getElementById('ship-modal-body');
  if (body) body.innerHTML = '';
  _renderedActionShipId = null;
}

/** Returns true if the ship modal was open and is now closed (selection cleared). */
export function closeShipModalIfOpen() {
  const overlay = document.getElementById('ship-modal-overlay');
  if (!overlay || overlay.style.display !== 'flex') return false;
  const canvas = document.getElementById('main-canvas');
  state.selectedShip = null;
  state.pendingAssign = null;
  state.followShip = null;
  if (canvas) canvas.style.cursor = '';
  removeReassignTooltip();
  closeShipModal();
  if (refresh.ui) refresh.ui();
  return true;
}

window.closeShipModal = function() {
  const canvas = document.getElementById('main-canvas');
  state.selectedShip = null;
  state.pendingAssign = null;
  if (canvas) canvas.style.cursor = '';
  removeReassignTooltip();
  closeShipModal();
  if (refresh.ui) refresh.ui();
};

let _shipModalForceRebuild = false;

window.setShipModalTab = function(tab) {
  if (_tierTrackAnimating) {
    _tierTrackAnimating = false;
  }
  _shipModalTab = tab === 'primary' || tab === 'upgrades' ? tab : 'details';
  _shipModalForceRebuild = true;
  renderActionPanel();
};

let _tierTrackAnimating = false;

window.refreshShipUpgrades = function() {
  if (_tierTrackAnimating) return;
  if (_shipModalTab !== 'upgrades') return;
  const ship = state.selectedShip != null ? state.ships.find(s => s.id === state.selectedShip) : null;
  if (!ship) return;
  const el = document.getElementById('ship-upgrades-body');
  if (el) {
    setHtmlDestroyingTippies(el, buildUpgradesSection(ship.id));
    bindTippyIn(el);
    requestAnimationFrame(() => {
      layoutTierTrack(el, ship.mineTier || 1);
      observeTierTrack(el, ship.mineTier || 1);
    });
  }
};

/**
 * Position rail from center of T1 → center of TX, fill ends at current tier center.
 * Uses measured DOM so it stays correct on resize.
 */
function layoutTierTrack(root, tier, { animate = false } = {}) {
  const track = root?.querySelector?.('.sm-bp-track') || null;
  const rail = track?.querySelector('.sm-bp-rail');
  const fill = track?.querySelector('.sm-bp-fill');
  const dots = track?.querySelectorAll('.sm-bp-node .sm-bp-dot');
  if (!track || !rail || !fill || !dots?.length) return null;

  const trackRect = track.getBoundingClientRect();
  if (trackRect.width < 8) return null;

  const centers = Array.from(dots).map((d) => {
    const r = d.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - trackRect.left,
      y: r.top + r.height / 2 - trackRect.top,
    };
  });

  const first = centers[0];
  const last = centers[centers.length - 1];
  const railW = Math.max(0, last.x - first.x);
  const t = Math.max(1, Math.min(centers.length, tier || 1));
  const targetX = centers[t - 1].x;
  const fillW = Math.max(0, targetX - first.x);

  rail.style.left = `${first.x}px`;
  rail.style.width = `${railW}px`;
  rail.style.top = `${first.y - 1.5}px`;

  if (!animate) fill.classList.remove('animating');
  // Pixel width so animation is exact to node center
  fill.style.width = `${fillW}px`;

  return { first, last, railW, fillW, centers };
}

function spawnTierBurst(dotEl) {
  if (!dotEl) return;
  const burst = document.createElement('div');
  burst.className = 'sm-bp-burst';
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--a', `${i * 36}deg`);
    burst.appendChild(p);
  }
  dotEl.appendChild(burst);
  setTimeout(() => burst.remove(), 420);
}

/** Animate fill → next node, then mini explosion. ~1s total. */
window.playShipTierTrackAnimation = function(shipId, fromTier, toTier) {
  const root = document.getElementById('ship-upgrades-body');
  const fill = root?.querySelector('.sm-bp-fill');
  const nodes = root?.querySelectorAll('.sm-bp-node');
  const btn = root?.querySelector('.sm-btn-tier');
  if (!fill || !nodes?.length) {
    _tierTrackAnimating = false;
    window.refreshShipUpgrades?.();
    return;
  }

  _tierTrackAnimating = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'ADVANCING…';
  }

  // Snap to previous tier geometry
  nodes.forEach((n, i) => {
    const t = i + 1;
    n.classList.remove('done', 'current', 'locked', 'bursting');
    if (t < fromTier) n.classList.add('done');
    else if (t === fromTier) n.classList.add('current');
    else n.classList.add('locked');
  });
  layoutTierTrack(root, fromTier, { animate: false });

  const FILL_MS = 500;
  const BURST_MS = 650;
  const SETTLE_MS = 1000;

  // Animate fill to new tier node center
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.classList.add('animating');
      layoutTierTrack(root, toTier, { animate: true });
    });
  });

  setTimeout(() => {
    const prev = nodes[fromTier - 1];
    const next = nodes[toTier - 1];
    if (prev) {
      prev.classList.remove('current', 'bursting');
      prev.classList.add('done');
    }
    if (next) {
      next.classList.remove('locked', 'done');
      next.classList.add('current', 'bursting');
      spawnTierBurst(next.querySelector('.sm-bp-dot'));
    }
    const nextLab = root.querySelector('.sm-bp-head .next');
    if (nextLab) {
      if (toTier >= 10) nextLab.textContent = 'Fully ascended';
      else {
        const n = toTier + 1;
        nextLab.innerHTML = `Next unlock · <b>Tier ${n === 10 ? 'X' : n}</b>`;
      }
    }
  }, BURST_MS);

  setTimeout(() => {
    _tierTrackAnimating = false;
    window.refreshShipUpgrades?.();
  }, SETTLE_MS);
};

let _tierTrackRo = null;
function observeTierTrack(root, tier) {
  const track = root?.querySelector?.('.sm-bp-track');
  if (!track || typeof ResizeObserver === 'undefined') return;
  if (_tierTrackRo) _tierTrackRo.disconnect();
  _tierTrackRo = new ResizeObserver(() => {
    if (_tierTrackAnimating) return;
    const ship = state.selectedShip != null ? state.ships.find(s => s.id === state.selectedShip) : null;
    layoutTierTrack(root, ship?.mineTier || tier || 1);
  });
  _tierTrackRo.observe(track);
}

export function renderActionPanel() {
  const actionPanel = document.getElementById('action-panel');
  const titleEl = document.getElementById('action-panel-title');
  const panel = document.getElementById('action-content');
  if (actionPanel) actionPanel.style.display = 'none';

  if (!state.selectedShip) {
    closeShipModal();
    if (titleEl) titleEl.textContent = '◉ COMMAND';
    if (panel) panel.innerHTML = '<div style="color:#456;font-size:13px;">Select a ship to view its data.</div>';
    return;
  }

  const ship = state.ships.find(s => s.id === state.selectedShip);
  if (!ship) {
    closeShipModal();
    if (titleEl) titleEl.textContent = '◉ COMMAND';
    if (panel) panel.innerHTML = '';
    return;
  }

  if (titleEl) titleEl.textContent = `◈ ${ship.name}`;
  if (panel) panel.innerHTML = '';

  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const modal = document.getElementById('ship-modal');
  const body = document.getElementById('ship-modal-body');
  const title = document.getElementById('ship-modal-title');
  if (!modal || !body) return;

  // Only reset tab when switching to a different ship
  if (_renderedActionShipId != null && _renderedActionShipId !== ship.id) {
    _shipModalTab = 'details';
  }

  const accent = ROLE_ACCENTS[role] || ROLE_ACCENTS.mining;
  modal.style.setProperty('--ship-accent', accent);
  if (title) title.textContent = 'SHIP';

  const wasOpen = document.getElementById('ship-modal-overlay')?.style.display === 'flex';
  const needsFull = _shipModalForceRebuild
    || _renderedActionShipId !== ship.id
    || !body.querySelector('[data-ship-modal-root]');
  _shipModalForceRebuild = false;

  if (needsFull) {
    setHtmlDestroyingTippies(body, buildShipModalContent(ship));
    _renderedActionShipId = ship.id;
    bindTippyIn(body);
    if (_shipModalTab === 'upgrades') {
      requestAnimationFrame(() => {
        const upg = document.getElementById('ship-upgrades-body');
        layoutTierTrack(upg, ship.mineTier || 1);
        observeTierTrack(upg, ship.mineTier || 1);
      });
    }
  } else {
    patchShipModalContent(ship);
  }

  if (!wasOpen) openShipModalWindow();
  else bringFloatingToFront(modal);

  requestAnimationFrame(() => renderTutPointers());
  setTimeout(() => renderTutPointers(), 240);
}

function setHtmlIfChanged(el, html) {
  if (el && el.innerHTML !== html) el.innerHTML = html;
}

function setTextIfChanged(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function updateShipTransporting(el, ship) {
  if (!el) return;
  const scroller = el.querySelector('[data-transport-scroll]');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const html = getShipInventoryHtml(ship);
  if (el.innerHTML !== html) {
    el.innerHTML = html;
    const nextScroller = el.querySelector('[data-transport-scroll]');
    if (nextScroller) nextScroller.scrollTop = scrollTop;
  }
}

function getShipInventoryHtml(ship) {
  const cargoEntries = Object.entries(ship.cargoManifest || {})
    .filter(([resourceType, amount]) => amount > 0 && isMineableCargoType(resourceType))
    .sort((a, b) => b[1] - a[1]);
  if (!cargoEntries.length && ship.cargo > 0 && ship.cargoResource && isMineableCargoType(ship.cargoResource)) {
    cargoEntries.push([ship.cargoResource, ship.cargo]);
  }
  if (!cargoEntries.length) {
    return '<div class="sm-inv-empty" data-transport-scroll="1">Cargo hold empty</div>';
  }
  const cells = cargoEntries.map(([type, amount]) => {
    const def = RESOURCE_DEFS[type];
    return `<div class="sm-inv-cell">
      ${resourceIconHtml(type, 28)}
      <span class="n">${def?.label || type}</span>
      <span class="a">${fmt(amount)}</span>
    </div>`;
  }).join('');
  return `<div class="sm-inv-grid" data-transport-scroll="1">${cells}</div>`;
}

function smVital(icon, label, valueHtml) {
  return `<div class="sm-vital">
    <div class="ico">${msIcon(icon)}</div>
    <div class="lab">${label}</div>
    <div class="val">${valueHtml}</div>
  </div>`;
}

function smInfoRow(k, v, cls = '', id = '') {
  return `<div class="sm-info-row"><span class="k">${k}</span><span class="val ${cls}"${id ? ` id="${id}"` : ''}>${v}</span></div>`;
}

function statusPillClass(statusMeta) {
  const b = (statusMeta?.badge || '').toUpperCase();
  if (b === 'HOLDING') return 'holding';
  if (b === 'LOADING' || b === 'UNLOADING') return 'loading';
  if (b === 'IDLE') return 'idle';
  if (b === 'MINING') return 'mining';
  if (b === 'EN ROUTE' || b === 'RETURNING') return 'patrol';
  return 'idle';
}

function buildDetailsPane(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const roleLabel = ROLE_LABELS[role] || role;
  const typeLabel = getShipTypeLabel(ship);
  const statusMeta = getShipStatusMeta(ship);
  const safeTier = Math.min(10, Math.max(1, ship.mineTier || 1));
  const tierDef = MINE_TIERS[safeTier];
  const node = ship.targetNode != null ? state.nodes.find(n => n.id === ship.targetNode) : null;
  const nodeLabel = node ? `${RESOURCE_DEFS[node.type]?.label || node.type} Node` : '—';
  const holdingReason = getShipHoldingReason(ship);
  const dist = getShipDistanceInfo(ship);
  const routeError = getShipRouteError(ship);
  const cargoStr = `${fmt(ship.cargo)}<span class="unit">/${fmt(ship.capacity)}</span>`;
  const rangeStr = dist.atBase ? '0<span class="unit"> tiles</span>' : `${dist.tiles}<span class="unit"> tiles</span>`;
  const tierStr = tierDef?.label || `Tier ${toRoman(safeTier)}`;
  const statusClean = (statusMeta.message || '').replace(/^[^\w]+/, '').trim() || statusMeta.badge;

  let vitals = '';
  let ops = '';
  let assign = '';
  let vitalsCls = '';

  if (role === 'mining') {
    const bonus = Number.isFinite(ship.mineBonus) ? ship.mineBonus : mineBonusFromLevel(ship.mineBonusLevel || 0);
    vitals = smVital('luggage', 'CARGO', `<span id="action-panel-cargo-vital">${cargoStr}</span>`)
      + smVital('speed', 'FLY SPD', formatFlySpeed(ship.flySpeed))
      + smVital('hardware', 'MINE SPD', `${formatMineSpeedPercent(ship.mineSpeed).replace('%', '')}<span class="unit">%</span>`)
      + smVital('stars', 'MINE BONUS', `${formatMineBonusPercent(bonus).replace('%', '')}<span class="unit">%</span>`);
    ops = smInfoRow('STATUS', statusClean, holdingReason ? 'bad' : '', 'action-panel-status')
      + smInfoRow('ROLE', roleLabel, 'accent')
      + smInfoRow('TYPE', typeLabel)
      + smInfoRow('MINE TIER', tierStr, '', 'action-panel-tier');
    assign = smInfoRow('NODE', node ? nodeLabel : 'UNASSIGNED', node ? '' : 'bad', 'action-panel-node')
      + smInfoRow('RESOURCE', node ? (RESOURCE_DEFS[node.type]?.label || node.type) : '—', node ? 'accent' : '')
      + smInfoRow('DROPOFF', getShipDepotFilterLabel(ship))
      + smInfoRow('HOLDING', holdingReason ? 'Yes — blocked' : 'No', holdingReason ? 'bad' : 'ok', 'action-panel-holding-flag')
      + smInfoRow('RANGE', dist.atBase ? 'At Base' : `${dist.tiles} tiles`, dist.atBase ? 'ok' : '', 'action-panel-dist');
  } else if (role === 'transport') {
    vitals = smVital('luggage', 'CARGO', `<span id="action-panel-cargo-vital">${cargoStr}</span>`)
      + smVital('speed', 'FLY SPD', formatFlySpeed(ship.flySpeed))
      + smVital('download', 'LOAD SPD', `${formatLoadSpeed(ship.loadSpeed || 0).replace('/s', '')}<span class="unit">/s</span>`)
      + smVital('social_distance', 'RANGE', `<span id="action-panel-dist">${rangeStr}</span>`);
    ops = smInfoRow('STATUS', statusClean, '', 'action-panel-status')
      + smInfoRow('ROLE', roleLabel, 'accent')
      + smInfoRow('TYPE', typeLabel)
      + smInfoRow('ROUTE LOOP', '—');
    assign = smInfoRow('PICKUP', getShipPickupLabel(ship))
      + smInfoRow('DROPOFF', getShipDepotFilterLabel(ship))
      + smInfoRow('MANIFEST', getShipCargoSummary(ship))
      + smInfoRow('HOLD', `${fmt(ship.cargo)} / ${fmt(ship.capacity)}`, '', 'action-panel-cargo');
  } else if (role === 'combat' || role === 'garrison') {
    vitalsCls = ' cols-5';
    vitals = smVital('favorite', 'HULL HP', (ship.hp || 0).toLocaleString())
      + smVital('swords', 'ATTACK', String(ship.attack || 0))
      + smVital('bolt', 'ATK RATE', `${formatAtkRatePercent(ship.attackSpeed || 0).replace('%', '')}<span class="unit">%</span>`)
      + smVital('speed', 'FLY SPD', formatFlySpeed(ship.flySpeed))
      + smVital('social_distance', 'RANGE', `<span id="action-panel-dist">${rangeStr}</span>`);
    ops = smInfoRow('STATUS', statusClean, 'accent', 'action-panel-status')
      + smInfoRow('ROLE', roleLabel, 'accent')
      + smInfoRow('TYPE', typeLabel)
      + smInfoRow('SHIP TIER', tierStr, '', 'action-panel-tier');
    assign = role === 'garrison'
      ? smInfoRow('REST POST', '—')
        + smInfoRow('TARGET AI', 'Nearest Threat')
        + smInfoRow('WEAPONS', '—')
        + smInfoRow('POSTURE', 'Hold perimeter')
      : smInfoRow('TARGET AI', 'Lowest Health')
        + smInfoRow('WEAPONS', '—')
        + smInfoRow('DPS', '—')
        + smInfoRow('SLOTS', '—');
  } else {
    vitals = smVital('speed', 'FLY SPD', formatFlySpeed(ship.flySpeed));
    if ((ship.capacity || 0) > 0) vitals = smVital('luggage', 'CARGO', `<span id="action-panel-cargo-vital">${cargoStr}</span>`) + vitals;
    if ((ship.mineSpeed || 0) > 0) {
      const bonus = Number.isFinite(ship.mineBonus) ? ship.mineBonus : mineBonusFromLevel(ship.mineBonusLevel || 0);
      vitals += smVital('hardware', 'MINE SPD', `${formatMineSpeedPercent(ship.mineSpeed).replace('%', '')}<span class="unit">%</span>`);
      vitals += smVital('stars', 'MINE BONUS', `${formatMineBonusPercent(bonus).replace('%', '')}<span class="unit">%</span>`);
    }
    if ((ship.hp || 0) > 0) vitals += smVital('favorite', 'HULL HP', (ship.hp || 0).toLocaleString());
    ops = smInfoRow('STATUS', statusClean, '', 'action-panel-status')
      + smInfoRow('ROLE', roleLabel, 'accent')
      + smInfoRow('TYPE', typeLabel)
      + smInfoRow('SHIP TIER', tierStr, '', 'action-panel-tier');
    assign = smInfoRow('RANGE', dist.atBase ? 'At Base' : `${dist.tiles} tiles`, dist.atBase ? 'ok' : '', 'action-panel-dist');
  }

  const alertHtml = holdingReason
    ? `<div class="sm-details-alert" id="action-panel-holding-reason">${msIcon('warning')}<span>${holdingReason}</span></div>`
    : routeError
      ? `<div class="sm-details-alert err" id="action-panel-route-error">${msIcon('error')}<span>${routeError}</span></div>`
      : `<div class="sm-details-alert" id="action-panel-holding-reason" hidden></div>`;

  return `<div class="sm-details">
    <div class="sm-details-vitals${vitalsCls}">${vitals}</div>
    <div class="sm-details-info">
      <div class="sm-info-block">
        <div class="blk-title">◈ OPERATIONS</div>
        ${ops}
      </div>
      <div class="sm-info-block">
        <div class="blk-title">◈ ${role === 'combat' ? 'COMBAT' : role === 'garrison' ? 'DEFENSE' : 'ASSIGNMENT'}</div>
        ${assign}
      </div>
    </div>
    ${alertHtml}
  </div>`;
}

function buildPrimaryPane(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  if (role === 'mining') return buildMiningPrimary(ship);
  if (role === 'transport') return buildTransportPrimary(ship);
  if (role === 'combat') return buildCombatPrimary(ship, true);
  if (role === 'garrison') return buildCombatPrimary(ship, false);
  return `<div class="sm-panel full"><div class="sm-panel-b"><div class="sm-hint">Unique vessel — no primary assignment controls.</div></div></div>`;
}

window.focusShipAssignedNode = function(shipId) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship || ship.targetNode == null) return;
  const node = state.nodes.find(n => n.id === ship.targetNode);
  if (!node) return;
  const w = node.wx != null && node.wy != null
    ? { x: node.wx, y: node.wy }
    : gridToWorld(node.gr[0], node.gr[1]);
  focusOn(w.x, w.y, Math.max(cam.zoom, 1.2));
};

function buildMiningPrimary(ship) {
  const node = ship.targetNode != null ? state.nodes.find(n => n.id === ship.targetNode) : null;
  const holdingReason = getShipHoldingReason(ship);
  const nodeCard = node
    ? `<button type="button" class="sm-node-card clickable" id="action-panel-node-card" onclick="focusShipAssignedNode(${ship.id})" title="Find on map">
        <div class="sm-node-ico">${resourceIconHtml(node.type, 32)}</div>
        <div class="sm-node-meta">
          <div class="sm-node-name">${RESOURCE_DEFS[node.type]?.label || node.type} Node</div>
          <div class="sm-node-sub"><b style="color:${RESOURCE_DEFS[node.type]?.color || '#40b0e0'}">${RESOURCE_DEFS[node.type]?.label || node.type}</b> · ${MINE_TIERS[node.minLevel || 1]?.label || `Tier ${toRoman(node.minLevel || 1)}`}</div>
        </div>
        <span class="sm-node-pin">${msIcon('my_location')}</span>
      </button>`
    : `<div class="sm-node-card empty" id="action-panel-node-card">
        <div class="sm-node-ico">${msIcon('wrong_location')}</div>
        <div class="sm-node-meta">
          <div class="sm-node-name">No node assigned</div>
          <div class="sm-node-sub">Click a node on the map while this ship is selected</div>
        </div>
      </div>`;

  const safeTier = Math.min(10, Math.max(1, ship.mineTier || 1));
  const canMine = node ? (node.minLevel || 1) <= safeTier : false;
  const tierStr = MINE_TIERS[safeTier]?.label || `Tier ${toRoman(safeTier)}`;

  return `<div class="sm-details">
    <div class="sm-details-info" style="flex:1">
      <div class="sm-info-block sm-info-block-fill">
        <div class="blk-title">◈ NODE</div>
        ${nodeCard}
        ${smInfoRow('MINE TIER', tierStr, '', 'action-panel-tier')}
        ${smInfoRow('COMPAT', node ? (canMine ? 'Can mine' : 'Tier too low') : '—', node ? (canMine ? 'ok' : 'bad') : '', 'action-panel-compat')}
        <div class="sm-hint">Assigned by clicking a node on the map with this ship selected. Dimmed nodes need a higher mine tier.</div>
      </div>
      <div class="sm-info-block sm-info-block-fill">
        <div class="blk-title">◈ DROPOFF</div>
        <div class="sm-field">
          <label>DELIVER TO</label>
          <select id="action-panel-depot-select" onchange="setShipDepot(${ship.id}, this.value)">${buildDepotOptionsHtml(ship)}</select>
        </div>
        ${holdingReason ? `<div class="sm-details-alert" id="action-panel-holding-reason">${msIcon('warning')}<span>${holdingReason}</span></div>` : `<div class="sm-details-alert" id="action-panel-holding-reason" hidden></div>`}
        ${smInfoRow('CARGO', `${fmt(ship.cargo)} / ${fmt(ship.capacity)}`, '', 'action-panel-cargo')}
        ${smInfoRow('HOLDING', holdingReason ? 'Yes — blocked' : 'No', holdingReason ? 'bad' : 'ok', 'action-panel-holding-flag')}
        <div class="sm-hint">Free space at dropoff or change depot to leave holding pattern.</div>
      </div>
    </div>
  </div>`;
}

function buildTransportPrimary(ship) {
  const routeError = getShipRouteError(ship);
  const holdingReason = getShipHoldingReason(ship);
  const transportSummary = getShipTransportSummary(ship);
  const cargoPct = ship.capacity > 0 ? (ship.cargo / ship.capacity) * 100 : 0;

  return `<div class="sm-details">
    <div class="sm-details-info" style="flex:1">
      <div class="sm-info-block sm-info-block-fill">
        <div class="blk-title">◈ ROUTE</div>
        <div class="sm-field">
          <label>PICK UP</label>
          <select id="action-panel-pickup-select" onchange="setShipPickup(${ship.id}, this.value)">${buildPickupOptionsHtml(ship)}</select>
        </div>
        <div class="sm-field" style="margin-top:8px">
          <label>DROP OFF</label>
          <select id="action-panel-depot-select" onchange="setShipDepot(${ship.id}, this.value)">${buildDepotOptionsHtml(ship)}</select>
        </div>
        ${routeError ? `<div class="sm-details-alert err" id="action-panel-route-error">${msIcon('error')}<span>${routeError}</span></div>` : `<div class="sm-details-alert err" id="action-panel-route-error" hidden></div>`}
        ${holdingReason ? `<div class="sm-details-alert" id="action-panel-holding-reason">${msIcon('warning')}<span>${holdingReason}</span></div>` : `<div class="sm-details-alert" id="action-panel-holding-reason" hidden></div>`}
        <div class="sm-hint">Multi-step route planner coming soon. For now set pickup and dropoff depots.</div>
      </div>
      <div class="sm-info-block sm-info-block-fill">
        <div class="blk-title">◈ INVENTORY <span class="blk-sub" id="action-panel-transporting-label">${transportSummary.label}</span></div>
        ${smInfoRow('CARGO', `${fmt(ship.cargo)} / ${fmt(ship.capacity)}`, '', 'action-panel-cargo')}
        <div class="sm-cargo-bar"><i id="action-panel-cargo-bar" style="width:${cargoPct}%"></i></div>
        <div id="action-panel-transporting" style="flex:1;min-height:0;overflow:auto;margin-top:8px">${getShipInventoryHtml(ship)}</div>
      </div>
    </div>
  </div>`;
}

function buildCombatPrimary(ship, isCombat) {
  const targeting = `
    <div class="sm-radio-list">
      <div class="sm-radio on"><div class="dot"></div><div><div class="t">Lowest Health</div><div class="d">Finish wounded first</div></div></div>
      <div class="sm-radio"><div class="dot"></div><div><div class="t">Highest Health</div><div class="d">Focus tanks</div></div></div>
      <div class="sm-radio"><div class="dot"></div><div><div class="t">Fastest Ship</div><div class="d">Intercept runners</div></div></div>
      <div class="sm-radio"><div class="dot"></div><div><div class="t">Nearest Threat</div><div class="d">Closest first</div></div></div>
      ${isCombat ? `<div class="sm-radio"><div class="dot"></div><div><div class="t">Follow &amp; Assist Garrison</div><div class="d">Escort garrison targets</div></div></div>` : ''}
      ${!isCombat ? `<div class="sm-radio"><div class="dot"></div><div><div class="t">Rest at Building</div><div class="d">Orbit / guard post</div></div></div>` : ''}
    </div>
    <div class="sm-soon">Targeting AI — coming soon</div>`;

  const weapons = `
    <div class="sm-weapon-slots">
      <div class="sm-weapon">
        <div class="w-ico">${msIcon('bolt', true)}</div>
        <div>
          <div class="slot-lab">PORT WING</div>
          <div class="w-name">PULSE LASER</div>
          <div class="w-stats">
            <span class="w-pill">DMG <b>${ship.attack || 28}</b></span>
            <span class="w-pill">RATE <b>${formatAtkRatePercent(ship.attackSpeed || 0)}</b></span>
          </div>
        </div>
        <div class="w-side">
          <div class="w-dps">HP<strong>${(ship.hp || 0).toLocaleString()}</strong></div>
          <button class="w-btn" type="button" disabled>SWAP</button>
        </div>
      </div>
      <div class="sm-weapon empty">
        <div class="w-ico">${msIcon('add')}</div>
        <div>
          <div class="slot-lab">CENTER</div>
          <div class="w-name">EMPTY SLOT</div>
          <div class="w-stats"><span class="w-pill">No weapon installed</span></div>
        </div>
        <div class="w-side">
          <div class="w-dps">DPS<strong>—</strong></div>
          <button class="w-btn" type="button" disabled>INSTALL</button>
        </div>
      </div>
      <div class="sm-weapon empty">
        <div class="w-ico">${msIcon('add')}</div>
        <div>
          <div class="slot-lab">STARBOARD</div>
          <div class="w-name">EMPTY SLOT</div>
          <div class="w-stats"><span class="w-pill">No weapon installed</span></div>
        </div>
        <div class="w-side">
          <div class="w-dps">DPS<strong>—</strong></div>
          <button class="w-btn" type="button" disabled>INSTALL</button>
        </div>
      </div>
    </div>
    <div class="sm-soon">Weapon loadouts — coming soon</div>`;

  return `<div class="sm-details">
    <div class="sm-details-info sm-details-info-66" style="flex:1">
      <div class="sm-info-block sm-info-block-fill">
        <div class="blk-title">◈ WEAPONS <span class="blk-sub">3 slots</span></div>
        ${weapons}
      </div>
      <div class="sm-info-block sm-info-block-fill">
        <div class="blk-title">◈ TARGETING</div>
        ${!isCombat ? `<div class="sm-field" style="margin-bottom:10px">
          <label>REST POST</label>
          <select disabled><option>${state.base.name || 'Base Station'}</option></select>
        </div>` : ''}
        ${targeting}
      </div>
    </div>
  </div>`;
}

function buildShipFooter(ship, sellVal) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const canRecall = role === 'mining' && ship.status !== 'idle' && (ship.mineSpeed || 0) > 0;
  const followOn = state.followShip === ship.id;
  return `
    ${canRecall ? `<button type="button" class="sm-fbtn danger" onclick="recallShip(${ship.id})">${msIcon('undo')} RECALL</button>` : ''}
    <button type="button" class="sm-fbtn${followOn ? ' on' : ''}" onclick="toggleFollowShip(${ship.id})">${msIcon(followOn ? 'cancel' : 'filter_center_focus')} ${followOn ? 'UNFOLLOW' : 'FOLLOW'}</button>
    <button type="button" class="sm-fbtn" onclick="openRenameOverlay(${ship.id})">${msIcon('edit')} RENAME</button>
    <button type="button" class="sm-fbtn sell" ${state.ships.length <= 1 ? 'disabled title="Cannot sell your last ship"' : ''} onclick="openSellOverlay(${ship.id}, ${sellVal})">SELL $${fmt(sellVal)}</button>
    <button type="button" class="sm-fbtn salvage" ${state.ships.length <= 1 ? 'disabled title="Cannot salvage your last ship"' : ''} onclick="openSalvageOverlay(${ship.id})">${msIcon('recycling')} SALVAGE</button>`;
}

function buildShipModalContent(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const roleLabel = ROLE_LABELS[role] || role;
  const typeLabel = getShipTypeLabel(ship);
  const statusMeta = getShipStatusMeta(ship);
  const safeTier = Math.min(10, Math.max(1, ship.mineTier || 1));
  const tierDef = MINE_TIERS[safeTier];
  const tierColor = TIER_COLORS[safeTier] || '#e8eaf0';
  const sellVal = getShipSellValue(ship);
  const primary = ROLE_PRIMARY_TAB[role] || ROLE_PRIMARY_TAB.mining;
  const tab = _shipModalTab;
  const pillCls = statusPillClass(statusMeta);
  const node = ship.targetNode != null ? state.nodes.find(n => n.id === ship.targetNode) : null;
  const dist = getShipDistanceInfo(ship);
  const nodeMeta = node
    ? `<span>Node <b class="ok">${RESOURCE_DEFS[node.type]?.label || node.type} Node</b></span>`
    : '';
  const rangeMeta = `<span>Range <b id="ship-modal-range-meta">${dist.atBase ? 'At Base' : `${dist.tiles} tiles`}</b></span>`;

  return `<div data-ship-modal-root="1" class="sm-root">
    <div class="sm-hero">
      <div class="sm-hero-left">
        <div class="sm-hero-name-row">
          <div class="sm-hero-name" id="ship-modal-name">${ship.name}</div>
          <button class="sm-hero-rename" type="button" title="Rename" onclick="openRenameOverlay(${ship.id})">${msIcon('edit')}</button>
          <span class="sm-status-pill ${pillCls}" id="ship-modal-status-pill">
            <span id="ship-modal-status-text">${statusMeta.badge}</span>
          </span>
        </div>
        <div class="sm-hero-meta">
          <span>Role <b style="color:${ROLE_ACCENTS[role]}">${roleLabel}</b></span>
          <span>Type <b>${typeLabel}</b></span>
          ${nodeMeta}
          ${rangeMeta}
        </div>
      </div>
      <div class="sm-tier-badge" id="ship-modal-tier-badge" style="background:${tierColor};color:#111">${tierDef?.label || `TIER ${toRoman(safeTier)}`}</div>
    </div>
    <div class="sm-tabs">
      <button type="button" class="sm-tab${tab === 'details' ? ' on' : ''}" onclick="setShipModalTab('details')">${msIcon('info')} DETAILS</button>
      <button type="button" class="sm-tab${tab === 'primary' ? ' on' : ''}" onclick="setShipModalTab('primary')">${msIcon(primary.icon)} ${primary.label}</button>
      <button type="button" class="sm-tab${tab === 'upgrades' ? ' on' : ''}" id="upgrades-section-header" onclick="setShipModalTab('upgrades')">${msIcon('upgrade')} UPGRADES</button>
    </div>
    <div class="sm-tab-body">
      <div class="sm-pane${tab === 'details' ? ' on' : ''}" data-sm-pane="details">${tab === 'details' ? buildDetailsPane(ship) : ''}</div>
      <div class="sm-pane${tab === 'primary' ? ' on' : ''}" data-sm-pane="primary">${tab === 'primary' ? buildPrimaryPane(ship) : ''}</div>
      <div class="sm-pane${tab === 'upgrades' ? ' on' : ''}" data-sm-pane="upgrades" id="ship-upgrades-body">${tab === 'upgrades' ? buildUpgradesSection(ship.id) : ''}</div>
    </div>
    <div class="sm-footer" id="ship-bottom-actions">${buildShipFooter(ship, sellVal)}</div>
  </div>`;
}

/** Lightweight live update for the open ship modal (called from main rAF loop). */
export function patchSelectedShipModal(ship) {
  if (!ship) return;
  const body = document.getElementById('ship-modal-body');
  if (!body?.querySelector('[data-ship-modal-root]')) return;
  patchShipModalContent(ship);
}

function patchShipModalContent(ship) {
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const statusMeta = getShipStatusMeta(ship);
  const sellVal = getShipSellValue(ship);
  const dist = getShipDistanceInfo(ship);
  const safeTier = Math.min(10, Math.max(1, ship.mineTier || 1));
  const tierDef = MINE_TIERS[safeTier];
  const tierColor = TIER_COLORS[safeTier] || '#e8eaf0';
  const holdingReason = getShipHoldingReason(ship);
  const routeError = getShipRouteError(ship);
  const transportSummary = getShipTransportSummary(ship);
  const cargoText = `${ship.cargo} / ${ship.capacity}`;

  setTextIfChanged(document.getElementById('ship-modal-name'), ship.name);

  const pill = document.getElementById('ship-modal-status-pill');
  if (pill) {
    pill.className = `sm-status-pill ${statusPillClass(statusMeta)}`;
  }
  setTextIfChanged(document.getElementById('ship-modal-status-text'), statusMeta.badge);

  const tierBadge = document.getElementById('ship-modal-tier-badge');
  if (tierBadge) {
    setTextIfChanged(tierBadge, tierDef?.label || `TIER ${toRoman(safeTier)}`);
    tierBadge.style.background = tierColor;
    tierBadge.style.color = '#111';
  }

  const rangeMeta = document.getElementById('ship-modal-range-meta');
  if (rangeMeta) setTextIfChanged(rangeMeta, dist.atBase ? 'At Base' : `${dist.tiles} tiles`);

  const statusClean = (statusMeta.message || '').replace(/^[^\w]+/, '').trim() || statusMeta.badge;
  const statusEl = document.getElementById('action-panel-status');
  if (statusEl) {
    setTextIfChanged(statusEl, statusClean);
    statusEl.classList.toggle('bad', !!holdingReason);
  }

  const node = ship.targetNode != null ? state.nodes.find(n => n.id === ship.targetNode) : null;
  const nodeLabel = node ? `${RESOURCE_DEFS[node.type]?.label || node.type} Node` : 'UNASSIGNED';
  const nodeEl = document.getElementById('action-panel-node');
  if (nodeEl) {
    setTextIfChanged(nodeEl, nodeLabel);
    nodeEl.classList.toggle('bad', !node);
  }

  document.querySelectorAll('#action-panel-tier').forEach(tierEl => {
    setTextIfChanged(tierEl, tierDef?.label || `Tier ${toRoman(safeTier)}`);
  });

  const cargoVital = document.getElementById('action-panel-cargo-vital');
  if (cargoVital) {
    const html = `${fmt(ship.cargo)}<span class="unit">/${fmt(ship.capacity)}</span>`;
    setHtmlIfChanged(cargoVital, html);
  }
  document.querySelectorAll('#action-panel-cargo').forEach(cargoEl => {
    setTextIfChanged(cargoEl, cargoText);
  });

  const distEl = document.getElementById('action-panel-dist');
  if (distEl) {
    if (distEl.querySelector('.unit')) {
      setHtmlIfChanged(distEl, dist.atBase ? '0<span class="unit"> tiles</span>' : `${dist.tiles}<span class="unit"> tiles</span>`);
    } else {
      setTextIfChanged(distEl, dist.atBase ? 'At Base' : `${dist.tiles} tiles`);
      distEl.classList.toggle('ok', dist.atBase);
    }
  }

  const cargoBar = document.getElementById('action-panel-cargo-bar');
  if (cargoBar) {
    const pct = ship.capacity > 0 ? (ship.cargo / ship.capacity) * 100 : 0;
    cargoBar.style.width = `${pct}%`;
  }

  const depotSelect = document.getElementById('action-panel-depot-select');
  if (depotSelect && document.activeElement !== depotSelect) {
    depotSelect.value = ship.depotType === 'base' || ship.depotType === 'research_lab' ? 'base' : `${ship.depotType}:${ship.depotId}`;
  }

  const pickupSelect = document.getElementById('action-panel-pickup-select');
  if (pickupSelect && document.activeElement !== pickupSelect) {
    pickupSelect.value = (ship.pickupType === null || ship.pickupType === undefined || ship.pickupType === '')
      ? ''
      : (ship.pickupType === 'base' ? 'base' : `${ship.pickupType}:${ship.pickupId}`);
  }

  setTextIfChanged(document.getElementById('action-panel-transporting-label'), transportSummary.label);
  {
    const invEl = document.getElementById('action-panel-transporting');
    if (invEl) {
      const cargoEntries = Object.entries(ship.cargoManifest || {})
        .filter(([resourceType, amount]) => amount > 0 && isMineableCargoType(resourceType));
      if (!cargoEntries.length && ship.cargo > 0 && ship.cargoResource && isMineableCargoType(ship.cargoResource)) {
        cargoEntries.push([ship.cargoResource, ship.cargo]);
      }
      const invSig = cargoEntries.map(([t, a]) => `${t}:${a}`).join('|') || 'empty';
      if (invEl.dataset.invSig !== invSig) {
        invEl.dataset.invSig = invSig;
        updateShipTransporting(invEl, ship);
      }
    }
  }

  const routeErrorEl = document.getElementById('action-panel-route-error');
  if (routeErrorEl) {
    setTextIfChanged(routeErrorEl, routeError || '');
    routeErrorEl.style.display = routeError ? 'block' : 'none';
  }

  document.querySelectorAll('#action-panel-holding-reason').forEach(holdingReasonEl => {
    if (holdingReasonEl.classList.contains('sm-details-alert')) {
      if (holdingReason) {
        holdingReasonEl.hidden = false;
        const span = holdingReasonEl.querySelector('span:last-child');
        if (span) setTextIfChanged(span, holdingReason);
        else setHtmlIfChanged(holdingReasonEl, `${msIcon('warning')}<span>${holdingReason}</span>`);
      } else {
        holdingReasonEl.hidden = true;
      }
    } else {
      setTextIfChanged(holdingReasonEl, holdingReason || '');
      holdingReasonEl.style.display = holdingReason ? 'block' : 'none';
    }
  });

  const holdingFlag = document.getElementById('action-panel-holding-flag');
  if (holdingFlag) {
    setTextIfChanged(holdingFlag, holdingReason ? 'Yes — blocked' : 'No');
    holdingFlag.classList.toggle('bad', !!holdingReason);
    holdingFlag.classList.toggle('ok', !holdingReason);
  }

  const routeErrEl = document.getElementById('action-panel-route-error');
  if (routeErrEl && routeErrEl.classList.contains('sm-details-alert')) {
    if (routeError) {
      routeErrEl.hidden = false;
      const span = routeErrEl.querySelector('span:last-child');
      if (span) setTextIfChanged(span, routeError);
    } else {
      routeErrEl.hidden = true;
    }
  }

  // Upgrades HTML is only rebuilt on tab switch / upgrade action (not every tick)
  // Avoid rewriting footer every frame — only when follow/sell value changes
  const footer = document.getElementById('ship-bottom-actions');
  if (footer) {
    const followOn = state.followShip === ship.id ? '1' : '0';
    const footerSig = `${followOn}|${sellVal}|${state.ships.length}`;
    if (footer.dataset.sig !== footerSig) {
      footer.dataset.sig = footerSig;
      footer.innerHTML = buildShipFooter(ship, sellVal);
    }
  }
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

function showSellOverlay({ kind, id, mode = 'sell', value = 0, title, name, valueHtml, hint, confirmLabel, refundIron = 0, refundCopper = 0 }) {
  _sellOverlayCtx = { kind, id, mode, value, refundIron, refundCopper };
  const titleEl = document.getElementById('sell-overlay-title');
  const hintEl = document.getElementById('sell-overlay-hint');
  const confirmEl = document.getElementById('sell-overlay-confirm');
  const nameEl = document.getElementById('sell-ship-name');
  const valueEl = document.getElementById('sell-ship-value');
  if (titleEl) titleEl.textContent = title;
  if (nameEl) nameEl.textContent = name;
  if (valueEl) valueEl.innerHTML = valueHtml;
  if (hintEl) hintEl.innerHTML = hint || 'This cannot be undone.';
  if (confirmEl) confirmEl.textContent = confirmLabel || 'CONFIRM SELL';
  const overlay = document.getElementById('sell-overlay');
  if (overlay) {
    overlay.classList.add('show');
    overlay.onclick = e => { if (e.target === overlay) window.closeSellOverlay(); };
  }
}

window.openSellOverlay = function(shipId) {
  if (state.ships.length <= 1) return;
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  const sellVal = arguments[1] ?? 0;
  showSellOverlay({
    kind: 'ship',
    id: shipId,
    mode: 'sell',
    value: sellVal,
    title: '⊘ Sell Ship',
    name: ship.name,
    valueHtml: `$${fmt(sellVal)}`,
    hint: getShipDispositionWarning(ship),
    confirmLabel: 'CONFIRM SELL',
  });
};

window.openSalvageOverlay = function(shipId) {
  if (state.ships.length <= 1) return;
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  const salvage = getShipSalvageRewards(ship);
  showSellOverlay({
    kind: 'ship',
    id: shipId,
    mode: 'salvage',
    value: 0,
    title: '♻ Salvage Ship',
    name: ship.name,
    valueHtml: salvage.map(({ type, amount }) => `<span style="color:${RESOURCE_DEFS[type]?.color || '#6fff9a'};">${fmt(amount)} ${RESOURCE_DEFS[type]?.label || type}</span>`).join(' + '),
    hint: getShipDispositionWarning(ship),
    confirmLabel: 'CONFIRM SALVAGE',
  });
};

window.openModuleSellOverlay = function(moduleId, name, label, refundCoins) {
  showSellOverlay({
    kind: 'module',
    id: moduleId,
    mode: 'sell',
    value: refundCoins,
    title: `⊘ Sell ${label}`,
    name,
    valueHtml: `$${fmt(refundCoins)}`,
    hint: 'This cannot be undone.',
    confirmLabel: 'CONFIRM SELL',
  });
};

window.openTurretSellOverlay = function(turretId, name, refundCoins, refundIron, refundCopper) {
  showSellOverlay({
    kind: 'turret',
    id: turretId,
    mode: 'sell',
    value: refundCoins,
    refundIron,
    refundCopper,
    title: '⊘ Sell Turret',
    name,
    valueHtml: `<span style="color:#6fff9a;">$${fmt(refundCoins)}</span> + <span style="color:#4d8;">${refundIron} Iron</span> + <span style="color:#4d8;">${refundCopper} Copper</span>`,
    hint: 'This cannot be undone.',
    confirmLabel: 'CONFIRM SELL',
  });
};

window.closeSellOverlay = function() {
  _sellOverlayCtx = null;
  const overlay = document.getElementById('sell-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.onclick = null;
  }
};

window.confirmSellOverlay = function() {
  const ctx = _sellOverlayCtx;
  window.closeSellOverlay();
  if (!ctx) return;
  if (ctx.kind === 'ship') {
    if (ctx.mode === 'salvage') window.salvageShip(ctx.id);
    else window.sellShip(ctx.id, ctx.value);
  } else if (ctx.kind === 'module') {
    window.sellStorageFacility?.(ctx.id, ctx.value);
  } else if (ctx.kind === 'turret') {
    window.doScrapTurret?.(ctx.id, ctx.value, ctx.refundIron, ctx.refundCopper);
  }
};

// ── Upgrades section (role-aware battle-pass layout) ───────────────────────
function buildUpgradesSection(shipId) {
  const s2 = state.ships.find(s => s.id === shipId); if (!s2) return '';
  const role = SHIP_DEFS[s2.type]?.role || 'mining';
  const isUnique = SHIP_DEFS[s2.type]?.unique === true;

  if (isUnique) {
    return '<div class="sm-maxed">★ LEGENDARY — ALL STATS MAXED</div>';
  }

  const st = Math.min(10, Math.max(1, s2.mineTier || 1));
  const nt = st < 10 ? st + 1 : null;
  const tCost = nt ? SHIP_TIER_COSTS[nt] : null;
  const blockedByBase = nt && nt > state.base.level;
  const canAffordTier = nt && state.coins >= tCost;
  const cap = TIER_UPGRADE_CAP[st];
  const tierResReqs = nt ? (SHIP_TIER_REQS[nt] || null) : null;
  const tierResMet = tierResReqs ? Object.entries(tierResReqs).every(([r, n]) => (state.resources[r] || 0) >= n) : true;
  const canUpgradeTier = !blockedByBase && canAffordTier && tierResMet;

  const nodes = [];
  for (let i = 1; i <= 10; i++) {
    let cls = 'locked';
    if (i < st) cls = 'done';
    else if (i === st) cls = 'current';
    const label = i === 10 ? 'X' : String(i);
    nodes.push(`<div class="sm-bp-node ${cls}"><div class="sm-bp-dot">${label}</div><div class="nm">T${label}</div></div>`);
  }
  let costChips = '';
  if (nt && tierResReqs) {
    for (const [r, n] of Object.entries(tierResReqs)) {
      const met = (state.resources[r] || 0) >= n;
      const label = RESOURCE_DEFS[r]?.label || r;
      costChips += `<span class="sm-bp-chip${met ? '' : ' unmet'}" data-tippy-content="${label}">${resourceIconHtml(r, 18)}${fmt(n)}</span>`;
    }
  }
  if (nt && tCost != null) {
    const cashMet = state.coins >= tCost;
    costChips += `<span class="sm-bp-chip cash${cashMet ? '' : ' unmet'}" data-tippy-content="Credits"><span class="cash-ico">$</span>${fmt(tCost)}</span>`;
  }

  const tierActions = nt
    ? `<div class="sm-bp-cost">
        <span class="cost-lab">COST</span>
        ${costChips}
        ${blockedByBase ? `<span class="sm-bp-chip unmet">Base T${nt} required</span>` : ''}
      </div>
      <button class="sm-btn-tier" type="button" onclick="upgradeShip(${s2.id},'mineTier',1)" ${canUpgradeTier ? '' : 'disabled'}>ADVANCE TIER →</button>`
    : '<div class="sm-maxed">★ MAX TIER REACHED</div>';

  const tierBlock = `<div class="sm-bp-wrap" id="upgrades-section-body">
    <div class="sm-bp-head">
      <span class="lab">◈ SHIP TIER TRACK</span>
      <span class="next">${nt ? `Next unlock · <b>Tier ${nt === 10 ? 'X' : nt}</b>` : 'Fully ascended'}</span>
    </div>
    <div class="sm-bp-track" data-tier="${st}">
      <div class="sm-bp-rail"><div class="sm-bp-fill"></div></div>
      ${nodes.join('')}
    </div>
    <div class="sm-bp-actions">${tierActions}</div>
  </div>`;

  function statCard(icon, label, lv, cur, next, cost, chunk, stat) {
    const maxed = chunk <= 0;
    const canBuy = !maxed && state.coins >= cost;
    return `<div class="sm-stat-upg">
      <div class="sm-stat-upg-h">
        ${msIcon(icon)}
        <span class="t">${label}</span>
        <span class="lv">Lv ${lv}</span>
      </div>
      <div class="sm-stat-upg-b">
        <div class="sm-stat-upg-vals">
          <span class="cur">${cur}</span>
          ${maxed
            ? '<span class="arrow">·</span><span class="max">MAX</span>'
            : `<span class="arrow">→</span><span class="next">${next}</span>`}
        </div>
        <button class="sm-stat-upg-btn" type="button" onclick="upgradeShip(${s2.id},'${stat}',${Math.max(1, chunk)})" ${canBuy ? '' : 'disabled'}>
          ${maxed ? '★ MAX' : `↑ $${fmt(cost)}`}
        </button>
      </div>
    </div>`;
  }

  const cards = [];
  if (role === 'mining') {
    const bonusLv = s2.mineBonusLevel || 0;
    const bonusCur = Number.isFinite(s2.mineBonus) ? s2.mineBonus : mineBonusFromLevel(bonusLv);
    const bonusCap = mineBonusUpgradeCap(s2.mineTier);
    const capChk = s2.capacityLevel >= cap ? 0 : 1;
    const flyChk = s2.flySpeedLevel >= cap ? 0 : 1;
    const mineChk = s2.mineSpeedLevel >= cap ? 0 : 1;
    const bonusChk = bonusLv >= bonusCap ? 0 : 1;
    cards.push(statCard('luggage', 'CARGO', s2.capacityLevel, s2.capacity,
      capChk ? capacityFromTierAndLevel(s2.type, s2.mineTier, s2.capacityLevel + 1, s2.capacity) : 'MAX',
      capChk ? upgradeTotalCost(UPGRADE_CAP_COST, s2, 'capacity', capChk) : 0, capChk, 'capacity'));
    cards.push(statCard('speed', 'FLY SPD', s2.flySpeedLevel, formatFlySpeed(s2.flySpeed),
      flyChk ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1)) : 'MAX',
      flyChk ? upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', flyChk) : 0, flyChk, 'flySpeed'));
    cards.push(statCard('hardware', 'MINE SPD', s2.mineSpeedLevel, formatMineSpeedPercent(s2.mineSpeed),
      mineChk ? formatMineSpeedPercent(mineSpeedFromLevel(s2.type, s2.mineSpeedLevel + 1)) : 'MAX',
      mineChk ? upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', mineChk) : 0, mineChk, 'mineSpeed'));
    cards.push(statCard('stars', 'MINE BONUS', bonusLv, formatMineBonusPercent(bonusCur),
      bonusChk ? formatMineBonusPercent(mineBonusFromLevel(bonusLv + 1)) : 'MAX',
      bonusChk ? upgradeTotalCost(UPGRADE_MINE_BONUS_COST, s2, 'mineBonus', bonusChk) : 0, bonusChk, 'mineBonus'));
  } else if (role === 'transport') {
    const loadLv = s2.loadSpeedLevel || 0;
    const capChk = s2.capacityLevel >= cap ? 0 : 1;
    const flyChk = s2.flySpeedLevel >= cap ? 0 : 1;
    const loadChk = loadLv >= cap ? 0 : 1;
    cards.push(statCard('luggage', 'CARGO', s2.capacityLevel, s2.capacity,
      capChk ? capacityFromTierAndLevel(s2.type, s2.mineTier, s2.capacityLevel + 1, s2.capacity) : 'MAX',
      capChk ? upgradeTotalCost(UPGRADE_CAP_COST, s2, 'capacity', capChk) : 0, capChk, 'capacity'));
    cards.push(statCard('speed', 'FLY SPD', s2.flySpeedLevel, formatFlySpeed(s2.flySpeed),
      flyChk ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1)) : 'MAX',
      flyChk ? upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', flyChk) : 0, flyChk, 'flySpeed'));
    cards.push(statCard('download', 'LOAD SPD', loadLv, formatLoadSpeed(s2.loadSpeed || 0),
      loadChk ? formatLoadSpeed(loadSpeedFromLevel(s2.type, loadLv + 1)) : 'MAX',
      loadChk ? upgradeTotalCost(UPGRADE_LOAD_COST, s2, 'loadSpeed', loadChk) : 0, loadChk, 'loadSpeed'));
  } else if (role === 'combat') {
    const hpLv = s2.hpLevel || 0;
    const atkLv = s2.attackLevel || 0;
    const rateLv = s2.atkRateLevel || 0;
    const flyChk = s2.flySpeedLevel >= cap ? 0 : 1;
    const hpChk = hpLv >= cap ? 0 : 1;
    const atkChk = atkLv >= cap ? 0 : 1;
    const rateChk = rateLv >= cap ? 0 : 1;
    cards.push(statCard('favorite', 'HULL HP', hpLv, (s2.hp || 0).toLocaleString(),
      hpChk ? String(hpFromLevel(s2.type, hpLv + 1).toLocaleString()) : 'MAX',
      hpChk ? upgradeTotalCost(UPGRADE_HP_COST, s2, 'hp', hpChk) : 0, hpChk, 'hp'));
    cards.push(statCard('swords', 'ATTACK', atkLv, String(s2.attack || 0),
      atkChk ? String(attackFromLevel(s2.type, atkLv + 1)) : 'MAX',
      atkChk ? upgradeTotalCost(UPGRADE_ATTACK_COST, s2, 'attack', atkChk) : 0, atkChk, 'attack'));
    cards.push(statCard('bolt', 'ATK RATE', rateLv, formatAtkRatePercent(s2.attackSpeed || 0),
      rateChk ? formatAtkRatePercent(atkRateFromLevel(s2.type, rateLv + 1)) : 'MAX',
      rateChk ? upgradeTotalCost(UPGRADE_ATK_RATE_COST, s2, 'atkRate', rateChk) : 0, rateChk, 'atkRate'));
    cards.push(statCard('speed', 'FLY SPD', s2.flySpeedLevel, formatFlySpeed(s2.flySpeed),
      flyChk ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1)) : 'MAX',
      flyChk ? upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', flyChk) : 0, flyChk, 'flySpeed'));
  } else {
    const flyChk = s2.flySpeedLevel >= cap ? 0 : 1;
    cards.push(statCard('speed', 'FLY SPD', s2.flySpeedLevel, formatFlySpeed(s2.flySpeed),
      flyChk ? formatFlySpeed(flySpeedFromLevel(s2.type, s2.flySpeedLevel + 1)) : 'MAX',
      flyChk ? upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', flyChk) : 0, flyChk, 'flySpeed'));
  }

  function allCost(levels) {
    const n = levels === 'max';
    let total = 0;
    if (role === 'mining') {
      const c = n ? cap - s2.capacityLevel : Math.min(levels, cap - s2.capacityLevel);
      const f = n ? cap - s2.flySpeedLevel : Math.min(levels, cap - s2.flySpeedLevel);
      const m = n ? cap - s2.mineSpeedLevel : Math.min(levels, cap - s2.mineSpeedLevel);
      const bonusCap = mineBonusUpgradeCap(s2.mineTier);
      const bonusCapAll = mineBonusUpgradeCap(s2.mineTier);
      const b = n ? bonusCapAll - (s2.mineBonusLevel || 0) : Math.min(levels, bonusCapAll - (s2.mineBonusLevel || 0));
      if (c > 0) total += upgradeTotalCost(UPGRADE_CAP_COST, s2, 'capacity', c);
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', f);
      if (m > 0) total += upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', m);
      if (b > 0) total += upgradeTotalCost(UPGRADE_MINE_BONUS_COST, s2, 'mineBonus', b);
    } else if (role === 'transport') {
      const c = n ? cap - s2.capacityLevel : Math.min(levels, cap - s2.capacityLevel);
      const f = n ? cap - s2.flySpeedLevel : Math.min(levels, cap - s2.flySpeedLevel);
      const l = n ? cap - (s2.loadSpeedLevel || 0) : Math.min(levels, cap - (s2.loadSpeedLevel || 0));
      if (c > 0) total += upgradeTotalCost(UPGRADE_CAP_COST, s2, 'capacity', c);
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', f);
      if (l > 0) total += upgradeTotalCost(UPGRADE_LOAD_COST, s2, 'loadSpeed', l);
    } else if (role === 'combat') {
      const f = n ? cap - s2.flySpeedLevel : Math.min(levels, cap - s2.flySpeedLevel);
      const h = n ? cap - (s2.hpLevel || 0) : Math.min(levels, cap - (s2.hpLevel || 0));
      const a = n ? cap - (s2.attackLevel || 0) : Math.min(levels, cap - (s2.attackLevel || 0));
      const r = n ? cap - (s2.atkRateLevel || 0) : Math.min(levels, cap - (s2.atkRateLevel || 0));
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', f);
      if (h > 0) total += upgradeTotalCost(UPGRADE_HP_COST, s2, 'hp', h);
      if (a > 0) total += upgradeTotalCost(UPGRADE_ATTACK_COST, s2, 'attack', a);
      if (r > 0) total += upgradeTotalCost(UPGRADE_ATK_RATE_COST, s2, 'atkRate', r);
    } else {
      const f = n ? cap - s2.flySpeedLevel : Math.min(levels, cap - s2.flySpeedLevel);
      if (f > 0) total += upgradeTotalCost(UPGRADE_FLY_COST, s2, 'flySpeed', f);
    }
    return total;
  }

  function allBtn(levels, label) {
    const cost = allCost(levels);
    const disabled = cost <= 0 || state.coins < cost;
    return `<button type="button" onclick="upgradeShipAll(${s2.id},'${levels}')" ${disabled ? 'disabled' : ''}>${label}<strong>${cost > 0 ? '$' + fmt(cost) : '—'}</strong></button>`;
  }

  const bulk = role === 'garrison' && cards.length <= 1
    ? ''
    : `<div class="sm-bulk">${allBtn(5, '+5 ALL')}${allBtn(10, '+10 ALL')}${allBtn('max', 'MAX ALL')}</div>`;

  return `<div style="display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;">
    ${tierBlock}
    <div class="sm-stat-upg-row">${cards.join('')}</div>
    ${bulk}
  </div>`;
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
        ${resourceIconHtml(type, 14)}
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
