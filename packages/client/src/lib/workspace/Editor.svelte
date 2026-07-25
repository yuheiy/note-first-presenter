<script lang="ts">
    import { onMount } from "svelte";
    import { ActiveSlideStore } from "$lib/active-slide/active-slide-store.svelte";
    import { DbStore } from "$lib/db/client.svelte";
    import { defaultDb, type DbV1 } from "$lib/db/schema";
    import Outliner from "$lib/outliner/Outliner.svelte";
    import { m } from "$lib/paraglide/messages";
    import { api } from "$lib/server-client";
    import { onSlidesChanged } from "$lib/slides-meta/live-reload";
    import { SlidesMetaStore } from "$lib/slides-meta/slides-meta-store.svelte";
    import Workspace from "./Workspace.svelte";

    const db = new DbStore({
        initial: defaultDb(),
        save: (state) =>
            api("/nfp-data/db.json", {
                method: "PUT",
                body: state,
                keepalive: true,
            }),
    });
    const meta = new SlidesMetaStore();
    const active = new ActiveSlideStore();

    let ready: boolean = $state(false);
    let loadFailed: boolean = $state(false);

    onMount(() => {
        void (async () => {
            try {
                const [dbData] = await Promise.all([
                    api("/nfp-data/db.json"),
                    meta.load(),
                ]);
                db.replace(dbData as DbV1);
                if (db.state.title === "") db.setTitle(m.title_default());
                ready = true;
            } catch {
                loadFailed = true;
            }
        })();
        // Refresh slides in place when the CLI reports a PDF/config change,
        // instead of a full reload that would discard the outline editing state.
        const offSlidesChanged = onSlidesChanged(() => {
            void meta.load();
        });

        // Flush any pending debounced save before the page is torn down,
        // so edits made within the debounce window aren't lost.
        const flushNow = () => void db.flush();
        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") flushNow();
        };
        window.addEventListener("pagehide", flushNow);
        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            offSlidesChanged();
            window.removeEventListener("pagehide", flushNow);
            document.removeEventListener(
                "visibilitychange",
                onVisibilityChange,
            );
        };
    });

    function onTitleInput(e: Event & { currentTarget: HTMLInputElement }) {
        db.setTitle(e.currentTarget.value);
    }

    function onTitleBlur() {
        if (db.state.title === "") db.setTitle(m.title_default());
    }

    function onOutlineChange(outline: unknown) {
        db.setOutline(outline);
    }

    function onActiveSlideFromEditor(n: number) {
        active.set(n);
    }
</script>

<Workspace
    docTitle={db.state.title}
    outline={db.state.outline}
    {ready}
    {loadFailed}
    {meta}
    {active}
>
    {#snippet titleArea()}
        <input
            type="text"
            value={db.state.title}
            oninput={onTitleInput}
            onblur={onTitleBlur}
            aria-label={m.title_label()}
            class="mr-auto field-sizing-content min-h-7 text-gray-800 -mx-1.5 px-1.5 text-sm hover:bg-gray-200 rounded transition focus:transition-none duration-100 focus:bg-white"
        />
        {#if db.saveStatus === "error"}
            <span role="alert" aria-live="polite" class="text-sm text-red-600"
                >{m.save_error()}</span
            >
        {/if}
    {/snippet}
    {#snippet outliner()}
        <Outliner
            outline={db.state.outline}
            onChange={onOutlineChange}
            onActiveSlideChange={onActiveSlideFromEditor}
            activeSlide={active.value}
            editable={true}
        />
    {/snippet}
</Workspace>
