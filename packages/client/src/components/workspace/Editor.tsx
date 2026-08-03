import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useEffectEvent } from 'react';
import { Input, TextField } from 'react-aria-components';
import { m } from '../../lib/paraglide/messages.js';
import { Outliner } from '../outliner/Outliner';
import { activeSlideAtom } from '../slides/activeSlide';
import { titleAtom } from './db';
import { useDbEditing, useStoredDocument, type DbEditing } from './useDb';
import { Workspace } from './Workspace';

/**
 * The writable workspace, which is the whole app in dev.
 *
 * Editor and Viewer stay two components rather than one with an `editable` prop
 * because `import.meta.env.DEV` folds to a constant: the static build drops this
 * file, and with it the save pipeline and the title write-back. A prop would
 * keep all of that in the Viewer's bundle.
 *
 * Nothing here waits for a document. The one half that must — the outliner — is
 * handed to the shell as a slot and suspends on its own, so a slow or failed
 * request never reaches the toolbar or the theme footer.
 *
 * The active slide is read here only to wire the Outliner, which stays a
 * controlled component at the ProseMirror boundary; everything in the shell
 * that needs the slide reads `activeSlideAtom` itself.
 */
export function Editor() {
  const [activeSlide, setActiveSlide] = useAtom(activeSlideAtom);
  const editing = useDbEditing();

  return (
    <Workspace
      titleArea={<TitleField editing={editing} />}
      outliner={
        <EditableOutline
          editing={editing}
          activeSlide={activeSlide}
          onActiveSlideChange={setActiveSlide}
        />
      }
    />
  );
}

function TitleField({ editing }: { editing: DbEditing }) {
  const title = useAtomValue(titleAtom);

  // The field is never left showing nothing: a blank title becomes the default
  // and is saved as such. Applied on blur rather than on every render where the
  // title is empty, which would make the field impossible to clear while typing.
  function nameIfBlank() {
    if (title === '') editing.setTitle(m.untitled_title_placeholder());
  }

  return (
    <>
      <TextField
        aria-label={m.title_field_label()}
        value={title}
        onChange={editing.setTitle}
        // Layout belongs to the wrapper, looks to the input.
        className="mr-auto"
      >
        <Input
          onBlur={nameIfBlank}
          className="-mx-1.5 field-sizing-content min-h-7 rounded px-1.5 text-sm text-gray-800 transition duration-100 hover:bg-gray-200 focus:bg-white focus:transition-none"
        />
      </TextField>
      {editing.saveStatus === 'error' && (
        // One generic message: what failed is a write to a local file, and
        // the edit itself is still on screen.
        <span role="alert" aria-live="polite" className="text-sm text-red-600">
          {m.save_failed_status()}
        </span>
      )}
    </>
  );
}

interface EditableOutlineProps {
  editing: DbEditing;
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
}

/**
 * The outliner, and the one thing in the Editor that waits for the document.
 *
 * Suspending here rather than in the Editor is what keeps the shell on screen
 * while the request is in flight, and what lets the shell's ErrorBoundary
 * replace this pane alone if it fails. ProseMirror reads the outline once at
 * mount, so this never has to swap a doc out from under an undo history — which
 * is also why it reads the *stored* document rather than the working one.
 */
function EditableOutline({ editing, activeSlide, onActiveSlideChange }: EditableOutlineProps) {
  const stored = useStoredDocument();

  // Naming an untitled deck belongs to the moment the document lands, and this
  // component mounts exactly then. An effect event because `editing` is a fresh
  // object every render: as a dependency it would re-run this on each one.
  const nameIfBlankOnLoad = useEffectEvent(() => {
    if (stored.title === '') editing.setTitle(m.untitled_title_placeholder());
  });
  useEffect(() => {
    nameIfBlankOnLoad();
  }, []);

  return (
    <Outliner
      initialOutline={stored.outline}
      activeSlide={activeSlide}
      onActiveSlideChange={onActiveSlideChange}
      editable
      onChange={editing.setOutline}
    />
  );
}
