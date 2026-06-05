<script lang="ts">
	import './app.css';
	import { getLocale, getTextDirection } from '#lib/paraglide/runtime';
	import Presenter from './Presenter.svelte';
	import Slideshow from './Slideshow.svelte';

	document.documentElement.lang = getLocale();
	document.documentElement.dir = getTextDirection();

	const isSlideshow = location.pathname.startsWith('/slideshow');
</script>

{#if isSlideshow}
	<Slideshow />
{:else}
	<Presenter />
{/if}
