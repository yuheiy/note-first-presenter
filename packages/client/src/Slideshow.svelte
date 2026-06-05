<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { onMount } from 'svelte';
	import { ActiveSlideStore } from '#lib/active-slide/active-slide-store.svelte';
	import { m } from '#lib/paraglide/messages';
	import SlideImage from '#lib/slide-image/SlideImage.svelte';
	import SlideshowFallback from '#lib/slide-status/SlideshowFallback.svelte';
	import { SlidesMetaStore } from '#lib/slides-meta/slides-meta-store.svelte';
	import { SyncSubscriber } from '#lib/sync/sync-subscriber';

	const CURSOR_HIDE_MS = 5000;

	const meta = new SlidesMetaStore();
	const active = new ActiveSlideStore();
	const sub = new SyncSubscriber();

	let cursorVisible: boolean = $state(true);
	let cursorTimer: ReturnType<typeof setTimeout> | null = null;

	const pageCount = $derived(meta.data?.status === 'resolved' ? meta.data.pageCount : 0);
	const hash = $derived(meta.data?.status === 'resolved' ? meta.data.hash : null);

	function resetCursor() {
		cursorVisible = true;
		if (cursorTimer) clearTimeout(cursorTimer);
		cursorTimer = setTimeout(() => (cursorVisible = false), CURSOR_HIDE_MS);
	}

	function step(delta: number) {
		const target = Math.min(pageCount, Math.max(1, active.value + delta));
		if (target !== active.value) active.set(target);
	}

	function onKey(e: KeyboardEvent) {
		resetCursor();
		if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) {
			step(1);
			e.preventDefault();
		} else if (e.key === ' ') {
			step(e.shiftKey ? -1 : 1);
			e.preventDefault();
		} else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
			step(-1);
			e.preventDefault();
		} else if (e.key === 'Home') {
			if (active.value !== 1) active.set(1);
			e.preventDefault();
		} else if (e.key === 'End') {
			if (pageCount && active.value !== pageCount) active.set(pageCount);
			e.preventDefault();
		}
	}

	function onAdvanceClick() {
		step(1);
	}

	onMount(() => {
		document.documentElement.dataset.theme = 'dark';
		active.hydrate();
		void meta.load();
		const stop = sub.subscribe((msg) => {
			if (msg.type === 'active-slide') active.set(msg.slide);
		});
		window.addEventListener('keydown', onKey);
		window.addEventListener('mousemove', resetCursor);
		resetCursor();
		return () => {
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('mousemove', resetCursor);
			stop();
			sub.destroy();
			if (cursorTimer) clearTimeout(cursorTimer);
		};
	});

	$effect(() => {
		if (BROWSER) active.syncToUrl();
	});
</script>

<svelte:body onclick={onAdvanceClick} />

<div class="slideshow" class:no-cursor={!cursorVisible}>
	{#if hash}
		<SlideImage {hash} slide={active.value} alt={`Slide ${active.value}`} />
	{:else if meta.data?.kind === 'no-config-no-file'}
		<SlideshowFallback message={m.info_no_slides()} />
	{:else if meta.data?.kind === 'configured-but-missing'}
		<SlideshowFallback message={m.error_slides_not_found({ path: meta.data.configuredPath })} />
	{:else if meta.data?.kind === 'no-config-multiple-files'}
		<SlideshowFallback message={m.error_multiple_pdfs({ files: meta.data.candidates.join(', ') })} />
	{:else if meta.error}
		<SlideshowFallback message={meta.error} />
	{/if}
</div>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #000;
		overflow: hidden;
	}
	.slideshow {
		background: #000;
		color: #fff;
		width: 100vw;
		height: 100vh;
		display: grid;
		place-items: center;
	}
	.slideshow.no-cursor {
		cursor: none;
	}
</style>
