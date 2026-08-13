// ============================================================
// TRANSMISSION / ADMIRAL MESSAGE SYSTEM
// ============================================================
import { state } from '../state.js';
import { NPCS } from '../data/npcs.js';
import { SOL_DURATION } from '../constants.js';
import { fmt, resourceIconHtml } from '../helpers.js';

const admiralQueue = [];
let admiralTimer = 0;
let admiralDuration = 0;
let admiralVisible = false;
let activeTransmissionSig = null;

// Quest reward toasts — multi-stack, ~2s each
const QUEST_TOAST_DURATION = 3.0;
const QUEST_TOAST_MAX = 6;
let _questToastSeq = 0;
/** @type {{ id: number, el: HTMLElement, timer: number, duration: number, questId: string }[]} */
const questToastStack = [];

function getTransmissionSig(text, npcId) {
  return `${npcId}::${text}`;
}

/**
 * Display time from message length (HTML stripped).
 * Short notes ~4–7s; medium ~8–12s; long briefings ~14–22s.
 * Caller-passed durations are ignored — length is the source of truth.
 */
export function durationForTransmission(text) {
  const plain = String(text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = plain.length;
  // ~28 chars/s skimming pace + 2s open/close buffer
  // e.g. ~140 char Byte tip ≈ 7s; ~400 char Juno brief ≈ 16s
  let secs = 2 + chars / 28;
  // Small beat per line break
  const breaks = (String(text || '').match(/<br\s*\/?>/gi) || []).length;
  secs += Math.min(2, breaks * 0.2);
  secs = Math.max(4, Math.min(22, secs));
  return Math.round(secs * 10) / 10;
}

export function makeEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = Math.random() * 16 | 0;
    const v = ch === 'x' ? n : (n & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function showOnce(id, text, duration = null, npcId, opts = {}) {
  if (state.seenMsgs[id]) return;
  state.seenMsgs[id] = true;
  showTransmissionMessage(text, duration, npcId, opts);
}

/**
 * Log a sector event into transmission history (deduped by eventId).
 * opts: { eventId, eventType, title, showPopup, duration }
 */
export function logEventTransmission(text, npcId = 'vane', opts = {}) {
  const eventId = opts.eventId || makeEventId();
  if ((state.transmissionHistory || []).some((entry) => entry.eventId === eventId)) {
    return eventId;
  }
  showTransmissionMessage(text, opts.duration ?? null, npcId, {
    eventId,
    eventType: opts.eventType || null,
    title: opts.title || null,
    showPopup: opts.showPopup !== false,
  });
  return eventId;
}

export function showTransmissionMessage(text, duration = null, npcId = 'juno', opts = {}) {
  const npc = NPCS[npcId] || NPCS.juno;
  const isMission = opts.kind === 'mission' || opts.mission === true;
  let resolvedDuration = durationForTransmission(text);
  if (isMission) {
    // Mission briefs stay up longer
    resolvedDuration = Math.round(Math.min(33, resolvedDuration * 1.5) * 10) / 10;
  }
  const eventId = opts.eventId || null;
  if (eventId && (state.transmissionHistory || []).some((entry) => entry.eventId === eventId)) {
    return;
  }
  const sig = getTransmissionSig(text, npcId);
  const dayProgress = (state.solTimer || 0) / SOL_DURATION;
  const solHours = Math.floor(dayProgress * 24);
  const solMins = Math.floor((dayProgress * 24 * 60) % 60);
  const solTime = `${String(solHours).padStart(2,'0')}:${String(solMins).padStart(2,'0')}`;
  const historyEntry = {
    sol: state.sol ?? 1,
    solTime,
    npcId,
    npcName: npc.name,
    npcRole: npc.role || npc.ship,
    text,
    eventId,
    eventType: opts.eventType || (isMission ? 'mission' : null),
    title: opts.title || (isMission ? 'Mission Briefing' : null),
    kind: isMission ? 'mission' : (opts.kind || null),
  };
  const last = state.transmissionHistory[0];
  const isDuplicate = eventId
    ? false
    : !!last
      && last.sol === historyEntry.sol
      && last.solTime === historyEntry.solTime
      && last.npcId === historyEntry.npcId
      && last.text === historyEntry.text;
  if (!isDuplicate) {
    state.transmissionHistory.unshift(historyEntry);
    if (state.transmissionHistory.length > 20) state.transmissionHistory = state.transmissionHistory.slice(0, 20);
    window.patchTransmissionsPanel?.();
  }
  if (opts.showPopup === false) return;
  if (activeTransmissionSig === sig) return;
  if (admiralQueue.some(msg => getTransmissionSig(msg.text, msg.npcId) === sig)) return;
  admiralQueue.push({ text, duration: resolvedDuration, npcId, kind: isMission ? 'mission' : null });
  if (!admiralVisible) flushAdmiralQueue();
}

export function flushAdmiralQueue() {
  if (admiralVisible) return; // a message is already running — don't reset it
  if (admiralQueue.length === 0) { admiralVisible = false; return; }
  admiralVisible = true;
  const msg = admiralQueue.shift();
  activeTransmissionSig = getTransmissionSig(msg.text, msg.npcId);
  admiralDuration = msg.duration;
  admiralTimer = msg.duration;
  const npc = NPCS[msg.npcId] || NPCS.juno;
  const isMission = msg.kind === 'mission';
  const avatar = document.getElementById('admiral-avatar');
  const nameEl = document.getElementById('admiral-name');
  const shipEl = document.getElementById('admiral-ship');
  const body   = document.getElementById('admiral-body');
  const prog   = document.getElementById('admiral-progress');
  const fromEl = document.querySelector('#admiral-panel .adm-from');
  if (avatar) { avatar.src = npc.portrait; avatar.alt = npc.name; }
  if (nameEl) nameEl.textContent = npc.name;
  if (shipEl) shipEl.textContent = npc.role || npc.ship;
  if (body) body.innerHTML = msg.text;
  if (prog) prog.style.width = '100%';
  if (fromEl) fromEl.textContent = isMission ? '◈ MISSION BRIEFING' : '◈ INCOMING TRANSMISSION';
  const panel = document.getElementById('admiral-panel');
  if (panel) {
    panel.classList.toggle('is-mission', isMission);
    panel.classList.add('visible');
    panel.classList.remove('pulsing');
    void panel.offsetWidth; // force reflow so animation restarts
    panel.classList.add('pulsing');
    setTimeout(() => panel.classList.remove('pulsing'), 3000);
  }
}

export function tickAdmiral(dt) {
  if (admiralVisible) {
    admiralTimer -= dt;
    const prog = document.getElementById('admiral-progress');
    if (prog) prog.style.width = Math.max(0, (admiralTimer / admiralDuration) * 100) + '%';
    if (admiralTimer <= 0) {
      const panel = document.getElementById('admiral-panel');
      if (panel) {
        panel.classList.remove('visible');
        panel.classList.remove('is-mission');
      }
      admiralVisible = false;
      activeTransmissionSig = null;
      setTimeout(flushAdmiralQueue, 600);
    }
  }
  tickQuestRewardToast(dt);
}

function buildQuestRewardChips(rewards) {
  if (!rewards || typeof rewards !== 'object') return '<div class="qrt-empty">No material rewards</div>';
  const chips = [];
  const coins = Math.floor(Number(rewards.coins) || 0);
  const rp = Math.floor(Number(rewards.rp) || 0);
  const rep = Math.floor(Number(rewards.rep) || 0);
  if (coins > 0) {
    chips.push(`<span class="qrt-chip is-coins"><span class="ms-icon ms-icon-fill" aria-hidden="true">paid</span>$${fmt(coins)}</span>`);
  }
  if (rewards.resources && typeof rewards.resources === 'object') {
    for (const [type, amt] of Object.entries(rewards.resources)) {
      const n = Math.floor(Number(amt) || 0);
      if (n <= 0) continue;
      const icon = resourceIconHtml(type, 14);
      const label = type.charAt(0).toUpperCase() + type.slice(1);
      chips.push(`<span class="qrt-chip">${icon}${fmt(n)} ${label}</span>`);
    }
  }
  if (rp > 0) {
    chips.push(`<span class="qrt-chip is-rp"><span class="ms-icon ms-icon-fill" aria-hidden="true">science</span>${rp} RP</span>`);
  }
  const fId = rewards.factionId;
  const fRep = Math.floor(Number(rewards.factionRep) || 0);
  if (fId && fRep > 0) {
    chips.push(`<span class="qrt-chip is-rep"><span class="ms-icon ms-icon-fill" aria-hidden="true">groups</span>+${fRep} standing</span>`);
  } else if (rep > 0) {
    chips.push(`<span class="qrt-chip is-rep"><span class="ms-icon ms-icon-fill" aria-hidden="true">military_tech</span>+${rep} Rep</span>`);
  }
  return chips.length ? chips.join('') : '<div class="qrt-empty">No material rewards</div>';
}

function getQuestRewardStack() {
  return document.getElementById('quest-reward-stack');
}

function layoutQuestToastStack() {
  // CSS flex handles spacing; force reflow so height transitions can animate
  const stack = getQuestRewardStack();
  if (!stack) return;
  void stack.offsetHeight;
}

function removeQuestToast(id, animate = true) {
  const idx = questToastStack.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const item = questToastStack[idx];
  questToastStack.splice(idx, 1);
  const el = item.el;
  if (!el) return;
  if (!animate) {
    el.remove();
    layoutQuestToastStack();
    return;
  }
  el.classList.remove('visible');
  el.classList.add('leaving');
  // After slide-out, remove node so siblings slide up
  const done = () => {
    el.remove();
    layoutQuestToastStack();
  };
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 380);
}

function tickQuestRewardToast(dt) {
  if (!questToastStack.length) return;
  for (const t of [...questToastStack]) {
    t.timer -= dt;
    const fill = t.el?.querySelector?.('.qrt-progress i');
    if (fill) {
      fill.style.width = `${Math.max(0, (t.timer / Math.max(0.01, t.duration)) * 100)}%`;
    }
    if (t.timer <= 0) removeQuestToast(t.id, true);
  }
}

/** Spawn a quest-complete toast. Multiple stack (oldest on top); ~2s each. */
export function showQuestRewardToast(questId, name, rewards, duration = QUEST_TOAST_DURATION) {
  const stack = getQuestRewardStack();
  if (!stack) return;

  // Cap stack — drop oldest immediately if full
  while (questToastStack.length >= QUEST_TOAST_MAX) {
    removeQuestToast(questToastStack[0].id, false);
  }

  const id = ++_questToastSeq;
  const dur = Math.max(1.2, Number(duration) || QUEST_TOAST_DURATION);
  const el = document.createElement('div');
  el.className = 'quest-reward-toast';
  el.setAttribute('role', 'status');
  el.dataset.toastId = String(id);
  el.dataset.questId = questId || '';
  el.title = 'Open quests';
  el.innerHTML = `
    <div class="qrt-glow" aria-hidden="true"></div>
    <div class="qrt-head">
      <span class="qrt-ico ms-icon ms-icon-fill" aria-hidden="true">emoji_events</span>
      <div class="qrt-head-text">
        <div class="qrt-eyebrow">QUEST COMPLETE</div>
        <div class="qrt-title"></div>
      </div>
      <button type="button" class="qrt-close" data-qrt-close title="Dismiss" aria-label="Dismiss">✕</button>
    </div>
    <div class="qrt-divider"></div>
    <div class="qrt-lab">REWARDS</div>
    <div class="qrt-rewards">${buildQuestRewardChips(rewards)}</div>
    <div class="qrt-progress"><i style="width:100%"></i></div>`;
  const titleEl = el.querySelector('.qrt-title');
  if (titleEl) titleEl.textContent = name || 'Quest';

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-qrt-close]')) {
      e.stopPropagation();
      removeQuestToast(id, true);
      return;
    }
    const qid = el.dataset.questId || '';
    removeQuestToast(id, true);
    if (qid && typeof window.selectQuest === 'function') window.selectQuest(qid);
    window._pendingCmdTab = 'quests';
    if (typeof window.openHdrPanel === 'function') {
      window.openHdrPanel('command', { refresh: true });
    }
  });

  // Newest at bottom of stack (grows downward); oldest at top expires first → others slide up
  stack.appendChild(el);
  questToastStack.push({ id, el, timer: dur, duration: dur, questId: questId || '' });

  // Enter animation next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('visible'));
  });
}

