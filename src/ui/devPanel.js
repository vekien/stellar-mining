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
  flySpeedFromLevel, mineSpeedFromLevel, mineBonusFromLevel, mineBonusUpgradeCap, loadSpeedFromLevel,
  hpFromLevel, attackFromLevel, atkRateFromLevel, rangeFromLevel,
} from '../data/ships.js';
import {
  RESEARCH_TREE,
  HEALTH_INCREASE_HP_PER_PURCHASE,
  HEALTH_INCREASE_MAX_PURCHASES,
  SHIELD_MAX_PURCHASES,
  ANTI_COMET_MAX_PURCHASES,
  SOLAR_SHIELD_MAX_PURCHASES,
  AUTO_REGEN_MAX_PURCHASES,
  getResearchPointCap,
} from '../data/research.js';
import { MAX_COINS, RESOURCE_CAP } from '../helpers.js';
import { showTransmissionMessage } from './transmissions.js';
import { refresh } from './refresh.js';
import { updateHeader } from './ui.js';
import { assignShip, spawnShip } from '../systems/ships.js';
import { BASE_MAX_SHIPS } from '../data/base.js';
import { BASE_COL, BASE_ROW } from '../constants.js';
import { fireEventById } from '../systems/events.js';
import { startDailyRaid } from '../systems/combat.js';
import { rollMarketDemands } from '../systems/sol.js';
import { saveGame } from '../state.js';

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
  const rpCap = getResearchPointCap(state.base.level);
  state.rp = rpCap;
  updateHeader();
  if (refresh.ui) refresh.ui();
}

