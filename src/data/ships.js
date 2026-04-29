// ============================================================
// SHIP & UPGRADE DATA
// ============================================================

// Base stats for each ship type (used at spawn + display)
export const SHIP_DEFS = {
  scout: {
    capacity:  15,
    flySpeed:  1.4,
    mineSpeed: 1.0,
    mineTier:  1,
  },
  swift: {
    capacity:  12,
    flySpeed:  2.2,
    mineSpeed: 1.5,
    mineTier:  1,
  },
  hauler: {
    capacity:  30,
    flySpeed:  0.8,
    mineSpeed: 0.8,
    mineTier:  2,
  },
  freighter: {
    capacity:  60,
    flySpeed:  0.6,
    mineSpeed: 0.6,
    mineTier:  3,
  },
};

// Tier upgrade costs: ~2.5x each step
export const SHIP_TIER_COSTS = {
  2:1000,
  3:2500,
  4:6250, 
  5:15625, 
  6:39063,
  7:97656, 
  8:244141, 
  9:610352, 
  10:1525879
};

// Max upgrade level per tier for each stat
export const TIER_UPGRADE_CAP = { 
  1:10, 
  2:25, 
  3:50, 
  4:80, 
  5:120, 
  6:180, 
  7:250, 
  8:300, 
  9:400, 
  10:500 
};

// Tier rarity colours for display
export const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X'];
export function toRoman(n) { return ROMAN[n] || String(n); }

export const TIER_COLORS = {
  1:'#e8eaf0', 2:'#00e5ff', 3:'#ffd700', 4:'#80ff80',
  5:'#e080ff', 6:'#80ffff', 7:'#ffc040', 8:'#8080ff',
  9:'#ff8040', 10:'#ff4040'
};

// Upgrade cost functions
export const UPGRADE_CAP_COST  = s => Math.floor(40  * Math.pow(1.10, s.capacityLevel));
export const UPGRADE_FLY_COST  = s => Math.floor(60  * Math.pow(1.10, s.flySpeedLevel));
export const UPGRADE_MINE_COST = s => Math.floor(60  * Math.pow(1.10, s.mineSpeedLevel));

// How many levels to buy at once based on current level
export function upgradeChunk(level) {
  if (level >= 100) return 10;
  if (level >= 50)  return 5;
  if (level >= 20)  return 2;
  return 1;
}

// Total cost for `chunk` upgrades starting from current level
export function upgradeTotalCost(costFn, ship, stat, chunk) {
  let total = 0;
  const tmp = { ...ship };
  for (let i = 0; i < chunk; i++) {
    total += costFn(tmp);
    tmp[stat + 'Level'] = (tmp[stat + 'Level'] || 0) + 1;
  }
  return total;
}
