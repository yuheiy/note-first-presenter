import { defaultDb, type DbV1 } from './schema';

const SAVE_DEBOUNCE_MS = 500;

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

  constructor(opts: DbStoreOptions) {
    this.state = opts.initial;
    this.#save = opts.save;
  }

  replace(db: DbV1) {
    this.state = db;
  }

  setTitle(title: string) {
    this.state.title = title;
    this.#scheduleSave();
  }

  setOutline(outline: unknown) {
    this.state.outline = outline;
    this.#scheduleSave();
  }

  #scheduleSave() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  async flush() {
    this.#timer = null;
    this.saveStatus = 'saving';
    try {
      await this.#save({ ...this.state });
      this.saveStatus = 'idle';
      this.lastError = null;
    } catch (err) {
      this.saveStatus = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }
}
