// ============================================================
// KEY ITEM INVENTORY
// ============================================================
import { state, saveGame } from '../state.js';
import { getKeyItemDef } from '../data/keyItems.js';
import { addLog } from '../helpers.js';

export function ensureKeyItems() {
  if (!Array.isArray(state.keyItems)) state.keyItems = [];
  return state.keyItems;
}

export function hasKeyItem(id) {
  ensureKeyItems();
  return state.keyItems.some((k) => k.id === id);
}

export function getKeyItem(id) {
  ensureKeyItems();
  return state.keyItems.find((k) => k.id === id) || null;
}

/** Grant a key item to base inventory (unique by id). */
export function grantKeyItem(id, opts = {}) {
  ensureKeyItems();
  if (hasKeyItem(id)) return false;
  const def = getKeyItemDef(id);
  if (!def) return false;
  state.keyItems.push({
    id,
    acquiredSol: state.sol || 1,
    flags: opts.flags || {},
  });
  if (!opts.silent) addLog(`◈ Key item secured: ${def.name}`);
  try { saveGame(); } catch (_) { /* ignore */ }
  return true;
}

export function removeKeyItem(id) {
  ensureKeyItems();
  const before = state.keyItems.length;
  state.keyItems = state.keyItems.filter((k) => k.id !== id);
  return state.keyItems.length < before;
}
