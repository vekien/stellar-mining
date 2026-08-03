// ============================================================
// HEADER PANELS — SOL overview, research, market, fleet, codex
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS, getResourceTier, isStorableResource } from '../data/resources.js';
import { CRAFTS, CRAFT_SHIPS as CRAFT_RECIPES, getCraft } from '../data/crafts.js';
import {
  SHIP_DEFS, SHIP_TIER_COSTS, toRoman,
  formatFlySpeed, formatMineSpeedPercent, formatMineBonusPercent, formatLoadSpeed, formatAtkRatePercent,
  profileMax, mineBonusFromLevel,
  CARGO_PROFILE, FLY_SPEED_PROFILE, MINE_SPEED_PROFILE, LOAD_SPEED_PROFILE,
  HP_PROFILE, ATTACK_PROFILE, ATK_RATE_PROFILE, RANGE_PROFILE,
  formatWeaponRangeTiles,
} from '../data/ships.js';
import { NODE_BANDS, CRASHED_SHIP_NODE_TYPE } from '../data/nodes.js';
import { BASE_MAX_SHIPS, BASE_UPGRADE_COSTS } from '../data/base.js';
import { eventIconHtml } from '../data/events.js';
import { NPCS } from '../data/npcs.js';
import { RESEARCH_TREE, getRepeatableCount, getRepeatableMax, getResearchPointCap } from '../data/research.js';
import { TURRET_BASE_STATS } from '../data/turrets.js';
import { MODULE_DEFS, getModuleDef, getModuleStats, getPowerFuelOutput, POWER_DISABLED_RESOURCES, POWER_RESOURCE_CONSUMPTION, STORAGE_FACILITY_ID, DRONE_LAB_ID, isDroneLabModule } from '../data/modules.js';
import { SYNTHESIS_RECIPES, SYNTHESIS_CRAFT_TIMES, getSynthesisCraftTime } from '../data/synthesis.js';
import { fmt, fmtCompact, resourceIconHtml } from '../helpers.js';
import {
  getThreatBreakdown,
  getPirateStatusLabel,
  PIRATE_STATUS_RAID_AT,
} from '../data/combat.js';
import { ensureSolHistorySeed, getSolHistory, SOL_HISTORY_MAX } from '../systems/statsHistory.js';
import {
  getActiveCraftJobs,
  getCraftQueueSlotsLabel,
  getFirstJobForRecipe,
  canEnqueueCraft,
  countCraftJobs,
} from '../systems/craftQueue.js';
import { isTracked, refreshTrackButtons } from './craftTracker.js';
import { getSellPrice, getMarketVariancePct, getDemandBonusPct, isDemandedType } from '../systems/market.js';
import { cancelTurretPlacement } from './turretUI.js';
import { cancelStoragePlacement } from './storageUI.js';
import { renderBasePanel } from './basePanel.js';
import { removeReassignTooltip, renderTutPointers } from './tutorial.js';
import { bindTippyIn } from './tippy.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
  placeFloatingWindow,
} from './floatingWindow.js';

const HDR_PANEL_TITLES = {
  sol: 'SECTOR OVERVIEW',
  command: 'COMMAND',
  transmissions: 'TRANSMISSIONS',
  resources: 'RESOURCES',
  craft: 'CRAFT',
  market: 'TRADE',
  fleet: 'SHIPS',
  research: 'RESEARCH',
  codex: 'CODEX',
  stats: 'STATS',
};

// Keep craft timer progress bars live while the CRAFT panel is open
setInterval(() => {
  if (!isHdrPanelOpen('craft')) return;
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!overlay?.classList.contains('open')) return;
  const now = Date.now();
  for (const job of (state.craftQueue || [])) {
    if (!job || now >= job.endsAt) continue;
    const remainMs = Math.max(0, job.endsAt - now);
    const pct = Math.max(0, Math.min(100, ((job.durationMs - remainMs) / job.durationMs) * 100));
    const fillEl = document.getElementById(`cq-fill-${job.jobId}`);
    const labelEl = document.getElementById(`cq-label-${job.jobId}`);
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (labelEl) labelEl.textContent = `${Math.ceil(remainMs / 1000)}s`;
    // Detail pane button (first matching recipe)
    const detFill = document.getElementById(`craft-job-fill-${job.kind}-${job.recipeId}`);
    const detLab = document.getElementById(`craft-job-label-${job.kind}-${job.recipeId}`);
    if (detFill) detFill.style.width = `${pct}%`;
    if (detLab) detLab.textContent = `CRAFTING ${Math.ceil(remainMs / 1000)}s`;
  }
  const slotEl = document.getElementById('cf-queue-slots');
  if (slotEl) slotEl.textContent = getCraftQueueSlotsLabel();
}, 100);

let _focusedHdrPanel = null;
let _codexTab = 'crew';
let _craftTab = 'ships';
let _craftShipRoleTab = 'mining';
/** @type {{ kind: string, id: string } | null} */
let _craftSelected = null;
let _fleetCompSig = '';
let _fleetSortKey = 'name';
let _fleetSortDir = 1;
let _fleetRoleTab = 'all';
let _stockpileMineableKeys = null;
let _selectedTransmissionIndex = 0;

function getHdrModalHost() {
  return document.getElementById('hdr-modal-host');
}

function getHdrModalWindow(type) {
  const host = getHdrModalHost();
  return host ? host.querySelector(`.hdr-modal-window[data-panel-type="${type}"]`) : null;
}

function getOpenHdrModalWindows() {
  const host = getHdrModalHost();
  return host ? [...host.querySelectorAll('.hdr-modal-window')] : [];
}

export function isHdrPanelOpen(type) {
  return !!getHdrModalWindow(type);
}

function getFocusedHdrPanel() {
  if (_focusedHdrPanel && isHdrPanelOpen(_focusedHdrPanel)) return _focusedHdrPanel;
  const open = getOpenHdrModalWindows();
  if (!open.length) return null;
  open.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
  _focusedHdrPanel = open[0].dataset.panelType || null;
  return _focusedHdrPanel;
}

// Back-compat: many call sites still read/write window._hdrPanelOpen
let _hdrPanelOpen = null;
function syncHdrNavActive() {
  const focused = getFocusedHdrPanel();
  document.querySelectorAll('.hdr-btn[data-panel]').forEach((btn) => {
    btn.classList.toggle('on', !!focused && btn.dataset.panel === focused);
  });
}

function syncHdrPanelOpenCompat() {
  _hdrPanelOpen = getFocusedHdrPanel();
  syncHdrNavActive();
}

function ensureHdrModalWindow(type) {
  let modal = getHdrModalWindow(type);
  if (modal) return modal;
  const host = getHdrModalHost();
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!host || !overlay) return null;

  modal = document.createElement('div');
  modal.className = 'hdr-modal-window';
  modal.dataset.panelType = type;
  if (type === 'fleet') modal.classList.add('hdr-modal-fleet');
  if (type === 'codex') modal.classList.add('hdr-modal-codex');
  if (type === 'research') modal.classList.add('hdr-modal-research');
  if (type === 'craft') modal.classList.add('hdr-modal-craft');
  // Compact default open height for tall catalog panels (user can still resize)
  if ((type === 'codex' || type === 'research') && !modal.dataset.height) {
    modal.style.height = '500px';
    modal.dataset.height = '500';
  }
  if (type === 'craft' && !modal.dataset.height) {
    modal.style.height = '620px';
    modal.dataset.height = '620';
  }
  modal.innerHTML = `
    <div class="panel-shell-head hdr-modal-drag-handle">
      <div class="panel-shell-title hdr-modal-heading">${HDR_PANEL_TITLES[type] || type.toUpperCase()}</div>
      <button class="panel-shell-close" onclick="closeHdrPanelType('${type}')" title="Close">✕</button>
    </div>
    <div class="hdr-modal-body"></div>`;
  host.appendChild(modal);

  const layoutKey = `hdr:${type}`;
  // Position is applied after overlay is shown + content filled (see openHdrPanel)
  initFloatingDrag(modal, overlay, {
    handleSelector: '.hdr-modal-drag-handle',
    layoutKey,
    onFocus: () => { _focusedHdrPanel = type; syncHdrPanelOpenCompat(); },
    isActive: () => overlay.classList.contains('open') && !!getHdrModalWindow(type),
  });
  initFloatingResize(modal, overlay, {
    minW: type === 'codex' ? 720 : 480,
    minH: 280,
    layoutKey,
    isActive: () => overlay.classList.contains('open') && !!getHdrModalWindow(type),
  });
  return modal;
}

function getHdrPanelEls(type) {
  const modal = getHdrModalWindow(type) || ensureHdrModalWindow(type);
  if (!modal) return { modal: null, heading: null, body: null };
  return {
    modal,
    heading: modal.querySelector('.hdr-modal-heading'),
    body: modal.querySelector('.hdr-modal-body'),
  };
}

function closeHdrPanelType(type) {
  const modal = getHdrModalWindow(type);
  if (modal) modal.remove();
  if (_focusedHdrPanel === type) _focusedHdrPanel = null;
  const remaining = getOpenHdrModalWindows();
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!remaining.length) {
    overlay?.classList.remove('open');
  } else {
    remaining.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0));
    _focusedHdrPanel = remaining[0].dataset.panelType || null;
  }
  syncHdrPanelOpenCompat();
}
window.closeHdrPanelType = closeHdrPanelType;

function renderTransmissionsPanel(body) {
  // body may be the command tab body container or a full panel body
  const host = body || getHdrModalWindow('command')?.querySelector('.hdr-modal-body');
  if (!host) return;
  host.innerHTML = `
    <div class="tx-layout">
      <div class="tx-list-card">
        <div class="tx-list-title">RECENT SIGNALS</div>
        <div id="tx-list" class="tx-list"></div>
      </div>
      <div id="tx-detail" class="tx-detail-card"></div>
    </div>`;
  patchTransmissionsPanel();
}

export function patchTransmissionsPanel() {
  // Live in Command → Transmissions tab (or legacy standalone panel)
  if (!isHdrPanelOpen('command') && !isHdrPanelOpen('transmissions')) return;
  const win = getHdrModalWindow('command') || getHdrModalWindow('transmissions');
  const history = Array.isArray(state.transmissionHistory) ? state.transmissionHistory.slice(0, 20) : [];
  const listEl = win?.querySelector('#tx-list') || document.getElementById('tx-list');
  const detailEl = win?.querySelector('#tx-detail') || document.getElementById('tx-detail');
  if (!listEl || !detailEl) return;
  if (!history.length) {
    listEl.innerHTML = '<div class="tx-empty">No transmissions recorded yet.</div>';
    detailEl.innerHTML = '<div class="tx-empty">No transmission selected.</div>';
    return;
  }
  _selectedTransmissionIndex = Math.max(0, Math.min(_selectedTransmissionIndex, history.length - 1));
  const selected = history[_selectedTransmissionIndex];
  listEl.innerHTML = history.map((entry, idx) => {
    const name = entry.title || entry.npcName || 'Unknown';
    const iconName = entry.eventType ? 'warning' : 'person';
    const iconClass = entry.eventType ? 'tx-list-icon tx-list-icon-event' : 'tx-list-icon tx-list-icon-person';
    const icon = `<span class="ms-icon ms-icon-sm ${iconClass}" aria-hidden="true">${iconName}</span>`;
    return `
    <button onclick="selectTransmissionHistory(${idx})" class="tx-item${idx===_selectedTransmissionIndex?' active':''}${entry.eventType ? ' tx-item-event' : ''}">
      <div class="tx-item-top">
        <span class="tx-item-name">${icon}${name}</span>
        ${entry.eventType ? '<span class="tx-item-event-tag">EVENT</span>' : ''}
      </div>
      <div class="tx-item-meta">SOL ${entry.sol} - ${entry.solTime || '--:--'} - ${entry.eventType ? (entry.npcName || 'Sector Ops') : (entry.npcRole || '')}</div>
    </button>`;
  }).join('');
  const npc = NPCS[selected.npcId];
  const portrait = npc?.portrait || '';
  const detailTitle = selected.eventType
    ? `${eventIconHtml(selected.eventType, { size: 'md', className: 'tx-event-icon' })}${selected.title || selected.npcName || 'Event'}`
    : (selected.title || selected.npcName || 'Unknown');
  detailEl.innerHTML = `
    <div class="tx-detail-head">
      <div class="tx-detail-identity">
        ${portrait ? `<img class="tx-detail-avatar" src="${portrait}" alt="${selected.npcName || 'Unknown'}">` : ''}
        <div>
          <div class="tx-detail-name">${detailTitle}</div>
          <div class="tx-detail-role">${selected.eventType ? `${selected.npcName || 'Sector Ops'} · Event Report` : (selected.npcRole || '')}</div>
        </div>
      </div>
      <div class="tx-detail-time">SOL ${selected.sol} · ${selected.solTime || '--:--'}</div>
    </div>
    <div class="transmission-history-body">${selected.text || ''}</div>`;
}

window.selectTransmissionHistory = function(idx) {
  _selectedTransmissionIndex = idx;
  patchTransmissionsPanel();
};

function getResourceAbundanceHint(resourceKey) {
  const firstBand = NODE_BANDS.find((band) => band.types.includes(resourceKey));
  if (!firstBand) return 'Unknown';
  if (firstBand.minLevel <= 4) return 'Abundant';
  if (firstBand.minLevel <= 8) return 'Uncommon';
  return 'Rare';
}

// Expose for research.js (re-opens after purchase)
window.openHdrPanel  = openHdrPanel;
window.patchSolPanel = patchSolPanel;
window.patchTransmissionsPanel = patchTransmissionsPanel;
window.isHdrPanelOpen = isHdrPanelOpen;
// Sync module-level var when research.js pokes the global
Object.defineProperty(window, '_hdrPanelOpen', {
  get: () => getFocusedHdrPanel(),
  set: (v) => {
    // Legacy: null means "allow re-open without toggle-close"
    if (v === null) {
      _focusedHdrPanel = null;
      _hdrPanelOpen = null;
      return;
    }
    _focusedHdrPanel = v;
    _hdrPanelOpen = v;
  },
});

export function closeHdrPanel(e) {
  // Overlay is non-blocking; ignore overlay click. Use closeHdrPanelType / Escape.
  if (e && e.target === document.getElementById('hdr-modal-overlay')) return;
  if (typeof e === 'string') {
    closeHdrPanelType(e);
    return;
  }
  const focused = getFocusedHdrPanel();
  if (focused) closeHdrPanelType(focused);
  else dismissHdrModal();
}

export function dismissHdrModal() {
  for (const modal of getOpenHdrModalWindows()) modal.remove();
  _focusedHdrPanel = null;
  document.getElementById('hdr-modal-overlay')?.classList.remove('open');
  syncHdrPanelOpenCompat();
}

export function refreshHdrPanelIfOpen() {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!overlay?.classList.contains('open') || !getOpenHdrModalWindows().length) return;
  const focused = getFocusedHdrPanel();
  if (!focused) return;

  // Avoid re-rendering static or partially-refreshed panels on interval.
  if (focused === 'codex') return;
  if (focused === 'sol') return;
  if (focused === 'command') {
    // Keep transmission list fresh while that tab is open
    const cmdBody = getHdrModalWindow('command')?.querySelector('.hdr-modal-body');
    if (cmdBody?.dataset?.cmdTab === 'transmissions') patchTransmissionsPanel();
    return;
  }
  if (focused === 'craft') return;
  if (focused === 'research') return;
  if (focused === 'stats') return;
  if (focused === 'resources') return;
  if (focused === 'market') return;
  if (focused === 'fleet' || isHdrPanelOpen('fleet')) {
    refreshFleetPanelPartial();
    return;
  }

  openHdrPanel(focused, { refresh: true, preserveScroll: true });
}

let _solTab = 'threat';

function getThreatRankLabel(level) {
  const lv = Math.max(1, Math.floor(level || 1));
  if (lv >= 80) return 'Apocalyptic';
  if (lv >= 60) return 'Legendary';
  if (lv >= 40) return 'Formidable';
  if (lv >= 25) return 'Dangerous';
  if (lv >= 15) return 'Notable';
  if (lv >= 8) return 'Rising';
  if (lv >= 4) return 'Emerging';
  return 'Fledgling';
}

function getPirateStatusTone(pct) {
  if (pct >= 100) return 'imminent';
  if (pct >= 75) return 'critical';
  if (pct >= 50) return 'hostile';
  if (pct >= 25) return 'stirring';
  return 'quiet';
}

