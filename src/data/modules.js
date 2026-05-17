// ============================================================
// PLACEABLE MODULES — shared module defs and helpers
// ============================================================
import { RESOURCE_DEFS, getResourceTier } from './resources.js';

export const STORAGE_FACILITY_ID = 'storage_facility';
export const POWER_STATION_ID = 'power_station';
export const POWER_POLE_ID = 'power_pole';
export const RESEARCH_LAB_ID = 'research_lab';
export const LAB_TOWER_ID = 'lab_tower';
export const DRONE_LAB_ID = 'drone_lab';

const STORAGE_FACILITY_BASE_STATS = {
  maxHealth: 10000,
  storageCapacity: 50000,
  powerUsage: 1,
  powerCapacity: 1000,
};

const RESEARCH_LAB_BASE_STATS = {
  maxHealth: 12000,
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

const LAB_TOWER_BASE_STATS = {
  maxHealth: 2500,
  relayRange: 3,
};

const DRONE_LAB_BASE_STATS = {
  maxHealth: 5000,
  powerUsage: 1,
  powerCapacity: 10000,
  droneCapacity: 2,
};

function makeEmptyInventory() {
  return Object.fromEntries(Object.keys(RESOURCE_DEFS).map((k) => [k, 0]));
}

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
      return [];
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
        powerCapacity: STORAGE_FACILITY_BASE_STATS.powerCapacity + ((lvl - 1) * 250),
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
  [RESEARCH_LAB_ID]: {
    id: RESEARCH_LAB_ID,
    name: 'Research Lab',
    panelTitle: 'RESEARCH LAB',
    unlockId: 'research_lab',
    footprintSize: 3,
    craftTimeMs: 20000,
    defaultName: (index) => `Research Lab #${index}`,
    summary(module) {
      return [];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(RESEARCH_LAB_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['THROUGHPUT', 'Unlimited'],
        ['POWER USE', `${stats.powerUsage}/s`],
        ['POWER CAP', fmtStat(stats.powerCapacity)],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: RESEARCH_LAB_BASE_STATS.maxHealth + ((lvl - 1) * 2500),
        storageCapacity: RESEARCH_LAB_BASE_STATS.storageCapacity + ((lvl - 1) * 25000),
        powerUsage: RESEARCH_LAB_BASE_STATS.powerUsage + (lvl - 1),
        powerCapacity: RESEARCH_LAB_BASE_STATS.powerCapacity + ((lvl - 1) * 250),
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(RESEARCH_LAB_ID, module.level || 1);
      module.name = module.name || `Research Lab #${index}`;
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
    footprintSize: 3,
    craftTimeMs: 18000,
    defaultName: (index) => `Power Station #${index}`,
    summary(module) {
      return [];
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
    craftTimeMs: 1000,
    defaultName: (index) => `Power Pole #${index}`,
    summary(module) {
      return [];
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
  [LAB_TOWER_ID]: {
    id: LAB_TOWER_ID,
    name: 'Lab Tower',
    panelTitle: 'LAB TOWER',
    unlockId: 'lab_tower',
    footprintSize: 1,
    craftTimeMs: 1000,
    defaultName: (index) => `Lab Tower #${index}`,
    summary(module) {
      return [];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(LAB_TOWER_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['RANGE', `${stats.relayRange} tiles`],
        ['NODE TIER', `Tier ${Math.max(1, Math.floor(level || 1))}`],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: LAB_TOWER_BASE_STATS.maxHealth + ((lvl - 1) * 500),
        relayRange: Math.round(LAB_TOWER_BASE_STATS.relayRange + (((lvl - 1) * 7) / 9)),
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(LAB_TOWER_ID, module.level || 1);
      module.name = module.name || `Lab Tower #${index}`;
      module.level = Math.max(1, module.level || 1);
      module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth);
      module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
      module.relayRange = Math.max(module.relayRange || 0, stats.relayRange);
    },
  },
  [DRONE_LAB_ID]: {
    id: DRONE_LAB_ID,
    name: 'Drone Lab',
    panelTitle: 'DRONE LAB',
    unlockId: 'drone_lab',
    footprintSize: 3,
    craftTimeMs: 17000,
    defaultName: (index) => `Drone Lab #${index}`,
    summary(module) {
      return [];
    },
    cardStats(level = 1) {
      const stats = getModuleStats(DRONE_LAB_ID, level);
      return [
        ['HEALTH', fmtStat(stats.maxHealth)],
        ['POWER/DRONE', '1/s'],
        ['POWER CAP', fmtStat(stats.powerCapacity)],
        ['DRONE CAP', String(stats.droneCapacity)],
      ];
    },
    getStats(level = 1) {
      const lvl = Math.max(1, Math.floor(level || 1));
      return {
        maxHealth: DRONE_LAB_BASE_STATS.maxHealth + ((lvl - 1) * 2222),
        powerUsage: DRONE_LAB_BASE_STATS.powerUsage,
        powerCapacity: DRONE_LAB_BASE_STATS.powerCapacity + ((lvl - 1) * 2222),
        droneCapacity: DRONE_LAB_BASE_STATS.droneCapacity + ((lvl - 1) * 2),
      };
    },
    applyDefaults(module, index = 1) {
      const stats = getModuleStats(DRONE_LAB_ID, module.level || 1);
      module.name = module.name || `Drone Lab #${index}`;
      module.level = Math.max(1, module.level || 1);
      module.maxHealth = Math.max(module.maxHealth || 0, stats.maxHealth);
      module.health = Math.min(module.health ?? module.maxHealth, module.maxHealth);
      module.powerUsage = Number.isFinite(module.powerUsage) ? module.powerUsage : stats.powerUsage;
      module.powerCapacity = Math.max(module.powerCapacity || 0, stats.powerCapacity);
      module.power = Math.max(0, Math.min(Number.isFinite(module.power) ? module.power : module.powerCapacity, module.powerCapacity));
      module.droneCapacity = Math.max(module.droneCapacity || 0, stats.droneCapacity);
      // Initialize droneCount: default to 1 (free drone) if not yet set
      module.droneCount = Number.isFinite(module.droneCount) ? Math.min(Math.max(0, module.droneCount), module.droneCapacity) : 1;
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

export function isResearchLabModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === RESEARCH_LAB_ID;
}

export function isPoweredBuildingModule(moduleOrType) {
  return isStorageModule(moduleOrType) || isResearchLabModule(moduleOrType) || isDroneLabModule(moduleOrType);
}

export function isPowerStationModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === POWER_STATION_ID;
}

export function isPowerPoleModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === POWER_POLE_ID;
}

export function isLabTowerModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === LAB_TOWER_ID;
}

export function isDroneLabModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === DRONE_LAB_ID;
}

export function getModuleInventoryTotal(module) {
  return Object.values(module?.inventory || {}).reduce((sum, n) => sum + (n || 0), 0);
}

export function getModuleFreeCapacity(module) {
  if (isStorageModule(module)) return Math.max(0, (module?.storageCapacity || 0) - getModuleInventoryTotal(module));
  if (isResearchLabModule(module)) return Number.MAX_SAFE_INTEGER;
  if (isPowerStationModule(module)) return Math.max(0, (module?.resourceCapacity || 0) - getModuleInventoryTotal(module));
  return 0;
}

export function getPowerStationResourceFreeCapacity(module, resourceType) {
  if (!isPowerStationModule(module) || !resourceType) return 0;
  return Math.max(0, (module?.resourceCapacity || 0) - (module?.inventory?.[resourceType] || 0));
}

export function getPowerFuelOutput(resourceType) {
  return POWER_RESOURCE_OUTPUT[resourceType] || 0;
}

export function hasPowerStationFuel(module) {
  if (!isPowerStationModule(module)) return false;
  const fuelType = module.fuelResource || 'iron';
  return (module.inventory?.[fuelType] || 0) > 0;
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

export function getPowerStationEffectiveOutput(module, linkedStorageCount = 0) {
  if (!isPowerStationModule(module) || (module.health || 0) <= 0) return 0;
  const fuelType = module.fuelResource || 'iron';
  const output = getPowerFuelOutput(fuelType);
  if (output <= 0) return 0;
  const fuelCost = getPowerResourceConsumption(module) * Math.max(0, linkedStorageCount);
  if (fuelCost <= 0) return output;
  const availableFuel = Math.max(0, module.inventory?.[fuelType] || 0);
  const fuelScale = Math.max(0, Math.min(1, availableFuel / fuelCost));
  return output * fuelScale;
}

function getPowerNodeRange(module) {
  if (isPowerStationModule(module)) return module.powerRange || 0;
  if (isPowerPoleModule(module)) return module.relayRange || 0;
  return 0;
}

function getLabNodeRange(module) {
  if (isLabTowerModule(module)) return module.relayRange || 0;
  return 0;
}

function getModuleLinkRadius(module) {
  if (isPoweredBuildingModule(module) || isPowerStationModule(module)) return getModuleFootprintHalf(module.type || STORAGE_FACILITY_ID);
  if (isPowerPoleModule(module)) return getPowerNodeRange(module);
  return 0;
}

function getChebyshevDistance(a, b) {
  return Math.max(Math.abs((a.col || 0) - (b.col || 0)), Math.abs((a.row || 0) - (b.row || 0)));
}

function modulesOverlapByRange(a, b) {
  const distance = getChebyshevDistance(a, b);
  if (isPowerPoleModule(a) && isPowerPoleModule(b)) return distance <= (getModuleLinkRadius(a) + getModuleLinkRadius(b));
  if (isPowerPoleModule(a) && (isPoweredBuildingModule(b) || isPowerStationModule(b))) {
    return getModuleFootprintCells(b.type || STORAGE_FACILITY_ID, b.col || 0, b.row || 0)
      .some((cell) => Math.max(Math.abs((a.col || 0) - cell.col), Math.abs((a.row || 0) - cell.row)) <= getModuleLinkRadius(a));
  }
  if (isPowerPoleModule(b) && (isPoweredBuildingModule(a) || isPowerStationModule(a))) {
    return getModuleFootprintCells(a.type || STORAGE_FACILITY_ID, a.col || 0, a.row || 0)
      .some((cell) => Math.max(Math.abs((b.col || 0) - cell.col), Math.abs((b.row || 0) - cell.row)) <= getModuleLinkRadius(b));
  }
  if (isPowerPoleModule(a)) return distance <= (getModuleLinkRadius(a) + getModuleLinkRadius(b));
  if (isPowerPoleModule(b)) return distance <= (getModuleLinkRadius(b) + getModuleLinkRadius(a));
  return false;
}

function modulesOverlapByLabRange(a, b) {
  const distance = getChebyshevDistance(a, b);
  if (isLabTowerModule(a) && isLabTowerModule(b)) return distance <= (getLabNodeRange(a) + getLabNodeRange(b));
  if (isLabTowerModule(a) && isResearchLabModule(b)) {
    return getModuleFootprintCells(b.type || RESEARCH_LAB_ID, b.col || 0, b.row || 0)
      .some((cell) => Math.max(Math.abs((a.col || 0) - cell.col), Math.abs((a.row || 0) - cell.row)) <= getLabNodeRange(a));
  }
  if (isLabTowerModule(b) && isResearchLabModule(a)) {
    return getModuleFootprintCells(a.type || RESEARCH_LAB_ID, a.col || 0, a.row || 0)
      .some((cell) => Math.max(Math.abs((b.col || 0) - cell.col), Math.abs((b.row || 0) - cell.row)) <= getLabNodeRange(b));
  }
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

export function getPowerNetworkState(modules, turrets = []) {
  const stations = modules.filter(isPowerStationModule).filter(module => (module.health || 0) > 0);
  const poles = modules.filter(isPowerPoleModule).filter(module => (module.health || 0) > 0);
  const storages = modules.filter(isPoweredBuildingModule).filter(module => (module.health || 0) > 0);
  const activeTurrets = (turrets || []).filter((turret) => (turret?.health || 0) > 0);
  const powerNodes = [...stations, ...poles];
  const adjacency = buildPowerAdjacency(powerNodes);
  const byId = new Map(powerNodes.map((module) => [module.id, module]));
  const stationTargets = new Map();
  const stationLinkedStorages = new Map();
  const stationLinkedTurrets = new Map();
  const stationLinkedPoles = new Map();
  const edgeKeys = new Set();
  const activeEdges = [];

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
    const linkedTurrets = new Map();
    const linkedPoles = new Map();

    while (queue.length) {
      const current = queue.shift();
      const node = byId.get(current.id);
      if (!node) continue;
      if (isPowerPoleModule(node)) linkedPoles.set(node.id, node);
      if (isPowerPoleModule(node) || isPowerStationModule(node)) {
        const candidateStorages = storages
          .filter((storage) => modulesOverlapByRange(node, storage))
          .sort((a, b) => getChebyshevDistance(node, a) - getChebyshevDistance(node, b) || a.id - b.id);
        for (const storage of candidateStorages) {
          linkedStorages.set(storage.id, storage);
          addEdge(current.id, storage.id);
        }
        const nodeRange = getPowerNodeRange(node);
        const candidateTurrets = activeTurrets
          .filter((turret) => Math.max(Math.abs((node.col || 0) - (turret.col || 0)), Math.abs((node.row || 0) - (turret.row || 0))) <= nodeRange)
          .sort((a, b) => getChebyshevDistance(node, a) - getChebyshevDistance(node, b) || a.id - b.id);
        for (const turret of candidateTurrets) {
          linkedTurrets.set(turret.id, turret);
          addEdge(current.id, turret.id);
        }
        if (!bestTarget) {
          const bestConsumer = candidateStorages[0] || candidateTurrets[0] || null;
          if (bestConsumer) bestTarget = { targetId: bestConsumer.id, path: current.path.slice() };
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
    stationLinkedTurrets.set(station.id, [...linkedTurrets.keys()]);
    stationLinkedPoles.set(station.id, [...linkedPoles.keys()]);
    if (!bestTarget) continue;
    stationTargets.set(station.id, bestTarget.targetId);
    for (let i = 0; i < bestTarget.path.length - 1; i++) {
      addEdge(bestTarget.path[i], bestTarget.path[i + 1]);
    }
    const lastFromId = bestTarget.path[bestTarget.path.length - 1];
    addEdge(lastFromId, bestTarget.targetId);
  }

  return { stationTargets, stationLinkedStorages, stationLinkedTurrets, stationLinkedPoles, activeEdges };
}

export function getPowerModuleNetworkInfo(moduleId, modules, turrets = []) {
  const networkState = getPowerNetworkState(modules, turrets);
  const adjacency = new Map();
  for (const edge of networkState.activeEdges) {
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, []);
    if (!adjacency.has(edge.toId)) adjacency.set(edge.toId, []);
    adjacency.get(edge.fromId).push(edge.toId);
    adjacency.get(edge.toId).push(edge.fromId);
  }
  const byId = new Map([...modules, ...(turrets || [])].map((module) => [module.id, module]));
  const start = byId.get(moduleId);
  const turretIds = new Set((turrets || []).map((turret) => turret.id));
  if (!start) return { poles: [], storages: [], stations: [], turrets: [] };

  const visited = new Set([moduleId]);
  const queue = [moduleId];
  const poles = [];
  const storages = [];
  const stations = [];
  const linkedTurrets = [];

  while (queue.length) {
    const currentId = queue.shift();
    const module = byId.get(currentId);
    if (!module) continue;
    if (isPowerPoleModule(module) && currentId !== moduleId) poles.push(module);
    else if (isPoweredBuildingModule(module)) storages.push(module);
    else if (isPowerStationModule(module) && currentId !== moduleId) stations.push(module);
    else if (turretIds.has(currentId) && currentId !== moduleId) linkedTurrets.push(module);
    for (const nextId of adjacency.get(currentId) || []) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push(nextId);
    }
  }

  return { poles, storages, stations, turrets: linkedTurrets };
}

export function getLabTowerLinkedNodes(tower, nodes, maxVisibleTier = Number.MAX_SAFE_INTEGER) {
  if (!isLabTowerModule(tower) || (tower.health || 0) <= 0) return [];
  const towerTier = Math.max(1, Math.floor(tower.level || 1));
  const towerRange = tower.relayRange || 0;
  return (nodes || []).filter((node) => {
    if (!node || (node.minLevel || 0) > maxVisibleTier) return false;
    if ((getResourceTier(node.type) || 0) > towerTier) return false;
    return Math.max(Math.abs((tower.col || 0) - node.gr[0]), Math.abs((tower.row || 0) - node.gr[1])) <= towerRange;
  });
}

export function getLabNetworkState(modules, nodes, maxVisibleTier = Number.MAX_SAFE_INTEGER) {
  const labs = modules.filter(isResearchLabModule).filter((module) => (module.health || 0) > 0);
  const towers = modules.filter(isLabTowerModule).filter((module) => (module.health || 0) > 0);
  const labNodes = [...labs, ...towers];
  const adjacency = new Map();
  for (const module of labNodes) adjacency.set(module.id, []);
  for (let i = 0; i < labNodes.length; i++) {
    for (let j = i + 1; j < labNodes.length; j++) {
      const a = labNodes[i];
      const b = labNodes[j];
      if (!modulesOverlapByLabRange(a, b)) continue;
      adjacency.get(a.id).push(b.id);
      adjacency.get(b.id).push(a.id);
    }
  }

  const byId = new Map(labNodes.map((module) => [module.id, module]));
  const labLinkedTowers = new Map();
  const labLinkedResources = new Map();
  const towerLinkedNodes = new Map();
  const edgeKeys = new Set();
  const activeEdges = [];
  const nodeEdgeKeys = new Set();
  const nodeEdges = [];
  const addEdge = (fromId, toId) => {
    const key = [fromId, toId].sort((a, b) => a - b).join(':');
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    activeEdges.push({ fromId, toId });
  };
  const addNodeEdge = (towerId, node) => {
    const key = `${towerId}:${node.id}`;
    if (nodeEdgeKeys.has(key)) return;
    nodeEdgeKeys.add(key);
    nodeEdges.push({ towerId, nodeId: node.id, nodeCol: node.gr[0], nodeRow: node.gr[1], resourceType: node.type });
  };

  for (const lab of labs) {
    const queue = [lab.id];
    const visited = new Set([lab.id]);
    const linkedTowers = new Map();
    const linkedResources = [];
    while (queue.length) {
      const currentId = queue.shift();
      const current = byId.get(currentId);
      if (isLabTowerModule(current)) {
        linkedTowers.set(current.id, current);
        const linkedNodes = getLabTowerLinkedNodes(current, nodes, maxVisibleTier);
        towerLinkedNodes.set(current.id, linkedNodes.map((node) => node.id));
        for (const node of linkedNodes) {
          linkedResources.push({ towerId: current.id, towerName: current.name, node });
          addNodeEdge(current.id, node);
        }
      }
      for (const nextId of adjacency.get(currentId) || []) {
        addEdge(currentId, nextId);
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }
    labLinkedTowers.set(lab.id, [...linkedTowers.keys()]);
    labLinkedResources.set(lab.id, linkedResources);
  }

  return { adjacency, activeEdges, nodeEdges, labLinkedTowers, labLinkedResources, towerLinkedNodes };
}

export function getLabModuleNetworkInfo(moduleId, modules, nodes, maxVisibleTier = Number.MAX_SAFE_INTEGER) {
  const networkState = getLabNetworkState(modules, nodes, maxVisibleTier);
  const byId = new Map(modules.map((module) => [module.id, module]));
  const start = byId.get(moduleId);
  if (!start) return { labs: [], towers: [], resources: [] };
  const visited = new Set([moduleId]);
  const queue = [moduleId];
  const labs = [];
  const towers = [];
  while (queue.length) {
    const currentId = queue.shift();
    const module = byId.get(currentId);
    if (!module) continue;
    if (isResearchLabModule(module) && currentId !== moduleId) labs.push(module);
    else if (isLabTowerModule(module) && currentId !== moduleId) towers.push(module);
    for (const nextId of networkState.adjacency.get(currentId) || []) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push(nextId);
    }
  }

  const reachableTowerIds = new Set(
    isLabTowerModule(start)
      ? [start.id, ...towers.map((tower) => tower.id)]
      : (networkState.labLinkedTowers.get(start.id) || [])
  );
  const resources = [];
  for (const towerId of reachableTowerIds) {
    const tower = byId.get(towerId);
    for (const nodeId of networkState.towerLinkedNodes.get(towerId) || []) {
      const node = (nodes || []).find((entry) => entry.id === nodeId);
      if (tower && node) resources.push({ tower, node });
    }
  }
  return { labs, towers, resources };
}

export function getNoFuelNetworkIds(modules, turrets = []) {
  const ids = new Set();
  const relevant = [...modules.filter((module) =>
    (isPowerStationModule(module) || isPowerPoleModule(module) || isPoweredBuildingModule(module))
    && (module.health || 0) > 0
  ), ...(turrets || []).filter((turret) => (turret?.health || 0) > 0)];
  const byId = new Map(relevant.map((module) => [module.id, module]));
  const adjacency = new Map(relevant.map((module) => [module.id, []]));
  for (const edge of getPowerNetworkState(modules, turrets).activeEdges) {
    if (!adjacency.has(edge.fromId) || !adjacency.has(edge.toId)) continue;
    adjacency.get(edge.fromId).push(edge.toId);
    adjacency.get(edge.toId).push(edge.fromId);
  }

  const visited = new Set();
  for (const module of relevant) {
    if (visited.has(module.id)) continue;
    const queue = [module.id];
    const component = [];
    visited.add(module.id);
    while (queue.length) {
      const currentId = queue.shift();
      component.push(currentId);
      for (const nextId of adjacency.get(currentId) || []) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }

    const stations = component
      .map((id) => byId.get(id))
      .filter((entry) => entry && isPowerStationModule(entry));
    const fueledStations = stations.filter((station) => hasPowerStationFuel(station));
    const offlineStations = stations.filter((station) => !hasPowerStationFuel(station));

    for (const station of offlineStations) ids.add(station.id);
    if (stations.length > 0 && fueledStations.length === 0) {
      for (const id of component) ids.add(id);
    }
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
