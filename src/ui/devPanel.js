// ============================================================
// DEV PANEL — quick test tools for development
// ============================================================
const DEBUG = true;

import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { BASE_UPGRADE_COSTS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import { TIER_UPGRADE_CAP } from '../data/ships.js';
import { addCoins } from '../helpers.js';
import { showTransmissionMessage } from './transmissions.js';
import { refresh } from './refresh.js';
import { updateHeader } from './ui.js';
import { assignShip } from '../systems/ships.js';

const LOREM = `Transmission check — this is a test signal from sector relay delta-niner.<br><br>` +
  `All systems nominal. <strong>Fleet status confirmed.</strong> Resource extraction proceeding within expected parameters.<br><br>` +
  `Nothing to report. Standing by.`;

function devTestTransmission() {
  const npcsWithPortrait = Object.values(NPCS).filter(n => n.portrait);
  const npc = npcsWithPortrait[Math.floor(Math.random() * npcsWithPortrait.length)];
  showTransmissionMessage(LOREM, 15, npc.id);
}

function devAddCoins() {
  addCoins(1_000_000);
  updateHeader();
}

function devAddRP() {
  const rpCap = 2 + (state.base.level - 1);
  state.rp = Math.min(state.rp + 1, rpCap);
  updateHeader();
  if (refresh.ui) refresh.ui();
}

function devAddResources() {
  for (const key of Object.keys(RESOURCE_DEFS)) {
    state.resources[key] = (state.resources[key] || 0) + 100;
  }
  if (refresh.ui) refresh.ui();
}

function devNextSol() {
  state.sol++;
  state.solTimer = 0;
  updateHeader();
  if (refresh.ui) refresh.ui();
}

function devMaxUpgrades() {
  for (const ship of state.ships) {
    // Max tier first so the upgrade cap is based on T10
    ship.mineTier = 10;

    const cap = TIER_UPGRADE_CAP[10]; // 100
    const capStep = ship.type === 'freighter' ? 10 : ship.type === 'hauler' ? 5 : 2;

    const capLevels  = cap - ship.capacityLevel;
    const flyLevels  = cap - ship.flySpeedLevel;
    const mineLevels = cap - ship.mineSpeedLevel;

    ship.capacityLevel = cap;
    ship.capacity += capStep * capLevels;

    ship.flySpeedLevel = cap;
    ship.flySpeed = parseFloat((ship.flySpeed + 0.2 * flyLevels).toFixed(2));

    if ((ship.mineSpeed || 0) > 0) {
      ship.mineSpeedLevel = cap;
      ship.mineSpeed = parseFloat((ship.mineSpeed + 0.2 * mineLevels).toFixed(2));
    }
  }
  if (refresh.ui) refresh.ui();
}

function devUpgradeBase() {
  const cost = BASE_UPGRADE_COSTS[state.base.level];
  const prev = state.coins;
  if (cost && state.coins < cost) state.coins = cost;
  window.upgradeBase?.();
  if (cost && state.coins < prev) state.coins = prev;
}

function devAssignAllRandom() {
  for (const ship of state.ships) {
    if ((ship.mineSpeed || 0) <= 0) continue;
    if (ship.targetNode !== null) continue;

    const accessible = [];
    for (let t = 1; t <= ship.mineTier; t++) accessible.push(...MINE_TIERS[t].resources);

    const available = state.nodes.filter(n =>
      accessible.includes(n.type) &&
      n.minLevel <= state.base.level &&
      !state.ships.some(s => s.id !== ship.id && s.targetNode === n.id)
    );

    if (available.length === 0) continue;
    assignShip(ship, available[Math.floor(Math.random() * available.length)]);
  }
}

export function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  const menu  = document.getElementById('dev-menu');
  if (!panel || !menu) return;

  if (!DEBUG) { panel.style.display = 'none'; return; }

  panel.addEventListener('click', () => menu.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!panel.contains(e.target)) menu.classList.remove('open');
  });

  document.getElementById('dev-btn-transmission').addEventListener('click', e => { e.stopPropagation(); devTestTransmission(); });
  document.getElementById('dev-btn-coins').addEventListener('click',         e => { e.stopPropagation(); devAddCoins(); });
  document.getElementById('dev-btn-rp').addEventListener('click',            e => { e.stopPropagation(); devAddRP(); });
  document.getElementById('dev-btn-resources').addEventListener('click',     e => { e.stopPropagation(); devAddResources(); });
  document.getElementById('dev-btn-sol').addEventListener('click',           e => { e.stopPropagation(); devNextSol(); });
  document.getElementById('dev-btn-max-upgrades').addEventListener('click',  e => { e.stopPropagation(); devMaxUpgrades(); });
  document.getElementById('dev-btn-assign-random').addEventListener('click',  e => { e.stopPropagation(); devAssignAllRandom(); });
  document.getElementById('dev-btn-upgrade-base').addEventListener('click',   e => { e.stopPropagation(); devUpgradeBase(); });
}
