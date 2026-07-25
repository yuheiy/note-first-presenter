/**
 * Slideshow page (`/#/slideshow/<slide>`) — the full-bleed slide view opened in
 * a second window and driven over BroadcastChannel.
 *
 * Placeholder: R1 only stands up the build. The real page lands in R6
 * (plans/react-rewrite-spec.md §3.3).
 */
import { useHtmlLang } from '../components/useMessages';

export default function Slideshow() {
  // Each page owns the call: the slideshow is its own document, so nothing the
  // workspace does reaches this `<html>`.
  useHtmlLang();
  return <p>Slideshow</p>;
}
