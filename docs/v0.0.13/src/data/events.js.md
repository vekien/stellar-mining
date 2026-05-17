# `src/data/events.js`

Tuning constants for the three random events.

## Exports

### Solar flare

- `SOLAR_FLARE_MIN_TYPES` / `_MAX_TYPES` — number of resource types affected.
- `SOLAR_FLARE_LOSS_MIN` / `_MAX` — fraction lost per affected resource.
- `SOLAR_FLARE_WARNING_DURATION_MS` — banner time.
- `SOLAR_FLARE_TRANSMISSION_DELAY_MS` — Vane's follow-up delay.
- `SOLAR_FLARE_TRIGGER_DELAY_MS` — banner → effect delay.

### Comet

- `COMET_BASE_DMG_MIN` / `_MAX` — base damage at SOL 0.
- `COMET_SCALE_DMG_MIN` / `_MAX` — added at SOL ≥ 10.
- `COMET_WARNING_DURATION_MS`, `COMET_TRANSMISSION_DELAY_MS`,
  `COMET_TRIGGER_DELAY_MS`.

### Black hole

- `BLACK_HOLE_DURATION_S`, `BLACK_HOLE_FADE_TIME_S`.
- `BLACK_HOLE_RANGE_MIN`, `BLACK_HOLE_RANGE_MAX`.
- `BLACK_HOLE_WARNING_DURATION_MS`, `BLACK_HOLE_TRIGGER_DELAY_MS`.

### General scheduling

- `EVENT_SCHEDULE_MIN_SOLS` / `_MAX_SOLS` — 2–5 SOL gap between events.

## Notes

- Pattern: each event has a banner duration, a transmission delay, and a
  trigger delay (warning → effect). Worth wrapping in an `EventDef` record
  so adding a new event is one declaration.

## Inline CSS

None.

## Modularization candidates

Promote each event group to an `EventDef` object with `id`, `tuning`,
`scheduler`, `trigger(state)`. Together with `systems/events.js` this
becomes the `EventSystem`.
