// ============================================================
// COMBAT SYSTEM — daily raids, enemy AI, player engage, HQ support
// ============================================================
import { state, bumpShipIdCounter, saveGame } from '../state.js';
import {
  ENEMY_DEFS,
  RAID_WAVE_SIZE,
  RAID_WARNING_DURATION_MS,
  RAID_SPAWN_DELAY_MS,
  getRaidDifficulty,
  buildRaidRoster,
  DOGFIGHT_ROAM_MIN_S,
  DOGFIGHT_ROAM_MAX_S,
  DOGFIGHT_ENGAGE_MIN_S,
  DOGFIGHT_ENGAGE_MAX_S,
  FLEE_NO_FLYBY_HP,
  ORBIT_RADIUS,
  DRIVEBY_RUN_DIST,
  DRIVEBY_PASS_OFFSET,
  DRIVEBY_BOOST_DIST,
  DRIVEBY_SHOOT_SPEED_MULT,
  DRIVEBY_BOOST_SPEED_MULT,
  ROAM_RADIUS,
  COMBAT_CRUISE_SPEED,
  COMBAT_BOOST_MULT_MIN,
  COMBAT_BOOST_MULT_MAX,
  COMBAT_BOOST_CD_MIN_S,
  COMBAT_BOOST_CD_MAX_S,
  COMBAT_BOOST_DURATION_MIN_S,
  COMBAT_BOOST_DURATION_MAX_S,
  COMBAT_ARRIVAL_RADIUS,
  ENEMY_SHOOT_RANGE,
  PLAYER_SHOOT_RANGE,
  HQ_SHOOT_RANGE,
  ENGAGE_STANDOFF,
  ENGAGE_STANDOFF_JITTER,
  HQ_ENGAGE_STANDOFF,
  HQ_ENGAGE_STANDOFF_JITTER,
  GARRISON_HOLD_MIN,
  GARRISON_HOLD_MAX,
  FIGHTER_BREAKAWAY_MIN_S,
  FIGHTER_BREAKAWAY_MAX_S,
  FIGHTER_BREAKAWAY_DIST_MIN,
  FIGHTER_BREAKAWAY_DIST_MAX,
  FIGHTER_BREAKAWAY_MAX_S_TRAVEL,
  SHIP_SEPARATION,
  HQ_SHIP_SEPARATION,
  FIRE_CONE_RAD,
  EMP_SLOW_MULT,
  COMBAT_TURN_RATE,
  GARRISON_TURN_RATE,
  ENEMY_TURN_RATE,
  BUILDING_TURN_RATE,
  BUILDING_BANK_BOOST,
  COMBAT_BANK_BOOST,
  GARRISON_BANK_BOOST,
  TURRET_COMBAT_ENABLED,
  scaleEnemyStats,
  getEnemyLoot,
  getHqSupportCost,
  getPirateThreatLevel,
  getPirateStatusBuildBump,
  PIRATE_STATUS_AFTER_RAID,
  isCombatRole,
} from '../data/combat.js';
import { SHIP_DEFS } from '../data/ships.js';
import { RESOURCE_DEFS, isStorableResource } from '../data/resources.js';
import {
  normalizeShipAttachments,
  getAttachmentDef,
  getShipHpMultiplier,
  getShipBoostCdMult,
  getShipRegenPerSec,
} from '../data/attachments.js';
import { eventTitleHtml } from '../data/events.js';
import { NPCS } from '../data/npcs.js';
import { BASE_POS, gridToWorld, focusOnBaseEvent, getViewBounds } from '../render/camera.js';
import { BASE_RANGE } from '../data/base.js';
import { addLog, fmt, spendCoins, addCoins, RESOURCE_CAP } from '../helpers.js';
import { spawnFloatie, spawnCombatBeam, spawnEmpBlast, spawnCombatExplosion, startScreenShake } from '../render/animations.js';
import { TILE_W, TILE_H } from '../constants.js';
import { invalidateNetworkCache } from '../data/modules.js';
import { showEventWarning, closeEventWarning } from './events.js';
import {
  logEventTransmission,
  queueTransmissions,
  makeEventId,
  showTransmissionMessage,
} from '../ui/transmissions.js';
import { refresh } from '../ui/refresh.js';

let _enemyIdCounter = 1;
let _raidSpawnTimer = null;

