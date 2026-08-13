// ============================================================
// MARKET — sell prices, buy offers, trading
// ============================================================
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS, getResourceTier } from '../data/resources.js';
import { BASE_MAX_SHIPS } from '../data/base.js';
import { addLog, fmt, addCoins, spendCoins } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { showOnce } from '../ui/transmissions.js';
import { NPCS } from '../data/npcs.js';
import { notifyResourceSold } from './quests.js';
import { getFactionSellPriceMult } from './factions.js';

export function isDemandedType(type) {
  if (state.marketBoost?.type === type) return true;
  return !!state.extraDemands?.some((d) => d.type === type);
}

/** SOL base-price variance percent for a resource (−25…+25, 0 = flat). */
export function getMarketVariancePct(type) {
  const n = Number(state.marketVariance?.[type]);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.max(-25, Math.min(25, Math.round(n)));
}

/** Demand bonus as whole percent extra (e.g. 1.57× → 57). */
export function getDemandBonusPct(type) {
  let mult = null;
  if (state.marketBoost?.type === type) mult = state.marketBoost.multiplier ?? 1.5;
  else if (state.extraDemands?.length) {
    const extra = state.extraDemands.find((d) => d.type === type);
    if (extra) mult = extra.multiplier ?? 1.5;
  }
  if (!Number.isFinite(mult) || mult <= 1) return 0;
  return Math.max(0, Math.round((mult - 1) * 100));
}

function getBaseSellPrice(type) {
  let base = RESOURCE_DEFS[type]?.sellPrice || 0;
  if (state.researchUnlocks?.market_influence) base = Math.round(base * 1.10);
  base = Math.round(base * (getFactionSellPriceMult() || 1));
  return base;
}

export function getSellPrice(type) {
  let price = getBaseSellPrice(type);
  const variancePct = getMarketVariancePct(type);
  if (variancePct !== 0) {
    price = Math.max(1, Math.round(price * (1 + variancePct / 100)));
  }
  // Demand is additive on top of variance (multiplier on the varied price)
  if (state.marketBoost && state.marketBoost.type === type) {
    const mult = state.marketBoost.multiplier ?? 1.5;
    return Math.max(1, Math.round(price * mult));
  }
  if (state.extraDemands?.length) {
    const extra = state.extraDemands.find((d) => d.type === type);
    if (extra) return Math.max(1, Math.round(price * (extra.multiplier ?? 1.5)));
  }
  return Math.max(0, price);
}

/** Buy price is always 2× current sell price. */
export function getBuyPrice(type) {
  return Math.max(1, getSellPrice(type) * 2);
}

/** Qty range for market buy lots by base rank (1–10). */
export function getBuyOfferQtyRange(baseLevel = state.base?.level || 1) {
  const t = Math.max(1, Math.min(10, Number(baseLevel) || 1));
  // Rank 1: 1–1,000 · Rank 10: 10,000–100,000
  const minQ = Math.round(1 + (10000 - 1) * ((t - 1) / 9));
  const maxQ = Math.round(1000 + (100000 - 1000) * ((t - 1) / 9));
  return { minQ, maxQ };
}

function isBuyableResource(type) {
  const def = RESOURCE_DEFS[type];
  if (!def || def.special || (def.sellPrice || 0) <= 0) return false;
  const tier = getResourceTier(type) || 1;
  return tier <= (state.base?.level || 1);
}

