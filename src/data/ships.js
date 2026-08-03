import { MINE_TIERS, RESOURCE_DEFS } from './resources.js';

// ============================================================
// SHIP & UPGRADE DATA
// ============================================================

export const DEFAULT_CRAFT_TIME_MS = 10000;

export const FLY_SPEED_SCALE = 100;
export const CARGO_TIER_EXPONENT = 1.5;

// Kept only for save-migration helpers below
export const FLY_SPEED_UPGRADE_STEP  = 20;
export const MINE_SPEED_UPGRADE_STEP = 0.4;

export function flySpeedToMultiplier(speed) {
  return (speed || 0) / FLY_SPEED_SCALE;
}
export function formatFlySpeed(speed) {
  return String(Math.round(speed || 0));
}
export function formatMineSpeedPercent(speed) {
  return `${Math.round((speed || 0) * 10)}%`;
}
export function formatLoadSpeed(speed) {
  return `${Math.round(speed || 0)}/s`;
}
export function formatAtkRatePercent(rate) {
  return `${Math.round((rate || 0) * 100)}%`;
}
/** Mine bonus chance 0–1 displayed as percent (e.g. 0.1 → 10%). */
export function formatMineBonusPercent(chance) {
  return `${Math.round((chance || 0) * 100)}%`;
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

// ── Stat profiles ──────────────────────────────────────────────────────────
// min = value at level 0 · max = value at level 100 · p = curve exponent
// p = 1.0 → linear scaling (equal gains per level)

export const CARGO_PROFILE = {
  scout:       { min: 12,   max: 500,  p: 1.0 },
  swift:       { min: 6,    max: 120,  p: 1.0 },
  hauler:      { min: 50,   max: 700,  p: 1.0 },
  freighter:   { min: 100,  max: 1000, p: 1.0 },
  courier:     { min: 500,  max: 2000, p: 1.0 },
  deep_hauler: { min: 1000, max: 10000, p: 1.0 },
};

export const FLY_SPEED_PROFILE = {
  scout:       { min: 140, max: 520,  p: 1.0 },
  swift:       { min: 220, max: 650,  p: 1.0 },
  hauler:      { min: 60,  max: 300,  p: 1.0 },
  freighter:   { min: 60,  max: 200,  p: 1.0 },
  courier:     { min: 25, max: 100,  p: 1.0 },
  deep_hauler: { min: 25, max: 80, p: 1.0 },
  // Combat hulls share a fixed cruise (see COMBAT_CRUISE_SPEED) — not upgraded
};

export const MINE_SPEED_PROFILE = {
  scout:     { min: 2.5, max: 30,  p: 1.0 },  // 25% → 300%
  swift:     { min: 2.5, max: 50,  p: 1.0 },  // 25% → 500%
  hauler:    { min: 2.5, max: 30,  p: 1.0 },  // 25% → 300%
  freighter: { min: 2.5, max: 40,  p: 1.0 },  // 25% → 400%
};

export const LOAD_SPEED_PROFILE = {
  courier:     { min: 10, max: 250, p: 1.0 },
  deep_hauler: { min: 50, max: 1000, p: 1.0 },
};

export const HP_PROFILE = {
  viper:       { min: 3200,  max: 8000,   p: 1.0 },
  interceptor: { min: 10000, max: 24000,  p: 1.0 },
  destroyer:   { min: 20000, max: 80000,  p: 1.0 },
  bulwark:     { min: 18000, max: 45000,  p: 1.0 },
  colossus:    { min: 50000, max: 120000, p: 1.0 },
};
export const ATTACK_PROFILE = {
  viper:       { min: 45,  max: 120, p: 1.0 },
  interceptor: { min: 60,  max: 200, p: 1.0 },
  destroyer:   { min: 100, max: 320, p: 1.0 },
  bulwark:     { min: 400, max: 900, p: 1.0 },
  colossus:    { min: 900, max: 2000, p: 1.0 },
};
export const ATK_RATE_PROFILE = {
  viper:       { min: 1.8, max: 3.2, p: 1.0 },
  interceptor: { min: 1.2, max: 2.5, p: 1.0 },
  destroyer:   { min: 0.4, max: 1.0, p: 1.0 },
  bulwark:     { min: 0.35, max: 0.7, p: 1.0 },
  colossus:    { min: 0.15, max: 0.35, p: 1.0 },
};
/** Garrison weapon range in tiles (converted to world units in combat). */
export const RANGE_PROFILE = {
  bulwark:  { min: 24, max: 54, p: 1.0 },
  colossus: { min: 42, max: 84, p: 1.0 },
};

// ── Profile stat compute ──────────────────────────────────────────────────
function profileStat(profile, shipType, level) {
  const p = profile[shipType];
  if (!p) return null;
  const t = Math.max(0, Math.min(100, level || 0));
  if (t === 0) return p.min;
  if (t === 100) return p.max;
  return p.min + (p.max - p.min) * Math.pow(t / 100, p.p);
}

export function capacityFromTierAndLevel(shipType, _tier, level, fallbackBase = 10) {
  const raw = profileStat(CARGO_PROFILE, shipType, level);
  if (raw !== null) return Math.round(raw);
  return Math.max(1, (fallbackBase || 10) + (level || 0) * 2);
}
export function flySpeedFromLevel(shipType, level) {
  const raw = profileStat(FLY_SPEED_PROFILE, shipType, level);
  return raw !== null ? Math.round(raw) : 140;
}
export function mineSpeedFromLevel(shipType, level) {
  const raw = profileStat(MINE_SPEED_PROFILE, shipType, level);
  return raw !== null ? parseFloat(raw.toFixed(2)) : 2.5;
}
export function loadSpeedFromLevel(shipType, level) {
  const raw = profileStat(LOAD_SPEED_PROFILE, shipType, level);
  return raw !== null ? parseFloat(raw.toFixed(2)) : 5;
}
export function hpFromLevel(shipType, level) {
  const raw = profileStat(HP_PROFILE, shipType, level);
  return raw !== null ? Math.round(raw) : 800;
}
export function attackFromLevel(shipType, level) {
  const raw = profileStat(ATTACK_PROFILE, shipType, level);
  return raw !== null ? Math.round(raw) : 45;
}
export function atkRateFromLevel(shipType, level) {
  const raw = profileStat(ATK_RATE_PROFILE, shipType, level);
  return raw !== null ? parseFloat(raw.toFixed(2)) : 1.8;
}
export function rangeFromLevel(shipType, level) {
  const raw = profileStat(RANGE_PROFILE, shipType, level);
  return raw !== null ? Math.round(raw) : 8;
}
export function formatWeaponRangeTiles(tiles) {
  return `${Math.round(tiles || 0)} tiles`;
}

/** Double-yield chance: 10% at Lv0 → 100% at Lv10 (always 2×). */
export const MINE_BONUS_MIN = 0.10;
export const MINE_BONUS_MAX = 1.00;
export const MINE_BONUS_MAX_LEVEL = 10;

export function mineBonusFromLevel(level) {
  const t = Math.max(0, Math.min(MINE_BONUS_MAX_LEVEL, level || 0));
  if (t <= 0) return MINE_BONUS_MIN;
  if (t >= MINE_BONUS_MAX_LEVEL) return MINE_BONUS_MAX;
  return parseFloat((MINE_BONUS_MIN + (MINE_BONUS_MAX - MINE_BONUS_MIN) * (t / MINE_BONUS_MAX_LEVEL)).toFixed(4));
}

/** Effective upgrade cap for mine bonus (rank 0–10). */
export function mineBonusUpgradeCap(shipMineTier) {
  const tierCap = TIER_UPGRADE_CAP[shipMineTier] || 10;
  return Math.min(MINE_BONUS_MAX_LEVEL, tierCap);
}

export function getShipSalvageRewards(ship) {
  const tier = Math.max(1, Math.min(10, ship?.tier || ship?.mineTier || 1));
  const resources = MINE_TIERS[tier]?.resources || MINE_TIERS[1].resources;
  const amount = Math.max(10, tier * 20);
  return resources
    .filter((resourceType) => !!RESOURCE_DEFS[resourceType])
    .map((resourceType) => ({ type: resourceType, amount }));
}

// Get the max value for a stat profile (used in codex MAX labels)
export function profileMax(profile, shipType) {
  return profile[shipType]?.max ?? null;
}

export const SHIP_CRAFT_TIME_MS = {
  scout:     10000,
  swift:     10000,
  hauler:    14000,
  freighter: 18000,
  courier:   20000,
  deep_hauler: 45000,
};

// Base stats for each ship type (values at level 0)
const RENDER_SCOUT = {
  size: 8,
  color: '#60d090',
  trailOffsets: [0],
  trailWidth: 6,
  trailOpacity: 0.8,
  trailLength: 70,
  turnRateFar: 4,
  turnRateNear: 10,
  directBlendDistance: 60,
  arrivalRadius: 6,
  glowRadiusExtra: 2,
  glowOpacity: 0.3,
};

const RENDER_SWIFT = {
  size: 8,
  color: '#ff80c0',
  trailOffsets: [0],
  trailWidth: 6,
  trailOpacity: 0.8,
  trailLength: 50,
  turnRateFar: 5,
  turnRateNear: 10,
  directBlendDistance: 60,
  arrivalRadius: 6,
  glowRadiusExtra: 2,
  glowOpacity: 0.3,
};

const RENDER_HAULER = {
  size: 10,
  color: '#80d0ff',
  trailOffsets: [0],
  trailWidth: 6,
  trailOpacity: 0.8,
  trailLength: 80,
  turnRateFar: 4,
  turnRateNear: 10,
  directBlendDistance: 60,
  arrivalRadius: 6,
  glowRadiusExtra: 2,
  glowOpacity: 0.3,
};

const RENDER_FREIGHTER = {
  size: 12,
  color: '#ffaa30',
  trailOffsets: [0],
  trailWidth: 6,
  trailOpacity: 0.8,
  trailLength: 100,
  turnRateFar: 3,
  turnRateNear: 10,
  directBlendDistance: 60,
  arrivalRadius: 6,
  glowRadiusExtra: 2,
  glowOpacity: 0.3,
};

const RENDER_COURIER = {
  size: 18,
  color: '#cacaca',
  trailOffsets: [-5, 5],
  trailWidth: 8,
  trailOpacity: 0.4,
  trailLength: 120,
  turnRateFar: 1,
  turnRateNear: 3.2,
  directBlendDistance: 180,
  arrivalRadius: 1.5,
  glowRadiusExtra: 6,
  glowOpacity: 0.1,
};

const RENDER_TITAN = {
  size: 26,
  color: '#e6e6e6',
  trailOffsets: [-6, 6],
  trailWidth: 10,
  trailOpacity: 0.3,
  trailLength: 150,
  turnRateFar: 0.5,
  turnRateNear: 2.0,
  directBlendDistance: 220,
  arrivalRadius: 1.25,
  glowRadiusExtra: 6,
  glowOpacity: 0.1,
};

export const SHIP_DEFS = {

  // ── Mining ─────────────────────────────────────────────────────
  scout: {
    role: 'mining', capacity: 12,  flySpeed: 140, mineSpeed: 2.5, mineTier: 1, render: RENDER_SCOUT,
  },
  swift: {
    role: 'mining', capacity: 6,   flySpeed: 220, mineSpeed: 2.5, mineTier: 1, render: RENDER_SWIFT,
  },
  hauler: {
    role: 'mining', capacity: 50,  flySpeed: 60,  mineSpeed: 2.5, mineTier: 2, render: RENDER_HAULER,
  },
  freighter: {
    role: 'mining', capacity: 100, flySpeed: 60,  mineSpeed: 2.5, mineTier: 3, render: RENDER_FREIGHTER,
  },

  // ── Cargo Transport ────────────────────────────────────────────
  courier: {
    role: 'transport', capacity: 500,  flySpeed: 25, mineSpeed: 0, loadSpeed: 10, mineTier: 2, render: RENDER_COURIER,
  },
  deep_hauler: {
    role: 'transport', capacity: 1000, flySpeed: 25, mineSpeed: 0, loadSpeed: 50, mineTier: 4, render: RENDER_TITAN,
  },

  // ── Combat ─────────────────────────────────────────────────────
  viper: {
    role: 'combat', capacity: 0, flySpeed: 155, mineSpeed: 0, mineTier: 4,
    render: RENDER_SCOUT,
    hp: 3200,  attack: 45,  attackSpeed: 1.8,
  },
  interceptor: {
    role: 'combat', capacity: 0, flySpeed: 155, mineSpeed: 0, mineTier: 4,
    render: RENDER_SCOUT,
    hp: 10000, attack: 60,  attackSpeed: 1.2,
  },
  destroyer: {
    role: 'combat', capacity: 0, flySpeed: 155, mineSpeed: 0, mineTier: 5,
    render: RENDER_FREIGHTER,
    hp: 20000, attack: 100, attackSpeed: 0.4,
  },

  // ── Garrison ───────────────────────────────────────────────────
  // ~4× slower than combat cruise (155); rendered 3× larger in world
  bulwark: {
    role: 'garrison', capacity: 0, flySpeed: 39, mineSpeed: 0, mineTier: 4,
    render: RENDER_FREIGHTER,
    hp: 18000, attack: 400, attackSpeed: 0.35, range: 24,
  },
  colossus: {
    role: 'garrison', capacity: 0, flySpeed: 39, mineSpeed: 0, mineTier: 5,
    render: RENDER_TITAN,
    hp: 50000, attack: 900, attackSpeed: 0.15, range: 42,
  },

  // ── Unique / Legendary ─────────────────────────────────────────
  // Acquired through events — always Tier 10, stats are final (no upgrade range)
  sentinel: {
    role: 'unique', unique: true, capacity: 25,  flySpeed: 380, mineSpeed: 1.0, mineTier: 10,
    render: RENDER_SCOUT,
    hp: 30000, attack: 600,
  },
  serenity: {
    role: 'unique', unique: true, capacity: 220, flySpeed: 160, mineSpeed: 1.6, mineTier: 10,
    render: RENDER_HAULER,
    hp: 14000, attack: 180,
  },
  normandy: {
    role: 'unique', unique: true, capacity: 35,  flySpeed: 450, mineSpeed: 0,   mineTier: 10,
    render: RENDER_SWIFT,
    hp: 22000, attack: 750,
  },
  ebon_hawk: {
    role: 'unique', unique: true, capacity: 80,  flySpeed: 320, mineSpeed: 0.6, mineTier: 10,
    render: RENDER_HAULER,
    hp: 16000, attack: 280,
  },

};

// Tier upgrade costs: ~2.5x each step
export const SHIP_TIER_COSTS = {
  2:1000, 3:2500, 4:6250, 5:15625, 6:39063, 7:97656, 8:244141, 9:610352, 10:1525879,
};

// Max upgrade level per tier
export const TIER_UPGRADE_CAP = {
  1:10, 2:20, 3:30, 4:40, 5:50, 6:60, 7:70, 8:80, 9:90, 10:100,
};

export const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
export function toRoman(n) { return ROMAN[n] || String(n); }

export const TIER_COLORS = {
  1:'#808090', 2:'#4acd7a', 3:'#4a90e2', 4:'#9b6dff',
  5:'#ffd700', 6:'#ff8c40', 7:'#ff60b0', 8:'#00e5ff',
  9:'#ff4040', 10:'#ffffff',
};

// Upgrade cost functions (cost curve is independent of value curve)
export const UPGRADE_CAP_COST      = s => Math.floor(40  * Math.pow(1.10, s.capacityLevel  || 0));
export const UPGRADE_FLY_COST      = s => Math.floor(60  * Math.pow(1.10, s.flySpeedLevel  || 0));
export const UPGRADE_MINE_COST     = s => Math.floor(60  * Math.pow(1.10, s.mineSpeedLevel || 0));
export const UPGRADE_MINE_BONUS_COST = s => Math.floor(70 * Math.pow(1.10, s.mineBonusLevel || 0));
export const UPGRADE_LOAD_COST     = s => Math.floor(60  * Math.pow(1.10, s.loadSpeedLevel || 0));
export const UPGRADE_HP_COST       = s => Math.floor(80  * Math.pow(1.10, s.hpLevel        || 0));
export const UPGRADE_ATTACK_COST   = s => Math.floor(80  * Math.pow(1.10, s.attackLevel    || 0));
export const UPGRADE_ATK_RATE_COST = s => Math.floor(80  * Math.pow(1.10, s.atkRateLevel   || 0));
export const UPGRADE_RANGE_COST    = s => Math.floor(85  * Math.pow(1.10, s.rangeLevel     || 0));

export function upgradeChunk(level) {
  if (level >= 50) return 10;
  if (level >= 30) return 5;
  if (level >= 10) return 2;
  return 1;
}

export function upgradeTotalCost(costFn, ship, stat, chunk) {
  let total = 0;
  const tmp = { ...ship };
  for (let i = 0; i < chunk; i++) {
    total += costFn(tmp);
    tmp[stat + 'Level'] = (tmp[stat + 'Level'] || 0) + 1;
  }
  return total;
}
