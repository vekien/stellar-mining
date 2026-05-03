// ============================================================
// BASE PANEL UI — slide-out base station panel
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFTS, CRAFT_SHIPS as CRAFT_RECIPES, getCraft } from '../data/crafts.js';
import { SHIP_DEFS, toRoman, formatFlySpeed, formatMineSpeedPercent } from '../data/ships.js';
import { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE } from '../data/base.js';
import { fmt, showHintTooltip, hideTooltip } from '../helpers.js';
import { getRepairCost } from '../systems/base.js';
import { renderTutPointers } from './tutorial.js';
import { TURRET_BASE_STATS } from '../data/turrets.js';
import { HP_BOOST_HEALTH_PER_PURCHASE, DEFENSE_DAMAGE_REDUCTION } from '../data/research.js';

setInterval(() => {
  if (!state.basePanelOpen || state.bpTab !== 'craft') return;
  if (!state.shipCraftTimers) return;
  for (const [recipeId, timer] of Object.entries(state.shipCraftTimers)) {
    if (!timer || Date.now() >= timer.endsAt) continue;
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillEl = document.getElementById(`craft-fill-${recipeId}`);
    const labelEl = document.getElementById(`craft-label-${recipeId}`);
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
}, 100);

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
  const nextCost = BASE_UPGRADE_COSTS[bl] || null;
  const canUpgrade = nextCost && state.coins >= nextCost;
  const hpPct    = (state.base.health / state.base.maxHealth * 100).toFixed(0);
  const bt       = state.bpTab || 'overview';

  // Build tab bar once — reuse DOM if already present
  if (!document.getElementById('bp-tabs')) {
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;align-items:stretch;border-bottom:1px solid #1a3a6e;flex-shrink:0;';
    tabBar.innerHTML = `<div id="bp-tabs" style="display:flex;flex:1;">
      <button class="bp-tab" onclick="setBpTab('overview')">BASE</button>
      <button class="bp-tab" onclick="setBpTab('resources')">RESOURCES</button>
      <button class="bp-tab" onclick="setBpTab('craft')">SHIPS</button>
      <button class="bp-tab" onclick="setBpTab('defense')">DEFENSE</button>
    </div>
    <button onclick="dismissBasePanel()" style="background:none;border:none;border-left:1px solid #1a3a6e;color:#4a6a8a;font-size:16px;padding:0 12px;cursor:pointer;flex-shrink:0;" onmouseover="this.style.color='#cde'" onmouseout="this.style.color='#4a6a8a'">✕</button>`;
    panel.appendChild(tabBar);
    const bodyEl = document.createElement('div');
    bodyEl.id = 'bp-body';
    panel.appendChild(bodyEl);
  }

  document.querySelectorAll('#bp-tabs .bp-tab').forEach((btn, i) => {
    const tabs = ['overview', 'resources', 'craft', 'defense'];
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
      ? `<button class="btn${canUpgrade?' primary':''}" style="font-size:18px;padding:5px 10px" onclick="upgradeBase()" ${canUpgrade?'':'disabled'}>UPGRADE → Lv${bl+1}</button>`
      : `<span style="font-size:13px;color:#ffe066">★ MAX LEVEL</span>`;

    body = `
      <div class="bp-title bp-title-sign" style="margin-bottom:8px;">
        <div class="bp-title-main">⬡ ${state.base.name || 'Base Station'} <button onclick="openBaseRenameOverlay()" title="Rename Base" style="background:none;border:none;color:#6ad;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 4px;opacity:0.9;vertical-align:middle;">✎</button></div>
        <div class="bp-level">LV ${bl}</div>
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
          <div style="color:#a0f0a0;font-family:'Share Tech Mono',monospace;font-size:18px;">${state.rp} / ${2+(bl-1)}</div>
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
      <div class="bp-upgrade-row">
        <div class="bp-upgrade-info">
          <div class="bp-upgrade-label">${nextCost ? `Upgrade to Lv${bl+1}` : 'Base Fully Upgraded'}</div>
          ${nextCost ? `<div class="bp-upgrade-cost">$${fmt(nextCost)}</div>` : ''}
        </div>
        ${upgradeBtn}
      </div>`;

  } else if (bt === 'craft') {
    const atCap = (state.ships.length + activeCraftCount) >= maxShips;

    const ROLE_META = {
      mining:    { label: '⛏  MINING SHIPS',       color: '#60d090', icon: '▲' },
      transport: { label: '▲  CARGO TRANSPORT',     color: '#80d0ff', icon: '▲' },
      combat:    { label: '⚔  COMBAT SHIPS',        color: '#ff6060', icon: '▲' },
      garrison:  { label: '🛡  GARRISON',            color: '#ff8c40', icon: '▲' },
    };

    function roleColor(role) {
      return ROLE_META[role]?.color || '#60d090';
    }

    function shipStatsHtml(stats) {
      const ic = 'color:#4a7aaa;';
      const r = stats.role || 'mining';
      if (r === 'combat') return `<div style="display:flex;gap:10px;font-size:14px;align-items:center;flex-wrap:wrap;">
        <span style="color:#cde;"><span style="${ic}">❤</span> ${(stats.hp||0).toLocaleString()} HP</span>
        <span style="color:#cde;"><span style="${ic}">⚔</span> ${stats.attack||0} atk</span>
        <span style="color:#cde;"><span style="${ic}">⚡</span> ${stats.attackSpeed||0}x rate</span>
      </div>`;
      if (r === 'garrison') return `<div style="display:flex;gap:10px;font-size:14px;align-items:center;flex-wrap:wrap;">
        <span style="color:#cde;"><span style="${ic}">❤</span> ${(stats.hp||0).toLocaleString()} HP</span>
        <span style="color:#cde;"><span style="${ic}">⚔</span> ${stats.attack||0} atk</span>
        <span style="color:#cde;"><span style="${ic}">◎</span> ${stats.range||0} tile range</span>
      </div>`;
      if (r === 'transport') return `<div style="display:flex;gap:10px;font-size:14px;align-items:center;flex-wrap:wrap;">
        <span style="color:#cde;"><span style="${ic}">▲</span> ${stats.capacity}u cargo</span>
        <span style="color:#cde;"><span style="${ic}">✈</span> ${formatFlySpeed(stats.flySpeed)} speed</span>
      </div>`;
      return `<div style="display:flex;gap:14px;font-size:14px;align-items:center;flex-wrap:wrap;">
        <span onmousemove="showHintTooltip(event,'Cargo Capacity')" onmouseleave="hideTooltip()" style="color:#cde;cursor:help;"><span style="${ic}">▲</span> ${stats.capacity}u</span>
        <span onmousemove="showHintTooltip(event,'Fly Speed')" onmouseleave="hideTooltip()" style="color:#cde;cursor:help;"><span style="${ic}">✈</span> ${formatFlySpeed(stats.flySpeed)}</span>
        <span onmousemove="showHintTooltip(event,'Mine Speed')" onmouseleave="hideTooltip()" style="color:#cde;cursor:help;"><span style="${ic}">⛏</span> ${formatMineSpeedPercent(stats.mineSpeed)}</span>
      </div>`;
    }

    const roleOrder = ['mining', 'transport', 'combat', 'garrison'];
    let items = '';

    for (const role of roleOrder) {
      const meta = ROLE_META[role];
      const groupRecipes = CRAFT_RECIPES.filter(r => {
        const s = SHIP_DEFS[r.id];
        return s && (s.role || 'mining') === role && s.mineTier <= bl;
      });
      if (!groupRecipes.length) continue;

      items += `<div style="font-family:'Orbitron',sans-serif;font-size:10px;letter-spacing:2px;color:${meta.color};margin:12px 0 8px;padding-bottom:5px;border-bottom:1px solid ${meta.color}33;">${meta.label}</div>`;

      for (const recipe of groupRecipes) {
        const stats     = SHIP_DEFS[recipe.id] || SHIP_DEFS.scout;
        const sc        = roleColor(stats.role || 'mining');
        const tierColor = MINE_TIERS[stats.mineTier]?.color || '#fff';
        const reqsMet   = Object.entries(recipe.reqs).every(([r,n]) => (state.resources[r]||0) >= n);
        const canCraft  = reqsMet && !atCap;
        let reqsHtml = '';
        for (const [r,n] of Object.entries(recipe.reqs)) {
          const met = (state.resources[r] || 0) >= n;
          reqsHtml += `<span class="bp-craft-req ${met?'met':'unmet'}" style="font-size:14px;">${RESOURCE_DEFS[r].label}: ${n}</span>`;
        }
        const craftTimer = state.shipCraftTimers?.[recipe.id];
        const timerActive = !!(craftTimer && Date.now() < craftTimer.endsAt);
        const remainMs = timerActive ? Math.max(0, craftTimer.endsAt - Date.now()) : 0;
        const remainSec = Math.ceil(remainMs / 1000);
        const pct = timerActive ? Math.max(0, Math.min(100, ((craftTimer.durationMs - remainMs) / craftTimer.durationMs) * 100)) : 0;
        const builtNoticeUntil = state.shipCraftNotices?.[recipe.id] || 0;
        const builtNoticeActive = Date.now() < builtNoticeUntil;
        const buildBtn = builtNoticeActive
          ? `<button class="btn bp-craft-btn bp-craft-btn-ready" style="width:100%;margin-top:6px;" disabled><span class="bp-craft-btn-label">SHIP BUILT AND DEPLOYED!</span></button>`
          : timerActive
          ? `<button class="btn bp-craft-btn bp-craft-btn-crafting" style="width:100%;margin-top:6px;" disabled><span class="bp-craft-btn-fill" id="craft-fill-${recipe.id}" style="width:${pct}%;"></span><span class="bp-craft-btn-label" id="craft-label-${recipe.id}">CRAFTING ${remainSec}s</span></button>`
          : `<button class="btn ${atCap?'danger':'primary'}" style="width:100%;margin-top:6px;" ${!canCraft?'disabled':''} onclick="startCraftShip('${recipe.id}')">BUILD SHIP</button>`;

        items += `<div class="bp-craft-item">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="color:${sc};font-size:15px;filter:drop-shadow(0 0 5px ${sc}66);">▲</span>
            <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
              <span style="font-family:'Orbitron',sans-serif;font-size:15px;font-weight:700;color:#e8eef8;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;">${recipe.name}</span>
              <span style="font-size:13px;color:#5a7a9a;font-style:italic;">${recipe.desc}</span>
            </div>
            <span style="font-size:13px;padding:2px 8px;border-radius:3px;border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};font-family:'Cinzel',serif;font-weight:600;flex-shrink:0;">${toRoman(stats.mineTier)}</span>
            <span style="font-size:13px;padding:2px 8px;border-radius:3px;border:1px solid ${sc}33;background:${sc}12;color:${sc};font-family:'Orbitron',sans-serif;letter-spacing:1px;flex-shrink:0;text-transform:uppercase;">${stats.role||'mining'}</span>
          </div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
            <tr>
              <th style="padding:6px 0;color:#3a6a9a;font-size:11px;letter-spacing:1px;text-align:left;border-bottom:1px solid #1a3a6e;border-right:1px solid #1a3a6e;font-family:'Orbitron',sans-serif;font-weight:600;background:rgba(6,14,38,0.6);">REQUIRED RESOURCES</th>
              <th style="padding:6px 10px;color:#3a6a9a;font-size:11px;letter-spacing:1px;text-align:left;border-bottom:1px solid #1a3a6e;font-family:'Orbitron',sans-serif;font-weight:600;background:rgba(6,14,38,0.6);">SHIP STATS</th>
            </tr>
            <tr>
              <td style="padding:8px 0;vertical-align:top;border-right:1px solid #1a3a6e;width:50%;"><div class="bp-craft-reqs" style="margin-top:0;">${reqsHtml}</div></td>
              <td style="padding:8px 10px;vertical-align:middle;width:50%;">${shipStatsHtml(stats)}</td>
            </tr>
          </table>
          ${buildBtn}
        </div>`;
      }
    }

    if (atCap) items = `<div style="font-size:16px;color:#f88;background:rgba(60,10,10,0.4);border:1px solid #803020;border-radius:3px;padding:6px 8px;margin-bottom:8px;text-align:center;">⚠ Ship capacity full (${state.ships.length + activeCraftCount}/${maxShips}).<br>Upgrade the Base or sell a ship.</div>` + items;
    body = `
      <div class="bp-title" style="margin-bottom:10px;"><span>⬡ SHIP CONSTRUCTION</span></div>
      <div class="bp-craft-grid">${items}</div>`;

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
  if (tab === 'craft' && state.tutStep === 6) state.tutStep = 7;
  renderBasePanel();
  renderTutPointers();
  if (tab === 'craft' && state.tutStep === 7) {
    requestAnimationFrame(() => {
      const btn = document.querySelector('.bp-craft-item .btn');
      if (btn?.scrollIntoView) btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      requestAnimationFrame(() => renderTutPointers());
    });
  }
};

window.dismissBasePanel = function() {
  state.basePanelOpen = false;
  renderBasePanel();
};

window.showHintTooltip = showHintTooltip;
window.hideTooltip = hideTooltip;
