# `src/ui/panels.js`

The biggest UI file (~1700 lines). Owns the header-button modal: SOL
overview, command tabs, transmissions history, craft, research, fleet,
codex, stats, resources, market.

## Single dispatcher

`openHdrPanel(type, options)` — switches `_hdrPanelOpen`, sets the
heading, and dispatches by `type` into a long if/else that builds the
body HTML. Each branch is its own ad-hoc render function.

## Tab state

`_hdrPanelOpen`, `_codexTab`, `_craftTab`, `_craftShipRoleTab`,
`_fleetCompSig`, `_fleetSortKey`, `_fleetSortDir`, `_stockpileMineableKeys`,
`_selectedTransmissionIndex` — module-level state for each panel.

## Public exports

- `openHdrPanel`, `closeHdrPanel`, `dismissHdrModal`,
  `refreshHdrPanelIfOpen`.
- `patchSolPanel(what)` — partial patches when the SOL clock or fleet
  power ticks.
- `patchTransmissionsPanel`, `patchStatsPanel`.
- `handleBasePanelOverlayClick`.

## Window globals

`setCraftTab`, `setCraftShipRoleTab`, `switchCodexTab`, `setCmdTab`,
`sortFleetManifest`, `selectTransmissionHistory`, `patchStockpileCards`,
`openHdrPanel`, `closeHdrPanel`, `dismissHdrModal`,
`handleBasePanelOverlayClick`, `patchSolPanel`,
`patchTransmissionsPanel`.

## Notes

- Live progress bars for ship/turret/building/drone craft timers run from
  a `setInterval(100ms)` at the top of the file. Each category iterates
  separately — fold into one `CraftSystem`.
- The craft tab body has separate branches for ships, defense (turrets),
  storage/power/research (buildings), drones. Each builds its own card
  HTML and progress button. Pattern: collapse into one `craftSection(category)`.

## Inline CSS

Very heavy. Inline `style="color:..."`, `style="background:..."` in
nearly every template. Tracked in inline CSS audit.

## Modularization candidates

- One `HdrPanelView` base + subclasses per panel kind: `SolPanel`,
  `CraftPanel`, `ResearchPanel`, `FleetPanel`, `CodexPanel`, `StatsPanel`,
  `ResourcesPanel`, `MarketPanel`, `TransmissionsPanel`, `CommandPanel`.
- Each subclass owns `render()`, `patch()`, and `dispose()`.
- The header chip wiring is its own concern — `HeaderRail` plus chip
  components.
- `CraftPanel` shares its rendering with all four categories once
  CraftSystem exists.
