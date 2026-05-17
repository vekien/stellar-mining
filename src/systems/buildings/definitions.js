// ============================================================
// BUILDING TYPES — class-based building definitions
// ============================================================
import { RESOURCE_DEFS, getResourceTier } from '../../data/resources.js';

export const STORAGE_FACILITY_ID = 'storage_facility';
export const POWER_STATION_ID = 'power_station';
export const POWER_POLE_ID = 'power_pole';
export const RESEARCH_LAB_ID = 'research_lab';
export const LAB_TOWER_ID = 'lab_tower';
export const DRONE_LAB_ID = 'drone_lab';

export const POWER_RESOURCE_CONSUMPTION = 10;
export const POWER_RESOURCE_CONSUMPTION_MIN = 1;
export const POWER_DISABLED_RESOURCES = new Set(['oxygen', 'neon', 'xenon']);

const POWER_RESOURCE_OUTPUT = {
  iron: 9,
  copper: 9,
  nickel: 12,
  silicon: 15,
  cobalt: 15,
  titanium: 18,
  aluminum: 18,
  gold: 21,
  chromium: 21,
  silver: 24,
  platinum: 30,
  iridium: 33,
  palladium: 33,
  uranium: 36,
  osmium: 36,
  rhodium: 39,
  hafnium: 39,
};

function fmtStat(value) {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

export function makeEmptyInventory() {
  return Object.fromEntries(Object.keys(RESOURCE_DEFS).map((key) => [key, 0]));
}

export function getPowerFuelOutput(resourceType) {
  return POWER_RESOURCE_OUTPUT[resourceType] || 0;
}

export function getPowerResourceConsumption(moduleOrLevel = 1) {
  const level = typeof moduleOrLevel === 'number'
    ? moduleOrLevel
    : Math.max(1, Math.floor(moduleOrLevel?.level || 1));
  return Math.max(
    POWER_RESOURCE_CONSUMPTION_MIN,
    Math.round(POWER_RESOURCE_CONSUMPTION - (((level - 1) * (POWER_RESOURCE_CONSUMPTION - POWER_RESOURCE_CONSUMPTION_MIN)) / 9)),
  );
}

export function getPowerFuelOptions() {
  return Object.keys(RESOURCE_DEFS)
    .filter((resourceType) => !POWER_DISABLED_RESOURCES.has(resourceType) && getPowerFuelOutput(resourceType) > 0)
    .sort((a, b) => (getResourceTier(a) || 99) - (getResourceTier(b) || 99))
    .map((resourceType) => ({
      type: resourceType,
      label: RESOURCE_DEFS[resourceType].label,
      output: getPowerFuelOutput(resourceType),
    }));
}

export function formatPowerFuelRate(resourceType, moduleOrLevel = 1) {
  const label = RESOURCE_DEFS[resourceType]?.label || 'Fuel';
  const output = getPowerFuelOutput(resourceType);
  return `${getPowerResourceConsumption(moduleOrLevel)} ${label} = ${output}/s`;
}

export function hasPowerStationFuel(module) {
  if ((module?.type || '') !== POWER_STATION_ID) return false;
  const fuelType = module.fuelResource || 'iron';
  return (module.inventory?.[fuelType] || 0) > 0;
}

export function getPowerStationEffectiveOutput(module, linkedStorageCount = 0) {
  if ((module?.type || '') !== POWER_STATION_ID || (module.health || 0) <= 0) return 0;
  const fuelType = module.fuelResource || 'iron';
  const output = getPowerFuelOutput(fuelType);
  if (output <= 0) return 0;
  const fuelCost = getPowerResourceConsumption(module) * Math.max(0, linkedStorageCount);
  if (fuelCost <= 0) return output;
  const availableFuel = Math.max(0, module.inventory?.[fuelType] || 0);
  const fuelScale = Math.max(0, Math.min(1, availableFuel / fuelCost));
  return output * fuelScale;
}

class BuildingType {
  constructor({ id, name, panelTitle, unlockId, footprintSize, craftTimeMs }) {
    this.id = id;
    this.name = name;
    this.panelTitle = panelTitle;
    this.unlockId = unlockId;
    this.footprintSize = footprintSize;
    this.craftTimeMs = craftTimeMs;
  }

  defaultName(index = 1) {
    return `${this.name} #${index}`;
  }

  summary() {
    return [];
  }

  getStats(level = 1) {
    return { maxHealth: 0 };
  }

  cardStats(level = 1) {
    const stats = this.getStats(level);
    return [['HEALTH', fmtStat(stats.maxHealth)]];
  }

  applyDefaults(module, index = 1) {
    const stats = this.getStats(module.level || 1);
    module.name = module.name || this.defaultName(index);
    module.level = Math.max(1, module.level || 1);
    module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth || 0);
    module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
  }
}

class PoweredInventoryBuildingType extends BuildingType {
  constructor(config) {
    super(config);
    this.baseStats = config.baseStats;
    this.powerUsageByLevel = config.powerUsageByLevel || ((lvl) => this.baseStats.powerUsage);
    this.powerCapacityByLevel = config.powerCapacityByLevel || ((lvl) => this.baseStats.powerCapacity);
    this.storageCapacityByLevel = config.storageCapacityByLevel || ((lvl) => this.baseStats.storageCapacity);
  }

