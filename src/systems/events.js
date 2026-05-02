// ============================================================
// RANDOM EVENT SYSTEM (definitions + tick)
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog, fmt } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { spawnSolarFlare, spawnComet } from '../render/animations.js';
import { queueTransmissions } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';
import {
  SOLAR_FLARE_MIN_TYPES, SOLAR_FLARE_MAX_TYPES,
  SOLAR_FLARE_LOSS_MIN, SOLAR_FLARE_LOSS_MAX,
  SOLAR_FLARE_WARNING_DURATION_MS, SOLAR_FLARE_TRANSMISSION_DELAY_MS,
  COMET_BASE_DMG_MIN, COMET_BASE_DMG_MAX,
  COMET_SCALE_DMG_MIN, COMET_SCALE_DMG_MAX,
  COMET_WARNING_DURATION_MS, COMET_TRANSMISSION_DELAY_MS,
  EVENT_SCHEDULE_MIN_SOLS, EVENT_SCHEDULE_MAX_SOLS,
  SOLAR_FLARE_TRIGGER_DELAY_MS, COMET_TRIGGER_DELAY_MS,
} from '../data/events.js';
import { DEFENSE_DAMAGE_REDUCTION } from '../data/research.js';

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
      // Dynamically pick 3–8 resource types the player currently has stock of
      const available = Object.keys(state.resources).filter(t => (state.resources[t] || 0) > 0 && RESOURCE_DEFS[t]);
      const count = Math.min(available.length, SOLAR_FLARE_MIN_TYPES + Math.floor(Math.random() * (SOLAR_FLARE_MAX_TYPES - SOLAR_FLARE_MIN_TYPES + 1)));
      // Shuffle and slice to get the affected subset
      const shuffled = available.slice().sort(() => Math.random() - 0.5);
      const affectedTypes = shuffled.slice(0, count);
      const losses = {};
      for (const type of affectedTypes) {
        const pct = SOLAR_FLARE_LOSS_MIN + Math.random() * (SOLAR_FLARE_LOSS_MAX - SOLAR_FLARE_LOSS_MIN);
        const lost = Math.floor((state.resources[type]||0) * pct);
        if (lost > 0) { state.resources[type] -= lost; losses[type] = lost; }
      }
      const summary = Object.entries(losses).map(([t,n]) => `${fmt(n)} ${RESOURCE_DEFS[t].label}`).join(' · ');
      addLog(`☀ Solar Flare! Lost: ${summary || 'nothing'}`);
      const lossRows = Object.entries(losses).map(([t, n]) => {
        const def = RESOURCE_DEFS[t];
        return `<div class="event-loss-row">
          <span class="event-loss-dot" style="background:${def.color};box-shadow:0 0 6px ${def.color}99;"></span>
          <span class="event-loss-name">${def.label}</span>
          <span class="event-loss-amt" style="color:#ff8080;">−${fmt(n)}</span>
        </div>`;
      }).join('');
      const flareDetail = lossRows
        ? `<div style="margin-bottom:4px;font-size:10px;letter-spacing:2px;color:#f88;">DEPOT LOSSES</div>${lossRows}<div class="event-shield-row">✦ Oxygen — SHIELDED</div>`
        : `<div style="color:#8f8;">MINIMAL DAMAGE DETECTED</div>`;
      showEventWarning('☀ SOLAR FLARE', flareDetail, SOLAR_FLARE_WARNING_DURATION_MS);
      spawnSolarFlare();
      queueTransmissions([{ key: 'vane_solar_explain', text: NPCS.vane.transmissionLines.vane_solar_explain, duration: 14, npc: 'vane', delay: SOLAR_FLARE_TRANSMISSION_DELAY_MS }]);
      if (refresh.ui) refresh.ui();
    }
  },
  {
    id: 'comet',
    label: '☄ COMET IMPACT',
    trigger(sol) {
      const scale = Math.min(sol / 10, 1);
      const minDmg = Math.round(COMET_BASE_DMG_MIN + scale * COMET_SCALE_DMG_MIN);
      const maxDmg = Math.round(COMET_BASE_DMG_MAX + scale * COMET_SCALE_DMG_MAX);
      const dmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;
      const defenseReduction = state.researchUnlocks['defense'] ? DEFENSE_DAMAGE_REDUCTION : 0;
      const actualDmg = Math.round(dmg * (1 - defenseReduction));
      const oldHp = state.base.health;
      state.base.health = Math.max(0, state.base.health - actualDmg);
      const actual = oldHp - state.base.health;
      const hpPct = Math.round(state.base.health / state.base.maxHealth * 100);
      const critical = hpPct < 30;
      addLog(`☄ Comet impact! Base took ${fmt(actual)} damage. HP: ${fmt(state.base.health)}/${fmt(state.base.maxHealth)}`);
      const hpColor = hpPct < 30 ? '#ff4040' : hpPct < 60 ? '#ffa040' : '#40d080';
      const cometDetail = `
        <div class="event-loss-row" style="border-bottom:none;padding-bottom:2px;">
          <span style="color:#f88;font-size:11px;letter-spacing:2px;">BASE DAMAGE</span>
          <span class="event-loss-amt" style="color:#ff6060;font-size:16px;">−${fmt(actual)} HP</span>
        </div>
        <div class="event-hp-bar-wrap">
          <div class="event-hp-bar" style="width:${hpPct}%;background:${hpColor};box-shadow:0 0 8px ${hpColor}99;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#aac;">
          <span>INTEGRITY</span><span style="color:${hpColor};font-weight:bold;">${hpPct}%</span>
        </div>
        ${critical ? '<div style="margin-top:6px;color:#ff4040;font-size:12px;letter-spacing:2px;animation:eventFlash 0.4s infinite alternate;">⚠ CRITICAL — REPAIR IMMEDIATELY</div>' : ''}
      `;
      showEventWarning('☄ COMET IMPACT', cometDetail, COMET_WARNING_DURATION_MS);
      queueTransmissions([{ key: 'vane_comet_explain', text: NPCS.vane.transmissionLines.vane_comet_explain(hpPct), duration: 15, npc: 'vane', delay: COMET_TRANSMISSION_DELAY_MS }]);
      if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
      if (refresh.ui) refresh.ui();
    }
  }
];

export function fireRandomEvent() {
  const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  if (ev.id === 'comet') spawnComet();
  state.eventCounts[ev.id] = (state.eventCounts[ev.id] || 0) + 1;
  const triggerDelay = ev.id === 'comet' ? COMET_TRIGGER_DELAY_MS : SOLAR_FLARE_TRIGGER_DELAY_MS;
  setTimeout(() => ev.trigger(state.sol), triggerDelay);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
}
