import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

describe('SlideImage', () => {
  it('uses /nfp-data/slides/{hash}/{padded page}.webp as src', async () => {
    const { default: SlideImage } = await import('../SlideImage.svelte');
    const screen = await render(SlideImage, { hash: 'abc', slide: 3, alt: 'Slide 3' });
    const img = screen.getByAltText('Slide 3');
    await expect.element(img).toHaveAttribute('src', '/nfp-data/slides/abc/0003.webp');
  });
});
