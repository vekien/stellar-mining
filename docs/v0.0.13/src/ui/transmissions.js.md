# `src/ui/transmissions.js`

The NPC transmission panel: a single-slot UI in the bottom of the screen
fed by a queue. Owns the dedupe logic and the rAF-style countdown.

## Exports

- `showOnce(id, text, duration, npcId)` — guarded by `state.seenMsgs[id]`.
- `showTransmissionMessage(text, duration, npcId)` — pushes to queue +
  prepends to `state.transmissionHistory`.
- `flushAdmiralQueue()` — pops the next queued message and renders it.
- `tickAdmiral(dt)` — counts down the active message; pulls next on
  expiry.
- `queueTransmissions(arr)` — batches with per-entry `delay` setTimeouts.
- `dismissTransmission()`, `window.dismissAdmiral`.

## Internal

- Module-level: `admiralQueue[]`, `admiralTimer`, `admiralDuration`,
  `admiralVisible`, `activeTransmissionSig`.
- Dedupe key: `${npcId}::${text}`. Prevents the same message from
  stacking inside the queue or interrupting itself.

## Inline CSS

- `prog.style.width = '100%'` and `prog.style.width = (timer/duration*100) + '%'`
  driving the countdown bar. Move to a CSS custom property
  `--tx-progress` updated each tick.
- All other elements toggle classes (`.visible`, `.pulsing`).

## Modularization candidates

- `TransmissionView` component wrapping `#admiral-panel` and exposing
  `show(message)` / `hide()`.
- `TransmissionQueue` system separate from rendering, with `seenMsgs`
  living on its own state slice.
