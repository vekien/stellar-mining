// ============================================================
// NODE & BASE DATA
// ============================================================
// BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE have moved to data/base.js.
// Re-exported here for backward compatibility.
export { BASE_UPGRADE_COSTS, BASE_MAX_SHIPS, BASE_RANGE } from './base.js';

export const NODE_BANDS = [
  { minLevel: 1,  minDist: 2,  maxDist: 5,  types: ['iron','iron','iron','copper','copper','oxygen','nickel','silicon','cobalt'] },
  { minLevel: 2,  minDist: 6,  maxDist: 10, types: ['iron','iron','copper','copper','oxygen','nickel','silicon','cobalt','titanium','aluminum'] },
  { minLevel: 3,  minDist: 11, maxDist: 15, types: ['copper','copper','oxygen','nickel','silicon','cobalt','titanium','aluminum','gold','chromium'] },
  { minLevel: 4,  minDist: 16, maxDist: 20, types: ['oxygen','nickel','silicon','cobalt','titanium','aluminum','gold','chromium','silver','neon'] },
  { minLevel: 5,  minDist: 21, maxDist: 25, types: ['silicon','cobalt','titanium','aluminum','gold','chromium','silver','neon','platinum','xenon'] },
  { minLevel: 6,  minDist: 26, maxDist: 30, types: ['titanium','aluminum','gold','chromium','silver','neon','platinum','xenon','iridium','palladium'] },
  { minLevel: 7,  minDist: 31, maxDist: 35, types: ['gold','chromium','silver','neon','platinum','xenon','iridium','palladium','uranium','osmium'] },
  { minLevel: 8,  minDist: 36, maxDist: 40, types: ['silver','neon','platinum','xenon','iridium','palladium','osmium','rhodium','hafnium'] },
  { minLevel: 9,  minDist: 41, maxDist: 45, types: ['platinum','xenon','iridium','palladium','osmium','rhodium','hafnium','hafnium'] },
  { minLevel: 10, minDist: 46, maxDist: 50, types: ['iridium','palladium','uranium','uranium','osmium','rhodium','hafnium'] },
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

export function generateNodes(baseCol, baseRow, seed) {
  const rand = mulberry32(seed || 1);
  const all = [];
  let id = 0;
  const minSeparation = 2;
  const relMin = 2;
  const relMax = 48;

  for (const band of NODE_BANDS) {
    const candidates = [];
    for (let dc = -band.maxDist; dc <= band.maxDist; dc++) {
      for (let dr = -band.maxDist; dr <= band.maxDist; dr++) {
        const cheb = Math.max(Math.abs(dc), Math.abs(dr));
        if (cheb < band.minDist || cheb > band.maxDist) continue;
        if (Math.abs(dc) < relMin || Math.abs(dr) < relMin) continue;
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

  return all;
}
