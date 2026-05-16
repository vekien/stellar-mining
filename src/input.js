// ============================================================
// INPUT — canvas click/hover/pan, keyboard, touch, wheel
// ============================================================
import { state } from './state.js';
import { RESOURCE_DEFS, MINE_TIERS, getResourceTier } from './data/resources.js';
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, ZOOM_MIN, ZOOM_MAX, BASE_COL, BASE_ROW, isBaseFootprintCell } from './constants.js';
import { cam, gridToWorld, screenToWorld, focusOn, focusOnBase, adjustZoom } from './render/camera.js';
import { W, H } from './render/renderer.js';
import { canvasState } from './render/canvasState.js';
import { addLog, fmt, resourceIconHtml, tooltipEl, showTooltip, moveTooltip, hideTooltip } from './helpers.js';
import { refresh } from './ui/refresh.js';
import { renderTutPointers } from './ui/tutorial.js';
import { removeReassignTooltip } from './ui/tutorial.js';
import { cancelTurretPlacement } from './ui/turretUI.js';
import { cancelStoragePlacement, canPlaceModuleAt, getModuleAtCell, getModuleAtWorld, getStorageTotalInventory, openStorageModal } from './ui/storageUI.js';
import { renderBasePanel } from './ui/basePanel.js';
import { closeRenameOverlay } from './ui/rename.js';
import { openTurretModal } from './ui/turretUI.js';
import { assignShip } from './systems/ships.js';
import { getStoragePowerUsage } from './data/storage.js';
import { TURRET_BASE_STATS, getTurretPowerCapacity, getTurretPowerUsage, getTurretTypeDef, getTurretStats } from './data/turrets.js';
import {
  createModuleInstance,
  getModuleDef,
  getPowerModuleNetworkInfo,
  getPowerNetworkState,
  getPowerFuelOutput,
  getPowerStationEffectiveOutput,
  getModuleInventoryTotal,
  getPowerResourceConsumption,
  getLabModuleNetworkInfo,
  isResearchLabModule,
  isPowerStationModule,
  isPowerPoleModule,
  isLabTowerModule,
  STORAGE_FACILITY_ID,
} from './data/modules.js';
import { getCraft } from './data/crafts.js';
import { CRASHED_SHIP_NODE_TYPE } from './data/nodes.js';
import { getBlackHoleRadiusScale } from './render/animations.js';

const BASE_CLICK_RADIUS = 52;

function isNearBase(wx, wy) {
  const baseWorld = gridToWorld(BASE_COL, BASE_ROW);
  const dx = wx - baseWorld.x;
  const dy = wy - (baseWorld.y + TILE_H / 2);
  return (dx * dx) + (dy * dy) <= (BASE_CLICK_RADIUS * BASE_CLICK_RADIUS);
}

