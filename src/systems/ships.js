// ============================================================
// SHIP SYSTEMS — tick, assign, recall, spawn, craft, upgrade
// ============================================================
import { TILE_H, BASE_COL, BASE_ROW, GRID_COLS, GRID_ROWS, BASE_FOOTPRINT_RADIUS, isBaseFootprintCell } from '../constants.js';
import { state, bumpShipIdCounter } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS, isStorableResource, getResourceTier } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { SHIP_DEFS, SHIP_TIER_COSTS, TIER_UPGRADE_CAP,
          UPGRADE_CAP_COST, UPGRADE_FLY_COST, UPGRADE_MINE_COST, UPGRADE_MINE_BONUS_COST,
          UPGRADE_LOAD_COST, UPGRADE_HP_COST, UPGRADE_ATTACK_COST, UPGRADE_ATK_RATE_COST, UPGRADE_RANGE_COST,
          upgradeTotalCost, upgradeChunk,
          SHIP_CRAFT_TIME_MS, DEFAULT_CRAFT_TIME_MS,
          flySpeedToMultiplier, formatFlySpeed, FLY_SPEED_UPGRADE_STEP, MINE_SPEED_UPGRADE_STEP,
          capacityFromTierAndLevel, flySpeedFromLevel, mineSpeedFromLevel,
          loadSpeedFromLevel, hpFromLevel, attackFromLevel, atkRateFromLevel, rangeFromLevel,
          mineBonusFromLevel, mineBonusUpgradeCap, formatMineSpeedPercent, formatMineBonusPercent, formatLoadSpeed, formatWeaponRangeTiles, getShipSalvageRewards } from '../data/ships.js';
import { BASE_MAX_SHIPS, SHIP_TIER_REQS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { addLog, fmt, addCoins, spendCoins, RESOURCE_CAP } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { BASE_POS, gridToWorld, nodeWorldPos } from '../render/camera.js';
import { spawnFloatie } from '../render/animations.js';
import { showOnce, showTransmissionMessage, dismissTransmission } from '../ui/transmissions.js';
import { removeReassignTooltip, checkTradeTutorial } from '../ui/tutorial.js';
import { patchSolPanel } from '../ui/panels.js';
import { bumpPirateStatusOnExpand } from './combat.js';
import { normalizeShipAttachments } from '../data/attachments.js';
import { enqueueCraftJob, countCraftJobs, canEnqueueCraft, getCraftQueueCap } from './craftQueue.js';
import { updateHeaderShips } from '../ui/ui.js';
import { isStorageOperational } from '../data/storage.js';
import { isStorageModule, isPowerStationModule, getModuleFreeCapacity, getPowerStationResourceFreeCapacity, getModuleFootprintHalf, getDepotModules, recordModuleImport } from '../data/modules.js';
// getDepotModules used for storage + contract center depots
import { getBlackHoleRadiusScale } from '../render/animations.js';
import { isShipCraftLocked, evaluateCollectObjectives, evaluateAssignObjectives, notifyShipCrafted, notifyShipUpgraded } from './quests.js';
import { HAZARD_HARDENING_BH_FLOOR, CARGO_STRAPS_MULT, hasMineBoost, MINE_BOOST_MULT } from './research/definitions.js';
import { applyContractDelivery, isContractCenterModule } from './contracts.js';
import { onShipMissionBaseArrive, onShipMissionBeaconArrive } from './missions.js';
import {
  scaleCraftReqs,
  scaleShipUpgradeCoins,
  getFactionSalvageMult,
  getFactionMineSpeedMult,
  getFactionLoadSpeedMult,
  getFactionCombatHpMult,
  getFactionRepairCostMult,
  getFactionBhFloorBonus,
} from './factions.js';

function shipUpgCost(costFn, ship, stat, chunk) {
  return scaleShipUpgradeCoins(upgradeTotalCost(costFn, ship, stat, chunk));
}

/** Mining bay capacity including Cargo Straps research. */
export function getEffectiveShipCapacity(ship) {
  let cap = Math.max(0, ship?.capacity || 0);
  if (state.researchUnlocks?.cargo_straps && (ship?.mineSpeed || 0) > 0) {
    cap = Math.floor(cap * CARGO_STRAPS_MULT);
  }
  return cap;
}

function getBlackHoleSpeedMult(ship) {
  if (!state.blackHole) return 1;
  const scale = Number.isFinite(state.blackHole.scale) ? state.blackHole.scale : getBlackHoleRadiusScale(state.blackHole);
  if (scale <= 0) return 1;
  const radius = (state.blackHole.radiusWorld || 0) * scale;
  const dx = ship.x - state.blackHole.wx;
  const dy = ship.y - state.blackHole.wy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= radius) return 1;
  const t = dist / radius; // 0 = center, 1 = edge
  let floor = state.researchUnlocks?.hazard_hardening ? HAZARD_HARDENING_BH_FLOOR : 0.1;
  floor = Math.min(0.85, floor + (getFactionBhFloorBonus() || 0));
  // floor at center → ~0.9 at edge
  return floor + (0.9 - floor) * t;
}
import { CRASHED_SHIP_NODE_TYPE } from '../data/nodes.js';

function getStorageModules() {
  return getDepotModules(state.modules).filter(isStorageModule);
}

function getPowerStations() {
  return getDepotModules(state.modules).filter(isPowerStationModule);
}

const craftTimeouts = {};
let baseDownNoticeShown = false;

function resolveShipDepot(ship) {
  if (ship.depotType === 'research_lab') {
    ship.depotType = 'base';
    ship.depotId = null;
  }
  if (ship.depotType === 'storage' && ship.depotId !== null) {
    const storage = getStorageModules().find(s => s.id === ship.depotId);
    if (storage) return { type: 'storage', facility: storage, label: storage.name, operational: isStorageOperational(storage) };
  }
  if (ship.depotType === 'contract_center' && ship.depotId !== null) {
    const center = getDepotModules(state.modules).find((m) => m.id === ship.depotId && isContractCenterModule(m));
    if (center) {
      return {
        type: 'contract_center',
        facility: center,
        label: center.name || 'Contracts Office',
        operational: isStorageOperational(center),
      };
    }
  }
  if (ship.depotType === 'power_station' && ship.depotId !== null) {
    const station = getPowerStations().find(s => s.id === ship.depotId);
    if (station) return { type: 'power_station', facility: station, label: station.name, operational: (station.health || 0) > 0 };
  }
  return { type: 'base', facility: null, label: state.base.name || 'Base Station', operational: (state.base.health || 0) > 0 };
}

function getShipDepotDestination(ship) {
  const depot = resolveShipDepot(ship);
  if ((depot.type === 'storage' || depot.type === 'contract_center') && depot.facility) {
    const pos = gridToWorld(depot.facility.col, depot.facility.row);
    return { x: pos.x, y: pos.y + TILE_H / 2 - 20, depotType: depot.type, depotId: depot.facility.id };
  }
  if (depot.type === 'power_station' && depot.facility) {
    const pos = gridToWorld(depot.facility.col, depot.facility.row);
    return { x: pos.x, y: pos.y + TILE_H / 2 - 20, depotType: 'power_station', depotId: depot.facility.id };
  }
  const bp = BASE_POS();
  return { x: bp.x, y: bp.y + TILE_H / 2 - 20, depotType: 'base', depotId: null };
}

function isTransportShip(ship) {
  return SHIP_DEFS[ship.type]?.role === 'transport';
}

function resolveShipPickup(ship) {
  if (ship.pickupType === 'storage' && ship.pickupId !== null) {
    const storage = getStorageModules().find(s => s.id === ship.pickupId);
    if (storage) return { type: 'storage', facility: storage, label: storage.name, operational: isStorageOperational(storage) };
  }
  if (ship.pickupType === 'power_station' && ship.pickupId !== null) {
    const station = getPowerStations().find(s => s.id === ship.pickupId);
    if (station) return { type: 'power_station', facility: station, label: station.name, operational: (station.health || 0) > 0 };
  }
  return { type: 'base', facility: null, label: state.base.name || 'Base Station', operational: (state.base.health || 0) > 0 };
}

