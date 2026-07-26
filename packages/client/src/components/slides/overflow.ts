/**
 * How many slides the deck has, and where the PDF stops covering them.
 *
 * The notes can outgrow the PDF: every top-level `---` starts a new note group,
 * so a deck can have more groups than the PDF has pages. Those extra slides are
 * real — they get a row in the slide list and are navigable in the slideshow —
 * but there is no page to render, so they show a placeholder instead.
 */
export interface SlideOverflow {
  /** Total number of slides to show and navigate. */
  slideCount: number;
  /** First slide number with no PDF page behind it. `pdfPageCount + 1`. */
  overflowStart: number;
}

/**
 * @param pdfPageCount Pages in the resolved PDF, or 0 when there is no PDF.
 * @param reportedSlideCount Slide count coming from elsewhere: the note-group
 *   count in the workspace, the count published over sync in the slideshow.
 */
export function computeSlideOverflow(
  pdfPageCount: number,
  reportedSlideCount: number,
): SlideOverflow {
  return {
    slideCount: Math.max(pdfPageCount, reportedSlideCount),
    overflowStart: pdfPageCount + 1,
  };
}

/**
 * `slide` moved by `delta`, held inside the deck — the first and last slides
 * stop rather than wrap.
 *
 * Both places that step through slides use this: the slide list's arrow keys and
 * the slideshow's every-key-is-next. Neither owns the deck's bounds, so the
 * arithmetic lives with the type that does.
 *
 * The lower bound is applied last so that it wins: a deck of no slides still
 * answers 1, because slide numbers are 1-based and there is no slide 0 to
 * navigate to or to write into the URL.
 */
export function stepSlide(overflow: SlideOverflow, slide: number, delta: number): number {
  return Math.max(1, Math.min(overflow.slideCount, slide + delta));
}
