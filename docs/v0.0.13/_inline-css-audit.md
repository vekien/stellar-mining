# Inline CSS audit

**Target for v0.0.13: zero CSS authored in JS or HTML.** Every
`style="..."` baked into template strings, every `element.style.foo = …`,
every inline `<style>` block needs to move to `styles/`.

This document catalogues every offender by category and then by file,
with the replacement strategy.

## Counts

- Source files (`src/**/*.js`): **427** style hits across 15 files.
- `index.html`: **32** inline `style="..."` attributes.

Top offenders by count:
- `src/ui/panels.js` — 141
- `src/ui/fleet.js` — 84
- `src/ui/storageUI.js` — 49
- `src/input.js` — 39
- `src/ui/turretUI.js` — 39
- `src/main.js` — 8
- `src/systems/events.js` — 13
- `src/ui/basePanel.js` — 14
- `src/helpers.js` — 13

---

## Categories

Each offender falls into one of these patterns. The replacement strategy
is per-category.

### A. Show/hide toggles

```js
el.style.display = '' / 'none' / 'block' / 'flex';
```

**Locations**: `helpers.js#renderLogPreview/hideTooltip`, `main.js`
patch-loop (route error, holding reason), every overlay open/close,
`ui/ui.js#updateHeaderCraft`, `ui/devPanel.js#initDevPanel`, every
modal's `closeStorageModal/closeTurretModal/closeHdrPanel`.

**Replacement**: a single `.is-hidden { display: none !important; }`
utility class. JS toggles it via `classList`. Overlays that need
`display: flex` for centering get `.is-visible { display: flex; }` and
default to `display:none` in CSS.

### B. Dynamic position (drag)

```js
modal.style.left = `${x}px`;
modal.style.top  = `${y}px`;
```

**Locations**: `ui/storageUI.js#applyStorageModalPosition`,
`ui/turretUI.js#applyTurretModalPosition`,
`ui/basePanel.js#applyBasePanelPosition`, tooltip move,
`helpers.js#moveTooltip`, `ui/tutorial.js#renderTutPointers`.

**Replacement**: CSS custom properties. JS calls
`el.style.setProperty('--x', `${x}px`)`. Stylesheet has
`.modal { left: var(--x); top: var(--y); }`.

Tracking left/top via `dataset.left/top` (currently used for drag
state) is fine to keep; only the *applied* style moves to a custom
property.

### C. Dynamic dimension (progress bar)

```js
fill.style.width = `${pct}%`;
```

**Locations**: `main.js` cargo bars, ship status pulses,
`systems/events.js#showEventWarning` (banner progress),
`ui/transmissions.js#tickAdmiral` (countdown bar),
`ui/storageUI.js` health/power/inventory bars,
`ui/turretUI.js` health/power bars,
`ui/basePanel.js` HP + shield bars,
`render/storage.js` doesn't apply (it draws to canvas, not DOM).

**Replacement**: CSS custom property `--pct`. Stylesheet:
`.bar-fill { width: var(--pct, 0%); }`. JS:
`fill.style.setProperty('--pct', `${pct}%`)`.

For the HP/shield-stack pattern in `basePanel.js` (the shield bar starts
where the HP bar ends), introduce two custom props `--hp-pct` and
`--shield-pct` and a stacked layout with `position:relative`.

### D. Dynamic color (status / tier / resource)

```js
el.style.color = '#4d8' / '#fa4' / '#f44';
el.style.background = MINE_TIERS[lvl].color;
```

**Locations**: `main.js#patchShipActionPanel` (`statusEl.style.color`),
`ui/basePanel.js` (tier pill color/background), every health bar,
sell value, status pill.

**Replacement**: state-driven classes via `dataset.status`:

```css
.status-pill[data-status="ok"]    { color: var(--color-good); }
.status-pill[data-status="warn"]  { color: var(--color-warn); }
.status-pill[data-status="bad"]   { color: var(--color-bad); }
```

For tier coloring, use `data-tier="N"` and define `--tier-1..10` tokens.

For HP bars that have a threshold:
- Three classes: `.hp-bar--good`, `.hp-bar--warn`, `.hp-bar--bad`.
- Or one class + a CSS custom property `--hp` consumed by an `hsl(...)`
  in the stylesheet.

### E. Cursor

```js
canvas.style.cursor = 'crosshair' / '';
```

