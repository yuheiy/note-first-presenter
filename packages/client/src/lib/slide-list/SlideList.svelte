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
	class="group flex flex-col scroll-p-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
>
	{#each slides as n (n)}
		<li
			role="option"
			aria-selected={n === activeSlide}
			tabindex={n === activeSlide ? 0 : -1}
			class="flex shrink-0 items-start gap-2 rounded-lg p-3 aria-selected:bg-blue-200"
			onclick={() => onSelect(n)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					onSelect(n);
					e.preventDefault();
				}
			}}
		>
			{#if n < overflowStart}
				<div class="min-w-0 flex-1 shadow-sm">
					<SlideImage {hash} slide={n} alt={`Slide ${n}`} />
				</div>
			{:else}
				<div
					class="min-w-0 flex-1 grid aspect-video place-items-center border border-dashed border-gray-200 text-[0.85em] text-gray-500"
				>
					{m.overflow_label({ n })}
				</div>
			{/if}
			<span
				class={[
					'min-w-6 text-right text-sm leading-none',
					n === activeSlide ? 'font-semibold text-blue-700' : 'text-gray-400',
				]}
			>
				{n}
			</span>
		</li>
	{/each}
</ul>