  getStats(level = 1) {
    const lvl = Math.max(1, Math.floor(level || 1));
    return {
      maxHealth: this.baseStats.maxHealthByLevel(lvl),
      storageCapacity: this.storageCapacityByLevel(lvl),
      powerUsage: this.powerUsageByLevel(lvl),
      powerCapacity: this.powerCapacityByLevel(lvl),
    };
  }

  applyDefaults(module, index = 1) {
    super.applyDefaults(module, index);
    const stats = this.getStats(module.level || 1);
    module.storageCapacity = Math.max(module.storageCapacity || 0, stats.storageCapacity || 0);
    module.powerUsage = Number.isFinite(module.powerUsage) ? module.powerUsage : stats.powerUsage;
    module.powerCapacity = Math.max(module.powerCapacity || 0, stats.powerCapacity || 0);
    module.power = Math.max(0, Math.min(Number.isFinite(module.power) ? module.power : module.powerCapacity, module.powerCapacity));
    module.inventory = { ...makeEmptyInventory(), ...(module.inventory || {}) };
  }
}

class StorageFacilityBuildingType extends PoweredInventoryBuildingType {
  constructor() {
    super({
      id: STORAGE_FACILITY_ID,
      name: 'Storage Facility',
      panelTitle: 'STORAGE FACILITY',
      unlockId: 'storage_facilities',
      footprintSize: 3,
      craftTimeMs: 15000,
      baseStats: {
        maxHealthByLevel: (lvl) => 10000 + ((lvl - 1) * 2500),
        storageCapacity: 50000,
        powerUsage: 1,
        powerCapacity: 1000,
      },
      storageCapacityByLevel: (lvl) => 50000 + ((lvl - 1) * 25000),
      powerCapacityByLevel: (lvl) => 1000 + ((lvl - 1) * 250),
    });
  }

  cardStats(level = 1) {
    const stats = this.getStats(level);
    return [
      ['HEALTH', fmtStat(stats.maxHealth)],
      ['STORAGE', fmtStat(stats.storageCapacity)],
      ['POWER USE', `${stats.powerUsage}/s`],
      ['POWER CAP', fmtStat(stats.powerCapacity)],
    ];
  }
}

class ResearchLabBuildingType extends PoweredInventoryBuildingType {
  constructor() {
    super({
      id: RESEARCH_LAB_ID,
      name: 'Research Lab',
      panelTitle: 'RESEARCH LAB',
      unlockId: 'research_lab',
      footprintSize: 3,
      craftTimeMs: 20000,
      baseStats: {
        maxHealthByLevel: (lvl) => 12000 + ((lvl - 1) * 2500),
        storageCapacity: 50000,
        powerUsage: 1,
        powerCapacity: 1000,
      },
      storageCapacityByLevel: (lvl) => 50000 + ((lvl - 1) * 25000),
      powerUsageByLevel: (lvl) => 1 + (lvl - 1),
      powerCapacityByLevel: (lvl) => 1000 + ((lvl - 1) * 250),
    });
  }

  cardStats(level = 1) {
    const stats = this.getStats(level);
    return [
      ['HEALTH', fmtStat(stats.maxHealth)],
      ['THROUGHPUT', 'Unlimited'],
      ['POWER USE', `${stats.powerUsage}/s`],
      ['POWER CAP', fmtStat(stats.powerCapacity)],
    ];
  }
}

class PowerStationBuildingType extends BuildingType {
  constructor() {
    super({
      id: POWER_STATION_ID,
      name: 'Power Station',
      panelTitle: 'POWER STATION',
      unlockId: 'power_station',
      footprintSize: 3,
      craftTimeMs: 18000,
    });
  }

  getStats(level = 1) {
    const lvl = Math.max(1, Math.floor(level || 1));
    return {
      maxHealth: 14000 + ((lvl - 1) * 2500),
      powerRange: Math.round(2 + (((lvl - 1) * 4) / 9)),
      resourceCapacity: 5000,
    };
  }

  cardStats(level = 1) {
    const stats = this.getStats(level);
    return [
      ['HEALTH', fmtStat(stats.maxHealth)],
      ['OUTPUT', formatPowerFuelRate('iron')],
      ['CAPACITY', fmtStat(stats.resourceCapacity)],
    ];
  }

  applyDefaults(module, index = 1) {
    super.applyDefaults(module, index);
    const stats = this.getStats(module.level || 1);
    module.powerRange = Math.max(module.powerRange || 0, stats.powerRange);
    module.resourceCapacity = Math.max(module.resourceCapacity || 0, stats.resourceCapacity);
    module.inventory = { ...makeEmptyInventory(), ...(module.inventory || {}) };
    module.fuelResource = getPowerFuelOutput(module.fuelResource) > 0 ? module.fuelResource : 'iron';
  }
}

