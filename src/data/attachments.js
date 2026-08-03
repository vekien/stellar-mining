// ============================================================
// COMBAT SHIP ATTACHMENTS — offense + defense loadout
// ============================================================

/** Slot unlocks by ship mineTier (rank). */
export function getAttachmentSlotCount(mineTier = 1) {
  const t = Math.max(1, Math.floor(mineTier || 1));
  if (t >= 10) return 4;
  if (t >= 8) return 3;
  if (t >= 4) return 2;
  return 1;
}

export const ATTACHMENT_SLOT_LABELS = ['PORT', 'CENTER', 'STARBOARD', 'AUX'];

export const ATTACHMENT_DEFS = {
  // ── Offense ────────────────────────────────────────────────
  pulse_laser: {
    id: 'pulse_laser',
    name: 'Pulse Laser',
    kind: 'offense',
    icon: 'bolt',
    color: '#5ec8ff',
    desc: 'Standard forward guns. Damage and fire rate scale with ship ATK / ATK RATE.',
    fireMode: 'pulse',
  },
  stun: {
    id: 'stun',
    name: 'Stun Emitter',
    kind: 'offense',
    icon: 'electric_bolt',
    color: '#a0e0ff',
    desc: 'Fires a disabling pulse that stuns a target for 2s. 30s cooldown.',
    fireMode: 'stun',
    cooldown: 30,
    stunDuration: 2,
  },
  beam_laser: {
    id: 'beam_laser',
    name: 'Beam Laser',
    kind: 'offense',
    icon: 'flashlight_on',
    color: '#ffd060',
    desc: 'Heavy beam dealing 3× ATK damage. 3s cooldown.',
    fireMode: 'beam',
    cooldown: 3,
    damageMult: 3,
    beamDuration: 0.45,
  },
  cluster_bombs: {
    id: 'cluster_bombs',
    name: 'Cluster Bombs',
    kind: 'offense',
    icon: 'bomb',
    color: '#ff9060',
    desc: 'Launches bomblets in random directions. Explode on enemy contact.',
    fireMode: 'cluster',
    cooldown: 4.5,
    clusterCount: 7,
    clusterSpeed: 200,
    clusterLife: 1.35,
    explosionRadius: 48,
    damageMult: 0.55,
  },
  spiral_laser: {
    id: 'spiral_laser',
    name: 'Spiral Laser',
    kind: 'offense',
    icon: 'cyclone',
    color: '#c080ff',
    desc: 'Sweeps twin beams in a circle for 1s. 10s cooldown.',
    fireMode: 'spiral',
    cooldown: 10,
    duration: 1,
    damageMult: 0.35,
    tickRate: 18,
  },

  // ── Defense ────────────────────────────────────────────────
  health_boost: {
    id: 'health_boost',
    name: 'Health Boost',
    kind: 'defense',
    icon: 'favorite',
    color: '#6fff9a',
    desc: 'Reinforced plating — doubles maximum hull HP.',
    hpMult: 2,
  },
  boost_frequency: {
    id: 'boost_frequency',
    name: 'Boost Frequency',
    kind: 'defense',
    icon: 'speed',
    color: '#7ec8ff',
    desc: 'Afterburner capacitors recharge much faster between boosts.',
    boostCdMult: 0.35,
  },
  regenerate: {
    id: 'regenerate',
    name: 'Regenerate',
    kind: 'defense',
    icon: 'healing',
    color: '#80ffc0',
    desc: 'Nano-repair mesh restores 1% max HP every second.',
    regenPerSec: 0.01,
  },
};

export const OFFENSE_ATTACHMENT_IDS = Object.keys(ATTACHMENT_DEFS)
  .filter((id) => ATTACHMENT_DEFS[id].kind === 'offense');
export const DEFENSE_ATTACHMENT_IDS = Object.keys(ATTACHMENT_DEFS)
  .filter((id) => ATTACHMENT_DEFS[id].kind === 'defense');

export function getAttachmentDef(id) {
  return ATTACHMENT_DEFS[id] || null;
}

/** Normalize ship.attachments to current slot count; default first slot pulse laser. */
export function normalizeShipAttachments(ship, shipRole) {
  if (!ship) return [];
  const isCombat = shipRole === 'combat' || shipRole === 'garrison';
  if (!isCombat && !ship.isHqSupport) {
    ship.attachments = [];
    return ship.attachments;
  }
  const slots = getAttachmentSlotCount(ship.mineTier || 1);
  let list = Array.isArray(ship.attachments) ? ship.attachments.slice(0, slots) : [];
  while (list.length < slots) list.push(null);
  // Default: ensure at least one pulse laser if completely empty
  if (list.every((a) => !a)) list[0] = 'pulse_laser';
  // Drop unknown ids
  list = list.map((id) => (id && ATTACHMENT_DEFS[id] ? id : null));
  if (list.every((a) => !a)) list[0] = 'pulse_laser';
  ship.attachments = list;
  if (!ship.attachmentCds || typeof ship.attachmentCds !== 'object') {
    ship.attachmentCds = {};
  }
  return ship.attachments;
}

export function shipHasAttachment(ship, id) {
  return Array.isArray(ship?.attachments) && ship.attachments.includes(id);
}

export function getShipOffenseAttachments(ship) {
  return (ship?.attachments || [])
    .map((id) => ATTACHMENT_DEFS[id])
    .filter((d) => d && d.kind === 'offense');
}

export function getShipHpMultiplier(ship) {
  let m = 1;
  for (const id of ship?.attachments || []) {
    const d = ATTACHMENT_DEFS[id];
    if (d?.hpMult) m *= d.hpMult;
  }
  return m;
}

export function getShipBoostCdMult(ship) {
  let m = 1;
  for (const id of ship?.attachments || []) {
    const d = ATTACHMENT_DEFS[id];
    if (d?.boostCdMult) m = Math.min(m, d.boostCdMult);
  }
  return m;
}

export function getShipRegenPerSec(ship) {
  let r = 0;
  for (const id of ship?.attachments || []) {
    const d = ATTACHMENT_DEFS[id];
    if (d?.regenPerSec) r += d.regenPerSec;
  }
  return r;
}
