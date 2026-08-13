// ============================================================
// MODULE RENDERING
// ============================================================
import { TILE_W, TILE_H } from '../constants.js';
import { gridToIso, isInView, isSegmentInView } from './camera.js';
import { state } from '../state.js';
import { canvasState } from './canvasState.js';
import { STORAGE_FACILITY_ID, RESEARCH_LAB_ID, POWER_STATION_ID, POWER_POLE_ID, LAB_TOWER_ID, DRONE_LAB_ID, CONTRACT_CENTER_ID, getModuleDef, getModuleStats, getModuleFootprintCells, getModuleFootprintHalf, moduleContainsCell, isStorageModule, isResearchLabModule, isPowerStationModule, isLabTowerModule, isDroneLabModule, isContractCenterModule, getNoFuelNetworkIds, getPowerNetworkState, getLabNetworkState, getLabTowerLinkedNodes, hasPowerStationFuel, getNetworkVersion } from '../data/modules.js';
import { canPlaceModuleAt } from '../ui/storageUI.js';

let ctx = null;
export function setStorageCtx(c) { ctx = c; }
const storageImage = new Image();
storageImage.src = 'assets/images/buildings/storage.png';
const storageHoverImage = new Image();
storageHoverImage.src = 'assets/images/buildings/storage_hover.png';
const labImage = new Image();
labImage.src = 'assets/images/buildings/lab.png';
const labPoleImage = new Image();
labPoleImage.src = 'assets/images/buildings/lab_pole.png';
const labPoleHoverImage = new Image();
labPoleHoverImage.src = 'assets/images/buildings/lab_pol_hover.png';
const powerImage = new Image();
powerImage.src = 'assets/images/buildings/power.png';
const powerHoverImage = new Image();
powerHoverImage.src = 'assets/images/buildings/power_hover.png';
const powerPoleImage = new Image();
powerPoleImage.src = 'assets/images/buildings/power_pole.png';
const powerPoleHoverImage = new Image();
powerPoleHoverImage.src = 'assets/images/buildings/power_pole_hover.png';

const droneLabImage = new Image();
droneLabImage.src = 'assets/images/buildings/drone_lab.png';
const droneLabHoverImage = new Image();
droneLabHoverImage.src = 'assets/images/buildings/drone_lab_hover.png';
const contractsImage = new Image();
contractsImage.src = 'assets/images/buildings/contracts.png';
const contractsHoverImage = new Image();
contractsHoverImage.src = 'assets/images/buildings/contracts_hover.png';

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
    [CONTRACT_CENTER_ID]: {
      normal: contractsImage,
      hover: contractsHoverImage,
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
      width: 92,
      height: 92,
      offsetY: 24,
      shadow: hovered ? 8 : 5,
    },
    [LAB_TOWER_ID]: {
      normal: labPoleImage,
      hover: labPoleHoverImage,
      width: 92,
      height: 92,
      offsetY: 24,
      shadow: hovered ? 8 : 5,
    },
    [DRONE_LAB_ID]: {
      normal: droneLabImage,
      hover: droneLabHoverImage,
      width: 150,
      height: 150,
      offsetY: 31,
      shadow: hovered ? 10 : 8,
    },
  }[module.type];

  if (!defs) return null;
  const image = hovered && defs.hover.complete && defs.hover.naturalWidth > 0 ? defs.hover : defs.normal;
  if (!image.complete || image.naturalWidth <= 0) return null;
  return { ...defs, image };
}