export function initInput(canvas) {
  let isPanning   = false;
  let panStartX   = 0, panStartY = 0;
  let panCamX     = 0, panCamY   = 0;
  let mouseDownX  = 0, mouseDownY = 0;
  let didPan      = false;
  let lastTouchDist = null;

  // ── PAN / DRAG ──────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isPanning = true; didPan = false;
    mouseDownX = e.clientX; mouseDownY = e.clientY;
    panStartX = e.clientX; panStartY = e.clientY;
    panCamX = cam.x; panCamY = cam.y;
    canvas.classList.add('dragging');
  });

  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    const dx = e.clientX - mouseDownX, dy = e.clientY - mouseDownY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { didPan = true; state.followShip = null; }
    cam.x = cam.targetX = panCamX - (e.clientX - panStartX) / cam.zoom;
    cam.y = cam.targetY = panCamY - (e.clientY - panStartY) / cam.zoom;
  });

  window.addEventListener('mouseup', e => {
    if (!isPanning) { isPanning = false; return; }
    isPanning = false;
    canvas.classList.remove('dragging');
    if (!didPan) handleCanvasClick(canvas, e.clientX, e.clientY);
  });

  // ── TOUCH ───────────────────────────────────────────────────
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      isPanning = true;
      panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY;
      panCamX = cam.x; panCamY = cam.y;
    }
    if (e.touches.length === 2) {
      isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx*dx + dy*dy);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && isPanning) {
      cam.x = cam.targetX = panCamX - (e.touches[0].clientX - panStartX) / cam.zoom;
      cam.y = cam.targetY = panCamY - (e.touches[0].clientY - panStartY) / cam.zoom;
    }
    if (e.touches.length === 2 && lastTouchDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom + (dist - lastTouchDist) * 0.01));
      lastTouchDist = dist;
    }
  }, { passive: true });

  canvas.addEventListener('touchend', () => { isPanning = false; lastTouchDist = null; });

  // ── WHEEL ZOOM ──────────────────────────────────────────────
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wb = screenToWorld(mx, my, W, H);
    cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom + (e.deltaY < 0 ? 0.1 : -0.1)));
    const wa = screenToWorld(mx, my, W, H);
    cam.x = cam.targetX += wb.x - wa.x;
    cam.y = cam.targetY += wb.y - wa.y;
  }, { passive: false });

  // ── CANVAS HOVER ────────────────────────────────────────────
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - W/2) / cam.zoom + cam.x;
    const wy = (e.clientY - rect.top  - H/2) / cam.zoom + cam.y;

    const blackHole = state.blackHole;
    const blackHoleScale = getBlackHoleRadiusScale(blackHole);
    const blackHoleRadius = blackHole && blackHoleScale > 0 ? (blackHole.radiusWorld || 0) * blackHoleScale : 0;
    const hoveringBlackHole = blackHoleRadius > 0 && (((wx - blackHole.wx) * (wx - blackHole.wx)) + ((wy - blackHole.wy) * (wy - blackHole.wy)) <= (blackHoleRadius * blackHoleRadius));

    // Node hit test
    let hit = null;
    for (const node of state.nodes) {
      const w = gridToWorld(node.gr[0], node.gr[1]);
      const dx = wx - w.x, dy = wy - (w.y + TILE_H/2);
      if (dx*dx + dy*dy < 28*28) { hit = node; break; }
    }

    // Placement hover
    if (state.placingTurret || state.placingModule) {
      canvasState.turretHoverCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
      canvasState.turretHoverRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    } else {
      canvasState.turretHoverCol = -1; canvasState.turretHoverRow = -1;
    }

    const hoverCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
    const hoverRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    const hoveredStorage = getModuleAtWorld(wx, wy) || getModuleAtCell(hoverCol, hoverRow);
    canvasState.storageHoverId = hoveredStorage?.id ?? null;

    const onBase = !hoveredStorage && (isBaseFootprintCell(hoverCol, hoverRow) || isNearBase(wx, wy));
    if (onBase !== canvasState.baseHovered) canvasState.baseHovered = onBase;

    // Turret hover detection
    let hoveredTurret = null;
    if (!state.placingTurret && !state.placingModule) {
      for (const turret of state.turrets) {
        const tw = gridToWorld(turret.col, turret.row);
        const tdx = wx - tw.x, tdy = wy - (tw.y + TILE_H/2);
        if (tdx*tdx + tdy*tdy < 28*28) { hoveredTurret = turret; break; }
      }
      if (hoveredTurret) {
        canvasState.turretHoverCol = hoveredTurret.col;
        canvasState.turretHoverRow = hoveredTurret.row;
      }
    }

    if (hoveringBlackHole) {
      canvasState.lastHoveredNode = null;
      const tt = tooltipEl();
      tt.innerHTML = `
        <div class="tt-name">● Black Hole</div>
        <div>Radius: <span style="color:#cde">${blackHole.rangeTiles} tiles</span></div>
        <div>Effect: <span style="color:#ffb6ff">Distorts spacetime — affects ship travel velocity</span></div>
      `;
      tt.style.display = 'block';
      moveTooltip(e);
    } else if (hoveredTurret) {
      canvasState.lastHoveredNode = null;
      const hpPct    = Math.round(hoveredTurret.health / hoveredTurret.maxHealth * 100);
      const hpColor  = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
      const turretName = getTurretTypeDef(hoveredTurret.type).name;
      const turretOffline = (hoveredTurret.power || 0) <= 0;
      const tt = tooltipEl();
      tt.innerHTML = `
        <div class="tt-name">${turretName} <span style="color:#ffe066;font-size:11px;">Lv${hoveredTurret.level}</span></div>
        <div>Health: <span style="color:${hpColor}">${fmt(hoveredTurret.health)} / ${fmt(hoveredTurret.maxHealth)}</span></div>
        <div>Status: <span style="color:${turretOffline ? '#ff8a8a' : '#8ff0c4'}">${turretOffline ? 'No Power' : 'Online'}</span></div>
        <div>Power: <span style="color:#cde">${fmt(Math.round(hoveredTurret.power || 0))} / ${fmt(hoveredTurret.powerCapacity || 0)}</span></div>
        <div>Damage: <span style="color:#cde">${hoveredTurret.damage}</span></div>
        <div>Range: <span style="color:#cde">${hoveredTurret.range} tiles</span></div>
      `;
      tt.style.display = 'block';
      moveTooltip(e);
    } else if (hoveredStorage && (isPowerStationModule(hoveredStorage) || isPowerPoleModule(hoveredStorage) || isLabTowerModule(hoveredStorage))) {
      canvasState.lastHoveredNode = null;
      const tt = tooltipEl();
      const powerInfo = getPowerModuleNetworkInfo(hoveredStorage.id, state.modules, state.turrets);
      const labInfo = isLabTowerModule(hoveredStorage) ? getLabModuleNetworkInfo(hoveredStorage.id, state.modules, state.nodes, state.base.level) : null;
      const linkedStations = powerInfo.stations.length + (isPowerStationModule(hoveredStorage) ? 1 : 0);
      const linkedPoles = powerInfo.poles.length + (isPowerPoleModule(hoveredStorage) ? 1 : 0);
      const linkedStorages = powerInfo.storages.length;
      const linkedTurrets = powerInfo.turrets.length;
      const powerSummary = [
        linkedStations > 0 ? `${linkedStations}x Power Stations` : '',
        linkedPoles > 0 ? `${linkedPoles}x Poles` : '',
        linkedStorages > 0 ? `${linkedStorages}x Powered Buildings` : '',
        linkedTurrets > 0 ? `${linkedTurrets}x Turrets` : '',
      ].filter(Boolean).join(' • ') || 'No linked modules';
      if (isPowerStationModule(hoveredStorage)) {
        const fuelType = hoveredStorage.fuelResource || 'iron';
        const fuelOutput = getPowerFuelOutput(fuelType);
        const fuelName = RESOURCE_DEFS[fuelType]?.label || 'Fuel';
        const loadCost = getPowerResourceConsumption(hoveredStorage) * (linkedStorages + linkedTurrets);
        tt.innerHTML = `
          <div class="tt-name">${hoveredStorage.name}</div>
          <div>Power Source: <span style="color:#d9c3ff">${fuelName}</span></div>
          <div>Current Load: <span style="color:#ffe066">${linkedStorages} buildings · ${loadCost} ${fuelName}/s</span></div>
          <div>Selected Fuel: <span style="color:#cde">${fmt(hoveredStorage.inventory?.[fuelType] || 0)} / ${fmt(hoveredStorage.resourceCapacity || 0)}</span></div>
          <div>Output: <span style="color:#cde">+${fuelOutput} power/second per storage</span></div>
          <div style="margin-top:4px;color:#d9c3ff;">${powerSummary}</div>
        `;
      } else if (isLabTowerModule(hoveredStorage)) {
        const linkedLabs = labInfo?.labs.length || 0;
        const linkedTowers = (labInfo?.towers.length || 0) + 1;
        const linkedResources = labInfo?.resources.length || 0;
        tt.innerHTML = `
          <div class="tt-name">${hoveredStorage.name}</div>
          <div>Relay Range: <span style="color:#8ff0c4">${hoveredStorage.relayRange} tiles</span></div>
          <div>Node Tier: <span style="color:#8ff0c4">Tier ${hoveredStorage.level || 1}</span></div>
          <div>Linked Labs: <span style="color:#cde">${linkedLabs}</span></div>
          <div>Linked Nodes: <span style="color:#cde">${linkedResources}</span></div>
          <div style="margin-top:4px;color:#8ff0c4;">${linkedTowers}x Lab Towers${linkedLabs ? ` • ${linkedLabs}x Research Labs` : ''}</div>
        `;
      } else {
        const networkState = getPowerNetworkState(state.modules, state.turrets);
        const totalLoad = powerInfo.storages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0) + powerInfo.turrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
        const activeStations = [hoveredStorage, ...powerInfo.stations].filter((station) => isPowerStationModule(station) && (station.health || 0) > 0 && (station.inventory?.[station.fuelResource || 'iron'] || 0) > 0);
        const totalOutput = activeStations.reduce((sum, station) => sum + getPowerStationEffectiveOutput(station, ((networkState.stationLinkedStorages.get(station.id) || []).length + (networkState.stationLinkedTurrets.get(station.id) || []).length)), 0);
        const netDelta = totalOutput - totalLoad;
        const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
        const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
        tt.innerHTML = `
          <div class="tt-name">${hoveredStorage.name}</div>
          <div>Relay Range: <span style="color:#cde">${hoveredStorage.relayRange} tiles</span></div>
          <div>Output: <span style="color:#cde">${totalOutput.toFixed(1).replace(/\.0$/, '')}/s</span></div>
          <div>Load: <span style="color:#ffe066">${totalLoad.toFixed(1).replace(/\.0$/, '')}/s</span></div>
          <div>Status: <span style="color:${statusColor}">${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}/s ${statusLabel}</span></div>
          <div style="margin-top:4px;color:#d9c3ff;">${powerSummary}</div>
        `;
      }
      tt.style.display = 'block';
      moveTooltip(e);
    } else if (hoveredStorage) {
      canvasState.lastHoveredNode = null;
      const tt = tooltipEl();
      const hpPct = Math.round((hoveredStorage.health / Math.max(1, hoveredStorage.maxHealth)) * 100);
      const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
      const inventoryRows = Object.entries(hoveredStorage.inventory || {})
        .filter(([, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, amount]) => `${resourceIconHtml(type, 13, 'margin-right:5px;position:relative;top:-1px;')}${RESOURCE_DEFS[type].label}: ${fmt(amount)}`)
        .join('<br>');
      tt.innerHTML = `
        <div class="tt-name">${hoveredStorage.name}</div>
        <div>Health: <span style="color:${hpColor}">${fmt(hoveredStorage.health)} / ${fmt(hoveredStorage.maxHealth)}</span></div>
        <div>${isResearchLabModule(hoveredStorage) ? 'Intake' : 'Storage'}: <span style="color:#cde">${isResearchLabModule(hoveredStorage) ? 'Consumes delivered materials' : `${fmt(getStorageTotalInventory(hoveredStorage))} / ${fmt(hoveredStorage.storageCapacity)}`}</span></div>
        <div>Power Usage: <span style="color:#cde">${getStoragePowerUsage(hoveredStorage).toFixed(1).replace(/\.0$/, '')}/s</span></div>
        <div style="margin-top:4px;color:#d9c3ff;">Inventory</div>
        <div style="color:#cde;line-height:1.4;">${inventoryRows || 'Empty'}</div>
      `;
      tt.style.display = 'block';
      moveTooltip(e);
    } else if (hit && hit.minLevel <= state.base.level) {
      canvasState.baseHovered = false;
      canvasState.lastHoveredNode = hit.id;
      if (hit.type === CRASHED_SHIP_NODE_TYPE) {
        showTooltip(e, hit.type);
      } else {
        const nodeTier = getResourceTier(hit.type) || 1;
        const unmineableByFleet = nodeTier > (state.highestAvailableNodeTier || 1);
        showTooltip(e, hit.type, { unmineableByFleet });
      }
    } else if (onBase) {
      if (canvasState.lastHoveredNode !== null) canvasState.lastHoveredNode = null;
      hideTooltip();
    } else {
      if (canvasState.lastHoveredNode !== null) canvasState.lastHoveredNode = null;
      hideTooltip();
      if (!hoveredTurret && !state.placingTurret && !state.placingModule) { canvasState.turretHoverCol = -1; canvasState.turretHoverRow = -1; }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    canvasState.lastHoveredNode = null; canvasState.baseHovered = false; canvasState.storageHoverId = null; hideTooltip();
  });

  // ── KEYBOARD ────────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.renamingShip || state.renamingBase || state.renamingStorage || state.renamingTurret) { closeRenameOverlay(); return; }
      const sellOverlay = document.getElementById('sell-overlay');
      if (sellOverlay && sellOverlay.classList.contains('show')) {
        if (window.closeSellOverlay) window.closeSellOverlay();
        return;
      }
      const hdrOverlay = document.getElementById('hdr-modal-overlay');
      if (hdrOverlay && hdrOverlay.classList.contains('open')) {
        if (window.dismissHdrModal) window.dismissHdrModal();
        return;
      }
      if (state.placingTurret) { cancelTurretPlacement(); return; }
      if (state.placingModule) { cancelStoragePlacement(); return; }
      if (state.basePanelOpen) { state.basePanelOpen = false; renderBasePanel(); return; }
      if (state.selectedShip) {
        state.pendingAssign = null;
        state.selectedShip  = null;
        state.followShip    = null;
        canvas.style.cursor = '';
        removeReassignTooltip();
        if (refresh.ui) refresh.ui();
      }
    }
  });
}

