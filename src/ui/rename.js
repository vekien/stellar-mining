// ============================================================
// RENAME OVERLAY — ship/base rename UI
// ============================================================
import { state } from '../state.js';
import { invalidateEntityListCache } from '../data/modules.js';
import { refresh } from './refresh.js';
import { renderBasePanel } from './basePanel.js';

export function openRenameOverlay(shipId) {
  const ship = state.ships.find(s => s.id === shipId);
  if (!ship) return;
  state.renamingShip = shipId;
  state.renamingBase = false;
  state.renamingStorage = null;
  state.renamingTurret = null;
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
  state.renamingStorage = null;
  state.renamingTurret = null;
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

export function openStorageRenameOverlay(storageId) {
  const module = state.modules.find(s => s.id === storageId);
  if (!module) return;
  state.selectedModule = storageId;
  state.renamingShip = null;
  state.renamingBase = false;
  state.renamingStorage = storageId;
  state.renamingTurret = null;
  const overlay = document.getElementById('rename-overlay');
  const input   = document.getElementById('rename-input-field');
  const titleEl = document.querySelector('#rename-box .rename-title');
  input.value = module.name;
  input.placeholder = 'Enter module name...';
  if (titleEl) titleEl.textContent = '✎ Name Your Module';
  overlay.classList.add('show');
  setTimeout(() => { input.focus(); input.select(); }, 30);

  input.onkeydown = e => {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename(input.value); }
    if (e.key === 'Escape') { closeRenameOverlay(); }
    e.stopPropagation();
  };
  overlay.onclick = e => { if (e.target === overlay) commitRename(input.value); };
}

export function openTurretRenameOverlay(turretId) {
  const turret = state.turrets.find(entry => entry.id === turretId);
  if (!turret) return;
  state.selectedTurret = turretId;
  state.renamingShip = null;
  state.renamingBase = false;
  state.renamingStorage = null;
  state.renamingTurret = turretId;
  const overlay = document.getElementById('rename-overlay');
  const input   = document.getElementById('rename-input-field');
  const titleEl = document.querySelector('#rename-box .rename-title');
  input.value = turret.name || 'Turret';
  input.placeholder = 'Enter turret name...';
  if (titleEl) titleEl.textContent = '✎ Name Your Turret';
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
  state.renamingStorage = null;
  state.renamingTurret = null;
  document.getElementById('rename-overlay').classList.remove('show');
}

export function commitRename(newName) {
  const cleanName = (newName || '').trim();
  const wasBase = state.renamingBase;
  if (state.renamingBase) {
    state.base.name = cleanName || state.base.name || 'Base Station';
    invalidateEntityListCache();
  } else if (state.renamingStorage) {
    const storage = state.modules.find(s => s.id === state.renamingStorage);
    if (storage) storage.name = cleanName || storage.name;
    invalidateEntityListCache();
  } else if (state.renamingTurret) {
    const turret = state.turrets.find(entry => entry.id === state.renamingTurret);
    if (turret) turret.name = cleanName || turret.name;
    invalidateEntityListCache();
  } else {
    const ship = state.ships.find(s => s.id === state.renamingShip);
    if (ship) ship.name = cleanName || ship.name;
  }
  closeRenameOverlay();
  if (wasBase) {
    state.basePanelOpen = true;
    renderBasePanel();
  }
  if (window.patchStorageModal) window.patchStorageModal();
  if (window.patchTurretModal && state.selectedTurret) window.patchTurretModal();
  if (refresh.ui) refresh.ui();
}

window.openRenameOverlay = openRenameOverlay;
window.openBaseRenameOverlay = openBaseRenameOverlay;
window.openStorageRenameOverlay = openStorageRenameOverlay;
window.openTurretRenameOverlay = openTurretRenameOverlay;
window.closeRenameOverlay = closeRenameOverlay;
window.commitRename = commitRename;
