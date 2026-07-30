// ============================================================
// RESOURCE & TIER DATA
// ============================================================
export const RESOURCE_DEFS = {
  crashed_ship: { color: '#8fa0b7', label: 'Crashed Ship', sellPrice: 0, blurb: 'A derelict hull drifting in the belt. It can be investigated, but it does not produce mineable resources.', special: true, noIcon: true },
  iron:     { color: '#b87040', label: 'Iron',     sellPrice: 2,  blurb: 'The backbone of early fleet operations. Abundant in the inner belt and essential for ship construction and base repairs.' },
  copper:   { color: '#c86020', label: 'Copper',   sellPrice: 3,  blurb: 'A conductive ore woven into ship wiring and onboard electronics. Every new hull needs copper in its bones.' },
  oxygen:   { color: '#40a0e0', label: 'Oxygen',   sellPrice: 4,  blurb: 'Pressurized gas siphoned from asteroid ice pockets. Stable under electromagnetic surges and critical for life support.' },
  nickel:   { color: '#8f8f7b', label: 'Nickel',   sellPrice: 6,  blurb: 'A resilient alloy component used in structural plating and industrial-grade fasteners.' },
  silicon:  { color: '#8080a0', label: 'Silicon',  sellPrice: 5,  blurb: 'Crystalline compound mined from glassy formations. A staple input for sensors and control systems.' },
  cobalt:   { color: '#4f72a8', label: 'Cobalt',   sellPrice: 9,  blurb: 'High-density catalyst metal used in batteries, relays, and efficient thermal assemblies.' },
  titanium: { color: '#a0b0c0', label: 'Titanium', sellPrice: 8,  blurb: 'Dense alloy-grade ore forged under pressure. Needed for tougher hulls and base armor.' },
  aluminum: { color: '#b9c3cf', label: 'Aluminum', sellPrice: 11, blurb: 'Lightweight industrial metal prized for balancing structural strength and low mass.' },
  gold:     { color: '#e0c030', label: 'Gold',     sellPrice: 15, blurb: 'Rare heavy metal from deep-belt cores. High market demand and core to advanced fabrication.' },
  chromium: { color: '#87a7af', label: 'Chromium', sellPrice: 13, blurb: 'Corrosion-resistant metal used in plating, high-wear surfaces, and precision machine parts.' },
  silver:   { color: '#c8ccd4', label: 'Silver',   sellPrice: 22, blurb: 'Highly reflective precious metal used in high-efficiency contacts and sensor arrays.' },
  neon:     { color: '#86e5ff', label: 'Neon',     sellPrice: 18, blurb: 'Inert atmospheric gas trapped in mineral voids, used for diagnostics and specialty emitters.' },
  platinum: { color: '#d8d8e8', label: 'Platinum', sellPrice: 34, blurb: 'Catalyst-grade metal stable under heat. A key input for elite fabrication chains.' },
  xenon:    { color: '#98d0ff', label: 'Xenon',    sellPrice: 26, blurb: 'Heavy noble gas recovered from deep fissures, used in high-energy propulsion systems.' },
  iridium:  { color: '#8ea0bc', label: 'Iridium',  sellPrice: 52, blurb: 'Ultra-dense deep-belt metal with extreme corrosion resistance and long service life.' },
  palladium:{ color: '#c9d2dc', label: 'Palladium',sellPrice: 42, blurb: 'Precision catalytic metal required for advanced processing modules and reaction controls.' },
  uranium:  { color: '#78d94a', label: 'Uranium',  sellPrice: 85, blurb: 'Radioactive heavy element isolated from ancient asteroid cores. Strictly controlled and extremely rare.' },
  osmium:   { color: '#6a7d8f', label: 'Osmium',   sellPrice: 58, blurb: 'Exceptionally dense metal used in compact counterweights and hardened instrumentation.' },
  rhodium:  { color: '#dce3ec', label: 'Rhodium',  sellPrice: 74, blurb: 'Rare lustrous metal valued for high-performance coatings and critical energy interfaces.' },
  hafnium:  { color: '#a6b3bf', label: 'Hafnium',  sellPrice: 95, blurb: 'Late-game strategic metal used in radiation shielding and advanced reactor containment.' },
};

export const MINE_TIERS = {
  1:  { label: 'Tier I',    resources: ['iron', 'copper'],       color: '#808090' },
  2:  { label: 'Tier II',   resources: ['oxygen', 'nickel'],     color: '#4acd7a' },
  3:  { label: 'Tier III',  resources: ['silicon', 'cobalt'],    color: '#4a90e2' },
  4:  { label: 'Tier IV',   resources: ['titanium', 'aluminum'], color: '#9b6dff' },
  5:  { label: 'Tier V',    resources: ['gold', 'chromium'],     color: '#ffd700' },
  6:  { label: 'Tier VI',   resources: ['silver', 'neon'],       color: '#ff8c40' },
  7:  { label: 'Tier VII',  resources: ['platinum', 'xenon'],    color: '#ff60b0' },
  8:  { label: 'Tier VIII', resources: ['iridium', 'palladium'], color: '#00e5ff' },
  9:  { label: 'Tier IX',   resources: ['uranium', 'osmium'],    color: '#ff4040' },
  10: { label: 'Tier X',    resources: ['rhodium', 'hafnium'],   color: '#ffffff' },
};

const _resourceTierMap = new Map();
for (const [tier, def] of Object.entries(MINE_TIERS)) {
  for (const r of def.resources) _resourceTierMap.set(r, Number(tier));
}

export function getResourceTier(resourceType) {
  const t = _resourceTierMap.get(resourceType);
  return t !== undefined ? t : null;
}

/** True for mineable/storable cargo — excludes special map nodes like crashed ships. */
export function isStorableResource(resourceType) {
  const def = RESOURCE_DEFS[resourceType];
  return !!(def && !def.special);
}
