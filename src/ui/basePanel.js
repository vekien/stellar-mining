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


let _bpWasOpen = false;

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
  }

  let body = '';
  const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;

  {
    const installedUpgrades = [];
    const combatUpgrades = [];
    const unlockedPerks = [];
    const formatUpgradeDetail = (detail) => String(detail).replace(/(\+?\d[\d,]*(?:\.\d+)?(?:%|\/s)?)/g, '<span style="color:#ffe066;">$1</span>');
    const hpBoostCount     = state.hpBoostCount     || 0;
    const shieldBoostCount = state.shieldBoostCount || 0;
    const shieldPerTick = shieldBoostCount * SHIELD_REGEN_PER_PURCHASE_PER_TICK;
    const shieldPerSec = shieldBoostCount > 0 ? (shieldPerTick / SHIELD_REGEN_INTERVAL_S) : 0;
    const antiCometCount   = state.antiCometCount   || 0;
    const solarShieldCount = state.solarShieldCount || 0;
    const autoRegenCount   = state.autoRegenCount   || 0;

    if (hpBoostCount > 0)
      installedUpgrades.push({ icon: '▲', name: 'Health Increase', detail: `+${fmt(hpBoostCount * HEALTH_INCREASE_HP_PER_PURCHASE)} max HP total`, qty: hpBoostCount });
    if (shieldBoostCount > 0)
      installedUpgrades.push({ icon: '◈', name: 'Shield Increase', detail: `${fmt(maxShield)} max shield · +${fmt(Math.round(shieldPerSec))}/s`, qty: shieldBoostCount });
    if (antiCometCount > 0)
      installedUpgrades.push({ icon: '◇', name: 'Anti-Comet Defenses', detail: `${antiCometCount * 5}% intercept chance`, qty: antiCometCount });
    if (solarShieldCount > 0)
      installedUpgrades.push({ icon: '□', name: 'Solar Radiation Shielding', detail: `${solarShieldCount * 8}% flare reduction`, qty: solarShieldCount });
    if (autoRegenCount > 0)
      installedUpgrades.push({ icon: '○', name: 'Auto Regeneration', detail: `${autoRegenCount * AUTO_REGEN_HP_PER_PURCHASE} HP/s`, qty: autoRegenCount });
    if (state.researchUnlocks['armor_plating'])
      combatUpgrades.push({ icon: '▣', name: 'Armor Plating', detail: 'Combat ship armor +10%', qty: null });
    if (state.researchUnlocks['turrets'])
      combatUpgrades.push({ icon: '■', name: 'Automatic Turret', detail: 'Defensive turrets unlocked', qty: null });
    if (state.researchUnlocks['resource_synthesis'])
      unlockedPerks.push({ icon: '◎', name: 'Resource Synthesis', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['resource_fabrication'])
      unlockedPerks.push({ icon: '◆', name: 'Resource Fabrication', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['unlock_bounties'])
      unlockedPerks.push({ icon: '◉', name: 'Bounties', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['galaxy_probes'])
      unlockedPerks.push({ icon: '▷', name: 'Galaxy Probes', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['storage_facilities'])
      unlockedPerks.push({ icon: '▤', name: 'Storage Facilities', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['research_lab'])
      unlockedPerks.push({ icon: '✦', name: 'Research Lab', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['market_influence'])
      unlockedPerks.push({ icon: '▲', name: 'Market Influence', detail: '+10% all sell prices', qty: null });
    if (state.researchUnlocks['laser_turrets'])
      combatUpgrades.push({ icon: '◈', name: 'Laser Turrets', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['emp_turrets'])
      combatUpgrades.push({ icon: '◇', name: 'EMP Turrets', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['unique_scanner'])
      unlockedPerks.push({ icon: '□', name: 'Unique Ship Scanner', detail: 'Unlocked', qty: null });
    if (state.researchUnlocks['multi_demand'])
      unlockedPerks.push({ icon: '■', name: 'Multi-Demand', detail: 'Up to 3 resources in demand per SOL', qty: null });

    const upgradeBtn = nextCost
      ? `<button class="btn${canUpgrade?' primary':''}" style="font-size:18px;padding:6px 14px;white-space:nowrap;line-height:1.5;" onclick="upgradeBase()" ${canUpgrade?'':'disabled'}>⬆ UPGRADE</button>`
      : `<span style="font-size:13px;color:#ffe066">★ MAX TIER</span>`;

    body = `
      <div class="bp-title bp-title-sign" style="display:flex;flex-direction:row;flex-wrap:nowrap;align-content:space-around;justify-content:space-between;margin-bottom:8px;">
        <div style="padding:6px 8px;">
          <span class="bp-title-main" style="margin:0;">⬡ ${state.base.name || 'Base Station'}</span>
          <button onclick="openBaseRenameOverlay()" title="Rename Base" style="background:none;border:none;color:#6ad;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 4px;opacity:0.9;vertical-align:middle;">✎</button>
        </div>
        <div style="padding:6px 8px;">
          <div class="bp-level" style="color:${isLightColor(MINE_TIERS[bl]?.color||'#8ab')?'#111':'#fff'};font-family:'Orbitron',sans-serif;font-weight:700;letter-spacing:2px;background:${MINE_TIERS[bl]?.color||'#8ab'};padding:2px 10px;border-radius:4px;">TIER ${toRoman(bl)}</div>
        </div>
      </div>
      <div class="bp-section-title">◈ Base Stats</div>
      <div style="padding:8px 10px;border:1px solid ${hpPct<25?'#803030':'#2a6040'};border-radius:6px;background:${hpPct<25?'rgba(60,12,12,0.2)':'rgba(12,45,26,0.16)'};margin-bottom:6px;">
        <div class="bp-row" style="margin-bottom:6px;"><span style="font-size:18px;">HEALTH</span><span class="bp-val" style="color:${hpPct<25?'#f88':'#4d8'};font-size:17px;padding:2px 8px;line-height:1.2;">${fmt(state.base.health)} / ${fmt(state.base.maxHealth)}</span></div>
        ${(() => {
          const total = state.base.maxHealth + maxShield;
          const hpW   = (state.base.health / total * 100).toFixed(2);
          const shW   = (shield / total * 100).toFixed(2);
          const hpCol = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';
          return `<div class="bp-health-bar" style="position:relative;overflow:hidden;">
            <div style="position:absolute;left:0;top:0;height:100%;width:${hpW}%;background:${hpCol};"></div>
            ${shield > 0 ? `<div style="position:absolute;left:${hpW}%;top:0;height:100%;width:${shW}%;background:linear-gradient(90deg,#1a6aff,#48f);"></div>` : ''}
          </div>
          ${maxShield > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:14px;margin-top:5px;">
            <span style="color:#69a3ff;">◈ Shield (+${fmt(Math.round(shieldPerSec))}/s)</span>
            <span style="color:#48f;font-size:16px;font-family:'Share Tech Mono',monospace;">${fmt(shield)} / ${fmt(maxShield)}</span>
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
        return '<div style="background:rgba(60,10,10,0.4);border:1px solid #803020;border-radius:4px;padding:8px 10px;margin:6px 0;">'
          + '<div style="font-size:13px;color:#f88;margin-bottom:4px;">⚠ Base damaged — ' + fmt(missing) + ' HP missing</div>'
          + '<div style="font-size:13px;color:#ffe066;margin-bottom:6px;">Repair cost: $' + fmt(cost.coins) + '</div>'
          + '<button class="' + btnClass + '" style="width:100%;font-size:14px;" ' + disabled + ' onclick="repairBase(' + missing + ')">🔧 REPAIR FULL</button>'
          + '</div>';
      })()}
      <div style="display:flex;border:1px solid #1a3a6e;border-radius:5px;background:rgba(10,20,50,0.4);overflow:hidden;margin-bottom:8px;">
        <div style="flex:1;padding:10px 12px;text-align:center;">
          <div style="color:#3a6a9a;font-size:11px;letter-spacing:1px;font-family:'Orbitron',sans-serif;margin-bottom:4px;">SHIP CAPACITY</div>
          <div style="color:#cde;font-family:'Share Tech Mono',monospace;font-size:18px;">${state.ships.length + activeCraftCount} / ${maxShips}</div>
        </div>
        <div style="width:1px;background:#1a3a6e;"></div>
        <div style="flex:1;padding:10px 12px;text-align:center;">
          <div style="color:#3a6a9a;font-size:11px;letter-spacing:1px;font-family:'Orbitron',sans-serif;margin-bottom:4px;">TILE RANGE</div>
          <div style="color:#cde;font-family:'Share Tech Mono',monospace;font-size:18px;">◎ ${BASE_RANGE[bl-1]}</div>
        </div>
        <div style="width:1px;background:#1a3a6e;"></div>
        <div style="flex:1;padding:10px 12px;text-align:center;">
          <div style="color:#3a6a9a;font-size:11px;letter-spacing:1px;font-family:'Orbitron',sans-serif;margin-bottom:4px;">RESEARCH PTS</div>
          <div style="color:#a0f0a0;font-family:'Share Tech Mono',monospace;font-size:18px;">${state.rp} / ${getResearchPointCap(bl)}</div>
        </div>
      </div>
      <div style="background:rgba(8,22,46,0.55);border:1px solid #23426f;border-radius:5px;padding:10px;margin-top:8px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#8fc3ff;letter-spacing:1.4px;margin-bottom:7px;">◈ INSTALLED UPGRADES</div>
        ${installedUpgrades.length
          ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${installedUpgrades.map(upg => `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 8px;background:rgba(6,16,34,0.6);border:1px solid #1c3659;border-radius:4px;text-align:center;">
                  <div style="display:flex;align-items:center;gap:7px;justify-content:center;flex-wrap:wrap;">
                    <span style="font-size:18px;line-height:1;">${upg.icon}</span>
                    <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">${upg.name}</span>
                    ${upg.qty ? `<span style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${upg.qty}</span>` : ''}
                  </div>
                  <div style="font-size:13px;color:#6f97bc;">${formatUpgradeDetail(upg.detail)}</div>
                </div>`).join('')}
            </div>`
          : '<div style="font-size:14px;color:#4a6a8a;">No tower upgrades installed yet.</div>'}
        <div style="height:10px;"></div>
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#8fc3ff;letter-spacing:1.4px;margin-bottom:7px;">⚔ COMBAT</div>
        ${combatUpgrades.length
          ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${combatUpgrades.map(upg => `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 8px;background:rgba(6,16,34,0.6);border:1px solid #1c3659;border-radius:4px;text-align:center;">
                  <div style="display:flex;align-items:center;gap:7px;justify-content:center;flex-wrap:wrap;">
                    <span style="font-size:18px;line-height:1;">${upg.icon}</span>
                    <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">${upg.name}</span>
                    ${upg.qty ? `<span style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${upg.qty}</span>` : ''}
                  </div>
                  <div style="font-size:13px;color:#6f97bc;">${formatUpgradeDetail(upg.detail)}</div>
                </div>`).join('')}
            </div>`
          : '<div style="font-size:14px;color:#4a6a8a;">No combat upgrades unlocked yet.</div>'}
        <div style="height:10px;"></div>
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#8fc3ff;letter-spacing:1.4px;margin-bottom:7px;">◎ UNLOCKED PERKS</div>
        ${unlockedPerks.length
          ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${unlockedPerks.map(perk => `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 8px;background:rgba(6,16,34,0.6);border:1px solid #1c3659;border-radius:4px;text-align:center;">
                  <div style="display:flex;align-items:center;gap:7px;justify-content:center;flex-wrap:wrap;">
                    <span style="font-size:18px;line-height:1;">${perk.icon}</span>
                    <span style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">${perk.name}</span>
                    ${perk.qty ? `<span style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${perk.qty}</span>` : ''}
                  </div>
                  <div style="font-size:13px;color:#6f97bc;">${formatUpgradeDetail(perk.detail)}</div>
                </div>`).join('')}
            </div>`
          : '<div style="font-size:14px;color:#4a6a8a;">No unlocked perks yet.</div>'}
      </div>
      <div class="bp-divider"></div>
      ${nextCost ? (() => {
        const ntColor = MINE_TIERS[bl+1]?.color || '#8ab';
        let reqPills = `<span class="bp-craft-req ${state.coins>=nextCost?'met':'unmet'}">$${fmt(nextCost)}</span>`;
        if (nextResReqs) {
          for (const [r, n] of Object.entries(nextResReqs)) {
            const met = (state.resources[r] || 0) >= n;
            reqPills += `<span class="bp-craft-req ${met?'met':'unmet'}">${RESOURCE_DEFS[r]?.label??r}: ${n}</span>`;
          }
        }
        return `<div style="background:rgba(8,18,42,0.5);border:1px solid #1a3a6e;border-radius:5px;padding:10px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:#4a7aaa;margin-bottom:8px;">UPGRADE → TIER <span style="color:${ntColor};font-family:'Cinzel',serif;font-weight:700;">${toRoman(bl+1)}</span></div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;display:flex;flex-wrap:wrap;gap:5px;">${reqPills}</div>
            <div style="flex-shrink:0;">${upgradeBtn}</div>
          </div>
        </div>`;
      })() : `<div style="text-align:center;padding:10px;font-size:13px;color:#ffe066;">★ BASE FULLY UPGRADED</div>`}
      `;

  }

  const bpBodyEl = document.getElementById('bp-body');
  if (bpBodyEl) bpBodyEl.innerHTML = body;
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
