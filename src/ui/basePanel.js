// ============================================================
// BASE PANEL UI — slide-out base station panel
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFTS, CRAFT_SHIPS as CRAFT_RECIPES, getCraft } from '../data/crafts.js';
import { SHIP_DEFS } from '../data/ships.js';
import { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE } from '../data/nodes.js';
import { fmt } from '../helpers.js';
import { getRepairCost } from '../systems/base.js';

export function renderBasePanel() {
  const panel   = document.getElementById('base-panel');
  const overlay = document.getElementById('base-panel-overlay');
  if (!panel) return;
  if (!state.basePanelOpen) {
    panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    return;
  }
  panel.classList.add('open');
  if (overlay) overlay.classList.add('open');

  const bl       = state.base.level;
  const maxShips = BASE_MAX_SHIPS[bl - 1] || 5;
  const nextCost = BASE_UPGRADE_COSTS[bl] || null;
  const canUpgrade = nextCost && state.coins >= nextCost;
  const hpPct    = (state.base.health / state.base.maxHealth * 100).toFixed(0);
  const bt       = state.bpTab || 'overview';
  const typeCounts = {};
  for (const s of state.ships) {
    const label = CRAFT_RECIPES.find(r => r.id === s.type)?.name || 'Starter';
    typeCounts[label] = (typeCounts[label] || 0) + 1;
  }
  const nodeAssign = {};
  for (const s of state.ships) {
    if (!s.targetNode) continue;
    const node = state.nodes.find(n => n.id === s.targetNode);
    if (!node) continue;
    const label = RESOURCE_DEFS[node.type].label;
    nodeAssign[label] = (nodeAssign[label] || 0) + 1;
  }
  const mpm = {};
  for (const s of state.ships) {
    if (!s.targetNode || s.status === 'idle') continue;
    const node = state.nodes.find(n => n.id === s.targetNode);
    if (!node) continue;
    const label = RESOURCE_DEFS[node.type].label;
    mpm[label] = (mpm[label] || 0) + (60 / (1.5 / s.mineSpeed));
  }
  const typeHtml   = Object.entries(typeCounts).map(([t,n]) => `<div class="bp-row"><span>${t}</span><span class="bp-val">${n}x</span></div>`).join('') || '<div class="bp-row" style="color:#3a5a7a">No ships</div>';
  const assignHtml = Object.entries(nodeAssign).map(([t,n]) => `<div class="bp-row"><span>${t} node</span><span class="bp-val green">${n} ship${n>1?'s':''}</span></div>`).join('') || '<div class="bp-row" style="color:#3a5a7a">None assigned</div>';
  const mpmHtml    = Object.entries(mpm).map(([t,n]) => `<div class="bp-row"><span>${t}</span><span class="bp-val gold">${Math.round(n)}/m</span></div>`).join('') || '<div class="bp-row" style="color:#3a5a7a">Not mining</div>';

  // Build tab bar once — reuse DOM if already present
  if (!document.getElementById('bp-tabs')) {
    const tabBar = document.createElement('div');
    tabBar.style.cssText = 'display:flex;align-items:stretch;border-bottom:1px solid #1a3a6e;flex-shrink:0;';
    tabBar.innerHTML = `<div id="bp-tabs" style="display:flex;flex:1;">
      <button class="bp-tab" onclick="setBpTab('overview')">BASE</button>
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
    const tabs = ['overview', 'craft', 'defense'];
    btn.classList.toggle('active', tabs[i] === bt);
  });

  let body = '';

  if (bt === 'overview') {
    const upgradeBtn = nextCost
      ? `<button class="btn${canUpgrade?' primary':''}" style="font-size:14px;padding:5px 10px" onclick="upgradeBase()" ${canUpgrade?'':'disabled'}>UPGRADE → Lv${bl+1}</button>`
      : `<span style="font-size:13px;color:#ffe066">★ MAX LEVEL</span>`;

    body = `
      <div class="bp-title bp-title-sign" style="margin-bottom:8px;">
        <div class="bp-title-main">⬡ ${state.base.name || 'Base Station'} <button onclick="openBaseRenameOverlay()" title="Rename Base" style="background:none;border:none;color:#6ad;cursor:pointer;font-size:16px;line-height:1;padding:0 0 0 4px;opacity:0.9;vertical-align:middle;">✎</button></div>
        <div class="bp-level">LV ${bl}</div>
      </div>
      <div class="bp-section-title">◈ Base Stats</div>
      <div class="bp-row"><span>Health</span><span class="bp-val" style="color:${hpPct<30?'#f88':hpPct<60?'#fa8':'#4d8'}">${fmt(state.base.health)} / ${fmt(state.base.maxHealth)}</span></div>
      <div class="bp-health-bar"><div class="bp-health-fill" style="width:${hpPct}%;background:${hpPct<30?'#f44':hpPct<60?'#fa4':'#4af'}"></div></div>
      ${(() => {
        if (state.base.health >= state.base.maxHealth) return '';
        const missing = state.base.maxHealth - state.base.health;
        const cost = getRepairCost(missing);
        const canRepair = state.coins >= cost.coins;
        const btnClass = 'btn' + (canRepair ? ' primary' : '');
        const disabled = canRepair ? '' : 'disabled';
        return '<div style="background:rgba(60,10,10,0.4);border:1px solid #803020;border-radius:4px;padding:8px 10px;margin:6px 0;">'
          + '<div style="font-size:13px;color:#f88;margin-bottom:4px;">⚠ Base damaged — ' + fmt(missing) + ' HP missing</div>'
          + '<div style="font-size:13px;color:#8ab;margin-bottom:6px;">Repair cost: ' + fmt(cost.coins) + '¢</div>'
          + '<button class="' + btnClass + '" style="width:100%;font-size:14px;" ' + disabled + ' onclick="repairBase(' + missing + ')">🔧 REPAIR FULL</button>'
          + '</div>';
      })()}
      <table class="bp-stats-table">
        <tr><td>Ship Capacity</td><td>${state.ships.length} / ${maxShips}</td></tr>
        <tr><td>Tile Range</td><td>${BASE_RANGE[bl-1]} tiles each direction</td></tr>
        <tr><td>Research Points</td><td style="color:#a0f0a0">${state.rp} / ${2+(bl-1)}</td></tr>
      </table>
      <div class="bp-divider"></div>
      <div class="bp-section-title">◈ Fleet Composition</div>
      ${typeHtml}
      <div class="bp-upgrade-row">
        <div class="bp-upgrade-info">
          <div class="bp-upgrade-label">${nextCost ? `Upgrade to Lv${bl+1}` : 'Base Fully Upgraded'}</div>
          ${nextCost ? `<div class="bp-upgrade-cost">${fmt(nextCost)}¢</div>` : ''}
        </div>
        ${upgradeBtn}
      </div>`;

  } else if (bt === 'craft') {
    const atCap = state.ships.length >= maxShips;
    let items = '';
    for (const recipe of CRAFT_RECIPES) {
      const stats     = SHIP_DEFS[recipe.id] || SHIP_DEFS.scout;
      const shipColor = recipe.id === 'freighter' ? '#ffaa30'
        : recipe.id === 'hauler' ? '#80d0ff'
        : recipe.id === 'swift' ? '#ff80c0'
        : '#60d090';
      const tierLocked = stats.mineTier > bl;
      if (tierLocked) continue;
      const reqsMet  = Object.entries(recipe.reqs).every(([r,n]) => (state.resources[r]||0) >= n);
      const canCraft = !tierLocked && reqsMet && !atCap;
      const tierColor = MINE_TIERS[stats.mineTier]?.color || '#fff';
      let reqsHtml = '';
      for (const [r,n] of Object.entries(recipe.reqs)) {
        const have = state.resources[r] || 0;
        const met  = have >= n;
        reqsHtml += `<span class="bp-craft-req ${met?'met':'unmet'}" style="font-size:14px;">${RESOURCE_DEFS[r].label}: ${n}</span>`;
      }
      const lockBanner = tierLocked
        ? `<div style="background:rgba(80,10,10,0.5);border:1px solid #803030;border-radius:3px;padding:5px 8px;margin-bottom:7px;font-size:13px;color:#f88;letter-spacing:0.5px;">⚠ REQUIRES BASE STATION LEVEL ${stats.mineTier}</div>`
        : '';
      const buildBtn = tierLocked ? '' :
        `<button class="btn ${atCap ? 'danger' : 'primary'}" style="width:100%;margin-top:6px;" ${!canCraft?'disabled':''} onclick="craftShip('${recipe.id}')">BUILD SHIP</button>`;
      items += `<div class="bp-craft-item" style="${tierLocked?'opacity:0.45;':''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="color:${shipColor};font-size:15px;filter:drop-shadow(0 0 5px ${shipColor}66);">▲</span>
          <div style="font-family:'Orbitron',sans-serif;font-size:15px;font-weight:700;color:#e8eef8;letter-spacing:1px;text-transform:uppercase;flex:1;">${recipe.name}</div>
          <span style="font-size:12px;padding:2px 7px;border-radius:3px;border:1px solid ${tierColor}40;background:${tierColor}18;color:${tierColor};font-family:'Orbitron',sans-serif;letter-spacing:1px;">TIER ${stats.mineTier}</span>
        </div>
        <div style="font-size:14px;color:#4a6a8a;margin-bottom:8px;">${recipe.desc}</div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:15px;">
          <tr><td style="color:#4a7aaa;padding:3px 0;width:50%;">▲ Cargo Cap</td><td style="color:#cde;font-weight:bold;">${stats.capacity} units</td></tr>
          <tr><td style="color:#4a7aaa;padding:3px 0;">✈ Fly Speed</td><td style="color:#cde;font-weight:bold;">${stats.flySpeed}x</td></tr>
          <tr><td style="color:#4a7aaa;padding:3px 0;">⛏ Mine Speed</td><td style="color:#cde;font-weight:bold;">${stats.mineSpeed}x</td></tr>
        </table>
        ${lockBanner}
        <div class="bp-craft-reqs">${reqsHtml}</div>
        ${buildBtn}
      </div>`;
    }
    if (atCap) items = `<div style="font-size:16px;color:#f88;background:rgba(60,10,10,0.4);border:1px solid #803020;border-radius:3px;padding:6px 8px;margin-bottom:8px;text-align:center;">⚠ Ship capacity full (${state.ships.length}/${maxShips}).<br>Upgrade the Base or sell a ship.</div>` + items;
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
        <div style="font-size:14px;color:#5a7a9a;">Incoming base damage reduced by <strong style="color:#cde;">10%</strong>.</div>
      </div>`;
    }

    if (turretsUnlocked) {
      defBody += `<div style="background:rgba(10,30,60,0.5);border:1px solid #2a4a7a;border-radius:5px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:20px;">🔫</span>
          <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#cde;letter-spacing:1px;">TURRET SYSTEMS</div>
          <span style="margin-left:auto;font-size:13px;color:#8ab;">${turretCount} built</span>
        </div>
        <div style="font-size:14px;color:#5a7a9a;margin-bottom:8px;">Build turrets on free map tiles to defend your base. Each turret has 5,000 HP, 100 damage and 6-tile range.</div>
        ${(() => {
          const turretCraft = getCraft('turrets', 'turret');
          const canCoins  = state.coins >= turretCraft.cost;
          const reqsMet   = Object.entries(turretCraft.reqs).map(([r, n]) => [(state.resources[r] || 0) >= n, r, n]);
          const canBuild  = canCoins && reqsMet.every(([met]) => met);
          const pill    = (met, label) => '<span class="bp-craft-req" style="font-size:14px;border-color:'+(met?'#7a6010':'#802020')+';background:'+(met?'rgba(60,45,0,0.4)':'rgba(60,10,10,0.4)')+';color:'+(met?'#ffe066':'#f88')+';">'+label+'</span>';
          const resPill = (met, label) => '<span class="bp-craft-req '+(met?'met':'unmet')+'" style="font-size:14px;">'+label+'</span>';
          const resPills = reqsMet.map(([met, r, n]) => resPill(met, `${r[0].toUpperCase()+r.slice(1)}: ${n}`)).join('');
          return '<div class="bp-craft-reqs" style="margin-bottom:8px;">'
            + pill(canCoins, turretCraft.cost + '¢')
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
  }

  const bpBodyEl = document.getElementById('bp-body');
  if (bpBodyEl) bpBodyEl.innerHTML = body;
}

window.setBpTab = function(tab) {
  state.bpTab = tab;
  if (tab === 'craft' && state.tutStep === 6) state.tutStep = 7;
  renderBasePanel();
};

window.dismissBasePanel = function() {
  state.basePanelOpen = false;
  renderBasePanel();
};
