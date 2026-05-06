// ============================================================
// PLACEABLE MODULES — shared module defs and helpers
// ============================================================
import { RESOURCE_DEFS } from './resources.js';

export const STORAGE_FACILITY_ID = 'storage_facility';
export const POWER_STATION_ID = 'power_station';
export const POWER_POLE_ID = 'power_pole';

const STORAGE_FACILITY_BASE_STATS = {
  maxHealth: 10000,
  storageCapacity: 50000,
  powerUsage: 1,
  powerCapacity: 1000,
};

const POWER_STATION_BASE_STATS = {
  maxHealth: 14000,
  powerOutput: 250,
  powerRange: 2,
};

const POWER_POLE_BASE_STATS = {
  maxHealth: 2500,
  relayRange: 3,
};

function makeEmptyInventory() {
  return Object.fromEntries(Object.keys(RESOURCE_DEFS).map((k) => [k, 0]));
}

export const MODULE_DEFS = {
  [STORAGE_FACILITY_ID]: {
    id: STORAGE_FACILITY_ID,
    name: 'Storage Facility',
    panelTitle: 'STORAGE FACILITY',
    unlockId: 'storage_facilities',
    footprintSize: 3,
    craftTimeMs: 15000,
    defaultName: (index) => `Storage Facility #${index}`,
    summary(module) {
      return [
        ['Storage Capacity', module.storageCapacity],
        ['Operational', ((module.health || 0) > 0 && (module.power || 0) > 0) ? 'ONLINE' : 'OFFLINE'],
      ];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(STORAGE_FACILITY_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['STORAGE', fmtStat(stats.storageCapacity)],
        ['POWER USE', `${stats.powerUsage}/s`],
        ['POWER CAP', fmtStat(stats.powerCapacity)],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: STORAGE_FACILITY_BASE_STATS.maxHealth + ((lvl - 1) * 2500),
        storageCapacity: STORAGE_FACILITY_BASE_STATS.storageCapacity + ((lvl - 1) * 25000),
        powerUsage: STORAGE_FACILITY_BASE_STATS.powerUsage,
        powerCapacity: STORAGE_FACILITY_BASE_STATS.powerCapacity + ((lvl - 1) * 50),
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(STORAGE_FACILITY_ID, module.level || 1);
      module.name = module.name || `Storage Facility #${index}`;
      module.level = Math.max(1, module.level || 1);
      module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth);
      module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
      module.storageCapacity = Math.max(module.storageCapacity || 0, stats.storageCapacity);
      module.powerUsage = Number.isFinite(module.powerUsage) ? module.powerUsage : stats.powerUsage;
      module.powerCapacity = Math.max(module.powerCapacity || 0, stats.powerCapacity);
      module.power = Math.max(0, Math.min(Number.isFinite(module.power) ? module.power : module.powerCapacity, module.powerCapacity));
      module.inventory = { ...makeEmptyInventory(), ...(module.inventory || {}) };
    },
  },
  [POWER_STATION_ID]: {
    id: POWER_STATION_ID,
    name: 'Power Station',
    panelTitle: 'POWER STATION',
    unlockId: 'power_station',
    footprintSize: 1,
    craftTimeMs: 18000,
    defaultName: (index) => `Power Station #${index}`,
    summary(module) {
      return [
        ['Power Output', `${fmtStat(module.powerOutput || 0)}/s`],
        ['Power Range', `${module.powerRange || 0} tiles`],
        ['Operational', (module.health || 0) > 0 ? 'ONLINE' : 'OFFLINE'],
      ];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(POWER_STATION_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['OUTPUT', `${fmtStat(stats.powerOutput)}/s`],
        ['RANGE', `${stats.powerRange} tiles`],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: POWER_STATION_BASE_STATS.maxHealth + ((lvl - 1) * 2500),
        powerOutput: POWER_STATION_BASE_STATS.powerOutput + ((lvl - 1) * 50),
        powerRange: Math.round(POWER_STATION_BASE_STATS.powerRange + (((lvl - 1) * 4) / 9)),
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(POWER_STATION_ID, module.level || 1);
      module.name = module.name || `Power Station #${index}`;
      module.level = Math.max(1, module.level || 1);
      module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth);
      module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
      module.powerOutput = Math.max(module.powerOutput || 0, stats.powerOutput);
      module.powerRange = Math.max(module.powerRange || 0, stats.powerRange);
    },
  },
  [POWER_POLE_ID]: {
    id: POWER_POLE_ID,
    name: 'Power Pole',
    panelTitle: 'POWER POLE',
    unlockId: 'power_poles',
    footprintSize: 1,
    craftTimeMs: 6000,
    defaultName: (index) => `Power Pole #${index}`,
    summary(module) {
      return [
        ['Relay Range', `${module.relayRange || 0} tiles`],
        ['Operational', (module.health || 0) > 0 ? 'ONLINE' : 'OFFLINE'],
      ];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(POWER_POLE_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['RANGE', `${stats.relayRange} tiles`],
        ['TIER CAP', '10 tiles'],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: POWER_POLE_BASE_STATS.maxHealth + ((lvl - 1) * 500),
        relayRange: Math.round(POWER_POLE_BASE_STATS.relayRange + (((lvl - 1) * 7) / 9)),
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(POWER_POLE_ID, module.level || 1);
      module.name = module.name || `Power Pole #${index}`;
      module.level = Math.max(1, module.level || 1);
      module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth);
      module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
      module.relayRange = Math.max(module.relayRange || 0, stats.relayRange);
    },
  },
};

function fmtStat(value) {
  return Number.isFinite(value) ? value.toLocaleString() : String(value);
}

export function getModuleDef(moduleType = STORAGE_FACILITY_ID) {
  return MODULE_DEFS[moduleType] || MODULE_DEFS[STORAGE_FACILITY_ID];
}

export function getModuleStats(moduleType = STORAGE_FACILITY_ID, level = 1) {
  return getModuleDef(moduleType).getStats(level);
}

export function isStorageModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === STORAGE_FACILITY_ID;
}

export function getModuleFootprintHalf(moduleType = STORAGE_FACILITY_ID) {
  return Math.floor((getModuleDef(moduleType).footprintSize || 1) / 2);
}

export function getModuleFootprintCells(moduleType = STORAGE_FACILITY_ID, col, row) {
  const half = getModuleFootprintHalf(moduleType);
  const cells = [];
  for (let dc = -half; dc <= half; dc++) {
    for (let dr = -half; dr <= half; dr++) {
      cells.push({ col: col + dc, row: row + dr });
    }
  }
  return cells;
}

export function moduleContainsCell(module, col, row) {
  const half = getModuleFootprintHalf(module?.type || STORAGE_FACILITY_ID);
  return Math.abs((module.col ?? 0) - col) <= half
    && Math.abs((module.row ?? 0) - row) <= half;
}

export function normalizeModule(module, index = 1) {
  module.type = module.type || STORAGE_FACILITY_ID;
  const def = getModuleDef(module.type);
  def.applyDefaults(module, index);
  return module;
}

export function createModuleInstance(moduleType, { id, col, row, index }) {
  return normalizeModule({ id, type: moduleType, col, row, level: 1 }, index);
}
