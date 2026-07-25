import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideList from '../SlideList.svelte';

async function renderList(props: { pageCount?: number; activeSlide?: number } = {}) {
  const onSelect = vi.fn();
  const screen = await render(SlideList, {
    hash: 'testhash',
    pageCount: props.pageCount ?? 10,
    overflowStart: 1, // render every item as a placeholder to avoid /nfp-data/slides image fetches
    activeSlide: props.activeSlide ?? 3,
    onSelect,
  });
  return { screen, onSelect };
}

function pressOnListbox(screen: Awaited<ReturnType<typeof render>>, key: string) {
  const listbox = screen.getByRole('listbox').element() as HTMLElement;
  listbox.focus();
  listbox.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('SlideList', () => {
  describe('rendering', () => {
    it('renders one option per slide', async () => {
      const { screen } = await renderList({ pageCount: 3 });
      await expect.element(screen.getByRole('listbox')).toBeInTheDocument();
      const options = screen.getByRole('option');
      expect(options.elements().length).toBe(3);
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowDown selects next slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'ArrowDown');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(4);
    });

    it('ArrowUp selects previous slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'ArrowUp');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('ArrowRight selects next slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'ArrowRight');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(4);
    });

    it('ArrowLeft selects previous slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'ArrowLeft');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('ArrowLeft does nothing when already at first slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 1 });
      pressOnListbox(screen, 'ArrowLeft');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ArrowRight does nothing when already at last slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 10, pageCount: 10 });
      pressOnListbox(screen, 'ArrowRight');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Home selects first slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'Home');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('End selects last slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'End');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(10);
    });

    it('ArrowUp does nothing when already at first slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 1 });
      pressOnListbox(screen, 'ArrowUp');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ArrowDown does nothing when already at last slide', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 10, pageCount: 10 });
      pressOnListbox(screen, 'ArrowDown');
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('pointer activation', () => {
    it('click on an option selects that slide number', async () => {
      const { screen, onSelect } = await renderList({ activeSlide: 3 });
      const options = screen.getByRole('option');
      await options.nth(4).click();
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(5);
    });
  });

  describe('scroll behavior', () => {
    it('scrolls the active item to the top instantly on mount', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      try {
        await renderList({ activeSlide: 5 });
        await vi.waitFor(() => expect(spy).toHaveBeenCalled());
        expect(spy.mock.calls.at(-1)?.[0]).toMatchObject({ block: 'start', behavior: 'auto' });
      } finally {
        spy.mockRestore();
      }
    });
  });
});