function getBuyableResourceTypes() {
  return Object.keys(RESOURCE_DEFS).filter(isBuyableResource);
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Roll this SOL's buy lots. Stored on save so refreshing can't re-roll stock.
 * @returns {{ sol: number, offers: Array<{ type: string, qty: number, purchased: number }> }}
 */
export function rollMarketBuyOffers() {
  const types = getBuyableResourceTypes();
  const shuffled = types.slice().sort(() => Math.random() - 0.5);
  // 3–6 offers (or fewer if not enough types unlocked)
  const want = Math.min(shuffled.length, randInt(3, 6));
  const { minQ, maxQ } = getBuyOfferQtyRange(state.base?.level || 1);
  const offers = shuffled.slice(0, want).map((type) => ({
    type,
    qty: randInt(minQ, maxQ),
    purchased: 0,
  }));
  state.marketBuyOffers = {
    sol: state.sol || 1,
    offers,
  };
  return state.marketBuyOffers;
}

/** Ensure offers exist for the current SOL (roll if missing / stale). */
export function ensureMarketBuyOffers() {
  const cur = state.marketBuyOffers;
  const sol = state.sol || 1;
  if (!cur || cur.sol !== sol || !Array.isArray(cur.offers)) {
    return rollMarketBuyOffers();
  }
  // Drop offers the player can no longer buy (rank dropped — shouldn't happen)
  cur.offers = cur.offers.filter((o) => o && isBuyableResource(o.type));
  // Clamp purchased
  for (const o of cur.offers) {
    o.qty = Math.max(0, Math.floor(Number(o.qty) || 0));
    o.purchased = Math.max(0, Math.min(o.qty, Math.floor(Number(o.purchased) || 0)));
  }
  state.marketBuyOffers = cur;
  return cur;
}

export function getMarketBuyOffers() {
  return ensureMarketBuyOffers();
}

export function getBuyOfferRemaining(offer) {
  if (!offer) return 0;
  return Math.max(0, (offer.qty || 0) - (offer.purchased || 0));
}

window.sellResource = function(type, amount) {
  const have = state.resources[type] || 0;
  const sell = Math.min(have, amount);
  if (sell <= 0) return;
  const price = getSellPrice(type);
  const earned = sell * price;
  if (!addCoins(earned)) return;
  state.resources[type] -= sell;
  const boosted = isDemandedType(type) ? ' ✦' : '';
  addLog(`💰 Sold ${fmt(sell)}x ${RESOURCE_DEFS[type].label} for ${fmt(earned)} coins${boosted}`);
  notifyResourceSold(type, sell);
  import('./quests.js').then((q) => q.notifyCoinsGained?.()).catch(() => {});
  const maxBaseTier = BASE_MAX_SHIPS.length;
  if (state.coins >= 50000 && state.base.level < maxBaseTier) {
    showOnce('sera_base_upgrade', NPCS.sera.transmissionLines.sera_base_upgrade, 35, 'sera');
  }
  if (refresh.ui) refresh.ui();
};

window.buyResource = function(type, amount) {
  ensureMarketBuyOffers();
  const offer = (state.marketBuyOffers?.offers || []).find((o) => o.type === type);
  if (!offer) {
    addLog('⚠ That resource is not on the market this SOL.');
    return;
  }
  if (!isBuyableResource(type)) {
    addLog('⚠ Resource locked at your current base tier.');
    return;
  }
  const remaining = getBuyOfferRemaining(offer);
  const want = Math.max(0, Math.floor(Number(amount) || 0));
  const buy = Math.min(remaining, want);
  if (buy <= 0) {
    addLog('⚠ No stock left on that market lot.');
    return;
  }
  const unit = getBuyPrice(type);
  const cost = buy * unit;
  if ((state.coins || 0) < cost) {
    addLog(`⚠ Not enough coins (need $${fmt(cost)}).`);
    return;
  }
  spendCoins(cost);
  offer.purchased = (offer.purchased || 0) + buy;
  state.resources[type] = (state.resources[type] || 0) + buy;
  import('./lifetime.js').then((m) => m.recordLifetimeResource?.(type, buy)).catch(() => {});
  addLog(`🛒 Bought ${fmt(buy)}x ${RESOURCE_DEFS[type].label} for $${fmt(cost)}`);
  try { saveGame(); } catch (_) { /* ignore */ }
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('market') || window._hdrPanelOpen === 'market') {
    window.openHdrPanel?.('market', { refresh: true, preserveScroll: true });
  }
};
