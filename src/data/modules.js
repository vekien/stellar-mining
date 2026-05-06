// ============================================================
// PLACEABLE MODULES — shared module defs and helpers
// ============================================================
import { RESOURCE_DEFS, getResourceTier } from './resources.js';

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
  powerRange: 2,
  resourceCapacity: 5000,
};

const POWER_POLE_BASE_STATS = {
  maxHealth: 2500,
  relayRange: 3,
};

function makeEmptyInventory() {
  return Object.fromEntries(Object.keys(RESOURCE_DEFS).map((k) => [k, 0]));
}

export const POWER_RESOURCE_CONSUMPTION = 10;
export const POWER_DISABLED_RESOURCES = new Set(['oxygen', 'neon', 'xenon']);

const POWER_RESOURCE_OUTPUT = {
  iron: 3,
  copper: 3,
  nickel: 4,
  silicon: 5,
  cobalt: 5,
  titanium: 6,
  aluminum: 6,
  gold: 7,
  chromium: 7,
  silver: 8,
  platinum: 10,
  iridium: 11,
  palladium: 11,
  uranium: 12,
  osmium: 12,
  rhodium: 13,
  hafnium: 13,
};

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
        ['Fuel Capacity', fmtStat(module.resourceCapacity || 0)],
        ['Power Output', formatPowerFuelRate(module.fuelResource)],
        ['Operational', (module.health || 0) > 0 ? 'ONLINE' : 'OFFLINE'],
      ];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(POWER_STATION_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['OUTPUT', formatPowerFuelRate('iron')],
        ['CAPACITY', fmtStat(stats.resourceCapacity)],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: POWER_STATION_BASE_STATS.maxHealth + ((lvl - 1) * 2500),
        powerRange: Math.round(POWER_STATION_BASE_STATS.powerRange + (((lvl - 1) * 4) / 9)),
        resourceCapacity: POWER_STATION_BASE_STATS.resourceCapacity,
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(POWER_STATION_ID, module.level || 1);
      module.name = module.name || `Power Station #${index}`;
      module.level = Math.max(1, module.level || 1);
      module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth);
      module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
      module.powerRange = Math.max(module.powerRange || 0, stats.powerRange);
      module.resourceCapacity = Math.max(module.resourceCapacity || 0, stats.resourceCapacity);
      module.inventory = { ...makeEmptyInventory(), ...(module.inventory || {}) };
      module.fuelResource = getPowerFuelOutput(module.fuelResource) > 0 ? module.fuelResource : 'iron';
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

export function isPowerStationModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === POWER_STATION_ID;
}

export function isPowerPoleModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === POWER_POLE_ID;
}

export function getModuleInventoryTotal(module) {
  return Object.values(module?.inventory || {}).reduce((sum, n) => sum + (n || 0), 0);
}

export function getModuleFreeCapacity(module) {
  if (isStorageModule(module)) return Math.max(0, (module?.storageCapacity || 0) - getModuleInventoryTotal(module));
  if (isPowerStationModule(module)) return Math.max(0, (module?.resourceCapacity || 0) - getModuleInventoryTotal(module));
  return 0;
}

export function getPowerFuelOutput(resourceType) {
  return POWER_RESOURCE_OUTPUT[resourceType] || 0;
}

