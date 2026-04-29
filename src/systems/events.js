// ============================================================
// RANDOM EVENT SYSTEM (definitions + tick)
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { spawnSolarFlare, spawnComet } from '../render/animations.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';

export function showEventWarning(label, detail, duration = 6000) {
  const banner = document.getElementById('event-warning');
  const inner  = document.getElementById('event-warning-inner');
  if (!banner || !inner) return;
  inner.innerHTML = `<div class="event-warning-title">${label}</div>${detail ? `<div class="event-warning-detail">${detail}</div>` : ''}`;
  banner.classList.add('visible');
  setTimeout(() => banner.classList.remove('visible'), duration);
}

export const RANDOM_EVENTS = [
  {
    id: 'solar_flare',
    label: '☀ SOLAR FLARE',
    trigger(sol) {
      const affectedTypes = ['iron','copper','silicon','titanium','gold'];
      const losses = {};
      for (const type of affectedTypes) {
        const pct = (Math.random() * 0.10 + 0.10);
        const lost = Math.floor((state.resources[type]||0) * pct);
        if (lost > 0) { state.resources[type] -= lost; losses[type] = lost; }
      }
      const summary = Object.entries(losses).map(([t,n]) => `${fmt(n)} ${RESOURCE_DEFS[t].label}`).join(' · ');
      addLog(`☀ Solar Flare! Lost: ${summary || 'nothing'}`);
      showEventWarning(
        '☀ SOLAR FLARE',
        summary ? `DEPOT LOSSES: ${summary.toUpperCase()} · OXYGEN STORAGE SHIELDED` : 'MINIMAL DAMAGE DETECTED',
        10000
      );
      spawnSolarFlare();
      setTimeout(() => showOnce('vane_solar_explain', NPCS.vane.transmissionLines.vane_solar_explain, 15, 'vane'), 15000);
      if (refresh.ui) refresh.ui();
    }
  },
  {
    id: 'comet',
    label: '☄ COMET IMPACT',
    trigger(sol) {
      const scale = Math.min(sol / 10, 1);
      const minDmg = Math.round(300 + scale * 2700);
      const maxDmg = Math.round(600 + scale * 5400);
      const dmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
      const defenseReduction = state.researchUnlocks['defense'] ? 0.10 : 0;
      const actualDmg = Math.round(dmg * (1 - defenseReduction));
      const oldHp = state.base.health;
      state.base.health = Math.max(0, state.base.health - actualDmg);
      const actual = oldHp - state.base.health;
      const hpPct = Math.round(state.base.health / state.base.maxHealth * 100);
      const critical = hpPct < 30;
      addLog(`☄ Comet impact! Base took ${fmt(actual)} damage. HP: ${fmt(state.base.health)}/${fmt(state.base.maxHealth)}`);
      showEventWarning(
        '☄ COMET IMPACT',
        `BASE DAMAGE: ${fmt(actual)} HP · INTEGRITY: ${hpPct}%${critical ? ' · ⚠ CRITICAL' : ''}`,
        10000
      );
      setTimeout(() => showOnce('vane_comet_explain', NPCS.vane.transmissionLines.vane_comet_explain(hpPct), 15, 'vane'), 15000);
      if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
      if (refresh.ui) refresh.ui();
    }
  }
];

export function tickRandomEvents(dt) {
  if (state.nextEventTimer === null) return;
  state.nextEventTimer -= dt;
  if (state.nextEventTimer <= 0) {
    state.nextEventTimer = null;
    const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
    if (ev.id === 'comet') spawnComet();
    state.eventCounts[ev.id] = (state.eventCounts[ev.id] || 0) + 1;
    setTimeout(() => ev.trigger(state.sol), ev.id === 'comet' ? 3000 : 1500);
    if (refresh.header) refresh.header();
    if (refresh.ui) refresh.ui();
  }
}
