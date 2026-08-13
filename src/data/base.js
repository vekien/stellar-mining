// ============================================================
// BASE STATION DATA — upgrade costs, ship capacity, range
// ============================================================

// Coin cost to upgrade to each tier (index = target tier)
// Steep curve: T1→2 stays approachable, later tiers demand real empire cashflow
export const BASE_UPGRADE_COSTS = [
  0,
  100_000,       // → T2
  350_000,       // → T3
  1_000_000,     // → T4
  2_800_000,     // → T5
  7_500_000,     // → T6
  20_000_000,    // → T7
  50_000_000,    // → T8
  120_000_000,   // → T9
  280_000_000,   // → T10
];

// Maximum number of ships at each base tier (index = tier - 1)
export const BASE_MAX_SHIPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

// Mining/turret range in tiles each direction from base (index = tier - 1)
// Each tier expands by +7 tiles from the previous.
export const BASE_RANGE = [7, 14, 21, 28, 35, 42, 49, 56, 63, 70];

// No resource nodes within this Chebyshev distance of the base cell (inclusive).
export const BASE_NODE_NO_SPAWN = 2;

// Resource requirements for each base tier upgrade (key = target tier)
// Uses the two resources from the PREVIOUS tier (the tier being "completed")
export const BASE_TIER_REQS = {
  2:  { iron: 10000,      copper: 10000     },
  3:  { oxygen: 20000,    nickel: 20000     },
  4:  { silicon: 30000,   cobalt: 30000     },
  5:  { titanium: 40000,  aluminum: 40000   },
  6:  { gold: 50000,      chromium: 50000   },
  7:  { silver: 60000,    neon: 60000       },
  8:  { platinum: 70000,  xenon: 70000      },
  9:  { iridium: 80000,   palladium: 80000  },
  10: { uranium: 90000,   osmium: 90000     },
};

// Resource requirements for each ship tier upgrade (key = target tier)
export const SHIP_TIER_REQS = {
  2:  { iron: 100,      copper: 100      },
  3:  { oxygen: 200,    nickel: 200      },
  4:  { silicon: 300,   cobalt: 300      },
  5:  { titanium: 400,  aluminum: 400    },
  6:  { gold: 500,      chromium: 500    },
  7:  { silver: 600,    neon: 600        },
  8:  { platinum: 700,  xenon: 700       },
  9:  { iridium: 800,   palladium: 800   },
  10: { uranium: 900,   osmium: 900      },
};
