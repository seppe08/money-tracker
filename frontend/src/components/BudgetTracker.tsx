import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  type BudgetWithSpend,
  createBudgetRequest,
  deleteBudgetRequest,
  errorMessage,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/colors';
import { formatCurrency } from '@/utils/format';
import { PRESET_CATEGORIES, validateAmount, validateCategory } from '@/utils/validation';

export type BudgetTrackerProps = {
  items: BudgetWithSpend[];
  totalBudget: number;
  totalSpent: number;
  currency: string;
  monthLabel: string;
  loading?: boolean;
  onBudgetChanged: () => void;
};

export function BudgetTracker({
  items,
  totalBudget,
  totalSpent,
  currency,
  monthLabel,
  loading = false,
  onBudgetChanged,
}: BudgetTrackerProps) {
  const { authedRequest } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const catResult = validateCategory(newCategory);
    if (!catResult.isValid || !catResult.cleanValue) {
      setFormError('Category name is required.');
      return;
    }
    const amtResult = validateAmount(newLimit);
    if (!amtResult.isValid || !amtResult.cleanValue) {
      setFormError(amtResult.error ?? 'Valid limit is required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await createBudgetRequest(
        { category: catResult.cleanValue, monthly_limit: amtResult.cleanValue },
        authedRequest,
      );
      setNewCategory('');
      setNewLimit('');
      setShowAddForm(false);
      onBudgetChanged();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [authedRequest, newCategory, newLimit, onBudgetChanged]);

  const handleDelete = useCallback(
    async (budgetId: string, categoryName: string) => {
      const confirmAction = async () => {
        setDeletingId(budgetId);
        try {
          await deleteBudgetRequest(budgetId, authedRequest);
          onBudgetChanged();
        } catch (err) {
          Alert.alert('Error', errorMessage(err));
        } finally {
          setDeletingId(null);
        }
      };

      const title = 'Delete Budget';
      const msg = `Are you sure you want to delete the budget for ${categoryName}?`;

      if (Platform.OS === 'web') {
        if (window.confirm(msg)) {
          void confirmAction();
        }
      } else {
        Alert.alert(title, msg, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void confirmAction() },
        ]);
      }
    },
    [authedRequest, onBudgetChanged],
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.cardEyebrow}>Limits & Planning</Text>
          <Text style={styles.cardTitle}>Monthly Budgets</Text>
        </View>

        <Pressable
          accessibilityLabel={showAddForm ? 'Cancel budget creation' : 'Add new category budget'}
          accessibilityRole="button"
          onPress={() => {
            setShowAddForm((prev) => !prev);
            setFormError(null);
          }}
          style={({ pressed }) => [styles.addBudgetBtn, pressed && styles.pressed]}
        >
          <Text style={styles.addBudgetBtnText}>{showAddForm ? '✕ Close' : '+ Set Budget'}</Text>
        </Pressable>
      </View>

      {/* Inline Add Budget Form */}
      {showAddForm ? (
        <View style={styles.addFormContainer}>
          <Text style={styles.formTitle}>New Category Budget</Text>
          <TextInput
            accessibilityLabel="Category name"
            onChangeText={(text) => {
              setNewCategory(text);
              if (formError) setFormError(null);
            }}
            placeholder="Category (e.g. Food & Dining, Gas)"
            placeholderTextColor={colors.textMuted}
            style={styles.formInput}
            value={newCategory}
          />

          {/* Quick preset chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetChipsScroll}
          >
            {PRESET_CATEGORIES.map((preset) => (
              <Pressable
                key={preset}
                accessibilityLabel={`Select category ${preset}`}
                accessibilityRole="button"
                onPress={() => {
                  setNewCategory(preset);
                  if (formError) setFormError(null);
                }}
                style={({ pressed }) => [styles.presetChip, pressed && styles.pressed]}
              >
                <Text style={styles.presetChipText}>{preset}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextInput
            accessibilityLabel="Monthly spending limit"
            keyboardType="decimal-pad"
            onChangeText={(text) => {
              setNewLimit(text);
              if (formError) setFormError(null);
            }}
            placeholder="Monthly Limit (e.g. 500.00)"
            placeholderTextColor={colors.textMuted}
            style={styles.formInput}
            value={newLimit}
          />

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <Pressable
            accessibilityLabel="Save Budget"
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void handleCreate()}
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && styles.pressed,
              submitting && styles.disabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Budget</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Loading state */}
      {loading && items.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Loading budgets…</Text>
        </View>
      ) : null}

      {/* Empty state */}
      {!loading && items.length === 0 && !showAddForm ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No budgets created yet. Set spending limits by category to stay on track.
          </Text>
        </View>
      ) : null}

      {/* Budget list */}
      {items.length > 0 ? (
        <View style={styles.budgetList}>
          {totalBudget > 0 ? (
            <View style={styles.totalSummaryRow}>
              <Text style={styles.totalSummaryLabel}>Overall Total:</Text>
              <Text style={styles.totalSummaryValue}>
                {formatCurrency(totalSpent, currency)} / {formatCurrency(totalBudget, currency)}
              </Text>
            </View>
          ) : null}

          {items.map((budget) => {
            const limit = Number(budget.monthly_limit);
            const spent = Number(budget.spent);
            const remaining = Number(budget.remaining);
            const clampedPercent = Math.min(Math.max(budget.percentage, 0), 100);

            let barColor: string = colors.primary;
            if (budget.is_over_budget) {
              barColor = colors.danger;
            } else if (budget.percentage >= 80) {
              barColor = colors.warning;
            }

            return (
              <View key={budget.id} style={styles.budgetItemCard}>
                <View style={styles.budgetHeader}>
                  <View style={styles.categoryTitleGroup}>
                    <Text numberOfLines={1} style={styles.budgetCategory}>
                      {budget.category}
                    </Text>
                    {budget.is_over_budget ? (
                      <View style={styles.overBadge}>
                        <Text style={styles.overBadgeText}>Over Limit</Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    accessibilityLabel={`Delete budget for ${budget.category}`}
                    accessibilityRole="button"
                    disabled={deletingId === budget.id}
                    onPress={() => void handleDelete(budget.id, budget.category)}
                    style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                  >
                    {deletingId === budget.id ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : (
                      <Text style={styles.deleteBtnText}>✕</Text>
                    )}
                  </Pressable>
                </View>

                {/* Numbers Row */}
                <View style={styles.numbersRow}>
                  <Text style={styles.spentText}>
                    {formatCurrency(spent, currency)}
                    <Text style={styles.limitMuted}> / {formatCurrency(limit, currency)}</Text>
                  </Text>
                  <Text style={[styles.remainingText, budget.is_over_budget && styles.overText]}>
                    {budget.is_over_budget
                      ? `${formatCurrency(Math.abs(remaining), currency)} over`
                      : `${formatCurrency(remaining, currency)} left`}
                  </Text>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBackground}>
                  <View
                    style={[
                      styles.progressFill,
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
  headerRow: {
    alignItems: 'center',
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
  addBudgetBtn: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  addBudgetBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  addFormContainer: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  formTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  formInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    height: 40,
    paddingHorizontal: spacing.md,
  },
  presetChipsScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  presetChipText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  saveBtn: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  saveBtnText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: '700',
  },
  centerContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginLeft: spacing.sm,
  },
  emptyContainer: {
    paddingVertical: spacing.xs,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  budgetList: {
    gap: spacing.md,
  },
  totalSummaryRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  totalSummaryLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  totalSummaryValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  budgetItemCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  budgetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  budgetCategory: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    maxWidth: 160,
  },
  overBadge: {
    backgroundColor: colors.danger,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  overBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  deleteBtn: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  deleteBtnText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  numbersRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  spentText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  limitMuted: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '400',
  },
  remainingText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  overText: {
    color: colors.danger,
  },
  progressBackground: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  progressFill: {
    borderRadius: radius.sm,
    height: '100%',
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.6,
  },
});
