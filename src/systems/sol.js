// ============================================================
// SOL TICK (day/night cycle + market rotation)
// ============================================================
import {
  SOL_DURATION,
  MARKET_BOOST_MIN,
  MARKET_BOOST_MAX,
  MARKET_VARIANCE_MIN,
  MARKET_VARIANCE_MAX,
  MARKET_VARIANCE_ACTIVE_RATIO,
} from '../data/sol.js';
import {
  EVENT_SCHEDULE_MIN_SOLS,
  EVENT_SCHEDULE_MAX_SOLS,
  RANDOM_EVENT_MIN_BASE_LEVEL,
  COMBAT_EVENT_MIN_BASE_LEVEL,
} from '../data/events.js';
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { updateHeaderRP } from '../ui/ui.js';
import { fireRandomEvent } from './events.js';
import { startDailyRaid } from './combat.js';
import { showTransmissionMessage } from '../ui/transmissions.js';
import { checkTradeTutorial } from '../ui/tutorial.js';
import { NPCS } from '../data/npcs.js';
import { patchSolPanel, openHdrPanel, isHdrPanelOpen } from '../ui/panels.js';
import { getResearchPointCap } from '../data/research.js';
import { rollMarketBuyOffers } from './market.js';
import { onSolContractsTick } from './contracts.js';
import { runAutoAssignPass } from './autoAssign.js';
import { runAutoTradePass } from './autoTrade.js';
import { onSolDailyQuests } from './dailyQuests.js';
import { UNIQUE_SCANNER_CHANCE } from './research/definitions.js';
import { BASE_POS } from '../render/camera.js';
import { BASE_RANGE } from '../data/base.js';
import {
  getPirateThreatLevel,
  getPirateStatusSolIncrease,
  PIRATE_STATUS_RAID_AT,
} from '../data/combat.js';
import { recordSolSnapshot } from './statsHistory.js';
import {
  getFactionPirateHeatMult,
  getFactionSolRpBonus,
  getFactionRpCapBonus,
  ensureFactionRep,
} from './factions.js';

export function scheduleNextEvent() {
  const solsFromNow = EVENT_SCHEDULE_MIN_SOLS + Math.floor(Math.random() * (EVENT_SCHEDULE_MAX_SOLS - EVENT_SCHEDULE_MIN_SOLS + 1));
  state.nextEventSol = state.sol + solsFromNow;
}

function randomDemandMultiplier() {
  return Number((MARKET_BOOST_MIN + Math.random() * (MARKET_BOOST_MAX - MARKET_BOOST_MIN)).toFixed(2));
}

export function getAvailableMarketResourceTypes() {
  const isMarketable = (type) => {
    const def = RESOURCE_DEFS[type];
    return !!(def && !def.special && (def.sellPrice || 0) > 0);
  };
  const unlocked = new Set(
    state.nodes
      .filter((n) => n.minLevel <= state.base.level && isMarketable(n.type))
      .map((n) => n.type)
  );
  if (unlocked.size) return Array.from(unlocked);
  return Object.keys(RESOURCE_DEFS).filter(isMarketable);
}

export function rollMarketDemands() {
  const types = getAvailableMarketResourceTypes();
  const shuffled = types.slice().sort(() => Math.random() - 0.5);
  const demandCount = state.researchUnlocks?.multi_demand ? Math.min(3, shuffled.length) : Math.min(1, shuffled.length);
  const picked = shuffled.slice(0, demandCount);
  if (!picked.length) {
    state.marketBoost = null;
    state.extraDemands = [];
  } else {
    const boosted = picked[0];
    state.marketBoost = { type: boosted, multiplier: randomDemandMultiplier() };
    state.extraDemands = picked.slice(1).map((t) => ({ type: t, multiplier: randomDemandMultiplier() }));
  }
  rollMarketVariance();
  rollMarketBuyOffers();
}

/**
 * Per-SOL base price variance (−25%…+25%).
 * ~60% of types move; the rest stay flat (0%).
 * Demand resources always roll 0…+25% (never negative).
 */
export function rollMarketVariance() {
  const types = getAvailableMarketResourceTypes();
  const demanded = new Set();
  if (state.marketBoost?.type) demanded.add(state.marketBoost.type);
  for (const d of (state.extraDemands || [])) {
    if (d?.type) demanded.add(d.type);
  }

  const variance = {};
  const nonDemand = types.filter((t) => !demanded.has(t));
  const shuffled = nonDemand.slice().sort(() => Math.random() - 0.5);
  // ~60% of all marketable types move (demand slots always count as “active”)
  const targetActive = Math.max(demanded.size, Math.round(types.length * MARKET_VARIANCE_ACTIVE_RATIO));
  const nonDemandActive = Math.max(0, Math.min(shuffled.length, targetActive - demanded.size));

  for (let i = 0; i < shuffled.length; i++) {
    const type = shuffled[i];
    if (i < nonDemandActive) {
      // Non-zero variance in −25…−1 or +1…+25
      let pct = MARKET_VARIANCE_MIN + Math.floor(Math.random() * (MARKET_VARIANCE_MAX - MARKET_VARIANCE_MIN + 1));
      if (pct === 0) pct = Math.random() < 0.5 ? -1 : 1;
      variance[type] = pct;
    } else {
      variance[type] = 0;
    }
  }

  // Demand: always 0…+25
  for (const type of demanded) {
    variance[type] = Math.floor(Math.random() * (MARKET_VARIANCE_MAX + 1));
  }

  for (const type of types) {
    if (variance[type] === undefined) variance[type] = 0;
  }

  state.marketVariance = variance;
}

