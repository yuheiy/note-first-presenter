import { BROWSER } from 'esm-env';
import { SYNC_CHANNEL_NAME, type SyncMessage } from './messages';

export class SyncSubscriber {
  #channel: BroadcastChannel | null = BROWSER ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

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
