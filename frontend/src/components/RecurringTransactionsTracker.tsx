import { useCallback, useMemo, useState } from 'react';
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
  createRecurringRequest,
  deleteRecurringRequest,
  errorMessage,
  type FrequencyType,
  type RecurringTransaction,
  updateRecurringRequest,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { colors, radius, spacing } from '@/theme/colors';
import { formatCurrency } from '@/utils/format';
import {
  getTodayDateString,
  PRESET_CATEGORIES,
  validateAmount,
  validateCategory,
  validateDescription,
} from '@/utils/validation';

export type RecurringTransactionsTrackerProps = {
  items: RecurringTransaction[];
  currency: string;
  loading?: boolean;
  onChanged: () => void;
  onProcessDue: () => Promise<number>;
};

const FREQUENCIES: { label: string; value: FrequencyType }[] = [
  { label: 'Monthly', value: 'monthly' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Daily', value: 'daily' },
  { label: 'Yearly', value: 'yearly' },
];

export function RecurringTransactionsTracker({
  items,
  currency,
  loading = false,
  onChanged,
  onProcessDue,
}: RecurringTransactionsTrackerProps) {
  const { authedRequest } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('');
  const [frequency, setFrequency] = useState<FrequencyType>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const todayStr = useMemo(() => getTodayDateString(), []);

  const dueItems = useMemo(() => {
    return items.filter((item) => item.is_active && item.next_date <= todayStr);
  }, [items, todayStr]);

  const handleProcess = useCallback(async () => {
    setProcessing(true);
    setProcessMessage(null);
    try {
      const count = await onProcessDue();
      if (count > 0) {
        setProcessMessage(`Generated ${count} transaction${count > 1 ? 's' : ''}.`);
      } else {
        setProcessMessage('No transactions were due.');
      }
      setTimeout(() => setProcessMessage(null), 4000);
    } catch (err) {
      setProcessMessage(errorMessage(err));
    } finally {
      setProcessing(false);
    }
  }, [onProcessDue]);

  const handleCreate = useCallback(async () => {
    const descResult = validateDescription(desc);
    if (!descResult.isValid || !descResult.cleanValue) {
      setFormError(descResult.error ?? 'Description is required.');
      return;
    }

    const amtResult = validateAmount(amount);
    if (!amtResult.isValid || !amtResult.cleanValue) {
      setFormError(amtResult.error ?? 'Valid amount is required.');
      return;
    }

    const catResult = validateCategory(category);
    if (!catResult.isValid) {
      setFormError(catResult.error ?? 'Invalid category.');
      return;
    }

    const signedAmount =
      kind === 'expense' ? `-${amtResult.cleanValue}` : amtResult.cleanValue;

    setSubmitting(true);
    setFormError(null);
    try {
      await createRecurringRequest(
        {
          description: descResult.cleanValue,
          amount: signedAmount,
          category: catResult.cleanValue,
          frequency,
          start_date: todayStr,
        },
        authedRequest,
      );
      setDesc('');
      setAmount('');
      setCategory('');
      setFrequency('monthly');
      setShowAddForm(false);
      onChanged();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [amount, authedRequest, category, desc, frequency, kind, onChanged, todayStr]);

  const handleToggleActive = useCallback(
    async (item: RecurringTransaction) => {
      try {
        await updateRecurringRequest(
          item.id,
          { is_active: !item.is_active },
          authedRequest,
        );
        onChanged();
      } catch (err) {
        if (Platform.OS === 'web') {
          window.alert(errorMessage(err));
        } else {
          Alert.alert('Error', errorMessage(err));
        }
      }
    },
    [authedRequest, onChanged],
  );

  const confirmDelete = useCallback(
    (item: RecurringTransaction) => {
      const doDelete = async () => {
        setDeletingId(item.id);
        try {
          await deleteRecurringRequest(item.id, authedRequest);
          onChanged();
        } catch (err) {
          if (Platform.OS === 'web') {
            window.alert(errorMessage(err));
          } else {
            Alert.alert('Error', errorMessage(err));
          }
        } finally {
          setDeletingId(null);
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm(`Delete recurring rule for "${item.description}"?`)) {
          void doDelete();
        }
      } else {
        Alert.alert(
          'Delete Recurring Rule',
          `Are you sure you want to delete "${item.description}"?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
          ],
        );
      }
    },
    [authedRequest, onChanged],
  );

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.cardEyebrow}>Automation</Text>
          <Text style={styles.cardTitle}>Recurring & Subscriptions</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Process due recurring transactions"
            accessibilityRole="button"
            disabled={processing}
            onPress={() => void handleProcess()}
            style={({ pressed }) => [
              styles.actionBtn,
              dueItems.length > 0 && styles.actionBtnActive,
              (pressed || processing) && styles.pressed,
            ]}
          >
            {processing ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text
                style={[
                  styles.actionBtnText,
                  dueItems.length > 0 && styles.actionBtnTextActive,
                ]}
              >
                {dueItems.length > 0 ? `Process (${dueItems.length} Due)` : 'Check Due'}
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityLabel={showAddForm ? 'Cancel adding recurring' : 'Add recurring'}
            accessibilityRole="button"
            onPress={() => {
              setShowAddForm((prev) => !prev);
              setFormError(null);
            }}
            style={({ pressed }) => [
              styles.addBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.addBtnText}>{showAddForm ? 'Cancel' : '+ Add'}</Text>
          </Pressable>
        </View>
      </View>

      {processMessage ? (
        <View style={styles.feedbackBanner}>
          <Text style={styles.feedbackText}>{processMessage}</Text>
        </View>
      ) : null}

      {/* Add Recurring Form */}
      {showAddForm ? (
        <View style={styles.addFormContainer}>
          <Text style={styles.formTitle}>New Recurring Item</Text>

          {/* Kind Toggle */}
          <View style={styles.kindSelector}>
            <Pressable
              onPress={() => setKind('expense')}
              style={[
                styles.kindBtn,
                kind === 'expense' && styles.kindBtnExpenseActive,
              ]}
            >
              <Text
                style={[
                  styles.kindBtnText,
                  kind === 'expense' && styles.kindBtnTextActive,
                ]}
              >
                Expense
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setKind('income')}
              style={[
                styles.kindBtn,
                kind === 'income' && styles.kindBtnIncomeActive,
              ]}
            >
              <Text
                style={[
                  styles.kindBtnText,
                  kind === 'income' && styles.kindBtnTextActive,
                ]}
              >
                Income
              </Text>
            </Pressable>
          </View>

          <TextInput
            autoCapitalize="sentences"
            onChangeText={setDesc}
            placeholder="Description (e.g. Netflix, Rent, Salary)"
            placeholderTextColor={colors.textMuted}
            style={styles.formInput}
            value={desc}
          />

          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            placeholder="Amount (e.g. 15.99)"
            placeholderTextColor={colors.textMuted}
            style={styles.formInput}
            value={amount}
          />

          {/* Frequency selector */}
          <View style={styles.freqRow}>
            {FREQUENCIES.map((f) => (
              <Pressable
                key={f.value}
                onPress={() => setFrequency(f.value)}
                style={[
                  styles.freqChip,
                  frequency === f.value && styles.freqChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.freqChipText,
                    frequency === f.value && styles.freqChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            autoCapitalize="words"
            onChangeText={setCategory}
            placeholder="Category (e.g. Entertainment, Housing)"
            placeholderTextColor={colors.textMuted}
            style={styles.formInput}
            value={category}
          />

          {/* Category Preset Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetChipsScroll}
          >
            {PRESET_CATEGORIES.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setCategory(cat)}
                style={styles.presetChip}
              >
                <Text style={styles.presetChipText}>{cat}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

          <Pressable
            accessibilityLabel="Save recurring item"
            accessibilityRole="button"
            disabled={submitting}
            onPress={() => void handleCreate()}
            style={({ pressed }) => [
              styles.saveBtn,
              (pressed || submitting) && styles.pressed,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Recurring</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Loading State */}
      {loading && items.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.loadingText}>Loading recurring items…</Text>
        </View>
      ) : null}

      {/* Empty State */}
      {!loading && items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            No recurring bills, subscriptions, or salaries tracked yet. Set them up to automate transaction entries!
          </Text>
        </View>
      ) : null}

      {/* List */}
      {items.length > 0 ? (
        <View style={styles.itemsList}>
          {items.map((item) => {
            const numAmount = Number(item.amount);
            const isExpense = numAmount < 0;
            const isDue = item.is_active && item.next_date <= todayStr;
            const isDeleting = deletingId === item.id;

            return (
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  !item.is_active && styles.itemCardInactive,
                ]}
              >
                <View style={styles.itemHeader}>
                  <View style={styles.itemTitleGroup}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.itemTitle,
                        !item.is_active && styles.itemTitleInactive,
                      ]}
                    >
                      {item.description}
                    </Text>
                    <View style={styles.frequencyBadge}>
                      <Text style={styles.frequencyBadgeText}>
                        {item.frequency.toUpperCase()}
                      </Text>
                    </View>
                    {!item.is_active ? (
                      <View style={styles.pausedBadge}>
                        <Text style={styles.pausedBadgeText}>PAUSED</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text
                    style={[
                      styles.itemAmount,
                      isExpense ? styles.expenseAmount : styles.incomeAmount,
                      !item.is_active && styles.itemAmountInactive,
                    ]}
                  >
                    {isExpense ? '-' : '+'}
                    {formatCurrency(Math.abs(numAmount), currency)}
                  </Text>
                </View>

                <View style={styles.itemFooter}>
                  <View style={styles.itemMeta}>
                    {item.category ? (
                      <Text style={styles.itemCategory}>{item.category} • </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.itemNextDate,
                        isDue && styles.itemDueText,
                      ]}
                    >
                      {isDue ? 'Due Now' : `Next: ${item.next_date}`}
                    </Text>
                  </View>

                  <View style={styles.itemActions}>
                    <Pressable
                      accessibilityLabel={item.is_active ? 'Pause rule' : 'Resume rule'}
                      accessibilityRole="button"
                      onPress={() => void handleToggleActive(item)}
                      style={({ pressed }) => [
                        styles.toggleBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.toggleBtnText}>
                        {item.is_active ? 'Pause' : 'Resume'}
                      </Text>
                    </Pressable>

                    <Pressable
                      accessibilityLabel={`Delete ${item.description}`}
                      accessibilityRole="button"
                      disabled={isDeleting}
                      onPress={() => confirmDelete(item)}
                      style={({ pressed }) => [
                        styles.deleteBtn,
                        (pressed || isDeleting) && styles.pressed,
                      ]}
                    >
                      <Text style={styles.deleteBtnText}>×</Text>
                    </Pressable>
                  </View>
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
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionBtn: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  actionBtnActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  actionBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnTextActive: {
    color: colors.primary,
  },
  addBtn: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  addBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  feedbackBanner: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  feedbackText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
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
  kindSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  kindBtn: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  kindBtnExpenseActive: {
    backgroundColor: `${colors.danger}15`,
    borderColor: colors.danger,
  },
  kindBtnIncomeActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  kindBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  kindBtnTextActive: {
    color: colors.text,
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
  freqRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  freqChip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 6,
  },
  freqChipActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  freqChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  freqChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
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
  itemsList: {
    gap: spacing.sm,
  },
  itemCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  itemCardInactive: {
    opacity: 0.5,
  },
  itemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    maxWidth: 160,
  },
  itemTitleInactive: {
    textDecorationLine: 'line-through',
  },
  frequencyBadge: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  frequencyBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  pausedBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pausedBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  itemAmountInactive: {
    color: colors.textMuted,
  },
  expenseAmount: {
    color: colors.danger,
  },
  incomeAmount: {
    color: colors.primary,
  },
  itemFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemMeta: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  itemCategory: {
    color: colors.textMuted,
    fontSize: 12,
  },
  itemNextDate: {
    color: colors.textMuted,
    fontSize: 12,
  },
  itemDueText: {
    color: colors.warning,
    fontWeight: '700',
  },
  itemActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  toggleBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  toggleBtnText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '500',
  },
  deleteBtn: {
    alignItems: 'center',
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  deleteBtnText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
