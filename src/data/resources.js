// ============================================================
// RESOURCE & TIER DATA
// ============================================================
export const RESOURCE_DEFS = {
  iron:     { color: '#b87040', label: 'Iron',     sellPrice: 2  },
  copper:   { color: '#c86020', label: 'Copper',   sellPrice: 3  },
  oxygen:   { color: '#40a0e0', label: 'Oxygen',   sellPrice: 4  },
  silicon:  { color: '#8080a0', label: 'Silicon',  sellPrice: 5  },
  titanium: { color: '#a0b0c0', label: 'Titanium', sellPrice: 8  },
  gold:     { color: '#e0c030', label: 'Gold',     sellPrice: 15 },
};

export const MINE_TIERS = {
  1:  { label: 'Tier I',    resources: ['iron','copper'],                              color: '#b87040' },
  2:  { label: 'Tier II',   resources: ['oxygen','silicon'],                           color: '#40a0e0' },
  3:  { label: 'Tier III',  resources: ['titanium','gold'],                            color: '#e0c030' },
  4:  { label: 'Tier IV',   resources: ['iron','copper'],                              color: '#60c060' },
  5:  { label: 'Tier V',    resources: ['oxygen','silicon'],                           color: '#c060c0' },
  6:  { label: 'Tier VI',   resources: ['titanium','gold'],                            color: '#60c0c0' },
  7:  { label: 'Tier VII',  resources: ['iron','copper','oxygen'],                     color: '#c0a040' },
  8:  { label: 'Tier VIII', resources: ['silicon','titanium'],                         color: '#8080ff' },
  9:  { label: 'Tier IX',   resources: ['gold','titanium'],                            color: '#ff8040' },
  10: { label: 'Tier X',    resources: ['iron','copper','oxygen','silicon','titanium','gold'], color: '#ff4040' },
};
