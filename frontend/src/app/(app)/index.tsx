import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Link, useFocusEffect } from 'expo-router';

import { useAuth } from '@/auth/AuthContext';
import { BalanceCard } from '@/components/BalanceCard';
import { BudgetTracker } from '@/components/BudgetTracker';
import { CategoryBreakdown } from '@/components/CategoryBreakdown';
import { RecurringTransactionsTracker } from '@/components/RecurringTransactionsTracker';
import { TransactionRow } from '@/components/TransactionRow';
import { useBudgets } from '@/hooks/useBudgets';
import { useCategoryAnalytics } from '@/hooks/useCategoryAnalytics';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { useTransactions } from '@/hooks/useTransactions';
import { useTransactionSummary } from '@/hooks/useTransactionSummary';
import { colors, radius, spacing } from '@/theme/colors';
import { formatMonthYear } from '@/utils/format';
import {
  getTransactionRevision,
  subscribeTransactionCreated,
} from '@/utils/transaction-events';

export default function HomeScreen() {
  const { user, currency } = useAuth();

  // Monthly view state
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { from_date, to_date, monthLabel, isCurrentMonth } = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth(); // 0-indexed
    const lastDay = new Date(year, month + 1, 0).getDate();
    const mStr = String(month + 1).padStart(2, '0');
    const lastDayStr = String(lastDay).padStart(2, '0');

    const now = new Date();
    const isCurrent =
      now.getFullYear() === year && now.getMonth() === month;

    return {
      from_date: `${year}-${mStr}-01`,
      to_date: `${year}-${mStr}-${lastDayStr}`,
      monthLabel: formatMonthYear(selectedDate),
      isCurrentMonth: isCurrent,
    };
  }, [selectedDate]);

  const handlePrevMonth = useCallback(() => {
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const handleCurrentMonth = useCallback(() => {
    const now = new Date();
    setSelectedDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  // Fetch summary and transactions filtered by the chosen month
  const summaryQuery = useMemo(
    () => ({ from_date, to_date }),
    [from_date, to_date],
  );

  const transactionsQuery = useMemo(
    () => ({
      from_date,
      to_date,
      limit: 10,
      sort: 'date_desc' as const,
    }),
    [from_date, to_date],
  );

  const {
    summary,
    loading: summaryLoading,
    error: summaryError,
    reload: reloadSummary,
  } = useTransactionSummary(summaryQuery);

  const {
    data: categoryAnalytics,
    loading: categoryAnalyticsLoading,
    reload: reloadCategoryAnalytics,
  } = useCategoryAnalytics(summaryQuery);

  const targetMonthStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
  const {
    data: budgetData,
    loading: budgetsLoading,
    reload: reloadBudgets,
  } = useBudgets(targetMonthStr);

  const {
    items: recurringItems,
    loading: recurringLoading,
    reload: reloadRecurring,
    processDue: processDueRecurring,
  } = useRecurringTransactions();

  const {
    transactions,
    loading: transactionsLoading,
    error: transactionsError,
    reload: reloadTransactions,
  } = useTransactions(transactionsQuery);

  // Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        reloadTransactions(),
        reloadSummary(),
        reloadCategoryAnalytics(),
        reloadBudgets(),
        reloadRecurring(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [reloadTransactions, reloadSummary, reloadCategoryAnalytics, reloadBudgets, reloadRecurring]);

  const lastLoadedRevision = useRef(0);

  useEffect(() => {
    return subscribeTransactionCreated(() => {
      lastLoadedRevision.current = getTransactionRevision();
      void reloadTransactions();
      void reloadSummary();
      void reloadCategoryAnalytics();
      void reloadBudgets();
      void reloadRecurring();
    });
  }, [reloadTransactions, reloadSummary, reloadCategoryAnalytics, reloadBudgets, reloadRecurring]);

  useFocusEffect(
    useCallback(() => {
      if (getTransactionRevision() > lastLoadedRevision.current) {
        lastLoadedRevision.current = getTransactionRevision();
        void reloadTransactions();
        void reloadSummary();
        void reloadCategoryAnalytics();
        void reloadBudgets();
        void reloadRecurring();
      }
    }, [reloadTransactions, reloadSummary, reloadCategoryAnalytics, reloadBudgets, reloadRecurring]),
  );

  const firstName = user?.display_name?.split(' ')[0] ?? 'there';
  const recent = transactions.slice(0, 5);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={handleRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={refreshing}
            tintColor={colors.textMuted}
          />
        }
      >
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Money Tracker</Text>
            <Text style={styles.title}>Hi, {firstName}</Text>
          </View>

          <Link href="/profile" asChild>
            <Pressable
              accessibilityLabel="Profile and settings"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.settingsButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.settingsButtonText}>Settings</Text>
            </Pressable>
          </Link>
        </View>

        {/* Month Selector */}
        <View style={styles.monthSelectorCard}>
          <Pressable
            accessibilityLabel="Previous month"
            accessibilityRole="button"
            onPress={handlePrevMonth}
            style={({ pressed }) => [
              styles.monthNavBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.monthNavIcon}>‹</Text>
          </Pressable>

          <View style={styles.monthCenter}>
            <Text style={styles.monthLabelText}>{monthLabel}</Text>
            {!isCurrentMonth ? (
              <Pressable
                accessibilityLabel="Jump to current month"
                accessibilityRole="button"
                onPress={handleCurrentMonth}
                style={({ pressed }) => [
                  styles.currentMonthBadge,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.currentMonthBadgeText}>Current month</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityLabel="Next month"
            accessibilityRole="button"
            onPress={handleNextMonth}
            style={({ pressed }) => [
              styles.monthNavBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.monthNavIcon}>›</Text>
          </Pressable>
        </View>

        {/* Summary Card / Error / Loading States */}
        {summaryError ? (
          <View style={styles.messageBox}>
            <Text style={styles.errorText}>{summaryError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void reloadSummary()}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {summaryLoading && !summary ? (
          <View style={[styles.messageBox, styles.centerBox]}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.loadingText}>Loading monthly summary…</Text>
          </View>
        ) : null}

        {summary ? (
          <BalanceCard
            balance={Number(summary.balance)}
            currency={currency}
            expenses={Number(summary.expenses)}
            income={Number(summary.income)}
            label={`${monthLabel} balance`}
          />
        ) : null}

        {/* Category Spending Breakdown */}
        <CategoryBreakdown
          currency={currency}
          items={categoryAnalytics?.items ?? []}
          loading={categoryAnalyticsLoading}
          totalExpenses={Number(categoryAnalytics?.total_expenses ?? 0)}
        />

        {/* Monthly Budgets & Spending Limits */}
        <BudgetTracker
          currency={currency}
          items={budgetData?.items ?? []}
          loading={budgetsLoading}
          monthLabel={monthLabel}
          onBudgetChanged={() => void reloadBudgets()}
          totalBudget={Number(budgetData?.total_budget ?? 0)}
          totalSpent={Number(budgetData?.total_spent ?? 0)}
        />

        {/* Recurring Transactions & Subscriptions */}
        <RecurringTransactionsTracker
          currency={currency}
          items={recurringItems}
          loading={recurringLoading}
          onChanged={() => void reloadRecurring()}
          onProcessDue={async () => {
            const result = await processDueRecurring();
            if (result.processed > 0) {
              void reloadTransactions();
              void reloadSummary();
              void reloadCategoryAnalytics();
              void reloadBudgets();
            }
            return result.processed;
          }}
        />

        {/* Activity in Chosen Month Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Activity in {monthLabel}</Text>
            <Link href="/transactions" asChild>
              <Pressable
                accessibilityLabel="See all transactions"
                accessibilityRole="button"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            </Link>
          </View>

          {transactionsError ? (
            <View style={styles.messageBox}>
              <Text style={styles.errorText}>{transactionsError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void reloadTransactions()}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {transactionsLoading && transactions.length === 0 ? (
            <View style={[styles.messageBox, styles.centerBox]}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.loadingText}>Loading transactions…</Text>
            </View>
          ) : null}

          {!transactionsLoading && !transactionsError && recent.length === 0 ? (
            <View style={styles.messageBox}>
              <Text style={styles.emptyTitle}>No transactions in {monthLabel}</Text>
              <Text style={styles.emptyText}>
                No income or expenses recorded for this month yet.
              </Text>
              <Link href="/add" asChild>
                <Pressable
                  accessibilityLabel="Add transaction for this month"
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.emptyAddBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.emptyAddBtnText}>+ Add Transaction</Text>
                </Pressable>
              </Link>
            </View>
          ) : null}

          {recent.length > 0 ? (
            <View style={styles.list}>
              {recent.map((transaction, index) => (
                <TransactionRow
                  currency={currency}
                  isFirst={index === 0}
                  key={transaction.id}
                  transaction={transaction}
                />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <Link href="/add" asChild>
        <Pressable
          accessibilityLabel="Add transaction"
          accessibilityRole="button"
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </Link>
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
    paddingBottom: spacing.xl * 3,
  },
  headerRow: {
    alignItems: 'center',
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
    fontSize: 28,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  settingsButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  settingsButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  monthSelectorCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  monthNavBtn: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  monthNavIcon: {
    color: colors.primary,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  monthCenter: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  monthLabelText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  currentMonthBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  currentMonthBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  seeAllText: {
    color: colors.primary,
    fontSize: 14,
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
  centerBox: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
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
  emptyAddBtn: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyAddBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
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
  fab: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 28,
    bottom: spacing.xl,
    elevation: 6,
    height: 56,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    width: 56,
  },
  fabPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  fabIcon: {
    color: colors.background,
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 34,
    marginTop: -2,
    textAlign: 'center',
  },
});
