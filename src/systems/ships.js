// ============================================================
// SHIP SYSTEMS — tick, assign, recall, spawn, craft, upgrade
// ============================================================
import { TILE_H, BASE_COL, BASE_ROW, GRID_COLS, GRID_ROWS } from '../constants.js';
import { state, bumpShipIdCounter } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { SHIP_DEFS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
          UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST,
          UPGRADE_LOAD_COST, UPGRADE_HP_COST, UPGRADE_ATTACK_COST, UPGRADE_ATK_RATE_COST,
          upgradeTotalCost, upgradeChunk,
          SHIP_CRAFT_TIME_MS, DEFAULT_CRAFT_TIME_MS,
          flySpeedToMultiplier, formatFlySpeed, FLY_SPEED_UPGRADE_STEP, MINE_SPEED_UPGRADE_STEP,
          capacityFromTierAndLevel, flySpeedFromLevel, mineSpeedFromLevel,
          loadSpeedFromLevel, hpFromLevel, attackFromLevel, atkRateFromLevel,
          formatMineSpeedPercent } from '../data/ships.js';
import { BASE_MAX_SHIPS, SHIP_TIER_REQS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { addLog, fmt, addCoins, spendCoins, RESOURCE_CAP } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { BASE_POS, gridToWorld, nodeWorldPos } from '../render/camera.js';
import { spawnFloatie } from '../render/animations.js';
import { showOnce, showTransmissionMessage, dismissTransmission } from '../ui/transmissions.js';
import { removeReassignTooltip, checkTradeTutorial } from '../ui/tutorial.js';
import { patchSolPanel } from '../ui/panels.js';
import { updateHeaderShips } from '../ui/ui.js';
import { isStorageOperational } from '../data/storage.js';
import { isStorageModule, isPowerStationModule, getModuleFreeCapacity } from '../data/modules.js';

function getStorageModules() {
  return state.modules.filter(isStorageModule);
}

function getPowerStations() {
  return state.modules.filter(isPowerStationModule);
}

const craftTimeouts = {};
let baseDownNoticeShown = false;

function resolveShipDepot(ship) {
  if (ship.depotType === 'storage' && ship.depotId !== null) {
    const storage = getStorageModules().find(s => s.id === ship.depotId);
    if (storage) return { type: 'storage', facility: storage, label: storage.name, operational: isStorageOperational(storage) };
  }
  if (ship.depotType === 'power_station' && ship.depotId !== null) {
    const station = getPowerStations().find(s => s.id === ship.depotId);
    if (station) return { type: 'power_station', facility: station, label: station.name, operational: (station.health || 0) > 0 };
  }
  return { type: 'base', facility: null, label: state.base.name || 'Base Station', operational: (state.base.health || 0) > 0 };
}

function getShipDepotDestination(ship) {
  const depot = resolveShipDepot(ship);
  if (depot.type === 'storage' && depot.facility) {
    const pos = gridToWorld(depot.facility.col, depot.facility.row);
    return { x: pos.x, y: pos.y + TILE_H / 2 - 20, depotType: 'storage', depotId: depot.facility.id };
  }
  if (depot.type === 'power_station' && depot.facility) {
    const pos = gridToWorld(depot.facility.col, depot.facility.row);
    return { x: pos.x, y: pos.y + TILE_H / 2 - 20, depotType: 'power_station', depotId: depot.facility.id };
  }
  const bp = BASE_POS();
  return { x: bp.x, y: bp.y + TILE_H / 2 - 20, depotType: 'base', depotId: null };
}

function getHoldingAnchor(ship) {
  const depot = resolveShipDepot(ship);
  if (depot.type === 'storage' && depot.facility) return { col: depot.facility.col, row: depot.facility.row, size: 1 };
  if (depot.type === 'power_station' && depot.facility) return { col: depot.facility.col, row: depot.facility.row, size: 0 };
  return { col: BASE_COL, row: BASE_ROW, size: 0 };
}

function isHoldingTileBlocked(col, row) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return true;
  if (col === BASE_COL && row === BASE_ROW) return true;
  if (state.nodes.some(n => n.gr[0] === col && n.gr[1] === row && n.minLevel <= state.base.level)) return true;
  if (state.turrets.some(t => t.col === col && t.row === row)) return true;
  if (getStorageModules().some(s => Math.abs((s.col ?? 0) - col) <= 1 && Math.abs((s.row ?? 0) - row) <= 1)) return true;
  return false;
}

