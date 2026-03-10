import { removeFirewallRule } from './firewall.js';
import type { RuleStateStore } from './state.js';

/**
 * Removes all rules that have passed their TTL.
 * Called once at startup and then on every cleanup interval tick.
 */
export function reconcileExpired(store: RuleStateStore): void {
  const expired = store.getExpired();
  for (const entry of expired) {
    console.log(
      `[scheduler] Removing expired rule "${entry.ruleName}" ` +
        `(port ${entry.port}, expired ${entry.expiresAt})`,
    );
    removeFirewallRule(entry.ruleName);
    store.remove(entry.id);
  }
}

/**
 * Starts a recurring cleanup loop.
 * Returns the interval handle so it can be cleared on shutdown.
 */
export function startCleanupScheduler(
  store: RuleStateStore,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    reconcileExpired(store);
  }, intervalMs);
}
