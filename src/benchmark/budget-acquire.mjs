import { setTimeout as delay } from 'node:timers/promises';
import { createTokenBudget } from './budget.mjs';
// Wait only for a local exclusive lock before any request or reservation.
// Provider errors and outstanding uncertain reservations are never retried here.
export async function acquireTokenBudget(config, {
  open = createTokenBudget, wait = delay, timeoutMs = 30000, intervalMs = 100,
  now = Date.now, signal, onAcquired,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw Object.assign(new Error('INVALID_BUDGET_CONFIG'), { code: 'INVALID_BUDGET_CONFIG' });
  }
  const started = now();
  let lockContentions = 0;
  while (true) {
    signal?.throwIfAborted();
    let lease;
    try { lease = open(config); }
    catch (error) {
      if (error.code !== 'BUDGET_LOCKED' && error.message !== 'BUDGET_LOCKED') throw error;
      lockContentions++;
      const remaining = timeoutMs - (now() - started);
      if (remaining <= 0) throw error;
      await wait(Math.min(intervalMs, remaining), undefined, { signal });
      continue;
    }
    try {
      signal?.throwIfAborted();
      // Includes repeated local opens during contention; excludes provider work.
      await onAcquired?.({ wait_ms: lockContentions ? Math.max(0, now() - started) : 0,
        lock_contentions: lockContentions });
      signal?.throwIfAborted();
      return lease;
    } catch (error) {
      lease.close();
      throw error;
    }
  }
}
