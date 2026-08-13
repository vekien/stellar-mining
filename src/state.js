// ============================================================
// GAME STATE + SAVE / LOAD
// ============================================================
import { SAVE_KEY } from './constants.js';
import { BASE_COL, BASE_ROW } from './constants.js';
import { gridToWorld } from './render/camera.js';
import { RESOURCE_DEFS } from './data/resources.js';
import { SHIP_DEFS, normalizeFlySpeed, normalizeMineSpeed, capacityFromTierAndLevel, loadSpeedFromLevel, mineBonusFromLevel, rangeFromLevel, hpFromLevel, attackFromLevel, atkRateFromLevel } from './data/ships.js';
import { normalizeSolHistory } from './systems/statsHistory.js';
import { normalizeShipAttachments } from './data/attachments.js';
import { HEALTH_INCREASE_HP_PER_PURCHASE } from './data/research.js';
import { TURRET_MAX_LEVEL, getTurretTypeDef, getTurretStats, getTurretPowerCapacity, getTurretPowerUsage } from './data/turrets.js';
import { normalizeModule, STORAGE_FACILITY_ID, invalidateNetworkCache } from './data/modules.js';
import { clampCoins } from './helpers.js';

export function makeEmptyResources() {
  return Object.fromEntries(Object.keys(RESOURCE_DEFS).map((k) => [k, 0]));
}

export let state = {
  // Economy
  coins: 200,
  trips: 0,
  resources: makeEmptyResources(),

  // World + entities
  ships: [],
  drones: [],
  droneIdCounter: 1,
  nodes: [],
  worldSeed: null,

  // UI state
  selectedShip: null,
  followShip: null,
  hoveredShip: null,
  activeTab: 'log',
  log: [],
  logHistory: [],
  transmissionHistory: [],
  renamingShip: null,
  renamingBase: false,
  renamingStorage: null,
  renamingTurret: null,
  pendingAssign: null,
  basePanelOpen: false,
  bpTab: 'overview',
  fleetFilter: { search: '', type: null, role: null, node: null, depot: null, idleOnly: false, holdingOnly: false, sort: null, sortDir: 1 },
  shipCraftTimers: {},
  shipCraftNotices: {},
  turretCraftTimers: {},
  /** Global concurrent craft jobs (cap = base.level) */
  craftQueue: [],

  // Time + progression
  sol: 1,
  solTimer: 0,
  solStarted: false,
  rp: 0,
  marketBoost: null,
  /** Per-resource SOL price variance percent, e.g. { iron: -12, copper: 8 } */
  marketVariance: {},
  /** Per-SOL buy lots: { sol, offers: [{ type, qty, purchased }] } */
  marketBuyOffers: null,

  /** Quest progress: { [questId]: { status, stageIndex, done, flags } } */
  quests: null,
  /** Pinned quest ids for left tracker (max 3) */
  trackedQuests: [],
  /** Main story missions: { [id]: { status, stageIndex, done, flags } } */
  missions: null,
  /** Map distress beacon entity for mission 1 */
  missionBeacon: null,
  /** Key items held at base: [{ id, acquiredSol, flags }] */
  keyItems: [],
  /** Daily quest board: { sol, quests: [...] } */
  dailyQuests: null,
  /** Archived completed quests (newest first), max ~80 */
  questHistory: [],
  /** @deprecated legacy scalar — migrated into factionRep */
  reputation: 0,
  /** Per-faction standing: { frontier_union, ironhands, astral_institute } */
  factionRep: null,
  /** Unlocked standing perks: { [factionId]: string[] perkIds } */
  factionPerks: null,
  /** Lifetime gains (only increase): { coins, resources: { iron: n, ... }, _seeded } */
  lifetimeGained: null,

  /** Sector contracts: { periodStartSol, slots: [...] } */
  contracts: null,
  /** AI Trader rules: { [resourceType]: { enabled, keepPct, demandOnly } } */
  autoTradeRules: null,
  /** Unique scanner pings this SOL */
  uniqueSignatures: [],

  // Player settings
  settings: {
    showGrid: true,
    showBackgroundStars: true,
    showVisualEffects: true,
    showCameraShake: true,
    focusOnEvents: true,
    showPowerLines: true,
    showPowerLinesOnHover: false,
    powerLineOpacity: 1,
    showResearchLines: true,
    showResearchLinesOnHover: false,
    researchLineOpacity: 1,
    renderFps: 45,
    closeShipAfterAssign: true,
  },

  highestAvailableNodeTier: 1,

  // Tutorial + messaging
  tutStep: 0,
  firstDeposit: false,
  firstCraftable: false,
  firstNodeSwitch: false,
  redirectTutActive: false,
  redirectTargetType: null, // 'iron' | 'copper' during diversify tutorial
  upgradesTutActive: false,
  seenMsgs: {},
  eventCounts: {},

  // Pirate pressure (Overview threat / status)
  pirateKills: 0,
  pirateStatus: 0,
  /** Raids successfully defeated — next wave scales up */
  raidsDefeated: 0,
  /** Last 30 SOL economy snapshots for Statistics charts */
  solHistory: [],

  // Unlocks + defenses
  researchUnlocks: {},
  researchUnlocksList: [],
  turrets: [],
  modules: [],
  placingTurret: false,
  placingModule: false,
  selectedTurret: null,
  selectedModule: null,
  movingTurret: null,
  movingModule: null,
  unplacedTurrets: 0,
  unplacedModules: 0,
  unplacedTurretQueue: [],
  unplacedModuleQueue: [],
  placingTurretType: null,
  placingModuleType: null,
  buildingCraftTimers: {},
  hpBoostCount: 0,
  shieldBoostCount: 0,
  antiCometCount: 0,
  solarShieldCount: 0,
  autoRegenCount: 0,
  extraDemands: [], // [{type, multiplier}] additional market demands when multi_demand unlocked

  trackedCrafts: [],

  shownAboutWindow: false,

  // Random event runtime
  nextEventTimer: null,
  nextEventSol: null,
  activeWarning: null,

  // Combat runtime (not persisted mid-raid — cleared on load)
  enemies: [],
  activeRaid: null,

  // Runtime visual effects
  baseRangeAnim: null,
  blackHole: null,

  // Base
  base: {
    name: 'Base Station',
    level: 1,
    health: 10000,
    maxHealth: 10000,
    shield: 0, // current shield HP
  },
};

