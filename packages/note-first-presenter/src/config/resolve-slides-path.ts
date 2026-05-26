import { existsSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';

export type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface ResolveSlidesArgs {
  cwd: string;
  configuredSlides: string | undefined;
  configFile: string | null;
}

export async function resolveSlidesPath(args: ResolveSlidesArgs): Promise<SlidesStatus> {
  if (args.configuredSlides) {
    const base = args.configFile ? path.dirname(args.configFile) : args.cwd;
    const abs = path.resolve(base, args.configuredSlides);
    return existsSync(abs)
      ? { kind: 'resolved', path: abs }
      : { kind: 'configured-but-missing', configuredPath: abs };
  }

  const pdfs = await glob('*.pdf', { cwd: args.cwd, absolute: true });
  if (pdfs.length === 0) return { kind: 'no-config-no-file' };
  if (pdfs.length === 1) return { kind: 'resolved', path: pdfs[0] };
  return { kind: 'no-config-multiple-files', candidates: pdfs };
}
