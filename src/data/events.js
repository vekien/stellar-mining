// ============================================================
// EVENT CONFIGURATION DATA
// ============================================================

// ── Solar Flare ───────────────────────────────────────────────
// How many distinct resource types are affected per flare
export const SOLAR_FLARE_MIN_TYPES = 3;
export const SOLAR_FLARE_MAX_TYPES = 8;

// Fraction of each affected resource that is lost (min/max)
export const SOLAR_FLARE_LOSS_MIN = 0.10; // 10 %
export const SOLAR_FLARE_LOSS_MAX = 0.20; // 20 %  (pct random = min + random*(max-min))

// Warning banner display duration (ms)
export const SOLAR_FLARE_WARNING_DURATION_MS = 10000;

// Delay before Vane's transmission fires (ms)
export const SOLAR_FLARE_TRANSMISSION_DELAY_MS = 15000;

// ── Comet Impact ──────────────────────────────────────────────
// Base damage at sol 0, scales up to sol 10 where it reaches max
export const COMET_BASE_DMG_MIN = 300;
export const COMET_BASE_DMG_MAX = 600;
export const COMET_SCALE_DMG_MIN = 2700; // added at full scale (sol >= 10)
export const COMET_SCALE_DMG_MAX = 5400;

// Warning banner display duration (ms)
export const COMET_WARNING_DURATION_MS = 10000;

// Delay before Vane's transmission fires (ms)
export const COMET_TRANSMISSION_DELAY_MS = 15000;

// ── General event scheduling ──────────────────────────────────
// How many SOLs from now until the next random event fires
export const EVENT_SCHEDULE_MIN_SOLS = 2;
export const EVENT_SCHEDULE_MAX_SOLS = 5; // inclusive; produces 2–5 sols delay

// Delay before event trigger runs after fireRandomEvent is called (ms)
export const SOLAR_FLARE_TRIGGER_DELAY_MS = 1500;
export const COMET_TRIGGER_DELAY_MS       = 3000;
