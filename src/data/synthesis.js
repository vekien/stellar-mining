// ============================================================
// SYNTHESIS RECIPES — research lab composite materials
// ============================================================
import { RESOURCE_DEFS, getResourceTier } from './resources.js';

export const SYNTHESIS_SLOT_COUNT = 3;

/**
 * Craft duration by rarity (seconds).
 * Lab tier shortens time linearly from base (T1) down to min (T10).
 */
export const SYNTHESIS_CRAFT_TIMES = {
  common:    { base: 10, min: 1 },
  uncommon:  { base: 18, min: 2 },
  rare:      { base: 28, min: 4 },
  epic:      { base: 40, min: 6 },
  legendary: { base: 60, min: 10 },
};

/**
 * Recipes: inputs[].amount = stockpile units consumed per 1 output.
 * Costs scale roughly linearly with resource tier (~×2–2.5 each step).
 * Late-game (T9–T10) sinks are intentionally huge for large fleets.
 * Requires those types linked via lab towers.
 */
export const SYNTHESIS_RECIPES = [
  // ── Tier I–II · ~1k total ──
  {
    id: 'oxy_copper',
    name: 'Oxidized Copper',
    color: '#40a090',
    icon: 'copper',
    rarity: 'common',
    inputs: [
      { id: 'copper', amount: 600 },
      { id: 'oxygen', amount: 400 },
    ],
  },
  {
    id: 'sil_steel',
    name: 'Silicate Steel',
    color: '#90b0c8',
    icon: 'silicon',
    rarity: 'common',
    inputs: [
      { id: 'iron', amount: 800 },
      { id: 'silicon', amount: 500 },
    ],
  },
  // ── Tier II–III · ~3k total ──
  {
    id: 'nick_alloy',
    name: 'Ferro-Nickel',
    color: '#80c090',
    icon: 'nickel',
    rarity: 'uncommon',
    inputs: [
      { id: 'iron', amount: 1500 },
      { id: 'nickel', amount: 1200 },
    ],
  },
  {
    id: 'cobaltic',
    name: 'Cobaltic Lattice',
    color: '#7090ff',
    icon: 'cobalt',
    rarity: 'uncommon',
    inputs: [
      { id: 'cobalt', amount: 1400 },
      { id: 'silicon', amount: 1600 },
      { id: 'oxygen', amount: 1000 },
    ],
  },
  // ── Tier IV · ~8k total ──
  {
    id: 'titan_alloy',
    name: 'Titanium Alloy',
    color: '#b0c8e0',
    icon: 'titanium',
    rarity: 'uncommon',
    inputs: [
      { id: 'titanium', amount: 3500 },
      { id: 'aluminum', amount: 3000 },
      { id: 'nickel', amount: 2000 },
    ],
  },
  {
    id: 'alum_bronze',
    name: 'Alum-Bronze',
    color: '#d0a060',
    icon: 'aluminum',
    rarity: 'uncommon',
    inputs: [
      { id: 'copper', amount: 4000 },
      { id: 'aluminum', amount: 3200 },
    ],
  },
  // ── Tier V · ~18k total ──
  {
    id: 'auric_matrix',
    name: 'Auric Matrix',
    color: '#ffe066',
    icon: 'gold',
    rarity: 'rare',
    inputs: [
      { id: 'gold', amount: 5000 },
      { id: 'chromium', amount: 6500 },
      { id: 'titanium', amount: 8000 },
    ],
  },
  {
    id: 'chrome_plate',
    name: 'Chrome Plate',
    color: '#87a7af',
    icon: 'chromium',
    rarity: 'rare',
    inputs: [
      { id: 'chromium', amount: 7000 },
      { id: 'iron', amount: 12000 },
      { id: 'nickel', amount: 5000 },
    ],
  },
  // ── Tier VI · ~40k total ──
  {
    id: 'argent_flux',
    name: 'Argent Flux',
    color: '#c8ccd4',
    icon: 'silver',
    rarity: 'rare',
    inputs: [
      { id: 'silver', amount: 9000 },
      { id: 'neon', amount: 11000 },
      { id: 'gold', amount: 8000 },
      { id: 'silicon', amount: 15000 },
    ],
  },
  // ── Tier VII · ~90k total ──
  {
    id: 'plat_catalyst',
    name: 'Platinum Catalyst',
    color: '#d8d8e8',
    icon: 'platinum',
    rarity: 'epic',
    inputs: [
      { id: 'platinum', amount: 18000 },
      { id: 'xenon', amount: 22000 },
      { id: 'silver', amount: 20000 },
      { id: 'cobalt', amount: 30000 },
    ],
  },
  // ── Tier VIII · ~180k total ──
  {
    id: 'irid_core',
    name: 'Iridium Core',
    color: '#8ea0bc',
    icon: 'iridium',
    rarity: 'epic',
    inputs: [
      { id: 'iridium', amount: 35000 },
      { id: 'palladium', amount: 40000 },
      { id: 'platinum', amount: 45000 },
      { id: 'chromium', amount: 60000 },
    ],
  },
  // ── Tier IX · ~350k total ──
  {
    id: 'radiant_alloy',
    name: 'Radiant Alloy',
    color: '#78d94a',
    icon: 'uranium',
    rarity: 'epic',
    inputs: [
      { id: 'uranium', amount: 50000 },
      { id: 'osmium', amount: 55000 },
      { id: 'iridium', amount: 60000 },
      { id: 'titanium', amount: 100000 },
      { id: 'gold', amount: 80000 },
    ],
  },
  // ── Tier X — peak sink, 5 inputs · ~750k total ──
  {
    id: 'stellar_matrix',
    name: 'Stellar Matrix',
    color: '#ffffff',
    icon: 'hafnium',
    rarity: 'legendary',
    inputs: [
      { id: 'hafnium', amount: 100000 },
      { id: 'rhodium', amount: 120000 },
      { id: 'uranium', amount: 140000 },
      { id: 'platinum', amount: 180000 },
      { id: 'gold', amount: 220000 },
    ],
  },
];

