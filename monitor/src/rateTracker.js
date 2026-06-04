// rateTracker.js — track the recent pids.current history per container so the
// rules engine can detect a fast "cliff" approach toward pids.max before the
// 80% warn line is crossed. Pure in-memory state, no I/O.

const DEFAULT_WINDOW = 5;

export class RateTracker {
  /**
   * @param {number} window  number of (current, ts) samples to retain per id
   */
  constructor(window = DEFAULT_WINDOW) {
    this.window = window;
    /** @type {Map<string, Array<{current:number, ts:number}>>} */
    this.history = new Map();
  }

  /**
   * Record a sample for container `id`. ts is in milliseconds.
   */
  record(id, current, ts) {
    let samples = this.history.get(id);
    if (!samples) {
      samples = [];
      this.history.set(id, samples);
    }
    samples.push({ current, ts });
    if (samples.length > this.window) samples.shift();
  }

  /**
   * Per-tick delta = increase in pids.current over the most recent sample pair.
   * Returns 0 when there are fewer than two samples or the count did not rise.
   */
  deltaPerTick(id) {
    const samples = this.history.get(id);
    if (!samples || samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    const prev = samples[samples.length - 2];
    return Math.max(0, last.current - prev.current);
  }

  /**
   * Drop history for containers that no longer exist so the map does not grow
   * unbounded as containers come and go.
   */
  retainOnly(activeIds) {
    const keep = new Set(activeIds);
    for (const id of this.history.keys()) {
      if (!keep.has(id)) this.history.delete(id);
    }
  }
}

/**
 * Project how many ticks until pids.current reaches pids.max at the given
 * per-tick delta. Returns Infinity when not approaching (delta <= 0, unlimited
 * max, or already at/over max with no growth). Pure function — easy to test.
 *
 * @param {number} current
 * @param {number|null} max  null = unlimited -> Infinity
 * @param {number} deltaPerTick
 * @returns {number} ticks (can be fractional), or Infinity
 */
export function projectTicksToMax(current, max, deltaPerTick) {
  if (max === null || !Number.isFinite(max)) return Infinity;
  if (deltaPerTick <= 0) return Infinity;
  const remaining = max - current;
  if (remaining <= 0) return 0;
  return remaining / deltaPerTick;
}
