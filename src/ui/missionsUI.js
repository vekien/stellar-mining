// ============================================================
// MISSION UI — Command tab, HUD tracker, beacon modal
// ============================================================
import { state } from '../state.js';
import { fmt } from '../helpers.js';
import {
  getMissionsUiModel,
  getActiveMission,
  getMissionBeacon,
  startBeaconDecrypt,
  getBeaconDecryptPercent,
  canRetrieveBeaconItem,
  assignShipRetrieveBeacon,
  ensureMissions,
} from '../systems/missions.js';
import { getKeyItemDef } from '../data/keyItems.js';
import { hasKeyItem } from '../systems/keyItems.js';
import {
  centerFloatingWindow,
  bringFloatingToFront,
  initFloatingDrag,
} from './floatingWindow.js';

let _missionPanelSig = '';
let _missionTrackerSig = '';

function flattenMissionObjectives(def) {
  const list = [];
  for (const stage of def.stages || []) {
    for (const obj of stage.objectives || []) list.push(obj);
  }
  return list;
}

function isMissionObjDone(obj, rt) {
  if (!obj || !rt) return false;
  if (rt.done?.[obj.id]) return true;
  if (obj.id === 'await_sera' && rt.flags?.storyHang) return true;
  return false;
}

/** Full mission objective chain (all stages). */
function missionObjectiveChainHtml(def, rt) {
  const items = flattenMissionObjectives(def);
  if (!items.length) return '';
  let foundCurrent = false;
  return items.map((obj, i) => {
    const done = isMissionObjDone(obj, rt);
    let cls = 'mission-obj';
    if (done) cls += ' done';
    else if (!foundCurrent) {
      cls += ' current';
      foundCurrent = true;
    } else {
      cls += ' locked';
    }
    const last = i === items.length - 1;
    const check = done
      ? '✓'
      : (cls.includes('current') ? '<span class="ms-icon">radio_button_checked</span>' : '<span class="ms-icon">circle</span>');
    return `
      <div class="${cls}">
        <div class="mission-obj-rail" aria-hidden="true">
          <span class="mission-obj-check">${check}</span>
          ${last ? '' : '<span class="mission-obj-link"></span>'}
        </div>
        <span class="mission-obj-lab">${obj.label}</span>
      </div>`;
  }).join('');
}

export function renderMissionsPanel(host) {
  if (!host) return;
  host.innerHTML = `<div id="mission-panel-root" class="mission-panel-root"></div>`;
  _missionPanelSig = '';
  patchMissionsPanel(true);
}