function setNextHoldingDestination(ship) {
  const anchor = getHoldingAnchor(ship);
  const candidates = [];
  for (let dc = -4; dc <= 4; dc++) {
    for (let dr = -4; dr <= 4; dr++) {
      const col = anchor.col + dc;
      const row = anchor.row + dr;
      if (Math.abs(dc) <= anchor.size && Math.abs(dr) <= anchor.size) continue;
      if (isHoldingTileBlocked(col, row)) continue;
      candidates.push({ col, row });
    }
  }
  if (!candidates.length) {
    const depotDest = getShipDepotDestination(ship);
    ship.destX = depotDest.x;
    ship.destY = depotDest.y;
    ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
    return;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const pos = gridToWorld(pick.col, pick.row);
  ship.destX = pos.x;
  ship.destY = pos.y + TILE_H / 2 - 20;
  ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
}

function getShipCraftTimeMs(recipeId) {
  return SHIP_CRAFT_TIME_MS[recipeId] || DEFAULT_CRAFT_TIME_MS;
}

function completeCraftShip(recipeId) {
  const timer = state.shipCraftTimers?.[recipeId];
  if (!timer) return;
  if (Date.now() < timer.endsAt - 20) return;
  delete state.shipCraftTimers[recipeId];
  if (craftTimeouts[recipeId]) {
    clearTimeout(craftTimeouts[recipeId]);
    delete craftTimeouts[recipeId];
  }
  spawnShip(recipeId);
  if (!state.shipCraftNotices) state.shipCraftNotices = {};
  state.shipCraftNotices[recipeId] = Date.now() + 3000;
  setTimeout(() => {
    if (state.shipCraftNotices?.[recipeId] && Date.now() >= state.shipCraftNotices[recipeId]) {
      delete state.shipCraftNotices[recipeId];
      if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
      if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
    }
  }, 3050);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
}

function scheduleCraftCompletion(recipeId, endsAt) {
  if (craftTimeouts[recipeId]) clearTimeout(craftTimeouts[recipeId]);
  const wait = Math.max(0, endsAt - Date.now());
  craftTimeouts[recipeId] = setTimeout(() => {
    completeCraftShip(recipeId);
  }, wait);
}

// ── Spawn ──
export function spawnShip(type = 'scout') {
  const maxShips = BASE_MAX_SHIPS[(state.base.level-1)] || 20;
  if (state.ships.length >= maxShips) { addLog('⚠ Ship capacity full! Upgrade the Base.'); return; }
  const recipe = CRAFT_RECIPES.find(r => r.id === type);
  const stats  = SHIP_DEFS[type] || SHIP_DEFS.scout;
  const base = gridToWorld(BASE_COL, BASE_ROW);
  const id = bumpShipIdCounter();
  const isUnique = stats.unique === true;
  const ship = {
    id,
    name: recipe ? `${recipe.name} #${id}` : `Starter #${id}`,
    type,
    capacity:     isUnique ? stats.capacity : capacityFromTierAndLevel(type, stats.mineTier, 0, stats.capacity),
    flySpeed:     stats.flySpeed,
    mineSpeed:    stats.mineSpeed,
    loadSpeed:    stats.loadSpeed ?? 0,
    hp:           stats.hp       ?? 0,
    attack:       stats.attack   ?? 0,
    attackSpeed:  stats.attackSpeed ?? 0,
    mineTier:     stats.mineTier,
    // Upgrade levels — all 0 for normal ships, 100 for unique (already at max)
    capacityLevel:  isUnique ? 100 : 0,
    flySpeedLevel:  isUnique ? 100 : 0,
    mineSpeedLevel: isUnique ? 100 : 0,
    loadSpeedLevel: isUnique ? 100 : 0,
    hpLevel:        isUnique ? 100 : 0,
    attackLevel:    isUnique ? 100 : 0,
    atkRateLevel:   isUnique ? 100 : 0,
    depotType: 'base', depotId: null,
    cargo:0, cargoResource:null,
    status:'idle', targetNode:null,
    heading: Math.random() * Math.PI * 2,
    turnRadiusRandomness: (Math.random() - 0.5) * 2, // -1..1, gives each ship a unique arc width
    x:base.x, y:base.y, destX:base.x, destY:base.y, mineTimer:0,
  };
  state.ships.push(ship);
  updateHeaderShips();
  addLog(`⚡ ${ship.name} is ready for deployment.`);

  // Rigs upgrade tutorial — fires once when the player builds their first non-starter ship
  if (state.ships.length === 2 && !state.seenMsgs['rigs_upgrades']) {
    setTimeout(() => {
      showOnce('rigs_upgrades', NPCS.rigs.transmissionLines.rigs_upgrades, 20, 'rigs');
      state.upgradesTutActive = true;
      if (refresh.ui) refresh.ui();
    }, 2500);
  }
}

// ── Assign ──
export function assignShip(ship, node) {
  if ((ship.mineSpeed || 0) <= 0) { addLog(`⚠ ${ship.name} has no mining equipment.`); return; }
  if (ship.targetNode === node.id) { state.selectedShip = null; state.pendingAssign = null; state.followShip = null; document.getElementById('main-canvas').style.cursor = ''; if (refresh.ui) refresh.ui(); return; }
  if (node.minLevel > state.base.level) return;
  const alreadyAssigned = state.ships.some(s => s.id !== ship.id && s.targetNode === node.id);
  if (alreadyAssigned) {
    addLog(`⚠ ${RESOURCE_DEFS[node.type].label} node already occupied — expand range for more nodes`);
    return;
  }
  const accessible = [];
  for (let t = 1; t <= ship.mineTier; t++) accessible.push(...MINE_TIERS[t].resources);
  if (!accessible.includes(node.type)) return;
  if (ship.cargo > 0) addLog(`⚠ ${ship.name} dropped ${ship.cargo} cargo to change course`);
  console.log(`[assign] ${ship.name} → node ${node.id} (${node.type}) | was status=${ship.status} cargo=${ship.cargo} cargoResource=${ship.cargoResource}`);
  ship.cargo = 0;
  ship.cargoResource = null;
  if (state.tutStep < 2) state.tutStep = 2;
  state.redirectTutActive = false;


  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  removeReassignTooltip();
  ship.targetNode = node.id;
  ship.status = 'flying';
  const pos = nodeWorldPos(node);
  ship.destX = pos.x; ship.destY = pos.y-20;
  ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
  addLog(`🚀 ${ship.name} → ${RESOURCE_DEFS[node.type].label} node`);
  if (refresh.ui) refresh.ui();
  window.patchStockpileCards?.();
}

// ── Tick ──
export let tickEvents = [];

export function tickShip(ship, dt) {
  if (state.base.health > 0) baseDownNoticeShown = false;
  const baseDown = state.base.health <= 0;
  if (baseDown && !baseDownNoticeShown) {
    baseDownNoticeShown = true;
    showTransmissionMessage(NPCS.juno.transmissionLines.base_down_no_deposit, 12, 'juno');
  }

  if (ship.status === 'holding' && !baseDown && resolveShipDepot(ship).operational) {
    const depotDest = getShipDepotDestination(ship);
    ship.destX = depotDest.x;
    ship.destY = depotDest.y;
    ship.status = 'returning';
  }

  const FLY_SPEED = ship.status === 'holding' ? 100 : 80 * flySpeedToMultiplier(ship.flySpeed);

  if (ship.status==='flying'||ship.status==='returning'||ship.status==='holding') {
    // Trail: record world position every frame, keep last 28 points
    if (!ship.trail) ship.trail = [];
    ship.trail.push({ x: ship.x, y: ship.y });
    if (ship.trail.length > 80) ship.trail.shift();

    const dx = ship.destX-ship.x, dy = ship.destY-ship.y;
    const dist = Math.sqrt(dx*dx+dy*dy);

    if (dist < 6) {
      if (ship.status==='flying') {
        ship.x = ship.destX; ship.y = ship.destY;
        ship.status='mining'; ship.mineTimer=0;
        if (state.tutStep === 2) state.tutStep = 3;
      } else if (ship.status === 'holding') {
        setNextHoldingDestination(ship);
      } else {
        if (baseDown) {
          ship.status = 'holding';
          setNextHoldingDestination(ship);
          return;
        }
        const depot = resolveShipDepot(ship);
        if (!depot.operational) {
          ship.status = 'holding';
          setNextHoldingDestination(ship);
          return;
        }
        if (depot.type === 'storage' && depot.facility && getModuleFreeCapacity(depot.facility) <= 0) {
          ship.status = 'holding';
          setNextHoldingDestination(ship);
          return;
        }
        if (depot.type === 'power_station' && depot.facility && getModuleFreeCapacity(depot.facility) < ship.cargo) {
          ship.status = 'holding';
          setNextHoldingDestination(ship);
          return;
        }
        ship.x = ship.destX; ship.y = ship.destY;
        
        if (ship.cargo>0 && ship.cargoResource && RESOURCE_DEFS[ship.cargoResource]) {
          tickEvents.push({ type:'deposit', name:ship.name, cargoResource:ship.cargoResource, amount:ship.cargo, depotType: ship.depotType || 'base', depotId: ship.depotId ?? null });
        }

        ship.cargo=0;
        ship.cargoResource=null;

        if (ship.targetNode !== null) {
          const node = state.nodes.find(n => n.id === ship.targetNode);
          if (node) { ship.status='pausing'; ship.pauseTimer=0.4; }
          else { ship.targetNode=null; ship.status='idle'; tickEvents.push({ type:'idle', ship }); }
        } else {
          ship.status='idle';
          tickEvents.push({ type:'idle', ship });
        }
      }
    } else {

      // Smooth turn rate: wide arcs far out, tight near destination. No sudden jumps.
      // Beyond 300 units, apply the ship's personal randomness so arcs vary in width.
      const turnT = Math.max(0, Math.min(1, 1 - dist / 500));
      const turnVariance = Number.isFinite(ship.turnRadiusRandomness) ? ship.turnRadiusRandomness : 0;
      const farVariance = dist > 300 ? turnVariance * 1.2 : 0;
      const TURN_RATE = Math.max(1, 3 + (10 - 3) * turnT + farVariance);
      const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
      let da = targetAngle - ship.heading;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const absDaBeforeTurn = Math.abs(da);
      ship.heading += Math.sign(da) * Math.min(Math.abs(da), TURN_RATE * dt);

      const moveAngle = ship.heading - Math.PI / 2;
      const step = Math.min(FLY_SPEED * dt, dist);
      const directBlend = Math.max(0, 1 - dist / 60);
      const hx = Math.cos(moveAngle), hy = Math.sin(moveAngle);
      const tx = dx / dist,           ty = dy / dist;
      ship.x += (hx * (1 - directBlend) + tx * directBlend) * step;
      ship.y += (hy * (1 - directBlend) + ty * directBlend) * step;
    }
  } else {
    // Not flying — drain trail one point per frame so it fades out naturally
    if (ship.trail?.length) ship.trail.shift();
  }

  if (ship.status==='pausing') {
    ship.pauseTimer -= dt;
    if (ship.pauseTimer <= 0) {
      const node = state.nodes.find(n => n.id === ship.targetNode);
      if (node && ship.targetNode !== null) {
        ship.status='flying';
        const pos = nodeWorldPos(node);
        ship.destX=pos.x; ship.destY=pos.y-20;
        ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
      } else {
        ship.targetNode=null; ship.status='idle';
        tickEvents.push({ type:'idle', ship });
      }
    }
  } else if (ship.status==='mining') {
    ship.mineTimer += dt;
    const MINE_INTERVAL = 1.0 / ship.mineSpeed;
    const node = state.nodes.find(n => n.id === ship.targetNode);
    if (!node) { ship.targetNode=null; ship.status='idle'; tickEvents.push({ type:'idle', ship }); return; }
    if (ship.mineTimer >= MINE_INTERVAL) {
      const prevResource = ship.cargoResource;
      ship.cargo = Math.min(ship.capacity, ship.cargo+1);
      ship.cargoResource = node.type;
      if (prevResource !== ship.cargoResource) {
        console.log(`[mine] ${ship.name} cargoResource set to ${ship.cargoResource} (was ${prevResource}) | cargo=${ship.cargo}`);
      }
      ship.mineTimer = 0;
      if (ship.cargo >= ship.capacity) {
        ship.status='returning';
        const depotDest = getShipDepotDestination(ship);
        ship.destX=depotDest.x; ship.destY=depotDest.y;
        ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
      }
    }
  }
}

// ── Recall ──
window.recallShip = function(shipId) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (state.pendingAssign === shipId) { state.pendingAssign=null; document.getElementById('main-canvas').style.cursor=''; }
  if (state.selectedShip === shipId) { state.selectedShip=null; state.followShip=null; removeReassignTooltip(); }
  ship.targetNode = null;
  if (ship.status==='returning') {
    addLog(`⟵ ${ship.name} recalled`);
  } else if (ship.status==='pausing') {
    ship.status='idle'; ship.pauseTimer=0;
    addLog(`⟵ ${ship.name} recalled`);
  } else {
    const depotDest = getShipDepotDestination(ship);
    ship.destX=depotDest.x; ship.destY=depotDest.y;
    ship.status='returning';
    ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
    addLog(`⟵ ${ship.name} returning to depot`);
  }
  if (refresh.ui) refresh.ui();
};

