// ============================================================
// MAIN RENDERER — canvas drawing
// ============================================================
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, SOL_DURATION, BASE_COL, BASE_ROW } from '../constants.js';
import { cam, gridToWorld, gridToIso, focusOnBase, BASE_POS, tickCamera } from './camera.js';
import { BASE_RANGE } from '../data/base.js';
import { toRoman } from '../data/ships.js';
import { RESOURCE_DEFS, MINE_TIERS, getResourceTier } from '../data/resources.js';
import { hexToRgb } from '../helpers.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import {
  drawSolarFlare, drawComet, drawFloaties, drawRangePulses, drawNodeParticles,
  getShakeOffset, setAnimCtx,
} from './animations.js';
import { drawStars } from './stars.js';
import { drawTurrets, drawTurretPlacementHover, setTurretCtx } from './turrets.js';
import { drawStorageFacilities, drawStoragePlacementHover, setStorageCtx } from './storage.js';

let ctx = null;
export let W = 0, H = 0;
let gridCacheCanvas = null;
let gridCacheCtx = null;
let gridCacheSig = '';
let lastRenderTs = 0;
let fpsAvg = 60;
let lastFpsSampleTs = 0;
let _lastCamMoveSig = '';
const RENDER_FRAME_MS = 1000 / 60;

export function initRenderer(mainCtx, w, h) {
  ctx = mainCtx;
  W = w; H = h;
  setAnimCtx(ctx);
  setTurretCtx(ctx);
  setStorageCtx(ctx);
}

export function resizeRenderer(w, h) { W = w; H = h; }

let _onCameraMove = null;
export function setOnCameraMove(fn) { _onCameraMove = fn; }

export function drawTile(targetCtx, col, row, fill, stroke) {
  const {x,y} = gridToIso(col, row);
  targetCtx.beginPath();
  targetCtx.moveTo(x,y); targetCtx.lineTo(x+TILE_W/2,y+TILE_H/2); targetCtx.lineTo(x,y+TILE_H); targetCtx.lineTo(x-TILE_W/2,y+TILE_H/2);
  targetCtx.closePath();
  targetCtx.fillStyle = fill; targetCtx.fill();
  targetCtx.strokeStyle = stroke; targetCtx.lineWidth = 0.5; targetCtx.stroke();
}

function getEffectiveBaseRange() {
  const currentRange = BASE_RANGE[(state.base.level - 1)] || 6;
  const anim = state.baseRangeAnim;
  if (!anim) return currentRange;

  const duration = Math.max(1, anim.duration || 900);
  const t = Math.max(0, Math.min(1, (performance.now() - anim.start) / duration));
  const eased = 1 - Math.pow(1 - t, 3);
  const from = Number.isFinite(anim.from) ? anim.from : currentRange;
  const to = Number.isFinite(anim.to) ? anim.to : currentRange;
  const range = from + (to - from) * eased;

  if (t >= 1) state.baseRangeAnim = null;
  return range;
}

function getEffectiveBorderRange() {
  return getEffectiveBaseRange();
}