export function patchMissionsPanel(force = false) {
  ensureMissions();
  const root = document.getElementById('mission-panel-root');
  if (!root) return;
  const model = getMissionsUiModel();
  const active = model.active[0] || null;
  const decryptPct = state.missionBeacon?.phase === 'decrypting' ? getBeaconDecryptPercent() : 0;
  const sig = active
    ? `${active.def.id}|${active.rt.status}|${active.rt.stageIndex}|${JSON.stringify(active.rt.done)}|${state.missionBeacon?.phase||''}|${decryptPct}|${active.rt.flags?.sera_analyzing?1:0}`
    : `none|${model.lockedPreview ? 1 : 0}|bl:${state.base?.level||1}`;
  if (!force && sig === _missionPanelSig) return;
  _missionPanelSig = sig;

  if (model.lockedPreview || (!active && (state.base?.level || 1) < 3)) {
    root.innerHTML = `
      <div class="mission-locked">
        <div class="mission-locked-ico"><span class="ms-icon ms-icon-fill">flag</span></div>
        <div class="mission-locked-title">MAIN SCENARIO</div>
        <div class="mission-locked-desc">
          Your first mission unlocks when the base reaches <strong>Tier 3</strong>.
          Develop the station to open the story track.
        </div>
        <div class="mission-locked-note">For now you’ll gain your first mission once your base develops.</div>
      </div>`;
    return;
  }

  if (!active) {
    root.innerHTML = `<div class="tx-empty">No active mission.</div>`;
    return;
  }

  const { def, rt } = active;
  const stage = def.stages[Math.min(rt.stageIndex, def.stages.length - 1)];
  // Command panel gets the long lore blurb
  const loreRaw = String(def.lore || def.desc || '').trim();
  const loreHtml = loreRaw
    .split(/\n\n+/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join('');

  root.innerHTML = `
    <div class="mission-detail">
      <div class="mission-detail-head">
        <span class="mission-kind">MISSION</span>
        <div class="mission-detail-name">${def.name}</div>
        ${stage?.title ? `<div class="mission-detail-meta">${stage.title}</div>` : ''}
      </div>
      <div class="mission-detail-desc">${loreHtml || def.desc || ''}</div>
      <div class="mission-panel-block">
        <div class="mission-panel-lab">OBJECTIVES</div>
        <div class="mission-objs mission-obj-chain">${missionObjectiveChainHtml(def, rt)}</div>
      </div>
      ${hasKeyItem('data_box') ? `
        <div class="mission-panel-block key">
          <div class="mission-panel-lab">KEY ITEMS</div>
          <div class="mission-key-item">
            <span class="ms-icon ms-icon-fill" style="color:#5dffa0">database</span>
            <div>
              <div class="mission-key-name">Data Box</div>
              <div class="mission-key-desc">Secured at base · pending analysis</div>
            </div>
          </div>
        </div>` : ''}
    </div>`;
}

export function patchMissionTracker(force = false) {
  ensureMissions();
  let el = document.getElementById('mission-tracker');
  if (!el) return;
  const active = getActiveMission();
  const decryptPct = state.missionBeacon?.phase === 'decrypting' ? getBeaconDecryptPercent() : 0;
  const sig = active
    ? `${active.def.id}|${active.rt.stageIndex}|${JSON.stringify(active.rt.done)}|${state.missionBeacon?.phase||''}|${decryptPct}|${active.rt.flags?.sera_analyzing?1:0}`
    : 'none';
  if (!force && sig === _missionTrackerSig) return;
  _missionTrackerSig = sig;

  if (!active) {
    el.classList.add('mt-hidden');
    el.innerHTML = '';
    window.syncLeftHudUi?.();
    return;
  }
  el.classList.remove('mt-hidden');
  const { def, rt } = active;
  const stage = def.stages[Math.min(rt.stageIndex, def.stages.length - 1)];
  const objs = missionObjectiveChainHtml(def, rt);
  // Side tracker gets the short blurb only
  const shortDesc = String(def.desc || '').trim();
  el.innerHTML = `
    <div class="mt-shell">
      <div class="mt-sheen" aria-hidden="true"></div>
      <div class="mt-top-row">
        <span class="mt-kind">MISSION</span>
        <button type="button" class="mt-collapse-btn" onclick="event.stopPropagation();collapseLeftHud()" aria-label="Hide mission panel">
          <span class="ms-icon">left_panel_close</span>
        </button>
      </div>
      <button type="button" class="mt-card" onclick="window._pendingCmdTab='missions';openHdrPanel('command')">
        <div class="mt-title">${def.name}</div>
        ${stage?.title ? `<div class="mt-stage">${stage.title}</div>` : ''}
        ${shortDesc ? `<div class="mt-lore"><p>${shortDesc}</p></div>` : ''}
        <div class="mt-obj-panel">
          <div class="mt-obj-lab">OBJECTIVES</div>
          <div class="mt-objs mission-obj-chain">${objs}</div>
        </div>
      </button>
    </div>`;
  window.syncLeftHudUi?.();
}

// ── Beacon modal ─────────────────────────────────────────────

const BEACON_LAYOUT_KEY = 'beacon';
let _beaconModalInited = false;

function initBeaconModalChrome() {
  if (_beaconModalInited) return;
  const overlay = document.getElementById('beacon-modal-overlay');
  const modal = document.getElementById('beacon-modal');
  if (!overlay || !modal) return;
  initFloatingDrag(modal, overlay, {
    handleSelector: '.beacon-modal-drag-handle',
    layoutKey: BEACON_LAYOUT_KEY,
    isActive: () => overlay.style.display === 'flex',
  });
  _beaconModalInited = true;
}

export function openBeaconModal() {
  initBeaconModalChrome();
  const overlay = document.getElementById('beacon-modal-overlay');
  const modal = document.getElementById('beacon-modal');
  if (!overlay || !modal) return;
  overlay.style.display = 'flex';
  const place = () => centerFloatingWindow(overlay, modal, BEACON_LAYOUT_KEY);
  place();
  requestAnimationFrame(() => {
    place();
    requestAnimationFrame(place);
  });
  bringFloatingToFront(modal);
  patchBeaconModal();
}

export function closeBeaconModal() {
  const overlay = document.getElementById('beacon-modal-overlay');
  if (overlay) overlay.style.display = 'none';
  state.selectedBeacon = false;
  stopBeaconCliFeed();
}

export function patchBeaconModal() {
  const body = document.getElementById('beacon-modal-body');
  if (!body) return;
  const b = state.missionBeacon;
  if (!b || b.phase === 'claimed') {
    body.innerHTML = `<div class="tx-empty">Beacon offline.</div>`;
    return;
  }

  if (b.phase === 'idle') {
    body.innerHTML = `
      <div class="beacon-modal-content">
        <div class="beacon-hero">
          <div class="beacon-pulse-ring"></div>
          <span class="ms-icon ms-icon-fill beacon-hero-ico">sensors</span>
        </div>
        <div class="beacon-title">DISTRESS BEACON</div>
        <div class="beacon-sub">Emergency band · partial lock</div>
        <div class="beacon-msg corrupted">
          <div class="beacon-msg-lab">INCOMING TRANSMISSION</div>
          <div class="beacon-msg-body">
            :: CRASH / SURVIVORS? // COORD—█▓░ // DATA_VAULT SEALED<br>
            REQUEST: RECOVERY PROTOCOL — KEY CONTAINER ONLINE<br>
            <span class="glitch">████ DECRYPT REQUIRED ████</span>
          </div>
        </div>
        <button type="button" class="btn primary beacon-decrypt-btn" onclick="startBeaconDecryptUi()">
          <span class="ms-icon">lock_open</span> DECRYPT &amp; DEBUG
        </button>
      </div>`;
    return;
  }

  if (b.phase === 'decrypting') {
    const pct = getBeaconDecryptPercent();
    // Live-update only — keep CLI DOM alive
    const existing = body.querySelector('.beacon-decrypt-live');
    if (existing) {
      const tEl = existing.querySelector('.beacon-timer');
      const bar = existing.querySelector('.beacon-bar i');
      if (tEl) tEl.textContent = `${pct}%`;
      if (bar) bar.style.width = `${pct}%`;
      if (!_cliTimer && document.getElementById('beacon-cli-scroll')) {
        scheduleNextCliLine();
      }
      return;
    }
    body.innerHTML = `
      <div class="beacon-modal-content beacon-decrypt-live">
        <div class="beacon-hero decrypting">
          <span class="ms-icon ms-icon-fill beacon-hero-ico">memory</span>
        </div>
        <div class="beacon-title">DECRYPTING</div>
        <div class="beacon-sub">Brute-forcing payload layers…</div>
        <div class="beacon-timer">${pct}%</div>
        <div class="beacon-bar"><i style="width:${pct}%"></i></div>
        <div class="beacon-cli" id="beacon-cli" aria-hidden="true">
          <div class="beacon-cli-head">
            <span class="beacon-cli-dot"></span>
            <span class="beacon-cli-dot"></span>
            <span class="beacon-cli-dot"></span>
            <span class="beacon-cli-title">sera@hyperion:~ decrypt_shell</span>
          </div>
          <div class="beacon-cli-scroll" id="beacon-cli-scroll"></div>
        </div>
      </div>`;
    startBeaconCliFeed();
    return;
  }

  if (b.phase === 'ready') {
    const item = getKeyItemDef('data_box');
    const ico = item?.icon || 'database';
    const name = item?.name || 'Data Box';
    const desc = item?.desc || '';
    body.innerHTML = `
      <div class="beacon-modal-content beacon-ready">
        <div class="beacon-title">DECRYPT COMPLETE</div>
        <div class="beacon-sub">Recovery capsule unlocked</div>
        <div class="beacon-item-card">
          <div class="beacon-item-sheen" aria-hidden="true"></div>
          <div class="beacon-item-lab">KEY ITEM · PAYLOAD</div>
          <div class="beacon-item-body">
            <div class="beacon-item-icon-wrap" aria-hidden="true">
              <span class="beacon-item-icon-glow"></span>
              <span class="ms-icon ms-icon-fill beacon-item-icon">${ico}</span>
            </div>
            <div class="beacon-item-meta">
              <div class="beacon-item-name">${name}</div>
              <div class="beacon-item-rarity">Sealed · Mission Critical</div>
              <div class="beacon-item-desc">${desc}</div>
            </div>
          </div>
          <div class="beacon-item-footer">
            <span class="ms-icon">inventory_2</span>
            Added to mission inventory when delivered to base
          </div>
        </div>
      </div>`;
  }
}

// ── Cosmetic decrypt CLI (fake) ──────────────────────────────
const BEACON_CLI_SCRIPT = [
  { t: 'cmd', text: 'mount /dev/beacon0 /mnt/distress' },
  { t: 'ok', text: 'mounted read-only · fs=EMERG_VAULT' },
  { t: 'cmd', text: 'hexdump -n 64 payload.bin | head' },
  { t: 'out', text: '0000  7f 45 4c 46 02 01 01 00  ..ELF....' },
  { t: 'out', text: '0010  00 00 00 00 00 00 00 00  ........' },
  { t: 'cmd', text: 'sera_decrypt --layer 1 --mode brute' },
  { t: 'out', text: 'entropy 7.92 · candidates 2.1e6/s' },
  { t: 'ok', text: 'layer 1 cracked · keyspace reduced 18%' },
  { t: 'cmd', text: 'strings payload.bin | grep -i "coord"' },
  { t: 'out', text: 'COORD_LOCK=██.██ / ░░.░░' },
  { t: 'warn', text: 'partial match · checksum dirty' },
  { t: 'cmd', text: 'sera_decrypt --layer 2 --seed recovered' },
  { t: 'out', text: 'spinning polybius matrix…' },
  { t: 'ok', text: 'layer 2 open · nested container found' },
  { t: 'cmd', text: 'ls -la /mnt/distress/vault/' },
  { t: 'out', text: 'drwx------  data_box.seal' },
  { t: 'out', text: '-rw-------  manifest.sig' },
  { t: 'cmd', text: 'verify manifest.sig --pubkey sera_chain' },
  { t: 'warn', text: 'signature stale · continuing offline' },
  { t: 'cmd', text: 'sera_decrypt --layer 3 --aggressive' },
  { t: 'out', text: 'nonce collision @ 0x4F2A…' },
  { t: 'ok', text: 'layer 3 soft-open · integrity 61%' },
  { t: 'cmd', text: 'cat /proc/signal/integrity' },
  { t: 'out', text: 'SNR +2.4 dB · packet loss 11%' },
  { t: 'cmd', text: 'unwrap data_box.seal --out /tmp/box' },
  { t: 'out', text: 'cipher: XChaCha20-Poly1305' },
  { t: 'ok', text: 'header valid · body still locked' },
  { t: 'cmd', text: 'sera_decrypt --layer 4 --parallel 8' },
  { t: 'out', text: 'workers online · ETA drifting' },
  { t: 'ok', text: 'layer 4 hinge broken' },
  { t: 'cmd', text: 'audit trail --since boot' },
  { t: 'out', text: 'origin: unknown · hops ≥ 3' },
  { t: 'warn', text: 'tamper flags: 2 minor' },
  { t: 'cmd', text: 'sera_decrypt --finalize' },
  { t: 'out', text: 'assembling cleartext map…' },
  { t: 'ok', text: 'payload map stable · stand by' },
  { t: 'cmd', text: 'tail -f /var/log/decrypt.log' },
  { t: 'out', text: '… still writing …' },
  { t: 'out', text: '… key schedule rotating …' },
  { t: 'ok', text: 'checkpoint saved' },
];

let _cliTimer = null;
let _cliIdx = 0;

function stopBeaconCliFeed() {
  if (_cliTimer) {
    clearTimeout(_cliTimer);
    _cliTimer = null;
  }
}

function cliLineHtml(entry) {
  if (entry.t === 'cmd') {
    return `<div class="bcli-line cmd"><span class="bcli-ps">$</span> ${entry.text}</div>`;
  }
  if (entry.t === 'ok') {
    return `<div class="bcli-line ok"><span class="bcli-tag">ok</span> ${entry.text}</div>`;
  }
  if (entry.t === 'warn') {
    return `<div class="bcli-line warn"><span class="bcli-tag">!!</span> ${entry.text}</div>`;
  }
  return `<div class="bcli-line out">${entry.text}</div>`;
}

function appendBeaconCliLine(entry) {
  const scroll = document.getElementById('beacon-cli-scroll');
  if (!scroll) return;
  scroll.insertAdjacentHTML('beforeend', cliLineHtml(entry));
  // Keep last ~14 lines visible
  while (scroll.children.length > 14) scroll.removeChild(scroll.firstChild);
  scroll.scrollTop = scroll.scrollHeight;
}

function scheduleNextCliLine() {
  stopBeaconCliFeed();
  if (state.missionBeacon?.phase !== 'decrypting') return;
  if (!document.getElementById('beacon-cli-scroll')) return;
  const entry = BEACON_CLI_SCRIPT[_cliIdx % BEACON_CLI_SCRIPT.length];
  _cliIdx += 1;
  appendBeaconCliLine(entry);
  // Commands slightly slower; outputs snappier
  const delay = entry.t === 'cmd'
    ? 700 + Math.random() * 900
    : 280 + Math.random() * 520;
  _cliTimer = setTimeout(scheduleNextCliLine, delay);
}

function startBeaconCliFeed() {
  stopBeaconCliFeed();
  _cliIdx = 0;
  const scroll = document.getElementById('beacon-cli-scroll');
  if (scroll) scroll.innerHTML = '';
  // Seed a couple lines immediately
  appendBeaconCliLine({ t: 'out', text: 'session opened · channel EMERG-7' });
  appendBeaconCliLine({ t: 'cmd', text: 'whoami' });
  appendBeaconCliLine({ t: 'out', text: 'sera · chief science · hyperion' });
  _cliIdx = 0;
  _cliTimer = setTimeout(scheduleNextCliLine, 500);
}

window.openBeaconModal = openBeaconModal;
window.closeBeaconModal = closeBeaconModal;
window.patchBeaconModal = patchBeaconModal;
window.patchMissionsPanel = patchMissionsPanel;
window.patchMissionTracker = patchMissionTracker;
window.startBeaconDecryptUi = function() {
  startBeaconDecrypt();
  stopBeaconCliFeed();
  patchBeaconModal();
};
window.assignShipRetrieveBeacon = function(id) {
  assignShipRetrieveBeacon(id);
  if (typeof window.patchSelectedShipModal === 'function') window.patchSelectedShipModal();
  else if (typeof window.openShipModal === 'function') {
    /* leave modal open */
  }
};

// Live decrypt timer while modal open
setInterval(() => {
  const overlay = document.getElementById('beacon-modal-overlay');
  if (overlay?.style.display === 'flex' && state.missionBeacon?.phase === 'decrypting') {
    patchBeaconModal();
    // Resume CLI if DOM was rebuilt elsewhere
    if (document.getElementById('beacon-cli-scroll') && !_cliTimer) {
      scheduleNextCliLine();
    }
  } else if (state.missionBeacon?.phase !== 'decrypting') {
    stopBeaconCliFeed();
  }
  if (state.missionBeacon?.phase === 'decrypting') {
    window.patchMissionsPanel?.();
    window.patchMissionTracker?.();
  }
}, 500);