/** Drop special/non-sellable types from any active demand (e.g. crashed_ship). */
export function sanitizeMarketDemands() {
  const ok = (type) => {
    const def = RESOURCE_DEFS[type];
    return !!(def && !def.special && (def.sellPrice || 0) > 0);
  };
  if (state.marketBoost && !ok(state.marketBoost.type)) state.marketBoost = null;
  state.extraDemands = (state.extraDemands || []).filter((d) => d && ok(d.type));
  // If primary boost was cleared but extras remain, promote one
  if (!state.marketBoost && state.extraDemands.length) {
    const next = state.extraDemands.shift();
    state.marketBoost = next;
  }
  if (state.marketVariance && typeof state.marketVariance === 'object') {
    const cleaned = {};
    for (const [k, v] of Object.entries(state.marketVariance)) {
      if (!ok(k)) continue;
      cleaned[k] = Math.max(MARKET_VARIANCE_MIN, Math.min(MARKET_VARIANCE_MAX, Math.round(Number(v) || 0)));
    }
    state.marketVariance = cleaned;
  }
}

export function tickSOL(dt) {
  if (!state.solStarted) return;
  state.solTimer += dt;
  checkTradeTutorial();
  if (state.solTimer >= SOL_DURATION) {
    state.solTimer -= SOL_DURATION;
    state.sol++;

    // Earn RP per SOL, capped (Deep Survey Mandate can add +1)
    ensureFactionRep();
    const rpCap = getResearchPointCap(state.base.level) + getFactionRpCapBonus();
    const rpGain = 1 + getFactionSolRpBonus();
    if (state.rp < rpCap) {
      const before = state.rp || 0;
      state.rp = Math.min(rpCap, before + rpGain);
      const gained = state.rp - before;
      if (gained > 0) {
        updateHeaderRP();
        addLog(`🔬 Research Point${gained > 1 ? 's' : ''} earned! +${gained} (${state.rp}/${rpCap})`);
      }
    }

    // Random demand + daily price variance
    rollMarketDemands();
    const demandLabels = state.marketBoost
      ? [RESOURCE_DEFS[state.marketBoost.type].label, ...state.extraDemands.map((d) => RESOURCE_DEFS[d.type].label)]
      : [];
    if (demandLabels.length) {
      addLog(`📈 Market demand: ${demandLabels.join(', ')} selling at a premium this SOL!`);
    }
    addLog(`☀ SOL ${state.sol} begins.`);

    // Trade panel shows demand / prices / buy lots — rebuild if open
    if (isHdrPanelOpen('market')) {
      openHdrPanel('market', { refresh: true, preserveScroll: true });
    }

    // AI Trader (before contracts/assign so stockpile reflects sells)
    runAutoTradePass();
    // Daily quests refresh
    onSolDailyQuests();
    // Sector contracts period roll
    onSolContractsTick();
    // AI node assignment
    runAutoAssignPass();
    // Unique ship scanner pulse
    pulseUniqueShipScanner();

    // Statistics: snapshot stockpile + credits at each SOL open
    recordSolSnapshot();
    patchSolPanel('sol');

    // Fire event if this is the scheduled sol (world events from base rank 3+)
    if (state.nextEventSol !== null && state.sol >= state.nextEventSol) {
      if ((state.base.level || 1) >= RANDOM_EVENT_MIN_BASE_LEVEL) {
        fireRandomEvent();
      }
      scheduleNextEvent();
    }

    // Pirate Status / raids unlock at base rank 4+
    if (state.sol > 1 && (state.base.level || 1) >= COMBAT_EVENT_MIN_BASE_LEVEL) {
      const threat = getPirateThreatLevel(state);
      const gain = Math.max(0, Math.round(getPirateStatusSolIncrease(threat) * getFactionPirateHeatMult()));
      state.pirateStatus = Math.min(
        PIRATE_STATUS_RAID_AT,
        Math.max(0, (state.pirateStatus || 0) + gain),
      );
      patchSolPanel('pirate');
      if (state.pirateStatus >= PIRATE_STATUS_RAID_AT) {
        startDailyRaid();
      }
    }

    // Rigs nags about idle ships — repeats every SOL
    const idleShips = state.ships.filter(s => s.status === 'idle' && s.targetNode === null);
    if (idleShips.length > 0) {
      const names = idleShips.map(s => `<strong>${s.name}</strong>`).join(', ');
      showTransmissionMessage(NPCS.rigs.transmissionLines.sol_idle({ names, count: idleShips.length }), 20, 'rigs');
    }

    saveGame();
  }
}

/** Unique Ship Scanner — 5% chance per SOL; signatures expire at next SOL. */
function pulseUniqueShipScanner() {
  // Clear prior SOL signatures
  state.uniqueSignatures = (state.uniqueSignatures || []).filter((s) => (s.expiresSol || 0) > state.sol);
  if (!state.researchUnlocks?.unique_scanner) return;
  if (Math.random() > UNIQUE_SCANNER_CHANCE) return;

  const halfR = BASE_RANGE[(state.base.level || 1) - 1] || 6;
  const base = BASE_POS();
  // Random point in visible ring (avoid base footprint)
  const ang = Math.random() * Math.PI * 2;
  const dist = 3 + Math.random() * Math.max(2, halfR - 2);
  const sig = {
    id: `uniq_${state.sol}_${Math.random().toString(36).slice(2, 7)}`,
    sol: state.sol,
    expiresSol: state.sol + 1,
    wx: base.x + Math.cos(ang) * dist * 64,
    wy: base.y + Math.sin(ang) * dist * 36,
    claimed: false,
  };
  if (!Array.isArray(state.uniqueSignatures)) state.uniqueSignatures = [];
  state.uniqueSignatures.push(sig);
  addLog(`□ Unique scanner ping — anomalous hull signature detected (fades end of SOL).`);
}
