# Modularization plan for v0.0.13

Goal: replace the flat-POJO-on-state structure with a small set of
classes/systems that own their behaviour, while keeping the game
playable at every step. This is **not** a from-scratch rewrite — it's a
sequenced incremental refactor that the existing codebase can absorb a
piece at a time.

The plan is grouped by **phases**. Each phase is independently shippable
and leaves the game working. Phases assume the inline-CSS extraction
(`_inline-css-extraction-plan.md`) is happening in parallel: the
modularization phases reference CSS classes that the extraction creates.

---

## Phase 0 — Foundations (no behaviour change)

These are pure restructurings that unblock the later phases.

### 0.1 — `Store` module

- Move `state.js` exports behind a `Store` object that owns the mutable
  state plus `subscribe()`/`emit()` (a tiny pub/sub).
- Replace `helpers.js#setStateRef` with a direct import.
- Replace `refresh.js` (the bag with `ui/header/basePanel` slots) with
  named events: `store.on('ui:dirty', renderUI)`.

### 0.2 — `Scheduler`

- Consolidate the Worker tick, rAF render, rAF patch, and the two
  `setInterval`s into a single `Scheduler` with named tickers
  (`game @60Hz`, `render @60Hz`, `patch @20Hz`, `panel @1.25Hz`,
  `save @0.2Hz`). Each subsystem registers a `tick(dt)` instead of being
  ticked from `main.js`.

### 0.3 — `Bus`

- Game-domain events: `sol:rollover`, `entity:placed`, `craft:complete`,
  `network:link`, etc. Replaces the cross-module `refresh.ui()` /
  `patchSolPanel('sol')` direct calls.

### 0.4 — Asset registry

- A `SpriteRegistry` (`{ get(path): HTMLImageElement }`) replacing the
  ad-hoc `new Image()` loads in `render/storage.js`, `render/turrets.js`,
  `render/renderer.js`, `render/animations.js`. Single place for
  preloading + `complete && naturalWidth > 0` guards.

### 0.5 — File reorganisation

- Move `data/storage.js` aliases into `data/modules.js`.
- Drop the `nodes.js` re-export of `BASE_*` and the `constants.js`
  re-export of `SOL_DURATION`.
- Pull `mulberry32` + `shuffle` from `nodes.js` into `helpers/rng.js`.

---

## Phase 1 — Entity classes

Promote the four kinds of "things you can place" into a uniform
`Entity` family.

### 1.1 — `EntityType` / `EntityInstance` base

```ts
class EntityType {
  static registry: Map<string, EntityType>;
  get id(): string;
  get name(): string;
  get unlockId(): string;
  cardStats(level): [string, string][];
  getStats(level): Record<string, number>;
  applyDefaults(instance, index): void;
  summary(instance): [string, string][];
}

class EntityInstance {
  get type(): EntityType;
  get id(): number;
  get name(): string;
  get level(): number;
  serialize(): object;
  static deserialize(json): EntityInstance;
}
```

`EntityType` registry is populated by each subclass.

### 1.2 — `BuildingType` + `BuildingInstance`

- `StorageFacilityType`, `ResearchLabType`, `DroneLabType`,
  `PowerStationType`, `PowerPoleType`, `LabTowerType` — each extends
  `BuildingType`.
- The `MODULE_DEFS` table becomes the constructor argument for each
  subclass.
- `BuildingInstance` subclasses (or a single class with type-keyed
  behaviour) own `power`, `health`, `inventory`, `droneCount`, etc.
- Power-network knowledge moves onto the building: `getLinkRadius()`,
  `getLinkCells()`. `data/modules.js#modulesOverlapByRange` collapses
  into one Chebyshev check.

### 1.3 — `TurretType` + `TurretInstance`

- `AutomaticTurretType`, `LaserTurretType`, `EMPTurretType`.
- `getStats(level)` lives on the type, not as a static function.
- The `turret.scan` animation state moves off the turret instance and
  into a `TurretScanController` keyed by id.

