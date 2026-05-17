# `src/data/ships.js`

Ship type definitions, upgrade curves, formatting helpers, and the
Roman-numeral / tier-color tables.

## Exports

### Constants

- `DEFAULT_CRAFT_TIME_MS = 10000`.
- `FLY_SPEED_SCALE = 100` — multiplier between the old "small-number" speed
  and current `0..1000` scale; used by the save migrations below.
- `CARGO_TIER_EXPONENT = 1.5` — currently unused by anything else here.
- `FLY_SPEED_UPGRADE_STEP`, `MINE_SPEED_UPGRADE_STEP` — kept only for save
  migration.

### Formatters

- `flySpeedToMultiplier`, `formatFlySpeed`, `formatMineSpeedPercent`,
  `formatLoadSpeed`, `formatAtkRatePercent`.

### Save migrations

- `normalizeFlySpeed(speed, saveVersion)` — handles legacy 0..1 speeds and
  modern 0..1000 speeds.
- `normalizeMineSpeed(speed, saveVersion)` — doubles for save v<3.
- `roundUpTo2(n)`.

### Stat profiles

Per-ship-type curves with `{ min, max, p }`:
- `CARGO_PROFILE` (6 mining/transport types)
- `FLY_SPEED_PROFILE` (mining + transport + combat)
- `MINE_SPEED_PROFILE` (mining only)
- `LOAD_SPEED_PROFILE` (transport only)
- `HP_PROFILE`, `ATTACK_PROFILE`, `ATK_RATE_PROFILE` (combat only)

Each is consumed by `profileStat(profile, type, level)` plus the typed
helpers `capacityFromTierAndLevel`, `flySpeedFromLevel`,
`mineSpeedFromLevel`, `loadSpeedFromLevel`, `hpFromLevel`,
`attackFromLevel`, `atkRateFromLevel`.

`profileMax(profile, type)` returns the curve's `max` value for the codex.

### Salvage rewards

- `getShipSalvageRewards(ship)` — returns 2 tier-appropriate resource
  rewards with amounts scaling by tier (`tier * 20`, min 10).

### Render templates

- 6 `RENDER_*` style objects (`SCOUT`, `SWIFT`, `HAULER`, `FREIGHTER`,
  `COURIER`, `TITAN`) describing sprite size/color/trail params used by
  the ship renderer. These are render-specific data living inside the
  data module — would belong in `render/ships.js` after modularization.

### Ship definitions

`SHIP_DEFS` — `{ [type]: { role, capacity, flySpeed, mineSpeed, mineTier,
render, hp?, attack?, attackSpeed?, range?, loadSpeed?, unique? } }`.

Roles: `mining`, `transport`, `combat`, `garrison`, `unique`.

### Upgrade economy

- `SHIP_TIER_COSTS` (T2..T10, ~2.5× each step).
- `TIER_UPGRADE_CAP` (10..100).
- `ROMAN[]`, `toRoman(n)`.
- `TIER_COLORS`.
- `UPGRADE_CAP_COST`, `UPGRADE_FLY_COST`, `UPGRADE_MINE_COST`,
  `UPGRADE_LOAD_COST`, `UPGRADE_HP_COST`, `UPGRADE_ATTACK_COST`,
  `UPGRADE_ATK_RATE_COST` — `40 × 1.1^level` style functions.
- `upgradeChunk(level)` — buy-in-bulk size (1/2/5/10).
- `upgradeTotalCost(costFn, ship, stat, chunk)` — sum cost over a chunk.
- `SHIP_CRAFT_TIME_MS` — per-type craft duration override map.

## Notes

- `RENDER_*` blocks belong with `render/ships.js`. Right now ship rendering
  reads them directly from data — that's fine for plain data, but the
  shape says "renderer config", not "game data".
- The `SHIP_DEFS.<type>.render = RENDER_FOO` pattern duplicates: e.g.
  Viper/Interceptor share `RENDER_SCOUT`. Worth a fewer-named-templates
  refactor.
- `CARGO_TIER_EXPONENT` is exported but unused — remove.
- `RESOURCE_DEFS` import is only used inside `getShipSalvageRewards` — the
  rest of the file is pure data.

## Inline CSS

None directly. The render templates contain CSS-like color strings but
those drive canvas drawing.

## Modularization candidates

- Split into:
  - `ships/types.js` — `SHIP_DEFS` data.
  - `ships/curves.js` — stat profiles + `profileStat` + per-stat helpers.
  - `ships/economy.js` — upgrade costs / chunks / craft times.
  - `ships/format.js` — formatters.
  - `render/ships/templates.js` — `RENDER_*`.
- Ultimately a `Ship` class with `getStat(name)` reading the curve at the
  current level; instances live in `state.ships[]` as POJOs but the class
  wraps them.
