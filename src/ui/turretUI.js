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
  TURRET_SCRAP_IRON, TURRET_SCRAP_COPPER, getTurretPowerCapacity, getTurretPowerUsage, getTurretTypeDef, getTurretStats,
} from '../data/turrets.js';
import { getPowerModuleNetworkInfo, invalidateNetworkCache } from '../data/modules.js';
import { toRoman } from '../data/ships.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
  placeFloatingWindow,
} from './floatingWindow.js';

const TURRET_LAYOUT_KEY = 'turret';

function getTurretById(id = state.selectedTurret) {
  return state.turrets.find((turret) => turret.id === id) || null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTurretFireRate(turret) {
  if (turret?.type === 'turret') {
    const shotsPerSecond = 1 / Math.max(0.0001, turret.fireRate || 1);
    return `${shotsPerSecond.toFixed(1).replace(/\.0$/, '')}/s`;
  }
  return `${(turret?.fireRate || 0).toFixed(2).replace(/\.00$/, '')}s`;
}

function applyTurretModalPosition(modal, left = null, top = null) {
  const overlay = document.getElementById('turret-modal-overlay');
  applyFloatingPosition(overlay, modal, left, top);
}

function initTurretModalDrag() {
  const overlay = document.getElementById('turret-modal-overlay');
  const modal = document.getElementById('turret-modal');
  if (!overlay || !modal) return;
  initFloatingDrag(modal, overlay, {
    handleSelector: '.turret-modal-drag-handle',
    layoutKey: TURRET_LAYOUT_KEY,
    isActive: () => overlay.style.display === 'flex',
  });
  initFloatingResize(modal, overlay, {
    minW: 420,
    minH: 300,
    layoutKey: TURRET_LAYOUT_KEY,
    isActive: () => overlay.style.display === 'flex',
  });
  bringFloatingToFront(modal);
}

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
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
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
  initTurretModalDrag();
  const overlay = document.getElementById('turret-modal-overlay');
  const modal = document.getElementById('turret-modal');
  if (overlay) overlay.style.display = 'flex';
  renderTurretModal();
  const place = () => centerFloatingWindow(overlay, modal, TURRET_LAYOUT_KEY);
  place();
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(place);
  });
  bringFloatingToFront(modal);
}

export function closeTurretModal(e) {
  if (e && e.target !== document.getElementById('turret-modal-overlay')) return;
  document.getElementById('turret-modal-overlay').style.display = 'none';
  state.selectedTurret = null;
}

