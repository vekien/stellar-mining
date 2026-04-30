// ============================================================
// HEADER PANELS — SOL overview, research, market, fleet, codex
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_SHIPS as CRAFT_RECIPES } from '../data/crafts.js';
import { SHIP_DEFS } from '../data/ships.js';
import { BASE_MAX_SHIPS, BASE_UPGRADE_COSTS } from '../data/nodes.js';
import { NPCS } from '../data/npcs.js';
import { RESEARCH_TREE } from '../data/research.js';
import { fmt } from '../helpers.js';
import { getSellPrice } from '../systems/market.js';
import { cancelTurretPlacement } from './turretUI.js';
import { renderBasePanel } from './basePanel.js';
import { removeReassignTooltip } from './tutorial.js';

let _hdrPanelOpen = null;
let _codexTab = 'crew';
let _fleetCompSig = '';
let _fleetSortKey = 'name';
let _fleetSortDir = 1;

// Expose for research.js (re-opens after purchase)
window.openHdrPanel  = openHdrPanel;
window._hdrPanelOpen = null;
// Sync module-level var when research.js pokes the global
Object.defineProperty(window, '_hdrPanelOpen', {
  get: () => _hdrPanelOpen,
  set: (v) => { _hdrPanelOpen = v; },
});

export function closeHdrPanel(e) {
  if (e && e.target !== document.getElementById('hdr-modal-overlay')) return;
  document.getElementById('hdr-modal-overlay').classList.remove('open');
  _hdrPanelOpen = null;
}

export function dismissHdrModal() {
  document.getElementById('hdr-modal-overlay').classList.remove('open');
  _hdrPanelOpen = null;
}

export function refreshHdrPanelIfOpen() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!_hdrPanelOpen || !overlay?.classList.contains('open')) return;

  // Avoid re-rendering codex on interval so its scroll position stays stable.
  if (_hdrPanelOpen === 'codex') return;
  if (_hdrPanelOpen === 'fleet') {
    refreshFleetPanelPartial();
    return;
  }

  const current = _hdrPanelOpen;
  _hdrPanelOpen = null;
  openHdrPanel(current);
}

function getFleetTypeCounts() {
  const typeCounts = {};
  for (const s of state.ships) {
    const typeName = CRAFT_RECIPES.find(r => r.id === s.type)?.name || 'Starter';
    typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
  }
  return typeCounts;
}

function getShipTypeName(ship) {
  return CRAFT_RECIPES.find(r => r.id === ship.type)?.name || 'Starter';
}

function getShipStatusLabel(ship) {
  return ship.status === 'flying' ? '▶ Flying'
    : ship.status === 'mining' ? '⛏ Mining'
    : ship.status === 'returning' ? '◀ Returning'
    : '— Idle';
}

function getShipNodeLabel(ship) {
  const node = state.nodes.find(n => n.id === ship.targetNode);
  return node ? RESOURCE_DEFS[node.type].label : '—';
}

function getShipTierValue(ship) {
  return ship.tier || ship.mineTier || 1;
}

function getFleetSortValue(ship, key) {
  if (key === 'name') return ship.name || '';
  if (key === 'type') return getShipTypeName(ship);
  if (key === 'tier') return getShipTierValue(ship);
  if (key === 'node') return getShipNodeLabel(ship);
  if (key === 'status') return getShipStatusLabel(ship);
  if (key === 'cargo') return ship.cargo || 0;
  return ship.name || '';
}

function getSortedFleetShips() {
  const list = [...state.ships];
  list.sort((a, b) => {
    const av = getFleetSortValue(a, _fleetSortKey);
    const bv = getFleetSortValue(b, _fleetSortKey);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
    if (cmp === 0) cmp = (a.id || 0) - (b.id || 0);
    return cmp * _fleetSortDir;
  });
  return list;
}

function sortArrowFor(key) {
  if (_fleetSortKey !== key) return '↕';
  return _fleetSortDir === 1 ? '▲' : '▼';
}

