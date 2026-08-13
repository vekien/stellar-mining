// ============================================================
// QUEST DEFINITIONS — multi-stage objectives
// ============================================================

/**
 * objective types:
 *  - collect: { resource, amount }
 *  - craft_ship: { shipType }
 *  - ships_on_diff_resources: { amount }  // N ships assigned to different node types
 *  - sell_resource: { amount }           // sell any resources N times (or units)
 *  - upgrade_ship: {}                    // purchase any ship stat upgrade
 */

export const QUEST_DEFS = {
  tutorial: {
    id: 'tutorial',
    name: 'Tutorial',
    desc: 'Learn the basics of extraction, crafting, deployment, trade, and upgrades.',
    npcId: 'byte',
    rewards: {
      coins: 500,
      resources: { iron: 40, copper: 30 },
      rp: 1,
      rep: 0,
    },
    stages: [
      {
        id: 'gather',
        title: 'Gather Starter Materials',
        blurb: 'Stockpile the basics — complete these in any order.',
        objectives: [
          { id: 'copper50', type: 'collect', resource: 'copper', amount: 50, label: 'Collect 50 Copper' },
          { id: 'iron75', type: 'collect', resource: 'iron', amount: 75, label: 'Collect 75 Iron' },
        ],
      },
      {
        id: 'craft_scout',
        title: 'Craft a Scout',
        blurb: 'Open Craft → Ships and build a Scout hull.',
        objectives: [
          { id: 'craft_scout', type: 'craft_ship', shipType: 'scout', label: 'Craft a Scout ship' },
        ],
      },
      {
        id: 'assign_both',
        title: 'Deploy the Fleet',
        blurb: 'Put both ships to work on different resources.',
        objectives: [
          {
            id: 'two_diff',
            type: 'ships_on_diff_resources',
            amount: 2,
            label: 'Assign both ships to different resources',
          },
        ],
      },
      {
        id: 'trade_sell',
        title: 'Learn the Market',
        blurb: 'Open Trade and sell some ore for coins.',
        objectives: [
          { id: 'sell_any', type: 'sell_resource', amount: 1, label: 'Sell resources on the Trade post' },
        ],
      },
      {
        id: 'upgrade_ship',
        title: 'Upgrade a Ship',
        blurb: 'Open a ship → Upgrade and buy any stat increase.',
        objectives: [
          { id: 'upgrade_any', type: 'upgrade_ship', label: 'Upgrade a ship stat' },
        ],
      },
    ],
  },
};

export function getQuestDef(id) {
  return QUEST_DEFS[id] || null;
}

export function listQuestDefs() {
  return Object.values(QUEST_DEFS);
}