function baseWorld() {
  // BASE_POS is a function (grid → world), not a static point
  return BASE_POS();
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeAngle(a) {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** Nose move-angle from ship heading convention. */
function moveAngleOf(ent) {
  return (ent.heading || 0) - Math.PI / 2;
}

/** Signed angle error from nose → target point. */
function facingError(ent, tx, ty) {
  const desired = Math.atan2(ty - ent.y, tx - ent.x);
  return normalizeAngle(desired - moveAngleOf(ent));
}

/** True if nose is inside the forward fire cone toward target. */
function isFacing(ent, tx, ty, cone = FIRE_CONE_RAD) {
  return Math.abs(facingError(ent, tx, ty)) <= cone;
}

/**
 * Ship-style smooth flight (holding-pattern blend). Used for non-dogfight legs.
 */
function flySmooth(ent, destX, destY, speed, dt) {
  if (!Number.isFinite(ent.heading)) ent.heading = 0;
  if (!ent.trail) ent.trail = [];
  ent.trail.push({ x: ent.x, y: ent.y });
  // Player combat trails stay short; enemies/HQ a bit longer
  const trailMaxSmooth = ent.isEnemy ? 40 : ent.isHqSupport ? 36 : 28;
  if (ent.trail.length > trailMaxSmooth) ent.trail.shift();

  const dx = destX - ent.x;
  const dy = destY - ent.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const arrivalRadius = 12;
  if (dist < arrivalRadius) {
    ent.x = destX;
    ent.y = destY;
    return true;
  }

  const isGarrison = !ent.isEnemy && SHIP_DEFS[ent.type]?.role === 'garrison';
  const turnRateFar = isGarrison ? 1.1 : 3.2;
  const turnRateNear = isGarrison ? 2.4 : 9.5;
  const directBlendDistance = isGarrison ? 40 : 70;
  const turnT = Math.max(0, Math.min(1, 1 - dist / 500));
  const turnVariance = Number.isFinite(ent.turnRadiusRandomness) ? ent.turnRadiusRandomness : 0;
  const farVariance = dist > 300 ? turnVariance * (isGarrison ? 0.4 : 1.1) : 0;
  const TURN_RATE = Math.max(0.35, turnRateFar + ((turnRateNear - turnRateFar) * turnT) + farVariance);
  const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
  let da = normalizeAngle(targetAngle - ent.heading);
  ent.heading += Math.sign(da) * Math.min(Math.abs(da), TURN_RATE * dt);

  const moveAngle = moveAngleOf(ent);
  const step = Math.min(speed * dt, dist);
  const directBlend = Math.max(0, Math.min(1, 1 - dist / directBlendDistance));
  const hx = Math.cos(moveAngle);
  const hy = Math.sin(moveAngle);
  const tx = dx / dist;
  const ty = dy / dist;
  ent.x += (hx * (1 - directBlend) + tx * directBlend) * step;
  ent.y += (hy * (1 - directBlend) + ty * directBlend) * step;
  ent.combatBoost = 0;
  return false;
}

/**
 * Forward-only combat flight. opts.turnRate / opts.bankBoost override defaults
 * (building attacks use sharp turns; dogfights use wide circles).
 */
function flyCombat(ent, destX, destY, baseSpeed, dt, opts = {}) {
  if (!Number.isFinite(ent.heading)) ent.heading = 0;
  if (!ent.trail) ent.trail = [];
  ent.trail.push({ x: ent.x, y: ent.y });
  const trailMaxCombat = ent.isEnemy ? 50 : ent.isHqSupport ? 40 : 32;
  if (ent.trail.length > trailMaxCombat) ent.trail.shift();

  const dx = destX - ent.x;
  const dy = destY - ent.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Desired nose heading toward destination
  const desiredHeading = Math.atan2(dy, dx) + Math.PI / 2;
  const da = normalizeAngle(desiredHeading - ent.heading);
  const absDa = Math.abs(da);

  const baseTurn = Number.isFinite(opts.turnRate) ? opts.turnRate : COMBAT_TURN_RATE;
  const bankBoost = Number.isFinite(opts.bankBoost) ? opts.bankBoost : COMBAT_BANK_BOOST;
  const turnRate = baseTurn * (0.85 + (Number.isFinite(ent.turnRadiusRandomness)
    ? Math.abs(ent.turnRadiusRandomness) * 0.2
    : 0.1));
  ent.heading += Math.sign(da) * Math.min(absDa, turnRate * dt);

  // Temp boost while banking hard (can't face target yet)
  let speed = baseSpeed;
  if (absDa > 0.55) {
    const t = Math.min(1, (absDa - 0.55) / 1.8);
    speed *= 1 + (bankBoost - 1) * t;
    ent.combatBoost = t;
  } else {
    ent.combatBoost = 0;
  }

  // Pure forward motion along nose — never strafe
  const moveAngle = moveAngleOf(ent);
  const step = speed * dt;
  ent.x += Math.cos(moveAngle) * step;
  ent.y += Math.sin(moveAngle) * step;

  // Distance-only arrival — requiring a facing match caused eternal circles
  // when turn radius > approach distance (boost / roam waypoints).
  return dist < 40;
}

const BUILDING_FLIGHT = { turnRate: BUILDING_TURN_RATE, bankBoost: BUILDING_BANK_BOOST };
const PLAYER_FLIGHT = { turnRate: COMBAT_TURN_RATE, bankBoost: COMBAT_BANK_BOOST };
const GARRISON_FLIGHT = { turnRate: GARRISON_TURN_RATE, bankBoost: GARRISON_BANK_BOOST };
const ENEMY_FLIGHT = { turnRate: ENEMY_TURN_RATE, bankBoost: COMBAT_BANK_BOOST };

function getPlayerFlightOpts(ship) {
  if (SHIP_DEFS[ship?.type]?.role === 'garrison') return GARRISON_FLIGHT;
  return PLAYER_FLIGHT;
}

/** Shared afterburner — all combat hulls (player / HQ / enemy). */
function startCombatBoost(ent) {
  if (!ent) return;
  ent.combatBoostTimer = randRange(COMBAT_BOOST_DURATION_MIN_S, COMBAT_BOOST_DURATION_MAX_S);
  ent.combatBoostMult = randRange(COMBAT_BOOST_MULT_MIN, COMBAT_BOOST_MULT_MAX);
  const cdMult = (!ent.isEnemy && !ent.isHqSupport) ? getShipBoostCdMult(ent) : 1;
  ent.combatBoostCd = ent.combatBoostTimer
    + randRange(COMBAT_BOOST_CD_MIN_S, COMBAT_BOOST_CD_MAX_S) * cdMult;
  ent.combatBoost = 1;
}

function tickCombatBoost(ent, dt) {
  if (!ent) return;
  if ((ent.combatBoostTimer || 0) > 0) {
    ent.combatBoostTimer -= dt;
    if (ent.combatBoostTimer <= 0) {
      ent.combatBoostTimer = 0;
      ent.combatBoostMult = 1;
      ent.combatBoost = 0;
    }
  }
  if ((ent.combatBoostCd || 0) > 0) {
    ent.combatBoostCd -= dt;
  } else if ((ent.combatBoostTimer || 0) <= 0) {
    startCombatBoost(ent);
  }
}

/** Player/HQ weapon range in world units (garrison range is tile-based). */
function getPlayerShipShootRange(ship) {
  if (!ship) return PLAYER_SHOOT_RANGE;
  if (ship.isHqSupport) return HQ_SHOOT_RANGE;
  const def = SHIP_DEFS[ship.type];
  if (def?.role === 'garrison') {
    const tiles = Number.isFinite(ship.range) && ship.range > 0
      ? ship.range
      : (def.range || 8);
    return Math.round(tiles * 36);
  }
  if (Number.isFinite(def?.range) && def.range > 0) {
    return Math.round(def.range * 36);
  }
  return PLAYER_SHOOT_RANGE;
}

/** Cruise ± boost ± EMP slow. Enemies may override cruise (e.g. garrison crawl). */
function getCombatMoveSpeed(ent, phaseMult = 1) {
  const cruise = Number.isFinite(ent?.flySpeed) && ent.flySpeed > 0
    ? ent.flySpeed
    : COMBAT_CRUISE_SPEED;
  const boost = (ent?.combatBoostTimer || 0) > 0 ? (ent.combatBoostMult || 1.6) : 1;
  // Bosses get milder afterburners — still a heavy crawl
  const boostAmt = ent?.isBoss ? 1 + (boost - 1) * 0.35 : boost;
  const emp = ent?.isEnemy && (ent.stunTimer || 0) > 0 ? EMP_SLOW_MULT : 1;
  return cruise * boostAmt * phaseMult * emp;
}

/** Holding-style orbit point around an anchor (progressive angle). */
function pickOrbitDest(ent, anchorX, anchorY, radius) {
  if (!Number.isFinite(ent.orbitAngle)) ent.orbitAngle = Math.random() * Math.PI * 2;
  // Step around the circle — feels like holding waypoints, not jitter teleport
  const step = (Math.PI / 2.6) + Math.random() * 0.35;
  ent.orbitAngle += (ent.orbitDir || 1) * step;
  const r = radius * (0.88 + Math.random() * 0.28);
  return {
    x: anchorX + Math.cos(ent.orbitAngle) * r,
    y: anchorY + Math.sin(ent.orbitAngle) * r,
  };
}

/** Random roam point anywhere in the current camera view (escape scatter). */
function pickRoamDestInView(ent) {
  const v = getViewBounds();
  const pad = 40;
  let minX = (v?.minX ?? -800) + pad;
  let maxX = (v?.maxX ?? 800) - pad;
  let minY = (v?.minY ?? -600) + pad;
  let maxY = (v?.maxY ?? 600) - pad;
  if (maxX <= minX || maxY <= minY) {
    // Fallback around base if view not ready
    const bp = baseWorld();
    return pickOrbitDest(ent, bp.x, bp.y, ROAM_RADIUS);
  }
  // Prefer points away from current position so they really bolt
  let x = minX + Math.random() * (maxX - minX);
  let y = minY + Math.random() * (maxY - minY);
  for (let i = 0; i < 4; i++) {
    const tx = minX + Math.random() * (maxX - minX);
    const ty = minY + Math.random() * (maxY - minY);
    if (dist2(ent.x, ent.y, tx, ty) > dist2(ent.x, ent.y, x, y)) {
      x = tx;
      y = ty;
    }
  }
  return { x, y };
}

function startRoamBoost(enemy) {
  startCombatBoost(enemy);
}

/**
 * Classic drive-by:
 * 1) B-line straight at the building
 * 2) Slow + shoot while in range AND cone
 * 3) Leave cone (or range) → boost far ahead along nose
 * 4) Loop
 */
function setupDriveBy(enemy, tPos) {
  // Always aim at the building itself — no offset approach point
  enemy.destX = tPos.x;
  enemy.destY = tPos.y;
  enemy.driveShots = 0;
  enemy.driveWasInCone = false;
  enemy.driveWasInRange = false;
  enemy.driveWasNear = false;
  enemy.driveClosest = null;
  enemy.driveStateT = 0;
  enemy.status = 'driveby_approach';
}

/** Far boost point ahead of current nose. */
function pickBoostAhead(enemy) {
  const moveAng = Number.isFinite(enemy.heading) ? moveAngleOf(enemy) : 0;
  const yaw = (Math.random() - 0.5) * 0.4;
  const ang = moveAng + yaw;
  const dist = DRIVEBY_BOOST_DIST * (0.95 + Math.random() * 0.3);
  return {
    x: enemy.x + Math.cos(ang) * dist,
    y: enemy.y + Math.sin(ang) * dist,
  };
}

function beginDriveByBoost(enemy) {
  const boost = pickBoostAhead(enemy);
  enemy.destX = boost.x;
  enemy.destY = boost.y;
  enemy.status = 'driveby_boost';
  startCombatBoost(enemy);
  enemy.combatBoost = 1;
  enemy.driveStateT = 0;
  enemy.driveClosest = null;
  enemy.driveWasNear = false;
}

/**
 * Hold-point around a target at standoff range.
 * Lead the point slightly ahead of the orbit so ships approach on a curve
 * that eventually points their nose at the target for a firing pass.
 */
function getEngageHoldPoint(self, targetX, targetY, dt = 1 / 60) {
  const hq = !!self.isHqSupport;
  if (!Number.isFinite(self.engageAngle)) {
    const idNum = Number(self.id);
    const seed = Number.isFinite(idNum) ? idNum : Math.random() * 100;
    self.engageAngle = (seed * 2.3999632) % (Math.PI * 2);
    self.engageAngleDir = (Math.floor(seed) % 2 === 0) ? 1 : -1;
    const baseR = hq ? HQ_ENGAGE_STANDOFF : ENGAGE_STANDOFF;
    const jitter = hq ? HQ_ENGAGE_STANDOFF_JITTER : ENGAGE_STANDOFF_JITTER;
    self.engageStandoff = baseR + (((Math.floor(seed) % 5) - 2) * (jitter / 2));
  }
  // HQ keeps a tighter ring; orbit a bit snappier to stay on the target
  const facing = isFacing(self, targetX, targetY, FIRE_CONE_RAD * 1.4);
  const orbitSpeed = hq
    ? (facing ? 0.75 : 1.45)
    : (facing ? 0.55 : 1.15);
  self.engageAngle += (self.engageAngleDir || 1) * orbitSpeed * dt;

  const r = self.engageStandoff || (hq ? HQ_ENGAGE_STANDOFF : ENGAGE_STANDOFF);
  // Smaller lead = tighter, less wide chase arcs (especially HQ)
  const lead = hq ? 0.32 : 0.55;
  const ang = self.engageAngle + (self.engageAngleDir || 1) * lead;
  return {
    x: targetX + Math.cos(ang) * r,
    y: targetY + Math.sin(ang) * r,
  };
}

/** Soft separation so friendlies don't occupy the same pixel. */
function applySeparation(self, peers, minDist, dt) {
  if (!peers?.length) return;
  let ox = 0;
  let oy = 0;
  for (const other of peers) {
    if (!other || other === self || other.id === self.id) continue;
    if ((other.currentHp ?? other.hp ?? 1) <= 0) continue;
    const d = dist2(self.x, self.y, other.x, other.y);
    if (d < 0.5 || d >= minDist) continue;
    const push = (minDist - d) / minDist;
    ox += ((self.x - other.x) / d) * push;
    oy += ((self.y - other.y) / d) * push;
  }
  if (!ox && !oy) return;
  const len = Math.hypot(ox, oy) || 1;
  const strength = 90 * dt;
  self.x += (ox / len) * strength;
  self.y += (oy / len) * strength;
}

function fireAtTarget(fromEnt, toX, toY, opts = {}) {
  spawnCombatBeam(
    { x: fromEnt.x, y: fromEnt.y },
    { x: toX, y: toY },
    {
      color: opts.color || fromEnt.color || '#ff5d5d',
      duration: opts.duration ?? 0.18,
      width: opts.width ?? 2.4,
    },
  );
  if (opts.shake) startScreenShake(0.12, opts.shake);
}

function getShipBaseHp(ship) {
  return Math.max(1, ship.hp || SHIP_DEFS[ship.type]?.hp || 1);
}

export function getShipMaxHp(ship) {
  const base = getShipBaseHp(ship);
  if (ship?.isHqSupport || ship?.isEnemy) return base;
  return Math.max(1, Math.round(base * getShipHpMultiplier(ship)));
}

function markShipDestroyed(ship) {
  if (!ship || ship.isHqSupport) return;
  ship.currentHp = 0;
  ship.status = 'destroyed';
  ship.targetEnemyId = null;
  const bp = baseWorld();
  ship.destX = bp.x;
  ship.destY = bp.y;
}

export function getShipRepairCost(ship) {
  if (!ship) return 0;
  ensureShipCombatHp(ship);
  const maxHp = getShipMaxHp(ship);
  const missing = Math.max(0, Math.ceil(maxHp - (ship.currentHp || 0)));
  if (missing <= 0) return 0;
  const rank = Math.max(1, Math.floor(ship.mineTier || ship.hpLevel || 1));
  return missing * rank;
}

export function repairShip(shipId) {
  const ship = state.ships.find((s) => s.id === shipId);
  if (!ship) return false;
  const role = SHIP_DEFS[ship.type]?.role;
  if (!isCombatRole(role) && !ship.isHqSupport) return false;
  ensureShipCombatHp(ship);
  const maxHp = getShipMaxHp(ship);
  const missing = Math.max(0, Math.ceil(maxHp - (ship.currentHp || 0)));
  if (missing <= 0) {
    addLog(`${ship.name} is already at full integrity.`);
    return false;
  }
  const cost = getShipRepairCost(ship);
  if ((state.coins || 0) < cost) {
    addLog(`⚠ Not enough coins to repair ${ship.name} ($${fmt(cost)}).`);
    return false;
  }
  spendCoins(cost);
  ship.currentHp = maxHp;
  if (ship.status === 'destroyed' || ship.status === 'returning_repair') {
    ship.status = 'idle';
    ship.targetEnemyId = null;
  }
  addLog(`🔧 ${ship.name} repaired +${fmt(missing)} HP → ${fmt(Math.round(ship.currentHp))}/${fmt(maxHp)}`);
  if (refresh.ui) refresh.ui();
  if (refresh.resources) refresh.resources();
  return true;
}

window.repairShip = function(shipId) {
  if (!repairShip(shipId)) return;
  if (typeof window.renderActionPanel === 'function') window.renderActionPanel();
};

export function ensureShipCombatHp(ship) {
  if (!ship) return;
  const role = SHIP_DEFS[ship.type]?.role;
  if (isCombatRole(role) && !ship.isHqSupport) {
    normalizeShipAttachments(ship, role);
  }
  const maxHp = getShipMaxHp(ship);
  if (!Number.isFinite(ship.currentHp)) ship.currentHp = maxHp;
  ship.currentHp = Math.max(0, Math.min(maxHp, ship.currentHp));
  if (role === 'combat' || ship.isHqSupport) {
    // Fighters share fixed cruise — fly speed is not an upgrade
    ship.flySpeed = COMBAT_CRUISE_SPEED;
    ship.flySpeedLevel = 0;
  } else if (role === 'garrison') {
    // Super-slow hulls — keep def cruise (~¼ fighter speed)
    const defSpd = SHIP_DEFS[ship.type]?.flySpeed;
    ship.flySpeed = Number.isFinite(defSpd) && defSpd > 0
      ? defSpd
      : Math.round(COMBAT_CRUISE_SPEED / 4);
    ship.flySpeedLevel = 0;
  }
  if (isCombatRole(role) || ship.isHqSupport) {
    if (!Number.isFinite(ship.attack) || ship.attack <= 0) {
      ship.attack = SHIP_DEFS[ship.type]?.attack || ship.attack || 0;
    }
    if (!Number.isFinite(ship.attackSpeed) || ship.attackSpeed <= 0) {
      ship.attackSpeed = SHIP_DEFS[ship.type]?.attackSpeed || ship.attackSpeed || 1;
    }
    if (!Number.isFinite(ship.hp) || ship.hp <= 0) {
      ship.hp = getShipBaseHp(ship);
      if (ship.currentHp <= 0 && ship.status !== 'destroyed') ship.currentHp = getShipMaxHp(ship);
    }
  }
}

// ── Attachment projectiles (cluster bombs) ───────────────────
const _clusterProjectiles = [];

function spawnClusterBombs(ship, def) {
  const n = Math.max(3, def.clusterCount || 6);
  const speed = def.clusterSpeed || 200;
  const life = def.clusterLife || 1.2;
  const dmg = Math.max(1, Math.round((ship.attack || 0) * (def.damageMult || 0.5)));
  const baseAng = moveAngleOf(ship);
  for (let i = 0; i < n; i++) {
    const ang = baseAng + (Math.random() - 0.5) * Math.PI * 1.4 + (i / n) * Math.PI * 0.3;
    _clusterProjectiles.push({
      x: ship.x,
      y: ship.y,
      vx: Math.cos(ang) * speed * (0.75 + Math.random() * 0.5),
      vy: Math.sin(ang) * speed * (0.75 + Math.random() * 0.5),
      life,
      age: 0,
      dmg,
      radius: def.explosionRadius || 48,
      ownerId: ship.id,
      color: def.color || '#ff9060',
    });
  }
}

function tickClusterProjectiles(dt) {
  for (let i = _clusterProjectiles.length - 1; i >= 0; i--) {
    const p = _clusterProjectiles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    let hit = false;
    for (const e of state.enemies || []) {
      if ((e.hp || 0) <= 0) continue;
      if (dist2(p.x, p.y, e.x, e.y) > 22) continue;
      hit = true;
      // Splash
      for (const e2 of state.enemies || []) {
        if ((e2.hp || 0) <= 0) continue;
        if (dist2(p.x, p.y, e2.x, e2.y) > p.radius) continue;
        e2.hp = Math.max(0, (e2.hp || 0) - p.dmg);
        markEnemyEngaged(e2);
        if (e2.hp <= 0) destroyEnemy(e2, 'Cluster Bomb');
      }
      spawnCombatExplosion(p.x, p.y, { color: p.color, radius: p.radius * 0.7, duration: 0.35 });
      break;
    }
    if (hit || p.age >= p.life) {
      if (!hit && p.age >= p.life) {
        // Airburst
        for (const e2 of state.enemies || []) {
          if ((e2.hp || 0) <= 0) continue;
          if (dist2(p.x, p.y, e2.x, e2.y) > p.radius) continue;
          e2.hp = Math.max(0, (e2.hp || 0) - p.dmg);
          markEnemyEngaged(e2);
          if (e2.hp <= 0) destroyEnemy(e2, 'Cluster Bomb');
        }
        spawnCombatExplosion(p.x, p.y, { color: p.color, radius: p.radius * 0.55, duration: 0.3 });
      }
      _clusterProjectiles.splice(i, 1);
    }
  }
}

export function drawClusterProjectiles(ctx) {
  if (!ctx || !_clusterProjectiles.length) return;
  if (state.settings?.showVisualEffects === false) return;
  for (const p of _clusterProjectiles) {
    const t = 1 - p.age / Math.max(0.05, p.life);
    ctx.save();
    ctx.globalAlpha = 0.55 + t * 0.45;
    ctx.fillStyle = p.color || '#ff9060';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function tickShipAttachments(ship, enemy, dt, shootRange) {
  if (!ship.attachmentCds) ship.attachmentCds = {};
  const cds = ship.attachmentCds;
  // Garrisons are turret-like — full 360° fire arc
  const omni = SHIP_DEFS[ship.type]?.role === 'garrison';
  const facing = !!(enemy && (omni || isFacing(ship, enemy.x, enemy.y)));
  const inRange = enemy && dist2(ship.x, ship.y, enemy.x, enemy.y) < shootRange;
  const atk = ship.attack || 0;
  const atkRate = Math.max(0.05, ship.attackSpeed || 1);

  // Tick all cooldowns
  for (const id of Object.keys(cds)) {
    if (cds[id] > 0) cds[id] = Math.max(0, cds[id] - dt);
  }

  // Active spiral sweep
  if ((ship._spiralT || 0) > 0 && ship._spiralDef) {
    ship._spiralT -= dt;
    const def = ship._spiralDef;
    const tickEvery = 1 / Math.max(4, def.tickRate || 18);
    ship._spiralAcc = (ship._spiralAcc || 0) + dt;
    while (ship._spiralAcc >= tickEvery) {
      ship._spiralAcc -= tickEvery;
      ship._spiralAng = (ship._spiralAng || 0) + 0.55;
      const dmg = Math.max(1, Math.round(atk * (def.damageMult || 0.35)));
      // Twin beams left/right of heading
      for (const side of [-1, 1]) {
        const ang = moveAngleOf(ship) + side * (Math.PI / 2) + ship._spiralAng * side;
        const reach = shootRange * 0.85;
        const tx = ship.x + Math.cos(ang) * reach;
        const ty = ship.y + Math.sin(ang) * reach;
        fireAtTarget(ship, tx, ty, { color: def.color || '#c080ff', width: 1.6, duration: 0.08 });
        for (const e of state.enemies || []) {
          if ((e.hp || 0) <= 0) continue;
          // Point-to-segment distance approx: near ray
          const dx = e.x - ship.x;
          const dy = e.y - ship.y;
          const proj = dx * Math.cos(ang) + dy * Math.sin(ang);
          if (proj < 0 || proj > reach) continue;
          const px = ship.x + Math.cos(ang) * proj;
          const py = ship.y + Math.sin(ang) * proj;
          if (dist2(px, py, e.x, e.y) > 28) continue;
          e.hp = Math.max(0, e.hp - dmg);
          markEnemyEngaged(e);
          if (e.hp <= 0) destroyEnemy(e, ship.name);
        }
      }
    }
    if (ship._spiralT <= 0) {
      ship._spiralT = 0;
      ship._spiralDef = null;
    }
  }

  const attachments = ship.attachments || [];
  let hasPulse = false;
  for (const id of attachments) {
    const def = getAttachmentDef(id);
    if (!def || def.kind !== 'offense') continue;
    if (def.fireMode === 'pulse') hasPulse = true;

    if (def.fireMode === 'stun' && enemy && inRange && facing) {
      if ((cds.stun || 0) <= 0) {
        enemy.stunTimer = Math.max(enemy.stunTimer || 0, def.stunDuration || 2);
        enemy.combatBoostTimer = 0;
        enemy.combatBoost = 0;
        markEnemyEngaged(enemy);
        fireAtTarget(ship, enemy.x, enemy.y, { color: def.color || '#a0e0ff', width: 3.2, duration: 0.28 });
        spawnEmpBlast(enemy.x, enemy.y, 36, { duration: 0.35, color: '#8ad8ff' });
        cds.stun = def.cooldown || 30;
      }
    }

    if (def.fireMode === 'beam' && enemy && inRange && facing) {
      if ((cds.beam_laser || 0) <= 0) {
        const dmg = Math.max(1, Math.round(atk * (def.damageMult || 3)));
        enemy.hp = Math.max(0, (enemy.hp || 0) - dmg);
        markEnemyEngaged(enemy);
        fireAtTarget(ship, enemy.x, enemy.y, {
          color: def.color || '#ffd060',
          width: 3.4,
          duration: def.beamDuration || 0.45,
        });
        cds.beam_laser = def.cooldown || 3;
        if (enemy.hp <= 0) destroyEnemy(enemy, ship.name);
      }
    }

    if (def.fireMode === 'cluster') {
      if ((cds.cluster_bombs || 0) <= 0) {
        spawnClusterBombs(ship, def);
        cds.cluster_bombs = def.cooldown || 4.5;
      }
    }

    if (def.fireMode === 'spiral') {
      if ((cds.spiral_laser || 0) <= 0 && (ship._spiralT || 0) <= 0) {
        ship._spiralT = def.duration || 1;
        ship._spiralDef = def;
        ship._spiralAng = 0;
        ship._spiralAcc = 0;
        cds.spiral_laser = def.cooldown || 10;
      }
    }
  }

  // Pulse lasers (one or more): standard forward fire
  if (hasPulse && enemy && inRange && facing) {
    if ((ship.atkCd || 0) <= 0 && atk > 0) {
      const pulses = attachments.filter((id) => getAttachmentDef(id)?.fireMode === 'pulse').length || 1;
      const dmg = atk * pulses; // stack if multiple pulse mounts
      enemy.hp = Math.max(0, (enemy.hp || 0) - dmg);
      markEnemyEngaged(enemy);
      fireAtTarget(ship, enemy.x, enemy.y, { color: '#5ec8ff', width: 2.1, duration: 0.14 });
      ship.atkCd = 1 / atkRate;
      if (enemy.hp <= 0) destroyEnemy(enemy, ship.name);
    }
  }

  // Regen passive
  const regen = getShipRegenPerSec(ship);
  if (regen > 0) {
    const maxHp = getShipMaxHp(ship);
    if ((ship.currentHp || 0) > 0 && ship.currentHp < maxHp) {
      ship.currentHp = Math.min(maxHp, ship.currentHp + maxHp * regen * dt);
    }
  }
}

function getCombatShips() {
  return state.ships.filter((s) => {
    if (s.isHqSupport) return (s.currentHp ?? s.hp ?? 0) > 0;
    const role = SHIP_DEFS[s.type]?.role;
    if (!isCombatRole(role)) return false;
    if (s.status === 'destroyed') return false;
    ensureShipCombatHp(s);
    if ((s.currentHp ?? 0) <= 0) return false;
    return true;
  });
}

function getActiveTurrets() {
  return (state.turrets || []).filter((t) => (t.health || 0) > 0 && (t.power || 0) > 0);
}

export function hasCombatDefenses() {
  return getCombatShips().length > 0 || getActiveTurrets().length > 0;
}

/** True while any module or turret is still standing. */
function hasLivingStructures() {
  for (const m of state.modules || []) {
    if ((m.health || 0) > 0) return true;
  }
  for (const t of state.turrets || []) {
    if ((t.health || 0) > 0) return true;
  }
  return false;
}

/**
 * Raid AI priority: living buildings/turrets first.
 * Only when every structure is down do enemies target the Base.
 */
function pickRaidTarget() {
  const pool = [];
  for (const m of state.modules || []) {
    if ((m.health || 0) <= 0) continue;
    const w = gridToWorld(m.col, m.row);
    pool.push({ kind: 'module', id: m.id, x: w.x, y: w.y - 10, label: m.name || m.type });
  }
  for (const t of state.turrets || []) {
    if ((t.health || 0) <= 0) continue;
    const w = gridToWorld(t.col, t.row);
    pool.push({ kind: 'turret', id: t.id, x: w.x, y: w.y - 8, label: t.name || t.type || 'Turret' });
  }
  if (pool.length) {
    return { ...pool[Math.floor(Math.random() * pool.length)] };
  }
  // Structures clear — only then assault the HQ
  if ((state.base.health || 0) > 0) {
    const bp = baseWorld();
    return { kind: 'base', id: 0, x: bp.x, y: bp.y, label: state.base.name || 'Base Station' };
  }
  return null;
}

function resolveTargetPos(target) {
  const bp = baseWorld();
  // Never sit on base while structures still stand
  if (!target || (target.kind === 'base' && hasLivingStructures())) {
    const next = pickRaidTarget();
    if (next) {
      if (target) Object.assign(target, next);
      else if (arguments.length) { /* no-op */ }
      return { x: next.x, y: next.y, label: next.label, kind: next.kind };
    }
    return { x: bp.x, y: bp.y, label: state.base.name || 'Base Station', kind: 'base' };
  }
  if (target.kind === 'module') {
    const m = state.modules.find((x) => x.id === target.id);
    if (m && (m.health || 0) > 0) {
      const w = gridToWorld(m.col, m.row);
      return { x: w.x, y: w.y - 10, label: m.name || target.label, kind: 'module' };
    }
    const next = pickRaidTarget();
    if (next) {
      Object.assign(target, next);
      return { x: next.x, y: next.y, label: next.label, kind: next.kind };
    }
    return { x: bp.x, y: bp.y, label: state.base.name || 'Base Station', kind: 'base' };
  }
  if (target.kind === 'turret') {
    const t = (state.turrets || []).find((x) => x.id === target.id);
    if (t && (t.health || 0) > 0) {
      const w = gridToWorld(t.col, t.row);
      return { x: w.x, y: w.y - 8, label: t.name || target.label || 'Turret', kind: 'turret' };
    }
    const next = pickRaidTarget();
    if (next) {
      Object.assign(target, next);
      return { x: next.x, y: next.y, label: next.label, kind: next.kind };
    }
    return { x: bp.x, y: bp.y, label: state.base.name || 'Base Station', kind: 'base' };
  }
  // Base assault
  if ((state.base.health || 0) <= 0) {
    return { x: bp.x, y: bp.y, label: state.base.name || 'Base Station', kind: 'base', destroyed: true };
  }
  return { x: bp.x, y: bp.y, label: state.base.name || 'Base Station', kind: 'base' };
}

function destroyTurret(turret) {
  if (!turret) return;
  const w = gridToWorld(turret.col, turret.row);
  spawnCombatExplosion(w.x, w.y - 6, { radius: 48, color: '#ff6a3a', duration: 0.5 });
  startScreenShake(0.22, 4);
  state.turrets = (state.turrets || []).filter((t) => t.id !== turret.id);
  if (state.selectedTurret === turret.id) state.selectedTurret = null;
  invalidateNetworkCache();
  addLog(`💥 ${turret.name || 'Turret'} destroyed!`);
  if (refresh.ui) refresh.ui();
}

function spawnPointAroundBase() {
  const bp = baseWorld();
  // Convert tile range to world units (iso tile ~ TILE diagonal; 36 matches ship holding orbits)
  const rangeTiles = BASE_RANGE[Math.max(0, (state.base.level || 1) - 1)] || 8;
  const range = rangeTiles * 36;
  const ang = Math.random() * Math.PI * 2;
  const dist = range * (1.05 + Math.random() * 0.25);
  return {
    x: bp.x + Math.cos(ang) * dist,
    y: bp.y + Math.sin(ang) * dist,
  };
}

function createEnemy(typeId, target, raidTier = 0) {
  const baseDef = ENEMY_DEFS[typeId] || ENEMY_DEFS.raider;
  const def = scaleEnemyStats(baseDef, { sol: state.sol, raidTier });
  const spawn = spawnPointAroundBase();
  const isBoss = !!def.isBoss;
  return {
    id: _enemyIdCounter++,
    type: def.id,
    name: isBoss ? def.label : `${def.label} #${_enemyIdCounter}`,
    x: spawn.x,
    y: spawn.y,
    destX: target.x,
    destY: target.y,
    heading: angleTo(spawn.x, spawn.y, target.x, target.y) + Math.PI / 2,
    hp: def.hp,
    maxHp: def.hp,
    attack: def.attack,
    attackSpeed: def.attackSpeed,
    flySpeed: def.flySpeed || COMBAT_CRUISE_SPEED,
    color: def.color,
    size: def.size,
    isBoss,
    target: { ...target },
    status: 'inbound',
    engaged: false,
    phaseTimer: 0,
    atkCd: randRange(0.2, 0.8),
    trail: [],
    isEnemy: true,
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    turnRadiusRandomness: (Math.random() - 0.5) * 2,
  };
}

function markCrisisHit(target) {
  if (!state.activeRaid || !target) return;
  if (target.kind === 'base') {
    state.activeRaid.baseHit = true;
    return;
  }
  if (target.kind === 'module' && target.id != null) {
    if (!state.activeRaid.hitModuleIds) state.activeRaid.hitModuleIds = {};
    state.activeRaid.hitModuleIds[target.id] = true;
  }
}

function applyDamageToTarget(target, dmg) {
  if (!target || dmg <= 0) return 0;
  if (target.kind === 'base') {
    // Structures must fall before HQ can be damaged
    if (hasLivingStructures()) return 0;
    let remaining = dmg;
    const shield = state.base.shield || 0;
    if (shield > 0) {
      const absorbed = Math.min(shield, remaining);
      state.base.shield = shield - absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      const prev = state.base.health || 0;
      state.base.health = Math.max(0, prev - remaining);
      if (prev > 0 && state.base.health <= 0) {
        markCrisisHit(target);
        onBaseDestroyedByRaid();
        return dmg;
      }
    }
    markCrisisHit(target);
    return dmg;
  }
  if (target.kind === 'module') {
    const m = state.modules.find((x) => x.id === target.id);
    if (!m) return 0;
    const prev = m.health || 0;
    m.health = Math.max(0, prev - dmg);
    // Dropping to 0 HP removes the module from power/lab networks
    if (prev > 0 && m.health <= 0) invalidateNetworkCache();
    if (m.health < prev) markCrisisHit(target);
    return dmg;
  }
  if (target.kind === 'turret') {
    const t = (state.turrets || []).find((x) => x.id === target.id);
    if (!t) return 0;
    const prev = t.health || 0;
    t.health = Math.max(0, prev - dmg);
    if (prev > 0 && t.health <= 0) destroyTurret(t);
    return dmg;
  }
  if (target.kind === 'ship') {
    const ship = state.ships.find((s) => s.id === target.id);
    if (!ship) return 0;
    ensureShipCombatHp(ship);
    let remaining = dmg;
    if (state.researchUnlocks?.armor_plating) remaining *= 0.9;
    ship.currentHp = Math.max(0, ship.currentHp - remaining);
    return dmg;
  }
  return 0;
}

function grantLoot(enemy, killerPos) {
  const raidTier = state.activeRaid?.raidTier ?? state.raidsDefeated ?? 0;
  const loot = getEnemyLoot(enemy.type, state.sol, raidTier);
  const pos = killerPos || { x: enemy.x, y: enemy.y };
  for (const entry of loot) {
    state.resources[entry.type] = Math.min(
      RESOURCE_CAP,
      (state.resources[entry.type] || 0) + entry.amount,
    );
    spawnFloatie(entry.type, entry.amount, pos);
  }
  const bossBonus = enemy.isBoss ? 800 + raidTier * 200 : 0;
  const coins = Math.round(40 + state.sol * 8 + enemy.maxHp * 0.05 + bossBonus);
  const before = state.coins || 0;
  addCoins(coins, { silent: true });
  const gained = Math.max(0, (state.coins || 0) - before);
  const tag = enemy.isBoss ? '☠ BOSS ' : '';
  const coinPart = gained > 0 ? ` — +$${fmt(gained)}` : '';
  addLog(
    `💀 ${tag}Destroyed ${enemy.name}${coinPart}` +
      (loot.length ? `${coinPart ? ',' : ' —'} ${loot.map((l) => `${fmt(l.amount)} ${l.label}`).join(', ')}` : ''),
  );
  return { loot, coins: gained };
}

function destroyEnemy(enemy, byLabel = 'defenses') {
  if (!enemy || enemy._dead) return;
  enemy._dead = true;
  enemy.hp = 0;
  grantLoot(enemy, { x: enemy.x, y: enemy.y });
  state.enemies = (state.enemies || []).filter((e) => e.id !== enemy.id);
  if (state.activeRaid) {
    state.activeRaid.kills = (state.activeRaid.kills || 0) + 1;
  }
  state.pirateKills = (state.pirateKills || 0) + 1;
  refreshOverviewThreat();
  // Clear ship targets
  for (const s of state.ships) {
    if (s.targetEnemyId === enemy.id) s.targetEnemyId = null;
  }
  checkRaidComplete();
}

function refreshOverviewThreat() {
  import('../ui/panels.js').then((m) => m.patchSolPanel?.('pirate')).catch(() => {});
}

/** Raise pirate aggression (expansion / craft). Clamped 0–100. */
export function bumpPirateStatus(amount) {
  const add = Math.max(0, Number(amount) || 0);
  if (add <= 0) return state.pirateStatus || 0;
  state.pirateStatus = Math.min(100, Math.max(0, (state.pirateStatus || 0) + add));
  refreshOverviewThreat();
  return state.pirateStatus;
}

/** Aggression bump when a ship/turret/building is completed. */
export function bumpPirateStatusOnExpand() {
  const threat = getPirateThreatLevel(state);
  return bumpPirateStatus(getPirateStatusBuildBump(threat));
}

function checkRaidComplete() {
  if (!state.activeRaid) return;
  if ((state.enemies || []).length > 0) return;
  // If HQ was sacked, defeat path already fired
  if (state.activeRaid.sacked) {
    endRaid(false);
    return;
  }
  endRaid(true);
}

/**
 * Base destroyed mid-raid: pirates loot 5–20% of coins + materials, then withdraw.
 * Resets pirate aggression. Not a full game-over.
 */
function onBaseDestroyedByRaid() {
  if (!state.activeRaid || state.activeRaid.sacked) return;
  state.activeRaid.sacked = true;

  const pct = 0.05 + Math.random() * 0.15; // 5–20%
  const stolen = [];
  const coinTake = Math.floor((state.coins || 0) * pct);
  if (coinTake > 0) {
    state.coins = Math.max(0, (state.coins || 0) - coinTake);
    stolen.push(`$${fmt(coinTake)}`);
  }
  for (const [type, def] of Object.entries(RESOURCE_DEFS || {})) {
    if (!isStorableResource(type) || !def || def.special) continue;
    const have = state.resources[type] || 0;
    const take = Math.floor(have * pct);
    if (take <= 0) continue;
    state.resources[type] = have - take;
    stolen.push(`${fmt(take)} ${def.label || type}`);
  }

  // All hostiles break off and flee the sector
  const bp = baseWorld();
  for (const e of state.enemies || []) {
    e.status = 'fleeing';
    e.engaged = false;
    e.target = null;
    e.engageTargetId = null;
    e.phaseTimer = 10;
    const ang = Math.atan2(e.y - bp.y, e.x - bp.x) || (Math.random() * Math.PI * 2);
    const dist = 2400 + Math.random() * 800;
    e.destX = e.x + Math.cos(ang) * dist;
    e.destY = e.y + Math.sin(ang) * dist;
  }

  startScreenShake(0.45, 7);
  if (stolen.length) {
    const preview = stolen.slice(0, 6).join(', ') + (stolen.length > 6 ? '…' : '');
    addLog(`🏴‍☠️ BASE DESTROYED — pirates looted ~${Math.round(pct * 100)}%: ${preview}`);
  } else {
    addLog('🏴‍☠️ BASE DESTROYED — pirates found nothing worth taking and withdrew.');
  }
  showTransmissionMessage(
    stolen.length
      ? `Commander — the station is down. Hostiles stripped the vaults (~<strong>${Math.round(pct * 100)}%</strong> of stores) and are breaking off. Repair the Base and rebuild. Pirate pressure has reset — for now.`
      : `Commander — the station is offline. Hostiles swept the sector, found nothing of value, and are withdrawing. Repair the Base. Pirate pressure has reset.`,
    18,
    'juno',
  );

  // Clear aggression immediately; finish raid after a short flee window
  state.pirateStatus = 0;
  hideHqSupportPanel();
  if (refresh.ui) refresh.ui();
  if (refresh.resources) refresh.resources();
  if (refresh.header) refresh.header();

  if (_raidSpawnTimer) {
    clearTimeout(_raidSpawnTimer);
    _raidSpawnTimer = null;
  }
  setTimeout(() => {
    if (state.activeRaid?.sacked) endRaid(false);
  }, 2800);
}

function endRaid(victory) {
  if (!state.activeRaid) return;
  const raid = state.activeRaid;
  state.activeRaid = null;
  state.enemies = [];
  hideHqSupportPanel();

  if (victory) {
    state.raidsDefeated = (state.raidsDefeated || 0) + 1;
    const next = getRaidDifficulty(state.raidsDefeated);
    addLog(
      `⚔ Raid defeated — ${raid.kills || 0} hostiles destroyed. ` +
      `Next wing scales to rank ${next.tier + 1} (${next.waveSize}+ craft` +
      `${next.garrisonCount ? `, ${next.garrisonCount} Garrison` : ''}).`,
    );
    showTransmissionMessage(
      NPCS.dax?.transmissionLines?.raid_won?.(raid.kills || 0)
        || `Sector clear, Commander. <strong>${raid.kills || 0}</strong> hostiles neutralized. Expect a harder response next time — they're learning.`,
      14,
      'dax',
    );
  } else {
    // Defeat / sack — aggression already zeroed; keep raidsDefeated as-is
    state.pirateStatus = 0;
    if (!raid.sacked) {
      addLog('⚔ Hostiles withdrew from the sector.');
    }
  }
  try { saveGame(); } catch (_) { /* ignore */ }

  // Send combat + HQ ships home (HQ mercs despawn after docking)
  const bp = baseWorld();
  let hqRtb = 0;
  for (const ship of state.ships) {
    const role = SHIP_DEFS[ship.type]?.role;
    if (!ship.isHqSupport && !isCombatRole(role)) continue;
    if (ship.status === 'engaging' || ship.status === 'intercepting' || ship.isHqSupport) {
      ship.status = 'returning_repair';
      ship.targetEnemyId = null;
      ship.destX = bp.x;
      ship.destY = bp.y;
      ship.flightTotalDist = dist2(ship.x, ship.y, ship.destX, ship.destY);
      if (ship.isHqSupport) hqRtb += 1;
    }
  }
  if (hqRtb > 0) addLog(`🛡 HQ wing RTB (${hqRtb}) — will depart after docking.`);
  if (refresh.ui) refresh.ui();
  if (refresh.resources) refresh.resources();
  if (refresh.header) refresh.header();
}

function engagePlayerCombatShips() {
  const enemies = state.enemies || [];
  if (!enemies.length) return;
  for (const ship of state.ships) {
    const role = SHIP_DEFS[ship.type]?.role;
    if (!ship.isHqSupport && !isCombatRole(role)) continue;
    // Destroyed hulls limp home and wait for manual repair
    if (ship.status === 'destroyed' || (ship.currentHp || 0) <= 0) continue;
    if (ship.status === 'returning_repair') continue;
    ensureShipCombatHp(ship);
    if ((ship.currentHp || 0) <= 0) continue;
    // Combat hulls never haul ore — scramble from any non-cargo state
    if ((ship.cargo || 0) > 0) continue;
    ship.status = 'engaging';
    ship.targetEnemyId = pickNearestEnemy(ship)?.id ?? enemies[0].id;
    if (!Number.isFinite(ship.atkCd) || ship.atkCd < 0) ship.atkCd = randRange(0.05, 0.35);
  }
}

function pickNearestEnemy(from) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies || []) {
    if ((e.hp || 0) <= 0) continue;
    const d = dist2(from.x, from.y, e.x, e.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function pickNearestCombatShip(from) {
  let best = null;
  let bestD = Infinity;
  for (const s of getCombatShips()) {
    ensureShipCombatHp(s);
    if (s.currentHp <= 0) continue;
    const d = dist2(from.x, from.y, s.x, s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function markEnemyEngaged(enemy) {
  if (!enemy || enemy.engaged) return;
  enemy.engaged = true;
  enemy.status = 'dogfight_roam';
  enemy.phaseTimer = randRange(DOGFIGHT_ROAM_MIN_S, DOGFIGHT_ROAM_MAX_S);
  const roam = pickRoamDestInView(enemy);
  enemy.destX = roam.x;
  enemy.destY = roam.y;
  startRoamBoost(enemy);
}

// ── HQ support panel (top-center, separate from event warning) ──

function countPlayerFleetShips() {
  return (state.ships || []).filter((s) => !s.isHqSupport).length;
}

/** HQ cost = threat × ships × 40k (min 1 ship). */
function currentHqSupportCost() {
  return getHqSupportCost({
    sol: state.sol,
    shipCount: countPlayerFleetShips(),
    threatLevel: getPirateThreatLevel(state),
    gameState: state,
  });
}

function showHqSupportPanel(cost) {
  const panel = document.getElementById('hq-support-panel');
  const costEl = document.getElementById('hq-support-cost');
  const priceEl = document.getElementById('hq-support-call-price');
  const callBtn = document.getElementById('hq-support-call-btn');
  const price = `$${fmt(cost)}`;
  if (costEl) costEl.textContent = price;
  if (priceEl) priceEl.textContent = price;
  if (callBtn) callBtn.disabled = (state.coins || 0) < cost;
  if (panel) panel.classList.add('visible');
}

/** Refresh HQ call button affordability while panel is open (money changes). */
export function patchHqSupportPanel() {
  if (!state.activeRaid || state.activeRaid.hqCalled) return;
  const panel = document.getElementById('hq-support-panel');
  if (!panel?.classList.contains('visible')) return;
  showHqSupportPanel(currentHqSupportCost());
}

function hideHqSupportPanel() {
  const panel = document.getElementById('hq-support-panel');
  if (panel) panel.classList.remove('visible');
}

window.dismissHqSupportPanel = function() {
  hideHqSupportPanel();
};
window.patchHqSupportPanel = patchHqSupportPanel;

// ── Public API ───────────────────────────────────────────────

/**
 * Start a pirate raid wave. If a raid is already active, spawns reinforcements
 * without wiping existing hostiles or resetting raid progress.
 */
export function startDailyRaid(opts = {}) {
  if (!state.solStarted && !opts.force) return false;
  if (!state.solStarted) state.solStarted = true;

  // Don't stack with base already dead
  if ((state.base.health || 0) <= 0) return false;

  const diff = getRaidDifficulty(state.raidsDefeated || 0);
  const waveSize = Math.max(1, opts.waveSize || diff.waveSize || RAID_WAVE_SIZE);
  const garrisonCount = Math.max(0, opts.garrisonCount ?? diff.garrisonCount ?? 0);
  const raidTier = Math.max(0, opts.raidTier ?? diff.tier ?? 0);
  const reinforce = !!state.activeRaid;
  const undefended = !hasCombatDefenses();
  const hqCost = currentHqSupportCost();

  if (!reinforce) {
    const eventId = makeEventId();
    state.activeRaid = {
      id: eventId,
      startedSol: state.sol,
      waveSize,
      garrisonCount,
      raidTier,
      kills: 0,
      hqCalled: false,
      undefended,
      waves: 1,
    };
    // Raid is underway — cool aggression so the next SOL isn't auto-raid
    state.pirateStatus = Math.min(
      state.pirateStatus || 0,
      PIRATE_STATUS_AFTER_RAID,
    );
    refreshOverviewThreat();
    state.eventCounts = state.eventCounts || {};
    state.eventCounts.pirate_raid = (state.eventCounts.pirate_raid || 0) + 1;

    const title = eventTitleHtml('pirate_raid', garrisonCount ? 'PIRATE ASSAULT' : 'PIRATE RAID', 'md');
    const strengthLine = `Rank ${raidTier + 1} · ${waveSize} craft`
      + (garrisonCount ? ` · ${garrisonCount} Garrison hull${garrisonCount > 1 ? 's' : ''}` : '');
    const detail = undefended
      ? `<div class="ew-raid">
          <div class="ew-raid-kicker">⚠ SECTOR ALERT</div>
          <div class="ew-raid-lead">Hostile signatures on approach.</div>
          <div class="ew-raid-body">Pirates are vectoring on your structures. ${strengthLine}.</div>
          <div class="ew-raid-status warn">
            <span class="ew-raid-status-dot"></span>
            No combat ships or powered turrets detected — call HQ support
          </div>
        </div>`
      : `<div class="ew-raid">
          <div class="ew-raid-kicker">⚠ SECTOR ALERT</div>
          <div class="ew-raid-lead">Hostile signatures on approach.</div>
          <div class="ew-raid-body">Pirates are vectoring on your structures. ${strengthLine}. Defenses are online — HQ support is also available.</div>
          <div class="ew-raid-status ok">
            <span class="ew-raid-status-dot"></span>
            Combat ships auto-engage · Powered turrets will fire
          </div>
        </div>`;

    showEventWarning(title, detail, RAID_WARNING_DURATION_MS);
    // Always offer HQ support during raids (not only when undefended)
    if (!state.activeRaid.hqCalled) showHqSupportPanel(hqCost);
    logEventTransmission(
      `<strong>Pirate Raid</strong> — Hostile craft inbound (SOL ${state.sol}).`,
      'dax',
      { eventId, eventType: 'pirate_raid', title: 'Pirate Raid', showPopup: false },
    );

    queueTransmissions([
      {
        text:
          NPCS.vex?.transmissionLines?.raid_incoming?.()
          || `Heh. Nice little operation you've got here, Commander. We're coming to collect. Try not to cry.`,
        duration: 12,
        npc: 'vex',
        delay: 600,
      },
    ]);

    addLog('⚔ PIRATE RAID — Hostile craft inbound!');
    try { focusOnBaseEvent(); } catch (_) { /* ignore */ }
  } else {
    // Reinforce ongoing raid — keep kills / HQ state, add another wave
    state.activeRaid.waveSize = (state.activeRaid.waveSize || 0) + waveSize;
    state.activeRaid.waves = (state.activeRaid.waves || 1) + 1;
    state.eventCounts = state.eventCounts || {};
    state.eventCounts.pirate_raid = (state.eventCounts.pirate_raid || 0) + 1;

    const title = eventTitleHtml('pirate_raid', 'REINFORCEMENTS', 'md');
    const detail = `<div class="ew-raid">
        <div class="ew-raid-kicker">⚠ SECTOR ALERT</div>
        <div class="ew-raid-lead">Additional hostiles inbound.</div>
        <div class="ew-raid-body">Another pirate wing is joining the fight. Stay sharp.</div>
        <div class="ew-raid-status ok">
          <span class="ew-raid-status-dot"></span>
          Wave ${state.activeRaid.waves} · Defenses remain engaged
        </div>
      </div>`;
    showEventWarning(title, detail, Math.min(RAID_WARNING_DURATION_MS, 8000));
    addLog(`⚔ Pirate reinforcements inbound (wave ${state.activeRaid.waves})!`);
    // Refresh HQ offer / price if support not yet called
    if (!state.activeRaid.hqCalled) showHqSupportPanel(hqCost);
  }

  // Always append a new wave (never wipe living hostiles)
  spawnRaidWave(waveSize, reinforce ? 0 : garrisonCount);

  if (_raidSpawnTimer) clearTimeout(_raidSpawnTimer);
  _raidSpawnTimer = setTimeout(() => {
    _raidSpawnTimer = null;
    if (state.activeRaid && (state.enemies || []).length) {
      addLog(reinforce
        ? '⚔ Reinforcements entering weapons range!'
        : '⚔ Pirate craft entering weapons range!');
      engagePlayerCombatShips();
    }
  }, RAID_SPAWN_DELAY_MS);

  return true;
}

/** Append enemies to the current raid (does not clear existing). */
function spawnRaidWave(count = RAID_WAVE_SIZE, garrisonCount = 0) {
  if (!state.activeRaid) return;
  const raidTier = state.activeRaid.raidTier ?? state.raidsDefeated ?? 0;
  const roster = buildRaidRoster(count, garrisonCount);
  const spawned = [];
  let bosses = 0;
  for (const typeId of roster) {
    const target = pickRaidTarget();
    const e = createEnemy(typeId, target, raidTier);
    if (e.isBoss) bosses += 1;
    spawned.push(e);
  }
  state.enemies = [...(state.enemies || []), ...spawned];
  engagePlayerCombatShips();
  const bossNote = bosses > 0 ? ` — including ${bosses} Garrison boss${bosses > 1 ? 'es' : ''}!` : '';
  addLog(`⚔ ${spawned.length} pirate craft on approach (rank ${raidTier + 1})${bossNote}`);
  if (refresh.ui) refresh.ui();
}

export function callHqCombatSupport() {
  if (!state.activeRaid || state.activeRaid.hqCalled) {
    addLog('⚠ HQ support unavailable.');
    hideHqSupportPanel();
    return false;
  }
  const cost = currentHqSupportCost();
  if ((state.coins || 0) < cost) {
    addLog(`⚠ Insufficient funds for HQ support ($${fmt(cost)}).`);
    showTransmissionMessage(
      `Negative, Commander — Star Command cannot authorize a sortie without <strong>$${fmt(cost)}</strong> in operational funds.`,
      12,
      'juno',
    );
    return false;
  }
  spendCoins(cost);

  state.activeRaid.hqCalled = true;
  hideHqSupportPanel();
  closeEventWarning();

  // Spawn temporary HQ combat ships near base
  const supportTypes = [
    { type: 'viper', name: 'Viper' },
    { type: 'viper', name: 'Viper' },
    { type: 'interceptor', name: 'Interceptor' },
  ];
  for (const entry of supportTypes) {
    const def = SHIP_DEFS[entry.type];
    if (!def) continue;
    const id = bumpShipIdCounter();
    const ang = Math.random() * Math.PI * 2;
    const bp = baseWorld();
    const ship = {
      id,
      name: `HQ ${entry.name} #${id}`,
      type: entry.type,
      capacity: 0,
      flySpeed: COMBAT_CRUISE_SPEED,
      mineSpeed: 0,
      mineBonus: 0,
      loadSpeed: 0,
      // 2× hull; DPS = attack × attackSpeed (same model as enemies)
      hp: (def.hp || 1) * 2,
      currentHp: (def.hp || 1) * 2,
      attack: def.attack || 0,
      attackSpeed: def.attackSpeed || 1,
      mineTier: def.mineTier || 1,
      capacityLevel: 0,
      flySpeedLevel: 0,
      mineSpeedLevel: 0,
      mineBonusLevel: 0,
      loadSpeedLevel: 0,
      hpLevel: 0,
      attackLevel: 0,
      atkRateLevel: 0,
      depotType: 'base',
      depotId: null,
      cargo: 0,
      cargoResource: null,
      status: 'engaging',
      targetNode: null,
      targetEnemyId: null,
      heading: ang,
      x: bp.x + Math.cos(ang) * 40,
      y: bp.y + Math.sin(ang) * 40,
      destX: bp.x,
      destY: bp.y,
      mineTimer: 0,
      isHqSupport: true,
      atkCd: 0.05,
    };
    state.ships.push(ship);
  }

  // If enemies not spawned yet, spawn then engage
  if (!(state.enemies || []).length) {
    spawnRaidWave(
      state.activeRaid.waveSize || RAID_WAVE_SIZE,
      state.activeRaid.garrisonCount || 0,
    );
  } else {
    engagePlayerCombatShips();
  }

  addLog(`🛡 HQ support deployed (−$${fmt(cost)}).`);
  showTransmissionMessage(
    NPCS.juno?.transmissionLines?.hq_support?.(cost)
      || `Copy, Commander. Star Command is diverting a combat wing to your sector (−$${fmt(cost)}). Hold the line.`,
    14,
    'juno',
  );
  if (refresh.ui) refresh.ui();
  if (refresh.resources) refresh.resources();
  return true;
}

window.callHqCombatSupport = callHqCombatSupport;

function isCriticalHp(enemy) {
  return (enemy.hp || 0) / Math.max(1, enemy.maxHp || enemy.hp || 1) < FLEE_NO_FLYBY_HP;
}

function beginRoamPhase(enemy) {
  enemy.status = 'dogfight_roam';
  enemy.phaseTimer = randRange(DOGFIGHT_ROAM_MIN_S, DOGFIGHT_ROAM_MAX_S);
  const roam = pickRoamDestInView(enemy);
  enemy.destX = roam.x;
  enemy.destY = roam.y;
  startRoamBoost(enemy);
}

function tickEnemy(enemy, dt) {
  if ((enemy.hp || 0) <= 0) return;

  // Raid sacked — break for deep space
  if (enemy.status === 'fleeing' || state.activeRaid?.sacked) {
    enemy.status = 'fleeing';
    enemy.engaged = false;
    enemy.target = null;
    tickCombatBoost(enemy, dt);
    const fleeSpeed = getCombatMoveSpeed(enemy, 1.25);
    if (!Number.isFinite(enemy.destX)) {
      const bp = baseWorld();
      const ang = Math.atan2(enemy.y - bp.y, enemy.x - bp.x) || Math.random() * Math.PI * 2;
      enemy.destX = enemy.x + Math.cos(ang) * 2600;
      enemy.destY = enemy.y + Math.sin(ang) * 2600;
    }
    flyCombat(enemy, enemy.destX, enemy.destY, fleeSpeed, dt, ENEMY_FLIGHT);
    // Despawn once far from base
    const bp = baseWorld();
    if (dist2(enemy.x, enemy.y, bp.x, bp.y) > 2000) {
      state.enemies = (state.enemies || []).filter((e) => e.id !== enemy.id);
      checkRaidComplete();
    }
    return;
  }

  // EMP stun — crawl at 10% speed, cannot shoot (avoids frozen orbit-camping)
  const empSlowed = (enemy.stunTimer || 0) > 0;
  if (empSlowed) {
    enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
    enemy.combatBoostTimer = 0;
    enemy.combatBoostMult = 1;
    enemy.combatBoost = 0;
  } else {
    tickCombatBoost(enemy, dt);
  }

  const strike = getCombatMoveSpeed(enemy);
  // Keep structure-first targeting even if target was base
  if (enemy.target?.kind === 'base' && hasLivingStructures()) {
    const next = pickRaidTarget();
    if (next) enemy.target = next;
  }
  const tPos = resolveTargetPos(enemy.target);
  // Aim slightly below building center (matches base sprite footprint)
  const aimY = tPos.y + (
    enemy.target?.kind === 'base' ? TILE_H * 0.35
      : enemy.target?.kind === 'turret' ? 4
        : 0
  );
  enemy.atkCd = Math.max(0, (enemy.atkCd || 0) - dt);
  const critical = isCriticalHp(enemy);

  // Critically damaged: abandon building flybys — only flee / dogfight
  if (critical && !enemy.engaged) {
    enemy.engaged = true;
    beginRoamPhase(enemy);
  }
  if (critical && (enemy.status === 'driveby_approach' || enemy.status === 'driveby_pass'
    || enemy.status === 'driveby_boost' || enemy.status === 'driveby_exit'
    || enemy.status === 'orbit' || enemy.status === 'dogfight_flyby')) {
    enemy.engaged = true;
    beginRoamPhase(enemy);
  }

  // DPS = attack × attackSpeed (no extra mults)
  const enemyShotCd = () => 1 / Math.max(0.05, enemy.attackSpeed || 1);
  const shootBuilding = () => {
    if (empSlowed) return false;
    if (enemy.atkCd > 0) return false;
    if (dist2(enemy.x, enemy.y, tPos.x, aimY) > ENEMY_SHOOT_RANGE) return false;
    if (!isFacing(enemy, tPos.x, aimY)) return false;
    applyDamageToTarget(enemy.target, enemy.attack || 0);
    fireAtTarget(enemy, tPos.x, aimY, {
      color: enemy.color || '#ff5d5d',
      shake: enemy.target?.kind === 'base' ? 3.5
        : enemy.target?.kind === 'turret' ? 2.5
          : 2,
    });
    enemy.atkCd = enemyShotCd();
    return true;
  };

  if (!enemy.engaged) {
    // Inbound → classic drive-by loop
    if (enemy.status === 'inbound') {
      const arrived = flyCombat(enemy, tPos.x, tPos.y, strike, dt, BUILDING_FLIGHT);
      if (arrived || dist2(enemy.x, enemy.y, tPos.x, tPos.y) < ORBIT_RADIUS + 90) {
        setupDriveBy(enemy, tPos);
      }
    } else if (enemy.status === 'driveby_approach' || enemy.status === 'orbit') {
      if (enemy.status === 'orbit') setupDriveBy(enemy, tPos);
      enemy.driveStateT = (enemy.driveStateT || 0) + dt;
      // Keep dest locked on the building (it can move only if retargeted)
      enemy.destX = tPos.x;
      enemy.destY = tPos.y;
      flyCombat(enemy, tPos.x, tPos.y, getCombatMoveSpeed(enemy, 1.08), dt, BUILDING_FLIGHT);
      const dToTarget = dist2(enemy.x, enemy.y, tPos.x, tPos.y);
      // Enter gun pass once close — keep flying through along current nose
      if (dToTarget < ENEMY_SHOOT_RANGE * 1.15 || enemy.driveStateT > 8) {
        enemy.status = 'driveby_pass';
        enemy.driveStateT = 0;
        const through = pickBoostAhead(enemy);
        enemy.destX = through.x;
        enemy.destY = through.y;
        enemy.driveWasInCone = false;
        enemy.driveWasInRange = false;
        enemy.driveWasNear = false;
        enemy.driveClosest = dToTarget;
      }
    } else if (enemy.status === 'driveby_pass') {
      enemy.driveStateT = (enemy.driveStateT || 0) + dt;
      const dToTarget = dist2(enemy.x, enemy.y, tPos.x, tPos.y);
      const inRange = dToTarget <= ENEMY_SHOOT_RANGE;
      const facing = isFacing(enemy, tPos.x, aimY);
      const canShootNow = inRange && facing;
      if (inRange) enemy.driveWasInRange = true;
      if (canShootNow) enemy.driveWasInCone = true;
      if (dToTarget < ENEMY_SHOOT_RANGE * 1.5) enemy.driveWasNear = true;
      if (!Number.isFinite(enemy.driveClosest) || dToTarget < enemy.driveClosest) {
        enemy.driveClosest = dToTarget;
      }

      // Slow only while actually shooting; otherwise cruise/boost
      const passSpeed = getCombatMoveSpeed(enemy, canShootNow ? DRIVEBY_SHOOT_SPEED_MULT : 1.05);
      const arrivedThrough = flyCombat(enemy, enemy.destX, enemy.destY, passSpeed, dt, BUILDING_FLIGHT);

      if (canShootNow) {
        if (shootBuilding()) {
          enemy.driveShots = (enemy.driveShots || 0) + 1;
        }
      }

      // Leave pass when: cone/range lost, through-point reached, past closest approach, or stuck
      const lostCone = enemy.driveWasInCone && !facing;
      const lostRange = enemy.driveWasInRange && !inRange;
      const flewPast = enemy.driveWasNear
        && dToTarget > (enemy.driveClosest || 0) + 40;
      const nearThrough = arrivedThrough
        || dist2(enemy.x, enemy.y, enemy.destX, enemy.destY) < 55;
      const stuck = enemy.driveStateT > 6;
      if (lostCone || lostRange || flewPast || nearThrough || stuck) {
        beginDriveByBoost(enemy);
      }
    } else if (enemy.status === 'driveby_boost') {
      // Sprint far ahead, then B-line back at the building
      enemy.driveStateT = (enemy.driveStateT || 0) + dt;
      const boostSpeed = getCombatMoveSpeed(enemy, 1.15);
      const arrived = flyCombat(enemy, enemy.destX, enemy.destY, boostSpeed, dt, BUILDING_FLIGHT);
      const nearBoost = arrived || dist2(enemy.x, enemy.y, enemy.destX, enemy.destY) < 70;
      if (nearBoost || enemy.driveStateT > 5) {
        enemy.combatBoost = 0;
        setupDriveBy(enemy, tPos);
      }
    } else if (enemy.status === 'driveby_exit') {
      beginDriveByBoost(enemy);
    }
    return;
  }

  // Dogfight mode
  enemy.phaseTimer = Math.max(0, (enemy.phaseTimer || 0) - dt);

  if (enemy.status === 'dogfight_roam') {
    const roamSpeed = getCombatMoveSpeed(enemy, 1.05);
    const arrived = flyCombat(enemy, enemy.destX, enemy.destY, roamSpeed, dt, ENEMY_FLIGHT);
    const nearRoam = arrived || dist2(enemy.x, enemy.y, enemy.destX, enemy.destY) < 70;
    if (nearRoam) {
      // Keep scattering until roam phase ends
      const roam = pickRoamDestInView(enemy);
      enemy.destX = roam.x;
      enemy.destY = roam.y;
      if (Math.random() < 0.55) startCombatBoost(enemy);
    }
    if (enemy.phaseTimer <= 0) {
      const prey = pickNearestCombatShip(enemy);
      if (prey) {
        enemy.status = 'dogfight_engage';
        enemy.phaseTimer = randRange(DOGFIGHT_ENGAGE_MIN_S, DOGFIGHT_ENGAGE_MAX_S);
        enemy.engageTargetId = prey.id;
      } else {
        // No threats — resume structure / base assault
        enemy.engaged = false;
        const next = pickRaidTarget();
        if (next) enemy.target = next;
        const resume = resolveTargetPos(enemy.target);
        setupDriveBy(enemy, resume);
      }
    }
  } else if (enemy.status === 'dogfight_engage') {
    const prey = state.ships.find((s) => s.id === enemy.engageTargetId) || pickNearestCombatShip(enemy);
    if (!prey || (prey.currentHp ?? 0) <= 0) {
      enemy.status = 'dogfight_flyby';
      enemy.phaseTimer = 3;
      const orbit = pickOrbitDest(enemy, tPos.x, tPos.y, ORBIT_RADIUS * 0.7);
      enemy.destX = orbit.x;
      enemy.destY = orbit.y;
    } else {
      // Bank in wide arcs at standoff — forward-only guns
      const hold = getEngageHoldPoint(enemy, prey.x, prey.y, dt);
      flyCombat(enemy, hold.x, hold.y, getCombatMoveSpeed(enemy), dt, ENEMY_FLIGHT);
      applySeparation(enemy, state.enemies, SHIP_SEPARATION, dt);
      const inRange = dist2(enemy.x, enemy.y, prey.x, prey.y) < ENEMY_SHOOT_RANGE;
      if (!empSlowed && enemy.atkCd <= 0 && inRange && isFacing(enemy, prey.x, prey.y)) {
        applyDamageToTarget({ kind: 'ship', id: prey.id }, enemy.attack || 0);
        fireAtTarget(enemy, prey.x, prey.y, { color: enemy.color || '#ff5d5d', width: 2 });
        enemy.atkCd = enemyShotCd();
        if ((prey.currentHp ?? 0) <= 0) {
          if (prey.isHqSupport) {
            addLog(`💥 ${prey.name} was disabled in combat!`);
            prey.status = 'returning_repair';
            prey.targetEnemyId = null;
            const bp = baseWorld();
            prey.destX = bp.x;
            prey.destY = bp.y;
          } else {
            addLog(`💥 ${prey.name} destroyed! Returning to base.`);
            markShipDestroyed(prey);
          }
        }
      }
      if (enemy.phaseTimer <= 0) {
        if (critical) {
          // Low HP: skip building flybys, keep fleeing / re-engaging
          beginRoamPhase(enemy);
        } else {
          enemy.status = 'dogfight_flyby';
          enemy.phaseTimer = 3;
          setupDriveBy(enemy, tPos);
          enemy.status = 'dogfight_flyby';
          enemy.destX = enemy.driveExitX;
          enemy.destY = enemy.driveExitY;
        }
      }
    }
  } else if (enemy.status === 'dogfight_flyby') {
    if (critical) {
      beginRoamPhase(enemy);
      return;
    }
    // Strafing pass on the building with forward cone + 2× fire
    if (!Number.isFinite(enemy.driveExitX)) {
      setupDriveBy(enemy, tPos);
      enemy.status = 'dogfight_flyby';
      enemy.destX = enemy.driveExitX;
      enemy.destY = enemy.driveExitY;
    }
    // Dogfight flyby: pass the building, shoot, peel when cone drops
    if (enemy.status === 'dogfight_flyby' && !enemy.driveFlybyReady) {
      enemy.destX = tPos.x;
      enemy.destY = tPos.y;
      enemy.driveWasInCone = false;
      enemy.driveWasInRange = false;
      enemy.driveFlybyReady = true;
    }
    const dToTarget = dist2(enemy.x, enemy.y, tPos.x, tPos.y);
    const inRange = dToTarget <= ENEMY_SHOOT_RANGE;
    const facing = isFacing(enemy, tPos.x, aimY);
    const canShootNow = inRange && facing;
    if (inRange) enemy.driveWasInRange = true;
    if (canShootNow) enemy.driveWasInCone = true;
    const passSpeed = getCombatMoveSpeed(enemy, canShootNow ? DRIVEBY_SHOOT_SPEED_MULT : 1.05);
    // Aim at building until close, then fly through ahead
    if (dToTarget > ENEMY_SHOOT_RANGE * 0.9) {
      flyCombat(enemy, tPos.x, tPos.y, passSpeed, dt, BUILDING_FLIGHT);
    } else {
      if (!Number.isFinite(enemy.destX) || enemy.destX === tPos.x) {
        const through = pickBoostAhead(enemy);
        enemy.destX = through.x;
        enemy.destY = through.y;
      }
      flyCombat(enemy, enemy.destX, enemy.destY, passSpeed, dt, BUILDING_FLIGHT);
    }
    if (canShootNow) {
      if (shootBuilding()) {
        enemy.driveShots = (enemy.driveShots || 0) + 1;
      }
    }
    const lostCone = enemy.driveWasInCone && !facing;
    const lostRange = enemy.driveWasInRange && !inRange;
    if (enemy.phaseTimer <= 0 || lostCone || lostRange) {
      enemy.driveFlybyReady = false;
      beginRoamPhase(enemy);
    }
  }
}

function tickPlayerCombatShip(ship, dt) {
  ensureShipCombatHp(ship);
  if (ship.currentHp <= 0 && !ship.isHqSupport) {
    if (ship.status !== 'destroyed') {
      addLog(`💥 ${ship.name} destroyed! Returning to base.`);
      markShipDestroyed(ship);
    }
  } else if (ship.currentHp <= 0 && ship.isHqSupport) {
    ship.status = 'returning_repair';
    ship.targetEnemyId = null;
  }

  // Destroyed player hulls limp home and stop until repaired
  if (ship.status === 'destroyed') {
    const bp = baseWorld();
    ship.destX = bp.x;
    ship.destY = bp.y;
    ship.currentHp = 0;
    ship.targetEnemyId = null;
    const speed = getCombatMoveSpeed(ship) * 0.55;
    const arrived = flySmooth(ship, ship.destX, ship.destY, speed, dt);
    if (arrived) {
      ship.x = bp.x;
      ship.y = bp.y;
      ship.vx = 0;
      ship.vy = 0;
      ship.currentHp = 0;
      // Stay destroyed — manual repair required
    }
    return true;
  }

  if (ship.status === 'returning_repair') {
    const bp = baseWorld();
    ship.destX = bp.x;
    ship.destY = bp.y;
    tickCombatBoost(ship, dt);
    const speed = getCombatMoveSpeed(ship);
    const arrived = flySmooth(ship, ship.destX, ship.destY, speed, dt);
    if (arrived) {
      ship.x = bp.x;
      ship.y = bp.y;
      ship.targetEnemyId = null;
      if (ship.isHqSupport) {
        // Mercs leave after docking at home base
        state.ships = state.ships.filter((s) => s.id !== ship.id);
        addLog(`🛡 ${ship.name} docked and left the sector.`);
        if (refresh.ui) refresh.ui();
      } else if ((ship.currentHp || 0) <= 0) {
        // Safety: zero-HP non-HQ should be destroyed, not free-healed
        markShipDestroyed(ship);
      } else {
        // Healthy RTB after raid — stand down
        ship.status = 'idle';
      }
    }
    return true; // handled — skip normal tickShip movement conflicts
  }

  if (ship.status !== 'engaging' && ship.status !== 'intercepting') return false;
  if (!(state.enemies || []).length) {
    ship.status = 'returning_repair';
    const bp = baseWorld();
    ship.destX = bp.x;
    ship.destY = bp.y;
    return true;
  }

  let enemy = state.enemies.find((e) => e.id === ship.targetEnemyId);
  if (!enemy || (enemy.hp || 0) <= 0) {
    enemy = pickNearestEnemy(ship);
    ship.targetEnemyId = enemy?.id ?? null;
  }
  if (!enemy) {
    ship.status = 'returning_repair';
    return true;
  }

  const role = SHIP_DEFS[ship.type]?.role;
  const isGarrison = role === 'garrison';
  tickCombatBoost(ship, dt);
  const shootRange = getPlayerShipShootRange(ship);
  const dToEnemy = dist2(ship.x, ship.y, enemy.x, enemy.y);

  // ── Garrison: close to hold-min, sit still and fire until hold-max ──
  if (isGarrison) {
    // hold = parked and shooting; chase = flying toward preferred min range
    if (!ship._gHoldMode) ship._gHoldMode = 'chase';
    if (ship._gHoldMode === 'hold') {
      if (dToEnemy > GARRISON_HOLD_MAX || dToEnemy > shootRange * 0.98) {
        ship._gHoldMode = 'chase';
      } else {
        // Stay put — only turn to face target (no orbit swarm)
        turnInPlace(ship, enemy.x, enemy.y, dt, GARRISON_TURN_RATE);
        ship.destX = ship.x;
        ship.destY = ship.y;
        ship.combatBoost = 0;
      }
    }
    if (ship._gHoldMode === 'chase') {
      if (dToEnemy <= GARRISON_HOLD_MIN || (dToEnemy <= shootRange && dToEnemy <= GARRISON_HOLD_MIN + 8)) {
        ship._gHoldMode = 'hold';
        turnInPlace(ship, enemy.x, enemy.y, dt, GARRISON_TURN_RATE);
      } else {
        // Fly toward a point at hold-min distance from enemy (not through them)
        const ang = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
        const tx = enemy.x + Math.cos(ang) * GARRISON_HOLD_MIN;
        const ty = enemy.y + Math.sin(ang) * GARRISON_HOLD_MIN;
        ship.destX = tx;
        ship.destY = ty;
        flyCombat(ship, tx, ty, getCombatMoveSpeed(ship), dt, getPlayerFlightOpts(ship));
      }
    }
    const sepG = SHIP_SEPARATION * 1.35;
    applySeparation(ship, getCombatShips(), sepG, dt);
    ship.atkCd = Math.max(0, (ship.atkCd || 0) - dt);
    // Fire while holding (or whenever in weapon range + facing)
    if (ship._gHoldMode === 'hold' || dToEnemy <= shootRange) {
      tickShipAttachments(ship, enemy, dt, shootRange);
    }
    return true;
  }

  // ── Fighters / HQ: orbit engage with periodic breakaway fly-bys ──
  if (ship.isHqSupport && !Number.isFinite(ship.engageStandoff)) {
    ship.engageStandoff = HQ_ENGAGE_STANDOFF;
  }

  // Breakaway: peel off to a random point every 2–5s, then re-commit
  if (!ship.isHqSupport) {
    if (!Number.isFinite(ship._breakCd)) {
      ship._breakCd = randRange(FIGHTER_BREAKAWAY_MIN_S, FIGHTER_BREAKAWAY_MAX_S);
      ship._breakPhase = 'engage';
    }
    if (ship._breakPhase === 'break') {
      ship._breakTravel = (ship._breakTravel || 0) + dt;
      const arrived = flyCombat(
        ship, ship._breakX, ship._breakY,
        getCombatMoveSpeed(ship, 1.25), dt, getPlayerFlightOpts(ship),
      );
      const near = arrived || dist2(ship.x, ship.y, ship._breakX, ship._breakY) < 50;
      // Still shoot if a target happens to be in cone during peel
      ship.atkCd = Math.max(0, (ship.atkCd || 0) - dt);
      if (dToEnemy < shootRange * 1.1) tickShipAttachments(ship, enemy, dt, shootRange);
      if (near || ship._breakTravel > FIGHTER_BREAKAWAY_MAX_S_TRAVEL) {
        ship._breakPhase = 'engage';
        ship._breakCd = randRange(FIGHTER_BREAKAWAY_MIN_S, FIGHTER_BREAKAWAY_MAX_S);
        ship._breakTravel = 0;
        ship.combatBoost = 0;
      }
      applySeparation(ship, getCombatShips().concat(state.ships.filter((s) => s.isHqSupport)), SHIP_SEPARATION, dt);
      return true;
    }
    ship._breakCd -= dt;
    if (ship._breakCd <= 0) {
      // Kick out on a random bearing
      const ang = Math.random() * Math.PI * 2;
      const dist = randRange(FIGHTER_BREAKAWAY_DIST_MIN, FIGHTER_BREAKAWAY_DIST_MAX);
      ship._breakX = ship.x + Math.cos(ang) * dist;
      ship._breakY = ship.y + Math.sin(ang) * dist;
      ship._breakPhase = 'break';
      ship._breakTravel = 0;
      startCombatBoost(ship);
    }
  }

  const hold = getEngageHoldPoint(ship, enemy.x, enemy.y, dt);
  ship.destX = hold.x;
  ship.destY = hold.y;
  const speed = getCombatMoveSpeed(ship);
  flyCombat(ship, hold.x, hold.y, speed, dt, getPlayerFlightOpts(ship));
  const sep = ship.isHqSupport ? HQ_SHIP_SEPARATION : SHIP_SEPARATION;
  applySeparation(ship, getCombatShips().concat(state.ships.filter((s) => s.isHqSupport)), sep, dt);

  ship.atkCd = Math.max(0, (ship.atkCd || 0) - dt);
  if (ship.isHqSupport) {
    const d = dist2(ship.x, ship.y, enemy.x, enemy.y);
    if (ship.atkCd <= 0 && d < shootRange && isFacing(ship, enemy.x, enemy.y)) {
      const dmg = ship.attack || 0;
      if (dmg > 0) {
        enemy.hp = Math.max(0, (enemy.hp || 0) - dmg);
        markEnemyEngaged(enemy);
        fireAtTarget(ship, enemy.x, enemy.y, { color: '#5ec8ff', width: 2.1, duration: 0.14 });
        ship.atkCd = 1 / Math.max(0.05, ship.attackSpeed || 1);
        if (enemy.hp <= 0) destroyEnemy(enemy, ship.name);
      }
    }
  } else {
    tickShipAttachments(ship, enemy, dt, shootRange);
  }
  return true;
}

/** Rotate toward a point without translating (garrison hold). */
function turnInPlace(ent, tx, ty, dt, turnRate) {
  if (!Number.isFinite(ent.heading)) ent.heading = 0;
  const desired = Math.atan2(ty - ent.y, tx - ent.x) + Math.PI / 2;
  const da = normalizeAngle(desired - ent.heading);
  const rate = Number.isFinite(turnRate) ? turnRate : GARRISON_TURN_RATE;
  ent.heading += Math.sign(da) * Math.min(Math.abs(da), rate * dt);
  ent.combatBoost = 0;
}

/** Turret fireRate is cooldown seconds (auto L1=1s → 1/s; laser/EMP are long CDs). */
function turretCooldown(turret) {
  return Math.max(0.05, turret.fireRate || 1);
}

/** Inverse of gridToWorld — fractional col/row for continuous ship positions. */
function worldToGrid(x, y) {
  const col = (x / (TILE_W / 2) + y / (TILE_H / 2)) / 2;
  const row = (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2;
  return { col, row };
}

/**
 * Chebyshev tile distance (matches range diamond UI).
 * turret.range is in tiles: max(|dCol|, |dRow|) <= range.
 */
function chebyshevTilesTo(turretCol, turretRow, wx, wy) {
  const g = worldToGrid(wx, wy);
  return Math.max(Math.abs(g.col - turretCol), Math.abs(g.row - turretRow));
}

function enemyInTurretRange(turret, enemy, rangeTiles = turret.range || 2) {
  return chebyshevTilesTo(turret.col, turret.row, enemy.x, enemy.y) <= rangeTiles;
}

/** World radius for EMP blast VFX — covers the full diamond (long iso axis). */
function turretRangeVfxRadius(rangeTiles) {
  return Math.max(1, rangeTiles || 2) * TILE_W;
}

function pickTurretTarget(turret, enemies, rangeTiles) {
  const w = gridToWorld(turret.col, turret.row);
  const range = Math.max(0, rangeTiles ?? (turret.range || 2));
  let best = null;
  let bestTiles = Infinity;
  let bestEu = Infinity;
  for (const e of enemies) {
    if ((e.hp || 0) <= 0) continue;
    const tiles = chebyshevTilesTo(turret.col, turret.row, e.x, e.y);
    if (tiles > range) continue;
    const d = dist2(w.x, w.y, e.x, e.y);
    if (tiles < bestTiles - 0.001 || (Math.abs(tiles - bestTiles) < 0.001 && d < bestEu)) {
      bestTiles = tiles;
      bestEu = d;
      best = e;
    }
  }
  if (!best) return null;
  return { enemy: best, dist: bestTiles, wx: w.x, wy: w.y };
}

function turretMuzzle(wx, wy) {
  // Matches render: cy = worldY + TILE_H/2, barrel pivot at cy - 14
  return { x: wx, y: wy + TILE_H / 2 - 14 };
}

function fireAutomaticTurret(turret, target) {
  const { enemy, wx, wy } = target;
  const dmg = Math.max(0, turret.damage || 0);
  if (dmg > 0) {
    enemy.hp = Math.max(0, (enemy.hp || 0) - dmg);
    markEnemyEngaged(enemy);
  }
  const muz = turretMuzzle(wx, wy);
  turret.aimAngle = angleTo(muz.x, muz.y, enemy.x, enemy.y);
  turret.trackEnemyId = enemy.id;
  // Dual beams (twin barrels) — one damage application, two VFX
  const ang = Math.atan2(enemy.y - muz.y, enemy.x - muz.x);
  const perpX = Math.cos(ang + Math.PI / 2) * 5;
  const perpY = Math.sin(ang + Math.PI / 2) * 5;
  for (const s of [-1, 1]) {
    spawnCombatBeam(
      { x: muz.x + perpX * s, y: muz.y + perpY * s },
      { x: enemy.x + perpX * s * 0.3, y: enemy.y + perpY * s * 0.3 },
      { color: '#ffe066', duration: 0.14, width: 2.2 },
    );
  }
  if ((enemy.hp || 0) <= 0) destroyEnemy(enemy, turret.name || 'Turret');
}

function fireLaserTurret(turret, target) {
  const { enemy, wx, wy } = target;
  const dmg = Math.max(0, turret.damage || 0);
  if (dmg > 0) {
    enemy.hp = Math.max(0, (enemy.hp || 0) - dmg);
    markEnemyEngaged(enemy);
  }
  const muz = turretMuzzle(wx, wy);
  turret.aimAngle = angleTo(muz.x, muz.y, enemy.x, enemy.y);
  turret.trackEnemyId = enemy.id;
  // Single long-lived beam that tracks the enemy
  spawnCombatBeam(
    { x: muz.x, y: muz.y },
    { x: enemy.x, y: enemy.y },
    {
      color: '#ff4a6a',
      duration: 1.0,
      hold: 0.75,
      width: 3.4,
      trackEnemyId: enemy.id,
      trackTurretId: turret.id,
    },
  );
  if ((enemy.hp || 0) <= 0) destroyEnemy(enemy, turret.name || 'Laser Turret');
}

const EMP_CHARGE_S = 2.0;

function fireEmpTurret(turret, enemies, rangeTiles) {
  const w = gridToWorld(turret.col, turret.row);
  const stunDur = Math.max(0.5, turret.stunDuration || 2);
  const range = Math.max(0, rangeTiles ?? (turret.range || 2));
  let hit = 0;
  for (const e of enemies) {
    if ((e.hp || 0) <= 0) continue;
    if (!enemyInTurretRange(turret, e, range)) continue;
    e.stunTimer = Math.max(e.stunTimer || 0, stunDur);
    e.combatBoostTimer = 0;
    e.combatBoostMult = 1;
    e.combatBoost = 0;
    markEnemyEngaged(e);
    hit += 1;
  }
  if (hit <= 0) return false;
  spawnEmpBlast(w.x, w.y + TILE_H / 2, turretRangeVfxRadius(range), { duration: 0.5, color: '#5ec8ff' });
  startScreenShake(0.22, 4);
  return true;
}

function tickTurrets(dt) {
  if (!TURRET_COMBAT_ENABLED) return;
  const enemies = state.enemies || [];
  if (!enemies.length) {
    // Clear EMP charge if raid ends mid wind-up
    for (const t of state.turrets || []) {
      t.empCharging = false;
      t.empChargeT = 0;
      t.trackEnemyId = null;
    }
    return;
  }

  for (const turret of getActiveTurrets()) {
    const rangeTiles = turret.range || 2;
    const type = turret.type || 'turret';
    const w = gridToWorld(turret.col, turret.row);
    const wx = w.x;
    const wy = w.y;

    // Keep barrels facing nearest hostile while one is in range (exact tile range)
    if (type !== 'emp_turret') {
      const track = pickTurretTarget(turret, enemies, rangeTiles);
      if (track) {
        const muz = turretMuzzle(wx, wy);
        turret.aimAngle = angleTo(muz.x, muz.y, track.enemy.x, track.enemy.y);
        turret.trackEnemyId = track.enemy.id;
      } else {
        turret.trackEnemyId = null;
      }
    }

    turret.atkCd = Math.max(0, (turret.atkCd || 0) - dt);

    if (type === 'emp_turret') {
      const anyInRange = enemies.some((e) => (e.hp || 0) > 0 && enemyInTurretRange(turret, e, rangeTiles));

      // Wind-up: detect → charge 2s → blast
      if (turret.empCharging) {
        turret.empChargeT = (turret.empChargeT || 0) + dt;
        if (!anyInRange) {
          // Target left range — abort charge, keep ready to re-acquire
          turret.empCharging = false;
          turret.empChargeT = 0;
          continue;
        }
        if (turret.empChargeT >= EMP_CHARGE_S) {
          if (fireEmpTurret(turret, enemies, rangeTiles)) {
            const cd = turretCooldown(turret);
            turret.atkCd = cd;
            turret.empCooldownMax = cd; // for recharge ring UI
          }
          turret.empCharging = false;
          turret.empChargeT = 0;
        }
        continue;
      }

      if (turret.atkCd > 0) continue;
      if (anyInRange) {
        turret.empCharging = true;
        turret.empChargeT = 0;
      }
      continue;
    }

    if (turret.atkCd > 0) continue;

    const target = pickTurretTarget(turret, enemies, rangeTiles);
    if (!target) continue;

    if (type === 'laser_turret') {
      fireLaserTurret(turret, target);
    } else {
      fireAutomaticTurret(turret, target);
    }
    turret.atkCd = turretCooldown(turret);
  }
}

/**
 * Main combat tick. Call from gameLoop before/after tickShip.
 * Returns ship ids handled by combat movement (engaging / repairing).
 */
export function tickCombat(dt) {
  // Ensure combat HP on all ships once
  for (const s of state.ships) {
    const role = SHIP_DEFS[s.type]?.role;
    if (isCombatRole(role) || s.isHqSupport) ensureShipCombatHp(s);
  }

  if (!(state.enemies || []).length && !state.activeRaid) {
    // Still process destroyed RTB / repair returns + regen when idle at base
    for (const ship of state.ships) {
      if (ship.status === 'returning_repair' || ship.status === 'destroyed') tickPlayerCombatShip(ship, dt);
      else {
        const role = SHIP_DEFS[ship.type]?.role;
        if (isCombatRole(role) && ship.status !== 'destroyed') {
          ensureShipCombatHp(ship);
          const regen = getShipRegenPerSec(ship);
          if (regen > 0) {
            const maxHp = getShipMaxHp(ship);
            if ((ship.currentHp || 0) > 0 && ship.currentHp < maxHp) {
              ship.currentHp = Math.min(maxHp, ship.currentHp + maxHp * regen * dt);
            }
          }
        }
      }
    }
    tickClusterProjectiles(dt);
    return;
  }

  tickClusterProjectiles(dt);

  for (const enemy of [...(state.enemies || [])]) {
    tickEnemy(enemy, dt);
  }

  tickTurrets(dt);

  for (const ship of state.ships) {
    const role = SHIP_DEFS[ship.type]?.role;
    if (isCombatRole(role) || ship.isHqSupport || ship.status === 'returning_repair' || ship.status === 'destroyed' || ship.status === 'engaging') {
      tickPlayerCombatShip(ship, dt);
    }
  }

  // Keep combat ships scrambled for the whole raid
  if (state.activeRaid && (state.enemies || []).length) {
    engagePlayerCombatShips();
  }
}

/** Whether normal tickShip should skip this ship (combat owns movement). */
export function isShipInCombatControl(ship) {
  if (!ship) return false;
  return ship.status === 'engaging'
    || ship.status === 'intercepting'
    || ship.status === 'returning_repair'
    || ship.status === 'destroyed'
    || !!ship.isHqSupport;
}

export function getActiveRaid() {
  return state.activeRaid;
}

export function getEnemies() {
  return state.enemies || [];
}
