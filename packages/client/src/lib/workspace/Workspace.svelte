<script lang="ts">
    import { onMount, type Snippet } from "svelte";
    import type { ActiveSlideStore } from "$lib/active-slide/active-slide-store.svelte";
    import { countNoteGroups } from "$lib/outliner/count-groups";
    import { m } from "$lib/paraglide/messages";
    import SlideList from "$lib/slide-list/SlideList.svelte";
    import SlideListErrorOverlay from "$lib/slide-status/SlideListErrorOverlay.svelte";
    import SlideListHint from "$lib/slide-status/SlideListHint.svelte";
    import type { SlidesMetaStore } from "$lib/slides-meta/slides-meta-store.svelte";
    import { SyncPublisher } from "$lib/sync/sync-publisher";
    import { ThemeStore } from "$lib/theme/theme-store.svelte";
    import PlayIcon from "phosphor-svelte/lib/PlayIcon";
    import SidebarSimpleIcon from "phosphor-svelte/lib/SidebarSimpleIcon";

    const LIST_OPEN_KEY = "nfp:listOpen";

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
    const pdfCount = $derived(
        meta.data?.kind === "resolved" ? meta.data.pageCount : 0,
    );
    const effectivePageCount = $derived(Math.max(pdfCount, groupCount));
    // Slide aspect ratio (width / height) from the actual PDF, falling back to 16:9
    // until the resolved meta provides real page dimensions. Drives --scroll-tail and
    // the overflow placeholders.
    const slideAspect = $derived(
        meta.data?.kind === "resolved" && meta.data.width && meta.data.height
            ? meta.data.width / meta.data.height
            : 16 / 9,
    );

    onMount(() => {
        theme.hydrate();
        active.hydrate();
        listOpen = (localStorage.getItem(LIST_OPEN_KEY) ?? "true") === "true";
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
        active.set(n);
    }
</script>

<svelte:head>
    <title>{m.page_title({ title: docTitle })}</title>
</svelte:head>

<!--
  --scroll-tail: trailing scroll space below the slide list and the outliner so the
  last slide (or note group) can be scrolled to the top — one panel height minus one
  slide's height (a thumbnail spanning the panel: 100cqw / aspect, plus a tuned +19.5px
  for fixed item chrome), minus the slide list's scroll-padding-top (scroll-p-1 =
  0.25rem) so the last slide rests where an active slide scrolls to. Clamped to >= 0 for
  portrait decks where a thumbnail is taller than the panel. Both panels use this same
  value so their bottom spacing matches. Resolves per scroll container via container-
  query units; the panels set `container-type: size`.
-->
<div
    class={[
        "grid h-svh grid-rows-[auto_1fr_auto]",
        listOpen ? "grid-cols-2" : "grid-cols-1",
        "[--scroll-tail:max(0px,calc(100cqh_-_100cqw/var(--slide-aspect)_+_19.5px_-_0.25rem))]",
    ]}
    style="--slide-aspect: {slideAspect}"
>
    <div
        class="col-span-full py-1 flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4"
    >
        {@render titleArea()}
        <a
            class="text-sm text-gray-800 min-w-8 min-h-7 flex items-center justify-center hover:bg-gray-200 transition duration-100 rounded"
            href={`/slideshow?slide=${active.value}`}
            target="nfp-slideshow"
            aria-label={m.open_slideshow()}
            title={m.open_slideshow()}
        >
            <PlayIcon size="1.25em" weight="duotone" />
        </a>
        <button
            type="button"
            class="min-w-8 min-h-7 text-sm text-gray-800 flex items-center justify-center hover:bg-gray-200 transition duration-100 rounded"
            onclick={() => (listOpen = !listOpen)}
            aria-expanded={listOpen}
            aria-label={m.toggle_slide_list()}
            title={m.toggle_slide_list()}
        >
            <SidebarSimpleIcon
                size="1.25em"
                weight={listOpen ? "duotone" : "regular"}
                mirrored
            />
        </button>
    </div>

    <div
        class="relative overflow-auto overscroll-none scroll-pt-4 [container-type:size]"
    >
        {#if loadFailed}
            <SlideListErrorOverlay message={m.load_error()} />
        {:else if ready}
            {@render outliner()}
        {/if}
    </div>

    {#if listOpen}
        <div
            class="overflow-y-auto overscroll-none border-l border-gray-200 bg-gray-50 p-1 scroll-p-1 [container-type:size]"
        >
            {#if !ready}
                <SlideListHint message="…" />
            {:else if meta.data?.kind === "resolved"}
                <SlideList
                    hash={meta.data.hash}
                    pageCount={effectivePageCount}
                    overflowStart={pdfCount + 1}
                    activeSlide={active.value}
                    onSelect={onSelectFromList}
                />
            {:else if meta.data?.kind === "no-config-no-file"}
                <SlideListHint message={m.info_no_slides()} />
            {:else if meta.data?.kind === "configured-but-missing"}
                <SlideListErrorOverlay
                    message={m.error_slides_not_found({
                        path: meta.data.configuredPath,
                    })}
                />
            {:else if meta.data?.kind === "no-config-multiple-files"}
                <SlideListErrorOverlay
                    message={m.error_multiple_pdfs({
                        files: meta.data.candidates.join(", "),
                    })}
                />
            {:else if meta.error}
                <SlideListErrorOverlay message={meta.error} />
            {/if}
        </div>
    {/if}

    <div
        class="col-span-full flex border-t border-gray-200 bg-gray-50 px-4 py-1"
    >
        <fieldset
            role="radiogroup"
            aria-label={m.theme_label()}
            class="flex gap-3 ml-auto"
        >
            <label
                class="flex items-center gap-1 p-1 -mx-1 text-gray-800 text-sm"
                ><input
                    type="radio"
                    name="theme"
                    bind:group={theme.mode}
                    value="system"
                />
                {m.theme_system()}</label
            >
            <label
                class="flex items-center gap-1 p-1 -mx-1 text-gray-800 text-sm"
                ><input
                    type="radio"
                    name="theme"
                    bind:group={theme.mode}
                    value="light"
                />
                {m.theme_light()}</label
            >
            <label
                class="flex items-center gap-1 p-1 -mx-1 text-gray-800 text-sm"
                ><input
                    type="radio"
                    name="theme"
                    bind:group={theme.mode}
                    value="dark"
                />
                {m.theme_dark()}</label
            >
        </fieldset>
    </div>
</div>
