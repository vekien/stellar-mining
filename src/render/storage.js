// ============================================================
// MODULE RENDERING
// ============================================================
import { TILE_W, TILE_H } from '../constants.js';
import { gridToIso } from './camera.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import { STORAGE_FACILITY_ID, RESEARCH_LAB_ID, POWER_STATION_ID, POWER_POLE_ID, getModuleDef, getModuleFootprintCells, getModuleFootprintHalf, moduleContainsCell, isStorageModule, isResearchLabModule, isPowerStationModule, getNoFuelNetworkIds, getPowerNetworkState, hasPowerStationFuel } from '../data/modules.js';
import { canPlaceModuleAt } from '../ui/storageUI.js';

let ctx = null;
export function setStorageCtx(c) { ctx = c; }
const storageImage = new Image();
storageImage.src = 'assets/images/buildings/storage.png';
const storageHoverImage = new Image();
storageHoverImage.src = 'assets/images/buildings/storage_hover.png';
const labImage = new Image();
labImage.src = 'assets/images/buildings/lab.png';
const powerImage = new Image();
powerImage.src = 'assets/images/buildings/power.png';
const powerHoverImage = new Image();
powerHoverImage.src = 'assets/images/buildings/power_hover.png';
const powerPoleImage = new Image();
powerPoleImage.src = 'assets/images/buildings/power_pole.png';
const powerPoleHoverImage = new Image();
powerPoleHoverImage.src = 'assets/images/buildings/power_pole_hover.png';
const noPowerImage = new Image();
noPowerImage.src = 'assets/images/buildings/no-power.png';

function getModuleSprite(module, hovered) {
  const defs = {
    [STORAGE_FACILITY_ID]: {
      normal: storageImage,
      hover: storageHoverImage,
      width: 150,
      height: 150,
      offsetY: 31,
      shadow: hovered ? 10 : 8,
    },
    [RESEARCH_LAB_ID]: {
      normal: labImage,
      hover: labImage,
      width: 150,
      height: 150,
      offsetY: 31,
      shadow: hovered ? 10 : 8,
    },
    [POWER_STATION_ID]: {
      normal: powerImage,
      hover: powerHoverImage,
      width: 150,
      height: 150,
      offsetY: 31,
      shadow: hovered ? 10 : 8,
    },
    [POWER_POLE_ID]: {
      normal: powerPoleImage,
      hover: powerPoleHoverImage,
      width: 70,
      height: 92,
      offsetY: 24,
      shadow: hovered ? 8 : 5,
    },
  }[module.type];

  if (!defs) return null;
  const image = hovered && defs.hover.complete && defs.hover.naturalWidth > 0 ? defs.hover : defs.normal;
  if (!image.complete || image.naturalWidth <= 0) return null;
  return { ...defs, image };
}

