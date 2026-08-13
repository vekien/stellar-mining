// ============================================================
// LIFETIME GAINS — monotonically increasing economy counters
// ============================================================
import { state } from '../state.js';
import { isStorableResource } from '../data/resources.js';

function emptyResources() {
  return {};
}

export function ensureLifetimeGained() {
  if (!state.lifetimeGained || typeof state.lifetimeGained !== 'object') {
    state.lifetimeGained = { coins: 0, resources: emptyResources() };
  }
  if (!state.lifetimeGained.resources || typeof state.lifetimeGained.resources !== 'object') {
    state.lifetimeGained.resources = emptyResources();
  }
  state.lifetimeGained.coins = Math.max(0, Math.floor(Number(state.lifetimeGained.coins) || 0));
  // One-time seed from current holdings if counters are empty (old saves)
  if (!state.lifetimeGained._seeded) {
    seedLifetimeFromHoldings();
    state.lifetimeGained._seeded = true;
  }
  return state.lifetimeGained;
}

/** Seed lifetime floors from current stockpile/coins (never lowers counters). */
export function seedLifetimeFromHoldings() {
  ensureLifetimeGainedRaw();
  const coins = Math.max(0, Math.floor(state.coins || 0));
  if (coins > (state.lifetimeGained.coins || 0)) {
    state.lifetimeGained.coins = coins;
  }
  const res = state.resources || {};
  for (const [type, amt] of Object.entries(res)) {
    if (!isStorableResource(type)) continue;
    const n = Math.max(0, Math.floor(Number(amt) || 0));
    const cur = Math.max(0, Math.floor(Number(state.lifetimeGained.resources[type]) || 0));
    if (n > cur) state.lifetimeGained.resources[type] = n;
  }
}

function ensureLifetimeGainedRaw() {
  if (!state.lifetimeGained || typeof state.lifetimeGained !== 'object') {
    state.lifetimeGained = { coins: 0, resources: emptyResources(), _seeded: false };
  }
  if (!state.lifetimeGained.resources || typeof state.lifetimeGained.resources !== 'object') {
    state.lifetimeGained.resources = emptyResources();
  }
}

export function recordLifetimeCoins(amount) {
  const n = Math.floor(Number(amount) || 0);
  if (n <= 0) return;
  ensureLifetimeGained();
  state.lifetimeGained.coins = Math.max(0, Math.floor(state.lifetimeGained.coins || 0) + n);
}

export function recordLifetimeResource(type, amount) {
  const n = Math.floor(Number(amount) || 0);
  if (n <= 0 || !type || !isStorableResource(type)) return;
  ensureLifetimeGained();
  const cur = Math.max(0, Math.floor(Number(state.lifetimeGained.resources[type]) || 0));
  state.lifetimeGained.resources[type] = cur + n;
}

export function getLifetimeCoins() {
  ensureLifetimeGained();
  return Math.max(0, Math.floor(state.lifetimeGained.coins || 0));
}

export function getLifetimeResource(type) {
  ensureLifetimeGained();
  return Math.max(0, Math.floor(Number(state.lifetimeGained.resources?.[type]) || 0));
}
