# Modularization patterns spotted in v0.0.13

Running notes captured while reading every file. Patterns that repeat across
files are candidates for a shared class or system in the upcoming refactor.

This is the raw evidence log; the actual plan lives in
[`_modularization-plan.md`](_modularization-plan.md), which is written after
the survey is complete.

## Pattern: per-entity static data + per-instance runtime state

- **Buildings (modules)**: `MODULE_DEFS[type]` provides `getStats(level)`,
  `applyDefaults(instance)`, `cardStats`, `summary`. Instances live in
  `state.modules[]` as plain objects.
- **Turrets**: `TURRET_TYPE_DEFS[type]` with `getTurretStats(type, level)`.
  Instances in `state.turrets[]` as plain objects.
- **Ships**: `SHIP_DEFS[type]`. Instances in `state.ships[]`.
- **Resources / nodes**: `RESOURCE_DEFS[type]`, `NODE_BANDS`.

Refactor candidate: a generic `Entity` / `EntityType` base where each kind
declares `def`, `getStats`, `applyDefaults`, `cardStats`, `summary`, and an
instance class binds those to a save-friendly POJO state.

## Pattern: open/patch modal pair per entity kind

- `openStorageModal` / `renderModuleModal` / `patchModuleModal` (storageUI.js)
- `openTurretModal` / `renderTurretModal` / `patchTurretModal` (turretUI.js)
- `openHdrPanel` / `patchSolPanel` / `patchTransmissionsPanel` (panels.js)

Each pair sets up a draggable shell, renders an HTML template, then patches
text/bars on a tick. Refactor: a `PanelView` base that owns the shell,
drag/clamp/z-index, and exposes `render()` + `patch()` for subclasses.

## Pattern: craft queue + timer + complete callback

- `state.shipCraftTimers` / `state.turretCraftTimers` /
  `state.buildingCraftTimers` / `state.droneCraftTimers`
- `state.unplacedTurretQueue` / `state.unplacedModuleQueue`
- Each gets its own `startCraft*`, `completeCraft*`, `scheduleCraft*Completion`,
  `syncCraft*Timers`.

Refactor: a single `CraftSystem` that takes a `recipe` and a
`onComplete(payload)` callback, and the craft tab renders from one list.

## Pattern: power/lab BFS network walk

Two parallel BFS implementations in `data/modules.js` — `getPowerNetworkState`
and `getLabNetworkState`. They share the `adjacency` model and `addEdge`
helper. Refactor: a single `Network` builder with pluggable adjacency rules
and per-network reducers.

## (to be expanded)
