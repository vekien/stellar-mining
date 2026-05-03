// ============================================================
// SHIP SYSTEMS — tick, assign, recall, spawn, craft, upgrade
// ============================================================
import { TILE_H, BASE_COL, BASE_ROW } from '../constants.js';
import { state, bumpShipIdCounter } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { SHIP_DEFS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
          UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST,
          upgradeTotalCost, upgradeChunk,
          SHIP_CRAFT_TIME_MS, DEFAULT_CRAFT_TIME_MS,
          flySpeedToMultiplier, formatFlySpeed, FLY_SPEED_UPGRADE_STEP, MINE_SPEED_UPGRADE_STEP,
          capacityFromTierAndLevel, formatMineSpeedPercent } from '../data/ships.js';
import { BASE_MAX_SHIPS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { addLog, fmt, addCoins, spendCoins } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { BASE_POS, gridToWorld, nodeWorldPos } from '../render/camera.js';
import { spawnFloatie } from '../render/animations.js';
import { showOnce, showTransmissionMessage, dismissTransmission } from '../ui/transmissions.js';
import { removeReassignTooltip, checkTradeTutorial } from '../ui/tutorial.js';
import { patchSolPanel } from '../ui/panels.js';
import { updateHeaderShips } from '../ui/ui.js';

const craftTimeouts = {};

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
    }
  }, 3050);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
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
  const ship = {
    id,
    name: recipe ? `${recipe.name} #${id}` : `Starter #${id}`,
    type,
    capacity:  capacityFromTierAndLevel(type, stats.mineTier, 0, stats.capacity),
    flySpeed:  stats.flySpeed,
    mineSpeed: stats.mineSpeed,
    mineTier:  stats.mineTier,
    capacityLevel:0, flySpeedLevel:0, mineSpeedLevel:0,
    cargo:0, cargoResource:null,
    status:'idle', targetNode:null,
    heading: Math.random() * Math.PI * 2,
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
}

// ── Tick ──
export let tickEvents = [];

