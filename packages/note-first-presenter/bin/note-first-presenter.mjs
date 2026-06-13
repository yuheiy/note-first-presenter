#!/usr/bin/env node
// Node >=22.18 strips types on import, so the CLI ships as .ts source with no
// build step. Keep this entry as .mjs (not a .ts file) so the one-time
// "Type Stripping is experimental" warning can be silenced before the first .ts
// loads — an entry .ts would emit the warning before any of our code runs.
const origEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const type = typeof args[0] === 'string' ? args[0] : args[0]?.type;
  if (type === 'ExperimentalWarning' && /Type Stripping/.test(String(warning))) return;
  return origEmitWarning(warning, ...args);
};
await import('../src/cli.ts');