function getShipPickupDestination(ship) {
  const pickup = resolveShipPickup(ship);
  if (pickup.type === 'storage' && pickup.facility) {
    const pos = gridToWorld(pickup.facility.col, pickup.facility.row);
    return { x: pos.x, y: pos.y + TILE_H / 2 - 20, pickupType: 'storage', pickupId: pickup.facility.id };
  }
  if (pickup.type === 'power_station' && pickup.facility) {
    const pos = gridToWorld(pickup.facility.col, pickup.facility.row);
    return { x: pos.x, y: pos.y + TILE_H / 2 - 20, pickupType: 'power_station', pickupId: pickup.facility.id };
  }
  const bp = BASE_POS();
  return { x: bp.x, y: bp.y + TILE_H / 2 - 20, pickupType: 'base', pickupId: null };
}

function getHoldingAnchor(ship) {
  const depot = resolveShipDepot(ship);
  if (depot.type === 'storage' && depot.facility) return { col: depot.facility.col, row: depot.facility.row, size: getModuleFootprintHalf(depot.facility.type) };
  if (depot.type === 'power_station' && depot.facility) return { col: depot.facility.col, row: depot.facility.row, size: 0 };
  return { col: BASE_COL, row: BASE_ROW, size: BASE_FOOTPRINT_RADIUS };
}

function getPickupHoldingAnchor(ship) {
  const pickup = resolveShipPickup(ship);
  if (pickup.type === 'storage' && pickup.facility) return { col: pickup.facility.col, row: pickup.facility.row, size: 1 };
  if (pickup.type === 'power_station' && pickup.facility) return { col: pickup.facility.col, row: pickup.facility.row, size: 0 };
  return { col: BASE_COL, row: BASE_ROW, size: BASE_FOOTPRINT_RADIUS };
}

function getTransportSourceAmount(pickup, resourceType) {
  if (!resourceType) return 0;
  if (pickup.type === 'base') return state.resources[resourceType] || 0;
  if (!pickup.facility) return 0;
  if (pickup.type === 'storage' || pickup.type === 'power_station') {
    return pickup.facility.inventory?.[resourceType] || 0;
  }
  return 0;
}

function hasReachedHoldingDest(ship) {
  if (!Number.isFinite(ship.destX) || !Number.isFinite(ship.destY)) return true;
  return Math.hypot(ship.destX - ship.x, ship.destY - ship.y) <= 6;
}

function getTransportSourceSnapshot(pickup) {
  const snapshot = {};
  for (const resourceType of Object.keys(RESOURCE_DEFS)) {
    const amount = getTransportSourceAmount(pickup, resourceType);
    if (amount > 0) snapshot[resourceType] = amount;
  }
  return snapshot;
}

function buildEvenPickupManifest(pickup, capacity) {
  const snapshot = getTransportSourceSnapshot(pickup);
  let remaining = Math.max(0, Math.floor(capacity));
  const manifest = {};
  let active = Object.entries(snapshot).map(([type, amount]) => ({ type, amount }));

  while (remaining > 0 && active.length) {
    const share = Math.max(1, Math.floor(remaining / active.length));
    const nextActive = [];

    for (const entry of active) {
      const alreadyPicked = manifest[entry.type] || 0;
      const available = Math.max(0, entry.amount - alreadyPicked);
      if (available <= 0) continue;

      const take = Math.min(available, share, remaining);
      if (take > 0) {
        manifest[entry.type] = alreadyPicked + take;
        remaining -= take;
      }

      if ((entry.amount - (manifest[entry.type] || 0)) > 0) nextActive.push(entry);
      if (remaining <= 0) break;
    }

    active = nextActive;
  }

  return manifest;
}

function getCargoManifestTotal(cargoManifest) {
  return Object.values(cargoManifest || {}).reduce((sum, amount) => sum + (amount || 0), 0);
}

function getPrimaryCargoResource(ship) {
  const entries = Object.entries(ship.cargoManifest || {}).filter(([, amount]) => amount > 0);
  if (entries.length !== 1) return null;
  return entries[0][0];
}

function getTransportEndpointKey(type, id) {
  if (type === null || type === undefined || type === '') return '';
  return `${type}:${id ?? ''}`;
}

function hasSameTransportEndpoints(ship) {
  const pickupKey = getTransportEndpointKey(ship.pickupType, ship.pickupId);
  const depotKey = getTransportEndpointKey(ship.depotType, ship.depotId);
  return !!pickupKey && pickupKey === depotKey;
}

function clearTransportCargo(ship) {
  ship.cargo = 0;
  ship.cargoResource = null;
  ship.cargoManifest = null;
  ship.cargoHold = 0;
  ship.cargoHoldResource = null;
  ship.loadBuffer = 0;
  ship.loadingPickup = false;
  ship.unloadingDepot = false;
  ship.unloadDeliveredManifest = null;
  ship.unloadFloatieIndex = 0;
}

/** Move active bay cargo into Resource Hold (Haul Integrity). */
function stashCargoToHold(ship) {
  const amt = Math.floor(ship.cargo || 0);
  const type = ship.cargoResource;
  if (amt <= 0 || !type) {
    ship.cargo = 0;
    ship.cargoResource = null;
    ship.cargoManifest = null;
    return;
  }
  const holdAmt = Math.floor(ship.cargoHold || 0);
  const holdType = ship.cargoHoldResource;
  if (holdAmt > 0 && holdType && holdType !== type) {
    addLog(`⚠ ${ship.name} hold of ${holdAmt} ${RESOURCE_DEFS[holdType]?.label || holdType} overwritten`);
    ship.cargoHold = amt;
    ship.cargoHoldResource = type;
  } else if (holdType === type || !holdAmt) {
    ship.cargoHold = holdAmt + amt;
    ship.cargoHoldResource = type;
  } else {
    ship.cargoHold = amt;
    ship.cargoHoldResource = type;
  }
  addLog(`▣ ${ship.name} stashed ${amt} ${RESOURCE_DEFS[type]?.label || type} in Resource Hold`);
  ship.cargo = 0;
  ship.cargoResource = null;
  ship.cargoManifest = null;
}

/** Queue deposits for main bay + hold (base / storage / contract). */
function queueMiningDeposits(ship) {
  const depotType = ship.depotType || 'base';
  const depotId = ship.depotId ?? null;
  if (ship.cargo > 0 && ship.cargoResource && RESOURCE_DEFS[ship.cargoResource]) {
    tickEvents.push({
      type: 'deposit',
      name: ship.name,
      cargoResource: ship.cargoResource,
      amount: ship.cargo,
      depotType,
      depotId,
    });
  }
  if ((ship.cargoHold || 0) > 0 && ship.cargoHoldResource && RESOURCE_DEFS[ship.cargoHoldResource]) {
    tickEvents.push({
      type: 'deposit',
      name: ship.name,
      cargoResource: ship.cargoHoldResource,
      amount: ship.cargoHold,
      depotType,
      depotId,
    });
  }
  ship.cargo = 0;
  ship.cargoResource = null;
  ship.cargoManifest = null;
  ship.cargoHold = 0;
  ship.cargoHoldResource = null;
}

function stopTransportShip(ship) {
  clearTransportCargo(ship);
  ship.status = 'idle';
}

function patchSelectedModuleModalIfOpen(moduleId) {
  if (!moduleId || state.selectedModule !== moduleId || !window.patchStorageModal) return;
  const overlay = document.getElementById('storage-modal-overlay');
  if (overlay?.style.display === 'flex') window.patchStorageModal();
}

function setTransportCargoDestination(ship, mode) {
  if (mode === 'pickup') {
    const pickupDest = getShipPickupDestination(ship);
    ship.loadingPickup = false;
    ship.unloadingDepot = false;
    ship.destX = pickupDest.x;
    ship.destY = pickupDest.y;
    ship.status = 'flying';
    ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
    return;
  }
  if (mode === 'depot') {
    const depotDest = getShipDepotDestination(ship);
    ship.loadingPickup = false;
    ship.unloadingDepot = false;
    ship.unloadDeliveredManifest = null;
    ship.unloadFloatieIndex = 0;
    ship.destX = depotDest.x;
    ship.destY = depotDest.y;
    ship.status = 'returning';
    ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
  }
}

