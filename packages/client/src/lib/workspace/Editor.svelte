<script lang="ts">
	import { onMount } from 'svelte';
	import { ActiveSlideStore } from '$lib/active-slide/active-slide-store.svelte';
	import { DbStore } from '$lib/db/client.svelte';
	import { defaultDb, type DbV1 } from '$lib/db/schema';
	import Outliner from '$lib/outliner/Outliner.svelte';
	import { m } from '$lib/paraglide/messages';
	import { api } from '$lib/server-client';
	import { onSlidesChanged } from '$lib/slides-meta/live-reload';
	import { SlidesMetaStore } from '$lib/slides-meta/slides-meta-store.svelte';
	import Workspace from './Workspace.svelte';

	const db = new DbStore({
		initial: defaultDb(),
		save: (state) => api('/api/db', { method: 'PUT', body: state }),
	});
	const meta = new SlidesMetaStore();
	const active = new ActiveSlideStore();

	let ready: boolean = $state(false);
	let loadFailed: boolean = $state(false);

	onMount(() => {
		void (async () => {
			try {
				const [dbData] = await Promise.all([api('/api/db'), meta.load()]);
				db.replace(dbData as DbV1);
				if (db.state.title === '') db.setTitle(m.title_default());
				ready = true;
			} catch {
				loadFailed = true;
			}
		})();
		// Refresh slides in place when the CLI reports a PDF/config change,
		// instead of a full reload that would discard the outline editing state.
		return onSlidesChanged(() => {
			void meta.load();
		});
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
</script>

<Workspace docTitle={db.state.title} outline={db.state.outline} {ready} {loadFailed} {meta} {active}>
	{#snippet titleArea()}
		<input
			type="text"
			value={db.state.title}
			oninput={onTitleInput}
			onblur={onTitleBlur}
			aria-label={m.title_label()}
			class="min-w-50 flex-1 text-[1.25rem] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		/>
		{#if db.saveStatus === 'error'}
			<span role="alert" aria-live="polite" class="text-[0.85rem] text-red-600">{m.save_error()}</span
			>
		{/if}
	{/snippet}
	{#snippet outliner()}
		<Outliner
			outline={db.state.outline}
			onChange={onOutlineChange}
			onActiveSlideChange={onActiveSlideFromEditor}
			editable={true}
		/>
	{/snippet}
</Workspace>
