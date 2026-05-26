<script lang="ts">
	import '../app.css';
	import { ThemeStore } from '$lib/theme/theme-store.svelte';

	const { children } = $props();
	const theme = new ThemeStore();

	$effect(() => {
		theme.hydrate();
		return theme.listenSystem();
	});

	$effect(() => {
		theme.persist();
	});

	$effect(() => {
		theme.applyToDocument();
	});
</script>

{@render children?.()}
