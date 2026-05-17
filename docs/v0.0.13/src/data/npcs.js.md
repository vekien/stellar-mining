# `src/data/npcs.js`

The NPC registry. Each entry is identity + portrait path + biography +
optional transmission line templates (some literal strings, some functions
that take args like `(col, row)` or `(hpPct)`).

Imports `PLAYER_TITLE as C` from `constants.js` so transmissions can call
the player "Commander" without each entry knowing it.

## Cast

`juno`, `sera`, `vex`, `rigs`, `kade`, `architect`, `vane`, `doran`,
`scarlett`, `android`, `dax`, `kai`, `zoe`.

## Notes

- All transmission templates are HTML strings (literal `<strong>` etc.).
  This is fine for now but couples NPC data to presentation. After
  modularization, a `TransmissionTemplate` could distinguish content from
  emphasis.
- `vane_comet_explain` embeds an inline `style="color:#f88"` in the HTML —
  the only inline CSS in this file. Move to a `.transmission-warn` class.
- Rigs' `shipLines.<type>` is a per-ship-type lookup separate from
  `transmissionLines` — two patterns in one file. Worth normalising.

## Inline CSS

- One `<span style="color:#f88">` inside `vane_comet_explain`. Class:
  `.tx-warn` (or reuse `.status-bad`).

## Modularization candidates

- Add `getTransmission(npcId, key, ...args)` so callers don't dive into
  `NPCS.foo.transmissionLines.bar`.
- Move tutorial-style transmissions into a "scripted" registry separate
  from the bios.
