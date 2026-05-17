# `src/data/nodes.js`

World node placement and the crashed-ship landmark spawner.

## Exports

- `NODE_BANDS[]` — concentric distance bands (`{ minLevel, minDist, maxDist,
  types[] }`). Each band is a Chebyshev annulus around the base; `types[]`
  is sampled (with replacement-by-list-length) so band T2 has more iron
  than gold.
- `CRASHED_SHIP_NODE_TYPE = 'crashed_ship'`.
- `generateNodes(baseCol, baseRow, seed)` — deterministic generation with
  a Mulberry32 PRNG.
- Re-exports `BASE_UPGRADE_COSTS / BASE_MAX_SHIPS / BASE_RANGE` from
  `data/base.js` for back-compat. Drop when callers are updated.

## Generation algorithm

1. For each `NODE_BANDS` entry, enumerate Chebyshev-annulus candidates
   that respect a 2-tile axis-aligned exclusion ring near the base.
2. Shuffle, then greedily pick up to `band.types.length` candidates with
   `minSeparation = 2` to avoid adjacency.
3. If we ran out of separated candidates, fill the remainder unfiltered
   (this is the "fallback" loop near line 87).
4. Shuffle the type list and zip with the chosen coords.

After the standard bands, scan a wider annulus (`cheb ≥ 8`) for crashed-ship
candidates; spawn one per `CRASHED_SHIP_SPAWNS` entry with their respective
`minLevel`.

## Notes

- `relMax = 48` clamps how far nodes can spawn (vs the 50-row half-grid).
  Worth pulling into `constants.js` next to `GRID_COLS`.
- The PRNG is inlined; reusable as `helpers/rng.js`.

## Inline CSS

None.

## Modularization candidates

- Promote `mulberry32`, `shuffle`, `isTooCloseToExisting` to `helpers/rng.js`
  and `helpers/grid.js`.
- Replace the back-compat re-exports with direct imports from `data/base.js`.
- Encode crashed-ship spawn definitions as a generic `LANDMARK_DEFS` list so
  future special nodes don't need bespoke code paths.
