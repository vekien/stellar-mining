# `styles/main.css`

The single stylesheet. ~2570 lines. Everything visual that *isn't*
canvas lives here.

## Structure (broad sections, by line range)

- Globals / reset / typography.
- `#top-bars` + header chips.
- `#sidebar`, fleet/log tabs, ship cards.
- Canvas widgets (zoom widget, fps, ship upgrade drawer).
- Modal overlays (base panel, header modal, sell/rename/about, etc.).
- Storage / turret modal shells.
- Craft panel cards, requirement chips, progress fills.
- Research panel.
- Tooltip variants.
- Tutorial pointer chips.
- Admiral transmission panel.
- Event warning banner.
- Resource bar pills.

## Notes

- File grew organically; sections aren't strictly ordered or commented.
- Many class names use kebab-case but a few (`storage-modal-drag-handle`)
  duplicate concepts that exist on the turret modal under a different
  name. Audit for naming consistency.
- A handful of utility classes (`hidden`, `is-visible`) are missing — the
  code toggles `display`/`opacity` via JS instead.

## Modularization candidates

- Split into `styles/` subdirectory, one file per UI domain:
  - `_base.css` (reset + tokens)
  - `_header.css`
  - `_sidebar.css`
  - `_canvas-overlays.css`
  - `_modals.css` (shared shell)
  - `_panels/` (one per header panel)
  - `_components/` (chips, pills, tooltips, tutorial pointers)
  - `_animations.css` (keyframes)
- Define design tokens (`--color-bad`, `--color-warn`, `--color-good`,
  `--tier-1..10`) once instead of repeating hex values.
- Add utility classes (`.is-hidden`, `.is-visible`, `.status--good`,
  `.status--warn`, `.status--bad`) that JS toggles instead of setting
  styles.
- Use CSS custom properties for dynamic values: `--hp-pct`, `--shield-pct`,
  `--modal-left`, `--modal-top`, `--tx-progress`. Stylesheet reads them
  via `var(...)`; JS just sets them with `element.style.setProperty(...)`.