export function getSynthesisRecipe(id) {
  return SYNTHESIS_RECIPES.find((recipe) => recipe.id === id) || null;
}

export function normalizeSynthesisSlots(slots) {
  const next = Array.isArray(slots) ? slots.slice(0, SYNTHESIS_SLOT_COUNT) : [];
  while (next.length < SYNTHESIS_SLOT_COUNT) next.push(null);
  return next.map((id) => (getSynthesisRecipe(id) ? id : null));
}

/** Count linked resource nodes by type from lab network info.resources entries. */
export function getLinkedNodeCounts(labInfo) {
  const counts = new Map();
  for (const entry of labInfo?.resources || []) {
    const type = entry?.node?.type;
    if (!type) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return counts;
}

/** Recipe is available when every input type is linked via lab towers. */
export function getRecipeStatus(recipe, linkedCounts) {
  if (!recipe) return { ok: false, missing: [] };
  const missing = [];
  let ok = true;
  for (const input of recipe.inputs) {
    const have = linkedCounts.get(input.id) || 0;
    if (have <= 0) {
      ok = false;
      missing.push({ id: input.id, have, need: 1 });
    }
  }
  return { ok, missing };
}

/**
 * Craft duration in seconds for a recipe at a given lab tier (1–10).
 * Linear: T1 = base, T10 = min.
 */
export function getSynthesisCraftTime(recipe, labLevel = 1) {
  const rarity = recipe?.rarity || 'common';
  const times = SYNTHESIS_CRAFT_TIMES[rarity] || SYNTHESIS_CRAFT_TIMES.common;
  const lvl = Math.max(1, Math.min(10, Math.floor(labLevel || 1)));
  const span = times.base - times.min;
  const t = times.base - ((lvl - 1) * span) / 9;
  return Math.max(times.min, Math.round(t * 10) / 10);
}

export function getResourceLabel(type) {
  return RESOURCE_DEFS[type]?.label || type;
}

export function getResourceColor(type) {
  return RESOURCE_DEFS[type]?.color || '#cde';
}

export function getResourceTierLabel(type) {
  return getResourceTier(type) || '?';
}
