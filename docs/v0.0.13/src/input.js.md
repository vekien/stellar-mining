# `src/input.js`

All canvas pointer/keyboard input. Initialised once by `main.js` via
`initInput(canvas)`. Owns the pan/zoom math, hover detection, tooltip
content composition, ship-to-node assignment, and module/turret placement.

## Exports

- `initInput(canvas)` — wires up mousedown / mousemove / mouseup / touch* /
  wheel / keydown / mouseleave listeners.

## Big responsibilities (single function each)

- **Pan/drag**: closure-scoped `isPanning`, `panStartX/Y`, `panCamX/Y`,
  `mouseDownX/Y`, `didPan`. Distinguishes click from drag with a 4px
  threshold.
- **Touch**: pan with one finger, pinch-zoom with two. Tracks
  `lastTouchDist`.
- **Wheel zoom**: anchors zoom around the cursor by converting screen→world
  before and after the zoom step.
- **Hover**: a single `mousemove` handler that hit-tests, in order:
  1. Black hole disc
  2. Resource nodes
  3. Placement preview (turret or module)
  4. Modules (`getModuleAtWorld` then by cell)
  5. Turrets
  6. Base footprint
  Each branch composes a different tooltip HTML payload.
- **Click** (`handleCanvasClick`): same priority but acts (open modal,
  assign ship, place turret/module, etc.).
- **Escape**: cancels active rename → sell overlay → header modal →
  placement → base panel → ship selection, in that order.

## Dependencies

Pulls from almost every other module. Notably:

- `render/camera.js` — `cam`, `gridToWorld`, `screenToWorld`, `focusOn(Base)`,
  `adjustZoom`
- `render/canvasState.js` — hover bookkeeping shared with the renderer
- `render/animations.js` — `getBlackHoleRadiusScale`
- `ui/storageUI.js`, `ui/turretUI.js`, `ui/basePanel.js`, `ui/rename.js`,
  `ui/tutorial.js`, `ui/refresh.js`
- `systems/ships.js` — `assignShip`
- Many `data/*.js` for tooltip content composition

This file has the widest fan-in/fan-out in the codebase — it's the
junction between input, world, and UI. A good refactor target.

## Inline CSS

Heavy. The tooltip is built by concatenating `<div>`s with inline `style="…"`
attributes — see the `<div class="tt-name">` blocks that hard-code colors
(`color:#cde`, `color:#ffe066`, `color:#6fff9a`, etc.). All of this can move
into a small set of tooltip variant classes (`.tt-row`, `.tt-key`, `.tt-val
--good/--warn/--bad`).

Also: `<span style="color:..."></span>` is repeated >20× for status labels.
Replace with `.status-pill.status-pill--ok` / `.status-pill--warn` /
`.status-pill--bad`.

## Modularization candidates

This file is doing four jobs:

1. Pan / zoom math — belongs in `render/camera.js` as input handlers, or in a
   `CameraController` class.
2. Hit-testing — duplicates math also in `input.js`'s click handler and in
   the renderer for sprite picking. Centralise into `world/hitTest.js`.
3. Tooltip composition — should live with the renderer that owns the
   tooltip element, not in input. Each entity kind can supply a
   `tooltipView(entity)` method.
4. Action dispatch — opening modals, assigning ships, placing entities. This
   is fine as a top-level coordinator but should be the only thing left
   here after the above moves.

After refactor: `InputDispatcher` that listens to events and forwards to a
`HitTester` plus an `ActionDispatcher`.
