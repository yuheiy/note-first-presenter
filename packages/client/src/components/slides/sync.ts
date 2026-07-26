import { useEffect, useEffectEvent, useRef } from 'react';

/**
 * The workspace -> slideshow link, over BroadcastChannel.
 *
 * One-way by design: the slideshow window follows, and never talks back. Keeping
 * publish and subscribe in separate hooks is what makes that asymmetry visible
 * instead of hiding it behind a "sync" object that looks bidirectional.
 */
export type SyncMessage =
  | { type: 'active-slide'; slide: number }
  | { type: 'slide-count'; count: number };

export const SYNC_CHANNEL_NAME = 'nfp:active-slide';

export class SyncPublisher {
  #channel: BroadcastChannel | null = new BroadcastChannel(SYNC_CHANNEL_NAME);

  publishActiveSlide(slide: number) {
    this.#channel?.postMessage({ type: 'active-slide', slide } satisfies SyncMessage);
  }

  // The count is the deck's, not the PDF's: it is `max(pdfPageCount, groupCount)`,
  // so it can exceed the number of pages there are to render (CONTEXT.md's Slide).
  publishSlideCount(count: number) {
    this.#channel?.postMessage({ type: 'slide-count', count } satisfies SyncMessage);
  }

  destroy() {
    this.#channel?.close();
    this.#channel = null;
  }
}

export class SyncSubscriber {
  #channel: BroadcastChannel | null = new BroadcastChannel(SYNC_CHANNEL_NAME);

  subscribe(handler: (msg: SyncMessage) => void): () => void {
    const channel = this.#channel;
    if (!channel) return () => {};
    const listener = (ev: MessageEvent<SyncMessage>) => handler(ev.data);
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }

  destroy() {
    this.#channel?.close();
    this.#channel = null;
  }
}

/**
 * Broadcasts what the slideshow window needs to follow along.
 *
 * `slideCount` is the effective count — `max(pdfPageCount, groupCount)` — which
 * is why the Workspace publishes and not whoever owns `activeSlide`: it is the
 * one that has both numbers.
 */
export function useSyncPublisher(activeSlide: number, slideCount: number) {
  const publisherRef = useRef<SyncPublisher | null>(null);

  useEffect(() => {
    const publisher = new SyncPublisher();
    publisherRef.current = publisher;
    return () => {
      publisherRef.current = null;
      publisher.destroy();
    };
  }, []);

  // Two effects rather than one: a slide change should not re-broadcast the count
  // and vice versa. Both run after the effect above on mount, so the channel is
  // there by then.
  useEffect(() => {
    publisherRef.current?.publishActiveSlide(activeSlide);
  }, [activeSlide]);

  useEffect(() => {
    publisherRef.current?.publishSlideCount(slideCount);
  }, [slideCount]);
}

/** Receives what the workspace publishes. Slideshow-only. */
export function useSyncSubscriber(onMessage: (msg: SyncMessage) => void) {
  // The channel is opened once; without this the subscription would be torn down
  // and rebuilt on every render that hands over a fresh callback.
  const handleMessage = useEffectEvent(onMessage);

  useEffect(() => {
    const subscriber = new SyncSubscriber();
    const unsubscribe = subscriber.subscribe((msg) => {
      handleMessage(msg);
    });
    return () => {
      unsubscribe();
      subscriber.destroy();
    };
  }, []);
}
