<script lang="ts">
	import { onMount } from 'svelte';
	import { ActiveSlideStore } from '$lib/active-slide/active-slide-store.svelte';
	import { defaultDb, type DbV1 } from '$lib/db/schema';
	import Outliner from '$lib/outliner/Outliner.svelte';
	import { m } from '$lib/paraglide/messages';
	import { api } from '$lib/server-client';
	import { SlidesMetaStore } from '$lib/slides-meta/slides-meta-store.svelte';
	import Workspace from './Workspace.svelte';

	const meta = new SlidesMetaStore();
	const active = new ActiveSlideStore();

	let db: DbV1 = $state(defaultDb());
	let ready: boolean = $state(false);
	let loadFailed: boolean = $state(false);

	const displayTitle = $derived(db.title === '' ? m.title_default() : db.title);

	onMount(() => {
		void (async () => {
			try {
				const [dbData] = await Promise.all([api('/nfp-data/db.json'), meta.load()]);
				db = dbData as DbV1;
				ready = true;
			} catch {
				loadFailed = true;
			}
		})();
	});

	function onActiveSlideFromOutline(n: number) {
		active.setFromEditor(n);
	}
</script>

<Workspace docTitle={displayTitle} outline={db.outline} {ready} {loadFailed} {meta} {active}>
	{#snippet titleArea()}
		<h1 class="min-w-50 flex-1 text-[1.25rem] font-semibold">{displayTitle}</h1>
	{/snippet}
	{#snippet outliner()}
		<Outliner
			outline={db.outline}
			onActiveSlideChange={onActiveSlideFromOutline}
			editable={false}
		/>
	{/snippet}
</Workspace>
