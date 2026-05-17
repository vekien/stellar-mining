# `src/helpers.js`

Grab-bag of formatting helpers, the coin/log mutators, and the tooltip API.
Imported across nearly every file.

## Exports

### Number / color formatting

- `hexToRgb(hex)` — `"r,g,b"` string for `rgba()` interpolation.
- `isLightColor(hex)` — perceived-luminance predicate for choosing text color.
- `fmt(n)` — `Math.floor(n).toLocaleString()`.
- `MAX_COINS`, `RESOURCE_CAP` — 999,999,999 caps.
- `clampCoins(n)` — clamps to `[0, MAX_COINS]`.

### State-bound helpers (require `setStateRef(state)` first)

- `setStateRef(s)` — wire to the game state object.
- `setHeaderCoinCb(fn)` — register the header refresh callback.
- `addCoins(n)` / `spendCoins(n)` — mutate `state.coins`, fire callback,
  show the "Currency Maxed" overlay on cap.
- `addLog(msg)` — push to `state.log` (3 visible) and `state.logHistory`
  (last 100), with a SOL timestamp.
- `openLogHistory()` / `closeLogHistory()` / `refreshLogUI()` — control
  the on-screen log history overlay.

### Tooltip API

- `tooltipEl()` — getter for `#tooltip`.
- `getResourceIconPath(type)` — `assets/images/resources/<type>.png`.
- `resourceIconHtml(type, size, extraStyle)` — returns an `<img>` HTML
  string with size and **inline style**.
- `showTooltip(e, resourceType, options)` — composes a resource tooltip
  (label + sell price + tier color + optional "no fleet can mine" hint).
- `moveTooltip(e)` / `hideTooltip()` — position by cursor with right/bottom
  edge collision avoidance.
- `showHintTooltip(e, text)` — compact-variant tooltip (`.tt-compact` class).

## Dependencies

`data/resources.js`, `data/ships.js`, `constants.js`. Otherwise leaf.

## Notes

- `setStateRef` is a circular-import workaround: `main.js` injects state
  here so `addLog`/`addCoins` can mutate without importing state. Refactor:
  move these mutators into a `Store` API and import it directly — no more
  hidden setter.
- Two `_currencyMaxPopupTimer` and `_lastMaxCoinWarnTs` are file-level
  module globals; they belong on the popup component once we make one.

## Inline CSS

- `resourceIconHtml(...)` builds `style="width:Npx;height:Npx;<extra>"`.
  Move the size to a CSS class (`.resource-icon--14`, etc.) or a CSS
  custom property (`.resource-icon { width: var(--ri-size); }`).
- `renderLogHistoryPanel` builds rows with classes only — good.
- `showTooltip` and friends inject `<span style="color:…">` blocks in their
  template strings. Replace with `.tt-price`, `.tt-tier`, and status pills.

Every `showTooltip` call passes an `e` (MouseEvent) and lays the tooltip
near the cursor with `tt.style.left` / `tt.style.top` — that positioning
**must** stay JS-driven but should set CSS custom properties on the
tooltip root instead of raw `style.left`.

## Modularization candidates

- Split into:
  - `helpers/number.js` — `fmt`, `clampCoins`, `hexToRgb`, `isLightColor`.
  - `store/coins.js` — `addCoins`, `spendCoins`, max-coin popup.
  - `store/log.js` — `addLog`, `state.log`/`logHistory` management.
  - `ui/tooltip.js` — tooltip element + `show/move/hide` + variants.
- The `setStateRef` indirection disappears once `state` is a real module.
