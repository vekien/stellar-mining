// ============================================================
// SHIP SYSTEMS — tick, assign, recall, spawn, craft, upgrade
// ============================================================
import { TILE_H } from '../constants.js';
import { state, bumpShipIdCounter } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { SHIP_DEFS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
         UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST,
         upgradeTotalCost, upgradeChunk } from '../data/ships.js';
import { BASE_MAX_SHIPS } from '../data/nodes.js';
import { NPCS } from '../data/npcs.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { BASE_POS, gridToWorld, nodeWorldPos } from '../render/camera.js';
import { spawnFloatie } from '../render/animations.js';
import { showOnce, showTransmissionMessage, dismissTransmission } from '../ui/transmissions.js';
import { removeReassignTooltip, checkTradeTutorial } from '../ui/tutorial.js';

// ── Spawn ──
export function spawnShip(type = 'scout') {
  const maxShips = BASE_MAX_SHIPS[(state.base.level-1)] || 20;
  if (state.ships.length >= maxShips) { addLog('⚠ Ship capacity full! Upgrade the Base.'); return; }
  const recipe = CRAFT_RECIPES.find(r => r.id === type);
  const stats  = SHIP_DEFS[type] || SHIP_DEFS.scout;
  const base = gridToWorld(12, 12);
  const id = bumpShipIdCounter();
  const ship = {
    id,
    name: recipe ? `${recipe.name} #${id}` : `Starter #${id}`,
    type,
    capacity:  stats.capacity,
    flySpeed:  stats.flySpeed,
    mineSpeed: stats.mineSpeed,
    mineTier:  stats.mineTier,
    capacityLevel:0, flySpeedLevel:0, mineSpeedLevel:0,
    cargo:0, cargoResource:null,
    status:'idle', targetNode:null,
    heading: -Math.PI/2,
    x:base.x, y:base.y, destX:base.x, destY:base.y, mineTimer:0,
  };
  state.ships.push(ship);
  addLog(`⚡ ${ship.name} is ready for deployment.`);
}

// ── Assign ──
export function assignShip(ship, node) {
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
  import('../ui/tutorial.js').then(({ dismissTutorial }) => dismissTutorial());
  if (state.tutStep < 2) state.tutStep = 2;
  state.redirectTutActive = false;

  // Rigs upgrade tutorial — fires first time a non-starter ship is assigned
  if (state.ships.length > 1 && !state.seenMsgs['rigs_upgrades']) {
    const alreadyUpgraded = state.ships.some(
      s => s.capacityLevel > 0 || s.flySpeedLevel > 0 || s.mineSpeedLevel > 0 || s.mineTier > 1
    );
    setTimeout(() => {
      showOnce('rigs_upgrades', NPCS.rigs.transmissionLines.rigs_upgrades, 20, 'rigs');
      if (!alreadyUpgraded) {
        state.upgradesTutActive = true;
        if (refresh.ui) refresh.ui();
      }
    }, 1200);
  }
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  removeReassignTooltip();
  ship.targetNode = node.id;
  ship.status = 'flying';
  const pos = nodeWorldPos(node);
  ship.destX = pos.x; ship.destY = pos.y-20;
  addLog(`🚀 ${ship.name} → ${RESOURCE_DEFS[node.type].label} node`);
  if (refresh.ui) refresh.ui();
}

// ── Tick ──
export let tickEvents = [];