function transportHasPickupTarget(ship) {
  return ship.pickupType === 'base' || ship.pickupType === 'storage' || ship.pickupType === 'power_station';
}

function withdrawPickupManifest(pickup, manifest) {
  for (const [resourceType, amount] of Object.entries(manifest || {})) {
    const qty = Math.max(0, Math.floor(amount));
    if (qty <= 0) continue;

    if (pickup.type === 'base') {
      state.resources[resourceType] = Math.max(0, (state.resources[resourceType] || 0) - qty);
      continue;
    }

    if (pickup.facility && (pickup.type === 'storage' || pickup.type === 'power_station')) {
      const inv = pickup.facility.inventory || (pickup.facility.inventory = {});
      inv[resourceType] = Math.max(0, (inv[resourceType] || 0) - qty);
    }
  }

  if (pickup.facility?.id) patchSelectedModuleModalIfOpen(pickup.facility.id);
}

function getDepotFreeCapacity(ship, depot, resourceType) {
  if (depot.type === 'base') return Number.MAX_SAFE_INTEGER;
  if (!depot.facility) return 0;
  if (depot.type === 'storage') return depot.facility && isStorageOperational(depot.facility) ? getModuleFreeCapacity(depot.facility) : 0;
  if (depot.type === 'contract_center') {
    return depot.facility && isStorageOperational(depot.facility) ? Number.MAX_SAFE_INTEGER : 0;
  }
  if (depot.type === 'power_station' && resourceType) {
    return depot.facility.health > 0 ? getPowerStationResourceFreeCapacity(depot.facility, resourceType) : 0;
  }
  return 0;
}

function canReturnCargo(ship, depot, resourceType, cargoAmount = ship.cargo) {
  // Allow partial unload: only need some free capacity for cargo on board.
  const cargoManifest = ship.cargoManifest || null;
  if (cargoManifest && Object.keys(cargoManifest).length) {
    if (depot.type === 'base') return true;
    if (!depot.facility) return false;
    if (depot.type === 'storage' || depot.type === 'contract_center') return getDepotFreeCapacity(ship, depot, resourceType) > 0;
    if (depot.type === 'power_station') {
      return Object.entries(cargoManifest).some(([type, amount]) => (
        amount > 0 && getPowerStationResourceFreeCapacity(depot.facility, type) > 0
      ));
    }
    return false;
  }
  if (cargoAmount <= 0) return true;
  const free = getDepotFreeCapacity(ship, depot, resourceType);
  if (!Number.isFinite(free)) return false;
  return free > 0;
}

function setTransportHoldingAnchor(ship) {
  if (ship.cargo > 0) {
    setNextHoldingDestination(ship);
  } else {
    setNextHoldingDestination(ship, getPickupHoldingAnchor(ship));
  }
}

function startTransportToPickup(ship) {
  if (hasSameTransportEndpoints(ship)) {
    ship.status = 'idle';
    return;
  }
  if (!transportHasPickupTarget(ship)) {
    ship.status = 'idle';
    return;
  }
  const pickup = resolveShipPickup(ship);
  if (!pickup.operational) {
    setTransportHoldingAnchor(ship);
    ship.status = 'holding';
    return;
  }

  setTransportCargoDestination(ship, 'pickup');
}

function startTransportToDepot(ship) {
  if (hasSameTransportEndpoints(ship)) {
    ship.status = 'idle';
    return;
  }
  const depot = resolveShipDepot(ship);
  if (!canReturnCargo(ship, depot, ship.cargoResource)) {
    setTransportHoldingAnchor(ship);
    ship.status = 'holding';
    return;
  }
  setTransportCargoDestination(ship, 'depot');
}

/** Scout starter hull costs — used to pace the iron↔copper diversify tutorial. */
const SCOUT_REQS = { iron: 75, copper: 50 };

function checkDiversifyTutorial() {
  if (state.firstCraftable || state.seenMsgs['diversify_done']) {
    state.redirectTutActive = false;
    return;
  }
  const iron = state.resources.iron || 0;
  const copper = state.resources.copper || 0;
  const hasIron = iron >= SCOUT_REQS.iron;
  const hasCopper = copper >= SCOUT_REQS.copper;
  // Ready to craft — hand off to craft tutorial
  if (hasIron && hasCopper) {
    state.redirectTutActive = false;
    state.redirectTargetType = null;
    return;
  }
  // Enough of one scout material, still need the other
  if (hasIron && !hasCopper) {
    state.redirectTutActive = true;
    state.redirectTargetType = 'copper';
  } else if (hasCopper && !hasIron) {
    state.redirectTutActive = true;
    state.redirectTargetType = 'iron';
  }
}

function applyDepositMilestones(ev) {
  if (state.tutStep === 3) { state.tutStep=4; state.seenMsgs['tut_mining_done']=true; document.querySelectorAll('.tut-pointer').forEach(el=>el.remove()); }
  import('../ui/tutorial.js').then(({ checkTradeTutorial }) => checkTradeTutorial());
  if (!state.firstDeposit && ev.depotType !== 'storage' && ev.depotType !== 'power_station') {
    state.firstDeposit = true;
    setTimeout(() => showOnce('first_deposit', NPCS.byte.transmissionLines.first_deposit, 15, 'byte'), 800);
  }
  // Base stockpile deposits drive collect quests; always re-check + refresh HUD
  if (ev.depotType !== 'storage' && ev.depotType !== 'power_station') {
    evaluateCollectObjectives();
  } else {
    // Storage/power still may show other live quest progress
    window.patchQuestsPanel?.();
  }
}

