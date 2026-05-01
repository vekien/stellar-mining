// ============================================================
// SHIP & UPGRADE DATA
// ============================================================

// Base stats for each ship type (used at spawn + display)
export const SHIP_DEFS = {

  // ── Mining ─────────────────────────────────────────────────────
  scout: {
    role: 'mining', capacity: 15,  flySpeed: 1.4,  mineSpeed: 1.25, mineTier: 1, turnRadius: 1.0,
  },
  swift: {
    role: 'mining', capacity: 12,  flySpeed: 2.2,  mineSpeed: 1.5,  mineTier: 1, turnRadius: 0.8,
  },
  hauler: {
    role: 'mining', capacity: 30,  flySpeed: 0.8,  mineSpeed: 0.8,  mineTier: 2, turnRadius: 1.2,
  },
  freighter: {
    role: 'mining', capacity: 60,  flySpeed: 0.6,  mineSpeed: 0.6,  mineTier: 3, turnRadius: 1.8,
  },

  // ── Cargo Transport ────────────────────────────────────────────
  courier: {
    role: 'transport', capacity: 50,  flySpeed: 1.1,  mineSpeed: 0, mineTier: 2, turnRadius: 1.1,
  },
  bulk_carrier: {
    role: 'transport', capacity: 130, flySpeed: 0.45, mineSpeed: 0, mineTier: 3, turnRadius: 2.0,
  },
  deep_hauler: {
    role: 'transport', capacity: 300, flySpeed: 0.25, mineSpeed: 0, mineTier: 4, turnRadius: 3.2,
  },

  // ── Combat ─────────────────────────────────────────────────────
  viper: {
    role: 'combat', capacity: 0, flySpeed: 2.8, mineSpeed: 0, mineTier: 4, turnRadius: 0.6,
    hp: 800,   attack: 45,  attackSpeed: 1.8,
  },
  interceptor: {
    role: 'combat', capacity: 0, flySpeed: 2.0, mineSpeed: 0, mineTier: 4, turnRadius: 0.9,
    hp: 2500,  attack: 120, attackSpeed: 1.0,
  },
  destroyer: {
    role: 'combat', capacity: 0, flySpeed: 0.9, mineSpeed: 0, mineTier: 5, turnRadius: 1.6,
    hp: 8000,  attack: 320, attackSpeed: 0.5,
  },

  // ── Garrison ───────────────────────────────────────────────────
  bulwark: {
    role: 'garrison', capacity: 0, flySpeed: 0.12, mineSpeed: 0, mineTier: 4, turnRadius: 3.5,
    hp: 18000, attack: 400, attackSpeed: 0.7, range: 8,
  },
  colossus: {
    role: 'garrison', capacity: 0, flySpeed: 0.05, mineSpeed: 0, mineTier: 5, turnRadius: 5.0,
    hp: 50000, attack: 900, attackSpeed: 0.3, range: 14,
  },

  // ── Galaxy Probes ──────────────────────────────────────────────
  probe_mk1: {
    role: 'explorer', capacity: 5,  flySpeed: 1.6, mineSpeed: 0, mineTier: 8, turnRadius: 0.8,
    probeTier: [1, 2],
  },
  probe_mk2: {
    role: 'explorer', capacity: 5,  flySpeed: 1.9, mineSpeed: 0, mineTier: 8, turnRadius: 0.7,
    probeTier: [1, 3],
  },
  warp_vessel: {
    role: 'explorer', capacity: 10, flySpeed: 2.2, mineSpeed: 0, mineTier: 8, turnRadius: 1.0,
    probeTier: [1, 4],
  },

  // ── Unique / Legendary ─────────────────────────────────────────
  // Cannot be crafted — acquired through story, events, or enemies.
  sentinel: {
    // Inspired by No Man's Sky Sentinel ships — alien AI hunter craft
    role: 'unique', unique: true, capacity: 25, flySpeed: 3.8, mineSpeed: 0.5, mineTier: 10, turnRadius: 0.5,
    hp: 30000, attack: 600,
  },
  serenity: {
    // Firefly-class transport — "She's a good ship"
    role: 'unique', unique: true, capacity: 220, flySpeed: 1.6, mineSpeed: 0.8, mineTier: 10, turnRadius: 1.3,
    hp: 14000, attack: 180,
  },
  normandy: {
    // SSV Normandy SR-2 (Mass Effect) — stealth frigate, fastest in the fleet
    role: 'unique', unique: true, capacity: 35, flySpeed: 4.5, mineSpeed: 0, mineTier: 10, turnRadius: 0.4,
    hp: 22000, attack: 750,
  },
  ebon_hawk: {
    // Ebon Hawk (KOTOR) — legendary smuggler vessel, tough as nails
    role: 'unique', unique: true, capacity: 80, flySpeed: 3.2, mineSpeed: 0.3, mineTier: 10, turnRadius: 0.7,
    hp: 16000, attack: 280,
  },

};

// Tier upgrade costs: ~2.5x each step
export const SHIP_TIER_COSTS = {
  2:1000,
  3:2500,
  4:6250, 
  5:15625, 
  6:39063,
  7:97656, 
  8:244141, 
  9:610352, 
  10:1525879
};

// Max upgrade level per tier for each stat
export const TIER_UPGRADE_CAP = { 
  1:10, 
  2:20, 
  3:30, 
  4:40, 
  5:50, 
  6:60, 
  7:70, 
  8:80, 
  9:90, 
  10:100 
};

// Tier rarity colours for display
export const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
export function toRoman(n) { return ROMAN[n] || String(n); }

export const TIER_COLORS = {
  1:'#808090', 2:'#4acd7a', 3:'#4a90e2', 4:'#9b6dff',
  5:'#ffd700', 6:'#ff8c40', 7:'#ff60b0', 8:'#00e5ff',
  9:'#ff4040', 10:'#ffffff'
};

// Upgrade cost functions
export const UPGRADE_CAP_COST  = s => Math.floor(40  * Math.pow(1.10, s.capacityLevel));
export const UPGRADE_FLY_COST  = s => Math.floor(60  * Math.pow(1.10, s.flySpeedLevel));
export const UPGRADE_MINE_COST = s => Math.floor(60  * Math.pow(1.10, s.mineSpeedLevel));

// How many levels to buy at once based on current level
export function upgradeChunk(level) {
  if (level >= 50)  return 10;
  if (level >= 30)  return 5;
  if (level >= 10)  return 2;
  return 1;
}

// Total cost for `chunk` upgrades starting from current level
export function upgradeTotalCost(costFn, ship, stat, chunk) {
  let total = 0;
  const tmp = { ...ship };
  for (let i = 0; i < chunk; i++) {
    total += costFn(tmp);
    tmp[stat + 'Level'] = (tmp[stat + 'Level'] || 0) + 1;
  }
  return total;
}
