# `src/data/research.js`

Tuning constants and tree structure for research.

## Exports

### Tuning constants

- `HEALTH_INCREASE_HP_PER_PURCHASE = 8000`, `_MAX_PURCHASES = 10`.
- `SHIELD_PCT_PER_PURCHASE = 0.05`, `_MAX_PURCHASES = 10`,
  `SHIELD_REGEN_INTERVAL_S = 1`, `_PER_PURCHASE_PER_TICK = 12.5`.
- `ANTI_COMET_CHANCE_PER_PURCHASE = 0.05`, `_MAX_PURCHASES = 10`.
- `SOLAR_SHIELD_REDUCTION_PER_PURCHASE = 0.08`, `_MAX_PURCHASES = 10`.
- `AUTO_REGEN_HP_PER_PURCHASE = 5`, `_MAX_PURCHASES = 10`.
- `DEFENSE_DAMAGE_REDUCTION = 0.10` — armor plating (future).
- `MARKET_INFLUENCE_BONUS = 0.10` — global sell-price bonus.
- `HP_BOOST_HEALTH_PER_PURCHASE` — alias of `HEALTH_INCREASE_HP_PER_PURCHASE`
  kept for back-compat.

### Functions

- `getResearchPointCap(baseTier)` — linear from 5 (T1) to 100 (T10).
- `getRepeatableCount(id, state)` — reads the right counter for each
  repeatable.
- `getRepeatableMax(id)` — lookup table for repeatable caps.

### Tree

`RESEARCH_TREE[]` — array of `{ tier, label, minBaseLevel?, unlocks[] }`.
Each `unlock` is `{ id, name, cost, icon, repeatable?, desc }`.

Currently has Tier 1, 2, 3, 4, 5, 7, 8, 10 (gaps at 6 and 9).

## Notes

- `getRepeatableCount` hard-codes counter names. Cleaner: store them in a
  `repeatableState.<id>` sub-object on state and look up by id.
- `HP_BOOST_HEALTH_PER_PURCHASE` is dead-named — only `state.js` still uses
  the old name; remove once the migration is verified.

## Inline CSS

None.

## Modularization candidates

- The whole file is data. Pair it with `systems/research.js` and the panel
  rendering in `ui/panels.js` to form a `ResearchSystem` once the tree
  shape stabilises.
