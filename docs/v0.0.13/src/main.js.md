# `src/main.js`

Boot, game loop, and the top-level wiring between every subsystem. The only
file that imports almost every other module.

## Boot sequence

1. Grab the two canvases (`main-canvas`, `stars-canvas`) and their 2D ctxs.
2. `resize()` once, then bind to `window resize`.
3. `setStateRef(state)` so `helpers.js` can mutate state.
4. Init subsystems in order: renderer → stars → refresh (UI registry) →
   input → dev panel.
5. Load save (`loadGame()`); apply settings; generate (or restore) nodes.
6. If no save, spawn a starter Scout.
7. Schedule first random event if none queued.
8. Show "About" overlay on first run; ensure a market boost exists; coerce
   any missing `ship.mineTier`.
9. Camera snaps to base at zoom 2.0; UI header updated; transmission for
   any crashed-ship node fires after 1.4 s.
10. Re-dispatch saved ships back toward their target node, staggered by
    50–100 ms each.
11. Tutorial banner shown if no ship is currently mining.
12. Sidebar hover tracking + onclick → cancel ship selection.

## Globals exposed for inline HTML

`openHdrPanel`, `closeHdrPanel`, `dismissHdrModal`,
`handleBasePanelOverlayClick`, `promptNewGame`, `closeModal`,
`confirmNewGame`, `openAbout`, `closeAbout`, `openLogHistory`,
`closeLogHistory`, `openSettings`, `closeSettings`, `toggleShowGrid`,
`toggleBackgroundStars`, `toggleVisualEffects`, `switchTab`.

## Game loop

Driven by a `Worker` that posts `1` every ~16.6 ms. Each tick:

- `tickFloaties / tickSolarFlare / tickBlackHole / tickComet /
  tickScreenShake / tickShootingStars / tickRangePulses / tickNodeParticles`
- `tickSOL(dt)` — advances day cycle.
- `tickAdmiral(dt)` — drives the queued transmission UI.
- Base destruction notice once.
- **Shield regen** at `SHIELD_REGEN_INTERVAL_S` cadence.
- **Auto-regen HP** every 1 s.
- **Power tick** every 1 s — consumes fuel from each power station,
  charges/discharges each powered building and turret. Triggers Doran's
  "no power" transmission when something just dropped offline; triggers
  Vane's "lab network online" the first time a lab tower links a node.
  Repatches the open storage/turret modal.
- Node fade-ins for newly visible nodes.
- `tickShip(s, dt)` for every ship; updates `highestAvailableNodeTier`.
- `flushTickEvents(canvas)` to drain ship deposit floaties.

## rAF patch loop (`patchShipCards`)

20 fps patch path. Diffs a per-ship signature; only writes to the DOM if
something changed. Patches cargo bars, status badges, action panel for the
selected ship.

## Intervals

- `setInterval(refreshHdrPanelIfOpen + patchStatsPanel, 800)`
- `setInterval(saveGame, 5000)`

## Inline CSS

Several `style="color:..."` html fragments inside `patchShipActionPanel`
(`"At Base"` row). Also sets `routeErrorEl.style.display = 'block' | 'none'`
and `holdingReasonEl.style.display = …` and `statusEl.style.color = …`.
All should move to class toggles / CSS custom properties.

## Notes

- The Worker-driven ticker exists to avoid the throttled `setTimeout`
  cadence in inactive tabs. Standard pattern.
- The mix of `setInterval` + `requestAnimationFrame` + Worker is hard to
  reason about. After modularization this should be one `Scheduler` that
  owns named tickers (`game`, `patch`, `panel`, `save`).
- `main.js` knows about half the subsystems by name. After refactor, each
  subsystem should `register(scheduler)` rather than be ticked from here.

## Modularization candidates

- Promote each subsystem to a class with `init()`, `tick(dt)`, `dispose()`.
- Replace the giant ordered tick list with a registry.
- Move the boot sequence into `boot.js` and keep `main.js` a 5-line entry.
