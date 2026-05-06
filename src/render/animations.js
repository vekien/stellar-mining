// ============================================================
// ANIMATIONS: Solar Flare, Comet, Screen Shake, Range Pulses,
//             Node Particles, Floaties
// ============================================================
import { gridToWorld, BASE_POS } from './camera.js';
import { TILE_W, TILE_H } from '../constants.js';
import { BASE_COL, BASE_ROW } from '../constants.js';
import { RESOURCE_DEFS } from '../data/resources.js';

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

// ── Screen Shake ──
let screenShake = { active:false, duration:0, age:0, intensity:8 };

export function startScreenShake(duration) {
  screenShake = { active:true, duration, age:0, intensity:10 };
}

export function tickScreenShake(dt) {
  if (!screenShake.active) return;
  screenShake.age += dt;
  if (screenShake.age >= screenShake.duration) screenShake.active = false;
}

export function getShakeOffset() {
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

export function spawnFloatie(resourceType, amount, worldPos = null) {
  const base = worldPos || gridToWorld(BASE_COL, BASE_ROW);
  const def  = RESOURCE_DEFS[resourceType];
  floaties.push({
    wx: base.x + (Math.random()-0.5)*20,
    wy: base.y - 30,
    color: def.color,
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
    _ctx.save();
    _ctx.globalAlpha = Math.max(0, alpha);
    _ctx.beginPath();
    _ctx.arc(f.wx-16, rise+4, 4, 0, Math.PI*2);
    _ctx.fillStyle = f.color;
    _ctx.fill();
    _ctx.font = 'bold 9px Share Tech Mono, monospace';
    _ctx.fillStyle = '#ddeeff';
    _ctx.textAlign = 'left';
    _ctx.fillText(f.label, f.wx-9, rise+6);
    _ctx.restore();
  }
}
