import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { CategorySpendingItem } from '@/api/client';
import { colors, radius, spacing } from '@/theme/colors';
import { formatCurrency } from '@/utils/format';

const CATEGORY_COLORS = [
  '#3DDC97', // Emerald
  '#4D96FF', // Sky Blue
  '#FFC857', // Amber
  '#FF6B6B', // Rose
  '#A370F7', // Purple
  '#00C9A7', // Teal
  '#FF9671', // Coral
  '#845EC2', // Deep Purple
];

export type CategoryBreakdownProps = {
  items: CategorySpendingItem[];
  totalExpenses: number;
  currency: string;
  loading?: boolean;
};

export function CategoryBreakdown({
  items,
  totalExpenses,
  currency,
  loading = false,
}: CategoryBreakdownProps) {
  const [showAll, setShowAll] = useState(false);

  if (loading && items.length === 0) {
    return (
      <View style={[styles.card, styles.centerCard]}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.loadingText}>Loading category breakdown…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spending by Category</Text>
        <Text style={styles.emptyText}>
          No expenses recorded for this month yet.
        </Text>
      </View>
    );
  }

  const visibleItems = showAll ? items : items.slice(0, 5);
  const hasMore = items.length > 5;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.cardEyebrow}>Breakdown</Text>
          <Text style={styles.cardTitle}>Spending by Category</Text>
        </View>
        <Text style={styles.totalAmount}>
          {formatCurrency(totalExpenses, currency)}
        </Text>
      </View>

      <View style={styles.itemsList}>
        {visibleItems.map((item, index) => {
          const barColor = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
          const clampedPercent = Math.min(Math.max(item.percentage, 0), 100);

          return (
            <View key={item.category} style={styles.itemRow}>
              <View style={styles.itemMetaRow}>
                <View style={styles.categoryInfo}>
                  <View
                    style={[styles.colorIndicator, { backgroundColor: barColor }]}
                  />
                  <Text numberOfLines={1} style={styles.categoryName}>
                    {item.category}
                  </Text>
                  <Text style={styles.txCount}>
                    ({item.count} {item.count === 1 ? 'tx' : 'txs'})
                  </Text>
                </View>

                <View style={styles.amountInfo}>
                  <Text style={styles.amountText}>
                    {formatCurrency(Number(item.amount), currency)}
                  </Text>
                  <Text style={styles.percentText}>
                    {item.percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>

              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: barColor,
                      width: `${clampedPercent}%`,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      {hasMore ? (
        <Pressable
          accessibilityLabel={showAll ? 'Show fewer categories' : 'Show all categories'}
          accessibilityRole="button"
          onPress={() => setShowAll((prev) => !prev)}
          style={({ pressed }) => [
            styles.toggleButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.toggleButtonText}>
            {showAll ? 'Show fewer' : `Show all ${items.length} categories`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  centerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  totalAmount: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: '700',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginLeft: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  itemsList: {
    gap: spacing.md,
  },
  itemRow: {
    gap: spacing.xs,
  },
  itemMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryInfo: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  colorIndicator: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  categoryName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 160,
  },
  txCount: {
    color: colors.textMuted,
    fontSize: 12,
  },
  amountInfo: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  amountText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  percentText: {
    color: colors.textMuted,
    fontSize: 12,
    minWidth: 42,
    textAlign: 'right',
  },
  progressBarBackground: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    borderRadius: radius.sm,
    height: '100%',
  },
  toggleButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
  },
  toggleButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
