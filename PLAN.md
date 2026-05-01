# Game Systems Plan

## 1. Command Mission System
Story-driven, sequential missions with named NPCs from the current cast, such as Rigs, Vane, and Juno. Each command has a briefing transmission, objectives, and a debrief with lore payoff.

### Structure
- `COMMAND_DEFS`: ordered array of missions
- Each mission includes: `id`, `npc`, `objectives[]`, `rewards`, `unlocks`, `nextCommand`
- Objectives are checked passively each tick
- State tracks `activeCommand` and `completedCommands[]`
- Commands can gate content, such as unlocking the bounty board

### Objective Types
- `reach_sol`
- `collect_resource`
- `upgrade_base`
- `build_ship`

### Notes
This is the main progression spine. The quest and bounty systems hang off it.

## 2. Quest System
Lightweight, repeatable side objectives with no story weight. These are simple tasks with rewards.

### Structure
- Pool of `QUEST_DEFS`
- Each quest includes: `id`, `label`, `objective`, `reward`
- Player has 3 active quests at a time
- Quests refresh every N SOLs
- State tracks `activeQuests[]` and `completedQuestIds[]` for deduplication within a refresh window

### Reward Shape
- `coins`
- `rp`
- `resources`

### Quest Types
- Collect X of a resource
- Reach a cargo milestone
- Complete N trips
- Survive a comet with HP above 50%

### Notes
Keep objectives dead simple: one condition, instant reward, no chains.

## 3. Bounty System
Unlocked through Commands. Targets are named pirate ships or fleets that spawn in the sector.

### Structure
- `BOUNTY_DEFS`: generated or scripted targets
- Each bounty includes: `name`, `difficulty`, `reward`, `expiresInSols`
- Bounties appear on a board in a new header panel
- 3 to 5 are active at once and rotate each SOL
- Completion requires a combat encounter tracked by the combat system
- Missed bounties expire and reduce reputation slightly

### Reward Shape
- `coins`
- `rep`

### Notes
This depends on combat existing first. Define the data shape now and implement later.

## 4. Reputation System
Tracks standing with named factions and affects prices, dialogue, and access.

### Factions
- Outer Rim Collective: independent miners, default friendly
- Helix Corp: corporate buyers, high prices but shady
- Vanguard Fleet: military, focused on bounties and defense
- Black Market: illegal goods, massive discounts, high rep risk if caught

### Structure
- `state.reputation: { factionId: number }`
- Range: `-100` to `100`
- Reputation changes come from buying, selling, bounty completion, and ignored events
- Thresholds unlock or lock prices, dialogue, quest types, and special recipes
- Visible in a Codex tab or Sector Overview section

### Notes
Rep changes should be small and gradual. The tension comes from drift, not big swings.

## 5. Full Crafting System
Adds intermediate components as a new crafting tier instead of crafting ships directly from raw resources.

### Structure
- `COMPONENT_DEFS`: items like Computer, MicroProcessor, FluxCapacitor, HullPlating, and PowerCell
- Each component includes: `id`, `label`, `craftTime`, `reqs`, `tier`
- Components are crafted at a Fabricator, a new base upgrade slot
- Ships and future items reference components in their requirements instead of only raw resources
- `state.components: { [id]: count }`
- New `FABRICATE` tab in the base panel, similar to the `SHIPS` tab

### Notes
Start with only 3 to 4 components and gate them by base level. Complexity will grow quickly.

## 6. Power System
Every building and upgrade draws power. You generate power and must route it.

### Structure
- Power sources: Solar Array, Fusion Cell
- Power consumers: base, turrets, fabricator, each ship dock
- `state.powerGrid: { sources[], lines[] }`
- Sources have positions and lines connect them to consumers
- New grid interaction mode for drawing power lines, similar to turret placement
- Power deficit causes penalties such as reduced mine speed, offline turrets, and paused crafting

### Notes
This is the most complex system. It touches the renderer, grid logic, and most existing systems.
Consider a simplified version first, where the game only checks whether enough sources exist.

## 7. Galaxy Probe System
Send probes to other systems to scan for rare resources, anomalies, and events.

### Structure
- `PROBE_DEFS`: probe types with different range, speed, and sensor quality
- Probes are craftable via the Fabricator
- Destinations are procedurally generated from a seed and shown on a galaxy map overlay
- Probe missions have a duration in real time or SOLs
- Missions return a `PROBE_REPORT`
- Reports can reveal resource deposits, rare components, lore fragments, and hazard warnings
- Multiple probes can run simultaneously, up to a cap

### Notes
This is late-game content. Gate it behind base level 5 or higher. The galaxy map is a major UI surface and needs careful design.

## Priority Order
| Priority | System | Why |
|---|---|---|
| 1 | Crafting | Unblocks ship depth immediately, no new systems needed |
| 2 | Quests | Simple, adds a daily engagement loop |
| 3 | Commands | Gives new players a guided spine to follow |
| 4 | Reputation | Adds meaning to economic choices already in the game |
| 5 | Bounties | Needs combat first, but the design can be prepared now |
| 6 | Probes | Strong late-game hook with a complex UI surface |
| 7 | Power | Highest complexity and biggest renderer impact, so leave it for last |
