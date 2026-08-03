/**
 * What a thrown request failure has to say for itself.
 *
 * A transport failure has no message of ours to show — there is no catalog entry
 * for "the server did not answer" — so its own words are what reaches the
 * reader.
 */
export function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface ErrorOverlayProps {
  message: string;
}

/**
 * A failure spread across the panel it replaces.
 *
 * Used by both panels — the slide list when the deck cannot be resolved, the
 * outliner when the outline cannot be read — so it lives here rather than under
 * `slides/`.
 *
 * `absolute inset-0` rests on an implicit contract with the caller: it covers the
 * panel only because both panels carry `container-type: size`, whose layout
 * containment makes them the containing block for absolutely positioned
 * descendants. There is no `relative` on them to say so. Drop `container-type`
 * from a panel and this overlay silently escapes to the viewport.
 */
export function ErrorOverlay({ message }: ErrorOverlayProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--color-white)_85%,transparent)] p-4 text-center"
    >
      <p>{message}</p>
    </div>
  );
}
