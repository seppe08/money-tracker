import { StyleSheet, Text, View } from 'react-native';

import type { Transaction } from '@/api/client';
import { colors, spacing } from '@/theme/colors';
import { formatCurrency, formatDate } from '@/utils/format';

type TransactionRowProps = {
  transaction: Transaction;
  isFirst: boolean;
};

export function TransactionRow({ transaction, isFirst }: TransactionRowProps) {
  const amount = Number(transaction.amount);

  return (
    <View style={[styles.row, !isFirst && styles.rowBorder]}>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {transaction.description}
        </Text>
        <Text style={styles.meta}>
          {transaction.category ?? 'Uncategorized'} · {formatDate(transaction.occurred_on)}
        </Text>
      </View>
      <Text style={[styles.amount, amount >= 0 ? styles.income : styles.expense]}>
        {formatCurrency(amount)}
      </Text>
    </View>
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
