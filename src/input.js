// ============================================================
// INPUT — canvas click/hover/pan, keyboard, touch, wheel
// ============================================================
import { state } from './state.js';
import { RESOURCE_DEFS, MINE_TIERS, getResourceTier } from './data/resources.js';
import { TILE_W, TILE_H, GRID_COLS, GRID_ROWS, BASE_COL, BASE_ROW, ZOOM_MIN, ZOOM_MAX } from './constants.js';
import { cam, gridToWorld, screenToWorld, focusOnBase, adjustZoom } from './render/camera.js';
import { W, H } from './render/renderer.js';
import { canvasState } from './render/canvasState.js';
import { addLog, fmt, tooltipEl, showTooltip, moveTooltip, hideTooltip } from './helpers.js';
import { refresh } from './ui/refresh.js';
import { renderTutPointers } from './ui/tutorial.js';
import { removeReassignTooltip } from './ui/tutorial.js';
import { cancelTurretPlacement } from './ui/turretUI.js';
import { cancelStoragePlacement, canPlaceStorageAt, getStorageAtCell, openStorageModal } from './ui/storageUI.js';
import { renderBasePanel } from './ui/basePanel.js';
import { closeRenameOverlay } from './ui/rename.js';
import { openTurretModal } from './ui/turretUI.js';
import { assignShip } from './systems/ships.js';
import { TURRET_BASE_STATS, getTurretTypeDef, getTurretStats } from './data/turrets.js';
import { getStorageFacilityStats } from './data/storage.js';
import { getCraft } from './data/crafts.js';

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

    // Node hit test
    let hit = null;
    for (const node of state.nodes) {
      const w = gridToWorld(node.gr[0], node.gr[1]);
      const dx = wx - w.x, dy = wy - (w.y + TILE_H/2);
      if (dx*dx + dy*dy < 28*28) { hit = node; break; }
    }

    // Base hover
    const bw = gridToWorld(BASE_COL, BASE_ROW);
    const bdx = wx - bw.x, bdy = wy - (bw.y + TILE_H/2);
    const onBase = bdx*bdx + bdy*bdy < 38*38;
    if (onBase !== canvasState.baseHovered) canvasState.baseHovered = onBase;

    // Placement hover
    if (state.placingTurret || state.placingStorage) {
      canvasState.turretHoverCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
      canvasState.turretHoverRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    } else {
      canvasState.turretHoverCol = -1; canvasState.turretHoverRow = -1;
    }

    const hoverCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
    const hoverRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    const hoveredStorage = getStorageAtCell(hoverCol, hoverRow);
    canvasState.storageHoverId = hoveredStorage?.id ?? null;

    // Turret hover detection
    let hoveredTurret = null;
    if (!state.placingTurret && !state.placingStorage) {
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

    if (hoveredTurret) {
      canvasState.lastHoveredNode = null;
      const hpPct    = Math.round(hoveredTurret.health / hoveredTurret.maxHealth * 100);
      const hpColor  = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
      const turretName = getTurretTypeDef(hoveredTurret.type).name;
      const tt = tooltipEl();
      tt.innerHTML = `
        <div class="tt-name">${turretName} <span style="color:#ffe066;font-size:11px;">Lv${hoveredTurret.level}</span></div>
        <div>Health: <span style="color:${hpColor}">${fmt(hoveredTurret.health)} / ${fmt(hoveredTurret.maxHealth)}</span></div>
        <div>Damage: <span style="color:#cde">${hoveredTurret.damage}</span></div>
        <div>Range: <span style="color:#cde">${hoveredTurret.range} tiles</span></div>
      `;
      tt.style.display = 'block';
      moveTooltip(e);
    } else if (hit && hit.minLevel <= state.base.level) {
      canvasState.baseHovered = false;
      const nodeTier = getResourceTier(hit.type) || 1;
      const unmineableByFleet = nodeTier > (state.highestAvailableNodeTier || 1);
      if (canvasState.lastHoveredNode !== hit.id) {
        canvasState.lastHoveredNode = hit.id;
        showTooltip(e, hit.type, { unmineableByFleet });
      } else {
        moveTooltip(e);
      }
    } else if (onBase) {
      if (canvasState.lastHoveredNode !== null) { canvasState.lastHoveredNode = null; hideTooltip(); }
    } else {
      if (canvasState.lastHoveredNode !== null) { canvasState.lastHoveredNode = null; hideTooltip(); }
      if (!hoveredTurret && !state.placingTurret && !state.placingStorage) { canvasState.turretHoverCol = -1; canvasState.turretHoverRow = -1; }
    }
  });

  canvas.addEventListener('mouseleave', () => {
    canvasState.lastHoveredNode = null; canvasState.baseHovered = false; canvasState.storageHoverId = null; hideTooltip();
  });

  // ── KEYBOARD ────────────────────────────────────────────────
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state.renamingShip || state.renamingBase) { closeRenameOverlay(); return; }
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
      if (state.placingStorage) { cancelStoragePlacement(); return; }
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
  const bw  = gridToWorld(BASE_COL, BASE_ROW);
  const bdx = wx - bw.x, bdy = wy - (bw.y + TILE_H/2);
  if (bdx*bdx + bdy*bdy < 32*32) {
    state.basePanelOpen = !state.basePanelOpen;
    if (state.basePanelOpen) {
      focusOnBase(cam.zoom);
    }
    renderBasePanel();
    renderTutPointers();
    return;
  }

  // Close base panel on click elsewhere
  if (state.basePanelOpen) {
    state.basePanelOpen = false;
    renderBasePanel();
  }

  // Storage placement mode
  if (state.placingStorage && (state.unplacedStorages > 0 || state.movingStorage)) {
    const col = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
    const row = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    const check = canPlaceStorageAt(col, row, state.movingStorage);
    if (!check.ok) { addLog(check.reason); return; }
    const stats = getStorageFacilityStats(1);
    if (state.movingStorage) {
      const storage = state.storageFacilities.find(s => s.id === state.movingStorage);
      if (storage) {
        storage.col = col;
        storage.row = row;
        addLog(`↔ ${storage.name} moved to (${col},${row}).`);
      }
    } else {
      const queue = Array.isArray(state.unplacedStorageQueue) ? state.unplacedStorageQueue : [];
      const requestedType = state.placingStorageType || queue[0] || 'storage_facility';
      const placeIdx = queue.indexOf(requestedType);
      const storageType = placeIdx >= 0 ? queue.splice(placeIdx, 1)[0] : (queue.shift() || 'storage_facility');
      state.unplacedStorages = queue.length;
      state.storageFacilities.push({
        id: Date.now(),
        type: storageType,
        name: `Storage Facility #${state.storageFacilities.length + 1}`,
        col,
        row,
        level: 1,
        health: stats.maxHealth,
        maxHealth: stats.maxHealth,
        storageCapacity: stats.storageCapacity,
        powerUsage: stats.powerUsage,
        powerCapacity: stats.powerCapacity,
        power: stats.powerCapacity,
        inventory: Object.fromEntries(Object.keys(RESOURCE_DEFS).map(k => [k, 0])),
      });
      addLog('Storage Facility placed.');
      if (state.unplacedStorages > 0) addLog(`${state.unplacedStorages} storage module(s) remaining in inventory.`);
    }
    state.placingStorage = false;
    state.placingStorageType = null;
    state.movingStorage = null;
    canvas.style.cursor = '';
    if (refresh.ui) refresh.ui();
    return;
  }

  // Turret placement mode
  if (state.placingTurret && (state.unplacedTurrets > 0 || state.movingTurret)) {
    const col = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
    const row = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return;
    if (col === BASE_COL && row === BASE_ROW) { addLog('⚠ Cannot place turret on the base.'); return; }
    const onNode   = state.nodes.some(n => n.gr[0] === col && n.gr[1] === row && n.minLevel <= state.base.level);
    if (onNode)    { addLog('⚠ Cannot place turret on a resource node.'); return; }
    const onTurret = state.turrets.some(t => t.col === col && t.row === row && t.id !== state.movingTurret);
    if (onTurret)  { addLog('⚠ A turret is already placed here.'); return; }
    const onStorage = !!getStorageAtCell(col, row);
    if (onStorage) { addLog('⚠ Cannot place turret on a storage facility tile.'); return; }

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
      state.turrets.push({ id: Date.now(), type: turretType, col, row, health: stats.maxHealth, maxHealth: stats.maxHealth, damage: stats.damage, range: stats.range, fireRate: stats.fireRate, stunDuration: stats.stunDuration, level: 1 });
      addLog(`${turretName} placed at (${col},${row})!`);
      if (state.unplacedTurrets > 0) addLog(`${state.unplacedTurrets} turret(s) remaining in inventory.`);
      state.placingTurret = false;
      state.placingTurretType = null;
      canvas.style.cursor = '';
    }
    if (refresh.ui) refresh.ui();
    return;
  }

  // Turret click
  for (const turret of state.turrets) {
    const tw  = gridToWorld(turret.col, turret.row);
    const tcx = tw.x, tcy = tw.y + TILE_H/2;
    const tdx = wx - tcx, tdy = wy - tcy;
    if (tdx*tdx + tdy*tdy < 28*28) { openTurretModal(turret.id); return; }
  }

  const clickCol = Math.round((wx / (TILE_W/2) + wy / (TILE_H/2)) / 2);
  const clickRow = Math.round((wy / (TILE_H/2) - wx / (TILE_W/2)) / 2);
  const clickedStorage = getStorageAtCell(clickCol, clickRow);
  if (clickedStorage) { openStorageModal(clickedStorage.id); return; }

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
