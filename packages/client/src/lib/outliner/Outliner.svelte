<script lang="ts">
    import { baseKeymap, macBaseKeymap } from "prosemirror-commands";
    import { history, redo, undo } from "prosemirror-history";
    import { keymap } from "prosemirror-keymap";
    import { splitListItem } from "prosemirror-schema-list";
    import { EditorState, Selection } from "prosemirror-state";
    import { EditorView } from "prosemirror-view";
    import { untrack } from "svelte";
    import {
        ACTIVE_SLIDE_ECHO_META,
        computeActiveSlide,
        findGroupPosition,
    } from "./active-slide";
    import { smartBackspace, smartDelete } from "./commands/backspace";
    import { duplicateItem } from "./commands/duplicate";
    import { collapseItem, expandItem } from "./commands/fold";
    import { moveItemDown, moveItemUp } from "./commands/move";
    import {
        rangeAwareLiftListItem,
        rangeAwareSinkListItem,
    } from "./commands/range-indent";
    import { rangeAwareSplitListItem } from "./commands/range-split";
    import {
        exitRangeSelection,
        extendRangeSelectionDown,
        extendRangeSelectionUp,
    } from "./commands/range-select";
    import { activeSlideDecorations } from "./plugins/active-slide-decorations";
    import { itemMultiSelectPlugin } from "./plugins/item-multi-select";
    import { clipboardPlugin } from "./plugins/clipboard";
    import { pasteHandler } from "./plugins/paste";
    import { rangeSelectionDecorations } from "./plugins/range-selection-decorations";
    import { separatorDecorations } from "./plugins/separator-decorations";
    import { textSelectionClamp } from "./plugins/text-selection-clamp";
    import { outlinerSchema } from "./schema";
    import "./selections/node-range-selection";

    interface Props {
        outline: unknown;
        onChange?: (outline: unknown) => void;
        onActiveSlideChange: (n: number) => void;
        activeSlide: number;
        editable?: boolean;
    }

    const props: Props = $props();

    // Reuse ProseMirror's own platform detection instead of a second detector:
    // prosemirror-commands sets `baseKeymap = mac ? macBaseKeymap : pcBaseKeymap`,
    // so this identity check always agrees with the `Mod-` normalization that
    // prosemirror-keymap applies to the bindings below.
    const isMac = baseKeymap === macBaseKeymap;

    let mountEl: HTMLDivElement | undefined = $state();
    let view: EditorView | null = $state(null);

    $effect(() => {
        if (!mountEl) return;
        // Build the initial EditorState untracked: if this read of `props.outline`
        // were reactive, every outline edit would recreate the editor and drop
        // focus mid-typing.
        const initialState = untrack(() =>
            EditorState.create({
                schema: outlinerSchema,
                doc: outlinerSchema.nodeFromJSON(props.outline),
                plugins: [
                    history(),
                    keymap({
                        Enter: (state, dispatch, view) =>
                            rangeAwareSplitListItem(state, dispatch, view) ||
                            splitListItem(outlinerSchema.nodes.list_item)(
                                state,
                                dispatch,
                                view,
                            ),
                        Tab: rangeAwareSinkListItem,
                        "Shift-Tab": rangeAwareLiftListItem,
                        Backspace: smartBackspace,
                        Delete: smartDelete,
                        "Mod-z": undo,
                        "Mod-Shift-z": redo,
                        "Ctrl-y": redo,
                        "Mod-ArrowUp": collapseItem,
                        "Mod-ArrowDown": expandItem,
                        "Mod-Shift-d": duplicateItem,
                        "Shift-ArrowUp": extendRangeSelectionUp,
                        "Shift-ArrowDown": extendRangeSelectionDown,
                        Escape: exitRangeSelection,
                        ...(isMac
                            ? {
                                  "Mod-Shift-ArrowUp": moveItemUp,
                                  "Mod-Shift-ArrowDown": moveItemDown,
                              }
                            : {
                                  "Alt-Shift-ArrowUp": moveItemUp,
                                  "Alt-Shift-ArrowDown": moveItemDown,
                              }),
                    }),
                    keymap(baseKeymap),
                    pasteHandler,
                    clipboardPlugin,
                    itemMultiSelectPlugin,
                    textSelectionClamp,
                    separatorDecorations,
                    activeSlideDecorations,
                    rangeSelectionDecorations,
                ],
            }),
        );
        const editor = new EditorView(mountEl, {
            state: initialState,
            editable: () => props.editable ?? true,
            attributes: {
                role: "textbox",
                "aria-multiline": "true",
                "aria-label": "Outliner",
            },
            dispatchTransaction(tr) {
                const next = editor.state.apply(tr);
                editor.updateState(next);
                if (tr.docChanged) props.onChange?.(next.doc.toJSON());
                if (
                    (tr.docChanged || tr.selectionSet) &&
                    !tr.getMeta(ACTIVE_SLIDE_ECHO_META)
                ) {
                    props.onActiveSlideChange(
                        computeActiveSlide(next.doc, next.selection),
                    );
                }
            },
        });
        view = editor;
        return () => {
            editor.destroy();
            view = null;
        };
    });

    // Move the caret to the matching note group when the active slide changes from
    // outside the editor (slide list, slideshow). No-op when the caret is already in
    // that group — the case right after an edit drove the change — which keeps the
    // editor<->slide sync from looping. Slides beyond the last note group (the slide
    // count can exceed the group count) have no position and are ignored.
    $effect(() => {
        const slide = props.activeSlide;
        const editor = view;
        if (!editor) return;
        const { state } = editor;
        if (computeActiveSlide(state.doc, state.selection) === slide) return;
        const pos = findGroupPosition(state.doc, slide);
        if (pos === null) return;
        const selection = Selection.near(state.doc.resolve(pos), 1);
        // Tag the caret move so dispatchTransaction doesn't report it back out —
        // the meta rides on the transaction itself, so the suppression can't be
        // widened or missed by anything else dispatching around it.
        editor.dispatch(
            state.tr
                .setSelection(selection)
                .setMeta(ACTIVE_SLIDE_ECHO_META, true),
        );
        // Smooth-scroll the group's first top-level item flush to the top of the outliner
        // panel. `pos` is that item's position, so resolve its DOM directly via nodeDOM (no
        // dependency on the active-slide decoration or its apply timing). We scroll
        // ourselves because ProseMirror's `tr.scrollIntoView()` does not work here — the
        // editor sits inside a `display: contents` wrapper.
        const groupEl = editor.nodeDOM(pos);
        if (groupEl instanceof Element) groupEl.scrollIntoView({ block: "start", behavior: "smooth" });
    });
