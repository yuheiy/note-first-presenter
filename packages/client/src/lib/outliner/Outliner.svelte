<script lang="ts">
    import { baseKeymap } from "prosemirror-commands";
    import { history, redo, undo } from "prosemirror-history";
    import { keymap } from "prosemirror-keymap";
    import { splitListItem } from "prosemirror-schema-list";
    import { EditorState } from "prosemirror-state";
    import { EditorView } from "prosemirror-view";
    import { untrack } from "svelte";
    import Bowser from "bowser";
    import { computeActiveSlide } from "./active-slide";
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
        editable?: boolean;
    }

    const props: Props = $props();

    let mountEl: HTMLDivElement | undefined = $state();
    let view: EditorView | null = null;

    $effect(() => {
        if (!mountEl) return;
        const isMac =
            typeof navigator !== "undefined" &&
            Bowser.getParser(navigator.userAgent).getOSName() === "macOS";
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
                // Editor root only; repeated inner nodes stay in the scoped CSS below.
                class: "min-h-full whitespace-pre-wrap outline-none",
            },
            dispatchTransaction(tr) {
                const next = editor.state.apply(tr);
                editor.updateState(next);
                if (tr.docChanged) props.onChange?.(next.doc.toJSON());
                if (tr.docChanged || tr.selectionSet) {
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
</script>

<div bind:this={mountEl} class="outliner-root text-gray-900 contents"></div>

<style>
    .outliner-root :global .ProseMirror {
        padding: 1rem;
        min-height: 100%;
        font-size: 1.25rem;
        line-break: strict;

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
