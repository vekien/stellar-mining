# `src/systems/research.js`

The research-purchase action. One big `purchaseResearch(unlockId)` switch
exposed as `window.purchaseResearch`.

## Exports

- `getMaxShield()` — `floor(base.maxHealth × shieldBoostCount × 0.05)`.
- `window.purchaseResearch(unlockId)` — looks up the tree entry, gates by
  tier/coins/RP/cap, then runs an unlock-specific case to mutate state.

## Notes

- The switch case grows with every new research entry. Refactor: each
  research entry declares its own `apply(state, def)` so the switch
  disappears.
- `trackUnlock` is defined inside `window.purchaseResearch` as a closure;
  hoist.
- Re-opens the research panel from inside the action (`openHdrPanel`) —
  presentational concern in the system layer.

## Inline CSS

None.

## Modularization candidates

- `ResearchSystem.purchase(id)` with per-id apply functions.
- Move panel re-render into a panel-side event listener.