const SAVE_VERSION = 6;

export let shipIdCounter = 1;
export function setShipIdCounter(v) { shipIdCounter = v; }
export function bumpShipIdCounter() { return shipIdCounter++; }

function serializeModule(module) {
  const { importEvents, ...rest } = module || {};
  return {
    ...rest,
    inventory: module?.inventory && typeof module.inventory === 'object'
      ? { ...module.inventory }
      : {},
  };
}

function deserializeModule(module) {
  return {
    ...module,
    inventory: module?.inventory && typeof module.inventory === 'object'
      ? { ...module.inventory }
      : {},
  };
}

export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      coins: state.coins, trips: state.trips,
      resources: state.resources, shipIdCounter,
      worldSeed: state.worldSeed,
      base: state.base,
      sol: state.sol, solTimer: state.solTimer, rp: state.rp, marketBoost: state.marketBoost, extraDemands: state.extraDemands,
      marketVariance: state.marketVariance && typeof state.marketVariance === 'object' ? state.marketVariance : {},
      marketBuyOffers: state.marketBuyOffers || null,
      quests: state.quests || null,
      trackedQuests: Array.isArray(state.trackedQuests) ? state.trackedQuests : [],
      missions: state.missions || null,
      missionBeacon: state.missionBeacon || null,
      keyItems: Array.isArray(state.keyItems) ? state.keyItems : [],
      dailyQuests: state.dailyQuests || null,
      questHistory: Array.isArray(state.questHistory) ? state.questHistory.slice(0, 80) : [],
      reputation: state.reputation || 0,
      factionRep: state.factionRep && typeof state.factionRep === 'object' ? state.factionRep : null,
      factionPerks: state.factionPerks && typeof state.factionPerks === 'object' ? state.factionPerks : null,
      lifetimeGained: state.lifetimeGained && typeof state.lifetimeGained === 'object'
        ? {
            coins: Math.max(0, Math.floor(Number(state.lifetimeGained.coins) || 0)),
            resources: state.lifetimeGained.resources && typeof state.lifetimeGained.resources === 'object'
              ? state.lifetimeGained.resources
              : {},
            _seeded: !!state.lifetimeGained._seeded,
          }
        : null,
      contracts: state.contracts || null,
      autoTradeRules: state.autoTradeRules || null,
      uniqueSignatures: state.uniqueSignatures || [],
      settings: state.settings,
      solStarted: state.solStarted, tutStep: state.tutStep,
      firstDeposit: state.firstDeposit, firstCraftable: state.firstCraftable,
      firstNodeSwitch: state.firstNodeSwitch, seenMsgs: state.seenMsgs,
      shownAboutWindow: state.shownAboutWindow,
      nextEventTimer: state.nextEventTimer, nextEventSol: state.nextEventSol, eventCounts: state.eventCounts,
      blackHole: state.blackHole,
      researchUnlocks: state.researchUnlocks,
      pirateKills: state.pirateKills || 0,
      pirateStatus: state.pirateStatus || 0,
      raidsDefeated: state.raidsDefeated || 0,
      solHistory: Array.isArray(state.solHistory) ? state.solHistory.slice(-30) : [],
      hpBoostCount: state.hpBoostCount, shieldBoostCount: state.shieldBoostCount,
      antiCometCount: state.antiCometCount, solarShieldCount: state.solarShieldCount,
      autoRegenCount: state.autoRegenCount,
      researchUnlocksList: state.researchUnlocksList,
      turrets: state.turrets, modules: state.modules.map(serializeModule),
      unplacedTurrets: state.unplacedTurrets, unplacedTurretQueue: state.unplacedTurretQueue,
      unplacedModules: state.unplacedModules, unplacedModuleQueue: state.unplacedModuleQueue,
      logHistory: state.logHistory,
      transmissionHistory: state.transmissionHistory,
      shipCraftTimers: state.shipCraftTimers,
      turretCraftTimers: state.turretCraftTimers,
      buildingCraftTimers: state.buildingCraftTimers,
      craftQueue: Array.isArray(state.craftQueue) ? state.craftQueue : [],
      saveVersion: SAVE_VERSION,
        ships: state.ships.filter(s => !s.isHqSupport).map(s => ({
          id:s.id, name:s.name, type:s.type,
          capacity:s.capacity, flySpeed:s.flySpeed, mineSpeed:s.mineSpeed, mineTier:s.mineTier,
          mineBonus: s.mineBonus ?? 0.1,
          loadSpeed: s.loadSpeed ?? 0,
          hp: s.hp ?? 0,
          currentHp: s.currentHp ?? s.hp ?? 0,
          attack: s.attack ?? 0,
          attackSpeed: s.attackSpeed ?? 0,
          range: s.range ?? 0,
          capacityLevel:s.capacityLevel, flySpeedLevel:s.flySpeedLevel, mineSpeedLevel:s.mineSpeedLevel,
          mineBonusLevel: s.mineBonusLevel ?? 0,
          loadSpeedLevel: s.loadSpeedLevel ?? 0,
          hpLevel: s.hpLevel ?? 0,
          attackLevel: s.attackLevel ?? 0,
          atkRateLevel: s.atkRateLevel ?? 0,
          rangeLevel: s.rangeLevel ?? 0,
          attachments: Array.isArray(s.attachments) ? s.attachments : undefined,
          targetNode: s.targetNode,
          depotType: s.depotType,
          depotId: s.depotId,
          pickupType: s.pickupType ?? null,
          pickupId: s.pickupId ?? null,
          loadBuffer: s.loadBuffer ?? 0,
          autoAssign: !!s.autoAssign,
          shield: s.shield ?? null,
          maxShield: s.maxShield ?? null,
          cargoHold: s.cargoHold || 0,
          cargoHoldResource: s.cargoHoldResource || null,
          missionJob: s.missionJob || null,
          missionCargo: s.missionCargo || null,
        })),
        // Drones are not persisted — they respawn fresh from the lab on each load
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
    state.solTimer = d.solTimer ?? 0;
    state.rp   = d.rp  ?? 0;
    state.marketBoost = d.marketBoost ?? null;
    state.extraDemands = Array.isArray(d.extraDemands) ? d.extraDemands : [];
    state.marketVariance = d.marketVariance && typeof d.marketVariance === 'object' ? d.marketVariance : {};
    state.marketBuyOffers = d.marketBuyOffers && typeof d.marketBuyOffers === 'object'
      ? {
          sol: Number(d.marketBuyOffers.sol) || 1,
          offers: Array.isArray(d.marketBuyOffers.offers)
            ? d.marketBuyOffers.offers
                .filter((o) => o && o.type)
                .map((o) => ({
                  type: o.type,
                  qty: Math.max(0, Math.floor(Number(o.qty) || 0)),
                  purchased: Math.max(0, Math.floor(Number(o.purchased) || 0)),
                }))
            : [],
        }
      : null;
    state.quests = d.quests && typeof d.quests === 'object' ? d.quests : null;
    state.trackedQuests = Array.isArray(d.trackedQuests) ? d.trackedQuests : [];
    state.missions = d.missions && typeof d.missions === 'object' ? d.missions : null;
    state.missionBeacon = d.missionBeacon && typeof d.missionBeacon === 'object' ? d.missionBeacon : null;
    state.keyItems = Array.isArray(d.keyItems) ? d.keyItems : [];
    state.dailyQuests = d.dailyQuests && typeof d.dailyQuests === 'object' ? d.dailyQuests : null;
    state.questHistory = Array.isArray(d.questHistory) ? d.questHistory.slice(0, 80) : [];
    state.reputation = Math.max(0, Math.floor(Number(d.reputation) || 0));
    state.factionRep = d.factionRep && typeof d.factionRep === 'object' ? d.factionRep : null;
    state.factionPerks = d.factionPerks && typeof d.factionPerks === 'object' ? d.factionPerks : null;
    if (d.lifetimeGained && typeof d.lifetimeGained === 'object') {
      state.lifetimeGained = {
        coins: Math.max(0, Math.floor(Number(d.lifetimeGained.coins) || 0)),
        resources: d.lifetimeGained.resources && typeof d.lifetimeGained.resources === 'object'
          ? d.lifetimeGained.resources
          : {},
        _seeded: !!d.lifetimeGained._seeded,
      };
    } else {
      state.lifetimeGained = null;
    }
    state.contracts = d.contracts && typeof d.contracts === 'object' ? d.contracts : null;
    state.autoTradeRules = d.autoTradeRules && typeof d.autoTradeRules === 'object' ? d.autoTradeRules : null;
    state.uniqueSignatures = Array.isArray(d.uniqueSignatures) ? d.uniqueSignatures : [];
    // Strip special node types (e.g. crashed_ship) from saved demand
    {
      const ok = (type) => {
        const def = RESOURCE_DEFS[type];
        return !!(def && !def.special && (def.sellPrice || 0) > 0);
      };
      if (state.marketBoost && !ok(state.marketBoost.type)) state.marketBoost = null;
      state.extraDemands = state.extraDemands.filter((d) => d && ok(d.type));
      if (!state.marketBoost && state.extraDemands.length) {
        state.marketBoost = state.extraDemands.shift();
      }
      const cleaned = {};
      for (const [k, v] of Object.entries(state.marketVariance || {})) {
        if (!ok(k)) continue;
        const n = Math.round(Number(v) || 0);
        if (n !== 0) cleaned[k] = Math.max(-25, Math.min(25, n));
      }
      state.marketVariance = cleaned;
    }
    state.settings = {
      showGrid: d.settings?.showGrid ?? true,
      showBackgroundStars: d.settings?.showBackgroundStars ?? true,
      showVisualEffects: d.settings?.showVisualEffects ?? true,
      showCameraShake: d.settings?.showCameraShake ?? true,
      focusOnEvents: d.settings?.focusOnEvents ?? true,
      showPowerLines: d.settings?.showPowerLines ?? true,
      showPowerLinesOnHover: d.settings?.showPowerLinesOnHover ?? false,
      powerLineOpacity: Number.isFinite(d.settings?.powerLineOpacity) ? d.settings.powerLineOpacity : 1,
      showResearchLines: d.settings?.showResearchLines ?? true,
      showResearchLinesOnHover: d.settings?.showResearchLinesOnHover ?? false,
      researchLineOpacity: Number.isFinite(d.settings?.researchLineOpacity) ? d.settings.researchLineOpacity : 1,
      renderFps: d.settings?.renderFps ?? 45,
      closeShipAfterAssign: d.settings?.closeShipAfterAssign !== false,
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
    state.blackHole = d.blackHole ?? null;
    state.researchUnlocks = d.researchUnlocks ?? {};
    state.pirateKills = Math.max(0, Math.floor(d.pirateKills || 0));
    state.pirateStatus = Math.max(0, Math.min(100, Number(d.pirateStatus) || 0));
    state.raidsDefeated = Math.max(0, Math.floor(d.raidsDefeated || 0));
    state.solHistory = normalizeSolHistory(d.solHistory);
    // ── Migrations ──────────────────────────────────────────────
    // hp_boost → health_increase
    if (state.researchUnlocks.hp_boost) { state.researchUnlocks.health_increase = true; delete state.researchUnlocks.hp_boost; }
    // defense → armor_plating
    if (state.researchUnlocks.defense) { state.researchUnlocks.armor_plating = true; delete state.researchUnlocks.defense; }
    // drone_lab + drone_crafting merged → either unlocks both
    if (state.researchUnlocks.drone_lab || state.researchUnlocks.drone_crafting) {
      state.researchUnlocks.drone_lab = true;
      state.researchUnlocks.drone_crafting = true;
    }
    state.researchUnlocksList = Array.isArray(d.researchUnlocksList) ? d.researchUnlocksList : [];
    // Migrate old list entry names
    for (const r of state.researchUnlocksList) {
      if (r.id === 'hp_boost') { r.id = 'health_increase'; r.name = 'Health Increase'; }
      if (r.id === 'defense')  { r.id = 'armor_plating';   r.name = 'Armor Plating'; }
    }
    state.turrets = d.turrets ?? [];
    const savedModules = Array.isArray(d.modules)
      ? d.modules
      : Array.isArray(d.storageFacilities)
        ? d.storageFacilities.map(storage => ({ ...storage, type: storage.type || STORAGE_FACILITY_ID }))
        : [];
    state.modules = savedModules.map((module, index) => normalizeModule(deserializeModule(module), index + 1));
    // Migrate old turrets
    state.turrets.forEach(t => {
      if (!t.type) t.type = 'turret';
      const level = Math.min(TURRET_MAX_LEVEL, Math.max(1, t.level || 1));
      t.level = level;
      const stats = getTurretStats(t.type, level);
      const priorHealth = Number.isFinite(t.health) ? t.health : stats.maxHealth;
      t.maxHealth = stats.maxHealth;
      t.health = Math.min(priorHealth, stats.maxHealth);
      t.damage = stats.damage;
      t.range = stats.range;
      t.fireRate = stats.fireRate;
      t.stunDuration = stats.stunDuration;
      t.powerUsage = getTurretPowerUsage(t.type, level);
      t.powerCapacity = Math.max(t.powerCapacity || 0, getTurretPowerCapacity({ type: t.type, level }));
      t.power = Math.max(0, Math.min(Number.isFinite(t.power) ? t.power : t.powerCapacity, t.powerCapacity));
    });
    state.unplacedTurretQueue = Array.isArray(d.unplacedTurretQueue)
      ? d.unplacedTurretQueue.slice()
      : Array.from({ length: d.unplacedTurrets ?? 0 }, () => 'turret');
    state.unplacedTurrets = state.unplacedTurretQueue.length;
    state.unplacedModuleQueue = Array.isArray(d.unplacedModuleQueue)
      ? d.unplacedModuleQueue.slice()
      : Array.isArray(d.unplacedStorageQueue)
        ? d.unplacedStorageQueue.slice()
        : Array.from({ length: (d.unplacedModules ?? d.unplacedStorages ?? 0) }, () => STORAGE_FACILITY_ID);
    state.unplacedModules = state.unplacedModuleQueue.length;
    state.logHistory = Array.isArray(d.logHistory) ? d.logHistory.slice(-100) : [];
    state.transmissionHistory = Array.isArray(d.transmissionHistory) ? d.transmissionHistory.slice(0, 20) : [];
    state.log = state.logHistory.slice(0, 3).map(entry => entry.msg);
    state.shipCraftTimers = d.shipCraftTimers && typeof d.shipCraftTimers === 'object' ? d.shipCraftTimers : {};
    state.turretCraftTimers = d.turretCraftTimers && typeof d.turretCraftTimers === 'object' ? d.turretCraftTimers : {};
    state.buildingCraftTimers = d.buildingCraftTimers && typeof d.buildingCraftTimers === 'object'
      ? d.buildingCraftTimers
      : d.moduleCraftTimers && typeof d.moduleCraftTimers === 'object'
        ? d.moduleCraftTimers
      : (d.storageCraftTimers && typeof d.storageCraftTimers === 'object' ? d.storageCraftTimers : {});
    state.craftQueue = Array.isArray(d.craftQueue) ? d.craftQueue.filter((j) => j && j.jobId) : [];
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

    const expectedMaxHealth = 10000 + (state.base.level - 1) * 10000 + (state.hpBoostCount * HEALTH_INCREASE_HP_PER_PURCHASE);
    state.base.maxHealth = Math.max(state.base.maxHealth || 0, expectedMaxHealth);
    state.base.health = Math.min(state.base.health ?? state.base.maxHealth, state.base.maxHealth);
    // scheduleNextEvent() called by main.js after loadGame() if nextEventTimer === null
    state.activeWarning = null;
    state.enemies = [];
    state.activeRaid = null;
    shipIdCounter = d.shipIdCounter ?? 1;
    state.drones = [];          // always reset — drones respawn fresh from the lab on load
    state.droneIdCounter = 1;
    state.ships = (d.ships||[]).map(sd => {
      const base = gridToWorld(BASE_COL, BASE_ROW);
      const rawFlySpeed = sd.flySpeed ?? (saveVersion < 2 ? 1.0 : 100);
      const rawMineSpeed = sd.mineSpeed ?? (saveVersion < 3 ? 1.0 : 2.0);
      const loadSpeedLevel = sd.loadSpeedLevel ?? 0;
      const isTransport = SHIP_DEFS[sd.type]?.role === 'transport';
      const defaultLoadSpeed = isTransport ? loadSpeedFromLevel(sd.type, loadSpeedLevel) : 0;
        return {
          id:sd.id, name:sd.name, type:sd.type,
          capacity: capacityFromTierAndLevel(sd.type, sd.mineTier ?? 1, sd.capacityLevel ?? 0, sd.capacity ?? 10),
          flySpeed: normalizeFlySpeed(rawFlySpeed, saveVersion),
          mineSpeed: normalizeMineSpeed(rawMineSpeed, saveVersion),
          mineBonusLevel: sd.mineBonusLevel ?? 0,
          mineBonus: mineBonusFromLevel(sd.mineBonusLevel ?? 0),
          loadSpeed:   sd.loadSpeed   ?? defaultLoadSpeed,
          hp:          sd.hp          ?? (SHIP_DEFS[sd.type]?.hp ?? 0),
          currentHp:   sd.currentHp   ?? sd.hp ?? (SHIP_DEFS[sd.type]?.hp ?? 0),
          attack:      sd.attack      ?? (SHIP_DEFS[sd.type]?.attack ?? 0),
          attackSpeed: sd.attackSpeed ?? (SHIP_DEFS[sd.type]?.attackSpeed ?? 0),
          range:       sd.range       ?? (SHIP_DEFS[sd.type]?.range ?? 0),
          mineTier:sd.mineTier ?? 1,
          capacityLevel:  sd.capacityLevel  ?? 0,
          flySpeedLevel:  sd.flySpeedLevel  ?? 0,
          mineSpeedLevel: sd.mineSpeedLevel ?? 0,
          loadSpeedLevel: loadSpeedLevel,
          hpLevel:        sd.hpLevel        ?? 0,
          attackLevel:    sd.attackLevel    ?? 0,
          atkRateLevel:   sd.atkRateLevel   ?? 0,
          rangeLevel:     sd.rangeLevel     ?? 0,
          attachments:    Array.isArray(sd.attachments) ? sd.attachments : undefined,
          attachmentCds:  {},
           cargo:0, cargoResource:null,
           cargoManifest: null,
           pickupType: sd.pickupType ?? null,
           pickupId: sd.pickupId ?? null,
           loadBuffer: sd.loadBuffer ?? 0,
           loadingPickup: false,
           unloadingDepot: false,
           autoAssign: !!sd.autoAssign,
           shield: Number.isFinite(sd.shield) ? sd.shield : null,
           maxShield: Number.isFinite(sd.maxShield) ? sd.maxShield : null,
           cargoHold: Math.max(0, Math.floor(sd.cargoHold || 0)),
           cargoHoldResource: sd.cargoHoldResource || null,
           missionJob: sd.missionJob && typeof sd.missionJob === 'object' ? sd.missionJob : null,
           missionCargo: sd.missionCargo || null,
           status:'idle', targetNode: sd.targetNode ?? null, targetEnemyId: null,
        depotType: sd.depotType === 'research_lab' ? 'base' : (sd.depotType || 'base'),
        depotId: sd.depotType === 'research_lab' ? null : (sd.depotId ?? null),
        heading: Math.random() * Math.PI * 2,
        turnRadiusRandomness: Number.isFinite(sd.turnRadiusRandomness)
          ? sd.turnRadiusRandomness
          : (Math.random() - 0.5) * 2,
        x:base.x, y:base.y, destX:base.x, destY:base.y, mineTimer:0, pauseTimer:0,
      };
    });
    // Resync combat/garrison stats + attachments
    for (const ship of state.ships) {
      const role = SHIP_DEFS[ship.type]?.role;
      if (role !== 'garrison' && role !== 'combat') continue;
      if (Number.isFinite(ship.hpLevel)) ship.hp = hpFromLevel(ship.type, ship.hpLevel || 0);
      if (Number.isFinite(ship.attackLevel)) ship.attack = attackFromLevel(ship.type, ship.attackLevel || 0);
      if (Number.isFinite(ship.atkRateLevel)) ship.attackSpeed = atkRateFromLevel(ship.type, ship.atkRateLevel || 0);
      if (role === 'garrison') {
        ship.range = rangeFromLevel(ship.type, ship.rangeLevel || 0);
      }
      normalizeShipAttachments(ship, role);
      if (!Number.isFinite(ship.currentHp) || ship.currentHp > ship.hp) ship.currentHp = ship.hp;
    }
    invalidateNetworkCache();
    return true;
  } catch(e) { return false; }
}
