import { defaultDb, type DbV1 } from '$lib/dbSchema';

export const SAVE_DEBOUNCE_MS = 500;
export const SAVE_RETRY_MS = 5000;

export interface DbStoreOptions {
  initial: DbV1;
  save: (db: DbV1) => Promise<void>;
}

export class DbStore {
  state: DbV1 = $state(defaultDb());
  saveStatus: 'idle' | 'saving' | 'error' = $state('idle');
  lastError: string | null = $state(null);

  #save: (db: DbV1) => Promise<void>;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #dirty = false;
  #inflight = false;

  constructor(opts: DbStoreOptions) {
    this.state = opts.initial;
    this.#save = opts.save;
  }

  replace(db: DbV1) {
    this.state = db;
  }

  setTitle(title: string) {
    this.state.title = title;
    this.#dirty = true;
    this.#scheduleSave();
  }

  setOutline(outline: unknown) {
    this.state.outline = outline;
    this.#dirty = true;
    this.#scheduleSave();
  }

  #scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), delay);
  }

  async flush() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    if (this.#inflight || !this.#dirty) return;
    this.#inflight = true;
    try {
      // Loop so edits made during an in-flight save are sent before settling.
      while (this.#dirty) {
        this.#dirty = false;
        this.saveStatus = 'saving';
        await this.#save({ ...this.state });
      }
      this.saveStatus = 'idle';
      this.lastError = null;
    } catch (err) {
      this.#dirty = true;
      this.saveStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.#scheduleSave(SAVE_RETRY_MS); // bounded retry; next edit also reschedules
    } finally {
      this.#inflight = false;
    }
  }
}
