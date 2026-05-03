// ============================================================
// CRAFT RECIPES — ships, turrets, base upgrades
// ============================================================

export const CRAFTS = {

  ships: [

    // ── Mining ───────────────────────────────────────────────────
    {
      id: 'scout', name: 'Scout', desc: 'Fast, light cargo',
      reqs: { iron: 75, copper: 50 },
    },
    {
      id: 'swift', name: 'Sprinter', desc: 'Extreme speed, low capacity',
      reqs: { iron: 150, copper: 150 },
    },
    {
      id: 'hauler', name: 'Hauler', desc: 'Slow but big cargo',
      reqs: { iron: 250, copper: 250, oxygen: 100, silicon: 175 },
    },
    {
      id: 'freighter', name: 'Freighter', desc: 'Massive cargo bay',
      reqs: { iron: 750, titanium: 400, copper: 500, gold: 125, oxygen: 125, silicon: 50 },
    },

    // ── Cargo Transport ──────────────────────────────────────────
    {
      id: 'courier', name: 'Courier', desc: 'Pure hauler, no mining gear',
      reqs: { iron: 300, copper: 200, oxygen: 200, nickel: 150 },
    },
    {
      id: 'deep_hauler', name: 'Titan', desc: 'Colossal cargo, built for long hauls',
      reqs: { titanium: 750, aluminum: 600, chromium: 300, gold: 200, iron: 1000 },
    },

    // ── Combat ───────────────────────────────────────────────────
    {
      id: 'viper', name: 'Viper', desc: 'Fast strike fighter, hit and evade',
      reqs: { titanium: 400, silicon: 300, cobalt: 250, aluminum: 200 },
    },
    {
      id: 'interceptor', name: 'Interceptor', desc: 'Mid-range fighter, balanced offence',
      reqs: { titanium: 600, chromium: 400, aluminum: 300, silicon: 200, gold: 100 },
    },
    {
      id: 'destroyer', name: 'Destroyer', desc: 'Heavy warship, devastating firepower',
      reqs: { gold: 400, chromium: 500, platinum: 150, titanium: 1000, aluminum: 500 },
    },

    // ── Garrison ─────────────────────────────────────────────────
    {
      id: 'bulwark', name: 'Bulwark', desc: 'Armoured platform, massive guns, barely moves',
      reqs: { iron: 1500, titanium: 1000, aluminum: 400, silicon: 300, cobalt: 300 },
    },
    {
      id: 'colossus', name: 'Colossus', desc: 'Immovable fortress, unmatched firepower',
      reqs: { titanium: 1500, aluminum: 1000, chromium: 500, gold: 400, platinum: 200, silver: 150 },
    },

  ],

  turrets: [
    {
      id: 'turret',
      name: 'Defense Turret',
      desc: '5,000 HP · 100 dmg · 6-tile range',
      cost: 6000,
      reqs: { iron: 900, copper: 700, oxygen: 450, silicon: 450, titanium: 250 },
    },
    {
      id: 'turret_upgrade',
      name: 'Turret Upgrade',
      desc: 'Increases turret level, damage and HP (cost scales with level)',
      costPerLevel: 3600,
      reqs: { iron: 540, copper: 420, oxygen: 270, silicon: 270, titanium: 150 },
    },
  ],

  base: [
    {
      id: 'hull_reinforcement',
      name: 'Hull Reinforcement',
      desc: 'Permanently increases base max HP by 2,500',
      cost: 1000,
      reqs: { iron: 500, titanium: 250 },
      hpBonus: 2500,
    },
  ],

};

export function getCraft(type, id) {
  return CRAFTS[type]?.find(c => c.id === id) ?? null;
}

export const CRAFT_SHIPS = CRAFTS.ships;
