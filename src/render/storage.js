// ============================================================
// MODULE RENDERING
// ============================================================
import { TILE_W, TILE_H } from '../constants.js';
import { gridToIso } from './camera.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import { STORAGE_FACILITY_ID, POWER_POLE_ID, getModuleFootprintCells, moduleContainsCell, isStorageModule, isPowerStationModule, getNoFuelNetworkIds, getPowerNetworkState, hasPowerStationFuel } from '../data/modules.js';
import { canPlaceModuleAt } from '../ui/storageUI.js';

let ctx = null;
export function setStorageCtx(c) { ctx = c; }

function drawDiamond(col, row, fill, stroke, lineWidth = 1) {
  const { x, y } = gridToIso(col, row);
  const cx = x;
  const cy = y + TILE_H / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H / 2);
  ctx.lineTo(cx + TILE_W / 2, cy);
  ctx.lineTo(cx, cy + TILE_H / 2);
  ctx.lineTo(cx - TILE_W / 2, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  return { cx, cy };
}

function traceDiamondForRange(col, row, r) {
  const minC = col - r;
  const maxC = col + r;
  const minR = row - r;
  const maxR = row + r;
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

function drawModuleRange(module) {
  if (module.type !== POWER_POLE_ID) return;
  const range = module.relayRange || 0;
  if (range <= 0) return;
  ctx.save();
  traceDiamondForRange(module.col, module.row, range);
  ctx.fillStyle = 'rgba(255,220,90,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,120,0.28)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

export function drawPowerLinks() {
  const { activeEdges } = getPowerNetworkState(state.modules);
  if (!activeEdges.length) return;
  const byId = new Map(state.modules.map((module) => [module.id, module]));
  const noFuelIds = getNoFuelNetworkIds(state.modules);
  const pulse = 0.45 + (0.25 * (0.5 + 0.5 * Math.sin(performance.now() / 220)));
  ctx.save();
  for (const edge of activeEdges) {
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (!from || !to) continue;
    const fromIso = gridToIso(from.col, from.row);
    const toIso = gridToIso(to.col, to.row);
    const fromX = fromIso.x;
    const fromY = fromIso.y + TILE_H / 2;
    const toX = toIso.x;
    const toY = toIso.y + TILE_H / 2;
    const alert = noFuelIds.has(edge.fromId) && noFuelIds.has(edge.toId);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = alert ? `rgba(255,110,110,${0.45 + pulse})` : 'rgba(255,220,90,0.85)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = alert ? `rgba(255,210,210,${0.18 + (pulse * 0.5)})` : 'rgba(255,245,180,0.38)';
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStorageModule(module, hovered) {
  const noPower = (module.power || 0) <= 0 && (module.health || 0) > 0;
  const flash = 0.5 + 0.5 * Math.sin(performance.now() / 140);
  const bodyFill = noPower
    ? (flash > 0.5 ? 'rgba(255,232,96,0.98)' : 'rgba(255,214,64,0.98)')
    : hovered ? 'rgba(28,52,90,0.92)' : 'rgba(18,34,62,0.88)';
  const baseFill = noPower
    ? (flash > 0.5 ? 'rgba(255,222,72,0.22)' : 'rgba(255,202,50,0.32)')
    : hovered ? 'rgba(26,48,82,0.75)' : 'rgba(18,32,58,0.65)';
  const stroke = noPower ? '#ffe066' : hovered ? '#8fd2ff' : '#4a8ab0';
  const wallTop = noPower ? '#fff2a8' : hovered ? '#b8dfff' : '#7fb3d8';
  const wallSide = noPower ? '#e0bb32' : hovered ? '#4e77a6' : '#375a84';
  const wallOther = noPower ? '#f0cd4c' : '#27496f';

  const tl = gridToIso(module.col - 1, module.row - 1);
  const tr = gridToIso(module.col + 1, module.row - 1);
  const br = gridToIso(module.col + 1, module.row + 1);
  const bl = gridToIso(module.col - 1, module.row + 1);
  const top = { x: tl.x, y: tl.y };
  const right = { x: tr.x + TILE_W / 2, y: tr.y + TILE_H / 2 };
  const bottom = { x: br.x, y: br.y + TILE_H };
  const left = { x: bl.x - TILE_W / 2, y: bl.y + TILE_H / 2 };
  const center = drawDiamond(module.col, module.row, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 0);
  const cx = center.cx;
  const cy = center.cy;

  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fillStyle = baseFill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, top.y + 18);
  ctx.lineTo(right.x - 26, cy - 10);
  ctx.lineTo(cx, bottom.y - 22);
  ctx.lineTo(left.x + 26, cy - 10);
  ctx.closePath();
  ctx.fillStyle = bodyFill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = noPower ? 2.4 : 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, top.y + 18);
  ctx.lineTo(right.x - 26, cy - 10);
  ctx.lineTo(cx, cy - 28);
  ctx.lineTo(left.x + 26, cy - 10);
  ctx.closePath();
  ctx.fillStyle = wallTop;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(left.x + 26, cy - 10);
  ctx.lineTo(cx, cy - 28);
  ctx.lineTo(cx, bottom.y - 22);
  ctx.lineTo(left.x + 26, cy + 6);
  ctx.closePath();
  ctx.fillStyle = wallSide;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(right.x - 26, cy - 10);
  ctx.lineTo(cx, cy - 28);
  ctx.lineTo(cx, bottom.y - 22);
  ctx.lineTo(right.x - 26, cy + 6);
  ctx.closePath();
  ctx.fillStyle = wallOther;
  ctx.fill();
  ctx.stroke();

  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * 10, cy - 24);
    ctx.lineTo(cx + i * 10, cy - 4);
    ctx.strokeStyle = '#17314e';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.save();
  ctx.fillStyle = noPower ? '#ffe066' : '#8fd2ff';
  ctx.font = 'bold 9px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillText('STORAGE', cx, cy - 34);
  ctx.restore();
}

function drawSingleTileModule(module, hovered) {
  const isPole = module.type === 'power_pole';
  const noFuelIds = getNoFuelNetworkIds(state.modules);
  const alert = (isPole && noFuelIds.has(module.id)) || (isPowerStationModule(module) && !hasPowerStationFuel(module));
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  const fill = alert
    ? (hovered ? `rgba(220,90,110,${0.82 + (pulse * 0.12)})` : `rgba(178,52,78,${0.78 + (pulse * 0.1)})`)
    : hovered ? 'rgba(255,224,110,0.94)' : 'rgba(242,196,54,0.92)';
  const glow = alert
    ? (hovered ? `rgba(255,156,156,${0.2 + (pulse * 0.18)})` : `rgba(255,110,110,${0.12 + (pulse * 0.14)})`)
    : hovered ? 'rgba(255,236,160,0.4)' : 'rgba(255,214,90,0.26)';
  const stroke = alert ? (hovered ? '#ffe2e2' : '#ffb0b0') : hovered ? '#fff1b8' : '#ffd85a';
  const accent = alert ? (hovered ? '#fff4f4' : '#ffdede') : hovered ? '#fff8da' : '#fff0a8';
  const { cx, cy } = drawDiamond(module.col, module.row, glow, stroke, 1.4);

  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx + 16, cy - 2);
  ctx.lineTo(cx, cy + 14);
  ctx.lineTo(cx - 16, cy - 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  if (isPole) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 22);
    ctx.lineTo(cx, cy + 8);
    ctx.moveTo(cx - 10, cy - 14);
    ctx.lineTo(cx + 10, cy - 14);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 10);
    ctx.lineTo(cx + 8, cy - 10);
    ctx.lineTo(cx + 10, cy + 2);
    ctx.lineTo(cx - 10, cy + 2);
    ctx.closePath();
      ctx.fillStyle = 'rgba(122,88,18,0.92)';
    if (alert) ctx.fillStyle = 'rgba(108,22,40,0.95)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.save();
  ctx.fillStyle = accent;
  ctx.font = 'bold 8px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.fillText(isPole ? 'POLE' : 'POWER', cx, cy - 24);
  ctx.restore();
}

