// The activeSlide sync is a two-way binding: the editor reports the caret's note
// group outward, and an outside change (slide list, slideshow) moves the caret
// inward. These tests pin the echo suppression that keeps the inward move from
// being reported straight back out.

import { tick } from 'svelte';
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

/**
 * Render, wait until the decoration settles on `settledMarks`, then forget the
 * calls the mount itself made so each test starts from a clean spy.
 */
async function renderOutliner(texts: string[], activeSlide: number, settledMarks: string[]) {
  const onActiveSlideChange = vi.fn();
  const screen = await render(Outliner, {
    outline: outlineWith(texts),
    activeSlide,
    onActiveSlideChange,
    editable: true,
  });
  await expect.element(screen.getByRole('textbox', { name: 'Outliner' })).toBeInTheDocument();
  await vi.waitFor(() => {
    expect(activeItemTexts()).toEqual(settledMarks);
  });
  onActiveSlideChange.mockClear();
  return { screen, onActiveSlideChange };
}

describe('Outliner activeSlide sync', () => {
  it('moves the caret to the requested group without reporting it back', async () => {
    const { screen, onActiveSlideChange } = await renderOutliner(
      ['one', '---', 'two', '---', 'three'],
      1,
      ['one'],
    );

    await screen.rerender({ activeSlide: 3 });

    await vi.waitFor(() => {
      expect(activeItemTexts()).toEqual(['three']);
    });
    expect(onActiveSlideChange).not.toHaveBeenCalled();
  });

  // Empty groups are what the suppression exists for: `findGroupPosition` has no
  // item to aim at and falls back to the group's range start. `Selection.near`
  // then snaps forward, so where the caret lands — and which group it reads as —
  // depends on what follows that raw position.
  it('holds an empty note group between consecutive separators', async () => {
    const { screen, onActiveSlideChange } = await renderOutliner(
      ['one', '---', '---', 'three'],
      1,
      ['one'],
    );

    await screen.rerender({ activeSlide: 2 });

    // Group 2 has no items of its own, so nothing is marked — and crucially the
    // mark does not fall back onto group 1's "one".
    await vi.waitFor(() => {
      expect(activeItemTexts()).toEqual([]);
    });
    expect(onActiveSlideChange).not.toHaveBeenCalled();
  });

  // The case that genuinely disagrees: a leading separator makes group 1 empty
  // with a range start of 0, so the forward snap lands in the separator's own
  // paragraph — which reads as group 2. The caret can't do better (an empty
  // group has nowhere to sit), but suppression keeps that reading from going
  // out: unsuppressed, asking for slide 1 is answered with "2" and the
  // selection is pushed off the slide the user picked.
  it('keeps the picked slide when a leading separator empties the first group', async () => {
    const { screen, onActiveSlideChange } = await renderOutliner(['---', 'b'], 2, ['b']);

    await screen.rerender({ activeSlide: 1 });

    // No decoration change to wait on here — the caret stays in group 2 either
    // way — so settle the effect explicitly before asserting on the silence.
    await tick();
    expect(onActiveSlideChange).not.toHaveBeenCalled();
  });

  it('still reports a caret move the user makes inside the editor', async () => {
    const { screen, onActiveSlideChange } = await renderOutliner(
      ['one', '---', 'two', '---', 'three'],
      1,
      ['one'],
    );

    await screen.getByText('three').click();

    await vi.waitFor(() => {
      expect(onActiveSlideChange).toHaveBeenCalledWith(3);
    });
  });
});
