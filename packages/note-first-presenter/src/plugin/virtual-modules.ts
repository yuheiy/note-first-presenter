import { dbPathFor } from '../notes';
import { cacheRootFor, type SlidesStatus } from '../slides';
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
    dbPath: dbPathFor(input.cwd),
    cacheRoot: cacheRootFor(input.cwd),
    fullConfig: input.fullConfig,
    mode: input.mode,
  };
}