export function dismissQuestRewardToast() {
  // Dismiss topmost (oldest)
  if (questToastStack.length) removeQuestToast(questToastStack[0].id, true);
}

window.dismissQuestRewardToast = dismissQuestRewardToast;
window.openQuestsFromRewardToast = function openQuestsFromRewardToast() {
  const top = questToastStack[0];
  const qid = top?.questId || '';
  if (top) removeQuestToast(top.id, true);
  if (qid && typeof window.selectQuest === 'function') window.selectQuest(qid);
  window._pendingCmdTab = 'quests';
  if (typeof window.openHdrPanel === 'function') {
    window.openHdrPanel('command', { refresh: true });
  }
};

// ── Batch queuing helper ──────────────────────────────────────
// Each entry: { key, text, duration, npc, delay }
//   key      — passed to showOnce (omit or null to always show)
//   text     — HTML string for the message body
//   duration — optional hint; actual time scales with message length
//   npc      — NPC id string (default 'juno')
//   delay    — ms from call time before this entry fires (default 0)
export const transmissionQueue = [];

export function queueTransmissions(arr) {
  for (const entry of arr) {
    transmissionQueue.push(entry);
    const fireDelay = entry.delay || 0;
    setTimeout(() => {
      if (entry.key) {
        showOnce(entry.key, entry.text, entry.duration ?? null, entry.npc || 'juno');
      } else {
        showTransmissionMessage(entry.text, entry.duration ?? null, entry.npc || 'juno');
      }
    }, fireDelay);
  }
}

// Dismiss current message and let the queue continue
export function dismissTransmission() {
  const panel = document.getElementById('admiral-panel');
  if (panel) {
    panel.classList.remove('visible');
    panel.classList.remove('is-mission');
  }
  admiralVisible = false;
  activeTransmissionSig = null;
  setTimeout(flushAdmiralQueue, 600);
}

window.dismissAdmiral = function() {
  const panel = document.getElementById('admiral-panel');
  if (panel) {
    panel.classList.remove('visible');
    panel.classList.remove('is-mission');
  }
  admiralVisible = false;
  activeTransmissionSig = null;
  admiralQueue.length = 0;
};

/** Click active popup → Command → COMMS (latest message selected). */
window.openCommsFromTransmission = function() {
  if (!admiralVisible) return;
  // Select newest history entry (index 0)
  if (typeof window.selectTransmissionHistory === 'function') {
    window.selectTransmissionHistory(0);
  } else {
    // Fallback if panels not loaded yet
    try { window._selectedTransmissionIndex = 0; } catch (_) { /* ignore */ }
  }
  window._pendingCmdTab = 'transmissions';
  if (typeof window.openHdrPanel === 'function') {
    window.openHdrPanel('transmissions', { refresh: true });
  }
};
