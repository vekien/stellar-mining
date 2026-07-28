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
  hideOnClick: true,
  interactive: false,
};

function getTippy() {
  return typeof window !== 'undefined' ? window.tippy : null;
}

/** Bind or update a tippy instance on an element. Pass null/'' to destroy. */
export function bindTippy(el, content, opts = {}) {
  if (!el) return null;
  const tippyFn = getTippy();
  if (!tippyFn) return null;

  const html = content == null ? '' : String(content);
  if (!html) {
    destroyTippy(el);
    return null;
  }

  if (el._tippy) {
    // Avoid thrashing content updates every frame while visible
    if (el._tippy.props.content !== html) el._tippy.setContent(html);
    if (opts.placement) el._tippy.setProps({ placement: opts.placement });
    return el._tippy;
  }

  return tippyFn(el, {
    ...DEFAULTS,
    content: html,
    onHidden(instance) {
      // Ensure popper node is cleaned if reference was removed mid-show
      if (!instance.reference?.isConnected) instance.destroy();
    },
    ...opts,
  });
}

export function destroyTippy(el) {
  if (!el?._tippy) return;
  try {
    el._tippy.hide();
    el._tippy.destroy();
  } catch (_) {
    /* ignore */
  }
}

/** Destroy all tippies under a root (and hide any orphaned poppers). */
export function destroyTippiesIn(root) {
  if (!root) return;
  root.querySelectorAll('[data-tippy-content], [data-tippy-root]').forEach((el) => destroyTippy(el));
  // Also elements that have instances but may not still carry the attribute
  root.querySelectorAll('*').forEach((el) => {
    if (el._tippy) destroyTippy(el);
  });
}

/** Hide every visible tippy on the page (stuck-tooltip recovery). */
export function hideAllTippies() {
  const tippyFn = getTippy();
  // Hide any open tippy instances tippy tracks
  document.querySelectorAll('[data-tippy-root]').forEach((popper) => {
    const id = popper.id;
    // tippy v6 stores instance on reference; also remove orphan poppers
    if (popper._tippy) {
      try { popper._tippy.hide(); } catch (_) { /* ignore */ }
    }
  });
  document.querySelectorAll('*').forEach((el) => {
    if (el._tippy?.state?.isVisible) {
      try { el._tippy.hide(); } catch (_) { /* ignore */ }
    }
  });
  // Remove orphaned tippy boxes left in body after reference destruction
  document.querySelectorAll('body > [data-tippy-root]').forEach((node) => {
    const ref = node._tippy?.reference;
    if (!ref || !ref.isConnected) {
      try {
        if (node._tippy) node._tippy.destroy();
        else node.remove();
      } catch (_) {
        node.remove();
      }
    }
  });
  // Legacy floating tooltip
  const legacy = document.getElementById('tooltip');
  if (legacy) {
    legacy.style.display = 'none';
    legacy.classList.remove('tt-compact');
  }
}

/** Bind tippy on all descendants with data-tippy-content. */
export function bindTippyIn(root) {
  if (!root) return;
  root.querySelectorAll('[data-tippy-content]').forEach((el) => {
    const content = el.getAttribute('data-tippy-content');
    if (content) bindTippy(el, content);
  });
}

/** Safe innerHTML replace that tears down tippies first. */
export function setHtmlDestroyingTippies(el, html) {
  if (!el) return;
  if (el.innerHTML === html) return;
  destroyTippiesIn(el);
  hideAllTippies();
  el.innerHTML = html;
}

window.bindTippy = bindTippy;
window.destroyTippy = destroyTippy;
window.destroyTippiesIn = destroyTippiesIn;
window.hideAllTippies = hideAllTippies;
window.bindTippyIn = bindTippyIn;
