// ============================================================
// FLEET UI — ship list, filters, action panel, trade tab
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import {
  SHIP_DEFS, TIER_COLORS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
  UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST,
  upgradeChunk, upgradeTotalCost, toRoman,
} from '../data/ships.js';
import { BASE_POS } from '../render/camera.js';
import { TILE_H } from '../constants.js';
import { fmt, addLog } from '../helpers.js';
import { refresh } from './refresh.js';
import { getSellPrice } from '../systems/market.js';
import { removeReassignTooltip, showReassignTooltip, checkTradeTutorial } from './tutorial.js';
import { cancelTurretPlacement } from './turretUI.js';

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
  clr.textContent = '✕ Clear Filters';
  clr.onclick = () => {
    Object.assign(state.fleetFilter, { type:null, node:null, idleOnly:false, sort:null, sortDir:1 });
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
    const typeLabel = CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';
    const targetNode = ship.targetNode ? state.nodes.find(n => n.id === ship.targetNode) : null;
    const resDef = targetNode ? RESOURCE_DEFS[targetNode.type] : null;

    // ROW 1: tier pill, name, type pill
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:5px;';

    const tierPill = document.createElement('span');
    tierPill.style.cssText = `font-family:'Orbitron',monospace;font-size:12px;font-weight:700;color:${tierRarityColor};background:rgba(0,0,0,0.35);border:1px solid ${tierRarityColor}55;border-radius:3px;padding:1px 5px;flex-shrink:0;`;
    tierPill.textContent = toRoman(safeTierNum);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'ship-name';
    nameSpan.style.cssText = `color:${tierRarityColor};font-size:15px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;
    nameSpan.textContent = ship.name;

    const typePill = document.createElement('span');
    typePill.style.cssText = 'font-size:12px;color:#5a8ab0;background:rgba(0,0,0,0.3);border:1px solid #5a8ab044;border-radius:3px;padding:1px 6px;flex-shrink:0;letter-spacing:0.5px;text-transform:uppercase;';
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
      resLabel.style.cssText = `font-size:13px;color:${resDef.color};`;
      resLabel.textContent = resDef.label;
      const dash = document.createElement('span');
      dash.style.cssText = 'font-size:13px;color:#3a5a7a;margin:0 2px;';
      dash.textContent = '—';
      const cargoText = document.createElement('span');
      cargoText.id = `cargo-text-${ship.id}`;
      cargoText.style.cssText = 'font-size:13px;color:#8ab;margin-left:auto;';
      cargoText.textContent = `${ship.cargo} / ${ship.capacity}`;
      row2.appendChild(dot);
      row2.appendChild(resLabel);
      row2.appendChild(dash);
      row2.appendChild(cargoText);
    } else {
      const cargoText = document.createElement('span');
      cargoText.id = `cargo-text-${ship.id}`;
      cargoText.style.cssText = 'font-size:13px;color:#8ab;margin-left:auto;';
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
        state.selectedShip = null; state.pendingAssign = null;
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
  }
}

function buildShipDrawerContent({ ship, statusMsg, statusColor, nodeLabel, typeLabel, tierColor, tierDef, isIdle, sellVal }) {
  const statsHtml = `
    <div class="ship-data-section">
      <div class="ship-data-row">
        <span class="ship-data-label">Status</span>
        <span class="ship-data-value" id="action-panel-status" style="color:${statusColor}">${statusMsg}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Assigned Node</span>
        <span class="ship-data-value">${nodeLabel}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Cargo</span>
        <span class="ship-data-value" id="action-panel-cargo">${ship.cargo} / ${ship.capacity}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Ship Type</span>
        <span class="ship-data-value" style="color:#5a8ab0">${typeLabel}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Mining Tier</span>
        <span class="ship-data-value" style="color:${tierColor}">${tierDef.label}</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Flying Speed</span>
        <span class="ship-data-value">${ship.flySpeed.toFixed(2)}x</span>
      </div>
      <div class="ship-data-row">
        <span class="ship-data-label">Mining Speed</span>
        <span class="ship-data-value">${ship.mineSpeed.toFixed(2)}x</span>
      </div>
    </div>`;

  const actionsHtml = isIdle
    ? `<div class="cmd-status-text" style="color:#ffe066;font-size:12px;margin:8px 0 6px;">⬡ Click a node on the map to assign.</div>
       <div style="font-size:11px;color:#456;margin-bottom:8px;">Dimmed nodes need a higher tier.<br>Press <span style="color:#8ab">Esc</span> to deselect.</div>`
    : `<div class="ship-action-row" style="margin-top:8px;">
         <button class="btn danger" style="flex:1;font-size:12px" onclick="recallShip(${ship.id})">⟵ RECALL</button>
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
  const capChk  = capAtM  ? 0 : Math.min(upgradeChunk(s2.capacityLevel),  cap2 - s2.capacityLevel);
  const flyChk  = flyAtM  ? 0 : Math.min(upgradeChunk(s2.flySpeedLevel),  cap2 - s2.flySpeedLevel);
  const mineChk = mineAtM ? 0 : Math.min(upgradeChunk(s2.mineSpeedLevel), cap2 - s2.mineSpeedLevel);
  const capCost2  = capChk  > 0 ? upgradeTotalCost(UPGRADE_CAP_COST,  s2, 'capacity',  capChk)  : 0;
  const flyCost2  = flyChk  > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,  s2, 'flySpeed',  flyChk)  : 0;
  const mineCost2 = mineChk > 0 ? upgradeTotalCost(UPGRADE_MINE_COST, s2, 'mineSpeed', mineChk) : 0;

  const tierBlock = nt
    ? '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #2a5090;border-radius:5px;padding:8px;margin-bottom:6px;">'
      + '<div style="font-size:9px;letter-spacing:2px;color:#4a7aaa;margin-bottom:4px;font-family:Orbitron,sans-serif;">SHIP TIER</div>'
      + '<div style="margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:8px;">'
      + '<span style="font-size:14px;font-weight:bold;color:'+tc+'">'+td.label+'</span>'
      + '<span style="color:#7aa7d8;font-size:13px;line-height:1;">➜</span>'
      + '<span style="font-size:14px;font-weight:bold;color:'+TIER_COLORS[nt]+'">'+MINE_TIERS[nt].label+'</span></div>'
      + (blockedByBase ? '<div style="font-size:13px;color:#fa8;margin-bottom:6px;">MAX BASE LV' + state.base.level + '</div>' : '')
      + (blockedByBase ? '' : '<button class="btn '+(canAffordTier ? 'primary' : 'danger')+'" style="width:100%;font-size:13px;" onclick="upgradeShip('+s2.id+',\'mineTier\',1)" '+(canAffordTier ? '' : 'disabled')+'>⬆ UPGRADE T'+nt+' - $'+fmt(tCost)+'</button>')
      + '</div>'
    : '<div style="text-align:center;background:rgba(10,25,60,0.6);border:1px solid #2a5090;border-radius:5px;padding:6px;margin-bottom:6px;font-size:11px;color:#ffe066;">★ MAX TIER</div>';

  const row = (label, lv, val, cost, chunk, stat) =>
    '<div class="upgrade-row">'
    + '<span class="upgrade-label">'+label+'</span>'
    + '<span class="upgrade-val">Lv'+lv+' · '+val+'</span>'
    + '<span class="upgrade-cost">'+(chunk > 0 ? fmt(cost)+'¢' : '—')+'</span>'
    + '<button class="upgrade-btn" onclick="upgradeShip('+s2.id+',\''+stat+'\','+chunk+')" '+(chunk <= 0 || state.coins < cost ? 'disabled' : '')+'>'+(chunk <= 0 ? 'MAX' : chunk > 1 ? '×'+chunk : '↑')+'</button>'
    + '</div>';

  return tierBlock
    + row('Cargo Cap',  s2.capacityLevel,  s2.capacity,                capCost2,  capChk,  'capacity')
    + row('Fly Speed',  s2.flySpeedLevel,  s2.flySpeed.toFixed(2)+'x', flyCost2,  flyChk,  'flySpeed')
    + row('Mine Speed', s2.mineSpeedLevel, s2.mineSpeed.toFixed(2)+'x', mineCost2, mineChk, 'mineSpeed');
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
        ? `<span style="color:#ffe066;font-size:12px;flex-shrink:0">${price}¢✦</span>`
        : `<span style="color:#5a8;font-size:12px;flex-shrink:0">${price}¢</span>`;
      html += `<div class="sell-row">
        <span style="width:9px;height:9px;border-radius:50%;background:${def.color};display:inline-block;flex-shrink:0"></span>
        ${priceHtml}
        <span class="res-name-s">${def.label}</span>
        <span class="res-qty">${fmt(amt)}</span>
        <button class="sell-btn-s" onclick="sellResource('${type}',${sellAmt})">SELL ${fmt(sellAmt)}</button>
        <button class="sell-btn-s" onclick="sellResource('${type}',${amt})">ALL</button>
      </div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  }
}
