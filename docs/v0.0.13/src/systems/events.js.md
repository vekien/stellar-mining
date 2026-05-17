# `src/systems/events.js`

Random event runtime. Three events live here: `solar_flare`, `black_hole`,
`comet`. Each is an object in `RANDOM_EVENTS[]` with `id`, `label`,
`trigger(sol)`.

## What it does

- `showEventWarning(label, detail, duration)` — DOM banner with a
  countdown progress bar driven by rAF.
- `closeEventWarning()`.
- `RANDOM_EVENTS[]` — the three event triggers; each composes the
  banner HTML, applies effect, queues NPC transmissions.
- `fireEventById(id)` — picks event, schedules its `trigger` after the
  per-event `*_TRIGGER_DELAY_MS`, then fires; increments
  `state.eventCounts[id]`.
- `fireRandomEvent()` — uniform pick across all events.

## Inline CSS

**Heavy** — almost every `event-loss-row`, `event-hp-bar`, `event-flare-*`
template contains `style="color:…"` / `style="background:..."` /
`style="width:…"` fragments. List in `_inline-css-audit.md`:

- Banner HP bar width is dynamic (`width: ${hpPct}%`); should set a CSS
  custom property `--event-hp-pct` and let the stylesheet do the width.
- All other inline `color:` / `background:` are static; move to classes.
- Banner progress bar width is set every frame from JS — keep but via a
  CSS variable.

## Modularization candidates

- Promote each event to an `Event` class with `prepare(state)`,
  `apply(state)`, `bannerHtml()`, `transmissions()`.
- `EventBanner` component encapsulating the warning UI.
- `EventScheduler` (currently in `systems/sol.js`) that selects + fires.
