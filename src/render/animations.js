// ============================================================
// ANIMATIONS: Solar Flare, Comet, Screen Shake, Range Pulses,
//             Node Particles, Floaties
// ============================================================
import { gridToWorld, BASE_POS } from './camera.js';
import { TILE_W, TILE_H } from '../constants.js';
import { BASE_COL, BASE_ROW } from '../constants.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { getResourceIconPath } from '../helpers.js';
import { state } from '../state.js';
import { BLACK_HOLE_DURATION_S, BLACK_HOLE_FADE_TIME_S } from '../data/events.js';

let _ctx = null;
export function setAnimCtx(ctx) { _ctx = ctx; }

// ── Solar Flare ──
const solarFlareAnims = [];

export function spawnSolarFlare() {
  for (let i = 0; i < 4; i++) {
    setTimeout(() => solarFlareAnims.push({ age:0, duration:4.0 }), i * 400);
  }
}

export function tickSolarFlare(dt) {
  for (const f of solarFlareAnims) f.age += dt;
  for (let i = solarFlareAnims.length-1; i >= 0; i--) {
    if (solarFlareAnims[i].age >= solarFlareAnims[i].duration) solarFlareAnims.splice(i, 1);
  }
}

export function drawSolarFlare() {
  if (!solarFlareAnims.length) return;
  if (state.settings?.showVisualEffects === false) return;
  const base = BASE_POS();
  const cx = base.x, cy = base.y + TILE_H/2;
  _ctx.save();
  for (const f of solarFlareAnims) {
    const t = f.age / f.duration;
    const maxR = 480;
    const r = maxR * Math.pow(t, 0.6);
    const alpha = Math.max(0, (1-t) * 0.5);
    const grad = _ctx.createRadialGradient(cx,cy,r*0.7,cx,cy,r);
    grad.addColorStop(0, `rgba(255,60,0,0)`);
    grad.addColorStop(0.7, `rgba(255,80,0,${alpha*0.6})`);
    grad.addColorStop(1, `rgba(255,30,0,0)`);
    _ctx.beginPath(); _ctx.arc(cx,cy,r,0,Math.PI*2);
    _ctx.fillStyle = grad; _ctx.fill();
    _ctx.beginPath(); _ctx.arc(cx,cy,r,0,Math.PI*2);
    _ctx.strokeStyle = `rgba(255,100,20,${alpha*1.8})`;
    _ctx.lineWidth = 2.5; _ctx.stroke();
  }
  const masterT = solarFlareAnims[0] ? solarFlareAnims[0].age/solarFlareAnims[0].duration : 0;
  const pulseAlpha = Math.max(0, (1-masterT)*0.8);
  const glow = _ctx.createRadialGradient(cx,cy,0,cx,cy,80);
  glow.addColorStop(0, `rgba(255,200,50,${pulseAlpha})`);
  glow.addColorStop(1, `rgba(255,60,0,0)`);
  _ctx.beginPath(); _ctx.arc(cx,cy,80,0,Math.PI*2);
  _ctx.fillStyle = glow; _ctx.fill();
  _ctx.restore();
}

// ── Comet ──
const cometAnims = [];

export function spawnComet() {
  const base = BASE_POS();
  const targetX = base.x, targetY = base.y + TILE_H/2;
  cometAnims.push({
    startX: targetX+600, startY: targetY-400, targetX, targetY,
    age:0, travelDuration:3.0, explodeDuration:2.5, exploded:false, explodeAge:0,
  });
}

export function tickComet(dt) {
  for (const c of cometAnims) {
    if (!c.exploded) {
      c.age += dt;
      if (c.age >= c.travelDuration) { c.exploded = true; c.explodeAge = 0; startScreenShake(0.4); }
    } else {
      c.explodeAge += dt;
    }
  }
  for (let i = cometAnims.length-1; i >= 0; i--) {
    const c = cometAnims[i];
    if (c.exploded && c.explodeAge >= c.explodeDuration) cometAnims.splice(i,1);
  }
}