// ── CANVAS CLICK HANDLER ──────────────────────────────────────
function handleCanvasClick(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left, sy = clientY - rect.top;
  const wx = (sx - W/2) / cam.zoom + cam.x;
  const wy = (sy - H/2) / cam.zoom + cam.y;

  // Check base click
  const baseCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
  const baseRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
  const clickedStorage = getModuleAtWorld(wx, wy) || getModuleAtCell(baseCol, baseRow);
  if (!clickedStorage && (isBaseFootprintCell(baseCol, baseRow) || isNearBase(wx, wy))) {
    state.basePanelOpen = !state.basePanelOpen;
    if (state.basePanelOpen) {
      focusOnBase(cam.zoom);
    }
    renderBasePanel();
    renderTutPointers();
    return;
  }

  if (clickedStorage) {
    const modulePos = gridToWorld(clickedStorage.col, clickedStorage.row);
    focusOn(modulePos.x, modulePos.y, cam.zoom);
    openStorageModal(clickedStorage.id);
    return;
  }

  // Close base panel on click elsewhere
  if (state.basePanelOpen) {
    state.basePanelOpen = false;
    renderBasePanel();
  }

  // Storage placement mode
  if (state.placingModule && (state.unplacedModules > 0 || state.movingModule)) {
    const col = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
    const row = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    const moduleType = state.placingModuleType || STORAGE_FACILITY_ID;
    const check = canPlaceModuleAt(moduleType, col, row, state.movingModule);
    if (!check.ok) { addLog(check.reason); return; }
    if (state.movingModule) {
      const module = state.modules.find(entry => entry.id === state.movingModule);
      if (module) {
        module.col = col;
        module.row = row;
        addLog(`↔ ${module.name} moved to (${col},${row}).`);
      }
    } else {
      const queue = Array.isArray(state.unplacedModuleQueue) ? state.unplacedModuleQueue : [];
      const requestedType = state.placingModuleType || queue[0] || STORAGE_FACILITY_ID;
      const placeIdx = queue.indexOf(requestedType);
      const placedType = placeIdx >= 0 ? queue.splice(placeIdx, 1)[0] : (queue.shift() || STORAGE_FACILITY_ID);
      state.unplacedModules = queue.length;
      const countOfType = state.modules.filter(entry => entry.type === placedType).length + 1;
      state.modules.push(createModuleInstance(placedType, { id: Date.now(), col, row, index: countOfType }));
      addLog(`${getModuleDef(placedType).name} placed.`);
      if (state.unplacedModules > 0) addLog(`${state.unplacedModules} module(s) remaining in inventory.`);
    }
    state.placingModule = false;
    state.placingModuleType = null;
    state.movingModule = null;
    canvas.style.cursor = '';
    if (refresh.header) refresh.header();
    if (refresh.ui) refresh.ui();
    return;
  }

  // Turret placement mode
  if (state.placingTurret && (state.unplacedTurrets > 0 || state.movingTurret)) {
    const col = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
    const row = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
    if (isBaseFootprintCell(col, row)) { addLog('⚠ Cannot place turret on the base.'); return; }
    const onNode   = state.nodes.some(n => n.gr[0] === col && n.gr[1] === row && n.minLevel <= state.base.level);
    if (onNode)    { addLog('⚠ Cannot place turret on a resource node.'); return; }
    const onTurret = state.turrets.some(t => t.col === col && t.row === row && t.id !== state.movingTurret);
    if (onTurret)  { addLog('⚠ A turret is already placed here.'); return; }
    const onStorage = !!getModuleAtCell(col, row);
    if (onStorage) { addLog('⚠ Cannot place turret on a module tile.'); return; }

    if (state.movingTurret) {
      const turret = state.turrets.find(t => t.id === state.movingTurret);
      if (turret) { turret.col = col; turret.row = row; addLog(`↔ Turret moved to (${col},${row}).`); }
      state.movingTurret = null;
      state.placingTurret = false;
      state.placingTurretType = null;
      canvas.style.cursor = '';
    } else {
      const queue = Array.isArray(state.unplacedTurretQueue) ? state.unplacedTurretQueue : [];
      const requestedType = state.placingTurretType || queue[0] || 'turret';
      const placeIdx = queue.indexOf(requestedType);
      const turretType = placeIdx >= 0 ? queue.splice(placeIdx, 1)[0] : (queue.shift() || 'turret');
      state.unplacedTurrets = queue.length;
      const turretName = getCraft('turrets', turretType)?.name || 'Turret';
      const stats = getTurretStats(turretType, 1);
      state.turrets.push({
        id: Date.now(),
        name: turretName,
        type: turretType,
        col,
        row,
        health: stats.maxHealth,
        maxHealth: stats.maxHealth,
        damage: stats.damage,
        range: stats.range,
        fireRate: stats.fireRate,
        stunDuration: stats.stunDuration,
        level: 1,
        powerUsage: getTurretPowerUsage(turretType, 1),
        powerCapacity: getTurretPowerCapacity({ type: turretType, level: 1 }),
        power: getTurretPowerCapacity({ type: turretType, level: 1 }),
      });
      addLog(`${turretName} placed at (${col},${row})!`);
      if (state.unplacedTurrets > 0) addLog(`${state.unplacedTurrets} turret(s) remaining in inventory.`);
      state.placingTurret = false;
      state.placingTurretType = null;
      canvas.style.cursor = '';
    }
    if (refresh.header) refresh.header();
    if (refresh.ui) refresh.ui();
    return;
  }

  // Turret click
  for (const turret of state.turrets) {
    const tw  = gridToWorld(turret.col, turret.row);
    const tcx = tw.x, tcy = tw.y + TILE_H/2;
    const tdx = wx - tcx, tdy = wy - tcy;
    if (tdx*tdx + tdy*tdy < 28*28) {
      focusOn(tcx, tcy, cam.zoom);
      openTurretModal(turret.id);
      return;
    }
  }

  const clickCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
  const clickRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);

  if (!state.pendingAssign) return;

  // Node assignment hit test
  for (const node of state.nodes) {
    if (node.minLevel > state.base.level) continue;
    const w   = gridToWorld(node.gr[0], node.gr[1]);
    const cx2 = w.x, cy2 = w.y + TILE_H/2;
    const dx  = wx - cx2, dy = wy - cy2;
    if (dx*dx + dy*dy < 28*28) {
      const ship = state.ships.find(s => s.id === state.pendingAssign);
      if (!ship) { state.pendingAssign = null; if (refresh.ui) refresh.ui(); return; }
      if (node.type === CRASHED_SHIP_NODE_TYPE) {
        state.pendingAssign = null;
        state.selectedShip  = null;
        canvas.style.cursor = '';
        removeReassignTooltip();
        assignShip(ship, node);
        return;
      }
      const accessible = [];
      for (let t = 1; t <= ship.mineTier; t++) accessible.push(...MINE_TIERS[t].resources);
      if (!accessible.includes(node.type)) {
        const needTier = Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(node.type))?.[0] || '?';
        addLog(`⚠ ${ship.name} needs Tier ${needTier} to mine ${RESOURCE_DEFS[node.type].label}`);
        return;
      }
      state.pendingAssign = null;
      state.selectedShip  = null;
      canvas.style.cursor = '';
      removeReassignTooltip();
      assignShip(ship, node);
      return;
    }
  }

  // Clicked map but not a resource node: clear current ship selection
  if (state.selectedShip !== null || state.pendingAssign !== null) {
    state.selectedShip = null;
    state.pendingAssign = null;
    canvas.style.cursor = '';
    removeReassignTooltip();
    if (refresh.ui) refresh.ui();
  }
}
