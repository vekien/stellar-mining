// ============================================================
// CRAFT TRACKER — track up to 3 crafts and show resource status
// ============================================================
import { state } from '../state.js';
import { getCraft, CRAFT_SHIPS } from '../data/crafts.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { fmt, fmtCompact, resourceIconHtml } from '../helpers.js';

const MAX_TRACKED = 3;

export function isTracked(kind, id) {
  return (state.trackedCrafts || []).some(t => t.kind === kind && t.id === id);
}

export function toggleTrackCraft(kind, id) {
  if (!state.trackedCrafts) state.trackedCrafts = [];
  const idx = state.trackedCrafts.findIndex(t => t.kind === kind && t.id === id);
  if (idx >= 0) {
    state.trackedCrafts.splice(idx, 1);
  } else {
    if (state.trackedCrafts.length >= MAX_TRACKED) return;
    state.trackedCrafts.push({ kind, id });
  }
  renderCraftTracker();
  refreshTrackButtons();
}

export function refreshTrackButtons() {
  const tracked = state.trackedCrafts || [];
  const atMax = tracked.length >= MAX_TRACKED;
  document.querySelectorAll('.craft-item-track-btn, .cf-track, .cf-ghost[data-ct-kind]').forEach(btn => {
    const kind = btn.dataset.ctKind;
    const id   = btn.dataset.ctId;
    if (!kind || !id) return;
    const on   = isTracked(kind, id);
    btn.classList.toggle('ct-tracked', on);
    btn.disabled = !on && atMax;
    btn.title = on ? 'Untrack' : 'Track in craft queue';
    if (btn.classList.contains('craft-item-track-btn') || btn.classList.contains('cf-ghost')) {
      const icon = btn.querySelector('.ms-icon');
      if (icon) {
        btn.innerHTML = `<span class="ms-icon${on ? ' ms-icon-fill' : ''}" aria-hidden="true" style="font-size:16px">bookmark</span> ${on ? 'UNTRACK' : 'TRACK'}`;
      } else {
        btn.textContent = on ? 'UNTRACK' : 'TRACK';
      }
    } else if (btn.classList.contains('cf-track')) {
      btn.innerHTML = `<span class="ms-icon${on ? ' ms-icon-fill' : ''}" aria-hidden="true">bookmark</span>`;
    }
  });
}

function getCraftData(kind, id) {
  if (kind === 'ship') {
    const r = CRAFT_SHIPS.find(s => s.id === id);
    return r ? { name: r.name, cost: 0, reqs: r.reqs || {} } : null;
  }
  const typeMap = { turret: 'turrets', building: 'buildings', drone: 'drones' };
  const c = getCraft(typeMap[kind], id);
  return c ? { name: c.name, cost: c.cost || 0, reqs: c.reqs || {} } : null;
}

const KIND_LABELS = { ship: 'SHIP', turret: 'TURRET', building: 'BUILDING', drone: 'DRONE' };
const KIND_ICONS = { ship: 'rocket', turret: 'shield', building: 'apartment', drone: 'drone_2' };

let _lastTrackerSig = '';

function readiness(data) {
  let total = 0;
  let met = 0;
  if (data.cost > 0) {
    total += 1;
    if ((state.coins || 0) >= data.cost) met += 1;
  }
  for (const [r, n] of Object.entries(data.reqs || {})) {
    total += 1;
    if ((state.resources[r] || 0) >= n) met += 1;
  }
  return { met, total, pct: total > 0 ? Math.round((met / total) * 100) : 100 };
}

function matCellHtml(label, amount, have, iconHtml) {
  const ok = have >= amount;
  return `<div class="ct-mat ${ok ? 'ok' : 'bad'}" title="${label}: ${fmt(have)} / ${fmt(amount)}">
    ${iconHtml}
    <span class="ct-mat-amt">${fmtCompact(amount)}</span>
    <span class="ct-mat-check">${ok ? '✓' : '!'}</span>
  </div>`;
}

export function renderCraftTracker() {
  const el = document.getElementById('craft-tracker');
  if (!el) return;
  const tracked = state.trackedCrafts || [];
  if (!tracked.length) {
    el.classList.add('ct-hidden');
    _lastTrackerSig = '';
    return;
  }

  const sig = JSON.stringify(tracked) + '|' + state.coins + '|' +
    tracked.flatMap(({ kind, id }) => {
      const d = getCraftData(kind, id);
      return d ? Object.keys(d.reqs).map(r => state.resources[r] || 0) : [];
    }).join(',');
  if (sig === _lastTrackerSig && !el.classList.contains('ct-hidden')) return;
  _lastTrackerSig = sig;

  el.classList.remove('ct-hidden');

  const cards = tracked.map(({ kind, id }) => {
    const data = getCraftData(kind, id);
    if (!data) return '';
    const kindLabel = KIND_LABELS[kind] || kind.toUpperCase();
    const kindIcon = KIND_ICONS[kind] || 'bookmark';
    const ready = readiness(data);
    const readyAll = ready.met === ready.total && ready.total > 0;

    const mats = [];
    if (data.cost > 0) {
      mats.push(matCellHtml('Credits', data.cost, state.coins || 0,
        '<span class="ct-mat-cash">$</span>'));
    }
    for (const [r, n] of Object.entries(data.reqs)) {
      const label = RESOURCE_DEFS[r]?.label || r;
      const icon = resourceIconHtml(r, 14) || `<span class="ct-mat-cash">?</span>`;
      mats.push(matCellHtml(label, n, state.resources[r] || 0, icon));
    }

    return `<div class="ct-card${readyAll ? ' ready' : ''}" role="button" tabindex="0" title="Open in Craft" onclick="openCraftToItem('${kind}','${id}')">
      <div class="ct-card-head">
        <span class="ms-icon ct-kind-icon" aria-hidden="true">${kindIcon}</span>
        <div class="ct-card-titles">
          <div class="ct-card-name">${data.name}</div>
          <div class="ct-card-sub">
            <span class="ct-card-kind">${kindLabel}</span>
            <span class="ct-ready-label ${readyAll ? 'ok' : ''}">${ready.met}/${ready.total}</span>
          </div>
        </div>
        <button class="ct-remove-btn" onclick="event.stopPropagation();toggleTrackCraft('${kind}','${id}')" title="Untrack">✕</button>
      </div>
      <div class="ct-progress"><div class="ct-progress-fill" style="width:${ready.pct}%"></div></div>
      <div class="ct-mat-row">${mats.join('') || '<div class="ct-empty">No materials</div>'}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <button type="button" class="ct-title" title="Open Craft panel" onclick="openHdrPanel('craft')">
      <span class="ms-icon ms-icon-fill" aria-hidden="true">bookmark</span>
      TRACKED
      <span class="ct-count">${tracked.length}/${MAX_TRACKED}</span>
    </button>
    ${cards}`;
}
