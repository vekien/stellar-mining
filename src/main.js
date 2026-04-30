// ============================================================
// MAIN — boot, game loop, resize
// ============================================================
import { state, loadGame, saveGame } from './state.js';
import { generateNodes } from './data/nodes.js';
import { RESOURCE_DEFS, MINE_TIERS } from './data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from './data/crafts.js';
import { SOL_DURATION, BASE_COL, BASE_ROW } from './constants.js';
import { setStateRef, hideTooltip, openLogHistory, closeLogHistory, refreshLogUI } from './helpers.js';
import { cam, focusOnBase, nodeWorldPos } from './render/camera.js';
import { initRenderer, resizeRenderer, render, W, H } from './render/renderer.js';
import { initStars, resizeStars, buildStarData, tickShootingStars } from './render/stars.js';
import {
  tickFloaties, tickSolarFlare, tickComet,
  tickScreenShake, tickRangePulses, tickNodeParticles,
} from './render/animations.js';
import { scheduleNextEvent, tickSOL } from './systems/sol.js';
import { tickAdmiral } from './ui/transmissions.js';
import { tickShip, tickEvents, flushTickEvents, spawnShip } from './systems/ships.js';
import './systems/research.js';
import { refresh } from './ui/refresh.js';
import { renderUI, updateHeader, initRefresh } from './ui/ui.js';
import { renderBasePanel } from './ui/basePanel.js';
import { openHdrPanel, closeHdrPanel, dismissHdrModal, handleBasePanelOverlayClick, refreshHdrPanelIfOpen } from './ui/panels.js';
import { removeReassignTooltip, renderTutPointers } from './ui/tutorial.js';
import { initInput } from './input.js';

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
initNodes();
if (window.syncShipCraftTimers) window.syncShipCraftTimers();
if (!loaded) spawnShip('scout');

// Schedule first event if not already scheduled (loadGame may not if nextEventTimer was null)
if (state.nextEventTimer === null) scheduleNextEvent();

// Ensure a market boost exists from the very first SOL
if (!state.marketBoost) {
  const types = Object.keys(RESOURCE_DEFS);
  const multiplier = Number((1.2 + Math.random() * 0.8).toFixed(2));
  state.marketBoost = { type: types[Math.floor(Math.random() * types.length)], multiplier };
} else if (!state.marketBoost.multiplier) {
  state.marketBoost.multiplier = 1.5;
}

// Normalise ships missing mineTier (e.g. from old saves)
for (const s of state.ships) {
  if (!s.mineTier || !MINE_TIERS[s.mineTier]) s.mineTier = 1;
}

focusOnBase(2.0);

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
  const banner = document.getElementById('tutorial-banner');
  if (banner) banner.classList.add('show');
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
window.openAbout      = () => document.getElementById('about-overlay').classList.add('show');
window.closeAbout     = () => document.getElementById('about-overlay').classList.remove('show');
window.openLogHistory = openLogHistory;
window.closeLogHistory = closeLogHistory;
window.openSettings   = () => {
  const overlay = document.getElementById('settings-overlay');
  const chk = document.getElementById('setting-grid-coords');
  if (chk) chk.checked = !!state.settings?.showGridCoords;
  if (overlay) overlay.classList.add('show');
};
window.closeSettings  = () => {
  const overlay = document.getElementById('settings-overlay');
  if (overlay) overlay.classList.remove('show');
};
window.toggleGridCoords = (enabled) => {
  if (!state.settings) state.settings = {};
  state.settings.showGridCoords = !!enabled;
};
window.switchTab      = function(tab) {
  dismissHdrModal();
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (refresh.ui) refresh.ui();
};

// ── Game loop ─────────────────────────────────────────────────
let lastTick = 0;

function gameLoop(ts) {
  const dt = Math.min((ts - lastTick) / 1000, 0.1);
  lastTick = ts;
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

  // Node fade-ins
  for (const n of state.nodes) {
    if (n.fadeAge !== undefined && n.fadeAge < n.fadeDuration) n.fadeAge += dt;
  }

  for (const s of state.ships) tickShip(s, dt);

  // Flush deposit events
  flushTickEvents(canvas);
  if (tickEvents.length) updateHeader();

  requestAnimationFrame(gameLoop);
}

// ── Fast rAF patch loop — cargo bars + status badges ──────────
const _STATUS_LABELS = { idle:'IDLE', flying:'EN ROUTE', mining:'MINING', returning:'RETURNING', pausing:'RETURNING' };
const _STATUS_MSGS   = { flying:'▶ En Route', mining:'⛏ Mining', returning:'↩ Returning', pausing:'↩ Returning', idle:'● Idle' };
const _STATUS_COLORS = { flying:'#48f', mining:'#c6f', returning:'#fa6', pausing:'#fa6', idle:'#4d8' };

function patchShipCards() {
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
    }
  }
  requestAnimationFrame(patchShipCards);
}

// ── Tab visibility — catch up while tab was hidden ────────────
let _hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _hiddenAt = Date.now();
  } else if (_hiddenAt !== null) {
    const elapsed = Math.min((Date.now() - _hiddenAt) / 1000, 3600);
    _hiddenAt = null;
    if (!state.solStarted) return;
    state.solTimer += elapsed;
    while (state.solTimer >= SOL_DURATION) {
      state.solTimer -= SOL_DURATION;
      state.sol++;
      const rpCap = 2 + (state.base.level - 1);
      state.rp = Math.min(state.rp + 1, rpCap);
      scheduleNextEvent();
    }
    if (state.nextEventTimer !== null) {
      state.nextEventTimer -= elapsed;
      if (state.nextEventTimer <= 0) {
        state.nextEventTimer = null;
        scheduleNextEvent();
      }
    }
    lastTick = performance.now();
    updateHeader();
    if (refresh.ui) refresh.ui();
  }
});

// ── Slow interval — header numbers only (no DOM rebuild) ─────
setInterval(() => {
  if (refresh.header) refresh.header();
  refreshHdrPanelIfOpen();
}, 800);

// ── Autosave ─────────────────────────────────────────────────
setInterval(saveGame, 5000);

// ── Kick off ─────────────────────────────────────────────────
renderUI();
refreshLogUI();
requestAnimationFrame(render);
requestAnimationFrame(gameLoop);
requestAnimationFrame(patchShipCards);
