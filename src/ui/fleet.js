// ============================================================
// FLEET UI — ship list, filters, action panel, trade tab
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import {
  SHIP_DEFS, TIER_COLORS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
  UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST,
  upgradeTotalCost, toRoman, formatFlySpeed, formatMineSpeedPercent, capacityFromTierAndLevel,
} from '../data/ships.js';
import { BASE_POS, cam, ZOOM_MAX_V } from '../render/camera.js';
import { TILE_H } from '../constants.js';
import { fmt, addLog } from '../helpers.js';
import { refresh } from './refresh.js';
import { getSellPrice } from '../systems/market.js';
import { removeReassignTooltip, showReassignTooltip, checkTradeTutorial, renderTutPointers } from './tutorial.js';
import { cancelTurretPlacement } from './turretUI.js';

let _fleetFiltersVisible = false;

window.toggleFleetFilters = function() {
  _fleetFiltersVisible = !_fleetFiltersVisible;
  const el = document.getElementById('fleet-filters');
  const btn = document.getElementById('fleet-filter-toggle');
  if (el) el.style.display = _fleetFiltersVisible ? '' : 'none';
  if (btn) btn.style.color = _fleetFiltersVisible ? '#9bd6ff' : '#4a8ab0';
};

let _sellOverlayShipId = null;
let _sellOverlayValue = 0;

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
  const roleLabels = { mining: 'Mining', transport: 'Transport', combat: 'Combat', garrison: 'Garrison', unique: 'Unique' };
  const roleSelect = makeSelect(
    [{ value: '', label: 'All Roles' }, ...roles.map(r => ({ value: r, label: roleLabels[r] || r }))],
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
      { value: 'none', label: 'No Sort' },
      { value: 'fly', label: 'Flying Speed' },
      { value: 'mine', label: 'Mining Speed' },
      { value: 'capacity', label: 'Cargo Size' },
      { value: 'level', label: 'Level' },
      { value: 'node', label: 'Node Type' },
    ],
    ff.sort || 'none',
    (v) => {
      if (v === 'none') {
        ff.sort = null;
        ff.sortDir = 1;
      } else {
        ff.sort = v;
      }
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
  idleToggle.onclick = () => {
    ff.idleOnly = !ff.idleOnly;
    renderShipsList();
  };

  const clr = document.createElement('button');
  clr.className = 'fleet-filter fleet-filter-clear';
  clr.textContent = 'Clear';
  clr.onclick = () => {
    Object.assign(state.fleetFilter, { type:null, role:null, node:null, idleOnly:false, sort:null, sortDir:1 });
    renderShipsList();
  };
  clearRow.appendChild(idleToggle);
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
      const la = a.capacityLevel + a.flySpeedLevel + a.mineSpeedLevel;
      const lb = b.capacityLevel + b.flySpeedLevel + b.mineSpeedLevel;
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
    const pct = ship.cargo / ship.capacity * 100;
    const statusLabels = { idle:'IDLE', flying:'EN ROUTE', mining:'MINING', returning:'RETURNING', pausing:'RETURNING' };

    const safeTierNum = Math.min(10, Math.max(1, ship.mineTier || 1));
    const tierRarityColor = TIER_COLORS[safeTierNum] || '#e8eaf0';
    const overallLevel = (ship.capacityLevel || 0) + (ship.flySpeedLevel || 0) + (ship.mineSpeedLevel || 0);
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
    statusBadge.textContent = statusLabels[ship.status];
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
      const cargoText = document.createElement('span');
      cargoText.id = `cargo-text-${ship.id}`;
      cargoText.style.cssText = 'font-size:14px;color:#8ab;margin-left:auto;';
      cargoText.textContent = `${ship.cargo} / ${ship.capacity}`;
      row2.appendChild(cargoText);
    }

    // ROW 3: cargo bar
    const bar = document.createElement('div'); bar.className = 'ship-cargo-bar';
    const fill = document.createElement('div'); fill.className = 'ship-cargo-fill';
    fill.id = `cargo-fill-${ship.id}`;
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    card.appendChild(row1); card.appendChild(row2); card.appendChild(bar);

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
        state.selectedShip = ship.id;
        if (state.tutStep === 0) state.tutStep = 1;
        state.pendingAssign = ship.id; canvas.style.cursor = 'crosshair';
        showReassignTooltip(ship);
      }
      if (refresh.ui) refresh.ui();
    });

    list.appendChild(card);
  }
}

