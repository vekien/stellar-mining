// ============================================================
// FACTIONS — sector powers & reputation track
// ============================================================

/**
 * Standing tiers: -5 … +5 (0 = Unknown start).
 * Cumulative rep points map onto tiers via thresholds.
 */
export const STANDING_TIERS = [
  { tier: -5, id: 'nemesis',     name: 'Nemesis',     tone: 'hostile' },
  { tier: -4, id: 'hostile',     name: 'Hostile',     tone: 'hostile' },
  { tier: -3, id: 'blacklisted', name: 'Blacklisted', tone: 'hostile' },
  { tier: -2, id: 'unwelcome',   name: 'Unwelcome',   tone: 'wary' },
  { tier: -1, id: 'suspect',     name: 'Suspect',     tone: 'wary' },
  { tier:  0, id: 'unknown',     name: 'Unknown',     tone: 'unknown' },
  { tier:  1, id: 'rookie',      name: 'Rookie',      tone: 'positive' },
  { tier:  2, id: 'associate',   name: 'Associate',   tone: 'positive' },
  { tier:  3, id: 'trusted',     name: 'Trusted',     tone: 'favored' },
  { tier:  4, id: 'champion',    name: 'Champion',    tone: 'favored' },
  { tier:  5, id: 'vanguard',    name: 'Vanguard',    tone: 'allied' },
];

/** Min cumulative rep required to hold each tier (negatives = at or below). */
export const TIER_THRESHOLDS = {
  1: 100,
  2: 300,
  3: 800,
  4: 1500,
  5: 3000,
  [-1]: -100,
  [-2]: -300,
  [-3]: -800,
  [-4]: -1500,
  [-5]: -3000,
};

export const FACTION_IDS = ['frontier_union', 'ironhands', 'astral_institute'];

/**
 * Standing perks — one unlocked at each positive rank (+1 Rookie … +5 Vanguard).
 * Effects are multiplicative keys consumed by systems/factions.js helpers.
 */
export const FACTION_PERKS = {
  frontier_union: [
    {
      id: 'fu_patrol', rank: 1, name: 'Lane Patrols', icon: 'radar',
      desc: '+10% turret damage across the grid.',
      effect: { turretDmgMult: 1.10 },
    },
    {
      id: 'fu_hulls', rank: 2, name: 'Hardened Hulls', icon: 'shield',
      desc: '+15% max HP on combat ships.',
      effect: { combatHpMult: 1.15 },
    },
    {
      id: 'fu_supply', rank: 3, name: 'Supply Lines', icon: 'local_shipping',
      desc: '+20% cargo load & unload speed, and −15% coin cost on building upgrades.',
      effect: { loadSpeedMult: 1.20, buildingUpgradeCoinMult: 0.85 },
    },
    {
      id: 'fu_fortress', rank: 4, name: 'Fortress Doctrine', icon: 'fort',
      desc: '+12% base station max HP.',
      effect: { baseHpMult: 1.12 },
    },
    {
      id: 'fu_marshal', rank: 5, name: 'Sector Marshal', icon: 'military_tech',
      desc: '+25% turret damage and pirate heat rises 25% slower. Union crowning gift.',
      effect: { turretDmgMult: 1.25, pirateHeatMult: 0.75 },
    },
  ],
  ironhands: [
    {
      id: 'ih_scrap', rank: 1, name: 'Scrap Dividend', icon: 'recycling',
      desc: '+25% materials recovered when salvaging ships.',
      effect: { salvageMult: 1.25 },
    },
    {
      id: 'ih_yard', rank: 2, name: 'Yard Shortcuts', icon: 'construction',
      desc: '−15% material costs on all crafts and −15% coin cost on ship upgrades.',
      effect: { craftMatMult: 0.85, shipUpgradeCoinMult: 0.85 },
    },
    {
      id: 'ih_ore', rank: 3, name: 'Ore Hounds', icon: 'hardware',
      desc: '+12% mining speed fleet-wide.',
      effect: { mineSpeedMult: 1.12 },
    },
    {
      id: 'ih_rig', rank: 4, name: 'Jury-Rig', icon: 'build',
      desc: '−30% coin cost to repair ships.',
      effect: { repairCostMult: 0.70 },
    },
    {
      id: 'ih_wrecklords', rank: 5, name: 'Wrecklords', icon: 'precision_manufacturing',
      desc: '2× salvage yields and −25% craft times. Ironhands crowning gift.',
      effect: { salvageMult: 2.0, craftTimeMult: 0.75 },
    },
  ],
  astral_institute: [
    {
      id: 'ai_grant', rank: 1, name: 'Grant Cycle', icon: 'science',
      desc: '+5 Research Point capacity.',
      effect: { rpCapBonus: 5 },
    },
    {
      id: 'ai_lab', rank: 2, name: 'Lab Protocol', icon: 'apartment',
      desc: '−15% coin cost on building upgrades.',
      effect: { buildingUpgradeCoinMult: 0.85 },
    },
    {
      id: 'ai_composite', rank: 3, name: 'Composite Insight', icon: 'biotech',
      desc: '+8% sell prices on the Trade post.',
      effect: { sellPriceMult: 1.08 },
    },
    {
      id: 'ai_chart', rank: 4, name: 'Anomaly Charting', icon: 'blur_on',
      desc: 'Black-hole drag eased — ships keep more speed near anomalies.',
      effect: { bhFloorBonus: 0.12 },
    },
    {
      id: 'ai_survey', rank: 5, name: 'Deep Survey Mandate', icon: 'public',
      desc: '+1 RP each SOL and unlocks Galaxy Survey prep for future warp expeditions.',
      effect: { solRpBonus: 1, galaxySurvey: true },
    },
  ],
};

