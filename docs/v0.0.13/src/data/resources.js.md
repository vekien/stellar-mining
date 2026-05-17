# `src/data/resources.js`

Per-resource colors, labels, sell prices, and blurbs. Plus the tier table.

## Exports

- `RESOURCE_DEFS` — `{ [type]: { color, label, sellPrice, blurb, special? } }`.
  The first entry is `crashed_ship` (`special: true`, sellPrice 0, no tier).
- `MINE_TIERS` — `{ [tier]: { label, resources[2], color } }`. Each tier
  groups two resources; the color drives tier pills in the UI.
- `getResourceTier(type)` — reverse lookup over `MINE_TIERS`.

## Notes

- Tiers 1–10 each carry exactly two resources. The data is the source of
  truth for which resources are "tier N". Many sites assume two-per-tier.
- `RESOURCE_DEFS.crashed_ship` lives in the same map but is `special`. Most
  iterations of `RESOURCE_DEFS` should skip special entries — currently
  done ad-hoc by checking `def.special`. Worth a `MINEABLE_RESOURCE_TYPES`
  helper.

## Inline CSS

None.

## Modularization candidates

- Expose a `getMineableTypes()` helper to centralise the `def.special`
  filter.
- Move the `crashed_ship` special into a `LANDMARK_DEFS` table (see
  `nodes.js` doc).
