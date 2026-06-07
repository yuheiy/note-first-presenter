export type SyncMessage =
  | { type: 'active-slide'; slide: number }
  | { type: 'page-count'; count: number };

export const SYNC_CHANNEL_NAME = 'nfp:active-slide';
