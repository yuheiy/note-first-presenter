/**
 * Workspace page (`/#/<slide>`) — the outliner, the slide list, and the toolbar.
 *
 * The whole page is one branch. Everything below it is shared: Editor and Viewer
 * render the same `components/workspace/Workspace` shell and differ only in
 * whether they can write (plans/react-rewrite-spec.md §3.4).
 */
import { Editor } from '../components/workspace/Editor';
import { Viewer } from '../components/workspace/Viewer';

export default function Workspace() {
  // A constant after the build folds it, so the branch not taken — and the whole
  // module behind it — is dead code the bundler removes. This is the one place
  // the two modes are told apart, and since §2.2 unified the URLs it means only
  // "can this write?".
  return import.meta.env.DEV ? <Editor /> : <Viewer />;
}
