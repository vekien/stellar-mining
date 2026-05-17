# `src/render/stars.js`

Background star field rendered to its own canvas (`#stars-canvas`).

## Exports

- `initStars(ctx, w, h)` / `resizeStars(w, h)`.
- `setStarsEnabled(enabled)` — toggled by Settings.
- `buildStarData()` — recreates the static-star bitmap layer and the
  twinkle-star list. Called on resize.
- `drawStars(ts)` — paints the cached background plus per-frame twinkles
  and shooting stars. Throttled to `TWINKLE_INTERVAL_MS`.
- `tickShootingStars(dt)` — spawns/ages shooting stars.

## Implementation

- 160 static stars baked once onto an off-screen canvas (`staticLayer`).
- 40 animated twinkle stars drawn per frame.
- Two radial gradient nebulae composited into the static layer.
- Shooting stars: max ~12 s gap, random angle/speed, fade in/out.

## Inline CSS

None.

## Modularization candidates

- Move the 160/40/12 magic numbers into named constants.
- Promote to a `StarField` class so the static layer + shooting stars
  share one lifecycle (today they share file-level globals).