function drawMsStatusIcon(cx, cy, iconName, {
  size = 22,
  pulse = 0.5,
  color = '#ff6a3a',
  glow = 'rgba(255, 90, 40, 0.95)',
} = {}) {
  ctx.save();
  ctx.font = `400 ${size}px "Material Symbols Outlined"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (ctx.fontKerning !== undefined) ctx.fontKerning = 'normal';
  const alpha = 0.85 + pulse * 0.15;

  // Soft bloom under the glyph
  ctx.globalAlpha = 0.28 + pulse * 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2);
  ctx.fill();

  // Strong outer glow
  ctx.globalAlpha = alpha;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18 + pulse * 14;
  ctx.fillStyle = color;
  ctx.fillText(iconName, cx, cy);

  // Hot core pass
  ctx.shadowBlur = 8 + pulse * 5;
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.globalAlpha = 0.4 + pulse * 0.2;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(iconName, cx, cy);

  // Crisp colored glyph on top
  ctx.shadowBlur = 12 + pulse * 8;
  ctx.shadowColor = glow;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillText(iconName, cx, cy);
  ctx.restore();
}

function drawDestroyedIcon(cx, cy, size = 22, pulse = 0.5) {
  drawMsStatusIcon(cx, cy, 'mode_heat', {
    size,
    pulse,
    color: '#ff6a3a',
    glow: 'rgba(255, 90, 30, 1)',
  });
}

function drawNoPowerIcon(cx, cy, size = 22, pulse = 0.5) {
  drawMsStatusIcon(cx, cy, 'power_off', {
    size,
    pulse,
    color: '#ffe066',
    glow: 'rgba(255, 220, 80, 1)',
  });
}

function moduleNeedsRepair(module) {
  const maxH = module?.maxHealth || 0;
  const hp = module?.health || 0;
  return maxH > 0 && hp > 0 && hp < maxH - 0.5;
}

/** Health bar above building when damaged (below 100%). */
function drawModuleHealthBar(module) {
  const maxH = module?.maxHealth || 0;
  const hp = Math.max(0, module?.health || 0);
  if (maxH <= 0 || hp >= maxH - 0.5) return;
  const { x, y } = gridToIso(module.col, module.row);
  const cx = x;
  // Sit above the footprint / sprite
  const barY = y + TILE_H / 2 - 52;
  const barW = 36;
  const barH = 4;
  const pct = Math.max(0, Math.min(1, hp / maxH));
  const fill = pct > 0.5 ? '#4d8' : pct > 0.25 ? '#fa4' : '#f44';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(cx - barW / 2, barY, barW, barH);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - barW / 2 + 0.5, barY + 0.5, barW - 1, barH - 1);
  if (pct > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(cx - barW / 2, barY, barW * pct, barH);
  }
  ctx.restore();
}

function drawModuleSprite(module, hovered, options = {}) {
  const sprite = getModuleSprite(module, hovered);
  if (!sprite) return false;
  const showEffects = state.settings?.showVisualEffects !== false;
  const destroyed = !!options.destroyed;

  const { x, y } = gridToIso(module.col, module.row);
  const cx = x;
  const cy = y + TILE_H / 2;
  const imageX = cx - sprite.width / 2;
  const imageY = cy - sprite.height + sprite.offsetY;

  ctx.save();
  if (destroyed) {
    const pulse = options.disabledFlash || 0.5;
    ctx.filter = `grayscale(1) brightness(${(0.5 + pulse * 0.12).toFixed(2)})`;
    ctx.globalAlpha = 0.62 + pulse * 0.1;
  } else if (options.disabledFlash) {
    const pulse = options.disabledFlash;
    const brightness = 0.62 + (pulse * 0.2);
    ctx.filter = `grayscale(1) brightness(${brightness.toFixed(2)})`;
    ctx.globalAlpha = 0.72 + (pulse * 0.18);
  }
  ctx.shadowColor = destroyed
    ? 'rgba(40,40,40,0.35)'
    : (options.shadowColor || 'rgba(80,200,255,0.14)');
  ctx.shadowBlur = showEffects ? sprite.shadow : 0;
  ctx.drawImage(sprite.image, imageX, imageY, sprite.width, sprite.height);
  ctx.restore();

  if (options.overlayFill) {
    ctx.fillStyle = options.overlayFill;
    ctx.fillRect(imageX, imageY, sprite.width, sprite.height);
  }

  const pulse = options.disabledFlash || (0.5 + 0.5 * Math.sin(performance.now() / 220));
  if (destroyed) {
    drawDestroyedIcon(cx, imageY + sprite.height * 0.4, 22, pulse);
  } else if (showEffects && options.disabledFlash) {
    drawNoPowerIcon(cx, imageY + sprite.height * 0.38, 22, pulse);
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
  if (module.type !== POWER_POLE_ID && module.type !== LAB_TOWER_ID) return;
  const range = module.relayRange || 0;
  if (range <= 0) return;
  const isLabTower = module.type === LAB_TOWER_ID;
  ctx.save();
  traceDiamondForRange(module.col, module.row, range);
  ctx.fillStyle = isLabTower ? 'rgba(90,255,170,0.1)' : 'rgba(255,220,90,0.1)';
  ctx.fill();
  ctx.strokeStyle = isLabTower ? 'rgba(110,255,190,0.3)' : 'rgba(255,226,120,0.28)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

function getHoveredNetworkEntityId() {
  if (canvasState.storageHoverId != null) return canvasState.storageHoverId;
  if (state.selectedModule != null) return state.selectedModule;
  if (state.selectedTurret != null) return state.selectedTurret;
  const hc = canvasState.turretHoverCol;
  const hr = canvasState.turretHoverRow;
  if (Number.isFinite(hc) && Number.isFinite(hr) && hc >= 0 && hr >= 0) {
    const t = (state.turrets || []).find((x) => x.col === hc && x.row === hr);
    if (t) return t.id;
  }
  return null;
}

function lineOpacity(key, fallback = 1) {
  const v = state.settings?.[key];
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0.05, Math.min(1, v));
}

export function drawPowerLinks() {
  const always = state.settings?.showPowerLines !== false;
  const onHover = state.settings?.showPowerLinesOnHover === true;
  if (!always && !onHover) return;
  if (!state.modules.length && !state.turrets.length) return;
  const hoverId = getHoveredNetworkEntityId();
  if (!always && onHover && hoverId == null) return;

  const { activeEdges, entityById, turretIds } = getPowerNetworkState(state.modules, state.turrets);
  if (!activeEdges.length) return;
  const byId = entityById;
  const noFuelIds = getNoFuelNetworkIds(state.modules, state.turrets);
  // Rank nodes for flow direction: station (2) > pole (1) > consumer/turret (0)
  const flowRank = (id, ent) => {
    if (!ent) return 0;
    if (isPowerStationModule(ent)) return 2;
    if (ent.type === POWER_POLE_ID) return 1;
    if (turretIds.has(id)) return 0;
    return 0;
  };
  const pulse = state.settings?.showVisualEffects !== false ? 0.45 + (0.25 * (0.5 + 0.5 * Math.sin(performance.now() / 220))) : 0.45;
  const opacity = lineOpacity('powerLineOpacity', 1);
  // Continuous offset (no modulo) — same smooth marquee as lab node links
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -performance.now() / 70;
  for (let i = 0; i < activeEdges.length; i++) {
    const edge = activeEdges[i];
    if (!always && onHover) {
      if (edge.fromId !== hoverId && edge.toId !== hoverId) continue;
    }
    let fromId = edge.fromId;
    let toId = edge.toId;
    let from = byId.get(fromId);
    let to = byId.get(toId);
    if (!from || !to) continue;
    // Normalize: higher rank (station/pole) draws first so dashes flow outward
    if (flowRank(fromId, from) < flowRank(toId, to)) {
      const swapE = from; from = to; to = swapE;
      const swapI = fromId; fromId = toId; toId = swapI;
    }
    const fromIso = gridToIso(from.col, from.row);
    const toIso = gridToIso(to.col, to.row);
    const fromX = fromIso.x;
    const fromY = fromIso.y + TILE_H / 2;
    const toX = toIso.x;
    const toY = toIso.y + TILE_H / 2;
    if (!isSegmentInView(fromX, fromY, toX, toY)) continue;
    const alert = noFuelIds.has(fromId) && noFuelIds.has(toId);
    const turretLink = turretIds.has(fromId) || turretIds.has(toId);
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = alert ? `rgba(255,110,110,${0.45 + pulse})` : 'rgba(255,220,90,0.85)';
    ctx.lineWidth = turretLink ? 0.8 : 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = alert ? `rgba(255,210,210,${0.18 + (pulse * 0.5)})` : 'rgba(255,245,180,0.38)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawLabLinks() {
  const always = state.settings?.showResearchLines !== false;
  const onHover = state.settings?.showResearchLinesOnHover === true;
  if (!always && !onHover) return;
  if (!state.modules.length) return;
  const hoverId = getHoveredNetworkEntityId();
  if (!always && onHover && hoverId == null) return;

  const { activeEdges, nodeEdges } = getLabNetworkState(state.modules, state.nodes, state.base.level);
  if (!activeEdges.length && !nodeEdges.length) return;
  const byId = getPowerNetworkState(state.modules, state.turrets).entityById;
  const pulse = state.settings?.showVisualEffects !== false ? 0.45 + (0.25 * (0.5 + 0.5 * Math.sin(performance.now() / 240))) : 0.45;
  const opacity = lineOpacity('researchLineOpacity', 1);
  ctx.save();
  ctx.globalAlpha = opacity;
  for (let i = 0; i < activeEdges.length; i++) {
    const edge = activeEdges[i];
    if (!always && onHover) {
      if (edge.fromId !== hoverId && edge.toId !== hoverId) continue;
    }
    const from = byId.get(edge.fromId);
    const to = byId.get(edge.toId);
    if (!from || !to) continue;
    const fromIso = gridToIso(from.col, from.row);
    const toIso = gridToIso(to.col, to.row);
    const fromX = fromIso.x;
    const fromY = fromIso.y + TILE_H / 2;
    const toX = toIso.x;
    const toY = toIso.y + TILE_H / 2;
    if (!isSegmentInView(fromX, fromY, toX, toY)) continue;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = `rgba(88,201,143,${0.78 + (pulse * 0.12)})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = `rgba(180,255,220,${0.18 + (pulse * 0.18)})`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.setLineDash([7, 5]);
  ctx.lineDashOffset = -performance.now() / 80;
  for (let i = 0; i < nodeEdges.length; i++) {
    const edge = nodeEdges[i];
    if (!always && onHover && edge.towerId !== hoverId) continue;
    const tower = byId.get(edge.towerId);
    if (!tower) continue;
    const fromIso = gridToIso(tower.col, tower.row);
    const toIso = gridToIso(edge.nodeCol, edge.nodeRow);
    const fromX = fromIso.x;
    const fromY = fromIso.y + TILE_H / 2;
    const toX = toIso.x;
    const toY = toIso.y + TILE_H / 2;
    if (!isSegmentInView(fromX, fromY, toX, toY)) continue;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = 'rgba(110,255,190,0.9)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = 'rgba(210,255,236,0.35)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStorageModule(module, hovered, phase = 'all') {
  const destroyed = (module.health || 0) <= 0;
  const noPower = !destroyed && (module.power || 0) <= 0;
  const flash = 0.5 + 0.5 * Math.sin(performance.now() / 140);
  const isResearchLab = isResearchLabModule(module);
  const bodyFill = destroyed
    ? 'rgba(70,70,74,0.88)'
    : noPower
    ? (flash > 0.5 ? 'rgba(255,232,96,0.98)' : 'rgba(255,214,64,0.98)')
    : isResearchLab
      ? (hovered ? 'rgba(44,92,74,0.9)' : 'rgba(30,70,56,0.86)')
      : hovered ? 'rgba(82,88,102,0.9)' : 'rgba(62,68,80,0.86)';
  const baseFill = destroyed
    ? 'rgba(48,48,52,0.7)'
    : noPower
    ? (flash > 0.5 ? 'rgba(255,222,72,0.22)' : 'rgba(255,202,50,0.32)')
    : isResearchLab
      ? (hovered ? 'rgba(42,88,68,0.72)' : 'rgba(28,64,50,0.62)')
      : hovered ? 'rgba(76,82,96,0.72)' : 'rgba(56,62,74,0.62)';
  const stroke = destroyed ? '#7a7a82' : noPower ? '#ffe066' : isResearchLab ? (hovered ? '#8ff0c4' : '#58c98f') : hovered ? '#cdd6e4' : '#9aa7bb';
  const wallTop = destroyed ? '#9a9aa2' : noPower ? '#fff2a8' : isResearchLab ? (hovered ? '#b9f5db' : '#8fdcb8') : hovered ? '#dde4ef' : '#bcc6d6';
  const wallSide = destroyed ? '#5a5a62' : noPower ? '#e0bb32' : isResearchLab ? (hovered ? '#3f8f6d' : '#2f7056') : hovered ? '#6f7c90' : '#566274';
  const wallOther = destroyed ? '#4a4a52' : noPower ? '#f0cd4c' : isResearchLab ? '#285844' : '#454f5f';

  const tl = gridToIso(module.col - 1, module.row - 1);
  const tr = gridToIso(module.col + 1, module.row - 1);
  const br = gridToIso(module.col + 1, module.row + 1);
  const bl = gridToIso(module.col - 1, module.row + 1);
  const top = { x: tl.x, y: tl.y };
  const right = { x: tr.x + TILE_W / 2, y: tr.y + TILE_H / 2 };
  const bottom = { x: br.x, y: br.y + TILE_H };
  const left = { x: bl.x - TILE_W / 2, y: bl.y + TILE_H / 2 };
  const { x: _cx, y: _cy } = gridToIso(module.col, module.row);
  const cx = _cx;
  const cy = _cy + TILE_H / 2;

  if (phase !== 'sprite') {
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
  }

  if (phase === 'footprint') return;

  if (drawModuleSprite(module, hovered, {
    shadowColor: destroyed ? 'rgba(40,40,40,0.3)' : noPower ? 'rgba(255,214,64,0.18)' : 'rgba(80,200,255,0.14)',
    disabledFlash: (destroyed || noPower) ? flash : null,
    destroyed,
  })) {
    return;
  }

  ctx.save();
  if (destroyed) {
    ctx.filter = 'grayscale(1) brightness(0.55)';
    ctx.globalAlpha = 0.7;
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

  ctx.fillStyle = destroyed ? '#aaa' : noPower ? '#ffe066' : isResearchLab ? '#8ff0c4' : '#d9e1ec';
  ctx.font = 'bold 9px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.fillText(isResearchLabModule(module) ? 'RESEARCH' : isDroneLabModule(module) ? 'DRONE LAB' : 'STORAGE', cx, cy - 34);
  ctx.restore();
  if (destroyed) drawDestroyedIcon(cx, cy - 16, 22, flash);
  else if (noPower) drawNoPowerIcon(cx, cy - 16, 22, flash);
}

function drawPowerStationModule(module, hovered, phase = 'all') {
  const destroyed = (module.health || 0) <= 0;
  const noFuel = !destroyed && !hasPowerStationFuel(module);
  const flash = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  const half = getModuleFootprintHalf(module.type || POWER_STATION_ID);
  const bodyFill = destroyed
    ? 'rgba(70,70,74,0.88)'
    : noFuel
    ? (flash > 0.5 ? 'rgba(255,198,108,0.96)' : 'rgba(255,166,72,0.96)')
    : hovered ? 'rgba(70,52,26,0.9)' : 'rgba(52,38,18,0.86)';
  const baseFill = destroyed
    ? 'rgba(48,48,52,0.7)'
    : noFuel
    ? (flash > 0.5 ? 'rgba(255,208,88,0.24)' : 'rgba(255,170,54,0.3)')
    : hovered ? 'rgba(72,56,24,0.72)' : 'rgba(52,40,18,0.62)';
  const stroke = destroyed ? '#7a7a82' : noFuel ? '#ffe066' : hovered ? '#ffd98f' : '#d9b15a';
  const accent = destroyed ? '#aaa' : noFuel ? '#fff0a8' : hovered ? '#ffe8b8' : '#f0d38a';

  const tl = gridToIso(module.col - half, module.row - half);
  const tr = gridToIso(module.col + half, module.row - half);
  const br = gridToIso(module.col + half, module.row + half);
  const bl = gridToIso(module.col - half, module.row + half);
  const top = { x: tl.x, y: tl.y };
  const right = { x: tr.x + TILE_W / 2, y: tr.y + TILE_H / 2 };
  const bottom = { x: br.x, y: br.y + TILE_H };
  const left = { x: bl.x - TILE_W / 2, y: bl.y + TILE_H / 2 };
  const { x: _cx2, y: _cy2 } = gridToIso(module.col, module.row);
  const cx = _cx2;
  const cy = _cy2 + TILE_H / 2;

  if (phase !== 'sprite') {
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
  }

  if (phase === 'footprint') return;

  if (drawModuleSprite(module, hovered, {
    shadowColor: destroyed ? 'rgba(40,40,40,0.3)' : noFuel ? 'rgba(255,166,72,0.18)' : 'rgba(255,220,90,0.14)',
    disabledFlash: (destroyed || noFuel) ? flash : null,
    destroyed,
  })) {
    return;
  }

  ctx.save();
  if (destroyed) {
    ctx.filter = 'grayscale(1) brightness(0.55)';
    ctx.globalAlpha = 0.7;
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
  if (destroyed) ctx.fillStyle = 'rgba(60,60,64,0.95)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = 'bold 9px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.fillText('POWER', cx, cy - 34);
  ctx.restore();
  if (destroyed) drawDestroyedIcon(cx, cy - 16, 22, flash);
  else if (noFuel) drawNoPowerIcon(cx, cy - 16, 22, flash);
}

function drawSingleTileModule(module, hovered, phase = 'all', noFuelIds = null) {
  const isPole = module.type === 'power_pole';
  const isLabTower = module.type === LAB_TOWER_ID;
  const destroyed = (module.health || 0) <= 0;
  const alertIds = noFuelIds || getNoFuelNetworkIds(state.modules, state.turrets);
  const alert = !destroyed && ((isPole && alertIds.has(module.id)) || (isPowerStationModule(module) && !hasPowerStationFuel(module)));
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
  const fill = destroyed
    ? 'rgba(90,90,96,0.88)'
    : alert
    ? (hovered ? `rgba(220,90,110,${0.82 + (pulse * 0.12)})` : `rgba(178,52,78,${0.78 + (pulse * 0.1)})`)
    : isLabTower ? (hovered ? 'rgba(110,238,170,0.96)' : 'rgba(76,201,143,0.92)') : hovered ? 'rgba(255,224,110,0.94)' : 'rgba(242,196,54,0.92)';
  const glow = destroyed
    ? 'rgba(60,60,66,0.55)'
    : alert
    ? (hovered ? `rgba(255,156,156,${0.2 + (pulse * 0.18)})` : `rgba(255,110,110,${0.12 + (pulse * 0.14)})`)
    : isLabTower ? (hovered ? 'rgba(160,255,214,0.38)' : 'rgba(88,201,143,0.24)') : hovered ? 'rgba(255,236,160,0.4)' : 'rgba(255,214,90,0.26)';
  const stroke = destroyed ? '#7a7a82' : alert ? (hovered ? '#ffe2e2' : '#ffb0b0') : isLabTower ? (hovered ? '#d8fff0' : '#8ff0c4') : hovered ? '#fff1b8' : '#ffd85a';
  const accent = destroyed ? '#aaa' : alert ? (hovered ? '#fff4f4' : '#ffdede') : isLabTower ? (hovered ? '#effff8' : '#c7ffe7') : hovered ? '#fff8da' : '#fff0a8';
  let cx, cy;
  if (phase !== 'sprite') {
    const result = drawDiamond(module.col, module.row, glow, stroke, 1.4);
    cx = result.cx; cy = result.cy;
  } else {
    const { x, y } = gridToIso(module.col, module.row);
    cx = x; cy = y + TILE_H / 2;
  }

  if (phase === 'footprint') return;

  // Poles: alert = no power on network → show power_off (not destroyed heat icon)
  const noPowerPole = isPole && alert;
  if (drawModuleSprite(module, hovered, {
    shadowColor: destroyed ? 'rgba(40,40,40,0.3)' : alert ? 'rgba(255,110,110,0.2)' : 'rgba(255,220,90,0.14)',
    disabledFlash: (destroyed || alert) ? pulse : null,
    destroyed,
    noPower: noPowerPole || (!destroyed && alert && !isLabTower),
  })) {
    return;
  }

  ctx.save();
  if (destroyed) {
    ctx.filter = 'grayscale(1) brightness(0.55)';
    ctx.globalAlpha = 0.7;
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

  if (isPole || isLabTower) {
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
    if (destroyed) ctx.fillStyle = 'rgba(60,60,64,0.95)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.fillStyle = accent;
  ctx.font = 'bold 8px Orbitron, monospace';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur = 3;
  ctx.fillText(isLabTower ? 'LAB' : isPole ? 'POLE' : 'POWER', cx, cy - 24);
  ctx.restore();
  if (destroyed) drawDestroyedIcon(cx, cy - 12, 20, pulse);
  else if (noPowerPole || (alert && isPole)) drawNoPowerIcon(cx, cy - 12, 20, pulse);
}

function isoDepth(module) { return module.col + module.row; }

const _sortedModules = [];
let _sortedModulesVer = -1;
let _sortedModulesLen = -1;

function getSortedModules() {
  const modules = state.modules;
  const ver = getNetworkVersion();
  if (ver === _sortedModulesVer && modules.length === _sortedModulesLen && _sortedModules.length === modules.length) {
    return _sortedModules;
  }
  _sortedModules.length = 0;
  for (let i = 0; i < modules.length; i++) _sortedModules.push(modules[i]);
  _sortedModules.sort((a, b) => isoDepth(a) - isoDepth(b));
  _sortedModulesVer = ver;
  _sortedModulesLen = modules.length;
  return _sortedModules;
}

function drawModuleForPhase(module, phase, noFuelIds) {
  const { x, y } = gridToIso(module.col, module.row);
  // Always draw selected / hovered / range-preview modules even if slightly offscreen
  const forceDraw = canvasState.storageHoverId === module.id
    || state.selectedModule === module.id
    || state.movingModule === module.id;
  if (!forceDraw && !isInView(x, y + TILE_H / 2)) return;

  const hovered = canvasState.storageHoverId === module.id;
  if (phase === 'footprint') {
    const showRange = !state.placingModule && (module.type === POWER_POLE_ID || module.type === LAB_TOWER_ID) && (hovered || state.selectedModule === module.id);
    if (showRange) drawModuleRange(module);
  }
  if (isStorageModule(module) || isContractCenterModule(module) || isResearchLabModule(module) || isDroneLabModule(module)) {
    drawStorageModule(module, hovered, phase);
  } else if (isPowerStationModule(module) && (getModuleDef(module.type).footprintSize || 1) > 1) {
    drawPowerStationModule(module, hovered, phase);
  } else {
    drawSingleTileModule(module, hovered, phase, noFuelIds);
  }
  // Health bar on sprite pass only (once per building)
  if (phase === 'sprite' || phase === 'all') {
    drawModuleHealthBar(module);
  }
}

export function drawStorageFootprints() {
  if (!ctx) return;
  const modules = state.modules;
  if (!modules.length) return;
  const noFuelIds = getNoFuelNetworkIds(modules, state.turrets);
  const sorted = getSortedModules();
  for (let i = 0; i < sorted.length; i++) drawModuleForPhase(sorted[i], 'footprint', noFuelIds);
}

export function drawStorageSprites() {
  if (!ctx) return;
  const modules = state.modules;
  if (!modules.length) return;
  const noFuelIds = getNoFuelNetworkIds(modules, state.turrets);
  const sorted = getSortedModules();
  for (let i = 0; i < sorted.length; i++) drawModuleForPhase(sorted[i], 'sprite', noFuelIds);
}

export function drawStorageFacilities() {
  drawStorageFootprints();
  drawStorageSprites();
}

function drawPlacementPreviewLink(fromCol, fromRow, toCol, toRow, pulse, colors) {
  const fromIso = gridToIso(fromCol, fromRow);
  const toIso = gridToIso(toCol, toRow);
  const fromX = fromIso.x;
  const fromY = fromIso.y + TILE_H / 2;
  const toX = toIso.x;
  const toY = toIso.y + TILE_H / 2;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.setLineDash([2, 7]);
  ctx.lineDashOffset = -(performance.now() / 32) % 9;
  ctx.strokeStyle = colors.main(pulse);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.setLineDash([1, 9]);
  ctx.lineDashOffset = -(performance.now() / 24) % 10;
  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPowerPolePlacementPreview(col, row, moduleType) {
  const movingModule = state.movingModule ? state.modules.find((module) => module.id === state.movingModule) : null;
  const previewLevel = movingModule?.type === moduleType ? (movingModule.level || 1) : 1;
  const stats = getModuleStats(moduleType, previewLevel);
  const range = stats.relayRange || 0;
  if (range <= 0) return;

  ctx.save();
  traceDiamondForRange(col, row, range);
  ctx.fillStyle = 'rgba(255,220,90,0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,120,0.26)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  const pulse = 0.45 + (0.25 * (0.5 + 0.5 * Math.sin(performance.now() / 220)));
  const footprintHalf = getModuleFootprintHalf(POWER_STATION_ID);
  const colors = {
    main: (p) => `rgba(255,238,140,${0.72 + p * 0.22})`,
    glow: 'rgba(255,255,220,0.42)',
  };
  const drawPreviewLink = (toCol, toRow) => drawPlacementPreviewLink(col, row, toCol, toRow, pulse, colors);

  for (const module of state.modules) {
    if (state.movingModule && module.id === state.movingModule) continue;
    if (module.type !== POWER_POLE_ID && !isPowerStationModule(module)) continue;

    let linked = false;
    if (module.type === POWER_POLE_ID) {
      const distance = Math.max(Math.abs(col - module.col), Math.abs(row - module.row));
      linked = distance <= (range + (module.relayRange || 0));
    } else {
      for (const cell of getModuleFootprintCells(module.type, module.col, module.row)) {
        if (Math.max(Math.abs(col - cell.col), Math.abs(row - cell.row)) <= range) {
          linked = true;
          break;
        }
      }
      if (!linked) {
        const distance = Math.max(Math.abs(col - module.col), Math.abs(row - module.row));
        linked = distance <= (range + footprintHalf);
      }
    }
    if (!linked) continue;
    drawPreviewLink(module.col, module.row);
  }

  for (const module of state.modules) {
    if (state.movingModule && module.id === state.movingModule) continue;
    if (module.type === POWER_POLE_ID || isPowerStationModule(module)) continue;
    const linked = getModuleFootprintCells(module.type, module.col, module.row)
      .some((cell) => Math.max(Math.abs(col - cell.col), Math.abs(row - cell.row)) <= range);
    if (!linked) continue;
    drawPreviewLink(module.col, module.row);
  }

  for (const turret of state.turrets) {
    const linked = Math.max(Math.abs(col - turret.col), Math.abs(row - turret.row)) <= range;
    if (!linked) continue;
    drawPreviewLink(turret.col, turret.row);
  }
  ctx.restore();
}

function drawLabTowerPlacementPreview(col, row, moduleType) {
  const movingModule = state.movingModule ? state.modules.find((module) => module.id === state.movingModule) : null;
  const previewLevel = movingModule?.type === moduleType ? (movingModule.level || 1) : 1;
  const stats = getModuleStats(moduleType, previewLevel);
  const range = stats.relayRange || 0;
  if (range <= 0) return;

  ctx.save();
  traceDiamondForRange(col, row, range);
  ctx.fillStyle = 'rgba(90,255,170,0.1)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,255,190,0.3)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  const pulse = 0.45 + (0.25 * (0.5 + 0.5 * Math.sin(performance.now() / 240)));
  const colors = {
    main: (p) => `rgba(110,255,190,${0.72 + p * 0.22})`,
    glow: 'rgba(210,255,236,0.42)',
  };
  const drawPreviewLink = (toCol, toRow) => drawPlacementPreviewLink(col, row, toCol, toRow, pulse, colors);

  for (const module of state.modules) {
    if (state.movingModule && module.id === state.movingModule) continue;
    if (isLabTowerModule(module)) {
      const distance = Math.max(Math.abs(col - module.col), Math.abs(row - module.row));
      if (distance <= (range + (module.relayRange || 0))) drawPreviewLink(module.col, module.row);
      continue;
    }
    if (!isResearchLabModule(module)) continue;
    const linked = getModuleFootprintCells(module.type, module.col, module.row)
      .some((cell) => Math.max(Math.abs(col - cell.col), Math.abs(row - cell.row)) <= range);
    if (linked) drawPreviewLink(module.col, module.row);
  }

  const previewTower = {
    type: LAB_TOWER_ID,
    col,
    row,
    level: previewLevel,
    relayRange: range,
    health: 1,
  };
  for (const node of getLabTowerLinkedNodes(previewTower, state.nodes, state.base.level)) {
    drawPreviewLink(node.gr[0], node.gr[1]);
  }
  ctx.restore();
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
  if (moduleType === POWER_POLE_ID) drawPowerPolePlacementPreview(col, row, moduleType);
  else if (moduleType === LAB_TOWER_ID) drawLabTowerPlacementPreview(col, row, moduleType);
}

export function getStorageHoverAtCell(col, row) {
  return state.modules.find(module => moduleContainsCell(module, col, row)) || null;
}
