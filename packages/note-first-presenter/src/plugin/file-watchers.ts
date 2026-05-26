import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { ViteDevServer } from 'vite-plus';
import type { SlidesStatus } from '../config/resolve-slides-path';

export interface WatcherInput {
  cwd: string;
  slidesStatus: SlidesStatus;
  vite: ViteDevServer;
  onChange: () => Promise<void> | void;
}

export function initFileWatchers(input: WatcherInput): () => Promise<void> {
  const watchers: FSWatcher[] = [];

  const rootWatcher = chokidar.watch('*.pdf', {
    cwd: input.cwd,
    depth: 0,
    ignoreInitial: true,
  });
  rootWatcher.on('add', () => void input.onChange());
  rootWatcher.on('unlink', () => void input.onChange());
  watchers.push(rootWatcher);

  const configPaths = [
    path.join(input.cwd, 'note-first-presenter.config.ts'),
    path.join(input.cwd, 'note-first-presenter.config.js'),
  ];
  const configWatcher = chokidar.watch(configPaths, { ignoreInitial: true });
  configWatcher.on('add', () => void input.onChange());
  configWatcher.on('change', () => void input.onChange());
  configWatcher.on('unlink', () => void input.onChange());
  watchers.push(configWatcher);

  if (input.slidesStatus.kind === 'resolved') {
    const pdfWatcher = chokidar.watch(input.slidesStatus.path, {
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    pdfWatcher.on('change', () => void input.onChange());
    watchers.push(pdfWatcher);
  }

  return async () => {
    await Promise.all(watchers.map((w) => w.close()));
  };
}
