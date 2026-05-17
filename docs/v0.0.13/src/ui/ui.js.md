# `src/ui/ui.js`

The UI orchestrator. Header chips, the resource bar, and the
`renderUI()` aggregator that systems call after mutating state.

## Exports

- `updateHeaderCoins/Ships/RP/Craft`, `updateHeader()` — patch the
  header text nodes with change-detection cache (`_hdrCache`).
- `renderResources()` — full rebuild of the depot bar.
- `patchResources()` — text-only update of qty spans (id `res-qty-<type>`).
- `invalidateResourceBar()` — forces full rebuild next `renderUI`.
- `renderUI()` — `renderResources/patchResources` + `renderShipsList` (or
  `renderFleetFilters` if renaming) + `renderActionPanel` +
  `renderBasePanel` + `renderTutPointers`.
- `initRefresh()` — wires `refresh.ui/header/resources/basePanel` and
  registers the header-coin callback in `helpers.js`.

## Inline CSS

- `updateHeaderCraft` toggles `el.style.display` between `''` and
  `'none'` to hide the badge when count is 0. Replace with
  `.is-hidden` class.

## Modularization candidates

- Promote header chips to `HeaderChip` component each owning its own
  patcher.
- `ResourceBar` component owns its DOM + patch loop.
- The `_hdrCache` change-detection pattern is a baby reactive system;
  replace with a proper `Signal`/`Observable`.
