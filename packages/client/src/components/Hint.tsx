export interface HintProps {
  message: string;
}

/**
 * A quiet line of guidance in place of content that is legitimately absent.
 *
 * Announced politely because it is never the result of an action the reader just
 * took — it appears as a panel finishes loading. `role="status"` is deliberately
 * not a React Aria component: RAC has no equivalent, and a live region is markup,
 * not an interaction.
 */
export function Hint({ message }: HintProps) {
  return (
    <div role="status" aria-live="polite" className="p-4 text-[0.9rem] text-gray-500">
      {message}
    </div>
  );
}
