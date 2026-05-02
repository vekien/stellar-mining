// ============================================================
// GLOBAL CONSTANTS
// ============================================================
export const TILE_W = 64;
export const TILE_H = 32;
export const GRID_COLS = 100;
export const GRID_ROWS = 100;
export const BASE_COL = 50;
export const BASE_ROW = 50;
export const SAVE_KEY = 'stellarMiningCo_v1';
export const PLAYER_TITLE = 'Commander';
// SOL_DURATION is defined in data/sol.js — re-exported here for backward compatibility
export { SOL_DURATION } from './data/sol.js';

// ── Stars ─────────────────────────────────────────────────────
export const TWINKLE_FPS = 20;
export const TWINKLE_INTERVAL_MS = 1000 / TWINKLE_FPS;

// ── Camera zoom ───────────────────────────────────────────────
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 3.0;
