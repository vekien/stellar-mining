# `src/ui/refresh.js`

Trivial 11-line module: exports a `refresh` object with `ui`, `header`,
`basePanel` slots. `ui/ui.js#initRefresh` populates them at boot so any
system can call `refresh.ui()` without importing the UI module (circular
dep avoidance).

## Inline CSS

None.

## Modularization candidates

Replace with a real `EventBus` (`bus.emit('ui:dirty')`). Subscribers
listen instead of poking through a shared object.
