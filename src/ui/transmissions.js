// ============================================================
// TRANSMISSION / ADMIRAL MESSAGE SYSTEM
// ============================================================
import { state } from '../state.js';
import { NPCS } from '../data/npcs.js';
import { SOL_DURATION } from '../constants.js';

const admiralQueue = [];
let admiralTimer = 0;
let admiralDuration = 0;
let admiralVisible = false;

export function showOnce(id, text, duration = 10, npcId) {
  if (state.seenMsgs[id]) return;
  state.seenMsgs[id] = true;
  showTransmissionMessage(text, duration, npcId);
}

export function showTransmissionMessage(text, duration = 10, npcId = 'juno') {
  const npc = NPCS[npcId] || NPCS.juno;
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
  };
  const last = state.transmissionHistory[0];
  const isDuplicate = !!last
    && last.sol === historyEntry.sol
    && last.solTime === historyEntry.solTime
    && last.npcId === historyEntry.npcId
    && last.text === historyEntry.text;
  if (!isDuplicate) {
    state.transmissionHistory.unshift(historyEntry);
    if (state.transmissionHistory.length > 20) state.transmissionHistory = state.transmissionHistory.slice(0, 20);
    window.patchTransmissionsPanel?.();
  }
  admiralQueue.push({ text, duration, npcId });
  if (!admiralVisible) flushAdmiralQueue();
}

export function flushAdmiralQueue() {
  if (admiralVisible) return; // a message is already running — don't reset it
  if (admiralQueue.length === 0) { admiralVisible = false; return; }
  admiralVisible = true;
  const msg = admiralQueue.shift();
  admiralDuration = msg.duration;
  admiralTimer = msg.duration;
  const npc = NPCS[msg.npcId] || NPCS.juno;
  const avatar = document.getElementById('admiral-avatar');
  const nameEl = document.getElementById('admiral-name');
  const shipEl = document.getElementById('admiral-ship');
  const body   = document.getElementById('admiral-body');
  const prog   = document.getElementById('admiral-progress');
  if (avatar) { avatar.src = npc.portrait; avatar.alt = npc.name; }
  if (nameEl) nameEl.textContent = npc.name;
  if (shipEl) shipEl.textContent = npc.role || npc.ship;
  if (body) body.innerHTML = msg.text;
  if (prog) prog.style.width = '100%';
  const panel = document.getElementById('admiral-panel');
  if (panel) {
    panel.classList.add('visible');
    panel.classList.remove('pulsing');
    void panel.offsetWidth; // force reflow so animation restarts
    panel.classList.add('pulsing');
    setTimeout(() => panel.classList.remove('pulsing'), 3000);
  }
}

export function tickAdmiral(dt) {
  if (!admiralVisible) return;
  admiralTimer -= dt;
  const prog = document.getElementById('admiral-progress');
  if (prog) prog.style.width = Math.max(0, (admiralTimer / admiralDuration) * 100) + '%';
  if (admiralTimer <= 0) {
    const panel = document.getElementById('admiral-panel');
    if (panel) panel.classList.remove('visible');
    admiralVisible = false;
    setTimeout(flushAdmiralQueue, 600);
  }
}

// ── Batch queuing helper ──────────────────────────────────────
// Each entry: { key, text, duration, npc, delay }
//   key      — passed to showOnce (omit or null to always show)
//   text     — HTML string for the message body
//   duration — seconds the panel stays visible (default 10)
//   npc      — NPC id string (default 'juno')
//   delay    — ms from call time before this entry fires (default 0)
export const transmissionQueue = [];

export function queueTransmissions(arr) {
  for (const entry of arr) {
    transmissionQueue.push(entry);
    const fireDelay = entry.delay || 0;
    setTimeout(() => {
      if (entry.key) {
        showOnce(entry.key, entry.text, entry.duration ?? 10, entry.npc || 'juno');
      } else {
        showTransmissionMessage(entry.text, entry.duration ?? 10, entry.npc || 'juno');
      }
    }, fireDelay);
  }
}

// Dismiss current message and let the queue continue
export function dismissTransmission() {
  const panel = document.getElementById('admiral-panel');
  if (panel) panel.classList.remove('visible');
  admiralVisible = false;
  setTimeout(flushAdmiralQueue, 600);
}

window.dismissAdmiral = function() {
  const panel = document.getElementById('admiral-panel');
  if (panel) panel.classList.remove('visible');
  admiralVisible = false;
  admiralQueue.length = 0;
};
