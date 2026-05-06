// ============================================================
// TURRET UI — modal, upgrade, place, move, scrap
// ============================================================
import { state } from '../state.js';
import { addLog, fmt, addCoins, spendCoins } from '../helpers.js';
import { refresh } from './refresh.js';
import { canvasState } from '../render/canvasState.js';
import { getCraft } from '../data/crafts.js';
import {
  TURRET_UPGRADE_DELTA, TURRET_MAX_RANGE, TURRET_MAX_LEVEL, TURRET_BUILD_COST,
  TURRET_SCRAP_BASE_COINS,
  TURRET_SCRAP_IRON, TURRET_SCRAP_COPPER, getTurretTypeDef, getTurretStats,
} from '../data/turrets.js';

function getTurretUpgradeCost(turret) {
  const buildDef = getCraft('turrets', turret.type || 'turret');
  const coinBase = Math.floor((buildDef?.cost || TURRET_BUILD_COST.coins || 0) * 0.6);
  const reqBase = Object.fromEntries(
    Object.entries(buildDef?.reqs || {}).map(([r, n]) => [r, Math.max(1, Math.floor(n * 0.6))])
  );
  return {
    coins: coinBase * turret.level,
    reqs: Object.fromEntries(Object.entries(reqBase).map(([r, n]) => [r, n * turret.level])),
  };
}

function getTurretUpgradeInvestedCoins(turret) {
  let total = 0;
  const tmp = { ...turret, level: 1 };
  for (let lvl = 1; lvl < (turret.level || 1); lvl++) {
    tmp.level = lvl;
    total += getTurretUpgradeCost(tmp).coins;
  }
  return total;
}

// dismissBasePanel is in panels.js — use window reference to avoid circular dep
function dismissBasePanel() { if (window.dismissBasePanel) window.dismissBasePanel(); }
function dismissHdrPanel() { if (window.dismissHdrModal) window.dismissHdrModal(); }

const TURRET_CRAFT_TIME_MS = {
  turret: 10000,
  laser_turret: 16000,
  emp_turret: 30000,
};

function getTurretCraftTimeMs(turretType = 'turret') {
  return TURRET_CRAFT_TIME_MS[turretType] || TURRET_CRAFT_TIME_MS.turret;
}

