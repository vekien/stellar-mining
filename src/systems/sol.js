// ============================================================
// SOL TICK (day/night cycle + market rotation)
// ============================================================
import { SOL_DURATION, MARKET_BOOST_MIN, MARKET_BOOST_MAX } from '../data/sol.js';
import { EVENT_SCHEDULE_MIN_SOLS, EVENT_SCHEDULE_MAX_SOLS } from '../data/events.js';
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { updateHeaderRP } from '../ui/ui.js';
import { fireRandomEvent } from './events.js';
import { showTransmissionMessage } from '../ui/transmissions.js';
import { checkTradeTutorial } from '../ui/tutorial.js';
import { NPCS } from '../data/npcs.js';
import { patchSolPanel } from '../ui/panels.js';
import { getResearchPointCap } from '../data/research.js';

export function scheduleNextEvent() {
  const solsFromNow = EVENT_SCHEDULE_MIN_SOLS + Math.floor(Math.random() * (EVENT_SCHEDULE_MAX_SOLS - EVENT_SCHEDULE_MIN_SOLS + 1));
  state.nextEventSol = state.sol + solsFromNow;
}

function randomDemandMultiplier() {
  return Number((MARKET_BOOST_MIN + Math.random() * (MARKET_BOOST_MAX - MARKET_BOOST_MIN)).toFixed(2));
}

export function getAvailableMarketResourceTypes() {
  const unlocked = new Set(
    state.nodes
      .filter(n => n.minLevel <= state.base.level)
      .map(n => n.type)
  );
  return unlocked.size ? Array.from(unlocked) : Object.keys(RESOURCE_DEFS);
}

export function rollMarketDemands() {
  const types = getAvailableMarketResourceTypes();
  const shuffled = types.slice().sort(() => Math.random() - 0.5);
  const demandCount = state.researchUnlocks?.multi_demand ? Math.min(3, shuffled.length) : Math.min(1, shuffled.length);
  const picked = shuffled.slice(0, demandCount);
  if (!picked.length) {
    state.marketBoost = null;
    state.extraDemands = [];
    return;
  }
  const boosted = picked[0];
  state.marketBoost = { type: boosted, multiplier: randomDemandMultiplier() };
  state.extraDemands = picked.slice(1).map(t => ({ type: t, multiplier: randomDemandMultiplier() }));
}

export function tickSOL(dt) {
  if (!state.solStarted) return;
  state.solTimer += dt;
  checkTradeTutorial();
  if (state.solTimer >= SOL_DURATION) {
    state.solTimer -= SOL_DURATION;
    state.sol++;

    // Earn 1 RP per SOL, capped
    const rpCap = getResearchPointCap(state.base.level);
    if (state.rp < rpCap) { state.rp++; updateHeaderRP(); addLog(`🔬 Research Point earned! (${state.rp}/${rpCap})`); }

    // Random in-demand resource(s)
    rollMarketDemands();
    const demandLabels = state.marketBoost
      ? [RESOURCE_DEFS[state.marketBoost.type].label, ...state.extraDemands.map(d => RESOURCE_DEFS[d.type].label)]
      : [];
    addLog(`📈 Market boost: ${demandLabels.join(', ')} selling at premium this SOL!`);
    addLog(`☀ SOL ${state.sol} begins.`);
    patchSolPanel('sol');

    // Fire event if this is the scheduled sol
    if (state.nextEventSol !== null && state.sol >= state.nextEventSol) {
      fireRandomEvent();
      scheduleNextEvent();
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
