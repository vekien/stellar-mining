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

export function scheduleNextEvent() {
  const minT = 180, maxT = 480; // 3-8 minutes into SOL
  state.nextEventTimer = minT + Math.random() * (maxT - minT);
}

export function tickSOL(dt) {
  if (!state.solStarted) return;
  tickRandomEvents(dt);
  state.solTimer += dt;
  if (state.solTimer >= SOL_DURATION) {
    state.solTimer -= SOL_DURATION;
    state.sol++;

    // Earn 1 RP per SOL, capped
    const rpCap = 2 + (state.base.level - 1);
    if (state.rp < rpCap) { state.rp++; addLog(`🔬 Research Point earned! (${state.rp}/${rpCap})`); }

    // Random in-demand resource
    const types = Object.keys(RESOURCE_DEFS);
    const boosted = types[Math.floor(Math.random() * types.length)];
    state.marketBoost = { type: boosted };
    addLog(`📈 Market boost: ${RESOURCE_DEFS[boosted].label} selling for 1.5× this SOL!`);
    addLog(`☀ SOL ${state.sol} begins.`);
    scheduleNextEvent();

    // Rigs nags about idle ships — repeats every SOL
    const idleShips = state.ships.filter(s => s.status === 'idle' && s.targetNode === null);
    if (idleShips.length > 0) {
      const names = idleShips.map(s => `<strong>${s.name}</strong>`).join(', ');
      const plural = idleShips.length > 1;
      showTransmissionMessage(
        `Hey! ${plural ? `${idleShips.length} ships are` : `${names} is`} sitting idle and doing absolutely nothing!<br><br>` +
        `${plural ? `That includes: ${names}.<br><br>` : ''}` +
        `Either assign ${plural ? 'them' : 'it'} to a node or sell ${plural ? 'them' : 'it'} for parts — dead weight costs you every SOL!`,
        20, 'rigs'
      );
    }

    saveGame();
  }
}
