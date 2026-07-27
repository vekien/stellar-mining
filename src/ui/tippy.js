// ============================================================
// TIPPY.JS WRAPPER — zero-delay UI tooltips
// ============================================================

const DEFAULTS = {
  allowHTML: true,
  delay: [0, 0],
  duration: [80, 60],
  animation: 'fade',
  theme: 'stellar',
  arrow: true,
  maxWidth: 320,
  appendTo: () => document.body,
  zIndex: 30000,
};

function getTippy() {
  return typeof window !== 'undefined' ? window.tippy : null;
}

/** Bind or update a tippy instance on an element. Pass null/'' to destroy. */
export function bindTippy(el, content, opts = {}) {
  if (!el) return null;
  const tippy = getTippy();
  if (!tippy) return null;

  const html = content == null ? '' : String(content);
  if (!html) {
    if (el._tippy) {
      el._tippy.destroy();
    }
    return null;
  }

  if (el._tippy) {
    el._tippy.setContent(html);
    if (opts.placement) el._tippy.setProps({ placement: opts.placement });
    return el._tippy;
  }

  return tippy(el, {
    ...DEFAULTS,
    content: html,
    ...opts,
  });
}

export function destroyTippy(el) {
  if (el?._tippy) el._tippy.destroy();
}

/** Bind tippy on all descendants with data-tippy-content (skips already bound). */
export function bindTippyIn(root) {
  if (!root) return;
  root.querySelectorAll('[data-tippy-content]').forEach((el) => {
    const content = el.getAttribute('data-tippy-content');
    if (content) bindTippy(el, content);
  });
}

/** One-shot hover tooltip from a mouse event (fallback when no element binding). */
export function showTippyAtEvent(e, content) {
  const el = e?.currentTarget || e?.target;
  if (el && el.nodeType === 1) {
    bindTippy(el, content);
    if (el._tippy && !el._tippy.state.isVisible) el._tippy.show();
  }
}

window.bindTippy = bindTippy;
window.destroyTippy = destroyTippy;
window.bindTippyIn = bindTippyIn;