function applyDepositEvent(ev, { logDelivery = true, showFloatieFx = true, countTrip = true, checkMilestones = true } = {}) {
  // Special map nodes (crashed ships, etc.) are never cargo
  if (!isStorableResource(ev.cargoResource)) {
    return { deposited: 0, depotLabel: state.base.name || 'Base Station', depositBlocked: true };
  }
  let deposited = ev.amount;
  let depotLabel = state.base.name || 'Base Station';
  let depositBlocked = false;
  let floatiePos = null;
  if ((ev.depotType === 'storage' || ev.depotType === 'contract_center') && ev.depotId !== null) {
    const storage = getDepotModules(state.modules).find(s => s.id === ev.depotId);
    if (storage && isContractCenterModule(storage)) {
      // Contract intake — does not stockpile; tallies toward active contracts
      deposited = applyContractDelivery(ev.cargoResource, ev.amount);
      depotLabel = storage.name || 'Contracts Office';
      depositBlocked = deposited < ev.amount;
      const w = gridToWorld(storage.col, storage.row);
      floatiePos = { x: w.x, y: w.y - 12 };
    } else if (storage) {
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
      const free = getPowerStationResourceFreeCapacity(station, ev.cargoResource);
      deposited = free >= ev.amount ? ev.amount : 0;
      if (deposited > 0) {
        station.inventory[ev.cargoResource] = (station.inventory[ev.cargoResource] || 0) + deposited;
        recordModuleImport(station, ev.cargoResource, deposited);
        window.refreshFuelPickerIfOpen?.(station.id);
      }
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
  if (!state.solStarted) {
    state.solStarted = true;
    import('./statsHistory.js').then((m) => m.recordSolSnapshot?.()).catch(() => {});
  }
  if (countTrip) state.trips++;
  if (deposited > 0 && ev.cargoResource) {
    import('./lifetime.js').then((m) => m.recordLifetimeResource?.(ev.cargoResource, deposited)).catch(() => {});
  }
  if (logDelivery) addLog(`📦 ${ev.name} delivered ${deposited} ${RESOURCE_DEFS[ev.cargoResource].label} to ${depotLabel}${depositBlocked ? ' (depot full)' : ''}`);
  if (showFloatieFx && deposited > 0) spawnFloatie(ev.cargoResource, deposited, floatiePos);
  if ((ev.depotType === 'storage' || ev.depotType === 'power_station') && state.selectedModule === ev.depotId && window.patchStorageModal) {
    const overlay = document.getElementById('storage-modal-overlay');
    if (overlay?.style.display === 'flex') window.patchStorageModal();
  }
  if (checkMilestones) applyDepositMilestones(ev);
  else if (deposited > 0 && ev.depotType !== 'storage' && ev.depotType !== 'power_station') {
    // Progress bars still need a live refresh when milestones are skipped
    evaluateCollectObjectives();
  }
  if (refresh.resources) refresh.resources();
  return { deposited, depotLabel, depositBlocked };
}

function unloadTransportCargo(ship, depot, maxAmount) {
  let remaining = Math.max(0, Math.floor(maxAmount));
  let moved = 0;
  const floatiePos = getDepotFloatiePos(depot);
  const entries = ship.cargoManifest && Object.keys(ship.cargoManifest).length
    ? Object.entries(ship.cargoManifest).filter(([, amount]) => amount > 0)
    : ship.cargoResource ? [[ship.cargoResource, ship.cargo]] : [];

  for (const [resourceType, amount] of entries) {
    if (remaining <= 0) break;
    const free = getDepotFreeCapacity(ship, depot, resourceType);
    const unloadAmount = Math.min(amount, remaining, Number.isFinite(free) ? free : remaining);
    if (unloadAmount <= 0) continue;
    applyDepositEvent({
      type: 'deposit',
      name: ship.name,
      cargoResource: resourceType,
      amount: unloadAmount,
      depotType: ship.depotType || 'base',
      depotId: ship.depotId ?? null,
    }, { logDelivery: false, showFloatieFx: false, countTrip: false, checkMilestones: false });
    moved += unloadAmount;
    remaining -= unloadAmount;
    if (!ship.unloadDeliveredManifest) ship.unloadDeliveredManifest = {};
    ship.unloadDeliveredManifest[resourceType] = (ship.unloadDeliveredManifest[resourceType] || 0) + unloadAmount;
    ship.cargo = Math.max(0, ship.cargo - unloadAmount);
    if (ship.cargoManifest && ship.cargoManifest[resourceType] !== undefined) {
      ship.cargoManifest[resourceType] = Math.max(0, ship.cargoManifest[resourceType] - unloadAmount);
      if (ship.cargoManifest[resourceType] <= 0) {
        delete ship.cargoManifest[resourceType];
        ship.unloadFloatieIndex = (ship.unloadFloatieIndex || 0) + 1;
        const floatieDelay = 300 * ship.unloadFloatieIndex;
        const deliveredAmount = ship.unloadDeliveredManifest[resourceType] || 0;
        if (deliveredAmount > 0) {
          setTimeout(() => spawnFloatie(resourceType, deliveredAmount, floatiePos), floatieDelay);
        }
      }
    }
  }

  if (ship.cargoManifest && getCargoManifestTotal(ship.cargoManifest) <= 0) ship.cargoManifest = null;
  ship.cargoResource = ship.cargo > 0 ? getPrimaryCargoResource(ship) : null;
  return moved;
}

function getDepotFloatiePos(depot) {
  if (depot.type === 'storage' && depot.facility) {
    const w = gridToWorld(depot.facility.col, depot.facility.row);
    return { x: w.x, y: w.y - 12 };
  }
  if (depot.type === 'power_station' && depot.facility) {
    const w = gridToWorld(depot.facility.col, depot.facility.row);
    return { x: w.x, y: w.y - 12 };
  }
  return null;
}

function isHoldingTileBlocked(col, row) {
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return true;
  if (isBaseFootprintCell(col, row)) return true;
  if (state.nodes.some(n => n.gr[0] === col && n.gr[1] === row && n.minLevel <= state.base.level)) return true;
  if (state.turrets.some(t => t.col === col && t.row === row)) return true;
  if (state.modules.some(module => module && Math.abs((module.col ?? 0) - col) <= getModuleFootprintHalf(module.type) && Math.abs((module.row ?? 0) - row) <= getModuleFootprintHalf(module.type))) return true;
  return false;
}

function setNextHoldingDestination(ship, anchorOverride, force = false) {
  if (!force && ship.status === 'holding' && !hasReachedHoldingDest(ship) && Number.isFinite(ship.destX) && Number.isFinite(ship.destY)) {
    return;
  }

  const anchor = anchorOverride || getHoldingAnchor(ship);
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

window.completeCraftShipJob = function(job) {
  const recipeId = job?.recipeId;
  if (!recipeId) return;
  spawnShip(recipeId);
  bumpPirateStatusOnExpand();
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  // Re-enable BUILD immediately once the queue slot frees
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') {
    window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true });
  }
};

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
    mineBonus:    mineBonusFromLevel(isUnique ? 10 : 0),
    loadSpeed:    stats.loadSpeed ?? 0,
    hp:           stats.role === 'garrison' || stats.role === 'combat'
      ? (isUnique ? stats.hp : hpFromLevel(type, 0))
      : (stats.hp ?? 0),
    currentHp:    0, // set below
    attack:       stats.role === 'garrison' || stats.role === 'combat'
      ? (isUnique ? (stats.attack || 0) : attackFromLevel(type, 0))
      : (stats.attack ?? 0),
    attackSpeed:  stats.role === 'garrison' || stats.role === 'combat'
      ? (isUnique ? (stats.attackSpeed || 0) : atkRateFromLevel(type, 0))
      : (stats.attackSpeed ?? 0),
    range:        stats.role === 'garrison'
      ? (isUnique ? (stats.range || 0) : rangeFromLevel(type, 0))
      : (stats.range ?? 0),
    mineTier:     stats.mineTier,
    // Upgrade levels — all 0 for normal ships, 100 for unique (already at max)
    capacityLevel:  isUnique ? 100 : 0,
    flySpeedLevel:  isUnique ? 100 : 0,
    mineSpeedLevel: isUnique ? 100 : 0,
    mineBonusLevel: isUnique ? 10 : 0,
    loadSpeedLevel: isUnique ? 100 : 0,
    hpLevel:        isUnique ? 100 : 0,
    attackLevel:    isUnique ? 100 : 0,
    atkRateLevel:   isUnique ? 100 : 0,
    rangeLevel:     isUnique ? 100 : 0,
    attachments:    (stats.role === 'combat' || stats.role === 'garrison') ? ['pulse_laser'] : [],
    attachmentCds:  {},
    depotType: 'base', depotId: null,
    pickupType: null, pickupId: null,
    autoAssign: false,
    shield: null,
    maxShield: null,
    cargo:0, cargoResource:null,
    cargoHold: 0,
    cargoHoldResource: null,
    cargoManifest: null,
    loadBuffer: 0,
    loadingPickup: false,
    unloadingDepot: false,
    status:'idle', targetNode:null,
    heading: Math.random() * Math.PI * 2,
    turnRadiusRandomness: (Math.random() - 0.5) * 2, // -1..1, gives each ship a unique arc width
    x:base.x, y:base.y, destX:base.x, destY:base.y, mineTimer:0,
  };
  if (stats.role === 'combat' || stats.role === 'garrison') {
    normalizeShipAttachments(ship, stats.role);
  }
  // Base HP from profile; health_boost multiplies effective max in combat
  ship.currentHp = ship.hp || 0;
  state.ships.push(ship);
  updateHeaderShips();
  addLog(`⚡ ${ship.name} is ready for deployment.`);

  notifyShipCrafted(type);
  if (state.tutStep === 8 && state.ships.length >= 2) {
    state.tutStep = 9;
    document.querySelectorAll('.tut-pointer').forEach((el) => el.remove());
    try { window.closeHdrPanelType?.('craft'); } catch (_) { /* ignore */ }
    if (refresh.ui) refresh.ui();
  }
}

