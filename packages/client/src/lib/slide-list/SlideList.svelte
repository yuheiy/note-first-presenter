<script lang="ts">
    import { Listbox, createListCollection } from "@ark-ui/svelte/listbox";
    import { m } from "$lib/paraglide/messages";
    import SlideImage from "$lib/slide-image/SlideImage.svelte";

    interface Props {
        hash: string;
        pageCount: number;
        overflowStart: number;
        activeSlide: number;
        onSelect: (n: number) => void;
    }

    const { hash, pageCount, overflowStart, activeSlide, onSelect }: Props =
        $props();

    const collection = $derived(
        createListCollection({
            items: Array.from({ length: pageCount }, (_, i) => ({
                value: String(i + 1),
            })),
        }),
    );

    const value = $derived([String(activeSlide)]);
    const highlightedValue = $derived(String(activeSlide));

    function handleValueChange(details: { value: string[] }) {
        const selected = details.value[0];
        if (selected != null) onSelect(Number(selected));
    }

    function step(delta: number) {
        const target = Math.min(pageCount, Math.max(1, activeSlide + delta));
        if (target !== activeSlide) onSelect(target);
    }

    // ark-ui's vertical listbox navigates with ArrowUp/ArrowDown; mirror prev/next onto
    // the left/right arrows too. Routing through onSelect (selectOnHighlight + controlled
    // value/highlightedValue) keeps ark-ui's highlight in sync.
    function onContentKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowLeft") {
            step(-1);
            e.preventDefault();
        } else if (e.key === "ArrowRight") {
            step(1);
            e.preventDefault();
        }
    }

    let contentEl: HTMLElement | null = $state(null);
    let hasScrolled = false;

    // Keep the active slide scrolled into view within its nearest scrollable ancestor
    // (the parent panel) whenever it changes, uniformly for in-list keyboard navigation
    // and editor-side cursor moves. zag's built-in scroll pins its scroll root to
    // Listbox.Content and is suppressed during pointer interactions, so it doesn't work
    // with this app's layout (the scroll container is the parent element); do it here.
    $effect(() => {
        const target = contentEl?.querySelector<HTMLElement>(
            `[data-part="item"][data-value="${activeSlide}"]`,
        );
        if (!target) return;
        // Bring the active slide to the top of the panel (its scroll-padding-top keeps the
        // panel's own padding above it). The first scroll after the list mounts (page load
        // or panel re-open) is instant; later scrolls from navigation while the list is
        // open animate.
        target.scrollIntoView({ block: "start", behavior: hasScrolled ? "smooth" : "auto" });
        hasScrolled = true;
    });
</script>

<Listbox.Root
    {collection}
    {value}
    {highlightedValue}
    onValueChange={handleValueChange}
    selectionMode="single"
    selectOnHighlight
    deselectable={false}
    disallowSelectAll
    typeahead={false}
    loopFocus={false}
>
    <Listbox.Label class="sr-only">{m.slide_list_label()}</Listbox.Label>
    <Listbox.Content
        bind:ref={contentEl}
        onkeydown={onContentKeydown}
        class="group pb-[var(--scroll-tail)] outline-none"
    >
        {#each collection.items as item (item.value)}
            {@const n = Number(item.value)}
            <Listbox.Item
                {item}
                class="flex items-start gap-2 rounded-lg p-3 select-none group-focus-visible:data-[highlighted]:[outline:auto] group-focus-visible:data-[highlighted]:[outline:auto_-webkit-focus-ring-color] data-[state=checked]:bg-blue-200"
            >
                {#if n < overflowStart}
                    <div class="min-w-0 flex-1 aspect-[var(--slide-aspect)] shadow-sm">
                        <SlideImage {hash} slide={n} alt={`Slide ${n}`} />
                    </div>
                {:else}
                    <div
                        class="min-w-0 flex-1 grid aspect-[var(--slide-aspect)] place-items-center border border-dashed border-gray-200 text-sm text-gray-500"
                    >
                        {m.overflow_label({ n })}
                    </div>
                {/if}
                <span
                    class={[
                        "min-w-6 text-right text-sm",
                        n === activeSlide
                            ? "font-semibold text-blue-700"
                            : "text-gray-400",
                    ]}
                >
                    {n}
                </span>
            </Listbox.Item>
        {/each}
    </Listbox.Content>
</Listbox.Root>
