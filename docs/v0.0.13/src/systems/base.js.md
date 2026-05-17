# `src/systems/base.js`

Base repair + upgrade actions. Both are exposed as `window.repairBase` /
`window.upgradeBase` so HTML buttons can call them directly.

## What it does

- `getRepairCost(amount)` — 1 coin per HP.
- `repairBase(amount)` — clamps to missing HP, spends coins, logs.
- `upgradeBase()` — checks coin + resource gates from
  `BASE_UPGRADE_COSTS` / `BASE_TIER_REQS`, then:
  1. spends; ups `state.base.level`.
  2. animates the base range via `state.baseRangeAnim`.
  3. recomputes `maxHealth = 10000 + (level-1) × 10000 + hpBoostCount × 8000`.
  4. grants +1 RP (capped by `getResearchPointCap`).
  5. fades-in newly unlocked nodes + particle burst.
  6. fires the per-tier transmissions (Juno @ T2, Rigs @ T2 hauler, Vane,
     Dax @ T3, Kai @ T3, Rigs base_unlock for any newly unlocked ship
     mineTiers).
  7. focuses camera on base, closes base panel.

## Notes

- The `state.base.maxHealth` recomputation is **duplicated** in
  `state.js#loadGame`. Centralise the formula.
- Transmissions are dispatched with hard-coded `setTimeout` chains — when
  the player rapid-upgrades multiple tiers, overlaps are likely.

## Inline CSS

None.

## Modularization candidates

- Replace `window.repairBase/upgradeBase` with proper exports that
  `ui/basePanel.js` imports.
- A `BaseSystem` class with `applyUpgrade(targetLevel)`, isolating the
  side-effects.