export function drawGrid(targetCtx = ctx) {
  const BASE_C = BASE_COL, BASE_R = BASE_ROW;
  const halfR = getEffectiveBaseRange();

  function pointsForRange(r) {
    const minC = Math.max(0, BASE_C - r);
    const maxC = Math.min(GRID_COLS - 1, BASE_C + r);
    const minR = Math.max(0, BASE_R - r);
    const maxR = Math.min(GRID_ROWS - 1, BASE_R + r);
    const wTL = gridToWorld(minC, minR);
    const wTR = gridToWorld(maxC, minR);
    const wBR = gridToWorld(maxC, maxR);
    const wBL = gridToWorld(minC, maxR);
    const top    = { x: wTL.x,              y: wTL.y };
    const right  = { x: wTR.x + TILE_W / 2, y: wTR.y + TILE_H / 2 };
    const bottom = { x: wBR.x,              y: wBR.y + TILE_H };
    const left   = { x: wBL.x - TILE_W / 2, y: wBL.y + TILE_H / 2 };
    return [top, right, bottom, left];
  }

  const tiersToDraw = [];
  for (let i = 0; i < state.base.level - 1; i++) {
    const r = BASE_RANGE[i];
    if (Number.isFinite(r) && r > 0) tiersToDraw.push(r);
  }
  tiersToDraw.push(halfR);

  targetCtx.save();
  targetCtx.fillStyle = 'rgba(70,150,255,0.0025)';
  for (const r of tiersToDraw) {
    const [top, right, bottom, left] = pointsForRange(r);
    targetCtx.beginPath();
    targetCtx.moveTo(top.x, top.y);
    targetCtx.lineTo(right.x, right.y);
    targetCtx.lineTo(bottom.x, bottom.y);
    targetCtx.lineTo(left.x, left.y);
    targetCtx.closePath();
    targetCtx.fill();
  }
  targetCtx.restore();
}

function ensureGridCache(shiftX, shiftY) {
  if (!gridCacheCanvas || gridCacheCanvas.width !== W || gridCacheCanvas.height !== H) {
    gridCacheCanvas = document.createElement('canvas');
    gridCacheCanvas.width = W;
    gridCacheCanvas.height = H;
    gridCacheCtx = gridCacheCanvas.getContext('2d');
    gridCacheSig = '';
  }

  const anim = state.baseRangeAnim;
  const animPhase = anim
    ? Math.floor(Math.max(0, Math.min(1, (performance.now() - anim.start) / Math.max(1, anim.duration || 900))) * 20)
    : -1;

  const sig = [
    W, H,
    state.base.level,
    state.settings?.showGrid === false ? 0 : 1,
    cam.x.toFixed(2),
    cam.y.toFixed(2),
    cam.zoom.toFixed(3),
    shiftX.toFixed(2),
    shiftY.toFixed(2),
    animPhase,
  ].join('|');

  if (sig === gridCacheSig) return;
  gridCacheSig = sig;

  gridCacheCtx.clearRect(0, 0, W, H);
  gridCacheCtx.save();
  gridCacheCtx.translate(W / 2 - cam.x * cam.zoom + shiftX, H / 2 - cam.y * cam.zoom + shiftY);
  gridCacheCtx.scale(cam.zoom, cam.zoom);
  drawGrid(gridCacheCtx);
  gridCacheCtx.restore();
}

