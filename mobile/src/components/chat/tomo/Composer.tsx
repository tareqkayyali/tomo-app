import React from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { T } from './tokens';

export function Composer({
  value,
  onChangeText,
  onSubmit,
  onStop,
  onMicPress,
  placeholder = 'Ask tomo..',
  isSending = false,
  isTranscribing = false,
  disabled = false,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onMicPress?: () => void;
  placeholder?: string;
  isSending?: boolean;
  isTranscribing?: boolean;
  disabled?: boolean;
}) {
  const canSubmit = value.trim().length > 0 && !disabled && !isSending;

  return (
    <View style={styles.outer}>
      <View style={styles.bar}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={T.cream40}
          style={styles.input}
          onSubmitEditing={() => {
            if (canSubmit) onSubmit();
          }}
          onKeyPress={(e) => {
            // Web: Enter (without Shift) sends the message; Shift+Enter inserts a newline.
            if (
              e.nativeEvent.key === 'Enter' &&
              !(e.nativeEvent as any).shiftKey
            ) {
              (e as any).preventDefault?.();
              if (canSubmit) onSubmit();
            }
          }}
          editable={!disabled && !isSending}
          multiline
          returnKeyType="send"
          blurOnSubmit={false}
          textAlignVertical="center"
        />

        {isSending ? (
          <Pressable onPress={onStop} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="stop" size={18} color={T.red} />
          </Pressable>
        ) : canSubmit ? (
          <Pressable onPress={onSubmit} hitSlop={10} style={styles.iconBtn}>
            <Ionicons name="arrow-up-circle" size={22} color={T.sage} />
          </Pressable>
        ) : onMicPress ? (
          <Pressable
            onPress={onMicPress}
            hitSlop={10}
            style={styles.iconBtn}
            disabled={isTranscribing}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color={T.sageLight} />
            ) : (
              <Ionicons name="mic-outline" size={18} color={T.sageLight} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  bar: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: T.cream03,
    borderWidth: 1,
    borderColor: T.cream10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: T.fontRegular,
    color: T.cream,
    paddingVertical: 12,
    maxHeight: 160,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
});
