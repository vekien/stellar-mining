// ============================================================
// FLOATING WINDOW — shared drag / resize / z-order helpers
// ============================================================

/** Hard cap on floating window height (px). */
export const FLOATING_MAX_HEIGHT = 1000;

let _topZ = 100;
/** @type {Map<string, { left: number, top: number, width?: number, height?: number, moved: boolean }>} */
const _layouts = new Map();

function clampFloatingHeight(h, minH = 0) {
  const n = Number(h);
  if (!Number.isFinite(n)) return minH || undefined;
  return Math.max(minH || 0, Math.min(FLOATING_MAX_HEIGHT, Math.round(n)));
}

export function bringFloatingToFront(modal) {
  if (!modal) return;
  _topZ += 1;
  modal.style.zIndex = String(_topZ);
}

export function clampFloatingPosition(overlay, modal, left, top) {
  if (!overlay || !modal) return { left, top };
  const overlayRect = overlay.getBoundingClientRect();
  const modalRect = modal.getBoundingClientRect();
  const maxLeft = Math.max(0, overlayRect.width - modalRect.width);
  const maxTop = Math.max(0, overlayRect.height - modalRect.height);
  return {
    left: Math.max(0, Math.min(maxLeft, left)),
    top: Math.max(0, Math.min(maxTop, top)),
  };
}

function measureBox(el) {
  if (!el) return { w: 0, h: 0 };
  const rect = el.getBoundingClientRect();
  let w = rect.width || el.clientWidth || el.offsetWidth || 0;
  let h = rect.height || el.clientHeight || el.offsetHeight || 0;
  if (!w || !h) {
    const cs = getComputedStyle(el);
    if (!w) w = parseFloat(cs.width) || 0;
    if (!h) h = parseFloat(cs.height) || 0;
  }
  return { w, h };
}

export function getCenteredPosition(overlay, modal) {
  if (!overlay || !modal) return { left: 24, top: 24 };
  const o = measureBox(overlay);
  const m = measureBox(modal);
  // Fallbacks when measured during a hidden frame
  const ow = o.w || window.innerWidth || 1200;
  const oh = o.h || window.innerHeight || 800;
  const mw = m.w || 920;
  const mh = m.h || 480;
  return {
    left: Math.max(0, Math.round((ow - mw) / 2)),
    top: Math.max(0, Math.round((oh - mh) / 2)),
  };
}

/** Center unless the user has moved this window (layoutKey). */
export function centerFloatingWindow(overlay, modal, key = null) {
  if (!overlay || !modal) return;
  if (modal.dataset.moved === '1') {
    applyFloatingPosition(overlay, modal);
    return;
  }
  const saved = key ? _layouts.get(key) : null;
  if (saved?.moved) {
    placeFloatingWindow(overlay, modal, key);
    return;
  }
  modal.dataset.moved = '0';
  const center = getCenteredPosition(overlay, modal);
  applyFloatingPosition(overlay, modal, center.left, center.top);
}

export function saveFloatingLayout(key, modal) {
  if (!key || !modal) return;
  const left = Number(modal.dataset.left);
  const top = Number(modal.dataset.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return;
  const width = modal.dataset.width ? Number(modal.dataset.width) : Math.round(modal.getBoundingClientRect().width);
  const height = modal.dataset.height ? Number(modal.dataset.height) : Math.round(modal.getBoundingClientRect().height);
  _layouts.set(key, {
    left,
    top,
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
    moved: modal.dataset.moved === '1',
  });
}

export function clearFloatingLayout(key) {
  if (key) _layouts.delete(key);
}

/**
 * Place modal: saved moved position if any, otherwise centered.
 * Optionally restores saved size.
 */
export function placeFloatingWindow(overlay, modal, key = null) {
  if (!overlay || !modal) return;
  const saved = key ? _layouts.get(key) : null;

  if (saved?.width) {
    modal.style.width = `${saved.width}px`;
    modal.dataset.width = String(saved.width);
  }
  if (saved?.height) {
    const h = clampFloatingHeight(saved.height) ?? saved.height;
    modal.style.height = `${h}px`;
    modal.dataset.height = String(h);
    modal.style.maxHeight = `${FLOATING_MAX_HEIGHT}px`;
  } else {
    modal.style.maxHeight = `${FLOATING_MAX_HEIGHT}px`;
  }

  if (saved?.moved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    modal.dataset.moved = '1';
    applyFloatingPosition(overlay, modal, saved.left, saved.top);
    return;
  }

  modal.dataset.moved = '0';
  const center = getCenteredPosition(overlay, modal);
  applyFloatingPosition(overlay, modal, center.left, center.top);
}

export function applyFloatingPosition(overlay, modal, left = null, top = null) {
  if (!overlay || !modal) return;
  if (left === null || top === null) {
    if (Number.isFinite(Number(modal.dataset.left)) && Number.isFinite(Number(modal.dataset.top))) {
      left = Number(modal.dataset.left);
      top = Number(modal.dataset.top);
    } else {
      const center = getCenteredPosition(overlay, modal);
      left = center.left;
      top = center.top;
    }
  }
  const next = clampFloatingPosition(overlay, modal, left, top);
  modal.dataset.left = String(next.left);
  modal.dataset.top = String(next.top);
  modal.style.left = `${next.left}px`;
  modal.style.top = `${next.top}px`;
}

/**
 * @param {HTMLElement} modal
 * @param {HTMLElement} overlay
 * @param {{ handleSelector?: string, onFocus?: () => void, isActive?: () => boolean, layoutKey?: string }} opts
 */
export function initFloatingDrag(modal, overlay, opts = {}) {
  const handleSelector = opts.handleSelector || '.panel-shell-head, .floating-drag-handle';
  const handle = modal?.querySelector(handleSelector);
  if (!overlay || !modal || !handle || modal.dataset.dragReady === '1') return;
  modal.dataset.dragReady = '1';
  let dragging = false;
  let didDrag = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.panel-shell-close, .panel-resize-handle')) return;
    const modalRect = modal.getBoundingClientRect();
    dragging = true;
    didDrag = false;
    offsetX = event.clientX - modalRect.left;
    offsetY = event.clientY - modalRect.top;
    bringFloatingToFront(modal);
    opts.onFocus?.();
    document.body.style.userSelect = 'none';
    event.preventDefault();
  });

  modal.addEventListener('mousedown', () => {
    bringFloatingToFront(modal);
    opts.onFocus?.();
  });

  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    didDrag = true;
    const overlayRect = overlay.getBoundingClientRect();
    applyFloatingPosition(
      overlay,
      modal,
      event.clientX - overlayRect.left - offsetX,
      event.clientY - overlayRect.top - offsetY
    );
    event.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    if (didDrag) {
      modal.dataset.moved = '1';
      if (opts.layoutKey) saveFloatingLayout(opts.layoutKey, modal);
    }
  });

  window.addEventListener('resize', () => {
    const active = opts.isActive ? opts.isActive() : true;
    if (active) applyFloatingPosition(overlay, modal);
  });
}