// ── Sell Ship ──
window.confirmSellShip = function(shipId, sellVal) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (state.ships.length <= 1) { addLog('⚠ Cannot sell your last ship!'); return; }
  const panel = document.getElementById('action-content');
  panel.innerHTML = `
    <div style="font-size:13px;color:#f88;margin-bottom:8px;">Sell <strong style="color:#faa">${ship.name}</strong> for <strong style="color:#ffe066">${fmt(sellVal)} coins</strong>?</div>
    <div style="font-size:11px;color:#456;margin-bottom:10px;">This cannot be undone.</div>
    <div class="ship-action-row">
      <button class="btn danger" style="flex:1;font-size:12px" onclick="sellShip(${shipId},${sellVal})">CONFIRM SELL</button>
      <button class="btn" style="flex:1;font-size:12px" onclick="renderActionPanel()">CANCEL</button>
    </div>
  `;
};

window.sellShip = function(shipId, sellVal) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (state.ships.length <= 1) { addLog('⚠ Cannot sell your last ship!'); return; }
  if (!addCoins(sellVal)) return;
  state.ships = state.ships.filter(s => s.id !== shipId);
  updateHeaderShips();
  if (state.selectedShip === shipId) { state.selectedShip=null; state.pendingAssign=null; state.followShip=null; document.getElementById('main-canvas').style.cursor=''; removeReassignTooltip(); }
  addLog(`⊘ Sold ${ship.name} for ${fmt(sellVal)} coins`);
  if (refresh.ui) refresh.ui();
  window.patchStockpileCards?.();
};

