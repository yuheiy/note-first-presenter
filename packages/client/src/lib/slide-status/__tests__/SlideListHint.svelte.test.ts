import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideListHint from '../SlideListHint.svelte';

describe('SlideListHint', () => {
  it('renders the message as role="status" with aria-live="polite"', async () => {
    const screen = render(SlideListHint, { message: 'Drop a PDF to begin' });
    const status = screen.getByRole('status');
    await expect.element(status).toHaveTextContent('Drop a PDF to begin');
    await expect.element(status).toHaveAttribute('aria-live', 'polite');
  });
});
