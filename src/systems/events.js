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
import {
  ANTI_COMET_CHANCE_PER_PURCHASE,
  SOLAR_SHIELD_REDUCTION_PER_PURCHASE,
} from '../data/research.js';
import { getMaxShield } from './research.js';

export function showEventWarning(label, detail, duration = 6000) {
  const banner = document.getElementById('event-warning');
  const inner  = document.getElementById('event-warning-inner');
  if (!banner || !inner) return;
  if (banner._eventWarningRafId) cancelAnimationFrame(banner._eventWarningRafId);
  banner._eventWarningToken = (banner._eventWarningToken || 0) + 1;
  const token = banner._eventWarningToken;
  inner.innerHTML = `
    <div class="event-warning-head"><div class="event-warning-title">${label}</div></div>
    ${detail ? `<div class="event-warning-detail">${detail}</div>` : ''}
    <div class="event-warning-progress-wrap"><div class="event-warning-progress"></div></div>
    <button class="event-warning-dismiss" onclick="closeEventWarning()">DISMISS</button>
  `;
  banner.classList.add('visible');
  const bar = inner.querySelector('.event-warning-progress');
  const startedAt = performance.now();
  let rafId = null;
  const tick = now => {
    if (banner._eventWarningToken !== token) return;
    const elapsed = now - startedAt;
    const pct = Math.max(0, 100 - (elapsed / duration) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (elapsed < duration && banner.classList.contains('visible')) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    if (banner._eventWarningToken === token) banner.classList.remove('visible');
  };
  if (bar) bar.style.width = '100%';
  rafId = requestAnimationFrame(tick);
  banner._eventWarningRafId = rafId;
}

export function closeEventWarning() {
  const banner = document.getElementById('event-warning');
  if (!banner) return;
  if (banner._eventWarningRafId) cancelAnimationFrame(banner._eventWarningRafId);
  banner._eventWarningRafId = null;
  banner._eventWarningToken = (banner._eventWarningToken || 0) + 1;
  banner.classList.remove('visible');
}

window.closeEventWarning = closeEventWarning;

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
      const solarReduction = Math.min(0.80, (state.solarShieldCount || 0) * SOLAR_SHIELD_REDUCTION_PER_PURCHASE);
      const solarReductionPct = Math.round(solarReduction * 100);
      const losses = {};
      for (const type of affectedTypes) {
        const pct = (SOLAR_FLARE_LOSS_MIN + Math.random() * (SOLAR_FLARE_LOSS_MAX - SOLAR_FLARE_LOSS_MIN)) * (1 - solarReduction);
        const lost = Math.floor((state.resources[type]||0) * pct);
        if (lost > 0) { state.resources[type] -= lost; losses[type] = lost; }
      }
      const summary = Object.entries(losses).map(([t,n]) => `${fmt(n)} ${RESOURCE_DEFS[t].label}`).join(' · ');
      const totalLost = Object.values(losses).reduce((sum, n) => sum + n, 0);
      addLog(`☀ Solar Flare! Lost: ${summary || 'nothing'}`);
      const sortedLosses = Object.entries(losses).sort((a, b) => b[1] - a[1]);
      const lossRows = sortedLosses.map(([t, n]) => {
        const def = RESOURCE_DEFS[t];
        return `<div class="event-loss-row event-loss-row-solar">
          <span class="event-loss-dot event-loss-dot-solar" style="background:${def.color};box-shadow:0 0 12px ${def.color}bb;"></span>
          <span class="event-loss-name">${def.label}</span>
          <span class="event-loss-amt" style="color:#ff8080;">−${fmt(n)}</span>
        </div>`;
      }).join('');
      const flareDetail = lossRows
        ? `<div class="event-flare-header-row"><span class="event-flare-eyebrow">RESOURCE LOSS REPORT</span><span class="event-flare-total">TOTAL −${fmt(totalLost)}</span></div>${lossRows}${solarReductionPct > 0 ? `<div class="event-shield-row">Solar Radiation Shielding: ${solarReductionPct}%</div>` : ''}`
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
      // ── Anti-comet intercept roll ───────────────────────────
      const interceptChance = Math.min(0.50, (state.antiCometCount || 0) * ANTI_COMET_CHANCE_PER_PURCHASE);
      if (interceptChance > 0 && Math.random() < interceptChance) {
        addLog(`◇ Anti-comet defenses intercepted the incoming comet! No damage taken.`);
        showEventWarning('◇ COMET INTERCEPTED', `<div style="color:#4d8;font-size:14px;letter-spacing:1px;">Point-defense systems destroyed the comet before impact.</div><div style="margin-top:6px;font-size:12px;color:#6a8aaa;">Intercept chance: ${Math.round(interceptChance * 100)}%</div>`, COMET_WARNING_DURATION_MS);
        if (refresh.ui) refresh.ui();
        return;
      }

      // ── Damage calculation ──────────────────────────────────
      const scale = Math.min(sol / 10, 1);
      const minDmg = Math.round(COMET_BASE_DMG_MIN + scale * COMET_SCALE_DMG_MIN);
      const maxDmg = Math.round(COMET_BASE_DMG_MAX + scale * COMET_SCALE_DMG_MAX);
      const dmg = Math.floor(Math.random() * (maxDmg - minDmg + 1)) + minDmg;

      // ── Shield absorbs first ────────────────────────────────
      let remainingDmg = dmg;
      const shieldBefore = state.base.shield || 0;
      const shieldAbsorbed = Math.min(shieldBefore, remainingDmg);
      state.base.shield = shieldBefore - shieldAbsorbed;
      remainingDmg -= shieldAbsorbed;

      const oldHp = state.base.health;
      state.base.health = Math.max(0, state.base.health - remainingDmg);
      const hpDmg = oldHp - state.base.health;
      const hpPct = Math.round(state.base.health / state.base.maxHealth * 100);
      const critical = hpPct < 30;

      const shieldLine = shieldAbsorbed > 0
        ? `<div class="event-loss-row" style="border-bottom:none;padding-bottom:2px;">
            <span style="color:#48f;font-size:11px;letter-spacing:2px;">SHIELD ABSORBED</span>
            <span class="event-loss-amt" style="color:#48f;font-size:14px;">−${fmt(shieldAbsorbed)}</span>
          </div>` : '';

      if (shieldAbsorbed > 0 && hpDmg === 0) {
        addLog(`☄ Comet impact! Shield absorbed all ${fmt(shieldAbsorbed)} damage. HP intact.`);
      } else {
        addLog(`☄ Comet impact! Base took ${fmt(hpDmg)} HP damage${shieldAbsorbed > 0 ? ` (${fmt(shieldAbsorbed)} absorbed by shield)` : ''}. HP: ${fmt(state.base.health)}/${fmt(state.base.maxHealth)}`);
      }

      const hpColor = hpPct < 30 ? '#ff4040' : hpPct < 60 ? '#ffa040' : '#40d080';
      const cometDetail = `
        ${shieldLine}
        <div class="event-loss-row" style="border-bottom:none;padding-bottom:2px;">
          <span class="event-comet-base-label">BASE DAMAGE</span>
          <span class="event-loss-amt event-comet-dmg-amt" style="color:#ff6060;">−${fmt(hpDmg)} HP</span>
        </div>
        <div class="event-hp-bar-wrap">
          <div class="event-hp-bar" style="width:${hpPct}%;background:${hpColor};box-shadow:0 0 8px ${hpColor}99;"></div>
        </div>
        <div class="event-integrity-row">
          <span>INTEGRITY</span><span style="color:${hpColor};font-weight:bold;">${hpPct}%</span>
        </div>
        ${critical ? '<div class="event-critical-alert">⚠ CRITICAL — REPAIR IMMEDIATELY</div>' : ''}
      `;
      showEventWarning('☄ COMET IMPACT', cometDetail, COMET_WARNING_DURATION_MS);
      queueTransmissions([{ key: 'vane_comet_explain', text: NPCS.vane.transmissionLines.vane_comet_explain(hpPct), duration: 15, npc: 'vane', delay: COMET_TRANSMISSION_DELAY_MS }]);
      if (state.basePanelOpen && refresh.basePanel) refresh.basePanel();
      if (refresh.ui) refresh.ui();
    }
  }
];

export function fireEventById(eventId) {
  const ev = RANDOM_EVENTS.find(e => e.id === eventId);
  if (!ev) return false;
  if (ev.id === 'comet') spawnComet();
  state.eventCounts[ev.id] = (state.eventCounts[ev.id] || 0) + 1;
  const triggerDelay = ev.id === 'comet' ? COMET_TRIGGER_DELAY_MS : SOLAR_FLARE_TRIGGER_DELAY_MS;
  setTimeout(() => ev.trigger(state.sol), triggerDelay);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  return true;
}

export function fireRandomEvent() {
  const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  fireEventById(ev.id);
}
