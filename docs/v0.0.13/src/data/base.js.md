# `src/data/base.js`

Plain constant tables for the base station. No functions, no state.

## Exports

- `BASE_UPGRADE_COSTS` — coin cost per target tier (index = target tier).
- `BASE_MAX_SHIPS` — fleet cap per base tier (index = tier - 1).
- `BASE_RANGE` — mining/turret range in tiles per base tier (index = tier - 1).
- `BASE_TIER_REQS` — `{ [targetTier]: { [resource]: amount } }` resource cost
  for each base upgrade. Always uses the two resources from the previous
  tier's NODE_BANDS.
- `SHIP_TIER_REQS` — `{ [targetTier]: { [resource]: amount } }` for
  ship-tier upgrades.

## Inline CSS

None.

## Modularization candidates

These tables are the de-facto "tier curve" for the whole game. After
modularization, expose them through a `TierCurve` helper so callers don't
hard-index by `tier - 1` everywhere (off-by-one risk).

`BASE_UPGRADE_COSTS[0] === 0` is wasted — the curve effectively starts at
index 1. Decide between "index is tier" (with a 0 sentinel) or "index is
tier-1" and stick with one convention.
