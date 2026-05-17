# `src/render/turrets.js`

Canvas drawing for placed turrets and their placement preview.

## Exports

- `setTurretCtx(c)` — receives the 2D context from `renderer.js`.
- `drawTurrets()` — iterates `state.turrets`, draws platform → cylinder
  body → barrel (per `typeDef.shape`: `dual_barrel`, `single_rifle`, or
  `triangle_orbit`). Animates a periodic directional scan stored on
  `turret.scan` (lazy-initialised). Draws health bar and a no-power
  overlay when offline. Shows the range diamond on hover.
- `drawTurretPlacementHover()` — ghost preview at the current
  `canvasState.turretHoverCol/Row`, validity colored (green vs red).

## Notes

- `turret.scan` is computed render-side and **lazily added to the turret
  object** — render code mutates game state. Move to a separate
  `scanState` map keyed by id, or to a presenter object that wraps the
  turret.
- Each `shape` branch is a switch statement; type-specific draw code
  would live better next to the type def in a render module per type.
- Uses `noPowerImage` loaded inline — same as `render/storage.js`. Should
  share an image registry.
- `rgbFromHex` helper duplicates `helpers.js#hexToRgb`. Consolidate.

## Inline CSS

None (canvas).

## Modularization candidates

- Promote each turret shape (`dual_barrel`, `single_rifle`,
  `triangle_orbit`) to a `TurretRenderer` subclass keyed off
  `typeDef.shape`. Each owns its `drawBody`, `drawBarrel`, and `ghost()`.
- Move the scan animation into a `TurretScanController` so it's separable
  from the static drawing.
- Centralise the no-power overlay sprite into a `decals.js`.