export function drawRangeBorder() {
  const BASE_C = BASE_COL, BASE_R = BASE_ROW;
  const halfR  = getEffectiveBorderRange();

  function pointsForRange(r) {
    const minC = Math.max(0, BASE_C - r);
    const maxC = Math.min(GRID_COLS - 1, BASE_C + r);
    const minR = Math.max(0, BASE_R - r);
    const maxR = Math.min(GRID_ROWS - 1, BASE_R + r);
    const wTL = gridToWorld(minC, minR);
    const wTR = gridToWorld(maxC, minR);
    const wBR = gridToWorld(maxC, maxR);
    const wBL = gridToWorld(minC, maxR);
    const top    = { x: wTL.x,             y: wTL.y };
    const right  = { x: wTR.x + TILE_W / 2, y: wTR.y + TILE_H / 2 };
    const bottom = { x: wBR.x,             y: wBR.y + TILE_H };
    const left   = { x: wBL.x - TILE_W / 2, y: wBL.y + TILE_H / 2 };
    return [top, right, bottom, left];
  }

  const points = pointsForRange(halfR);
  const [top, right, bottom, left] = points;
  const cx = (top.x + right.x + bottom.x + left.x) / 4;
  const cy = (top.y + right.y + bottom.y + left.y) / 4;

  function traceDiamond(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
  }

  function expandedDiamond(scale) {
    return points.map(p => ({
      x: cx + (p.x - cx) * scale,
      y: cy + (p.y - cy) * scale,
    }));
  }

  ctx.save();

  // Faint tier contour lines (constant subtle opacity)
  for (let i = 0; i < state.base.level - 1; i++) {
    const tierRange = BASE_RANGE[i];
    if (!Number.isFinite(tierRange) || tierRange <= 0 || tierRange >= halfR) continue;
    const tierPts = pointsForRange(tierRange);
    const topMidX = (tierPts[0].x + tierPts[1].x) / 2;
    const topMidY = (tierPts[0].y + tierPts[1].y) / 2;
    const topAngle = Math.atan2(tierPts[1].y - tierPts[0].y, tierPts[1].x - tierPts[0].x);
    traceDiamond(tierPts);
    ctx.strokeStyle = 'rgba(70,150,255,0.10)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.save();
    const tierHex = MINE_TIERS[i + 1]?.color || '#8ab';
    const tierRgb = hexToRgb(tierHex);
    ctx.font = '8px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = `rgba(${tierRgb},0.72)`;
    ctx.translate(topMidX, topMidY - 4);
    ctx.rotate(topAngle);
    ctx.fillText(`TIER ${toRoman(i + 1)}`, 0, 0);
    ctx.restore();
  }

  const t = performance.now();
  const cycleMs = 7000;   // one pulse every 7s
  const burstMs = 1000;   // pulse expands in 1s
  const elapsed = t % cycleMs;
  const activePulse = elapsed < burstMs;
  const phase = activePulse ? (elapsed / burstMs) : 1;

  // Primary border
  traceDiamond(points);
  ctx.strokeStyle = 'rgba(40,220,100,0.9)'; ctx.lineWidth = 2;
  ctx.setLineDash([]); ctx.stroke();

  const outerTopMidX = (points[0].x + points[1].x) / 2;
  const outerTopMidY = (points[0].y + points[1].y) / 2;
  const outerTopAngle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  const currentTierHex = MINE_TIERS[state.base.level]?.color || '#6fff9a';
  const currentTierRgb = hexToRgb(currentTierHex);
  ctx.save();
  ctx.font = '9px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = `rgba(${currentTierRgb},0.9)`;
  ctx.translate(outerTopMidX, outerTopMidY - 5);
  ctx.rotate(outerTopAngle);
  ctx.fillText(`TIER ${toRoman(state.base.level)}`, 0, 0);
  ctx.restore();

  // Outward pulse ring: single border line matching the main style.
  if (activePulse) {
    const ring = expandedDiamond(1 + phase * 0.095);
    const alpha = (1 - phase) * 0.9;
    traceDiamond(ring);
    ctx.strokeStyle = `rgba(40,220,100,${alpha.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawBase(col, row) {
  const {x,y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;
  const { baseHovered } = canvasState;
  const baseDown = (state.base.health || 0) <= 0;
  const flashPulse = 0.5 + 0.5 * Math.sin(performance.now() / 140);
  const strokeColor = baseDown ? (flashPulse > 0.5 ? '#ff3d3d' : '#ff9a9a') : (baseHovered ? '#8ff' : '#4af');
  const coreFill = baseDown ? '#3a0d12' : '#102040';
  const towerFill = baseDown ? '#5a1118' : '#1a3a6e';
  const beaconColor = baseDown ? '#ff5555' : '#8ff';
  const textColor = baseDown ? '#ff7a7a' : '#4af';

  if (baseHovered) {
    const t = performance.now() / 600;
    const pulse = 0.3+0.15*Math.sin(t);
    const glowR = ctx.createRadialGradient(cx,cy,0,cx,cy,72);
    if (baseDown) {
      glowR.addColorStop(0, `rgba(255,70,70,${0.22 + flashPulse * 0.2})`);
      glowR.addColorStop(1, 'rgba(255,70,70,0)');
    } else {
      glowR.addColorStop(0, `rgba(80,200,255,${pulse})`);
      glowR.addColorStop(1, 'rgba(80,200,255,0)');
    }
    ctx.fillStyle = glowR; ctx.beginPath(); ctx.arc(cx,cy,72,0,Math.PI*2); ctx.fill();
  }

  ctx.beginPath(); ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy); ctx.closePath();
  ctx.fillStyle = coreFill; ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = baseHovered ? 2 : 1; ctx.stroke();

  const tw=18, th=36;
  ctx.fillStyle = towerFill; ctx.fillRect(cx-tw/2,cy-th,tw,th);
  ctx.strokeStyle = strokeColor; ctx.lineWidth=1; ctx.strokeRect(cx-tw/2,cy-th,tw,th);
  const grd = ctx.createRadialGradient(cx,cy-th-4,1,cx,cy-th-4,14);
  if (baseDown) {
    grd.addColorStop(0,`rgba(255,90,90,${0.75 + flashPulse * 0.2})`); grd.addColorStop(1,'rgba(255,90,90,0)');
  } else {
    grd.addColorStop(0,'rgba(80,200,255,0.9)'); grd.addColorStop(1,'rgba(80,200,255,0)');
  }
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx,cy-th-4,14,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx,cy-th); ctx.lineTo(cx,cy-th-12);
  ctx.strokeStyle = textColor; ctx.lineWidth=1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy-th-12,3,0,Math.PI*2); ctx.fillStyle = beaconColor; ctx.fill();
  ctx.fillStyle = textColor; ctx.font='bold 9px Orbitron,monospace'; ctx.textAlign='center'; ctx.fillText('BASE',cx,cy-th-20);

}

function drawBaseHoverLabel(col, row) {
  if (!canvasState.baseHovered) return;
  const { x, y } = gridToIso(col, row);
  const cx = x;
  const cy = y + TILE_H / 2;
  const th = 36;
  const baseName = state.base.name || 'Base Station';
  const label = `${baseName} — TIER ${toRoman(state.base.level)}`;
  const labelY = cy - th - 36;
  ctx.font = 'bold 11px Orbitron,monospace';
  const tw2 = ctx.measureText(label).width;
  const pad = 7;
  ctx.fillStyle = 'rgba(4,12,35,0.88)';
  ctx.strokeStyle = '#4af';
  ctx.lineWidth = 1;
  const rx = cx - tw2 / 2 - pad;
  const ry = labelY - 13;
  const rw = tw2 + pad * 2;
  const rh = 18;
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8ff';
  ctx.textAlign = 'center';
  ctx.fillText(label, cx, labelY);
}

export function drawNode(node) {
  const [col,row] = node.gr;
  const {x,y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;
  const def = RESOURCE_DEFS[node.type];
  const nodeTier = getResourceTier(node.type) || 1;
  const fleetTier = state.highestAvailableNodeTier || 1;
  const lockedByFleetTier = nodeTier > fleetTier;
  if (node.minLevel > state.base.level) return;
  const BASE_C2 = BASE_COL, BASE_R2 = BASE_ROW;
  const halfR2 = BASE_RANGE[state.base.level-1] || 6;
  const nodeDist = Math.max(Math.abs(col-BASE_C2), Math.abs(row-BASE_R2));
  if (nodeDist > halfR2) return;

  let fadeOpacity = 1;
  if (node.fadeAge !== undefined && node.fadeDuration) {
    fadeOpacity = Math.min(1, node.fadeAge/node.fadeDuration);
  }

  let opacity = fadeOpacity;
  let isHighlighted = false;
  if (state.pendingAssign) {
    const ship = state.ships.find(s => s.id === state.pendingAssign);
    const occupied = state.ships.some(s => s.id !== state.pendingAssign && s.targetNode === node.id);
    if (ship) {
      const accessible = [];
      for (let t = 1; t <= ship.mineTier; t++) accessible.push(...MINE_TIERS[t].resources);
      if (occupied) opacity = 0.2*fadeOpacity;
      else if (accessible.includes(node.type)) { isHighlighted = true; opacity = fadeOpacity; }
      else opacity = 0.25*fadeOpacity;
    }
  }

  if (lockedByFleetTier && !state.pendingAssign) {
    opacity *= 0.42;
  }

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath(); ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy); ctx.closePath();
  const nodeStrokeColor = lockedByFleetTier ? '#5d6675' : def.color;
  const nodeFill = lockedByFleetTier ? 'rgba(90,100,120,0.12)' : `rgba(${hexToRgb(def.color)},0.15)`;
  ctx.fillStyle = nodeFill; ctx.fill();
  ctx.strokeStyle = nodeStrokeColor; ctx.lineWidth = isHighlighted ? 1.5 : 0.8; ctx.stroke();

  if (isHighlighted) {
    const pulse = 0.5+0.5*Math.sin(Date.now()/300);
    ctx.beginPath(); ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy); ctx.closePath();
    ctx.strokeStyle = def.color; ctx.lineWidth = 2+pulse*2;
    ctx.globalAlpha = 0.3+pulse*0.4; ctx.stroke();
    ctx.globalAlpha = opacity;
  }

  for (let i = 0; i < 3; i++) {
    const hh=8+i*5, ww=10-i, ox=(i%2)*6-3;
    ctx.beginPath();
    ctx.moveTo(cx+ox,cy-hh); ctx.lineTo(cx+ox+ww,cy-hh/2); ctx.lineTo(cx+ox+ww/2,cy); ctx.lineTo(cx+ox-ww/2,cy); ctx.lineTo(cx+ox-ww,cy-hh/2); ctx.closePath();
    const alpha = 0.55+i*.1;
    const shardColor = lockedByFleetTier ? '#6a7488' : def.color+Math.floor(alpha*255).toString(16).padStart(2,'0');
    ctx.fillStyle = shardColor; ctx.fill();
    ctx.strokeStyle = '#fff3'; ctx.lineWidth=0.5; ctx.stroke();
  }
  const nodeLabelY = cy + 5;
  ctx.font = '8px Share Tech Mono,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = lockedByFleetTier ? '#7f8da3' : def.color;
  ctx.fillText(def.label.toUpperCase(), cx, nodeLabelY);
  ctx.restore();
}

export function drawShipWorld(ship) {
  const size = ship.type==='freighter'?11:ship.type==='hauler'?9:8;
  const baseCol = ship.type==='freighter'?'#ffaa30':ship.type==='hauler'?'#80d0ff':ship.type==='swift'?'#ff80c0':'#60d090';
  const col  = ship.status === 'holding' ? '#9aa3ae' : baseCol;
  const isSelected = state.selectedShip === ship.id;

  // ── Curved trail (world space, drawn before ship body) ──────
  const trail = ship.trail;
  if (trail?.length > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = trail.length;
    for (let i = 1; i < n; i++) {
      const t = i / n;  // 0 = oldest/tail, 1 = newest/head
      ctx.beginPath();
      // Use midpoints for smooth quadratic curve segments
      const ax = (trail[i-1].x + trail[i].x) / 2;
      const ay = (trail[i-1].y + trail[i].y) / 2;
      const bx = i < n-1 ? (trail[i].x + trail[i+1].x) / 2 : trail[i].x;
      const by = i < n-1 ? (trail[i].y + trail[i+1].y) / 2 : trail[i].y;
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(trail[i].x, trail[i].y, bx, by);
      ctx.strokeStyle = col;
      ctx.globalAlpha = t * 0.65;
      ctx.lineWidth = t * 6;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.save();
  ctx.translate(ship.x, ship.y);

  const isHovered = !isSelected && state.hoveredShip === ship.id;
  if (isHovered) {
    ctx.beginPath(); ctx.arc(0,0,size+7,0,Math.PI*2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (isSelected) {
    const pulse = 0.5+0.5*Math.sin(Date.now()/350);
    ctx.beginPath(); ctx.arc(0,0,size+8+pulse*4,0,Math.PI*2);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3+pulse*0.45; ctx.stroke(); ctx.globalAlpha = 1;
  }

  ctx.rotate(ship.heading || 0);
  const grd = ctx.createRadialGradient(0,0,1,0,0,size+6);
  grd.addColorStop(0, col+'55'); grd.addColorStop(1, col+'00');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0,0,size+6,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0,-size); ctx.lineTo(size*.6,0); ctx.lineTo(0,size*.5); ctx.lineTo(-size*.6,0); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle='#fff6'; ctx.lineWidth=0.7; ctx.stroke();

  if (ship.status==='flying'||ship.status==='returning'||ship.status==='holding') {
    // Short nozzle glow at engine mouth — trail handles the rest
    const ng = ctx.createLinearGradient(0,size*.5,0,size*2.4);
    ng.addColorStop(0,col+'ee'); ng.addColorStop(0.5,col+'66'); ng.addColorStop(1,col+'00');
    ctx.beginPath(); ctx.moveTo(0,size*.5); ctx.lineTo(0,size*2.4);
    ctx.strokeStyle = ng; ctx.lineWidth = 4; ctx.lineCap='round'; ctx.stroke();
  }

  if (ship.status==='mining') {
    ctx.restore();
    ctx.save();
    ctx.translate(ship.x, ship.y);
    const node = state.nodes.find(n => n.id === ship.targetNode);
    if (node) {
      const nw = gridToWorld(node.gr[0], node.gr[1]);
      const ncx = nw.x, ncy = nw.y+TILE_H/2;
      const dx = ncx-ship.x, dy = ncy-ship.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < 0.001) { ctx.restore(); return; }
      const nx = dx/dist, ny = dy/dist;
      const phase = (ship.id * 1.9) % (Math.PI * 2);
      const freqA = 180 + (ship.id * 37) % 80;
      const freqB = 65  + (ship.id * 23) % 40;
      const wobble = Math.sin(Date.now()/freqA + phase)*0.16 + Math.sin(Date.now()/freqB + phase*1.7)*0.05;
      const cosW = Math.cos(wobble), sinW = Math.sin(wobble);
      const bx = nx*cosW-ny*sinW, by = nx*sinW+ny*cosW;
      const beamLen = dist * 0.86;
      const freqP = 120 + (ship.id * 41) % 60;
      const beamPulse = 0.78 + 0.22 * Math.abs(Math.sin(Date.now()/freqP + phase));
      const def = RESOURCE_DEFS[node.type];

      const startX = bx * (size * 0.7);
      const startY = by * (size * 0.7);
      const endX = bx * beamLen;
      const endY = by * beamLen;

      const outer = ctx.createLinearGradient(startX, startY, endX, endY);
      outer.addColorStop(0, def.color + '44');
      outer.addColorStop(0.55, def.color + '66');
      outer.addColorStop(1, def.color + 'aa');
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = outer;
      ctx.lineWidth = 3.5 * beamPulse;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5;
      ctx.stroke();

      const core = ctx.createLinearGradient(startX, startY, endX, endY);
      core.addColorStop(0, '#ffffff88');
      core.addColorStop(0.4, '#ffffffcc');
      core.addColorStop(1, '#ffffffee');
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = core;
      ctx.lineWidth = 1.4 * beamPulse;
      ctx.globalAlpha = 0.95;
      ctx.stroke();

      const impactPulse = 0.65 + 0.35 * Math.abs(Math.sin(Date.now() / 110));
      const impactRadius = 3.5 + impactPulse * 2.2;
      const impactGlow = ctx.createRadialGradient(endX, endY, 0, endX, endY, impactRadius * 2.2);
      impactGlow.addColorStop(0, '#ffffffcc');
      impactGlow.addColorStop(0.4, def.color + 'bb');
      impactGlow.addColorStop(1, def.color + '00');
      ctx.fillStyle = impactGlow;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(endX, endY, impactRadius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = def.color + 'cc';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(endX, endY, impactRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return;
  }
  ctx.restore();
}

function drawSelectedShipLine() {
  if (!state.selectedShip) return;
  const ship = state.ships.find(s => s.id === state.selectedShip);
  if (!ship || !ship.targetNode) return;
  const node = state.nodes.find(n => n.id === ship.targetNode);
  if (!node) return;
  const nw = gridToWorld(node.gr[0], node.gr[1]);
  const nx = nw.x, ny = nw.y + TILE_H / 2;
  const def = RESOURCE_DEFS[node.type];
  const pulse = 0.45 + 0.35 * Math.sin(Date.now() / 500);

  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -(Date.now() / 60) % 14;
  ctx.strokeStyle = def.color;
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ship.x, ship.y);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function render(ts) {
  if (!ctx) return;
  if (ts - lastRenderTs < RENDER_FRAME_MS) {
    requestAnimationFrame(render);
    return;
  }
  lastRenderTs = ts;
  const rawFps = lastFpsSampleTs > 0 ? 1000 / Math.max(1, ts - lastFpsSampleTs) : 60;
  lastFpsSampleTs = ts;
  fpsAvg = fpsAvg * 0.9 + rawFps * 0.1;

  // Camera follow
  if (state.followShip) {
    const fs = state.ships.find(s => s.id === state.followShip);
    if (fs) { cam.x = cam.targetX = fs.x; cam.y = cam.targetY = fs.y; }
    else { state.followShip = null; }
  }

  const cameraMoving = tickCamera();
  const camSig = `${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${cam.zoom.toFixed(3)}`;
  if (_onCameraMove && (cameraMoving || camSig !== _lastCamMoveSig)) _onCameraMove();
  _lastCamMoveSig = camSig;

  if (state.settings?.showBackgroundStars !== false) drawStars(ts);
  ctx.clearRect(0,0,W,H);
  const shake = getShakeOffset();
  const showGrid = state.settings?.showGrid !== false;
  if (showGrid) {
    ensureGridCache(shake.x, shake.y);
    ctx.drawImage(gridCacheCanvas, 0, 0);
  }

  ctx.save();
  ctx.translate(W/2-cam.x*cam.zoom+shake.x, H/2-cam.y*cam.zoom+shake.y);
  ctx.scale(cam.zoom, cam.zoom);
  if (showGrid) drawRangeBorder();
  drawRangePulses();
  const sn = [...state.nodes].sort((a,b)=>(a.gr[0]+a.gr[1])-(b.gr[0]+b.gr[1]));
  for (const n of sn) drawNode(n);
  drawStorageFacilities();
  drawBase(BASE_COL, BASE_ROW);
  drawSelectedShipLine();
  const ss = [...state.ships].sort((a,b)=>a.y-b.y);
  for (const s of ss) drawShipWorld(s);
  drawTurrets();
  drawTurretPlacementHover();
  drawStoragePlacementHover();
  drawSolarFlare();
  drawComet();
  drawFloaties();
  drawNodeParticles();
  drawBaseHoverLabel(BASE_COL, BASE_ROW);
  ctx.restore();
  const zoomPct = document.getElementById('zoom-pct');
  if (zoomPct) zoomPct.textContent = `${Math.round(cam.zoom*100)}%`;
  const fpsReadout = document.getElementById('fps-readout');
  if (fpsReadout) fpsReadout.textContent = `FPS ${Math.round(fpsAvg)}`;
  // Update SOL clock every frame for smooth ticking
  const _dp = state.solTimer / SOL_DURATION;
  const _sh = Math.floor(_dp*24);
  const _sm = Math.floor((_dp*24*60)%60);
  const _solEl = document.getElementById('hdr-sol');
  const _solText = `SOL ${state.sol} · ${String(_sh).padStart(2,'0')}:${String(_sm).padStart(2,'0')}`;
  if (_solEl && _solEl.textContent !== _solText) _solEl.textContent = _solText;
  requestAnimationFrame(render);
}
