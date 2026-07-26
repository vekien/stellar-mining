# Stellar Mining Co.

Browser-based mining and fleet management game set on the edge of known space. Build a base, deploy ships, harvest resources across orbital rings, trade for profit, research tech, and survive cosmic hazards.

**One base. One fleet. Infinite expansion.**

---

## Setup

No build step or framework. The game is vanilla HTML, CSS, and ES modules.

### Requirements

- A modern browser (Chrome, Firefox, Edge, Safari)
- [Node.js](https://nodejs.org/) (optional, only if you use a local static server)

### Run locally

1. Clone or download this repo.
2. From the project root, start a static file server:

```bash
npx serve .
```

3. Open the URL printed in the terminal (usually `http://localhost:3000`).

Any static server works, for example:

```bash
npx http-server .
# or
python -m http.server 8000
```

> Opening `index.html` directly via `file://` may fail because ES modules need to be served over HTTP.

There is no `npm install` step — `package.json` is intentionally empty.

---

## How to play

1. **Assign ships** to resource nodes on the isometric map.
2. **Collect cargo**, haul it home (or via transports), and **sell** on the market.
3. **Craft** new ships, turrets, and base modules.
4. **Upgrade** your base and fleet for more speed, cargo, and throughput.
5. **Research** tech tiers to unlock deeper belts, defenses, and systems.
6. Watch **SOL time**, market demand, and random events (solar flares, comets, and more).

Progress autosaves to `localStorage` about every 5 seconds.

Use the in-game tutorial banners and the **DEV** menu (top bar) when testing.

---

## Features

| Area | What you get |
|------|----------------|
| **World** | Isometric canvas map, pan/zoom, starfield, resource nodes by mining tier |
| **Fleet** | Specialized ships, assign/recall, craft, upgrade, rename, transport load/unload loops |
| **Economy** | Multi-resource market, daily demand boosts, sell prices, coin sink for crafts/upgrades |
| **Base** | Upgrade tiers, HP/shields, repair, modules (storage, power, labs) |
| **Defense** | Place and upgrade turrets; research unlocks advanced defenses |
| **Research** | Tier-gated tree with RP costs, repeatable upgrades, and unlock flags |
| **Events** | Timed hazards (e.g. solar flare, comet) with warnings and combat interactions |
| **Narrative** | NPC transmissions, command/mission framing, codex |
| **UX** | HUD panels (Overview, Command, Trade, Ships, Research, Craft, Codex), settings, autosave |

Resources span **Tier I–X** (iron and copper through late-game metals like rhodium and hafnium).

---

## Project layout

```text
stellar-mining/
  index.html          # UI shell
  styles/main.css     # Global styles
  src/
    main.js           # Boot + game loops
    state.js          # Shared game state + save/load
    data/             # Static defs (resources, ships, research, …)
    systems/          # Gameplay simulation
    render/           # Canvas drawing
    ui/               # DOM panels and HUD
  assets/             # Images (e.g. NPC portraits)
  docs/               # Architecture notes and file docs
```

See [CODE_STRUCTURE.md](CODE_STRUCTURE.md) for a deeper map of systems and conventions.

---

## Tech notes

- Vanilla JavaScript ES modules (no bundler)
- Canvas render loop + separate simulation tick
- State-first design: systems mutate shared `state`; UI and renderer read it
- Saves under key `stellarMiningCo_v1` in `localStorage`

---

## Docs

- [CODE_STRUCTURE.md](CODE_STRUCTURE.md) — architecture and directory map  
- [PLAN.md](PLAN.md) — systems roadmap (missions, bounties, advanced tech)  
- [docs/v0.0.13/](docs/v0.0.13/) — per-file snapshot docs  

---

## Credits

Developed by **Vekien Ltd**
