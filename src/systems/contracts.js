// ============================================================
// SECTOR CONTRACTS — Command board + Contract Center deliveries
// ============================================================
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS, getResourceTier, isStorableResource } from '../data/resources.js';
import { getContractSlotCap } from './research/definitions.js';
import { addLog, fmt, addCoins } from '../helpers.js';
import { isPoweredBuildingModule } from './buildings/modules.js';

export const CONTRACT_CENTER_ID = 'contract_center';
export const CONTRACT_PERIOD_SOLS = 10;

/** Slot 0 → tiers 1–3, slot 1 → 4–6, slot 2 → 7–10 */
const SLOT_TIER_BANDS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9, 10],
];

function resourcesForTiers(tiers) {
  const out = [];
  for (const t of tiers) {
    const def = MINE_TIERS[t];
    if (def?.resources) out.push(...def.resources.filter((r) => isStorableResource(r)));
  }
  return out;
}

export function isContractCenterModule(moduleOrType) {
  return (typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type) === CONTRACT_CENTER_ID;
}

export function hasPoweredContractCenter() {
  return (state.modules || []).some(
    (m) => isContractCenterModule(m) && isPoweredBuildingModule(m) && (m.health || 0) > 0 && (m.power || 0) > 0,
  );
}

export function ensureContractsState() {
  if (!state.contracts || typeof state.contracts !== 'object') {
    state.contracts = { periodStartSol: state.sol || 1, slots: [] };
  }
  if (!Array.isArray(state.contracts.slots)) state.contracts.slots = [];
  if (!Number.isFinite(state.contracts.periodStartSol)) state.contracts.periodStartSol = state.sol || 1;
  return state.contracts;
}

function rollAmountForTier(tier) {
  const t = Math.max(1, tier || 1);
  // Lower tiers: bigger hauls; high tiers: smaller
  const base = Math.round(400 / Math.sqrt(t));
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.max(40, Math.floor(base * jitter / 10) * 10);
}

function rewardFor(resource, amount) {
  const price = RESOURCE_DEFS[resource]?.sellPrice || 1;
  return Math.max(50, Math.floor(amount * price * 1.35));
}

function pickResource(bandTiers, used) {
  const pool = resourcesForTiers(bandTiers).filter((r) => !used.has(r));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Roll / refresh contract slots for the current period. */
export function rollContracts(force = false) {
  ensureContractsState();
  const cap = getContractSlotCap(state);
  if (cap <= 0 || !hasPoweredContractCenter()) {
    state.contracts.slots = [];
    return;
  }

  const sol = state.sol || 1;
  const elapsed = sol - (state.contracts.periodStartSol || 1);
  const needRoll = force
    || !state.contracts.slots.length
    || elapsed >= CONTRACT_PERIOD_SOLS
    || state.contracts.slots.length !== cap;

  if (!needRoll) return;

  // Complete any unfinished from previous period → expire
  for (const s of state.contracts.slots) {
    if (s.status === 'active' && (s.delivered || 0) < (s.needed || 0)) {
      s.status = 'expired';
    }
  }

  state.contracts.periodStartSol = sol;
  const used = new Set();
  const slots = [];
  for (let i = 0; i < cap; i++) {
    const band = SLOT_TIER_BANDS[Math.min(i, SLOT_TIER_BANDS.length - 1)];
    const resource = pickResource(band, used);
    if (!resource) continue;
    used.add(resource);
    const tier = getResourceTier(resource) || band[0];
    const needed = rollAmountForTier(tier);
    slots.push({
      id: `c${sol}_${i}_${resource}`,
      slotIndex: i,
      resource,
      needed,
      delivered: 0,
      rewardCoins: rewardFor(resource, needed),
      status: 'active', // active | complete | expired
      tierBand: band.slice(),
    });
  }
  state.contracts.slots = slots;
  if (slots.length) {
    addLog(`📋 ${slots.length} sector contract${slots.length > 1 ? 's' : ''} posted (SOL ${sol}).`);
  }
  try { saveGame(); } catch (_) { /* ignore */ }
}

/** Called on SOL tick. */
export function onSolContractsTick() {
  if (!state.researchUnlocks?.unlock_contracts) return;
  ensureContractsState();
  if (!hasPoweredContractCenter()) {
    // Keep slots but don't roll new without a center
    return;
  }
  const sol = state.sol || 1;
  const elapsed = sol - (state.contracts.periodStartSol || 1);
  if (elapsed >= CONTRACT_PERIOD_SOLS || !state.contracts.slots.length) {
    rollContracts(true);
  }
}

/**
 * Apply delivery of cargo to a contract center.
 * Returns amount accepted toward contracts (not stockpiled).
 */
export function applyContractDelivery(resourceType, amount) {
  if (!isStorableResource(resourceType) || amount <= 0) return 0;
  ensureContractsState();
  if (!hasPoweredContractCenter()) return 0;

  let remaining = Math.floor(amount);
  let accepted = 0;
  for (const slot of state.contracts.slots) {
    if (remaining <= 0) break;
    if (slot.status !== 'active') continue;
    if (slot.resource !== resourceType) continue;
    const need = Math.max(0, (slot.needed || 0) - (slot.delivered || 0));
    if (need <= 0) continue;
    const take = Math.min(need, remaining);
    slot.delivered = (slot.delivered || 0) + take;
    remaining -= take;
    accepted += take;
    if (slot.delivered >= slot.needed) {
      slot.status = 'complete';
      slot.delivered = slot.needed;
      if (addCoins(slot.rewardCoins || 0)) {
        addLog(`📋 Contract complete: ${fmt(slot.needed)} ${RESOURCE_DEFS[resourceType]?.label || resourceType} → +$${fmt(slot.rewardCoins)}`);
      }
    }
  }
  if (accepted > 0) {
    try { saveGame(); } catch (_) { /* ignore */ }
    window.patchContractsPanel?.();
  }
  return accepted;
}

export function getContractsUiModel() {
  ensureContractsState();
  const cap = getContractSlotCap(state);
  const unlocked = !!state.researchUnlocks?.unlock_contracts;
  const hasCenter = hasPoweredContractCenter();
  const periodEnd = (state.contracts.periodStartSol || 1) + CONTRACT_PERIOD_SOLS;
  const solsLeft = Math.max(0, periodEnd - (state.sol || 1));
  return {
    unlocked,
    hasCenter,
    cap,
    solsLeft,
    periodStartSol: state.contracts.periodStartSol,
    slots: state.contracts.slots || [],
  };
}
