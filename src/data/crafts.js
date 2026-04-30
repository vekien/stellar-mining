// ============================================================
// CRAFT RECIPES — ships, turrets, base upgrades
// ============================================================
//
// Each recipe has:
//   id       — unique string key
//   name     — display name
//   desc     — short flavour description
//   cost     — coin cost (0 = free)
//   reqs     — { resourceType: amount, ... }
//
// Ship recipes also have:
//   capacity, flySpeed, mineSpeed, mineTier
//
// Turret upgrade costs scale per turret level — store base
//   values and multiply at the call site: cost * level, etc.
//
// Access helpers:
//   getCraft(type, id)  — single recipe lookup
//   CRAFT_SHIPS         — alias for CRAFTS.ships (backward compat)

export const CRAFTS = {

  ships: [
    {
      id:   'scout',
      name: 'Scout',
      desc: 'Fast, light cargo',
      reqs: { iron: 15, copper: 10 },
    },
    {
      id:   'swift',
      name: 'Sprinter',
      desc: 'Extreme speed, low capacity',
      reqs: { iron: 30, copper: 30 },
    },
    {
      id:   'hauler',
      name: 'Hauler',
      desc: 'Slow but big cargo',
      reqs: { iron: 50, copper: 50, oxygen: 20, silicon: 35 },
    },
    {
      id:   'freighter',
      name: 'Freighter',
      desc: 'Massive cargo bay',
      reqs: { iron: 150, titanium: 80, copper: 100, gold: 25, oxygen: 25, silicon: 10 },
    },
  ],

  turrets: [
    {
      id: 'turret',
      name: 'Defense Turret',
      desc: '5,000 HP · 100 dmg · 6-tile range',
      cost: 6000,
      reqs: { iron: 180, copper: 140, oxygen: 90, silicon: 90, titanium: 50 },
    },
    {
      // Costs scale per turret level — multiply base values by turret.level at call site
      id: 'turret_upgrade',
      name: 'Turret Upgrade',
      desc: 'Increases turret level, damage and HP (cost scales with level)',
      costPerLevel: 3600,
      reqs: { iron: 108, copper: 84, oxygen: 54, silicon: 54, titanium: 30 },
    },
  ],

  base: [
    {
      id: 'hull_reinforcement',
      name: 'Hull Reinforcement',
      desc: 'Permanently increases base max HP by 2,500',
      cost: 1000,
      reqs: { iron: 100, titanium: 50 },
      hpBonus: 2500,
    },
  ],

};

// ── Lookup helpers ────────────────────────────────────────────
export function getCraft(type, id) {
  return CRAFTS[type]?.find(c => c.id === id) ?? null;
}

// Backward-compat alias used across the codebase
export const CRAFT_SHIPS = CRAFTS.ships;