export function tickShip(ship, dt) {
  const FLY_SPEED = 80 * ship.flySpeed;
  if (ship.status==='flying'||ship.status==='returning') {
    const dx = ship.destX-ship.x, dy = ship.destY-ship.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 4) {
      ship.x = ship.destX; ship.y = ship.destY;
      if (ship.status==='flying') {
        ship.status='mining'; ship.mineTimer=0;
        if (state.tutStep === 2) state.tutStep = 3;
        if (refresh.ui) refresh.ui();
      } else {
        // Arrived at base
        console.log(`[return] ${ship.name} arrived at base | cargo=${ship.cargo} cargoResource=${ship.cargoResource}`);
        if (ship.cargo>0 && ship.cargoResource && RESOURCE_DEFS[ship.cargoResource]) {
          tickEvents.push({ type:'deposit', name:ship.name, cargoResource:ship.cargoResource, amount:ship.cargo });
        }
        ship.cargo=0; ship.cargoResource=null;
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
      ship.x += (dx/dist)*FLY_SPEED*dt; ship.y += (dy/dist)*FLY_SPEED*dt;
      const targetAngle = Math.atan2(dy,dx)+Math.PI/2;
      let da = targetAngle-(ship.heading||0);
      while (da >  Math.PI) da -= Math.PI*2;
      while (da < -Math.PI) da += Math.PI*2;
      ship.heading = (ship.heading||0) + da * Math.min(1, 10*dt);
    }
  } else if (ship.status==='pausing') {
    ship.pauseTimer -= dt;
    if (ship.pauseTimer <= 0) {
      const node = state.nodes.find(n => n.id === ship.targetNode);
      if (node && ship.targetNode !== null) {
        ship.status='flying';
        const pos = nodeWorldPos(node);
        ship.destX=pos.x; ship.destY=pos.y-20;
      } else {
        ship.targetNode=null; ship.status='idle';
        tickEvents.push({ type:'idle', ship });
      }
    }
  } else if (ship.status==='mining') {
    ship.mineTimer += dt;
    const MINE_INTERVAL = 1.5 / ship.mineSpeed;
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
        const bp = BASE_POS(); ship.destX=bp.x; ship.destY=bp.y+TILE_H/2-20;
      }
    }
  }
}

// ── Recall ──
window.recallShip = function(shipId) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (state.pendingAssign === shipId) { state.pendingAssign=null; document.getElementById('main-canvas').style.cursor=''; }
  if (state.selectedShip === shipId) { state.selectedShip=null; removeReassignTooltip(); }
  ship.targetNode = null;
  if (ship.status==='returning') {
    addLog(`⟵ ${ship.name} recalled`);
  } else if (ship.status==='pausing') {
    ship.status='idle'; ship.pauseTimer=0;
    addLog(`⟵ ${ship.name} recalled`);
  } else {
    const bp = BASE_POS(); ship.destX=bp.x; ship.destY=bp.y+TILE_H/2-20;
    ship.status='returning';
    addLog(`⟵ ${ship.name} returning to base`);
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
  state.coins += sellVal;
  state.ships = state.ships.filter(s => s.id !== shipId);
  if (state.selectedShip === shipId) { state.selectedShip=null; state.pendingAssign=null; document.getElementById('main-canvas').style.cursor=''; removeReassignTooltip(); }
  addLog(`⊘ Sold ${ship.name} for ${fmt(sellVal)} coins`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
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
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  const shipStats  = SHIP_DEFS[recipeId] || SHIP_DEFS.scout;
  const flavour    = NPCS.rigs.shipLines[recipeId] || NPCS.rigs.shipLines.default;
  const statsTable = `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;">
    <tr><td style="color:#4a7aaa;padding:2px 0;width:55%;">▲ Cargo Capacity</td><td style="color:#cde;font-weight:bold;">${shipStats.capacity} units</td></tr>
    <tr><td style="color:#4a7aaa;padding:2px 0;">✈ Fly Speed</td><td style="color:#cde;font-weight:bold;">${shipStats.flySpeed}x</td></tr>
    <tr><td style="color:#4a7aaa;padding:2px 0;">⛏ Mine Speed</td><td style="color:#cde;font-weight:bold;">${shipStats.mineSpeed}x</td></tr>
  </table>`;
  setTimeout(() => showOnce('craft_' + recipeId,
    `<strong>${recipe.name}</strong> rolling out of the yard!${statsTable}${flavour}`,
    5, 'rigs'
  ), 600);
};

// ── Upgrade Ship Stats ──
window.upgradeShip = function(shipId, stat, chunk = 1) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  const cap = TIER_UPGRADE_CAP[ship.mineTier] || 10;
  if (stat === 'capacity') {
    const allowed = Math.min(chunk, cap-ship.capacityLevel); if (allowed<=0) return;
    const cost = upgradeTotalCost(UPGRADE_CAP_COST, ship, 'capacity', allowed); if (state.coins < cost) return;
    state.coins -= cost;
    const capStep = ship.type==='freighter'?10:ship.type==='hauler'?5:2;
    for (let i=0;i<allowed;i++) { ship.capacityLevel++; ship.capacity+=capStep; }
    addLog(`⬆ ${ship.name} cargo Lv${ship.capacityLevel} → ${ship.capacity}${ship.capacityLevel>=cap?' (MAX)':''}`);
  } else if (stat === 'flySpeed') {
    const allowed = Math.min(chunk, cap-ship.flySpeedLevel); if (allowed<=0) return;
    const cost = upgradeTotalCost(UPGRADE_FLY_COST, ship, 'flySpeed', allowed); if (state.coins < cost) return;
    state.coins -= cost;
    for (let i=0;i<allowed;i++) { ship.flySpeedLevel++; ship.flySpeed=parseFloat((ship.flySpeed+0.2).toFixed(2)); }
    addLog(`⬆ ${ship.name} fly Lv${ship.flySpeedLevel} → ${ship.flySpeed.toFixed(2)}x${ship.flySpeedLevel>=cap?' (MAX)':''}`);
  } else if (stat === 'mineSpeed') {
    const allowed = Math.min(chunk, cap-ship.mineSpeedLevel); if (allowed<=0) return;
    const cost = upgradeTotalCost(UPGRADE_MINE_COST, ship, 'mineSpeed', allowed); if (state.coins < cost) return;
    state.coins -= cost;
    for (let i=0;i<allowed;i++) { ship.mineSpeedLevel++; ship.mineSpeed=parseFloat((ship.mineSpeed+0.2).toFixed(2)); }
    addLog(`⬆ ${ship.name} mine Lv${ship.mineSpeedLevel} → ${ship.mineSpeed.toFixed(2)}x${ship.mineSpeedLevel>=cap?' (MAX)':''}`);
  } else if (stat === 'mineTier') {
    const nextTier = ship.mineTier+1; if (nextTier>10) return;
    const cost = SHIP_TIER_COSTS[nextTier]; if (!cost||state.coins<cost) return;
    state.coins -= cost; ship.mineTier=nextTier;
    addLog(`⬆ ${ship.name} upgraded to ${MINE_TIERS[nextTier].label}!`);
  }
  state.upgradesTutActive = false;
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  dismissTransmission();
  checkTradeTutorial();
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
};