**Locations**: `input.js` (8 hits), `main.js`, `ui/storageUI.js`,
`ui/turretUI.js`.

**Replacement**: `canvas.classList.toggle('is-placing', state.placingTurret
|| state.placingModule)`. Single CSS rule: `canvas.is-placing { cursor:
crosshair; }`.

### F. Inline styles inside HTML template strings

The bulk of the 427 hits. Examples:

```js
`<span class="tt-name" style="color:#cde;">${name}</span>`
`<button style="font-size:11px;color:#ffe066;background:rgba(60,45,0,0.45);
   border:1px solid #7a6010;border-radius:3px;padding:1px 5px;">×${qty}</button>`
```

**Replacement**: declare a class per recurring pattern.

Concrete classes to add to `styles/main.css`:

- `.tt-row`, `.tt-key`, `.tt-val`, `.tt-val--good`, `.tt-val--warn`,
  `.tt-val--bad` — tooltip rows.
- `.status-pill`, `.status-pill--good/--warn/--bad` — replaces every
  `<span style="color:#ff8a8a">…</span>` / `<span style="color:#6fff9a">`.
- `.qty-pill` — replaces the recurring "x{qty}" pill chip used in
  basePanel, fleet, panels.
- `.tier-pill[data-tier="N"]` — single rule with per-tier tokens.
- `.event-loss-row[data-trend="loss"]` etc. — event banner rows in
  `systems/events.js`.
- `.bp-craft-req--met / --unmet` — craft requirement chips (the `${met
  ? 'met' : 'unmet'}` template literal that all panels use).
- `.module-summary-table-row--highlight` — for the inline yellow
  highlights in `ui/basePanel.js`.

### G. Static layout/decoration baked into HTML

In `index.html`, every overlay carries the full `position:fixed; top:…;
right:…; background:…; z-index:…` chain inline. These are completely
static — copy/paste to CSS.

The four lines on `#fleet-filter-toggle`, `#log`, `#fleet-filters`,
`#sell-ship-*`, `#sell-overlay-confirm`, etc. (15 entries) are decoration
that should be classes.

The Settings overlay's `<label style="display:flex;align-items:center;
gap:8px;color:#cde;font-size:17px;cursor:pointer;">` repeats 3× — a
`.settings-row` class.

---

## Per-file catalogue

(File-level entries listed only when the count is non-trivial; trivial
single-line offenders are covered by the categories above.)

### `index.html` (32)

| Line | Element | Pattern | Replacement |
|------|---------|---------|-------------|
| 76 | `#turret-modal-overlay` | full overlay decoration | `.modal-overlay` class + `.is-visible` |
| 77 | `#turret-modal` | shell decoration | `.modal-shell` class |
| 82 | `#turret-modal-body` | padding | `.modal-body` class |
| 85 | `#storage-modal-overlay` | full overlay decoration | `.modal-overlay` class |
| 86 | `#storage-modal-host` | host layout | `.modal-host` class |
| 102 | `.adm-divider` | margin | utility margin class |
| 105 | `.adm-close-btn` wrapper | padding | `.adm-close-wrap` class |
| 121 | `#log` | display:none | default `.is-hidden` |
| 138-142 | fleet panel title row | layout | `.panel-title--with-button` class + `.spacer` |
| 147 | `#action-content` empty msg | color/size | `.action-empty` class |
| 169, 192, 222 | `.btn` modifier | `margin-top:14px;width:100%` | `.btn--full` class |
| 201-217 | settings rows | identical layout 3× | `.settings-row` + `.settings-row__label` |
| 229-234 | sell overlay parts | colors/layout | `.sell-overlay__name/value/actions` |
| 245 | currency popup close | margin+width | `.btn--full` |

### `src/ui/panels.js` (141)

The big one. Inline styles fall into:

1. **Resource icon spacing** — `style="margin-right:6px;position:relative;top:2px;"` × ~20. Replace with `.resource-icon` class.
2. **Status pills** — `<span style="color:#6fff9a;...">` × ~40. Replace with `.status-pill[data-status]`.
3. **Yellow highlight on numerics** — `style="color:#ffe066;"` × ~30. Replace with `.numeric-highlight` class.
4. **Tier pill backgrounds** — `style="background:${MINE_TIERS[t].color}..."` × ~15. Replace with `[data-tier]`.
5. **Section dividers** — `style="border-bottom:1px solid ${color}44;"` × ~5. Replace with `.section-divider[data-tier]`.
6. **Stats panel** — large block of stat-card styling. Replace with proper component classes.
7. **Craft cards** — recurring `style="margin-top:12px;border-color:#2a5090;"` etc. Replace with `.craft-card` variants.

