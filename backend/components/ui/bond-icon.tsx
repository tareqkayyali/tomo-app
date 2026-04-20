/**
 * BondIcon — Bond sprite icon for the admin / Next.js surface.
 *
 * Uses the /sprite.svg asset (198 symbols) via <use href>. The sprite is
 * loaded once by the browser; subsequent icons are cheap SVG <use>
 * references. Icons inherit color from `currentColor` — pass it via
 * `className` (e.g. `text-sage`) or inline `style`.
 *
 * Example:
 *   <BondIcon name="Add" />
 *   <BondIcon name="Add" filled className="text-sage" />
 *   <BondIcon name="Close" size={20} />
 *   <BondIcon name="Chevron-left" />
 */

import * as React from "react";

const SINGLE_VARIANT = new Set([
  "Close",
  "Back",
  "Chevron-right",
  "Chevron-left",
  "Chevron-up",
  "Chevron-down",
  "Refresh",
  "Menu",
  "More",
  "Arrow-up",
  "Copy",
  "Download",
  "Upload",
  "Link",
  "Trash",
  "Logout",
  "Logo-Apple",
  "Logo-Google",
]);

export interface BondIconProps extends React.SVGAttributes<SVGSVGElement> {
  /** Bond icon name (TitleCase, e.g. "Add", "Close", "Chevron-left"). */
  name: string;
  /** Size in px. Default 20. */
  size?: number;
  /** Filled variant (ignored for single-variant icons). */
  filled?: boolean;
}

export function BondIcon({
  name,
  size = 20,
  filled = false,
  className,
  ...rest
}: BondIconProps) {
  const symbolId = SINGLE_VARIANT.has(name)
    ? `icon-${name}`
    : `icon-${name}.${filled ? "filled" : "outline"}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
      {...rest}
    >
      <use href={`/sprite.svg#${symbolId}`} />
    </svg>
  );
}
