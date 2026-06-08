import { describe, expect, it } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideListErrorOverlay from '../SlideListErrorOverlay.svelte';

describe('SlideListErrorOverlay', () => {
  it('renders the message inside a role="alert" container', async () => {
    const screen = render(SlideListErrorOverlay, { message: 'Slides not found' });
    const alert = screen.getByRole('alert');
    await expect.element(alert).toBeInTheDocument();
    await expect.element(alert).toHaveTextContent('Slides not found');
  });

  it('sets aria-live="assertive" so screen readers announce the error', async () => {
    const screen = render(SlideListErrorOverlay, { message: 'X' });
    const alert = screen.getByRole('alert');
    await expect.element(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
