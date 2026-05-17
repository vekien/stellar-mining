# `src/render/canvasState.js`

A 5-field shared bag (`turretHoverCol/Row`, `storageHoverId`, `baseHovered`,
`lastHoveredNode`) used to break the circular import that would happen if
`renderer.js` and `input.js` imported each other.

## Notes

- Exists purely to dodge the circular dep. A proper refactor introduces a
  `HoverState` class injected at boot, or moves hover state into the input
  module which already drives it.
- Today it's mutated from `input.js` and read by `renderer.js`. Module
  global, no events fired on change.

## Inline CSS

None.
