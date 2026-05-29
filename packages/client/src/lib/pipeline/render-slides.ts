import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ensurePdfState, getSlideImage, getSlidesMeta } from '../server/pdf-renderer';

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

export interface RenderAllOptions {
  slidesPath: string;
  cacheRoot: string;
  outDir: string;
}

export async function renderAllSlides(opts: RenderAllOptions): Promise<RenderAllResult> {
  ensurePdfState({ slidesPath: opts.slidesPath, cacheRoot: opts.cacheRoot });
  const { hash, pageCount } = await getSlidesMeta();
  await fs.mkdir(opts.outDir, { recursive: true });
  const slides: RenderedSlide[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const { data, width, height } = await getSlideImage(n);
    const name = `${String(n).padStart(4, '0')}.webp`;
    await fs.writeFile(path.join(opts.outDir, name), data);
    slides.push({ number: n, width, height, file: name });
  }
  return { hash, pageCount, slides };
}
