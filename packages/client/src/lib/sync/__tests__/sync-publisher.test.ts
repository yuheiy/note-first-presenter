import { describe, expect, it, vi } from 'vite-plus/test';
import type { SyncMessage } from '../messages';
import { SyncPublisher } from '../sync-publisher';

vi.mock('esm-env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('esm-env')>()),
  BROWSER: true,
}));

describe('SyncPublisher', () => {
  it('publishActiveSlide posts { type, slide } on the channel', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.publishActiveSlide(7);

    // BroadcastChannel delivers async; yield to the event loop.
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([{ type: 'active-slide', slide: 7 }]);

    listener.close();
    pub.destroy();
  });

  it('destroy() prevents further publishes', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.destroy();
    pub.publishActiveSlide(1); // no-op
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([]);
    listener.close();
  });
});
