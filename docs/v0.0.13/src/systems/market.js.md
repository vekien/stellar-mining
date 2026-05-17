# `src/systems/market.js`

Sell-resource action.

## What it does

- `getSellPrice(type)` — base price × `market_influence` × current
  `marketBoost` / `extraDemands` multiplier.
- `sellResource(type, amount)` (on `window`) — applies sale, increments
  coins, logs, triggers Sera's transmission at the 50k threshold.

## Notes

- `BASE_MAX_SHIPS.length` is used as a proxy for "max base tier" — should
  be a named constant (e.g. `BASE_TIER_MAX`).
- One-off `window.sellResource` global; merge into a `Market` system
  imported by the UI directly.

## Inline CSS

None.

## Modularization candidates

- Combine with `systems/sol.js`'s `rollMarketDemands` into one `Market`
  system class.