// ── Craft ──
window.craftShip = function(recipeId) {
  const recipe = CRAFT_RECIPES.find(r => r.id === recipeId); if (!recipe) return;
  for (const [r,n] of Object.entries(recipe.reqs)) if ((state.resources[r]||0) < n) return;
  for (const [r,n] of Object.entries(recipe.reqs)) state.resources[r] -= n;
  if (state.tutStep === 7) {
    state.tutStep = 8; state.basePanelOpen = false;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }
  dismissTransmission();
  spawnShip(recipeId);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  const shipStats  = SHIP_DEFS[recipeId] || SHIP_DEFS.scout;
  const shipRole   = shipStats.role || 'mining';
  const flavour    = NPCS.rigs.shipLines[recipeId] || NPCS.rigs.shipLines.default;
  const thirdRow   = shipRole === 'transport'
    ? `<tr><td style="color:#4a7aaa;padding:2px 0;">⟳ Load Speed</td><td style="color:#cde;font-weight:bold;">${Math.round((shipStats.loadSpeed||0)*10)}%</td></tr>`
    : shipRole === 'combat'
    ? `<tr><td style="color:#4a7aaa;padding:2px 0;">⚔ Attack</td><td style="color:#cde;font-weight:bold;">${shipStats.attack||0}</td></tr>`
    : `<tr><td style="color:#4a7aaa;padding:2px 0;">⛏ MINE SPD</td><td style="color:#cde;font-weight:bold;">${formatMineSpeedPercent(shipStats.mineSpeed)}</td></tr>`;
  const statsTable = `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;">
    ${shipRole !== 'combat' ? `<tr><td style="color:#4a7aaa;padding:2px 0;width:55%;">▲ CARGO</td><td style="color:#cde;font-weight:bold;">${shipStats.capacity} units</td></tr>` : ''}
    <tr><td style="color:#4a7aaa;padding:2px 0;">✈ FLY SPD</td><td style="color:#cde;font-weight:bold;">${formatFlySpeed(shipStats.flySpeed)}</td></tr>
    ${thirdRow}
  </table>`;
  setTimeout(() => showOnce('craft_' + recipeId,
    `<strong>${recipe.name}</strong> rolling out of the yard!${statsTable}${flavour}`,
    5, 'rigs'
  ), 600);
};

