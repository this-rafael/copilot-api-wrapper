import { describe, expect, it, vi } from 'vitest';
import { WorkspaceTreeBuilder } from '../../src/autocomplete/WorkspaceTreeBuilder.js';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe('WorkspaceTreeBuilder', () => {
  it('reuses the cached tree while the ttl is fresh', async () => {
    let now = 0;
    const listFiles = vi.fn().mockResolvedValue(['src/server.ts', 'src/autocomplete/CopilotAutocompleteSession.ts']);
    const builder = new WorkspaceTreeBuilder({
      now: () => now,
      listFiles,
      scheduleRefresh: (() => 0) as never,
      clearScheduledRefresh: () => {},
    });

    const first = await builder.getTree('/repo');
    now = 59_000;
    const second = await builder.getTree('/repo');

    expect(first).toContain('src/');
    expect(second).toBe(first);
    expect(listFiles).toHaveBeenCalledTimes(1);
  });

  it('refreshes automatically from the scheduled ttl callback', async () => {
    let now = 0;
    const scheduledCallbacks: Array<() => void> = [];
    const listFiles = vi.fn()
      .mockResolvedValueOnce(['src/server.ts'])
      .mockResolvedValueOnce(['src/server.ts', 'src/new-file.ts']);
    const builder = new WorkspaceTreeBuilder({
      now: () => now,
      listFiles,
      scheduleRefresh: ((callback) => {
        scheduledCallbacks.push(callback);
        return scheduledCallbacks.length as never;
      }) as never,
      clearScheduledRefresh: () => {},
    });

    const first = await builder.getTree('/repo');
    now = 60_001;
    scheduledCallbacks[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    const refreshed = await builder.getTree('/repo');

    expect(first).toContain('server.ts');
    expect(refreshed).toContain('new-file.ts');
    expect(listFiles).toHaveBeenCalledTimes(2);
  });

  it('returns stale data immediately and deduplicates concurrent refreshes', async () => {
    let now = 0;
    const scheduledCallbacks: Array<() => void> = [];
    const deferredRefresh = createDeferred<string[]>();
    const listFiles = vi.fn()
      .mockResolvedValueOnce(['src/server.ts'])
      .mockReturnValueOnce(deferredRefresh.promise);
    const builder = new WorkspaceTreeBuilder({
      now: () => now,
      listFiles,
      scheduleRefresh: ((callback) => {
        scheduledCallbacks.push(callback);
        return scheduledCallbacks.length as never;
      }) as never,
      clearScheduledRefresh: () => {},
    });

    const cached = await builder.getTree('/repo');
    now = 60_001;
    const staleA = await builder.getTree('/repo');
    const staleB = await builder.getTree('/repo');

    expect(staleA).toBe(cached);
    expect(staleB).toBe(cached);
    expect(listFiles).toHaveBeenCalledTimes(2);

    deferredRefresh.resolve(['src/server.ts', 'src/updated.ts']);
    await Promise.resolve();
    await Promise.resolve();

    const refreshed = await builder.getTree('/repo');
    expect(refreshed).toContain('updated.ts');
  });
});
