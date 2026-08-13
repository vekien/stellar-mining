// ============================================================
// TUTORIAL SYSTEM — modular pointer defs, rendering, helpers
// ============================================================
import { state } from '../state.js';
import { MINE_TIERS } from '../data/resources.js';
import { cam, gridToWorld } from '../render/camera.js';
import { W, H } from '../render/renderer.js';
import { TILE_H, SOL_DURATION, BASE_COL, BASE_ROW } from '../constants.js';
import { showOnce } from './transmissions.js';
import { NPCS } from '../data/npcs.js';

function isAboutOpen() {
  return document.getElementById('about-overlay')?.classList.contains('show');
}

function isCraftPanelOpen() {
  return !!(window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft');
}

function isCraftShipsTabActive() {
  const btn = document.getElementById('craft-tab-ships');
  return !!btn?.classList.contains('active');
}

function hasActiveShipCraftJob(recipeId = null) {
  const now = Date.now();
  return (state.craftQueue || []).some((j) => {
    if (!j || j.kind !== 'ship') return false;
    if (recipeId && j.recipeId !== recipeId) return false;
    return now < (j.endsAt || 0);
  });
}

// ── Canvas world-position → screen-pixel helper ──────────────
function canvasPos(worldX, worldY) {
  const canvas = document.getElementById('main-canvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (worldX - cam.x) * cam.zoom + W / 2 + rect.left,
    y: (worldY - cam.y) * cam.zoom + H / 2 + rect.top,
  };
}

// ── Tutorial definitions ──────────────────────────────────────
//
// Each entry:
//   id         — unique string; used as the DOM element's id
//   condition  — fn(state) → bool  when this pointer should be visible
//   text       — label shown in the pointer chip
//   placement  — 'above': pointer sits above the target, arrow points ↓
//                'below': pointer sits below the target, arrow points ↑
//   getEl      — fn() → Element | null    target is a DOM element
//   getPos     — fn(state) → {x,y} | null target is a canvas world position
//
// Rules:
//   • Only ONE of getEl / getPos should be supplied per entry.
//   • The higher a step's tutStep value, the later it fires. State tracks
//     the highest step reached, so earlier steps auto-skip on loaded saves.
//   • Independent multi-step tutorials (redirect, upgrades) use their own
//     state flags rather than tutStep so they can co-exist.

const TUTORIAL_DEFS = [

  // ── Core tutorial flow ──────────────────────────────────────

  {
    id: 'tut-ptr-ship',
    needsFleetDock: true,
    condition: s => s.tutStep === 0
      && s.ships.length === 1
      && s.ships[0].status === 'idle'
      && s.ships[0].targetNode === null,
    text: 'SELECT SHIP',
    placement: 'left',
    getEl: () => document.querySelector('#sidebar .ship-card, .ship-card'),
  },

  {
    id: 'tut-ptr-node',
    hideWhenBasePanelOpen: true,
    condition: s => s.tutStep === 1
      && s.ships.length === 1
      && s.ships[0].status === 'idle'
      && s.ships[0].targetNode === null
      && s.selectedShip === s.ships[0].id,
    text: 'CHOOSE A NODE',
    placement: 'below',
    getEl: () => document.getElementById('action-panel-node-card')
      || document.querySelector('.sm-node-card.clickable'),
  },

  {
    id: 'tut-ptr-mining',
    needsFleetDock: true,
    condition: s => s.tutStep === 3 && !s.seenMsgs['tut_mining_done'],
    text: 'MINING PROGRESS SHOWN HERE',
    placement: 'left',
    getEl: () => document.querySelector('#sidebar .ship-card, .ship-card'),
  },

  {
    id: 'tut-ptr-base',
    condition: s => s.tutStep === 5,
    text: 'OPEN CRAFT MENU',
    placement: 'below',
    getEl: () => document.querySelector('.hdr-btn[data-panel="craft"]')
      || Array.from(document.querySelectorAll('.hdr-btn')).find(el => el.textContent.trim() === 'CRAFT')
      || null,
  },

  {
    id: 'tut-ptr-ships-tab',
    condition: s => s.tutStep === 6 && isCraftPanelOpen() && !isCraftShipsTabActive(),
    text: 'SHIPS TAB',
    placement: 'below',
    getEl: () => document.getElementById('craft-tab-ships'),
  },

  // Pick Scout from the list
  {
    id: 'tut-ptr-pick-ship',
    condition: s => s.tutStep === 7 && isCraftPanelOpen() && isCraftShipsTabActive(),
    text: 'SELECT SCOUT',
    placement: 'right',
    getEl: () => document.querySelector('.hdr-modal-window[data-panel-type="craft"] .cf-card[data-craft-id="scout"]')
      || document.querySelector('.hdr-modal-window[data-panel-type="craft"] .cf-card[data-craft-kind="ship"]'),
  },

  // After selection, point at BUILD (hide once queued / pressed / off Ships tab)
  {
    id: 'tut-ptr-build-ship',
    condition: s => s.tutStep === 8
      && !s.seenMsgs['tut_build_pressed']
      && !hasActiveShipCraftJob('scout')
      && isCraftPanelOpen()
      && isCraftShipsTabActive(),
    text: 'BUILD',
    placement: 'left',
    getEl: () => document.querySelector('.hdr-modal-window[data-panel-type="craft"] .cf-detail .cf-build:not(:disabled)')
      || document.querySelector('.hdr-modal-window[data-panel-type="craft"] .cf-detail .cf-build'),
  },

  // Wait until a second ship exists, then assign it
  {
    id: 'tut-ptr-newship',
    needsFleetDock: true,
    hideWhenBasePanelOpen: true,
    condition: s => s.tutStep === 9 && s.ships.length >= 2 && !s.selectedShip
      && !s.seenMsgs['first_craft_assigned'],
    text: 'SELECT NEW SHIP',
    placement: 'left',
    getEl: () => {
      const cards = document.querySelectorAll('#sidebar .ship-card, .ship-card');
      return cards[cards.length - 1] || null;
    },
  },

  {
    id: 'tut-ptr-newship-assign',
    hideWhenBasePanelOpen: true,
    condition: s => s.tutStep === 9 && s.ships.length >= 2 && !!s.selectedShip
      && !s.seenMsgs['first_craft_assigned'],
    text: 'ASSIGN TO NODE',
    placement: 'below',
    getEl: () => document.getElementById('action-panel-node-card')
      || document.querySelector('.sm-node-card.clickable'),
  },

  {
    id: 'tut-ptr-trade',
    condition: s => s.tutStep === 10,
    text: 'SELL RESOURCES UNDER TRADE',
    placement: 'below',
    getEl: () => document.querySelector('.hdr-btn[data-panel="market"]')
      || Array.from(document.querySelectorAll('.hdr-btn')).find(el => el.textContent.trim() === 'TRADE')
      || null,
  },

  {
    id: 'tut-ptr-research-lv3',
    condition: s => !!s.seenMsgs['dax_lv3_intro']
      && !!s.seenMsgs['kai_lv3_intro']
      && !s.seenMsgs['lv3_research_pointer_done'],
    text: 'OPEN RESEARCH',
    placement: 'below',
    getEl: () => document.querySelector('.hdr-btn[data-panel="research"]')
      || Array.from(document.querySelectorAll('.hdr-btn')).find(el => el.textContent.trim() === 'RESEARCH')
      || null,
  },

  // ── Diversify tutorial: enough of first scout ore → switch to the other ──
  // Scout needs iron 75 + copper 50. When one is stocked, guide to the other.

  {
    id: 'tut-ptr-redirect-ship',
    needsFleetDock: true,
    condition: s => s.redirectTutActive && !s.selectedShip,
    text: 'SELECT A SHIP',
    placement: 'left',
    getEl: () => document.querySelector('#sidebar .ship-card, .ship-card'),
  },

  {
    id: 'tut-ptr-redirect-assign',
    condition: s => s.redirectTutActive && !!s.selectedShip && !s.pendingAssign
      && !document.getElementById('node-picker-overlay')?.classList.contains('show'),
    text: s => {
      const t = s.redirectTargetType === 'copper' ? 'COPPER' : 'IRON';
      return `ASSIGN TO ${t}`;
    },
    placement: 'below',
    getEl: () => document.getElementById('action-panel-node-card')
      || document.querySelector('.sm-node-card.clickable'),
  },

  {
    id: 'tut-ptr-redirect-node',
    condition: s => s.redirectTutActive && (!!s.pendingAssign || !!s.selectedShip)
      && !!document.getElementById('node-picker-overlay')?.classList.contains('show'),
    text: s => {
      const t = s.redirectTargetType === 'copper' ? 'COPPER' : 'IRON';
      return `PICK ${t} NODE`;
    },
    placement: 'below',
    getEl: () => {
      const want = state.redirectTargetType;
      if (!want) return null;
      const cards = document.querySelectorAll('#node-picker-body .np-card:not(:disabled)');
      for (const card of cards) {
        if (card.dataset?.type === want) return card;
        const label = (card.textContent || '').toLowerCase();
        if (want === 'iron' && label.includes('iron')) return card;
        if (want === 'copper' && label.includes('copper')) return card;
      }
      return cards[0] || null;
    },
  },

  {
    id: 'tut-ptr-redirect-map',
    condition: s => s.redirectTutActive && !!s.pendingAssign
      && !document.getElementById('node-picker-overlay')?.classList.contains('show'),
    text: s => {
      const t = s.redirectTargetType === 'copper' ? 'COPPER' : 'IRON';
      return `MINE ${t}`;
    },
    placement: 'above',
    getPos: s => {
      const ship = s.ships.find(sh => sh.id === s.pendingAssign) || s.ships.find(sh => sh.id === s.selectedShip);
      if (!ship) return null;
      const preferredType = s.redirectTargetType || 'copper';

      const occupiedByOthers = new Set(
        s.ships
          .filter(sh => sh.id !== ship.id && sh.targetNode !== null)
          .map(sh => sh.targetNode)
      );

      const candidates = s.nodes.filter((n) => (
        n.minLevel <= s.base.level
        && n.type === preferredType
        && !occupiedByOthers.has(n.id)
        && n.id !== ship.targetNode
      ));
      if (!candidates.length) return null;

      candidates.sort((a, b) => {
        const aw = gridToWorld(a.gr[0], a.gr[1]);
        const bw = gridToWorld(b.gr[0], b.gr[1]);
        const ad = (aw.x - ship.x) * (aw.x - ship.x) + (aw.y - ship.y) * (aw.y - ship.y);
        const bd = (bw.x - ship.x) * (bw.x - ship.x) + (bw.y - ship.y) * (bw.y - ship.y);
        return ad - bd;
      });

      const w = gridToWorld(candidates[0].gr[0], candidates[0].gr[1]);
      return canvasPos(w.x, w.y + TILE_H / 2);
    },
  },

  // ── Upgrades tutorial (quest stage: upgrade_ship) ──
  {
    id: 'tut-ptr-upgrade-ship',
    needsFleetDock: true,
    condition: s => s.upgradesTutActive && !s.selectedShip,
    text: 'SELECT A SHIP',
    placement: 'left',
    getEl: () => document.querySelector('#sidebar .ship-card, .ship-card'),
  },

  // Upgrade tab (ship selected, modal open, not already on upgrades)
  {
    id: 'tut-ptr-upgrades',
    condition: s => s.upgradesTutActive && !!s.selectedShip && isShipModalOpen() && !isShipUpgradesTab(),
    text: 'UPGRADE',
    placement: 'below',
    getEl: () => document.getElementById('ship-upgrade-btn'),
  },

  // Point at SHIP STAT INCREASES once Upgrade tab is open
  {
    id: 'tut-ptr-stat-increases',
    condition: s => s.upgradesTutActive && !!s.selectedShip && isShipModalOpen() && isShipUpgradesTab(),
    text: 'BUY A STAT UPGRADE',
    placement: 'below',
    getEl: () => document.getElementById('ship-stat-increases')
      || document.querySelector('#ship-upgrades-body .sm-stat-panel-head')
      || document.querySelector('#ship-upgrades-body .sm-stat-upg-btn:not(:disabled)')
      || document.querySelector('#ship-upgrades-body .sm-stat-panel'),
  },

];

function isShipModalOpen() {
  return document.getElementById('ship-modal-overlay')?.style.display === 'flex';
}

function isShipUpgradesTab() {
  return !!document.getElementById('ship-upgrade-btn')?.classList.contains('on');
}

function ensureFleetDockVisible() {
  if (document.body.classList.contains('fleet-dock-collapsed')) {
    document.body.classList.remove('fleet-dock-collapsed');
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ── Render all active tutorial pointers ──────────────────────
export function renderTutPointers() {
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  if (isAboutOpen()) return;

  for (const def of TUTORIAL_DEFS) {
    if (!def.condition(state)) continue;
    if (def.hideWhenBasePanelOpen && state.basePanelOpen) continue;
    if (def.needsFleetDock) ensureFleetDockVisible();

    let x, y;
    const placement = def.placement || 'above';

    if (def.getEl) {
      const el = def.getEl();
      if (!el) continue;
      // Skip zero-size / off-screen targets (e.g. hidden action panel)
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      if (placement === 'left') {
        x = rect.left - 10;
        y = rect.top + rect.height / 2;
      } else if (placement === 'right') {
        x = rect.right + 10;
        y = rect.top + rect.height / 2;
      } else if (placement === 'below') {
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
      } else {
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
      }

    } else if (def.getPos) {
      const pos = def.getPos(state);
      if (!pos) continue;
      x = pos.x;
      y = placement === 'below' ? pos.y + 8 : pos.y - 8;

    } else {
      continue;
    }

    // Keep labels on-screen
    x = clamp(x, 24, window.innerWidth - 24);
    y = clamp(y, 24, window.innerHeight - 24);

    const labelText = typeof def.text === 'function' ? def.text(state) : def.text;

    const ptr = document.createElement('div');
    let placeClass = '';
    if (placement === 'below') placeClass = ' tut-above';
    else if (placement === 'left') placeClass = ' tut-left';
    else if (placement === 'right') placeClass = ' tut-right';
    ptr.className = `tut-pointer${placeClass}`;
    ptr.id = def.id;
    ptr.innerHTML = `<div class="tut-pointer-label">${labelText}</div><div class="tut-pointer-arrow"></div>`;
    ptr.style.left = `${Math.round(x)}px`;
    ptr.style.top = `${Math.round(y)}px`;
    document.body.appendChild(ptr);
  }
}

// ── Trade / Kade tutorial trigger ────────────────────────────
// Fires once any of three conditions is met:
//   1. Player reaches 500 coins
//   2. Player hits 0 coins after upgrading a ship
//   3. 10 minutes of total game time have elapsed
export function checkTradeTutorial() {
  if (state.seenMsgs['kade_intro']) return;

  // SOL clock is mapped to a 24-hour display; 10:00 = solTimer >= SOL_DURATION * 10/24
  const above500 = state.coins >= 500;
  const below100 = state.coins < 100;

  if (!above500 && !below100) return;

  setTimeout(() => {
    state.tutStep = Math.max(state.tutStep, 10);
    showOnce('kade_intro', NPCS.byte.transmissionLines.kade_intro, 20, 'byte');
  }, 800);
}

// ── Dismiss mission briefing banner ──────────────────────────
export function dismissTutorial() {
  const banner = document.getElementById('tutorial-banner');
  if (banner) banner.classList.remove('show');
  // Opening briefing closed → guide first assignment
  setTimeout(() => {
    showOnce('byte_mission_start', NPCS.byte.transmissionLines.mission_start, 16, 'byte');
    renderTutPointers();
  }, 400);
}

// ── Reassign tooltip (shown while pendingAssign is active) ───
export function showReassignTooltip(ship) {
  removeReassignTooltip();
  const el = document.createElement('div');
  el.id = 'reassign-tooltip';
  const canvasCentreX = window.innerWidth / 2;
  el.style.cssText = `
    position:fixed; top:100px; left:${canvasCentreX}px; transform:translateX(-50%);
    background:rgba(180,140,0,0.15); border:1px solid #ffe066;
    border-radius:4px; padding:6px 14px; font-size:12px; color:#ffe066;
    font-family:'Share Tech Mono',monospace; letter-spacing:1px;
    z-index:150; pointer-events:none; white-space:nowrap;
    box-shadow:0 0 12px rgba(255,220,0,0.2);
  `;
  el.textContent = ship.status === 'idle'
    ? '◈ CLICK A NODE TO ASSIGN'
    : '◈ CLICK A NODE TO REDIRECT — CURRENT CARGO WILL BE DROPPED';
  document.body.appendChild(el);
}

export function removeReassignTooltip() {
  const el = document.getElementById('reassign-tooltip');
  if (el) el.remove();
}

// Expose for HTML onclick handlers / cross-module calls
window.dismissTutorial = dismissTutorial;
window.renderTutPointers = renderTutPointers;
