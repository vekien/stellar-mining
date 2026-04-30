// ============================================================
// GAME STATE + SAVE / LOAD
// ============================================================
import { SAVE_KEY } from './constants.js';
import { BASE_COL, BASE_ROW } from './constants.js';
import { gridToWorld } from './render/camera.js';

export let state = {
  // Economy
  coins: 200,
  trips: 0,
  resources: { iron: 0, copper: 0, oxygen: 0, silicon: 0, titanium: 0, gold: 0 },

  // World + entities
  ships: [],
  nodes: [],
  worldSeed: null,

  // UI state
  selectedShip: null,
  activeTab: 'log',
  log: [],
  logHistory: [],
  renamingShip: null,
  renamingBase: false,
  pendingAssign: null,
  basePanelOpen: false,
  bpTab: 'overview',
  fleetFilter: { type: null, node: null, idleOnly: false, sort: null, sortDir: 1 },
  shipCraftTimers: {},
  shipCraftNotices: {},

  // Time + progression
  sol: 1,
  solTimer: 0,
  solStarted: false,
  rp: 0,
  marketBoost: null,

  // Player settings
  settings: {
    showGridCoords: false,
  },

  // Tutorial + messaging
  tutStep: 0,
  firstDeposit: false,
  firstCraftable: false,
  firstNodeSwitch: false,
  redirectTutActive: false,
  upgradesTutActive: false,
  seenMsgs: {},
  eventCounts: {},

  // Unlocks + defenses
  researchUnlocks: {},
  researchUnlocksList: [],
  turrets: [],
  placingTurret: false,
  selectedTurret: null,
  movingTurret: null,
  unplacedTurrets: 0,
  hpBoostCount: 0,

  // Random event runtime
  nextEventTimer: null,
  activeWarning: null,

  // Base
  base: {
    name: 'Base Station',
    level: 1,
    health: 10000,
    maxHealth: 10000,
  },
};

export let shipIdCounter = 1;
export function setShipIdCounter(v) { shipIdCounter = v; }
export function bumpShipIdCounter() { return shipIdCounter++; }

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, trips: state.trips,
      resources: state.resources, shipIdCounter,
      worldSeed: state.worldSeed,
      base: state.base,
      sol: state.sol, rp: state.rp, marketBoost: state.marketBoost,
      settings: state.settings,
      solStarted: state.solStarted, tutStep: state.tutStep,
      firstDeposit: state.firstDeposit, firstCraftable: state.firstCraftable,
      firstNodeSwitch: state.firstNodeSwitch, seenMsgs: state.seenMsgs,
      nextEventTimer: state.nextEventTimer, eventCounts: state.eventCounts,
      researchUnlocks: state.researchUnlocks, hpBoostCount: state.hpBoostCount,
      researchUnlocksList: state.researchUnlocksList,
      turrets: state.turrets, unplacedTurrets: state.unplacedTurrets,
      logHistory: state.logHistory,
      shipCraftTimers: state.shipCraftTimers,
      ships: state.ships.map(s => ({
        id:s.id, name:s.name, type:s.type,
        capacity:s.capacity, flySpeed:s.flySpeed, mineSpeed:s.mineSpeed, mineTier:s.mineTier,
        capacityLevel:s.capacityLevel, flySpeedLevel:s.flySpeedLevel, mineSpeedLevel:s.mineSpeedLevel,
        targetNode: s.targetNode,
      })),
    }));
  } catch(e) {}
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.coins = d.coins ?? 200;
    state.trips = d.trips ?? 0;
    state.resources = { iron:0, copper:0, oxygen:0, silicon:0, titanium:0, gold:0, ...(d.resources||{}) };
    state.worldSeed = Number.isFinite(d.worldSeed) ? d.worldSeed : null;
    state.base = { name:'Base Station', level:1, health:10000, maxHealth:10000, ...(d.base||{}) };
    state.sol  = d.sol ?? 1;
    state.rp   = d.rp  ?? 0;
    state.marketBoost = d.marketBoost ?? null;
    state.settings = {
      showGridCoords: d.settings?.showGridCoords ?? d.showGridCoords ?? false,
    };
    state.solStarted = d.solStarted ?? false;
    state.tutStep = d.tutStep ?? 0;
    state.firstDeposit = d.firstDeposit ?? false;
    state.firstCraftable = d.firstCraftable ?? false;
    state.firstNodeSwitch = d.firstNodeSwitch ?? false;
    state.seenMsgs = d.seenMsgs ?? {};
    state.nextEventTimer = d.nextEventTimer ?? null;
    state.eventCounts = d.eventCounts ?? {};
    state.researchUnlocks = d.researchUnlocks ?? {};
    state.researchUnlocksList = Array.isArray(d.researchUnlocksList) ? d.researchUnlocksList : [];
    state.turrets = d.turrets ?? [];
    // Migrate old turrets
    state.turrets.forEach(t => { if (t.range > 2 && t.level === 1) t.range = 2; });
    state.unplacedTurrets = d.unplacedTurrets ?? 0;
    state.logHistory = Array.isArray(d.logHistory) ? d.logHistory.slice(-100) : [];
    state.log = state.logHistory.slice(0, 3).map(entry => entry.msg);
    state.shipCraftTimers = d.shipCraftTimers && typeof d.shipCraftTimers === 'object' ? d.shipCraftTimers : {};
    state.hpBoostCount = d.hpBoostCount ?? 0;
    if (!state.researchUnlocksList.length && state.hpBoostCount > 0) {
      state.researchUnlocksList = [{ id: 'hp_boost', name: 'HP Boost', qty: state.hpBoostCount }];
    }
    const hpBoostEntry = state.researchUnlocksList.find(r => r.id === 'hp_boost');
    if (hpBoostEntry && Number.isFinite(hpBoostEntry.qty)) state.hpBoostCount = Math.max(state.hpBoostCount, hpBoostEntry.qty);

    const expectedMaxHealth = 10000 + (state.base.level - 1) * 10000 + (state.hpBoostCount * 2500);
    state.base.maxHealth = Math.max(state.base.maxHealth || 0, expectedMaxHealth);
    state.base.health = Math.min(state.base.health ?? state.base.maxHealth, state.base.maxHealth);
    // scheduleNextEvent() called by main.js after loadGame() if nextEventTimer === null
    state.activeWarning = null;
    state.solTimer = 0;
    shipIdCounter = d.shipIdCounter ?? 1;
    state.ships = (d.ships||[]).map(sd => {
      const base = gridToWorld(BASE_COL, BASE_ROW);
      return {
        id:sd.id, name:sd.name, type:sd.type,
        capacity:sd.capacity ?? 10,
        flySpeed:sd.flySpeed ?? 1.0,
        mineSpeed:sd.mineSpeed ?? 1.0,
        mineTier:sd.mineTier ?? 1,
        capacityLevel:sd.capacityLevel ?? 0,
        flySpeedLevel:sd.flySpeedLevel ?? 0,
        mineSpeedLevel:sd.mineSpeedLevel ?? 0,
        cargo:0, cargoResource:null,
        status:'idle', targetNode: sd.targetNode ?? null,
        heading: Math.random() * Math.PI * 2,
        x:base.x, y:base.y, destX:base.x, destY:base.y, mineTimer:0, pauseTimer:0,
      };
    });
    return true;
  } catch(e) { return false; }
}
