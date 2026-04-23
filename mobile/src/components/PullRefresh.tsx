/**
 * Pull-to-refresh wrappers — brand-lock every scroll surface on the
 * Orbit loader. The native RefreshControl can't render a custom child,
 * so this ships as two cooperating pieces:
 *
 *   TomoRefreshControl — drop-in replacement for RN's RefreshControl.
 *     Hides the native spinner (tintColor="transparent", colors=[]) and
 *     passes refreshing/onRefresh through. Use it inside a ScrollView
 *     or FlatList's `refreshControl` prop exactly like RefreshControl.
 *
 *   PullRefreshOverlay — absolutely-positioned sibling of the scroll
 *     surface. Renders a dim sm Loader at the top when `refreshing` is
 *     true. Lives outside the scroll view so it doesn't scroll with
 *     content; use `pointerEvents="none"` so it doesn't block taps.
 *
 * Usage:
 *   <View style={{ flex: 1 }}>
 *     <ScrollView
 *       refreshControl={<TomoRefreshControl refreshing={r} onRefresh={fn} />}
 *     >
 *       {content}
 *     </ScrollView>
 *     <PullRefreshOverlay refreshing={r} />
 *   </View>
 */
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { Loader } from './Loader';

export interface TomoRefreshControlProps {
  refreshing: boolean;
  onRefresh?: () => void;
}

export const TomoRefreshControl: React.FC<TomoRefreshControlProps> = ({
  refreshing,
  onRefresh,
}) => (
  <RefreshControl
    refreshing={refreshing}
    onRefresh={onRefresh}
    tintColor="transparent"
    colors={['transparent']}
    progressBackgroundColor="transparent"
  />
);

export interface PullRefreshOverlayProps {
  refreshing: boolean;
  /**
   * Distance from the top of the parent (in px) where the loader sits.
   * Defaults to 16 — tight enough to feel like a pull-refresh affordance,
   * loose enough to clear most safe-area insets.
   */
  top?: number;
}

export const PullRefreshOverlay: React.FC<PullRefreshOverlayProps> = ({
  refreshing,
  top = 16,
}) => {
  if (!refreshing) return null;
  return (
    <View style={[styles.overlay, { top }]} pointerEvents="none">
      <Loader size="sm" dim />
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