// ── Assign window helpers ──
window.startAssign = function(shipId) {
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

// ── Flush deposit events (called by game loop) ──
export function flushTickEvents(canvas) {
  for (const ev of tickEvents) {
    if (ev.type === 'deposit') {
      console.log(`[deposit] ${ev.name} depositing ${ev.amount}x ${ev.cargoResource}`);
      state.resources[ev.cargoResource] += ev.amount;
      state.trips++;
      state.solStarted = true;
      addLog(`📦 ${ev.name} returned with ${ev.amount} ${RESOURCE_DEFS[ev.cargoResource].label}`);
      spawnFloatie(ev.cargoResource, ev.amount);
      if (state.tutStep === 3) { state.tutStep=4; state.seenMsgs['tut_mining_done']=true; document.querySelectorAll('.tut-pointer').forEach(el=>el.remove()); }
      import('../ui/tutorial.js').then(({ checkTradeTutorial }) => checkTradeTutorial());
      if (!state.firstDeposit) {
        state.firstDeposit = true;
        state.redirectTutActive = true;
        setTimeout(() => showOnce('first_deposit', NPCS.juno.transmissionLines.first_deposit, 15, 'juno'), 800);
      }
      if (!state.firstCraftable) {
        const canBuildAny = CRAFT_RECIPES.some(r => Object.entries(r.reqs).every(([res, amt]) => (state.resources[res]||0) >= amt));
        if (canBuildAny) {
          state.firstCraftable = true;
          if (state.tutStep <= 4) state.tutStep = 5;
          setTimeout(() => showOnce('first_craftable', NPCS.rigs.transmissionLines.first_craftable, 15, 'rigs'), 1200);
        }
      }
      if (state.activeTab === 'craft' && refresh.ui) refresh.ui();
    } else if (ev.type === 'idle') {
      if (state.selectedShip === ev.ship.id) {
        state.pendingAssign = ev.ship.id;
        if (canvas) canvas.style.cursor = 'crosshair';
      }
    }
  }
}