export const FACTION_DEFS = {
  frontier_union: {
    id: 'frontier_union',
    name: 'The Frontier Union',
    shortName: 'Frontier Union',
    tagline: 'Commanders · Colonists · Expansion',
    color: '#5ec8ff',
    accent: '#2a7ab8',
    icon: 'flag',
    logo: 'assets/images/factions/frontier_union.png',
    portrait: 'assets/images/factions/frontier_union.png',
    byline: 'Expansion charters and haul fleets pushing the outer belt.',
    blurb:
      'A coalition of outpost commanders, haul fleets, and colonial charters pushing the belt outward. ' +
      'The Union prizes reliable extraction, safe lanes, and bases that hold when the black turns hostile. ' +
      'Earn their trust by keeping the frontier fed — coin flowing, hulls flying, and new ground claimed.',
    interests: ['Expansion', 'Logistics', 'Base security'],
    futureNote: 'Standing unlocks combat & base-security perks through Vanguard.',
  },
  ironhands: {
    id: 'ironhands',
    name: 'The Ironhands',
    shortName: 'Ironhands',
    tagline: 'Tinkerers · Salvagers · Independent miners',
    color: '#ff9a4a',
    accent: '#b85a20',
    icon: 'build',
    logo: 'assets/images/factions/ironhands.png',
    portrait: 'assets/images/factions/ironhands.png',
    byline: 'Independent salvage crews who turn wrecks into working hulls.',
    blurb:
      'Grease-stained independents who live by wrench and wreck. Ironhands crews strip derelicts, jury-rig ' +
      'ore haulers, and sell what the corps call scrap. They respect grit, clever salvage, and anyone who ' +
      'can turn a dead hull into a working one before the next SOL.',
    interests: ['Salvage', 'Engineering', 'Raw ore'],
    futureNote: 'Standing unlocks salvage, yard, and mining perks through Vanguard.',
  },
  astral_institute: {
    id: 'astral_institute',
    name: 'The Astral Institute',
    shortName: 'Astral Institute',
    tagline: 'Scientists · Researchers · Cosmic phenomena',
    color: '#c49bff',
    accent: '#6a3cb0',
    icon: 'biotech',
    logo: 'assets/images/factions/astral_institute.png',
    portrait: 'assets/images/factions/astral_institute.png',
    byline: 'A research charter chasing stellar anomalies and deep-space science.',
    blurb:
      'A research charter dedicated to stellar anomalies, rare isotopes, and the quiet math of deep space. ' +
      'Institute attachés fund probes, lab networks, and careful observation over brute force. ' +
      'They reward commanders who feed science — data, exotic samples, and disciplined research spend.',
    interests: ['Research', 'Anomalies', 'Advanced materials'],
    futureNote: 'Standing unlocks lab, market, and galaxy-survey perks through Vanguard.',
  },
};

