# `src/data/sol.js`

Time and market-boost tuning constants.

## Exports

- `SOL_DURATION = 180` — seconds per SOL (3 real minutes per game day).
- `MARKET_BOOST_MIN = 1.2`, `MARKET_BOOST_MAX = 2.0` — random demand
  multiplier range when a new SOL rolls its boosted resource.

## Notes

- Event scheduling constants are *not* here — they live in `data/events.js`.
  The header comment calls this out; worth keeping consistent.
- `SOL_DURATION` is also re-exported from `constants.js`. Pick one canonical
  location.

## Inline CSS

None.
