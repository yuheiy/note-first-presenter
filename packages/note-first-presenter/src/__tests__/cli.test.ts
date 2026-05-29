import { describe, expect, it } from 'vite-plus/test';
import { mainCommand, parseCliArgs } from '../cli';

describe('parseCliArgs', () => {
  it('parses --port', () => {
    const args = parseCliArgs(['--port', '4000']);
    expect(args.port).toBe(4000);
  });

  it('defaults port to 5173', () => {
    const args = parseCliArgs([]);
    expect(args.port).toBe(5173);
  });

  it('parses --host', () => {
    const args = parseCliArgs(['--host', '0.0.0.0']);
    expect(args.host).toBe('0.0.0.0');
  });

  it('parses --open flag', () => {
    const args = parseCliArgs(['--open']);
    expect(args.open).toBe(true);
  });

  it('open defaults to false', () => {
    const args = parseCliArgs([]);
    expect(args.open).toBe(false);
  });
});

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
