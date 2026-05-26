import { BROWSER } from 'esm-env';
import { SYNC_CHANNEL_NAME, type SyncMessage } from './messages';

export class SyncPublisher {
  #channel: BroadcastChannel | null = BROWSER ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

  publishActiveSlide(slide: number) {
    this.#channel?.postMessage({ type: 'active-slide', slide } satisfies SyncMessage);
  }

  destroy() {
    this.#channel?.close();
    this.#channel = null;
  }
}