</script>

<div bind:this={mountEl} class="outliner-root contents"></div>

<style>
    .outliner-root :global .ProseMirror {
        padding: 1rem;
        /* Trailing space so the last note group can scroll to the top — the same
           --scroll-tail the slide list uses, so the two panels' bottom spacing matches
           (set on the Workspace wrapper). */
        padding-bottom: var(--scroll-tail);
        min-height: 100%;
        font-size: 1.25rem;
        line-break: strict;
        text-autospace: normal;
        white-space: pre-wrap;
        text-spacing-trim: trim-start;
        outline: none;
        color: var(--color-gray-900);

        ul {
            padding-left: 1.5em;
            list-style-type: disc;
            counter-reset: slide 1;
        }
        li {
            padding-block: 0.25rem;
        }
        li:has(> ul) {
            padding-bottom: 0;
        }
        li > ul {
            margin-top: 0.25rem;
        }
        li::marker {
            color: var(--color-gray-300);
        }

        li.ProseMirror-selectednode,
        li[data-range-selected="true"] {
            background: color-mix(
                in srgb,
                var(--color-blue-600) 15%,
                transparent
            );
            border-radius: 4px;
        }

        /* While a NodeRangeSelection is active, suppress the native
           text-selection highlight and the caret so only the per-item
           range decoration shows. */
        &:has(li[data-range-selected="true"]) {
            caret-color: transparent;

            &::selection,
            & *::selection {
                background: transparent;
                color: inherit;
            }
        }

        /* Top-level separator `---` styling */
        > ul > li[data-separator="true"] {
            padding-block: 1rem;
            list-style-type: none;
            counter-increment: slide;

            > p {
                position: relative;
                color: var(--color-gray-400);
            }
            > p::before {
                content: counter(slide);
                position: absolute;
                right: 100%;
                top: 50%;
                transform: translateY(-50%);
                margin-right: 0.75rem;
                font-size: 0.75rem;
            }
        }

        /* Accent bar marking the top-level items of the active slide. The bar
           reaches back across the list's padding (1.5em) and the editor's own
           padding (1rem) so it sits flush against the container's left edge. */
        > ul > li[data-active-slide="true"] {
            position: relative;

            &::before {
                content: "";
                position: absolute;
                inset-block: 0;
                inset-inline-start: calc(-1.5em - 1rem);
                width: 3px;
                background: var(--color-blue-600);
            }
        }

        /* Collapse animation */
        li > ul {
            overflow: hidden;
            transition:
                height 200ms ease,
                opacity 200ms ease;

            @media (prefers-reduced-motion: reduce) {
                transition: none;
            }
        }
        li[data-collapsed="true"] > ul {
            display: none;
        }
    }
</style>
