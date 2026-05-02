// ============================================================
// TURRET DATA — base stats, upgrade deltas, costs
// ============================================================

// Base stats for a freshly placed turret (level 1)
export const TURRET_BASE_STATS = {
  health:  5000,
  damage:  100,
  range:   6,   // tiles (note: placed at range=2 in grid coords, displayed as 6)
};

// Per-level upgrade deltas applied on each upgrade purchase
export const TURRET_UPGRADE_DELTA = {
  health: 500,
  damage: 20,
  range:  1,
};

// Hard cap on turret range regardless of upgrade level
export const TURRET_MAX_RANGE = 12;

// Scrap refund on first build (base refund, coins)
export const TURRET_SCRAP_BASE_COINS   = 500;
// Extra scrap coins per level above 1 (multiplied by level index)
export const TURRET_SCRAP_COINS_PER_LEVEL = 200;
// Fixed resource refund on scrap
export const TURRET_SCRAP_IRON   = 10;
export const TURRET_SCRAP_COPPER = 5;

// Upgrade cost base values — scale at call-site by turret.level
// (coins = costPerLevel * turret.level; resources scale the same way)
export const TURRET_UPGRADE_COST_PER_LEVEL = {
  coins:    3600,
  iron:     108,
  copper:   84,
  oxygen:   54,
  silicon:  54,
  titanium: 30,
};

// Build cost (mirrors crafts.js entry — single source of truth here)
export const TURRET_BUILD_COST = {
  coins:    6000,
  iron:     180,
  copper:   140,
  oxygen:   90,
  silicon:  90,
  titanium: 50,
};

// ── Future turret types go here ──────────────────────────────
// export const HEAVY_TURRET_BASE_STATS = { ... };
