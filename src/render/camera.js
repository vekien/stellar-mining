// ============================================================
// CAMERA + COORDINATE HELPERS
// ============================================================
import { TILE_W, TILE_H } from '../constants.js';
import { BASE_COL, BASE_ROW } from '../constants.js';

export const ZOOM_MIN_V = 0.35;
export const ZOOM_MAX_V = 3.0;

export const cam = { x:0, y:0, zoom:2.0, targetX:0, targetY:0 };

/** World-space AABB of the current camera frustum (updated each frame). */
const _view = { minX: -1e9, maxX: 1e9, minY: -1e9, maxY: 1e9 };

export function updateViewBounds(screenW, screenH, padWorld = 96) {
  const halfW = (screenW * 0.5) / Math.max(0.01, cam.zoom) + padWorld;
  const halfH = (screenH * 0.5) / Math.max(0.01, cam.zoom) + padWorld;
  _view.minX = cam.x - halfW;
  _view.maxX = cam.x + halfW;
  _view.minY = cam.y - halfH;
  _view.maxY = cam.y + halfH;
  return _view;
}

export function getViewBounds() {
  return _view;
}

export function isInView(wx, wy) {
  return wx >= _view.minX && wx <= _view.maxX && wy >= _view.minY && wy <= _view.maxY;
}

/** True if either endpoint is visible or the segment's bbox intersects the view. */
export function isSegmentInView(x1, y1, x2, y2) {
  if (isInView(x1, y1) || isInView(x2, y2)) return true;
  const minX = x1 < x2 ? x1 : x2;
  const maxX = x1 > x2 ? x1 : x2;
  const minY = y1 < y2 ? y1 : y2;
  const maxY = y1 > y2 ? y1 : y2;
  return !(maxX < _view.minX || minX > _view.maxX || maxY < _view.minY || minY > _view.maxY);
}

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
  cam.targetX = wx;
  cam.targetY = wy;
  if (zoom !== undefined) cam.zoom = Math.max(ZOOM_MIN_V, Math.min(ZOOM_MAX_V, zoom));
}

export function snapTo(wx, wy, zoom) {
  cam.x = cam.targetX = wx;
  cam.y = cam.targetY = wy;
  if (zoom !== undefined) cam.zoom = Math.max(ZOOM_MIN_V, Math.min(ZOOM_MAX_V, zoom));
}

export function tickCamera() {
  const LERP = 0.4;
  const dx = cam.targetX - cam.x;
  const dy = cam.targetY - cam.y;
  cam.x += dx * LERP;
  cam.y += dy * LERP;
  return Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1; // true while still moving
}

export function focusOnBase(zoom, options = {}) {
  const base = gridToWorld(BASE_COL, BASE_ROW);
  if (options.snap) {
    snapTo(base.x, base.y, zoom);
    return;
  }
  focusOn(base.x, base.y, zoom);
}

export function adjustZoom(d) {
  cam.zoom = Math.max(ZOOM_MIN_V, Math.min(ZOOM_MAX_V, cam.zoom + d));
}

export function resetView() { snapTo(gridToWorld(BASE_COL, BASE_ROW).x, gridToWorld(BASE_COL, BASE_ROW).y, 2.0); }

// Expose for HTML onclick handlers
window.adjustZoom = adjustZoom;
window.resetView  = resetView;
