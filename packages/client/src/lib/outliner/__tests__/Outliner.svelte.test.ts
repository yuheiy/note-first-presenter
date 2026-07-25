// The activeSlide sync is a two-way binding: the editor reports the caret's note
// group outward, and an outside change (slide list, slideshow) moves the caret
// inward. These tests pin the echo suppression that keeps the inward move from
// being reported straight back out.

import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import Outliner from '../Outliner.svelte';

function outlineWith(texts: string[]) {
  return {
    type: 'doc',
    content: [
      {
        type: 'bullet_list',
        content: texts.map((text) => ({
          type: 'list_item',
          attrs: { collapsed: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        })),
      },
    ],
  };
}

/** Texts of the top-level items the active-slide decoration currently marks. */
function activeItemTexts() {
  return Array.from(document.querySelectorAll('[data-active-slide="true"]')).map(
    (el) => el.textContent,
  );
}

/** Render on slide 1, settle, then forget the calls the mount itself made. */
async function renderOnSlideOne(texts: string[]) {
  const onActiveSlideChange = vi.fn();
  const screen = await render(Outliner, {
    outline: outlineWith(texts),
    activeSlide: 1,
    onActiveSlideChange,
    editable: true,
  });
  await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
  await vi.waitFor(() => {
    expect(activeItemTexts()).toEqual([texts[0]]);
  });
  onActiveSlideChange.mockClear();
  return { screen, onActiveSlideChange };
}

describe('Outliner activeSlide sync', () => {
  it('moves the caret to the requested group without reporting it back', async () => {
    const { screen, onActiveSlideChange } = await renderOnSlideOne([
      'one',
      '---',
      'two',
      '---',
      'three',
    ]);

    await screen.rerender({ activeSlide: 3 });

    await vi.waitFor(() => {
      expect(activeItemTexts()).toEqual(['three']);
    });
    expect(onActiveSlideChange).not.toHaveBeenCalled();
  });

  // An empty group is the case the suppression exists for: `findGroupPosition`
  // has no item to aim at and falls back to the group's range start, which is
  // also the previous group's range end. Reporting the resulting caret back out
  // would fight the change's origin over which slide is active.
  it('holds an empty note group between consecutive separators', async () => {
    const { screen, onActiveSlideChange } = await renderOnSlideOne(['one', '---', '---', 'three']);

    await screen.rerender({ activeSlide: 2 });

    // Group 2 has no items of its own, so nothing is marked — and crucially the
    // mark does not fall back onto group 1's "one".
    await vi.waitFor(() => {
      expect(activeItemTexts()).toEqual([]);
    });
    expect(onActiveSlideChange).not.toHaveBeenCalled();
  });

  it('still reports a caret move the user makes inside the editor', async () => {
    const { screen, onActiveSlideChange } = await renderOnSlideOne([
      'one',
      '---',
      'two',
      '---',
      'three',
    ]);

    await screen.getByText('three').click();

    await vi.waitFor(() => {
      expect(onActiveSlideChange).toHaveBeenCalledWith(3);
    });
  });
});
