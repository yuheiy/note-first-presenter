<script lang="ts">
    import { onMount } from "svelte";
    import { ActiveSlideStore } from "$lib/active-slide/active-slide-store.svelte";
    import { m } from "$lib/paraglide/messages";
    import SlideImage from "$lib/slide-image/SlideImage.svelte";
    import SlideshowFallback from "$lib/slide-status/SlideshowFallback.svelte";
    import type { DbV1 } from "$lib/dbSchema";
    import { api } from "$lib/server-client";
    import { computeSlideOverflow } from "$lib/slide-overflow";
    import { SlidesMetaStore } from "$lib/slides-meta/slides-meta-store.svelte";
    import { SyncSubscriber } from "$lib/sync/sync-subscriber";

    const meta = new SlidesMetaStore();
    let title: string = $state("");
    const active = new ActiveSlideStore();
    const sub = new SyncSubscriber();

    let syncedPageCount: number = $state(0);

    const pageCount = $derived(
        meta.data?.kind === "resolved" ? meta.data.pageCount : 0,
    );
    const hash = $derived(
        meta.data?.kind === "resolved" ? meta.data.hash : null,
    );
    // The workspace publishes a page count that already accounts for note groups
    // past the PDF's last page, so the slideshow can be asked to navigate further
    // than its own meta reports.
    const overflow = $derived(computeSlideOverflow(pageCount, syncedPageCount));

    const fallbackMessage = $derived.by(() => {
        const d = meta.data;
        switch (true) {
            case !!hash && active.value >= overflow.overflowStart:
                return m.overflow_label({ n: active.value });
            case d?.kind === "no-config-no-file":
                return m.info_no_slides();
            case d?.kind === "configured-but-missing":
                return m.error_slides_not_found({
                    path: d.configuredPath,
                });
            case d?.kind === "no-config-multiple-files":
                return m.error_multiple_pdfs({
                    files: d.candidates.join(", "),
                });
            case !!meta.error:
                return meta.error;
            default:
                return null;
        }
    });

    function step(delta: number) {
        const target = Math.min(
            overflow.slideCount,
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
                if (
                    overflow.slideCount &&
                    active.value !== overflow.slideCount
                )
                    active.set(overflow.slideCount);
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
        void api("/nfp-data/db.json").then((db) => {
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
    {#if hash && active.value < overflow.overflowStart}
        <SlideImage {hash} slide={active.value} alt={`Slide ${active.value}`} />
    {:else if fallbackMessage}
        <SlideshowFallback message={fallbackMessage} />
    {/if}
</div>
