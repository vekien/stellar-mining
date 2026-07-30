// ============================================================
// BASE PANEL UI — command station floating panel
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE, BASE_TIER_REQS } from '../data/base.js';
import { fmt, showHintTooltip, hideTooltip, isLightColor } from '../helpers.js';
import { getRepairCost } from '../systems/base.js';
import { renderTutPointers } from './tutorial.js';
import {
  HEALTH_INCREASE_HP_PER_PURCHASE,
  ANTI_COMET_CHANCE_PER_PURCHASE,
  SOLAR_SHIELD_REDUCTION_PER_PURCHASE,
  AUTO_REGEN_HP_PER_PURCHASE,
  SHIELD_REGEN_INTERVAL_S,
  SHIELD_REGEN_PER_PURCHASE_PER_TICK,
  getResearchPointCap,
  RESEARCH_TREE,
} from '../data/research.js';
import { getMaxShield } from '../systems/research.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
  placeFloatingWindow,
} from './floatingWindow.js';
import { bindTippyIn, destroyTippiesIn, setHtmlDestroyingTippies } from './tippy.js';

const RESEARCH_DESC_BY_ID = (() => {
  const map = Object.create(null);
  for (const tier of RESEARCH_TREE || []) {
    for (const item of tier.items || []) {
      if (item?.id) map[item.id] = item.desc || '';
    }
  }
  return map;
})();

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function researchTip(id, name, detail) {
  const desc = RESEARCH_DESC_BY_ID[id] || '';
  const title = `<strong style="color:#8fd2ff;">${escapeHtml(name)}</strong>`;
  if (desc) return `${title}<br><span style="color:#cde;line-height:1.35;">${escapeHtml(desc)}</span>`;
  if (detail && detail !== 'Unlocked') {
    return `${title}<br><span style="color:#cde;">${escapeHtml(detail)}</span>`;
  }
  return title;
}

let _bpWasOpen = false;
let _basePanelDragInit = false;
let _basePanelStructSig = '';
const BASE_LAYOUT_KEY = 'base';

function initBasePanelDrag() {
  if (_basePanelDragInit) return;
  _basePanelDragInit = true;
  const overlay = document.getElementById('base-panel-overlay');
  const panel = document.getElementById('base-panel');
  if (!overlay || !panel) return;

  initFloatingDrag(panel, overlay, {
    handleSelector: '#bp-header-bar',
    layoutKey: BASE_LAYOUT_KEY,
    isActive: () => overlay.classList.contains('open'),
    onFocus: () => bringFloatingToFront(panel),
  });
  initFloatingResize(panel, overlay, {
    minW: 720,
    minH: 360,
    layoutKey: BASE_LAYOUT_KEY,
    isActive: () => overlay.classList.contains('open'),
  });
}

function formatUpgradeDetail(detail) {
  return String(detail).replace(/(\+?\d[\d,]*(?:\.\d+)?(?:%|\/s)?)/g, '<span class="bp-hl">$1</span>');
}

function renderPerkCards(items, emptyText) {
  if (!items.length) {
    return `<div class="bp-empty">${emptyText}</div>`;
  }
  return `<div class="bp-perk-grid">${items.map((item) => {
    const tip = item.tip || researchTip(item.id, item.name, item.detail);
    return `
    <div class="bp-perk-card${item.qty ? ' stacked' : ''}" data-tippy-content="${tip.replace(/"/g, '&quot;')}">
      <div class="bp-perk-icon"><span class="ms-icon" aria-hidden="true">${item.icon || 'bolt'}</span></div>
      <div class="bp-perk-body">
        <div class="bp-perk-name">${escapeHtml(item.name)}</div>
        <div class="bp-perk-detail">${formatUpgradeDetail(item.detail)}</div>
      </div>
      ${item.qty ? `<div class="bp-perk-qty">×${item.qty}</div>` : '<div class="bp-perk-badge" title="Active"><span class="ms-icon ms-icon-sm ms-icon-fill" aria-hidden="true">check</span></div>'}
    </div>`;
  }).join('')}</div>`;
}

function setText(el, text) {
  if (!el) return;
  const next = String(text);
  if (el.textContent !== next) el.textContent = next;
}