/**
 * Bottom-right resize anchor.
 * @param {HTMLElement} modal
 * @param {HTMLElement} overlay
 * @param {{ minW?: number, minH?: number, isActive?: () => boolean, layoutKey?: string }} opts
 */
export function initFloatingResize(modal, overlay, opts = {}) {
  if (!modal || !overlay || modal.dataset.resizeReady === '1') return;
  modal.dataset.resizeReady = '1';
  const minW = opts.minW ?? 360;
  const minH = opts.minH ?? 220;
  const maxHeightCap = opts.maxH ?? FLOATING_MAX_HEIGHT;
  modal.style.maxHeight = `${maxHeightCap}px`;

  // Clamp any pre-set height above the cap
  if (modal.dataset.height) {
    const h = clampFloatingHeight(modal.dataset.height, minH);
    if (h != null) {
      modal.style.height = `${h}px`;
      modal.dataset.height = String(h);
    }
  }

  let handle = modal.querySelector('.panel-resize-handle');
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'panel-resize-handle';
    handle.title = 'Resize';
    modal.appendChild(handle);
  }

  let resizing = false;
  let didResize = false;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;

  handle.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const rect = modal.getBoundingClientRect();
    resizing = true;
    didResize = false;
    startX = event.clientX;
    startY = event.clientY;
    startW = rect.width;
    startH = rect.height;
    bringFloatingToFront(modal);
    document.body.style.userSelect = 'none';
    event.preventDefault();
    event.stopPropagation();
  });

  window.addEventListener('mousemove', (event) => {
    if (!resizing) return;
    didResize = true;
    const overlayRect = overlay.getBoundingClientRect();
    const maxW = Math.max(minW, overlayRect.width - Number(modal.dataset.left || 0));
    const maxH = Math.max(
      minH,
      Math.min(maxHeightCap, overlayRect.height - Number(modal.dataset.top || 0))
    );
    const nextW = Math.max(minW, Math.min(maxW, startW + (event.clientX - startX)));
    const nextH = Math.max(minH, Math.min(maxH, startH + (event.clientY - startY)));
    modal.style.width = `${Math.round(nextW)}px`;
    modal.style.height = `${Math.round(nextH)}px`;
    modal.dataset.width = String(Math.round(nextW));
    modal.dataset.height = String(Math.round(nextH));
    applyFloatingPosition(overlay, modal);
    event.preventDefault();
  });

  window.addEventListener('mouseup', () => {
    if (!resizing) return;
    resizing = false;
    document.body.style.userSelect = '';
    if (didResize) {
      modal.dataset.moved = '1';
      if (opts.layoutKey) saveFloatingLayout(opts.layoutKey, modal);
    }
  });

  window.addEventListener('resize', () => {
    const active = opts.isActive ? opts.isActive() : true;
    if (!active) return;
    if (modal.dataset.height) {
      const h = clampFloatingHeight(modal.dataset.height, minH);
      if (h != null) {
        modal.style.height = `${h}px`;
        modal.dataset.height = String(h);
      }
    }
    applyFloatingPosition(overlay, modal);
  });
}

export function ensureResizeHandle(modal) {
  if (!modal || modal.querySelector('.panel-resize-handle')) return;
  const handle = document.createElement('div');
  handle.className = 'panel-resize-handle';
  handle.title = 'Resize';
  modal.appendChild(handle);
}
