// ============================================================
// RESEARCH TREE — class-based research definitions
// ============================================================

export const HEALTH_INCREASE_HP_PER_PURCHASE = 8000;
export const HEALTH_INCREASE_MAX_PURCHASES   = 10;
export const HP_BOOST_HEALTH_PER_PURCHASE    = HEALTH_INCREASE_HP_PER_PURCHASE;

export const SHIELD_PCT_PER_PURCHASE  = 0.05;
export const SHIELD_MAX_PURCHASES     = 10;
export const SHIELD_REGEN_INTERVAL_S = 1;
export const SHIELD_REGEN_PER_PURCHASE_PER_TICK = 12.5;

export const ANTI_COMET_CHANCE_PER_PURCHASE = 0.05;
export const ANTI_COMET_MAX_PURCHASES       = 10;

export const SOLAR_SHIELD_REDUCTION_PER_PURCHASE = 0.08;
export const SOLAR_SHIELD_MAX_PURCHASES           = 10;

export const AUTO_REGEN_HP_PER_PURCHASE = 5;
export const AUTO_REGEN_MAX_PURCHASES   = 10;

export const DEFENSE_DAMAGE_REDUCTION = 0.10;
export const MARKET_INFLUENCE_BONUS = 0.10;

/** Hazard Hardening: black-hole min speed mult floor (was 0.1). */
export const HAZARD_HARDENING_BH_FLOOR = 0.45;
/** Nullwell Protocol: extra black-hole age (seconds) burned per second per damping drone. */
export const NULLWELL_COLLAPSE_RATE = 2.75;
/** Unique scanner: chance per SOL to find a signature. */
export const UNIQUE_SCANNER_CHANCE = 0.05;
/** Crafting Efficiency: multiplier on all craft durations. */
export const CRAFTING_EFFICIENCY_MULT = 0.5;
/** Per-tier mining speed bonus when researched. */
export const MINE_BOOST_MULT = 1.10;
/** One-shot mining cargo capacity multiplier. */
export const CARGO_STRAPS_MULT = 1.20;

export function mineBoostId(tier) {
  return `mine_boost_t${tier}`;
}

export function hasMineBoost(state, tier) {
  return !!state?.researchUnlocks?.[mineBoostId(tier)];
}

export function hasThreatDetector(state) {
  return !!state?.researchUnlocks?.threat_detector;
}

export function getResearchPointCap(baseTier) {
  const t = Math.max(1, Math.min(10, Math.floor(baseTier || 1)));
  const minCap = 5;
  const maxCap = 100;
  const cap = minCap + (((maxCap - minCap) * (t - 1)) / 9);
  return Math.round(cap);
}

class ResearchUnlock {
  constructor(config) {
    Object.assign(this, config);
  }
}

class RepeatableResearchUnlock extends ResearchUnlock {
  constructor(config) {
    super({ ...config, repeatable: true });
  }
}

class ResearchTier {
  constructor({ tier, label, minBaseLevel = null, unlocks = [] }) {
    this.tier = tier;
    this.label = label;
    this.minBaseLevel = minBaseLevel;
    this.unlocks = unlocks;
  }
}

function unlock(config) {
  return new ResearchUnlock(config);
}

function repeatableUnlock(config) {
  return new RepeatableResearchUnlock(config);
}

