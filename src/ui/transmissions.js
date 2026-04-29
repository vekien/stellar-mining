// ============================================================
// TRANSMISSION / ADMIRAL MESSAGE SYSTEM
// ============================================================
import { state } from '../state.js';
import { NPCS } from '../data/npcs.js';

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
  admiralQueue.push({ text, duration, npcId });
  if (!admiralVisible) flushAdmiralQueue();
}

export function flushAdmiralQueue() {
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
  if (shipEl) shipEl.textContent = npc.ship;
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