export function hasPowerStationFuel(module) {
  if (!isPowerStationModule(module)) return false;
  const fuelType = module.fuelResource || 'iron';
  return (module.inventory?.[fuelType] || 0) > 0;
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

export function formatPowerFuelRate(resourceType) {
  const label = RESOURCE_DEFS[resourceType]?.label || 'Fuel';
  const output = getPowerFuelOutput(resourceType);
  return `${POWER_RESOURCE_CONSUMPTION} ${label} = ${output}/s`;
}

function getPowerNodeRange(module) {
  if (isPowerStationModule(module)) return module.powerRange || 0;
  if (isPowerPoleModule(module)) return module.relayRange || 0;
  return 0;
}

function getModuleLinkRadius(module) {
  if (isStorageModule(module)) return getModuleFootprintHalf(module.type || STORAGE_FACILITY_ID);
  if (isPowerPoleModule(module)) return getPowerNodeRange(module);
  return 0;
}

function getChebyshevDistance(a, b) {
  return Math.max(Math.abs((a.col || 0) - (b.col || 0)), Math.abs((a.row || 0) - (b.row || 0)));
}

function modulesOverlapByRange(a, b) {
  const distance = getChebyshevDistance(a, b);
  if (isPowerPoleModule(a) && isPowerPoleModule(b)) return distance <= (getModuleLinkRadius(a) + getModuleLinkRadius(b));
  if (isPowerPoleModule(a) && isStorageModule(b)) {
    return getModuleFootprintCells(b.type || STORAGE_FACILITY_ID, b.col || 0, b.row || 0)
      .some((cell) => Math.max(Math.abs((a.col || 0) - cell.col), Math.abs((a.row || 0) - cell.row)) <= getModuleLinkRadius(a));
  }
  if (isPowerPoleModule(b) && isStorageModule(a)) {
    return getModuleFootprintCells(a.type || STORAGE_FACILITY_ID, a.col || 0, a.row || 0)
      .some((cell) => Math.max(Math.abs((b.col || 0) - cell.col), Math.abs((b.row || 0) - cell.row)) <= getModuleLinkRadius(b));
  }
  if (isPowerPoleModule(a)) return distance <= (getModuleLinkRadius(a) + getModuleLinkRadius(b));
  if (isPowerPoleModule(b)) return distance <= (getModuleLinkRadius(b) + getModuleLinkRadius(a));
  return false;
}

function buildPowerAdjacency(modules) {
  const adjacency = new Map();
  for (const module of modules) adjacency.set(module.id, []);
  for (let i = 0; i < modules.length; i++) {
    for (let j = i + 1; j < modules.length; j++) {
      const a = modules[i];
      const b = modules[j];
      if (!modulesOverlapByRange(a, b)) continue;
      adjacency.get(a.id).push(b.id);
      adjacency.get(b.id).push(a.id);
    }
  }
  return adjacency;
}

export function getPowerNetworkState(modules) {
  const stations = modules.filter(isPowerStationModule).filter(module => (module.health || 0) > 0);
  const poles = modules.filter(isPowerPoleModule).filter(module => (module.health || 0) > 0);
  const storages = modules.filter(isStorageModule).filter(module => (module.health || 0) > 0);
  const powerNodes = [...stations, ...poles];
  const adjacency = buildPowerAdjacency(powerNodes);
  const byId = new Map(powerNodes.map((module) => [module.id, module]));
  const stationTargets = new Map();
  const stationLinkedStorages = new Map();
  const stationLinkedPoles = new Map();
  const edgeKeys = new Set();
  const activeEdges = [];
  const reachableNodeIds = new Set();

  const addEdge = (fromId, toId) => {
    const key = [fromId, toId].sort((a, b) => a - b).join(':');
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    activeEdges.push({ fromId, toId });
  };

  for (const station of stations) {
    const queue = [{ id: station.id, path: [station.id] }];
    const visited = new Set([station.id]);
    let bestTarget = null;
    const linkedStorages = new Map();
    const linkedPoles = new Map();

    while (queue.length) {
      const current = queue.shift();
      reachableNodeIds.add(current.id);
      const node = byId.get(current.id);
      if (isPowerPoleModule(node)) linkedPoles.set(node.id, node);
      if (isPowerPoleModule(node)) {
        const candidateStorages = storages
          .filter((storage) => modulesOverlapByRange(node, storage))
          .sort((a, b) => getChebyshevDistance(node, a) - getChebyshevDistance(node, b) || a.id - b.id);
        for (const storage of candidateStorages) {
          linkedStorages.set(storage.id, storage);
          addEdge(current.id, storage.id);
        }
        if (candidateStorages.length && !bestTarget) {
          bestTarget = { storage: candidateStorages[0], path: current.path.slice() };
        }
      }
      for (const nextId of adjacency.get(current.id) || []) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        addEdge(current.id, nextId);
        queue.push({ id: nextId, path: [...current.path, nextId] });
      }
    }

    stationLinkedStorages.set(station.id, [...linkedStorages.keys()]);
    stationLinkedPoles.set(station.id, [...linkedPoles.keys()]);
    if (!bestTarget) continue;
    stationTargets.set(station.id, bestTarget.storage.id);
    for (let i = 0; i < bestTarget.path.length - 1; i++) {
      addEdge(bestTarget.path[i], bestTarget.path[i + 1]);
    }
    const lastFromId = bestTarget.path[bestTarget.path.length - 1];
    addEdge(lastFromId, bestTarget.storage.id);
  }

  return { stationTargets, stationLinkedStorages, stationLinkedPoles, activeEdges };
}

export function getPowerModuleNetworkInfo(moduleId, modules) {
  const networkState = getPowerNetworkState(modules);
  const adjacency = new Map();
  for (const edge of networkState.activeEdges) {
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, []);
    if (!adjacency.has(edge.toId)) adjacency.set(edge.toId, []);
    adjacency.get(edge.fromId).push(edge.toId);
    adjacency.get(edge.toId).push(edge.fromId);
  }
  const byId = new Map(modules.map((module) => [module.id, module]));
  const start = byId.get(moduleId);
  if (!start) return { poles: [], storages: [], stations: [] };

  const visited = new Set([moduleId]);
  const queue = [moduleId];
  const poles = [];
  const storages = [];
  const stations = [];

  while (queue.length) {
    const currentId = queue.shift();
    const module = byId.get(currentId);
    if (!module) continue;
    if (isPowerPoleModule(module) && currentId !== moduleId) poles.push(module);
    else if (isStorageModule(module)) storages.push(module);
    else if (isPowerStationModule(module) && currentId !== moduleId) stations.push(module);
    for (const nextId of adjacency.get(currentId) || []) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push(nextId);
    }
  }

  return { poles, storages, stations };
}

export function getNoFuelNetworkIds(modules) {
  const ids = new Set();
  for (const station of modules.filter(isPowerStationModule)) {
    if (hasPowerStationFuel(station)) continue;
    ids.add(station.id);
    const info = getPowerModuleNetworkInfo(station.id, modules);
    for (const pole of info.poles) ids.add(pole.id);
    for (const storage of info.storages) ids.add(storage.id);
  }
  return ids;
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