function completeCraftTurret(turretType) {
  const timer = state.turretCraftTimers?.[turretType];
  if (!timer) return;
  delete state.turretCraftTimers[turretType];
  if (!Array.isArray(state.unplacedTurretQueue)) state.unplacedTurretQueue = [];
  state.unplacedTurretQueue.push(turretType);
  state.unplacedTurrets = state.unplacedTurretQueue.length;
  const turretDef = getCraft('turrets', turretType);
  addLog(`✅ ${turretDef?.name || 'Turret'} ready to place.`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
}

function scheduleTurretCraftCompletion(turretType, endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.turretCraftTimers?.[turretType];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftTurret(turretType);
    else scheduleTurretCraftCompletion(turretType, timer.endsAt);
  }, wait + 5);
}

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
  const title = document.getElementById('turret-modal-title');
  if (!turret || !body) return;
  const turretDef = getTurretTypeDef(turret.type);
  const turretStats = getTurretStats(turret.type, turret.level);
  if (title) title.textContent = turretDef.name.toUpperCase();
  const turretMaxRange = turretDef.rangeMax ?? TURRET_MAX_RANGE;
  const turretRangeUpgrade = turretDef.rangeUpgrade ?? TURRET_UPGRADE_DELTA.range;
  const hpUpgrade = turretDef.healthPerLevel || 0;
  const dmgUpgrade = turretDef.damagePerLevel || 0;

  const hpPct = Math.round(turret.health / turret.maxHealth * 100);
  const hpColor    = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const hpBarColor = hpPct > 60 ? '#4af' : hpPct > 30 ? '#fa4' : '#f44';

  const upgCost = getTurretUpgradeCost(turret);
  const atMaxLevel = turret.level >= TURRET_MAX_LEVEL;
  const rangeLabel = turret.range >= turretMaxRange ? `${turret.range} tiles (MAX)` : `${turret.range} tiles`;
  const canUpgrade = !atMaxLevel && state.coins >= upgCost.coins
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
        <td style="color:#4a7a4a;padding:4px 0;">• ${turretDef.baseDamage > 0 ? 'Damage' : 'Stun Duration'}</td>
        <td style="color:#cde;font-weight:bold;text-align:right;">${turretDef.baseDamage > 0 ? turret.damage : `${turret.stunDuration.toFixed(2).replace(/\.00$/, '')}s`}</td>
      </tr>
      <tr>
        <td style="color:#4a7a4a;padding:4px 0;">• ${turretDef.baseDamage > 0 ? 'Fire Rate' : 'Stun Duration Max'}</td>
        <td style="color:#cde;font-weight:bold;text-align:right;">${turretDef.baseDamage > 0 ? `${turret.fireRate.toFixed(2).replace(/\.00$/, '')}s` : `${(turretDef.maxStunDuration || turretStats.stunDuration).toFixed(2).replace(/\.00$/, '')}s @ Lv50`}</td>
      </tr>
      <tr>
        <td style="color:#4a7a4a;padding:4px 0;">• Range</td>
        <td style="color:#cde;font-weight:bold;text-align:right;">${rangeLabel}</td>
      </tr>
    </table>
    <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#4a8a4a;margin-bottom:6px;">◈ UPGRADE</div>
    <div class="bp-craft-reqs" style="margin-bottom:8px;">
      ${(() => {
        const c1 = state.coins >= upgCost.coins;
        const reqEntries = Object.entries(upgCost.reqs);
        const pill  = (met, label) => '<span class="bp-craft-req '+(met?'met':'unmet')+'">'+label+'</span>';
        const cpill = (met, label) => '<span class="bp-craft-req" style="border-color:'+(met?'#7a6010':'#802020')+';background:'+(met?'rgba(60,45,0,0.4)':'rgba(60,10,10,0.4)')+';color:'+(met?'#ffe066':'#f88')+';">'+label+'</span>';
        return cpill(c1, '$'+upgCost.coins) + reqEntries.map(([r, n]) => pill((state.resources[r]||0) >= n, `${r[0].toUpperCase()+r.slice(1)}: ${n}`)).join('');
      })()}
    </div>
    <div style="font-size:11px;color:#4a6a4a;margin-bottom:8px;">Upgrade boosts: ${hpUpgrade > 0 ? `+${hpUpgrade} HP` : 'HP unchanged'} · ${turretDef.baseDamage > 0 ? `+${dmgUpgrade} Damage` : 'Stun scales to 8s by Lv50'} · +${turretRangeUpgrade} Range${turretDef.baseDamage > 0 && (turretDef.minFireRate || 0) > 0 ? ` · fire rate improves to ${turretDef.minFireRate}s by Lv50` : ''}</div>
    <button class="btn primary" style="width:100%;font-size:12px;margin-bottom:6px;" ${canUpgrade?'':'disabled'} onclick="upgradeTurret(${turret.id})">${atMaxLevel ? '★ MAX LEVEL' : '⬆ UPGRADE TURRET'}</button>
    <button class="btn" style="width:100%;font-size:12px;margin-bottom:6px;background:rgba(20,50,80,0.6);border-color:#2a6a8a;color:#8ab;" onclick="startMoveTurret(${turret.id})">↔ MOVE TURRET</button>
    <button class="btn danger" style="width:100%;font-size:12px;" onclick="confirmScrapTurret(${turret.id})">⊘ SELL TURRET</button>
  `;
}

window.upgradeTurret = function(id) {
  const turret = state.turrets.find(t => t.id === id);
  if (!turret) return;
  if (turret.level >= TURRET_MAX_LEVEL) return;
  const cost = getTurretUpgradeCost(turret);
  if (state.coins < cost.coins) return;
  for (const [r, n] of Object.entries(cost.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(cost.coins);
  for (const [r, n] of Object.entries(cost.reqs)) state.resources[r] -= n;
  const prevMaxHealth = turret.maxHealth;
  turret.level++;
  const nextStats = getTurretStats(turret.type, turret.level);
  turret.maxHealth = nextStats.maxHealth;
  turret.health = Math.min(turret.health + (nextStats.maxHealth - prevMaxHealth), turret.maxHealth);
  turret.damage = nextStats.damage;
  turret.range = nextStats.range;
  turret.fireRate = nextStats.fireRate;
  turret.stunDuration = nextStats.stunDuration;
  addLog(`${getTurretTypeDef(turret.type).name} upgraded to Level ${turret.level}!`);
  if (window.patchSolPanel) window.patchSolPanel('power');
  if (refresh.ui) refresh.ui();
  renderTurretModal();
};

window.confirmScrapTurret = function(id) {
  const turret = state.turrets.find(t => t.id === id);
  if (!turret) return;
  const buildCoins = TURRET_BUILD_COST.coins || 0;
  const investedUpgradeCoins = getTurretUpgradeInvestedCoins(turret);
  const investedCoins = buildCoins + investedUpgradeCoins;
  const refundCoins = Math.max(
    TURRET_SCRAP_BASE_COINS,
    Math.floor(investedCoins * 0.75)
  );
  const refundIron = TURRET_SCRAP_IRON, refundCopper = TURRET_SCRAP_COPPER;
  const body = document.getElementById('turret-modal-body');
  if (!body) return;
  body.innerHTML = `
    <div style="text-align:center;padding:12px 0;">
      <div style="font-size:14px;color:#cde;margin-bottom:8px;">⊘ Sell this turret?</div>
      <div style="font-size:12px;color:#8ab;margin-bottom:16px;">You will recover:<br>
        <span style="color:#6fff9a;font-weight:bold;">$${fmt(refundCoins)}</span> +
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
  const soldTurret = state.turrets.find(t => t.id === id);
  const soldTurretName = getTurretTypeDef(soldTurret?.type).name;
  if (!addCoins(refundCoins)) return;
  state.resources.iron   = (state.resources.iron   || 0) + refundIron;
  state.resources.copper = (state.resources.copper || 0) + refundCopper;
  state.turrets = state.turrets.filter(t => t.id !== id);
  document.getElementById('turret-modal-overlay').style.display = 'none';
  state.selectedTurret = null;
  addLog(`${soldTurretName} sold — recovered ${fmt(refundCoins)}¢ + ${refundIron} Iron + ${refundCopper} Copper.`);
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
  const turretType = arguments[0] || 'turret';
  const turretDef = getCraft('turrets', turretType);
  if (!turretDef) return;
  if (state.turretCraftTimers?.[turretType] && Date.now() < state.turretCraftTimers[turretType].endsAt) return;
  if (state.coins < turretDef.cost) return;
  for (const [r, n] of Object.entries(turretDef.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(turretDef.cost);
  for (const [r, n] of Object.entries(turretDef.reqs)) state.resources[r] -= n;
  const durationMs = getTurretCraftTimeMs(turretType);
  const now = Date.now();
  if (!state.turretCraftTimers) state.turretCraftTimers = {};
  state.turretCraftTimers[turretType] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: ${turretDef.name} (${Math.ceil(durationMs / 1000)}s)`);
  scheduleTurretCraftCompletion(turretType, now + durationMs);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  if (window._hdrPanelOpen === 'craft') { window._hdrPanelOpen = null; window.openHdrPanel?.('craft'); }
};

export function cancelTurretPlacement() {
  if (!state.placingTurret) return;
  state.placingTurret = false;
  state.placingTurretType = null;
  document.getElementById('main-canvas').style.cursor = '';
  canvasState.turretHoverCol = -1;
  canvasState.turretHoverRow = -1;
  addLog('Turret placement cancelled.');
  if (refresh.ui) refresh.ui();
}

window.beginPlacingTurret = function() {
  const turretType = arguments[0] || 'turret';
  const queue = Array.isArray(state.unplacedTurretQueue) ? state.unplacedTurretQueue : [];
  if (!queue.includes(turretType)) return;
  state.placingTurret = true;
  state.placingTurretType = turretType;
  dismissHdrPanel();
  dismissBasePanel();
  document.getElementById('main-canvas').style.cursor = 'crosshair';
};

window.syncTurretCraftTimers = function() {
  if (!state.turretCraftTimers) return;
  for (const [turretType, timer] of Object.entries(state.turretCraftTimers)) {
    if (!timer || !timer.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftTurret(turretType);
    else scheduleTurretCraftCompletion(turretType, timer.endsAt);
  }
};

window.syncTurretCraftTimers();

// Expose functions needed by dynamically-rendered HTML onclick handlers
window.openTurretModal = openTurretModal;
window.closeTurretModal = closeTurretModal;
window.renderTurretModal = renderTurretModal;
window.cancelTurretPlacement = cancelTurretPlacement;
