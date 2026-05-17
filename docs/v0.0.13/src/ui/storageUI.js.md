# `src/ui/storageUI.js`

The building/module modal, placement, upgrade/sell, and the building
craft pipeline (including the recent drone-craft additions).

## Modal lifecycle

- `openModuleModal(moduleId)` (alias `openStorageModal`) — adds a
  `.storage-modal-window` element for that module to the host (multiple
  modules can be open simultaneously).
- `ensureStorageModalWindow(moduleId)` — lazy-create with the shared
  shell + drag handle.
- `renderModuleModal(moduleId, modalRoot?)` — full body rebuild keyed on
  module type (storage, research lab, drone lab, power station, power
  pole, lab tower).
- `patchModuleModal(moduleId, modalRoot?)` — re-emits text and bars; the
  recent guard `if (!qs('#storage-modal-name')) renderModuleModal();
  return;` covers the case where a modal exists but its body hasn't
  rendered yet.
- `patchStorageModal()` — iterates every open window and patches each.

## Drag

`initStorageModalDrag`, `clampStorageModalPosition`,
`applyStorageModalPosition`, `bringStorageModalToFront` (z-index stack).
Same shape as turret/basePanel drag.

## Placement / move / sell

- `canPlaceModuleAt(type, col, row, ignoreId)` — validates footprint,
  base, nodes, other modules, turrets.
- `window.startMoveStorage`, `window.confirmSellStorage`,
  `window.sellStorageFacility`, `window.startCraftBuilding`,
  `window.beginPlacingBuilding`, `window.upgradeStorageFacility`,
  `window.buyStoragePower`, `window.setPowerStationFuel`.

## Craft pipelines

`completeCraftBuilding(type)`, `scheduleBuildingCraftCompletion`,
`syncBuildingCraftTimers`, plus the recently added `completeCraftDrone`,
`scheduleDroneCraftCompletion`, `startCraftDrone`,
`syncDroneCraftTimers`.

## Inline CSS

Very heavy. Pretty much every template literal in `renderModuleModal`
contains `style="..."` fragments — module name color, power bar
gradient, drone bar gradient, network summary chips, status pills,
section dividers.

`modal.style.cssText = '...'` is set on the modal element when first
created — that whole CSS chunk should be on a `.storage-modal-window`
class.

## Modularization candidates

- `BuildingModalView` base + subclasses: `StorageModalView`,
  `ResearchLabModalView`, `DroneLabModalView`, `PowerStationModalView`,
  `PowerPoleModalView`, `LabTowerModalView`. Each owns its body template
  and patch path.
- Multi-modal host pattern (z-index stack, draggable per-modal) extracts
  to a `ModalManager`.
- `BuildingFactory` for craft + place + move + sell shared with
  `TurretFactory`.
- Drone crafting becomes a recipe in `CraftSystem` instead of a separate
  pipeline.