function drawModuleSprite(module, hovered, options = {}) {
  const sprite = getModuleSprite(module, hovered);
  if (!sprite) return false;

  const { x, y } = gridToIso(module.col, module.row);
  const cx = x;
  const cy = y + TILE_H / 2;
  const imageX = cx - sprite.width / 2;
  const imageY = cy - sprite.height + sprite.offsetY;

  ctx.save();
  if (options.disabledFlash) {
    const pulse = options.disabledFlash;
    const brightness = 0.62 + (pulse * 0.2);
    ctx.filter = `grayscale(1) brightness(${brightness.toFixed(2)})`;
    ctx.globalAlpha = 0.72 + (pulse * 0.18);
  }
  ctx.shadowColor = options.shadowColor || 'rgba(80,200,255,0.14)';
  ctx.shadowBlur = sprite.shadow;
  ctx.drawImage(sprite.image, imageX, imageY, sprite.width, sprite.height);
  ctx.restore();

  if (options.overlayFill) {
    ctx.fillStyle = options.overlayFill;
    ctx.fillRect(imageX, imageY, sprite.width, sprite.height);
  }

  if (options.disabledFlash && noPowerImage.complete && noPowerImage.naturalWidth > 0) {
    const pulse = options.disabledFlash;
    const overlaySize = 64;
    const overlayX = cx - (overlaySize / 2);
    const overlayY = imageY + 8;
    ctx.save();
    ctx.globalAlpha = 0.45 + (pulse * 0.45);
    ctx.shadowColor = 'rgba(255,214,64,0.22)';
    ctx.shadowBlur = 8 + (pulse * 6);
    ctx.drawImage(noPowerImage, overlayX, overlayY, overlaySize, overlaySize);
    ctx.restore();
  }

  return true;
}

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
  const isResearchLab = isResearchLabModule(module);
  const bodyFill = noPower
    ? (flash > 0.5 ? 'rgba(255,232,96,0.98)' : 'rgba(255,214,64,0.98)')
    : isResearchLab
      ? (hovered ? 'rgba(44,92,74,0.9)' : 'rgba(30,70,56,0.86)')
      : hovered ? 'rgba(82,88,102,0.9)' : 'rgba(62,68,80,0.86)';
  const baseFill = noPower
    ? (flash > 0.5 ? 'rgba(255,222,72,0.22)' : 'rgba(255,202,50,0.32)')
    : isResearchLab
      ? (hovered ? 'rgba(42,88,68,0.72)' : 'rgba(28,64,50,0.62)')
      : hovered ? 'rgba(76,82,96,0.72)' : 'rgba(56,62,74,0.62)';
  const stroke = noPower ? '#ffe066' : isResearchLab ? (hovered ? '#8ff0c4' : '#58c98f') : hovered ? '#cdd6e4' : '#9aa7bb';
  const wallTop = noPower ? '#fff2a8' : isResearchLab ? (hovered ? '#b9f5db' : '#8fdcb8') : hovered ? '#dde4ef' : '#bcc6d6';
  const wallSide = noPower ? '#e0bb32' : isResearchLab ? (hovered ? '#3f8f6d' : '#2f7056') : hovered ? '#6f7c90' : '#566274';
  const wallOther = noPower ? '#f0cd4c' : isResearchLab ? '#285844' : '#454f5f';

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

  if (drawModuleSprite(module, hovered, {
    shadowColor: noPower ? 'rgba(255,214,64,0.18)' : 'rgba(80,200,255,0.14)',
    disabledFlash: noPower ? flash : null,
  })) {
    return;
  }

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
  ctx.fillStyle = noPower ? '#ffe066' : isResearchLab ? '#8ff0c4' : '#d9e1ec';
  ctx.font = 'bold 9px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillText(isResearchLabModule(module) ? 'RESEARCH' : 'STORAGE', cx, cy - 34);
  ctx.restore();
}

function drawPowerStationModule(module, hovered) {
  const noFuel = !hasPowerStationFuel(module) && (module.health || 0) > 0;
  const flash = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  const half = getModuleFootprintHalf(module.type || POWER_STATION_ID);
  const bodyFill = noFuel
    ? (flash > 0.5 ? 'rgba(255,198,108,0.96)' : 'rgba(255,166,72,0.96)')
    : hovered ? 'rgba(70,52,26,0.9)' : 'rgba(52,38,18,0.86)';
  const baseFill = noFuel
    ? (flash > 0.5 ? 'rgba(255,208,88,0.24)' : 'rgba(255,170,54,0.3)')
    : hovered ? 'rgba(72,56,24,0.72)' : 'rgba(52,40,18,0.62)';
  const stroke = noFuel ? '#ffe066' : hovered ? '#ffd98f' : '#d9b15a';
  const accent = noFuel ? '#fff0a8' : hovered ? '#ffe8b8' : '#f0d38a';

  const tl = gridToIso(module.col - half, module.row - half);
  const tr = gridToIso(module.col + half, module.row - half);
  const br = gridToIso(module.col + half, module.row + half);
  const bl = gridToIso(module.col - half, module.row + half);
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

  if (drawModuleSprite(module, hovered, {
    shadowColor: noFuel ? 'rgba(255,166,72,0.18)' : 'rgba(255,220,90,0.14)',
    disabledFlash: noFuel ? flash : null,
  })) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(cx, top.y + 22);
  ctx.lineTo(right.x - 32, cy - 8);
  ctx.lineTo(cx, bottom.y - 24);
  ctx.lineTo(left.x + 32, cy - 8);
  ctx.closePath();
  ctx.fillStyle = bodyFill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = noFuel ? 2.2 : 1.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 16);
  ctx.lineTo(cx + 18, cy - 16);
  ctx.lineTo(cx + 22, cy + 8);
  ctx.lineTo(cx - 22, cy + 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(122,88,18,0.92)';
  if (noFuel) ctx.fillStyle = 'rgba(108,70,18,0.95)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = accent;
  ctx.font = 'bold 9px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.fillText('POWER', cx, cy - 34);
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

  if (drawModuleSprite(module, hovered, {
    shadowColor: alert ? 'rgba(255,110,110,0.2)' : 'rgba(255,220,90,0.14)',
    disabledFlash: alert ? pulse : null,
  })) {
    return;
  }

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
    if (isStorageModule(module) || isResearchLabModule(module)) drawStorageModule(module, hovered);
    else if (isPowerStationModule(module) && (getModuleDef(module.type).footprintSize || 1) > 1) drawPowerStationModule(module, hovered);
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
