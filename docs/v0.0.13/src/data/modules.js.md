# `src/data/modules.js`

Placeable building (a.k.a. module) definitions, footprint/placement maths,
and the power & lab network solvers.

## Type ids

`STORAGE_FACILITY_ID`, `RESEARCH_LAB_ID`, `POWER_STATION_ID`,
`POWER_POLE_ID`, `LAB_TOWER_ID`, `DRONE_LAB_ID`.

## Base stats

Per type: `STORAGE_FACILITY_BASE_STATS`, `RESEARCH_LAB_BASE_STATS`,
`POWER_STATION_BASE_STATS`, `POWER_POLE_BASE_STATS`, `LAB_TOWER_BASE_STATS`,
`DRONE_LAB_BASE_STATS`.

## Power-fuel data

- `POWER_RESOURCE_CONSUMPTION = 10`, `POWER_RESOURCE_CONSUMPTION_MIN = 1`.
- `POWER_DISABLED_RESOURCES = Set('oxygen','neon','xenon')`.
- `POWER_RESOURCE_OUTPUT` — output rate per resource type if used as fuel.
- `getPowerResourceConsumption(moduleOrLevel)` — linear ramp from 10 → 1
  across tiers 1..10.
- `getPowerFuelOptions()` — list of `{ type, label, output }` for the fuel
  selector dropdown.
- `formatPowerFuelRate(type, moduleOrLevel)` — `"N Iron = M/s"`.
- `getPowerStationEffectiveOutput(station, linkedStorageCount)` — applies
  fuel-scarcity scaling.
- `hasPowerStationFuel(station)`.

## Module defs (`MODULE_DEFS`)

Each entry has:

- `id`, `name`, `panelTitle`, `unlockId`, `footprintSize`, `craftTimeMs`,
  `defaultName(index)`.
- `summary(module)` — rows for the modal's optional summary table (most
  return `[]`).
- `cardStats(level)` — `[label, value]` pairs shown on the craft card.
- `getStats(level)` — typed stats at a tier.
- `applyDefaults(module, index)` — mutates a POJO to fill in defaults.

## Type predicates

`isStorageModule`, `isResearchLabModule`, `isDroneLabModule`,
`isPoweredBuildingModule` (combines all three), `isPowerStationModule`,
`isPowerPoleModule`, `isLabTowerModule`.

## Footprint / placement

- `getModuleFootprintHalf(type)` — `floor(footprintSize / 2)`.
- `getModuleFootprintCells(type, col, row)` — generates the square of
  cells the module occupies.
- `moduleContainsCell(module, col, row)`.
- `normalizeModule(module, index)` — sets default `type` and applies the
  def's `applyDefaults`.
- `createModuleInstance(type, { id, col, row, index })`.

## Inventory helpers

- `getModuleInventoryTotal(module)`.
- `getModuleFreeCapacity(module)` — type-dependent: storage uses
  `storageCapacity`, research lab is unlimited (`MAX_SAFE_INTEGER`),
  power station uses `resourceCapacity`, others 0.
- `getPowerStationResourceFreeCapacity(module, resourceType)`.

## Networks

Two parallel BFS solvers:

### Power network

- `getPowerNetworkState(modules, turrets)` — returns `stationTargets`,
  `stationLinkedStorages`, `stationLinkedTurrets`, `stationLinkedPoles`,
  `activeEdges[]`.
- `getPowerModuleNetworkInfo(moduleId, modules, turrets)` — per-module BFS
  over active edges to enumerate linked poles/storages/stations/turrets.
- `getNoFuelNetworkIds(modules, turrets)` — set of ids whose component has
  no fueled station.

Adjacency uses Chebyshev distance + per-module range, computed by
`modulesOverlapByRange`.

### Lab network

- `getLabTowerLinkedNodes(tower, nodes, maxVisibleTier)`.
- `getLabNetworkState(modules, nodes, maxVisibleTier)` — returns
  `activeEdges[]`, `nodeEdges[]`, `labLinkedTowers`, `labLinkedResources`,
  `towerLinkedNodes`.
- `getLabModuleNetworkInfo(moduleId, modules, nodes, maxVisibleTier)`.

## Notes

- The two BFS solvers share the `addEdge` pattern and most of the BFS
  scaffolding. Strong candidate for a `Network` helper with pluggable
  adjacency and per-network reducer.
- `modulesOverlapByRange` has six branches for pairwise types. Refactor:
  each module type declares its `getLinkRadius()` and `getLinkCells()`,
  the function becomes a single Chebyshev check.
- `getModuleFreeCapacity` includes hand-rolled fallback constants
  (`STORAGE_FACILITY_BASE_STATS.storageCapacity`). Use `getModuleStats`
  instead.
- `MODULE_DEFS` is shaped exactly like a class with methods. Promotion to
  a real class hierarchy is the obvious next step.

## Inline CSS

None.

## Modularization candidates

- Promote each MODULE_DEFS entry to a `BuildingType` subclass:
  `StorageFacilityType`, `ResearchLabType`, `PowerStationType`,
  `PowerPoleType`, `LabTowerType`, `DroneLabType`. Shared `BuildingType`
  base owns `summary/cardStats/getStats/applyDefaults` defaults.
- A `BuildingInstance` (or `BuildingModule`) class wraps the runtime POJO.
- Move power/lab network solvers into `systems/networks/{power,lab}.js`,
  built on a shared `Network` core.
