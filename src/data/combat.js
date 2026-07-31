// ============================================================
// COMBAT CONFIG — raids, enemies, HQ support, loot
// ============================================================
import { RESOURCE_DEFS, MINE_TIERS, isStorableResource } from './resources.js';
import { SHIP_DEFS } from './ships.js';

export const RAID_WAVE_SIZE = 3;
export const RAID_WARNING_DURATION_MS = 12000;
export const RAID_SPAWN_DELAY_MS = 1800;

/**
 * Enemy ship archetypes (phase-1 raiders).
 * DPS is always attack × attackSpeed (damage per shot × shots per second).
 * e.g. attack 50 @ 5/s → 250 DPS.
 */
/** Shared cruise speed for every combat hull (player, HQ, enemy). */
export const COMBAT_CRUISE_SPEED = 155;
/** Afterburner mult while boost is active */
export const COMBAT_BOOST_MULT_MIN = 1.45;
export const COMBAT_BOOST_MULT_MAX = 1.85;
/** Seconds between boost opportunities (random) */
export const COMBAT_BOOST_CD_MIN_S = 2;
export const COMBAT_BOOST_CD_MAX_S = 5;
/** How long a boost lasts */
export const COMBAT_BOOST_DURATION_MIN_S = 0.55;
export const COMBAT_BOOST_DURATION_MAX_S = 1.35;

export const ENEMY_DEFS = {
  raider: {
    id: 'raider',
    label: 'Pirate Raider',
    hp: 840,
    attack: 28,       // damage per shot
    attackSpeed: 2.2, // shots per second → ~61.6 DPS
    flySpeed: COMBAT_CRUISE_SPEED,
    color: '#ff5d5d',
    size: 9,
  },
  skirmisher: {
    id: 'skirmisher',
    label: 'Pirate Skirmisher',
    hp: 560,
    attack: 22,       // damage per shot
    attackSpeed: 3.0, // shots per second → 66 DPS
    flySpeed: COMBAT_CRUISE_SPEED,
    color: '#ff5d5d',
    size: 8,
  },
};

/** Sustained DPS = damage-per-shot × shots-per-second. */
export function getEnemyDps(defOrEnemy) {
  const atk = Math.max(0, defOrEnemy?.attack || 0);
  const rate = Math.max(0.05, defOrEnemy?.attackSpeed || 1);
  return atk * rate;
}

export const ENEMY_WAVE_TYPES = ['raider', 'raider', 'skirmisher'];

/** Seconds for dogfight phases */
export const DOGFIGHT_ROAM_MIN_S = 4;
export const DOGFIGHT_ROAM_MAX_S = 8;
export const DOGFIGHT_ENGAGE_MIN_S = 4;
export const DOGFIGHT_ENGAGE_MAX_S = 8;
/** Below this HP fraction, enemies skip building flybys and only fight/flee */
export const FLEE_NO_FLYBY_HP = 0.3;
export const ORBIT_RADIUS = 70;
/** Building drive-by: approach → slow+shoot → boost far ahead → loop */
export const DRIVEBY_RUN_DIST = 300;
/** Lateral offset so the pass skims past (not through) the building */
export const DRIVEBY_PASS_OFFSET = 55;
/** How far ahead to boost after a pass (world units along heading) */
export const DRIVEBY_BOOST_DIST = 320;
export const DRIVEBY_SHOOT_SPEED_MULT = 0.5;
export const DRIVEBY_BOOST_SPEED_MULT = 1.55;
export const ROAM_RADIUS = 220; // legacy fallback if view bounds unavailable
export const COMBAT_ARRIVAL_RADIUS = 28;
export const ENEMY_SHOOT_RANGE = 180;
export const PLAYER_SHOOT_RANGE = 130;
/** HQ support wing shoot range (2× player combat ships) */
export const HQ_SHOOT_RANGE = PLAYER_SHOOT_RANGE * 2;
/** Preferred fight distance so ships don't stack on top of each other */
export const ENGAGE_STANDOFF = 62;
export const ENGAGE_STANDOFF_JITTER = 10;
/** HQ wing holds closer / tighter to the fight */
export const HQ_ENGAGE_STANDOFF = 44;
export const HQ_ENGAGE_STANDOFF_JITTER = 6;
/** Soft push when friendlies get too close */
export const SHIP_SEPARATION = 44;
export const HQ_SHIP_SEPARATION = 26;
/** Forward-only guns: half-angle of fire cone from nose (radians) */
export const FIRE_CONE_RAD = (35 * Math.PI) / 180; // ±35° (70° total arc)
/** EMP slow multiplier while stunned (not a full freeze — keeps dogfights moving) */
export const EMP_SLOW_MULT = 0.1;
/** Player/HQ dogfight turn rate (rad/s) — slightly wider radius than enemies */
export const COMBAT_TURN_RATE = 7.0;
/** Enemy dogfight turn rate (rad/s) */
export const ENEMY_TURN_RATE = 8.2;
/** Building / tower attack turn rate (rad/s) */
export const BUILDING_TURN_RATE = 8.0;
/** Extra speed while banking hard — low so turn radius stays controlled */
export const COMBAT_BANK_BOOST = 1.05;
/** Milder bank boost on building runs */
export const BUILDING_BANK_BOOST = 1.04;
export const TURRET_COMBAT_ENABLED = true;

