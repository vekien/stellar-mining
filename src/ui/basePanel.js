// ============================================================
// BASE PANEL UI — command station floating panel
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE, BASE_TIER_REQS } from '../data/base.js';
import { fmt, fmtCompact, resourceIconHtml, showHintTooltip, hideTooltip, isLightColor, spendCoins, addLog } from '../helpers.js';
import { getRepairCost } from '../systems/base.js';
import { invalidateNetworkCache } from '../data/modules.js';
import { refresh } from './refresh.js';
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
import { countCraftJobs } from '../systems/craftQueue.js';

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

let _basePanelTab = 'details'; // details | upgrade | controls | installations
let _lastRepairPanelSig = '';
let _lastRepairRebuildTs = 0;
let _baseTierTrackRo = null;
const REPAIR_PANEL_MIN_MS = 400;

function normalizeBasePanelTab(tab) {
  if (tab === 'installations' || tab === 'controls' || tab === 'upgrade') return tab;
  return 'details';
}

function layoutBaseTierTrack(root, tier) {
  const track = root?.querySelector?.('.sm-bp-track');
  const rail = track?.querySelector('.sm-bp-rail');
  const fill = track?.querySelector('.sm-bp-fill');
  const dots = track?.querySelectorAll('.sm-bp-node .sm-bp-dot');
  if (!track || !rail || !fill || !dots?.length) return;
  const trackRect = track.getBoundingClientRect();
  if (trackRect.width < 8) return;
  const centers = Array.from(dots).map((d) => {
    const r = d.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - trackRect.left,
      y: r.top + r.height / 2 - trackRect.top,
    };
  });
  const first = centers[0];
  const last = centers[centers.length - 1];
  const t = Math.max(1, Math.min(centers.length, tier || 1));
  const targetX = centers[t - 1].x;
  rail.style.left = `${first.x}px`;
  rail.style.width = `${Math.max(0, last.x - first.x)}px`;
  rail.style.top = `${first.y - 1.5}px`;
  fill.classList.remove('animating');
  fill.style.width = `${Math.max(0, targetX - first.x)}px`;
}

function observeBaseTierTrack(root, tier) {
  const track = root?.querySelector?.('.sm-bp-track');
  if (!track || typeof ResizeObserver === 'undefined') return;
  if (_baseTierTrackRo) _baseTierTrackRo.disconnect();
  _baseTierTrackRo = new ResizeObserver(() => layoutBaseTierTrack(root, tier));
  _baseTierTrackRo.observe(track);
}