export const RESEARCH_TREE = [
  new ResearchTier({
    tier: 1,
    label: 'Base Level 1',
    unlocks: [
      unlock({
        id: 'mine_boost_t1', name: 'T1 Mining Boost', cost: 1, icon: '▲',
        desc: '+10% mining speed on Tier I resources (Iron, Copper).',
      }),
      unlock({
        id: 'cargo_straps', name: 'Cargo Straps', cost: 2, icon: '▣',
        desc: '+20% cargo capacity on all mining ships. One-time unlock.',
      }),
      unlock({
        id: 'daily_quests', name: 'Daily Quests', cost: 1, icon: '◎',
        desc: 'Unlocks daily SOL quests — three rotating objectives each solar day with coin, resource, and RP rewards.',
      }),
      unlock({
        id: 'threat_detector', name: 'Threat Detector', cost: 1, icon: '◈',
        desc: 'Unlocks the Sector Overview THREAT tab — fleet power, pirate heat, and notoriety rank intel.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 2,
    label: 'Base Level 2',
    minBaseLevel: 2,
    unlocks: [
      unlock({
        id: 'mine_boost_t2', name: 'T2 Mining Boost', cost: 2, icon: '▲',
        desc: '+10% mining speed on Tier II resources (Oxygen, Nickel).',
      }),
      unlock({
        id: 'power_station', name: 'Power Station', cost: 5, icon: '◫',
        desc: 'Unlocks Power Station modules so Tier 3+ buildings can run on the grid.',
      }),
      unlock({
        id: 'power_poles', name: 'Power Poles', cost: 5, icon: '╫',
        desc: 'Unlocks Power Pole relays for grid routing and expansion.',
      }),
      unlock({
        id: 'factions', name: 'Faction Comms', cost: 1, icon: '◎',
        desc: 'Open diplomatic channels with The Frontier Union, The Ironhands, and The Astral Institute. Unlocks the FACTIONS tab and faction daily quests that grant standing.',
      }),
      repeatableUnlock({
        id: 'anti_comet', name: 'Anti-Comet Defenses', cost: 1, icon: '◇',
        desc: 'Installs point-defense systems that provide a 5% chance to intercept and destroy an incoming comet before impact. Max 10 purchases (up to 50% intercept chance).',
      }),
      repeatableUnlock({
        id: 'solar_shield', name: 'Solar Radiation Shielding', cost: 1, icon: '□',
        desc: 'Reduces resource losses from Solar Flare events by 8% per purchase. Max 10 purchases (up to 80% total reduction).',
      }),
    ],
  }),
  new ResearchTier({
    tier: 3,
    label: 'Base Level 3',
    minBaseLevel: 3,
    unlocks: [
      unlock({
        id: 'mine_boost_t3', name: 'T3 Mining Boost', cost: 2, icon: '▲',
        desc: '+10% mining speed on Tier III resources (Silicon, Cobalt).',
      }),
      repeatableUnlock({
        id: 'health_increase', name: 'Health Increase', cost: 1, icon: '▲',
        desc: 'Increases base station max health by 8,000 HP per purchase. Can be purchased up to 10 times (+80,000 HP total).',
      }),
      repeatableUnlock({
        id: 'shield_increase', name: 'Shield Increase', cost: 1, icon: '◈',
        desc: 'Increases shield capacity by 5% of base max HP per purchase. Shields absorb all incoming damage before HP and regenerate automatically over time. Max 10 purchases.',
      }),
      unlock({
        id: 'turrets', name: 'Automatic Turret', cost: 1, icon: '■',
        desc: 'Allows construction of standard automatic defensive turrets on the map. Place them to protect your base from incoming raids.',
      }),
      unlock({
        id: 'drone_lab', name: 'Drones', cost: 5, icon: '◬',
        desc: 'Unlocks the Drone Lab building and drone crafting — deploy drones for salvage, recon, and anomaly ops.',
      }),
      unlock({
        id: 'armor_plating', name: 'Armor Plating', cost: 2, icon: '▣',
        desc: 'Permanently increases the armor rating of all Combat ships, reducing damage taken in combat by 10%. Applied to fleet combat — future ship combat expansion.',
      }),
      unlock({
        id: 'resource_fabrication', name: 'Unlock Resource Fabrication', cost: 10, icon: '◆',
        desc: 'Enables crafting of advanced materials such as Microchips and Fuel Cells from multiple raw resource inputs. Future expansion — flag is active upon purchase.',
      }),
      repeatableUnlock({
        id: 'auto_regen', name: 'Auto Regeneration', cost: 1, icon: '○',
        desc: 'The base station slowly repairs itself over time at 5 HP per second per purchase. Max 10 purchases (up to 50 HP/s).',
      }),
      unlock({
        id: 'unlock_contracts', name: 'Unlock Contracts', cost: 3, icon: '📋',
        desc: 'Unlocks the Contracts Office building and Command → Contracts. One sector supply contract every 10 SOLs. Deliver materials to a powered Contracts Office.',
      }),
      unlock({
        id: 'unlock_bounties', name: 'Unlock Bounties', cost: 2, icon: '◉',
        desc: 'Grants access to the sector bounty board, allowing you to accept high-reward contracts. Future expansion — flag is active upon purchase.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 4,
    label: 'Base Level 4',
    minBaseLevel: 4,
    unlocks: [
      unlock({
        id: 'mine_boost_t4', name: 'T4 Mining Boost', cost: 3, icon: '▲',
        desc: '+10% mining speed on Tier IV resources (Titanium, Aluminum).',
      }),
      unlock({
        id: 'galaxy_probes', name: 'Unlock Galaxy Probes', cost: 3, icon: '▷',
        desc: 'Enables deployment of long-range probes to other galaxies to discover rare materials and strategic opportunities. Future expansion — flag is active upon purchase.',
      }),
      unlock({
        id: 'storage_facilities', name: 'Unlock Storage Facilities', cost: 2, icon: '▤',
        desc: 'Allows placement of storage facility structures anywhere on the map to expand depot capacity. Future expansion — flag is active upon purchase.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 5,
    label: 'Base Level 5',
    minBaseLevel: 5,
    unlocks: [
      unlock({
        id: 'mine_boost_t5', name: 'T5 Mining Boost', cost: 3, icon: '▲',
        desc: '+10% mining speed on Tier V resources (Gold, Chromium).',
      }),
      unlock({
        id: 'market_influence', name: 'Market Influence', cost: 10, icon: '▲',
        desc: 'Leverages your sector reputation to permanently increase all resource sale prices by 10%. One-time unlock.',
      }),
      unlock({
        id: 'laser_turrets', name: 'Laser Turrets', cost: 10, icon: '◈',
        desc: 'Unlocks construction of high-energy laser turret emplacements with superior range and damage output. Future expansion.',
      }),
      unlock({
        id: 'research_lab', name: 'Research Lab', cost: 8, icon: '✦',
        desc: 'Unlocks Research Lab buildings and Resource Synthesis — link nodes via Lab Towers and combine materials into advanced composites.',
      }),
      unlock({
        id: 'lab_tower', name: 'Lab Tower', cost: 6, icon: '╪',
        desc: 'Unlocks lab tower relays that chain to Research Labs and connect matching-tier resource nodes for synthesis routing.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 6,
    label: 'Base Level 6',
    minBaseLevel: 6,
    unlocks: [
      unlock({
        id: 'mine_boost_t6', name: 'T6 Mining Boost', cost: 4, icon: '▲',
        desc: '+10% mining speed on Tier VI resources (Silver, Neon).',
      }),
      unlock({
        id: 'contracts_slot_2', name: 'Expanded Contracts', cost: 8, icon: '📋',
        desc: 'Runs up to 2 simultaneous sector contracts every 10 SOLs (requires Unlock Contracts + a Contracts Office).',
      }),
      unlock({
        id: 'haul_integrity', name: 'Haul Integrity', cost: 12, icon: '▣',
        desc: 'Reinforced cargo clamps. When a mining ship changes node mid-haul, its current load moves into a Resource Hold (100%) and the main bay clears for the new ore. Both dump on the next base/storage dropoff.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 7,
    label: 'Base Level 7',
    minBaseLevel: 7,
    unlocks: [
      unlock({
        id: 'mine_boost_t7', name: 'T7 Mining Boost', cost: 4, icon: '▲',
        desc: '+10% mining speed on Tier VII resources (Platinum, Xenon).',
      }),
      unlock({
        id: 'emp_turrets', name: 'EMP Turrets', cost: 18, icon: '◇',
        desc: 'Deploys electromagnetic pulse turrets that temporarily disable the systems of incoming enemy ships, preventing attacks and slowing advances. Future expansion.',
      }),
      unlock({
        id: 'hazard_hardening', name: 'Hazard Hardening', cost: 12, icon: '⬡',
        desc: 'Stabilizers reduce black-hole drag. Ships in anomaly fields keep more of their speed near the event horizon.',
      }),
      unlock({
        id: 'combat_shields', name: 'Combat Shields', cost: 15, icon: '◈',
        desc: 'Equips all ships with energy shields equal to max HP. Shields absorb damage first and slowly recharge out of combat.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 8,
    label: 'Base Level 8',
    minBaseLevel: 8,
    unlocks: [
      unlock({
        id: 'mine_boost_t8', name: 'T8 Mining Boost', cost: 5, icon: '▲',
        desc: '+10% mining speed on Tier VIII resources (Iridium, Palladium).',
      }),
      unlock({
        id: 'ai_node_assignment', name: 'AI Node Assignment', cost: 20, icon: '◎',
        desc: 'Adds an Auto Assign toggle on mining ships. Each SOL, enabled ships reassign by priority: low stockpile → market demand → high-value tiers.',
      }),
      unlock({
        id: 'salvage_protocols', name: 'Salvage Protocols', cost: 16, icon: '♻',
        desc: 'Improved scrap recovery from ship salvage and derelict ops. Implementation coming soon — unlock flag is active.',
      }),
      unlock({
        id: 'nullwell_protocol', name: 'Nullwell Protocol', cost: 18, icon: '◎',
        desc: 'Idle drones auto-deploy to active black holes and bleed off the anomaly with gravitic dampers. Each drone on-station shortens remaining black-hole lifetime — more drones, faster collapse.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 9,
    label: 'Base Level 9',
    minBaseLevel: 9,
    unlocks: [
      unlock({
        id: 'mine_boost_t9', name: 'T9 Mining Boost', cost: 5, icon: '▲',
        desc: '+10% mining speed on Tier IX resources (Uranium, Osmium).',
      }),
      unlock({
        id: 'contracts_slot_3', name: 'Contract Network', cost: 14, icon: '📋',
        desc: 'Runs up to 3 simultaneous sector contracts every 10 SOLs across low, mid, and high-tier material bands.',
      }),
      unlock({
        id: 'unique_scanner', name: 'Unique Ship Scanner', cost: 40, icon: '□',
        desc: 'Base scanner pulses once per SOL. 5% chance to detect a unique hull signature on the map. Signatures fade at SOL end. Claim system coming soon.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 10,
    label: 'Base Level 10',
    minBaseLevel: 10,
    unlocks: [
      unlock({
        id: 'mine_boost_t10', name: 'T10 Mining Boost', cost: 6, icon: '▲',
        desc: '+10% mining speed on Tier X resources (Rhodium, Hafnium).',
      }),
      unlock({
        id: 'multi_demand', name: 'Multi-Demand', cost: 25, icon: '■',
        desc: 'Expands your market intelligence network — instead of a single in-demand resource per SOL, up to 3 resources can be simultaneously boosted each day.',
      }),
      unlock({
        id: 'crafting_efficiency', name: 'Crafting Efficiency', cost: 30, icon: '⚙',
        desc: 'Yard automation cuts all craft queue times in half (ships, buildings, turrets, drones).',
      }),
      unlock({
        id: 'ai_trader', name: 'AI Trader', cost: 35, icon: '💰',
        desc: 'Unlocks Trade → Auto tab. Configure per-resource auto-sell rules (keep %, demand-only). Executes at the start of each SOL.',
      }),
    ],
  }),
];

export function getRepeatableCount(id, state) {
  switch (id) {
    case 'health_increase': return state.hpBoostCount     || 0;
    case 'shield_increase': return state.shieldBoostCount || 0;
    case 'anti_comet':      return state.antiCometCount   || 0;
    case 'solar_shield':    return state.solarShieldCount || 0;
    case 'auto_regen':      return state.autoRegenCount   || 0;
    default: return state.researchUnlocks[id] ? 1 : 0;
  }
}

export function getRepeatableMax(id) {
  const maxes = {
    health_increase: HEALTH_INCREASE_MAX_PURCHASES,
    shield_increase: SHIELD_MAX_PURCHASES,
    anti_comet:      ANTI_COMET_MAX_PURCHASES,
    solar_shield:    SOLAR_SHIELD_MAX_PURCHASES,
    auto_regen:      AUTO_REGEN_MAX_PURCHASES,
  };
  return maxes[id] || 1;
}

/** Max simultaneous contract slots from research. */
export function getContractSlotCap(state) {
  if (!state?.researchUnlocks?.unlock_contracts) return 0;
  if (state.researchUnlocks.contracts_slot_3) return 3;
  if (state.researchUnlocks.contracts_slot_2) return 2;
  return 1;
}
