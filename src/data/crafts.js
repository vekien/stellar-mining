// ============================================================
// CRAFT RECIPES — ships, turrets, buildings, base upgrades
// ============================================================

export const CRAFTS = {

  ships: [

    // ── Mining ───────────────────────────────────────────────────
    {
      id: 'scout', name: 'Scout', desc: 'Fast, light cargo',
      reqs: { iron: 75, copper: 50 },
    },
    {
      id: 'swift', name: 'Swift', desc: 'Extreme speed, low capacity',
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
      name: 'Automatic Turret',
      desc: '5,000 HP · 100 dmg · 2-tile range',
      cost: 6000,
      reqs: { iron: 900, copper: 700, oxygen: 450, nickel: 300, silicon: 450, cobalt: 250 },
    },
    {
      id: 'laser_turret',
      name: 'Laser Turret',
      desc: 'Heavy beam burst · long recharge',
      cost: 18000,
      reqs: { iron: 2700, copper: 2100, oxygen: 1350, nickel: 900, silicon: 1350, cobalt: 750, gold: 600, chromium: 450, platinum: 225, xenon: 180 },
    },
    {
      id: 'emp_turret',
      name: 'EMP Turret',
      desc: 'Stuns ships · disables movement and fire',
      cost: 36000,
      reqs: { iron: 5400, copper: 4200, oxygen: 2700, nickel: 1800, silicon: 2700, cobalt: 1500, gold: 1200, chromium: 900, silver: 600, neon: 450, platinum: 450, xenon: 360 },
    },
    {
      id: 'turret_upgrade',
      name: 'Turret Upgrade',
      desc: 'Increases turret level, damage and HP (cost scales with level)',
      costPerLevel: 3600,
      reqs: { iron: 540, copper: 420, oxygen: 270, silicon: 270, titanium: 150 },
    },
  ],

  buildings: [
    {
      id: 'storage_facility',
      name: 'Storage Facility',
      desc: '3x3 depot module with isolated cargo storage',
      cost: 12000,
      reqs: { iron: 1200, copper: 900, oxygen: 500, nickel: 300, silicon: 400 },
    },
    {
      id: 'power_station',
      name: 'Power Station',
      desc: '3x3 grid building for future power generation infrastructure',
      cost: 18000,
      reqs: { iron: 1600, copper: 1200, oxygen: 700, nickel: 450, silicon: 650, cobalt: 300 },
    },
    {
      id: 'power_pole',
      name: 'Power Pole',
      desc: '1x1 relay node for future power distribution layouts',
      cost: 1200,
      reqs: { iron: 120, copper: 90, silicon: 35 },
    },
    {
      id: 'research_lab',
      name: 'Research Lab',
      desc: '3x3 powered research complex that consumes delivered materials for future experiments',
      cost: 25000,
      reqs: { iron: 1800, copper: 1400, oxygen: 900, nickel: 650, silicon: 900, cobalt: 500, titanium: 350, aluminum: 250, gold: 180 },
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
