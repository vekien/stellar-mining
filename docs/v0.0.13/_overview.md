# v0.0.13 architecture overview

A snapshot of how the codebase fits together at the start of v0.0.13,
before any class-based refactor.

## Top-level shape

```
index.html            <- single HTML skeleton
styles/main.css       <- one stylesheet (~2.5k lines)
src/
  main.js             <- boot + game loop + rAF/Worker tickers + globals
  state.js            <- the single mutable state object + save/load
  helpers.js          <- formatting, coin/log mutators, tooltip API
  constants.js        <- grid, save key, zoom bounds
  input.js            <- canvas pointer/keyboard, hit-testing, tooltip
                         composition, action dispatch
  data/               <- pure data: resources, nodes, ships, turrets,
                         modules, crafts, research, npcs, sol, events
  render/             <- canvas drawing: renderer (master), camera, stars,
                         animations, turrets, storage (buildings)
  systems/            <- mutating game logic: ships, events, sol, market,
                         research, base
  ui/                 <- DOM rendering: orchestrator (ui.js), refresh hub,
                         fleet, panels (header), basePanel, storageUI,
                         turretUI, transmissions, rename, tutorial,
                         devPanel
```

## Data flow

1. **Input** (mouse / keyboard / HTML onclick) lands in `input.js` or a
   `window.*` action exported by a system / UI module.
2. **Action** mutates `state` directly (no events, no reducer).
3. **Render**: a 60 fps rAF (`render(ts)` in `renderer.js`) reads
   `state` and draws to canvas. A separate Worker-driven `gameLoop()`
   in `main.js` ticks at ~60 Hz to update animations, run ship state
   machines, fire SOL/events, and tick the power network.
4. **UI patch**: a 20 fps rAF (`patchShipCards` in `main.js`) diffs
   per-ship signatures and updates the sidebar without rebuilding HTML.
   A `setInterval(800ms)` refreshes the open header panel.
5. **Save**: `setInterval(saveGame, 5000)` writes a curated subset to
   `localStorage`.

## State ownership

Everything is on `state` (a single object) plus a few `Image`/cache
maps held in module-level globals (sprites, animation queues, stars).
Subsystems do not have their own state slices — they read/write
`state.*` directly.

## Action dispatch surface (`window.*`)

A large amount of behaviour is exposed as `window.foo = …` so that HTML
onclick handlers (and dynamically rendered button HTML) can call them.
Examples: `repairBase`, `upgradeBase`, `sellResource`, `recallShip`,
`sellShip`, `purchaseResearch`, `openHdrPanel`, `openStorageModal`,
`startCraftBuilding`, `startCraftTurret`, `startCraftDrone`,
`buyStoragePower`, `setPowerStationFuel`, `commitRename`,
`promptNewGame`, `closeModal`, `confirmNewGame`, `openAbout`, etc.

This is the strongest signal that the action layer wants to be a
proper class with bound methods.

## Repeating patterns (drive the modularization plan)

1. **EntityType + instance POJO**: Building modules, turrets, ships,
   nodes, and resources each have a per-type definition table
   (`MODULE_DEFS`, `TURRET_TYPE_DEFS`, `SHIP_DEFS`, `NODE_BANDS`,
   `RESOURCE_DEFS`) and per-instance POJOs stored on `state` arrays. The
   instance shape is implicit, defined across `applyDefaults`, save
   serializers, and consuming code. Becomes: `EntityType` data + `Entity`
   class wrappers.

2. **Open/render/patch modal pair**: Storage, turret, base panel, hdr
   panels. Each has a draggable shell with clamp/z-index, plus a render
   that builds HTML and a patch that updates text/bars on a tick.
   Becomes: `PanelView` base with drag/clamp/z-index, subclasses per
   panel.

3. **Craft pipeline** (ship / turret / building / drone): each declares
   its own `state.*CraftTimers`, `state.unplaced*Queue`, plus
   `startCraft*`, `completeCraft*`, `scheduleCraft*Completion`,
   `syncCraft*Timers`. Becomes: one `CraftSystem` consuming `Recipe`
   declarations.

4. **Power/lab network BFS**: two parallel BFS solvers in
   `data/modules.js` (`getPowerNetworkState`, `getLabNetworkState`)
   sharing adjacency, edge dedupe, and per-network reducer scaffolding.
   Becomes: a shared `Network` builder + per-network rules.

5. **Tooltip composition**: every hover branch in `input.js` and several
   ship/module tooltips build HTML strings with inline `style="color:..."`.
   Becomes: a `Tooltip` component with named variants and CSS-classed
   templates.

6. **Inline CSS everywhere**: 427 hits across 15 source files + 32 in
   HTML. Documented per-file in the audit; all of it moves to CSS classes
   or custom properties.

## Save format

Versioned via `SAVE_VERSION = 6`. `loadGame` migrates from older save
shapes (`hp_boost → health_increase`, `storageFacilities → modules`,
`moduleCraftTimers → buildingCraftTimers`, etc.).

## Where bugs hide today

- Cross-cutting state mutated from many files — race-condition risk
  when multiple actions run in the same tick.
- Several `setTimeout` chains for transmissions / craft completions —
  if a save/load happens in flight, in-flight timers are lost.
- Duplicate cost tables (`crafts.js` vs `turrets.js`) drift over time.
- Render code lazily mutates game state (e.g. `turret.scan`).
