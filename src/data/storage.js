// ============================================================
// STORAGE FACILITIES — storage-specific helpers on top of modules
// ============================================================
import {
  STORAGE_FACILITY_ID,
  isResearchLabModule,
  getModuleStats,
  getModuleFootprintHalf,
  getModuleFootprintCells,
  moduleContainsCell,
} from './modules.js';

export { STORAGE_FACILITY_ID } from './modules.js';

export const STORAGE_FACILITY_SIZE = 3;
export const STORAGE_FACILITY_HALF = getModuleFootprintHalf(STORAGE_FACILITY_ID);

export function getStorageFacilityStats(level = 1) {
  return getModuleStats(STORAGE_FACILITY_ID, level);
}

export function getStoragePowerUsage(storage) {
  if (isResearchLabModule(storage)) return Math.max(0, storage?.powerUsage || 1);
  const used = Object.values(storage?.inventory || {}).reduce((sum, n) => sum + (n || 0), 0);
  const cap = Math.max(1, storage?.storageCapacity || STORAGE_FACILITY_BASE_STATS.storageCapacity);
  const fillPct = Math.max(0, Math.min(1, used / cap));
  return 1 + (fillPct * 9);
}

export function isStorageOperational(storage) {
  return (storage?.health || 0) > 0 && (storage?.power || 0) > 0;
}

export function getStorageFootprintCells(col, row) {
  return getModuleFootprintCells(STORAGE_FACILITY_ID, col, row);
}

export function storageContainsCell(storage, col, row) {
  return moduleContainsCell(storage, col, row);
}
