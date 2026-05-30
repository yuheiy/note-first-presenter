import path from 'node:path';
import type { SlidesStatus } from '../config/resolve-slides-path';
import type { NoteFirstPresenterConfig } from '../config/schema';

export interface RuntimeConfigInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  fullConfig: NoteFirstPresenterConfig | null;
  mode: 'dev' | 'build';
}

export function buildRuntimeConfigObject(input: RuntimeConfigInput) {
  return {
    cwd: input.cwd,
    slidesStatus: input.slidesStatus,
    dbPath: path.join(input.cwd, '.note-first-presenter.json'),
    cacheRoot: path.join(input.cwd, 'node_modules', '.note-first-presenter'),
    fullConfig: input.fullConfig,
    mode: input.mode,
  };
}
