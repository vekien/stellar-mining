# `src/data/turrets.js`

Turret tuning constants, type definitions, and stat-at-rank helpers.

## Exports

### Build/upgrade constants

- `TURRET_BASE_STATS` — `{ health: 5000, damage: 100, range: 2 }` legacy
  base used only by callers without a type-specific def.
- `TURRET_UPGRADE_DELTA` — legacy linear deltas. Still imported elsewhere
  (e.g. `state.js`'s load migration).
- `TURRET_MAX_RANGE = 5`.
- `TURRET_MAX_LEVEL = 10` — recent change (was 100). All call sites need
  audit.
- `TURRET_SCRAP_BASE_COINS`, `TURRET_SCRAP_COINS_PER_LEVEL`,
  `TURRET_SCRAP_IRON`, `TURRET_SCRAP_COPPER`.
- `TURRET_UPGRADE_COST_PER_LEVEL`, `TURRET_BUILD_COST` — duplicated with
  `crafts.js` entries; this file claims to be SoT but `crafts.js` also has
  values. Reconcile.

### Type defs

`TURRET_TYPE_DEFS` — `turret`, `laser_turret`, `emp_turret`. Each has:

- Identity: `name`, `shape`.
- Power: `basePowerUsage`, `maxPowerUsage`, `basePowerCapacity`,
  `maxPowerCapacity`. EMP also has `basePowerDrive` / `maxPowerDrive`.
- Combat curve: `baseHealth`, `maxHealthAtRank10`, `baseDamage`,
  `damagePerLevel`, `baseFireRate`, `minFireRate`, `fireRateCapLevel`,
  `baseStunDuration`, `maxStunDuration`, `stunCapLevel`, `baseRange`,
  `rangeUpgrade`, `rangeMax`.
- Render fills/strokes: `platformFill`, `platformStroke`, `bodyFill`,
  `bodyStroke`, `detailFill`, `detailStroke`, `barrelFill`, `barrelStroke`.

### Helpers

- `getTurretTypeDef(type)` — fallback to `turret` if unknown.
- `scaleToward(level, start, end, capLevel = 10)` — linear lerp from rank 1
  to `capLevel`. Used everywhere a stat scales.
- `getTurretStats(type, level)` — returns `{ maxHealth, damage, range,
  fireRate, stunDuration, powerDrive }`.
- `getTurretPowerUsage(turretOrType, level?)` — duck-typed input.
- `getTurretPowerCapacity(turretOrLevel)` — duck-typed input; assumes the
  default type when given a bare number.

## Notes

- The Renderer-specific fills belong in `render/turrets.js`. They're inline
  here to keep the type-def "complete" for one file lookup.
- `getTurretStats` falls back to legacy `healthPerLevel` if
  `maxHealthAtRank10` isn't set — vestigial. After confirming no callers
  rely on it, drop the linear path.
- `TURRET_UPGRADE_COST_PER_LEVEL` and the matching `crafts.js` entry are
  drift-prone; pick one SoT.
- `getTurretPowerCapacity(turretOrLevel)` quietly assumes type=`turret`
  when given a number — surprising. Either require type or remove the
  number-input case.

## Inline CSS

None (canvas fills/strokes only).

## Modularization candidates

- Move render fills to a per-type render config under `render/turrets/`.
- Replace `getTurretStats(type, level)` with a `Turret` instance method
  that knows its own type/level.
- Unify with `MODULE_DEFS` via a shared `EntityType` interface so a
  `Defense Tower` (in the future) plugs into the same craft/upgrade UI.
