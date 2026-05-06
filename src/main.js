// ============================================================
// MAIN — boot, game loop, resize
// ============================================================
import { state, loadGame, saveGame } from './state.js';
import { generateNodes } from './data/nodes.js';
import { MINE_TIERS } from './data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from './data/crafts.js';
import { BASE_COL, BASE_ROW } from './constants.js';
import { SOL_DURATION } from './data/sol.js';
import { setStateRef, hideTooltip, openLogHistory, closeLogHistory, refreshLogUI } from './helpers.js';
import { cam, focusOnBase, nodeWorldPos, BASE_POS } from './render/camera.js';
import { initRenderer, resizeRenderer, render, setOnCameraMove, W, H } from './render/renderer.js';
import { initStars, resizeStars, buildStarData, tickShootingStars, setStarsEnabled } from './render/stars.js';
import {
  tickFloaties, tickSolarFlare, tickComet,
  tickScreenShake, tickRangePulses, tickNodeParticles,
} from './render/animations.js';
import { scheduleNextEvent, tickSOL, rollMarketDemands } from './systems/sol.js';
import { fireRandomEvent } from './systems/events.js';
import { tickAdmiral, showTransmissionMessage } from './ui/transmissions.js';
import { tickShip, tickEvents, flushTickEvents, spawnShip } from './systems/ships.js';
import './systems/research.js';
import { getMaxShield } from './systems/research.js';
import { SHIELD_REGEN_INTERVAL_S, SHIELD_REGEN_PER_PURCHASE_PER_TICK, AUTO_REGEN_HP_PER_PURCHASE } from './data/research.js';
import { refresh } from './ui/refresh.js';
import { renderUI, updateHeader, initRefresh } from './ui/ui.js';
import { renderBasePanel } from './ui/basePanel.js';
import { openHdrPanel, closeHdrPanel, dismissHdrModal, handleBasePanelOverlayClick, refreshHdrPanelIfOpen, patchStatsPanel } from './ui/panels.js';
import { removeReassignTooltip, renderTutPointers } from './ui/tutorial.js';
import { initInput } from './input.js';
import { initDevPanel } from './ui/devPanel.js';
import './ui/storageUI.js';
import { NPCS } from './data/npcs.js';
import { getStoragePowerUsage } from './data/storage.js';

let _baseDestroyedNoticeShown = false;
let _storageOfflineNoticeShown = false;

function hasOfflineStorage() {
  return state.storageFacilities.some(storage => (storage.power || 0) <= 0 || (storage.health || 0) <= 0);
}

