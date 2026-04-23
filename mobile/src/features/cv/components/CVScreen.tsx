/**
 * CVScreen — shell used by every CV screen (hub + 11 sub-screens).
 *
 * Differs from PlayerScreen in that the header uses a centered uppercase
 * label (no large title) to match the Player Passport design (mocks 01-12).
 */

import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../../hooks/useTheme";
import { SmartIcon } from "../../../components/SmartIcon";
import { fontFamily, screenBg } from "../../../theme";

interface Props {
  label: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children?: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
  footer?: React.ReactNode;
  scroll?: boolean;
}

export function CVScreen({
  label,
  onBack,
  right,
  children,
  contentContainerStyle,
  scrollProps,
  footer,
  scroll = true,
}: Props) {
  const { colors } = useTheme();

  const header = (
    <View style={styles.headerRow}>
      <View style={styles.headerSide}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [
              styles.iconBtn,
              {
                backgroundColor: pressed ? colors.cream06 : colors.cream03,
                borderColor: colors.cream10,
              },
            ]}
          >
            <SmartIcon name="chevron-back" size={16} color={colors.tomoCream} />
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.label, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>

      <View style={[styles.headerSide, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: screenBg }}
    >
      {header}
      {scroll ? (
        <ScrollView
          {...scrollProps}
          contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scrollContent, contentContainerStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerSide: {
    width: 48,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 14,
  },
});