### `src/ui/fleet.js` (84)

1. **Ship status badges** — `style="color:${statusColor}"` × ~20.
2. **Cargo bar fills** — `style="width:..."` × ~6 (Category C).
3. **Disposition warnings** — colored text in upgrade/sell rows × ~15.
4. **Inline `style="cssText"` chunks** in helper functions × ~10.
5. **Upgrade row backgrounds** — `style="background:rgba(...)"` × ~10.

### `src/ui/storageUI.js` (49)

Most concentrated in `renderModuleModal`. Pattern: every module-specific
section (storage / research lab / drone lab / power station / pole /
tower) has its own bar gradient, status pill, and section heading
inline. After Phase 3 of the modularization plan, each module type owns
its own template with proper classes.

The `modal.style.cssText = '...'` chunk in `ensureStorageModalWindow` is
the worst single offender — replace with `.storage-modal-window` class.

### `src/ui/turretUI.js` (39)

Same pattern as `storageUI.js` but for the turret modal. Health/power
bars, body decoration, status pill. Many were ported from `storageUI.js`.

### `src/input.js` (39)

Tooltip composition. Every hover branch builds an HTML string with
`<span style="color:..."></span>` for status colors. After the
`Tooltip` component lands, the tooltip body is per-entity HTML with
class-based pills.

### `src/systems/events.js` (13)

Event banner detail HTML. Static colors + dynamic HP bar width.
Replace with `.event-loss-row`, `.event-hp-bar` (using `--hp` custom
property), `.event-critical-alert` classes.

### `src/ui/basePanel.js` (14)

Tier pill + HP + shield bar widths + qty pills. Replace via
Categories C, D, F.

### `src/helpers.js` (13)

Tooltip helper output. After `Tooltip` component lands, these calls go
away.

### `src/main.js` (8)

Action panel patches (`routeError`, `holdingReason`, `statusEl.color`,
cargo bar width, "At Base" `<span style="color:#6fff9a">`).
Categories A, C, D.

---

## Tokens to introduce in `styles/main.css`

```css
:root {
  /* Status colors */
  --color-good: #6fff9a;
  --color-warn: #ffe066;
  --color-bad:  #ff8a8a;
  --color-ok:   #4d8;
  --color-warn-soft: #fa4;
  --color-bad-strong: #f44;

  /* Resource accents */
  --color-mining: #60d090;
  --color-transport: #80d0ff;
  --color-combat: #ff6060;
  --color-garrison: #ff8c40;

  /* Tier colors (mirror MINE_TIERS) */
  --tier-1:  #808090;
  --tier-2:  #4acd7a;
  --tier-3:  #4a90e2;
  --tier-4:  #9b6dff;
  --tier-5:  #ffd700;
  --tier-6:  #ff8c40;
  --tier-7:  #ff60b0;
  --tier-8:  #00e5ff;
  --tier-9:  #ff4040;
  --tier-10: #ffffff;

  /* Card surfaces */
  --surface-deep: #0a1428;
  --surface-deeper: #060c1a;
  --surface-card: rgba(10, 20, 50, 0.6);
  --surface-card-strong: rgba(10, 20, 50, 0.85);
  --border-cyan: #2a5090;
}
```

JS that needs to set per-tier colour writes `data-tier="N"`; CSS does:

```css
[data-tier="1"]  { --accent: var(--tier-1); }
[data-tier="2"]  { --accent: var(--tier-2); }
/* ... */
```

And rules like `.tier-pill { color: var(--accent); }` follow.

---

## Notes

- Many `style="color:..."` calls are duplicated literally — same hex,
  same font, same padding, repeated 10+ times. Once a class is added,
  one Find-All-Replace removes them.
- A single class can serve multiple offenders. For example,
  `.status-pill[data-status="good"]` collapses ~40 inline color
  declarations across panels, fleet, storage modal, turret modal.
- After Phase 3 of the modularization plan (View classes), most of the
  inline styles disappear simply because the component class names are
  hardcoded inside view classes instead of being assembled by string
  concatenation.