function fleetHeaderCell(label, key) {
  return `<th onclick="sortFleetManifest('${key}')" style="cursor:pointer;user-select:none;white-space:nowrap;">${label} <span style="color:${_fleetSortKey===key?'#8fc3ff':'#4a6a8a'};font-size:11px;">${sortArrowFor(key)}</span></th>`;
}

function buildFleetCompositionHtml(typeCounts) {
  const compositionHeaders = Object.keys(typeCounts);
  const compositionValues = compositionHeaders.map((key) => typeCounts[key]);
  if (!compositionHeaders.length) return '<div style="font-size:13px;color:#3a5a7a;margin-bottom:12px;">No ships in fleet yet.</div>';
  return `<div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ FLEET COMPOSITION</div>
    <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #3a6aa8;border-radius:4px;overflow:hidden;margin-bottom:12px;box-shadow:0 0 0 1px rgba(110,170,255,0.18) inset;">
      <tr>${compositionHeaders.map(name => `<td style="padding:8px 10px;color:#8ab;font-size:13px;border-bottom:1px solid #2a4f80;">${name}</td>`).join('')}</tr>
      <tr>${compositionValues.map(value => `<td style="padding:8px 10px;color:#cde;font-size:18px;font-weight:bold;">${value}</td>`).join('')}</tr>
    </table>`;
}

function refreshFleetPanelPartial() {
  const body = document.getElementById('hdr-modal-body');
  if (!body) return;
  const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 5;
  const countEl = body.querySelector('#fleet-count');
  if (countEl) countEl.textContent = `Fleet ${state.ships.length}/${maxShips}`;

  const sig = JSON.stringify(getFleetTypeCounts());
  const compWrap = body.querySelector('#fleet-composition-wrap');
  if (compWrap && sig !== _fleetCompSig) {
    compWrap.innerHTML = buildFleetCompositionHtml(getFleetTypeCounts());
    _fleetCompSig = sig;
  }

  const rows = body.querySelectorAll('tr[data-ship-id]');
  if (rows.length !== state.ships.length) {
    const current = _hdrPanelOpen;
    _hdrPanelOpen = null;
    openHdrPanel(current);
    return;
  }
  const sortedShips = getSortedFleetShips();
  const tbody = body.querySelector('.fleet-table tbody');
  if (tbody) {
    for (const ship of sortedShips) {
      const row = body.querySelector(`tr[data-ship-id="${ship.id}"]`);
      if (row) tbody.appendChild(row);
    }
  }

  for (const ship of sortedShips) {
    const row = body.querySelector(`tr[data-ship-id="${ship.id}"]`);
    if (!row) {
      const current = _hdrPanelOpen;
      _hdrPanelOpen = null;
      openHdrPanel(current);
      return;
    }
    const status = getShipStatusLabel(ship);
    const nodeLabel = getShipNodeLabel(ship);
    const tier = `T${getShipTierValue(ship)}`;
    const cargo = `${ship.cargo}/${ship.capacity}`;

    const nodeEl = row.querySelector('[data-cell="node"]');
    const statusEl = row.querySelector('[data-cell="status"]');
    const cargoEl = row.querySelector('[data-cell="cargo"]');
    const tierEl = row.querySelector('[data-cell="tier"]');
    if (nodeEl && nodeEl.textContent !== nodeLabel) nodeEl.textContent = nodeLabel;
    if (statusEl && statusEl.textContent !== status) statusEl.textContent = status;
    if (cargoEl && cargoEl.textContent !== cargo) cargoEl.textContent = cargo;
    if (tierEl && tierEl.textContent !== tier) tierEl.textContent = tier;
  }
}

window.sortFleetManifest = function(key) {
  if (_fleetSortKey === key) _fleetSortDir *= -1;
  else { _fleetSortKey = key; _fleetSortDir = 1; }
  if (_hdrPanelOpen === 'fleet') {
    const current = _hdrPanelOpen;
    _hdrPanelOpen = null;
    openHdrPanel(current);
  }
};

export function handleBasePanelOverlayClick(e) {
  if (e.target === document.getElementById('base-panel-overlay')) {
    state.basePanelOpen = false;
    renderBasePanel();
  }
}

function switchCodexTab(tab) {
  _codexTab = tab;
  _hdrPanelOpen = null; // prevent toggle-off
  openHdrPanel('codex');
}
window.switchCodexTab = switchCodexTab;

