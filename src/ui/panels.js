// ============================================================
// HEADER PANELS — SOL overview, research, market, fleet, codex
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { CRAFT_RECIPES } from '../data/ships.js';
import { BASE_MAX_SHIPS } from '../data/nodes.js';
import { NPCS } from '../data/npcs.js';
import { RESEARCH_TREE } from '../data/research.js';
import { fmt } from '../helpers.js';
import { getSellPrice } from '../systems/market.js';
import { cancelTurretPlacement } from './turretUI.js';
import { renderBasePanel } from './basePanel.js';

let _hdrPanelOpen = null;
let _codexTab = 'crew';

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
  cancelTurretPlacement();
  if (type === 'market' && state.tutStep === 10) {
    state.tutStep = 11;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }
  _hdrPanelOpen = type;
  overlay.classList.add('open');

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
        const purchasable = tierReqMet && canAfford && (!isUnlocked || u.repeatable);
        const count = u.id === 'hp_boost' ? state.hpBoostCount : (isUnlocked ? 1 : 0);
        treeHtml += `<div style="background:rgba(10,20,50,0.5);border:1px solid ${isUnlocked?'#2a5090':'#1a2a4a'};border-radius:5px;padding:10px;margin-bottom:6px;${tierLocked?'opacity:0.4;':''}">
          <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:5px;">
            <span style="font-size:18px;flex-shrink:0;">${u.icon}</span>
            <div style="flex:1;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="font-family:'Orbitron',sans-serif;font-size:14px;color:${isUnlocked?'#ffe066':'#cde'};letter-spacing:1px;">${u.name}</div>
                ${u.repeatable && count > 0 ? `<span style="font-size:10px;color:#ffe066;background:rgba(60,45,0,0.4);border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${count}</span>` : ''}
                ${isUnlocked && !u.repeatable ? `<span style="font-size:10px;color:#4d8;background:rgba(20,60,30,0.4);border:1px solid #2a6040;border-radius:3px;padding:1px 5px;">✓ UNLOCKED</span>` : ''}
              </div>
              <div style="font-size:14px;color:#5a7a9a;margin-top:2px;line-height:1.25;">${u.desc}</div>
            </div>
          </div>
          ${(!isUnlocked || u.repeatable) && tierReqMet ? `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
            <span style="font-size:14px;font-family:'Orbitron',sans-serif;font-weight:700;color:${canAfford?'#ffe066':'#f88'};background:${canAfford?'rgba(60,45,0,0.5)':'rgba(60,10,10,0.5)'};border:1px solid ${canAfford?'#7a6010':'#802020'};border-radius:20px;padding:3px 12px;letter-spacing:1px;">${u.cost} RP</span>
            <button class="btn${purchasable?' primary':''}" style="font-size:11px;padding:4px 12px;" ${purchasable?'':'disabled'} onclick="purchaseResearch('${u.id}')">UNLOCK</button>
          </div>` : ''}
        </div>`;
      }
      treeHtml += '</div>';
    }
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0 12px;border-bottom:1px solid #1a3a6e;margin-bottom:12px;">
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:3px;">RESEARCH POINTS</div>
          <div style="font-size:24px;color:#ffe066;font-weight:bold;">🔬 ${state.rp} <span style="font-size:14px;color:#4a6a8a;">/ ${rpCap}</span></div>
          <div style="font-size:11px;color:#4a6a8a;margin-top:2px;">+1 per SOL · cap increases with base level</div>
        </div>
      </div>
      ${treeHtml}`;
  }

  // ── MARKET ─────────────────────────────────────────────────
  else if (type === 'market') {
    heading.textContent = 'MARKET';
    const hasAny = Object.values(state.resources).some(v => v > 0);
    let tradeHtml = '';
    if (state.marketBoost) {
      const bd = RESOURCE_DEFS[state.marketBoost.type];
      tradeHtml += `<div style="font-size:14px;background:rgba(20,60,10,0.6);border:1px solid #4a8020;border-radius:4px;padding:8px 10px;margin-bottom:10px;text-align:center;line-height:1.25">
        <span style="font-weight:bold;color:${bd.color}">${bd.label}</span> <span style="color:#cde">in demand!</span>
        <span style="color:#ffe066;font-weight:bold"> · 1.5× this SOL</span></div>`;
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
        const boosted = state.marketBoost?.type === type;
        const priceHtml = boosted
          ? `<span style="color:#ffe066;font-size:12px;flex-shrink:0">${price}¢✦</span>`
          : `<span style="color:#5a8;font-size:12px;flex-shrink:0">${price}¢</span>`;
        tradeHtml += `<div class="sell-row">
          <span style="width:9px;height:9px;border-radius:50%;background:${def.color};display:inline-block;flex-shrink:0"></span>
          ${priceHtml}
          <span class="res-name-s">${def.label}</span>
          <span class="res-qty">${fmt(amt)}</span>
          <button class="sell-btn-s" onclick="sellResource('${type}',${sellAmt});_hdrPanelOpen=null;openHdrPanel('market')">SELL ${fmt(sellAmt)}</button>
          <button class="sell-btn-s" onclick="sellResource('${type}',${amt});_hdrPanelOpen=null;openHdrPanel('market')">ALL</button>
        </div>`;
      }
      tradeHtml += '</div>';
    }
    body.innerHTML = `
      <div style="padding:12px 0 14px;border-bottom:1px solid #1a3a6e;margin-bottom:12px;">
        <div style="font-size:24px;color:#ffe066;font-family:'Orbitron',sans-serif;font-weight:bold;line-height:1;">${fmt(state.coins)}¢</div>
        <div style="font-size:11px;color:#4a6a8a;margin-top:2px;">CURRENT BALANCE</div>
      </div>
      <div style="font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:2px;color:#4af;margin-bottom:8px;">◈ SELL RESOURCES</div>
      ${tradeHtml}`;
  }

  // ── FLEET MANIFEST ─────────────────────────────────────────
  else if (type === 'fleet') {
    const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 5;
    heading.textContent = 'FLEET MANIFEST';
    const rows = state.ships.map(s => {
      const recipe   = CRAFT_RECIPES.find(r => r.id === s.type);
      const typeName = recipe ? recipe.name : 'Starter';
      const node   = state.nodes.find(n => n.id === s.targetNode);
      const status = s.status === 'flying'    ? '▶ Flying'
                   : s.status === 'mining'    ? '⛏ Mining'
                   : s.status === 'returning' ? '◀ Returning'
                   : '— Idle';
      return `<tr>
        <td>${s.name}</td>
        <td>${typeName}</td>
        <td>T${s.tier||1}</td>
        <td>${node ? RESOURCE_DEFS[node.type].label : '—'}</td>
        <td>${status}</td>
        <td style="color:#ffe066;">${s.cargo}/${s.capacity}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `
      <div style="margin-bottom:8px;font-family:'Orbitron',sans-serif;font-size:15px;letter-spacing:1px;color:#4af;">Fleet ${state.ships.length}/${maxShips}</div>
      <table class="fleet-table">
        <thead><tr><th>NAME</th><th>TYPE</th><th>TIER</th><th>NODE</th><th>STATUS</th><th>CARGO</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── CODEX ──────────────────────────────────────────────────
  else if (type === 'codex') {
    heading.textContent = 'CODEX';
    const tabBar = `<div style="display:flex;border-bottom:1px solid #1a3a6e;margin-bottom:12px;">
      <button onclick="event.stopPropagation();switchCodexTab('crew')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='crew'?'#4af':'transparent'};background:none;color:${_codexTab==='crew'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Crew &amp; Contacts</button>
      <button onclick="event.stopPropagation();switchCodexTab('events')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='events'?'#4af':'transparent'};background:none;color:${_codexTab==='events'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Events</button>
      <button onclick="event.stopPropagation();switchCodexTab('resources')" style="flex:1;padding:7px 4px;font-family:'Orbitron',monospace;font-size:10px;letter-spacing:1.5px;border:none;border-bottom:2px solid ${_codexTab==='resources'?'#4af':'transparent'};background:none;color:${_codexTab==='resources'?'#4af':'#456'};cursor:pointer;transition:all 0.15s;text-transform:uppercase;">Resources</button>
    </div>`;

    let tabContent = '';

    if (_codexTab === 'crew') {
      const groups = [
        { label: '◈ Star Command · ISV Hyperion', ids: ['juno','sera'] },
        { label: '◈ The Marauder · Pirate Crew',  ids: ['vex','scarlett'] },
        { label: '◈ Sector Specialists',           ids: ['rigs','vane','doran','kade','dax','kai'] },
        { label: '◈ Unknown',                      ids: ['architect','android'] },
      ];
      for (const group of groups) {
        const members = group.ids.map(id => NPCS[id]).filter(Boolean);
        if (!members.length) continue;
        tabContent += `<div class="codex-group-label">${group.label}</div>`;
        tabContent += members.map(npc => {
          const isPirate = group.ids.includes('vex') || group.ids.includes('scarlett');
          return `<div class="codex-card">
            <img class="codex-avatar${isPirate?' large':''}" src="${npc.portrait}" alt="${npc.name}">
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
        const sellDisplay = boost ? `<span style="color:#ffe066;">${def.sellPrice * 1.5}¢ ★ BOOSTED</span>` : `${def.sellPrice}¢`;
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
