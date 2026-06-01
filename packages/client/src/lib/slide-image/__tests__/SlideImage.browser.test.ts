import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

beforeAll(() => {
  vi.stubGlobal('__NFP_STATIC__', false);
});

describe('SlideImage (dev mode)', () => {
  it('uses /api/slide/{hash}/{n} as src', async () => {
    const { default: SlideImage } = await import('../SlideImage.svelte');
    const screen = render(SlideImage, { hash: 'abc', slide: 3, alt: 'Slide 3' });
    const img = screen.getByAltText('Slide 3');
    await expect.element(img).toHaveAttribute('src', '/api/slide/abc/3');
  });
});
