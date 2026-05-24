// ============================================================
// CRAFT TRACKER — track up to 3 crafts and show resource status
// ============================================================
import { state } from '../state.js';
import { getCraft, CRAFT_SHIPS } from '../data/crafts.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { fmt } from '../helpers.js';

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
  document.querySelectorAll('.craft-item-track-btn').forEach(btn => {
    const kind = btn.dataset.ctKind;
    const id   = btn.dataset.ctId;
    const on   = isTracked(kind, id);
    btn.textContent = on ? 'UNTRACK' : 'TRACK';
    btn.classList.toggle('ct-tracked', on);
    btn.disabled = !on && atMax;
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

let _lastTrackerSig = '';

export function renderCraftTracker() {
  const el = document.getElementById('craft-tracker');
  if (!el) return;
  const tracked = state.trackedCrafts || [];
  if (!tracked.length) {
    el.classList.add('ct-hidden');
    _lastTrackerSig = '';
    return;
  }

  // Build sig from coins + relevant resource amounts — skip DOM update if unchanged
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
    let reqs = '';
    if (data.cost > 0) {
      const met = state.coins >= data.cost;
      reqs += `<div class="ct-req ${met ? 'ct-met' : 'ct-unmet'}"><span class="ct-check">${met ? '✓' : '✗'}</span>$${fmt(data.cost)}</div>`;
    }
    for (const [r, n] of Object.entries(data.reqs)) {
      const met = (state.resources[r] || 0) >= n;
      const label = RESOURCE_DEFS[r]?.label || r;
      reqs += `<div class="ct-req ${met ? 'ct-met' : 'ct-unmet'}"><span class="ct-check">${met ? '✓' : '✗'}</span>${label}: ${fmt(n)}</div>`;
    }
    return `<div class="ct-card">
      <div class="ct-card-head">
        <span class="ct-card-name">${data.name}</span>
        <span class="ct-card-kind">${kindLabel}</span>
        <button class="ct-remove-btn" onclick="toggleTrackCraft('${kind}','${id}')" title="Untrack">✕</button>
      </div>
      <div class="ct-card-reqs">${reqs}</div>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="ct-title">◈ TRACKED</div>${cards}`;
}
