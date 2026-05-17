# `index.html`

The single HTML page. 264 lines, ~32 inline `style="..."` attributes that
need to be moved to CSS.

## Structure

- `<head>` — Google Fonts (Orbitron, Share Tech Mono, Cinzel) +
  `styles/main.css`.
- `#top-bars` — SOL clock, header chips for each header modal, dev panel
  hamburger, About/Settings/New Game buttons, `#resource-bar`.
- `#game-area` —
  - `#canvas-wrap` with `#stars-canvas` and `#main-canvas`, the zoom
    widget, the ship upgrade drawer, the turret modal, the storage modal
    host (multi-window), the base panel overlay, the admiral panel.
  - `#sidebar` — log + ships list tabs, action panel.
- Modal overlays at root: `#about-overlay`, `#settings-overlay`,
  `#log-history-overlay`, `#modal-overlay` (new game confirm),
  `#sell-overlay`, `#rename-overlay`, `#currency-max-popup-overlay`,
  `#event-warning`, `#tutorial-banner`, `#tooltip`.

## Inline styles

Every `#…-overlay` that the game shows/hides has inline
`display/position/top/left/right/bottom/background/z-index/...` set.
The reason: each overlay needs JS to set `display:none` on close. These
should be class-driven.

The turret modal markup is inlined here for legacy reasons; ideally it
moves into a JS-rendered template like the storage modal.

`<script type="module" src="src/main.js"></script>` at the end.

## Modularization candidates

- Strip every inline `style` and replace with class-based selectors in
  CSS.
- Consider rendering all overlays from JS so HTML becomes a pure
  skeleton.

## Inline CSS (full list)

See `_inline-css-audit.md` for the per-line catalogue.
