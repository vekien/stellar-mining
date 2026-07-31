// ============================================================
// MAIN — boot, game loop, resize
// ============================================================
import { state, loadGame, saveGame } from './state.js';
import { generateNodes } from './data/nodes.js';
import { MINE_TIERS } from './data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from './data/crafts.js';
import { BASE_COL, BASE_ROW } from './constants.js';
import { CRASHED_SHIP_NODE_TYPE } from './data/nodes.js';
import { SOL_DURATION } from './data/sol.js';
import { setStateRef, hideTooltip, openLogHistory, closeLogHistory, refreshLogUI, fmt } from './helpers.js';
import './ui/tippy.js';
import { cam, focusOnBase, nodeWorldPos, BASE_POS } from './render/camera.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
} from './ui/floatingWindow.js';
import { initRenderer, resizeRenderer, render, setOnCameraMove, setRenderFps, invalidateNodeSortCache, W, H } from './render/renderer.js';
import { initStars, resizeStars, buildStarData, tickShootingStars, setStarsEnabled } from './render/stars.js';
import {
  tickFloaties, tickSolarFlare, tickBlackHole, tickComet,
  tickScreenShake, tickRangePulses, tickNodeParticles, tickCombatBeams, tickEmpBlasts,
} from './render/animations.js';
import { scheduleNextEvent, tickSOL, rollMarketDemands } from './systems/sol.js';
import { fireRandomEvent } from './systems/events.js';
import { tickAdmiral, showTransmissionMessage, showOnce } from './ui/transmissions.js';
import { tickShip, tickEvents, flushTickEvents, spawnShip } from './systems/ships.js';
import { tickCombat } from './systems/combat.js';
import { tickDrone, spawnDrone } from './systems/drones.js';
import './systems/research.js';
import { getMaxShield } from './systems/research.js';
import { SHIELD_REGEN_INTERVAL_S, SHIELD_REGEN_PER_PURCHASE_PER_TICK, AUTO_REGEN_HP_PER_PURCHASE } from './data/research.js';
import { refresh } from './ui/refresh.js';
import { renderUI, updateHeader, updateHeaderCraft, initRefresh } from './ui/ui.js';
import { renderActionPanel, patchSelectedShipModal, getShipStatusMeta } from './ui/fleet.js';
import { renderBasePanel } from './ui/basePanel.js';
import { openHdrPanel, closeHdrPanel, dismissHdrModal, handleBasePanelOverlayClick, refreshHdrPanelIfOpen, patchStatsPanel } from './ui/panels.js';
import { removeReassignTooltip, renderTutPointers } from './ui/tutorial.js';
import { toggleTrackCraft, refreshTrackButtons, renderCraftTracker } from './ui/craftTracker.js';
import { initInput } from './input.js';
import { initDevPanel } from './ui/devPanel.js';
import './ui/storageUI.js';
import { NPCS } from './data/npcs.js';
import { getStoragePowerUsage } from './data/storage.js';
import {
  isPoweredBuildingModule,
  isPowerStationModule,
  getLabNetworkState,
  getPowerNetworkState,
  getPowerResourceConsumption,
  getPowerStationEffectiveOutput,
  getDepotModules,
  getEntityListVersion,
} from './data/modules.js';

let _baseDestroyedNoticeShown = false;
let _storageOfflineNoticeSol = null;

function hasOfflineStorage() {
  return state.modules.some(storage => isPoweredBuildingModule(storage) && ((storage.power || 0) <= 0 || (storage.health || 0) <= 0));
}

function showStartupInfrastructureWarnings() {
  if ((state.base.health || 0) <= 0) {
    _baseDestroyedNoticeShown = true;
    showTransmissionMessage(NPCS.doran.transmissionLines.base_destroyed, 18, 'doran');
    return;
  }
  if (hasOfflineStorage() && _storageOfflineNoticeSol !== state.sol) {
    _storageOfflineNoticeSol = state.sol;
    showTransmissionMessage(NPCS.doran.transmissionLines.storage_no_power, 18, 'doran');
  }
}

// ── Canvas + contexts ─────────────────────────────────────────
const canvas  = document.getElementById('main-canvas');
const starsC  = document.getElementById('stars-canvas');
const ctx     = canvas.getContext('2d');
const starsCtx = starsC.getContext('2d');

