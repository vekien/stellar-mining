// ============================================================
// NODE & BASE DATA
// ============================================================
// BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE have moved to data/base.js.
// Re-exported here for backward compatibility.
import { BASE_NODE_NO_SPAWN } from './base.js';
export { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE, BASE_NODE_NO_SPAWN } from './base.js';

// Bands align with BASE_RANGE maxDist (+7/tier). minDist starts past the base no-spawn ring.
// Higher bands keep a few early ores (iron/copper/…) so late game still has basic feedstock.
export const NODE_BANDS = [
  { minLevel: 1,  minDist: 3,  maxDist: 7,  types: ['iron','iron','iron','copper','copper','oxygen','nickel','silicon','cobalt'] },
  { minLevel: 2,  minDist: 8,  maxDist: 14, types: ['iron','iron','copper','copper','oxygen','nickel','silicon','cobalt','titanium','aluminum'] },
  { minLevel: 3,  minDist: 15, maxDist: 21, types: ['iron','copper','oxygen','nickel','silicon','cobalt','titanium','aluminum','gold','chromium'] },
  { minLevel: 4,  minDist: 22, maxDist: 28, types: ['iron','oxygen','nickel','silicon','cobalt','titanium','aluminum','gold','chromium','silver','neon'] },
  { minLevel: 5,  minDist: 29, maxDist: 35, types: ['iron','copper','silicon','cobalt','titanium','aluminum','gold','chromium','silver','neon','platinum','xenon'] },
  { minLevel: 6,  minDist: 36, maxDist: 42, types: ['iron','copper','titanium','aluminum','gold','chromium','silver','neon','platinum','xenon','iridium','palladium'] },
  { minLevel: 7,  minDist: 43, maxDist: 49, types: ['iron','iron','copper','gold','chromium','silver','neon','platinum','xenon','iridium','palladium','uranium','osmium'] },
  { minLevel: 8,  minDist: 50, maxDist: 56, types: ['iron','copper','oxygen','silver','neon','platinum','xenon','iridium','palladium','osmium','rhodium','hafnium'] },
  { minLevel: 9,  minDist: 57, maxDist: 63, types: ['iron','iron','copper','nickel','platinum','xenon','iridium','palladium','osmium','rhodium','hafnium','hafnium'] },
  { minLevel: 10, minDist: 64, maxDist: 70, types: ['iron','iron','copper','copper','iridium','palladium','uranium','uranium','osmium','rhodium','hafnium'] },
];

export const CRASHED_SHIP_NODE_TYPE = 'crashed_ship';
const CRASHED_SHIP_SPRITES = [
  'assets/images/crashed_ships/crashed_ship_1.png',
  'assets/images/crashed_ships/crashed_ship_2.png',
];
// Derelicts only unlock from base rank 5+
const CRASHED_SHIP_SPAWNS = [
  { minLevel: 5 },
  { minLevel: 7 },
  { minLevel: 9 },
  { minLevel: 10 },
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isTooCloseToExisting(col, row, picked, minSeparation) {
  for (const [pc, pr] of picked) {
    const cheb = Math.max(Math.abs(col - pc), Math.abs(row - pr));
    if (cheb < minSeparation) return true;
  }
  return false;
}

export function nodeChebFromBase(col, row, baseCol, baseRow) {
  return Math.max(Math.abs(col - baseCol), Math.abs(row - baseRow));
}

export function isInsideBaseNodeNoSpawn(col, row, baseCol, baseRow) {
  return nodeChebFromBase(col, row, baseCol, baseRow) <= BASE_NODE_NO_SPAWN;
}

export function generateNodes(baseCol, baseRow, seed) {
  const rand = mulberry32(seed || 1);
  const all = [];
  let id = 0;
  const minSeparation = 2;
  const relMax = 70;
  const noSpawn = BASE_NODE_NO_SPAWN;

  for (const band of NODE_BANDS) {
    const candidates = [];
    for (let dc = -band.maxDist; dc <= band.maxDist; dc++) {
      for (let dr = -band.maxDist; dr <= band.maxDist; dr++) {
        const cheb = Math.max(Math.abs(dc), Math.abs(dr));
        if (cheb <= noSpawn) continue;
        if (cheb < band.minDist || cheb > band.maxDist) continue;
        if (Math.abs(dc) > relMax || Math.abs(dr) > relMax) continue;
        candidates.push([baseCol + dc, baseRow + dr]);
      }
    }

    shuffle(candidates, rand);
    const chosen = [];
    for (const [c, r] of candidates) {
      if (chosen.length >= band.types.length) break;
      if (isTooCloseToExisting(c, r, chosen, minSeparation)) continue;
      chosen.push([c, r]);
    }

    if (chosen.length < band.types.length) {
      for (const [c, r] of candidates) {
        if (chosen.length >= band.types.length) break;
        if (chosen.some(([pc, pr]) => pc === c && pr === r)) continue;
        chosen.push([c, r]);
      }
    }

    const types = shuffle([...band.types], rand);

    for (let i = 0; i < chosen.length; i++) {
      const [c, r] = chosen[i];
      all.push({ id: id++, type: types[i], gr: [c, r], minLevel: band.minLevel });
    }
  }

  const occupied = new Set(all.map((node) => `${node.gr[0]},${node.gr[1]}`));
  const specialCandidates = [];
  for (let dc = -relMax; dc <= relMax; dc++) {
    for (let dr = -relMax; dr <= relMax; dr++) {
      const cheb = Math.max(Math.abs(dc), Math.abs(dr));
      if (cheb <= noSpawn) continue;
      if (cheb < 8 || cheb > relMax) continue;
      const col = baseCol + dc;
      const row = baseRow + dr;
      if (occupied.has(`${col},${row}`)) continue;
      specialCandidates.push([col, row]);
    }
  }

  shuffle(specialCandidates, rand);
  for (const spawnDef of CRASHED_SHIP_SPAWNS) {
    const crashedShipPos = specialCandidates.shift();
    if (!crashedShipPos) break;
    const [col, row] = crashedShipPos;
    all.push({
      id: id++,
      type: CRASHED_SHIP_NODE_TYPE,
      gr: [col, row],
      minLevel: spawnDef.minLevel,
      special: true,
      sprite: CRASHED_SHIP_SPRITES[Math.floor(rand() * CRASHED_SHIP_SPRITES.length)],
    });
  }

  return all;
}
