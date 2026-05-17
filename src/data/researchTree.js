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
      repeatableUnlock({
        id: 'health_increase', name: 'Health Increase', cost: 1, icon: '▲',
        desc: 'Increases base station max health by 8,000 HP per purchase. Can be purchased up to 10 times (+80,000 HP total).',
      }),
      repeatableUnlock({
        id: 'shield_increase', name: 'Shield Increase', cost: 1, icon: '◈',
        desc: 'Increases shield capacity by 5% of base max HP per purchase. Shields absorb all incoming damage before HP and regenerate automatically over time. Max 10 purchases.',
      }),
      unlock({
        id: 'drone_lab', name: 'Drone Lab', cost: 3, icon: '◬',
        desc: 'Unlocks the Drone Lab building — an operations hub for sending drones to salvage ships, scan ruins, and tackle anomalies.',
      }),
      unlock({
        id: 'drone_crafting', name: 'Drone', cost: 2, icon: '◬',
        desc: 'Unlocks the ability to craft drones for deployment from a Drone Lab.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 2,
    label: 'Base Level 2',
    minBaseLevel: 2,
    unlocks: [
      unlock({
        id: 'resource_synthesis', name: 'Unlock Resource Synthesis', cost: 2, icon: '◎',
        desc: 'Enables the ability to combine raw resources into compound materials. Future expansion — flag is active upon purchase.',
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
        id: 'turrets', name: 'Automatic Turret', cost: 1, icon: '■',
        desc: 'Allows construction of standard automatic defensive turrets on the map. Place them to protect your base from incoming raids.',
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
        id: 'galaxy_probes', name: 'Unlock Galaxy Probes', cost: 3, icon: '▷',
        desc: 'Enables deployment of long-range probes to other galaxies to discover rare materials and strategic opportunities. Future expansion — flag is active upon purchase.',
      }),
      unlock({
        id: 'storage_facilities', name: 'Unlock Storage Facilities', cost: 2, icon: '▤',
        desc: 'Allows placement of storage facility structures anywhere on the map to expand depot capacity. Future expansion — flag is active upon purchase.',
      }),
      unlock({
        id: 'power_station', name: 'Power Station', cost: 5, icon: '◫',
        desc: 'Unlocks compact power station modules for future grid infrastructure placement.',
      }),
      unlock({
        id: 'power_poles', name: 'Power Poles', cost: 5, icon: '╫',
        desc: 'Unlocks lightweight power pole relays for future grid routing and expansion.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 5,
    label: 'Base Level 5',
    minBaseLevel: 5,
    unlocks: [
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
        desc: 'Unlocks construction of research lab buildings that can receive and consume delivered materials for future research systems.',
      }),
      unlock({
        id: 'lab_tower', name: 'Lab Tower', cost: 6, icon: '╪',
        desc: 'Unlocks lab tower relays that chain to Research Labs and connect matching-tier resource nodes for future synthesis routing.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 7,
    label: 'Base Level 7',
    minBaseLevel: 7,
    unlocks: [
      unlock({
        id: 'emp_turrets', name: 'EMP Turrets', cost: 18, icon: '◇',
        desc: 'Deploys electromagnetic pulse turrets that temporarily disable the systems of incoming enemy ships, preventing attacks and slowing advances. Future expansion.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 8,
    label: 'Base Level 8',
    minBaseLevel: 8,
    unlocks: [
      unlock({
        id: 'unique_scanner', name: 'Unique Ship Scanner', cost: 40, icon: '□',
        desc: 'Installs a long-range signature scanner capable of detecting unique and legendary ship signatures in the asteroid belt. Future expansion — flag is active upon purchase.',
      }),
    ],
  }),
  new ResearchTier({
    tier: 10,
    label: 'Base Level 10',
    minBaseLevel: 10,
    unlocks: [
      unlock({
        id: 'multi_demand', name: 'Multi-Demand', cost: 25, icon: '■',
        desc: 'Expands your market intelligence network — instead of a single in-demand resource per SOL, up to 3 resources can be simultaneously boosted each day.',
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