// ── Resize ───────────────────────────────────────────────────
function resize() {
  const wrap = document.getElementById('canvas-wrap');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  canvas.width = w; canvas.height = h;
  starsC.width = w; starsC.height = h;
  resizeRenderer(w, h);
  resizeStars(w, h);
}
window.addEventListener('resize', resize);

// ── State ref injection ───────────────────────────────────────
setStateRef(state);

// ── Init subsystems ───────────────────────────────────────────
initRenderer(ctx, canvas.width, canvas.height);
initStars(starsCtx, canvas.width, canvas.height);
initRefresh();
initInput(canvas);
initDevPanel();
setOnCameraMove(renderTutPointers);

// ── Node init ─────────────────────────────────────────────────
function initNodes() {
  if (!Number.isFinite(state.worldSeed)) {
    state.worldSeed = Math.floor(Math.random() * 2147483647);
  }
  state.nodes = generateNodes(BASE_COL, BASE_ROW, state.worldSeed);
  invalidateNodeSortCache();
}

// ── Boot sequence ─────────────────────────────────────────────
resize();
const loaded = loadGame();
setStarsEnabled(state.settings?.showBackgroundStars !== false);
setRenderFps(state.settings?.renderFps ?? 45);
initNodes();
if (window.syncShipCraftTimers) window.syncShipCraftTimers();
if (!loaded) spawnShip('scout');

// Schedule first event if not already scheduled
if (state.nextEventSol === null) scheduleNextEvent();

// Show about window for first-time players
if (!state.shownAboutWindow) {
  state.shownAboutWindow = true;
  saveGame();
  document.getElementById('about-overlay').classList.add('show');
}

// Ensure a market boost exists from the very first SOL
if (!state.marketBoost) {
  rollMarketDemands();
} else if (!state.marketBoost.multiplier) {
  state.marketBoost.multiplier = 1.5;
}

// Normalise ships missing mineTier (e.g. from old saves)
for (const s of state.ships) {
  if (!s.mineTier || !MINE_TIERS[s.mineTier]) s.mineTier = 1;
}

focusOnBase(2.0, { snap: true });
updateHeader();
showStartupInfrastructureWarnings();

const crashedShipNodes = state.nodes.filter((node) => node.type === CRASHED_SHIP_NODE_TYPE);
if (crashedShipNodes.length > 0) {
  const [col, row] = crashedShipNodes[0].gr;
  setTimeout(() => showOnce('zoe_crashed_ship_detected', NPCS.zoe.transmissionLines.crashed_ship_detected(col, row), 20, 'zoe'), 1400);
  // Spawn one drone per crashed ship, staggered so they don't all materialise at once
  crashedShipNodes.forEach((node, i) => {
    setTimeout(() => spawnDrone(node, 'crashed_ship'), 2200 + i * 600);
  });
}

// Re-dispatch ships that had a target node when the game was saved.
// Stagger launch so they do not all fire at once on load.
let _redispatchAccumDelay = 0;
for (const ship of state.ships) {
  if (ship.targetNode !== null) {
    const node = state.nodes.find(n => n.id === ship.targetNode);
    if (node) {
      ship.status = 'idle';
      _redispatchAccumDelay += 50 + Math.random() * 50;
      const delay = Math.round(_redispatchAccumDelay);
      setTimeout(() => {
        if (ship.targetNode === null) return;
        const latestNode = state.nodes.find(n => n.id === ship.targetNode);
        if (!latestNode) { ship.targetNode = null; return; }
        ship.status = 'flying';
        const pos = nodeWorldPos(latestNode);
        ship.destX = pos.x;
        ship.destY = pos.y - 20;
      }, delay);
    } else {
      ship.targetNode = null;
    }
  }
}

// Tutorial / banner setup
if (state.ships.some(s => s.targetNode !== null)) {
  if (state.tutStep < 2) state.tutStep = 2;
} else if (state.tutStep === 0) {
  const aboutOverlay = document.getElementById('about-overlay');
  const aboutIsOpen  = aboutOverlay?.classList.contains('show');
  if (aboutIsOpen) {
    // Defer mission briefing until about is closed
    aboutOverlay.addEventListener('closeAbout', () => {
      const banner = document.getElementById('tutorial-banner');
      if (banner && state.tutStep === 0) banner.classList.add('show');
    }, { once: true });
  } else {
    const banner = document.getElementById('tutorial-banner');
    if (banner) banner.classList.add('show');
  }
}

