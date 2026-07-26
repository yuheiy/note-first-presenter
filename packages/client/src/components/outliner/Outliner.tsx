import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { splitListItem } from 'prosemirror-schema-list';
import { EditorState, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { useEffect, useEffectEvent, useRef } from 'react';
import { smartBackspace, smartDelete } from './commands/backspace';
import { duplicateItem } from './commands/duplicate';
import { collapseItem, expandItem } from './commands/fold';
import { moveItemDown, moveItemUp } from './commands/move';
import { rangeAwareLiftListItem, rangeAwareSinkListItem } from './commands/rangeIndent';
import {
  exitRangeSelection,
  extendRangeSelectionDown,
  extendRangeSelectionUp,
} from './commands/rangeSelect';
import { rangeAwareSplitListItem } from './commands/rangeSplit';
import { ACTIVE_SLIDE_ECHO_META, computeActiveSlide, findGroupPosition } from './noteGroups';
import { isMac } from './platform';
import { activeSlideDecorations } from './plugins/activeSlideDecorations';
import { clipboardPlugin } from './plugins/clipboard';
import { itemMultiSelectPlugin } from './plugins/itemMultiSelect';
import { pasteHandler } from './plugins/paste';
import { rangeSelectionDecorations } from './plugins/rangeSelectionDecorations';
import { separatorDecorations } from './plugins/separatorDecorations';
import { textSelectionClamp } from './plugins/textSelectionClamp';
import { outlinerSchema } from './schema';
// Registers NodeRangeSelection's jsonID, which has to be in place before any
// stored selection is read back.
import './selections/nodeRangeSelection';

export interface OutlinerProps {
  /**
   * The stored outline, as the plain JSON that `onChange` hands back. Read once,
   * on mount: the editor owns the document from then on, and later values of this
   * prop are ignored — hence `initial`.
   */
  initialOutline: unknown;
  /** The slide whose note group the caret should sit in. */
  activeSlide: number;
  /** Called when editing or moving the caret puts it in a different note group. */
  onActiveSlideChange: (slide: number) => void;
  /** Read once, on mount. */
  editable: boolean;
  /** Omit for the read-only Viewer. Receives the whole outline as plain JSON. */
  onChange?: (outline: unknown) => void;
}

// `splitListItem` builds a command rather than being one, so bind it to the schema
// here instead of on every Enter press — the same module-scope binding the sibling
// modules do with their `LIST_ITEM` constants.
const splitOutlinerItem = splitListItem(outlinerSchema.nodes.list_item);

/**
 * The outline editor: a ProseMirror `EditorView` behind a React component.
 *
 * ProseMirror's types stop here. Everything crossing this boundary — in through
 * `initialOutline`, out through `onChange` — is plain JSON, so the rest of the app
 * never imports `prosemirror-*`.
 */
export function Outliner({
  initialOutline,
  activeSlide,
  onActiveSlideChange,
  editable,
  onChange,
}: OutlinerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Both props are mount-only by contract. Parking them in refs during the first
  // render says so in code, and lets the mount effect keep an honestly empty
  // dependency list instead of suppressing the exhaustive-deps rule.
  const initialOutlineRef = useRef(initialOutline);
  const editableRef = useRef(editable);

  // The EditorView is built once, so `dispatchTransaction`'s closure would hold the
  // first render's callbacks forever. A stale `onChange` fails silently — the edit
  // shows on screen and nothing saves it — so the callbacks go through
  // useEffectEvent, which always calls the latest render's version.
  const handleChange = useEffectEvent((outline: unknown) => onChange?.(outline));
  const handleActiveSlideChange = useEffectEvent((slide: number) => onActiveSlideChange(slide));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const view = new EditorView(mount, {
      state: EditorState.create({
        schema: outlinerSchema,
        doc: outlinerSchema.nodeFromJSON(initialOutlineRef.current),
        plugins: [
          history(),
          keymap({
            Enter: (state, dispatch, editorView) =>
              rangeAwareSplitListItem(state, dispatch, editorView) ||
              splitOutlinerItem(state, dispatch, editorView),
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
              ? { 'Mod-Shift-ArrowUp': moveItemUp, 'Mod-Shift-ArrowDown': moveItemDown }
              : { 'Alt-Shift-ArrowUp': moveItemUp, 'Alt-Shift-ArrowDown': moveItemDown }),
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
      editable: () => editableRef.current,
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Outliner',
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        if (tr.docChanged) handleChange(next.doc.toJSON());
        if ((tr.docChanged || tr.selectionSet) && !tr.getMeta(ACTIVE_SLIDE_ECHO_META)) {
          handleActiveSlideChange(computeActiveSlide(next.doc, next.selection));
        }
      },
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Under StrictMode this runs twice on mount. Nothing is lost: the doc is still
    // the one just parsed, the undo history is empty, and `destroy()` takes the
    // generated DOM with it.
  }, []);

  // Move the caret to the matching note group when the active slide changes from
  // outside the editor (slide list, slideshow). No-op when the caret is already in
  // that group — the case right after an edit drove the change — which keeps the
  // editor<->slide sync from looping. Slides beyond the last note group (the slide
  // count can exceed the group count) have no position and are ignored.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const { state } = view;
    if (computeActiveSlide(state.doc, state.selection) === activeSlide) return;
    const pos = findGroupPosition(state.doc, activeSlide);
    if (pos === null) return;
    const selection = Selection.near(state.doc.resolve(pos), 1);
    // Tag the caret move so dispatchTransaction doesn't report it back out — the
    // meta rides on the transaction itself, so the suppression can't be widened or
    // missed by anything else dispatching around it.
    view.dispatch(state.tr.setSelection(selection).setMeta(ACTIVE_SLIDE_ECHO_META, true));
    // Smooth-scroll the group's first top-level item flush to the top of the outliner
    // panel. `pos` is that item's position, so resolve its DOM directly via nodeDOM (no
    // dependency on the active-slide decoration or its apply timing). We scroll
    // ourselves because ProseMirror's `tr.scrollIntoView()` does not work here — the
    // editor sits inside a `display: contents` wrapper.
    const groupEl = view.nodeDOM(pos);
    if (groupEl instanceof Element) groupEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [activeSlide]);

  // `display: contents` is doing real work, not papering over anything: it is what
  // lets `.ProseMirror`'s `min-height: 100%` resolve against the scroll container.
  return <div ref={mountRef} className="outliner-root contents" />;
}