class RelayBuildingType extends BuildingType {
  constructor(config) {
    super(config);
    this.baseHealth = config.baseHealth;
    this.healthPerLevel = config.healthPerLevel;
    this.baseRelayRange = config.baseRelayRange;
    this.relayRangeByLevel = config.relayRangeByLevel;
    this.extraCardStats = config.extraCardStats || (() => []);
  }

  getStats(level = 1) {
    const lvl = Math.max(1, Math.floor(level || 1));
    return {
      maxHealth: this.baseHealth + ((lvl - 1) * this.healthPerLevel),
      relayRange: this.relayRangeByLevel(lvl),
    };
  }

  cardStats(level = 1) {
    const stats = this.getStats(level);
    return [
      ['HEALTH', fmtStat(stats.maxHealth)],
      ['RANGE', `${stats.relayRange} tiles`],
      ...this.extraCardStats(level),
    ];
  }

  applyDefaults(module, index = 1) {
    super.applyDefaults(module, index);
    const stats = this.getStats(module.level || 1);
    module.relayRange = Math.max(module.relayRange || 0, stats.relayRange);
  }
}

class PowerPoleBuildingType extends RelayBuildingType {
  constructor() {
    super({
      id: POWER_POLE_ID,
      name: 'Power Pole',
      panelTitle: 'POWER POLE',
      unlockId: 'power_poles',
      footprintSize: 1,
      craftTimeMs: 1000,
      baseHealth: 2500,
      healthPerLevel: 500,
      baseRelayRange: 3,
      relayRangeByLevel: (lvl) => Math.round(3 + (((lvl - 1) * 7) / 9)),
      extraCardStats: () => [['TIER CAP', '10 tiles']],
    });
  }
}

class LabTowerBuildingType extends RelayBuildingType {
  constructor() {
    super({
      id: LAB_TOWER_ID,
      name: 'Lab Tower',
      panelTitle: 'LAB TOWER',
      unlockId: 'lab_tower',
      footprintSize: 1,
      craftTimeMs: 1000,
      baseHealth: 2500,
      healthPerLevel: 500,
      baseRelayRange: 3,
      relayRangeByLevel: (lvl) => Math.round(3 + (((lvl - 1) * 7) / 9)),
      extraCardStats: (level) => [['NODE TIER', `Tier ${Math.max(1, Math.floor(level || 1))}`]],
    });
  }
}

class DroneLabBuildingType extends BuildingType {
  constructor() {
    super({
      id: DRONE_LAB_ID,
      name: 'Drone Lab',
      panelTitle: 'DRONE LAB',
      unlockId: 'drone_lab',
      footprintSize: 3,
      craftTimeMs: 17000,
    });
  }

  getStats(level = 1) {
    const lvl = Math.max(1, Math.floor(level || 1));
    return {
      maxHealth: 5000 + ((lvl - 1) * 2222),
      powerUsage: 1,
      powerCapacity: 10000 + ((lvl - 1) * 2222),
      droneCapacity: 2 + ((lvl - 1) * 2),
    };
  }

  cardStats(level = 1) {
    const stats = this.getStats(level);
    return [
      ['HEALTH', fmtStat(stats.maxHealth)],
      ['POWER/DRONE', '1/s'],
      ['POWER CAP', fmtStat(stats.powerCapacity)],
      ['DRONE CAP', String(stats.droneCapacity)],
    ];
  }

  applyDefaults(module, index = 1) {
    super.applyDefaults(module, index);
    const stats = this.getStats(module.level || 1);
    module.powerUsage = Number.isFinite(module.powerUsage) ? module.powerUsage : stats.powerUsage;
    module.powerCapacity = Math.max(module.powerCapacity || 0, stats.powerCapacity);
    module.power = Math.max(0, Math.min(Number.isFinite(module.power) ? module.power : module.powerCapacity, module.powerCapacity));
    module.droneCapacity = Math.max(module.droneCapacity || 0, stats.droneCapacity);
    module.droneCount = Number.isFinite(module.droneCount) ? Math.min(Math.max(0, module.droneCount), module.droneCapacity) : 1;
  }
}

export const BUILDING_DEFS = {
  [STORAGE_FACILITY_ID]: new StorageFacilityBuildingType(),
  [RESEARCH_LAB_ID]: new ResearchLabBuildingType(),
  [POWER_STATION_ID]: new PowerStationBuildingType(),
  [POWER_POLE_ID]: new PowerPoleBuildingType(),
  [LAB_TOWER_ID]: new LabTowerBuildingType(),
  [DRONE_LAB_ID]: new DroneLabBuildingType(),
};

export function getBuildingDef(buildingType = STORAGE_FACILITY_ID) {
  return BUILDING_DEFS[buildingType] || BUILDING_DEFS[STORAGE_FACILITY_ID];
}

export function getBuildingStats(buildingType = STORAGE_FACILITY_ID, level = 1) {
  return getBuildingDef(buildingType).getStats(level);
}

export function normalizeBuilding(module, index = 1) {
  module.type = module.type || STORAGE_FACILITY_ID;
  getBuildingDef(module.type).applyDefaults(module, index);
  return module;
}

export function createBuildingInstance(moduleType, { id, col, row, index }) {
  return normalizeBuilding({ id, type: moduleType, col, row, level: 1 }, index);
}