// ── Sidebar events ────────────────────────────────────────────
let sidebarHovered = false;
let overlayHovered = false;  // base-panel-overlay + hdr-modal
document.getElementById('sidebar').addEventListener('mouseenter', () => sidebarHovered = true);
document.getElementById('sidebar').addEventListener('mouseleave', () => { sidebarHovered = false; hideTooltip(); });
document.getElementById('base-panel-overlay').addEventListener('mouseenter', () => overlayHovered = true);
document.getElementById('base-panel-overlay').addEventListener('mouseleave', () => overlayHovered = false);
// hdr windows are pointer-events:all; overlay itself is non-blocking

document.getElementById('sidebar').addEventListener('mousedown', e => {
  const interactive = e.target.closest('.ship-card, button, input, select, .tab, .sell-btn-s, .filter-btn, .upgrade-row, #tab-content, #action-panel, #ship-modal, label');
  if (interactive) {
    dismissHdrModal();
    window.dismissBasePanel && window.dismissBasePanel();
  }
});

// Expose header panel handlers for HTML onclick
window.openHdrPanel  = openHdrPanel;
window.closeHdrPanel = closeHdrPanel;
window.dismissHdrModal = dismissHdrModal;
window.handleBasePanelOverlayClick = handleBasePanelOverlayClick;

// New game / about helpers
window.promptNewGame  = () => document.getElementById('modal-overlay').classList.add('show');
window.closeModal     = () => document.getElementById('modal-overlay').classList.remove('show');
window.confirmNewGame = () => { try { localStorage.removeItem('stellarMiningCo_v1'); } catch(e) {} location.reload(); };
window.openAbout      = () => {
  document.getElementById('about-overlay').classList.add('show');
  renderTutPointers();
};
window.closeAbout     = () => {
  const el = document.getElementById('about-overlay');
  el.classList.remove('show');
  el.dispatchEvent(new Event('closeAbout'));
  renderTutPointers();
};
window.openLogHistory = openLogHistory;
window.toggleTrackCraft = (kind, id) => { toggleTrackCraft(kind, id); };
window.closeLogHistory = closeLogHistory;
const SETTINGS_LAYOUT_KEY = 'settings';
let _settingsDragInit = false;

function initSettingsWindow() {
  if (_settingsDragInit) return;
  const overlay = document.getElementById('settings-overlay');
  const box = document.getElementById('settings-box');
  if (!overlay || !box) return;
  initFloatingDrag(box, overlay, {
    handleSelector: '.settings-drag-handle',
    layoutKey: SETTINGS_LAYOUT_KEY,
    isActive: () => overlay.classList.contains('show'),
  });
  _settingsDragInit = true;
}

window.openSettings   = () => {
  const overlay = document.getElementById('settings-overlay');
  const box = document.getElementById('settings-box');
  const s = state.settings || {};
  const setChk = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };
  const setSlider = (id, valId, pct01) => {
    const pct = Math.round(Math.max(0.1, Math.min(1, pct01 ?? 1)) * 100);
    const el = document.getElementById(id);
    const lab = document.getElementById(valId);
    if (el) el.value = String(pct);
    if (lab) lab.textContent = `${pct}%`;
  };
  setChk('setting-show-grid', s.showGrid !== false);
  setChk('setting-bg-stars', s.showBackgroundStars !== false);
  setChk('setting-visual-effects', s.showVisualEffects !== false);
  setChk('setting-camera-shake', s.showCameraShake !== false);
  setChk('setting-focus-events', s.focusOnEvents !== false);
  setChk('setting-power-lines', s.showPowerLines !== false);
  setChk('setting-power-lines-hover', s.showPowerLinesOnHover === true);
  setChk('setting-research-lines', s.showResearchLines !== false);
  setChk('setting-research-lines-hover', s.showResearchLinesOnHover === true);
  setSlider('setting-power-line-opacity', 'setting-power-line-opacity-val', s.powerLineOpacity);
  setSlider('setting-research-line-opacity', 'setting-research-line-opacity-val', s.researchLineOpacity);
  const selFps = document.getElementById('setting-fps');
  if (selFps) selFps.value = String(s.renderFps ?? 45);
  initSettingsWindow();
  if (overlay) overlay.classList.add('show');
  if (box && overlay) {
    bringFloatingToFront(box);
    const place = () => centerFloatingWindow(overlay, box, SETTINGS_LAYOUT_KEY);
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
  }
};
window.closeSettings  = () => {
  const overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.classList.remove('show');
};
window.toggleShowGrid = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showGrid = !!enabled;
};
window.toggleBackgroundStars = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showBackgroundStars = !!enabled;
  setStarsEnabled(state.settings.showBackgroundStars);
};
window.toggleVisualEffects = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showVisualEffects = !!enabled;
};
window.toggleCameraShake = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showCameraShake = !!enabled;
};
window.toggleFocusOnEvents = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.focusOnEvents = !!enabled;
};
window.togglePowerLines = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showPowerLines = !!enabled;
};
window.togglePowerLinesOnHover = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showPowerLinesOnHover = !!enabled;
};
window.setPowerLineOpacity = (pct) => {
  if (!state.settings) state.settings = {};
  const n = Math.max(10, Math.min(100, Number(pct) || 100));
  state.settings.powerLineOpacity = n / 100;
  const lab = document.getElementById('setting-power-line-opacity-val');
  if (lab) lab.textContent = `${n}%`;
};
window.toggleResearchLines = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showResearchLines = !!enabled;
};
window.toggleResearchLinesOnHover = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showResearchLinesOnHover = !!enabled;
};
window.setResearchLineOpacity = (pct) => {
  if (!state.settings) state.settings = {};
  const n = Math.max(10, Math.min(100, Number(pct) || 100));
  state.settings.researchLineOpacity = n / 100;
  const lab = document.getElementById('setting-research-line-opacity-val');
  if (lab) lab.textContent = `${n}%`;
};
window.setFpsSetting = (fps) => {
  if (!state.settings) state.settings = {};
  state.settings.renderFps = Number(fps);
  setRenderFps(state.settings.renderFps);
};
window.switchTab      = function(tab) {
  dismissHdrModal();
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (refresh.ui) refresh.ui();
};

