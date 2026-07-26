import { useMemo } from 'react';
import { m } from '../../lib/paraglide/messages.js';
import { countNoteGroups } from '../outliner/noteGroups';
import { Outliner } from '../outliner/Outliner';
import { useActiveSlide } from '../../lib/routes';
import { useSlidesMeta } from '../slides/slidesMeta';
import { useReadOnlyDb } from './db';
import { Workspace } from './Workspace';

/**
 * The read-only workspace, which is what a shared static build serves.
 *
 * The Editor's counterpart, and the reason the two are separate files: nothing
 * here can write, and nothing that writes is reachable from here (§3.4).
 */
export function Viewer() {
  const db = useReadOnlyDb();
  const meta = useSlidesMeta();
  const [activeSlide, setActiveSlide] = useActiveSlide();

  const loaded = db.status === 'ready' ? db.data : null;
  // The outline never changes here, so this is one pass over the stored JSON
  // rather than the Editor's per-keystroke recount.
  const groupCount = useMemo(() => (loaded ? countNoteGroups(loaded.outline) : 0), [loaded]);
  const title = loaded && loaded.title !== '' ? loaded.title : m.untitled_title_placeholder();

  return (
    <Workspace
      title={title}
      groupCount={groupCount}
      status={db.status}
      meta={meta}
      activeSlide={activeSlide}
      onActiveSlideChange={setActiveSlide}
      titleArea={
        <h1 className="mr-auto flex min-h-7 items-center text-sm text-gray-800">{title}</h1>
      }
      outliner={
        loaded && (
          // `editable` is required rather than defaulted, so read-only is
          // something this component states rather than something it omits.
          // With it false, ProseMirror never reaches its keydown handlers, so
          // none of the editing keymaps can fire (§4.6).
          <Outliner
            initialOutline={loaded.outline}
            activeSlide={activeSlide}
            onActiveSlideChange={setActiveSlide}
            editable={false}
          />
        )
      }
    />
  );
}