function formatChartValue(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (v >= 1000) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

/** Simple SVG area/line chart for SOL history series. */
function buildSolLineChart(points, {
  color = '#4af',
  fill = 'rgba(68,170,255,0.18)',
  width = 520,
  height = 140,
  yLabel = '',
  valuePrefix = '',
  valueSuffix = '',
} = {}) {
  const vals = points.map((p) => Math.max(0, Number(p.y) || 0));
  const n = vals.length;
  if (n < 1) {
    return `<div class="ov-chart-empty">No data yet — play through SOLs to build history.</div>`;
  }
  const padL = 36;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxY = Math.max(1, ...vals);
  const minY = 0;
  const span = Math.max(1e-6, maxY - minY);
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => padT + plotH - ((v - minY) / span) * plotH;
  const linePts = vals.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
  const areaPts = [
    `${xAt(0).toFixed(1)},${(padT + plotH).toFixed(1)}`,
    ...vals.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`),
    `${xAt(n - 1).toFixed(1)},${(padT + plotH).toFixed(1)}`,
  ].join(' ');
  const last = vals[n - 1];
  const firstSol = points[0]?.sol ?? 1;
  const lastSol = points[n - 1]?.sol ?? firstSol;
  const fmtTipVal = (v) => `${valuePrefix}${formatChartValue(v)}${valueSuffix}`;
  // Escape only attribute delimiters — tippy renders allowHTML content
  const attrTip = (html) => String(html).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const gridYs = [0, 0.5, 1].map((t) => {
    const v = minY + span * (1 - t);
    const y = padT + plotH * t;
    return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" class="ov-chart-grid"/>
      <text x="${padL - 4}" y="${(y + 3).toFixed(1)}" class="ov-chart-axis" text-anchor="end">${formatChartValue(v)}</text>`;
  }).join('');
  // Visible dots + larger invisible hit targets for hover tooltips
  const dots = vals.map((v, i) => {
    const sol = points[i]?.sol ?? (firstSol + i);
    const tip = attrTip(
      `<div style="font-family:Orbitron,sans-serif;font-size:10px;letter-spacing:1px;color:#8ab;margin-bottom:3px">${yLabel || 'VALUE'}</div>`
      + `<div style="font-family:'Share Tech Mono',monospace;font-size:15px;font-weight:700;color:${color}">${fmtTipVal(v)}</div>`
      + `<div style="font-size:11px;color:#6a8aaa;margin-top:2px">SOL ${sol}</div>`,
    );
    const cx = xAt(i).toFixed(1);
    const cy = yAt(v).toFixed(1);
    const isLast = i === n - 1;
    return `<g class="ov-chart-point">
      <circle class="ov-chart-hit" cx="${cx}" cy="${cy}" r="9" fill="transparent" data-tippy-content="${tip}"/>
      <circle class="ov-chart-dot${isLast ? ' last' : ''}" cx="${cx}" cy="${cy}" r="${isLast ? 3.6 : 2.8}" fill="${color}" stroke="rgba(6,12,24,0.85)" stroke-width="1" pointer-events="none"/>
    </g>`;
  }).join('');
  return `<div class="ov-chart-wrap">
    <svg class="ov-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${yLabel}">
      ${gridYs}
      <polygon points="${areaPts}" fill="${fill}" pointer-events="none"/>
      <polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>
      ${dots}
      <text x="${padL}" y="${height - 6}" class="ov-chart-axis" pointer-events="none">SOL ${firstSol}</text>
      <text x="${width - padR}" y="${height - 6}" class="ov-chart-axis" text-anchor="end" pointer-events="none">SOL ${lastSol}</text>
    </svg>
    <div class="ov-chart-foot">
      <span>Now <b style="color:${color}">${fmtTipVal(last)}</b></span>
      <span>Peak <b>${fmtTipVal(maxY)}</b></span>
      <span>${n} SOL${n === 1 ? '' : 's'}</span>
    </div>
  </div>`;
}

function buildOverviewStatsPane() {
  ensureSolHistorySeed();
  const hist = getSolHistory();
  const coinPts = hist.map((h) => ({ sol: h.sol, y: h.coins }));
  const resPts = hist.map((h) => ({ sol: h.sol, y: h.totalResources }));
  const shipPts = hist.map((h) => ({ sol: h.sol, y: h.ships }));

  // Top resources by latest stock for mini breakdown
  const latest = hist[hist.length - 1];
  const resEntries = Object.entries(latest?.resources || {})
    .map(([type, amount]) => ({ type, amount: amount || 0, def: RESOURCE_DEFS[type] }))
    .filter((e) => e.amount > 0 && e.def)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const eventDefs = [
    { id: 'solar_flare', label: 'Solar Flares', icon: 'solar_flare' },
    { id: 'comet', label: 'Comet Impacts', icon: 'comet' },
    { id: 'comet_intercepted', label: 'Comets Intercepted', icon: 'comet_intercepted' },
    { id: 'black_hole', label: 'Black Holes', icon: 'black_hole' },
    { id: 'pirate_raid', label: 'Pirate Raids', icon: 'pirate_raid' },
  ];
  const eventRows = eventDefs.map((ev) => {
    const count = state.eventCounts?.[ev.id] || 0;
    return `<div class="ov-stat-event${count ? '' : ' dim'}">
      ${eventIconHtml(ev.id, { size: 'sm' })}
      <span class="ov-stat-event-lab">${ev.label}</span>
      <b class="ov-stat-event-n">${count}</b>
    </div>`;
  }).join('');

  const fleetShips = (state.ships || []).filter((s) => !s.isHqSupport).length;
  const combatKills = state.pirateKills || 0;
  const raidsWon = state.raidsDefeated || 0;
  const raidsSeen = state.eventCounts?.pirate_raid || 0;
  const totalEvents = Object.values(state.eventCounts || {}).reduce((s, n) => s + (n || 0), 0);
  const trips = state.trips || 0;
  const baseLvl = state.base?.level || 1;
  const modules = (state.modules || []).length;
  const turrets = (state.turrets || []).length;

  const delta = (pts) => {
    if (pts.length < 2) return null;
    return pts[pts.length - 1].y - pts[pts.length - 2].y;
  };
  const coinDelta = delta(coinPts);
  const resDelta = delta(resPts);
  const fmtDelta = (d, prefix = '') => {
    if (d == null) return '—';
    const sign = d > 0 ? '+' : '';
    return `${sign}${prefix}${formatChartValue(d)}`;
  };

  return `<div class="ov-stats">
    <div class="ov-stats-kpis">
      <div class="ov-kpi">
        <div class="ov-kpi-lab">SOL</div>
        <div class="ov-kpi-val">${state.sol}</div>
      </div>
      <div class="ov-kpi gold">
        <div class="ov-kpi-lab">CREDITS</div>
        <div class="ov-kpi-val">$${fmtCompact(state.coins || 0)}</div>
        <div class="ov-kpi-sub ${coinDelta > 0 ? 'up' : coinDelta < 0 ? 'down' : ''}">${fmtDelta(coinDelta, '$')} vs last SOL</div>
      </div>
      <div class="ov-kpi">
        <div class="ov-kpi-lab">STOCKPILE</div>
        <div class="ov-kpi-val">${formatChartValue(latest?.totalResources || 0)}</div>
        <div class="ov-kpi-sub ${resDelta > 0 ? 'up' : resDelta < 0 ? 'down' : ''}">${fmtDelta(resDelta)} vs last SOL</div>
      </div>
      <div class="ov-kpi">
        <div class="ov-kpi-lab">FLEET</div>
        <div class="ov-kpi-val">${fleetShips}</div>
        <div class="ov-kpi-sub">ships · T${toRoman(baseLvl)} base</div>
      </div>
    </div>

    <div class="ov-stats-charts">
      <div class="ov-chart-card">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ CREDITS · LAST ${SOL_HISTORY_MAX} SOLS</span>
          <span class="ov-chart-tag gold">ECONOMY</span>
        </div>
        ${buildSolLineChart(coinPts, { color: '#ffe066', fill: 'rgba(255,224,102,0.14)', yLabel: 'CREDITS', valuePrefix: '$' })}
      </div>
      <div class="ov-chart-card">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ TOTAL RESOURCES · LAST ${SOL_HISTORY_MAX} SOLS</span>
          <span class="ov-chart-tag">STOCKPILE</span>
        </div>
        ${buildSolLineChart(resPts, { color: '#6fff9a', fill: 'rgba(111,255,154,0.12)', yLabel: 'RESOURCES' })}
      </div>
    </div>

    <div class="ov-stats-mid">
      <div class="ov-chart-card">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ FLEET SIZE</span>
          <span class="ov-chart-tag">SHIPS</span>
        </div>
        ${buildSolLineChart(shipPts, { color: '#7ec8ff', fill: 'rgba(126,200,255,0.12)', height: 110, yLabel: 'SHIPS' })}
      </div>
      <div class="ov-chart-card ov-res-break">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ TOP STOCKPILES</span>
          <span class="ov-chart-tag">NOW</span>
        </div>
        <div class="ov-res-list">
          ${resEntries.length
            ? resEntries.map((e) => {
              const maxA = resEntries[0].amount || 1;
              const pct = Math.max(4, Math.round((e.amount / maxA) * 100));
              return `<div class="ov-res-row">
                ${resourceIconHtml(e.type, 16)}
                <span class="ov-res-name">${e.def.label}</span>
                <div class="ov-res-bar"><i style="width:${pct}%;background:${e.def.color || '#4af'}"></i></div>
                <b>${fmtCompact(e.amount)}</b>
              </div>`;
            }).join('')
            : '<div class="ov-chart-empty">No stockpiled resources yet.</div>'}
        </div>
      </div>
    </div>

    <div class="ov-stats-bottom">
      <div class="ov-chart-card">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ COMBAT RECORD</span>
          <span class="ov-chart-tag combat">DEFENSE</span>
        </div>
        <div class="ov-combat-grid">
          <div class="ov-combat-stat">
            <div class="k">Pirates Destroyed</div>
            <div class="v">${fmt(combatKills)}</div>
          </div>
          <div class="ov-combat-stat">
            <div class="k">Raids Defeated</div>
            <div class="v">${fmt(raidsWon)}</div>
          </div>
          <div class="ov-combat-stat">
            <div class="k">Raids Faced</div>
            <div class="v">${fmt(raidsSeen)}</div>
          </div>
          <div class="ov-combat-stat">
            <div class="k">Threat Rank</div>
            <div class="v">${getThreatBreakdown(state).level}</div>
          </div>
        </div>
      </div>
      <div class="ov-chart-card">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ SECTOR EVENTS</span>
          <span class="ov-chart-tag">${totalEvents} total</span>
        </div>
        <div class="ov-stat-events">${eventRows || '<div class="ov-chart-empty">No events recorded.</div>'}</div>
      </div>
      <div class="ov-chart-card">
        <div class="ov-chart-head">
          <span class="ov-chart-title">◈ OPERATIONS</span>
          <span class="ov-chart-tag">LIVE</span>
        </div>
        <div class="ov-ops-list">
          <div class="ov-ops-row"><span>Mining trips</span><b>${fmt(trips)}</b></div>
          <div class="ov-ops-row"><span>Research points</span><b>${fmt(state.rp || 0)}</b></div>
          <div class="ov-ops-row"><span>Buildings</span><b>${fmt(modules)}</b></div>
          <div class="ov-ops-row"><span>Turrets</span><b>${fmt(turrets)}</b></div>
          <div class="ov-ops-row"><span>Base tier</span><b>${toRoman(baseLvl)}</b></div>
          <div class="ov-ops-row"><span>History window</span><b>${hist.length}/${SOL_HISTORY_MAX}</b></div>
        </div>
      </div>
    </div>

    ${(() => {
      const stats = buildStatsData();
      const yieldEntries = Object.entries(stats.nodesByType || {})
        .filter(([, d]) => (d.yield || 0) > 0)
        .sort((a, b) => (b[1].yield || 0) - (a[1].yield || 0));
      return `<div class="ov-stats-yield">
        <div class="ov-chart-card">
          <div class="ov-chart-head">
            <span class="ov-chart-title">◈ MINING YIELD RATE</span>
            <span class="ov-chart-tag">LIVE /min</span>
          </div>
          <div class="ov-yield-pills" id="ov-stats-yield-list">
            ${yieldEntries.length
              ? yieldEntries.map(([type, d]) => {
                const def = RESOURCE_DEFS[type];
                if (!def) return '';
                const yld = Math.round(d.yield || 0);
                return `<div class="ov-yield-pill">
                  ${resourceIconHtml(type, 14)}
                  <span class="ov-yield-name">${def.label}</span>
                  <b class="ov-yield-val">${fmt(yld)}/m</b>
                </div>`;
              }).join('')
              : '<div class="ov-chart-empty">No active mining.</div>'}
          </div>
        </div>
      </div>`;
    })()}
  </div>`;
}

window.setSolTab = function(tab) {
  const allowed = ['overview', 'threat', 'galaxy', 'stats'];
  _solTab = allowed.includes(tab) ? tab : 'overview';
  openHdrPanel('sol', { refresh: true, preserveScroll: true });
};

export function patchSolPanel(what) {
  if (!isHdrPanelOpen('sol')) return;
  if (what === 'sol') {
    const el = document.getElementById('sol-sector-label');
    if (el) el.textContent = `◈ KEPLER-7 SECTOR — SOL ${state.sol}`;
  }
  if (what === 'power' || what === 'threat' || !what) {
    const shipPow   = getFleetShipPower();
    const turretPow = getFleetTurretPower();
    const basePow   = getFleetBasePower();
    const total = shipPow + turretPow + basePow;
    const maxPow = Math.max(1, total);
    const el = document.getElementById('sol-fleet-power');
    const bd = document.getElementById('sol-fleet-breakdown');
    if (el) el.textContent = String(total);
    if (bd) bd.textContent = `SHP ${shipPow} · TUR ${turretPow} · BASE ${basePow}`;
    const setBar = (id, val) => {
      const bar = document.getElementById(id);
      if (bar) bar.style.width = `${Math.max(4, Math.round((val / maxPow) * 100))}%`;
    };
    setBar('sol-power-shp-bar', shipPow);
    setBar('sol-power-tur-bar', turretPow);
    setBar('sol-power-base-bar', basePow);
    const setStat = (id, val) => {
      const n = document.getElementById(id);
      if (n) n.textContent = String(val);
    };
    setStat('sol-power-shp-val', shipPow);
    setStat('sol-power-tur-val', turretPow);
    setStat('sol-power-base-val', basePow);
  }
  if (what === 'pirate' || what === 'threat' || what === 'power' || !what) {
    const threat = getThreatBreakdown(state);
    const pct = Math.max(0, Math.min(PIRATE_STATUS_RAID_AT, Math.floor(state.pirateStatus || 0)));
    const tone = getPirateStatusTone(pct);
    const statusEl = document.getElementById('sol-pirate-status');
    const barEl = document.getElementById('sol-pirate-bar');
    const pctEl = document.getElementById('sol-pirate-pct');
    const cardEl = document.getElementById('sol-pirate-card');
    const threatEl = document.getElementById('sol-threat-level');
    const threatRank = document.getElementById('sol-threat-rank');
    const threatBd = document.getElementById('sol-threat-breakdown');
    if (statusEl) statusEl.textContent = getPirateStatusLabel(pct);
    if (barEl) barEl.style.width = `${pct}%`;
    if (pctEl) {
      pctEl.textContent = pct >= PIRATE_STATUS_RAID_AT
        ? `${pct}% — raid inbound`
        : `${pct}% aggression · raid at ${PIRATE_STATUS_RAID_AT}%`;
    }
    if (cardEl) cardEl.dataset.tone = tone;
    if (threatEl) threatEl.textContent = String(threat.level);
    if (threatRank) threatRank.textContent = getThreatRankLabel(threat.level);
    if (threatBd) {
      threatBd.textContent =
        `FLT ${threat.shipPts} · DEF ${threat.turretPts} · INF ${threat.buildingPts} · KILL ${threat.killPts}`;
    }
    const setContrib = (id, val) => {
      const n = document.getElementById(id);
      if (n) n.textContent = String(val);
    };
    setContrib('sol-threat-flt', threat.shipPts);
    setContrib('sol-threat-def', threat.turretPts);
    setContrib('sol-threat-inf', threat.buildingPts);
    setContrib('sol-threat-kill', threat.killPts);
  }
}

function getShipRank(ship) {
  return Math.min(10, Math.max(1, ship.mineTier || ship.tier || 1));
}

function getFleetShipPower() {
  return state.ships.reduce((sum, ship) => sum + getShipRank(ship), 0);
}

function getFleetTurretPower() {
  return state.turrets.reduce((sum, turret) => sum + ((turret.level || 1) * 2), 0);
}

function getFleetBasePower() {
  return (state.base.level || 1) * 10;
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
    : ship.status === 'holding' ? '◌ Holding'
    : '— Idle';
}

function getShipNodeLabel(ship) {
  const node = state.nodes.find(n => n.id === ship.targetNode);
  return node ? RESOURCE_DEFS[node.type].label : '—';
}

function getShipDepotLabel(ship) {
  if (ship.depotType === 'storage' && ship.depotId !== null) {
    const storage = state.modules.find(module => module.id === ship.depotId);
    return storage?.name || '—';
  }
  if (ship.depotType === 'power_station' && ship.depotId !== null) {
    const station = state.modules.find(module => module.id === ship.depotId);
    return station?.name || '—';
  }
  return state.base.name || 'Base Station';
}

function getShipTierValue(ship) {
  return ship.tier || ship.mineTier || 1;
}

function shipTierPill(ship) {
  const t = getShipTierValue(ship);
  const c = MINE_TIERS[t]?.color || '#8ab';
  return `<span style="font-family:'Cinzel',serif;font-size:13px;font-weight:600;padding:2px 8px;border-radius:3px;border:1px solid ${c}44;background:${c}18;color:${c};">${toRoman(t)}</span>`;
}