// ── Passive tick timers ───────────────────────────────────────
let _shieldRegenTimer = 0;  // accumulates toward shield regen interval
let _autoRegenTimer   = 0;  // accumulates toward 1 s
let _storagePowerTimer = 0;

// ── Game loop ─────────────────────────────────────────────────
let lastTick = performance.now();

function gameLoop() {
  const now = performance.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;
  tickEvents.length = 0;

  tickFloaties(dt);
  tickSolarFlare(dt);
  tickBlackHole(dt);
  tickComet(dt);
  tickCombatBeams(dt);
  tickEmpBlasts(dt);
  tickScreenShake(dt);
  tickShootingStars(dt);
  tickRangePulses(dt);
  tickNodeParticles(dt);
  tickSOL(dt);
  tickAdmiral(dt);

  if ((state.base.health || 0) > 0) _baseDestroyedNoticeShown = false;
  else if (!_baseDestroyedNoticeShown) {
    _baseDestroyedNoticeShown = true;
    showTransmissionMessage(NPCS.doran.transmissionLines.base_destroyed, 18, 'doran');
  }

  // ── Shield regeneration ─────────────────────────────────────
  if ((state.shieldBoostCount || 0) > 0) {
    _shieldRegenTimer += dt;
    if (_shieldRegenTimer >= SHIELD_REGEN_INTERVAL_S) {
      _shieldRegenTimer -= SHIELD_REGEN_INTERVAL_S;
      const maxShield = getMaxShield();
      const regen = state.shieldBoostCount * SHIELD_REGEN_PER_PURCHASE_PER_TICK;
      state.base.shield = Math.min(maxShield, (state.base.shield || 0) + regen);
      if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
    }
  }

  // ── Auto Regeneration HP (every 1 s) ───────────────────────
  if ((state.autoRegenCount || 0) > 0 && state.base.health < state.base.maxHealth) {
    _autoRegenTimer += dt;
    if (_autoRegenTimer >= 1) {
      _autoRegenTimer -= 1;
      const hpPerSec = state.autoRegenCount * AUTO_REGEN_HP_PER_PURCHASE;
      state.base.health = Math.min(state.base.maxHealth, state.base.health + hpPerSec);
      if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
    }
  }

  _storagePowerTimer += dt;
  if (_storagePowerTimer >= 1) {
    _storagePowerTimer -= 1;
    if (_storageOfflineNoticeSol !== null && _storageOfflineNoticeSol !== state.sol) _storageOfflineNoticeSol = null;
    const storageChargeById = new Map();
    const networkState = getPowerNetworkState(state.modules, state.turrets);
    const stations = [];
    const poweredBuildings = [];
    for (const module of state.modules) {
      if (isPowerStationModule(module)) stations.push(module);
      if (isPoweredBuildingModule(module)) poweredBuildings.push(module);
    }
    for (const station of stations) {
      if ((station.health || 0) <= 0) continue;
      const linkedStorageIds = networkState.stationLinkedStorages.get(station.id) || [];
      const linkedTurretIds = networkState.stationLinkedTurrets.get(station.id) || [];
      const linkedConsumerIds = linkedStorageIds.concat(linkedTurretIds);
      if (!linkedConsumerIds.length) continue;
      const fuelType = station.fuelResource || 'iron';
      const availableFuel = station.inventory?.[fuelType] || 0;
      const fuelCost = getPowerResourceConsumption(station) * linkedConsumerIds.length;
      const output = getPowerStationEffectiveOutput(station, linkedConsumerIds.length);
      if (output <= 0) continue;
      station.inventory[fuelType] = Math.max(0, availableFuel - Math.min(availableFuel, fuelCost));
      for (const consumerId of linkedConsumerIds) {
        storageChargeById.set(consumerId, (storageChargeById.get(consumerId) || 0) + output);
      }
    }

    let storageWentOffline = false;
    for (const storage of poweredBuildings) {
      const prevPower = storage.power || 0;
      const incomingPower = storageChargeById.get(storage.id) || 0;
      storage.power = Math.max(0, Math.min(storage.powerCapacity || 0, prevPower + incomingPower - getStoragePowerUsage(storage)));
      if (prevPower > 0 && storage.power <= 0) storageWentOffline = true;
    }
    for (const turret of state.turrets) {
      const prevPower = turret.power || 0;
      const incomingPower = storageChargeById.get(turret.id) || 0;
      turret.power = Math.max(0, Math.min(turret.powerCapacity || 0, prevPower + incomingPower - (turret.powerUsage || 0)));
    }
    if (storageWentOffline && _storageOfflineNoticeSol !== state.sol) {
      _storageOfflineNoticeSol = state.sol;
      showTransmissionMessage(NPCS.doran.transmissionLines.storage_no_power, 18, 'doran');
    }
    if (!state.seenMsgs['vane_lab_network_online']) {
      const labNetworkState = getLabNetworkState(state.modules, state.nodes, state.base.level);
      if ((labNetworkState.nodeEdges || []).length > 0) {
        showOnce('vane_lab_network_online', NPCS.vane.transmissionLines.vane_lab_network_online, 18, 'vane');
      }
    }
    if (state.selectedModule && window.patchStorageModal) {
      const overlay = document.getElementById('storage-modal-overlay');
      if (overlay?.style.display === 'flex') window.patchStorageModal();
    }
    if (state.selectedTurret && window.patchTurretModal) {
      const overlay = document.getElementById('turret-modal-overlay');
      if (overlay?.style.display === 'flex') window.patchTurretModal();
    }
  }

  // Node fade-ins
  for (const n of state.nodes) {
    if (n.fadeAge !== undefined && n.fadeAge < n.fadeDuration) n.fadeAge += dt;
  }

  tickCombat(dt);
  for (const s of state.ships) tickShip(s, dt);
  for (const d of (state.drones || [])) tickDrone(d, dt);

  state.highestAvailableNodeTier = Math.max(1, ...state.ships.map(s => s.mineTier || 1));

  // Flush deposit events
  flushTickEvents(canvas);
}

