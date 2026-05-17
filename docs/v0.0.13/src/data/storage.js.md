# `src/data/storage.js`

Storage-facility helpers built on top of `modules.js`. Thin module — most
of the storage logic lives in `modules.js` now.

## Exports

- `STORAGE_FACILITY_ID` — re-exported from `modules.js`.
- `STORAGE_FACILITY_SIZE = 3`.
- `STORAGE_FACILITY_HALF = 1` — `getModuleFootprintHalf` for storage.
- `getStorageFacilityStats(level)` — alias for
  `getModuleStats(STORAGE_FACILITY_ID, level)`.
- `getStoragePowerUsage(storage)` — type-aware power draw:
  - `isResearchLabModule` → `module.powerUsage || 1`.
  - `isDroneLabModule` → `max(1, droneCount)` (1/s per drone).
  - default (storage facility) → `1 + fillPct × 9`.
- `isStorageOperational(storage)` — `health > 0 && power > 0`.
- `getStorageFootprintCells(col, row)` — alias for
  `getModuleFootprintCells(STORAGE_FACILITY_ID, …)`.
- `storageContainsCell(storage, col, row)` — alias for
  `moduleContainsCell`.

## Notes

- Almost everything here aliases a function in `modules.js`. Either delete
  the aliases or rename this file to `data/poweredBuildings.js` where
  `getStoragePowerUsage` belongs (since it now also serves research lab
  and drone lab).
- The fallback cap of `50000` in `getStoragePowerUsage` is a magic number;
  derive from `getModuleStats(STORAGE_FACILITY_ID, 1).storageCapacity`.

## Inline CSS

None.

## Modularization candidates

- Fold this file into `modules.js` or `systems/power.js`. The aliases add
  no value.
