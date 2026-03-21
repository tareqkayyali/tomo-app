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
import { useFavorites } from './useFavorites';
import type { QuickAction } from '../components/QuickAccessBar';

/**
 * @param pageSpecific — A single action, array of actions, or null (Tomo Chat has 2 chat-specific icons)
 * @param navigation — React Navigation object for navigating to favorites + favorite targets
 */
export function useQuickActions(
  pageSpecific: QuickAction | QuickAction[] | null,
  navigation: any,
): QuickAction[] {
  const { selectedOptions } = useFavorites();

  return useMemo(() => {
    // 1. Page-specific icon(s)
    const pageActions: QuickAction[] = pageSpecific
      ? Array.isArray(pageSpecific) ? pageSpecific : [pageSpecific]
      : [];

    // 2. User-selected favorites (0-2)
    const favoriteActions: QuickAction[] = selectedOptions.map((opt) => ({
      key: opt.key,
      icon: opt.icon,
      label: opt.label,
      onPress: () => {
        if (opt.route) {
          navigation.navigate(opt.route);
        } else if (opt.tabRoute) {
          navigation.navigate(opt.tabRoute.tab, opt.tabRoute.params);
        }
      },
    }));

    // 3. "More" button → opens FavoritesScreen
    const moreAction: QuickAction = {
      key: 'more',
      icon: 'ellipsis-horizontal',
      label: 'More',
      onPress: () => navigation.navigate('Favorites'),
    };

    return [...pageActions, ...favoriteActions, moreAction];
  }, [pageSpecific, selectedOptions, navigation]);
}