// ── Fast rAF patch loop — cargo bars + status badges ──────────
let _lastPatchTs = 0;
let _lastPatchSig = '';
let _lastSelectedActionSig = '';
let _depotOptionsSig = '';
let _depotOptionsSigVer = -1;
const PATCH_FRAME_MS = 1000 / 20;

function getDistanceToBaseTiles(ship) {
  if (!ship) return 0;
  const bp = BASE_POS();
  return Math.max(0, Math.round(Math.hypot(ship.x - bp.x, ship.y - bp.y) / 36));
}

function getDepotOptionsSig() {
  const ver = getEntityListVersion();
  if (ver === _depotOptionsSigVer) return _depotOptionsSig;
  const depots = getDepotModules(state.modules);
  let sig = state.base.name || 'Base Station';
  for (const module of depots) {
    sig += `|${module.type}:${module.id}:${module.name}`;
  }
  _depotOptionsSig = sig;
  _depotOptionsSigVer = ver;
  return sig;
}

function getSelectedActionSig(ship) {
  if (!ship) return '';
  return [
    ship.id,
    ship.name,
    ship.type,
    ship.status,
    ship.unloadingDepot ? 1 : 0,
    ship.loadingPickup ? 1 : 0,
    ship.capacity,
    ship.flySpeed,
    ship.mineSpeed,
    ship.mineBonus,
    ship.loadSpeed,
    ship.hp,
    ship.attack,
    ship.attackSpeed,
    ship.mineTier,
    ship.capacityLevel,
    ship.flySpeedLevel,
    ship.mineSpeedLevel,
    ship.mineBonusLevel,
    ship.loadSpeedLevel,
    ship.hpLevel,
    ship.attackLevel,
    ship.atkRateLevel,
    ship.targetNode ?? '',
    ship.pickupType ?? '',
    ship.pickupId ?? '',
    ship.depotType ?? '',
    ship.depotId ?? '',
    state.followShip === ship.id ? 1 : 0,
    getDepotOptionsSig(),
  ].join('\0');
}

