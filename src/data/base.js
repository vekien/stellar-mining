// ============================================================
// BASE STATION DATA — upgrade costs, ship capacity, range
// ============================================================

// Coin cost to upgrade to each level (index = target level)
// Index 0 unused; index 1 = cost to reach level 1 (free), etc.
export const BASE_UPGRADE_COSTS = [0, 10000, 14000, 19600, 27440, 38416, 53782, 75295, 105413, 147578];

// Maximum number of ships at each base level (index = level - 1)
export const BASE_MAX_SHIPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

// Mining/turret range in tiles each direction from base (index = level - 1)
export const BASE_RANGE = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