window.startCraftShip = function(recipeId) {
  const recipe = CRAFT_RECIPES.find(r => r.id === recipeId); if (!recipe) return;
  const maxShips = BASE_MAX_SHIPS[(state.base.level-1)] || 20;
  const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;
  if ((state.ships.length + activeCraftCount) >= maxShips) { addLog('⚠ Ship capacity full! Upgrade the Base.'); return; }
  if (state.shipCraftTimers?.[recipeId]) return;
  for (const [r, n] of Object.entries(recipe.reqs)) if ((state.resources[r] || 0) < n) return;
  for (const [r, n] of Object.entries(recipe.reqs)) state.resources[r] -= n;

  if (state.tutStep === 7) {
    state.tutStep = 8;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }

  const durationMs = getShipCraftTimeMs(recipeId);
  const now = Date.now();
  if (!state.shipCraftTimers) state.shipCraftTimers = {};
  state.shipCraftTimers[recipeId] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: ${recipe.name} (${Math.ceil(durationMs / 1000)}s)`);
  scheduleCraftCompletion(recipeId, now + durationMs);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
};

window.syncShipCraftTimers = function() {
  if (!state.shipCraftTimers) return;
  for (const [recipeId, timer] of Object.entries(state.shipCraftTimers)) {
    if (!timer || !timer.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftShip(recipeId);
    else scheduleCraftCompletion(recipeId, timer.endsAt);
  }
};

window.syncShipCraftTimers();

// ── Upgrade Ship Stats ──
window.upgradeShip = function(shipId, stat, chunk = 1) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (SHIP_DEFS[ship.type]?.unique) return; // unique ships are already maxed
  const cap = TIER_UPGRADE_CAP[ship.mineTier] || 10;

  if (stat === 'capacity') {
    const allowed = Math.min(chunk, cap - ship.capacityLevel); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_CAP_COST, ship, 'capacity', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.capacityLevel += allowed;
    ship.capacity = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity);
    addLog(`⬆ ${ship.name} cargo Lv${ship.capacityLevel} → ${ship.capacity}${ship.capacityLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'flySpeed') {
    const allowed = Math.min(chunk, cap - ship.flySpeedLevel); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_FLY_COST, ship, 'flySpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.flySpeedLevel += allowed;
    ship.flySpeed = flySpeedFromLevel(ship.type, ship.flySpeedLevel);
    addLog(`⬆ ${ship.name} fly Lv${ship.flySpeedLevel} → ${formatFlySpeed(ship.flySpeed)}${ship.flySpeedLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'mineSpeed') {
    if ((ship.mineSpeed || 0) <= 0) return;
    const allowed = Math.min(chunk, cap - ship.mineSpeedLevel); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_MINE_COST, ship, 'mineSpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.mineSpeedLevel += allowed;
    ship.mineSpeed = mineSpeedFromLevel(ship.type, ship.mineSpeedLevel);
    addLog(`⬆ ${ship.name} mine Lv${ship.mineSpeedLevel} → ${formatMineSpeedPercent(ship.mineSpeed)}${ship.mineSpeedLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'loadSpeed') {
    const allowed = Math.min(chunk, cap - (ship.loadSpeedLevel||0)); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_LOAD_COST, ship, 'loadSpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.loadSpeedLevel = (ship.loadSpeedLevel || 0) + allowed;
    ship.loadSpeed = loadSpeedFromLevel(ship.type, ship.loadSpeedLevel);
    addLog(`⬆ ${ship.name} load Lv${ship.loadSpeedLevel} → ${Math.round(ship.loadSpeed*10)}%${ship.loadSpeedLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'hp') {
    const allowed = Math.min(chunk, cap - (ship.hpLevel||0)); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_HP_COST, ship, 'hp', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.hpLevel = (ship.hpLevel || 0) + allowed;
    ship.hp = hpFromLevel(ship.type, ship.hpLevel);
    addLog(`⬆ ${ship.name} HP Lv${ship.hpLevel} → ${ship.hp.toLocaleString()}${ship.hpLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'attack') {
    const allowed = Math.min(chunk, cap - (ship.attackLevel||0)); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_ATTACK_COST, ship, 'attack', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.attackLevel = (ship.attackLevel || 0) + allowed;
    ship.attack = attackFromLevel(ship.type, ship.attackLevel);
    addLog(`⬆ ${ship.name} ATK Lv${ship.attackLevel} → ${ship.attack}${ship.attackLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'atkRate') {
    const allowed = Math.min(chunk, cap - (ship.atkRateLevel||0)); if (allowed <= 0) return;
    const cost = upgradeTotalCost(UPGRADE_ATK_RATE_COST, ship, 'atkRate', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.atkRateLevel = (ship.atkRateLevel || 0) + allowed;
    ship.attackSpeed = atkRateFromLevel(ship.type, ship.atkRateLevel);
    addLog(`⬆ ${ship.name} ATK rate Lv${ship.atkRateLevel} → ${Math.round(ship.attackSpeed*100)}%${ship.atkRateLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'mineTier') {
    const nextTier = ship.mineTier + 1; if (nextTier > 10) return;
    const cost = SHIP_TIER_COSTS[nextTier]; if (!cost || state.coins < cost) return;
    const resReqs = SHIP_TIER_REQS[nextTier];
    if (resReqs) {
      for (const [r, n] of Object.entries(resReqs)) {
        if ((state.resources[r] || 0) < n) return;
      }
    }
    spendCoins(cost);
    if (resReqs) {
      for (const [r, n] of Object.entries(resReqs)) state.resources[r] -= n;
    }
    ship.mineTier = nextTier;
    addLog(`⬆ ${ship.name} upgraded to ${MINE_TIERS[nextTier].label}!`);
  }

  state.upgradesTutActive = false;
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  dismissTransmission();
  checkTradeTutorial();
  patchSolPanel('power');
  if (refresh.ui) refresh.ui();
};

window.upgradeShipAll = function(shipId, levels) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (SHIP_DEFS[ship.type]?.unique) return;
  const cap  = TIER_UPGRADE_CAP[ship.mineTier] || 10;
  const role = SHIP_DEFS[ship.type]?.role || 'mining';
  const n    = levels === 'max';

  let total = 0;
  const upgrades = [];

  if (role === 'mining') {
    const capChk  = n ? cap - ship.capacityLevel  : Math.min(levels, cap - ship.capacityLevel);
    const flyChk  = n ? cap - ship.flySpeedLevel  : Math.min(levels, cap - ship.flySpeedLevel);
    const mineChk = n ? cap - ship.mineSpeedLevel : Math.min(levels, cap - ship.mineSpeedLevel);
    if (capChk  > 0) { const c = upgradeTotalCost(UPGRADE_CAP_COST,  ship, 'capacity',  capChk);  total += c; upgrades.push(() => { ship.capacityLevel  += capChk;  ship.capacity   = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity); }); }
    if (flyChk  > 0) { const c = upgradeTotalCost(UPGRADE_FLY_COST,  ship, 'flySpeed',  flyChk);  total += c; upgrades.push(() => { ship.flySpeedLevel  += flyChk;  ship.flySpeed   = flySpeedFromLevel(ship.type, ship.flySpeedLevel); }); }
    if (mineChk > 0) { const c = upgradeTotalCost(UPGRADE_MINE_COST, ship, 'mineSpeed', mineChk); total += c; upgrades.push(() => { ship.mineSpeedLevel += mineChk; ship.mineSpeed  = mineSpeedFromLevel(ship.type, ship.mineSpeedLevel); }); }

  } else if (role === 'transport') {
    const capChk  = n ? cap - ship.capacityLevel               : Math.min(levels, cap - ship.capacityLevel);
    const flyChk  = n ? cap - ship.flySpeedLevel               : Math.min(levels, cap - ship.flySpeedLevel);
    const loadChk = n ? cap - (ship.loadSpeedLevel||0)         : Math.min(levels, cap - (ship.loadSpeedLevel||0));
    if (capChk  > 0) { const c = upgradeTotalCost(UPGRADE_CAP_COST,  ship, 'capacity',  capChk);  total += c; upgrades.push(() => { ship.capacityLevel  += capChk;  ship.capacity   = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity); }); }
    if (flyChk  > 0) { const c = upgradeTotalCost(UPGRADE_FLY_COST,  ship, 'flySpeed',  flyChk);  total += c; upgrades.push(() => { ship.flySpeedLevel  += flyChk;  ship.flySpeed   = flySpeedFromLevel(ship.type, ship.flySpeedLevel); }); }
    if (loadChk > 0) { const c = upgradeTotalCost(UPGRADE_LOAD_COST, ship, 'loadSpeed', loadChk); total += c; upgrades.push(() => { ship.loadSpeedLevel = (ship.loadSpeedLevel||0) + loadChk; ship.loadSpeed = loadSpeedFromLevel(ship.type, ship.loadSpeedLevel); }); }

  } else if (role === 'combat') {
    const flyChk  = n ? cap - ship.flySpeedLevel               : Math.min(levels, cap - ship.flySpeedLevel);
    const hpChk   = n ? cap - (ship.hpLevel||0)                : Math.min(levels, cap - (ship.hpLevel||0));
    const atkChk  = n ? cap - (ship.attackLevel||0)            : Math.min(levels, cap - (ship.attackLevel||0));
    const rateChk = n ? cap - (ship.atkRateLevel||0)           : Math.min(levels, cap - (ship.atkRateLevel||0));
    if (flyChk  > 0) { const c = upgradeTotalCost(UPGRADE_FLY_COST,      ship, 'flySpeed', flyChk);  total += c; upgrades.push(() => { ship.flySpeedLevel += flyChk;  ship.flySpeed    = flySpeedFromLevel(ship.type, ship.flySpeedLevel); }); }
    if (hpChk   > 0) { const c = upgradeTotalCost(UPGRADE_HP_COST,       ship, 'hp',       hpChk);   total += c; upgrades.push(() => { ship.hpLevel       = (ship.hpLevel||0) + hpChk;     ship.hp          = hpFromLevel(ship.type, ship.hpLevel); }); }
    if (atkChk  > 0) { const c = upgradeTotalCost(UPGRADE_ATTACK_COST,   ship, 'attack',   atkChk);  total += c; upgrades.push(() => { ship.attackLevel   = (ship.attackLevel||0) + atkChk;  ship.attack      = attackFromLevel(ship.type, ship.attackLevel); }); }
    if (rateChk > 0) { const c = upgradeTotalCost(UPGRADE_ATK_RATE_COST, ship, 'atkRate',  rateChk); total += c; upgrades.push(() => { ship.atkRateLevel  = (ship.atkRateLevel||0) + rateChk; ship.attackSpeed = atkRateFromLevel(ship.type, ship.atkRateLevel); }); }
  }

  if (total <= 0 || state.coins < total) return;
  spendCoins(total);
  upgrades.forEach(fn => fn());

  const label = levels === 'max' ? 'MAX' : `+${levels}`;
  addLog(`⬆ ${ship.name} all stats ${label} — $${fmt(total)} spent`);
  state.upgradesTutActive = false;
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  dismissTransmission();
  checkTradeTutorial();
  patchSolPanel('power');
  if (refresh.ui) refresh.ui();
};

// ── Assign window helpers ──
window.startAssign = function(shipId) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship || (ship.mineSpeed || 0) <= 0) { addLog(`⚠ This ship has no mining equipment.`); return; }
  state.pendingAssign = shipId;
  document.getElementById('main-canvas').style.cursor = 'crosshair';
  if (refresh.ui) refresh.ui();
};

window.cancelAssign = function() {
  state.pendingAssign = null;
  document.getElementById('main-canvas').style.cursor = '';
  if (refresh.ui) refresh.ui();
};

window.doAssign = function(shipId, nodeId) {
  const ship = state.ships.find(s => s.id === shipId);
  const node = state.nodes.find(n => n.id === nodeId);
  if (ship && node) assignShip(ship, node);
};

window.setShipDepot = function(shipId, depotValue) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship) return;
  if (depotValue === 'base' || !depotValue) {
    ship.depotType = 'base';
    ship.depotId = null;
  } else if (String(depotValue).startsWith('storage:')) {
    const depotId = Number(String(depotValue).split(':')[1]);
    const storage = getStorageModules().find(s => s.id === depotId);
    if (!storage) return;
    ship.depotType = 'storage';
    ship.depotId = depotId;
  } else if (String(depotValue).startsWith('power_station:')) {
    const depotId = Number(String(depotValue).split(':')[1]);
    const station = getPowerStations().find(s => s.id === depotId);
    if (!station) return;
    ship.depotType = 'power_station';
    ship.depotId = depotId;
  }
  if (ship.status === 'returning' && ship.cargo > 0) {
    const depotDest = getShipDepotDestination(ship);
    ship.destX = depotDest.x;
    ship.destY = depotDest.y;
    ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
  }
  if (refresh.ui) refresh.ui();
};