### 1.4 — `ShipType` + `ShipInstance`

- One subclass per `role` (`MiningShip`, `TransportShip`, `CombatShip`,
  `GarrisonShip`, `UniqueShip`).
- The 1300-line `systems/ships.js#tickShip` becomes
  `ship.tick(dt, world)`. Each role overrides `chooseNextAction()`.
- Depot/pickup resolution becomes a `Destination` strategy held on the
  ship.

### 1.5 — `Node`

- Resource node POJOs become `NodeInstance` (`MineableNode`,
  `LandmarkNode` for crashed ships). Both expose `tooltipView()`.

### Save migration

- Each `EntityInstance.deserialize(json)` knows about the legacy POJO
  shape; the existing `state.js#loadGame` migrations can lift their
  per-type fixups into the corresponding `EntityType`.

---

## Phase 2 — System classes

Replace flat `window.foo` action grab-bags with system classes that
expose proper methods. Each system owns a slice of state and emits
events on the `Bus`.

### 2.1 — `CraftSystem`

- One system replaces `state.shipCraftTimers`,
  `state.turretCraftTimers`, `state.buildingCraftTimers`,
  `state.droneCraftTimers`, plus the four `*CraftTime` constants.
- API: `craft(recipe, opts)` → returns a `CraftJob`. `CraftJob` carries
  `category`, `recipeId`, `startedAt`, `endsAt`, `onComplete`.
- Recipes come from `data/crafts.js` (after Phase 0.5 the lookups are
  O(1)).
- Emits `craft:start`, `craft:tick`, `craft:complete`.
- The header `CRAFT` count + craft-tab cards subscribe to these events.

### 2.2 — `PlacementSystem`

- One queue per `EntityType` (`unplacedQueue` lives on the type, not
  state). API: `enqueue(type)`, `place(type, col, row)`, `move(instanceId,
  col, row)`, `cancel()`.
- Validation (footprint, base, nodes, turrets, modules) moves into a
  single `canPlaceAt(type, col, row, ignoreId)` shared by buildings and
  turrets.
- Emits `placement:queued`, `placement:placed`, `placement:moved`.

### 2.3 — `PowerSystem` / `LabSystem`

- Sharing a base `NetworkBuilder` that takes adjacency rules + per-node
  reducers.
- `PowerSystem` owns the 1-Hz fuel/power tick (currently inlined in
  `main.js#gameLoop`).
- `LabSystem` owns the lab-tower routing currently inlined in
  `data/modules.js`.

### 2.4 — `EventSystem`

- Each random event becomes an `Event` instance (`SolarFlare`, `Comet`,
  `BlackHole`) with `arm(state)`, `apply(state)`, `bannerHtml()`,
  `transmissions()`.
- Scheduler-as-system owns the SOL countdown to the next event.

### 2.5 — `MarketSystem` / `SolSystem` / `ResearchSystem`

- `MarketSystem`: sell prices, the boosted-resource roll, the
  `multi_demand` extra-demands logic.
- `SolSystem`: clock tick, RP grant, fires `sol:rollover`.
- `ResearchSystem`: tree definition + `purchase(id)` apply table.

### 2.6 — `BaseSystem`

- `repair(amount)`, `upgrade()` move off `window`. Emits
  `base:upgraded`. The base panel listens.

### 2.7 — `Fleet` and `TransmissionSystem`

- `Fleet` owns the ship list and the action surface (`recall`, `sell`,
  `salvage`, `assign`, `setDepot`, etc.).
- `TransmissionSystem` wraps the admiral panel + `seenMsgs` + queue.

---

## Phase 3 — View classes

The UI is currently a pile of `render` + `patch` functions. Promote
each panel to a class with a stable identity and a `dispose()`.

### 3.1 — `ModalManager` + `PanelView`

- `ModalManager` owns the multi-modal host (z-index stack, focus),
  replaces the duplicated drag/clamp code across base panel, storage
  modal, turret modal.
