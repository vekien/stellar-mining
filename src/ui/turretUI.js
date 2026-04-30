// ============================================================
// TURRET UI — modal, upgrade, place, move, scrap
// ============================================================
import { state } from '../state.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from './refresh.js';
import { canvasState } from '../render/canvasState.js';
import { getCraft } from '../data/crafts.js';

// dismissBasePanel is in panels.js — use window reference to avoid circular dep
function dismissBasePanel() { if (window.dismissBasePanel) window.dismissBasePanel(); }

export function openTurretModal(turretId) {
  state.selectedTurret = turretId;
  renderTurretModal();
  document.getElementById('turret-modal-overlay').style.display = 'flex';
}

export function closeTurretModal(e) {
  if (e && e.target !== document.getElementById('turret-modal-overlay')) return;
  document.getElementById('turret-modal-overlay').style.display = 'none';
  state.selectedTurret = null;
}

export function renderTurretModal() {
  const turret = state.turrets.find(t => t.id === state.selectedTurret);
  const body = document.getElementById('turret-modal-body');
  if (!turret || !body) return;

  const hpPct = Math.round(turret.health / turret.maxHealth * 100);
  const hpColor    = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const hpBarColor = hpPct > 60 ? '#4af' : hpPct > 30 ? '#fa4' : '#f44';

  const upgDef = getCraft('turrets', 'turret_upgrade');
  const upgCost = {
    coins: (upgDef?.costPerLevel || 0) * turret.level,
    reqs: Object.fromEntries(Object.entries(upgDef?.reqs || {}).map(([r, n]) => [r, n * turret.level])),
  };
  const canUpgrade = state.coins >= upgCost.coins
    && Object.entries(upgCost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <div style="background:rgba(10,30,10,0.5);border:1px solid #2a4a2a;border-radius:4px;padding:8px;">
        <div style="font-size:9px;letter-spacing:2px;color:#4a8a4a;font-family:'Orbitron',monospace;margin-bottom:3px;">LEVEL</div>
        <div style="font-size:20px;color:#ffe066;font-weight:bold;">${turret.level}</div>
      </div>
      <div style="background:rgba(10,30,10,0.5);border:1px solid #2a4a2a;border-radius:4px;padding:8px;">
        <div style="font-size:9px;letter-spacing:2px;color:#4a8a4a;font-family:'Orbitron',monospace;margin-bottom:3px;">HEALTH</div>
        <div style="font-size:14px;color:${hpColor};font-weight:bold;">${fmt(turret.health)} / ${fmt(turret.maxHealth)}</div>
      </div>
    </div>
    <div style="background:#0a1428;border-radius:3px;height:5px;margin-bottom:10px;overflow:hidden;">
      <div style="height:100%;width:${hpPct}%;background:${hpBarColor};transition:width 0.3s;"></div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;font-size:13px;">
      <tr>
        <td style="color:#4a7a4a;padding:4px 0;">⚡ Damage</td>
        <td style="color:#cde;font-weight:bold;text-align:right;">${turret.damage}</td>
      </tr>
      <tr>
        <td style="color:#4a7a4a;padding:4px 0;">◎ Range</td>
        <td style="color:#cde;font-weight:bold;text-align:right;">${turret.range} tiles</td>
      </tr>
    </table>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4a8a4a;margin-bottom:6px;">◈ UPGRADE</div>
    <div class="bp-craft-reqs" style="margin-bottom:8px;">
      ${(() => {
        const c1 = state.coins >= upgCost.coins;
        const reqEntries = Object.entries(upgCost.reqs);
        const pill  = (met, label) => '<span class="bp-craft-req '+(met?'met':'unmet')+'" style="font-size:12px;">'+label+'</span>';
        const cpill = (met, label) => '<span class="bp-craft-req" style="font-size:12px;border-color:'+(met?'#7a6010':'#802020')+';background:'+(met?'rgba(60,45,0,0.4)':'rgba(60,10,10,0.4)')+';color:'+(met?'#ffe066':'#f88')+';">'+label+'</span>';
        return cpill(c1, upgCost.coins+'¢') + reqEntries.map(([r, n]) => pill((state.resources[r]||0) >= n, `${r[0].toUpperCase()+r.slice(1)}: ${n}`)).join('');
      })()}
    </div>
    <div style="font-size:11px;color:#4a6a4a;margin-bottom:8px;">Upgrade boosts: +500 HP · +20 Damage · +1 Range</div>
    <button class="btn primary" style="width:100%;font-size:12px;margin-bottom:6px;" ${canUpgrade?'':'disabled'} onclick="upgradeTurret(${turret.id})">⬆ UPGRADE TURRET</button>
    <button class="btn" style="width:100%;font-size:12px;margin-bottom:6px;background:rgba(20,50,80,0.6);border-color:#2a6a8a;color:#8ab;" onclick="startMoveTurret(${turret.id})">↔ MOVE TURRET</button>
    <button class="btn danger" style="width:100%;font-size:12px;" onclick="confirmScrapTurret(${turret.id})">⊘ SELL TURRET</button>
  `;
}

window.upgradeTurret = function(id) {
  const turret = state.turrets.find(t => t.id === id);
  if (!turret) return;
  const upgDef = getCraft('turrets', 'turret_upgrade');
  const cost = {
    coins: (upgDef?.costPerLevel || 0) * turret.level,
    reqs: Object.fromEntries(Object.entries(upgDef?.reqs || {}).map(([r, n]) => [r, n * turret.level])),
  };
  if (state.coins < cost.coins) return;
  for (const [r, n] of Object.entries(cost.reqs)) if ((state.resources[r] || 0) < n) return;
  state.coins -= cost.coins;
  for (const [r, n] of Object.entries(cost.reqs)) state.resources[r] -= n;
  turret.level++;
  turret.maxHealth += 500; turret.health = Math.min(turret.health + 500, turret.maxHealth);
  turret.damage += 20;
  turret.range = Math.min(turret.range + 1, 12);
  addLog(`🔫 Turret upgraded to Level ${turret.level}!`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  renderTurretModal();
};

window.confirmScrapTurret = function(id) {
  const turret = state.turrets.find(t => t.id === id);
  if (!turret) return;
  let refundCoins = 500;
  for (let l = 1; l < turret.level; l++) refundCoins += 200 * l;
  const refundIron = 10, refundCopper = 5;
  const body = document.getElementById('turret-modal-body');
  if (!body) return;
  body.innerHTML = `
    <div style="text-align:center;padding:12px 0;">
      <div style="font-size:14px;color:#cde;margin-bottom:8px;">⊘ Sell this turret?</div>
      <div style="font-size:12px;color:#8ab;margin-bottom:16px;">You will recover:<br>
        <span style="color:#ffe066;font-weight:bold;">${fmt(refundCoins)}¢</span> +
        <span style="color:#4d8;">${refundIron} Iron</span> +
        <span style="color:#4d8;">${refundCopper} Copper</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn danger" style="flex:1;" onclick="doScrapTurret(${id},${refundCoins},${refundIron},${refundCopper})">⊘ CONFIRM SELL</button>
        <button class="btn" style="flex:1;" onclick="renderTurretModal()">CANCEL</button>
      </div>
    </div>`;
};

window.doScrapTurret = function(id, refundCoins, refundIron, refundCopper) {
  state.coins += refundCoins;
  state.resources.iron   = (state.resources.iron   || 0) + refundIron;
  state.resources.copper = (state.resources.copper || 0) + refundCopper;
  state.turrets = state.turrets.filter(t => t.id !== id);
  document.getElementById('turret-modal-overlay').style.display = 'none';
  state.selectedTurret = null;
  addLog(`🔫 Turret sold — recovered ${fmt(refundCoins)}¢ + ${refundIron} Iron + ${refundCopper} Copper.`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
};

window.startMoveTurret = function(id) {
  const turret = state.turrets.find(t => t.id === id);
  if (!turret) return;
  state.movingTurret = id;
  state.placingTurret = true;
  document.getElementById('turret-modal-overlay').style.display = 'none';
  addLog('↔ Click a free tile to move the turret. Press Esc to cancel.');
  document.getElementById('main-canvas').style.cursor = 'crosshair';
};

window.startPlaceTurret = function() {
  const turretDef = getCraft('turrets', 'turret');
  if (!turretDef) return;
  if (state.coins < turretDef.cost) return;
  for (const [r, n] of Object.entries(turretDef.reqs)) if ((state.resources[r] || 0) < n) return;
  state.coins -= turretDef.cost;
  for (const [r, n] of Object.entries(turretDef.reqs)) state.resources[r] -= n;
  state.unplacedTurrets++;
  state.placingTurret = true;
  dismissBasePanel();
  addLog('🔫 Click a free tile on the map to place your turret. Press Esc to cancel.');
  document.getElementById('main-canvas').style.cursor = 'crosshair';
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
};

export function cancelTurretPlacement() {
  if (!state.placingTurret) return;
  state.placingTurret = false;
  document.getElementById('main-canvas').style.cursor = '';
  canvasState.turretHoverCol = -1;
  canvasState.turretHoverRow = -1;
  addLog('🔫 Turret placement cancelled.');
  if (refresh.ui) refresh.ui();
}

window.beginPlacingTurret = function() {
  if (state.unplacedTurrets <= 0) return;
  state.placingTurret = true;
  dismissBasePanel();
  addLog('🔫 Click a free tile on the map to place your turret. Press Esc to cancel.');
  document.getElementById('main-canvas').style.cursor = 'crosshair';
};

// Expose functions needed by dynamically-rendered HTML onclick handlers
window.openTurretModal = openTurretModal;
window.closeTurretModal = closeTurretModal;
window.renderTurretModal = renderTurretModal;
window.cancelTurretPlacement = cancelTurretPlacement;
