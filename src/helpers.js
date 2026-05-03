// ============================================================
// SHARED HELPERS & UTILITIES
// ============================================================
import { RESOURCE_DEFS, MINE_TIERS } from './data/resources.js';
import { TIER_COLORS } from './data/ships.js';
import { SOL_DURATION } from './constants.js';

/** Convert a CSS hex colour to "r,g,b" string */
export function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

/** Returns true if a hex colour is perceptually light (use dark text on top) */
export function isLightColor(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  // Perceived luminance formula
  return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
}

/** Format number with commas (floor first) */
export function fmt(n) { return Math.floor(n).toLocaleString(); }

export const MAX_COINS = 999_999_999;
export const RESOURCE_CAP = 999_999_999;

export function clampCoins(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_COINS, Math.floor(n)));
}

// ── Coin helpers — mutate state.coins and push update to header ──
let _headerCoinCb = null;
export function setHeaderCoinCb(fn) { _headerCoinCb = fn; }
export function addCoins(n) { _stateRef.coins = clampCoins((_stateRef.coins || 0) + n); _headerCoinCb?.(); }
export function spendCoins(n) { _stateRef.coins = clampCoins((_stateRef.coins || 0) - n); _headerCoinCb?.(); }

// ── Canvas log entries ──
// state is imported lazily via the getter to avoid circular deps at module init
let _stateRef = null;
export function setStateRef(s) { _stateRef = s; }

function renderLogPreview(state) {
  ['log0','log1','log2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = state.log[i] || '';
  });
  const logEl = document.getElementById('log');
  if (logEl) logEl.style.display = state.log.some(l => l) ? '' : 'none';
}

function renderLogHistoryPanel(state) {
  const list = document.getElementById('log-history-list');
  if (!list) return;
  const rows = (state.logHistory || []).slice(0, 100);
  if (!rows.length) {
    list.innerHTML = '<div class="log-history-empty">No log entries yet.</div>';
    return;
  }
  list.innerHTML = rows.map(entry => (
    `<div class="log-history-row"><span class="log-history-sol">SOL ${entry.sol} · ${entry.solTime || '--:--'}</span><span class="log-history-msg">${entry.msg}</span></div>`
  )).join('');
}

export function openLogHistory() {
  const state = _stateRef;
  if (!state) return;
  renderLogHistoryPanel(state);
  document.getElementById('log-history-overlay')?.classList.add('show');
}

export function closeLogHistory() {
  document.getElementById('log-history-overlay')?.classList.remove('show');
}

export function refreshLogUI() {
  const state = _stateRef;
  if (!state) return;
  renderLogPreview(state);
  if (document.getElementById('log-history-overlay')?.classList.contains('show')) renderLogHistoryPanel(state);
}

export function addLog(msg) {
  const state = _stateRef;
  if (!state) return;

  const dayProgress = (state.solTimer || 0) / SOL_DURATION;
  const solHours = Math.floor(dayProgress * 24);
  const solMins = Math.floor((dayProgress * 24 * 60) % 60);
  const solTime = `${String(solHours).padStart(2,'0')}:${String(solMins).padStart(2,'0')}`;

  const entry = { sol: state.sol ?? 1, solTime, msg };
  state.logHistory.unshift(entry);
  if (state.logHistory.length > 100) state.logHistory = state.logHistory.slice(0, 100);

  state.log.unshift(entry.msg);
  if (state.log.length > 3) state.log = state.log.slice(0, 3);
  renderLogPreview(state);
  if (document.getElementById('log-history-overlay')?.classList.contains('show')) renderLogHistoryPanel(state);

  const l0 = document.getElementById('log0');
  if (l0) { l0.className = 'log-entry new'; setTimeout(() => { if (l0) l0.className = 'log-entry'; }, 2000); }
}

// ── Tooltip ──
export const tooltipEl = () => document.getElementById('tooltip');

export function showTooltip(e, resourceType, options = {}) {
  const def = RESOURCE_DEFS[resourceType];
  if (!def) return;
  const state = _stateRef;
  const tierEntry = Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(resourceType));
  const tierLabel = tierEntry ? MINE_TIERS[tierEntry[0]].label : '';
  const tierColor = tierEntry ? (TIER_COLORS[parseInt(tierEntry[0])] || '#e8eaf0') : '#8ab';
  const stock = state ? (state.resources[resourceType] || 0) : 0;
  const tt = tooltipEl();
  tt.innerHTML = `
    <div class="tt-name"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${def.color};margin-right:5px;vertical-align:middle"></span>${def.label}</div>
    <div>Sell price: <span class="tt-price" style="color:#6fff9a;">$${def.sellPrice} per unit</span></div>
    ${stock > 0 ? `<div>In depot: <span style="color:#cde">${fmt(stock)}</span> <span style="color:#6fff9a;">($${fmt(stock * def.sellPrice)})</span></div>` : ''}
    <div class="tt-tier" style="color:${tierColor}">⬡ ${tierLabel}</div>
    ${options.unmineableByFleet ? '<div style="margin-top:4px;color:#f0b080;">No ship can mine this tier yet.</div>' : ''}
  `;
  tt.style.display = 'block';
  moveTooltip(e);
}

export function moveTooltip(e) {
  const tt = tooltipEl();
  const x = e.clientX + 14;
  const y = e.clientY + 14;
  const tw = tt.offsetWidth, th = tt.offsetHeight;
  tt.style.left = (x + tw > window.innerWidth  ? e.clientX - tw - 8 : x) + 'px';
  tt.style.top  = (y + th > window.innerHeight ? e.clientY - th - 8 : y) + 'px';
}

export function hideTooltip() {
  tooltipEl().style.display = 'none';
  tooltipEl().classList.remove('tt-compact');
}

export function showHintTooltip(e, text) {
  const tt = tooltipEl();
  tt.classList.add('tt-compact');
  tt.innerHTML = `<div class="tt-name">${text}</div>`;
  tt.style.display = 'block';
  moveTooltip(e);
}