export function tickShip(ship, dt) {
  const FLY_SPEED = 80 * flySpeedToMultiplier(ship.flySpeed);
  if (ship.status==='flying'||ship.status==='returning') {
    // Trail: record world position every frame, keep last 28 points
    if (!ship.trail) ship.trail = [];
    ship.trail.push({ x: ship.x, y: ship.y });
    if (ship.trail.length > 80) ship.trail.shift();

    const dx = ship.destX-ship.x, dy = ship.destY-ship.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 6) {
      ship.x = ship.destX; ship.y = ship.destY;
      if (ship.status==='flying') {
        ship.status='mining'; ship.mineTimer=0;
        if (state.tutStep === 2) state.tutStep = 3;
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
      // Turn rate from ship def — dynamically tighten turning when close to destination.
      const baseTurnRadius = SHIP_DEFS[ship.type]?.turnRadius ?? 1.0;
      const CLOSE_TURN_DIST = 200;
      const closeRatio = Math.max(0, Math.min(1, dist / CLOSE_TURN_DIST));
      const dynamicTurnRadius = baseTurnRadius * (0.12 + 0.88 * closeRatio);
      const TURN_RATE = (Math.PI * 2) / dynamicTurnRadius;
      const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
      let da = targetAngle - ship.heading;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const absDaBeforeTurn = Math.abs(da);
      ship.heading += Math.sign(da) * Math.min(Math.abs(da), TURN_RATE * dt);

      // Move in the direction the ship is actually facing.
      // Easing profile:
      // 0%-5% progress: speed up from slow -> full speed
      // 5%-95% progress: full speed
      // 95%-100% progress: slow down slightly before arrival
      const totalDist = Math.max(1, ship.flightTotalDist || dist);
      const progress = Math.max(0, Math.min(1, 1 - (dist / totalDist)));
      const START_ZONE = 0.05;
      const END_ZONE = 0.95;
      const START_MIN = 0.6;
      const END_MIN = 0.55;
      let easedFactor = 1;
      if (progress < START_ZONE) {
        const t = progress / START_ZONE;
        easedFactor = START_MIN + (1 - START_MIN) * t;
      } else if (progress > END_ZONE) {
        const t = (progress - END_ZONE) / (1 - END_ZONE);
        easedFactor = 1 - (1 - END_MIN) * t;
      }

      // Clamp to remaining distance so it can't overshoot.
      const turnSlowdown = 0.35 + 0.65 * Math.max(0, Math.cos(absDaBeforeTurn));
      const moveAngle = ship.heading - Math.PI / 2;
      const step = Math.min(FLY_SPEED * easedFactor * turnSlowdown * dt, dist);
      // When very close, blend movement toward direct-to-target to prevent circling.
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
        const bp = BASE_POS(); ship.destX=bp.x; ship.destY=bp.y+TILE_H/2-20;
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
    const bp = BASE_POS(); ship.destX=bp.x; ship.destY=bp.y+TILE_H/2-20;
    ship.status='returning';
    ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
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
  addCoins(sellVal);
  state.ships = state.ships.filter(s => s.id !== shipId);
  updateHeaderShips();
  if (state.selectedShip === shipId) { state.selectedShip=null; state.pendingAssign=null; state.followShip=null; document.getElementById('main-canvas').style.cursor=''; removeReassignTooltip(); }
  addLog(`⊘ Sold ${ship.name} for ${fmt(sellVal)} coins`);
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
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  const shipStats  = SHIP_DEFS[recipeId] || SHIP_DEFS.scout;
  const flavour    = NPCS.rigs.shipLines[recipeId] || NPCS.rigs.shipLines.default;
  const statsTable = `<table style="width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;">
    <tr><td style="color:#4a7aaa;padding:2px 0;width:55%;">▲ Cargo Capacity</td><td style="color:#cde;font-weight:bold;">${shipStats.capacity} units</td></tr>
    <tr><td style="color:#4a7aaa;padding:2px 0;">✈ Fly Speed</td><td style="color:#cde;font-weight:bold;">${formatFlySpeed(shipStats.flySpeed)}</td></tr>
    <tr><td style="color:#4a7aaa;padding:2px 0;">⛏ Mine Speed</td><td style="color:#cde;font-weight:bold;">${formatMineSpeedPercent(shipStats.mineSpeed)}</td></tr>
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
  const cap = TIER_UPGRADE_CAP[ship.mineTier] || 10;
  if (stat === 'capacity') {
    const allowed = Math.min(chunk, cap-ship.capacityLevel); if (allowed<=0) return;
    const cost = upgradeTotalCost(UPGRADE_CAP_COST, ship, 'capacity', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.capacityLevel += allowed;
    ship.capacity = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity);
    addLog(`⬆ ${ship.name} cargo Lv${ship.capacityLevel} → ${ship.capacity}${ship.capacityLevel>=cap?' (MAX)':''}`);
  } else if (stat === 'flySpeed') {
    const allowed = Math.min(chunk, cap-ship.flySpeedLevel); if (allowed<=0) return;
    const cost = upgradeTotalCost(UPGRADE_FLY_COST, ship, 'flySpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    for (let i=0;i<allowed;i++) { ship.flySpeedLevel++; ship.flySpeed += FLY_SPEED_UPGRADE_STEP; }
    addLog(`⬆ ${ship.name} fly Lv${ship.flySpeedLevel} → ${formatFlySpeed(ship.flySpeed)}${ship.flySpeedLevel>=cap?' (MAX)':''}`);
  } else if (stat === 'mineSpeed') {
    if ((ship.mineSpeed || 0) <= 0) return;
    const allowed = Math.min(chunk, cap-ship.mineSpeedLevel); if (allowed<=0) return;
    const cost = upgradeTotalCost(UPGRADE_MINE_COST, ship, 'mineSpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    for (let i=0;i<allowed;i++) { ship.mineSpeedLevel++; ship.mineSpeed=parseFloat((ship.mineSpeed+MINE_SPEED_UPGRADE_STEP).toFixed(2)); }
    addLog(`⬆ ${ship.name} mine Lv${ship.mineSpeedLevel} → ${formatMineSpeedPercent(ship.mineSpeed)}${ship.mineSpeedLevel>=cap?' (MAX)':''}`);
  } else if (stat === 'mineTier') {
    const nextTier = ship.mineTier+1; if (nextTier>10) return;
    const cost = SHIP_TIER_COSTS[nextTier]; if (!cost||state.coins<cost) return;
    spendCoins(cost); ship.mineTier=nextTier;
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
  const cap = TIER_UPGRADE_CAP[ship.mineTier] || 10;
  const canMine = (ship.mineSpeed || 0) > 0;

  const capChk  = levels === 'max' ? cap - ship.capacityLevel  : Math.min(levels, cap - ship.capacityLevel);
  const flyChk  = levels === 'max' ? cap - ship.flySpeedLevel  : Math.min(levels, cap - ship.flySpeedLevel);
  const mineChk = canMine ? (levels === 'max' ? cap - ship.mineSpeedLevel : Math.min(levels, cap - ship.mineSpeedLevel)) : 0;

  const capCost  = capChk  > 0 ? upgradeTotalCost(UPGRADE_CAP_COST,  ship, 'capacity',  capChk)  : 0;
  const flyCost  = flyChk  > 0 ? upgradeTotalCost(UPGRADE_FLY_COST,  ship, 'flySpeed',  flyChk)  : 0;
  const mineCost = mineChk > 0 ? upgradeTotalCost(UPGRADE_MINE_COST, ship, 'mineSpeed', mineChk) : 0;
  const total = capCost + flyCost + mineCost;

  if (total <= 0 || state.coins < total) return;
  spendCoins(total);

  if (capChk > 0) {
    ship.capacityLevel += capChk;
    ship.capacity = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity);
  }
  if (flyChk > 0) {
    for (let i=0;i<flyChk;i++) { ship.flySpeedLevel++; ship.flySpeed += FLY_SPEED_UPGRADE_STEP; }
  }
  if (mineChk > 0) {
    for (let i=0;i<mineChk;i++) { ship.mineSpeedLevel++; ship.mineSpeed=parseFloat((ship.mineSpeed+MINE_SPEED_UPGRADE_STEP).toFixed(2)); }
  }

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
      if (refresh.resources) refresh.resources();
    } else if (ev.type === 'idle') {
      if (state.selectedShip === ev.ship.id) {
        state.pendingAssign = ev.ship.id;
        if (canvas) canvas.style.cursor = 'crosshair';
      }
    }
  }
}
