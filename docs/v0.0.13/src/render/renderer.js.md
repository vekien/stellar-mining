# `src/render/renderer.js`

The master render pass. Owns `ctx`, `W/H`, the grid cache, and the
top-level `render(ts)` rAF loop. Imports every other render module and
calls them in z-order.

## Exports

- `initRenderer(ctx, w, h)`, `resizeRenderer(w, h)`.
- `setOnCameraMove(fn)` — callback fired whenever the camera moves
  (used by tutorial pointer positioning).
- `drawTile(targetCtx, col, row, fill, stroke)` — shared diamond helper.
- `drawGrid(targetCtx)` — multiple ring fills for each base tier.
- `drawRangeBorder()` — current tier ring with periodic pulse, plus
  faint inner tier rings + "TIER N" labels.
- `drawBase(col, row)` — base sprite + glow + status (offline/online).
- `drawNode(node)` — resource shard or crashed-ship sprite, with locked
  tier dimming and the assignment highlight when `pendingAssign` is set.
- `drawShipWorld(ship)` — trail + body + selected/hover ring + mining
  beam.
- `render(ts)` — the master rAF.
- `W`, `H` — exported render-area size.

## render() ordering

1. FPS averaging.
2. Camera follow + `tickCamera()`, dispatch `_onCameraMove`.
3. Background stars (`drawStars`).
4. Clear canvas, apply screen shake offset.
5. If `showGrid`, draw cached grid layer.
6. Save / translate / scale by zoom; then in world space:
   - `drawRangeBorder` (if grid)
   - `drawRangePulses`, `drawPowerLinks`, `drawLabLinks`
   - Sorted resource nodes
   - `drawStorageFacilities`, `drawBase`, `drawSelectedShipLine`,
     `drawTurrets`
   - Y-sorted ships
   - Placement previews
   - Animations (solar flare → black hole → comet → floaties → node
     particles)
   - Base hover label
7. Update DOM: `#zoom-pct`, `#fps-readout`, `#hdr-sol`.
8. `requestAnimationFrame(render)` self-recurse.

## Grid caching

`ensureGridCache(shiftX, shiftY)` — recomputes only when (size, base
level, showGrid, cam x/y/zoom, shake, animation phase) signature changes.
Saves redrawing the multi-ring background every frame.

## Inline CSS

None directly. All DOM updates are textContent.

## Notes

- `BASE_RANGE[i] || 6` fallback is a magic number; should be a clamped
  index.
- Three "draw range diamond" helpers exist in this file + `render/storage.js`
  + `render/turrets.js`. Consolidate.
- `drawNode` knows about crashed ships via `isSpecialNode`. A type-keyed
  renderer table would be cleaner.
- The smoke puff system on crashed ships is inlined — should be its own
  animation system.

## Modularization candidates

- `RenderPipeline` with a sorted list of `Pass` objects; each render
  module exposes a `Pass` instance.
- `BaseRenderer`, `NodeRenderer`, `ShipRenderer`, `BuildingRenderer`,
  `TurretRenderer` — each owns its own draw + hit-test.
- Move the SOL clock + FPS + zoom text updates out of the render loop
  (they belong with `ui/`).