export function drawComet() {
  if (!cometAnims.length) return;
  if (state.settings?.showVisualEffects === false) return;
  _ctx.save();
  for (const c of cometAnims) {
    if (!c.exploded) {
      const t = c.age / c.travelDuration;
      const ease = t*t*(3-2*t);
      const x = c.startX + (c.targetX-c.startX)*ease;
      const y = c.startY + (c.targetY-c.startY)*ease;
      const angle = Math.atan2(c.targetY-c.startY, c.targetX-c.startX);
      const tailLen = 120 + t*60;
      const tailGrad = _ctx.createLinearGradient(x,y,x-Math.cos(angle)*tailLen,y-Math.sin(angle)*tailLen);
      tailGrad.addColorStop(0,'rgba(255,180,60,0.9)');
      tailGrad.addColorStop(0.4,'rgba(255,100,20,0.5)');
      tailGrad.addColorStop(1,'rgba(255,60,0,0)');
      _ctx.beginPath(); _ctx.moveTo(x,y);
      _ctx.lineTo(x-Math.cos(angle)*tailLen, y-Math.sin(angle)*tailLen);
      _ctx.strokeStyle = tailGrad; _ctx.lineWidth = 6+t*4; _ctx.lineCap = 'round'; _ctx.stroke();
      const coreGlow = _ctx.createRadialGradient(x,y,0,x,y,14);
      coreGlow.addColorStop(0,'rgba(255,255,200,1)');
      coreGlow.addColorStop(0.4,'rgba(255,160,40,0.9)');
      coreGlow.addColorStop(1,'rgba(255,60,0,0)');
      _ctx.beginPath(); _ctx.arc(x,y,14,0,Math.PI*2);
      _ctx.fillStyle = coreGlow; _ctx.fill();
    } else {
      const et = c.explodeAge / c.explodeDuration;
      const cx2 = c.targetX, cy2 = c.targetY;
      for (let ring = 0; ring < 3; ring++) {
        const delay = ring*0.15;
        const rt = Math.max(0, et-delay/c.explodeDuration);
        if (rt <= 0) continue;
        const r = rt*300*(1+ring*0.3);
        const alpha = Math.max(0, (1-rt)*(1-ring*0.25));
        _ctx.beginPath(); _ctx.arc(cx2,cy2,r,0,Math.PI*2);
        _ctx.strokeStyle = `rgba(255,${120-ring*30},0,${alpha})`;
        _ctx.lineWidth = 4-ring; _ctx.stroke();
        if (ring === 0 && rt < 0.3) {
          const fillAlpha = (0.3-rt)/0.3*0.4;
          const flashGrad = _ctx.createRadialGradient(cx2,cy2,0,cx2,cy2,r);
          flashGrad.addColorStop(0,`rgba(255,220,100,${fillAlpha})`);
          flashGrad.addColorStop(1,'rgba(255,80,0,0)');
          _ctx.beginPath(); _ctx.arc(cx2,cy2,r,0,Math.PI*2);
          _ctx.fillStyle = flashGrad; _ctx.fill();
        }
      }
      if (et < 0.5) {
        for (let i = 0; i < 8; i++) {
          const angle = (i/8)*Math.PI*2 + et*2;
          const dist = et*120;
          const dx = cx2+Math.cos(angle)*dist, dy = cy2+Math.sin(angle)*dist;
          const da = Math.max(0, (0.5-et)/0.5);
          _ctx.beginPath(); _ctx.arc(dx,dy,3,0,Math.PI*2);
          _ctx.fillStyle = `rgba(255,150,30,${da})`; _ctx.fill();
        }
      }
    }
  }
  _ctx.restore();
}

export function tickBlackHole(dt) {
  if (!state.blackHole) return;
  state.blackHole.age = (state.blackHole.age || 0) + dt;
  state.blackHole.scale = getBlackHoleRadiusScale(state.blackHole);
  if (state.blackHole.age >= state.blackHole.duration) state.blackHole = null;
}

export function getBlackHoleRadiusScale(blackHole = state.blackHole) {
  if (!blackHole) return 0;
  const age = blackHole.age || 0;
  const duration = blackHole.duration || BLACK_HOLE_DURATION_S;
  const minFrac = 1 / Math.max(1, blackHole.rangeTiles || 1);
  if (age <= BLACK_HOLE_FADE_TIME_S) {
    const t = age / BLACK_HOLE_FADE_TIME_S;
    const eased = t * t * (3 - 2 * t);
    return minFrac + eased * (1 - minFrac);
  }
  const fadeOutStart = duration - BLACK_HOLE_FADE_TIME_S;
  if (age >= fadeOutStart) {
    const t = Math.max(0, Math.min(1, (age - fadeOutStart) / BLACK_HOLE_FADE_TIME_S));
    const eased = t * t * (3 - 2 * t);
    return 1 - eased;
  }
  return 1;
}

