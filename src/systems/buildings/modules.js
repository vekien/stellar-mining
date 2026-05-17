// ============================================================
// PLACEABLE MODULES — shared helpers + network solvers
// ============================================================
import { getResourceTier } from '../../data/resources.js';
import {
  BUILDING_DEFS,
  DRONE_LAB_ID,
  LAB_TOWER_ID,
  POWER_DISABLED_RESOURCES,
  POWER_POLE_ID,
  POWER_RESOURCE_CONSUMPTION,
  POWER_RESOURCE_CONSUMPTION_MIN,
  POWER_STATION_ID,
  RESEARCH_LAB_ID,
  STORAGE_FACILITY_ID,
  createBuildingInstance,
  formatPowerFuelRate,
  getBuildingDef,
  getBuildingStats,
  getPowerFuelOptions,
  getPowerFuelOutput,
  getPowerResourceConsumption,
  getPowerStationEffectiveOutput,
  hasPowerStationFuel,
  makeEmptyInventory,
  normalizeBuilding,
} from './definitions.js';

export {
  DRONE_LAB_ID,
  LAB_TOWER_ID,
  POWER_DISABLED_RESOURCES,
  POWER_POLE_ID,
  POWER_RESOURCE_CONSUMPTION,
  POWER_RESOURCE_CONSUMPTION_MIN,
  POWER_STATION_ID,
  RESEARCH_LAB_ID,
  STORAGE_FACILITY_ID,
  createBuildingInstance as createModuleInstance,
  formatPowerFuelRate,
  getPowerFuelOptions,
  getPowerFuelOutput,
  getPowerResourceConsumption,
  getPowerStationEffectiveOutput,
  hasPowerStationFuel,
  makeEmptyInventory,
};

export const MODULE_DEFS = BUILDING_DEFS;

export function getModuleDef(moduleType = STORAGE_FACILITY_ID) {
  return getBuildingDef(moduleType);
}

export function getModuleStats(moduleType = STORAGE_FACILITY_ID, level = 1) {
  return getBuildingStats(moduleType, level);
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
  return normalizeBuilding(module, index);
}
