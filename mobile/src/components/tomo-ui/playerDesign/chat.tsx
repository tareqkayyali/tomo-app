/**
 * Player App — Chat screen primitives
 *
 * ChatOrb        — pulsing sage orb with halo + breathing ring
 * ChatBubble     — asymmetric message bubble (sage-tinted Tomo, cream user)
 * QuickActionChip— pill button row for suggested prompts
 * ChatInputBar   — pill input with sage send button
 */
import React, { memo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  ViewStyle,
  StyleProp,
} from 'react-native';
import Svg, { Circle, Path, RadialGradient, LinearGradient, Defs, Stop } from 'react-native-svg';
import { useTheme } from '../../../hooks/useTheme';
import { usePulse } from '../../../hooks/usePulse';
import TomoIcon from '../TomoIcon';

// ─────────────────────────────────────────────────────────────
// ChatOrb — a pulsing sage orb used at the top of the Chat tab.
// Uses usePulse driving sin-based scale on core + ring + halo.
// ─────────────────────────────────────────────────────────────

export const ChatOrb = memo(({ size = 96 }: { size?: number }) => {
  const { colors } = useTheme();
  const t = usePulse();
  const pulse = 1 + Math.sin(t * 1.4) * 0.04;
  const ring = 0.4 + Math.sin(t * 2.0) * 0.2;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Halo */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: 'transparent',
          transform: [{ scale: 1.3 + ring * 0.2 }],
          opacity: 0.6,
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.tomoSage} stopOpacity={0.3} />
              <Stop offset="70%" stopColor={colors.tomoSage} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#halo)" />
        </Svg>
      </Animated.View>

      {/* Outer ring */}
      <View
        style={{
          position: 'absolute',
          width: size - 20,
          height: size - 20,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.sage30,
          transform: [{ scale: pulse }],
        }}
      />

      {/* Core */}
      <View
        style={{
          width: size / 2,
          height: size / 2,
          borderRadius: 999,
          transform: [{ scale: pulse }],
          overflow: 'hidden',
          shadowColor: colors.tomoSage,
          shadowOpacity: 0.5,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="core" cx="35%" cy="30%" r="70%">
              <Stop offset="0%" stopColor={colors.tomoSageDim} />
              <Stop offset="50%" stopColor={colors.tomoSage} />
              <Stop offset="100%" stopColor={colors.accentDark} />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#core)" />
        </Svg>
      </View>
    </View>
  );
});
ChatOrb.displayName = 'ChatOrb';

// ─────────────────────────────────────────────────────────────
// ChatBubble — asymmetric bubble for user or Tomo.
// Tomo (left): sage08 bg + sage30 border + 4px bottom-left corner.
// User (right): cream06 bg + cream10 border + 4px bottom-right corner.
// Optional action chips below Tomo bubble.
// ─────────────────────────────────────────────────────────────

export interface ChatBubbleProps {
  role: 'tomo' | 'user';
  text: string;
  chips?: string[];
  onChipPress?: (chip: string, idx: number) => void;
}

export const ChatBubble = memo(({ role, text, chips, onChipPress }: ChatBubbleProps) => {
  const { colors } = useTheme();
  const isTomo = role === 'tomo';

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isTomo ? 'flex-start' : 'flex-end',
        marginBottom: 8,
      }}
    >
      <View style={{ maxWidth: '82%' }}>
        <View
          style={{
            backgroundColor: isTomo ? colors.sage08 : colors.cream06,
            borderWidth: 1,
            borderColor: isTomo ? colors.sage30 : colors.cream10,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderBottomLeftRadius: isTomo ? 4 : 14,
            borderBottomRightRadius: isTomo ? 14 : 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              fontFamily: 'Poppins_400Regular',
              fontSize: 12,
              color: isTomo ? colors.body : colors.tomoCream,
              lineHeight: 17,
              letterSpacing: -0.1,
            }}
          >
            {text}
          </Text>
        </View>
        {chips && chips.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {chips.map((c, i) => (
              <Pressable
                key={`${c}-${i}`}
                onPress={() => onChipPress?.(c, i)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: i === 0 ? colors.sage15 : colors.cream03,
                  borderWidth: 1,
                  borderColor: i === 0 ? colors.sage30 : colors.cream10,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Poppins_500Medium',
                    fontSize: 10,
                    color: i === 0 ? colors.tomoSageDim : colors.body,
                  }}
                >
                  {c}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
});
ChatBubble.displayName = 'ChatBubble';

// ─────────────────────────────────────────────────────────────
// QuickActionChip — horizontally-scrolling pill prompts below messages.
// ─────────────────────────────────────────────────────────────

export interface QuickActionChipProps {
  label: string;
  onPress?: () => void;
}

export const QuickActionChip = memo(({ label, onPress }: QuickActionChipProps) => {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: colors.cream03,
        borderWidth: 1,
        borderColor: colors.cream10,
      }}
    >
      <Text
        style={{
          fontFamily: 'Poppins_400Regular',
          fontSize: 10.5,
          color: colors.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
});
QuickActionChip.displayName = 'QuickActionChip';

// ─────────────────────────────────────────────────────────────
// ChatInputBar — pill input with sage send button on the right.
// ─────────────────────────────────────────────────────────────

export interface ChatInputBarProps {
  value: string;
  onChangeText: (v: string) => void;
  onSend?: () => void;
  onMic?: () => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export const ChatInputBar = memo(
  ({ value, onChangeText, onSend, onMic, placeholder = 'Ask Tomo anything…', style, disabled }: ChatInputBarProps) => {
    const { colors } = useTheme();
    return (
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.cream03,
            borderWidth: 1,
            borderColor: colors.cream10,
            borderRadius: 999,
            paddingLeft: 14,
            paddingRight: 4,
            paddingVertical: 4,
          },
          style,
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          editable={!disabled}
          style={{
            flex: 1,
            color: colors.tomoCream,
            fontFamily: 'Poppins_400Regular',
            fontSize: 12,
            paddingVertical: 8,
          }}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        {onMic && (
          <Pressable
            onPress={onMic}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TomoIcon name="mic" size={16} color={colors.muted} />
          </Pressable>
        )}
        <Pressable
          onPress={onSend}
          disabled={disabled || !value.trim()}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: disabled || !value.trim() ? colors.cream10 : colors.tomoSage,
          }}
        >
          <TomoIcon name="send" size={14} color={colors.tomoCream} weight="fill" />
        </Pressable>
      </View>
    );
  }
);
ChatInputBar.displayName = 'ChatInputBar';
