// ============================================================
// SOL / DAY-CYCLE CONFIGURATION DATA
// ============================================================

// Duration of one SOL in seconds (1 day = 3 minutes)
export const SOL_DURATION = 180;

// ── Market boost ──────────────────────────────────────────────
// Random demand multiplier range for the boosted resource each SOL
export const MARKET_BOOST_MIN = 1.2;
export const MARKET_BOOST_MAX = 2.0; // 1.2 + 0.8

// Daily base-price variance (percent). Demand resources always roll 0..+MAX.
export const MARKET_VARIANCE_MIN = -25;
export const MARKET_VARIANCE_MAX = 25;
/** Fraction of marketable types that get a non-zero variance each SOL (~12/20). */
export const MARKET_VARIANCE_ACTIVE_RATIO = 0.6;

// Note: event scheduling timing constants (EVENT_SCHEDULE_MIN/MAX_SOLS) live in data/events.js.
