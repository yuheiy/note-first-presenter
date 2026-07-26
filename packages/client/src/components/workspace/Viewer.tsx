import { useAtomValue } from 'jotai';
import { m } from '../../lib/paraglide/messages.js';
import { Outliner } from '../outliner/Outliner';
import { useActiveSlide } from '../../lib/routes';
import { titleAtom, useStoredDocument } from './db';
import { Workspace } from './Workspace';

/**
 * The read-only workspace, which is what a shared static build serves.
 *
 * The Editor's counterpart, and the reason the two are separate files: nothing
 * here can write, and nothing that writes is reachable from here.
 */
export function Viewer() {
  const [activeSlide, setActiveSlide] = useActiveSlide();
  // Synchronous and defaulted, so the toolbar draws before the document lands
  // rather than waiting with it. Only the outline pane below waits.
  const title = useAtomValue(titleAtom) || m.untitled_title_placeholder();

  return (
    <Workspace
      title={title}
      activeSlide={activeSlide}
      onActiveSlideChange={setActiveSlide}
      titleArea={
        <h1 className="mr-auto flex min-h-7 items-center text-sm text-gray-800">{title}</h1>
      }
      outliner={<ReadOnlyOutline activeSlide={activeSlide} onActiveSlideChange={setActiveSlide} />}
    />
  );
}

interface ReadOnlyOutlineProps {
  activeSlide: number;
  onActiveSlideChange: (slide: number) => void;
}

/** Suspends until the document lands; see `EditableOutline` for why that is here. */
function ReadOnlyOutline({ activeSlide, onActiveSlideChange }: ReadOnlyOutlineProps) {
  const stored = useStoredDocument();

  return (
    // `editable` is required rather than defaulted, so read-only is
    // something this component states rather than something it omits.
    // With it false, ProseMirror never reaches its keydown handlers, so
    // none of the editing keymaps can fire.
    <Outliner
      initialOutline={stored.outline}
      activeSlide={activeSlide}
      onActiveSlideChange={onActiveSlideChange}
      editable={false}
    />
  );
}
