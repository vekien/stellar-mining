// ============================================================
// BASE STATION DATA — upgrade costs, ship capacity, range
// ============================================================

// Coin cost to upgrade to each tier (index = target tier)
export const BASE_UPGRADE_COSTS = [0, 10000, 14000, 19600, 27440, 38416, 53782, 75295, 105413, 147578];

// Maximum number of ships at each base tier (index = tier - 1)
export const BASE_MAX_SHIPS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

// Mining/turret range in tiles each direction from base (index = tier - 1)
export const BASE_RANGE = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

// Resource requirements for each base tier upgrade (key = target tier)
// Uses the two resources from the PREVIOUS tier (the tier being "completed")
export const BASE_TIER_REQS = {
  2:  { iron: 1000,     copper: 1000     },
  3:  { oxygen: 2000,   nickel: 2000     },
  4:  { silicon: 3000,  cobalt: 3000     },
  5:  { titanium: 4000, aluminum: 4000   },
  6:  { gold: 5000,     chromium: 5000   },
  7:  { silver: 6000,   neon: 6000       },
  8:  { platinum: 7000, xenon: 7000      },
  9:  { iridium: 8000,  palladium: 8000  },
  10: { uranium: 9000,  osmium: 9000     },
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
