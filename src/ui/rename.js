// ============================================================
// RENAME OVERLAY — ship rename UI
// ============================================================
import { state } from '../state.js';
import { refresh } from './refresh.js';

export function openRenameOverlay(shipId) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship) return;
  state.renamingShip = shipId;
  const overlay = document.getElementById('rename-overlay');
  const input   = document.getElementById('rename-input-field');
  input.value   = ship.name;
  overlay.classList.add('show');
  setTimeout(() => { input.focus(); input.select(); }, 30);

  input.onkeydown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename(input.value); }
    if (e.key === 'Escape') { closeRenameOverlay(); }
    e.stopPropagation();
  };
  overlay.onclick = e => { if (e.target === overlay) commitRename(input.value); };
}

export function closeRenameOverlay() {
  state.renamingShip = null;
  document.getElementById('rename-overlay').classList.remove('show');
}

export function commitRename(newName) {
  const ship = state.ships.find(s => s.id === state.renamingShip);
  if (ship) ship.name = (newName || '').trim() || ship.name;
  closeRenameOverlay();
  if (refresh.ui) refresh.ui();
}

window.openRenameOverlay = openRenameOverlay;
window.closeRenameOverlay = closeRenameOverlay;
window.commitRename = commitRename;