export function drawBlackHole() {
  if (!state.blackHole || !_ctx) return;
  const scale = Number.isFinite(state.blackHole.scale) ? state.blackHole.scale : getBlackHoleRadiusScale(state.blackHole);
  if (scale <= 0) return;
  const radius = (state.blackHole.radiusWorld || 0) * scale;
  const { wx, wy } = state.blackHole;
  _ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
  const glow = _ctx.createRadialGradient(wx, wy, radius * 0.08, wx, wy, radius);
  glow.addColorStop(0, 'rgba(0,0,0,1)');
  glow.addColorStop(0.22, 'rgba(8,8,16,0.98)');
  glow.addColorStop(0.45, 'rgba(40,18,75,0.9)');
  glow.addColorStop(0.78, `rgba(110,60,180,${0.52 * scale})`);
  glow.addColorStop(1, 'rgba(110,60,180,0)');
  _ctx.fillStyle = glow;
  _ctx.beginPath();
  _ctx.arc(wx, wy, radius, 0, Math.PI * 2);
  _ctx.fill();

  _ctx.beginPath();
  _ctx.arc(wx, wy, radius * 0.94, 0, Math.PI * 2);
  _ctx.strokeStyle = `rgba(170,120,255,${0.45 + pulse * 0.25})`;
  _ctx.lineWidth = 3;
  _ctx.stroke();

  _ctx.beginPath();
  _ctx.arc(wx, wy, radius * (1.02 + pulse * 0.03), 0, Math.PI * 2);
  _ctx.strokeStyle = `rgba(120,210,255,${0.18 + pulse * 0.12})`;
  _ctx.lineWidth = 1.5;
  _ctx.stroke();

  const swirlT = performance.now() / 400;
  for (let i = 0; i < 3; i++) {
    _ctx.beginPath();
    _ctx.arc(wx, wy, radius * (0.35 + i * 0.16), swirlT + i, swirlT + i + Math.PI * 1.15);
    _ctx.strokeStyle = `rgba(200,160,255,${(0.44 - i * 0.08) * scale})`;
    _ctx.lineWidth = 2.5 - (i * 0.45);
    _ctx.stroke();
  }

  _ctx.beginPath();
  _ctx.arc(wx, wy, radius * 0.28, 0, Math.PI * 2);
  _ctx.fillStyle = 'rgba(0,0,0,0.98)';
  _ctx.fill();
  _ctx.restore();
}

// ── Combat beams (enemy/player weapon fire) ──
const combatBeams = [];

/**
 * Short laser/bolt from shooter → target.
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {{ color?: string, duration?: number, width?: number }} [opts]
 */
export function spawnCombatBeam(from, to, opts = {}) {
  if (!from || !to) return;
  combatBeams.push({
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    color: opts.color || '#ff5d5d',
    duration: opts.duration ?? 0.2,
    width: opts.width ?? 2.2,
    /** Hold full brightness this long before fading (laser beams). */
    hold: opts.hold ?? 0,
    /** Follow a living enemy (and optional turret origin) each frame. */
    trackEnemyId: opts.trackEnemyId ?? null,
    trackTurretId: opts.trackTurretId ?? null,
    age: 0,
  });
}

export function tickCombatBeams(dt) {
  for (const b of combatBeams) {
    b.age += dt;
    // Laser tracking: stick beam end to the target ship
    if (b.trackEnemyId != null) {
      const e = (state.enemies || []).find((x) => x.id === b.trackEnemyId && (x.hp || 0) > 0);
      if (e) {
        b.x2 = e.x;
        b.y2 = e.y;
      }
    }
    if (b.trackTurretId != null) {
      const t = (state.turrets || []).find((x) => x.id === b.trackTurretId && (x.health || 0) > 0);
      if (t) {
        const w = gridToWorld(t.col, t.row);
        b.x1 = w.x;
        b.y1 = w.y + TILE_H / 2 - 14;
      }
    }
  }
  for (let i = combatBeams.length - 1; i >= 0; i--) {
    if (combatBeams[i].age >= combatBeams[i].duration) combatBeams.splice(i, 1);
  }
}

