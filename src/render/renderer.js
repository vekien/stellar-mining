// ============================================================
// MAIN RENDERER — canvas drawing
// ============================================================
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, SOL_DURATION } from '../constants.js';
import { cam, gridToWorld, gridToIso, focusOnBase, BASE_POS } from './camera.js';
import { BASE_RANGE } from '../data/nodes.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { hexToRgb } from '../helpers.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import {
  drawSolarFlare, drawComet, drawFloaties, drawRangePulses, drawNodeParticles,
  getShakeOffset, setAnimCtx,
} from './animations.js';
import { drawStars, tickShootingStars } from './stars.js';
import { drawTurrets, drawTurretPlacementHover, setTurretCtx } from './turrets.js';

let ctx = null;
export let W = 0, H = 0;

export function initRenderer(mainCtx, w, h) {
  ctx = mainCtx;
  W = w; H = h;
  setAnimCtx(ctx);
  setTurretCtx(ctx);
}

export function resizeRenderer(w, h) { W = w; H = h; }

export function drawTile(col, row, fill, stroke) {
  const {x,y} = gridToIso(col, row);
  ctx.beginPath();
  ctx.moveTo(x,y); ctx.lineTo(x+TILE_W/2,y+TILE_H/2); ctx.lineTo(x,y+TILE_H); ctx.lineTo(x-TILE_W/2,y+TILE_H/2);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 0.5; ctx.stroke();
}

export function drawGrid() {
  const BASE_C = 12, BASE_R = 12;
  const halfR = BASE_RANGE[(state.base.level-1)] || 6;
  for (let c = 0; c < GRID_COLS; c++) for (let r = 0; r < GRID_ROWS; r++) {
    const dist = Math.sqrt((c-BASE_C)*(c-BASE_C)+(r-BASE_R)*(r-BASE_R));
    const gridDist = Math.max(Math.abs(c-BASE_C), Math.abs(r-BASE_R));
    const inRange  = gridDist <= halfR;
    const a = Math.max(0, 0.15 - dist*0.006);
    if (inRange) drawTile(c,r,`rgba(10,25,70,${a})`,`rgba(30,80,160,${a*1.5})`);
    else         drawTile(c,r,`rgba(14,14,20,0.08)`,`rgba(50,50,68,0.1)`);
  }
}

export function drawRangeBorder() {
  const BASE_C = 12, BASE_R = 12;
  const halfR  = BASE_RANGE[(state.base.level-1)] || 6;
  const wTL = gridToWorld(BASE_C-halfR, BASE_R-halfR);
  const wTR = gridToWorld(BASE_C+halfR, BASE_R-halfR);
  const wBR = gridToWorld(BASE_C+halfR, BASE_R+halfR);
  const wBL = gridToWorld(BASE_C-halfR, BASE_R+halfR);
  const top    = { x:wTL.x,             y:wTL.y            };
  const right  = { x:wTR.x+TILE_W/2,   y:wTR.y+TILE_H/2   };
  const bottom = { x:wBR.x,             y:wBR.y+TILE_H     };
  const left   = { x:wBL.x-TILE_W/2,   y:wBL.y+TILE_H/2   };
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(top.x,top.y); ctx.lineTo(right.x,right.y);
  ctx.lineTo(bottom.x,bottom.y); ctx.lineTo(left.x,left.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(40,220,100,0.9)'; ctx.lineWidth = 2;
  ctx.setLineDash([]); ctx.stroke();
  ctx.restore();
}

export function drawBase(col, row) {
  const {x,y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;
  const { baseHovered } = canvasState;

  if (baseHovered) {
    const t = performance.now() / 600;
    const pulse = 0.3+0.15*Math.sin(t);
    const glowR = ctx.createRadialGradient(cx,cy,0,cx,cy,72);
    glowR.addColorStop(0, `rgba(80,200,255,${pulse})`);
    glowR.addColorStop(1, 'rgba(80,200,255,0)');
    ctx.fillStyle = glowR; ctx.beginPath(); ctx.arc(cx,cy,72,0,Math.PI*2); ctx.fill();
  }

  ctx.beginPath(); ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy); ctx.closePath();
  ctx.fillStyle = '#102040'; ctx.fill();
  ctx.strokeStyle = baseHovered ? '#8ff' : '#4af';
  ctx.lineWidth = baseHovered ? 2 : 1; ctx.stroke();

  const tw=18, th=36;
  ctx.fillStyle = '#1a3a6e'; ctx.fillRect(cx-tw/2,cy-th,tw,th);
  ctx.strokeStyle = baseHovered ? '#8ff' : '#4af'; ctx.lineWidth=1; ctx.strokeRect(cx-tw/2,cy-th,tw,th);
  const grd = ctx.createRadialGradient(cx,cy-th-4,1,cx,cy-th-4,14);
  grd.addColorStop(0,'rgba(80,200,255,0.9)'); grd.addColorStop(1,'rgba(80,200,255,0)');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx,cy-th-4,14,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx,cy-th); ctx.lineTo(cx,cy-th-12);
  ctx.strokeStyle='#4af'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy-th-12,3,0,Math.PI*2); ctx.fillStyle='#8ff'; ctx.fill();
  ctx.fillStyle='#4af'; ctx.font='bold 9px Orbitron,monospace'; ctx.textAlign='center'; ctx.fillText('BASE',cx,cy-th-20);

  if (baseHovered) {
    const label = `⬡ BASE STATION  LV ${state.base.level}`;
    const labelY = cy-th-36;
    ctx.font = 'bold 11px Orbitron,monospace';
    const tw2 = ctx.measureText(label).width;
    const pad = 7;
    ctx.fillStyle = 'rgba(4,12,35,0.88)';
    ctx.strokeStyle = '#4af'; ctx.lineWidth = 1;
    const rx = cx-tw2/2-pad, ry = labelY-13, rw = tw2+pad*2, rh = 18;
    ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8ff'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, labelY);
  }
}

