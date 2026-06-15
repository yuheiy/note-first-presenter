<script lang="ts">
    import { onMount } from "svelte";
    import { ActiveSlideStore } from "$lib/active-slide/active-slide-store.svelte";
    import { m } from "$lib/paraglide/messages";
    import SlideImage from "$lib/slide-image/SlideImage.svelte";
    import SlideshowFallback from "$lib/slide-status/SlideshowFallback.svelte";
    import type { DbV1 } from "$lib/db/schema";
    import { dbUrl } from "$lib/runtime-mode";
    import { api } from "$lib/server-client";
    import { resolveSlideView } from "$lib/slides-meta/slide-view";
    import { SlidesMetaStore } from "$lib/slides-meta/slides-meta-store.svelte";
    import { SyncSubscriber } from "$lib/sync/sync-subscriber";

    const meta = new SlidesMetaStore();
    let title: string = $state("");
    const active = new ActiveSlideStore();
    const sub = new SyncSubscriber();

    let syncedPageCount: number = $state(0);

    const view = $derived(resolveSlideView(meta.data, meta.error));
    const pageCount = $derived(view.kind === "resolved" ? view.pageCount : 0);
    const hash = $derived(view.kind === "resolved" ? view.hash : null);
    const navigablePageCount = $derived(Math.max(pageCount, syncedPageCount));

    const fallbackMessage = $derived.by(() => {
        // Overflow is slideshow-specific: the deck resolved, but the active
        // slide points past the last PDF page.
        if (hash && active.value > pageCount) {
            return m.overflow_label({ n: active.value });
        }
        if (view.kind === "hint" || view.kind === "error") {
            return view.message;
        }
        return null;
    });

    function step(delta: number) {
        const target = Math.min(
            navigablePageCount,
            Math.max(1, active.value + delta),
        );
        if (target !== active.value) active.set(target);
    }

    function onKey(e: KeyboardEvent) {
        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
            case "PageDown":
                step(1);
                break;
            case " ":
                step(e.shiftKey ? -1 : 1);
                break;
            case "ArrowLeft":
            case "ArrowUp":
            case "PageUp":
                step(-1);
                break;
            case "Home":
                if (active.value !== 1) active.set(1);
                break;
            case "End":
                if (navigablePageCount && active.value !== navigablePageCount)
                    active.set(navigablePageCount);
                break;
            default:
                return;
        }
        e.preventDefault();
    }

    function onAdvanceClick() {
        step(1);
    }

    onMount(() => {
        active.hydrate();
        void meta.load();
        void api(dbUrl()).then((db) => {
            title = (db as DbV1).title;
        });
        const stop = sub.subscribe((msg) => {
            switch (msg.type) {
                case "active-slide":
                    active.set(msg.slide);
                    break;
                case "page-count":
                    syncedPageCount = msg.count;
                    break;
            }
        });
        return () => {
            stop();
            sub.destroy();
        };
    });

    $effect(() => {
        active.syncToUrl();
    });
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<svelte:window onkeydown={onKey} />
<svelte:body onclick={onAdvanceClick} />

<div class="h-svh bg-black">
    {#if hash && active.value <= pageCount}
        <SlideImage {hash} slide={active.value} alt={`Slide ${active.value}`} />
    {:else if fallbackMessage}
        <SlideshowFallback message={fallbackMessage} />
    {/if}
</div>
