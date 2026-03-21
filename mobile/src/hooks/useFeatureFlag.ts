/**
 * useFeatureFlag — Returns whether a feature flag is enabled.
 * Fail-closed: returns false if flag not found or config unavailable.
 */

import { useMemo } from 'react';
import { useConfig } from './useConfigProvider';

export function useFeatureFlag(flagKey: string, sportId?: string): boolean {
  const { config } = useConfig();

  return useMemo(() => {
    if (!config?.flags) return false;

    const flag = config.flags.find((f) => f.flag_key === flagKey);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // If sports filter is set, check if current sport is included
    if (flag.sports && flag.sports.length > 0 && sportId) {
      return flag.sports.includes(sportId);
    }

    return true;
  }, [config, flagKey, sportId]);
}
