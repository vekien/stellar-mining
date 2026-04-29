// ============================================================
// SOL TICK (day/night cycle + market rotation)
// ============================================================
import { SOL_DURATION } from '../constants.js';
import { state, saveGame } from '../state.js';
import { RESOURCE_DEFS } from '../data/resources.js';
import { addLog } from '../helpers.js';
import { refresh } from '../ui/refresh.js';
import { tickRandomEvents } from './events.js';
import { showTransmissionMessage } from '../ui/transmissions.js';
import { checkTradeTutorial } from '../ui/tutorial.js';
import { NPCS } from '../data/npcs.js';

export function scheduleNextEvent() {
  const minT = 180, maxT = 480; // 3-8 minutes into SOL
  state.nextEventTimer = minT + Math.random() * (maxT - minT);
}

function randomDemandMultiplier() {
  return Number((1.2 + Math.random() * 0.8).toFixed(2));
}

export function tickSOL(dt) {
  if (!state.solStarted) return;
  tickRandomEvents(dt);
  state.solTimer += dt;
  checkTradeTutorial();
  if (state.solTimer >= SOL_DURATION) {
    state.solTimer -= SOL_DURATION;
    state.sol++;

    // Earn 1 RP per SOL, capped
    const rpCap = 2 + (state.base.level - 1);
    if (state.rp < rpCap) { state.rp++; addLog(`🔬 Research Point earned! (${state.rp}/${rpCap})`); }

    // Random in-demand resource
    const types = Object.keys(RESOURCE_DEFS);
    const boosted = types[Math.floor(Math.random() * types.length)];
    const multiplier = randomDemandMultiplier();
    state.marketBoost = { type: boosted, multiplier };
    addLog(`📈 Market boost: ${RESOURCE_DEFS[boosted].label} selling for ${multiplier}× this SOL!`);
    addLog(`☀ SOL ${state.sol} begins.`);
    scheduleNextEvent();

    // Rigs nags about idle ships — repeats every SOL
    const idleShips = state.ships.filter(s => s.status === 'idle' && s.targetNode === null);
    if (idleShips.length > 0) {
      const names = idleShips.map(s => `<strong>${s.name}</strong>`).join(', ');
      showTransmissionMessage(NPCS.rigs.transmissionLines.sol_idle({ names, count: idleShips.length }), 20, 'rigs');
    }

    saveGame();
  }
}
