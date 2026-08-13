// ============================================================
// KEY ITEMS — special non-stack mission inventory
// ============================================================

/** Material Symbols icon names for key items. */
export const KEY_ITEM_DEFS = {
  data_box: {
    id: 'data_box',
    name: 'Data Box',
    icon: 'database',
    color: '#5dffa0',
    desc: 'A sealed recovery capsule pulled from a distress beacon. Contents locked pending analysis.',
  },
};

export function getKeyItemDef(id) {
  return KEY_ITEM_DEFS[id] || null;
}
