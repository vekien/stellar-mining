// ============================================================
// FACTION REPUTATION + STANDING PERKS
// ============================================================
import { state } from '../state.js';
import {
  FACTION_DEFS,
  FACTION_IDS,
  FACTION_PERKS,
  getFactionDef,
  getFactionPerks,
  getStandingTier,
  standingLabel,
} from '../data/factions.js';
import { addLog } from '../helpers.js';

export const FACTIONS_UNLOCK_ID = 'factions';

export function hasFactionsUnlocked(st = state) {
  return !!st?.researchUnlocks?.[FACTIONS_UNLOCK_ID];
}

export function emptyFactionRep() {
  const out = {};
  for (const id of FACTION_IDS) out[id] = 0;
  return out;
}

/** Normalize rep map only (no perk sync — avoids recursion). */
function normalizeFactionRep() {
  if (!state.factionRep || typeof state.factionRep !== 'object') {
    state.factionRep = emptyFactionRep();
    // Migrate old global reputation into Frontier Union (expansion default)
    const legacy = Math.max(0, Math.floor(Number(state.reputation) || 0));
    if (legacy > 0) {
      state.factionRep.frontier_union = legacy;
      state.reputation = 0;
    }
  }
  for (const id of FACTION_IDS) {
    if (!Number.isFinite(state.factionRep[id])) state.factionRep[id] = 0;
    else state.factionRep[id] = Math.floor(state.factionRep[id]);
  }
  return state.factionRep;
}

/** Normalize state.factionRep + sync standing perks. */
export function ensureFactionRep() {
  normalizeFactionRep();
  ensureFactionPerks();
  return state.factionRep;
}

export function getFactionRep(factionId) {
  normalizeFactionRep();
  return Math.floor(Number(state.factionRep[factionId]) || 0);
}

/**
 * Adjust standing with a faction. Negative deltas allowed (future penalties).
 * @returns {{ before: number, after: number, delta: number }|null}
 */
export function addFactionRep(factionId, delta, opts = {}) {
  const def = getFactionDef(factionId);
  if (!def) return null;
  normalizeFactionRep();
  const d = Math.floor(Number(delta) || 0);
  if (!d) {
    const cur = getFactionRep(factionId);
    return { before: cur, after: cur, delta: 0 };
  }
  const before = getFactionRep(factionId);
  // Allow full standing curve (Vanguard needs 3000+)
  const after = Math.max(-5000, Math.min(20000, before + d));
  state.factionRep[factionId] = after;
  if (!opts.silent && d > 0) {
    addLog(`◈ ${def.shortName} standing +${d} (${standingLabel(after)})`);
  } else if (!opts.silent && d < 0) {
    addLog(`◈ ${def.shortName} standing ${d} (${standingLabel(after)})`);
  }
  syncFactionPerks(factionId, { silent: opts.silent });
  return { before, after, delta: after - before };
}

export function pickFactionId() {
  return FACTION_IDS[Math.floor(Math.random() * FACTION_IDS.length)];
}

export function getFactionsUiModel() {
  ensureFactionRep();
  return listWithRep();
}

function listWithRep() {
  return FACTION_IDS.map((id) => {
    const def = FACTION_DEFS[id];
    const rep = getFactionRep(id);
    return { def, rep, label: standingLabel(rep) };
  });
}

// ── Standing perks ───────────────────────────────────────────

function normalizeFactionPerksMap() {
  if (!state.factionPerks || typeof state.factionPerks !== 'object') {
    state.factionPerks = {};
  }
  for (const id of FACTION_IDS) {
    if (!Array.isArray(state.factionPerks[id])) state.factionPerks[id] = [];
  }
  return state.factionPerks;
}

export function ensureFactionPerks() {
  normalizeFactionRep();
  normalizeFactionPerksMap();
  // Auto-grant anything already earned by standing (no re-enter ensureFactionRep)
  for (const id of FACTION_IDS) syncFactionPerks(id, { silent: true });
  return state.factionPerks;
}

/** Unlock perks whose rank ≤ current positive standing tier. */
export function syncFactionPerks(factionId, opts = {}) {
  normalizeFactionRep();
  normalizeFactionPerksMap();
  if (!FACTION_IDS.includes(factionId)) return [];
  const rep = Math.floor(Number(state.factionRep[factionId]) || 0);
  const tier = getStandingTier(rep);
  if (tier < 1) return state.factionPerks[factionId];
  const owned = new Set(state.factionPerks[factionId]);
  const def = getFactionDef(factionId);
  for (const perk of getFactionPerks(factionId)) {
    if (perk.rank <= tier && !owned.has(perk.id)) {
      state.factionPerks[factionId].push(perk.id);
      owned.add(perk.id);
      if (!opts.silent) {
        addLog(`◈ ${def?.shortName || 'Faction'} perk unlocked: ${perk.name}`);
      }
    }
  }
  return state.factionPerks[factionId];
}

