# `src/render/animations.js`

Five separate animation systems sharing one 2D context (`_ctx` set by
`renderer.js`). Each has its own queue, `tick(dt)`, and `draw()`.

## Animation systems

### Solar flare

- `spawnSolarFlare()` — pushes 4 staggered (400 ms apart) flare rings.
- `tickSolarFlare(dt)`, `drawSolarFlare()`. Radial gradient rings centered
  on the base, fading 0.5 → 0 over 4 s each. Skipped when
  `showVisualEffects` is off.

### Comet

- `spawnComet()`, `tickComet(dt)`, `drawComet()`. Phase 1: comet flies
  base-ward over 3 s on an ease-in/out curve, glowing tail. Phase 2:
  three expanding shockwave rings + 8 ember particles over 2.5 s.
- Triggers `startScreenShake(0.4)` on impact.

### Black hole

- `tickBlackHole(dt)`, `getBlackHoleRadiusScale(blackHole)` —
  ease in/out scale curve over `BLACK_HOLE_FADE_TIME_S` at start/end.
- `drawBlackHole()` — radial gradient + swirling arcs + dark core. Reads
  `state.blackHole.{wx,wy,radiusWorld,age,duration,rangeTiles}`.
- Note: unlike the others, the runtime state lives on `state.blackHole`,
  not as a module-local queue. Means a save can restore an active black
  hole.

### Range pulses (base upgrade)

- `spawnRangePulse(newHalfR)` — diamond ring around the base for 1.4 s.

### Node-unlock particles

- `spawnNodeUnlock(node)` — 28-particle burst in resource color.

### Floaties (cargo deposit feedback)

- `spawnFloatie(type, amount, worldPos?)`, `tickFloaties(dt)`,
  `drawFloaties()`.
- Each carries `{ wx, wy, color, resourceType, label, age, duration }`.
- Lazy `resourceFloatieIcons` Map caches `Image` per type.

## Setter

- `setAnimCtx(ctx)` — receives the renderer's 2D context.

## Notes

- Each animation queue is a module-level array. Sharing one base
  `Animation` class with `age/duration/draw()` would simplify.
- `state.settings?.showVisualEffects === false` is checked in every
  `draw*` function — one place to read it would be cleaner.
- Floatie icons leak `Image` instances (the `Map` lives forever) — fine
  in practice, but easy to convert to a singleton image registry.

## Inline CSS

None (canvas).

## Modularization candidates

- `Animation` base + per-effect subclasses (`SolarFlareAnim`, `CometAnim`,
  `BlackHoleAnim`, `RangePulseAnim`, `NodeUnlockAnim`, `FloatieAnim`).
- `AnimationSystem` owns the master queue; renderer calls
  `system.tick(dt)` + `system.draw(ctx)`.
- `getBlackHoleRadiusScale` belongs on the black-hole animation, not
  exported as a function.
