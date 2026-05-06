// ============================================================
// TURRET RENDERING
// ============================================================
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, BASE_COL, BASE_ROW } from '../constants.js';
import { gridToIso } from './camera.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import { TURRET_BASE_STATS, getTurretTypeDef } from '../data/turrets.js';
import { storageContainsCell } from '../data/storage.js';

let ctx = null;
export function setTurretCtx(c) { ctx = c; }

function rgbFromHex(hex, fallback = '80,220,80') {
  return typeof hex === 'string' && hex.startsWith('#')
    ? `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
    : fallback;
}

export function drawTurrets() {
  if (!ctx) return;
  const t = performance.now() / 1000;
  const { turretHoverCol, turretHoverRow } = canvasState;

  for (const turret of state.turrets) {
    const isMoveSourceGhost = state.placingTurret && state.movingTurret === turret.id;
    const {x, y} = gridToIso(turret.col, turret.row);
    const cx = x, cy = y+TILE_H/2;
    const typeDef = getTurretTypeDef(turret.type);
    const platformFill = isMoveSourceGhost ? 'rgba(70,70,70,0.55)' : typeDef.platformFill;
    const platformStroke = isMoveSourceGhost ? '#8a8a8a' : typeDef.platformStroke;
    const cylFill = isMoveSourceGhost ? '#5e5e5e' : typeDef.detailFill;
    const cylStroke = isMoveSourceGhost ? '#a0a0a0' : typeDef.detailStroke;
    const bodyFill = isMoveSourceGhost ? '#6b6b6b' : typeDef.bodyFill;
    const bodyStroke = isMoveSourceGhost ? '#b0b0b0' : typeDef.bodyStroke;
    const barrelFill = isMoveSourceGhost ? '#bdbdbd' : typeDef.barrelFill;
    const barrelStroke = isMoveSourceGhost ? '#8a8a8a' : typeDef.barrelStroke;

    // Base platform
    ctx.beginPath();
    ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy);
    ctx.closePath();
    ctx.fillStyle = platformFill; ctx.fill();
    ctx.strokeStyle = platformStroke; ctx.lineWidth = 1.5; ctx.stroke();

    // Core body per turret type
    ctx.fillStyle = cylFill; ctx.strokeStyle = cylStroke; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx,cy-2,9,5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = bodyFill; ctx.strokeStyle = bodyStroke; ctx.lineWidth = 1;
    if (typeDef.shape === 'triangle_orbit') {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 20);
      ctx.lineTo(cx + 8, cy - 8);
      ctx.lineTo(cx - 8, cy - 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(cx-6,cy-18,12,10); ctx.strokeRect(cx-6,cy-18,12,10);
    }

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
    if (typeDef.shape !== 'triangle_orbit') ctx.rotate(angle);
    ctx.fillStyle = barrelFill; ctx.strokeStyle = barrelStroke; ctx.lineWidth = 1;
    if (typeDef.shape === 'single_rifle') {
      ctx.fillRect(-2, -bLen - 2, 4, bLen + 2);
      ctx.strokeRect(-2, -bLen - 2, 4, bLen + 2);
      ctx.fillStyle = bodyStroke;
      ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else if (typeDef.shape === 'triangle_orbit') {
      ctx.fillStyle = bodyStroke;
      for (let i = 0; i < 3; i++) {
        const orbAngle = t * 1.2 + i * (Math.PI * 2 / 3);
        const ox = Math.cos(orbAngle) * 9;
        const oy = Math.sin(orbAngle) * 4;
        ctx.beginPath(); ctx.arc(ox, oy, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = barrelFill;
      ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(-bW/2-3,-bLen,bW,bLen); ctx.strokeRect(-bW/2-3,-bLen,bW,bLen);
      ctx.fillRect(bW/2+1,-bLen,bW,bLen); ctx.strokeRect(bW/2+1,-bLen,bW,bLen);
      ctx.fillStyle = bodyStroke;
      ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // Health bar
    const hpPct = turret.health / turret.maxHealth;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx-12,cy+6,24,3);
    ctx.fillStyle = hpPct > 0.5 ? '#4d8' : hpPct > 0.25 ? '#fa4' : '#f44';
    ctx.fillRect(cx-12,cy+6,24*hpPct,3);

    function traceDiamondForRange(col, row, r) {
      const minC = Math.max(0, col - r);
      const maxC = Math.min(GRID_COLS - 1, col + r);
      const minR = Math.max(0, row - r);
      const maxR = Math.min(GRID_ROWS - 1, row + r);
      const tl = gridToIso(minC, minR);
      const tr = gridToIso(maxC, minR);
      const br = gridToIso(maxC, maxR);
      const bl = gridToIso(minC, maxR);
      const top = { x: tl.x, y: tl.y };
      const right = { x: tr.x + TILE_W / 2, y: tr.y + TILE_H / 2 };
      const bottom = { x: br.x, y: br.y + TILE_H };
      const left = { x: bl.x - TILE_W / 2, y: bl.y + TILE_H / 2 };
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
    }

    // Range highlight on hover
    if (turretHoverCol === turret.col && turretHoverRow === turret.row && !state.placingTurret) {
      const r = turret.range;
      ctx.save();
      traceDiamondForRange(turret.col, turret.row, r);
      const hoverStroke = typeDef.platformStroke;
      const hoverRgb = rgbFromHex(hoverStroke);
      ctx.fillStyle = `rgba(${hoverRgb},0.09)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${hoverRgb},0.25)`;
      ctx.lineWidth = 0.9;
      ctx.stroke();
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
  const onStorage = state.storageFacilities.some(s => storageContainsCell(s, col, row));
  const onBase   = col === BASE_COL && row === BASE_ROW;
  const valid = !onNode && !onTurret && !onStorage && !onBase;
  const {x, y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;

  const movingTurret = state.movingTurret ? state.turrets.find(t => t.id === state.movingTurret) : null;
  const previewType = movingTurret?.type || state.placingTurretType || 'turret';
  const typeDef = getTurretTypeDef(previewType);
  const previewRange = movingTurret ? movingTurret.range : (typeDef.baseRange ?? TURRET_BASE_STATS.range);
  const previewRgb = rgbFromHex(typeDef.platformStroke);
  const minC = Math.max(0, col - previewRange);
  const maxC = Math.min(GRID_COLS - 1, col + previewRange);
  const minR = Math.max(0, row - previewRange);
  const maxR = Math.min(GRID_ROWS - 1, row + previewRange);
  const tl = gridToIso(minC, minR);
  const tr = gridToIso(maxC, minR);
  const br = gridToIso(maxC, maxR);
  const bl = gridToIso(minC, maxR);
  const top = { x: tl.x, y: tl.y };
  const right = { x: tr.x + TILE_W / 2, y: tr.y + TILE_H / 2 };
  const bottom = { x: br.x, y: br.y + TILE_H };
  const left = { x: bl.x - TILE_W / 2, y: bl.y + TILE_H / 2 };
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = valid ? `rgba(${previewRgb},0.06)` : 'rgba(220,80,80,0.05)';
  ctx.fill();
  ctx.strokeStyle = valid ? `rgba(${previewRgb},0.2)` : 'rgba(220,80,80,0.18)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy);
  ctx.closePath();
  ctx.fillStyle = valid ? 'rgba(80,200,80,0.25)' : 'rgba(200,50,50,0.25)'; ctx.fill();
  ctx.strokeStyle = valid ? '#4d8' : '#f44'; ctx.lineWidth = 2; ctx.stroke();

  // Ghost turret preview
  ctx.fillStyle = valid ? typeDef.barrelFill : 'rgba(255,120,120,0.85)';
  ctx.strokeStyle = valid ? typeDef.barrelStroke : 'rgba(150,60,60,0.95)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, cy-2, 9, 5, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = valid ? typeDef.bodyFill : 'rgba(255,120,120,0.85)';
  ctx.strokeStyle = valid ? typeDef.bodyStroke : 'rgba(150,60,60,0.95)';
  if (typeDef.shape === 'triangle_orbit') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx + 8, cy - 8);
    ctx.lineTo(cx - 8, cy - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = valid ? typeDef.detailStroke : 'rgba(255,160,160,0.9)';
    for (let i = 0; i < 3; i++) {
      const orbAngle = performance.now() / 1000 * 1.2 + i * (Math.PI * 2 / 3);
      const ox = Math.cos(orbAngle) * 9;
      const oy = Math.sin(orbAngle) * 4;
      ctx.beginPath(); ctx.arc(cx + ox, cy - 14 + oy, 2, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.fillRect(cx-6, cy-18, 12, 10);
    ctx.strokeRect(cx-6, cy-18, 12, 10);
    if (typeDef.shape === 'single_rifle') {
      ctx.fillStyle = valid ? typeDef.barrelFill : 'rgba(255,120,120,0.85)';
      ctx.strokeStyle = valid ? typeDef.barrelStroke : 'rgba(150,60,60,0.95)';
      ctx.fillRect(cx - 2, cy - 30, 4, 14);
      ctx.strokeRect(cx - 2, cy - 30, 4, 14);
    } else {
      ctx.fillStyle = valid ? typeDef.barrelFill : 'rgba(255,120,120,0.85)';
      ctx.strokeStyle = valid ? typeDef.barrelStroke : 'rgba(150,60,60,0.95)';
      ctx.beginPath(); ctx.arc(cx, cy-14, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
}