function buildBaseUpgradePane(bl, nextCost, nextResReqs, canUpgrade) {
  const nt = bl < 10 ? bl + 1 : null;
  const nodes = [];
  for (let i = 1; i <= 10; i++) {
    let cls = 'locked';
    if (i < bl) cls = 'done';
    else if (i === bl) cls = 'current';
    const label = i === 10 ? 'X' : String(i);
    nodes.push(`<div class="sm-bp-node ${cls}"><div class="sm-bp-dot">${label}</div><div class="nm">T${label}</div></div>`);
  }

  let costChips = '';
  if (nt && nextResReqs) {
    for (const [r, n] of Object.entries(nextResReqs)) {
      const met = (state.resources[r] || 0) >= n;
      const label = RESOURCE_DEFS[r]?.label || r;
      costChips += `<span class="sm-bp-chip bp-upg-res${met ? '' : ' unmet'}" data-res="${r}" data-need="${n}" data-tippy-content="${label}">${resourceIconHtml(r, 18)}${fmt(n)}</span>`;
    }
  }
  if (nt && nextCost != null) {
    const cashMet = state.coins >= nextCost;
    costChips += `<span id="bp-req-coins" class="sm-bp-chip cash${cashMet ? '' : ' unmet'}" data-need="${nextCost}" data-tippy-content="Credits"><span class="cash-ico">$</span>${fmt(nextCost)}</span>`;
  }

  const tierActions = nt
    ? `<div class="sm-bp-cost">
        <span class="cost-lab">COST</span>
        ${costChips}
      </div>
      <button id="bp-upgrade-btn" class="sm-btn-tier" type="button" onclick="upgradeBase()" ${canUpgrade ? '' : 'disabled'}>ADVANCE TIER →</button>`
    : '<div class="sm-maxed">★ MAX TIER REACHED</div>';

  const curShips = BASE_MAX_SHIPS[bl - 1] || 5;
  const nextShips = nt ? (BASE_MAX_SHIPS[nt - 1] || curShips) : curShips;
  const curRange = BASE_RANGE[bl - 1] || 5;
  const nextRange = nt ? (BASE_RANGE[nt - 1] || curRange) : curRange;
  const curHull = 10000 + (bl - 1) * 10000;
  const nextHull = nt ? 10000 + (nt - 1) * 10000 : curHull;
  const curRp = getResearchPointCap(bl);
  const nextRp = nt ? getResearchPointCap(nt) : curRp;
  const nextTierLabel = nt === 10 ? 'X' : String(nt || bl);

  const gainCard = (icon, label, cur, next) => `
    <div class="sm-stat-upg bp-upg-gain">
      <div class="sm-stat-upg-h">
        <span class="ms-icon" aria-hidden="true">${icon}</span>
        <span class="t">${label}</span>
      </div>
      <div class="sm-stat-upg-b">
        <div class="sm-stat-upg-vals">
          <span class="cur">${cur}</span>
          ${nt
            ? `<span class="arrow">→</span><span class="next">${next}</span>`
            : '<span class="arrow">·</span><span class="max">MAX</span>'}
        </div>
      </div>
    </div>`;

  return `<div class="bp-upgrade-pane" id="bp-upgrade-root">
    <div class="sm-bp-wrap">
      <div class="sm-bp-head">
        <span class="lab">◈ BASE TIER TRACK</span>
        <span class="next">${nt ? `Next unlock · <b>Tier ${nextTierLabel}</b>` : 'Fully ascended'}</span>
      </div>
      <div class="sm-bp-track" data-tier="${bl}">
        <div class="sm-bp-rail"><div class="sm-bp-fill"></div></div>
        ${nodes.join('')}
      </div>
      <div class="sm-bp-actions">${tierActions}</div>
    </div>
    <div class="sm-stat-upg-row bp-upg-gains">
      ${gainCard('groups', 'FLEET CAP', curShips, nextShips)}
      ${gainCard('radar', 'TILE RANGE', `◎ ${curRange}`, `◎ ${nextRange}`)}
      ${gainCard('favorite', 'HULL HP', fmt(curHull), fmt(nextHull))}
      ${gainCard('science', 'RP CAP', curRp, nextRp)}
    </div>
  </div>`;
}

/** Stable sig so Controls pane only rebuilds when repair set / affordability changes. */
function repairPanelSig(items) {
  // Id set + total cost (not per-frame HP chatter on every tile)
  const ids = (items || []).map((i) => `${i.kind}:${i.id}`).sort().join(',');
  const total = (items || []).reduce((s, i) => s + i.cost, 0);
  const can = (state.coins || 0) >= total && total > 0 ? 1 : 0;
  return `${ids}|n:${(items || []).length}|t:${total}|a:${can}`;
}

const REPAIR_ICONS = {
  storage_facility: 'warehouse',
  research_lab: 'science',
  power_station: 'bolt',
  power_pole: 'electrical_services',
  lab_tower: 'cell_tower',
  drone_lab: 'drone_2',
  turret: 'crisis_alert',
  laser_turret: 'flashlight_on',
  emp_turret: 'electric_bolt',
};

function repairIconFor(type, kind) {
  if (REPAIR_ICONS[type]) return REPAIR_ICONS[type];
  return kind === 'turret' ? 'crisis_alert' : 'apartment';
}

/** Damaged modules + turrets — cost = missing HP × rank. */
export function collectRepairTargets() {
  const items = [];
  for (const m of state.modules || []) {
    const maxH = Math.max(0, m.maxHealth || 0);
    const curH = Math.max(0, m.health || 0);
    if (maxH <= 0) continue;
    const missing = Math.max(0, Math.ceil(maxH - curH));
    if (missing <= 0) continue;
    const rank = Math.max(1, Math.floor(m.level || 1));
    items.push({
      kind: 'module',
      id: m.id,
      type: m.type || 'storage_facility',
      name: m.name || m.type || 'Building',
      icon: repairIconFor(m.type, 'module'),
      rank,
      missing,
      cost: missing * rank,
    });
  }
  for (const t of state.turrets || []) {
    const maxH = Math.max(0, t.maxHealth || 0);
    const curH = Math.max(0, t.health || 0);
    if (maxH <= 0) continue;
    const missing = Math.max(0, Math.ceil(maxH - curH));
    if (missing <= 0) continue;
    const rank = Math.max(1, Math.floor(t.level || 1));
    items.push({
      kind: 'turret',
      id: t.id,
      type: t.type || 'turret',
      name: t.name || t.type || 'Turret',
      icon: repairIconFor(t.type, 'turret'),
      rank,
      missing,
      cost: missing * rank,
    });
  }
  items.sort((a, b) => b.cost - a.cost);
  return items;
}

