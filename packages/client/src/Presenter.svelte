<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { onMount } from 'svelte';
	import { ActiveSlideStore } from '#lib/active-slide/active-slide-store.svelte';
	import { DbStore } from '#lib/db/client.svelte';
	import { defaultDb, type DbV1 } from '#lib/db/schema';
	import { countNoteGroups } from '#lib/outliner/count-groups';
	import Outliner from '#lib/outliner/Outliner.svelte';
	import { m } from '#lib/paraglide/messages';
	import { dbUrl, isStatic } from '#lib/runtime-mode';
	import { api } from '#lib/server-client';
	import SlideList from '#lib/slide-list/SlideList.svelte';
	import SlideListErrorOverlay from '#lib/slide-status/SlideListErrorOverlay.svelte';
	import SlideListHint from '#lib/slide-status/SlideListHint.svelte';
	import { SlidesMetaStore } from '#lib/slides-meta/slides-meta-store.svelte';
	import { SyncPublisher } from '#lib/sync/sync-publisher';
	import { ThemeStore } from '#lib/theme/theme-store.svelte';

	const LIST_OPEN_KEY = 'nfp:listOpen';

	const db = new DbStore({
		initial: defaultDb(),
		save: (state) => (isStatic ? Promise.resolve() : api('/api/db', { method: 'PUT', body: state })),
	});
	const meta = new SlidesMetaStore();
	const active = new ActiveSlideStore();
	const theme = new ThemeStore();
	const publisher = new SyncPublisher();

	let listOpen: boolean = $state(true);
	let ready: boolean = $state(false);

	const groupCount = $derived(countNoteGroups(db.state.outline));
	const pdfCount = $derived(meta.data?.status === 'resolved' ? meta.data.pageCount : 0);
	const effectivePageCount = $derived(Math.max(pdfCount, groupCount));

	onMount(() => {
		theme.hydrate();
		const stopSystem = theme.listenSystem();
		active.hydrate();
		listOpen = (localStorage.getItem(LIST_OPEN_KEY) ?? 'true') === 'true';
		void (async () => {
			const initial = (await api(dbUrl())) as DbV1;
			db.replace(initial);
			if (!isStatic && db.state.title === '') db.setTitle(m.title_default());
			await meta.load();
			ready = true;
		})();
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
		if (BROWSER) localStorage.setItem(LIST_OPEN_KEY, String(listOpen));
	});

	$effect(() => {
		active.syncToUrl();
	});

	$effect(() => {
		publisher.publishActiveSlide(active.value);
	});

	function onTitleInput(e: Event & { currentTarget: HTMLInputElement }) {
		db.setTitle(e.currentTarget.value);
	}

	function onTitleBlur() {
		if (db.state.title === '') db.setTitle(m.title_default());
	}

	function onOutlineChange(outline: unknown) {
		db.setOutline(outline);
	}

	function onActiveSlideFromEditor(n: number) {
		active.setFromEditor(n);
	}

	function onSelectFromList(n: number) {
		active.setFromList(n);
	}
</script>

<header>
	<input
		type="text"
		value={isStatic && db.state.title === '' ? m.title_default() : db.state.title}
		oninput={onTitleInput}
		onblur={onTitleBlur}
		aria-label={m.title_label()}
		readonly={isStatic}
	/>
	{#if db.saveStatus === 'error'}
		<span role="alert" aria-live="polite" class="error">{m.save_error()}</span>
	{/if}
	<a href={`/slideshow?slide=${active.value}`} target="nfp-slideshow" rel="noopener">
		{m.open_slideshow()}
	</a>
	<fieldset role="radiogroup" aria-label={m.theme_label()}>
		<label><input type="radio" bind:group={theme.mode} value="system" /> {m.theme_system()}</label>
		<label><input type="radio" bind:group={theme.mode} value="light" /> {m.theme_light()}</label>
		<label><input type="radio" bind:group={theme.mode} value="dark" /> {m.theme_dark()}</label>
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
		{#if ready}
			<Outliner
				outline={db.state.outline}
				onChange={onOutlineChange}
				onActiveSlideChange={onActiveSlideFromEditor}
				editable={!isStatic}
			/>
		{/if}
	</section>
	{#if listOpen}
		<aside class="list-pane">
			{#if !ready}
				<SlideListHint message="…" />
			{:else if meta.data?.status === 'resolved'}
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
					message={m.error_slides_not_found({ path: meta.data.configuredPath })}
				/>
			{:else if meta.data?.kind === 'no-config-multiple-files'}
				<SlideListErrorOverlay
					message={m.error_multiple_pdfs({ files: meta.data.candidates.join(', ') })}
				/>
			{:else if meta.error}
				<SlideListErrorOverlay message={meta.error} />
			{/if}
		</aside>
	{/if}
</main>

<style>
	:global(html, body) {
		height: 100%;
	}
	header {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem;
		border-bottom: 1px solid var(--color-border);
		flex-wrap: wrap;
	}
	header input[type='text'] {
		flex: 1;
		min-width: 200px;
		font-size: 1.25rem;
		font-weight: 600;
		border: none;
		background: transparent;
		color: inherit;
	}
	header input[type='text']:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}
	header fieldset {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	.error {
		color: #dc2626;
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
	}
	.list-pane {
		overflow: auto;
		border-left: 1px solid var(--color-border);
		min-width: 240px;
		position: relative;
	}
</style>
