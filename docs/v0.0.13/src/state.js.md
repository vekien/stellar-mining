# `src/state.js`

The single mutable game state object plus `saveGame()` / `loadGame()` on
`localStorage`. Imported as `{ state }` everywhere.

## Shape (top-level keys)

- **Economy**: `coins`, `trips`, `resources` (per-resource counts).
- **World**: `ships[]`, `nodes[]`, `worldSeed`.
- **UI state**: `selectedShip`, `followShip`, `hoveredShip`, `activeTab`,
  `log[]`, `logHistory[]`, `transmissionHistory[]`, `renaming*` flags,
  `pendingAssign`, `basePanelOpen`, `bpTab`, `fleetFilter`, craft timers.
- **Time/progression**: `sol`, `solTimer`, `solStarted`, `rp`, `marketBoost`.
- **Settings**: `showGrid`, `showBackgroundStars`, `showVisualEffects`.
- **Unlocks/defenses**: `researchUnlocks`, `researchUnlocksList`, `turrets[]`,
  `modules[]`, placement flags, `unplaced*Queue[]`, repeatable-research
  counters (`hpBoostCount`, `shieldBoostCount`, etc.), `extraDemands[]`.
- **Events runtime**: `nextEventTimer`, `nextEventSol`, `activeWarning`,
  `baseRangeAnim`, `blackHole`.
- **Base**: `{ name, level, health, maxHealth, shield }`.

Plus `shipIdCounter` (separate `let` with `set/bump` helpers).

## Exports

- `state` — the mutable object.
- `makeEmptyResources()` — fresh per-resource map.
- `saveGame()` / `loadGame()` — round-trip to `localStorage[SAVE_KEY]`.
- `shipIdCounter`, `setShipIdCounter`, `bumpShipIdCounter`.

## Save format

- Serializes a curated allow-list of keys (NOT the full state) and a
  `saveVersion` counter (currently 6).
- Module instances go through `serializeModule` / `deserializeModule` to
  shallow-copy their `inventory` object.
- Ships are projected through a hand-written `s => ({…})` because the
  runtime ship object contains animation fields (`x`, `y`, `destX`, etc.)
  that shouldn't be saved.
- Load is a long list of migrations: `hp_boost → health_increase`,
  `defense → armor_plating`, `storageFacilities → modules`, etc.

## Dependencies

`constants.js`, `data/resources.js`, `data/ships.js`, `data/research.js`,
`data/turrets.js`, `data/modules.js`, `helpers.js`, `render/camera.js`.

The `camera.js` import is only used inside `loadGame()` to recover a ship's
spawn position. That's a layering smell — state shouldn't depend on render.

## Notes

- Defaults for the base in `state` and again in `loadGame` (`maxHealth: 10000`
  in two places). Should derive from a single helper.
- `state.modules` and `state.turrets` are arrays of POJOs; their shape is
  defined implicitly across `applyDefaults`, the load migrations, and the
  save serializer. This is the strongest argument for an Entity/Instance
  class refactor.
- The save key allow-list duplicates the state shape. A `STATE_SCHEMA`
  declaration plus a generic serializer would remove the long literal.

## Inline CSS

None directly; `loadGame` doesn't touch the DOM.

## Modularization candidates

- Split into:
  - `state/store.js` — the object + save/load.
  - `state/migrations.js` — version-keyed migrations.
  - `state/serialize.js` — schema-driven serializer.
- Replace literal POJOs in `state.turrets`/`state.modules` with `Turret` /
  `BuildingModule` instance classes that own their own `serialize()` /
  `applyDefaults()` / `getStats()`.
- Move `_stateRef` indirection (currently in `helpers.js`) into the same
  module so addLog/addCoins don't have a setter hook.
