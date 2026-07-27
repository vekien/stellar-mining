// ============================================================
// BASE PANEL UI — slide-out base station panel
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


let _bpWasOpen = false;
let _basePanelDragInit = false;
let _basePanelBodySig = '';
const BASE_LAYOUT_KEY = 'base';

function applyBasePanelPosition() {
  const overlay = document.getElementById('base-panel-overlay');
  const panel = document.getElementById('base-panel');
  if (!overlay || !panel) return;
  if (Number.isFinite(Number(panel.dataset.left)) && Number.isFinite(Number(panel.dataset.top))) {
    applyFloatingPosition(overlay, panel);
  } else {
    placeFloatingWindow(overlay, panel, BASE_LAYOUT_KEY);
  }
}

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
    minW: 360,
    minH: 320,
    layoutKey: BASE_LAYOUT_KEY,
    isActive: () => overlay.classList.contains('open'),
  });
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
  if (!_bpWasOpen) { _bpWasOpen = true; renderTutPointers(); }
  panel.classList.add('open');
  if (overlay) overlay.classList.add('open');

  const bl       = state.base.level;
  const maxShips = BASE_MAX_SHIPS[bl - 1] || 5;
  const nextCost   = BASE_UPGRADE_COSTS[bl] || null;
  const nextResReqs = nextCost ? (BASE_TIER_REQS[bl + 1] || null) : null;
  const resReqsMet  = !nextResReqs || Object.entries(nextResReqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  const canUpgrade  = nextCost && state.coins >= nextCost && resReqsMet;
  const hpPct    = (state.base.health / state.base.maxHealth * 100).toFixed(0);
  const maxShield  = getMaxShield();
  const shield     = Math.min(state.base.shield || 0, maxShield);
  const hpBoostCount     = state.hpBoostCount     || 0;
  const shieldBoostCount = state.shieldBoostCount || 0;
  const antiCometCount   = state.antiCometCount   || 0;
  const solarShieldCount = state.solarShieldCount || 0;
  const autoRegenCount   = state.autoRegenCount   || 0;

  // Build header bar once — reuse DOM if already present
  if (!document.getElementById('bp-header-bar')) {
    const headerBar = document.createElement('div');
    headerBar.id = 'bp-header-bar';
    headerBar.className = 'panel-shell-head';
    headerBar.innerHTML = `<div class="panel-shell-title">BASE STATION</div>
    <button class="panel-shell-close" onclick="dismissBasePanel()">✕</button>`;
    panel.appendChild(headerBar);
    const bodyEl = document.createElement('div');
    bodyEl.id = 'bp-body';
    panel.appendChild(bodyEl);
    initBasePanelDrag();
  }

  let body = '';
  const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;

  {
    const installedUpgrades = [];
    const combatUpgrades = [];
    const unlockedPerks = [];
    const formatUpgradeDetail = (detail) => String(detail).replace(/(\+?\d[\d,]*(?:\.\d+)?(?:%|\/s)?)/g, '<span style="color:#ffe066;">$1</span>');
    const shieldPerTick = shieldBoostCount * SHIELD_REGEN_PER_PURCHASE_PER_TICK;
    const shieldPerSec = shieldBoostCount > 0 ? (shieldPerTick / SHIELD_REGEN_INTERVAL_S) : 0;

    if (hpBoostCount > 0)
      installedUpgrades.push({ name: 'Health Increase', detail: `+${fmt(hpBoostCount * HEALTH_INCREASE_HP_PER_PURCHASE)} max HP total`, qty: hpBoostCount });
    if (shieldBoostCount > 0)
      installedUpgrades.push({ name: 'Shield Increase', detail: `${fmt(maxShield)} max shield · +${fmt(Math.round(shieldPerSec))}/s`, qty: shieldBoostCount });
    if (antiCometCount > 0)
      installedUpgrades.push({ name: 'Anti-Comet Defenses', detail: `${antiCometCount * 5}% intercept chance`, qty: antiCometCount });
    if (solarShieldCount > 0)
      installedUpgrades.push({ name: 'Solar Radiation Shielding', detail: `${solarShieldCount * 8}% flare reduction`, qty: solarShieldCount });
    if (autoRegenCount > 0)
      installedUpgrades.push({ name: 'Auto Regeneration', detail: `${autoRegenCount * AUTO_REGEN_HP_PER_PURCHASE} HP/s`, qty: autoRegenCount });
    if (state.researchUnlocks['armor_plating'])
      combatUpgrades.push({ name: 'Armor Plating', detail: 'Combat ship armor +10%', qty: null });
    if (state.researchUnlocks['turrets'])
      combatUpgrades.push({ name: 'Automatic Turret', detail: 'Defensive turrets unlocked', qty: null });
    if (state.researchUnlocks['resource_synthesis'])
      unlockedPerks.push({ name: 'Resource Synthesis', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['resource_fabrication'])
      unlockedPerks.push({ name: 'Resource Fabrication', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['unlock_bounties'])
      unlockedPerks.push({ name: 'Bounties', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['galaxy_probes'])
      unlockedPerks.push({ name: 'Galaxy Probes', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['storage_facilities'])
      unlockedPerks.push({ name: 'Storage Facilities', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['research_lab'])
      unlockedPerks.push({ name: 'Research Lab', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['lab_tower'])
      unlockedPerks.push({ name: 'Lab Tower', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['market_influence'])
      unlockedPerks.push({ name: 'Market Influence', detail: '+10% all sell prices', qty: null });
    if (state.researchUnlocks['laser_turrets'])
      combatUpgrades.push({ name: 'Laser Turrets', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['emp_turrets'])
      combatUpgrades.push({ name: 'EMP Turrets', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['unique_scanner'])
      unlockedPerks.push({ name: 'Unique Ship Scanner', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['multi_demand'])
      unlockedPerks.push({ name: 'Multi-Demand', detail: 'Up to 3 resources in demand per SOL', qty: null });

    const upgradeBtn = nextCost
      ? `<button class="btn${canUpgrade?' primary':''} bp-upgrade-btn-large" onclick="upgradeBase()" ${canUpgrade?'':'disabled'}>⬆ UPGRADE</button>`
      : `<span class="bp-maxed">★ MAX TIER</span>`;

    body = `
      <div class="bp-title bp-title-sign bp-title-sign-row">
        <div class="bp-title-pad">
          <span class="bp-title-main bp-title-main-wrap">⬡ ${state.base.name || 'Base Station'}</span>
          <button onclick="openBaseRenameOverlay()" title="Rename Base" class="bp-rename-btn">✎</button>
        </div>
        <div class="bp-title-pad">
          <div class="bp-level bp-tier-pill" style="color:${isLightColor(MINE_TIERS[bl]?.color||'#8ab')?'#111':'#fff'};background:${MINE_TIERS[bl]?.color||'#8ab'};">TIER ${toRoman(bl)}</div>
        </div>
      </div>
      <div class="bp-section-title">◈ BASE</div>
      <div class="bp-health-card ${hpPct<25?'danger':'ok'} module-health-card">
        <div class="bp-row bp-health-head module-health-head"><span class="bp-health-label module-health-label">HEALTH</span><span class="bp-val bp-health-value module-health-value" style="color:${hpPct<25?'#f88':'rgb(68, 221, 136)'};">${fmt(state.base.health)} / ${fmt(state.base.maxHealth)}</span></div>
        ${(() => {
          const total = state.base.maxHealth + maxShield;
          const hpW   = (state.base.health / total * 100).toFixed(2);
          const shW   = (shield / total * 100).toFixed(2);
          const hpCol = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';
          return `<div class="bp-health-bar" style="position:relative;">
            <div style="position:absolute;left:0;top:0;height:100%;width:${hpW}%;background:${hpCol};"></div>
            ${shield > 0 ? `<div style="position:absolute;left:${hpW}%;top:0;height:100%;width:${shW}%;background:linear-gradient(90deg,#1a6aff,#48f);"></div>` : ''}
          </div>
          ${maxShield > 0 ? `<div class="bp-shield-row">
            <span class="bp-shield-label">◈ Shield (+${fmt(Math.round(shieldPerSec))}/s)</span>
            <span class="bp-shield-value">${fmt(shield)} / ${fmt(maxShield)}</span>
          </div>` : ''}`;
        })()}
      </div>
      ${(() => {
        if (state.base.health >= state.base.maxHealth) return '';
        const missing = state.base.maxHealth - state.base.health;
        const cost = getRepairCost(missing);
        const canRepair = state.coins >= cost.coins;
        const btnClass = 'btn' + (canRepair ? ' primary' : '');
        const disabled = canRepair ? '' : 'disabled';
        return '<div class="bp-repair-card">'
          + '<div class="bp-repair-warning">⚠ Base damaged — ' + fmt(missing) + ' HP missing</div>'
          + '<div class="bp-repair-cost">Repair cost: $' + fmt(cost.coins) + '</div>'
          + '<button class="' + btnClass + ' bp-repair-btn" ' + disabled + ' onclick="repairBase(' + missing + ')">🔧 REPAIR FULL</button>'
          + '</div>';
      })()}
      <table class="module-data-table bp-stat-table">
        <thead>
          <tr>
            <th>Ship Capacity</th>
            <th>Tile Range</th>
            <th>Research Pts</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="bp-stat-value">${state.ships.length + activeCraftCount} / ${maxShips}</span></td>
            <td><span class="bp-stat-value">◎ ${BASE_RANGE[bl-1]}</span></td>
            <td><span class="bp-stat-value bp-stat-value-rp">${state.rp} / ${getResearchPointCap(bl)}</span></td>
          </tr>
        </tbody>
      </table>
        <div class="bp-section-title">◈ UPGRADES</div>
        ${installedUpgrades.length
          ? `<div class="bp-group-grid">
              ${installedUpgrades.map(upg => `
                <div class="bp-group-card">
                  <div class="bp-group-head">
                    <span class="bp-group-name">${upg.name}</span>
                    ${upg.qty ? `<span style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${upg.qty}</span>` : ''}
                  </div>
                  <div class="bp-group-detail">${formatUpgradeDetail(upg.detail)}</div>
                </div>`).join('')}
            </div>`
          : '<div class="bp-group-empty">No tower upgrades installed yet.</div>'}
        <div class="bp-group-spacer"></div>
        <div class="bp-section-title">◈ COMBAT SYSTEMS</div>
        ${combatUpgrades.length
          ? `<div class="bp-group-grid">
              ${combatUpgrades.map(upg => `
                <div class="bp-group-card">
                  <div class="bp-group-head">
                    <span class="bp-group-name">${upg.name}</span>
                    ${upg.qty ? `<span style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${upg.qty}</span>` : ''}
                  </div>
                  <div class="bp-group-detail">${formatUpgradeDetail(upg.detail)}</div>
                </div>`).join('')}
            </div>`
          : '<div class="bp-group-empty">No combat upgrades unlocked yet.</div>'}
        <div class="bp-group-spacer"></div>
        <div class="bp-section-title">◈ RESEARCH UNLOCKS</div>
        ${unlockedPerks.length
          ? `<div class="bp-group-grid">
              ${unlockedPerks.map(perk => `
                <div class="bp-group-card">
                  <div class="bp-group-head">
                    <span class="bp-group-name">${perk.name}</span>
                    ${perk.qty ? `<span style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${perk.qty}</span>` : ''}
                  </div>
                  <div class="bp-group-detail">${formatUpgradeDetail(perk.detail)}</div>
                </div>`).join('')}
            </div>`
          : '<div class="bp-group-empty">No unlocked perks yet.</div>'}
      <div class="bp-divider"></div>
      ${nextCost ? (() => {
        const ntColor = MINE_TIERS[bl+1]?.color || '#8ab';
        let reqPills = `<span class="bp-craft-req ${state.coins>=nextCost?'met':'unmet'}">$${fmt(nextCost)}</span>`;
        if (nextResReqs) {
          for (const [r, n] of Object.entries(nextResReqs)) {
            const met = (state.resources[r] || 0) >= n;
            reqPills += `<span class="bp-craft-req ${met?'met':'unmet'}">${RESOURCE_DEFS[r]?.label??r}: ${fmt(n)}</span>`;
          }
        }
        return `<div class="bp-upgrade-next">
          <div class="bp-upgrade-next-title">UPGRADE → TIER <span style="color:${ntColor};font-family:'Cinzel',serif;font-weight:700;">${toRoman(bl+1)}</span></div>
          <div class="bp-upgrade-next-row">
            <div class="bp-upgrade-next-reqs">${reqPills}</div>
            <div class="bp-upgrade-next-action">${upgradeBtn}</div>
          </div>
        </div>`;
      })() : `<div class="bp-maxed">★ BASE FULLY UPGRADED</div>`}
      `;

  }

  const bodySig = JSON.stringify({
    bl,
    maxShips,
    nextCost,
    canUpgrade,
    hp: state.base.health,
    maxHp: state.base.maxHealth,
    shield,
    maxShield,
    ships: state.ships.length,
    activeCraftCount,
    rp: state.rp,
    baseName: state.base.name,
    unlocks: state.researchUnlocks,
    counts: {
      hpBoostCount,
      shieldBoostCount,
      antiCometCount,
      solarShieldCount,
      autoRegenCount,
    },
    resources: nextResReqs ? Object.fromEntries(Object.keys(nextResReqs).map((key) => [key, state.resources[key] || 0])) : null,
  });
  const bpBodyEl = document.getElementById('bp-body');
  if (bpBodyEl && _basePanelBodySig !== bodySig) {
    _basePanelBodySig = bodySig;
    bpBodyEl.innerHTML = body;
  }

  const place = () => centerFloatingWindow(overlay, panel, BASE_LAYOUT_KEY);
  place();
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(place);
  });
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
