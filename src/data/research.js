// ============================================================
// RESEARCH TREE DATA
// ============================================================
export const RESEARCH_TREE = [
  {
    tier: 1, label: 'Base Level 1',
    unlocks: [
      { id: 'hp_boost', name: 'HP Boost',        cost: 1, desc: 'Increases base station max health by 5,000 HP. Can be purchased multiple times.', icon: '💪', repeatable: true },
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
