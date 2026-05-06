// ============================================================
// SHARED CANVAS / INPUT STATE
// Avoids circular imports between renderer, turrets, and input.
// ============================================================
export const canvasState = {
  turretHoverCol: -1,
  turretHoverRow: -1,
  storageHoverId: null,
  baseHovered: false,
  lastHoveredNode: null,
};
