import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SlideshowFallback from '../SlideshowFallback.svelte';

describe('SlideshowFallback', () => {
  it('renders the message as a paragraph', async () => {
    const screen = render(SlideshowFallback, { message: 'No slides yet' });
    const para = screen.getByText('No slides yet');
    await expect.element(para).toBeInTheDocument();
  });
});
