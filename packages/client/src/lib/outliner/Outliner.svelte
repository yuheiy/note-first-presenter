<script lang="ts">
	import { baseKeymap } from 'prosemirror-commands';
	import { history, redo, undo } from 'prosemirror-history';
	import { keymap } from 'prosemirror-keymap';
	import { splitListItem } from 'prosemirror-schema-list';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { untrack } from 'svelte';
	import Bowser from 'bowser';
	import { computeActiveSlide } from './active-slide';
	import { smartBackspace, smartDelete } from './commands/backspace';
	import { duplicateItem } from './commands/duplicate';
	import { collapseItem, expandItem } from './commands/fold';
	import { moveItemDown, moveItemUp } from './commands/move';
	import { rangeAwareLiftListItem, rangeAwareSinkListItem } from './commands/range-indent';
	import { rangeAwareSplitListItem } from './commands/range-split';
	import {
		exitRangeSelection,
		extendRangeSelectionDown,
		extendRangeSelectionUp,
	} from './commands/range-select';
	import { itemMultiSelectPlugin } from './plugins/item-multi-select';
	import { clipboardPlugin } from './plugins/clipboard';
	import { pasteHandler } from './plugins/paste';
	import { rangeSelectionDecorations } from './plugins/range-selection-decorations';
	import { separatorDecorations } from './plugins/separator-decorations';
	import { textSelectionClamp } from './plugins/text-selection-clamp';
	import { outlinerSchema } from './schema';
	import './selections/node-range-selection';

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
			typeof navigator !== 'undefined' &&
			Bowser.getParser(navigator.userAgent).getOSName() === 'macOS';
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
							splitListItem(outlinerSchema.nodes.list_item)(state, dispatch, view),
						Tab: rangeAwareSinkListItem,
						'Shift-Tab': rangeAwareLiftListItem,
						Backspace: smartBackspace,
						Delete: smartDelete,
						'Mod-z': undo,
						'Mod-Shift-z': redo,
						'Ctrl-y': redo,
						'Mod-ArrowUp': collapseItem,
						'Mod-ArrowDown': expandItem,
						'Mod-Shift-d': duplicateItem,
						'Shift-ArrowUp': extendRangeSelectionUp,
						'Shift-ArrowDown': extendRangeSelectionDown,
						Escape: exitRangeSelection,
						...(isMac
							? {
									'Mod-Shift-ArrowUp': moveItemUp,
									'Mod-Shift-ArrowDown': moveItemDown,
								}
							: {
									'Alt-Shift-ArrowUp': moveItemUp,
									'Alt-Shift-ArrowDown': moveItemDown,
								}),
					}),
					keymap(baseKeymap),
					pasteHandler,
					clipboardPlugin,
					itemMultiSelectPlugin,
					textSelectionClamp,
					separatorDecorations,
					rangeSelectionDecorations,
				],
			}),
		);
		const editor = new EditorView(mountEl, {
			state: initialState,
			editable: () => props.editable ?? true,
			attributes: {
				role: 'textbox',
				'aria-multiline': 'true',
				'aria-label': 'Outliner',
			},
			dispatchTransaction(tr) {
				const next = editor.state.apply(tr);
				editor.updateState(next);
				if (tr.docChanged) props.onChange?.(next.doc.toJSON());
				if (tr.docChanged || tr.selectionSet) {
					props.onActiveSlideChange(computeActiveSlide(next.doc, next.selection));
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

<div bind:this={mountEl} class="outliner-root"></div>

<style>
	.outliner-root :global {
		ul {
			padding-left: 1.5em;
			margin: 0;
		}
		p {
			margin: 0;
		}
		li::marker {
			color: var(--color-muted);
		}
		.ProseMirror {
			outline: none;
			min-height: 100%;
			white-space: pre-wrap;
		}

		li.ProseMirror-selectednode,
		li[data-range-selected='true'] {
			background: color-mix(in srgb, var(--color-accent) 15%, transparent);
			border-radius: 4px;
		}

		/* While a NodeRangeSelection is active, suppress the native text-selection
		   highlight and the caret so only the per-item range decoration shows. */
		.ProseMirror:has(li[data-range-selected='true']) {
			caret-color: transparent;
		}
		.ProseMirror:has(li[data-range-selected='true'])::selection,
		.ProseMirror:has(li[data-range-selected='true']) *::selection {
			background: transparent;
			color: inherit;
		}

		/* Top-level separator `---` styling */
		> .ProseMirror > ul > li[data-separator='true'] {
			margin-block: 1.5em;
			color: var(--color-muted);
			position: relative;
		}
		> .ProseMirror > ul > li[data-separator='true']::before {
			content: '';
			position: absolute;
			inset: 50% 0 auto 1em;
			border-top: 1px dashed var(--color-border);
			z-index: -1;
		}
		> .ProseMirror > ul > li[data-separator='true']::after {
			content: attr(data-next-slide-label);
			position: absolute;
			right: 0;
			top: 50%;
			transform: translateY(-50%);
			padding-inline: 0.5em;
			background: var(--color-bg);
			font-size: 0.85em;
			color: var(--color-muted);
		}

		/* Collapse animation */
		li > ul {
			overflow: hidden;
			transition:
				height 200ms ease,
				opacity 200ms ease;
		}
		li[data-collapsed='true'] > ul {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.outliner-root :global(li > ul) {
			transition: none;
		}
	}
</style>
