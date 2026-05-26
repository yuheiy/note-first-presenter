export type { NoteFirstPresenterConfig } from './config/schema';
export { mainCommand, parseCliArgs } from './cli';
export type { CliArgs } from './cli';
export { startServer } from './server';
export type { StartServerOptions } from './server';
export { noteFirstPresenterPlugin } from './plugin';
export type { NfpPluginOptions } from './plugin';

export function defineConfig<T extends { slides?: string }>(config: T): T {
  return config;
}