export function getFactionPerks(factionId) {
  return FACTION_PERKS[factionId] || [];
}

export function getFactionPerkDef(factionId, perkId) {
  return getFactionPerks(factionId).find((p) => p.id === perkId) || null;
}

/** Faction logo <img> markup from individual art assets. */
export function factionLogoHtml(factionIdOrDef, size = 48, extraClass = '') {
  const def = typeof factionIdOrDef === 'string' ? getFactionDef(factionIdOrDef) : factionIdOrDef;
  if (!def) return '';
  const src = def.logo || def.portrait;
  if (!src) return '';
  const s = Math.max(16, Math.floor(Number(size) || 48));
  const cls = ['faction-logo', extraClass].filter(Boolean).join(' ');
  const alt = def.shortName || def.name || 'Faction';
  return `<img class="${cls}" src="${src}" alt="${alt}" width="${s}" height="${s}" style="width:${s}px;height:${s}px" draggable="false">`;
}

export function getFactionDef(id) {
  return FACTION_DEFS[id] || null;
}

export function listFactions() {
  return FACTION_IDS.map((id) => FACTION_DEFS[id]).filter(Boolean);
}

/** Map cumulative rep points → tier -5…+5. */
export function getStandingTier(rep) {
  const n = Math.floor(Number(rep) || 0);
  if (n >= TIER_THRESHOLDS[5]) return 5;
  if (n >= TIER_THRESHOLDS[4]) return 4;
  if (n >= TIER_THRESHOLDS[3]) return 3;
  if (n >= TIER_THRESHOLDS[2]) return 2;
  if (n >= TIER_THRESHOLDS[1]) return 1;
  if (n <= TIER_THRESHOLDS[-5]) return -5;
  if (n <= TIER_THRESHOLDS[-4]) return -4;
  if (n <= TIER_THRESHOLDS[-3]) return -3;
  if (n <= TIER_THRESHOLDS[-2]) return -2;
  if (n <= TIER_THRESHOLDS[-1]) return -1;
  return 0;
}

export function getStandingTierInfo(rep) {
  const tier = getStandingTier(rep);
  return STANDING_TIERS.find((t) => t.tier === tier) || STANDING_TIERS[5];
}

export function standingLabel(rep) {
  return getStandingTierInfo(rep).name;
}

export function standingTone(rep) {
  return getStandingTierInfo(rep).tone;
}

/** Human tip for a tier slot: name + rep needed to reach it. */
export function standingTierTip(tier) {
  const t = Math.max(-5, Math.min(5, Math.floor(Number(tier) || 0)));
  const info = STANDING_TIERS.find((x) => x.tier === t) || STANDING_TIERS[5];
  if (t === 0) {
    return `<strong>${info.name}</strong><br>Starting rank · 0 standing`;
  }
  const need = TIER_THRESHOLDS[t];
  if (t > 0) {
    return `<strong>${info.name}</strong> (Rank +${t})<br>Requires <strong>${need.toLocaleString()}</strong> standing`;
  }
  return `<strong>${info.name}</strong> (Rank ${t})<br>Falls to this at <strong>${need.toLocaleString()}</strong> standing`;
}

/** Progress 0–1 within current tier toward the next (for bar fill). */
export function standingTierProgress(rep) {
  const n = Math.floor(Number(rep) || 0);
  const tier = getStandingTier(n);
  if (tier >= 5) return 1;
  if (tier <= -5) return 1;
  if (tier >= 0) {
    const lo = tier === 0 ? 0 : TIER_THRESHOLDS[tier];
    const hi = TIER_THRESHOLDS[tier + 1];
    if (hi == null || hi <= lo) return 1;
    return Math.max(0, Math.min(1, (n - lo) / (hi - lo)));
  }
  // negative: progress toward more negative
  const hi = tier === 0 ? 0 : TIER_THRESHOLDS[tier]; // less negative bound
  const lo = TIER_THRESHOLDS[tier - 1]; // more negative
  if (lo == null || hi <= lo) return 1;
  // n is between lo and hi (lo more negative)
  return Math.max(0, Math.min(1, (hi - n) / (hi - lo)));
}
