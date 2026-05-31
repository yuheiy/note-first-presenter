import { existsSync } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';

export type SlidesStatus =
  | { kind: 'resolved'; path: string }
  | { kind: 'configured-but-missing'; configuredPath: string }
  | { kind: 'no-config-no-file' }
  | { kind: 'no-config-multiple-files'; candidates: string[] };

export interface ResolveSlidesArgs {
  configuredSlides: string | undefined;
  configFile: string | null;
}

const SLIDES_EXTENSIONS = ['pdf'] as const;

export async function resolveSlidesPath({
  configuredSlides,
  configFile,
}: ResolveSlidesArgs): Promise<SlidesStatus> {
  if (configuredSlides) {
    const base = configFile ? path.dirname(configFile) : process.cwd();
    const abs = path.resolve(base, configuredSlides);
    return existsSync(abs)
      ? { kind: 'resolved', path: abs }
      : { kind: 'configured-but-missing', configuredPath: abs };
  }

  const candidates = await glob(
    SLIDES_EXTENSIONS.map((ext) => `*.${ext}`),
    { cwd: process.cwd(), absolute: true },
  );
  if (candidates.length === 0) return { kind: 'no-config-no-file' };
  if (candidates.length === 1) return { kind: 'resolved', path: candidates[0] };
  return { kind: 'no-config-multiple-files', candidates };
}

export interface RenderedSlide {
  number: number;
  width: number;
  height: number;
  file: string;
}

export interface RenderAllResult {
  hash: string;
  pageCount: number;
  slides: RenderedSlide[];
}

export interface Slides {
  meta(): Promise<{ hash: string; pageCount: number }>;
  image(pageNumber: number): Promise<{ data: Buffer; hash: string; pageCount: number }>;
  size(pageNumber: number): Promise<{ width: number; height: number }>;
  renderAll(outDir: string): Promise<RenderAllResult>;
  invalidate(): void;
}

export { openPdfSlides as openSlides, PageOutOfRangeError } from './slides/pdf';