export function openHdrPanel(type) {
  const overlay = document.getElementById('hdr-modal-overlay');
  const heading = document.getElementById('hdr-modal-heading');
  const body    = document.getElementById('hdr-modal-body');

  if (_hdrPanelOpen === type && overlay.classList.contains('open')) {
    overlay.classList.remove('open');
    _hdrPanelOpen = null;
    return;
  }

  // Opening any header panel clears active ship selection.
  state.selectedShip = null;
  state.pendingAssign = null;
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = '';
  removeReassignTooltip();

  cancelTurretPlacement();
  if (type === 'market' && state.tutStep === 10) {
    state.tutStep = 11;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }
  _hdrPanelOpen = type;
  overlay.classList.add('open');

  if (type === 'research' && state.seenMsgs['dax_lv3_intro'] && state.seenMsgs['kai_lv3_intro']) {
    state.seenMsgs['lv3_research_pointer_done'] = true;
    document.querySelectorAll('#tut-ptr-research-lv3').forEach(el => el.remove());
  }

  // ── SOL OVERVIEW ───────────────────────────────────────────
  if (type === 'sol') {
    heading.textContent = 'SECTOR OVERVIEW';
    const resRows = Object.entries(state.resources).map(([k,v]) => {
      const def   = RESOURCE_DEFS[k];
      const empty = v === 0;
      return `<tr style="${empty?'opacity:0.35;':''}">
        <td style="padding:5px 8px;display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${def.color};flex-shrink:0;"></span>
          <span style="color:#8ab;font-size:13px;">${def.label}</span>
        </td>
        <td style="padding:5px 8px;text-align:right;font-size:13px;font-weight:bold;color:${empty?'#4a6a8a':'#ffe066'};">${fmt(v)}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `
      <div style="margin-bottom:14px;padding:10px 12px;background:rgba(10,20,50,0.5);border:1px solid #1a3a6e;border-radius:5px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ KEPLER-7 SECTOR — SOL ${state.sol}</div>
        <div style="font-size:14px;color:#5a8aaa;line-height:1.25;margin-bottom:8px;">Deep in the outer rim, where stellar winds thin and ancient ore drifts unclaimed — your operation pushes further each cycle.</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:13px;color:#4af;letter-spacing:1px;">1 SOL = 6 EARTH MINUTES</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:rgba(80,10,10,0.35);border:1px solid #802030;border-radius:5px;padding:10px 12px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#f88;margin-bottom:4px;">⚑ PIRATE STATUS</div>
          <div style="font-size:15px;font-weight:bold;color:#f88;">Unknown</div>
        </div>
        <div style="background:rgba(80,50,0,0.35);border:1px solid #805020;border-radius:5px;padding:10px 12px;">
          <div style="font-family:'Orbitron',sans-serif;font-size:9px;letter-spacing:2px;color:#fa8;margin-bottom:4px;">⬡ THREAT LEVEL</div>
          <div style="font-size:15px;font-weight:bold;color:#fa8;">Moderate</div>
        </div>
      </div>
      <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:6px;">◈ RESOURCE STOCKPILE</div>
      <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
        ${resRows}
      </table>`;
  }

  // ── RESEARCH ───────────────────────────────────────────────
  else if (type === 'research') {
    const rpCap = 2 + (state.base.level - 1);
    const formatResearchDesc = (desc) => desc.replace(/(\d[\d,]*(?:\.\d+)?(?:\s*HP|%)?)/g, '<span style="color:#ffe066;">$1</span>');
    heading.textContent = 'RESEARCH';
    let treeHtml = '';
    for (const tier of RESEARCH_TREE) {
      const tierLocked = tier.minBaseLevel && state.base.level < tier.minBaseLevel;
      treeHtml += `<div style="margin-bottom:12px;">
        <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:${tierLocked?'#3a5a7a':'#4af'};margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #1a3a6e;">
          ${tier.label}${tierLocked?' <span style="color:#f88;font-size:11px;">— Requires Base Upgrade</span>':''}
        </div>`;
      for (const u of tier.unlocks) {
        const isUnlocked = state.researchUnlocks[u.id];
        const canAfford  = state.rp >= u.cost;
        const tierReqMet = !tier.minBaseLevel || state.base.level >= tier.minBaseLevel;
        const count = u.id === 'hp_boost' ? state.hpBoostCount : (isUnlocked ? 1 : 0);
        const capReached = u.id === 'hp_boost' && count >= 10;
        const purchasable = tierReqMet && canAfford && (!isUnlocked || u.repeatable) && !capReached;
        treeHtml += `<div style="background:rgba(10,20,50,0.5);border:1px solid ${isUnlocked?'#2a5090':'#1a2a4a'};border-radius:5px;padding:10px;margin-bottom:6px;${tierLocked?'opacity:0.4;':''}">
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:5px;">
            <span style="font-size:18px;flex-shrink:0;">${u.icon}</span>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="font-family:'Orbitron',sans-serif;font-size:16px;color:${isUnlocked?'#ffe066':'#cde'};letter-spacing:1px;">${u.name}</div>
                ${u.repeatable && count > 0 ? `<span style="font-size:10px;color:#ffe066;background:rgba(60,45,0,0.4);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${count}</span>` : ''}
                ${isUnlocked && !u.repeatable ? `<span style="font-size:10px;color:#4d8;background:rgba(20,60,30,0.4);border:1px solid #2a6040;border-radius:3px;padding:1px 5px;">✓ UNLOCKED</span>` : ''}
              </div>
              <div style="font-size:14px;color:#5a7a9a;margin-top:2px;line-height:1.25;">${formatResearchDesc(u.desc)}</div>
            </div>
            ${(!isUnlocked || u.repeatable) && tierReqMet ? `
            <div style="min-width:132px;background:linear-gradient(180deg, rgba(10,40,70,0.92) 0%, rgba(8,28,52,0.92) 100%);border:1px solid #4aa8ff;border-radius:6px;padding:8px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;box-shadow:0 0 14px rgba(80,170,255,0.2), inset 0 0 12px rgba(70,170,255,0.12);">
              <div style="font-size:15px;font-family:'Orbitron',sans-serif;font-weight:700;color:${capReached?'#4d8':(canAfford?'#ffe066':'#f88')};letter-spacing:1px;">${capReached?'MAX':(u.cost + ' RP')}</div>
              <button class="btn${purchasable?' primary':''}" style="font-size:12px;padding:4px 14px;min-width:92px;" ${purchasable?'':'disabled'} onclick="purchaseResearch('${u.id}')">${capReached?'MAXED':'UNLOCK'}</button>
            </div>` : ''}
          </div>
        </div>`;
      }
      treeHtml += '</div>';
    }
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0 12px;border-bottom:1px solid #1a3a6e;margin-bottom:12px;">
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:3px;">RESEARCH POINTS</div>
          <div style="font-size:24px;color:#ffe066;font-weight:bold;">🔬 ${state.rp} <span style="font-size:14px;color:#4a6a8a;">/ ${rpCap}</span></div>
          <div style="font-size:13px;color:#6f97bc;margin-top:2px;">+1 per SOL · cap increases with base level</div>
        </div>
      </div>
      ${treeHtml}`;
  }

  // ── MARKET ─────────────────────────────────────────────────
  else if (type === 'market') {
    heading.textContent = 'TRADE';
    const hasAny = Object.values(state.resources).some(v => v > 0);
    let tradeHtml = '';
    if (state.marketBoost) {
      const bd = RESOURCE_DEFS[state.marketBoost.type];
      const boostMult = state.marketBoost.multiplier ?? 1.5;
      tradeHtml += `<div style="background:linear-gradient(180deg, rgba(10,30,70,0.9) 0%, rgba(6,16,48,0.94) 100%);border:1px solid #4aa8ff;border-radius:6px;padding:10px 12px;margin-bottom:12px;text-align:center;line-height:1.2;box-shadow:0 0 16px rgba(80,170,255,0.35), 0 0 28px rgba(60,140,255,0.18), inset 0 0 16px rgba(90,180,255,0.14);">
        <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:1.5px;color:#9be89b;margin-bottom:4px;">SOL ${state.sol} - DEMAND</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:20px;font-weight:700;color:${bd.color};text-shadow:0 0 10px ${bd.color}55;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${bd.color};display:inline-block;box-shadow:0 0 8px ${bd.color}aa;"></span>
          <span>${bd.label}<span style="display:inline-block;width:22px;"></span><span style="color:#ffe066;">${boostMult}x!</span></span>
        </div>
      </div>`;
    }
    if (!hasAny) {
      tradeHtml += `<div style="padding:14px;text-align:center;color:#3a5a7a;font-size:13px;">⏳ No resources to sell yet.</div>`;
    } else {
      tradeHtml += '<div class="sell-grid">';
      for (const [type, def] of Object.entries(RESOURCE_DEFS)) {
        const amt = state.resources[type] || 0;
        if (amt <= 0) continue;
        const sellAmt = amt < 100 ? 1 : amt < 1000 ? 10 : amt < 10000 ? 25 : 100;
        const price   = getSellPrice(type);
        const earnedSellAmt = sellAmt * price;
        const earnedAll = amt * price;
        const boosted = state.marketBoost?.type === type;
        const priceHtml = boosted
          ? `<span style="color:#ffe066;font-size:14px;flex-shrink:0">${price}¢✦</span>`
          : `<span style="color:#6fff9a;font-size:14px;flex-shrink:0">${price}¢</span>`;
        tradeHtml += `<div class="sell-row">
          <span style="width:9px;height:9px;border-radius:50%;background:${def.color};display:inline-block;flex-shrink:0"></span>
          ${priceHtml}
          <span class="res-name-s">${def.label}</span>
          <span class="res-qty">${fmt(amt)}</span>
          <button class="sell-btn-s" onmousedown="sellResource('${type}',${sellAmt});_hdrPanelOpen=null;openHdrPanel('market')">SELL ${fmt(sellAmt)} <span style="color:#ffe066">@ $${fmt(earnedSellAmt)}</span></button>
          <button class="sell-btn-s" onmousedown="sellResource('${type}',${amt});_hdrPanelOpen=null;openHdrPanel('market')">ALL <span style="color:#ffe066">@ $${fmt(earnedAll)}</span></button>
        </div>`;
      }
      tradeHtml += '</div>';
    }
    const totalResources = Object.values(state.resources).reduce((sum, n) => sum + (n || 0), 0);
    body.innerHTML = `
      <div style="padding:12px 0 14px;border-bottom:1px solid #1a3a6e;margin-bottom:12px;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px;align-items:end;">
        <div>
          <div style="font-size:30px;color:#ffe066;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">${fmt(state.coins)}¢</div>
          <div style="font-size:13px;color:#7fa4c8;margin-top:4px;letter-spacing:0.8px;">CURRENT BALANCE</div>
        </div>
        <div>
          <div style="font-size:22px;color:#cde;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">${fmt(totalResources)}</div>
          <div style="font-size:13px;color:#7fa4c8;margin-top:4px;letter-spacing:0.8px;">CURRENT RESOURCES</div>
        </div>
        <div>
          <div style="font-size:22px;color:#cde;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">0%</div>
          <div style="font-size:13px;color:#7fa4c8;margin-top:4px;letter-spacing:0.8px;">TAX RATE</div>
        </div>
      </div>
      <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ SELL RESOURCES</div>
      ${tradeHtml}`;
  }

  // ── FLEET MANIFEST ─────────────────────────────────────────
  else if (type === 'fleet') {
    const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 5;
    heading.textContent = 'FLEET MANIFEST';
    const typeCounts = getFleetTypeCounts();
    const compositionHtml = buildFleetCompositionHtml(typeCounts);
    _fleetCompSig = JSON.stringify(typeCounts);
    const rows = getSortedFleetShips().map(s => {
      const typeName = getShipTypeName(s);
      const status = getShipStatusLabel(s);
      return `<tr data-ship-id="${s.id}">
        <td>${s.name}</td>
        <td>${typeName}</td>
        <td data-cell="tier">T${getShipTierValue(s)}</td>
        <td data-cell="node">${getShipNodeLabel(s)}</td>
        <td data-cell="status">${status}</td>
        <td data-cell="cargo" style="color:#ffe066;">${s.cargo}/${s.capacity}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `
      <div id="fleet-count" style="margin-bottom:8px;font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:1px;color:#4af;">Fleet ${state.ships.length}/${maxShips}</div>
      <div id="fleet-composition-wrap">${compositionHtml}</div>
      <table class="fleet-table" style="table-layout:fixed;width:100%;">
        <colgroup>
          <col style="width:22%;">
          <col style="width:18%;">
          <col style="width:10%;">
          <col style="width:16%;">
          <col style="width:18%;">
          <col style="width:16%;">
        </colgroup>
        <thead><tr>${fleetHeaderCell('NAME', 'name')}${fleetHeaderCell('TYPE', 'type')}${fleetHeaderCell('TIER', 'tier')}${fleetHeaderCell('NODE', 'node')}${fleetHeaderCell('STATUS', 'status')}${fleetHeaderCell('CARGO', 'cargo')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── OPERATIONS STATS ───────────────────────────────────────
  else if (type === 'stats') {
    heading.textContent = 'OPERATIONS STATS';

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

    const assignHtml = Object.entries(nodeAssign)
      .map(([t, n]) => `<tr><td style="padding:6px 8px;color:#8ab;font-size:15px;">${t} Node</td><td style="padding:6px 8px;text-align:right;color:#4d8;font-weight:bold;font-size:15px;">${n} ship${n > 1 ? 's' : ''}</td></tr>`)
      .join('') || '<tr><td style="padding:8px 8px;color:#3a5a7a;font-size:15px;" colspan="2">None assigned</td></tr>';

    const mpmHtml = Object.entries(mpm)
      .map(([t, n]) => `<tr><td style="padding:6px 8px;color:#8ab;font-size:15px;">${t}</td><td style="padding:6px 8px;text-align:right;color:#ffe066;font-weight:bold;font-size:15px;">${Math.round(n)}/m</td></tr>`)
      .join('') || '<tr><td style="padding:8px 8px;color:#3a5a7a;font-size:15px;" colspan="2">Not mining</td></tr>';

    body.innerHTML = `
      <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ NODE ASSIGNMENTS</div>
      <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;margin-bottom:14px;">
        ${assignHtml}
      </table>
      <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ YIELD RATE</div>
      <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
        ${mpmHtml}
      </table>`;
  }

  // ── CODEX ──────────────────────────────────────────────────
  else if (type === 'codex') {
    heading.textContent = 'CODEX';
    const tabBar = `<div style="display:flex;border-bottom:1px solid #1a3a6e;margin-bottom:12px;">
      <button onclick="event.stopPropagation();switchCodexTab('crew')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='crew'?'#4af':'transparent'};background:none;color:${_codexTab==='crew'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Crew &amp; Contacts</button>
      <button onclick="event.stopPropagation();switchCodexTab('events')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='events'?'#4af':'transparent'};background:none;color:${_codexTab==='events'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Events</button>
      <button onclick="event.stopPropagation();switchCodexTab('resources')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='resources'?'#4af':'transparent'};background:none;color:${_codexTab==='resources'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Resources</button>
      <button onclick="event.stopPropagation();switchCodexTab('upgrades')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='upgrades'?'#4af':'transparent'};background:none;color:${_codexTab==='upgrades'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Upgrades</button>
    </div>`;

    let tabContent = '';

    if (_codexTab === 'crew') {
      const groups = [
        { label: '◈ Star Command · ISV Hyperion', ids: ['juno','sera'] },
        { label: '◈ The Marauder · Pirate Crew',  ids: ['vex','scarlett'] },
        { label: '◈ Sector Specialists',           ids: ['rigs','vane','zoe','doran','kade','dax','kai'] },
        { label: '◈ Unknown',                      ids: ['architect','android'] },
      ];
      for (const group of groups) {
        const members = group.ids.map(id => NPCS[id]).filter(Boolean);
        if (!members.length) continue;
        tabContent += `<div class="codex-group-label">${group.label}</div>`;
        tabContent += members.map(npc => {
          return `<div class="codex-card">
            <img class="codex-avatar large" src="${npc.portrait}" alt="${npc.name}">
            <div class="codex-info">
              <div class="codex-name">${npc.name}</div>
              <div class="codex-title">${npc.ship}</div>
              <div class="codex-bio">${npc.bio}</div>
            </div>
          </div>`;
        }).join('');
      }

    } else if (_codexTab === 'resources') {
      const resourceBlurbs = {
        iron:     'The backbone of early fleet operations. Abundant in the inner belt and essential for ship construction and base repairs. Every commander starts here.',
        copper:   'A conductive ore woven into ship wiring and onboard electronics. Demand never drops — every new hull needs copper in its bones.',
        oxygen:   'Pressurised gas siphoned from asteroid ice pockets. Uniquely stable — electromagnetic surges cannot touch it. A lifeline resource.',
        silicon:  'Crystalline compound mined from glassy asteroid formations. Powers advanced ship systems and is a key ingredient in research components.',
        titanium: 'Dense, alloy-grade ore forged under extreme pressure. Required for mid-tier ship construction and base armour plating. Not found close to home.',
        gold:     'Rare heavy metal concentrated in deep-belt asteroid cores. Commands the highest market price in the sector and gates the most advanced fleet construction.',
      };
      const resourceTier = {};
      for (const [tier, def] of Object.entries(MINE_TIERS)) {
        for (const r of def.resources) {
          if (!resourceTier[r]) resourceTier[r] = { tier: Number(tier), label: def.label, color: def.color };
        }
      }
      tabContent = Object.entries(RESOURCE_DEFS).map(([key, def]) => {
        const tierInfo = resourceTier[key];
        const boost = state.marketBoost && state.marketBoost.type === key;
        const mult = state.marketBoost?.multiplier ?? 1.5;
        const sellDisplay = boost ? `<span style="color:#ffe066;">${Math.round(def.sellPrice * mult)}¢ ★ BOOSTED</span>` : `${def.sellPrice}¢`;
        return `<div style="background:rgba(10,20,50,0.5);border:1px solid #1e3a6e;border-left:3px solid ${def.color};border-radius:5px;padding:12px 14px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:14px;height:14px;border-radius:50%;background:${def.color};flex-shrink:0;box-shadow:0 0 8px ${def.color}88;"></div>
            <div style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;color:#e8eef8;letter-spacing:1px;flex:1;">${def.label}</div>
            <span style="font-size:10px;padding:2px 8px;border-radius:3px;border:1px solid ${tierInfo.color}44;background:${tierInfo.color}18;color:${tierInfo.color};font-family:'Orbitron',sans-serif;letter-spacing:1px;">${tierInfo.label}</span>
          </div>
          <div style="font-size:14px;color:#6a8aaa;line-height:1.25;margin-bottom:10px;">${resourceBlurbs[key]}</div>
          <div style="display:flex;gap:16px;font-size:11px;border-top:1px solid #1a3a5a;padding-top:8px;">
            <div><span style="color:#3a6a9a;font-size:12px;letter-spacing:0.5px;">SELL PRICE</span><br><span style="color:#4d8;font-family:'Share Tech Mono',monospace;font-size:16px;">${sellDisplay}</span></div>
            <div><span style="color:#3a6a9a;font-size:12px;letter-spacing:0.5px;">MINE TIER</span><br><span style="color:#cde;font-family:'Share Tech Mono',monospace;font-size:16px;">${tierInfo.label}</span></div>
            <div><span style="color:#3a6a9a;font-size:12px;letter-spacing:0.5px;">IMMUNE TO FLARE</span><br><span style="color:${key==='oxygen'?'#4af':'#f66'};font-family:'Share Tech Mono',monospace;font-size:16px;">${key === 'oxygen' ? 'YES' : 'NO'}</span></div>
          </div>
        </div>`;
      }).join('');

    } else if (_codexTab === 'upgrades') {
      const shipStatsHtml = CRAFT_RECIPES.map((recipe) => {
        const stats = SHIP_DEFS[recipe.id] || SHIP_DEFS.scout;
        const tierColor = MINE_TIERS[stats.mineTier]?.color || '#8ab';
        return `<div style="background:rgba(10,20,50,0.5);border:1px solid #1e3a6e;border-radius:5px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="color:${tierColor};font-size:14px;">▲</span>
            <div style="font-family:'Orbitron',sans-serif;font-size:14px;color:#e8eef8;letter-spacing:1px;flex:1;">${recipe.name.toUpperCase()}</div>
            <span style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};font-family:'Orbitron',sans-serif;letter-spacing:1px;">${MINE_TIERS[stats.mineTier]?.label || 'Tier ' + stats.mineTier}</span>
          </div>
          <div style="font-size:13px;color:#5f84ad;margin-bottom:8px;">${recipe.desc}</div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="color:#4a7aaa;padding:2px 0;width:50%;">▲ Cargo Cap</td><td style="color:#cde;font-weight:bold;">${stats.capacity} units</td></tr>
            <tr><td style="color:#4a7aaa;padding:2px 0;">✈ Fly Speed</td><td style="color:#cde;font-weight:bold;">${stats.flySpeed}x</td></tr>
            <tr><td style="color:#4a7aaa;padding:2px 0;">⛏ Mine Speed</td><td style="color:#cde;font-weight:bold;">${stats.mineSpeed}x</td></tr>
          </table>
        </div>`;
      }).join('');

      tabContent = `<div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ SHIP BASE STATS</div>
        ${shipStatsHtml}
        <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin:12px 0 8px;">◈ BASE UPGRADE COSTS</div>
        <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">LEVEL</th>
              <th style="text-align:right;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">COST</th>
            </tr>
          </thead>
          <tbody>
            ${BASE_UPGRADE_COSTS.map((cost, idx) => idx === 0 ? '' : `<tr>
              <td style="padding:6px 8px;color:#8ab;border-bottom:1px solid rgba(26,58,110,0.4);">Lv ${idx} -> Lv ${idx + 1}</td>
              <td style="padding:6px 8px;text-align:right;color:#ffe066;font-weight:bold;border-bottom:1px solid rgba(26,58,110,0.4);">${fmt(cost)}¢</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    } else {
      // Events tab
      const eventDefs = [
        { id: 'solar_flare', icon: '☀', label: 'Solar Flare',  desc: 'An electromagnetic surge that destroys a percentage of exposed resource stockpiles. Oxygen is shielded.' },
        { id: 'comet',       icon: '☄', label: 'Comet Impact', desc: 'A comet strikes the base station, dealing structural damage that scales with SOL number. Repair via the Base Station.' },
      ];
      tabContent = eventDefs.map(ev => {
        const count = state.eventCounts[ev.id] || 0;
        const encountered = count > 0;
        return `<div style="background:rgba(10,20,50,0.5);border:1px solid ${encountered?'#2a4a7a':'#1a2a4a'};border-radius:5px;padding:12px;margin-bottom:8px;${encountered?'':'opacity:0.5;'}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              <span style="font-size:40px;line-height:1;padding-top:2px;">${ev.icon}</span>
              <div>
                <div style="font-family:'Orbitron',sans-serif;font-size:14px;color:${encountered?'#cde':'#4a6a8a'};letter-spacing:1px;">${ev.label}</div>
                <div style="font-size:10px;color:#3a5a7a;margin-top:1px;">${encountered?'ENCOUNTERED':'UNDISCOVERED'}</div>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:'Orbitron',monospace;font-size:18px;color:${encountered?'#ffe066':'#3a5a7a'};font-weight:bold;">${count}</div>
              <div style="font-size:10px;color:#3a5a7a;">TIMES</div>
            </div>
          </div>
          <div style="font-size:14px;color:${encountered?'#7a9ab8':'#3a5a7a'};line-height:1.25;">${encountered ? ev.desc : '???'}</div>
        </div>`;
      }).join('');
    }

    body.innerHTML = tabBar + tabContent;
  }
}

// Global onclick bindings used by HTML
window.closeHdrPanel  = closeHdrPanel;
window.dismissHdrModal = dismissHdrModal;
window.handleBasePanelOverlayClick = handleBasePanelOverlayClick;