function devMaxResearch() {
  state.hpBoostCount = HEALTH_INCREASE_MAX_PURCHASES;
  state.shieldBoostCount = SHIELD_MAX_PURCHASES;
  state.antiCometCount = ANTI_COMET_MAX_PURCHASES;
  state.solarShieldCount = SOLAR_SHIELD_MAX_PURCHASES;
  state.autoRegenCount = AUTO_REGEN_MAX_PURCHASES;

  const expectedBaseMaxHealth = 10000 + ((Math.max(1, state.base.level || 1) - 1) * 10000) + (state.hpBoostCount * HEALTH_INCREASE_HP_PER_PURCHASE);
  state.base.maxHealth = Math.max(state.base.maxHealth || 0, expectedBaseMaxHealth);
  state.base.health = state.base.maxHealth;
  state.base.shield = Math.floor(state.base.maxHealth * 0.05 * state.shieldBoostCount);

  state.researchUnlocks = { ...(state.researchUnlocks || {}) };
  state.researchUnlocksList = [];

  for (const tier of RESEARCH_TREE) {
    for (const unlock of tier.unlocks) {
      if (unlock.repeatable) {
        const qty = unlock.id === 'health_increase' ? HEALTH_INCREASE_MAX_PURCHASES
          : unlock.id === 'shield_increase' ? SHIELD_MAX_PURCHASES
          : unlock.id === 'anti_comet' ? ANTI_COMET_MAX_PURCHASES
          : unlock.id === 'solar_shield' ? SOLAR_SHIELD_MAX_PURCHASES
          : unlock.id === 'auto_regen' ? AUTO_REGEN_MAX_PURCHASES
          : 0;
        if (qty > 0) state.researchUnlocksList.push({ id: unlock.id, name: unlock.name, qty });
        continue;
      }
      state.researchUnlocks[unlock.id] = true;
      state.researchUnlocksList.push({ id: unlock.id, name: unlock.name, qty: 1 });
    }
  }

  if (state.researchUnlocks.multi_demand) rollMarketDemands();
  updateHeader();
  if (refresh.ui) refresh.ui();
  if (refresh.basePanel) refresh.basePanel();
  saveGame();
  if (window._hdrPanelOpen === 'research' && window.openHdrPanel) window.openHdrPanel('research', { refresh: true, preserveScroll: true });
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

    if (role === 'combat') {
      ship.flySpeedLevel = 0;
      ship.flySpeed = 155; // shared combat cruise
    } else if (role === 'garrison') {
      ship.flySpeedLevel = 0;
      ship.flySpeed = SHIP_DEFS[ship.type]?.flySpeed ?? 39; // ~¼ cruise
    } else {
      ship.flySpeedLevel = cap;
      ship.flySpeed = flySpeedFromLevel(ship.type, cap);
    }

    if (role === 'mining') {
      ship.capacityLevel  = cap;
      ship.capacity       = capacityFromTierAndLevel(ship.type, 10, cap, ship.capacity);
      ship.mineSpeedLevel = cap;
      ship.mineSpeed      = mineSpeedFromLevel(ship.type, cap);
      ship.mineBonusLevel = mineBonusUpgradeCap(10);
      ship.mineBonus      = mineBonusFromLevel(ship.mineBonusLevel);
    } else if (role === 'transport') {
      ship.capacityLevel  = cap;
      ship.capacity       = capacityFromTierAndLevel(ship.type, 10, cap, ship.capacity);
      ship.loadSpeedLevel = cap;
      ship.loadSpeed      = loadSpeedFromLevel(ship.type, cap);
    } else if (role === 'combat' || role === 'garrison') {
      ship.hpLevel      = cap;   ship.hp          = hpFromLevel(ship.type, cap);
      ship.attackLevel  = cap;   ship.attack      = attackFromLevel(ship.type, cap);
      ship.atkRateLevel = cap;   ship.attackSpeed = atkRateFromLevel(ship.type, cap);
      ship.currentHp    = ship.hp;
      if (role === 'garrison') {
        ship.rangeLevel = cap;
        ship.range = rangeFromLevel(ship.type, cap);
      }
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

const MINING_SHIP_TYPES = ['scout', 'swift', 'hauler', 'freighter'];

function devFillMaxShips() {
  const maxShips = BASE_MAX_SHIPS[(state.base.level - 1)] || 20;
  while (state.ships.length < maxShips) {
    const type = MINING_SHIP_TYPES[Math.floor(Math.random() * MINING_SHIP_TYPES.length)];
    spawnShip(type);
  }
  if (refresh.ui) refresh.ui();
}

function devFloodIronNodes() {
  const existingPositions = new Set(state.nodes.map(n => `${n.gr[0]},${n.gr[1]}`));
  let nextId = state.nodes.reduce((max, n) => Math.max(max, n.id), -1) + 1;

  for (let dc = -50; dc <= 50; dc++) {
    for (let dr = -50; dr <= 50; dr++) {
      const col = BASE_COL + dc;
      const row = BASE_ROW + dr;
      const key = `${col},${row}`;
      if (existingPositions.has(key)) continue;
      // Skip the base tile itself
      if (dc === 0 && dr === 0) continue;
      state.nodes.push({ id: nextId++, type: 'iron', gr: [col, row], minLevel: 1 });
      existingPositions.add(key);
    }
  }
  if (refresh.ui) refresh.ui();
}

function devSpawnSolarFlare() {
  fireEventById('solar_flare');
}

function devSpawnComet() {
  fireEventById('comet');
}

function devSpawnBlackHole() {
  fireEventById('black_hole');
}

function devPirateAttack() {
  // Spawn a new wave (reinforces if a raid is already active — does not wipe hostiles)
  startDailyRaid({ force: true });
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

  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { e.stopPropagation(); fn(); });
  };
  bind('dev-btn-transmission', devTestTransmission);
  bind('dev-btn-coins', devAddCoins);
  bind('dev-btn-rp', devAddRP);
  bind('dev-btn-max-research', devMaxResearch);
  bind('dev-btn-resources', devAddResources);
  bind('dev-btn-sol', devNextSol);
  bind('dev-btn-max-upgrades', devMaxUpgrades);
  bind('dev-btn-assign-random', devAssignAllRandom);
  bind('dev-btn-upgrade-base', devUpgradeBase);
  bind('dev-btn-unique-ships', devAddUniqueShips);
  bind('dev-btn-max-ships', devFillMaxShips);
  bind('dev-btn-flood-nodes', devFloodIronNodes);
  bind('dev-btn-solar-flare', devSpawnSolarFlare);
  bind('dev-btn-comet', devSpawnComet);
  bind('dev-btn-black-hole', devSpawnBlackHole);
  bind('dev-btn-pirate-attack', devPirateAttack);
}
