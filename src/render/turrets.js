// ============================================================
// TURRET RENDERING
// ============================================================
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS } from '../constants.js';
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

    // Rotating gun barrel
    const angle = t*0.8 + turret.id*0.5;
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
  const onBase   = col===12 && row===12;
  const valid = !onNode && !onTurret && !onBase;
  const {x, y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;
  ctx.beginPath();
  ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy);
  ctx.closePath();
  ctx.fillStyle = valid ? 'rgba(80,200,80,0.25)' : 'rgba(200,50,50,0.25)'; ctx.fill();
  ctx.strokeStyle = valid ? '#4d8' : '#f44'; ctx.lineWidth = 2; ctx.stroke();
}