// ── Flush deposit events (called by game loop) ──
export function flushTickEvents(canvas) {
  for (const ev of tickEvents) {
    if (ev.type === 'deposit') {
      console.log(`[deposit] ${ev.name} depositing ${ev.amount}x ${ev.cargoResource}`);
      let deposited = ev.amount;
      let depotLabel = state.base.name || 'Base Station';
      let depositBlocked = false;
      let floatiePos = null;
      if (ev.depotType === 'storage' && ev.depotId !== null) {
        const storage = getStorageModules().find(s => s.id === ev.depotId);
        if (storage) {
          const free = getModuleFreeCapacity(storage);
          deposited = Math.min(ev.amount, free);
          storage.inventory[ev.cargoResource] = (storage.inventory[ev.cargoResource] || 0) + deposited;
          depotLabel = storage.name;
          depositBlocked = deposited < ev.amount;
          const w = gridToWorld(storage.col, storage.row);
          floatiePos = { x: w.x, y: w.y - 12 };
        } else {
          state.resources[ev.cargoResource] = Math.min(RESOURCE_CAP, (state.resources[ev.cargoResource] || 0) + ev.amount);
        }
      } else if (ev.depotType === 'power_station' && ev.depotId !== null) {
        const station = getPowerStations().find(s => s.id === ev.depotId);
        if (station) {
          const free = getModuleFreeCapacity(station);
          deposited = free >= ev.amount ? ev.amount : 0;
          if (deposited > 0) station.inventory[ev.cargoResource] = (station.inventory[ev.cargoResource] || 0) + deposited;
          depotLabel = station.name;
          depositBlocked = deposited < ev.amount;
          const w = gridToWorld(station.col, station.row);
          floatiePos = { x: w.x, y: w.y - 12 };
        } else {
          state.resources[ev.cargoResource] = Math.min(RESOURCE_CAP, (state.resources[ev.cargoResource] || 0) + ev.amount);
        }
      } else {
        state.resources[ev.cargoResource] = Math.min(RESOURCE_CAP, (state.resources[ev.cargoResource] || 0) + ev.amount);
      }
      state.trips++;
      state.solStarted = true;
      addLog(`📦 ${ev.name} delivered ${deposited} ${RESOURCE_DEFS[ev.cargoResource].label} to ${depotLabel}${depositBlocked ? ' (depot full)' : ''}`);
      if (deposited > 0) spawnFloatie(ev.cargoResource, deposited, floatiePos);
      if ((ev.depotType === 'storage' || ev.depotType === 'power_station') && state.selectedModule === ev.depotId && window.patchStorageModal) {
        const overlay = document.getElementById('storage-modal-overlay');
        if (overlay?.style.display === 'flex') window.patchStorageModal();
      }
      if (state.tutStep === 3) { state.tutStep=4; state.seenMsgs['tut_mining_done']=true; document.querySelectorAll('.tut-pointer').forEach(el=>el.remove()); }
      import('../ui/tutorial.js').then(({ checkTradeTutorial }) => checkTradeTutorial());
      if (!state.firstDeposit && ev.depotType !== 'storage' && ev.depotType !== 'power_station') {
        state.firstDeposit = true;
        state.redirectTutActive = true;
        setTimeout(() => showOnce('first_deposit', NPCS.juno.transmissionLines.first_deposit, 15, 'juno'), 800);
      }
      if (!state.firstCraftable && ev.depotType !== 'storage' && ev.depotType !== 'power_station') {
        const canBuildAny = CRAFT_RECIPES.some(r => Object.entries(r.reqs).every(([res, amt]) => (state.resources[res]||0) >= amt));
        if (canBuildAny) {
          state.firstCraftable = true;
          if (state.tutStep <= 4) state.tutStep = 5;
          setTimeout(() => showOnce('first_craftable', NPCS.rigs.transmissionLines.first_craftable, 15, 'rigs'), 1200);
        }
      }
      if (refresh.resources) refresh.resources();
    } else if (ev.type === 'idle') {
      if (state.selectedShip === ev.ship.id) {
        state.pendingAssign = ev.ship.id;
        if (canvas) canvas.style.cursor = 'crosshair';
      }
    }
  }
}