function setHtml(el, html) {
  if (!el) return;
  if (el.innerHTML !== html) el.innerHTML = html;
}

function collectInstallations() {
  const maxShield = getMaxShield();
  const hpBoostCount = state.hpBoostCount || 0;
  const shieldBoostCount = state.shieldBoostCount || 0;
  const antiCometCount = state.antiCometCount || 0;
  const solarShieldCount = state.solarShieldCount || 0;
  const autoRegenCount = state.autoRegenCount || 0;
  const shieldPerTick = shieldBoostCount * SHIELD_REGEN_PER_PURCHASE_PER_TICK;
  const shieldPerSec = shieldBoostCount > 0 ? (shieldPerTick / SHIELD_REGEN_INTERVAL_S) : 0;

  const installedUpgrades = [];
  const combatUpgrades = [];
  const unlockedPerks = [];

  if (hpBoostCount > 0)
    installedUpgrades.push({ id: 'health_increase', name: 'Health Increase', detail: `+${fmt(hpBoostCount * HEALTH_INCREASE_HP_PER_PURCHASE)} max HP total`, qty: hpBoostCount, icon: 'favorite' });
  if (shieldBoostCount > 0)
    installedUpgrades.push({ id: 'shield_increase', name: 'Shield Increase', detail: `${fmt(maxShield)} max shield · +${fmt(Math.round(shieldPerSec))}/s`, qty: shieldBoostCount, icon: 'shield' });
  if (antiCometCount > 0)
    installedUpgrades.push({ id: 'anti_comet', name: 'Anti-Comet Defenses', detail: `${Math.round(antiCometCount * ANTI_COMET_CHANCE_PER_PURCHASE * 100)}% intercept chance`, qty: antiCometCount, icon: 'flare' });
  if (solarShieldCount > 0)
    installedUpgrades.push({ id: 'solar_shield', name: 'Solar Radiation Shielding', detail: `${Math.round(solarShieldCount * SOLAR_SHIELD_REDUCTION_PER_PURCHASE * 100)}% flare reduction`, qty: solarShieldCount, icon: 'wb_sunny' });
  if (autoRegenCount > 0)
    installedUpgrades.push({ id: 'auto_regen', name: 'Auto Regeneration', detail: `${autoRegenCount * AUTO_REGEN_HP_PER_PURCHASE} HP/s`, qty: autoRegenCount, icon: 'healing' });

  if (state.researchUnlocks['armor_plating'])
    combatUpgrades.push({ id: 'armor_plating', name: 'Armor Plating', detail: 'Combat ship armor +10%', icon: 'security' });
  if (state.researchUnlocks['turrets'])
    combatUpgrades.push({ id: 'turrets', name: 'Automatic Turret', detail: 'Defensive turrets unlocked', icon: 'crisis_alert' });
  if (state.researchUnlocks['laser_turrets'])
    combatUpgrades.push({ id: 'laser_turrets', name: 'Laser Turrets', detail: 'Unlocked', icon: 'flashlight_on' });
  if (state.researchUnlocks['emp_turrets'])
    combatUpgrades.push({ id: 'emp_turrets', name: 'EMP Turrets', detail: 'Unlocked', icon: 'electric_bolt' });

  const perkDefs = [
    ['resource_synthesis', 'Resource Synthesis', 'Unlocked', 'science'],
    ['resource_fabrication', 'Resource Fabrication', 'Unlocked', 'precision_manufacturing'],
    ['unlock_bounties', 'Bounties', 'Unlocked', 'military_tech'],
    ['galaxy_probes', 'Galaxy Probes', 'Unlocked', 'travel_explore'],
    ['storage_facilities', 'Storage Facilities', 'Unlocked', 'warehouse'],
    ['research_lab', 'Research Lab', 'Unlocked', 'biotech'],
    ['lab_tower', 'Lab Tower', 'Unlocked', 'cell_tower'],
    ['power_station', 'Power Station', 'Unlocked', 'bolt'],
    ['power_poles', 'Power Poles', 'Unlocked', 'electrical_services'],
    ['drone_lab', 'Drone Lab', 'Unlocked', 'drone_2'],
    ['drone_crafting', 'Drone Crafting', 'Unlocked', 'build'],
    ['market_influence', 'Market Influence', '+10% all sell prices', 'payments'],
    ['unique_scanner', 'Unique Ship Scanner', 'Unlocked', 'radar'],
    ['multi_demand', 'Multi-Demand', 'Up to 3 resources in demand per SOL', 'analytics'],
  ];
  for (const [id, name, detail, icon] of perkDefs) {
    if (state.researchUnlocks[id]) unlockedPerks.push({ id, name, detail, icon });
  }

  return {
    maxShield,
    hpBoostCount,
    shieldBoostCount,
    antiCometCount,
    solarShieldCount,
    autoRegenCount,
    shieldPerSec,
    installedUpgrades,
    combatUpgrades,
    unlockedPerks,
  };
}

