import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiStatus } from '@/hooks/useApiHealth';
import { colors, radius, spacing } from '@/theme/colors';

type ApiStatusPillProps = {
  status: ApiStatus;
  label: string;
  onRefresh: () => void;
};

const statusColor: Record<ApiStatus, string> = {
  checking: colors.warning,
  online: colors.primary,
  offline: colors.danger,
};

const statusText: Record<ApiStatus, string> = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API offline',
};

export function ApiStatusPill({ status, label, onRefresh }: ApiStatusPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Refresh API status"
      onPress={onRefresh}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <View style={[styles.dot, { backgroundColor: statusColor[status] }]} />
      <Text style={styles.text}>{statusText[status]}</Text>
      <Text style={styles.url} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  url: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    textAlign: 'right',
  },
});
