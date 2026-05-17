# `src/ui/basePanel.js`

The draggable base station panel: identity card, health/shield bars,
upgrade ladder, unlocks list, repair buttons.

## Exports

- `renderBasePanel()` — full rebuild when open; uses a body signature
  cache (`_basePanelBodySig`) to skip identical re-renders.
- Internally: `clampBasePanelPosition`, `applyBasePanelPosition`,
  `initBasePanelDrag` — drag/clamp logic for `#base-panel`.
- `window.setBpTab`, `window.dismissBasePanel`.

## Inline CSS

Heavy. The body HTML embeds:
- `style="color:#ffe066"` on numeric highlights inside upgrade detail
  rows.
- `style="background:${MINE_TIERS[bl]?.color}"` on the tier pill.
- HP bar with `width:${hpW}%` inline + shield bar with `left:${hpW}%;
  width:${shW}%` — these are dynamic.
- Several `style="font-size:11px;color:#ffe066;background:...;border:..."`
  pill chips repeated 3×.
- `panel.style.left/top` driven by drag.

Detailed entries in the inline CSS audit.

## Modularization candidates

- `BasePanelView` component with sub-views: `BaseIdentityCard`,
  `BaseHealthBar`, `BaseUpgradeRow`, `BaseUnlocksList`.
- The drag/clamp pattern is identical to the storage modal and turret
  modal — extract a `DraggablePanel` mixin.
