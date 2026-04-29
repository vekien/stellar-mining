# Stellar Mining - Code Structure

## What this project is
- Browser-based, canvas-driven resource mining/management game with an isometric map.
- Player loop: assign ships to resource nodes, collect cargo, sell in market, upgrade ships/base, unlock research, survive random events.
- Single-page app with vanilla JavaScript modules (no framework/build pipeline currently configured).

## Runtime flow (high level)
1. `index.html` loads UI shell and `src/main.js`.
2. `src/main.js` boots state, renderer, stars, input, and UI refresh hooks.
3. Game loops run:
   - render loop (`render`) for canvas drawing,
   - simulation loop (`gameLoop`) for SOL time, ships, events, and animations,
   - lightweight UI patch loops for header/resource/cargo updates,
   - autosave interval to `localStorage`.

## Directory map
```text
stellar-mining/
  index.html                # Main page and UI containers/overlays
  styles/main.css           # Global styling for HUD, panels, modals, tooltips
  src/
    main.js                 # Boot + loop orchestration
    state.js                # Canonical mutable game state + save/load
    constants.js            # Grid/save/SOL constants
    helpers.js              # Shared formatting/log/tooltip helpers
    input.js                # Mouse/touch/keyboard interactions

    data/                   # Static game definitions
      resources.js          # Resource metadata + mining tier access
      nodes.js              # World node positions + base scaling tables
      ships.js              # Ship stats/upgrade costs/caps
      crafts.js             # Crafting recipes for ship types
      research.js           # Research tree definitions
      npcs.js               # Transmission text/persona content

    systems/                # Gameplay logic (state mutations)
      ships.js              # Ship lifecycle, assign/recall/craft/upgrade/sell
      sol.js                # Day cycle tick + market rotation + RP gains
      events.js             # Random events (solar flare/comet) and warnings
      market.js             # Resource selling and price boost logic
      base.js               # Base upgrades/repair/defense interactions
      research.js           # Research purchase and unlock application

    render/                 # Canvas camera/drawing/effects
      renderer.js           # Isometric world, ships, base, nodes render pipeline
      camera.js             # World/screen transforms, pan/zoom helpers
      stars.js              # Background starfield and shooting stars
      animations.js         # Floaties, flare/comet effects, pulses, particles
      turrets.js            # Turret draw + placement visuals
      canvasState.js        # Ephemeral hover/selection render flags

    ui/                     # DOM UI composition and panel rendering
      ui.js                 # Top-level UI orchestrator and refresh wiring
      fleet.js              # Fleet list, filters, action panel, tabs
      basePanel.js          # Base panel sections and actions
      panels.js             # Header modal panels (SOL/TRADE/RESEARCH/SHIPS/CODEX)
      transmissions.js      # NPC message/comms panel behavior
      tutorial.js           # Onboarding banners, pointers, tutorial checks
      turretUI.js           # Turret modal and controls
      rename.js             # Ship rename overlay and submit/cancel
      refresh.js            # Shared callback hub for partial rerenders

  assets/images/npcs/       # Portrait art for transmission characters
```

## Key architecture notes
- **State-first model:** All gameplay systems mutate shared `state` from `src/state.js`; UI and renderer read from it.
- **Module boundaries:**
  - `data/*` = static definitions,
  - `systems/*` = simulation/economy rules,
  - `render/*` = canvas world drawing,
  - `ui/*` = DOM/HUD/panels and interactions.
- **Event style:** Uses a mix of ES module imports and `window.*` handlers for HTML/dynamic button callbacks.
- **Persistence:** Serialized save in `localStorage` via `SAVE_KEY` (`stellarMiningCo_v1`) with lightweight migration guards.
- **Timing model:** SOL/day progression (`SOL_DURATION`), random event timer scheduling, and autosave every 5s.

## Good starting points for future changes
- Add/modify gameplay rules: start in `src/systems/` and corresponding `src/data/` defs.
- Add new UI panels/cards: `src/ui/panels.js`, `src/ui/fleet.js`, `src/ui/basePanel.js`.
- Visual/map changes: `src/render/renderer.js`, `src/render/camera.js`, `styles/main.css`.
- New save fields: update both `saveGame()` and `loadGame()` in `src/state.js`.

## Current repo notes
- `package.json` is currently empty (`{}`), so this runs as static browser JS rather than a configured Node toolchain.
- Version in UI currently shows `v0.0.2` (`index.html`).
