// ============================================================
// MAIN — boot, game loop, resize
// ============================================================
import { state, loadGame, saveGame } from './state.js';
import { ALL_NODES } from './data/nodes.js';
import { RESOURCE_DEFS, MINE_TIERS } from './data/resources.js';
import { CRAFT_RECIPES } from './data/ships.js';
import { SOL_DURATION } from './constants.js';
import { setStateRef } from './helpers.js';
import { hideTooltip } from './helpers.js';
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
import { refresh } from './ui/refresh.js';
import { renderUI, updateHeader, initRefresh } from './ui/ui.js';
import { renderBasePanel } from './ui/basePanel.js';
import { openHdrPanel, closeHdrPanel, dismissHdrModal, handleBasePanelOverlayClick } from './ui/panels.js';
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
  state.nodes = ALL_NODES.map(n => ({ ...n }));
}

// ── Boot sequence ─────────────────────────────────────────────
resize();
initNodes();

const loaded = loadGame();
if (!loaded) spawnShip('starter');

// Schedule first event if not already scheduled (loadGame may not if nextEventTimer was null)
if (state.nextEventTimer === null) scheduleNextEvent();

// Ensure a market boost exists from the very first SOL
if (!state.marketBoost) {
  const types = Object.keys(RESOURCE_DEFS);
  state.marketBoost = { type: types[Math.floor(Math.random() * types.length)] };
}

// Normalise ships missing mineTier (e.g. from old saves)
for (const s of state.ships) {
  if (!s.mineTier || !MINE_TIERS[s.mineTier]) s.mineTier = 1;
}

focusOnBase(2.0);

// Re-dispatch ships that had a target node when the game was saved
for (const ship of state.ships) {
  if (ship.targetNode !== null) {
    const node = state.nodes.find(n => n.id === ship.targetNode);
    if (node) {
      ship.status = 'flying';
      const pos = nodeWorldPos(node);
      ship.destX = pos.x; ship.destY = pos.y - 20;
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
  if (banner) banner.style.display = 'block';
}

// ── Sidebar events ────────────────────────────────────────────
let sidebarHovered = false;
document.getElementById('sidebar').addEventListener('mouseenter', () => sidebarHovered = true);
document.getElementById('sidebar').addEventListener('mouseleave', () => { sidebarHovered = false; hideTooltip(); });

document.getElementById('sidebar').addEventListener('mousedown', e => {
  const interactive = e.target.closest('.ship-card, button, input, select, .tab, .sell-btn-s, .filter-btn, .upgrade-row, #tab-content, label');
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

// ── Fast rAF patch loop — cargo bars only ─────────────────────
function patchShipCards() {
  for (const ship of state.ships) {
    const fill = document.getElementById(`cargo-fill-${ship.id}`);
    if (fill) fill.style.width = `${ship.cargo / ship.capacity * 100}%`;
    const txt = document.getElementById(`cargo-text-${ship.id}`);
    if (txt) txt.textContent = `▲ ${ship.cargo}/${ship.capacity}`;
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

// ── Slow interval — full UI rebuild ──────────────────────────
setInterval(() => { if (!sidebarHovered && refresh.ui) refresh.ui(); }, 800);

// ── Autosave ─────────────────────────────────────────────────
setInterval(saveGame, 5000);

// ── Kick off ─────────────────────────────────────────────────
renderUI();
requestAnimationFrame(render);
requestAnimationFrame(gameLoop);
requestAnimationFrame(patchShipCards);
