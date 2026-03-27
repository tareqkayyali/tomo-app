/**
 * useQuickActions — Builds the unified QuickAccessBar action array.
 *
 * Structure: [page-specific icon(s)] + [user favorites (0-2)] + [more]
 *
 * Usage in each screen:
 *   const actions = useQuickActions(pageSpecificAction, navigation);
 *   <QuickAccessBar actions={actions} />
 */

import { useMemo } from 'react';
import type { QuickAction } from '../components/QuickAccessBar';

/**
 * @param pageSpecific — A single action, array of actions, or null
 * @param _navigation — Kept for API compatibility (unused after favorites removal)
 */
export function useQuickActions(
  pageSpecific: QuickAction | QuickAction[] | null,
  _navigation: any,
): QuickAction[] {
  return useMemo(() => {
    // Only page-specific icons — favorites feature removed
    const pageActions: QuickAction[] = pageSpecific
      ? Array.isArray(pageSpecific) ? pageSpecific : [pageSpecific]
      : [];

    return pageActions;
  }, [pageSpecific]);
}
