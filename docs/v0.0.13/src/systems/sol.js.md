# `src/systems/sol.js`

The day-cycle clock + market roll + event scheduling.

## What it does

- `scheduleNextEvent()` — picks a SOL 2–5 in the future.
- `getAvailableMarketResourceTypes()` — filters by what's currently in
  base range (or all types if none).
- `rollMarketDemands()` — picks 1 or up to 3 (`multi_demand`) resource
  types and assigns multipliers.
- `tickSOL(dt)` — advances `solTimer`; when it crosses `SOL_DURATION`,
  rolls over, grants +1 RP, re-rolls demands, fires the scheduled event,
  emits Rigs idle/holding nag transmissions, and saves.

## Notes

- Calls `patchSolPanel('sol')` from inside the tick; couples to UI
  module. After refactor, the SOL system should emit a domain event and
  the panel subscribes.
- "Rigs nags" repeat every SOL — fine, but a single-flight throttle would
  feel less spammy.

## Inline CSS

None.

## Modularization candidates

- `SolSystem` with `tick(dt)`, emits `sol:rollover`, `sol:eventDue`.
- Move `rollMarketDemands` into `Market` system.
