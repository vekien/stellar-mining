// ============================================================
// RENAME OVERLAY — ship/base rename UI
// ============================================================
import { state } from '../state.js';
import { refresh } from './refresh.js';
import { renderBasePanel } from './basePanel.js';

export function openRenameOverlay(shipId) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship) return;
  state.renamingShip = shipId;
  state.renamingBase = false;
  const overlay = document.getElementById('rename-overlay');
  const input   = document.getElementById('rename-input-field');
  const titleEl = document.querySelector('#rename-box .rename-title');
  input.value   = ship.name;
  input.placeholder = 'Enter ship name...';
  if (titleEl) titleEl.textContent = '✎ Name Your Ship';
  overlay.classList.add('show');
  setTimeout(() => { input.focus(); input.select(); }, 30);

  input.onkeydown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename(input.value); }
    if (e.key === 'Escape') { closeRenameOverlay(); }
    e.stopPropagation();
  };
  overlay.onclick = e => { if (e.target === overlay) commitRename(input.value); };
}

export function openBaseRenameOverlay() {
  state.basePanelOpen = false;
  renderBasePanel();
  state.renamingShip = null;
  state.renamingBase = true;
  const overlay = document.getElementById('rename-overlay');
  const input   = document.getElementById('rename-input-field');
  const titleEl = document.querySelector('#rename-box .rename-title');
  input.value   = state.base.name || 'Base Station';
  input.placeholder = 'Enter base name...';
  if (titleEl) titleEl.textContent = '✎ Name Your Base';
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
  state.renamingBase = false;
  document.getElementById('rename-overlay').classList.remove('show');
}

export function commitRename(newName) {
  const cleanName = (newName || '').trim();
  if (state.renamingBase) {
    state.base.name = cleanName || state.base.name || 'Base Station';
  } else {
    const ship = state.ships.find(s => s.id === state.renamingShip);
    if (ship) ship.name = cleanName || ship.name;
  }
  closeRenameOverlay();
  if (refresh.ui) refresh.ui();
}

window.openRenameOverlay = openRenameOverlay;
window.openBaseRenameOverlay = openBaseRenameOverlay;
window.closeRenameOverlay = closeRenameOverlay;
window.commitRename = commitRename;
