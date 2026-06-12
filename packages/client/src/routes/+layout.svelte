<script lang="ts">
	import { getLocale, getTextDirection } from '$lib/paraglide/runtime';

	let { children } = $props();

	document.documentElement.lang = getLocale();
	document.documentElement.dir = getTextDirection();
</script>

{@render children()}

<style>
	:global(:root[data-theme='light']) {
		--color-bg: #ffffff;
		--color-fg: #1a1a1a;
		--color-muted: #6a6a6a;
		--color-border: #e0e0e0;
		--color-accent: #2563eb;
	}
	:global(:root[data-theme='dark']) {
		--color-bg: #0a0a0a;
		--color-fg: #f0f0f0;
		--color-muted: #9a9a9a;
		--color-border: #2a2a2a;
		--color-accent: #60a5fa;
	}
	:global(html) {
		color-scheme: light dark;
		background: var(--color-bg);
		color: var(--color-fg);
	}
	:global(html, body) {
		height: 100%;
	}
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
</style>
