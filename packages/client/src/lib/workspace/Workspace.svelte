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
		active.hydrate();
		listOpen = (localStorage.getItem(LIST_OPEN_KEY) ?? 'true') === 'true';
		return () => {
			publisher.destroy();
		};
	});

	$effect(() => {
		theme.persist();
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

<header class="flex flex-wrap items-center gap-2 border-b border-border p-2">
	{@render titleArea()}
	<a href={`/slideshow?slide=${active.value}`} target="nfp-slideshow">
		{m.open_slideshow()}
	</a>
	<fieldset
		role="radiogroup"
		aria-label={m.theme_label()}
		class="flex gap-2 text-[0.85rem]"
	>
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

<main
	class={[
		'grid h-[calc(100vh-56px)]',
		listOpen ? 'grid-cols-[1fr_280px]' : 'grid-cols-[1fr]',
	]}
>
	<section class="relative min-w-60 overflow-auto p-4">
		{#if loadFailed}
			<SlideListErrorOverlay message={m.load_error()} />
		{:else if ready}
			{@render outliner()}
		{/if}
	</section>
	{#if listOpen}
		<aside class="relative min-w-60 overflow-auto border-l border-border">
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
