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
    condition: s => s.tutStep === 0
      && s.ships.length === 1
      && s.ships[0].status === 'idle'
      && s.ships[0].targetNode === null,
    text: 'SELECT SHIP',
    placement: 'above',
    getEl: () => document.querySelector('.ship-card'),
  },

  {
    id: 'tut-ptr-node',
    hideWhenBasePanelOpen: true,
    condition: s => s.tutStep === 1
      && s.ships.length === 1
      && s.ships[0].status === 'idle'
      && s.ships[0].targetNode === null,
    text: 'SELECT IRON NODE',
    placement: 'above',
    getPos: s => {
      const node = s.nodes.find(n => n.type === 'iron' && n.minLevel <= s.base.level);
      if (!node) return null;
      const w = gridToWorld(node.gr[0], node.gr[1]);
      return canvasPos(w.x, w.y + TILE_H / 2);
    },
  },

  {
    id: 'tut-ptr-mining',
    condition: s => s.tutStep === 3 && !s.seenMsgs['tut_mining_done'],
    text: '⛏ MINING PROGRESS SHOWN HERE',
    placement: 'below',
    getEl: () => document.querySelector('.ship-card'),
  },

  {
    id: 'tut-ptr-base',
    condition: s => s.tutStep === 5,
    text: '⬡ SELECT YOUR BASE',
    placement: 'above',
    getPos: () => {
      const bw = gridToWorld(BASE_COL, BASE_ROW);
      return canvasPos(bw.x, bw.y + TILE_H / 2);
    },
  },

  {
    id: 'tut-ptr-ships-tab',
    condition: s => s.tutStep === 6,
    text: 'SHIPS TAB',
    placement: 'above',
    getEl: () => Array.from(document.querySelectorAll('.bp-tab'))
      .find(el => el.textContent.trim() === 'SHIPS') || null,
  },

  {
    id: 'tut-ptr-scout',
    condition: s => s.tutStep === 7,
    text: '🚀 BUILD SCOUT SHIP',
    placement: 'below',
    getEl: () => document.querySelector('.bp-craft-item .btn'),
  },

  {
    id: 'tut-ptr-newship',
    hideWhenBasePanelOpen: true,
    condition: s => s.tutStep === 8,
    text: 'SELECT SHIP → ASSIGN TO NODE',
    placement: 'below',
    getEl: () => {
      const cards = document.querySelectorAll('.ship-card');
      return cards[cards.length - 1] || null;
    },
  },

  {
    id: 'tut-ptr-trade',
    condition: s => s.tutStep === 10,
    text: 'SELL RESOURCES UNDER TRADE',
    placement: 'below',
    getEl: () => Array.from(document.querySelectorAll('.hdr-btn'))
      .find(el => el.querySelector('.label')?.textContent === 'TRADE') || null,
  },

  {
    id: 'tut-ptr-research-lv3',
    condition: s => !!s.seenMsgs['dax_lv3_intro']
      && !!s.seenMsgs['kai_lv3_intro']
      && !s.seenMsgs['lv3_research_pointer_done'],
    text: 'OPEN RESEARCH',
    placement: 'below',
    getEl: () => Array.from(document.querySelectorAll('.hdr-btn'))
      .find(el => el.querySelector('.label')?.textContent === 'RESEARCH') || null,
  },

  // ── Redirect tutorial (fires after "solid stockpile" message) ──
  // Step A: select any ship

  {
    id: 'tut-ptr-redirect-ship',
    condition: s => s.redirectTutActive && !s.selectedShip,
    text: 'SELECT A SHIP',
    placement: 'below',
    getEl: () => document.querySelector('.ship-card'),
  },

  // Step B: click a node of a different type to redirect
  {
    id: 'tut-ptr-redirect-node',
    condition: s => s.redirectTutActive && !!s.pendingAssign,
    text: 'REDIRECT TO NEW NODE',
    placement: 'above',
    getPos: s => {
      const ship = s.ships.find(sh => sh.id === s.pendingAssign);
      if (!ship) return null;

      const currentNode = s.nodes.find(n => n.id === ship.targetNode);
      const currentType = currentNode?.type || null;

      const accessibleTypes = new Set();
      for (let t = 1; t <= ship.mineTier; t++) {
        for (const type of (MINE_TIERS[t]?.resources || [])) accessibleTypes.add(type);
      }

      const occupiedByOthers = new Set(
        s.ships
          .filter(sh => sh.id !== ship.id && sh.targetNode !== null)
          .map(sh => sh.targetNode)
      );

      const preferredType = currentType === 'iron'
        ? 'copper'
        : currentType === 'copper'
          ? 'iron'
          : null;

      const baseFilter = (n) => (
        n.minLevel <= s.base.level
        && accessibleTypes.has(n.type)
        && !occupiedByOthers.has(n.id)
        && n.id !== ship.targetNode
      );

      let candidates = s.nodes.filter(n => baseFilter(n) && (!preferredType || n.type === preferredType));
      if (!candidates.length) candidates = s.nodes.filter(n => baseFilter(n) && n.type !== currentType);
      if (!candidates.length) candidates = s.nodes.filter(baseFilter);
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

  // ── Upgrades tutorial (fires after first non-starter ship is assigned) ──
  // Step A: select any ship

  {
    id: 'tut-ptr-upgrade-ship',
    condition: s => s.upgradesTutActive && !s.selectedShip,
    text: 'SELECT A SHIP',
    placement: 'below',
    getEl: () => document.querySelector('.ship-card'),
  },

  // Step B: point at the Upgrades section in the action panel
  {
    id: 'tut-ptr-upgrades',
    condition: s => s.upgradesTutActive && !!s.selectedShip,
    text: 'UPGRADES',
    placement: 'above',
    getEl: () => document.getElementById('upgrades-section-header'),
  },

];

// ── Render all active tutorial pointers ──────────────────────
export function renderTutPointers() {
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  if (isAboutOpen()) return;

  for (const def of TUTORIAL_DEFS) {
    if (!def.condition(state)) continue;
    if (def.hideWhenBasePanelOpen && state.basePanelOpen) continue;

    let x, y;

    if (def.getEl) {
      const el = def.getEl();
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = def.placement === 'below' ? rect.bottom + 6 : rect.top - 54;

    } else if (def.getPos) {
      const pos = def.getPos(state);
      if (!pos) continue;
      x = pos.x;
      y = def.placement === 'below' ? pos.y + 6 : pos.y - 58;

    } else {
      continue;
    }

    const ptr = document.createElement('div');
    ptr.className = `tut-pointer${def.placement === 'below' ? ' tut-above' : ''}`;
    ptr.id = def.id;
    ptr.innerHTML = `<div class="tut-pointer-label">${def.text}</div><div class="tut-pointer-arrow"></div>`;
    ptr.style.left = x + 'px';
    ptr.style.top  = y + 'px';
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
  const has500Coins  = state.coins >= 500;
  const brokeAfterUpgrade = state.coins <= 0 && state.ships.some(
    s => s.capacityLevel > 0 || s.flySpeedLevel > 0 || s.mineSpeedLevel > 0 || s.mineTier > 1
  );
  const solAt10 = state.solTimer >= SOL_DURATION * 10 / 24;

  if (!has500Coins && !brokeAfterUpgrade && !solAt10) return;

  state.tutStep = Math.max(state.tutStep, 10);
  setTimeout(() => showOnce('kade_intro', NPCS.kade.transmissionLines.kade_intro, 20, 'kade'), 800);
}

// ── Dismiss mission briefing banner ──────────────────────────
export function dismissTutorial() {
  const banner = document.getElementById('tutorial-banner');
  if (banner) banner.classList.remove('show');
}

// ── Reassign tooltip (shown while pendingAssign is active) ───
export function showReassignTooltip(ship) {
  removeReassignTooltip();
  const el = document.createElement('div');
  el.id = 'reassign-tooltip';
  const sidebarW = 350;
  const canvasCentreX = (window.innerWidth - sidebarW) / 2;
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

// Expose for HTML onclick handlers
window.dismissTutorial = dismissTutorial;
