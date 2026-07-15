/** Minimal rectangle shape, mirroring the parts of `DOMRect` we need. */
export interface ScrollRect {
  top: number;
  bottom: number;
}

/**
 * Whether the active lesson node is already fully visible in the viewport
 * (i.e. not obscured by the sticky top bar and not below the fold), meaning
 * no scroll adjustment is needed on load.
 */
export function isNodeFullyVisible(nodeRect: ScrollRect, headerHeight: number, viewportHeight: number): boolean {
  return nodeRect.top >= headerHeight && nodeRect.bottom <= viewportHeight;
}
