import { describe, expect, it, vi } from 'vite-plus/test';
import type { SyncMessage } from '../messages';
import { SyncPublisher } from '../sync-publisher';

describe('SyncPublisher', () => {
  it('publishActiveSlide posts { type, slide } on the channel', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.publishActiveSlide(7);

    await vi.waitFor(() => expect(received).toEqual([{ type: 'active-slide', slide: 7 }]));

    listener.close();
    pub.destroy();
  });

  it('publishPageCount posts { type, count } on the channel', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.publishPageCount(12);

    await vi.waitFor(() => expect(received).toEqual([{ type: 'page-count', count: 12 }]));

    listener.close();
    pub.destroy();
  });

  it('destroy() prevents further publishes', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel('nfp:active-slide');
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.destroy();
    pub.publishActiveSlide(1);
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toEqual([]);
    listener.close();
  });
});
