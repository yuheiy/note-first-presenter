import { describe, expect, it, vi } from 'vite-plus/test';
import { render } from 'vitest-browser-svelte';
import SlideList from '../SlideList.svelte';

function renderList(props: { pageCount?: number; activeSlide?: number } = {}) {
  const onSelect = vi.fn();
  const screen = render(SlideList, {
    hash: 'testhash',
    pageCount: props.pageCount ?? 10,
    overflowStart: 1, // 全項目をプレースホルダ描画にし、/api/slide への画像取得を防ぐ
    activeSlide: props.activeSlide ?? 3,
    onSelect,
  });
  return { screen, onSelect };
}

function pressOnListbox(screen: ReturnType<typeof render>, key: string) {
  const listbox = screen.getByRole('listbox').element();
  listbox.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('SlideList', () => {
  describe('rendering', () => {
    it('renders one option per slide', async () => {
      const { screen } = renderList({ pageCount: 3 });
      await expect.element(screen.getByRole('listbox')).toBeInTheDocument();
      const options = screen.getByRole('option');
      expect(options.elements().length).toBe(3);
    });
  });

  describe('keyboard navigation on listbox', () => {
    it('ArrowDown moves to next slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'ArrowDown');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(4);
    });

    it('ArrowUp moves to previous slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'ArrowUp');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('PageDown moves +5', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'PageDown');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(8);
    });

    it('PageUp moves -5, clamped at lower bound', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'PageUp');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('Home moves to first slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'Home');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it('End moves to last slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'End');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(10);
    });

    it('ArrowUp does nothing when already at first slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 1 });
      pressOnListbox(screen, 'ArrowUp');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Home does nothing when already at first slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 1 });
      pressOnListbox(screen, 'Home');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('ArrowDown does nothing when already at last slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 10, pageCount: 10 });
      pressOnListbox(screen, 'ArrowDown');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('End does nothing when already at last slide', () => {
      const { screen, onSelect } = renderList({ activeSlide: 10, pageCount: 10 });
      pressOnListbox(screen, 'End');
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('PageDown clamps to upper bound', () => {
      const { screen, onSelect } = renderList({ activeSlide: 8, pageCount: 10 });
      pressOnListbox(screen, 'PageDown');
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(10);
    });

    it('unrelated key does nothing', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      pressOnListbox(screen, 'a');
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('keyboard activation on option items', () => {
    it('Enter on an option calls onSelect with that slide number', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      const options = screen.getByRole('option');
      const secondOption = options.nth(1).element();
      secondOption.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('Space on an option calls onSelect with that slide number', () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      const options = screen.getByRole('option');
      const secondOption = options.nth(1).element();
      secondOption.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      );
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(2);
    });

    it('click on an option calls onSelect with that slide number', async () => {
      const { screen, onSelect } = renderList({ activeSlide: 3 });
      const options = screen.getByRole('option');
      await options.nth(4).click();
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(5);
    });
  });
});
