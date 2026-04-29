// ============================================================
// SHARED HELPERS & UTILITIES
// ============================================================
import { RESOURCE_DEFS, MINE_TIERS } from './data/resources.js';
import { TIER_COLORS } from './data/ships.js';

/** Convert a CSS hex colour to "r,g,b" string */
export function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

/** Format number with commas (floor first) */
export function fmt(n) { return Math.floor(n).toLocaleString(); }

// ── Canvas log entries ──
// state is imported lazily via the getter to avoid circular deps at module init
let _stateRef = null;
export function setStateRef(s) { _stateRef = s; }

export function addLog(msg) {
  const state = _stateRef;
  if (!state) return;
  state.log.unshift(msg);
  if (state.log.length > 3) state.log = state.log.slice(0, 3);
  ['log0','log1','log2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = state.log[i] || '';
  });
  const logEl = document.getElementById('log');
  if (logEl) logEl.style.display = state.log.some(l => l) ? '' : 'none';
  const l0 = document.getElementById('log0');
  if (l0) { l0.className = 'log-entry new'; setTimeout(() => { if (l0) l0.className = 'log-entry'; }, 2000); }
}

// ── Tooltip ──
export const tooltipEl = () => document.getElementById('tooltip');

export function showTooltip(e, resourceType) {
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
    <div>Sell price: <span class="tt-price">${def.sellPrice}¢ per unit</span></div>
    ${stock > 0 ? `<div>In depot: <span style="color:#ffe066">${fmt(stock)}</span> <span style="color:#5a8">(= ${fmt(stock * def.sellPrice)}¢)</span></div>` : ''}
    <div class="tt-tier" style="color:${tierColor}">⬡ ${tierLabel}</div>
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
}
