import { describe, expect, it, vi } from 'vite-plus/test';
import type { SyncMessage } from '../messages';
import { SyncSubscriber } from '../sync-subscriber';

vi.mock('esm-env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('esm-env')>()),
  BROWSER: true,
}));

describe('SyncSubscriber', () => {
  it('subscribe receives messages broadcast on the channel', async () => {
    const received: SyncMessage[] = [];
    const sub = new SyncSubscriber();
    const unsubscribe = sub.subscribe((m) => received.push(m));

    const other = new BroadcastChannel('nfp:active-slide');
    other.postMessage({ type: 'active-slide', slide: 4 } satisfies SyncMessage);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([{ type: 'active-slide', slide: 4 }]);

    unsubscribe();
    other.close();
    sub.destroy();
  });

  it('unsubscribe removes the listener', async () => {
    const received: SyncMessage[] = [];
    const sub = new SyncSubscriber();
    const unsubscribe = sub.subscribe((m) => received.push(m));
    unsubscribe();

    const other = new BroadcastChannel('nfp:active-slide');
    other.postMessage({ type: 'active-slide', slide: 1 } satisfies SyncMessage);
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([]);

    other.close();
    sub.destroy();
  });
});
