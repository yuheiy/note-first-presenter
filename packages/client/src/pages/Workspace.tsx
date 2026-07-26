/**
 * Workspace page — the outliner, the slide list, and the toolbar. It has no path
 * of its own: it is every route that is not the slideshow (`lib/routes.ts`).
 *
 * The whole page is one branch. Everything below it is shared: Editor and Viewer
 * render the same `components/workspace/Workspace` shell and differ only in
 * whether they can write.
 */
import { Editor } from '../components/workspace/Editor';
import { Viewer } from '../components/workspace/Viewer';

export default function Workspace() {
  // A constant after the build folds it, so the branch not taken — and the whole
  // module behind it — is dead code the bundler removes. This is the one place
  // the two modes are told apart, and since they share one URL space it means
  // only "can this write?".
  return import.meta.env.DEV ? <Editor /> : <Viewer />;
}