export function hasFactionPerk(perkId) {
  normalizeFactionPerksMap();
  for (const id of FACTION_IDS) {
    if ((state.factionPerks[id] || []).includes(perkId)) return true;
  }
  return false;
}

export function listActiveFactionPerks() {
  // Sync once so standing-earned perks are granted, without recursive ensure loops
  ensureFactionPerks();
  const out = [];
  for (const fid of FACTION_IDS) {
    const owned = new Set(state.factionPerks[fid] || []);
    for (const perk of getFactionPerks(fid)) {
      if (owned.has(perk.id)) out.push({ ...perk, factionId: fid });
    }
  }
  return out;
}

/** Product of all active effect keys (for mults). Additive keys handled separately. */
export function getFactionEffectMult(key, base = 1) {
  let m = base;
  for (const perk of listActiveFactionPerks()) {
    const v = perk.effect?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) m *= v;
  }
  return m;
}

export function getFactionEffectSum(key, base = 0) {
  let s = base;
  for (const perk of listActiveFactionPerks()) {
    const v = perk.effect?.[key];
    if (typeof v === 'number' && Number.isFinite(v)) s += v;
  }
  return s;
}

export function hasFactionEffectFlag(key) {
  return listActiveFactionPerks().some((p) => !!p.effect?.[key]);
}

/** Scale craft material requirements by Ironhands yard perks. */
export function scaleCraftReqs(reqs) {
  const mult = getFactionEffectMult('craftMatMult', 1);
  if (!reqs || mult >= 0.999) return reqs || {};
  const out = {};
  for (const [r, n] of Object.entries(reqs)) {
    out[r] = Math.max(1, Math.floor(Number(n) * mult));
  }
  return out;
}

export function getFactionCraftTimeMult() {
  return getFactionEffectMult('craftTimeMult', 1);
}

export function getFactionSalvageMult() {
  return getFactionEffectMult('salvageMult', 1);
}

export function getFactionMineSpeedMult() {
  return getFactionEffectMult('mineSpeedMult', 1);
}

export function getFactionLoadSpeedMult() {
  return getFactionEffectMult('loadSpeedMult', 1);
}

export function getFactionTurretDmgMult() {
  return getFactionEffectMult('turretDmgMult', 1);
}

export function getFactionCombatHpMult() {
  return getFactionEffectMult('combatHpMult', 1);
}

export function getFactionBaseHpMult() {
  return getFactionEffectMult('baseHpMult', 1);
}

export function getFactionPirateHeatMult() {
  return getFactionEffectMult('pirateHeatMult', 1);
}

export function getFactionSellPriceMult() {
  return getFactionEffectMult('sellPriceMult', 1);
}

export function getFactionBuildingUpgradeCoinMult() {
  return getFactionEffectMult('buildingUpgradeCoinMult', 1);
}

export function getFactionShipUpgradeCoinMult() {
  return getFactionEffectMult('shipUpgradeCoinMult', 1);
}

/** Apply Ironhands Yard Shortcuts (etc.) to a ship upgrade coin total. */
export function scaleShipUpgradeCoins(coins) {
  const n = Math.floor(Number(coins) || 0);
  if (n <= 0) return 0;
  return Math.max(1, Math.floor(n * getFactionShipUpgradeCoinMult()));
}

export function getFactionRepairCostMult() {
  return getFactionEffectMult('repairCostMult', 1);
}

export function getFactionRpCapBonus() {
  return Math.floor(getFactionEffectSum('rpCapBonus', 0));
}

export function getFactionSolRpBonus() {
  return Math.floor(getFactionEffectSum('solRpBonus', 0));
}

export function getFactionBhFloorBonus() {
  return getFactionEffectSum('bhFloorBonus', 0);
}

export function hasGalaxySurveyUnlocked() {
  return hasFactionEffectFlag('galaxySurvey');
}

/** UI model: perks with locked/owned state for a faction. */
export function getFactionPerksForUi(factionId) {
  ensureFactionPerks();
  const rep = Math.floor(Number(state.factionRep?.[factionId]) || 0);
  const tier = getStandingTier(rep);
  const owned = new Set(state.factionPerks[factionId] || []);
  return getFactionPerks(factionId).map((perk) => ({
    ...perk,
    owned: owned.has(perk.id),
    unlocked: tier >= perk.rank,
    locked: tier < perk.rank,
  }));
}