function setTextIfChanged(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

function setHtmlIfChanged(el, html) {
  if (el && el.innerHTML !== html) el.innerHTML = html;
}

function patchShipActionPanel(ship) {
  patchSelectedShipModal(ship);
}

function patchShipCards() {
  const now = performance.now();
  if (now - _lastPatchTs < PATCH_FRAME_MS) {
    requestAnimationFrame(patchShipCards);
    return;
  }
  _lastPatchTs = now;

  const selectedShipForSig = state.selectedShip !== null
    ? state.ships.find(s => s.id === state.selectedShip)
    : null;
  const sig = state.ships.map(s => `${s.id}:${s.status}:${!!s.unloadingDepot}:${s.cargo}/${s.capacity}`).join('|')
    + `|sel:${state.selectedShip ?? '-'}|selDist:${selectedShipForSig ? getDistanceToBaseTiles(selectedShipForSig) : '-'}|selDest:${selectedShipForSig ? selectedShipForSig.destX : '-'}:${selectedShipForSig ? selectedShipForSig.destY : '-'}|sol:${state.sol}|coins:${state.coins}`;
  if (sig === _lastPatchSig) {
    requestAnimationFrame(patchShipCards);
    return;
  }
  _lastPatchSig = sig;

  for (const ship of state.ships) {
    // Cargo bar
    const fill = document.getElementById(`cargo-fill-${ship.id}`);
    if (fill) fill.style.width = `${ship.cargo / ship.capacity * 100}%`;
    const txt = document.getElementById(`cargo-text-${ship.id}`);
    if (txt) txt.textContent = `▲ ${ship.cargo}/${ship.capacity}`;
    // Status badge (no-op if text unchanged — avoids flicker)
    const badge = document.getElementById(`ship-status-${ship.id}`);
    if (badge) {
      const label = getShipStatusMeta(ship).badge;
      if (badge.textContent !== label) {
        badge.textContent = label;
        badge.className = `ship-status ${ship.status}`;
      }
    }
  }
  // Action panel live updates for selected ship
  if (state.selectedShip !== null) {
    const ship = selectedShipForSig || state.ships.find(s => s.id === state.selectedShip);
    if (ship) {
      const actionSig = getSelectedActionSig(ship);
      if (actionSig !== _lastSelectedActionSig) {
        _lastSelectedActionSig = actionSig;
        renderActionPanel();
      }
      patchShipActionPanel(ship);
    } else {
      _lastSelectedActionSig = '';
    }
  } else {
    _lastSelectedActionSig = '';
  }
  requestAnimationFrame(patchShipCards);
}

// ── Tab visibility — reset tick timer on return to avoid dt spike ──
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) lastTick = performance.now();
});

// ── Slow interval — refresh open header panel ─────────────────
setInterval(() => {
  refreshHdrPanelIfOpen();
  patchStatsPanel();
  updateHeaderCraft(); // craft pulse on/off as timers start/finish
  // Safety net: keep tracked craft reqs in sync if resources changed off-path
  if ((state.trackedCrafts || []).length) renderCraftTracker();
}, 800);

// ── Autosave ─────────────────────────────────────────────────
setInterval(saveGame, 5000);

// ── Kick off ─────────────────────────────────────────────────
renderUI();
refreshLogUI();
requestAnimationFrame(render);
const _timerWorker = new Worker(
  URL.createObjectURL(new Blob([`setInterval(() => postMessage(1), ${1000 / 60})`], { type: 'application/javascript' }))
);
_timerWorker.onmessage = gameLoop;
requestAnimationFrame(patchShipCards);
