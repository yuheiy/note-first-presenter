import { SYNC_CHANNEL_NAME, type SyncMessage } from './messages';

export class SyncPublisher {
  #channel: BroadcastChannel | null = new BroadcastChannel(SYNC_CHANNEL_NAME);

  publishActiveSlide(slide: number) {
    this.#channel?.postMessage({ type: 'active-slide', slide } satisfies SyncMessage);
  }

  publishPageCount(count: number) {
    this.#channel?.postMessage({ type: 'page-count', count } satisfies SyncMessage);
  }

  destroy() {
    this.#channel?.close();
    this.#channel = null;
  }
}