export function renderTurretModal() {
  const turret = getTurretById();
  const body = document.getElementById('turret-modal-body');
  const title = document.getElementById('turret-modal-title');
  if (!turret || !body) return;
  turret.level = Math.min(TURRET_MAX_LEVEL, Math.max(1, turret.level || 1));
  const turretStats = getTurretStats(turret.type, turret.level);
  turret.maxHealth = turretStats.maxHealth;
  turret.health = Math.min(turret.health, turret.maxHealth);
  turret.damage = turretStats.damage;
  turret.range = turretStats.range;
  turret.fireRate = turretStats.fireRate;
  turret.stunDuration = turretStats.stunDuration;
  turret.powerUsage = getTurretPowerUsage(turret);
  turret.powerCapacity = getTurretPowerCapacity(turret);
  turret.power = Math.max(0, Math.min(turret.power || 0, turret.powerCapacity));
  if (body.dataset.turretId !== String(turret.id) || body.dataset.mode !== 'details') {
    body.dataset.turretId = String(turret.id);
    body.dataset.mode = 'details';
    body.innerHTML = `
      <div class="storage-modal-hero">
        <div class="storage-modal-hero-row">
          <div class="storage-modal-hero-pad">
            <span id="turret-modal-name" class="storage-modal-name"></span>
            <button id="turret-rename-hero-btn" title="Rename Turret" class="storage-modal-rename-btn">✎</button>
          </div>
          <div class="storage-modal-hero-pad">
            <div id="turret-tier-pill" class="storage-modal-tier-pill" style="background:#ff5d5d;color:#fff;"></div>
          </div>
        </div>
      </div>
      <div class="module-health-card bp-health-card ok">
        <div class="module-health-head">
          <div class="module-health-label">HEALTH</div>
          <div id="turret-health-value" class="module-health-value"></div>
        </div>
        <div class="module-health-track"><div id="turret-health-bar" class="module-health-bar"></div></div>
      </div>
      <div id="turret-operational-banner" class="module-status-banner module-status-banner-online" style="margin-bottom:10px;">ONLINE</div>
      <div class="module-section-label-tight module-divider-top">◈ DEFENSE</div>
      <div class="power-station-fuel-table-wrap" style="margin-bottom:10px;">
        <table class="power-station-fuel-table">
          <thead><tr><th>Damage</th><th>Fire Rate</th><th>Range</th><th id="turret-stat-special-head" style="display:none;">Power Drive</th></tr></thead>
          <tbody><tr><td id="turret-stat-damage"></td><td id="turret-stat-fire-rate"></td><td id="turret-stat-range"></td><td id="turret-stat-special" style="display:none;"></td></tr></tbody>
        </table>
      </div>
      <div class="module-divider-top">
        <div class="module-section-label-tight">◈ POWER</div>
        <div class="storage-power-panel">
          <div class="storage-power-head">
            <span class="storage-power-icon">ϟ</span>
            <span class="storage-power-title">POWER GRID</span>
          </div>
          <table class="storage-power-table">
            <thead><tr><th>Usage</th><th>Capacity</th><th>Connected</th></tr></thead>
            <tbody><tr><td id="turret-power-usage"></td><td id="turret-power-value"></td><td id="turret-power-connected"></td></tr></tbody>
          </table>
          <div class="module-bar-row">
            <span class="storage-power-icon">ϟ</span>
            <div class="module-meter-track" style="flex:1;"><div id="turret-power-bar" class="module-meter-bar" style="background:linear-gradient(90deg,#caa020,#ffe066);transition:width 0.3s;"></div></div>
          </div>
        </div>
        <div id="turret-no-power-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO POWER</div>
      </div>
      <div class="module-section-label-tight">◈ UPGRADE</div>
      <div id="turret-upgrade-reqs" class="bp-craft-reqs" style="margin-bottom:8px;"></div>
      <div class="module-upgrade-grid" style="grid-template-columns:repeat(4,1fr);">
        <button id="turret-upgrade-btn" class="btn primary module-btn-small">UPGRADE</button>
        <button id="turret-move-btn" class="btn module-btn-small module-btn-move">MOVE</button>
        <button id="turret-rename-btn" class="btn module-btn-small module-btn-rename">RENAME</button>
        <button id="turret-sell-btn" class="btn danger module-btn-small">SELL</button>
      </div>
    `;
  }
  const turretDef = getTurretTypeDef(turret.type);
  if (title) title.textContent = turretDef.name.toUpperCase();
  const turretMaxRange = turretDef.rangeMax ?? TURRET_MAX_RANGE;
  const hpPct = Math.round(turret.health / turret.maxHealth * 100);
  const hpColor    = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const hpBarColor = hpPct > 60 ? 'linear-gradient(90deg,#2a8040,#4d8)' : hpPct > 30 ? '#fa4' : '#f44';
  const noPower = (turret.power || 0) <= 0;
  const offline = (turret.health || 0) <= 0 || noPower;
  const powerPct = Math.round(((turret.power || 0) / Math.max(1, turret.powerCapacity || 1)) * 100);
  const powerDrive = turretStats.powerDrive || 0;

  const upgCost = getTurretUpgradeCost(turret);
  const atMaxLevel = turret.level >= TURRET_MAX_LEVEL;
  const rangeLabel = turret.range >= turretMaxRange ? `${turret.range} tiles (MAX)` : `${turret.range} tiles`;
  const canUpgrade = !atMaxLevel && state.coins >= upgCost.coins
    && Object.entries(upgCost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  const networkInfo = getPowerModuleNetworkInfo(turret.id, state.modules, state.turrets);
  const connectedPoleNames = networkInfo.poles.map((pole) => pole.name).filter(Boolean);
  const setTextIfChanged = (selector, value) => {
    const el = body.querySelector(selector);
    if (el && el.textContent !== value) el.textContent = value;
  };
  const setHtmlIfChanged = (selector, value) => {
    const el = body.querySelector(selector);
    if (el && el.innerHTML !== value) el.innerHTML = value;
  };
  setTextIfChanged('#turret-modal-name', `⬡ ${turret.name || turretDef.name}`);
  setTextIfChanged('#turret-tier-pill', `TIER ${toRoman(Math.max(1, Math.min(10, turret.level || 1)))}`);
  const renameHeroBtn = body.querySelector('#turret-rename-hero-btn');
  if (renameHeroBtn) renameHeroBtn.onclick = () => window.openTurretRenameOverlay?.(turret.id);
  setTextIfChanged('#turret-health-value', `${fmt(turret.health)} / ${fmt(turret.maxHealth)}`);
  const healthValue = body.querySelector('#turret-health-value');
  if (healthValue) healthValue.style.color = hpColor;
  const healthBar = body.querySelector('#turret-health-bar');
  if (healthBar) {
    healthBar.style.width = `${hpPct}%`;
    healthBar.style.background = hpBarColor;
  }
  const banner = body.querySelector('#turret-operational-banner');
  if (banner) {
    banner.textContent = offline ? (noPower ? 'NO POWER' : 'OFFLINE') : 'ONLINE';
    banner.className = `module-status-banner ${offline ? 'module-status-banner-offline' : 'module-status-banner-online'}`;
  }
  setTextIfChanged('#turret-stat-damage', turretDef.baseDamage > 0 ? String(turret.damage) : `${turret.stunDuration.toFixed(2).replace(/\.00$/, '')}s Stun`);
  setTextIfChanged('#turret-stat-fire-rate', formatTurretFireRate(turret));
  setTextIfChanged('#turret-stat-range', rangeLabel);
  const specialHead = body.querySelector('#turret-stat-special-head');
  const specialValue = body.querySelector('#turret-stat-special');
  if (specialHead && specialValue) {
    const showPowerDrive = powerDrive > 0;
    specialHead.style.display = showPowerDrive ? '' : 'none';
    specialValue.style.display = showPowerDrive ? '' : 'none';
    if (showPowerDrive) setTextIfChanged('#turret-stat-special', String(powerDrive));
  }
  setTextIfChanged('#turret-power-usage', `${(turret.powerUsage || getTurretPowerUsage(turret)).toFixed(1).replace(/\.0$/, '')}/s`);
  setTextIfChanged('#turret-power-value', `${fmt(Math.round(turret.power || 0))} / ${fmt(turret.powerCapacity || 0)}`);
  const connectedHtml = connectedPoleNames.length
    ? connectedPoleNames.map((name) => escapeHtml(name)).join('<br>')
    : 'None';
  setHtmlIfChanged('#turret-power-connected', connectedHtml);
  const connectedEl = body.querySelector('#turret-power-connected');
  if (connectedEl) connectedEl.style.fontSize = '13px';
  const powerBar = body.querySelector('#turret-power-bar');
  if (powerBar) powerBar.style.width = `${powerPct}%`;
  const noPowerWarning = body.querySelector('#turret-no-power-warning');
  if (noPowerWarning) noPowerWarning.style.display = noPower ? '' : 'none';
  const reqsHtml = (() => {
    const c1 = state.coins >= upgCost.coins;
    const reqEntries = Object.entries(upgCost.reqs);
    const pill  = (met, label) => '<span class="bp-craft-req '+(met?'met':'unmet')+'">'+label+'</span>';
    const cpill = (met, label) => '<span class="bp-craft-req" style="border-color:'+(met?'#2a7a43':'#802020')+';background:'+(met?'rgba(10,60,24,0.42)':'rgba(60,10,10,0.4)')+';color:'+(met?'#6fff9a':'#f88')+';">'+label+'</span>';
    return cpill(c1, '$'+upgCost.coins) + reqEntries.map(([r, n]) => pill((state.resources[r]||0) >= n, `${r[0].toUpperCase()+r.slice(1)}: ${n}`)).join('');
  })();
  const reqsEl = body.querySelector('#turret-upgrade-reqs');
  if (reqsEl && reqsEl.innerHTML !== reqsHtml) reqsEl.innerHTML = reqsHtml;
  const upgradeBtn = body.querySelector('#turret-upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.textContent = atMaxLevel ? '★ MAX' : 'UPGRADE';
    upgradeBtn.disabled = !canUpgrade;
    upgradeBtn.onclick = () => window.upgradeTurret?.(turret.id);
  }
  const moveBtn = body.querySelector('#turret-move-btn');
  if (moveBtn) moveBtn.onclick = () => window.startMoveTurret?.(turret.id);
  const renameBtn = body.querySelector('#turret-rename-btn');
  if (renameBtn) renameBtn.onclick = () => window.openTurretRenameOverlay?.(turret.id);
  const sellBtn = body.querySelector('#turret-sell-btn');
  if (sellBtn) sellBtn.onclick = () => window.confirmScrapTurret?.(turret.id);
}

export function patchTurretModal() {
  if (!state.selectedTurret) return;
  const body = document.getElementById('turret-modal-body');
  if (body?.dataset.mode && body.dataset.mode !== 'details') return;
  renderTurretModal();
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
  turret.powerUsage = getTurretPowerUsage(turret);
  turret.powerCapacity = Math.max(turret.powerCapacity || 0, getTurretPowerCapacity(turret));
  turret.power = Math.min(turret.power || turret.powerCapacity, turret.powerCapacity);
  invalidateNetworkCache();
  addLog(`${getTurretTypeDef(turret.type).name} upgraded to Rank ${turret.level}!`);
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
  const name = turret.name || getTurretTypeDef(turret.type).name;
  if (window.openTurretSellOverlay) {
    window.openTurretSellOverlay(id, name, refundCoins, refundIron, refundCopper);
    return;
  }
};

window.doScrapTurret = function(id, refundCoins, refundIron, refundCopper) {
  const soldTurret = state.turrets.find(t => t.id === id);
  const soldTurretName = getTurretTypeDef(soldTurret?.type).name;
  if (!addCoins(refundCoins)) return;
  state.resources.iron   = (state.resources.iron   || 0) + refundIron;
  state.resources.copper = (state.resources.copper || 0) + refundCopper;
  state.turrets = state.turrets.filter(t => t.id !== id);
  invalidateNetworkCache();
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
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
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
window.patchTurretModal = patchTurretModal;
window.cancelTurretPlacement = cancelTurretPlacement;
