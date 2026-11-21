import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/colors';
import { formatCurrency } from '@/utils/format';

type BalanceCardProps = {
  balance: number;
  income: number;
  expenses: number;
  currency?: string;
  label?: string;
};

export function BalanceCard({
  balance,
  income,
  expenses,
  currency,
  label = 'Total balance',
}: BalanceCardProps) {
  const { currency: authCurrency } = useAuth();
  const activeCurrency = currency || authCurrency || 'USD';

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.balance}>{formatCurrency(balance, activeCurrency)}</Text>

      <View style={styles.row}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Income</Text>
          <Text style={[styles.statValue, styles.income]}>
            {formatCurrency(income, activeCurrency)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Expenses</Text>
          <Text style={[styles.statValue, styles.expense]}>
            {formatCurrency(expenses, activeCurrency)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  balance: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  income: {
    color: colors.primary,
  },
  expense: {
    color: colors.danger,
  },
  divider: {
    backgroundColor: colors.border,
    height: 32,
    marginHorizontal: spacing.md,
    width: StyleSheet.hairlineWidth,
  },
});
