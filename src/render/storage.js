// ============================================================
// STORAGE FACILITY RENDERING
// ============================================================
import { TILE_W, TILE_H } from '../constants.js';
import { gridToIso } from './camera.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import { getStorageFootprintCells, storageContainsCell } from '../data/storage.js';
import { canPlaceStorageAt } from '../ui/storageUI.js';

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

export function drawStorageFacilities() {
  if (!ctx) return;
  for (const storage of state.storageFacilities) {
    const hovered = canvasState.storageHoverId === storage.id;
    const hpPct = (storage.health || 0) / Math.max(1, storage.maxHealth || 1);
    const noPower = (storage.power || 0) <= 0 && (storage.health || 0) > 0;
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

    const tl = gridToIso(storage.col - 1, storage.row - 1);
    const tr = gridToIso(storage.col + 1, storage.row - 1);
    const br = gridToIso(storage.col + 1, storage.row + 1);
    const bl = gridToIso(storage.col - 1, storage.row + 1);
    const top = { x: tl.x, y: tl.y };
    const right = { x: tr.x + TILE_W / 2, y: tr.y + TILE_H / 2 };
    const bottom = { x: br.x, y: br.y + TILE_H };
    const left = { x: bl.x - TILE_W / 2, y: bl.y + TILE_H / 2 };
    const center = drawDiamond(storage.col, storage.row, 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 0);
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
    ctx.fillText(noPower ? 'NO POWER' : 'DEPOT', cx, cy - 34);
    ctx.restore();
  }
}

export function drawStoragePlacementHover() {
  if (!ctx || !state.placingStorage) return;
  const col = canvasState.turretHoverCol;
  const row = canvasState.turretHoverRow;
  if (col < 0 || row < 0) return;
  const valid = canPlaceStorageAt(col, row, state.movingStorage).ok;
  for (const cell of getStorageFootprintCells(col, row)) {
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
  return state.storageFacilities.find(storage => storageContainsCell(storage, col, row)) || null;
}
