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

    // ── Mining ───────────────────────────────────────────────────
    {
      id: 'scout', name: 'Scout', desc: 'Fast, light cargo',
      reqs: { iron: 15, copper: 10 },
    },
    {
      id: 'swift', name: 'Sprinter', desc: 'Extreme speed, low capacity',
      reqs: { iron: 30, copper: 30 },
    },
    {
      id: 'hauler', name: 'Hauler', desc: 'Slow but big cargo',
      reqs: { iron: 50, copper: 50, oxygen: 20, silicon: 35 },
    },
    {
      id: 'freighter', name: 'Freighter', desc: 'Massive cargo bay',
      reqs: { iron: 150, titanium: 80, copper: 100, gold: 25, oxygen: 25, silicon: 10 },
    },

    // ── Cargo Transport ──────────────────────────────────────────
    {
      id: 'courier', name: 'Courier', desc: 'Pure hauler, no mining gear',
      reqs: { iron: 60, copper: 40, oxygen: 40, nickel: 30 },
    },
    {
      id: 'bulk_carrier', name: 'Bulk Carrier', desc: 'High-volume, stripped of speed',
      reqs: { iron: 120, silicon: 80, titanium: 60, aluminum: 50 },
    },
    {
      id: 'deep_hauler', name: 'Deep Space Hauler', desc: 'Colossal cargo, built for long hauls',
      reqs: { titanium: 150, aluminum: 120, chromium: 60, gold: 40, iron: 200 },
    },

    // ── Combat ───────────────────────────────────────────────────
    {
      id: 'viper', name: 'Viper', desc: 'Fast strike fighter, hit and evade',
      reqs: { titanium: 80, silicon: 60, cobalt: 50, aluminum: 40 },
    },
    {
      id: 'interceptor', name: 'Interceptor', desc: 'Mid-range fighter, balanced offence',
      reqs: { titanium: 120, chromium: 80, aluminum: 60, silicon: 40, gold: 20 },
    },
    {
      id: 'destroyer', name: 'Destroyer', desc: 'Heavy warship, devastating firepower',
      reqs: { gold: 80, chromium: 100, platinum: 30, titanium: 200, aluminum: 100 },
    },

    // ── Garrison ─────────────────────────────────────────────────
    {
      id: 'bulwark', name: 'Bulwark', desc: 'Armoured platform, massive guns, barely moves',
      reqs: { iron: 300, titanium: 200, aluminum: 80, silicon: 60, cobalt: 60 },
    },
    {
      id: 'colossus', name: 'Colossus', desc: 'Immovable fortress, unmatched firepower',
      reqs: { titanium: 300, aluminum: 200, chromium: 100, gold: 80, platinum: 40, silver: 30 },
    },

    // ── Galaxy Probes ────────────────────────────────────────────
    {
      id: 'probe_mk1', name: 'Probe Mk.I', desc: 'Galactic scout, probes tier 1–2 systems',
      reqs: { silicon: 80, cobalt: 60, iron: 100, copper: 80, oxygen: 40 },
    },
    {
      id: 'probe_mk2', name: 'Probe Mk.II', desc: 'Enhanced probe, reaches tier 1–3 zones',
      reqs: { iridium: 40, xenon: 30, platinum: 20, silicon: 60, titanium: 60 },
    },
    {
      id: 'warp_vessel', name: 'Warp Vessel', desc: 'Deep-space warp drive, all probe tiers',
      reqs: { iridium: 80, palladium: 40, osmium: 20, platinum: 40, xenon: 60, uranium: 5 },
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
