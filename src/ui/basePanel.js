// ============================================================
// BASE PANEL UI — slide-out base station panel
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { getCraft } from '../data/crafts.js';
import { toRoman } from '../data/ships.js';
import { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE, BASE_TIER_REQS } from '../data/base.js';
import { fmt, showHintTooltip, hideTooltip } from '../helpers.js';
import { getRepairCost } from '../systems/base.js';
import { renderTutPointers } from './tutorial.js';
import { TURRET_BASE_STATS } from '../data/turrets.js';
import { HP_BOOST_HEALTH_PER_PURCHASE, DEFENSE_DAMAGE_REDUCTION } from '../data/research.js';


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
  const bt       = state.bpTab || 'overview';

  // Build tab bar once — reuse DOM if already present
  if (!document.getElementById('bp-tabs')) {
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;align-items:stretch;border-bottom:1px solid #1a3a6e;flex-shrink:0;';
    tabBar.innerHTML = `<div id="bp-tabs" style="display:flex;flex:1;">
      <button class="bp-tab" onclick="setBpTab('overview')">BASE</button>
      <button class="bp-tab" onclick="setBpTab('resources')">RESOURCES</button>
      <button class="bp-tab" onclick="setBpTab('defense')">DEFENSE</button>
    </div>
    <button onclick="dismissBasePanel()" style="background:none;border:none;border-left:1px solid #1a3a6e;color:#4a6a8a;font-size:16px;padding:0 12px;cursor:pointer;flex-shrink:0;" onmouseover="this.style.color='#cde'" onmouseout="this.style.color='#4a6a8a'">✕</button>`;
    panel.appendChild(tabBar);
    const bodyEl = document.createElement('div');
    bodyEl.id = 'bp-body';
    panel.appendChild(bodyEl);
  }

  document.querySelectorAll('#bp-tabs .bp-tab').forEach((btn, i) => {
    const tabs = ['overview', 'resources', 'defense'];
    btn.classList.toggle('active', tabs[i] === bt);
  });

  let body = '';
  const activeCraftCount = Object.values(state.shipCraftTimers || {}).filter(t => t && Date.now() < t.endsAt).length;

  if (bt === 'overview') {
    const defenseUnlocked = state.researchUnlocks['defense'];
    const hpBoostCount = state.hpBoostCount || 0;
    const installedUpgrades = [];
    if (defenseUnlocked) {
      installedUpgrades.push({
        icon: '🛡',
        name: 'Armor Plating',
        detail: `Base incoming damage reduced by ${Math.round(DEFENSE_DAMAGE_REDUCTION * 100)}%`,
        qty: null,
      });
    }
    if (hpBoostCount > 0) {
      installedUpgrades.push({
        icon: '💪',
        name: 'HP Boost',
        detail: `+${fmt(hpBoostCount * HP_BOOST_HEALTH_PER_PURCHASE)} max base HP total`,
        qty: hpBoostCount,
      });
    }

    const upgradeBtn = nextCost
      ? `<button class="btn${canUpgrade?' primary':''}" style="font-size:13px;padding:6px 14px;white-space:nowrap;" onclick="upgradeBase()" ${canUpgrade?'':'disabled'}>⬆ UPGRADE</button>`
      : `<span style="font-size:13px;color:#ffe066">★ MAX TIER</span>`;

    body = `
      <div class="bp-title bp-title-sign" style="display:flex;flex-direction:row;flex-wrap:nowrap;align-content:space-around;justify-content:space-between;margin-bottom:8px;">
        <div style="padding:6px 8px;">
          <span class="bp-title-main" style="margin:0;">⬡ ${state.base.name || 'Base Station'}</span>
          <button onclick="openBaseRenameOverlay()" title="Rename Base" style="background:none;border:none;color:#6ad;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 4px;opacity:0.9;vertical-align:middle;">✎</button>
        </div>
        <div style="padding:6px 8px;">
          <div class="bp-level" style="color:#ffffff;font-family:'Orbitron',sans-serif;font-weight:700;letter-spacing:2px;background:${MINE_TIERS[bl]?.color||'#8ab'};padding:2px 10px;border-radius:4px;">TIER ${toRoman(bl)}</div>
        </div>
      </div>
      <div class="bp-section-title">◈ Base Stats</div>
      <div style="padding:8px 10px;border:1px solid ${hpPct<25?'#803030':'#2a6040'};border-radius:6px;background:${hpPct<25?'rgba(60,12,12,0.2)':'rgba(12,45,26,0.16)'};margin-bottom:6px;">
        <div class="bp-row" style="margin-bottom:6px;"><span style="font-size:18px;">HEALTH</span><span class="bp-val" style="color:${hpPct<25?'#f88':'#4d8'};font-size:17px;padding:2px 8px;line-height:1.2;">${fmt(state.base.health)} / ${fmt(state.base.maxHealth)}</span></div>
        <div class="bp-health-bar"><div class="bp-health-fill" style="width:${hpPct}%;background:${hpPct<25?'linear-gradient(90deg,#cc1010,#f44)':'linear-gradient(90deg,#2a8040,#4d8)'}"></div></div>
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
          <div style="color:#a0f0a0;font-family:'Share Tech Mono',monospace;font-size:18px;">${state.rp} / ${bl*(bl+1)/2}</div>
        </div>
      </div>
      <div style="background:rgba(8,22,46,0.55);border:1px solid #23426f;border-radius:5px;padding:10px;margin-top:8px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#8fc3ff;letter-spacing:1.4px;margin-bottom:7px;">◈ INSTALLED UPGRADES</div>
        ${installedUpgrades.length
          ? installedUpgrades.map(upg => `<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;background:rgba(6,16,34,0.6);border:1px solid #1c3659;border-radius:4px;margin-bottom:6px;">
              <span style="font-size:16px;line-height:1;">${upg.icon}</span>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-family:'Orbitron',sans-serif;font-size:12px;color:#cde;letter-spacing:1px;">${upg.name}</span>
                  ${upg.qty ? `<span style="font-size:10px;color:#ffe066;background:rgba(60,45,0,0.45);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${upg.qty}</span>` : ''}
                </div>
                <div style="font-size:12px;color:#6f97bc;margin-top:1px;">${upg.detail}</div>
              </div>
            </div>`).join('')
          : '<div style="font-size:14px;color:#4a6a8a;">No tower upgrades installed yet.</div>'}
      </div>
      <div class="bp-divider"></div>
      ${nextCost ? (() => {
        const ntColor = MINE_TIERS[bl+1]?.color || '#8ab';
        let reqPills = `<span style="font-size:13px;padding:2px 6px;border-radius:3px;border:1px solid ${state.coins>=nextCost?'#2a6040':'#802020'};background:${state.coins>=nextCost?'rgba(20,60,30,0.4)':'rgba(60,10,10,0.35)'};color:${state.coins>=nextCost?'#4d8':'#f88'};">$${fmt(nextCost)}</span>`;
        if (nextResReqs) {
          for (const [r, n] of Object.entries(nextResReqs)) {
            const met = (state.resources[r] || 0) >= n;
            reqPills += `<span style="font-size:13px;padding:2px 6px;border-radius:3px;border:1px solid ${met?'#2a6040':'#802020'};background:${met?'rgba(20,60,30,0.4)':'rgba(60,10,10,0.35)'};color:${met?'#4d8':'#f88'};">${RESOURCE_DEFS[r]?.label??r}: ${n}</span>`;
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

  } else if (bt === 'defense') {
    const turretsUnlocked = state.researchUnlocks['turrets'];
    const defenseUnlocked = state.researchUnlocks['defense'];
    const turretCount = (state.turrets || []).length;

    let defBody = '<div class="bp-title" style="margin-bottom:10px"><span>⬡ DEFENSE SYSTEMS</span></div>';

    if (!turretsUnlocked && !defenseUnlocked) {
      defBody += `<div style="padding:16px;background:rgba(20,50,100,0.2);border:1px solid #1a3a6e;border-radius:4px;text-align:center;color:#4a6a8a;font-size:15px;">
        🔒 No defense systems unlocked yet.<br><br>
        <span style="font-size:13px;">Visit the <strong style="color:#8ab">Research panel</strong> to unlock Turret Systems.</span>
      </div>`;
    }

    if (defenseUnlocked) {
      defBody += `<div style="background:rgba(10,30,60,0.5);border:1px solid #2a4a7a;border-radius:5px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span style="font-size:20px;">🛡</span>
          <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#ffe066;letter-spacing:1px;">ARMOR PLATING</div>
          <span style="margin-left:auto;font-size:12px;color:#4d8;background:rgba(20,60,30,0.4);border:1px solid #2a6040;border-radius:3px;padding:1px 6px;">ACTIVE</span>
        </div>
        <div style="font-size:14px;color:#5a7a9a;">Incoming base damage reduced by <strong style="color:#cde;">${Math.round(DEFENSE_DAMAGE_REDUCTION * 100)}%</strong>.</div>
      </div>`;
    }

    if (turretsUnlocked) {
      defBody += `<div style="background:rgba(10,30,60,0.5);border:1px solid #2a4a7a;border-radius:5px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:20px;">🔫</span>
          <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">TURRET SYSTEMS</div>
          <span style="margin-left:auto;font-size:13px;color:#8ab;">${turretCount} built</span>
        </div>
        <div style="font-size:14px;color:#5a7a9a;margin-bottom:8px;">Build turrets on free map tiles to defend your base. Each turret has ${TURRET_BASE_STATS.health.toLocaleString()} HP, ${TURRET_BASE_STATS.damage} damage and ${TURRET_BASE_STATS.range}-tile range.</div>
        ${(() => {
          const turretCraft = getCraft('turrets', 'turret');
          const canCoins  = state.coins >= turretCraft.cost;
          const reqsMet   = Object.entries(turretCraft.reqs).map(([r, n]) => [(state.resources[r] || 0) >= n, r, n]);
          const canBuild  = canCoins && reqsMet.every(([met]) => met);
          const pill    = (met, label) => '<span class="bp-craft-req" style="font-size:14px;border-color:'+(met?'#7a6010':'#802020')+';background:'+(met?'rgba(60,45,0,0.4)':'rgba(60,10,10,0.4)')+';color:'+(met?'#ffe066':'#f88')+';">'+label+'</span>';
          const resPill = (met, label) => '<span class="bp-craft-req '+(met?'met':'unmet')+'" style="font-size:14px;">'+label+'</span>';
          const resPills = reqsMet.map(([met, r, n]) => resPill(met, `${r[0].toUpperCase()+r.slice(1)}: ${n}`)).join('');
          return '<div class="bp-craft-reqs" style="margin-bottom:8px;">'
            + pill(canCoins, '$' + turretCraft.cost)
            + resPills
            + '</div>'
            + (state.unplacedTurrets > 0
              ? '<button class="btn primary" style="width:100%;font-size:14px;" onclick="beginPlacingTurret()">🔫 PLACE TURRET ('+state.unplacedTurrets+')</button>'
              : '<button class="btn primary" style="width:100%;font-size:14px;" '+(canBuild?'':'disabled')+' onclick="startPlaceTurret()">🔫 BUILD TURRET</button>'
            );
        })()}
      </div>`;
    }

    body = defBody;

  } else if (bt === 'resources') {
    const tierSections = Object.entries(MINE_TIERS).map(([tier, tierInfo]) => {
      const cards = tierInfo.resources.map(k => {
        const def = RESOURCE_DEFS[k];
        const v = state.resources[k] || 0;
        const empty = v === 0;
        return `<div style="background:rgba(10,20,50,0.6);border:1px solid #1a3a6e;border-left:3px solid ${def.color};border-radius:6px;padding:10px 12px;display:flex;align-items:center;gap:10px;${empty ? 'opacity:0.4;' : ''}">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${def.color};flex-shrink:0;box-shadow:0 0 8px ${def.color}99;"></span>
          <span style="font-family:'Orbitron',sans-serif;font-size:15px;color:#cde;letter-spacing:1px;flex:1;">${def.label}</span>
          <span style="font-size:16px;font-weight:bold;color:${empty ? '#4a6a8a' : '#ffe066'};font-family:'Share Tech Mono',monospace;">${fmt(v)}</span>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:16px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px;color:${tierInfo.color};margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid ${tierInfo.color}55;">${tierInfo.label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${cards}</div>
      </div>`;
    }).join('');
    body = `
      <div class="bp-title" style="margin-bottom:12px;"><span>⬡ RESOURCE STOCKPILE</span></div>
      ${tierSections}`;
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
