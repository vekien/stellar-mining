# `src/render/camera.js`

Camera state and coordinate transforms. Tiny module — the camera is a single
mutable object (`cam`) with `x/y/zoom/targetX/targetY`.

## Exports

- `cam` — the live camera object.
- `gridToWorld(col, row)` / `gridToIso` (alias) — grid → screen-space iso.
- `screenToWorld(sx, sy, W, H)` — inverse of the above.
- `BASE_POS()` — world pos of the base.
- `nodeWorldPos(node)` — world pos for a resource node (with the standard
  +TILE_H/2 offset).
- `focusOn(wx, wy, zoom)` — set target; renderer lerps toward it.
- `snapTo(wx, wy, zoom)` — set live + target.
- `tickCamera()` — `LERP=0.4` ease; returns `true` while still moving.
- `focusOnBase(zoom, { snap })` — convenience.
- `adjustZoom(d)`, `resetView()` — wired to `window` for HTML onclick.
- `ZOOM_MIN_V`, `ZOOM_MAX_V` — local copies of the constants from
  `constants.js`. **Duplication smell** — should re-export the same const.

## Inline CSS

None.

## Modularization candidates

- Drop `ZOOM_MIN_V/_MAX_V` and import from `constants.js`.
- Promote `cam` to a `Camera` class with `update(dt)` and event dispatch
  on movement, replacing the `setOnCameraMove` callback in
  `render/renderer.js`.
- The `window.adjustZoom` / `window.resetView` globals exist because HTML
  buttons call them. Replace with event delegation from `input.js`.
