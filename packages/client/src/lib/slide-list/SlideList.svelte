<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import SlideImage from '$lib/slide-image/SlideImage.svelte';

	interface Props {
		hash: string;
		pageCount: number;
		overflowStart: number;
		activeSlide: number;
		onSelect: (n: number) => void;
	}

	const { hash, pageCount, overflowStart, activeSlide, onSelect }: Props = $props();

	const slides = $derived(Array.from({ length: pageCount }, (_, i) => i + 1));

	function step(delta: number) {
		const target = Math.min(pageCount, Math.max(1, activeSlide + delta));
		if (target !== activeSlide) onSelect(target);
	}

	function onkeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				step(1);
				e.preventDefault();
				break;
			case 'ArrowUp':
				step(-1);
				e.preventDefault();
				break;
			case 'Home':
				if (activeSlide !== 1) onSelect(1);
				e.preventDefault();
				break;
			case 'End':
				if (activeSlide !== pageCount) onSelect(pageCount);
				e.preventDefault();
				break;
			case 'PageDown':
				step(5);
				e.preventDefault();
				break;
			case 'PageUp':
				step(-5);
				e.preventDefault();
				break;
		}
	}
</script>

<ul
	role="listbox"
	aria-label="Slides"
	tabindex="0"
	{onkeydown}
	class="flex flex-col gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
>
	{#each slides as n (n)}
		<li
			role="option"
			aria-selected={n === activeSlide}
			tabindex={n === activeSlide ? 0 : -1}
			class="grid cursor-pointer grid-cols-[1fr] gap-1 p-1 aria-selected:outline-2 aria-selected:outline-accent"
			onclick={() => onSelect(n)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					onSelect(n);
					e.preventDefault();
				}
			}}
		>
			{#if n < overflowStart}
				<SlideImage {hash} slide={n} alt={`Slide ${n}`} />
			{:else}
				<div
					class="grid aspect-video place-items-center border border-dashed border-border text-[0.85em] text-muted"
				>
					{m.overflow_label({ n })}
				</div>
			{/if}
			<span class="text-[0.85em] text-muted">Slide {n}</span>
		</li>
	{/each}
</ul>
