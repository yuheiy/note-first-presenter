import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Input, TextField } from 'react-aria-components';
import { countNoteGroups } from '../outliner/noteGroups';
import { Outliner } from '../outliner/Outliner';
import { useActiveSlide } from '../slides/activeSlide';
import { useSlidesMeta } from '../slides/slidesMeta';
import { useMessages } from '../useMessages';
import { useEditableDb } from './db';
import { Workspace } from './Workspace';

/**
 * The writable workspace, which is the whole app in dev.
 *
 * Editor and Viewer stay two components rather than one with an `editable` prop
 * because `import.meta.env.DEV` folds to a constant: the static build drops this
 * file, and with it the save pipeline, the live-reload subscription and the title
 * write-back. A prop would keep all of that in the Viewer's bundle (§3.4).
 */
export function Editor() {
  const format = useMessages();
  const db = useEditableDb();
  const meta = useSlidesMeta();
  const [activeSlide, setActiveSlide] = useActiveSlide();

  // What the loaded document starts out as. The Outliner mounts once the load
  // lands, so this is read exactly once per document.
  const loadedGroupCount = useMemo(
    () => (db.status === 'ready' ? countNoteGroups(db.initialOutline) : 0),
    [db.status, db.initialOutline],
  );
  const [editedGroupCount, setEditedGroupCount] = useState<number | null>(null);
  const groupCount = editedGroupCount ?? loadedGroupCount;

  // The field is never left showing nothing: a blank title becomes the default
  // and is saved as such. Only at the two moments the user is done with it — the
  // document landing, and the field losing focus — because applying it on every
  // render where the title is empty would make the field impossible to clear
  // while typing.
  function nameIfBlank() {
    if (db.title === '') db.setTitle(format('titleDefault'));
  }

  // The effect fires on the load transition alone, but has to read the title as
  // it is by then; an effect event is what separates the two.
  const nameIfBlankOnLoad = useEffectEvent(nameIfBlank);
  useEffect(() => {
    if (db.status === 'ready') nameIfBlankOnLoad();
  }, [db.status]);

  function handleOutlineChange(outline: unknown) {
    db.setOutline(outline);
    // Recomputed on every keystroke, but set only when it actually moves, which
    // is what keeps the slide list's thumbnails out of the typing path (§3.6).
    // Spelled as a guard rather than left to React's bail-out on an equal value:
    // that bail-out is an optimisation that lapses whenever the fiber already
    // has an update pending — a title edit, a saveStatus change — and nothing
    // below here is memoised to catch the difference.
    const next = countNoteGroups(outline);
    if (next !== groupCount) setEditedGroupCount(next);
  }

  return (
    <Workspace
      title={db.title}
      groupCount={groupCount}
      status={db.status}
      meta={meta}
      activeSlide={activeSlide}
      onActiveSlideChange={setActiveSlide}
      titleArea={
        <>
          <TextField
            aria-label={format('titleLabel')}
            value={db.title}
            onChange={db.setTitle}
            // Layout belongs to the wrapper, looks to the input.
            className="mr-auto"
          >
            <Input
              onBlur={nameIfBlank}
              className="-mx-1.5 field-sizing-content min-h-7 rounded px-1.5 text-sm text-gray-800 transition duration-100 hover:bg-gray-200 focus:bg-white focus:transition-none"
            />
          </TextField>
          {db.saveStatus === 'error' && (
            // One generic message: what failed is a write to a local file, and
            // the edit itself is still on screen.
            <span role="alert" aria-live="polite" className="text-sm text-red-600">
              {format('saveError')}
            </span>
          )}
        </>
      }
      outliner={
        // Mounted only once the document is here, so the editor never has to
        // swap its doc out from under an undo history (§4.4).
        db.status === 'ready' && (
          <Outliner
            initialOutline={db.initialOutline}
            activeSlide={activeSlide}
            onActiveSlideChange={setActiveSlide}
            editable
            onChange={handleOutlineChange}
          />
        )
      }
    />
  );
}
