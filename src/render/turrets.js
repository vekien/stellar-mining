// ============================================================
// TURRET RENDERING
// ============================================================
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, BASE_COL, BASE_ROW } from '../constants.js';
import { gridToIso } from './camera.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';

let ctx = null;
export function setTurretCtx(c) { ctx = c; }

export function drawTurrets() {
  if (!ctx) return;
  const t = performance.now() / 1000;
  const { turretHoverCol, turretHoverRow } = canvasState;

  for (const turret of state.turrets) {
    const {x, y} = gridToIso(turret.col, turret.row);
    const cx = x, cy = y+TILE_H/2;

    // Base platform
    ctx.beginPath();
    ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(30,60,30,0.7)'; ctx.fill();
    ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = 1.5; ctx.stroke();

    // Base cylinder
    ctx.fillStyle = '#2a3a2a'; ctx.strokeStyle = '#4aaa4a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx,cy-2,9,5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();

    // Body block
    ctx.fillStyle = '#3a5a3a'; ctx.strokeStyle = '#5acc5a'; ctx.lineWidth = 1;
    ctx.fillRect(cx-6,cy-18,12,10); ctx.strokeRect(cx-6,cy-18,12,10);

    // Periodic directional scan with long pause and short turn.
    if (!turret.scan) {
      const initialAngle = Math.random() * Math.PI * 2;
      turret.scan = {
        angle: initialAngle,
        from: initialAngle,
        to: initialAngle,
        turning: false,
        turnStart: 0,
        turnDuration: 1.4,
        nextTurnAt: t + 8 + Math.random() * 4,
      };
    }

    const scan = turret.scan;
    if (!scan.turning && t >= scan.nextTurnAt) {
      scan.turning = true;
      scan.turnStart = t;
      scan.from = scan.angle;
      scan.to = Math.random() * Math.PI * 2;
    }

    if (scan.turning) {
      const p = Math.max(0, Math.min(1, (t - scan.turnStart) / scan.turnDuration));
      const smooth = p * p * (3 - 2 * p);
      let delta = scan.to - scan.from;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      scan.angle = scan.from + delta * smooth;
      if (p >= 1) {
        scan.turning = false;
        scan.angle = scan.to;
        scan.nextTurnAt = t + 8 + Math.random() * 4;
      }
    }

    const angle = scan.angle;
    const bLen = 14, bW = 3;
    ctx.save();
    ctx.translate(cx, cy-14);
    ctx.rotate(angle);
    ctx.fillStyle = '#7aee7a'; ctx.strokeStyle = '#3a8a3a'; ctx.lineWidth = 1;
    ctx.fillRect(-bW/2-3,-bLen,bW,bLen); ctx.strokeRect(-bW/2-3,-bLen,bW,bLen);
    ctx.fillRect(bW/2+1,-bLen,bW,bLen); ctx.strokeRect(bW/2+1,-bLen,bW,bLen);
    ctx.fillStyle = '#5aaa5a';
    ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Health bar
    const hpPct = turret.health / turret.maxHealth;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx-12,cy+6,24,3);
    ctx.fillStyle = hpPct > 0.5 ? '#4d8' : hpPct > 0.25 ? '#fa4' : '#f44';
    ctx.fillRect(cx-12,cy+6,24*hpPct,3);

    // Range highlight on hover
    if (turretHoverCol === turret.col && turretHoverRow === turret.row && !state.placingTurret) {
      const r = turret.range;
      ctx.save();
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          const tc = turret.col+dc, tr2 = turret.row+dr;
          if (tc < 0 || tc >= GRID_COLS || tr2 < 0 || tr2 >= GRID_ROWS) continue;
          const {x: tx, y: ty} = gridToIso(tc, tr2);
          ctx.beginPath();
          ctx.moveTo(tx,ty); ctx.lineTo(tx+TILE_W/2,ty+TILE_H/2); ctx.lineTo(tx,ty+TILE_H); ctx.lineTo(tx-TILE_W/2,ty+TILE_H/2);
          ctx.closePath();
          ctx.fillStyle = 'rgba(80,220,80,0.18)'; ctx.fill();
          ctx.strokeStyle = 'rgba(80,220,80,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
}

export function drawTurretPlacementHover() {
  if (!ctx || !state.placingTurret) return;
  const { turretHoverCol: col, turretHoverRow: row } = canvasState;
  if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
  const onNode   = state.nodes.some(n => n.gr[0]===col && n.gr[1]===row && n.minLevel<=state.base.level);
  const onTurret = state.turrets.some(t => t.col===col && t.row===row && t.id!==state.movingTurret);
  const onBase   = col === BASE_COL && row === BASE_ROW;
  const valid = !onNode && !onTurret && !onBase;
  const {x, y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;

  const movingTurret = state.movingTurret ? state.turrets.find(t => t.id === state.movingTurret) : null;
  const previewRange = movingTurret ? movingTurret.range : 2;
  for (let dc = -previewRange; dc <= previewRange; dc++) {
    for (let dr = -previewRange; dr <= previewRange; dr++) {
      const tc = col + dc;
      const tr = row + dr;
      if (tc < 0 || tc >= GRID_COLS || tr < 0 || tr >= GRID_ROWS) continue;
      const p = gridToIso(tc, tr);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + TILE_W/2, p.y + TILE_H/2);
      ctx.lineTo(p.x, p.y + TILE_H);
      ctx.lineTo(p.x - TILE_W/2, p.y + TILE_H/2);
      ctx.closePath();
      ctx.fillStyle = valid ? 'rgba(80,220,80,0.08)' : 'rgba(220,80,80,0.07)';
      ctx.fill();
      ctx.strokeStyle = valid ? 'rgba(80,220,80,0.22)' : 'rgba(220,80,80,0.2)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy);
  ctx.closePath();
  ctx.fillStyle = valid ? 'rgba(80,200,80,0.25)' : 'rgba(200,50,50,0.25)'; ctx.fill();
  ctx.strokeStyle = valid ? '#4d8' : '#f44'; ctx.lineWidth = 2; ctx.stroke();

  // Ghost turret preview
  ctx.fillStyle = valid ? 'rgba(122,238,122,0.9)' : 'rgba(255,120,120,0.85)';
  ctx.strokeStyle = valid ? 'rgba(58,138,58,0.95)' : 'rgba(150,60,60,0.95)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy-2, 9, 5, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(cx-6, cy-18, 12, 10);
  ctx.strokeRect(cx-6, cy-18, 12, 10);
  ctx.beginPath();
  ctx.arc(cx, cy-14, 5, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
}