export function drawStorageFacilities() {
  if (!ctx) return;
  for (const module of state.modules) {
    const hovered = canvasState.storageHoverId === module.id;
    const showRange = !state.placingModule && module.type === POWER_POLE_ID && (hovered || state.selectedModule === module.id);
    if (showRange) drawModuleRange(module);
    if (isStorageModule(module)) drawStorageModule(module, hovered);
    else drawSingleTileModule(module, hovered);
  }
}

export function drawStoragePlacementHover() {
  if (!ctx || !state.placingModule) return;
  const col = canvasState.turretHoverCol;
  const row = canvasState.turretHoverRow;
  if (col < 0 || row < 0) return;
  const moduleType = state.placingModuleType || STORAGE_FACILITY_ID;
  const valid = canPlaceModuleAt(moduleType, col, row, state.movingModule).ok;
  for (const cell of getModuleFootprintCells(moduleType, col, row)) {
    drawDiamond(
      cell.col,
      cell.row,
      valid ? 'rgba(80,200,80,0.18)' : 'rgba(220,80,80,0.18)',
      valid ? '#4d8' : '#f44',
      cell.col === col && cell.row === row ? 1.8 : 1.1,
    );
  }
}

export function getStorageHoverAtCell(col, row) {
  return state.modules.find(module => moduleContainsCell(module, col, row)) || null;
}
