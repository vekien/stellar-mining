# `src/ui/turretUI.js`

Turret modal + craft + placement + upgrades + scrap. Recently rebuilt to
match the storage modal's draggable shell.

## Modal lifecycle

- `openTurretModal(id)` — sets `state.selectedTurret`, shows overlay,
  calls `renderTurretModal()` then `applyTurretModalPosition()`.
- `renderTurretModal()` — full body rebuild.
- `patchTurretModal()` — light text/bar patch on tick.
- `closeTurretModal(e)` — close on overlay click or X.

## Drag

`initTurretModalDrag`, `clampTurretModalPosition`,
`applyTurretModalPosition` — same pattern as the storage modal.

## Craft pipeline

`completeCraftTurret(type)`, `scheduleTurretCraftCompletion`,
`window.startPlaceTurret`, `window.syncTurretCraftTimers` —
mirrors the building/drone pipelines.

## Window globals

`upgradeTurret`, `confirmScrapTurret`, `doScrapTurret`,
`startMoveTurret`, `startPlaceTurret`, `beginPlacingTurret`,
`syncTurretCraftTimers`, `openTurretModal`, `closeTurretModal`,
`renderTurretModal`, `patchTurretModal`, `cancelTurretPlacement`.

## Inline CSS

- `style.left/top` set on the modal during drag (move to CSS variables).
- The body HTML template uses inline `style="color:..."` for stat
  highlights and status pills.
- Power bar + health bar widths driven by `style.width = "%"` (replace
  with CSS custom properties).

## Modularization candidates

- `TurretModal` extends shared `EntityModalView`. Same shell, same drag
  code as the storage modal.
- `TurretFactory` shares craft + place + move + scrap with the building
  factory.