- `PanelView` base class: `mount(host)`, `render()`, `patch()`,
  `dispose()`. Subclasses implement `templateHtml()` and `patchSelectors`.

### 3.2 — Per-panel views

One subclass each:
- `BasePanelView`
- `StorageModalView` (multi-window: one per building)
- `TurretModalView`
- `HdrSolView`, `HdrCommandView`, `HdrTransmissionsView`,
  `HdrResourcesView`, `HdrCraftView`, `HdrMarketView`, `HdrFleetView`,
  `HdrResearchView`, `HdrCodexView`, `HdrStatsView`
- `RenameOverlayView`
- `EventBannerView`, `CurrencyMaxPopupView`, `AboutOverlayView`,
  `SettingsOverlayView`, `LogHistoryView`, `SellOverlayView`,
  `NewGameOverlayView`

Each subscribes to bus events instead of being called via `refresh.ui()`.

### 3.3 — Per-component views

Lower-level reusable views (used inside panels):
- `HeaderChip`, `ResourcePill`, `ShipCard`, `ShipActionPanel`,
  `CargoBar`, `HealthBar`, `PowerBar`, `UpgradeRow`, `RequirementPill`,
  `CraftCard`, `TutorialPointer`, `Tooltip` (with variants), `StatusPill`.

### 3.4 — `Renderer` pipeline

- `RenderPipeline` ordered list of `Pass` objects.
- Each render module exposes a `Pass`: `StarsPass`, `GridPass`,
  `RangeBorderPass`, `RangePulsesPass`, `PowerLinksPass`, `LabLinksPass`,
  `NodesPass`, `BuildingsPass`, `BasePass`, `ShipsPass`, `TurretsPass`,
  `PlacementHoverPass`, `AnimationsPass`, `OverlayPass`.
- `CameraController` class replaces the mutable `cam` global + the
  `_onCameraMove` callback.

---

## Phase 4 — Input + dispatch

- `InputDispatcher` listens to canvas + window events; routes hits via
  a `HitTester` (centralised, no more duplicate hit-test math across
  `input.js` and `renderer.js`).
- `Tooltip` is a single component fed by `entity.tooltipView()`. Removes
  the giant if/else chain in `input.js`.
- Every `window.foo = …` global becomes a method on the relevant system,
  bound to a DOM event via delegation. HTML's inline `onclick="foo()"`
  attributes go away — buttons get `data-action="foo"` and a top-level
  delegated listener.

---

## Phase 5 — Save / migration

- `SaveSchema` declares the persisted shape; the round-trip is generic
  (no more hand-rolled `s => ({…})` ship serializer).
- `Migration` registry keyed by `from → to` version. Each instance class
  exposes `migrate(json, fromVersion)`.

---

## Suggested order

1. Phase 0.1–0.4 — Store + Scheduler + Bus + SpriteRegistry (1 PR
   each, no behaviour change).
2. Phase 1.2 — `BuildingType` / `BuildingInstance` (most repetition,
   highest payoff, drone-lab work is fresh).
3. Phase 2.1 — `CraftSystem` (unifies 4 parallel pipelines).
4. Phase 2.2 — `PlacementSystem` (depends on Phase 1.2).
5. Phase 1.3 — `TurretType` / `TurretInstance`.
6. Phase 1.4 — `ShipType` / `ShipInstance` (the big one).
7. Phase 2.x — remaining systems.
8. Phase 3 — view layer.
9. Phase 4 — input + dispatch.
10. Phase 5 — save schema cleanup.

Each PR keeps the game playable.

## Anti-goals

- No TypeScript migration in the same PR as any of these phases. Keep
  them orthogonal — pick whichever lands first.
- No new game features inside a refactor PR. Refactor PRs land mass +
  CSS-only PRs only.
- No "while we're here" wholesale renames. Pick one rename at a time;
  the diff stays reviewable.
