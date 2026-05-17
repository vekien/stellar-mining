# `src/data/crafts.js`

The flat recipe registry. Four top-level keys: `ships`, `turrets`,
`buildings`, `drones`, `base`. Each entry is `{ id, name, desc, cost?,
reqs, craftTimeMs?, ... }`.

## Exports

- `CRAFTS` — the registry.
- `getCraft(type, id)` — `O(n)` lookup; called constantly.
- `CRAFT_SHIPS = CRAFTS.ships` — alias for back-compat with older imports.

## Notes

- `getCraft` performs `O(n)` scans of an array on every call. Convert each
  category to a `{ [id]: entry }` map for `O(1)` lookups.
- The `desc` strings for turrets hard-code HP/dmg/range values that exist
  in `turrets.js` as well. Drift waiting to happen.
- `drones` is a new top-level category; it has one entry. After the drone
  system is finished, this pattern (a flat list per category) should be
  unified with the rest.

## Inline CSS

None.

## Modularization candidates

- Replace the array form with a `Map` (or per-category records). Add
  `byId(type, id)` for O(1) reads.
- Treat each entry as a `Recipe` object owned by its category's system
  (`ShipFactory`, `TurretFactory`, `BuildingFactory`, `DroneFactory`).
- Crafting timers / queues currently live in `state` per category
  (`shipCraftTimers`, `turretCraftTimers`, `buildingCraftTimers`,
  `droneCraftTimers`). One `CraftSystem` should own them all.
