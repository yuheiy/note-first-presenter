import { describe, expect, it, vi } from 'vite-plus/test';
import { SYNC_CHANNEL_NAME, SyncPublisher, SyncSubscriber, type SyncMessage } from '../sync';

describe('SyncPublisher', () => {
  it('publishActiveSlide posts { type, slide } on the channel', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel(SYNC_CHANNEL_NAME);
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.publishActiveSlide(7);

    await vi.waitFor(() => expect(received).toEqual([{ type: 'active-slide', slide: 7 }]));

    listener.close();
    pub.destroy();
  });

  it('publishSlideCount posts { type, count } on the channel', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel(SYNC_CHANNEL_NAME);
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.publishSlideCount(12);

    await vi.waitFor(() => expect(received).toEqual([{ type: 'slide-count', count: 12 }]));

    listener.close();
    pub.destroy();
  });

  it('destroy() prevents further publishes', async () => {
    const received: SyncMessage[] = [];
    const listener = new BroadcastChannel(SYNC_CHANNEL_NAME);
    listener.addEventListener('message', (e) => received.push(e.data));

    const pub = new SyncPublisher();
    pub.destroy();
    pub.publishActiveSlide(1);
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toEqual([]);
    listener.close();
  });
});

describe('SyncSubscriber', () => {
  it('subscribe receives messages broadcast on the channel', async () => {
    const received: SyncMessage[] = [];
    const sub = new SyncSubscriber();
    const unsubscribe = sub.subscribe((m) => received.push(m));

    const other = new BroadcastChannel(SYNC_CHANNEL_NAME);
    other.postMessage({ type: 'active-slide', slide: 4 } satisfies SyncMessage);
    await vi.waitFor(() => expect(received).toEqual([{ type: 'active-slide', slide: 4 }]));

    unsubscribe();
    other.close();
    sub.destroy();
  });

  it('unsubscribe removes the listener', async () => {
    const received: SyncMessage[] = [];
    const sub = new SyncSubscriber();
    const unsubscribe = sub.subscribe((m) => received.push(m));
    unsubscribe();

    const other = new BroadcastChannel(SYNC_CHANNEL_NAME);
    other.postMessage({ type: 'active-slide', slide: 1 } satisfies SyncMessage);
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toEqual([]);

    other.close();
    sub.destroy();
  });
});
