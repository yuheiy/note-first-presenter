import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';

describe('SlideImage (dev mode)', () => {
  it('uses /api/slide/{hash}/{n} as src', async () => {
    const { default: SlideImage } = await import('../SlideImage.svelte');
    const screen = render(SlideImage, { hash: 'abc', slide: 3, alt: 'Slide 3' });
    const img = screen.getByAltText('Slide 3');
    await expect.element(img).toHaveAttribute('src', '/api/slide/abc/3');
  });
});
