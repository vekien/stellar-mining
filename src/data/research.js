// ============================================================
// RESEARCH TREE DATA
// ============================================================

// ── HP Boost ──────────────────────────────────────────────────
export const HP_BOOST_HEALTH_PER_PURCHASE = 2500; // HP added per purchase
export const HP_BOOST_MAX_PURCHASES       = 10;   // max times purchasable

// ── Defense (Armor Plating) ───────────────────────────────────
export const DEFENSE_DAMAGE_REDUCTION = 0.10; // 10 % incoming damage reduction

export const RESEARCH_TREE = [
  {
    tier: 1, label: 'Base Level 1',
    unlocks: [
      { id: 'hp_boost', name: 'HP Boost',        cost: 1, desc: 'Increases base station max health by 2,500 HP. Can be purchased up to 10 times.', icon: '💪', repeatable: true },
    ]
  },
  {
    tier: 3, label: 'Base Level 3', minBaseLevel: 3,
    unlocks: [
      { id: 'turrets',  name: 'Turret Systems',  cost: 1, desc: 'Allows construction of defensive turrets on the map. Place them to protect your base from incoming raids.', icon: '🔫' },
      { id: 'defense',  name: 'Armor Plating',   cost: 2, desc: 'Reduces all incoming damage to the base station by 10%.', icon: '🛡' },
    ]
  },
];
