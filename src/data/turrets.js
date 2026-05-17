// ============================================================
// TURRET DATA — base stats, upgrade deltas, costs
// ============================================================

// Base stats for a freshly placed turret (level 1)
export const TURRET_BASE_STATS = {
  health:  5000,
  damage:  100,
  range:   2,
};

// Per-level upgrade deltas applied on each upgrade purchase
export const TURRET_UPGRADE_DELTA = {
  health: 500,
  damage: 20,
  range:  1,
};

// Hard cap on turret range regardless of upgrade level
export const TURRET_MAX_RANGE = 5;

// Hard cap on turret rank
export const TURRET_MAX_LEVEL = 10;

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

export const TURRET_TYPE_DEFS = {
  turret: {
    name: 'Automatic Turret',
    basePowerUsage: 2,
    maxPowerUsage: 15,
    basePowerCapacity: 1000,
    maxPowerCapacity: 3000,
    baseHealth: 5000,
    maxHealthAtRank10: 10000,
    baseDamage: 100,
    damagePerLevel: 25,
    baseFireRate: 1,
    minFireRate: 0.2,
    fireRateCapLevel: 10,
    baseStunDuration: 0,
    maxStunDuration: 0,
    stunCapLevel: 10,
    baseRange: 2,
    rangeUpgrade: 1,
    rangeMax: 5,
    platformFill: 'rgba(30,60,30,0.7)',
    platformStroke: '#3a8a3a',
    bodyFill: '#3a5a3a',
    bodyStroke: '#5acc5a',
    detailFill: '#2a3a2a',
    detailStroke: '#4aaa4a',
    barrelFill: '#7aee7a',
    barrelStroke: '#3a8a3a',
    shape: 'dual_barrel',
  },
  laser_turret: {
    name: 'Laser Turret',
    basePowerUsage: 2,
    maxPowerUsage: 15,
    basePowerCapacity: 1000,
    maxPowerCapacity: 3000,
    baseHealth: 8000,
    maxHealthAtRank10: 16000,
    baseDamage: 500,
    damagePerLevel: 40,
    baseFireRate: 15,
    minFireRate: 5,
    fireRateCapLevel: 10,
    baseStunDuration: 0,
    maxStunDuration: 0,
    stunCapLevel: 10,
    baseRange: 4,
    rangeUpgrade: 2,
    rangeMax: 12,
    platformFill: 'rgba(58,34,86,0.75)',
    platformStroke: '#9b6dff',
    bodyFill: '#6e4eb8',
    bodyStroke: '#c0a0ff',
    detailFill: '#55368d',
    detailStroke: '#b088ff',
    barrelFill: '#d7c2ff',
    barrelStroke: '#9b6dff',
    shape: 'single_rifle',
  },
  emp_turret: {
    name: 'EMP Turret',
    basePowerUsage: 5,
    maxPowerUsage: 15,
    basePowerCapacity: 3000,
    maxPowerCapacity: 10000,
    baseHealth: 15000,
    maxHealthAtRank10: 30000,
    baseDamage: 0,
    damagePerLevel: 0,
    baseFireRate: 60,
    minFireRate: 45,
    fireRateCapLevel: 10,
    baseStunDuration: 2,
    maxStunDuration: 8,
    stunCapLevel: 10,
    basePowerDrive: 200,
    maxPowerDrive: 800,
    baseRange: 3,
    rangeUpgrade: 1,
    rangeMax: 15,
    platformFill: 'rgba(20,45,95,0.78)',
    platformStroke: '#3f7dff',
    bodyFill: '#2f5fc8',
    bodyStroke: '#7fb0ff',
    detailFill: '#1f4696',
    detailStroke: '#669bff',
    barrelFill: '#8cc8ff',
    barrelStroke: '#2f66ff',
    shape: 'triangle_orbit',
  },
};

export function getTurretTypeDef(type) {
  return TURRET_TYPE_DEFS[type] || TURRET_TYPE_DEFS.turret;
}

function scaleToward(level, start, end, capLevel = 10) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return start;
  const lvl = Math.max(1, level || 1);
  if (lvl <= 1) return start;
  const t = Math.max(0, Math.min(1, (lvl - 1) / Math.max(1, capLevel - 1)));
  return start + (end - start) * t;
}

export function getTurretStats(type, level = 1) {
  const def = getTurretTypeDef(type);
  const lvl = Math.max(1, Math.floor(level || 1));
  const maxHealth = Math.round(
    Number.isFinite(def.maxHealthAtRank10)
      ? scaleToward(lvl, def.baseHealth || 0, def.maxHealthAtRank10, 10)
      : (def.baseHealth || 0) + ((lvl - 1) * (def.healthPerLevel || 0))
  );
  const damage = (def.baseDamage || 0) + ((lvl - 1) * (def.damagePerLevel || 0));
  const range = Math.min(
    (def.baseRange || TURRET_BASE_STATS.range || 2) + ((lvl - 1) * (def.rangeUpgrade || 0)),
    def.rangeMax || TURRET_MAX_RANGE
  );
  const fireRate = (def.baseFireRate || 0) > 0
    ? parseFloat(scaleToward(lvl, def.baseFireRate, def.minFireRate || def.baseFireRate, def.fireRateCapLevel || 10).toFixed(2))
    : 0;
  const stunDuration = (def.baseStunDuration || 0) > 0 || (def.maxStunDuration || 0) > 0
    ? parseFloat(scaleToward(lvl, def.baseStunDuration || 0, def.maxStunDuration || def.baseStunDuration || 0, def.stunCapLevel || 10).toFixed(2))
    : 0;
  const powerDrive = Number.isFinite(def.basePowerDrive)
    ? Math.round(scaleToward(lvl, def.basePowerDrive || 0, def.maxPowerDrive || def.basePowerDrive || 0, 10))
    : 0;
  return { maxHealth, damage, range, fireRate, stunDuration, powerDrive };
}

export function getTurretPowerUsage(turretOrType, level = null) {
  const type = typeof turretOrType === 'string' ? turretOrType : turretOrType?.type;
  const def = getTurretTypeDef(type);
  const lvl = Math.max(1, Math.floor(level ?? (typeof turretOrType === 'object' ? (turretOrType?.level || 1) : 1)));
  return parseFloat(scaleToward(lvl, def.basePowerUsage || 0, def.maxPowerUsage || def.basePowerUsage || 0, 10).toFixed(1));
}

export function getTurretPowerCapacity(turretOrLevel = 1) {
  const type = typeof turretOrLevel === 'object' ? turretOrLevel?.type : 'turret';
  const def = getTurretTypeDef(type);
  const level = typeof turretOrLevel === 'number'
    ? Math.max(1, Math.floor(turretOrLevel || 1))
    : Math.max(1, Math.floor(turretOrLevel?.level || 1));
  return Math.round(scaleToward(level, def.basePowerCapacity || 1000, def.maxPowerCapacity || def.basePowerCapacity || 1000, 10));
}

// ── Future turret types go here ──────────────────────────────
// export const HEAVY_TURRET_BASE_STATS = { ... };
