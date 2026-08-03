// ============================================================
// GLOBAL CRAFT QUEUE — concurrent jobs capped by base rank
// ============================================================
import { state, saveGame } from '../state.js';
import { refresh } from '../ui/refresh.js';

const _timeouts = {};

export function getCraftQueueCap() {
  return Math.max(1, Math.min(10, Math.floor(state.base?.level || 1)));
}

export function getCraftQueue() {
  if (!Array.isArray(state.craftQueue)) state.craftQueue = [];
  return state.craftQueue;
}

export function getActiveCraftJobs() {
  const now = Date.now();
  return getCraftQueue().filter((j) => j && now < (j.endsAt || 0));
}

export function countCraftJobs(kind = null, recipeId = null) {
  return getActiveCraftJobs().filter((j) => {
    if (kind && j.kind !== kind) return false;
    if (recipeId != null && j.recipeId !== recipeId) return false;
    return true;
  }).length;
}

export function canEnqueueCraft() {
  return getActiveCraftJobs().length < getCraftQueueCap();
}

export function getCraftQueueSlotsLabel() {
  return `${getActiveCraftJobs().length} / ${getCraftQueueCap()}`;
}

function clearJobTimeout(jobId) {
  if (_timeouts[jobId]) {
    clearTimeout(_timeouts[jobId]);
    delete _timeouts[jobId];
  }
}

function scheduleJob(job) {
  clearJobTimeout(job.jobId);
  const wait = Math.max(0, (job.endsAt || 0) - Date.now());
  _timeouts[job.jobId] = setTimeout(() => {
    completeCraftJob(job.jobId);
  }, wait + 5);
}

/**
 * Start a craft job if a queue slot is free.
 * @returns {object|null} job or null if rejected
 */
export function enqueueCraftJob({ kind, recipeId, name, durationMs }) {
  if (!canEnqueueCraft()) return null;
  const dur = Math.max(250, Math.floor(durationMs || 1000));
  const now = Date.now();
  const job = {
    jobId: `cj_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    recipeId,
    name: name || recipeId || kind,
    startedAt: now,
    endsAt: now + dur,
    durationMs: dur,
  };
  getCraftQueue().push(job);
  scheduleJob(job);
  return job;
}

export function removeCraftJob(jobId) {
  clearJobTimeout(jobId);
  state.craftQueue = getCraftQueue().filter((j) => j && j.jobId !== jobId);
}

export function cancelCraftJob(jobId) {
  const job = getCraftQueue().find((j) => j && j.jobId === jobId);
  if (!job) return false;
  removeCraftJob(jobId);
  // Refunds are handled by caller if needed — cancel is UI-only for now without refund
  // (user didn't ask for cancel; queue display may offer it later)
  return true;
}

/** Deliver completed job side-effects (spawn/place). */
function deliverCraftJob(job) {
  if (!job) return;
  if (job.kind === 'ship') {
    window.completeCraftShipJob?.(job);
    return;
  }
  if (job.kind === 'turret') {
    window.completeCraftTurretJob?.(job);
    return;
  }
  if (job.kind === 'building') {
    window.completeCraftBuildingJob?.(job);
    return;
  }
  if (job.kind === 'drone') {
    window.completeCraftDroneJob?.(job);
  }
}

export function completeCraftJob(jobId) {
  const job = getCraftQueue().find((j) => j && j.jobId === jobId);
  if (!job) return;
  // Guard: only complete if due
  if (Date.now() + 30 < (job.endsAt || 0)) {
    scheduleJob(job);
    return;
  }
  removeCraftJob(jobId);
  deliverCraftJob(job);
  try { saveGame(); } catch (_) { /* ignore */ }
  if (refresh.ui) refresh.ui();
  if (refresh.header) refresh.header();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') {
    window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true });
  }
}

/** After load: finish overdue jobs, reschedule the rest. */
export function syncCraftQueue() {
  const now = Date.now();
  const queue = getCraftQueue().slice();
  const still = [];
  for (const job of queue) {
    if (!job || !job.jobId) continue;
    if (now >= (job.endsAt || 0)) {
      deliverCraftJob(job);
    } else {
      still.push(job);
      scheduleJob(job);
    }
  }
  state.craftQueue = still;
}

/** Migrate legacy per-type timer maps into craftQueue (one-time). */
export function migrateLegacyCraftTimers() {
  if (!Array.isArray(state.craftQueue)) state.craftQueue = [];
  const now = Date.now();
  const pushIf = (kind, recipeId, timer, name) => {
    if (!timer || now >= timer.endsAt) return;
    // Avoid dup if already migrated
    if (state.craftQueue.some((j) => j.kind === kind && j.recipeId === recipeId
      && Math.abs((j.endsAt || 0) - timer.endsAt) < 50)) return;
    state.craftQueue.push({
      jobId: `mig_${kind}_${recipeId}_${timer.endsAt}`,
      kind,
      recipeId,
      name: name || recipeId,
      startedAt: timer.startedAt || (timer.endsAt - (timer.durationMs || 1000)),
      endsAt: timer.endsAt,
      durationMs: timer.durationMs || Math.max(1000, timer.endsAt - now),
    });
  };
  for (const [id, t] of Object.entries(state.shipCraftTimers || {})) {
    pushIf('ship', id, t, id);
  }
  for (const [id, t] of Object.entries(state.turretCraftTimers || {})) {
    pushIf('turret', id, t, id);
  }
  for (const [id, t] of Object.entries(state.buildingCraftTimers || {})) {
    pushIf('building', id, t, id);
  }
  for (const [id, t] of Object.entries(state.droneCraftTimers || {})) {
    pushIf('drone', id, t, 'drone');
  }
  // Clear legacy maps so old single-slot locks don't block
  state.shipCraftTimers = {};
  state.turretCraftTimers = {};
  state.buildingCraftTimers = {};
  state.droneCraftTimers = {};
}

/** First active job for a recipe (for detail button progress display). */
export function getFirstJobForRecipe(kind, recipeId) {
  const now = Date.now();
  return getCraftQueue().find((j) => j && j.kind === kind && j.recipeId === recipeId && now < j.endsAt) || null;
}

window.syncCraftQueue = syncCraftQueue;
window.cancelCraftQueueJob = function(jobId) {
  // No refund on cancel for simplicity — only remove if still crafting
  const job = getCraftQueue().find((j) => j && j.jobId === jobId);
  if (!job || Date.now() >= job.endsAt) return;
  removeCraftJob(jobId);
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft')) {
    window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true });
  }
};
