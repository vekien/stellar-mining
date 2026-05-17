# v0.0.13 Documentation Index

Snapshot of the codebase at the start of v0.0.13 — one doc per source file
explaining how it currently works, plus the cross-cutting plans for
modularization and inline-CSS extraction.

## Cross-cutting documents

- [`_overview.md`](_overview.md) — high-level architecture and runtime data flow
- [`_modularization-plan.md`](_modularization-plan.md) — proposed classes/systems refactor
- [`_inline-css-audit.md`](_inline-css-audit.md) — every JS-driven style call, with a plan to extract into CSS
- [`_drive-by-fixes.md`](_drive-by-fixes.md) — small corrections noticed while reading

## File-by-file docs

Mirror the source tree under `src/`. Each file has a sibling `.md` describing
its responsibility, exports, dependencies, and patterns worth modularizing.

- [`index.html.md`](index.html.md)
- `src/`
  - [`constants.js.md`](src/constants.js.md)
  - [`state.js.md`](src/state.js.md)
  - [`main.js.md`](src/main.js.md)
  - [`input.js.md`](src/input.js.md)
  - [`helpers.js.md`](src/helpers.js.md)
  - `data/`
  - `render/`
  - `systems/`
  - `ui/`
- [`styles/main.css.md`](styles/main.css.md)
