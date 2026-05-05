// ============================================================
// GAME STATE + SAVE / LOAD
// ============================================================
import { SAVE_KEY } from './constants.js';
import { BASE_COL, BASE_ROW } from './constants.js';
import { gridToWorld } from './render/camera.js';
import { RESOURCE_DEFS } from './data/resources.js';
import { normalizeFlySpeed, normalizeMineSpeed, capacityFromTierAndLevel } from './data/ships.js';
import { clampCoins } from './helpers.js';

function makeEmptyResources() {
  return Object.fromEntries(Object.keys(RESOURCE_DEFS).map((k) => [k, 0]));
}

export let state = {
  // Economy
  coins: 200,
  trips: 0,
  resources: makeEmptyResources(),

  // World + entities
  ships: [],
  nodes: [],
  worldSeed: null,

  // UI state
  selectedShip: null,
  followShip: null,
  hoveredShip: null,
  activeTab: 'log',
  log: [],
  logHistory: [],
  renamingShip: null,
  renamingBase: false,
  pendingAssign: null,
  basePanelOpen: false,
  bpTab: 'overview',
  fleetFilter: { type: null, role: null, node: null, idleOnly: false, sort: null, sortDir: 1 },
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
    showBackgroundStars: true,
  },

  highestAvailableNodeTier: 1,

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
  shieldBoostCount: 0,
  antiCometCount: 0,
  solarShieldCount: 0,
  autoRegenCount: 0,
  extraDemands: [], // [{type, multiplier}] additional market demands when multi_demand unlocked

  shownAboutWindow: false,

  // Random event runtime
  nextEventTimer: null,
  nextEventSol: null,
  activeWarning: null,

  // Base
  base: {
    name: 'Base Station',
    level: 1,
    health: 10000,
    maxHealth: 10000,
    shield: 0, // current shield HP
  },
};

