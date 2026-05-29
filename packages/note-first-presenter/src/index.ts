export type { NoteFirstPresenterConfig } from './config/schema';
export { mainCommand, parseCliArgs } from './cli';
export type { CliArgs } from './cli';
export { startServer } from './server';
export type { StartServerOptions } from './server';
export { noteFirstPresenterPlugin } from './plugin';
export type { NfpPluginOptions } from './plugin';
export { runBuild } from './build';
export type { RunBuildArgs } from './build';
export { runExport } from './export';
export type { RunExportArgs } from './export';

export function defineConfig<T extends { slides?: string }>(config: T): T {
  return config;
}
