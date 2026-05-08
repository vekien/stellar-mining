# Changelog - 2026-05-08

## Ship Details And Live UI

- Fixed the selected ship details panel so realtime updates no longer rebuild the whole panel every tick.
- Kept dropdowns and other focused controls usable while ship data updates in place.
- Split selected-ship updates into:
  - structural rerenders only when the panel actually changes shape
  - targeted DOM patching for volatile values like status, cargo, distance, route errors, and holding reasons

## Transport Ship Status And Flow

- Added proper transport phase handling in the UI:
  - `Loading`
  - `Transporting`
  - `Returning`
  - `Unloading`
- Fixed transport summaries so they no longer show misleading cargo text during the wrong phase.
- When empty and flying back for another pickup, transport ships now show `Returning: <pickup location>` instead of `Transporting: None`.
- Added a transport-specific warning to sell/salvage overlays when loaded cargo would be lost.

## Transport Load / Unload Behavior

- Implemented gradual unloading for transport ships at depot using `LOAD SPD`.
- Transport ships now:
  - load over time at pickup
  - fly to dropoff
  - unload over time at dropoff
  - only loop back after unloading is complete
- Reused shared deposit logic so partial unloads still update storage/base resources correctly.

## Transport Resource Status Panel

- Replaced the old inline transport cargo text with an inventory-style status block in ship details.
- Added:
  - colored resource names
  - colored dots
  - right-aligned amounts
  - scrollable container for large cargo manifests

## Transport Resource Popup Improvements

- Added resource floatie popups for transport unloading.
- Changed popup behavior so each resource popup appears when that specific resource finishes unloading.
- Added staggered popup timing to reduce overlap.

## Save / Load Fixes

- Fixed module inventory persistence so storage and related module inventories survive reload correctly.
- Added explicit module serialization / deserialization for saved module inventories.

## Ship Rendering And Visual Tuning

- Enlarged and lengthened transport ship visuals.
- Added a dedicated larger silhouette for cargo ships.
- Changed transport ship colors to white / gray.
- Made `Courier` and `Titan` render sizes data-driven in ship definitions.
- Moved ship render presentation into `SHIP_DEFS.render`, including:
  - color
  - size
  - trail offsets
  - trail width
  - trail opacity
  - trail length
  - glow radius
  - glow opacity
- Added support for editable curved trail length per ship type via data.
- Added dual curved trails for transport ships instead of only a single centered trail.
- Increased transport trail history so slow cargo ships still leave visible long trails.
- Added editable glow controls in ship render data.

## Ship Turning / Movement

- Made turning behavior data-driven through ship render config:
  - `turnRateFar`
  - `turnRateNear`
- Tuned cargo ships to use much wider turn arcs.
- Added per-ship arrival behavior controls:
  - `directBlendDistance`
  - `arrivalRadius`
- Reduced visible endpoint snapping for wide-turn cargo ships by making final approach smoother and arrival snap thresholds smaller.

## Ship Action Layout

- Reworked ship detail action buttons so they are arranged as:
  - `Follow` + `Rename`
  - `Sell` + `Salvage`
- Removed the icon from `Sell`.

## Fleet / Header Modal Layout

- Set Fleet Manifest modal width to `90%`.
- Changed `#hdr-modal-overlay` top padding to `100px`.
- Replaced inline modal width overrides with modal classes.

## Fabrication / Craft Panel

- Restored `LOAD SPD` display for cargo transports in Fabrication.
- Replaced Fabrication top category tabs with left navigation similar to Codex.
- Added ship sub-tabs under Ships:
  - `Mining`
  - `Cargo`
  - `Combat`
  - `Garrison`
- Preserved scroll position when craft completion refreshes the Fabrication panel.
- Updated cargo transport craft times:
  - `Courier`: 20s
  - `Titan`: 45s

## Ship Stats / Balance Changes

- Reduced cargo transport fly speed progression:
  - `Courier`: 25 base, 100 max
  - `Titan`: 25 base, 80 max
- Increased `Titan` max cargo capacity to `10,000`.

## Storage Facility UI

- Removed redundant storage summary rows under the storage modal.
- Added `ONLINE / OFFLINE` operational banner above the storage power section.
- Restyled the storage power section into a denser `POWER GRID` panel.
- Added yellow `ϟ` styling to storage power presentation.
- Moved the power bar into the power panel itself.
- Swapped bar colors so:
  - power bar is yellow
  - storage-used bar is blue

## Power Station UI

- Updated Power Station styling so the power-source area visually matches storage power styling more closely.
- Added yellow power icon / title treatment for `POWER SOURCE`.
- Added `△ FUEL` marker styling for the fuel meter label while keeping fuel purple-themed.

## Power Pole UI

- Added the same `ONLINE / OFFLINE` operational banner used by storage and power stations.
- Replaced old summary rows with a dedicated `RELAY RANGE` panel.
- Added relay range display using tile count plus ASCII blocks.

## Storage / Power Balance

- Increased Storage Facility power capacity scaling significantly.
- Changed storage power capacity progression from `+50` per tier to `+250` per tier.
- Tier X storage power capacity now lands at `3250`.

## Codex Fixes

- Fixed Codex > Storage crash caused by a missing storage stats helper reference.
- Replaced the broken reference with shared module stat lookup.

## Render Order

- Changed render order so ships draw above turrets.

## Logging Cleanup

- Removed mining debug `console.log` spam.
- Removed deposit debug logging.
- Removed all remaining `console.log` calls from the repo.

## Git

- Created commit `a1f8730` for the early ship panel and module inventory fix.
- Created commit `ff6f3cd` containing the broader ship handling, rendering, fabrication, storage, and module UI refinements.
