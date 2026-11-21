import React from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/colors';

export type DateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
};

export function DateInput({
  label,
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  accessibilityLabel,
}: DateInputProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>{label}</Text>
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={accessibilityLabel ?? label}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radius.md,
            borderStyle: 'solid',
            borderWidth: 1,
            boxSizing: 'border-box',
            color: colors.text,
            colorScheme: 'dark',
            fontSize: 14,
            height: 40,
            outline: 'none',
            padding: '8px 12px',
            width: '100%',
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={10}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        style={styles.nativeInput}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  nativeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    height: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
});
