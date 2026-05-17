# `src/ui/devPanel.js`

The hamburger dev menu in the top-left. 16 cheat buttons gated by a
`const DEBUG = true` toggle at the top of the file.

## Buttons

- Add coins (max)
- Add RP (max)
- Max research (all repeatable + boolean)
- Add resources (+99,999 each, clamped)
- Next SOL
- Max upgrades on all current ships
- Random-assign all idle ships
- Upgrade base (one tier; spoofs resources)
- Add unique ships (Sentinel, Serenity, Normandy, Ebon Hawk)
- Fill fleet to base cap
- Flood iron nodes (every empty tile in the map)
- Trigger solar flare / comet / black hole
- Test transmission (random NPC, lorem)

## Notes

- `DEBUG = true` means it ships in every build. Wire to a URL param or
  query string so it can be disabled in prod.
- Every button has a `dev-btn-*` id in `index.html`; adding a button is a
  two-file change.

## Inline CSS

`panel.style.display = 'none'` when `DEBUG = false`. Replace with
`#dev-panel.is-hidden`.

## Modularization candidates

Declare the buttons in an array of `{ id, label, action }` and let
`initDevPanel()` render the menu HTML — eliminates the two-file change.
