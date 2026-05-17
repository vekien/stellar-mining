# `src/ui/rename.js`

Modal rename flow for ships, the base, modules, and turrets. One overlay
DOM element (`#rename-overlay`) reused for all four cases.

## Pattern (×4)

Each `open*RenameOverlay(id)` function:
1. Sets `state.renaming*` flag (mutually exclusive across the 4 fields).
2. Pre-fills the input from the entity's name.
3. Sets the title text.
4. Wires `onkeydown` (Enter commit / Escape cancel) and overlay click.

`closeRenameOverlay()` clears all 4 flags.

`commitRename(newName)` reads whichever `renaming*` flag is active,
writes back to the entity, re-renders the appropriate modal.

## Inline CSS

None — all styling is by class.

## Notes

- The four open functions duplicate ~15 lines each; consolidate into one
  `openRenameOverlay({ kind, id, label, placeholder })`.
- Four mutually-exclusive flags (`renamingShip / renamingBase /
  renamingStorage / renamingTurret`) → a single `renaming = { kind, id }`
  is cleaner.

## Modularization candidates

- One `RenameOverlay` component with a target enum.