function showStartupInfrastructureWarnings() {
  if ((state.base.health || 0) <= 0) {
    _baseDestroyedNoticeShown = true;
    showTransmissionMessage(NPCS.doran.transmissionLines.base_destroyed, 18, 'doran');
    return;
  }
  if (hasOfflineStorage()) {
    _storageOfflineNoticeShown = true;
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
}

// ── Boot sequence ─────────────────────────────────────────────
resize();
const loaded = loadGame();
setStarsEnabled(state.settings?.showBackgroundStars !== false);
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

focusOnBase(2.0);
updateHeader();
showStartupInfrastructureWarnings();

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
document.getElementById('hdr-modal-overlay').addEventListener('mouseenter', () => overlayHovered = true);
document.getElementById('hdr-modal-overlay').addEventListener('mouseleave', () => overlayHovered = false);

document.getElementById('sidebar').addEventListener('mousedown', e => {
  const interactive = e.target.closest('.ship-card, button, input, select, .tab, .sell-btn-s, .filter-btn, .upgrade-row, #tab-content, #action-panel, label');
  if (interactive) {
    dismissHdrModal();
    window.dismissBasePanel && window.dismissBasePanel();
  } else if (state.selectedShip !== null) {
    state.selectedShip  = null;
    state.pendingAssign = null;
    canvas.style.cursor = '';
    removeReassignTooltip();
    if (refresh.ui) refresh.ui();
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
window.closeLogHistory = closeLogHistory;
window.openSettings   = () => {
  const overlay = document.getElementById('settings-overlay');
  const chkShowGrid = document.getElementById('setting-show-grid');
  const chkStars = document.getElementById('setting-bg-stars');
  if (chkShowGrid) chkShowGrid.checked = state.settings?.showGrid !== false;
  if (chkStars) chkStars.checked = state.settings?.showBackgroundStars !== false;
  if (overlay) overlay.classList.add('show');
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
  tickComet(dt);
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
    let storageWentOffline = false;
    for (const storage of state.storageFacilities) {
      const prevPower = storage.power || 0;
      storage.power = Math.max(0, prevPower - getStoragePowerUsage(storage));
      if (prevPower > 0 && storage.power <= 0) storageWentOffline = true;
    }
    if (!hasOfflineStorage()) _storageOfflineNoticeShown = false;
    if (storageWentOffline && !_storageOfflineNoticeShown) {
      _storageOfflineNoticeShown = true;
      showTransmissionMessage(NPCS.doran.transmissionLines.storage_no_power, 18, 'doran');
    }
    if (state.selectedStorage && window.patchStorageModal) {
      const overlay = document.getElementById('storage-modal-overlay');
      if (overlay?.style.display === 'flex') window.patchStorageModal();
    }
  }

  // Node fade-ins
  for (const n of state.nodes) {
    if (n.fadeAge !== undefined && n.fadeAge < n.fadeDuration) n.fadeAge += dt;
  }

  for (const s of state.ships) tickShip(s, dt);

  state.highestAvailableNodeTier = Math.max(1, ...state.ships.map(s => s.mineTier || 1));

  // Flush deposit events
  flushTickEvents(canvas);
}

// ── Fast rAF patch loop — cargo bars + status badges ──────────
const _STATUS_LABELS = { idle:'IDLE', flying:'EN ROUTE', mining:'MINING', returning:'RETURNING', pausing:'RETURNING', holding:'HOLDING' };
const _STATUS_MSGS   = { flying:'▶ En Route', mining:'⛏ Mining', returning:'↩ Returning', pausing:'↩ Returning', holding:'◌ Holding Pattern', idle:'● Idle' };
const _STATUS_COLORS = { flying:'#48f', mining:'#c6f', returning:'#fa6', pausing:'#fa6', holding:'#f88', idle:'#4d8' };
let _lastPatchTs = 0;
let _lastPatchSig = '';
const PATCH_FRAME_MS = 1000 / 20;

function patchShipCards() {
  const now = performance.now();
  if (now - _lastPatchTs < PATCH_FRAME_MS) {
    requestAnimationFrame(patchShipCards);
    return;
  }
  _lastPatchTs = now;

  const sig = state.ships.map(s => `${s.id}:${s.status}:${s.cargo}/${s.capacity}`).join('|')
    + `|sel:${state.selectedShip ?? '-'}|sol:${state.sol}|coins:${state.coins}`;
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
      const label = _STATUS_LABELS[ship.status] || ship.status;
      if (badge.textContent !== label) {
        badge.textContent = label;
        badge.className = `ship-status ${ship.status}`;
      }
    }
  }
  // Action panel live updates for selected ship
  if (state.selectedShip !== null) {
    const ship = state.ships.find(s => s.id === state.selectedShip);
    if (ship) {
      const cargoEl = document.getElementById('action-panel-cargo');
      if (cargoEl) cargoEl.textContent = `${ship.cargo} / ${ship.capacity}`;
      const statusEl = document.getElementById('action-panel-status');
      if (statusEl) {
        const msg = _STATUS_MSGS[ship.status] || '● Idle';
        if (statusEl.textContent !== msg) {
          statusEl.textContent = msg;
          statusEl.style.color = _STATUS_COLORS[ship.status] || '#4d8';
        }
      }
      const distEl = document.getElementById('action-panel-dist');
      if (distEl) {
        const bp = BASE_POS();
        const d = Math.round(Math.hypot(ship.x - bp.x, ship.y - bp.y) / 36);
        distEl.innerHTML = d === 0 ? '<span style="color:#6fff9a">At Base</span>' : `${d} tiles`;
      }
    }
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
