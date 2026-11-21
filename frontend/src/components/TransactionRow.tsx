import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { Transaction } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { colors, spacing } from '@/theme/colors';
import { formatCurrency, formatDate } from '@/utils/format';

type TransactionRowProps = {
  transaction: Transaction;
  isFirst: boolean;
  currency?: string;
  onPress?: () => void;
};

export function TransactionRow({
  transaction,
  isFirst,
  currency,
  onPress,
}: TransactionRowProps) {
  const { currency: authCurrency } = useAuth();
  const activeCurrency = currency || authCurrency || 'USD';
  const amount = Number(transaction.amount);

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/transaction/${transaction.id}`);
    }
  };

  return (
    <Pressable
      accessibilityLabel={`Transaction: ${transaction.description}`}
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        !isFirst && styles.rowBorder,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {transaction.description}
        </Text>
        <Text style={styles.meta}>
          {transaction.category ?? 'Uncategorized'} · {formatDate(transaction.occurred_on)}
        </Text>
      </View>
      <Text style={[styles.amount, amount >= 0 ? styles.income : styles.expense]}>
        {formatCurrency(amount, activeCurrency)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowBorder: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.7,
  },
  info: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
  },
  income: {
    color: colors.primary,
  },
  expense: {
    color: colors.danger,
  },
});
