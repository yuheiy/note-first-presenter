<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import type { ActiveSlideStore } from '$lib/active-slide/active-slide-store.svelte';
	import { countNoteGroups } from '$lib/outliner/count-groups';
	import { m } from '$lib/paraglide/messages';
	import SlideList from '$lib/slide-list/SlideList.svelte';
	import SlideListErrorOverlay from '$lib/slide-status/SlideListErrorOverlay.svelte';
	import SlideListHint from '$lib/slide-status/SlideListHint.svelte';
	import type { SlidesMetaStore } from '$lib/slides-meta/slides-meta-store.svelte';
	import { SyncPublisher } from '$lib/sync/sync-publisher';
	import { ThemeStore } from '$lib/theme/theme-store.svelte';

	const LIST_OPEN_KEY = 'nfp:listOpen';

	interface Props {
		docTitle: string;
		outline: unknown;
		ready: boolean;
		loadFailed?: boolean;
		meta: SlidesMetaStore;
		active: ActiveSlideStore;
		titleArea: Snippet;
		outliner: Snippet;
	}

	const {
		docTitle,
		outline,
		ready,
		loadFailed = false,
		meta,
		active,
		titleArea,
		outliner,
	}: Props = $props();

	const theme = new ThemeStore();
	const publisher = new SyncPublisher();

	let listOpen: boolean = $state(true);

	const groupCount = $derived(countNoteGroups(outline));
	const pdfCount = $derived(meta.data?.kind === 'resolved' ? meta.data.pageCount : 0);
	const effectivePageCount = $derived(Math.max(pdfCount, groupCount));

	onMount(() => {
		theme.hydrate();
		const stopSystem = theme.listenSystem();
		active.hydrate();
		listOpen = (localStorage.getItem(LIST_OPEN_KEY) ?? 'true') === 'true';
		return () => {
			stopSystem();
			publisher.destroy();
		};
	});

	$effect(() => {
		theme.persist();
	});

	$effect(() => {
		theme.applyToDocument();
	});

	$effect(() => {
		localStorage.setItem(LIST_OPEN_KEY, String(listOpen));
	});

	$effect(() => {
		active.syncToUrl();
	});

	$effect(() => {
		publisher.publishActiveSlide(active.value);
	});

	$effect(() => {
		publisher.publishPageCount(effectivePageCount);
	});

	function onSelectFromList(n: number) {
		active.setFromList(n);
	}
</script>

<svelte:head>
	<title>{docTitle}</title>
</svelte:head>

<header>
	{@render titleArea()}
	<a href={`/slideshow?slide=${active.value}`} target="nfp-slideshow">
		{m.open_slideshow()}
	</a>
	<fieldset role="radiogroup" aria-label={m.theme_label()}>
		<label
			><input type="radio" bind:group={theme.mode} value="system" />
			{m.theme_system()}</label
		>
		<label
			><input type="radio" bind:group={theme.mode} value="light" />
			{m.theme_light()}</label
		>
		<label
			><input type="radio" bind:group={theme.mode} value="dark" />
			{m.theme_dark()}</label
		>
	</fieldset>
	<button
		type="button"
		onclick={() => (listOpen = !listOpen)}
		aria-expanded={listOpen}
		aria-label={m.toggle_slide_list()}
	>
		☰
	</button>
</header>

<main class:list-open={listOpen}>
	<section class="outliner-pane">
		{#if loadFailed}
			<SlideListErrorOverlay message={m.load_error()} />
		{:else if ready}
			{@render outliner()}
		{/if}
	</section>
	{#if listOpen}
		<aside class="list-pane">
			{#if !ready}
				<SlideListHint message="…" />
			{:else if meta.data?.kind === 'resolved'}
				<SlideList
					hash={meta.data.hash}
					pageCount={effectivePageCount}
					overflowStart={pdfCount + 1}
					activeSlide={active.value}
					onSelect={onSelectFromList}
				/>
			{:else if meta.data?.kind === 'no-config-no-file'}
				<SlideListHint message={m.info_no_slides()} />
			{:else if meta.data?.kind === 'configured-but-missing'}
				<SlideListErrorOverlay
					message={m.error_slides_not_found({
						path: meta.data.configuredPath,
					})}
				/>
			{:else if meta.data?.kind === 'no-config-multiple-files'}
				<SlideListErrorOverlay
					message={m.error_multiple_pdfs({
						files: meta.data.candidates.join(', '),
					})}
				/>
			{:else if meta.error}
				<SlideListErrorOverlay message={meta.error} />
			{/if}
		</aside>
	{/if}
</main>

<style>
	header {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem;
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
	}
	header fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	main {
		display: grid;
		grid-template-columns: 1fr;
		height: calc(100vh - 56px);
	}
	main.list-open {
		grid-template-columns: 1fr 280px;
	}
	.outliner-pane {
		overflow: auto;
		padding: 1rem;
		min-width: 240px;
		position: relative;
	}
	.list-pane {
		overflow: auto;
		border-left: 1px solid var(--color-border);
		min-width: 240px;
		position: relative;
	}
</style>
