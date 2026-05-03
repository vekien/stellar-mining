// ============================================================
// SHIP & UPGRADE DATA
// ============================================================

// ── Craft times ───────────────────────────────────────────────
export const DEFAULT_CRAFT_TIME_MS = 10000;

export const FLY_SPEED_SCALE = 100;
export const FLY_SPEED_UPGRADE_STEP = 20;
export const MINE_SPEED_UPGRADE_STEP = 0.4;
export const CARGO_TIER_EXPONENT = 1.3;

export function flySpeedToMultiplier(speed) {
  return (speed || 0) / FLY_SPEED_SCALE;
}

export function formatFlySpeed(speed) {
  return String(Math.round(speed || 0));
}

export function formatMineSpeedPercent(speed) {
  return `${Math.round((speed || 0) * 10)}%`;
}

export function normalizeFlySpeed(speed, saveVersion = 1) {
  if (!Number.isFinite(speed)) return 0;
  if (saveVersion < 2 && speed > 0 && speed < 10) return speed * FLY_SPEED_SCALE;
  if (speed >= 10000) return Math.round(speed / FLY_SPEED_SCALE);
  return speed;
}

export function normalizeMineSpeed(speed, saveVersion = 1) {
  if (!Number.isFinite(speed)) return 0;
  return saveVersion < 3 ? speed * 2 : speed;
}

export function roundUpTo2(n) {
  return Math.ceil(n / 2) * 2;
}

export const CARGO_PROFILE = {
  scout: { min: 10, max: 180, p: CARGO_TIER_EXPONENT },
  swift: { min: 6, max: 100, p: CARGO_TIER_EXPONENT },
  hauler: { min: 15, max: 250, p: CARGO_TIER_EXPONENT },
  freighter: { min: 25, max: 500, p: CARGO_TIER_EXPONENT },
  courier: { min: 200, max: 1500, p: CARGO_TIER_EXPONENT },
  bulk_carrier: { min: 400, max: 3000, p: CARGO_TIER_EXPONENT },
  deep_hauler: { min: 1000, max: 6000, p: CARGO_TIER_EXPONENT },
};

export const CARGO_LEVEL_STEP = {
  scout: 2,
  swift: 1,
  hauler: 3,
  freighter: 5,
  courier: 15,
  bulk_carrier: 30,
  deep_hauler: 60,
};

export function tierBaseCapacity(shipType, tier) {
  const profile = CARGO_PROFILE[shipType];
  if (!profile) return null;
  const t = Math.max(1, Math.min(10, tier || 1));
  if (t === 1) return profile.min;
  if (t === 10) return profile.max;
  const u = (t - 1) / 9;
  const raw = profile.min + (profile.max - profile.min) * Math.pow(u, profile.p);
  return roundUpTo2(raw);
}

export function capacityFromTierAndLevel(shipType, tier, level, fallbackBase = 10) {
  const profile = CARGO_PROFILE[shipType];
  const tierBase = profile?.min;
  const base = Number.isFinite(tierBase) ? tierBase : (Number.isFinite(fallbackBase) ? fallbackBase : 10);
  const lv = Math.max(0, level || 0);
  const step = CARGO_LEVEL_STEP[shipType] ?? 2;
  return base + (lv * step);
}

export const SHIP_CRAFT_TIME_MS = {
  scout:     10000,
  swift:     10000,
  hauler:    14000,
  freighter: 18000,
};

// Base stats for each ship type (used at spawn + display)
export const SHIP_DEFS = {

  // ── Mining ─────────────────────────────────────────────────────
  scout: {
    role: 'mining', capacity: 10,  flySpeed: 140,  mineSpeed: 2.5, mineTier: 1, turnRadius: 1.0,
  },
  swift: {
    role: 'mining', capacity: 6,  flySpeed: 220,  mineSpeed: 3.0,  mineTier: 1, turnRadius: 0.8,
  },
  hauler: {
    role: 'mining', capacity: 15,  flySpeed: 80,  mineSpeed: 1.6,  mineTier: 2, turnRadius: 1.2,
  },
  freighter: {
    role: 'mining', capacity: 25,  flySpeed: 60,  mineSpeed: 1.2,  mineTier: 3, turnRadius: 1.8,
  },

  // ── Cargo Transport ────────────────────────────────────────────
  courier: {
    role: 'transport', capacity: 200,  flySpeed: 110,  mineSpeed: 0, mineTier: 2, turnRadius: 1.1,
  },
  bulk_carrier: {
    role: 'transport', capacity: 400, flySpeed: 45, mineSpeed: 0, mineTier: 3, turnRadius: 2.0,
  },
  deep_hauler: {
    role: 'transport', capacity: 1000, flySpeed: 25, mineSpeed: 0, mineTier: 4, turnRadius: 3.2,
  },

  // ── Combat ─────────────────────────────────────────────────────
  viper: {
    role: 'combat', capacity: 0, flySpeed: 280, mineSpeed: 0, mineTier: 4, turnRadius: 0.6,
    hp: 800,   attack: 45,  attackSpeed: 1.8,
  },
  interceptor: {
    role: 'combat', capacity: 0, flySpeed: 200, mineSpeed: 0, mineTier: 4, turnRadius: 0.9,
    hp: 2500,  attack: 120, attackSpeed: 1.0,
  },
  destroyer: {
    role: 'combat', capacity: 0, flySpeed: 90, mineSpeed: 0, mineTier: 5, turnRadius: 1.6,
    hp: 8000,  attack: 320, attackSpeed: 0.5,
  },

  // ── Garrison ───────────────────────────────────────────────────
  bulwark: {
    role: 'garrison', capacity: 0, flySpeed: 12, mineSpeed: 0, mineTier: 4, turnRadius: 3.5,
    hp: 18000, attack: 400, attackSpeed: 0.7, range: 8,
  },
  colossus: {
    role: 'garrison', capacity: 0, flySpeed: 5, mineSpeed: 0, mineTier: 5, turnRadius: 5.0,
    hp: 50000, attack: 900, attackSpeed: 0.3, range: 14,
  },

  // ── Unique / Legendary ─────────────────────────────────────────
  // Cannot be crafted — acquired through story, events, or enemies.
  sentinel: {
    // Inspired by No Man's Sky Sentinel ships — alien AI hunter craft
    role: 'unique', unique: true, capacity: 25, flySpeed: 380, mineSpeed: 1.0, mineTier: 10, turnRadius: 0.5,
    hp: 30000, attack: 600,
  },
  serenity: {
    // Firefly-class transport — "She's a good ship"
    role: 'unique', unique: true, capacity: 220, flySpeed: 160, mineSpeed: 1.6, mineTier: 10, turnRadius: 1.3,
    hp: 14000, attack: 180,
  },
  normandy: {
    // SSV Normandy SR-2 (Mass Effect) — stealth frigate, fastest in the fleet
    role: 'unique', unique: true, capacity: 35, flySpeed: 450, mineSpeed: 0, mineTier: 10, turnRadius: 0.4,
    hp: 22000, attack: 750,
  },
  ebon_hawk: {
    // Ebon Hawk (KOTOR) — legendary smuggler vessel, tough as nails
    role: 'unique', unique: true, capacity: 80, flySpeed: 320, mineSpeed: 0.6, mineTier: 10, turnRadius: 0.7,
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
