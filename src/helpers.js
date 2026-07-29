// ============================================================
// SHARED HELPERS & UTILITIES
// ============================================================
import { RESOURCE_DEFS, MINE_TIERS } from './data/resources.js';
import { TIER_COLORS } from './data/ships.js';
import { SOL_DURATION } from './constants.js';

/** Convert a CSS hex colour to "r,g,b" string */
const _hexToRgbCache = new Map();
export function hexToRgb(hex) {
  let cached = _hexToRgbCache.get(hex);
  if (cached) return cached;
  cached = `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
  _hexToRgbCache.set(hex, cached);
  return cached;
}

/** Returns true if a hex colour is perceptually light (use dark text on top) */
export function isLightColor(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  // Perceived luminance formula
  return (r * 0.299 + g * 0.587 + b * 0.114) > 160;
}

/** Compact amount for UI (1.5k, 250k, 1.2M) */
export function fmtCompact(n) {
  const v = Math.floor(Number(n) || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = (x) => {
    const rounded = x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 10) / 10;
    return String(rounded).replace(/\.0$/, '');
  };
  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)}k`;
  return `${sign}${abs}`;
}

/** Format number for UI — compact at 1k+ */
export function fmt(n) { return fmtCompact(n); }

export const MAX_COINS = 999_999_999;
export const RESOURCE_CAP = 999_999_999;

export function clampCoins(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_COINS, Math.floor(n)));
}

// ── Coin helpers — mutate state.coins and push update to header ──
let _headerCoinCb = null;
export function setHeaderCoinCb(fn) { _headerCoinCb = fn; }
let _lastMaxCoinWarnTs = 0;
let _currencyMaxPopupTimer = null;

function showCurrencyMaxPopup() {
  const overlay = document.getElementById('currency-max-popup-overlay');
  if (!overlay) return;
  overlay.classList.add('show');
  if (_currencyMaxPopupTimer) clearTimeout(_currencyMaxPopupTimer);
  _currencyMaxPopupTimer = setTimeout(() => overlay.classList.remove('show'), 3000);
}

window.closeCurrencyMaxPopup = function() {
  const overlay = document.getElementById('currency-max-popup-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  if (_currencyMaxPopupTimer) {
    clearTimeout(_currencyMaxPopupTimer);
    _currencyMaxPopupTimer = null;
  }
};

export function addCoins(n) {
  if (!_stateRef) return false;
  const delta = Math.floor(Number(n) || 0);
  if (delta <= 0) return true;
  if ((_stateRef.coins || 0) >= MAX_COINS) {
    showCurrencyMaxPopup();
    const now = Date.now();
    if (now - _lastMaxCoinWarnTs > 1200) {
      _lastMaxCoinWarnTs = now;
      addLog('⚠ Cannot sell! Currency is maxed out. Consider alternate means of liquidation.');
    }
    return false;
  }
  _stateRef.coins = clampCoins((_stateRef.coins || 0) + delta);
  _headerCoinCb?.();
  return true;
}
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
  if (logEl) logEl.classList.toggle('is-hidden', !state.log.some(l => l));
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

const MATERIAL_ICON_IDS = new Set([
  'oxy_copper', 'sil_steel', 'nick_alloy', 'cobaltic', 'titan_alloy',
  'alum_bronze', 'auric_matrix', 'chrome_plate', 'argent_flux', 'plat_catalyst',
  'irid_core', 'radiant_alloy', 'stellar_matrix',
]);

export function getResourceIconPath(resourceType) {
  if (MATERIAL_ICON_IDS.has(resourceType)) return `assets/images/materials/${resourceType}.png`;
  if (resourceType === 'crashed_ship') return 'assets/images/crashed_ships/crashed_ship_1.png';
  return `assets/images/resources/${resourceType}.png`;
}

export function resourceIconHtml(resourceType, size = 14, extraStyle = '') {
  const def = RESOURCE_DEFS[resourceType];
  const isMaterial = MATERIAL_ICON_IDS.has(resourceType);
  if (!def && !isMaterial) return '';
  // Special map nodes (e.g. crashed ships) are not mineable resource icons
  if (def?.noIcon || def?.special) return '';
  const label = def?.label || resourceType;
  return `<img class="resource-icon" src="${getResourceIconPath(resourceType)}" alt="${label}" style="width:${size}px;height:${size}px;${extraStyle}">`;
}

export function showTooltip(e, resourceType, options = {}) {
  const def = RESOURCE_DEFS[resourceType];
  if (!def) return;
  const state = _stateRef;
  if (def.special) {
    const tt = tooltipEl();
    tt.innerHTML = `
      <div class="tt-name">${def.noIcon ? '' : resourceIconHtml(resourceType, 14, 'margin-right:6px;position:relative;top:2px;')}${def.label}</div>
      <div style="color:#cde;max-width:260px;white-space:normal;line-height:1.4;">${def.blurb}</div>
    `;
    tt.style.display = 'block';
    moveTooltip(e);
    return;
  }
  const tierEntry = Object.entries(MINE_TIERS).find(([,v]) => v.resources.includes(resourceType));
  const tierLabel = tierEntry ? MINE_TIERS[tierEntry[0]].label : '';
  const tierColor = tierEntry ? (TIER_COLORS[parseInt(tierEntry[0])] || '#e8eaf0') : '#8ab';
  const stock = state ? (state.resources[resourceType] || 0) : 0;
  const nodeId = options.nodeId;
  const assignedShips = (state && Number.isFinite(nodeId))
    ? (state.ships || []).filter((s) => s.targetNode === nodeId)
    : [];
  const assignedHtml = assignedShips.length
    ? `<div style="margin-top:4px;">Assigned: <span style="color:#8fc3ff;">${assignedShips.map((s) => s.name || `Ship #${s.id}`).join(', ')}</span></div>`
    : (Number.isFinite(nodeId) ? '<div style="margin-top:4px;color:#5a7a9a;">Assigned: <span style="color:#6a8098;">None</span></div>' : '');
  const tt = tooltipEl();
  tt.innerHTML = `
    <div class="tt-name">${resourceIconHtml(resourceType, 14, 'margin-right:6px;position:relative;top:2px;')}${def.label}</div>
    <div>Sell price: <span class="tt-price" style="color:#6fff9a;">$${def.sellPrice} per unit</span></div>
    ${stock > 0 ? `<div>In depot: <span style="color:#cde">${fmt(stock)}</span> <span style="color:#6fff9a;">($${fmt(stock * def.sellPrice)})</span></div>` : ''}
    <div class="tt-tier" style="color:${tierColor}">⬡ ${tierLabel}</div>
    ${assignedHtml}
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
  // Prefer Tippy when hovering a real element (no delay, smart placement)
  const el = e?.currentTarget || e?.target;
  if (el && el.nodeType === 1 && typeof window.bindTippy === 'function') {
    window.bindTippy(el, text);
    if (el._tippy) {
      if (!el._tippy.state.isVisible) el._tippy.show();
      return;
    }
  }
  // Fallback: legacy floating tooltip (canvas / no Tippy)
  const tt = tooltipEl();
  tt.classList.add('tt-compact');
  tt.innerHTML = `<div class="tt-name">${text}</div>`;
  tt.style.display = 'block';
  moveTooltip(e);
}