/** Pirate aggression gauge fills to this before a raid fires next SOL. */
export const PIRATE_STATUS_RAID_AT = 100;
/** Residual aggression left after a raid launches. */
export const PIRATE_STATUS_AFTER_RAID = 12;

/**
 * Threat contribution from one player ship (combat/garrison only).
 * Tier + combat upgrade ranks.
 */
function combatShipPoints(ship) {
  if (!ship || ship.isHqSupport) return 0;
  const role = SHIP_DEFS[ship.type]?.role;
  if (!isCombatRole(role)) return 0;
  const tier = Math.max(1, ship.mineTier || ship.tier || 1);
  const upgrades = Math.floor(
    ((ship.hpLevel || 0) + (ship.attackLevel || 0) + (ship.atkRateLevel || 0)) / 10,
  );
  return tier + upgrades;
}

/**
 * Threat breakdown from fleet power, defenses, infrastructure, and pirate kills.
 * Threat Level drives HQ pricing and how fast Pirate Status climbs.
 */
export function getThreatBreakdown(gameState = {}) {
  let shipPts = 0;
  for (const s of gameState.ships || []) shipPts += combatShipPoints(s);

  let turretPts = 0;
  for (const t of gameState.turrets || []) turretPts += Math.max(1, t.level || 1);

  let buildingPts = Math.max(1, gameState.base?.level || 1);
  for (const m of gameState.modules || []) buildingPts += Math.max(1, m.level || 1);

  const killPts = Math.max(0, Math.floor(gameState.pirateKills || 0));
  const score = shipPts * 2 + turretPts * 2 + buildingPts + killPts * 3;
  const level = Math.max(1, Math.min(99, 1 + Math.floor(score / 12)));
  return { level, score, shipPts, turretPts, buildingPts, killPts };
}

/**
 * Pirate threat level from operation strength (ships / turrets / buildings / kills).
 * Number arg kept for back-compat (legacy SOL-based estimate).
 */
export function getPirateThreatLevel(gameStateOrSol = 1) {
  if (typeof gameStateOrSol === 'number') {
    const s = Math.max(1, Math.floor(gameStateOrSol || 1));
    return Math.max(1, Math.min(20, Math.ceil(s / 2)));
  }
  return getThreatBreakdown(gameStateOrSol || {}).level;
}

export function getPirateStatusLabel(pct = 0) {
  const p = Math.max(0, Math.min(100, pct));
  if (p >= 100) return 'IMMINENT';
  if (p >= 75) return 'Critical';
  if (p >= 50) return 'Hostile';
  if (p >= 25) return 'Stirring';
  return 'Quiet';
}

/** How much Pirate Status rises each new SOL (scales with threat). */
export function getPirateStatusSolIncrease(threatLevel = 1) {
  const t = Math.max(1, Math.floor(threatLevel || 1));
  return Math.min(45, 6 + t * 2 + Math.floor(Math.random() * 5));
}

/** Aggression bump when expanding (new ship / turret / building). */
export function getPirateStatusBuildBump(threatLevel = 1) {
  const t = Math.max(1, Math.floor(threatLevel || 1));
  return Math.max(2, Math.round(3 + t * 0.35));
}

/**
 * HQ combat support cost:
 *   Pirate Threat Level × Ship Count × 40,000
 * Example: threat 2 × 5 ships = 400,000
 */
export function getHqSupportCost({ sol = 1, shipCount = 1, threatLevel, gameState } = {}) {
  // Back-compat: allow getHqSupportCost(solNumber)
  if (typeof arguments[0] === 'number') {
    sol = arguments[0];
    shipCount = 1;
    threatLevel = undefined;
    gameState = undefined;
  }
  const threat = Math.max(
    1,
    Math.floor(threatLevel ?? (gameState ? getPirateThreatLevel(gameState) : getPirateThreatLevel(sol))),
  );
  const ships = Math.max(1, Math.floor(shipCount || 1));
  return threat * ships * 40000;
}

/** Scale enemy HP/ATK mildly with SOL. */
export function scaleEnemyStats(def, sol = 1) {
  const s = Math.max(1, Math.floor(sol || 1));
  const mult = 1 + Math.min(2.5, (s - 1) * 0.08);
  return {
    ...def,
    hp: Math.round(def.hp * mult),
    attack: Math.round(def.attack * mult),
  };
}

/**
 * Loot table for a destroyed enemy.
 * Returns [{ type, amount }] of storable resources.
 */
export function getEnemyLoot(enemyType, sol = 1) {
  const s = Math.max(1, Math.floor(sol || 1));
  const tier = Math.min(10, Math.max(1, Math.ceil(s / 2)));
  const resources = (MINE_TIERS[tier]?.resources || MINE_TIERS[1].resources)
    .filter((r) => isStorableResource(r));
  const amount = Math.max(8, Math.round(12 + s * 3 + (enemyType === 'raider' ? 6 : 0)));
  return resources.slice(0, 2).map((type) => ({
    type,
    amount,
    label: RESOURCE_DEFS[type]?.label || type,
    color: RESOURCE_DEFS[type]?.color || '#6fff9a',
  }));
}

export function isCombatRole(role) {
  return role === 'combat' || role === 'garrison';
}