// ── Assign ──
export function assignShip(ship, node) {
  if ((ship.mineSpeed || 0) <= 0) { addLog(`⚠ ${ship.name} has no mining equipment.`); return; }
  if (ship.targetNode === node.id) { state.selectedShip = null; state.pendingAssign = null; state.followShip = null; document.getElementById('main-canvas').style.cursor = ''; if (refresh.ui) refresh.ui(); return; }
  if (node.minLevel > state.base.level) return;
  const isSpecialNode = node.type === CRASHED_SHIP_NODE_TYPE;
  const alreadyAssigned = state.ships.some(s => s.id !== ship.id && s.targetNode === node.id);
  if (alreadyAssigned) {
    addLog(`⚠ ${RESOURCE_DEFS[node.type].label} node already occupied — expand range for more nodes`);
    return;
  }
  const accessible = [];
  for (let t = 1; t <= ship.mineTier; t++) accessible.push(...MINE_TIERS[t].resources);
  if (!isSpecialNode && !accessible.includes(node.type)) return;
  if (ship.cargo > 0) {
    if (state.researchUnlocks?.haul_integrity && !isTransportShip(ship)) {
      // 100% of bay → Resource Hold; bay clears for the new node
      stashCargoToHold(ship);
    } else {
      addLog(`⚠ ${ship.name} dropped ${ship.cargo} cargo to change course`);
      ship.cargo = 0;
      ship.cargoResource = null;
      ship.cargoManifest = null;
    }
  } else if (isTransportShip(ship)) {
    clearTransportCargo(ship);
  }
  if (state.tutStep < 2) state.tutStep = 2;
  // Diversify tutorial complete once they lock onto the needed ore type
  if (state.redirectTutActive && state.redirectTargetType && node.type === state.redirectTargetType) {
    state.redirectTutActive = false;
    state.seenMsgs['diversify_done'] = true;
    state.redirectTargetType = null;
  } else if (state.redirectTutActive && state.redirectTargetType && node.type !== state.redirectTargetType) {
    // Keep guiding until they pick the right ore
  } else {
    state.redirectTutActive = false;
  }

  if (state.tutStep === 9 && state.ships.length >= 2 && !state.seenMsgs['first_craft_assigned']) {
    state.seenMsgs['first_craft_assigned'] = true;
    document.querySelectorAll('.tut-pointer').forEach((el) => el.remove());
  }

  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  removeReassignTooltip();
  ship.targetNode = node.id;
  evaluateAssignObjectives();
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
  // Combat system owns movement for engaging / repairing combat ships
  if (ship.status === 'engaging' || ship.status === 'intercepting' || ship.status === 'returning_repair' || ship.status === 'destroyed' || ship.isHqSupport) {
    return;
  }
  if (state.base.health > 0) baseDownNoticeShown = false;
  const baseDown = state.base.health <= 0;
  if (baseDown && !baseDownNoticeShown) {
    baseDownNoticeShown = true;
    showTransmissionMessage(NPCS.juno.transmissionLines.base_down_no_deposit, 12, 'juno');
  }

  if (ship.status === 'holding' && !baseDown) {
    if (isTransportShip(ship)) {
      if (ship.cargo > 0) {
        startTransportToDepot(ship);
      } else {
        startTransportToPickup(ship);
      }
    } else {
      const depot = resolveShipDepot(ship);
      const canLeaveHolding = depot.operational
        && !(depot.type === 'storage' && depot.facility && getModuleFreeCapacity(depot.facility) <= 0)
        && !(depot.type === 'power_station' && depot.facility && ship.cargo > 0 && !canReturnCargo(ship, depot, ship.cargoResource));
      if (canLeaveHolding) {
        const depotDest = getShipDepotDestination(ship);
        ship.destX = depotDest.x;
        ship.destY = depotDest.y;
        ship.status = 'returning';
      }
    }
  }

  if (isTransportShip(ship) && ship.status === 'idle' && !baseDown) {
    if (ship.cargo > 0) {
      startTransportToDepot(ship);
    } else {
      startTransportToPickup(ship);
    }
  }

  // Mission retrieve: keep destination locked to job phase
  if (ship.missionJob?.type === 'retrieve_beacon' && !baseDown) {
    const job = ship.missionJob;
    if (job.phase === 'to_beacon' && state.missionBeacon) {
      const w = gridToWorld(state.missionBeacon.col, state.missionBeacon.row);
      ship.destX = w.x;
      ship.destY = w.y;
      ship.targetNode = null;
      if (ship.status !== 'flying') {
        ship.status = 'flying';
        ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
      }
    } else if (job.phase === 'to_base' || job.phase === 'to_base_deliver') {
      const depotDest = getShipDepotDestination(ship);
      ship.destX = depotDest.x;
      ship.destY = depotDest.y;
      if (ship.status !== 'returning' && ship.status !== 'flying') {
        ship.status = 'returning';
        ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
      }
    }
  }

  let FLY_SPEED = ship.status === 'holding' ? 100 : 80 * flySpeedToMultiplier(ship.flySpeed);
  if (ship.status === 'flying' || ship.status === 'returning' || ship.status === 'holding') {
    FLY_SPEED *= getBlackHoleSpeedMult(ship);
  }

  if (ship.status==='flying'||ship.status==='returning'||ship.status==='holding') {
    // Trail length is data-driven per ship type.
    const shipDef = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;
    const renderCfg = shipDef.render || SHIP_DEFS.scout.render;
    if (!ship.trail) ship.trail = [];
    ship.trail.push({ x: ship.x, y: ship.y });
    const trailLimit = renderCfg?.trailLength || 80;
    if (ship.trail.length > trailLimit) ship.trail.shift();

    const dx = ship.destX-ship.x, dy = ship.destY-ship.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    const arrivalRadius = renderCfg?.arrivalRadius ?? 6;

    if (dist < arrivalRadius) {
      if (ship.status==='flying') {
        ship.x = ship.destX; ship.y = ship.destY;
        if (ship.missionJob?.type === 'retrieve_beacon' && ship.missionJob.phase === 'to_beacon') {
          onShipMissionBeaconArrive(ship);
          return;
        }
        if (isTransportShip(ship)) {
          const pickup = resolveShipPickup(ship);
          if (!pickup.operational) {
            clearTransportCargo(ship);
          ship.status = 'holding';
          setTransportHoldingAnchor(ship);
          return;
        }

        if (!ship.cargoManifest) {
          ship.cargoManifest = buildEvenPickupManifest(pickup, ship.capacity);
          if (getCargoManifestTotal(ship.cargoManifest) <= 0) {
            clearTransportCargo(ship);
            ship.status = 'holding';
            setTransportHoldingAnchor(ship, getPickupHoldingAnchor(ship));
            return;
          }
          ship.cargoResource = getPrimaryCargoResource(ship);
        }

        const manifestTotal = getCargoManifestTotal(ship.cargoManifest);
        if (manifestTotal <= 0) {
          clearTransportCargo(ship);
          ship.status = 'holding';
          setTransportHoldingAnchor(ship, getPickupHoldingAnchor(ship));
          return;
        }

        if (manifestTotal > 0 && ship.cargo >= manifestTotal) {
          withdrawPickupManifest(pickup, ship.cargoManifest);
          ship.loadingPickup = false;
          ship.cargo = manifestTotal;
          ship.loadBuffer = 0;
          startTransportToDepot(ship);
          return;
        }

        ship.loadingPickup = true;
        ship.loadBuffer += (ship.loadSpeed || 0) * getFactionLoadSpeedMult() * dt;
        const room = Math.max(0, manifestTotal - ship.cargo);
        const loadAmount = Math.min(room, Math.floor(ship.loadBuffer));
        if (loadAmount > 0) {
          ship.loadBuffer -= loadAmount;
          ship.cargo += loadAmount;
        }

        return;
      }
        if (state.nodes.find(n => n.id === ship.targetNode)?.type === CRASHED_SHIP_NODE_TYPE) {
          ship.status = 'idle';
          ship.mineTimer = 0;
          return;
        }
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
        if (depot.type === 'power_station' && depot.facility && !canReturnCargo(ship, depot, ship.cargoResource)) {
          ship.status = 'holding';
          setNextHoldingDestination(ship);
          return;
        }
        ship.x = ship.destX; ship.y = ship.destY;

        if (isTransportShip(ship)) {
          if (ship.cargo > 0) {
            ship.unloadingDepot = true;
            ship.loadBuffer += (ship.loadSpeed || 0) * getFactionLoadSpeedMult() * dt;
            const unloadAmount = Math.min(ship.cargo, Math.floor(ship.loadBuffer));
            if (unloadAmount > 0) {
              const moved = unloadTransportCargo(ship, depot, unloadAmount);
              ship.loadBuffer = Math.max(0, ship.loadBuffer - moved);
              if (moved <= 0) {
                ship.unloadingDepot = false;
                ship.status = 'holding';
                setTransportHoldingAnchor(ship);
                return;
              }
            }
            if (ship.cargo > 0) return;
          }

          const depotLabel = depot.label;
          clearTransportCargo(ship);
          state.trips++;
          addLog(`📦 ${ship.name} finished unloading at ${depotLabel}`);
          applyDepositMilestones({ depotType: ship.depotType || 'base' });

          if (ship.pickupType === null || ship.pickupType === undefined || ship.pickupType === '') {
            ship.status='idle';
            tickEvents.push({ type:'idle', ship });
          } else {
            startTransportToPickup(ship);
            if (ship.status === 'holding') {
              return;
            }
          }

          return;
        }
        
        queueMiningDeposits(ship);

        if (ship.missionJob?.type === 'retrieve_beacon') {
          onShipMissionBaseArrive(ship);
          // Continue mission leg (to_beacon or finished)
          if (ship.missionJob?.phase === 'to_beacon') {
            ship.status = 'flying';
            return;
          }
          // Mission done — may have resumed prior node (status already flying)
          if (!ship.missionJob && !ship.missionCargo) {
            if (ship.targetNode != null && ship.status === 'flying') {
              return;
            }
            if (ship.targetNode != null) {
              const node = state.nodes.find(n => n.id === ship.targetNode);
              if (node) { ship.status = 'pausing'; ship.pauseTimer = 0.4; }
              else { ship.targetNode = null; ship.status = 'idle'; tickEvents.push({ type: 'idle', ship }); }
              return;
            }
            ship.status = 'idle';
            tickEvents.push({ type: 'idle', ship });
            return;
          }
        }

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
      const turnRateFar = renderCfg?.turnRateFar ?? 3;
      const turnRateNear = renderCfg?.turnRateNear ?? 10;
      const directBlendDistance = renderCfg?.directBlendDistance ?? 60;
      const turnT = Math.max(0, Math.min(1, 1 - dist / 500));
      const turnVariance = Number.isFinite(ship.turnRadiusRandomness) ? ship.turnRadiusRandomness : 0;
      const farVariance = dist > 300 ? turnVariance * 1.2 : 0;
      const TURN_RATE = Math.max(0.5, turnRateFar + ((turnRateNear - turnRateFar) * turnT) + farVariance);
      const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
      let da = targetAngle - ship.heading;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const absDaBeforeTurn = Math.abs(da);
      ship.heading += Math.sign(da) * Math.min(Math.abs(da), TURN_RATE * dt);

      const moveAngle = ship.heading - Math.PI / 2;
      const step = Math.min(FLY_SPEED * dt, dist);
      const directBlend = Math.max(0, Math.min(1, 1 - dist / directBlendDistance));
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
    const node = state.nodes.find(n => n.id === ship.targetNode);
    if (!node) { ship.targetNode=null; ship.status='idle'; tickEvents.push({ type:'idle', ship }); return; }
    if (node.type === CRASHED_SHIP_NODE_TYPE) {
      ship.status = 'idle';
      return;
    }
    let mineSpd = (ship.mineSpeed || 0.01) * getFactionMineSpeedMult();
    const nodeTier = getResourceTier(node.type) || node.minLevel || 1;
    if (hasMineBoost(state, nodeTier)) mineSpd *= MINE_BOOST_MULT;
    const MINE_INTERVAL = 1.0 / Math.max(0.01, mineSpd);
    if (ship.mineTimer >= MINE_INTERVAL) {
      const cap = getEffectiveShipCapacity(ship);
      const free = Math.max(0, cap - ship.cargo);
      if (free <= 0) {
        ship.mineTimer = 0;
        ship.status = 'returning';
        const depotDest = getShipDepotDestination(ship);
        ship.destX = depotDest.x; ship.destY = depotDest.y;
        ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
      } else {
        const bonusChance = Number.isFinite(ship.mineBonus)
          ? ship.mineBonus
          : mineBonusFromLevel(ship.mineBonusLevel || 0);
        const rolled = Math.random() < bonusChance ? 2 : 1;
        const gained = Math.min(free, rolled);
        ship.cargo += gained;
        ship.cargoResource = node.type;
        ship.mineTimer = 0;
        if (ship.cargo >= cap) {
          ship.status = 'returning';
          const depotDest = getShipDepotDestination(ship);
          ship.destX = depotDest.x; ship.destY = depotDest.y;
          ship.flightTotalDist = Math.hypot(ship.destX - ship.x, ship.destY - ship.y);
        }
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
  if (isTransportShip(ship) && ship.loadingPickup) clearTransportCargo(ship);
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
  if (window.openSellOverlay) {
    window.openSellOverlay(shipId, sellVal);
    return;
  }
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

// ── Salvage Ship ──
window.salvageShip = function(shipId) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (state.ships.length <= 1) { addLog('⚠ Cannot salvage your last ship!'); return; }
  const salvageMult = getFactionSalvageMult();
  const salvage = getShipSalvageRewards(ship).map(({ type, amount }) => ({
    type,
    amount: Math.max(1, Math.floor(amount * salvageMult)),
  }));
  for (const { type, amount } of salvage) {
    state.resources[type] = (state.resources[type] || 0) + amount;
  }
  state.ships = state.ships.filter(s => s.id !== shipId);
  updateHeaderShips();
  if (state.selectedShip === shipId) { state.selectedShip=null; state.pendingAssign=null; state.followShip=null; document.getElementById('main-canvas').style.cursor=''; removeReassignTooltip(); }
  addLog(`♻ Salvaged ${ship.name} — recovered ${salvage.map(({ type, amount }) => `${fmt(amount)} ${RESOURCE_DEFS[type]?.label || type}`).join(' + ')}`);
  if (refresh.ui) refresh.ui();
  window.patchStockpileCards?.();
};

// ── Craft ──
window.craftShip = function(recipeId) {
  const recipe = CRAFT_RECIPES.find(r => r.id === recipeId); if (!recipe) return;
  for (const [r,n] of Object.entries(recipe.reqs)) if ((state.resources[r]||0) < n) return;
  for (const [r,n] of Object.entries(recipe.reqs)) state.resources[r] -= n;
  // Instant craft path — stay on step 8 until spawnShip advances to assign
  if (state.tutStep === 8) {
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
    ? `<tr><td style="color:#4a7aaa;padding:2px 0;">⟳ Load Speed</td><td style="color:#cde;font-weight:bold;">${formatLoadSpeed(shipStats.loadSpeed || 0)}</td></tr>`
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
  if (isShipCraftLocked(recipeId)) {
    addLog('⚠ Complete the Tutorial quest before crafting other hulls.');
    return;
  }
  const maxShips = BASE_MAX_SHIPS[(state.base.level-1)] || 20;
  const activeShipCrafts = countCraftJobs('ship');
  if ((state.ships.length + activeShipCrafts) >= maxShips) {
    addLog('⚠ Ship capacity full! Upgrade the Base.');
    return;
  }
  if (!canEnqueueCraft()) {
    addLog(`⚠ Craft queue full (${getCraftQueueCap()} slots). Upgrade the Base for more.`);
    return;
  }
  const craftReqs = scaleCraftReqs(recipe.reqs);
  for (const [r, n] of Object.entries(craftReqs)) if ((state.resources[r] || 0) < n) return;
  for (const [r, n] of Object.entries(craftReqs)) state.resources[r] -= n;

  const durationMs = getShipCraftTimeMs(recipeId);
  const job = enqueueCraftJob({
    kind: 'ship',
    recipeId,
    name: recipe.name,
    durationMs,
  });
  if (!job) {
    // Refund if enqueue failed
    for (const [r, n] of Object.entries(craftReqs)) state.resources[r] = (state.resources[r] || 0) + n;
    return;
  }
  // BUILD pressed — clear craft-build tutorial pointer (wait for ship spawn → step 9)
  if (state.tutStep === 8 || recipeId === 'scout') {
    state.seenMsgs['tut_build_pressed'] = true;
    document.querySelectorAll('.tut-pointer').forEach((el) => el.remove());
  }
  addLog(`🛠 Queued: ${recipe.name} (${Math.ceil(durationMs / 1000)}s) · ${getCraftQueueCap()} slots`);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') {
    window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true });
  }
};

window.syncShipCraftTimers = function() {
  // Legacy no-op — craft queue handles sync via syncCraftQueue()
};

// ── Upgrade Ship Stats ──
window.upgradeShip = function(shipId, stat, chunk = 1) {
  const ship = state.ships.find(s => s.id === shipId); if (!ship) return;
  if (SHIP_DEFS[ship.type]?.unique) return; // unique ships are already maxed
  const cap = TIER_UPGRADE_CAP[ship.mineTier] || 10;

  if (stat === 'capacity') {
    const allowed = Math.min(chunk, cap - ship.capacityLevel); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_CAP_COST, ship, 'capacity', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.capacityLevel += allowed;
    ship.capacity = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity);
    addLog(`⬆ ${ship.name} cargo Lv${ship.capacityLevel} → ${ship.capacity}${ship.capacityLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'flySpeed') {
    const role = SHIP_DEFS[ship.type]?.role;
    if (role === 'combat' || role === 'garrison') return;
    const allowed = Math.min(chunk, cap - ship.flySpeedLevel); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_FLY_COST, ship, 'flySpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.flySpeedLevel += allowed;
    ship.flySpeed = flySpeedFromLevel(ship.type, ship.flySpeedLevel);
    addLog(`⬆ ${ship.name} fly Lv${ship.flySpeedLevel} → ${formatFlySpeed(ship.flySpeed)}${ship.flySpeedLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'mineSpeed') {
    if ((ship.mineSpeed || 0) <= 0) return;
    const allowed = Math.min(chunk, cap - ship.mineSpeedLevel); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_MINE_COST, ship, 'mineSpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.mineSpeedLevel += allowed;
    ship.mineSpeed = mineSpeedFromLevel(ship.type, ship.mineSpeedLevel);
    addLog(`⬆ ${ship.name} mine Lv${ship.mineSpeedLevel} → ${formatMineSpeedPercent(ship.mineSpeed)}${ship.mineSpeedLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'mineBonus') {
    if ((ship.mineSpeed || 0) <= 0) return;
    const bonusCap = mineBonusUpgradeCap(ship.mineTier);
    const allowed = Math.min(chunk, bonusCap - (ship.mineBonusLevel || 0)); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_MINE_BONUS_COST, ship, 'mineBonus', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.mineBonusLevel = (ship.mineBonusLevel || 0) + allowed;
    ship.mineBonus = mineBonusFromLevel(ship.mineBonusLevel);
    addLog(`⬆ ${ship.name} mine bonus Lv${ship.mineBonusLevel} → ${formatMineBonusPercent(ship.mineBonus)}${ship.mineBonusLevel>=bonusCap?' (MAX)':''}`);

  } else if (stat === 'loadSpeed') {
    const allowed = Math.min(chunk, cap - (ship.loadSpeedLevel||0)); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_LOAD_COST, ship, 'loadSpeed', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.loadSpeedLevel = (ship.loadSpeedLevel || 0) + allowed;
    ship.loadSpeed = loadSpeedFromLevel(ship.type, ship.loadSpeedLevel);
    addLog(`⬆ ${ship.name} load Lv${ship.loadSpeedLevel} → ${formatLoadSpeed(ship.loadSpeed)}${ship.loadSpeedLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'hp') {
    const allowed = Math.min(chunk, cap - (ship.hpLevel||0)); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_HP_COST, ship, 'hp', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.hpLevel = (ship.hpLevel || 0) + allowed;
    ship.hp = hpFromLevel(ship.type, ship.hpLevel);
    if (!Number.isFinite(ship.currentHp) || ship.currentHp > ship.hp) ship.currentHp = ship.hp;
    else if ((ship.currentHp || 0) <= 0) ship.currentHp = ship.hp;
    addLog(`⬆ ${ship.name} HP Lv${ship.hpLevel} → ${ship.hp.toLocaleString()}${ship.hpLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'attack') {
    const allowed = Math.min(chunk, cap - (ship.attackLevel||0)); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_ATTACK_COST, ship, 'attack', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.attackLevel = (ship.attackLevel || 0) + allowed;
    ship.attack = attackFromLevel(ship.type, ship.attackLevel);
    addLog(`⬆ ${ship.name} ATK Lv${ship.attackLevel} → ${ship.attack}${ship.attackLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'atkRate') {
    const allowed = Math.min(chunk, cap - (ship.atkRateLevel||0)); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_ATK_RATE_COST, ship, 'atkRate', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.atkRateLevel = (ship.atkRateLevel || 0) + allowed;
    ship.attackSpeed = atkRateFromLevel(ship.type, ship.atkRateLevel);
    addLog(`⬆ ${ship.name} ATK rate Lv${ship.atkRateLevel} → ${Math.round(ship.attackSpeed*100)}%${ship.atkRateLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'range') {
    const role = SHIP_DEFS[ship.type]?.role;
    if (role !== 'garrison') return;
    const allowed = Math.min(chunk, cap - (ship.rangeLevel || 0)); if (allowed <= 0) return;
    const cost = shipUpgCost(UPGRADE_RANGE_COST, ship, 'range', allowed); if (state.coins < cost) return;
    spendCoins(cost);
    ship.rangeLevel = (ship.rangeLevel || 0) + allowed;
    ship.range = rangeFromLevel(ship.type, ship.rangeLevel);
    addLog(`⬆ ${ship.name} range Lv${ship.rangeLevel} → ${formatWeaponRangeTiles(ship.range)}${ship.rangeLevel>=cap?' (MAX)':''}`);

  } else if (stat === 'mineTier') {
    const fromTier = ship.mineTier;
    const nextTier = ship.mineTier + 1; if (nextTier > 10) return;
    const cost = scaleShipUpgradeCoins(SHIP_TIER_COSTS[nextTier] || 0);
    if (!cost || state.coins < cost) return;
    const resReqs = scaleCraftReqs(SHIP_TIER_REQS[nextTier] || {});
    if (resReqs) {
      for (const [r, n] of Object.entries(resReqs)) {
        if ((state.resources[r] || 0) < n) return;
      }
    }
    if (nextTier > state.base.level) return;
    spendCoins(cost);
    if (resReqs) {
      for (const [r, n] of Object.entries(resReqs)) state.resources[r] -= n;
    }
    ship.mineTier = nextTier;
    const role = SHIP_DEFS[ship.type]?.role;
    if (role === 'combat' || role === 'garrison') normalizeShipAttachments(ship, role);
    addLog(`⬆ ${ship.name} upgraded to ${MINE_TIERS[nextTier].label}!`);
    notifyShipUpgraded();
    dismissTransmission();
    checkTradeTutorial();
    patchSolPanel('power');
    if (window.playShipTierTrackAnimation) window.playShipTierTrackAnimation(ship.id, fromTier, nextTier);
    else if (window.refreshShipUpgrades) window.refreshShipUpgrades();
    if (refresh.ui) refresh.ui();
    return;
  }

  notifyShipUpgraded();
  dismissTransmission();
  checkTradeTutorial();
  patchSolPanel('power');
  if (window.refreshShipUpgrades) window.refreshShipUpgrades();
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
    const bonusCap = mineBonusUpgradeCap(ship.mineTier);
    const bonusChk = n ? bonusCap - (ship.mineBonusLevel || 0) : Math.min(levels, bonusCap - (ship.mineBonusLevel || 0));
    if (capChk  > 0) { const c = shipUpgCost(UPGRADE_CAP_COST,  ship, 'capacity',  capChk);  total += c; upgrades.push(() => { ship.capacityLevel  += capChk;  ship.capacity   = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity); }); }
    if (flyChk  > 0) { const c = shipUpgCost(UPGRADE_FLY_COST,  ship, 'flySpeed',  flyChk);  total += c; upgrades.push(() => { ship.flySpeedLevel  += flyChk;  ship.flySpeed   = flySpeedFromLevel(ship.type, ship.flySpeedLevel); }); }
    if (mineChk > 0) { const c = shipUpgCost(UPGRADE_MINE_COST, ship, 'mineSpeed', mineChk); total += c; upgrades.push(() => { ship.mineSpeedLevel += mineChk; ship.mineSpeed  = mineSpeedFromLevel(ship.type, ship.mineSpeedLevel); }); }
    if (bonusChk > 0) { const c = shipUpgCost(UPGRADE_MINE_BONUS_COST, ship, 'mineBonus', bonusChk); total += c; upgrades.push(() => { ship.mineBonusLevel = (ship.mineBonusLevel || 0) + bonusChk; ship.mineBonus = mineBonusFromLevel(ship.mineBonusLevel); }); }

  } else if (role === 'transport') {
    const capChk  = n ? cap - ship.capacityLevel               : Math.min(levels, cap - ship.capacityLevel);
    const flyChk  = n ? cap - ship.flySpeedLevel               : Math.min(levels, cap - ship.flySpeedLevel);
    const loadChk = n ? cap - (ship.loadSpeedLevel||0)         : Math.min(levels, cap - (ship.loadSpeedLevel||0));
    if (capChk  > 0) { const c = shipUpgCost(UPGRADE_CAP_COST,  ship, 'capacity',  capChk);  total += c; upgrades.push(() => { ship.capacityLevel  += capChk;  ship.capacity   = capacityFromTierAndLevel(ship.type, ship.mineTier, ship.capacityLevel, ship.capacity); }); }
    if (flyChk  > 0) { const c = shipUpgCost(UPGRADE_FLY_COST,  ship, 'flySpeed',  flyChk);  total += c; upgrades.push(() => { ship.flySpeedLevel  += flyChk;  ship.flySpeed   = flySpeedFromLevel(ship.type, ship.flySpeedLevel); }); }
    if (loadChk > 0) { const c = shipUpgCost(UPGRADE_LOAD_COST, ship, 'loadSpeed', loadChk); total += c; upgrades.push(() => { ship.loadSpeedLevel = (ship.loadSpeedLevel||0) + loadChk; ship.loadSpeed = loadSpeedFromLevel(ship.type, ship.loadSpeedLevel); }); }

  } else if (role === 'combat' || role === 'garrison') {
    const hpChk   = n ? cap - (ship.hpLevel||0)                : Math.min(levels, cap - (ship.hpLevel||0));
    const atkChk  = n ? cap - (ship.attackLevel||0)            : Math.min(levels, cap - (ship.attackLevel||0));
    const rateChk = n ? cap - (ship.atkRateLevel||0)           : Math.min(levels, cap - (ship.atkRateLevel||0));
    const rangeChk = role === 'garrison'
      ? (n ? cap - (ship.rangeLevel||0) : Math.min(levels, cap - (ship.rangeLevel||0)))
      : 0;
    if (hpChk   > 0) { const c = shipUpgCost(UPGRADE_HP_COST,       ship, 'hp',       hpChk);   total += c; upgrades.push(() => { ship.hpLevel       = (ship.hpLevel||0) + hpChk;     ship.hp          = hpFromLevel(ship.type, ship.hpLevel); if (!Number.isFinite(ship.currentHp) || ship.currentHp > ship.hp) ship.currentHp = ship.hp; }); }
    if (atkChk  > 0) { const c = shipUpgCost(UPGRADE_ATTACK_COST,   ship, 'attack',   atkChk);  total += c; upgrades.push(() => { ship.attackLevel   = (ship.attackLevel||0) + atkChk;  ship.attack      = attackFromLevel(ship.type, ship.attackLevel); }); }
    if (rateChk > 0) { const c = shipUpgCost(UPGRADE_ATK_RATE_COST, ship, 'atkRate',  rateChk); total += c; upgrades.push(() => { ship.atkRateLevel  = (ship.atkRateLevel||0) + rateChk; ship.attackSpeed = atkRateFromLevel(ship.type, ship.atkRateLevel); }); }
    if (rangeChk > 0) { const c = shipUpgCost(UPGRADE_RANGE_COST, ship, 'range', rangeChk); total += c; upgrades.push(() => { ship.rangeLevel = (ship.rangeLevel||0) + rangeChk; ship.range = rangeFromLevel(ship.type, ship.rangeLevel); }); }
  }

  if (total <= 0 || state.coins < total) return;
  spendCoins(total);
  upgrades.forEach(fn => fn());

  const label = levels === 'max' ? 'MAX' : `+${levels}`;
  addLog(`⬆ ${ship.name} all stats ${label} — $${fmt(total)} spent`);
  if (window.refreshShipUpgrades) window.refreshShipUpgrades();
  notifyShipUpgraded();
  dismissTransmission();
  checkTradeTutorial();
  patchSolPanel('power');
  if (refresh.ui) refresh.ui();
};

// ── Assign window helpers ──
window.startAssign = function(shipId) {
  // Prefer map-pick helper (minimizes ship panel when open)
  if (typeof window.startShipMapPick === 'function') {
    window.startShipMapPick(shipId);
    return;
  }
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship || (ship.mineSpeed || 0) <= 0) { addLog(`⚠ This ship has no mining equipment.`); return; }
  state.pendingAssign = shipId;
  document.getElementById('main-canvas').style.cursor = 'crosshair';
  if (refresh.ui) refresh.ui();
};

window.cancelAssign = function() {
  if (typeof window.cancelShipMapPick === 'function') {
    window.cancelShipMapPick();
    return;
  }
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
  } else if (String(depotValue).startsWith('contract_center:')) {
    const depotId = Number(String(depotValue).split(':')[1]);
    const center = getDepotModules(state.modules).find((m) => m.id === depotId && isContractCenterModule(m));
    if (!center) return;
    ship.depotType = 'contract_center';
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
  if (isTransportShip(ship) && ship.loadingPickup) clearTransportCargo(ship);
  if (isTransportShip(ship) && hasSameTransportEndpoints(ship)) ship.status = 'idle';
  if (refresh.ui) refresh.ui();
};

window.setShipPickup = function(shipId, pickupValue) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship) return;
  if (pickupValue === 'base') {
    ship.pickupType = 'base';
    ship.pickupId = null;
  } else if (pickupValue === '' || pickupValue == null) {
    ship.pickupType = null;
    ship.pickupId = null;
  } else if (String(pickupValue).startsWith('storage:')) {
    const pickupId = Number(String(pickupValue).split(':')[1]);
    const storage = getStorageModules().find(s => s.id === pickupId);
    if (!storage) return;
    ship.pickupType = 'storage';
    ship.pickupId = pickupId;
  } else if (String(pickupValue).startsWith('power_station:')) {
    const pickupId = Number(String(pickupValue).split(':')[1]);
    const station = getPowerStations().find(s => s.id === pickupId);
    if (!station) return;
    ship.pickupType = 'power_station';
    ship.pickupId = pickupId;
  }
  if (isTransportShip(ship) && ship.loadingPickup) clearTransportCargo(ship);
  if (isTransportShip(ship) && (pickupValue === '' || pickupValue == null)) stopTransportShip(ship);
  else if (isTransportShip(ship) && hasSameTransportEndpoints(ship)) ship.status = 'idle';
  if (refresh.ui) refresh.ui();
};

// ── Flush deposit events (called by game loop) ──
export function flushTickEvents(canvas) {
  for (const ev of tickEvents) {
    if (ev.type === 'deposit') {
      applyDepositEvent(ev);
    } else if (ev.type === 'idle') {
      if (state.selectedShip === ev.ship.id) {
        state.pendingAssign = ev.ship.id;
        if (canvas) canvas.style.cursor = 'crosshair';
      }
    }
  }
}
