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

<ul role="listbox" aria-label="Slides" tabindex="0" {onkeydown}>
	{#each slides as n (n)}
		<li
			role="option"
			aria-selected={n === activeSlide}
			tabindex={n === activeSlide ? 0 : -1}
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
				<div class="placeholder">{m.overflow_label({ n })}</div>
			{/if}
			<span class="label">Slide {n}</span>
		</li>
	{/each}
</ul>

<style>
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	ul:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
	li {
		padding: 4px;
		cursor: pointer;
		display: grid;
		grid-template-columns: 1fr;
		gap: 4px;
	}
	li[aria-selected='true'] {
		outline: 2px solid var(--color-accent);
	}
	.label {
		font-size: 0.85em;
		color: var(--color-muted);
	}
	.placeholder {
		aspect-ratio: 16 / 9;
		display: grid;
		place-items: center;
		border: 1px dashed var(--color-border);
		color: var(--color-muted);
		font-size: 0.85em;
	}
</style>