export function drawCombatBeams() {
  if (!combatBeams.length || !_ctx) return;
  if (state.settings?.showVisualEffects === false) return;
  _ctx.save();
  _ctx.lineCap = 'round';
  for (const b of combatBeams) {
    const t = Math.max(0, Math.min(1, b.age / b.duration));
    // Lasers hold bright longer then fade; bolts fade steadily
    const hold = b.hold ?? 0;
    let alpha;
    if (hold > 0 && b.age < hold) {
      alpha = 0.95;
    } else {
      const fadeT = hold > 0
        ? Math.max(0, Math.min(1, (b.age - hold) / Math.max(0.05, b.duration - hold)))
        : t;
      alpha = (1 - fadeT) * 0.95;
    }
    const pulse = 0.75 + 0.25 * Math.sin(b.age * 40);

    // Outer glow
    _ctx.beginPath();
    _ctx.moveTo(b.x1, b.y1);
    _ctx.lineTo(b.x2, b.y2);
    _ctx.strokeStyle = b.color;
    _ctx.globalAlpha = alpha * 0.4;
    _ctx.lineWidth = b.width * 3.4 * pulse;
    _ctx.stroke();

    // Colored core
    _ctx.beginPath();
    _ctx.moveTo(b.x1, b.y1);
    _ctx.lineTo(b.x2, b.y2);
    _ctx.strokeStyle = b.color;
    _ctx.globalAlpha = alpha * 0.85;
    _ctx.lineWidth = b.width * 1.4 * pulse;
    _ctx.stroke();

    // Hot white core
    _ctx.beginPath();
    _ctx.moveTo(b.x1, b.y1);
    _ctx.lineTo(b.x2, b.y2);
    _ctx.strokeStyle = '#ffffff';
    _ctx.globalAlpha = alpha * 0.9;
    _ctx.lineWidth = Math.max(1, b.width * 0.55 * pulse);
    _ctx.stroke();

    // Impact bloom on target
    const impactR = 5 + (1 - t) * 12;
    _ctx.beginPath();
    _ctx.arc(b.x2, b.y2, impactR, 0, Math.PI * 2);
    _ctx.fillStyle = b.color;
    _ctx.globalAlpha = alpha * 0.4;
    _ctx.fill();
    _ctx.beginPath();
    _ctx.arc(b.x2, b.y2, impactR * 0.4, 0, Math.PI * 2);
    _ctx.fillStyle = '#ffffff';
    _ctx.globalAlpha = alpha * 0.8;
    _ctx.fill();
  }
  _ctx.restore();
}

// ── EMP blasts / turret explosions ──
const empBlasts = [];
const combatExplosions = [];

/** Expanding EMP shockwave (default ~0.5s). */
export function spawnEmpBlast(x, y, radius, opts = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  empBlasts.push({
    x,
    y,
    radius: Math.max(20, radius || 80),
    duration: opts.duration ?? 0.5,
    color: opts.color || '#5ec8ff',
    age: 0,
  });
}

export function spawnCombatExplosion(x, y, opts = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  combatExplosions.push({
    x,
    y,
    radius: opts.radius ?? 40,
    duration: opts.duration ?? 0.45,
    color: opts.color || '#ff6a3a',
    age: 0,
  });
}

export function tickEmpBlasts(dt) {
  for (const b of empBlasts) b.age += dt;
  for (let i = empBlasts.length - 1; i >= 0; i--) {
    if (empBlasts[i].age >= empBlasts[i].duration) empBlasts.splice(i, 1);
  }
  for (const e of combatExplosions) e.age += dt;
  for (let i = combatExplosions.length - 1; i >= 0; i--) {
    if (combatExplosions[i].age >= combatExplosions[i].duration) combatExplosions.splice(i, 1);
  }
}

