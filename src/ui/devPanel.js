// ============================================================
// DEV PANEL — quick test tools for development
// ============================================================
const DEBUG = true;

import { state } from '../state.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { BASE_UPGRADE_COSTS, BASE_TIER_REQS } from '../data/base.js';
import { NPCS } from '../data/npcs.js';
import {
  SHIP_DEFS, TIER_UPGRADE_CAP, capacityFromTierAndLevel,
  flySpeedFromLevel, mineSpeedFromLevel, loadSpeedFromLevel,
  hpFromLevel, attackFromLevel, atkRateFromLevel,
} from '../data/ships.js';
import { MAX_COINS, RESOURCE_CAP } from '../helpers.js';
import { showTransmissionMessage } from './transmissions.js';
import { refresh } from './refresh.js';
import { updateHeader } from './ui.js';
import { assignShip, spawnShip } from '../systems/ships.js';

const LOREM = `Transmission check — this is a test signal from sector relay delta-niner.<br><br>` +
  `All systems nominal. <strong>Fleet status confirmed.</strong> Resource extraction proceeding within expected parameters.<br><br>` +
  `Nothing to report. Standing by.`;

function devTestTransmission() {
  const npcsWithPortrait = Object.values(NPCS).filter(n => n.portrait);
  const npc = npcsWithPortrait[Math.floor(Math.random() * npcsWithPortrait.length)];
  showTransmissionMessage(LOREM, 15, npc.id);
}

function devAddCoins() {
  state.coins = MAX_COINS;
  updateHeader();
  if (refresh.ui) refresh.ui();
}

function devAddRP() {
  const rpCap = state.base.level * (state.base.level + 1) / 2;
  state.rp = Math.min(state.rp + 1, rpCap);
  updateHeader();
  if (refresh.ui) refresh.ui();
}

function devAddResources() {
  for (const key of Object.keys(RESOURCE_DEFS)) {
    state.resources[key] = Math.min(RESOURCE_CAP, (state.resources[key] || 0) + 99999);
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
  const cap = TIER_UPGRADE_CAP[10]; // 100
  for (const ship of state.ships) {
    if (SHIP_DEFS[ship.type]?.unique) continue; // unique ships are already maxed
    const role = SHIP_DEFS[ship.type]?.role || 'mining';
    ship.mineTier = 10;

    ship.flySpeedLevel = cap;
    ship.flySpeed = flySpeedFromLevel(ship.type, cap);

    if (role === 'mining') {
      ship.capacityLevel  = cap;
      ship.capacity       = capacityFromTierAndLevel(ship.type, 10, cap, ship.capacity);
      ship.mineSpeedLevel = cap;
      ship.mineSpeed      = mineSpeedFromLevel(ship.type, cap);
    } else if (role === 'transport') {
      ship.capacityLevel  = cap;
      ship.capacity       = capacityFromTierAndLevel(ship.type, 10, cap, ship.capacity);
      ship.loadSpeedLevel = cap;
      ship.loadSpeed      = loadSpeedFromLevel(ship.type, cap);
    } else if (role === 'combat') {
      ship.hpLevel      = cap;   ship.hp          = hpFromLevel(ship.type, cap);
      ship.attackLevel  = cap;   ship.attack      = attackFromLevel(ship.type, cap);
      ship.atkRateLevel = cap;   ship.attackSpeed = atkRateFromLevel(ship.type, cap);
    }
  }
  if (refresh.ui) refresh.ui();
}

function devAddUniqueShips() {
  const UNIQUE_TYPES = ['sentinel', 'serenity', 'normandy', 'ebon_hawk'];
  for (const type of UNIQUE_TYPES) {
    if (state.ships.some(s => s.type === type)) continue;
    spawnShip(type);
  }
  if (refresh.ui) refresh.ui();
}

function devUpgradeBase() {
  const bl = state.base.level;
  const cost = BASE_UPGRADE_COSTS[bl];
  const resReqs = BASE_TIER_REQS[bl + 1];
  const prevCoins = state.coins;
  const prevRes = {};
  if (cost && state.coins < cost) state.coins = cost;
  if (resReqs) {
    for (const [r, n] of Object.entries(resReqs)) {
      prevRes[r] = state.resources[r] || 0;
      if ((state.resources[r] || 0) < n) state.resources[r] = n;
    }
  }
  window.upgradeBase?.();
  if (cost && state.coins < prevCoins) state.coins = prevCoins;
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
  document.getElementById('dev-btn-unique-ships').addEventListener('click',   e => { e.stopPropagation(); devAddUniqueShips(); });
}