function buildControlsPaneHtml(repairItems) {
  const totalCost = repairItems.reduce((s, r) => s + r.cost, 0);
  const canAfford = (state.coins || 0) >= totalCost && totalCost > 0;
  const gridHtml = repairItems.length
    ? `<div class="cmd-repair-grid">${repairItems.map((r) => `
        <div class="cmd-repair-tile" title="${r.name}">
          <span class="ms-icon cmd-repair-tile-icon">${r.icon || 'build'}</span>
          <span class="cmd-repair-tile-name">${r.name}</span>
          <span class="cmd-repair-tile-cost">$${fmtCompact(r.cost)}</span>
        </div>`).join('')}</div>`
    : `<div class="cmd-repair-empty">All structures at full integrity.</div>`;
  return `
    <div class="cmd-controls bp-controls">
      <div class="cmd-control-card">
        <div class="cmd-control-head">
          <span class="ms-icon cmd-control-icon">build</span>
          <div>
            <div class="cmd-control-title">REPAIR ALL</div>
            <div class="cmd-control-sub">Restore damaged buildings &amp; turrets — cost × rank</div>
          </div>
        </div>
        ${gridHtml}
        <div class="cmd-repair-footer">
          <button class="btn cmd-repair-all-btn${canAfford ? ' primary' : ''}" type="button"
            ${canAfford ? '' : 'disabled'}
            onclick="repairAllStructures()">${totalCost > 0
              ? `REPAIR ALL — <span class="cmd-repair-btn-cost">$${fmt(totalCost)}</span>`
              : 'NOTHING TO REPAIR'}</button>
        </div>
      </div>
    </div>`;
}

window.repairAllStructures = function() {
  const items = collectRepairTargets();
  if (!items.length) {
    addLog('All structures are already at full integrity.');
    _lastRepairPanelSig = '';
    renderBasePanel();
    return;
  }
  const totalCost = items.reduce((s, r) => s + r.cost, 0);
  if ((state.coins || 0) < totalCost) {
    addLog(`⚠ Not enough coins to repair all ($${fmt(totalCost)} needed).`);
    return;
  }
  spendCoins(totalCost);
  let repaired = 0;
  let totalHp = 0;
  for (const item of items) {
    if (item.kind === 'module') {
      const m = (state.modules || []).find((x) => x.id === item.id);
      if (!m) continue;
      const maxH = Math.max(0, m.maxHealth || 0);
      const missing = Math.max(0, Math.ceil(maxH - (m.health || 0)));
      if (missing <= 0) continue;
      m.health = maxH;
      totalHp += missing;
      repaired += 1;
    } else if (item.kind === 'turret') {
      const t = (state.turrets || []).find((x) => x.id === item.id);
      if (!t) continue;
      const maxH = Math.max(0, t.maxHealth || 0);
      const missing = Math.max(0, Math.ceil(maxH - (t.health || 0)));
      if (missing <= 0) continue;
      t.health = maxH;
      totalHp += missing;
      repaired += 1;
    }
  }
  invalidateNetworkCache();
  addLog(`🔧 Repaired ${repaired} structure${repaired === 1 ? '' : 's'} (+${fmt(totalHp)} HP) for $${fmt(totalCost)}.`);
  _lastRepairPanelSig = '';
  if (refresh.ui) refresh.ui();
  if (refresh.resources) refresh.resources();
  renderBasePanel();
};

window.setBasePanelTab = function(tab) {
  _basePanelTab = normalizeBasePanelTab(tab);
  // Force a fresh Controls rebuild when opening that tab
  if (_basePanelTab === 'controls') {
    _lastRepairPanelSig = '';
    _lastRepairRebuildTs = 0;
  }
  const root = document.getElementById('bp-body');
  if (!root) return;
  root.querySelectorAll('.bp-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.tab === _basePanelTab);
  });
  root.querySelectorAll('.bp-tab-pane').forEach((pane) => {
    pane.classList.toggle('on', pane.dataset.pane === _basePanelTab);
  });
  if (_basePanelTab === 'controls') renderBasePanel();
  if (_basePanelTab === 'upgrade') {
    requestAnimationFrame(() => {
      layoutBaseTierTrack(root, state.base.level || 1);
      observeBaseTierTrack(root, state.base.level || 1);
    });
  }
};

