# `src/render/storage.js`

Canvas drawing for every placeable building (storage, research lab, drone
lab, power station, power pole, lab tower) and their placement preview.

## Exports

- `setStorageCtx(c)`.
- `drawPowerLinks()` — animated yellow edges + red-pulse for no-fuel
  components.
- `drawLabLinks()` — green edges + node tower-to-node links.
- `drawStorageFacilities()` — iterates `state.modules`; routes each to
  `drawStorageModule` (powered buildings), `drawPowerStationModule`
  (large) or `drawSingleTileModule` (poles/towers).
- `drawStoragePlacementHover()` — ghost diamond + footprint cells.
- `getStorageHoverAtCell(col, row)`.

## Internals

- Sprite registry: lazy `Image` per asset, drawn via `drawModuleSprite`.
- `getModuleSprite(module, hovered)` — dispatch table per
  `module.type` returning `{ image, width, height, offsetY, shadow }`.
- `drawDiamond`, `traceDiamondForRange` — generic helpers shared with
  placement and range visualisations.
- `drawModuleSprite` handles disabled-flash (grayscale + brightness +
  no-power overlay sprite) for offline buildings.

## Inline CSS

None (canvas).

## Notes

- The "fallback canvas-only" branches of `drawStorageModule`,
  `drawPowerStationModule`, `drawSingleTileModule` exist for the case
  where the sprite image hasn't loaded. They duplicate a lot of geometry
  and color palette decisions. Once sprites are guaranteed, drop them.
- Sprite definitions are inline in `getModuleSprite`. Move to a per-type
  config table next to MODULE_DEFS.
- The "show range" branch in `drawStorageFacilities` checks for pole/tower
  hover/selection — duplication with `drawTurrets` hover code.

## Modularization candidates

- One `BuildingRenderer` base class with `drawSprite`, `drawRangeOverlay`,
  `drawDisabledFlash`. Subclasses for each type.
- Move power/lab link drawing into separate `NetworkRenderer` (power +
  lab) so the BFS results from `data/modules.js` go through a single
  layer.
- Sprite registry into `assets/sprites.js` shared with `render/turrets.js`.
