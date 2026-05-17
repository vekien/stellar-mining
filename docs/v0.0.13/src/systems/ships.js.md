# `src/systems/ships.js`

The biggest system file (~1300 lines). Owns the ship state machine,
movement, cargo accounting, depot/pickup routing, the craft pipeline,
and the per-stat upgrade actions. Most things the player can do to a
ship live here.

## Public exports

- `spawnShip(type)` — creates a ship at the base with stats from
  `SHIP_DEFS[type]`.
- `assignShip(ship, node)` — clears holding/pickup state and starts the
  ship flying to a node.
- `tickShip(ship, dt)` — the per-frame state machine (`idle` → `flying`
  → `mining` → `returning` → `holding` plus transport variants). The
  longest function in the codebase.
- `flushTickEvents(canvas)` — drains the per-tick floatie/deposit event
  buffer.
- `tickEvents` — the in-flight event array consumed by `flushTickEvents`.

## Window globals (HTML onclick targets)

`recallShip`, `confirmSellShip`, `sellShip`, `salvageShip`, `craftShip`,
`startCraftShip`, `syncShipCraftTimers`, `upgradeShip`, `upgradeShipAll`,
`startAssign`, `cancelAssign`, `doAssign`, `setShipDepot`,
`setShipPickup`.

## Internal helpers

`resolveShipDepot`, `getShipDepotDestination`, `resolveShipPickup`,
`getShipPickupDestination`, `getHoldingAnchor`, `getPickupHoldingAnchor`,
`getTransportSourceAmount`, `getTransportSourceSnapshot`,
`buildEvenPickupManifest`, `clearTransportCargo`,
`setTransportCargoDestination`, `withdrawPickupManifest`,
`getDepotFreeCapacity`, `canReturnCargo`,
`startTransportToPickup`, `startTransportToDepot`,
`applyDepositMilestones`, `applyDepositEvent`,
`unloadTransportCargo`, `getDepotFloatiePos`,
`isHoldingTileBlocked`, `setNextHoldingDestination`,
`getBlackHoleSpeedMult` (drive-drag through the anomaly).

## Patterns

- Mining ships: target node → fly → mine → fly back → unload at depot.
- Transport ships: pickup point → load manifest → depot → unload, with
  separate holding tile if either endpoint is occupied/full.
- Craft pipeline: same shape as turrets and buildings (queue + per-id
  timer + setTimeout chain).
- Per-stat upgrades: `upgradeShip(shipId, statName, chunk)` →
  `upgradeShipAll(shipId, levels)` calls the named upgrade cost fn.

## Inline CSS

Several deposit/floatie helpers compose tooltip HTML with inline
`style="color:..."`. Catalogued in the inline CSS audit.

## Modularization candidates

This is the file with the highest payoff for class extraction:

- `Ship` class wrapping a state POJO: methods `tick(dt)`, `moveTo`,
  `mine`, `unload`, `state` (the enum).
- `MiningShip` / `TransportShip` / `CombatShip` subclasses
  override `pickStateAction`.
- `Depot` / `Pickup` strategies replace the `resolve…` + `getShip…Destination`
  pair (each Depot type knows its position/operational/capacity).
- `CraftSystem` shared with turrets/buildings/drones (see
  `_modularization-patterns.md`).
- Move salvage/cargo manifest math into its own file.