let _basePanelTab = 'details'; // details | installations

window.setBasePanelTab = function(tab) {
  _basePanelTab = tab === 'installations' ? 'installations' : 'details';
  const root = document.getElementById('bp-body');
  if (!root) return;
  root.querySelectorAll('.bp-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.tab === _basePanelTab);
  });
  root.querySelectorAll('.bp-tab-pane').forEach((pane) => {
    pane.classList.toggle('on', pane.dataset.pane === _basePanelTab);
  });
};

function buildStructureHtml(ctx) {
  const {
    bl, maxShips, nextCost, nextResReqs, tierColor, hasShield,
    installedUpgrades, combatUpgrades, unlockedPerks, shieldPerSec,
  } = ctx;
  const tab = _basePanelTab;
  const installCount = installedUpgrades.length + combatUpgrades.length + unlockedPerks.length;

  const upgradeFooter = nextCost ? (() => {
    const ntColor = MINE_TIERS[bl + 1]?.color || '#8ab';
    let reqPills = `<span id="bp-req-coins" class="bp-craft-req">$${fmt(nextCost)}</span>`;
    if (nextResReqs) {
      for (const [r, n] of Object.entries(nextResReqs)) {
        reqPills += `<span class="bp-craft-req bp-req-res" data-res="${r}" data-need="${n}">${RESOURCE_DEFS[r]?.label ?? r}: ${fmt(n)}</span>`;
      }
    }
    return `<div class="bp-upgrade-next">
      <div class="bp-upgrade-next-title">UPGRADE → TIER <span style="color:${ntColor};font-family:'Cinzel',serif;font-weight:700;">${toRoman(bl + 1)}</span></div>
      <div class="bp-upgrade-next-row">
        <div id="bp-upgrade-reqs" class="bp-upgrade-next-reqs">${reqPills}</div>
        <button id="bp-upgrade-btn" class="btn bp-upgrade-btn-large" onclick="upgradeBase()">UPGRADE</button>
      </div>
    </div>`;
  })() : `<div class="bp-maxed">★ BASE FULLY UPGRADED</div>`;

  return `
    <div class="lab-layout bp-layout">
      <div class="lab-hero">
        <div class="lab-hero-left">
          <div class="lab-hero-name-row">
            <span id="bp-name" class="storage-modal-name lab-hero-name"></span>
            <button onclick="openBaseRenameOverlay()" title="Rename Base" class="storage-modal-rename-btn">✎</button>
            <div id="bp-status-pill" class="lab-status-pill">ONLINE</div>
          </div>
          <div class="lab-meter">
            <div class="lab-meter-head">
              <span class="lab-meter-label">Hull Integrity</span>
              <span id="bp-hp-value" class="lab-meter-value"></span>
            </div>
            <div class="lab-meter-track bp-combo-track">
              <div id="bp-hp-bar" class="bp-combo-hp"></div>
              <div id="bp-shield-bar" class="bp-combo-shield" style="display:none;"></div>
            </div>
          </div>
          <div id="bp-shield-meta" class="bp-shield-meta" style="display:${hasShield ? '' : 'none'};">
            <span id="bp-shield-label" class="bp-shield-label">◈ Shield (+${fmt(Math.round(shieldPerSec))}/s)</span>
            <span id="bp-shield-value" class="bp-shield-value"></span>
          </div>
        </div>
        <div id="bp-tier-badge" class="lab-tier-badge" style="color:${isLightColor(tierColor) ? '#111' : '#fff'};background:${tierColor};">TIER ${toRoman(bl)}</div>
      </div>

      <div class="bp-tabs sm-tabs">
        <button type="button" class="bp-tab sm-tab${tab === 'details' ? ' on' : ''}" data-tab="details" onclick="setBasePanelTab('details')">
          <span class="ms-icon">circles</span> DETAILS
        </button>
        <button type="button" class="bp-tab sm-tab${tab === 'installations' ? ' on' : ''}" data-tab="installations" onclick="setBasePanelTab('installations')">
          <span class="ms-icon">construction</span> INSTALLATIONS
          <span class="bp-tab-count" id="bp-install-count">${installCount}</span>
        </button>
      </div>

      <div class="bp-tab-body">
        <div class="bp-tab-pane${tab === 'details' ? ' on' : ''}" data-pane="details">
          <div class="bp-details-grid">
            <div class="sm-info-block sm-info-block-fill">
              <div class="blk-title">◈ SYSTEMS</div>
              <div class="sm-info-row"><span class="k">FLEET CAP</span><span class="val" id="bp-stat-fleet"></span></div>
              <div class="sm-info-row"><span class="k">TILE RANGE</span><span class="val" id="bp-stat-range">◎ ${BASE_RANGE[bl - 1]}</span></div>
              <div class="sm-info-row"><span class="k">RESEARCH</span><span class="val green" id="bp-stat-rp"></span></div>
              <div class="sm-info-row"><span class="k">HULL</span><span class="val green" id="bp-stat-hull"></span></div>
              <div id="bp-repair-wrap">
                <div class="bp-systems-note">All primary systems nominal.</div>
              </div>
            </div>

            <div class="sm-info-block sm-info-block-fill">
              <div class="blk-title">◈ STATION PROFILE</div>
              <div class="sm-info-row"><span class="k">UPGRADES</span><span class="val" id="bp-count-upgrades">${installedUpgrades.length}</span></div>
              <div class="sm-info-row"><span class="k">COMBAT</span><span class="val" id="bp-count-combat">${combatUpgrades.length}</span></div>
              <div class="sm-info-row"><span class="k">UNLOCKS</span><span class="val" id="bp-count-unlocks">${unlockedPerks.length}</span></div>
            </div>

            <div class="sm-info-block sm-info-block-fill">
              <div class="blk-title">◈ BASE TIER</div>
              <div class="bp-tier-block">${upgradeFooter}</div>
            </div>
          </div>
        </div>

        <div class="bp-tab-pane${tab === 'installations' ? ' on' : ''}" data-pane="installations">
          <div class="sm-info-block sm-info-block-fill bp-install-panel">
            <div class="bp-install-scroll">
              <div class="bp-section">
                <div class="bp-section-label">Tower Upgrades</div>
                ${renderPerkCards(installedUpgrades, 'No tower upgrades installed yet.')}
              </div>
              <div class="bp-section">
                <div class="bp-section-label">Combat Systems</div>
                ${renderPerkCards(combatUpgrades, 'No combat upgrades unlocked yet.')}
              </div>
              <div class="bp-section">
                <div class="bp-section-label">Research Unlocks</div>
                ${renderPerkCards(unlockedPerks, 'No research unlocks yet.')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function patchLiveValues(root, ctx) {
  const {
    bl, maxShips, nextCost, nextResReqs, canUpgrade,
    hpPct, maxShield, shield, shieldPerSec, shipCount,
    online, hpCol, hpW, shW, missingHp, repairCost, canRepair,
  } = ctx;

  setText(root.querySelector('#bp-name'), `⬡ ${state.base.name || 'Base Station'}`);

  const pill = root.querySelector('#bp-status-pill');
  if (pill) {
    setText(pill, online ? 'ONLINE' : 'CRITICAL');
    pill.className = `lab-status-pill${online ? '' : ' offline'}`;
  }

  const hpVal = root.querySelector('#bp-hp-value');
  if (hpVal) {
    setText(hpVal, `${fmt(state.base.health)} / ${fmt(state.base.maxHealth)}`);
    hpVal.style.color = hpPct < 25 ? '#f88' : '#4d8';
  }

  const hpBar = root.querySelector('#bp-hp-bar');
  if (hpBar) {
    hpBar.style.width = `${hpW}%`;
    hpBar.style.background = hpCol;
  }

  const shBar = root.querySelector('#bp-shield-bar');
  if (shBar) {
    if (shield > 0) {
      shBar.style.display = '';
      shBar.style.left = `${hpW}%`;
      shBar.style.width = `${shW}%`;
    } else {
      shBar.style.display = 'none';
    }
  }

  const shMeta = root.querySelector('#bp-shield-meta');
  if (shMeta) shMeta.style.display = maxShield > 0 ? '' : 'none';
  setText(root.querySelector('#bp-shield-label'), `◈ Shield (+${fmt(Math.round(shieldPerSec))}/s)`);
  setText(root.querySelector('#bp-shield-value'), `${fmt(shield)} / ${fmt(maxShield)}`);

  setText(root.querySelector('#bp-stat-fleet'), `${shipCount} / ${maxShips}`);
  setText(root.querySelector('#bp-stat-rp'), `${state.rp} / ${getResearchPointCap(bl)}`);

  const hullStat = root.querySelector('#bp-stat-hull');
  if (hullStat) {
    setText(hullStat, `${hpPct}%`);
    hullStat.className = `val${hpPct < 25 ? ' bad' : ' ok'}`;
    hullStat.style.color = '';
  }

  const repairWrap = root.querySelector('#bp-repair-wrap');
  if (repairWrap) {
    if (missingHp > 0 && repairCost) {
      const next = `<div class="bp-repair-card">
        <div class="bp-repair-warning">⚠ Hull damaged — ${fmt(missingHp)} HP missing</div>
        <div class="bp-repair-cost">Repair cost: $${fmt(repairCost.coins)}</div>
        <button class="btn${canRepair ? ' primary' : ''} bp-repair-btn" ${canRepair ? '' : 'disabled'} onclick="repairBase(${missingHp})">REPAIR FULL</button>
      </div>`;
      setHtml(repairWrap, next);
    } else {
      setHtml(repairWrap, '<div class="bp-systems-note">All primary systems nominal.</div>');
    }
  }

  if (nextCost) {
    const coinReq = root.querySelector('#bp-req-coins');
    if (coinReq) {
      coinReq.className = `bp-craft-req ${state.coins >= nextCost ? 'met' : 'unmet'}`;
    }
    root.querySelectorAll('.bp-req-res').forEach((el) => {
      const r = el.dataset.res;
      const need = Number(el.dataset.need) || 0;
      const met = (state.resources[r] || 0) >= need;
      el.className = `bp-craft-req bp-req-res ${met ? 'met' : 'unmet'}`;
    });
    const upBtn = root.querySelector('#bp-upgrade-btn');
    if (upBtn) {
      upBtn.disabled = !canUpgrade;
      upBtn.className = `btn${canUpgrade ? ' primary' : ''} bp-upgrade-btn-large`;
    }
  }
}

export function renderBasePanel() {
  const panel   = document.getElementById('base-panel');
  const overlay = document.getElementById('base-panel-overlay');
  if (!panel) return;
  if (!state.basePanelOpen) {
    if (_bpWasOpen) { _bpWasOpen = false; renderTutPointers(); }
    panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    return;
  }

  const justOpened = !_bpWasOpen;
  if (justOpened) { _bpWasOpen = true; renderTutPointers(); }
  panel.classList.add('open', 'storage-modal-window', 'modal-accent-base');
  if (overlay) overlay.classList.add('open');

  const bl = state.base.level;
  const maxShips = BASE_MAX_SHIPS[bl - 1] || 5;
  const nextCost = BASE_UPGRADE_COSTS[bl] || null;
  const nextResReqs = nextCost ? (BASE_TIER_REQS[bl + 1] || null) : null;
  const resReqsMet = !nextResReqs || Object.entries(nextResReqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  const canUpgrade = !!(nextCost && state.coins >= nextCost && resReqsMet);
  const hpPct = Math.round((state.base.health / Math.max(1, state.base.maxHealth)) * 100);
  const installs = collectInstallations();
  const {
    maxShield, shieldBoostCount, shieldPerSec,
    installedUpgrades, combatUpgrades, unlockedPerks,
    hpBoostCount, antiCometCount, solarShieldCount, autoRegenCount,
  } = installs;
  const shield = Math.min(state.base.shield || 0, maxShield);
  const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;
  const shipCount = state.ships.length + activeCraftCount;
  const online = (state.base.health || 0) > 0;
  const tierColor = MINE_TIERS[bl]?.color || '#8ab';
  const totalBar = Math.max(1, state.base.maxHealth + maxShield);
  const hpW = (state.base.health / totalBar * 100).toFixed(2);
  const shW = (shield / totalBar * 100).toFixed(2);
  const hpCol = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';
  const missingHp = Math.max(0, state.base.maxHealth - state.base.health);
  const repairCost = missingHp > 0 ? getRepairCost(missingHp) : null;
  const canRepair = repairCost ? state.coins >= repairCost.coins : false;

  if (!document.getElementById('bp-header-bar')) {
    const headerBar = document.createElement('div');
    headerBar.id = 'bp-header-bar';
    headerBar.className = 'panel-shell-head storage-modal-drag-handle';
    headerBar.innerHTML = `<div class="panel-shell-title storage-modal-title">BASE STATION</div>
    <button class="panel-shell-close" onclick="dismissBasePanel()">✕</button>`;
    panel.appendChild(headerBar);
    const bodyEl = document.createElement('div');
    bodyEl.id = 'bp-body';
    bodyEl.className = 'storage-modal-body storage-modal-body-lab';
    panel.appendChild(bodyEl);
    if (!panel.style.width) panel.style.width = '960px';
    if (!panel.dataset.height && panel.dataset.moved !== '1') {
      panel.style.height = '580px';
      panel.dataset.height = '580';
    }
    initBasePanelDrag();
  }

  const bpBodyEl = document.getElementById('bp-body');
  if (!bpBodyEl) return;

  // Rebuild only when layout/content structure changes — not on live HP/shield/coin ticks
  const structSig = JSON.stringify({
    bl,
    baseName: state.base.name,
    hasShield: maxShield > 0,
    nextCost,
    unlocks: state.researchUnlocks,
    counts: {
      hpBoostCount,
      shieldBoostCount,
      antiCometCount,
      solarShieldCount,
      autoRegenCount,
    },
  });

  if (_basePanelStructSig !== structSig || !bpBodyEl.querySelector('.bp-layout')) {
    const scrollEl = bpBodyEl.querySelector('.bp-install-scroll');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const bodyScroll = bpBodyEl.scrollTop;
    _basePanelStructSig = structSig;
    destroyTippiesIn(bpBodyEl);
    setHtmlDestroyingTippies(bpBodyEl, buildStructureHtml({
      bl,
      maxShips,
      nextCost,
      nextResReqs,
      tierColor,
      hasShield: maxShield > 0,
      installedUpgrades,
      combatUpgrades,
      unlockedPerks,
      shieldPerSec,
    }));
    bindTippyIn(bpBodyEl);
    const nextScroll = bpBodyEl.querySelector('.bp-install-scroll');
    if (nextScroll) nextScroll.scrollTop = scrollTop;
    bpBodyEl.scrollTop = bodyScroll;
  }

  patchLiveValues(bpBodyEl, {
    bl,
    maxShips,
    nextCost,
    nextResReqs,
    canUpgrade,
    hpPct,
    maxShield,
    shield,
    shieldPerSec,
    shipCount,
    online,
    hpCol,
    hpW,
    shW,
    missingHp,
    repairCost,
    canRepair,
  });

  if (justOpened) {
    const place = () => centerFloatingWindow(overlay, panel, BASE_LAYOUT_KEY);
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
  }
}

window.setBpTab = function(tab) {
  state.bpTab = tab;
  renderBasePanel();
  renderTutPointers();
};

window.dismissBasePanel = function() {
  state.basePanelOpen = false;
  renderBasePanel();
};

window.showHintTooltip = showHintTooltip;
window.hideTooltip = hideTooltip;
