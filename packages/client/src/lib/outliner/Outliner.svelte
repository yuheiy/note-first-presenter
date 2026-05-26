<script lang="ts">
	import { baseKeymap } from 'prosemirror-commands';
	import { history, redo, undo } from 'prosemirror-history';
	import { keymap } from 'prosemirror-keymap';
	import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { untrack } from 'svelte';
	import Bowser from 'bowser';
	import { computeActiveSlide } from './active-slide';
	import { smartBackspace, smartDelete } from './commands/backspace';
	import { duplicateItem } from './commands/duplicate';
	import { collapseItem, expandItem } from './commands/fold';
	import { moveItemDown, moveItemUp } from './commands/move';
	import {
		exitRangeSelection,
		extendRangeSelectionDown,
		extendRangeSelectionUp,
	} from './commands/range-select';
	import { bulletClickPlugin } from './plugins/bullet-click';
	import { clipboardPlugin } from './plugins/clipboard';
	import { pasteHandler } from './plugins/paste';
	import { separatorDecorations } from './plugins/separator-decorations';
	import { outlinerSchema } from './schema';
	import './selections/node-range-selection';

	interface Props {
		doc: unknown;
		onChange: (doc: unknown) => void;
		onActiveSlideChange: (n: number) => void;
	}

	const props: Props = $props();

	let mountEl: HTMLDivElement | undefined = $state();
	let view: EditorView | null = null;

	$effect(() => {
		if (!mountEl) return;
		const isMac =
			typeof navigator !== 'undefined' &&
			Bowser.getParser(navigator.userAgent).getOSName() === 'macOS';
		const initialState = untrack(() =>
			EditorState.create({
				schema: outlinerSchema,
				doc: outlinerSchema.nodeFromJSON(props.doc),
				plugins: [
					history(),
					keymap({
						Enter: splitListItem(outlinerSchema.nodes.list_item),
						Tab: sinkListItem(outlinerSchema.nodes.list_item),
						'Shift-Tab': liftListItem(outlinerSchema.nodes.list_item),
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
					bulletClickPlugin,
					separatorDecorations,
				],
			}),
		);
		const editor = new EditorView(mountEl, {
			state: initialState,
			attributes: {
				role: 'textbox',
				'aria-multiline': 'true',
				'aria-label': 'Outliner',
			},
			dispatchTransaction(tr) {
				const next = editor.state.apply(tr);
				editor.updateState(next);
				if (tr.docChanged) props.onChange(next.doc.toJSON());
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
	.outliner-root :global(ul) {
		padding-left: 1.5em;
		margin: 0;
	}
	.outliner-root :global(p) {
		margin: 0;
	}
	.outliner-root :global(li::marker) {
		color: var(--color-muted);
	}
	.outliner-root :global(li.ProseMirror-selectednode) {
		background: color-mix(in srgb, var(--color-accent) 15%, transparent);
		border-radius: 4px;
	}
	.outliner-root :global(.ProseMirror) {
		outline: none;
		min-height: 100%;
		white-space: pre-wrap;
	}
	.outliner-root :global(> .ProseMirror > ul > li[data-separator='true']) {
		margin-block: 1.5em;
		color: var(--color-muted);
		position: relative;
	}
	.outliner-root :global(> .ProseMirror > ul > li[data-separator='true']::before) {
		content: '';
		position: absolute;
		inset: 50% 0 auto 1em;
		border-top: 1px dashed var(--color-border);
		z-index: -1;
	}
	.outliner-root :global(> .ProseMirror > ul > li[data-separator='true']::after) {
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
	.outliner-root :global(li > ul) {
		overflow: hidden;
		transition:
			height 200ms ease,
			opacity 200ms ease;
	}
	.outliner-root :global(li[data-collapsed='true'] > ul) {
		display: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.outliner-root :global(li > ul) {
			transition: none;
		}
	}
</style>
