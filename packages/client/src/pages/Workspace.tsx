/**
 * Workspace page (`/#/<slide>`) — the outliner, the slide list, and the toolbar.
 *
 * Placeholder: R1 only stands up the build. The Editor/Viewer split and the
 * ownership wiring land in R6 (plans/react-rewrite-spec.md §3.3).
 */
import { useHtmlLang } from '../components/useMessages';

export default function Workspace() {
  useHtmlLang();
  return <p>Workspace</p>;
}