function buildStructureHtml(ctx) {
  const {
    bl, maxShips, nextCost, nextResReqs, tierColor, hasShield,
    installedUpgrades, combatUpgrades, unlockedPerks, shieldPerSec,
  } = ctx;
  const tab = normalizeBasePanelTab(_basePanelTab);
  const installCount = installedUpgrades.length + combatUpgrades.length + unlockedPerks.length;
  const repairItems = collectRepairTargets();
  const repairCount = repairItems.length;

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
        <button type="button" class="bp-tab sm-tab${tab === 'upgrade' ? ' on' : ''}" data-tab="upgrade" onclick="setBasePanelTab('upgrade')">
          <span class="ms-icon">upgrade</span> UPGRADE
        </button>
        <button type="button" class="bp-tab sm-tab${tab === 'controls' ? ' on' : ''}" data-tab="controls" onclick="setBasePanelTab('controls')">
          <span class="ms-icon">tune</span> CONTROLS
          <span class="bp-tab-count${repairCount > 0 ? ' alert' : ''}" id="bp-repair-count"${repairCount > 0 ? '' : ' hidden'}>${repairCount}</span>
        </button>
        <button type="button" class="bp-tab sm-tab${tab === 'installations' ? ' on' : ''}" data-tab="installations" onclick="setBasePanelTab('installations')">
          <span class="ms-icon">construction</span> INSTALLATIONS
          <span class="bp-tab-count" id="bp-install-count">${installCount}</span>
        </button>
      </div>

      <div class="bp-tab-body">
        <div class="bp-tab-pane${tab === 'details' ? ' on' : ''}" data-pane="details">
          <div class="bp-details-grid bp-details-grid-2">
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
              <div class="sm-info-row"><span class="k">BASE TIER</span><span class="val" id="bp-stat-tier">T${bl === 10 ? 'X' : bl}</span></div>
            </div>
          </div>
        </div>

        <div class="bp-tab-pane${tab === 'upgrade' ? ' on' : ''}" data-pane="upgrade">
          ${buildBaseUpgradePane(bl, nextCost, nextResReqs, !!(nextCost && state.coins >= nextCost && (!nextResReqs || Object.entries(nextResReqs).every(([r, n]) => (state.resources[r] || 0) >= n))))}
        </div>

        <div class="bp-tab-pane${tab === 'controls' ? ' on' : ''}" data-pane="controls">
          <div id="bp-controls-root" class="bp-controls-root">
            ${buildControlsPaneHtml(repairItems)}
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
    repairItems,
  } = ctx;

  const repairCount = repairItems?.length || 0;
  const repairBadge = root.querySelector('#bp-repair-count');
  if (repairBadge) {
    const countStr = String(repairCount);
    if (repairBadge.textContent !== countStr) repairBadge.textContent = countStr;
    const hide = repairCount <= 0;
    if (repairBadge.hidden !== hide) repairBadge.hidden = hide;
    repairBadge.classList.toggle('alert', repairCount > 0);
  }
  // Rebuild Controls only on Controls tab, and only when data changes (throttled)
  const controlsRoot = root.querySelector('#bp-controls-root');
  if (controlsRoot && repairItems && _basePanelTab === 'controls') {
    const sig = repairPanelSig(repairItems);
    const now = performance.now();
    if (sig !== _lastRepairPanelSig && (now - _lastRepairRebuildTs >= REPAIR_PANEL_MIN_MS || !_lastRepairPanelSig)) {
      _lastRepairPanelSig = sig;
      _lastRepairRebuildTs = now;
      controlsRoot.innerHTML = buildControlsPaneHtml(repairItems);
    }
  }

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
      coinReq.classList.toggle('unmet', state.coins < nextCost);
    }
    root.querySelectorAll('.bp-upg-res').forEach((el) => {
      const r = el.dataset.res;
      const need = Number(el.dataset.need) || 0;
      const met = (state.resources[r] || 0) >= need;
      el.classList.toggle('unmet', !met);
    });
    const upBtn = root.querySelector('#bp-upgrade-btn');
    if (upBtn) upBtn.disabled = !canUpgrade;
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
  const activeCraftCount = countCraftJobs('ship');
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
    if (normalizeBasePanelTab(_basePanelTab) === 'upgrade') {
      requestAnimationFrame(() => {
        layoutBaseTierTrack(bpBodyEl, bl);
        observeBaseTierTrack(bpBodyEl, bl);
      });
    }
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
    repairItems: collectRepairTargets(),
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
