import clsx from 'clsx';
import type { ReactNode } from 'react';
import { OverlayArrow, Tooltip as AriaTooltip } from 'react-aria-components';

export interface TooltipProps {
  /** The label to show. Plain text — there is nothing to interact with in here. */
  children: ReactNode;
}

/**
 * The app's one styled tooltip, to be placed inside RAC's `TooltipTrigger`
 * alongside the trigger element (which is imported from RAC directly — this is
 * the only piece worth wrapping, because the arrow, the placement and the styles
 * are a lump that both trigger sites share; §5.3).
 *
 * `placement="bottom"` is spelled out because RAC defaults to `top` and both
 * triggers sit in the toolbar at the very top of the viewport, where a top-placed
 * tooltip would flip on every open.
 *
 * The arrow is ours to draw: `OverlayArrow` only positions its child and reports
 * where the tooltip landed. The path points down, which is right for a tooltip
 * sitting above its trigger; below it, the same triangle is turned over. Those
 * are the only two cases — RAC flips along the placement's own axis, never onto
 * the other one.
 */
export function Tooltip({ children }: TooltipProps) {
  return (
    <AriaTooltip
      placement="bottom"
      // RAC's default offset is 0, and `OverlayArrow` places the arrow wholly
      // outside the tooltip box (at `100%` on the placement edge) — so without a
      // gap at least as tall as the arrow, the arrow is drawn over the trigger.
      offset={10}
      className="rounded bg-gray-900 px-2 py-1 text-xs text-gray-50 shadow"
    >
      <OverlayArrow>
        {({ placement }) => (
          <svg
            width={8}
            height={8}
            viewBox="0 0 8 8"
            // `block` so the arrow does not sit on a text baseline, which would
            // leave a descender's worth of gap between it and the tooltip.
            className={clsx('block fill-gray-900', placement === 'bottom' && 'rotate-180')}
          >
            <path d="M0 0 L4 4 L8 0" />
          </svg>
        )}
      </OverlayArrow>
      {children}
    </AriaTooltip>
  );
}