export function drawNode(node) {
  const [col,row] = node.gr;
  const {x,y} = gridToIso(col, row);
  const cx = x, cy = y+TILE_H/2;
  const def = RESOURCE_DEFS[node.type];
  if (node.minLevel > state.base.level) return;
  const BASE_C2 = 12, BASE_R2 = 12;
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

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath(); ctx.moveTo(cx,cy-TILE_H/2); ctx.lineTo(cx+TILE_W/2,cy); ctx.lineTo(cx,cy+TILE_H/2); ctx.lineTo(cx-TILE_W/2,cy); ctx.closePath();
  ctx.fillStyle = `rgba(${hexToRgb(def.color)},0.15)`; ctx.fill();
  ctx.strokeStyle = def.color; ctx.lineWidth = isHighlighted ? 1.5 : 0.8; ctx.stroke();

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
    ctx.fillStyle = def.color+Math.floor(alpha*255).toString(16).padStart(2,'0'); ctx.fill();
    ctx.strokeStyle = '#fff3'; ctx.lineWidth=0.5; ctx.stroke();
  }
  ctx.fillStyle = def.color; ctx.font='9px Share Tech Mono,monospace'; ctx.textAlign='center';
  ctx.fillText(def.label.toUpperCase(), cx, cy-34);
  ctx.restore();
}

