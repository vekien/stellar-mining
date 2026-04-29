// ============================================================
// TUTORIAL SYSTEM — pointers, banners, reassign tooltip
// ============================================================
import { state } from '../state.js';
import { cam, gridToWorld } from '../render/camera.js';
import { W, H } from '../render/renderer.js';
import { TILE_H } from '../constants.js';
import { showOnce } from './transmissions.js';

export function renderTutPointers() {
  // Remove any existing pointers
  document.querySelectorAll('.tut-pointer').forEach(el => el.remove());

  if (state.tutStep === 0 || state.tutStep === 1) {
    // Only show during early tutorial and if game has just 1 ship that is idle and unassigned
    const isNewGame = state.ships.length === 1 && state.ships[0].status === 'idle' && state.ships[0].targetNode === null;
    if (!isNewGame) return;

    if (state.tutStep === 0) {
      const card = document.querySelector('.ship-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const ptr = document.createElement('div');
      ptr.className = 'tut-pointer';
      ptr.id = 'tut-ptr-ship';
      ptr.innerHTML = '<div class="tut-pointer-label">SELECT SHIP</div><div class="tut-pointer-arrow"></div>';
      ptr.style.left = (rect.left + rect.width/2 - 50) + 'px';
      ptr.style.top  = (rect.top - 54) + 'px';
      document.body.appendChild(ptr);
    }

    if (state.tutStep === 1) {
      const ironNode = state.nodes.find(n => n.type === 'iron' && n.minLevel <= state.base.level);
      if (!ironNode) return;
      const canvas = document.getElementById('main-canvas');
      const canvasRect = canvas.getBoundingClientRect();
      const w  = gridToWorld(ironNode.gr[0], ironNode.gr[1]);
      const sx = (w.x - cam.x) * cam.zoom + W/2 + canvasRect.left;
      const sy = (w.y + TILE_H/2 - cam.y) * cam.zoom + H/2 + canvasRect.top;
      const ptr = document.createElement('div');
      ptr.className = 'tut-pointer';
      ptr.id = 'tut-ptr-node';
      ptr.innerHTML = '<div class="tut-pointer-label">SELECT IRON NODE</div><div class="tut-pointer-arrow"></div>';
      ptr.style.left = (sx - 68) + 'px';
      ptr.style.top  = (sy - 58) + 'px';
      document.body.appendChild(ptr);
    }
  }

  if (state.tutStep === 3 && !state.seenMsgs['tut_mining_done']) {
    const miningShip = state.ships.find(s => s.status === 'mining');
    if (!miningShip) return;
    const card = document.querySelector('.ship-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const ptr = document.createElement('div');
    ptr.className = 'tut-pointer tut-above';
    ptr.id = 'tut-ptr-mining';
    ptr.innerHTML = '<div class="tut-pointer-label">⛏ MINING PROGRESS SHOWN HERE</div><div class="tut-pointer-arrow"></div>';
    ptr.style.left = (rect.left + rect.width / 2) + 'px';
    ptr.style.top  = (rect.bottom + 6) + 'px';
    document.body.appendChild(ptr);
  }

  if (state.tutStep === 5) {
    const canvas = document.getElementById('main-canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const bw = gridToWorld(12, 12);
    const sx = (bw.x - cam.x) * cam.zoom + W/2 + canvasRect.left;
    const sy = (bw.y + TILE_H/2 - cam.y) * cam.zoom + H/2 + canvasRect.top;
    const ptr = document.createElement('div');
    ptr.className = 'tut-pointer';
    ptr.id = 'tut-ptr-base';
    ptr.innerHTML = '<div class="tut-pointer-label">⬡ SELECT YOUR BASE</div><div class="tut-pointer-arrow"></div>';
    ptr.style.left = sx + 'px';
    ptr.style.top  = (sy - 58) + 'px';
    document.body.appendChild(ptr);
  }

  if (state.tutStep === 6) {
    const shipsTab = Array.from(document.querySelectorAll('.bp-tab')).find(el => el.textContent.trim() === 'SHIPS');
    if (!shipsTab) return;
    const rect = shipsTab.getBoundingClientRect();
    const ptr = document.createElement('div');
    ptr.className = 'tut-pointer';
    ptr.id = 'tut-ptr-ships-tab';
    ptr.innerHTML = '<div class="tut-pointer-label">SHIPS TAB</div><div class="tut-pointer-arrow"></div>';
    ptr.style.left = (rect.left + rect.width / 2 - 50) + 'px';
    ptr.style.top  = (rect.top - 54) + 'px';
    document.body.appendChild(ptr);
  }

  if (state.tutStep === 7) {
    const craftItem = document.querySelector('.bp-craft-item');
    if (!craftItem) return;
    const rect = craftItem.getBoundingClientRect();
    const ptr = document.createElement('div');
    ptr.className = 'tut-pointer tut-above';
    ptr.id = 'tut-ptr-scout';
    ptr.innerHTML = '<div class="tut-pointer-label">🚀 BUILD SCOUT SHIP</div><div class="tut-pointer-arrow"></div>';
    ptr.style.left = (rect.left + rect.width / 2) + 'px';
    ptr.style.top  = (rect.bottom + 6) + 'px';
    document.body.appendChild(ptr);
  }

  if (state.tutStep === 8) {
    const cards = document.querySelectorAll('.ship-card');
    const card = cards[cards.length - 1];
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const ptr = document.createElement('div');
    ptr.className = 'tut-pointer tut-above';
    ptr.id = 'tut-ptr-newship';
    ptr.innerHTML = '<div class="tut-pointer-label">SELECT SHIP → ASSIGN TO NODE</div><div class="tut-pointer-arrow"></div>';
    ptr.style.left = (rect.left + rect.width / 2) + 'px';
    ptr.style.top  = (rect.bottom + 6) + 'px';
    document.body.appendChild(ptr);
  }

  if (state.tutStep === 10) {
    const tradeBtn = Array.from(document.querySelectorAll('.hdr-btn')).find(el => el.querySelector('.label')?.textContent === 'TRADE');
    if (!tradeBtn) return;
    const rect = tradeBtn.getBoundingClientRect();
    const ptr = document.createElement('div');
    ptr.className = 'tut-pointer tut-above';
    ptr.id = 'tut-ptr-trade';
    ptr.innerHTML = '<div class="tut-pointer-label">SELL RESOURCES UNDER TRADE</div><div class="tut-pointer-arrow"></div>';
    ptr.style.left = (rect.left + rect.width / 2) + 'px';
    ptr.style.top  = (rect.bottom + 8) + 'px';
    document.body.appendChild(ptr);
  }
}

export function checkTradeTutorial() {
  if (state.tutStep !== 9) return;
  if (state.ships.length < 2) return;
  if (!Object.values(state.resources).some(v => v >= 30)) return;
  state.tutStep = 10;
  setTimeout(() => showOnce('kade_intro',
    `Greetings, Commander. Revenue Marshal Octavian Kade — Earth\'s Star Space Agency, Tax Division.<br><br>` +
    `I\'ve been monitoring your operation with great interest. I strongly advise you make full use of the <strong>Trade</strong> panel to sell your resources and maintain healthy liquidity.<br><br>` +
    `...One never knows when tax legislation might be extended to the outer belt. Stay compliant, Commander.`,
    20, 'kade'
  ), 800);
}

export function dismissTutorial() {
  const banner = document.getElementById('tutorial-banner');
  if (banner) {
    banner.style.transition = 'opacity 0.4s';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 400);
  }
}

export function showReassignTooltip(ship) {
  removeReassignTooltip();
  const el = document.createElement('div');
  el.id = 'reassign-tooltip';
  const sidebarW = 350;
  const canvasCentreX = (window.innerWidth - sidebarW) / 2;
  const topOffset = 100;
  el.style.cssText = `
    position:fixed; top:${topOffset}px; left:${canvasCentreX}px; transform:translateX(-50%);
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
