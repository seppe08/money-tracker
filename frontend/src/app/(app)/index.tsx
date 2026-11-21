import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthContext';
import { BalanceCard } from '@/components/BalanceCard';
import { TransactionRow } from '@/components/TransactionRow';
import { useTransactions } from '@/hooks/useTransactions';
import { colors, radius, spacing } from '@/theme/colors';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { transactions, loading, error, reload } = useTransactions();

  const totals = useMemo(
    () =>
      transactions.reduce(
        (accumulator, transaction) => {
          const amount = Number(transaction.amount);
          accumulator.balance += amount;
          if (amount >= 0) {
            accumulator.income += amount;
          } else {
            accumulator.expenses += Math.abs(amount);
          }
          return accumulator;
        },
        { balance: 0, income: 0, expenses: 0 },
      ),
    [transactions],
  );

  const recent = transactions.slice(0, 5);
  const firstName = user?.display_name.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={reload}
            tintColor={colors.textMuted}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Money Tracker</Text>
            <Text style={styles.title}>Hi, {firstName}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <BalanceCard
          balance={totals.balance}
          income={totals.income}
          expenses={totals.expenses}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent activity</Text>

          {error ? (
            <View style={styles.messageBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={reload}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {loading && transactions.length === 0 ? (
            <View style={styles.messageBox}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}

          {!loading && !error && recent.length === 0 ? (
            <View style={styles.messageBox}>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyText}>
                Once transactions are added, they will show up here.
              </Text>
            </View>
          ) : null}

          {recent.length > 0 ? (
            <View style={styles.list}>
              {recent.map((transaction, index) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  isFirst={index === 0}
                />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  signOut: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  signOutText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  messageBox: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  retryText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
