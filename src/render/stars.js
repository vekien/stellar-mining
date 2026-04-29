// ============================================================
// STARS & SHOOTING STARS
// ============================================================
let starsCtx = null;
let W = 0, H = 0;
let starData = [];

export function initStars(ctx, w, h) { starsCtx = ctx; W = w; H = h; }
export function resizeStars(w, h) { W = w; H = h; buildStarData(); }

export function buildStarData() {
  starData = [];
  for (let i = 0; i < 220; i++) {
    starData.push({
      x: Math.random()*W,
      y: Math.random()*H,
      r: 0.3+Math.random()*1.0,
      baseAlpha: 0.25+Math.random()*0.55,
      twinkleSpeed: 0.3+Math.random()*1.2,
      twinkleAmt: 0.06+Math.random()*0.14,
      phase: Math.random()*Math.PI*2,
      rr: 180+Math.floor(Math.random()*75),
      gg: 180+Math.floor(Math.random()*75),
    });
  }
}

export function drawStars(ts) {
  starsCtx.clearRect(0,0,W,H);
  starsCtx.fillStyle = '#03050f';
  starsCtx.fillRect(0,0,W,H);
  const g1 = starsCtx.createRadialGradient(W*.3,H*.3,0,W*.3,H*.3,W*.5);
  g1.addColorStop(0,'rgba(20,10,60,0.3)'); g1.addColorStop(1,'transparent');
  starsCtx.fillStyle = g1; starsCtx.fillRect(0,0,W,H);
  const g2 = starsCtx.createRadialGradient(W*.7,H*.7,0,W*.7,H*.7,W*.4);
  g2.addColorStop(0,'rgba(0,20,60,0.3)'); g2.addColorStop(1,'transparent');
  starsCtx.fillStyle = g2; starsCtx.fillRect(0,0,W,H);
  const t = ts/1000;
  for (const s of starData) {
    const a = Math.max(0, Math.min(1, s.baseAlpha+Math.sin(t*s.twinkleSpeed+s.phase)*s.twinkleAmt));
    starsCtx.beginPath();
    starsCtx.arc(s.x,s.y,s.r,0,Math.PI*2);
    starsCtx.fillStyle = `rgba(${s.rr},${s.gg},255,${a})`;
    starsCtx.fill();
  }
  drawShootingStars();
}

// ── Shooting Stars ──
const shootingStars = [];
let shootingStarTimer = 0;
const SS_INTERVAL_MIN = 4;
const SS_INTERVAL_MAX = 12;
let nextShootingStarIn = 6;

export function tickShootingStars(dt) {
  for (const s of shootingStars) s.age += dt;
  for (let i = shootingStars.length-1; i >= 0; i--) {
    if (shootingStars[i].age >= shootingStars[i].duration) shootingStars.splice(i, 1);
  }
  shootingStarTimer += dt;
  if (shootingStarTimer >= nextShootingStarIn) {
    shootingStarTimer = 0;
    nextShootingStarIn = SS_INTERVAL_MIN + Math.random() * (SS_INTERVAL_MAX - SS_INTERVAL_MIN);
    spawnShootingStar();
  }
}

function spawnShootingStar() {
  const goingRight = Math.random() > 0.5;
  const angle  = (25 + Math.random() * 35) * Math.PI / 180;
  const speed  = 350 + Math.random() * 250;
  const length = 80 + Math.random() * 120;
  const startX = goingRight ? -length : W + length;
  const startY = Math.random() * H * 0.55;
  const vx = Math.cos(angle) * speed * (goingRight ? 1 : -1);
  const vy = Math.sin(angle) * speed;
  shootingStars.push({ x:startX, y:startY, vx, vy, length, duration:0.8+Math.random()*0.4, age:0, brightness:0.6+Math.random()*0.4 });
}

function drawShootingStars() {
  for (const s of shootingStars) {
    const t = s.age / s.duration;
    const alpha = t < 0.15 ? t / 0.15 : t > 0.70 ? 1-(t-0.70)/0.30 : 1;
    const cx = s.x + s.vx * s.age;
    const cy = s.y + s.vy * s.age;
    const angle = Math.atan2(s.vy, s.vx);
    const tailX = cx - Math.cos(angle) * s.length;
    const tailY = cy - Math.sin(angle) * s.length;
    const grad = starsCtx.createLinearGradient(tailX,tailY,cx,cy);
    grad.addColorStop(0,'rgba(255,255,255,0)');
    grad.addColorStop(0.7,`rgba(200,220,255,${alpha*s.brightness*0.4})`);
    grad.addColorStop(1,`rgba(255,255,255,${alpha*s.brightness})`);
    starsCtx.beginPath();
    starsCtx.moveTo(tailX,tailY);
    starsCtx.lineTo(cx,cy);
    starsCtx.strokeStyle = grad;
    starsCtx.lineWidth = 1.5;
    starsCtx.stroke();
    starsCtx.beginPath();
    starsCtx.arc(cx,cy,1.2,0,Math.PI*2);
    starsCtx.fillStyle = `rgba(255,255,255,${alpha*s.brightness})`;
    starsCtx.fill();
  }
}