function getShipSellValue(ship) {
  const stats = SHIP_DEFS[ship.type] || SHIP_DEFS.scout;
  let upgradeCost = 0;
  for (let i = 0; i < ship.capacityLevel;  i++) upgradeCost += Math.floor(40  * Math.pow(1.10, i));
  for (let i = 0; i < ship.flySpeedLevel;  i++) upgradeCost += Math.floor(60  * Math.pow(1.10, i));
  for (let i = 0; i < ship.mineSpeedLevel; i++) upgradeCost += Math.floor(60  * Math.pow(1.10, i));
  for (let i = 0; i < (ship.mineBonusLevel || 0); i++) upgradeCost += Math.floor(70 * Math.pow(1.10, i));
  for (let t = stats.mineTier + 1; t <= ship.mineTier; t++) upgradeCost += SHIP_TIER_COSTS[t] || 0;
  return Math.max(10, upgradeCost);
}

function getFleetSortValue(ship, key) {
  if (key === 'name') return ship.name || '';
  if (key === 'type') return getShipTypeName(ship);
  if (key === 'role') return SHIP_DEFS[ship.type]?.role || 'mining';
  if (key === 'tier') return getShipTierValue(ship);
  if (key === 'node') return getShipNodeLabel(ship);
  if (key === 'depot') return getShipDepotLabel(ship);
  if (key === 'status') return getShipStatusLabel(ship);
  if (key === 'cargo') return ship.cargo || 0;
  if (key === 'level') return (ship.capacityLevel || 0) + (ship.flySpeedLevel || 0) + (ship.mineSpeedLevel || 0) + (ship.mineBonusLevel || 0);
  if (key === 'sell') return getShipSellValue(ship);
  return ship.name || '';
}

function getSortedFleetShips() {
  let list = [...state.ships];
  if (_fleetRoleTab && _fleetRoleTab !== 'all') {
    list = list.filter((s) => (SHIP_DEFS[s.type]?.role || 'mining') === _fleetRoleTab);
  }
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

function getFleetRoleCounts() {
  const counts = { mining: 0, transport: 0, combat: 0, garrison: 0, unique: 0 };
  for (const s of state.ships) {
    const role = SHIP_DEFS[s.type]?.role || 'mining';
    if (counts[role] != null) counts[role] += 1;
    else counts.unique += 1;
  }
  return counts;
}

window.setFleetRoleTab = function(tab) {
  const allowed = ['all', 'mining', 'transport', 'combat', 'garrison'];
  _fleetRoleTab = allowed.includes(tab) ? tab : 'all';
  if (isHdrPanelOpen('fleet')) {
    openHdrPanel('fleet', { refresh: true, preserveScroll: true });
  }
};

function sortArrowFor(key) {
  if (_fleetSortKey !== key) return '↕';
  return _fleetSortDir === 1 ? '▲' : '▼';
}

function fleetHeaderCell(label, key) {
  return `<th class="ships-sort-head" onclick="sortFleetManifest('${key}')">${label} <span class="ships-sort-arrow${_fleetSortKey===key?' active':''}">${sortArrowFor(key)}</span></th>`;
}

function buildFleetCompositionHtml(typeCounts, shipCount, maxShips) {
  const compositionHeaders = Object.keys(typeCounts);
  const compositionValues = compositionHeaders.map((key) => typeCounts[key]);
  if (!compositionHeaders.length) return '<div class="ships-empty">No ships in fleet yet.</div>';
  const countStr = (shipCount !== undefined && maxShips !== undefined) ? `${shipCount}/${maxShips} SHIPS — ` : '';
  return `<div class="ships-comp-title">◈ ${countStr}FLEET COMPOSITION</div>
    <table class="ships-comp-table">
      <tr>${compositionHeaders.map(name => `<td class="ships-comp-head">${name}</td>`).join('')}</tr>
      <tr>${compositionValues.map(value => `<td class="ships-comp-val">${value}</td>`).join('')}</tr>
    </table>`;
}

function refreshFleetPanelPartial() {
  const body = getHdrModalWindow('fleet')?.querySelector('.hdr-modal-body');
  if (!body) return;
  const sortedShips = getSortedFleetShips();
  const rows = body.querySelectorAll('tr[data-ship-id]');
  if (rows.length !== sortedShips.length) {
    openHdrPanel('fleet', { refresh: true, preserveScroll: true });
    return;
  }
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
      openHdrPanel('fleet', { refresh: true, preserveScroll: true });
      return;
    }
    const status = getShipStatusLabel(ship);
    const nodeLabel = getShipNodeLabel(ship);
    const depotLabel = getShipDepotLabel(ship);
    const tier = shipTierPill(ship);
    const cargo = `${ship.cargo}/${ship.capacity}`;

    const nodeEl = row.querySelector('[data-cell="node"]');
    const depotEl = row.querySelector('[data-cell="depot"]');
    const statusEl = row.querySelector('[data-cell="status"]');
    const cargoEl = row.querySelector('[data-cell="cargo"]');
    const tierEl = row.querySelector('[data-cell="tier"]');
    if (nodeEl && nodeEl.textContent !== nodeLabel) nodeEl.textContent = nodeLabel;
    if (depotEl && depotEl.textContent !== depotLabel) depotEl.textContent = depotLabel;
    if (statusEl && statusEl.textContent !== status) statusEl.textContent = status;
    if (cargoEl && cargoEl.textContent !== cargo) cargoEl.textContent = cargo;
    if (tierEl && tierEl.innerHTML !== tier) tierEl.innerHTML = tier;
  }
}

window.sortFleetManifest = function(key) {
  if (_fleetSortKey === key) _fleetSortDir *= -1;
  else { _fleetSortKey = key; _fleetSortDir = 1; }
  if (isHdrPanelOpen('fleet')) {
    openHdrPanel('fleet', { refresh: true, preserveScroll: true });
  }
};

export function handleBasePanelOverlayClick(e) {
  return;
}

function switchCodexTab(tab) {
  _codexTab = tab;
  openHdrPanel('codex', { refresh: true, preserveScroll: true });
}
window.switchCodexTab = switchCodexTab;

function normalizeCraftTab(tab) {
  if (tab === 'modules' || tab === 'buildings') return 'storage';
  if (tab === 'queue') return 'queue';
  return tab;
}

function switchCraftTab(tab) {
  const next = normalizeCraftTab(tab);
  // Queue tab only when something is actively crafting
  if (next === 'queue' && getActiveCraftJobs().length === 0) return;
  _craftTab = next;
  _craftSelected = null;
  openHdrPanel('craft', { refresh: true, preserveScroll: true });
}
window.setCraftTab = switchCraftTab;

function switchCraftShipRoleTab(tab) {
  _craftShipRoleTab = tab;
  _craftSelected = null;
  openHdrPanel('craft', { refresh: true, preserveScroll: true });
}
window.setCraftShipRoleTab = switchCraftShipRoleTab;

function selectCraftItem(kind, id) {
  _craftSelected = { kind, id };
  openHdrPanel('craft', { refresh: true, preserveScroll: true });
}
window.selectCraftItem = selectCraftItem;

function craftTabForItem(kind, id) {
  if (kind === 'ship') return 'ships';
  if (kind === 'turret') return 'defense';
  if (kind === 'drone') return 'drones';
  if (kind === 'building') {
    if (id === 'storage_facility') return 'storage';
    if (id === 'power_station' || id === 'power_pole') return 'power';
    if (id === 'research_lab' || id === 'lab_tower') return 'research';
    if (id === 'drone_lab') return 'drones';
    return 'storage';
  }
  return 'ships';
}

function openCraftToItem(kind, id) {
  _craftTab = craftTabForItem(kind, id);
  if (kind === 'ship') _craftShipRoleTab = SHIP_DEFS[id]?.role || 'mining';
  _craftSelected = { kind, id };
  openHdrPanel('craft', { refresh: true, preserveScroll: true });
}
window.openCraftToItem = openCraftToItem;

function craftRankClass(tier) {
  const t = Math.max(1, Math.min(10, Number(tier) || 1));
  return `rank-${t}`;
}

function craftTrackBtn(kind, id) {
  const atMax = (state.trackedCrafts || []).length >= 3;
  const tracked = isTracked(kind, id);
  return `<button type="button" class="cf-track${tracked ? ' ct-tracked' : ''}" data-ct-kind="${kind}" data-ct-id="${id}" title="${tracked ? 'Untrack' : 'Track in craft queue'}" ${!tracked && atMax ? 'disabled' : ''} onclick="event.stopPropagation();toggleTrackCraft('${kind}','${id}')"><span class="ms-icon${tracked ? ' ms-icon-fill' : ''}" aria-hidden="true">bookmark</span></button>`;
}

function craftMatGridHtml(reqs) {
  // Credits shown on the BUILD button — materials grid is resources only
  const cells = [];
  for (const [r, n] of Object.entries(reqs || {})) {
    const met = (state.resources[r] || 0) >= n;
    const label = RESOURCE_DEFS[r]?.label || r;
    cells.push(`<div class="cf-mat ${met ? 'ok' : 'bad'}" title="${label}: ${fmt(n)}">
      <span class="cf-mat-check">${met ? '✓' : '!'}</span>
      ${resourceIconHtml(r, 28, '') || `<span class="cf-mat-icon cash">?</span>`}
      <div class="cf-mat-name">${label}</div>
      <div class="cf-mat-amt">${fmtCompact(n)}</div>
    </div>`);
  }
  if (!cells.length) return '<div class="cf-empty">No materials required.</div>';
  return `<div class="cf-mat-grid">${cells.join('')}</div>`;
}

function craftBuildBtnHtml({ id, kind, label, can, timer, placeQueued, placeOnclick, buildOnclick, notice, queueCount = 0 }) {
  if (notice) {
    return `<button class="cf-build" type="button" disabled><span class="bp-craft-btn-label">${notice}</span></button>`;
  }
  if (placeQueued > 0) {
    return `<button class="cf-build place" type="button" onclick="${placeOnclick}">PLACE (${placeQueued})</button>`;
  }
  // Always allow queueing more if slots free — show progress of first active job as secondary state
  if (timer && Date.now() < timer.endsAt && !canEnqueueCraft()) {
    const remainMs = Math.max(0, timer.endsAt - Date.now());
    const remainSec = Math.ceil(remainMs / 1000);
    const pct = Math.max(0, Math.min(100, ((timer.durationMs - remainMs) / timer.durationMs) * 100));
    const fillId = `craft-job-fill-${kind}-${id}`;
    const labelId = `craft-job-label-${kind}-${id}`;
    return `<button class="cf-build" type="button" disabled>
      <span class="bp-craft-btn-fill" id="${fillId}" style="width:${pct}%;"></span>
      <span class="bp-craft-btn-label" id="${labelId}">CRAFTING ${remainSec}s</span>
    </button>`;
  }
  return `<button class="cf-build" type="button" ${can ? '' : 'disabled'} onclick="${buildOnclick}">
    <span class="ms-icon ms-icon-fill" aria-hidden="true">build</span>
    <span class="bp-craft-btn-label">${label}</span>
  </button>`;
}

// ── Stats helpers ───────────────────────────────────────────
function buildStatsData() {
  const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 20;
  const assigned = state.ships.filter(s => s.targetNode !== null && s.targetNode !== undefined).length;
  const idle     = state.ships.length - assigned;

  const accessibleNodes = state.nodes.filter(n => n.minLevel <= state.base.level);
  const nodesByType = {};
  for (const node of accessibleNodes) {
    if (!nodesByType[node.type]) nodesByType[node.type] = { total: 0, occupied: 0, yield: 0, mineable: false };
    nodesByType[node.type].total++;
  }
  // Mark types that at least one ship can mine
  for (const s of state.ships) {
    for (const type of Object.keys(nodesByType)) {
      const tierNum = parseInt(Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(type))?.[0] || '99');
      if (s.mineTier >= tierNum) nodesByType[type].mineable = true;
    }
  }
  for (const s of state.ships) {
    if (s.targetNode === null || s.targetNode === undefined) continue;
    const node = state.nodes.find(n => n.id === s.targetNode);
    if (!node || !nodesByType[node.type]) continue;
    nodesByType[node.type].occupied++;
    if (s.status !== 'idle') nodesByType[node.type].yield += (60 / (1.5 / s.mineSpeed));
  }

  const totalNodes = accessibleNodes.length;
  const occupiedNodes = Object.values(nodesByType).reduce((a, v) => a + v.occupied, 0);
  return { maxShips, assigned, idle, totalNodes, occupiedNodes, nodesByType };
}

function buildStatsHtml() {
  const { nodesByType } = buildStatsData();

  // Inventory grid: any stored amount, plus types with accessible sector nodes
  const stockpileKeys = new Set();
  for (const [k, def] of Object.entries(RESOURCE_DEFS)) {
    if (!def || def.special || !isStorableResource(k)) continue;
    const stored = state.resources[k] || 0;
    const nodes = nodesByType[k];
    if (stored > 0 || (nodes && nodes.total > 0)) stockpileKeys.add(k);
  }
  _stockpileMineableKeys = stockpileKeys;

  const invCells = [];
  // Highest tier first for MMO bag feel, but keep tier groups visually light
  const tierEntries = Object.entries(MINE_TIERS).sort((a, b) => Number(b[0]) - Number(a[0]));
  for (const [tier, tierInfo] of tierEntries) {
    for (const k of tierInfo.resources) {
      if (!stockpileKeys.has(k)) continue;
      const def = RESOURCE_DEFS[k];
      if (!def) continue;
      const d = nodesByType[k] || { total: 0, occupied: 0, yield: 0, mineable: false };
      const v = state.resources[k] || 0;
      // Warn only when sector has nodes of this type but nothing is pulling them in
      const notPulling = d.total > 0 && d.occupied === 0;
      const tip = `${def.label}<br><span style="color:#ffe066">${fmt(v)}</span> in stock`
        + (notPulling ? '<br><span style="color:#ff7a7a">No ships assigned — not being mined</span>' : '');
      const warn = notPulling
        ? `<span id="stockpile-alert-${k}" class="inv-cell-warn ms-icon" data-tippy-content="No ships assigned — not being mined" aria-label="Not being mined">warning</span>`
        : `<span id="stockpile-alert-${k}" class="inv-cell-warn ms-icon" style="display:none;" aria-hidden="true">warning</span>`;
      invCells.push(`<div id="stockpile-card-${k}" class="inv-cell" style="--inv-col:${def.color}" data-tippy-content="${tip.replace(/"/g, '&quot;')}">
        ${warn}
        <div class="inv-cell-ico">${resourceIconHtml(k, 28)}</div>
        <div class="inv-cell-qty" id="stockpile-val-${k}" style="color:${v === 0 ? '#4a6a8a' : '#ffe066'}">${fmt(v)}</div>
        <div class="inv-cell-name">${def.label}</div>
      </div>`);
    }
  }

  return invCells.length
    ? `<div class="inv-grid" id="resources-inv-grid">${invCells.join('')}</div>`
    : '<div class="resources-empty">No resources in stockpile yet.</div>';
}

function patchStockpileCards(nodesByType) {
  // Rebuild if the set of stockpile keys changed (new stock or newly accessible nodes)
  const nextKeys = new Set();
  for (const [k, def] of Object.entries(RESOURCE_DEFS)) {
    if (!def || def.special || !isStorableResource(k)) continue;
    const stored = state.resources[k] || 0;
    const nodes = nodesByType[k];
    if (stored > 0 || (nodes && nodes.total > 0)) nextKeys.add(k);
  }
  const newKeys = [...nextKeys].sort().join(',');
  const curKeys = _stockpileMineableKeys ? [..._stockpileMineableKeys].sort().join(',') : null;
  if (curKeys !== newKeys) {
    const body = getHdrModalWindow('resources')?.querySelector('.hdr-modal-body');
    if (body) {
      body.innerHTML = buildStatsHtml();
      requestAnimationFrame(() => bindTippyIn(body));
    }
    return;
  }
  for (const k of nextKeys) {
    const def = RESOURCE_DEFS[k];
    if (!def) continue;
    const d = nodesByType[k] || { total: 0, occupied: 0 };
    const card = document.getElementById(`stockpile-card-${k}`);
    if (!card) continue;
    const notPulling = d.total > 0 && d.occupied === 0;
    const v = state.resources[k] || 0;
    const alertEl = document.getElementById(`stockpile-alert-${k}`);
    if (alertEl) {
      alertEl.style.display = notPulling ? '' : 'none';
      alertEl.setAttribute('aria-hidden', notPulling ? 'false' : 'true');
      if (notPulling) {
        alertEl.setAttribute('data-tippy-content', 'No ships assigned — not being mined');
        window.bindTippy?.(alertEl, 'No ships assigned — not being mined');
      } else {
        window.destroyTippy?.(alertEl);
        alertEl.removeAttribute('data-tippy-content');
      }
    }
    const tip = `${def.label}<br><span style="color:#ffe066">${fmt(v)}</span> in stock`
      + (notPulling ? '<br><span style="color:#ff7a7a">No ships assigned — not being mined</span>' : '');
    card.setAttribute('data-tippy-content', tip);
    window.bindTippy?.(card, tip);
    const valEl = document.getElementById(`stockpile-val-${k}`);
    if (valEl) {
      const txt = fmt(v);
      if (valEl.textContent !== txt) {
        valEl.textContent = txt;
        valEl.style.color = v === 0 ? '#4a6a8a' : '#ffe066';
      }
    }
  }
}

window.patchStockpileCards = function() {
  if (!isHdrPanelOpen('resources')) return;
  patchStockpileCards(buildStatsData().nodesByType);
};