export function renderActionPanel() {
  const actionPanel = document.getElementById('action-panel');
  const titleEl = document.getElementById('action-panel-title');
  const panel   = document.getElementById('action-content');
  const upgradeDrawer = document.getElementById('ship-upgrade-drawer');
  const upgradeTitle = document.getElementById('ship-upgrade-title');
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
  const statusMsg   = ship.status === 'flying'    ? '▶ En Route'
                    : ship.status === 'mining'    ? '⛏ Mining'
                    : ship.status === 'returning' ? '↩ Returning'
                    : ship.status === 'pausing'   ? '↩ Returning'
                    : '● Idle';
  const statusColor = ship.status === 'mining'    ? '#c6f'
                    : ship.status === 'flying'    ? '#48f'
                    : ship.status === 'returning' || ship.status === 'pausing' ? '#fa6'
                    : '#4d8';

  const stats = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;

  let upgradeCost = 0;
  for (let i = 0; i < ship.capacityLevel;  i++) upgradeCost += Math.floor(40  * Math.pow(1.10, i));
  for (let i = 0; i < ship.flySpeedLevel;  i++) upgradeCost += Math.floor(60  * Math.pow(1.10, i));
  for (let i = 0; i < ship.mineSpeedLevel; i++) upgradeCost += Math.floor(60  * Math.pow(1.10, i));
  for (let t = stats.mineTier + 1; t <= ship.mineTier; t++) upgradeCost += SHIP_TIER_COSTS[t] || 0;
  const sellVal = Math.max(10, upgradeCost);

  const isIdle    = ship.status === 'idle';
  const typeLabel = CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';

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
  const statsHtml = `
    <div class="ship-data-section">
      <div class="ship-data-row">
        <span class="ship-data-label">Status</span>
        <span class="ship-data-value" id="action-panel-status" style="color:${statusColor}">${statusMsg}</span>
      </div>
      ${(ship.mineSpeed || 0) > 0 ? `<div class="ship-data-row">
        <span class="ship-data-label">Assigned Node</span>
        <span class="ship-data-value" style="${nodeLabel !== '—' ? '' : 'color:#f55;'}">${nodeLabel !== '—' ? nodeLabel : 'UNASSIGNED'}</span>
      </div>` : ''}
      <div class="ship-data-row">
        <span class="ship-data-label">Ship Type</span>
        <span class="ship-data-value" style="color:#5a8ab0">${typeLabel}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Mining Tier</span>
        <span class="ship-data-value" style="color:${tierColor}">${tierDef.label}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Range from Base</span>
        <span class="ship-data-value" id="action-panel-dist" style="color:#8ab;">${(function(){ const bp=BASE_POS(); const d=Math.round(Math.hypot(ship.x-bp.x,ship.y-bp.y)/36); return d===0?'<span style="color:#6fff9a">At Base</span>':`${d} tiles`; })()}</span>
      </div>
    </div>
    <div style="border-top:1px solid #1a3a6e;margin:8px 0;padding-top:8px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ STATS</div>
      <div class="ship-data-section">
        <div class="ship-data-row">
          <span class="ship-data-label">Cargo</span>
          <span class="ship-data-value" id="action-panel-cargo">${ship.cargo} / ${ship.capacity}</span>
        </div>
        <div class="ship-data-row">
          <span class="ship-data-label">Flying Speed</span>
          <span class="ship-data-value">${formatFlySpeed(ship.flySpeed)}</span>
        </div>
        ${(ship.mineSpeed || 0) > 0 ? `<div class="ship-data-row">
          <span class="ship-data-label">Mining Speed</span>
          <span class="ship-data-value">${formatMineSpeedPercent(ship.mineSpeed)}</span>
        </div>` : ''}
      </div>
    </div>`;

  const canMine = (ship.mineSpeed || 0) > 0;
  const actionsHtml = !canMine
    ? `<div style="font-size:12px;color:#4a6a8a;margin:8px 0;padding:8px;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;">⊘ No mining equipment — cannot be assigned to a node.</div>`
    : isIdle
    ? `<div class="cmd-status-text" style="color:#ffe066;font-size:12px;margin:8px 0 6px;">⬡ Click a node on the map to assign.</div>
       <div style="font-size:11px;color:#456;margin-bottom:8px;">Dimmed nodes need a higher tier.<br>Press <span style="color:#8ab">Esc</span> to deselect.</div>`
    : `<div class="ship-action-row" style="margin-top:8px;">
         <button class="btn danger" style="flex:1;font-size:12px" onclick="recallShip(${ship.id})">⟵ RECALL</button>
         <button class="btn" style="flex:1;font-size:12px;${state.followShip === ship.id ? 'background:rgba(0,180,255,0.18);border-color:#00b4ff;color:#00e5ff;' : 'background:rgba(10,30,70,0.5);border-color:#2a4a7a;color:#6af;'}" onclick="toggleFollowShip(${ship.id})">${state.followShip === ship.id ? '◉ UNFOLLOW' : '◎ FOLLOW'}</button>
       </div>`;

  const bottomActions = `<div class="ship-action-row">
      <button class="btn" style="flex:1;font-size:12px;background:rgba(20,30,60,0.6);border-color:#2a4a7a;color:#8ab" onclick="openRenameOverlay(${ship.id})">✎ RENAME</button>
      <button class="btn" style="flex:1;font-size:12px;background:rgba(40,20,10,0.6);border-color:#604020;color:#c87" ${state.ships.length <= 1 ? 'disabled title="Cannot sell your last ship"' : ''} onclick="openSellOverlay(${ship.id},${sellVal})">⊘ SELL <span style="color:#6fff9a;">$${fmt(sellVal)}</span></button>
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

window.openSellOverlay = function(shipId, sellVal) {
  if (state.ships.length <= 1) return;
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  _sellOverlayShipId = shipId;
  _sellOverlayValue = sellVal;
  const nameEl = document.getElementById('sell-ship-name');
  const valueEl = document.getElementById('sell-ship-value');
  if (nameEl) nameEl.textContent = ship.name;
  if (valueEl) valueEl.textContent = `$${fmt(sellVal)}`;
  const overlay = document.getElementById('sell-overlay');
  if (overlay) overlay.classList.add('show');
};

window.closeSellOverlay = function() {
  _sellOverlayShipId = null;
  _sellOverlayValue = 0;
  const overlay = document.getElementById('sell-overlay');
  if (overlay) overlay.classList.remove('show');
};

window.confirmSellOverlay = function() {
  if (_sellOverlayShipId !== null) {
    window.sellShip(_sellOverlayShipId, _sellOverlayValue);
  }
  window.closeSellOverlay();
};

function buildUpgradesSection(shipId) {
  const s2 = state.ships.find(s => s.id === shipId); if (!s2) return '';
  const st = Math.min(10, Math.max(1, s2.mineTier || 1));
  const tc = TIER_COLORS[st];
  const td = MINE_TIERS[st];
  const nt = st < 10 ? st + 1 : null;
  const tCost = nt ? SHIP_TIER_COSTS[nt] : null;
  const blockedByBase = nt && nt > state.base.level;
  const canAffordTier = nt && state.coins >= tCost;
  const cap2 = TIER_UPGRADE_CAP[st];
  const capAtM  = s2.capacityLevel  >= cap2;
  const flyAtM  = s2.flySpeedLevel  >= cap2;
  const mineAtM = s2.mineSpeedLevel >= cap2;
  const capChk  = capAtM  ? 0 : 1;
  const flyChk  = flyAtM  ? 0 : 1;
  const mineChk = mineAtM ? 0 : 1;
  const capCost2  = capChk  > 0 ? upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  capChk)  : 0;
  const flyCost2  = flyChk  > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  flyChk)  : 0;
  const mineCost2 = mineChk > 0 ? upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', mineChk) : 0;

  const nextCapacity = capChk > 0
    ? capacityFromTierAndLevel(s2.type, s2.mineTier, s2.capacityLevel + 1, s2.capacity)
    : 'MAX';
  const nextFlySpeed = flyChk > 0 ? formatFlySpeed(s2.flySpeed + 20) : 'MAX';
  const nextMineSpeed = mineChk > 0 ? formatMineSpeedPercent(s2.mineSpeed + 0.4) : 'MAX';

  const tierBlock = nt
    ? '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #2a5090;border-radius:5px;padding:8px;margin-bottom:6px;">'
      + '<div style="font-size:9px;letter-spacing:2px;color:#4a7aaa;margin-bottom:4px;font-family:Orbitron,sans-serif;">SHIP TIER</div>'
      + '<div style="margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:8px;">'
      + '<span style="font-size:14px;font-weight:bold;color:'+tc+'">'+td.label+'</span>'
      + '<span style="color:#7aa7d8;font-size:13px;line-height:1;">➜</span>'
      + '<span style="font-size:14px;font-weight:bold;color:'+TIER_COLORS[nt]+'">'+MINE_TIERS[nt].label+'</span></div>'
      + (blockedByBase ? '<div style="font-size:13px;color:#fa8;margin-bottom:6px;">MAX BASE LV' + state.base.level + '</div>' : '')
      + (blockedByBase ? '' : '<button class="btn '+(canAffordTier ? 'primary' : 'danger')+'" style="width:100%;font-size:13px;" onclick="upgradeShip('+s2.id+',\'mineTier\',1)" '+(canAffordTier ? '' : 'disabled')+'>⬆ UPGRADE T'+nt+' — <span style="color:#ffe066;">$'+fmt(tCost)+'</span></button>')
      + '</div>'
    : '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #2a5090;border-radius:5px;padding:6px;margin-bottom:6px;font-size:11px;color:#ffe066;">★ MAX TIER</div>';

  const row = (label, lv, currentVal, nextVal, cost, chunk, stat) =>
    '<div class="upgrade-row">'
    + '<span class="upgrade-label">Lv'+lv+' '+label+'</span>'
    + '<span class="upgrade-val">'+currentVal+' <span style="color:#4a6a8a;">➜</span> <span style="color:#6fff9a;">'+nextVal+'</span></span>'
    + '<span class="upgrade-cost">'+(chunk > 0 ? '$'+fmt(cost) : '—')+'</span>'
    + '<button class="upgrade-btn" onclick="upgradeShip('+s2.id+',\''+stat+'\','+chunk+')" '+(chunk <= 0 || state.coins < cost ? 'disabled' : '')+'>'+(chunk <= 0 ? 'MAX' : chunk > 1 ? '×'+chunk : '↑')+'</button>'
    + '</div>';

  const canMine2 = (s2.mineSpeed || 0) > 0;

  function allCost(levels) {
    const c = levels === 'max' ? cap2 - s2.capacityLevel  : Math.min(levels, cap2 - s2.capacityLevel);
    const f = levels === 'max' ? cap2 - s2.flySpeedLevel  : Math.min(levels, cap2 - s2.flySpeedLevel);
    const m = canMine2 ? (levels === 'max' ? cap2 - s2.mineSpeedLevel : Math.min(levels, cap2 - s2.mineSpeedLevel)) : 0;
    const cc = c > 0 ? upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  c) : 0;
    const fc = f > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  f) : 0;
    const mc = m > 0 ? upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', m) : 0;
    return cc + fc + mc;
  }

  function allBtn(levels, label) {
    const cost = allCost(levels);
    const disabled = cost <= 0 || state.coins < cost;
    return '<button class="btn" style="flex:1;font-size:11px;padding:3px 0;background:rgba(10,20,50,0.6);border-color:#2a4a7a;color:' + (disabled ? '#345' : '#9bd6ff') + ';" onclick="upgradeShipAll(' + s2.id + ',\'' + levels + '\')" ' + (disabled ? 'disabled' : '') + '>'
      + label + (cost > 0 ? '<br><span style="font-size:10px;color:#ffe066;">$' + fmt(cost) + '</span>' : '')
      + '</button>';
  }

  const allRow = '<div style="display:flex;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid #1a3560;">'
    + allBtn(5,   '+5 ALL')
    + allBtn(10,  '+10 ALL')
    + allBtn('max', 'MAX ALL')
    + '</div>';

  return tierBlock
    + row('Cargo Cap',  s2.capacityLevel,  s2.capacity,                nextCapacity,  capCost2,  capChk,  'capacity')
    + row('Fly Speed',  s2.flySpeedLevel,  formatFlySpeed(s2.flySpeed), nextFlySpeed,  flyCost2,  flyChk,  'flySpeed')
    + (canMine2 ? row('Mine Speed', s2.mineSpeedLevel, formatMineSpeedPercent(s2.mineSpeed), nextMineSpeed, mineCost2, mineChk, 'mineSpeed') : '')
    + allRow;
}

export function renderTab() {
  const content = document.getElementById('tab-content');
  if (state.activeTab === 'trade') {
    const hasAny = Object.values(state.resources).some(v => v > 0);
    if (!hasAny) {
      content.innerHTML = `<div style="margin-top:10px;padding:14px;background:rgba(10,25,60,0.5);border:1px solid #1a3a6e;border-radius:4px;text-align:center;color:#3a5a7a;font-size:13px;line-height:1.7">⏳ Waiting for resources...<br><span style="font-size:11px;color:#2a4060">Assign a ship to start mining.</span></div>`;
      return;
    }
    let html = '';
    if (state.marketBoost) {
      const bd = RESOURCE_DEFS[state.marketBoost.type];
      const boostMult = state.marketBoost.multiplier ?? 1.5;
      html += `<div style="font-size:14px;background:rgba(20,60,10,0.6);border:1px solid #4a8020;border-radius:4px;padding:8px 10px;margin-bottom:8px;text-align:center;line-height:1.25">
        <span style="font-weight:bold;color:${bd.color}">${bd.label}</span> <span style="color:#cde">in demand!</span>
        <span style="color:#ffe066;font-weight:bold"> · ${boostMult}× this SOL</span>
      </div>`;
    }
    html += '<div class="sell-grid">';
    for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
      const amt = state.resources[type] || 0;
      if (amt <= 0) continue;
      const sellAmt = amt < 100 ? 1 : amt < 1000 ? 10 : amt < 10000 ? 25 : 100;
      const price   = getSellPrice(type);
      const boosted = state.marketBoost?.type === type;
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
