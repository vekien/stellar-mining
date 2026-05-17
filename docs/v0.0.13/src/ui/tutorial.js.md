# `src/ui/tutorial.js`

Tutorial pointer overlay system, the trade-tutorial trigger, the
mission-briefing banner, and the "reassign tooltip" floating helper.

## Pointer model

`TUTORIAL_DEFS[]` — each entry has `id`, `condition(state)`, `text`,
`placement: 'above'|'below'`, plus `getEl()` (DOM-anchored) **or**
`getPos(state)` (canvas-world-anchored). One pointer DOM element is
spawned per condition that returns true; existing pointers are blown
away on each `renderTutPointers()` call.

`canvasPos(wx, wy)` does the world → screen projection respecting cam +
canvas bounding rect.

## Exports

- `renderTutPointers()` — rebuilds every active pointer.
- `checkTradeTutorial()` — fires Kade's intro when coins cross 500 or
  drop below 100.
- `dismissTutorial()` — closes the mission-briefing banner.
- `showReassignTooltip(ship)` / `removeReassignTooltip()` — the floating
  yellow "click a node" tooltip while assigning.

## Inline CSS

- `showReassignTooltip` sets `el.style.cssText = …` with the entire chip
  style baked in (background, border, color, font, z-index, shadow).
  All of this moves to `.reassign-tooltip` in CSS.
- `renderTutPointers` sets `style.left/top` on each pointer chip; should
  set CSS custom props instead.

## Modularization candidates

- A `TutorialOverlay` class with `tick()` rebuilding pointers, plus a
  declarative `TutorialStep` interface.
- Move the "redirect" / "upgrades" co-existing flow flags into named
  tutorials with their own state.
