// ============================================================
// CAMERA + COORDINATE HELPERS
// ============================================================
import { TILE_W, TILE_H } from '../constants.js';
import { BASE_COL, BASE_ROW } from '../constants.js';

export const ZOOM_MIN_V = 0.35;
export const ZOOM_MAX_V = 3.0;

export const cam = { x:0, y:0, zoom:2.0 };

export function gridToWorld(col, row) {
  return { x:(col-row)*(TILE_W/2), y:(col+row)*(TILE_H/2) };
}

export function screenToWorld(sx, sy, W, H) {
  return { x:(sx-W/2)/cam.zoom+cam.x, y:(sy-H/2)/cam.zoom+cam.y };
}

export const gridToIso = gridToWorld;

export function BASE_POS() { return gridToWorld(BASE_COL, BASE_ROW); }

export function nodeWorldPos(node) {
  const w = gridToWorld(node.gr[0], node.gr[1]);
  return { x:w.x, y:w.y+TILE_H/2 };
}

export function focusOn(wx, wy, zoom) {
  cam.x = wx;
  cam.y = wy;
  if (zoom !== undefined) cam.zoom = Math.max(ZOOM_MIN_V, Math.min(ZOOM_MAX_V, zoom));
}

export function focusOnBase(zoom) {
  const base = gridToWorld(BASE_COL, BASE_ROW);
  focusOn(base.x, base.y, zoom);
}

export function adjustZoom(d) {
  cam.zoom = Math.max(ZOOM_MIN_V, Math.min(ZOOM_MAX_V, cam.zoom + d));
}

export function resetView() { focusOnBase(2.0); }

// Expose for HTML onclick handlers
window.adjustZoom = adjustZoom;
window.resetView  = resetView;
