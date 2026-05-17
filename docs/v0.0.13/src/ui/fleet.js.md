# `src/ui/fleet.js`

The sidebar's ship list, filters, and the per-ship action panel + drawer.
~1160 lines.

## Public exports

- `getShipCargoSummary(ship)`, `getShipTransportSummary`,
  `getShipTransportStatusHtml`, `getShipTransportSummaryLabel`,
  `getShipStatusMeta`, `getShipRouteError`, `getShipHoldingReason` —
  pure-ish helpers used by both this module and `main.js`'s patch loop.
- `renderFleetFilters()` — the search + chip filter bar.
- `renderShipsList()` — full ship-card list.
- `renderActionPanel()` — drawer at the bottom of the sidebar that shows
  the currently selected ship.
- `renderTab()` — switches the right-side tab between LOG and FLEET (or
  whatever tabs exist).

## Window globals

`toggleFleetFilters`, `toggleFollowShip`, `goHome`, `openSellOverlay`,
`openSalvageOverlay`, `closeSellOverlay`, `confirmSellOverlay`.

## Patterns

- Per-ship HTML is composed in `buildShipDrawerContent` /
  `patchShipDrawerContent`. The patch path is signature-driven to keep
  the DOM stable.
- The Upgrades section is built by `buildUpgradesSection(shipId)` — a
  per-stat row builder with chunk-buying (1/2/5/10 levels).

## Inline CSS

Heavy. Lots of `style="color:..."`, `style="background:..."` inside
ship-card templates. Catalogued in the inline CSS audit.

## Modularization candidates

- `ShipCard` and `ShipDrawer` components, each owning their own DOM
  template and patcher. Build a `ShipList` that diffs by id.
- `UpgradeRow` component subscribed to a per-ship state slice, shared
  between mining/transport/combat roles.
- Move the disposition warning + sell/salvage overlays into their own
  modals.
