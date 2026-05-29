import { describe, expect, it } from 'vite-plus/test';
import { mainCommand } from '../cli';

describe('mainCommand structure', () => {
  it('has no top-level run (so subcommands do not also start the dev server)', () => {
    expect(mainCommand.run).toBeUndefined();
  });
  it('defaults to the dev subcommand', () => {
    expect(mainCommand.default).toBe('dev');
  });
  it('registers dev, build, and export subcommands', () => {
    expect(Object.keys(mainCommand.subCommands ?? {}).sort()).toEqual(['build', 'dev', 'export']);
  });
});