export function patchStatsPanel() {
  if (!isHdrPanelOpen('resources')) return;
  patchStockpileCards(buildStatsData().nodesByType);
}

export function openHdrPanel(type, options = {}) {
  const overlay = document.getElementById('hdr-modal-overlay');
  if (!overlay) return;

  // Transmissions lives under Command now
  if (type === 'transmissions') {
    const cmdBody = getHdrModalWindow('command')?.querySelector('.hdr-modal-body');
    if (cmdBody) cmdBody.dataset.cmdTab = 'transmissions';
    else {
      // Stash preferred tab before command window exists
      window._pendingCmdTab = 'transmissions';
    }
    return openHdrPanel('command', { ...options, refresh: true });
  }

  // Second click on same header button toggles that window closed (unless refresh).
  if (isHdrPanelOpen(type) && !options.refresh) {
    closeHdrPanelType(type);
    return;
  }

  // Opening a header panel clears active ship selection / placement modes.
  if (!options.refresh) {
    state.selectedShip = null;
    state.pendingAssign = null;
    const canvas = document.getElementById('main-canvas');
    if (canvas) canvas.style.cursor = '';
    removeReassignTooltip();
    cancelTurretPlacement();
    cancelStoragePlacement();
  }

  if (type === 'market' && state.tutStep === 10) {
    state.tutStep = 11;
    document.querySelectorAll('.tut-pointer').forEach(el => el.remove());
  }

  // Show overlay first so layout measurements are valid
  overlay.classList.add('open');

  const { modal, heading, body } = getHdrPanelEls(type);
  if (!modal || !heading || !body) return;

  _focusedHdrPanel = type;
  syncHdrPanelOpenCompat();
  bringFloatingToFront(modal);

  if (!options.preserveScroll) body.scrollTop = 0;
  modal.classList.toggle('hdr-modal-fleet', type === 'fleet');
  modal.classList.toggle('hdr-modal-codex', type === 'codex');
  modal.classList.toggle('hdr-modal-craft', type === 'craft');
  modal.classList.toggle('hdr-modal-research', type === 'research');
  heading.textContent = HDR_PANEL_TITLES[type] || type.toUpperCase();

  if (type === 'research' && state.seenMsgs['dax_lv3_intro'] && state.seenMsgs['kai_lv3_intro']) {
    state.seenMsgs['lv3_research_pointer_done'] = true;
    document.querySelectorAll('#tut-ptr-research-lv3').forEach(el => el.remove());
  }

  // ── SOL OVERVIEW ───────────────────────────────────────────
  if (type === 'sol') {
    heading.textContent = 'SECTOR OVERVIEW';
    const shipPow   = getFleetShipPower();
    const turretPow = getFleetTurretPower();
    const basePow   = getFleetBasePower();
    const fleetPower = shipPow + turretPow + basePow;
    const maxPow = Math.max(1, fleetPower);
    const threat = getThreatBreakdown(state);
    const piratePct = Math.max(0, Math.min(PIRATE_STATUS_RAID_AT, Math.floor(state.pirateStatus || 0)));
    const pirateLabel = getPirateStatusLabel(piratePct);
    const pirateTone = getPirateStatusTone(piratePct);
    const pirateHint = piratePct >= PIRATE_STATUS_RAID_AT
      ? `${piratePct}% — raid inbound`
      : `${piratePct}% aggression · raid at ${PIRATE_STATUS_RAID_AT}%`;
    const threatRank = getThreatRankLabel(threat.level);
    const tab = _solTab;
    const powerBar = (val) => Math.max(4, Math.round((val / maxPow) * 100));

    const wipPane = (icon, title, blurb) => `
      <div class="ov-wip">
        <div class="ov-wip-icon">${icon}</div>
        <div class="ov-wip-title">${title}</div>
        <div class="ov-wip-desc">${blurb}</div>
        <div class="ov-wip-badge">WORK IN PROGRESS</div>
      </div>`;

    const threatPane = `
      <div class="ov-threat-grid">
        <div class="ov-rpg-card power" id="sol-power-card">
          <div class="ov-rpg-seal">⚔</div>
          <div class="ov-rpg-kicker">Combat Rating</div>
          <div class="ov-rpg-label">FLEET POWER</div>
          <div id="sol-fleet-power" class="ov-rpg-value power">${fleetPower}</div>
          <div id="sol-fleet-breakdown" class="ov-rpg-sub">SHP ${shipPow} · TUR ${turretPow} · BASE ${basePow}</div>
          <div class="ov-rpg-bars">
            <div class="ov-rpg-bar-row">
              <span>Ships</span>
              <div class="ov-rpg-bar-track"><i id="sol-power-shp-bar" style="width:${powerBar(shipPow)}%"></i></div>
              <b id="sol-power-shp-val">${shipPow}</b>
            </div>
            <div class="ov-rpg-bar-row">
              <span>Turrets</span>
              <div class="ov-rpg-bar-track"><i id="sol-power-tur-bar" style="width:${powerBar(turretPow)}%"></i></div>
              <b id="sol-power-tur-val">${turretPow}</b>
            </div>
            <div class="ov-rpg-bar-row">
              <span>Base</span>
              <div class="ov-rpg-bar-track"><i id="sol-power-base-bar" style="width:${powerBar(basePow)}%"></i></div>
              <b id="sol-power-base-val">${basePow}</b>
            </div>
          </div>
        </div>

        <div class="ov-rpg-card pirate" id="sol-pirate-card" data-tone="${pirateTone}">
          <div class="ov-rpg-seal">☠</div>
          <div class="ov-rpg-kicker">Sector Heat</div>
          <div class="ov-rpg-label">PIRATE STATUS</div>
          <div id="sol-pirate-status" class="ov-rpg-value pirate">${pirateLabel}</div>
          <div class="ov-rpg-meter">
            <div class="ov-rpg-meter-track">
              <div id="sol-pirate-bar" class="ov-rpg-meter-fill" style="width:${piratePct}%"></div>
            </div>
            <div class="ov-rpg-meter-ticks">
              <span>Quiet</span><span>Stirring</span><span>Hostile</span><span>Critical</span>
            </div>
          </div>
          <div id="sol-pirate-pct" class="ov-rpg-sub">${pirateHint}</div>
          <div class="ov-rpg-note">Builds each SOL and when you expand. Raids fire at 100%.</div>
        </div>

        <div class="ov-rpg-card threat" id="sol-threat-card">
          <div class="ov-rpg-seal">⬡</div>
          <div class="ov-rpg-kicker">Notoriety Rank</div>
          <div class="ov-rpg-label">THREAT LEVEL</div>
          <div id="sol-threat-level" class="ov-rpg-value threat">${threat.level}</div>
          <div id="sol-threat-rank" class="ov-rpg-rank">${threatRank}</div>
          <div class="ov-rpg-contrib">
            <div class="ov-rpg-chip"><span>Fleet</span><b id="sol-threat-flt">${threat.shipPts}</b></div>
            <div class="ov-rpg-chip"><span>Defense</span><b id="sol-threat-def">${threat.turretPts}</b></div>
            <div class="ov-rpg-chip"><span>Infra</span><b id="sol-threat-inf">${threat.buildingPts}</b></div>
            <div class="ov-rpg-chip"><span>Kills</span><b id="sol-threat-kill">${threat.killPts}</b></div>
          </div>
          <div id="sol-threat-breakdown" class="ov-rpg-sub">FLT ${threat.shipPts} · DEF ${threat.turretPts} · INF ${threat.buildingPts} · KILL ${threat.killPts}</div>
          <div class="ov-rpg-note">Raises pirate aggression speed and HQ support cost.</div>
        </div>
      </div>`;

    body.innerHTML = `
      <div class="overview-root">
        <div class="overview-hero">
          <div class="overview-galaxy">ANDROMEDA</div>
          <div id="sol-sector-label" class="overview-sector">◈ KEPLER-7 SECTOR — SOL ${state.sol}</div>
          <div class="overview-blurb">Deep in the outer rim, where stellar winds thin and ancient ore drifts unclaimed — your operation pushes further each cycle.</div>
        </div>

        <div class="mod-tabs sm-tabs ov-tabs">
          <button type="button" class="mod-tab sm-tab${tab === 'overview' ? ' on' : ''}" onclick="setSolTab('overview')">
            <span class="ms-icon">public</span> OVERVIEW
          </button>
          <button type="button" class="mod-tab sm-tab${tab === 'threat' ? ' on' : ''}" onclick="setSolTab('threat')">
            <span class="ms-icon">swords</span> THREAT LEVEL
          </button>
          <button type="button" class="mod-tab sm-tab${tab === 'galaxy' ? ' on' : ''}" onclick="setSolTab('galaxy')">
            <span class="ms-icon">travel_explore</span> GALAXY
          </button>
          <button type="button" class="mod-tab sm-tab${tab === 'stats' ? ' on' : ''}" onclick="setSolTab('stats')">
            <span class="ms-icon">analytics</span> STATISTICS
          </button>
        </div>

        <div class="ov-tab-body">
          ${tab === 'overview' ? wipPane('◈', 'SECTOR BRIEFING', 'Sector intel, contracts, and operational summaries will land here.') : ''}
          ${tab === 'threat' ? threatPane : ''}
          ${tab === 'galaxy' ? `
            <div class="overview-probe-wrap ov-galaxy-pane">
              <div class="overview-probe-title">◈ GALAXY PROBE — COMING SOON</div>
              <div class="overview-probe-card">
                <div class="overview-probe-icon">🛸</div>
                <div class="overview-probe-name">DEEP SPACE PROBES</div>
                <div class="overview-probe-desc">Launch probes to distant systems to discover rare resources, anomalies, and uncharted territories.</div>
              </div>
            </div>` : ''}
          ${tab === 'stats' ? buildOverviewStatsPane() : ''}
        </div>
      </div>`;
    if (tab === 'stats') {
      requestAnimationFrame(() => bindTippyIn(body));
    }
  }

  // ── COMMAND ────────────────────────────────────────────────
  else if (type === 'command') {
    heading.textContent = 'COMMAND';
    const cmdTabs = [
      { id: 'missions', label: 'MISSIONS', icon: 'flag' },
      { id: 'quests',   label: 'QUESTS',   icon: 'assignment' },
      { id: 'bounties', label: 'BOUNTIES', icon: 'crisis_alert' },
      { id: 'rep',      label: 'REP',      icon: 'military_tech' },
      { id: 'transmissions', label: 'TRANSMISSIONS', icon: 'cell_tower' },
    ];
    if (window._pendingCmdTab) {
      body.dataset.cmdTab = window._pendingCmdTab;
      window._pendingCmdTab = null;
    }
    const activeCmd = body.dataset.cmdTab === 'controls' ? 'missions'
      : (body.dataset.cmdTab || 'missions');
    const tabBar = cmdTabs.map((t) => `
      <button type="button" class="mod-tab sm-tab${activeCmd === t.id ? ' on' : ''}" onclick="setCmdTab('${t.id}')">
        <span class="ms-icon">${t.icon}</span> ${t.label}
      </button>`).join('');
    const placeholders = {
      missions: { icon: 'flag', title: 'MAIN MISSIONS', desc: 'Story-driven command missions with NPC transmissions, objectives, and sector-altering consequences. Follow the Andromeda narrative arc.' },
      quests:   { icon: 'assignment', title: 'ACTIVE QUESTS', desc: 'Rotating short-term objectives refreshed each SOL. Collect resources, hit milestones, and earn bonus rewards.' },
      bounties: { icon: 'crisis_alert', title: 'BOUNTY BOARD',  desc: 'Pirate targets and faction contracts posted each SOL. Requires combat capability. Rewards scale with threat level.' },
      rep:      { icon: 'military_tech', title: 'REPUTATION',    desc: 'Your standing with Outer Rim Collective, Helix Corp, Vanguard Fleet, and the Black Market. Affects prices, access, and story outcomes.' },
    };
    let tabBody = '';
    if (activeCmd === 'transmissions') {
      tabBody = `<div class="ov-tab-body" id="cmd-tab-body"></div>`;
    } else {
      const p = placeholders[activeCmd] || placeholders.missions;
      tabBody = `
        <div class="ov-tab-body">
          <div class="command-card">
            <div class="command-icon"><span class="ms-icon ms-icon-lg">${p.icon}</span></div>
            <div class="command-title">${p.title}</div>
            <div class="command-desc">${p.desc}</div>
            <div class="command-soon">— COMING SOON —</div>
          </div>
        </div>`;
    }
    body.innerHTML = `
      <div class="command-layout">
        <div class="mod-tabs sm-tabs ov-tabs cmd-tabs">${tabBar}</div>
        ${tabBody}
      </div>`;
    body.dataset.cmdTab = activeCmd;
    window.setCmdTab = (id) => { body.dataset.cmdTab = id; openHdrPanel('command', { refresh: true, preserveScroll: true }); };
    if (activeCmd === 'transmissions') {
      const txHost = body.querySelector('#cmd-tab-body') || body.querySelector('.ov-tab-body');
      renderTransmissionsPanel(txHost);
    }
  }



  // ── CRAFT ─────────────────────────────────────────────────
  else if (type === 'craft') {
    heading.textContent = 'CRAFTING & FABRICATION';
    if (state.tutStep === 5) { state.tutStep = 6; requestAnimationFrame(() => renderTutPointers()); }

    const bl = state.base.level;
    const maxShips = BASE_MAX_SHIPS[bl - 1] || 5;
    const activeShipCrafts = countCraftJobs('ship');
    const queueFull = !canEnqueueCraft();
    const atCap = (state.ships.length + activeShipCrafts) >= maxShips;
    const activeJobs = getActiveCraftJobs();
    const hasQueue = activeJobs.length > 0;
    let activeCraftTab = normalizeCraftTab(_craftTab || 'ships');
    if (activeCraftTab === 'queue' && !hasQueue) {
      activeCraftTab = 'ships';
      _craftTab = 'ships';
    }

    const craftTabDefs = [
      { id: 'queue', label: 'QUEUE', icon: 'hourglass_top' },
      { id: 'ships', label: 'SHIPS', icon: 'rocket_launch' },
      { id: 'defense', label: 'DEFENSE', icon: 'shield' },
      { id: 'storage', label: 'STORAGE', icon: 'warehouse' },
      { id: 'power', label: 'POWER', icon: 'bolt' },
      { id: 'research', label: 'RESEARCH', icon: 'science' },
      { id: 'drones', label: 'DRONES', icon: 'drone_2' },
    ];
    const moduleTabIds = {
      storage: new Set(['storage_facility']),
      power: new Set(['power_station', 'power_pole']),
      research: new Set(['research_lab', 'lab_tower']),
      drones: new Set(['drone_lab']),
    };
    const unplacedModuleQueue = Array.isArray(state.unplacedModuleQueue)
      ? state.unplacedModuleQueue
      : Array.from({ length: state.unplacedModules || 0 }, () => 'storage_facility');
    const unplacedTurretQueue = Array.isArray(state.unplacedTurretQueue)
      ? state.unplacedTurretQueue
      : Array.from({ length: state.unplacedTurrets || 0 }, () => 'turret');
    const tabHasPlaceable = {
      ships: false,
      defense: unplacedTurretQueue.length > 0,
      storage: unplacedModuleQueue.some((id) => moduleTabIds.storage.has(id)),
      power: unplacedModuleQueue.some((id) => moduleTabIds.power.has(id)),
      research: unplacedModuleQueue.some((id) => moduleTabIds.research.has(id)),
      drones: unplacedModuleQueue.some((id) => moduleTabIds.drones.has(id)),
    };

    const ROLE_META = {
      mining: { label: 'MINING', color: '#60d090', icon: 'hardware', title: 'MINING FLEET' },
      transport: { label: 'CARGO', color: '#80d0ff', icon: 'inventory_2', title: 'CARGO FLEET' },
      combat: { label: 'COMBAT', color: '#ff6060', icon: 'swords', title: 'COMBAT FLEET' },
      garrison: { label: 'GARRISON', color: '#ff8c40', icon: 'fort', title: 'GARRISON' },
    };
    const roleOrder = ['mining', 'transport', 'combat', 'garrison'];
    const activeShipRoleTab = _craftShipRoleTab || 'mining';

    /** @type {Array<{key:string,kind:string,id:string,name:string,tier:number,roleLabel:string,roleColor:string,iconHtml:string,statsHtml:string,blurb:string,cost:number,reqs:object,can:boolean,timer:any,placeQueued:number,placeOnclick:string,buildOnclick:string,notice:string,trackKind:string,meta?:string}>} */
    const items = [];

    if (activeCraftTab === 'ships') {
      const groupRecipes = CRAFT_RECIPES.filter((r) => {
        const s = SHIP_DEFS[r.id];
        return s && (s.role || 'mining') === activeShipRoleTab && s.mineTier <= bl;
      });
      for (const recipe of groupRecipes) {
        const stats = SHIP_DEFS[recipe.id] || SHIP_DEFS.scout;
        const role = stats.role || 'mining';
        const sc = ROLE_META[role]?.color || '#60d090';
        let statsHtml = '';
        if (role === 'combat') {
          statsHtml = [
            `<span><i>HP</i><b>${(stats.hp || 0).toLocaleString()}</b></span>`,
            `<span><i>ATK</i><b>${stats.attack || 0}</b></span>`,
            `<span><i>Rate</i><b>${formatAtkRatePercent(stats.attackSpeed || 0)}</b></span>`,
            `<span><i>Speed</i><b>${formatFlySpeed(stats.flySpeed)}</b></span>`,
            `<span><i>Tier</i><b>${toRoman(stats.mineTier || 1)}</b></span>`,
          ].join('');
        } else if (role === 'garrison') {
          statsHtml = [
            `<span><i>HP</i><b>${(stats.hp || 0).toLocaleString()}</b></span>`,
            `<span><i>ATK</i><b>${stats.attack || 0}</b></span>`,
            `<span><i>Rate</i><b>${formatAtkRatePercent(stats.attackSpeed || 0)}</b></span>`,
            `<span><i>Range</i><b>${Math.round(stats.range || 0)}</b></span>`,
            `<span><i>Speed</i><b>${formatFlySpeed(stats.flySpeed)}</b></span>`,
            `<span><i>Tier</i><b>${toRoman(stats.mineTier || 1)}</b></span>`,
          ].join('');
        } else if (role === 'transport') {
          statsHtml = [
            `<span><i>Cap</i><b>${stats.capacity}u</b></span>`,
            `<span><i>Speed</i><b>${formatFlySpeed(stats.flySpeed)}</b></span>`,
            `<span><i>Load</i><b>${formatLoadSpeed(stats.loadSpeed || 0)}</b></span>`,
            `<span><i>Tier</i><b>${toRoman(stats.mineTier || 1)}</b></span>`,
          ].join('');
        } else {
          const bonus = mineBonusFromLevel(0);
          statsHtml = [
            `<span><i>Cap</i><b>${stats.capacity}u</b></span>`,
            `<span><i>Speed</i><b>${formatFlySpeed(stats.flySpeed)}</b></span>`,
            `<span><i>Mine</i><b>${formatMineSpeedPercent(stats.mineSpeed)}</b></span>`,
            `<span><i>Bonus</i><b>${formatMineBonusPercent(bonus)}</b></span>`,
            `<span><i>Tier</i><b>${toRoman(stats.mineTier || 1)}</b></span>`,
          ].join('');
        }
        const reqsMet = Object.entries(recipe.reqs || {}).every(([r, n]) => (state.resources[r] || 0) >= n);
        const builtNoticeUntil = state.shipCraftNotices?.[recipe.id] || 0;
        items.push({
          key: `ship:${recipe.id}`,
          kind: 'ship',
          id: recipe.id,
          name: recipe.name,
          tier: stats.mineTier || 1,
          roleLabel: role,
          roleColor: sc,
          iconHtml: '<span class="ms-icon ms-icon-fill" aria-hidden="true">rocket</span>',
          statsHtml,
          blurb: recipe.desc || `${role} vessel for fleet operations.`,
          cost: 0,
          reqs: recipe.reqs || {},
          can: reqsMet && !atCap && !queueFull,
          timer: getFirstJobForRecipe('ship', recipe.id),
          placeQueued: 0,
          placeOnclick: '',
          buildOnclick: `startCraftShip('${recipe.id}')`,
          notice: Date.now() < builtNoticeUntil
            ? 'SHIP BUILT AND DEPLOYED!'
            : (queueFull ? 'QUEUE FULL' : (atCap ? 'FLEET FULL' : '')),
          trackKind: 'ship',
          queueCount: countCraftJobs('ship', recipe.id),
        });
      }
    } else if (activeCraftTab === 'defense') {
      if (state.researchUnlocks['turrets']) {
        const queue = unplacedTurretQueue;
        const turretCards = [
          { id: 'turret', unlocked: true, blurb: 'Build automatic turrets on free map tiles to defend your base.', stats: 'HP 5k→10k · Dmg 100 · Rate 1–5/s · Range 2' },
          { id: 'laser_turret', unlocked: !!state.researchUnlocks['laser_turrets'], blurb: 'Heavy beam burst with long recharge.', stats: 'HP 8k→16k · Dmg 500 · Rate 15s→5s · Range 4' },
          { id: 'emp_turret', unlocked: !!state.researchUnlocks['emp_turrets'], blurb: 'Stuns enemy ships and drops defenses.', stats: 'HP 15k→30k · Stun 2s · Rate 60s→45s · Range 3' },
        ];
        for (const card of turretCards) {
          if (!card.unlocked) continue;
          const craft = getCraft('turrets', card.id);
          if (!craft) continue;
          const canCoins = state.coins >= craft.cost;
          const reqsMet = Object.entries(craft.reqs || {}).every(([r, n]) => (state.resources[r] || 0) >= n);
          const queued = queue.filter((t) => t === card.id).length;
          const builtCount = (state.turrets || []).filter((t) => t.type === card.id).length;
          items.push({
            key: `turret:${card.id}`,
            kind: 'turret',
            id: card.id,
            name: craft.name,
            tier: card.id === 'emp_turret' ? 3 : card.id === 'laser_turret' ? 2 : 1,
            roleLabel: 'defense',
            roleColor: '#ff8c40',
            iconHtml: '<span class="ms-icon ms-icon-fill" aria-hidden="true">shield</span>',
            statsHtml: card.stats.split(' · ').map((s) => {
              const [lab, ...rest] = s.split(' ');
              return `<span><i>${lab}</i><b>${rest.join(' ')}</b></span>`;
            }).join(''),
            blurb: card.blurb,
            cost: craft.cost,
            reqs: craft.reqs || {},
            can: canCoins && reqsMet && !queueFull,
            timer: getFirstJobForRecipe('turret', card.id),
            placeQueued: queued,
            placeOnclick: `beginPlacingTurret('${card.id}')`,
            buildOnclick: `startPlaceTurret('${card.id}')`,
            notice: queueFull ? 'QUEUE FULL' : '',
            trackKind: 'turret',
            meta: `${builtCount} built`,
            queueCount: countCraftJobs('turret', card.id),
          });
        }
      }
    } else if (activeCraftTab === 'storage' || activeCraftTab === 'power' || activeCraftTab === 'research' || activeCraftTab === 'drones') {
      const unlockedBuildings = Object.values(MODULE_DEFS).filter((module) => state.researchUnlocks[module.unlockId] && moduleTabIds[activeCraftTab].has(module.id));
      for (const moduleConfig of unlockedBuildings) {
        const moduleDef = getCraft('buildings', moduleConfig.id);
        const queued = unplacedModuleQueue.filter((t) => t === moduleConfig.id).length;
        const builtCount = (state.modules || []).filter((module) => module.type === moduleConfig.id).length;
        const canCoins = state.coins >= (moduleDef?.cost || 0);
        const reqs = moduleDef?.reqs || {};
        const canBuild = !!moduleDef && canCoins && Object.entries(reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
        const statsHtml = moduleConfig.cardStats(1).map(([label, value]) => `<span><i>${label}</i><b>${value}</b></span>`).join('');
        const iconMap = {
          storage_facility: 'warehouse',
          power_station: 'bolt',
          power_pole: 'electrical_services',
          research_lab: 'science',
          lab_tower: 'cell_tower',
          drone_lab: 'drone_2',
        };
        items.push({
          key: `building:${moduleConfig.id}`,
          kind: 'building',
          id: moduleConfig.id,
          name: moduleDef?.name || moduleConfig.name,
          tier: 1,
          roleLabel: activeCraftTab,
          roleColor: activeCraftTab === 'power' ? '#ffe066' : activeCraftTab === 'research' ? '#6fff9a' : activeCraftTab === 'drones' ? '#5af0ff' : '#ff9a4a',
          iconHtml: `<span class="ms-icon ms-icon-fill" aria-hidden="true">${iconMap[moduleConfig.id] || 'apartment'}</span>`,
          statsHtml,
          blurb: moduleDef?.desc || moduleConfig.desc || 'Placeable base module.',
          cost: moduleDef?.cost || 0,
          reqs,
          can: canBuild && !queueFull,
          timer: getFirstJobForRecipe('building', moduleConfig.id),
          placeQueued: queued,
          placeOnclick: `beginPlacingBuilding('${moduleConfig.id}')`,
          buildOnclick: `startCraftBuilding('${moduleConfig.id}')`,
          notice: queueFull ? 'QUEUE FULL' : '',
          trackKind: 'building',
          meta: `${builtCount} built`,
          queueCount: countCraftJobs('building', moduleConfig.id),
        });
      }
      if (activeCraftTab === 'drones') {
        const droneDef = getCraft('drones', 'drone');
        const droneLabsBuilt = (state.modules || []).filter((m) => m.type === DRONE_LAB_ID);
        if (droneDef && droneLabsBuilt.length > 0) {
          const totalDroneCount = (state.drones || []).length;
          const totalDroneCapacity = droneLabsBuilt.reduce((sum, m) => sum + (m.droneCapacity || 2), 0);
          const dronesFull = totalDroneCount >= totalDroneCapacity;
          const droneCraftingUnlocked = !!state.researchUnlocks['drone_crafting'];
          const droneCanCoins = state.coins >= droneDef.cost;
          const droneCanBuild = droneCraftingUnlocked && !dronesFull && droneCanCoins
            && Object.entries(droneDef.reqs || {}).every(([r, n]) => (state.resources[r] || 0) >= n);
          items.push({
            key: 'drone:drone',
            kind: 'drone',
            id: 'drone',
            name: droneDef.name || 'Drone',
            tier: 1,
            roleLabel: 'drone',
            roleColor: '#5af0ff',
            iconHtml: '<span class="ms-icon ms-icon-fill" aria-hidden="true">drone_2</span>',
            statsHtml: `<span><i>Power</i><b>1/s</b></span><span><i>Cap</i><b>${totalDroneCount}/${totalDroneCapacity}</b></span>`,
            blurb: 'Autonomous unit deployable from a Drone Lab for salvage and recon.',
            cost: droneDef.cost,
            reqs: droneDef.reqs || {},
            can: droneCanBuild && !queueFull,
            timer: getFirstJobForRecipe('drone', 'drone'),
            placeQueued: 0,
            placeOnclick: '',
            buildOnclick: 'startCraftDrone()',
            notice: !droneCraftingUnlocked
              ? 'UNLOCK IN RESEARCH'
              : (dronesFull ? 'ALL LABS AT CAPACITY' : (queueFull ? 'QUEUE FULL' : '')),
            trackKind: 'drone',
            meta: `${totalDroneCount} active`,
            queueCount: countCraftJobs('drone', 'drone'),
          });
        }
      }
    }

    // Preserve / auto-select
    if (!_craftSelected || !items.some((it) => it.kind === _craftSelected.kind && it.id === _craftSelected.id)) {
      _craftSelected = items[0] ? { kind: items[0].kind, id: items[0].id } : null;
    }
    const selected = items.find((it) => _craftSelected && it.kind === _craftSelected.kind && it.id === _craftSelected.id) || null;

    const railHtml = craftTabDefs.map((t) => {
      const isQueue = t.id === 'queue';
      const disabled = isQueue && !hasQueue;
      const active = activeCraftTab === t.id;
      return `
      <button type="button" id="craft-tab-${t.id}" class="cf-rail-btn${active ? ' active' : ''}${isQueue ? ' cf-rail-queue' : ''}${disabled ? ' disabled' : ''}"
        ${disabled ? 'disabled' : ''} onclick="setCraftTab('${t.id}')" ${disabled ? 'data-tippy-content="No active crafts"' : ''}>
        <span class="ms-icon" aria-hidden="true">${t.icon}</span>
        <span>${t.label}</span>
        ${isQueue && hasQueue ? `<span class="cf-rail-count">${activeJobs.length}</span>` : ''}
        ${tabHasPlaceable[t.id] ? '<span class="cf-rail-dot" title="Ready to place"></span>' : ''}
      </button>`;
    }).join('');

    const queueIconFor = (job) => {
      if (job.kind === 'ship') return 'rocket';
      if (job.kind === 'turret') return 'shield';
      if (job.kind === 'drone') return 'drone_2';
      if (job.kind === 'building') {
        const mid = job.recipeId || '';
        if (mid.includes('power')) return 'bolt';
        if (mid.includes('research') || mid.includes('lab')) return 'science';
        if (mid.includes('drone')) return 'drone_2';
        return 'warehouse';
      }
      return 'build';
    };
    const nowQ = Date.now();
    const queueJobsHtml = activeJobs.length
      ? activeJobs.map((job) => {
          const remainMs = Math.max(0, (job.endsAt || 0) - nowQ);
          const pct = Math.max(0, Math.min(100, ((job.durationMs - remainMs) / Math.max(1, job.durationMs)) * 100));
          const kindLabel = (job.kind || 'craft').toUpperCase();
          const icon = queueIconFor(job);
          return `<div class="cf-q-item" data-job="${job.jobId}">
            <div class="cf-q-ico"><span class="ms-icon ms-icon-fill" aria-hidden="true">${icon}</span></div>
            <div class="cf-q-body">
              <div class="cf-q-top">
                <span class="cf-q-kind">${kindLabel}</span>
                <span class="cf-q-time" id="cq-label-${job.jobId}">${Math.ceil(remainMs / 1000)}s</span>
              </div>
              <div class="cf-q-name">${job.name || job.recipeId}</div>
              <div class="cf-q-bar"><div class="cf-q-fill" id="cq-fill-${job.jobId}" style="width:${pct}%"></div></div>
            </div>
          </div>`;
        }).join('')
      : `<div class="cf-q-empty">No active crafts.<br>Queue slots scale with base rank.</div>`;

    // Queue tab — full main pane
    if (activeCraftTab === 'queue') {
      body.innerHTML = `
        <div class="cf-layout cf-layout-queue">
          <nav class="cf-rail">${railHtml}</nav>
          <section class="cf-queue-pane">
            <div class="cf-q-head">
              <div class="cf-q-title">CRAFT QUEUE</div>
              <div class="cf-q-slots" id="cf-queue-slots">${getCraftQueueSlotsLabel()}</div>
            </div>
            <div class="cf-q-list cf-q-list-wide">${queueJobsHtml}</div>
          </section>
        </div>`;
      requestAnimationFrame(() => bindTippyIn(body));
      return;
    }

    let mainTop = '';
    let listHtml = '';
    if (activeCraftTab === 'ships') {
      const roleMeta = ROLE_META[activeShipRoleTab];
      mainTop = `
        <div class="cf-main-row">
          <div class="cf-main-title" style="color:${roleMeta.color};">${roleMeta.title}</div>
          <div class="cf-cap">Fleet <strong>${state.ships.length + activeShipCrafts} / ${maxShips}</strong></div>
        </div>
        <div class="cf-chips">
          ${roleOrder.map((role) => {
            const m = ROLE_META[role];
            return `<button type="button" class="cf-chip${activeShipRoleTab === role ? ' active' : ''}" style="--cf-chip:${m.color}" onclick="setCraftShipRoleTab('${role}')">
              <span class="ms-icon" aria-hidden="true">${m.icon}</span>${m.label}
            </button>`;
          }).join('')}
        </div>`;
      if (atCap) listHtml += `<div class="cf-cap-warn">Ship capacity full (${state.ships.length + activeShipCrafts}/${maxShips}). Upgrade the Base or sell a ship.</div>`;
    } else {
      const titles = { defense: 'DEFENSE SYSTEMS', storage: 'STORAGE MODULES', power: 'POWER GRID', research: 'LAB NETWORK', drones: 'DRONE OPS' };
      const colors = { defense: '#ff8c40', storage: '#ff9a4a', power: '#ffe066', research: '#6fff9a', drones: '#5af0ff' };
      mainTop = `<div class="cf-main-row"><div class="cf-main-title" style="color:${colors[activeCraftTab] || '#4ab0ff'};">${titles[activeCraftTab] || activeCraftTab.toUpperCase()}</div></div>`;
    }

    if (!items.length) {
      const emptyMsg = activeCraftTab === 'ships'
        ? 'No ships available at current base tier.'
        : activeCraftTab === 'defense'
          ? 'No defense systems unlocked yet. Visit Research to unlock turrets.'
          : `${activeCraftTab.charAt(0).toUpperCase() + activeCraftTab.slice(1)} fabrication is locked. Unlock modules in Research first.`;
      listHtml += `<div class="cf-empty">${emptyMsg}</div>`;
    } else {
      listHtml += items.map((it) => {
        const selectedCls = selected && selected.key === it.key ? ' selected' : '';
        return `<div class="cf-card ${craftRankClass(it.tier)}${selectedCls}" style="--rank:${it.roleColor}" onclick="selectCraftItem('${it.kind}','${it.id}')">
          <div class="cf-ico">${it.iconHtml}<span class="cf-tier">${toRoman(it.tier)}</span></div>
          <div class="cf-meta">
            <div class="cf-name-line">
              <span class="cf-name">${it.name}</span>
              <span class="cf-tag">${it.roleLabel}</span>
            </div>
            <div class="cf-stats">${it.statsHtml}</div>
          </div>
          <div class="cf-side">${craftTrackBtn(it.trackKind, it.id)}</div>
        </div>`;
      }).join('');
    }

    let detailHtml = '<div class="cf-empty">Select an item to craft.</div>';
    if (selected) {
      const coinCost = Math.max(0, selected.cost || 0);
      const buildLabel = coinCost > 0 ? `BUILD - $${fmt(coinCost)}` : 'BUILD';
      detailHtml = `
        <div class="cf-hero" style="--rank:${selected.roleColor}">
          <div class="cf-portrait">
            <span class="cf-portrait-tier">TIER ${toRoman(selected.tier)}</span>
            ${selected.iconHtml}
          </div>
          <div class="cf-hero-name">${selected.name.toUpperCase()}</div>
          <div class="cf-hero-role">${selected.roleLabel.toUpperCase()}${selected.meta ? ` · ${selected.meta}` : ''}</div>
          <div class="cf-hero-blurb">${selected.blurb}</div>
        </div>
        <div class="cf-sec">◈ MATERIALS REQUIRED</div>
        ${craftMatGridHtml(selected.reqs)}
        <div class="cf-actions">
          ${craftBuildBtnHtml({
            id: selected.id,
            kind: selected.kind,
            label: buildLabel,
            can: selected.can,
            timer: selected.timer,
            placeQueued: selected.placeQueued,
            placeOnclick: selected.placeOnclick,
            buildOnclick: selected.buildOnclick,
            notice: selected.notice,
          })}
          <div class="cf-row2">
            ${(() => {
              const atMax = (state.trackedCrafts || []).length >= 3;
              const tracked = isTracked(selected.trackKind, selected.id);
              return `<button type="button" class="cf-ghost${tracked ? ' ct-tracked' : ''}" data-ct-kind="${selected.trackKind}" data-ct-id="${selected.id}" ${!tracked && atMax ? 'disabled' : ''} onclick="toggleTrackCraft('${selected.trackKind}','${selected.id}')"><span class="ms-icon${tracked ? ' ms-icon-fill' : ''}" aria-hidden="true" style="font-size:16px">bookmark</span> ${tracked ? 'UNTRACK' : 'TRACK'}</button>`;
            })()}
            <button type="button" class="cf-ghost" onclick="openHdrPanel('codex')"><span class="ms-icon" aria-hidden="true" style="font-size:16px">info</span> CODEX</button>
          </div>
        </div>`;
    }

    body.innerHTML = `
      <div class="cf-layout">
        <nav class="cf-rail">${railHtml}</nav>
        <section class="cf-main">
          <div class="cf-main-top">${mainTop}</div>
          <div class="cf-list">${listHtml}</div>
        </section>
        <aside class="cf-detail">${detailHtml}</aside>
      </div>`;

    if (activeCraftTab === 'ships' && state.tutStep === 6) { state.tutStep = 7; }
    if (state.tutStep === 7) {
      requestAnimationFrame(() => {
        const btn = document.querySelector('.hdr-modal-window[data-panel-type="craft"] .cf-build');
        if (btn?.scrollIntoView) btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
    requestAnimationFrame(() => {
      refreshTrackButtons();
      bindTippyIn(body);
    });
  }

  // ── RESEARCH ───────────────────────────────────────────────
  else if (type === 'research') {
    const rpCap = getResearchPointCap(state.base.level);
    const rpPct = Math.max(0, Math.min(100, Math.round((state.rp / Math.max(1, rpCap)) * 100)));
    const RESEARCH_ICONS = {
      health_increase: 'favorite',
      shield_increase: 'shield',
      drone_lab: 'precision_manufacturing',
      drone_crafting: 'drone_2',
      resource_synthesis: 'science',
      anti_comet: 'rocket_launch',
      solar_shield: 'wb_sunny',
      turrets: 'crisis_alert',
      armor_plating: 'security',
      resource_fabrication: 'memory',
      auto_regen: 'healing',
      unlock_bounties: 'military_tech',
      galaxy_probes: 'travel_explore',
      storage_facilities: 'warehouse',
      power_station: 'bolt',
      power_poles: 'electrical_services',
      market_influence: 'payments',
      laser_turrets: 'flare',
      research_lab: 'biotech',
      lab_tower: 'cell_tower',
      emp_turrets: 'electric_bolt',
      unique_scanner: 'radar',
      multi_demand: 'analytics',
    };
    const SHORT_DESC = {
      health_increase: 'Base max HP +8,000 each rank. Max 10.',
      shield_increase: 'Shield +5% of max HP each rank. Auto-regens. Max 10.',
      drone_lab: 'Unlock Drone Lab for salvage & recon ops.',
      drone_crafting: 'Unlock drone fabrication at Drone Labs.',
      resource_synthesis: 'Combine raw resources into compounds.',
      anti_comet: '+5% comet intercept chance each rank. Max 10.',
      solar_shield: '−8% Solar Flare losses each rank. Max 10.',
      turrets: 'Build automatic defense turrets on the map.',
      armor_plating: 'Combat ships take 10% less damage.',
      resource_fabrication: 'Craft advanced materials from multi-inputs.',
      auto_regen: 'Base repairs +5 HP/s each rank. Max 10.',
      unlock_bounties: 'Access the sector bounty board.',
      galaxy_probes: 'Deploy probes to distant systems.',
      storage_facilities: 'Place storage depots on the map.',
      power_station: 'Unlock power station modules.',
      power_poles: 'Unlock power pole grid relays.',
      market_influence: 'All sell prices permanently +10%.',
      laser_turrets: 'Unlock long-range laser turrets.',
      research_lab: 'Unlock research lab buildings.',
      lab_tower: 'Unlock lab tower network relays.',
      emp_turrets: 'Unlock EMP stun turrets.',
      unique_scanner: 'Detect unique ship signatures.',
      multi_demand: 'Up to 3 market demands each SOL.',
    };
    const nextGainFor = (id) => {
      if (id === 'health_increase') return '+8,000 HP';
      if (id === 'shield_increase') return '+5% shield';
      if (id === 'anti_comet') return '+5% intercept';
      if (id === 'solar_shield') return '+8% resist';
      if (id === 'auto_regen') return '+5 HP/s';
      return 'Next rank';
    };
    heading.textContent = 'RESEARCH';
    let treeHtml = '';
    for (const tier of RESEARCH_TREE) {
      const tierLocked = tier.minBaseLevel && state.base.level < tier.minBaseLevel;
      const tierCol = tierLocked ? '#3a5a7a' : (MINE_TIERS[tier.tier]?.color || '#4af');
      const unlockedInTier = tier.unlocks.filter((u) => {
        if (u.repeatable) return getRepeatableCount(u.id, state) > 0;
        return !!state.researchUnlocks[u.id];
      }).length;
      const tierMarks = {
        1: 'looks_one', 2: 'looks_two', 3: 'looks_3', 4: 'looks_4', 5: 'looks_5',
        6: 'looks_6', 7: 'military_tech', 8: 'workspace_premium', 9: 'diamond', 10: 'trophy',
      };
      const tierMark = tierMarks[tier.tier] || 'hexagon';
      treeHtml += `<div class="rs-tier ${tierLocked ? 'locked' : ''}" style="--tier-col:${tierCol}">
        <div class="rs-tier-head">
          <div class="rs-tier-mark" aria-hidden="true"><span class="ms-icon ms-icon-fill">${tierMark}</span></div>
          <div class="rs-tier-head-main">
            <span class="rs-tier-badge">T${toRoman(tier.tier)}</span>
            <span class="rs-tier-lab">BASE LEVEL ${tier.tier}</span>
          </div>
          ${tierLocked
            ? '<span class="rs-tier-lock"><span class="ms-icon">lock</span> Requires base upgrade</span>'
            : `<span class="rs-tier-prog">${unlockedInTier}/${tier.unlocks.length}</span>`}
        </div>
        <div class="rs-track">`;
      for (const u of tier.unlocks) {
        const isUnlocked = !!state.researchUnlocks[u.id];
        const tierReqMet = !tier.minBaseLevel || state.base.level >= tier.minBaseLevel;
        const count = getRepeatableCount(u.id, state);
        const maxCount = getRepeatableMax(u.id);
        const nextCost = u.repeatable ? (u.cost * (count + 1)) : u.cost;
        const canAfford = state.rp >= nextCost;
        const capReached = u.repeatable && count >= maxCount;
        const done = (!u.repeatable && isUnlocked) || capReached;
        const purchasable = tierReqMet && canAfford && !done && (!isUnlocked || u.repeatable);
        const icon = RESEARCH_ICONS[u.id] || 'science';
        const short = SHORT_DESC[u.id] || u.desc;
        const progPct = u.repeatable
          ? Math.round((count / Math.max(1, maxCount)) * 100)
          : (isUnlocked ? 100 : 0);
        let stateCls = 'locked';
        if (done) stateCls = 'done';
        else if (tierReqMet && (isUnlocked || u.repeatable)) stateCls = 'active';
        else if (tierReqMet) stateCls = 'available';
        const btnLabel = done
          ? (u.repeatable ? 'MAX' : 'OWNED')
          : `${nextCost} RP`;
        treeHtml += `<div class="rs-node ${stateCls}">
          <div class="rs-node-card">
            <div class="rs-node-ico"><span class="ms-icon ms-icon-fill">${icon}</span></div>
            <div class="rs-node-body">
              <div class="rs-node-top">
                <div class="rs-node-name">${u.name}</div>
                ${u.repeatable
                  ? `<span class="rs-node-rank">${count}<span>/${maxCount}</span></span>`
                  : (done ? '<span class="rs-node-owned">OWNED</span>' : '')}
              </div>
              <div class="rs-node-desc">${short}</div>
              ${u.repeatable ? `
                <div class="rs-node-bar-wrap">
                  <div class="rs-node-bar"><i style="width:${progPct}%"></i></div>
                  ${!capReached && tierReqMet ? `<span class="rs-node-next">${nextGainFor(u.id)}</span>` : ''}
                </div>` : ''}
            </div>
            <div class="rs-node-action">
              ${tierReqMet
                ? `<button type="button" class="rs-btn${purchasable ? ' go' : ''}${done ? ' done' : ''}" ${purchasable ? '' : 'disabled'} onclick="purchaseResearch('${u.id}')">${btnLabel}</button>`
                : '<span class="rs-btn locked-tag"><span class="ms-icon">lock</span></span>'}
            </div>
          </div>
        </div>`;
      }
      treeHtml += '</div></div>';
    }
    body.innerHTML = `
      <div class="rs-layout">
        <div class="rs-header">
          <div class="rs-header-ico"><span class="ms-icon ms-icon-fill">biotech</span></div>
          <div class="rs-header-main">
            <div class="rs-header-title">RESEARCH POINTS</div>
            <div class="rs-header-vals"><b>${state.rp}</b><span>/ ${rpCap}</span></div>
            <div class="rs-header-bar"><i style="width:${rpPct}%"></i></div>
          </div>
          <div class="rs-header-meta">+1 RP / SOL</div>
        </div>
        <div class="rs-tree">${treeHtml}</div>
      </div>`;
    requestAnimationFrame(() => bindTippyIn(body));
  }

  // ── MARKET ─────────────────────────────────────────────────
  else if (type === 'market') {
    heading.textContent = 'TRADE';
    const demandMap = new Map();
    if (state.marketBoost?.type) demandMap.set(state.marketBoost.type, state.marketBoost.multiplier ?? 1.5);
    for (const d of (state.extraDemands || [])) demandMap.set(d.type, d.multiplier ?? 1.5);
    const sellable = Object.entries(RESOURCE_DEFS).filter(([key, def]) => {
      if (!isStorableResource(key) || def.special) return false;
      if ((def.sellPrice || 0) <= 0) return false;
      return (state.resources[key] || 0) > 0;
    });
    // Highest mine tier first, then name
    sellable.sort((a, b) => {
      const tierA = getResourceTier(a[0]) || 0;
      const tierB = getResourceTier(b[0]) || 0;
      if (tierA !== tierB) return tierB - tierA;
      return (a[1].label || a[0]).localeCompare(b[1].label || b[0]);
    });
    let tradeHtml = '';
    if (demandMap.size) {
      const demandCells = Array.from(demandMap.entries()).map(([type, mult]) => {
        const def = RESOURCE_DEFS[type];
        if (!def || def.special || (def.sellPrice || 0) <= 0) return '';
        const extraPct = Math.max(0, Math.round(((mult ?? 1.5) - 1) * 100));
        const col = def?.color || '#4ab0ff';
        return `<div class="trade-demand-chip" style="--demand-col:${col}">
          <span class="trade-demand-chip-glow" aria-hidden="true"></span>
          <span class="trade-demand-chip-ico">${resourceIconHtml(type, 22)}</span>
          <span class="trade-demand-chip-meta">
            <span class="trade-demand-chip-name">${def?.label || type}</span>
            <span class="trade-demand-chip-tag">HOT MARKET</span>
          </span>
          <span class="trade-demand-chip-mult">+${extraPct}%<small> EXTRA</small></span>
        </div>`;
      }).filter(Boolean).join('');
      if (demandCells) {
        tradeHtml += `<div class="trade-demand-card">
          <div class="trade-demand-head">
            <span class="trade-demand-kicker">◈ MARKET PULSE</span>
            <span class="trade-demand-title">SOL ${state.sol} · DEMAND</span>
            <span class="trade-demand-sub">${demandMap.size > 1 ? `${demandMap.size} resources boosted this SOL` : 'Premium buy orders active this SOL'}</span>
          </div>
          <div class="trade-demand-row">${demandCells}</div>
        </div>`;
      }
    }
    if (!sellable.length) {
      tradeHtml += `<div class="trade-empty">⏳ No resources to sell yet.</div>`;
    } else {
      const defaultSellQty = (amt) => {
        if (amt >= 10000) return 1000;
        if (amt >= 1000) return 100;
        if (amt >= 100) return 10;
        return 1;
      };
      tradeHtml += '<div class="sell-grid">';
      for (const [resType, def] of sellable) {
        const amt = state.resources[resType] || 0;
        const sellAmt = defaultSellQty(amt);
        const price = getSellPrice(resType);
        const earnedAll = amt * price;
        const demanded = isDemandedType(resType);
        const demandPct = getDemandBonusPct(resType);
        const variancePct = getMarketVariancePct(resType);
        let tone = 'flat';
        if (demanded) tone = 'demand';
        else if (variancePct > 0) tone = 'up';
        else if (variancePct < 0) tone = 'down';
        let arrow = '';
        let priceTip = '';
        if (demanded) {
          priceTip = `Demand +${demandPct}% extra` + (variancePct ? ` · variance +${variancePct}%` : '');
          arrow = '';
        } else if (variancePct > 0) {
          arrow = `<span class="sell-card-arrow up" title="Price up ${variancePct}% this SOL">▲</span>`;
          priceTip = `+${variancePct}% vs base this SOL`;
        } else if (variancePct < 0) {
          arrow = `<span class="sell-card-arrow down" title="Price down ${Math.abs(variancePct)}% this SOL">▼</span>`;
          priceTip = `${variancePct}% vs base this SOL`;
        }
        tradeHtml += `<div class="sell-card tone-${tone}">
          <div class="sell-card-top">
            <div class="sell-card-ico">${resourceIconHtml(resType, 20)}</div>
            <div class="sell-card-id">
              <div class="sell-card-name" title="${fmt(amt)} ${def.label}"><span class="sell-stock">${fmt(amt)}</span> ${def.label}</div>
            </div>
            <div class="sell-card-price">
              <span class="sell-card-unit" ${priceTip ? `title="${priceTip}"` : ''}>$${fmt(price)}${arrow}${demanded ? ' <span class="sell-card-star">✦</span>' : ''}</span>
            </div>
          </div>
          <div class="sell-card-actions">
            <input id="sell-qty-${resType}" type="number" min="1" max="${amt}" step="1" value="${sellAmt}" class="sell-qty-input" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" title="Quantity">
            <button class="sell-btn-s" type="button" onmousedown="const _inp=document.getElementById('sell-qty-${resType}');const _raw=Math.floor(Number(_inp?.value||0));const _qty=Math.max(1,Math.min(${amt},Number.isFinite(_raw)?_raw:1));if(_inp)_inp.value=_qty;sellResource('${resType}',_qty);openHdrPanel('market',{refresh:true,preserveScroll:true})">SELL</button>
            <button class="sell-btn-s sell-btn-all" type="button" title="Sell all · $${fmt(earnedAll)}" onmousedown="sellResource('${resType}',${amt});openHdrPanel('market',{refresh:true,preserveScroll:true})"><span>ALL</span><span class="trade-sell-earned">$${fmt(earnedAll)}</span></button>
          </div>
        </div>`;
      }
      tradeHtml += '</div>';
    }
    body.innerHTML = `
      <div class="trade-section-title">◈ SELL RESOURCES</div>
      ${tradeHtml}`;
  }

  // ── FLEET MANIFEST ─────────────────────────────────────────
  else if (type === 'fleet') {
    heading.textContent = 'FLEET MANIFEST';
    const roleCounts = getFleetRoleCounts();
    const ROLE_TABS = [
      { id: 'all', label: 'ALL', icon: 'groups', count: state.ships.length },
      { id: 'mining', label: 'MINING', icon: 'hardware', count: roleCounts.mining },
      { id: 'transport', label: 'CARGO', icon: 'inventory_2', count: roleCounts.transport },
      { id: 'combat', label: 'COMBAT', icon: 'swords', count: roleCounts.combat },
      { id: 'garrison', label: 'GARRISON', icon: 'fort', count: roleCounts.garrison },
    ];
    const roleLabels = { mining: 'Mining', transport: 'Cargo', combat: 'Combat', garrison: 'Garrison', unique: 'Unique' };
    const fmtSell = v => v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v/1e3).toFixed(0)}K` : `$${v}`;
    const filtered = getSortedFleetShips();
    const rows = filtered.map(s => {
      const typeName = getShipTypeName(s);
      const status = getShipStatusLabel(s);
      const role = (SHIP_DEFS[s.type]?.role || 'mining');
      const totalLevel = (s.capacityLevel || 0) + (s.flySpeedLevel || 0) + (s.mineSpeedLevel || 0) + (s.mineBonusLevel || 0);
      const sellVal = getShipSellValue(s);
      const depotLabel = getShipDepotLabel(s);
      return `<tr data-ship-id="${s.id}">
        <td class="ships-lv">${totalLevel}</td>
        <td class="ships-nowrap">${s.name}</td>
        <td class="ships-nowrap">${typeName}</td>
        <td class="ships-role ships-nowrap">${roleLabels[role] || role}</td>
        <td data-cell="tier">${shipTierPill(s)}</td>
        <td data-cell="node" class="ships-nowrap">${getShipNodeLabel(s)}</td>
        <td data-cell="depot" class="ships-nowrap">${depotLabel}</td>
        <td data-cell="status" class="ships-nowrap">${status}</td>
        <td data-cell="cargo" class="ships-cargo ships-nowrap">${s.cargo}/${s.capacity}</td>
        <td class="ships-sell ships-nowrap">${fmtSell(sellVal)}</td>
      </tr>`;
    }).join('');
    const tabBar = ROLE_TABS.map((t) => `
      <button type="button" class="mod-tab sm-tab${_fleetRoleTab === t.id ? ' on' : ''}" onclick="setFleetRoleTab('${t.id}')">
        <span class="ms-icon">${t.icon}</span> ${t.label}
        <span class="fleet-tab-count">${t.count}</span>
      </button>`).join('');
    body.innerHTML = `
      <div class="fleet-layout">
        <div class="mod-tabs sm-tabs ov-tabs fleet-role-tabs">${tabBar}</div>
        ${filtered.length
          ? `<table class="fleet-table ships-table-fixed">
        <colgroup>
          <col style="width:5%;">
          <col style="width:17%;">
          <col style="width:14%;">
          <col style="width:9%;">
          <col style="width:7%;">
          <col style="width:14%;">
          <col style="width:12%;">
          <col style="width:10%;">
          <col style="width:9%;">
          <col style="width:10%;">
        </colgroup>
        <thead><tr>${fleetHeaderCell('LV', 'level')}${fleetHeaderCell('NAME', 'name')}${fleetHeaderCell('TYPE', 'type')}${fleetHeaderCell('ROLE', 'role')}${fleetHeaderCell('TIER', 'tier')}${fleetHeaderCell('NODE', 'node')}${fleetHeaderCell('DROP OFF', 'depot')}${fleetHeaderCell('STATUS', 'status')}${fleetHeaderCell('CARGO', 'cargo')}${fleetHeaderCell('SELL', 'sell')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : `<div class="ships-empty">No ${_fleetRoleTab === 'all' ? '' : (ROLE_TABS.find((t) => t.id === _fleetRoleTab)?.label.toLowerCase() + ' ')}ships in fleet.</div>`}
      </div>`;
  }

  // ── RESOURCES ──────────────────────────────────────────────
  else if (type === 'resources') {
    heading.textContent = 'RESOURCES';
    body.innerHTML = buildStatsHtml();
    requestAnimationFrame(() => bindTippyIn(body));
  }

  // ── CODEX ──────────────────────────────────────────────────
  else if (type === 'codex') {
    heading.textContent = 'CODEX';
    const codexTabs = [
      { id: 'crew',     label: 'Crew & Contacts' },
      { id: 'events',   label: 'Events' },
      { id: 'discoveries', label: 'Discoveries' },
      { id: 'resources',label: 'Resources' },
      { id: 'materials',label: 'Advanced Materials' },
      { id: 'ships',    label: 'Ships' },
      { id: 'turrets',  label: 'Turrets' },
      { id: 'storage',  label: 'Storage' },
      { id: 'research', label: 'Research' },
      { id: 'upgrades', label: 'Base Upgrades' },
      { id: 'sector',   label: 'Sector' },
      { id: 'trade',    label: 'Trade' },
    ];
    const tabBar = `<div class="codex-nav">
      ${codexTabs.map(tab => `<button onclick="event.stopPropagation();switchCodexTab('${tab.id}')" class="codex-nav-btn${_codexTab===tab.id?' active':''}">${tab.label}</button>`).join('')}
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

    } else if (_codexTab === 'discoveries') {
      const crashedShipDef = RESOURCE_DEFS[CRASHED_SHIP_NODE_TYPE];
      const discovered = state.nodes.some((node) => node.type === CRASHED_SHIP_NODE_TYPE);
      tabContent = `<div class="codex-group-label codex-section-title">◈ BELT DISCOVERIES</div>
        <div class="codex-card" style="align-items:flex-start;gap:14px;${discovered ? '' : 'opacity:0.6;'}">
          <img src="assets/images/crashed_ships/crashed_ship_1.png" alt="Crashed Ship" style="width:84px;height:84px;object-fit:contain;image-rendering:auto;filter:drop-shadow(0 0 10px rgba(180,200,255,0.15));">
          <div class="codex-info">
            <div class="codex-name">${crashedShipDef.label}</div>
            <div class="codex-title">${discovered ? 'RECORDED ANOMALY' : 'UNCONFIRMED SIGNAL'}</div>
            <div class="codex-bio">${discovered ? crashedShipDef.blurb : 'A fragmented contact is rumored to drift somewhere in the sector. Locate it to add it to your navigational records.'}</div>
          </div>
        </div>`;

    } else if (_codexTab === 'resources') {
      const resourceTier = {};
      const boostMap = new Map();
      if (state.marketBoost?.type) boostMap.set(state.marketBoost.type, state.marketBoost.multiplier ?? 1.5);
      for (const d of (state.extraDemands || [])) boostMap.set(d.type, d.multiplier ?? 1.5);
      for (const [tier, def] of Object.entries(MINE_TIERS)) {
        for (const r of def.resources) {
          if (!resourceTier[r]) resourceTier[r] = { tier: Number(tier), label: def.label, color: def.color };
        }
      }
      tabContent = Object.entries(RESOURCE_DEFS).filter(([, def]) => !def.special).map(([key, def]) => {
        const tierInfo = resourceTier[key] || { label: def.special ? 'SPECIAL' : 'UNKNOWN', color: def.color || '#8ab' };
        const abundanceHint = getResourceAbundanceHint(key);
        const abundanceColor = abundanceHint === 'Abundant' ? '#78d69c' : abundanceHint === 'Uncommon' ? '#ffd36b' : '#ff8c8c';
        const mult = boostMap.get(key);
        const boost = Number.isFinite(mult);
        const sellDisplay = boost ? `<span style="color:#ffe066;">$${Math.round(def.sellPrice * mult)} ★ BOOSTED</span>` : `<span class="codex-resources-sell">$${def.sellPrice}</span>`;
        const powerOutput = getPowerFuelOutput(key);
        const powerDisplay = POWER_DISABLED_RESOURCES.has(key) || powerOutput <= 0
          ? `<span class="codex-resources-stat-value" style="color:#4a6a8a;">Not usable</span>`
          : `<span class="codex-resources-stat-value" style="color:#ffe066;">${POWER_RESOURCE_CONSUMPTION} ${def.label} = ${powerOutput}/s</span>`;
        return `<div class="codex-resources-card" style="border-left: 5px solid ${def.color};">
          <div class="codex-resources-header">
            <div class="codex-resources-icon-wrap">${resourceIconHtml(key, 64)}</div>
            <div class="codex-resources-copy">
              <div class="codex-resources-title-row">
                <div class="codex-resources-name">${def.label}</div>
                <span class="codex-resources-tier-pill" style="border:1px solid ${tierInfo.color}44;background:${tierInfo.color}18;color:${tierInfo.color};">${tierInfo.label}</span>
              </div>
              <div class="codex-resources-blurb">${def.blurb || 'Industrial resource used by frontier fleet operations.'}</div>
            </div>
          </div>
          <div class="codex-resources-stats">
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">SELL PRICE</span><br><span class="codex-resources-stat-value">${sellDisplay}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">MINE TIER</span><br><span class="codex-resources-stat-value">${tierInfo.label}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">FOUND IN BELT</span><br><span class="codex-resources-stat-value" style="color:${abundanceColor};">${abundanceHint}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">POWER OUTPUT</span><br>${powerDisplay}</div>
          </div>
        </div>`;
      }).join('');

    } else if (_codexTab === 'materials') {
      const rarityColor = {
        common: '#8ab',
        uncommon: '#6fff9a',
        rare: '#6ad4ff',
        epic: '#c98cff',
        legendary: '#ffe066',
      };
      const advancedCards = SYNTHESIS_RECIPES.map((recipe) => {
        const rColor = rarityColor[recipe.rarity] || '#8ab';
        const craft = SYNTHESIS_CRAFT_TIMES[recipe.rarity] || SYNTHESIS_CRAFT_TIMES.common;
        const craftLabel = `${craft.base}s → ${craft.min}s`;
        const inputsHtml = recipe.inputs.map((input) => {
          const def = RESOURCE_DEFS[input.id];
          const label = def?.label || input.id;
          const color = def?.color || '#cde';
          return `<span class="codex-adv-input" style="color:${color};">${resourceIconHtml(input.id, 14)}<span>${label}</span><span class="codex-adv-amt">${fmtCompact(input.amount)}</span></span>`;
        }).join('');
        return `<div class="codex-resources-card codex-adv-card" style="border-left: 5px solid ${recipe.color};">
          <div class="codex-resources-header">
            <div class="codex-resources-icon-wrap">${resourceIconHtml(recipe.icon || recipe.id, 64)}</div>
            <div class="codex-resources-copy">
              <div class="codex-resources-title-row">
                <div class="codex-resources-name" style="color:${recipe.color};">${recipe.name}</div>
                <span class="codex-resources-tier-pill" style="border:1px solid ${rColor}44;background:${rColor}18;color:${rColor};">${(recipe.rarity || 'common').toUpperCase()}</span>
              </div>
              <div class="codex-resources-blurb">Synthesized in a Research Lab from linked belt resources via Lab Towers.</div>
              <div class="codex-adv-inputs">${inputsHtml}</div>
            </div>
          </div>
          <div class="codex-resources-stats">
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">SOURCE</span><br><span class="codex-resources-stat-value">Research Lab</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">RARITY</span><br><span class="codex-resources-stat-value" style="color:${rColor};">${(recipe.rarity || 'common').toUpperCase()}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">CRAFT TIME</span><br><span class="codex-resources-stat-value">${craftLabel}</span></div>
            <div class="codex-resources-divider"></div>
            <div class="codex-resources-stat"><span class="codex-resources-stat-label">INPUTS</span><br><span class="codex-resources-stat-value">${recipe.inputs.length} resources</span></div>
          </div>
        </div>`;
      }).join('');

      tabContent = `
        <div class="codex-group-label codex-section-title">◈ ADVANCED MATERIALS</div>
        <div class="codex-info-card" style="margin-bottom:10px;">
          <div class="codex-info-body">Composite materials produced at a <strong style="color:#6fff9a;">Research Lab</strong> when ingredient nodes are linked through <strong style="color:#6fff9a;">Lab Towers</strong>. Craft time scales down as the lab tiers up.</div>
        </div>
        ${advancedCards}
      `;

    } else if (_codexTab === 'ships') {
      const UNIQUE_NAMES = {
        sentinel:  { name: 'Sentinel',       desc: 'Alien AI hunter — recovered from deep space wreckage' },
        serenity:  { name: 'Serenity',       desc: 'Firefly-class transport — "You can\'t take the sky from me"' },
        normandy:  { name: 'Normandy SR-2',  desc: 'Stealth frigate — fastest vessel ever commissioned' },
        ebon_hawk: { name: 'Ebon Hawk',      desc: 'Legendary smuggler vessel from a galaxy far, far away' },
      };

      // Helper: wraps a base value + optional MAX annotation in green
      const withMax = (base, maxVal) => {
        if (maxVal === null || maxVal === undefined) return String(base);
        return `${base} <span class="codex-ships-max">(${maxVal})</span>`;
      };

      const ROLE_GROUPS = [
        {
          role: 'mining', label: '⛏  MINING SHIPS', color: '#60d090',
          cols: ['SHIP','TIER','CARGO','FLY SPD','MINE SPD'],
          row: (id, s) => [
            withMax(s.capacity, profileMax(CARGO_PROFILE, id)),
            withMax(formatFlySpeed(s.flySpeed), profileMax(FLY_SPEED_PROFILE, id) !== null ? formatFlySpeed(profileMax(FLY_SPEED_PROFILE, id)) : null),
            withMax(formatMineSpeedPercent(s.mineSpeed), profileMax(MINE_SPEED_PROFILE, id) !== null ? `${Math.round(profileMax(MINE_SPEED_PROFILE, id)*10)}%` : null),
          ],
        },
        {
          role: 'transport', label: '▲  CARGO TRANSPORT', color: '#80d0ff',
          cols: ['SHIP','TIER','CARGO','FLY SPD','LOAD SPD'],
          row: (id, s) => [
            withMax(s.capacity, profileMax(CARGO_PROFILE, id)),
            withMax(formatFlySpeed(s.flySpeed), profileMax(FLY_SPEED_PROFILE, id) !== null ? formatFlySpeed(profileMax(FLY_SPEED_PROFILE, id)) : null),
            withMax(formatLoadSpeed(s.loadSpeed || 0), profileMax(LOAD_SPEED_PROFILE, id) !== null ? formatLoadSpeed(profileMax(LOAD_SPEED_PROFILE, id)) : null),
          ],
        },
        {
          role: 'combat', label: '⚔  COMBAT SHIPS', color: '#ff6060',
          cols: ['SHIP','TIER','HP','ATTACK','ATK RATE','RANGE'],
          row: (id, s) => [
            withMax((s.hp||0).toLocaleString(), profileMax(HP_PROFILE, id) !== null ? profileMax(HP_PROFILE, id).toLocaleString() : null),
            withMax(s.attack||0, profileMax(ATTACK_PROFILE, id)),
            withMax(formatAtkRatePercent(s.attackSpeed||0), profileMax(ATK_RATE_PROFILE, id) !== null ? `${Math.round(profileMax(ATK_RATE_PROFILE, id)*100)}%` : null),
            '155 (shared)',
          ],
        },
        {
          role: 'garrison', label: '🛡  GARRISON', color: '#ff8c40',
          cols: ['SHIP','TIER','HP','ATTACK','ATK RATE','RANGE'],
          row: (id, s) => [
            withMax((s.hp||0).toLocaleString(), profileMax(HP_PROFILE, id) !== null ? profileMax(HP_PROFILE, id).toLocaleString() : null),
            withMax(s.attack||0, profileMax(ATTACK_PROFILE, id)),
            withMax(formatAtkRatePercent(s.attackSpeed||0), profileMax(ATK_RATE_PROFILE, id) !== null ? `${Math.round(profileMax(ATK_RATE_PROFILE, id)*100)}%` : null),
            withMax(formatWeaponRangeTiles(s.range||0), profileMax(RANGE_PROFILE, id) !== null ? formatWeaponRangeTiles(profileMax(RANGE_PROFILE, id)) : null),
          ],
        },
        {
          role: 'unique', label: '★  UNIQUE SHIPS', color: '#ffffff',
          cols: ['SHIP','TIER','HP','CARGO','FLY SPD','ATTACK'],
          row: (id, s) => [
            (s.hp||0).toLocaleString(),
            s.capacity,
            formatFlySpeed(s.flySpeed),
            s.attack||'—',
          ],
        },
      ];

      tabContent = `<div class="codex-group-label codex-section-title">◈ SHIP CATALOG</div>` + ROLE_GROUPS.map(group => {
        const ships = Object.entries(SHIP_DEFS).filter(([,s]) => (s.role||'mining') === group.role);
        if (!ships.length) return '';

        const rows = ships.map(([shipId, stats]) => {
          const recipe    = CRAFT_RECIPES.find(r => r.id === shipId);
          const info      = UNIQUE_NAMES[shipId];
          const shipName  = recipe?.name || info?.name || shipId;
          const shipDesc  = recipe?.desc || info?.desc || '';
          const tierColor = MINE_TIERS[stats.mineTier]?.color || '#8ab';
          const cells     = group.row(shipId, stats);
          return `<tr>
            <td class="codex-ships-td">
              <div class="codex-ships-name"><span class="ms-icon ms-icon-sm codex-ships-name-arrow" style="color:${group.color};" aria-hidden="true">rocket</span>${shipName}</div>
              ${shipDesc ? `<div class="codex-ships-desc">${shipDesc}</div>` : ''}
            </td>
            <td class="codex-ships-td">
              <span class="codex-ships-tier-pill" style="border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};">${toRoman(stats.mineTier)}</span>
            </td>
            ${cells.map(c => `<td class="codex-ships-td codex-ships-td-stat">${c}</td>`).join('')}
          </tr>`;
        }).join('');

        const extraCols = group.cols.length - 2;
        const colW = `${Math.floor(56 / extraCols)}%`;
        return `<div class="codex-ships-group-header" style="color:${group.color};border-bottom:1px solid ${group.color}33;">${group.label}</div>
          <table class="codex-ships-table">
            <colgroup>
              <col class="col-ship"><col class="col-tier">
              ${group.cols.slice(2).map(() => `<col style="width:${colW};">`).join('')}
            </colgroup>
            <thead><tr>
              <th class="codex-ships-th" style="color:${group.color};">SHIP</th>
              <th class="codex-ships-th" style="color:${group.color};">TIER</th>
              ${group.cols.slice(2).map(c => `<th class="codex-ships-th" style="color:${group.color};">${c}</th>`).join('')}
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }).join('');
    } else if (_codexTab === 'turrets') {
      const turretDefs = [
        { id: 'turret', name: 'Automatic Turret', tier: 'Tier III', color: '#4a90e2', stats: [{ label: 'HEALTH', value: '5,000 -> 10,000 HP' }, { label: 'DAMAGE', value: '100 (+25/rank)' }, { label: 'FIRE RATE', value: '1/s (rank10: 5/s)' }, { label: 'RANGE', value: '2 tiles (MAX 5)' }], desc: 'Baseline autonomous defense platform. Tracks and fires automatically at hostile ships entering range.' },
        { id: 'laser_turret', name: 'Laser Turret', tier: 'Tier V', color: '#ffd700', stats: [{ label: 'HEALTH', value: '8,000 -> 16,000 HP' }, { label: 'DAMAGE', value: '500 (+40/rank)' }, { label: 'FIRE RATE', value: '15s (rank10: 5s)' }, { label: 'RANGE', value: '4 tiles (MAX 12)' }], desc: 'Fires a single high-damage beam burst, then enters a long recharge cycle before it can fire again.' },
        { id: 'emp_turret', name: 'EMP Turret', tier: 'Tier VII', color: '#ff60b0', stats: [{ label: 'HEALTH', value: '15,000 -> 30,000 HP' }, { label: 'DAMAGE', value: 'STUN 2s (rank10: 8s)' }, { label: 'FIRE RATE', value: '60s (rank10: 45s)' }, { label: 'RANGE', value: '3 tiles (MAX 15)' }, { label: 'POWER DRIVE', value: '200 (rank10: 800)' }], desc: 'Control platform that disables ship movement and firing while also dropping active defenses.' },
      ];
      const formatTurretStatValue = (value) => String(value)
        .replace(/\((\+[^)]*\/rank)\)/gi, '<span class="codex-turret-inc">($1)</span>')
        .replace(/\((rank10:[^)]+)\)/gi, '<span class="codex-turret-inc">($1)</span>')
        .replace(/\((MAX\s*\d+)\)/gi, '<br><span class="codex-turret-inc">($1)</span>');
      const turretRows = turretDefs.map(t => {
        return `<tr>
          <td class="codex-ships-td">
            <div class="codex-ships-name"><span class="ms-icon ms-icon-sm codex-ships-name-arrow" style="color:${t.color};" aria-hidden="true">shield</span>${t.name}</div>
            <div class="codex-ships-desc">${t.desc}</div>
          </td>
          <td class="codex-ships-td"><span class="codex-ships-tier-pill" style="border:1px solid ${t.color}44;background:${t.color}18;color:${t.color};">${t.tier.replace('Tier ', '')}</span></td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[0].value)}</td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[1].value)}</td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[2].value)}</td>
          <td class="codex-ships-td codex-ships-td-stat">${formatTurretStatValue(t.stats[3].value)}</td>
        </tr>`;
      }).join('');

      tabContent = `<div class="codex-group-label codex-section-title">◈ DEFENSE TURRETS</div>
        <table class="codex-ships-table">
          <colgroup>
            <col class="col-ship">
            <col class="col-tier">
            <col style="width:14%;">
            <col style="width:14%;">
            <col style="width:14%;">
            <col style="width:14%;">
          </colgroup>
          <thead><tr>
            <th class="codex-ships-th" style="color:#4af;">TURRET</th>
            <th class="codex-ships-th" style="color:#4af;">TIER</th>
            <th class="codex-ships-th" style="color:#4af;">HEALTH</th>
            <th class="codex-ships-th" style="color:#4af;">DAMAGE</th>
            <th class="codex-ships-th" style="color:#4af;">FIRE RATE</th>
            <th class="codex-ships-th" style="color:#4af;">RANGE</th>
          </tr></thead>
          <tbody>${turretRows}</tbody>
        </table>`;
    } else if (_codexTab === 'storage') {
      const baseStorageStats = getModuleStats(STORAGE_FACILITY_ID, 1);
      tabContent = `
        <div class="codex-group-label codex-section-title">◈ STORAGE FACILITIES</div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">INDEPENDENT DEPOTS</div>
          <div class="codex-info-body">
            Storage Facilities are <strong style="color:#cde;">3x3 depot modules</strong> that ships can unload into instead of the Base Station.
            Cargo stored here is tracked in a <strong style="color:#cde;">separate inventory</strong> and does not automatically add to your global resource totals.
          </div>
        </div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">BASELINE STATS</div>
          <div class="codex-info-body">
            Health: <strong style="color:#ffe066;">${fmt(baseStorageStats.maxHealth)}</strong><br>
            Storage Capacity: <strong style="color:#ffe066;">${fmt(baseStorageStats.storageCapacity)}</strong><br>
            Power Capacity: <strong style="color:#ffe066;">${fmt(baseStorageStats.powerCapacity)}</strong><br>
            Power Usage: <strong style="color:#ffe066;">1/s to 10/s</strong> depending on how full the facility is.
          </div>
        </div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">POWER LOAD</div>
          <div class="codex-info-body">
            Storage power draw is dynamic. At <strong style="color:#cde;">0% usage</strong>, the facility drains <strong style="color:#ffe066;">1 power per second</strong>.
            At <strong style="color:#cde;">100% storage used</strong>, it drains <strong style="color:#ffe066;">10 power per second</strong>.
            As stored cargo rises, the power draw scales linearly between those values.
          </div>
        </div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">OFFLINE STATE</div>
          <div class="codex-info-body">
            If a facility loses all power or is fully destroyed, ships assigned to it cannot unload and will enter a <strong style="color:#cde;">holding pattern</strong> nearby until the depot becomes available again.
          </div>
        </div>`;
    } else if (_codexTab === 'upgrades') {
      const rpCapTable = Array.from({ length: 10 }, (_, i) => getResearchPointCap(i + 1));
      const rpCapRows = rpCapTable.map((cap, i) =>
        `<tr>
          <td class="codex-ships-td" style="color:${MINE_TIERS[i+1]?.color||'#8ab'};">Tier ${i+1}</td>
          <td class="codex-ships-td codex-ships-td-stat">${cap} RP</td>
        </tr>`
      ).join('');
      tabContent = `<div class="codex-group-label codex-section-title">◈ BASE UPGRADE COSTS</div>
        <table style="width:100%;border-collapse:collapse;background:rgba(10,20,50,0.4);border:1px solid #1a3a6e;border-radius:4px;overflow:hidden;">
          <thead>
            <tr>
              <th style="text-align:left;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">TIER</th>
              <th style="text-align:right;padding:6px 8px;color:#4af;font-size:11px;letter-spacing:1.5px;border-bottom:1px solid #1a3a6e;">COST</th>
            </tr>
          </thead>
          <tbody>
            ${BASE_UPGRADE_COSTS.map((cost, idx) => idx === 0 ? '' : `<tr>
              <td style="padding:6px 8px;color:#8ab;border-bottom:1px solid rgba(26,58,110,0.4);">Tier ${idx} → Tier ${idx + 1}</td>
              <td style="padding:6px 8px;text-align:right;color:#ffe066;font-weight:bold;border-bottom:1px solid rgba(26,58,110,0.4);">$${fmt(cost)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="codex-group-label codex-section-title">◈ RESEARCH POINT CAP PER BASE TIER</div>
        <div style="font-size:13px;color:#6a8aaa;margin-bottom:10px;">You earn +1 Research Point per SOL. The cap increases as your base tier advances.</div>
        <table class="codex-ships-table">
          <thead><tr>
            <th class="codex-ships-th" style="color:#4af;">BASE TIER</th>
            <th class="codex-ships-th" style="color:#4af;">MAX RP</th>
          </tr></thead>
          <tbody>${rpCapRows}</tbody>
        </table>`;
    } else {
      // Events tab
      const eventDefs = [
        {
          id: 'solar_flare', label: 'Solar Flare',
          desc: 'An electromagnetic surge that destroys a percentage of exposed resource stockpiles. Oxygen is shielded.',
          effect: 'Destroys a portion of your resource stockpile — Oxygen is immune. The higher the SOL, the greater the loss.',
        },
        {
          id: 'comet', label: 'Comet Impact',
          desc: 'A comet strikes the base station, dealing structural damage that scales with SOL number. Repair via the Base Station.',
          effect: 'Deals direct damage to your base HP. Damage scales with SOL progression — repair from the Tower panel.',
        },
        {
          id: 'black_hole', label: 'Black Hole',
          desc: 'A temporary spatial anomaly forms somewhere in the sector, slowing ships that cross through its field until it collapses.',
          effect: 'Lasts about 60 seconds. Ships whose route crosses the anomaly are slowed to 20% speed while it is active.',
        },
        {
          id: 'pirate_raid', label: 'Pirate Raid',
          desc: 'Hostile craft enter the sector and attack your buildings. Combat ships and powered turrets auto-engage.',
          effect: 'Pirate Status climbs each SOL and with expansion. At 100%, a raid hits. Threat Level (ships, turrets, buildings, kills) speeds aggression and HQ cost.',
        },
      ];
      tabContent = eventDefs.map(ev => {
        const count = state.eventCounts[ev.id] || 0;
        const encountered = count > 0;
        return `<div style="background:rgba(10,20,50,0.5);border:1px solid ${encountered?'#2a4a7a':'#1a2a4a'};border-radius:5px;padding:12px;margin-bottom:8px;${encountered?'':'opacity:0.5;'}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <div style="display:flex;align-items:flex-start;gap:8px;">
              ${eventIconHtml(ev.id, { size: 'lg', className: 'codex-event-icon' })}
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
          <div style="font-size:14px;color:${encountered?'#7a9ab8':'#3a5a7a'};line-height:1.25;margin-bottom:${encountered?'8px':'0'};">${encountered ? ev.desc : '???'}</div>
          ${encountered ? `<div style="font-size:14px;color:#ffe066;line-height:1.35;border-top:1px solid #1a3a5a;padding-top:8px;">${ev.effect}</div>` : ''}
        </div>`;
      }).join('');
    }

    // ── RESEARCH ────────────────────────────────────────────────
    if (_codexTab === 'research') {
      const rows = RESEARCH_TREE.flatMap(tier => tier.unlocks.map(u => {
        const tierColor = MINE_TIERS[tier.tier]?.color || '#8ab';
        const maxCount = getRepeatableMax(u.id);
        const costLabel = u.repeatable ? `${u.cost} RP / level` : `${u.cost} RP`;
        const limitLabel = u.repeatable ? `MAX ${maxCount}` : 'ONE-TIME';
        return `<tr>
          <td class="codex-ships-td">
            <div class="codex-research-name"><span class="codex-research-icon">•</span>${u.name}</div>
            <div class="codex-ships-desc">${u.desc}</div>
          </td>
          <td class="codex-ships-td"><span class="codex-ships-tier-pill" style="border:1px solid ${tierColor}44;background:${tierColor}18;color:${tierColor};">${toRoman(tier.tier)}</span></td>
          <td class="codex-ships-td codex-ships-td-stat">${costLabel}</td>
          <td class="codex-ships-td codex-ships-td-stat">${limitLabel}</td>
        </tr>`;
      })).join('');

      tabContent = `<div class="codex-group-label codex-section-title">◈ RESEARCH TREE</div>
        <table class="codex-ships-table codex-research-table">
          <colgroup>
            <col style="width:56%;">
            <col style="width:10%;">
            <col style="width:17%;">
            <col style="width:17%;">
          </colgroup>
          <thead><tr>
            <th class="codex-ships-th">RESEARCH</th>
            <th class="codex-ships-th">TIER</th>
            <th class="codex-ships-th">COST</th>
            <th class="codex-ships-th">LIMIT</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

    // ── SECTOR ────────────────────────────────────────────────
    } else if (_codexTab === 'sector') {
      tabContent = `
        <div class="codex-group-label codex-section-title">◈ GALAXY: ANDROMEDA</div>
        <div class="codex-info-card">
          <div class="codex-info-card-title">THE SECTOR</div>
          <div class="codex-info-body">
            You are operating in the <strong style="color:#cde;">Andromeda Galaxy</strong>, deep within an unmapped asteroid belt designated <strong style="color:#cde;">Sector 7-G</strong>.
            Rich in raw minerals and volatile compounds, this sector was flagged by long-range probes as a high-yield extraction zone.
            Your base station was deployed here to begin resource extraction and establish a permanent frontier presence.
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ SOL — SOLAR DAY</div>
        <div class="codex-info-card">
          <div class="codex-info-body">
            One <strong style="color:#ffe066;">SOL</strong> represents a single solar day in this sector — approximately <strong style="color:#cde;">3 Earth minutes</strong> in real time.
            Each SOL triggers market demand shifts, awards Research Points, and advances your operational timeline.
            Events such as solar flares and comet impacts are tied to SOL progression — the higher your SOL count, the greater the risk.
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ FLEET POWER</div>
        <div class="codex-info-card">
          <div class="codex-info-body">
            Fleet Power is a combined rating of your operational strength. It is calculated from three sources:
          </div>
          <div class="codex-sector-list">
            <div class="codex-sector-item">
              <span class="codex-sector-key ships">SHIPS</span>
              <span class="codex-sector-val">1 point per ship rank. A rank 10 ship contributes 10 Fleet Power.</span>
            </div>
            <div class="codex-sector-item">
              <span class="codex-sector-key turrets">TURRETS</span>
              <span class="codex-sector-val">2 points per turret rank.</span>
            </div>
            <div class="codex-sector-item">
              <span class="codex-sector-key base">BASE</span>
              <span class="codex-sector-val">10 points per base rank.</span>
            </div>
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ SECTOR STATUS</div>
        <div class="codex-sector-status-grid">
          <div class="codex-info-card codex-info-card-tight">
            <div class="codex-info-card-subtitle">PIRATE STATUS</div>
            <div class="codex-info-pending">— Data unavailable —</div>
          </div>
          <div class="codex-info-card codex-info-card-tight">
            <div class="codex-info-card-subtitle">THREAT LEVEL</div>
            <div class="codex-info-pending">— Data unavailable —</div>
          </div>
        </div>`;

    // ── TRADE ────────────────────────────────────────────────
    } else if (_codexTab === 'trade') {
      tabContent = `
        <div class="codex-group-label codex-section-title">◈ MARKET DEMAND</div>
        <div class="codex-trade-card">
          <div class="codex-trade-body">
            Every SOL, the market shifts demand to a random resource accessible in your sector.
            The <strong class="codex-trade-emph">boosted resource</strong> sells at a multiplied rate between <strong class="codex-trade-emph-soft">1.2×</strong> and <strong class="codex-trade-emph-soft">2.0×</strong> its base price for that SOL.
            Only resources from nodes reachable at your current base tier are eligible for the demand boost.
            Watch the trade panel each SOL — timing your sales around demand spikes is one of the most effective ways to grow your credits quickly.
          </div>
        </div>

        <div class="codex-group-label codex-section-title">◈ BASE SELL PRICES</div>
        <div class="codex-trade-note">Prices below reflect standard market rate. Demand boosts apply on top of these values each SOL.</div>
        <table class="codex-ships-table">
          <thead><tr>
            <th class="codex-ships-th codex-trade-th">RESOURCE</th>
            <th class="codex-ships-th codex-trade-th">TIER</th>
            <th class="codex-ships-th codex-trade-th">BASE PRICE</th>
          </tr></thead>
          <tbody>
            ${Object.entries(RESOURCE_DEFS).map(([key, def]) => {
              const tierInfo = (() => { for (const [t,td] of Object.entries(MINE_TIERS)) if (td.resources.includes(key)) return td; return null; })();
              return `<tr>
                <td class="codex-ships-td codex-trade-resource">
                  ${resourceIconHtml(key, 16, 'margin-right:7px;')}${def.label}
                </td>
                <td class="codex-ships-td"><span class="codex-trade-tier-pill" style="border-color:${tierInfo?.color||'#8ab'}44;background:${tierInfo?.color||'#8ab'}18;color:${tierInfo?.color||'#8ab'};">${tierInfo?.label||'—'}</span></td>
                <td class="codex-ships-td codex-ships-td-stat">$${def.sellPrice}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>

        <div class="codex-group-label codex-section-title">◈ TAX & TRADE FEES</div>
        <div class="codex-trade-card">
          <div class="codex-trade-pending">— Trade fee data pending sector clearance —</div>
        </div>`;
    }

    body.innerHTML = `<div class="codex-layout">${tabBar}<div class="codex-content">${tabContent}</div></div>`;
  }

  // Center after content + layout (overlay must be open; skip if user moved this panel)
  const layoutKey = `hdr:${type}`;
  const place = () => centerFloatingWindow(overlay, modal, layoutKey);
  place();
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(place);
  });
}

// Global onclick bindings used by HTML
window.closeHdrPanel  = closeHdrPanel;
window.dismissHdrModal = dismissHdrModal;
window.handleBasePanelOverlayClick = handleBasePanelOverlayClick;