export function drawEmpBlasts() {
  if (!_ctx) return;
  if (state.settings?.showVisualEffects === false) return;
  if (!empBlasts.length && !combatExplosions.length) return;
  _ctx.save();
  for (const b of empBlasts) {
    const t = Math.max(0, Math.min(1, b.age / b.duration));
    // Smooth expand over full duration, soft fade after peak
    const ease = 1 - Math.pow(1 - t, 2.2);
    const r = b.radius * (0.08 + 0.92 * ease);
    const alpha = t < 0.35
      ? 0.25 + (t / 0.35) * 0.7
      : 0.95 * (1 - (t - 0.35) / 0.65);
    // Soft fill
    const grd = _ctx.createRadialGradient(b.x, b.y, r * 0.08, b.x, b.y, r);
    grd.addColorStop(0, `rgba(200,250,255,${alpha * 0.5})`);
    grd.addColorStop(0.35, `rgba(100,210,255,${alpha * 0.32})`);
    grd.addColorStop(0.75, `rgba(50,140,255,${alpha * 0.14})`);
    grd.addColorStop(1, 'rgba(40,100,255,0)');
    _ctx.globalAlpha = 1;
    _ctx.fillStyle = grd;
    _ctx.beginPath();
    _ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    _ctx.fill();
    // Outer shock ring
    _ctx.beginPath();
    _ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    _ctx.strokeStyle = b.color;
    _ctx.globalAlpha = alpha * 0.95;
    _ctx.lineWidth = 2.5 + (1 - t) * 6;
    _ctx.stroke();
    // Inner ring lag
    const r2 = r * 0.72;
    _ctx.beginPath();
    _ctx.arc(b.x, b.y, r2, 0, Math.PI * 2);
    _ctx.strokeStyle = 'rgba(200,245,255,0.9)';
    _ctx.globalAlpha = alpha * 0.55;
    _ctx.lineWidth = 1.5;
    _ctx.stroke();
    _ctx.globalAlpha = 1;
  }
  for (const e of combatExplosions) {
    const t = Math.max(0, Math.min(1, e.age / e.duration));
    const r = e.radius * (0.3 + 0.9 * t);
    const alpha = 1 - t;
    const grd = _ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    grd.addColorStop(0, `rgba(255,220,120,${alpha * 0.85})`);
    grd.addColorStop(0.4, `rgba(255,100,40,${alpha * 0.5})`);
    grd.addColorStop(1, 'rgba(80,20,0,0)');
    _ctx.globalAlpha = 1;
    _ctx.fillStyle = grd;
    _ctx.beginPath();
    _ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
    _ctx.fill();
    _ctx.beginPath();
    _ctx.arc(e.x, e.y, r * 0.85, 0, Math.PI * 2);
    _ctx.strokeStyle = e.color;
    _ctx.globalAlpha = alpha * 0.9;
    _ctx.lineWidth = 2.5;
    _ctx.stroke();
    _ctx.globalAlpha = 1;
  }
  _ctx.restore();
}

// ── Screen Shake ──
let screenShake = { active:false, duration:0, age:0, intensity:8 };

export function startScreenShake(duration, intensity = 10) {
  if (state.settings?.showCameraShake === false) return;
  screenShake = { active:true, duration, age:0, intensity };
}

export function tickScreenShake(dt) {
  if (state.settings?.showCameraShake === false) {
    screenShake.active = false;
    return;
  }
  if (!screenShake.active) return;
  screenShake.age += dt;
  if (screenShake.age >= screenShake.duration) screenShake.active = false;
}

export function getShakeOffset() {
  if (state.settings?.showCameraShake === false) return { x:0, y:0 };
  if (!screenShake.active) return { x:0, y:0 };
  const t = screenShake.age / screenShake.duration;
  const mag = screenShake.intensity * (1-t);
  return { x:(Math.random()-0.5)*mag*2, y:(Math.random()-0.5)*mag*2 };
}

// ── Range Pulses ──
const rangePulses = [];

export function spawnRangePulse(newHalfR) {
  rangePulses.push({ halfR:newHalfR, age:0, duration:1.4 });
}

export function tickRangePulses(dt) {
  for (const p of rangePulses) p.age += dt;
  for (let i = rangePulses.length-1; i >= 0; i--) {
    if (rangePulses[i].age >= rangePulses[i].duration) rangePulses.splice(i,1);
  }
}

export function drawRangePulses() {
  if (state.settings?.showVisualEffects === false) return;
  const BASE_C = BASE_COL, BASE_R = BASE_ROW;
  for (const p of rangePulses) {
    const t = p.age / p.duration;
    const animHalfR = p.halfR * t;
    const alpha = Math.max(0, 1-t);
    const wTL = gridToWorld(BASE_C-animHalfR, BASE_R-animHalfR);
    const wTR = gridToWorld(BASE_C+animHalfR, BASE_R-animHalfR);
    const wBR = gridToWorld(BASE_C+animHalfR, BASE_R+animHalfR);
    const wBL = gridToWorld(BASE_C-animHalfR, BASE_R+animHalfR);
    const top    = { x:wTL.x,            y:wTL.y            };
    const right  = { x:wTR.x+TILE_W/2,  y:wTR.y+TILE_H/2   };
    const bottom = { x:wBR.x,            y:wBR.y+TILE_H     };
    const left   = { x:wBL.x-TILE_W/2,  y:wBL.y+TILE_H/2   };
    _ctx.save();
    _ctx.globalAlpha = alpha;
    _ctx.beginPath();
    _ctx.moveTo(top.x,top.y); _ctx.lineTo(right.x,right.y);
    _ctx.lineTo(bottom.x,bottom.y); _ctx.lineTo(left.x,left.y);
    _ctx.closePath();
    _ctx.strokeStyle = 'rgba(80,255,140,1)';
    _ctx.lineWidth = 4*(1-t*0.6);
    _ctx.stroke();
    _ctx.fillStyle = 'rgba(60,255,120,0.04)';
    _ctx.fill();
    _ctx.restore();
  }
}

