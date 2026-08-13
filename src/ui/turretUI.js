// ============================================================
// TURRET UI — modal, upgrade, place, move, scrap
// ============================================================
import { state } from '../state.js';
import { addLog, fmt, addCoins, spendCoins, isLightColor } from '../helpers.js';
import { scaleCraftReqs } from '../systems/factions.js';
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
import { MINE_TIERS } from '../data/resources.js';
import { getNetworkPanelHtml, patchEntityNetworkPanel } from './storageUI.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
  placeFloatingWindow,
} from './floatingWindow.js';
import { bumpPirateStatusOnExpand } from '../systems/combat.js';
import { enqueueCraftJob, canEnqueueCraft, getCraftQueueCap } from '../systems/craftQueue.js';

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

window.completeCraftTurretJob = function(job) {
  const turretType = job?.recipeId || 'turret';
  if (!Array.isArray(state.unplacedTurretQueue)) state.unplacedTurretQueue = [];
  state.unplacedTurretQueue.push(turretType);
  state.unplacedTurrets = state.unplacedTurretQueue.length;
  const turretDef = getCraft('turrets', turretType);
  addLog(`✅ ${turretDef?.name || 'Turret'} ready to place.`);
  bumpPirateStatusOnExpand();
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
};

export function openTurretModal(turretId) {
  state.selectedTurret = turretId;
  initTurretModalDrag();
  const overlay = document.getElementById('turret-modal-overlay');
  const modal = document.getElementById('turret-modal');
  if (modal) {
    modal.classList.add('storage-modal-window', 'storage-modal-window-lab', 'modal-accent-defense');
    // Same default footprint as building modals
    if (modal.dataset.moved !== '1') {
      modal.style.width = '1000px';
      modal.style.height = '720px';
      modal.dataset.width = '1000';
      modal.dataset.height = '720';
    }
  }
  if (overlay) overlay.style.display = 'flex';
  const body = document.getElementById('turret-modal-body');
  if (body) {
    body.dataset.turretId = '';
    body.dataset.mode = '';
    body.dataset.layoutVer = '';
    body.className = 'storage-modal-body storage-modal-body-lab';
    body.style.padding = '12px';
    body.innerHTML = '';
  }
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
  // Overlay backdrop clicks pass the event; programmatic closes pass nothing/null.
  if (e && e.target !== document.getElementById('turret-modal-overlay')) return;
  const overlay = document.getElementById('turret-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  state.selectedTurret = null;
}

/** Returns true if the turret modal was open and is now closed. */
export function closeTurretModalIfOpen() {
  const overlay = document.getElementById('turret-modal-overlay');
  if (!overlay || overlay.style.display !== 'flex') return false;
  closeTurretModal(null);
  return true;
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
  const LAYOUT_VER = 'tu-v6-footer';
  if (body.dataset.turretId !== String(turret.id) || body.dataset.layoutVer !== LAYOUT_VER) {
    body.dataset.turretId = String(turret.id);
    body.dataset.mode = 'details';
    body.dataset.layoutVer = LAYOUT_VER;
    body.innerHTML = `
      <div class="lab-layout st-layout tu-layout" data-turret-id="${turret.id}" data-module-id="${turret.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="turret-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button id="turret-rename-hero-btn" type="button" title="Rename Turret" class="storage-modal-rename-btn">✎</button>
              <div id="turret-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="turret-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="turret-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="turret-tier-pill" class="lab-tier-badge">TIER I</div>
        </div>

        <div class="mod-tabs sm-tabs">
          <button type="button" class="mod-tab sm-tab on" data-tab="details" onclick="setModuleModalTab(this,'details')">
            <span class="ms-icon">circles</span> DETAILS
          </button>
          <button type="button" class="mod-tab sm-tab" data-tab="network" onclick="setModuleModalTab(this,'network')">
            <span class="ms-icon">hub</span> NETWORK
          </button>
        </div>

        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid st-details-grid">
              <div class="st-left-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ POWER</div>
                  <div class="lab-power-block">
                    <div class="lab-meter-head">
                      <span class="lab-meter-label"><span class="lab-power-icon">ϟ</span>Power</span>
                      <span id="turret-power-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-power-meta">
                      <span>Usage <strong id="turret-power-usage"></strong></span>
                      <span>Capacity</span>
                    </div>
                    <div class="lab-meter-track"><div id="turret-power-bar" class="lab-meter-bar lab-meter-bar-power"></div></div>
                    <div id="turret-no-power-warning" class="storage-no-power-warning" style="display:none;margin-top:8px;">WARNING: NO POWER</div>
                  </div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ SYSTEMS</div>
                  <div class="sm-info-row"><span class="k">STATUS</span><span class="val" id="turret-sys-status">ONLINE</span></div>
                  <div class="sm-info-row"><span class="k">TYPE</span><span class="val" id="turret-sys-type">—</span></div>
                </div>
              </div>
              <div class="sm-info-block sm-info-block-fill tu-defense-col">
                <div class="blk-title">◈ DEFENSE</div>
                <div class="tu-stat-grid">
                  <div class="tu-stat-card">
                    <span class="ms-icon tu-stat-icon" id="turret-stat-damage-icon">swords</span>
                    <span class="tu-stat-label" id="turret-stat-damage-label">DAMAGE</span>
                    <span class="tu-stat-value" id="turret-stat-damage">—</span>
                  </div>
                  <div class="tu-stat-card">
                    <span class="ms-icon tu-stat-icon">speed</span>
                    <span class="tu-stat-label">FIRE RATE</span>
                    <span class="tu-stat-value" id="turret-stat-fire-rate">—</span>
                  </div>
                  <div class="tu-stat-card">
                    <span class="ms-icon tu-stat-icon">radar</span>
                    <span class="tu-stat-label">RANGE</span>
                    <span class="tu-stat-value" id="turret-stat-range">—</span>
                  </div>
                  <div class="tu-stat-card" id="turret-stat-special-row" hidden>
                    <span class="ms-icon tu-stat-icon">bolt</span>
                    <span class="tu-stat-label" id="turret-stat-special-head">POWER DRIVE</span>
                    <span class="tu-stat-value" id="turret-stat-special">—</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${getNetworkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="turret-upgrade-btn" class="btn primary" type="button">UPGRADE</button>
            <button id="turret-repair-btn" class="btn" type="button" style="display:none;">REPAIR</button>
            <button id="turret-move-btn" class="btn" type="button">MOVE</button>
            <button id="turret-rename-btn" class="btn" type="button">RENAME</button>
            <button id="turret-sell-btn" class="btn danger" type="button">SELL</button>
          </div>
        </div>
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
  const setTextIfChanged = (selector, value) => {
    const el = body.querySelector(selector);
    if (el && el.textContent !== value) el.textContent = value;
  };
  const setHtmlIfChanged = (selector, value) => {
    const el = body.querySelector(selector);
    if (el && el.innerHTML !== value) el.innerHTML = value;
  };
  const tierLvl = Math.max(1, Math.min(10, turret.level || 1));
  const tierColor = MINE_TIERS[tierLvl]?.color || '#ff6a5a';
  setTextIfChanged('#turret-modal-name', `⬡ ${turret.name || turretDef.name}`);
  setTextIfChanged('#turret-tier-pill', `TIER ${toRoman(tierLvl)}`);
  const tierPill = body.querySelector('#turret-tier-pill');
  if (tierPill) {
    const light = isLightColor(tierColor) || tierColor.toLowerCase() === '#ffffff';
    tierPill.style.background = light
      ? `linear-gradient(180deg, #fff 0%, #e8eef8 100%)`
      : tierColor;
    tierPill.style.color = light ? '#111' : '#fff';
    tierPill.style.border = light ? '1px solid rgba(0,0,0,0.18)' : '1px solid transparent';
    tierPill.style.textShadow = light ? 'none' : '0 0 10px rgba(0,0,0,0.35)';
  }
  const renameHeroBtn = body.querySelector('#turret-rename-hero-btn');
  if (renameHeroBtn) renameHeroBtn.onclick = () => window.openTurretRenameOverlay?.(turret.id);
  setTextIfChanged('#turret-health-value', `${fmt(turret.health)} / ${fmt(turret.maxHealth)}`);
  const healthValue = body.querySelector('#turret-health-value');
  if (healthValue) {
    healthValue.style.color = hpColor;
    healthValue.classList.toggle('warn', hpPct <= 60);
  }
  const healthBar = body.querySelector('#turret-health-bar');
  if (healthBar) {
    healthBar.style.width = `${hpPct}%`;
    healthBar.style.background = hpBarColor;
  }
  const banner = body.querySelector('#turret-operational-banner');
  if (banner) {
    banner.textContent = offline ? (noPower ? 'NO POWER' : 'OFFLINE') : 'ONLINE';
    banner.className = `lab-status-pill${offline ? ' offline' : ''}`;
  }
  const isEmp = !(turretDef.baseDamage > 0);
  const dmgLabel = body.querySelector('#turret-stat-damage-label');
  if (dmgLabel) dmgLabel.textContent = isEmp ? 'STUN' : 'DAMAGE';
  const dmgIcon = body.querySelector('#turret-stat-damage-icon');
  if (dmgIcon) dmgIcon.textContent = isEmp ? 'electric_bolt' : 'swords';
  setTextIfChanged(
    '#turret-stat-damage',
    isEmp
      ? `${(turret.stunDuration || 0).toFixed(2).replace(/\.00$/, '')}s`
      : String(turret.damage),
  );
  setTextIfChanged('#turret-stat-fire-rate', formatTurretFireRate(turret));
  setTextIfChanged('#turret-stat-range', rangeLabel.toUpperCase());
  const specialRow = body.querySelector('#turret-stat-special-row');
  if (specialRow) {
    const showPowerDrive = powerDrive > 0;
    specialRow.hidden = !showPowerDrive;
    if (showPowerDrive) setTextIfChanged('#turret-stat-special', String(powerDrive));
  }
  setTextIfChanged('#turret-power-usage', `${(turret.powerUsage || getTurretPowerUsage(turret)).toFixed(1).replace(/\.0$/, '')}/s`);
  setTextIfChanged('#turret-power-value', `${fmt(Math.round(turret.power || 0))} / ${fmt(turret.powerCapacity || 0)}`);
  setTextIfChanged('#turret-sys-status', offline ? (noPower ? 'NO POWER' : 'OFFLINE') : 'ONLINE');
  const sysStatus = body.querySelector('#turret-sys-status');
  if (sysStatus) {
    sysStatus.classList.toggle('green', !offline);
    sysStatus.classList.toggle('warn', offline);
  }
  setTextIfChanged('#turret-sys-type', turretDef.name || 'Turret');
  const powerBar = body.querySelector('#turret-power-bar');
  if (powerBar) powerBar.style.width = `${powerPct}%`;
  const noPowerWarning = body.querySelector('#turret-no-power-warning');
  if (noPowerWarning) noPowerWarning.style.display = noPower ? '' : 'none';
  // Network tab only — same as building modals
  const layoutRoot = body.querySelector('.lab-layout[data-module-id]');
  if (layoutRoot?.querySelector('.mod-tab.on[data-tab="network"]')) {
    patchEntityNetworkPanel(layoutRoot, turret);
  }
  const reqsHtml = (() => {
    if (atMaxLevel) return '';
    const c1 = state.coins >= upgCost.coins;
    const reqEntries = Object.entries(upgCost.reqs);
    const pill = (met, label) => `<span class="bp-craft-req ${met ? 'met' : 'unmet'}">${label}</span>`;
    const cpill = (met, label) => `<span class="bp-craft-req" style="border-color:${met ? '#2a7a43' : '#802020'};background:${met ? 'rgba(10,60,24,0.42)' : 'rgba(60,10,10,0.4)'};color:${met ? '#6fff9a' : '#f88'};">${label}</span>`;
    return cpill(c1, `$${fmt(upgCost.coins)}`)
      + reqEntries.map(([r, n]) => pill((state.resources[r] || 0) >= n, `${r[0].toUpperCase() + r.slice(1)}: ${fmt(n)}`)).join('');
  })();
  const upgradeBtn = body.querySelector('#turret-upgrade-btn');
  if (upgradeBtn) {
    upgradeBtn.textContent = atMaxLevel ? '★ MAX' : 'UPGRADE';
    upgradeBtn.disabled = !canUpgrade;
    upgradeBtn.title = canUpgrade || atMaxLevel
      ? ''
      : `Need ${reqsHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`;
    upgradeBtn.onclick = () => window.upgradeTurret?.(turret.id);
  }
  // Repair — cost = missing HP × rank (same as buildings)
  const missingHp = Math.max(0, Math.ceil((turret.maxHealth || 0) - (turret.health || 0)));
  const repairRank = Math.max(1, Math.floor(turret.level || 1));
  const repairCost = missingHp * repairRank;
  const repairBtn = body.querySelector('#turret-repair-btn');
  if (repairBtn) {
    if (missingHp <= 0) {
      repairBtn.style.display = 'none';
      repairBtn.disabled = true;
    } else {
      const canRepair = (state.coins || 0) >= repairCost;
      repairBtn.style.display = '';
      repairBtn.disabled = !canRepair;
      repairBtn.classList.toggle('primary', canRepair);
      repairBtn.textContent = `REPAIR $${fmt(repairCost)}`;
      repairBtn.onclick = () => window.repairTurret?.(turret.id);
    }
  }
  const moveBtn = body.querySelector('#turret-move-btn');
  if (moveBtn) moveBtn.onclick = () => window.startMoveTurret?.(turret.id);
  const renameBtn = body.querySelector('#turret-rename-btn');
  if (renameBtn) renameBtn.onclick = () => window.openTurretRenameOverlay?.(turret.id);
  const sellBtn = body.querySelector('#turret-sell-btn');
  if (sellBtn) sellBtn.onclick = () => window.confirmScrapTurret?.(turret.id);
}

window.repairTurret = function(id) {
  const turret = state.turrets.find((t) => t.id === id);
  if (!turret) return;
  const maxH = Math.max(0, turret.maxHealth || 0);
  const curH = Math.max(0, turret.health || 0);
  const missing = Math.max(0, Math.ceil(maxH - curH));
  if (missing <= 0 || maxH <= 0) {
    addLog(`${turret.name || 'Turret'} is already at full integrity.`);
    renderTurretModal();
    return;
  }
  const rank = Math.max(1, Math.floor(turret.level || 1));
  const cost = missing * rank;
  if ((state.coins || 0) < cost) {
    addLog(`⚠ Not enough coins to repair ${turret.name || 'turret'} ($${fmt(cost)}).`);
    return;
  }
  spendCoins(cost);
  turret.health = maxH;
  invalidateNetworkCache();
  addLog(`🔧 ${turret.name || getTurretTypeDef(turret.type).name} repaired +${fmt(missing)} HP (×${rank}) → ${fmt(turret.health)}/${fmt(turret.maxHealth)}`);
  if (refresh.ui) refresh.ui();
  if (refresh.resources) refresh.resources();
  renderTurretModal();
};

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
  if (!canEnqueueCraft()) {
    addLog(`⚠ Craft queue full (${getCraftQueueCap()} slots). Upgrade the Base for more.`);
    return;
  }
  if (state.coins < turretDef.cost) return;
  const craftReqs = scaleCraftReqs(turretDef.reqs);
  for (const [r, n] of Object.entries(craftReqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(turretDef.cost);
  for (const [r, n] of Object.entries(craftReqs)) state.resources[r] -= n;
  const durationMs = getTurretCraftTimeMs(turretType);
  const job = enqueueCraftJob({
    kind: 'turret',
    recipeId: turretType,
    name: turretDef.name,
    durationMs,
  });
  if (!job) {
    addCoins(turretDef.cost);
    for (const [r, n] of Object.entries(craftReqs)) state.resources[r] = (state.resources[r] || 0) + n;
    return;
  }
  addLog(`🛠 Queued: ${turretDef.name} (${Math.ceil(durationMs / 1000)}s)`);
  if (refresh.ui) refresh.ui();
  if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') {
    window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true });
  }
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
  // Legacy no-op — craft queue handles sync
};

// Expose functions needed by dynamically-rendered HTML onclick handlers
window.openTurretModal = openTurretModal;
window.closeTurretModal = closeTurretModal;
window.closeTurretModalIfOpen = closeTurretModalIfOpen;
window.renderTurretModal = renderTurretModal;
window.patchTurretModal = patchTurretModal;
window.cancelTurretPlacement = cancelTurretPlacement;
