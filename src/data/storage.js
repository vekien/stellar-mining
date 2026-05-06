// ============================================================
// STORAGE FACILITIES — stats and footprint helpers
// ============================================================

export const STORAGE_FACILITY_ID = 'storage_facility';
export const STORAGE_FACILITY_SIZE = 3;
export const STORAGE_FACILITY_HALF = 1;

export const STORAGE_FACILITY_BASE_STATS = {
  maxHealth: 10000,
  storageCapacity: 50000,
  powerUsage: 1,
  powerCapacity: 1000,
};

export function getStorageFacilityStats(level = 1) {
  const lvl = Math.max(1, Math.floor(level || 1));
  return {
    maxHealth: STORAGE_FACILITY_BASE_STATS.maxHealth + ((lvl - 1) * 2500),
    storageCapacity: STORAGE_FACILITY_BASE_STATS.storageCapacity + ((lvl - 1) * 25000),
    powerUsage: STORAGE_FACILITY_BASE_STATS.powerUsage,
    powerCapacity: STORAGE_FACILITY_BASE_STATS.powerCapacity + ((lvl - 1) * 50),
  };
}

export function getStoragePowerUsage(storage) {
  const used = Object.values(storage?.inventory || {}).reduce((sum, n) => sum + (n || 0), 0);
  const cap = Math.max(1, storage?.storageCapacity || STORAGE_FACILITY_BASE_STATS.storageCapacity);
  const fillPct = Math.max(0, Math.min(1, used / cap));
  return 1 + (fillPct * 9);
}

export function isStorageOperational(storage) {
  return (storage?.health || 0) > 0 && (storage?.power || 0) > 0;
}

export function getStorageFootprintCells(col, row) {
  const cells = [];
  for (let dc = -STORAGE_FACILITY_HALF; dc <= STORAGE_FACILITY_HALF; dc++) {
    for (let dr = -STORAGE_FACILITY_HALF; dr <= STORAGE_FACILITY_HALF; dr++) {
      cells.push({ col: col + dc, row: row + dr });
    }
  }
  return cells;
}

export function storageContainsCell(storage, col, row) {
  return Math.abs((storage.col ?? 0) - col) <= STORAGE_FACILITY_HALF
    && Math.abs((storage.row ?? 0) - row) <= STORAGE_FACILITY_HALF;
}