const SAVE_VERSION = 4;

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
      shownAboutWindow: state.shownAboutWindow,
      nextEventTimer: state.nextEventTimer, nextEventSol: state.nextEventSol, eventCounts: state.eventCounts,
      researchUnlocks: state.researchUnlocks,
      hpBoostCount: state.hpBoostCount, shieldBoostCount: state.shieldBoostCount,
      antiCometCount: state.antiCometCount, solarShieldCount: state.solarShieldCount,
      autoRegenCount: state.autoRegenCount,
      researchUnlocksList: state.researchUnlocksList,
      turrets: state.turrets, unplacedTurrets: state.unplacedTurrets,
      logHistory: state.logHistory,
      shipCraftTimers: state.shipCraftTimers,
      saveVersion: SAVE_VERSION,
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
    const saveVersion = d.saveVersion ?? 1;
    state.coins = clampCoins(d.coins ?? 200);
    state.trips = d.trips ?? 0;
    state.resources = { ...makeEmptyResources(), ...(d.resources || {}) };
    state.worldSeed = Number.isFinite(d.worldSeed) ? d.worldSeed : null;
    state.base = { name:'Base Station', level:1, health:10000, maxHealth:10000, shield:0, ...(d.base||{}) };
    state.sol  = d.sol ?? 1;
    state.rp   = d.rp  ?? 0;
    state.marketBoost = d.marketBoost ?? null;
    state.settings = {
      showGridCoords: d.settings?.showGridCoords ?? d.showGridCoords ?? false,
      showBackgroundStars: d.settings?.showBackgroundStars ?? true,
    };
    state.solStarted = d.solStarted ?? false;
    state.tutStep = d.tutStep ?? 0;
    state.firstDeposit = d.firstDeposit ?? false;
    state.firstCraftable = d.firstCraftable ?? false;
    state.firstNodeSwitch = d.firstNodeSwitch ?? false;
    state.seenMsgs = d.seenMsgs ?? {};
    state.shownAboutWindow = d.shownAboutWindow ?? false;
    state.nextEventTimer = d.nextEventTimer ?? null;
    state.nextEventSol = d.nextEventSol ?? null;
    state.eventCounts = d.eventCounts ?? {};
    state.researchUnlocks = d.researchUnlocks ?? {};
    // ── Migrations ──────────────────────────────────────────────
    // hp_boost → health_increase
    if (state.researchUnlocks.hp_boost) { state.researchUnlocks.health_increase = true; delete state.researchUnlocks.hp_boost; }
    // defense → armor_plating
    if (state.researchUnlocks.defense) { state.researchUnlocks.armor_plating = true; delete state.researchUnlocks.defense; }
    state.researchUnlocksList = Array.isArray(d.researchUnlocksList) ? d.researchUnlocksList : [];
    // Migrate old list entry names
    for (const r of state.researchUnlocksList) {
      if (r.id === 'hp_boost') { r.id = 'health_increase'; r.name = 'Health Increase'; }
      if (r.id === 'defense')  { r.id = 'armor_plating';   r.name = 'Armor Plating'; }
    }
    state.turrets = d.turrets ?? [];
    // Migrate old turrets
    state.turrets.forEach(t => { if (t.range > 2 && t.level === 1) t.range = 2; });
    state.unplacedTurrets = d.unplacedTurrets ?? 0;
    state.logHistory = Array.isArray(d.logHistory) ? d.logHistory.slice(-100) : [];
    state.log = state.logHistory.slice(0, 3).map(entry => entry.msg);
    state.shipCraftTimers = d.shipCraftTimers && typeof d.shipCraftTimers === 'object' ? d.shipCraftTimers : {};
    state.hpBoostCount     = d.hpBoostCount     ?? 0;
    state.shieldBoostCount = d.shieldBoostCount ?? 0;
    state.antiCometCount   = d.antiCometCount   ?? 0;
    state.solarShieldCount = d.solarShieldCount ?? 0;
    state.autoRegenCount   = d.autoRegenCount   ?? 0;
    if (!state.researchUnlocksList.length && state.hpBoostCount > 0) {
      state.researchUnlocksList = [{ id: 'health_increase', name: 'Health Increase', qty: state.hpBoostCount }];
    }
    const hpEntry = state.researchUnlocksList.find(r => r.id === 'health_increase');
    if (hpEntry && Number.isFinite(hpEntry.qty)) state.hpBoostCount = Math.max(state.hpBoostCount, hpEntry.qty);

    const expectedMaxHealth = 10000 + (state.base.level - 1) * 10000 + (state.hpBoostCount * 2500);
    state.base.maxHealth = Math.max(state.base.maxHealth || 0, expectedMaxHealth);
    state.base.health = Math.min(state.base.health ?? state.base.maxHealth, state.base.maxHealth);
    // scheduleNextEvent() called by main.js after loadGame() if nextEventTimer === null
    state.activeWarning = null;
    state.solTimer = 0;
    shipIdCounter = d.shipIdCounter ?? 1;
    state.ships = (d.ships||[]).map(sd => {
      const base = gridToWorld(BASE_COL, BASE_ROW);
      const rawFlySpeed = sd.flySpeed ?? (saveVersion < 2 ? 1.0 : 100);
      const rawMineSpeed = sd.mineSpeed ?? (saveVersion < 3 ? 1.0 : 2.0);
      return {
        id:sd.id, name:sd.name, type:sd.type,
        capacity: capacityFromTierAndLevel(sd.type, sd.mineTier ?? 1, sd.capacityLevel ?? 0, sd.capacity ?? 10),
        flySpeed: normalizeFlySpeed(rawFlySpeed, saveVersion),
        mineSpeed: normalizeMineSpeed(rawMineSpeed, saveVersion),
        loadSpeed:   sd.loadSpeed   ?? 0,
        hp:          sd.hp          ?? 0,
        attack:      sd.attack      ?? 0,
        attackSpeed: sd.attackSpeed ?? 0,
        mineTier:sd.mineTier ?? 1,
        capacityLevel:  sd.capacityLevel  ?? 0,
        flySpeedLevel:  sd.flySpeedLevel  ?? 0,
        mineSpeedLevel: sd.mineSpeedLevel ?? 0,
        loadSpeedLevel: sd.loadSpeedLevel ?? 0,
        hpLevel:        sd.hpLevel        ?? 0,
        attackLevel:    sd.attackLevel    ?? 0,
        atkRateLevel:   sd.atkRateLevel   ?? 0,
        cargo:0, cargoResource:null,
        status:'idle', targetNode: sd.targetNode ?? null,
        heading: Math.random() * Math.PI * 2,
        x:base.x, y:base.y, destX:base.x, destY:base.y, mineTimer:0, pauseTimer:0,
      };
    });
    return true;
  } catch(e) { return false; }
}
