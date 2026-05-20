// ============================================================
// MAIN RENDERER — canvas drawing
// ============================================================
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, SOL_DURATION, BASE_COL, BASE_ROW, BASE_FOOTPRINT_RADIUS } from '../constants.js';
import { cam, gridToWorld, gridToIso, focusOnBase, BASE_POS, tickCamera } from './camera.js';
import { BASE_RANGE } from '../data/base.js';
import { toRoman, SHIP_DEFS } from '../data/ships.js';
import { RESOURCE_DEFS, MINE_TIERS, getResourceTier } from '../data/resources.js';
import { CRASHED_SHIP_NODE_TYPE } from '../data/nodes.js';
import { hexToRgb } from '../helpers.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import {
  drawSolarFlare, drawBlackHole, drawComet, drawFloaties, drawRangePulses, drawNodeParticles,
  getShakeOffset, setAnimCtx,
} from './animations.js';
import { drawStars } from './stars.js';
import { drawTurrets, drawTurretPlacementHover, setTurretCtx } from './turrets.js';
import { drawPowerLinks, drawLabLinks, drawStorageFootprints, drawStorageSprites, drawStoragePlacementHover, setStorageCtx } from './storage.js';

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
const baseImage = new Image();
baseImage.src = 'assets/images/buildings/base.png';
const baseHoverImage = new Image();
baseHoverImage.src = 'assets/images/buildings/base_hover.png';
const crashedShipImages = new Map([
  ['assets/images/crashed_ships/crashed_ship_1.png', Object.assign(new Image(), { src: 'assets/images/crashed_ships/crashed_ship_1.png' })],
  ['assets/images/crashed_ships/crashed_ship_2.png', Object.assign(new Image(), { src: 'assets/images/crashed_ships/crashed_ship_2.png' })],
]);

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
  const showEffects = state.settings?.showVisualEffects !== false;

  if (showEffects && baseHovered && !baseHoverImage.complete) {
    const t = performance.now() / 600;
    const pulse = 0.3+0.15*Math.sin(t);
    const glowR = ctx.createRadialGradient(cx,cy,0,cx,cy,112);
    if (baseDown) {
      glowR.addColorStop(0, `rgba(255,70,70,${0.22 + flashPulse * 0.2})`);
      glowR.addColorStop(1, 'rgba(255,70,70,0)');
    } else {
      glowR.addColorStop(0, `rgba(80,200,255,${pulse})`);
      glowR.addColorStop(1, 'rgba(80,200,255,0)');
    }
    ctx.fillStyle = glowR; ctx.beginPath(); ctx.arc(cx,cy,72,0,Math.PI*2); ctx.fill();
  }

  const tl = gridToIso(col - BASE_FOOTPRINT_RADIUS, row - BASE_FOOTPRINT_RADIUS);
  const tr = gridToIso(col + BASE_FOOTPRINT_RADIUS, row - BASE_FOOTPRINT_RADIUS);
  const br = gridToIso(col + BASE_FOOTPRINT_RADIUS, row + BASE_FOOTPRINT_RADIUS);
  const bl = gridToIso(col - BASE_FOOTPRINT_RADIUS, row + BASE_FOOTPRINT_RADIUS);
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
  ctx.fillStyle = coreFill;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = baseHovered ? 2 : 1.25;
  ctx.stroke();

  const displayImage = baseHovered && baseHoverImage.complete && baseHoverImage.naturalWidth > 0
    ? baseHoverImage
    : baseImage;

  if (displayImage.complete && displayImage.naturalWidth > 0) {
    const imageW = 156;
    const imageH = 156;
    const imageX = cx - imageW / 2;
    const imageY = cy - imageH + 34;

    ctx.save();
    ctx.shadowColor = baseDown ? 'rgba(255,70,70,0.35)' : 'rgba(80,200,255,0.16)';
    ctx.shadowBlur = showEffects ? (baseHovered ? 10 : 8) : 0;
    ctx.drawImage(displayImage, imageX, imageY, imageW, imageH);
    ctx.restore();

    if (baseDown) {
      ctx.fillStyle = `rgba(80,0,0,${0.2 + flashPulse * 0.15})`;
      ctx.fillRect(imageX, imageY, imageW, imageH);
    }
    return;
  }

  const tw=18, th=36;
  ctx.fillStyle = towerFill; ctx.fillRect(cx-tw/2,cy-th,tw,th);
  ctx.strokeStyle = strokeColor; ctx.lineWidth=1; ctx.strokeRect(cx-tw/2,cy-th,tw,th);
  if (showEffects) {
    const grd = ctx.createRadialGradient(cx,cy-th-4,1,cx,cy-th-4,14);
    if (baseDown) {
      grd.addColorStop(0,`rgba(255,90,90,${0.75 + flashPulse * 0.2})`); grd.addColorStop(1,'rgba(255,90,90,0)');
    } else {
      grd.addColorStop(0,'rgba(80,200,255,0.9)'); grd.addColorStop(1,'rgba(80,200,255,0)');
    }
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx,cy-th-4,14,0,Math.PI*2); ctx.fill();
  }
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
  const baseName = state.base.name || 'Base Station';
  const label = `${baseName} — TIER ${toRoman(state.base.level)}`;
  const labelY = cy - 78;
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
  if (!def) return;
  const nodeTier = getResourceTier(node.type) || 1;
  const fleetTier = state.highestAvailableNodeTier || 1;
  const isSpecialNode = node.type === CRASHED_SHIP_NODE_TYPE;
  const lockedByFleetTier = !isSpecialNode && nodeTier > fleetTier;
  const showEffects = state.settings?.showVisualEffects !== false;
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
      else if (isSpecialNode || accessible.includes(node.type)) { isHighlighted = true; opacity = fadeOpacity; }
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
  const nodeFill = isSpecialNode ? 'rgba(120,140,170,0.08)' : lockedByFleetTier ? 'rgba(90,100,120,0.12)' : `rgba(${hexToRgb(def.color)},0.15)`;
  ctx.fillStyle = nodeFill; ctx.fill();
  ctx.strokeStyle = nodeStrokeColor; ctx.lineWidth = isHighlighted ? 1.5 : 0.8; ctx.stroke();

  if (showEffects && isHighlighted) {
    const pulse = 0.5+0.5*Math.sin(Date.now()/300);
    ctx.beginPath(); ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy); ctx.closePath();
    ctx.strokeStyle = def.color; ctx.lineWidth = 2+pulse*2;
    ctx.globalAlpha = 0.3+pulse*0.4; ctx.stroke();
    ctx.globalAlpha = opacity;
  }

  if (showEffects && isSpecialNode) {
    const pulseDurationMs = 900;
    const burstCount = 3;
    const burstStaggerMs = 300;
    const burstWindowMs = pulseDurationMs + (burstStaggerMs * burstCount);
    const quietMs = 8000 + (((node.id * 1373) % 4001));
    const cycleMs = burstWindowMs + quietMs;
    const pulseMs = (Date.now() + (node.id * 911)) % cycleMs;
    if (pulseMs <= burstWindowMs) {
      for (let i = 1; i <= burstCount; i++) {
        const startMs = i * burstStaggerMs;
        const localMs = pulseMs - startMs;
        if (localMs < 0 || localMs > pulseDurationMs) continue;
        const t = localMs / pulseDurationMs;
        const scale = 1 + (t * 1.15);
        const alpha = (1 - t) * 0.55 * opacity;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(cx, cy - (TILE_H / 2) * scale);
        ctx.lineTo(cx + (TILE_W / 2) * scale, cy);
        ctx.lineTo(cx, cy + (TILE_H / 2) * scale);
        ctx.lineTo(cx - (TILE_W / 2) * scale, cy);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(90,190,255,0.95)';
        ctx.lineWidth = 2.2 - (t * 0.9);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  const crashedShipImage = isSpecialNode ? crashedShipImages.get(node.sprite) || crashedShipImages.get('assets/images/crashed_ships/crashed_ship_1.png') : null;
  if (isSpecialNode && crashedShipImage?.complete && crashedShipImage.naturalWidth > 0) {
    const width = 54;
    const height = 54;
    ctx.drawImage(crashedShipImage, cx - (width / 2), cy - height + 12, width, height);

    if (showEffects) {
      const smokeAge = Date.now() / 1000;
      const smokePuffs = [
        { phase: 0.0, x: -5 },
        { phase: 0.95, x: 2 },
        { phase: 1.7, x: 8 },
      ];
      for (const puff of smokePuffs) {
        const t = ((smokeAge + puff.phase) % 2.4) / 2.4;
        const puffY = cy - 18 - (t * 18);
        const puffX = cx + puff.x + Math.sin((smokeAge + puff.phase) * 2.2) * 2;
        const radius = 3 + (t * 5);
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.28 * opacity;
        ctx.fillStyle = 'rgba(180,190,205,0.95)';
        ctx.beginPath();
        ctx.arc(puffX, puffY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const hh=8+i*5, ww=10-i, ox=(i%2)*6-3;
      ctx.beginPath();
      ctx.moveTo(cx+ox,cy-hh); ctx.lineTo(cx+ox+ww,cy-hh/2); ctx.lineTo(cx+ox+ww/2,cy); ctx.lineTo(cx+ox-ww/2,cy); ctx.lineTo(cx+ox-ww,cy-hh/2); ctx.closePath();
      const alpha = 0.55+i*.1;
      const shardColor = lockedByFleetTier ? '#6a7488' : def.color+Math.floor(alpha*255).toString(16).padStart(2,'0');
      ctx.fillStyle = shardColor; ctx.fill();
      ctx.strokeStyle = '#fff3'; ctx.lineWidth=0.5; ctx.stroke();
    }
  }
  const nodeLabelY = cy + 5;
  ctx.font = '8px Share Tech Mono,monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (showEffects) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 1;
  }
  ctx.fillStyle = lockedByFleetTier ? '#7f8da3' : def.color;
  ctx.fillText(def.label.toUpperCase(), cx, nodeLabelY);
  ctx.restore();
}

export function drawShipWorld(ship) {
  const shipDef = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;
  const render = shipDef.render || SHIP_DEFS.scout.render;
  const size = render.size || 8;
  const baseCol = render.color || '#60d090';
  const col  = ship.status === 'holding' ? '#9aa3ae' : baseCol;
  const isSelected = state.selectedShip === ship.id;
  const showEffects = state.settings?.showVisualEffects !== false;

  // ── Curved trail (world space, drawn before ship body) ──────
  const trail = ship.trail;
  if (trail?.length > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = trail.length;
    const offsets = render.trailOffsets || [0];
    for (let i = 1; i < n; i++) {
      const t = i / n;  // 0 = oldest/tail, 1 = newest/head
      const prev = trail[i - 1];
      const cur = trail[i];
      const next = i < n - 1 ? trail[i + 1] : cur;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const mag = Math.hypot(dx, dy) || 1;
      const nx = -dy / mag;
      const ny = dx / mag;
      const ax = (prev.x + cur.x) / 2;
      const ay = (prev.y + cur.y) / 2;
      const bx = i < n-1 ? (cur.x + next.x) / 2 : cur.x;
      const by = i < n-1 ? (cur.y + next.y) / 2 : cur.y;
      for (const offset of offsets) {
        ctx.beginPath();
        ctx.moveTo(ax + (nx * offset), ay + (ny * offset));
        ctx.quadraticCurveTo(cur.x + (nx * offset), cur.y + (ny * offset), bx + (nx * offset), by + (ny * offset));
        ctx.strokeStyle = col;
        ctx.globalAlpha = t * (render.trailOpacity ?? 0.3);
        ctx.lineWidth = t * (render.trailWidth || 6);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.save();
  ctx.translate(ship.x, ship.y);

  const isHovered = showEffects && !isSelected && state.hoveredShip === ship.id;
  if (isHovered) {
    ctx.beginPath(); ctx.arc(0,0,size+7,0,Math.PI*2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (showEffects && isSelected) {
    const pulse = 0.5+0.5*Math.sin(Date.now()/350);
    ctx.beginPath(); ctx.arc(0,0,size+8+pulse*4,0,Math.PI*2);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3+pulse*0.45; ctx.stroke(); ctx.globalAlpha = 1;
  }

  ctx.rotate(ship.heading || 0);
  if (showEffects) {
    const glowRadius = size + (render.glowRadiusExtra ?? 6);
    const glowOpacity = render.glowOpacity ?? 0.33;
    const glowRgb = hexToRgb(col) || '255,255,255';
    const grd = ctx.createRadialGradient(0,0,1,0,0,glowRadius);
    grd.addColorStop(0, `rgba(${glowRgb},${glowOpacity})`);
    grd.addColorStop(1, `rgba(${glowRgb},0)`);
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0,0,glowRadius,0,Math.PI*2); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(0,-size); ctx.lineTo(size*.6,0); ctx.lineTo(0,size*.5); ctx.lineTo(-size*.6,0); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle='#fff6'; ctx.lineWidth=0.7; ctx.stroke();




  if (ship.status==='mining') {
    ctx.restore();
    if (!showEffects) return;
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

// ── Drone rendering ──────────────────────────────────────────
export function drawDroneWorld(drone) {
  const size = 5;
  const isScanning = drone.status === 'scanning';
  const color = isScanning ? '#40ffcc' : '#4ab8ff';
  const showEffects = state.settings?.showVisualEffects !== false;
  const t = Date.now() / 1000;

  // Spawn materialise — 0.8 s animation driven by drone.spawnAge
  const SPAWN_DUR = 0.8;
  const spawnAge  = drone.spawnAge ?? SPAWN_DUR;
  const isSpawning = showEffects && spawnAge < SPAWN_DUR;
  const spawnT    = isSpawning ? Math.min(1, spawnAge / SPAWN_DUR) : 1;

  ctx.save();
  ctx.translate(drone.x, drone.y);

  // ── Spawn materialise effect (world-aligned) ─────────────────
  if (isSpawning) {
    // Three staggered expanding energy rings
    for (let i = 0; i < 3; i++) {
      const rt = Math.max(0, Math.min(1, (spawnT - i * 0.15) / 0.65));
      if (rt <= 0) continue;
      const ringR = rt * 28;
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = '#4ab8ff';
      ctx.lineWidth = Math.max(0.4, 1.5 - i * 0.4);
      ctx.globalAlpha = (1 - rt) * (0.65 - i * 0.15);
      ctx.stroke();
    }

    // Sparks radiating outward (fade out by ~t=0.4)
    const sparkT = Math.min(1, spawnT * 2.3);
    if (sparkT < 1) {
      for (let i = 0; i < 8; i++) {
        const angle   = (i / 8) * Math.PI * 2 + 0.4;
        const maxDist = 14 + (i % 3) * 5;
        const dist    = sparkT * maxDist;
        const alpha   = (1 - sparkT) * 0.9;
        ctx.beginPath();
        ctx.arc(
          Math.cos(angle) * dist,
          Math.sin(angle) * dist,
          Math.max(0.3, 1.5 - sparkT),
          0, Math.PI * 2,
        );
        ctx.fillStyle = '#c8eeff';
        ctx.globalAlpha = alpha;
        ctx.fill();
      }
    }

    // Bright centre energy flash (first 35 % of spawn)
    const flashT = Math.max(0, 1 - spawnT / 0.35);
    if (flashT > 0) {
      const flashR = 12 * flashT;
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, flashR);
      grd.addColorStop(0, `rgba(180,235,255,${0.6 * flashT})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, flashR, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  // ── Normal body glow (only after spawn) ──────────────────────
  if (!isSpawning && showEffects) {
    const glowRadius = isScanning ? 22 : size + 9;
    const grd = ctx.createRadialGradient(0, 0, 1, 0, 0, glowRadius);
    grd.addColorStop(0, isScanning ? 'rgba(64,255,200,0.28)' : 'rgba(64,180,255,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, glowRadius, 0, Math.PI * 2); ctx.fill();
  }

  // ── Scanning animation (world-aligned, not rotated with body) ─
  if (!isSpawning && isScanning && showEffects) {
    const scanRadius = 26;
    const sweepSpeed = 2.2;                         // rad/s
    const sweepAngle = (t * sweepSpeed) % (Math.PI * 2);
    const trailArc   = Math.PI * 0.55;              // ~100° fading trail
    const trailSteps = 10;

    for (let i = trailSteps; i >= 1; i--) {
      const startA = sweepAngle - trailArc * (i / trailSteps);
      const endA   = sweepAngle - trailArc * ((i - 1) / trailSteps);
      const alpha  = (1 - i / trailSteps) * 0.22;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, scanRadius, startA, endA);
      ctx.closePath();
      ctx.fillStyle = `rgba(64,255,200,${alpha})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sweepAngle) * scanRadius, Math.sin(sweepAngle) * scanRadius);
    ctx.strokeStyle = '#40ffcc';
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = 0.85;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, scanRadius, 0, Math.PI * 2);
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(64,255,200,0.25)';
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    for (let i = 0; i < 2; i++) {
      const phase = ((t * 0.65 + i * 0.5) % 1);
      const r     = 4 + phase * (scanRadius - 4);
      const alpha = (1 - phase) * 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#40ffcc';
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  // ── Drone body — scale + rotate in nested save so outer alpha/transform stays clean ──
  ctx.save();
  if (isSpawning) {
    // Ease-out-back: scale 0→1 with slight overshoot bounce
    const c1 = 1.70158, c3 = c1 + 1;
    const bodyScale = Math.max(0.01, 1 + c3 * Math.pow(spawnT - 1, 3) + c1 * Math.pow(spawnT - 1, 2));
    ctx.scale(bodyScale, bodyScale);
    ctx.globalAlpha = Math.min(1, spawnT * 2.2);
  }
  ctx.rotate(drone.heading || 0);

  ctx.beginPath();
  ctx.rect(-size, -size, size * 2, size * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 0.8; ctx.stroke();

  ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();

  ctx.restore(); // undo body scale / rotate / alpha

  ctx.restore(); // undo translate
}

function drawSelectedShipLine() {
  if (!state.selectedShip) return;
  if (state.settings?.showVisualEffects === false) return;
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
  drawPowerLinks();
  drawLabLinks();
  drawStorageFootprints();
  const sn = [...state.nodes].sort((a,b)=>(a.gr[0]+a.gr[1])-(b.gr[0]+b.gr[1]));
  for (const n of sn) drawNode(n);
  drawStorageSprites();
  drawBase(BASE_COL, BASE_ROW);
  drawSelectedShipLine();
  drawTurrets();
  const ss = [...state.ships].sort((a,b)=>a.y-b.y);
  for (const s of ss) drawShipWorld(s);
  const ds = [...(state.drones || [])].sort((a,b)=>a.y-b.y);
  for (const d of ds) drawDroneWorld(d);
  drawTurretPlacementHover();
  drawStoragePlacementHover();
  drawSolarFlare();
  drawBlackHole();
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