// ── Node Unlock Particles ──
const nodeUnlockParticles = [];

export function spawnNodeUnlock(node) {
  const def = RESOURCE_DEFS[node.type];
  const w = gridToWorld(node.gr[0], node.gr[1]);
  const cx = w.x, cy = w.y+TILE_H/2;
  for (let i = 0; i < 28; i++) {
    const angle = (i/28)*Math.PI*2 + Math.random()*0.4;
    const speed = 15 + Math.random()*35;
    nodeUnlockParticles.push({
      x:cx, y:cy,
      vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed,
      color:def.color, size:1.5+Math.random()*3, age:0, duration:0.8+Math.random()*0.7,
    });
  }
}

export function tickNodeParticles(dt) {
  for (const p of nodeUnlockParticles) {
    p.age += dt; p.x += p.vx*dt; p.y += p.vy*dt;
    p.vy += 8*dt; p.vx *= 0.97; p.vy *= 0.97;
  }
  for (let i = nodeUnlockParticles.length-1; i >= 0; i--) {
    if (nodeUnlockParticles[i].age >= nodeUnlockParticles[i].duration) nodeUnlockParticles.splice(i,1);
  }
}

export function drawNodeParticles() {
  if (state.settings?.showVisualEffects === false) return;
  for (const p of nodeUnlockParticles) {
    const t = p.age / p.duration;
    _ctx.save();
    _ctx.globalAlpha = Math.max(0, 1-t*t);
    _ctx.beginPath();
    _ctx.arc(p.x, p.y, p.size*(1-t*0.5), 0, Math.PI*2);
    _ctx.fillStyle = p.color;
    _ctx.fill();
    _ctx.restore();
  }
}

// ── Floaties (deposit numbers) ──
export const floaties = [];
const resourceFloatieIcons = new Map();

function getFloatieIcon(resourceType) {
  if (!resourceType) return null;
  if (!resourceFloatieIcons.has(resourceType)) {
    const img = new Image();
    img.src = getResourceIconPath(resourceType);
    resourceFloatieIcons.set(resourceType, img);
  }
  return resourceFloatieIcons.get(resourceType);
}

export function spawnFloatie(resourceType, amount, worldPos = null) {
  const base = worldPos || gridToWorld(BASE_COL, BASE_ROW);
  const def  = RESOURCE_DEFS[resourceType];
  floaties.push({
    wx: base.x + (Math.random()-0.5)*36,
    wy: base.y - 30,
    color: def.color,
    resourceType,
    label: `+${amount} ${def.label}`,
    age: 0,
    duration: 2.2,
  });
}

export function tickFloaties(dt) {
  for (const f of floaties) f.age += dt;
  for (let i = floaties.length-1; i >= 0; i--) {
    if (floaties[i].age >= floaties[i].duration) floaties.splice(i, 1);
  }
}

export function drawFloaties() {
  for (const f of floaties) {
    const t = f.age / f.duration;
    const alpha = t < 0.15 ? t/0.15 : t > 0.65 ? 1-(t-0.65)/0.35 : 1;
    const rise  = f.wy - t*55;
    const icon = getFloatieIcon(f.resourceType);
    _ctx.save();
    _ctx.globalAlpha = Math.max(0, alpha);
    if (icon?.complete && icon.naturalWidth > 0) {
      _ctx.drawImage(icon, f.wx - 22, rise - 5, 14, 14);
    } else {
      _ctx.beginPath();
      _ctx.arc(f.wx-16, rise+4, 4, 0, Math.PI*2);
      _ctx.fillStyle = f.color;
      _ctx.fill();
    }
    _ctx.font = 'bold 9px Share Tech Mono, monospace';
    _ctx.fillStyle = '#ddeeff';
    _ctx.textAlign = 'left';
    if (state.settings?.showVisualEffects !== false) {
      _ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
      _ctx.shadowBlur = 4;
      _ctx.shadowOffsetX = 0;
      _ctx.shadowOffsetY = 1;
    }
    _ctx.fillText(f.label, f.wx-9, rise+6);
    _ctx.restore();
  }
}
