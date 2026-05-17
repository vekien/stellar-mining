# `src/constants.js`

Module-level constants shared across the whole game. Read by almost every
render/input/system module.

## Exports

| Symbol | Purpose |
|---|---|
| `TILE_W`, `TILE_H` | Iso tile dimensions in pixels (64x32). |
| `GRID_COLS`, `GRID_ROWS` | World grid size (100x100). |
| `BASE_COL`, `BASE_ROW` | Default base coordinates (50,50). |
| `BASE_FOOTPRINT_RADIUS` | Chebyshev half-extent of the base footprint (1 → 3x3). |
| `isBaseFootprintCell(col, row)` | Predicate used by every placement check. |
| `SAVE_KEY` | LocalStorage key for the save. Version pinned in the key (`_v1`). |
| `PLAYER_TITLE` | "Commander" — used in transmission templates. |
| `SOL_DURATION` | Re-exported from `data/sol.js` for backward compatibility. |
| `TWINKLE_FPS`, `TWINKLE_INTERVAL_MS` | Background-star animation cadence. |
| `ZOOM_MIN`, `ZOOM_MAX` | Camera zoom bounds. |

## Dependencies

Only `./data/sol.js`. Pure constants otherwise — safe to import anywhere.

## Notes

- The re-export of `SOL_DURATION` is the only thing that prevents this file
  from being a leaf module. It exists "for backward compatibility" — once
  callers are audited, the re-export can be dropped.
- `SAVE_KEY` ends with `_v1` but `state.js` tracks a `SAVE_VERSION` counter
  (currently 6). The string-suffix scheme and the version counter are
  redundant; pick one (counter).

## Inline CSS

None.

## Modularization candidates

This file is already in the right shape — single source of truth for
dimensions and grid sizing. It only needs cleanup of the SOL_DURATION
re-export and possibly a split into `world.ts` / `camera.ts` / `save.ts`
constants groups if we go TS later.