export function drawShipWorld(ship) {
  const size = ship.type==='freighter'?10:ship.type==='hauler'?8:7;
  const col  = ship.type==='freighter'?'#ffaa30':ship.type==='hauler'?'#80d0ff':ship.type==='swift'?'#ff80c0':'#60d090';
  const isSelected = state.selectedShip === ship.id;

  ctx.save();
  ctx.translate(ship.x, ship.y);

  if (isSelected) {
    const pulse = 0.5+0.5*Math.sin(Date.now()/350);
    ctx.beginPath(); ctx.arc(0,0,size+8+pulse*4,0,Math.PI*2);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3+pulse*0.45; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0,0,size+3,0,Math.PI*2);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.5+pulse*0.3; ctx.stroke(); ctx.globalAlpha = 1;
  }

  ctx.rotate(ship.heading || 0);
  const grd = ctx.createRadialGradient(0,0,1,0,0,size+6);
  grd.addColorStop(0, col+'55'); grd.addColorStop(1, col+'00');
  ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0,0,size+6,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0,-size); ctx.lineTo(size*.6,0); ctx.lineTo(0,size*.5); ctx.lineTo(-size*.6,0); ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle='#fff6'; ctx.lineWidth=0.7; ctx.stroke();

  if (ship.status==='flying'||ship.status==='returning') {
    ctx.beginPath(); ctx.moveTo(0,size*.5); ctx.lineTo(0,size*1.8);
    const tg = ctx.createLinearGradient(0,size*.5,0,size*1.8);
    tg.addColorStop(0,col+'cc'); tg.addColorStop(1,col+'00');
    ctx.strokeStyle = tg; ctx.lineWidth = 3; ctx.stroke();
  }

  if (ship.status==='mining') {
    if (isSelected) {
      ctx.beginPath(); ctx.arc(0,0,size+4+Math.sin(Date.now()/200)*3,0,Math.PI*2);
      ctx.strokeStyle = col+'80'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(ship.x, ship.y);
    const node = state.nodes.find(n => n.id === ship.targetNode);
    if (node) {
      const nw = gridToWorld(node.gr[0], node.gr[1]);
      const ncx = nw.x, ncy = nw.y+TILE_H/2;
      const dx = ncx-ship.x, dy = ncy-ship.y;
      const dist = Math.sqrt(dx*dx+dy*dy);
      const nx = dx/dist, ny = dy/dist;
      const wobble = Math.sin(Date.now()/80)*0.12;
      const cosW = Math.cos(wobble), sinW = Math.sin(wobble);
      const bx = nx*cosW-ny*sinW, by = nx*sinW+ny*cosW;
      const beamLen   = dist*0.80;
      const beamPulse = 0.6+0.4*Math.abs(Math.sin(Date.now()/120));
      const def = RESOURCE_DEFS[node.type];
      const halo = ctx.createLinearGradient(0,0,bx*beamLen,by*beamLen);
      halo.addColorStop(0,def.color+'aa'); halo.addColorStop(1,def.color+'00');
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(bx*beamLen,by*beamLen);
      ctx.strokeStyle = halo; ctx.lineWidth = 10*beamPulse; ctx.globalAlpha = 0.18; ctx.stroke();
      const bg = ctx.createLinearGradient(0,0,bx*beamLen,by*beamLen);
      bg.addColorStop(0,def.color+'ee'); bg.addColorStop(1,def.color+'00');
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(bx*beamLen,by*beamLen);
      ctx.strokeStyle = bg; ctx.lineWidth = 5*beamPulse; ctx.globalAlpha = 0.55; ctx.stroke();
      const ig = ctx.createLinearGradient(0,0,bx*beamLen*0.7,by*beamLen*0.7);
      ig.addColorStop(0,'#ffffff'); ig.addColorStop(0.4,def.color); ig.addColorStop(1,def.color+'00');
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(bx*beamLen*0.7,by*beamLen*0.7);
      ctx.strokeStyle = ig; ctx.lineWidth = 2*beamPulse; ctx.globalAlpha = 0.9*beamPulse; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return;
  }
  ctx.restore();
}

export function render(ts) {
  if (!ctx) return;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  const shake = getShakeOffset();
  ctx.translate(W/2-cam.x*cam.zoom+shake.x, H/2-cam.y*cam.zoom+shake.y);
  ctx.scale(cam.zoom, cam.zoom);
  drawGrid();
  drawRangeBorder();
  drawRangePulses();
  const sn = [...state.nodes].sort((a,b)=>(a.gr[0]+a.gr[1])-(b.gr[0]+b.gr[1]));
  for (const n of sn) drawNode(n);
  drawBase(12, 12);
  const ss = [...state.ships].sort((a,b)=>a.y-b.y);
  for (const s of ss) drawShipWorld(s);
  drawTurrets();
  drawTurretPlacementHover();
  drawSolarFlare();
  drawComet();
  drawFloaties();
  drawNodeParticles();
  ctx.restore();
  const hint = document.getElementById('zoom-hint');
  if (hint) hint.textContent = `${Math.round(cam.zoom*100)}% · scroll to zoom · drag to pan`;
  // Update SOL clock every frame for smooth ticking
  const _dp = state.solTimer / SOL_DURATION;
  const _sh = Math.floor(_dp*24);
  const _sm = Math.floor((_dp*24*60)%60);
  const _solEl = document.getElementById('hdr-sol');
  if (_solEl) _solEl.textContent = `${state.sol} · ${String(_sh).padStart(2,'0')}:${String(_sm).padStart(2,'0')}`;
  requestAnimationFrame(render);
}
