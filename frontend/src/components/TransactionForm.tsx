import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  errorMessage,
  fetchCategories,
  type Transaction,
  type TransactionInput,
  type TransactionUpdateInput,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { FormError } from '@/components/FormError';
import { FormField } from '@/components/FormField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing } from '@/theme/colors';

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateAmount(rawAmount: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
} {
  const trimmed = rawAmount.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Amount is required.' };
  }

  // Must be a positive decimal number without signs (signs handled by segmented toggle)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { isValid: false, error: 'Amount must be a positive number.' };
  }

  const parts = trimmed.split('.');
  if (parts.length === 2 && parts[1].length > 2) {
    return {
      isValid: false,
      error: 'Amount must have at most 2 decimal places.',
    };
  }

  const numericValue = parseFloat(trimmed);
  if (isNaN(numericValue) || numericValue <= 0) {
    return { isValid: false, error: 'Amount must be greater than zero.' };
  }

  if (numericValue > 9999999999.99) {
    return { isValid: false, error: 'Amount is too large.' };
  }

  const cleanValue =
    parts.length === 2 && parts[1].length === 1
      ? `${parts[0]}.${parts[1]}0`
      : parts.length === 1
        ? `${parts[0]}.00`
        : trimmed;

  return { isValid: true, cleanValue };
}

export function validateDescription(rawDesc: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
} {
  const trimmed = rawDesc.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Description is required.' };
  }
  if (trimmed.length > 200) {
    return {
      isValid: false,
      error: 'Description cannot exceed 200 characters.',
    };
  }
  return { isValid: true, cleanValue: trimmed };
}

export function validateCategory(rawCat: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string | null;
} {
  const trimmed = rawCat.trim();
  if (!trimmed) {
    return { isValid: true, cleanValue: null };
  }
  if (trimmed.length > 50) {
    return { isValid: false, error: 'Category cannot exceed 50 characters.' };
  }
  return { isValid: true, cleanValue: trimmed };
}

export function validateOccurredOn(rawDate: string): {
  isValid: boolean;
  error?: string;
  cleanValue?: string;
} {
  const trimmed = rawDate.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Date is required.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { isValid: false, error: 'Date must be in YYYY-MM-DD format.' };
  }
  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (month < 1 || month > 12) {
    return { isValid: false, error: 'Month must be between 01 and 12.' };
  }
  if (day < 1 || day > 31) {
    return { isValid: false, error: 'Day must be between 01 and 31.' };
  }

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObj.getUTCFullYear() !== year ||
    dateObj.getUTCMonth() + 1 !== month ||
    dateObj.getUTCDate() !== day
  ) {
    return { isValid: false, error: 'Date must be a valid calendar date.' };
  }

  return { isValid: true, cleanValue: trimmed };
}

export type TransactionFormProps = {
  initialTransaction?: Transaction | null;
  onSubmit: (
    values: TransactionInput,
    changedFields: TransactionUpdateInput,
  ) => Promise<void>;
  submitLabel?: string;
  onDelete?: () => void;
  deleteLabel?: string;
  isDeleting?: boolean;
  extraActions?: React.ReactNode;
  autoFocusAmount?: boolean;
};

export function TransactionForm({
  initialTransaction,
  onSubmit,
  submitLabel,
  onDelete,
  deleteLabel = 'Delete Transaction',
  isDeleting = false,
  extraActions,
  autoFocusAmount = false,
}: TransactionFormProps) {
  const { authedRequest } = useAuth();

  const isInitialExpense = initialTransaction
    ? Number(initialTransaction.amount) < 0
    : true;

  const [kind, setKind] = useState<'expense' | 'income'>(
    isInitialExpense ? 'expense' : 'income',
  );
  const [description, setDescription] = useState(
    initialTransaction?.description ?? '',
  );
  const [amount, setAmount] = useState(
    initialTransaction ? initialTransaction.amount.replace(/^[+-]/, '') : '',
  );
  const [category, setCategory] = useState(
    initialTransaction?.category ?? '',
  );
  const [occurredOn, setOccurredOn] = useState(
    () => initialTransaction?.occurred_on ?? getTodayDateString(),
  );

  const [categories, setCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [amountError, setAmountError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchCategories(authedRequest)
      .then((cats) => {
        if (active && Array.isArray(cats)) {
          setCategories(cats);
        }
      })
      .catch(() => {
        // Category suggestions are optional; ignore errors if fetch fails.
      });

    return () => {
      active = false;
    };
  }, [authedRequest]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);

    const descResult = validateDescription(description);
    const amountResult = validateAmount(amount);
    const catResult = validateCategory(category);
    const dateResult = validateOccurredOn(occurredOn);

    setDescriptionError(descResult.error ?? null);
    setAmountError(amountResult.error ?? null);
    setCategoryError(catResult.error ?? null);
    setDateError(dateResult.error ?? null);

    if (
      !descResult.isValid ||
      !amountResult.isValid ||
      !catResult.isValid ||
      !dateResult.isValid
    ) {
      return;
    }

    const finalAmount =
      kind === 'expense'
        ? `-${amountResult.cleanValue}`
        : amountResult.cleanValue!;

    const values: TransactionInput = {
      description: descResult.cleanValue!,
      amount: finalAmount,
      category: catResult.cleanValue,
      occurred_on: dateResult.cleanValue!,
    };

    const changedFields: TransactionUpdateInput = {};

    if (initialTransaction) {
      if (descResult.cleanValue !== initialTransaction.description) {
        changedFields.description = descResult.cleanValue;
      }
      if (Number(finalAmount) !== Number(initialTransaction.amount)) {
        changedFields.amount = finalAmount;
      }
      const initialCat = initialTransaction.category ?? null;
      if (catResult.cleanValue !== initialCat) {
        changedFields.category = catResult.cleanValue;
      }
      if (dateResult.cleanValue !== initialTransaction.occurred_on) {
        changedFields.occurred_on = dateResult.cleanValue;
      }
    } else {
      changedFields.description = values.description;
      changedFields.amount = values.amount;
      changedFields.category = values.category;
      changedFields.occurred_on = values.occurred_on;
    }

    setSubmitting(true);
    try {
      await onSubmit(values, changedFields);
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    amount,
    category,
    description,
    initialTransaction,
    kind,
    occurredOn,
    onSubmit,
  ]);

  const defaultSubmitLabel =
    kind === 'expense' ? 'Add Expense' : 'Add Income';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.segmentContainer}>
        <Pressable
          accessibilityLabel="Expense toggle"
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'expense' }}
          onPress={() => setKind('expense')}
          style={[
            styles.segmentButton,
            kind === 'expense' && styles.segmentExpenseActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              kind === 'expense' && styles.segmentExpenseTextActive,
            ]}
          >
            Expense
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Income toggle"
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'income' }}
          onPress={() => setKind('income')}
          style={[
            styles.segmentButton,
            kind === 'income' && styles.segmentIncomeActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              kind === 'income' && styles.segmentIncomeTextActive,
            ]}
          >
            Income
          </Text>
        </Pressable>
      </View>

      <View style={styles.fieldWrapper}>
        <FormField
          autoFocus={autoFocusAmount}
          label="Amount"
          value={amount}
          onChangeText={(text) => {
            setAmount(text);
            if (amountError) setAmountError(null);
          }}
          placeholder="0.00"
          keyboardType="decimal-pad"
          autoCapitalize="none"
        />
        <FormError message={amountError} />
      </View>

      <View style={styles.fieldWrapper}>
        <FormField
          label="Description"
          value={description}
          onChangeText={(text) => {
            setDescription(text);
            if (descriptionError) setDescriptionError(null);
          }}
          placeholder="e.g. Groceries, Rent, Salary"
          maxLength={200}
        />
        <FormError message={descriptionError} />
      </View>

      <View style={styles.fieldWrapper}>
        <FormField
          label="Category (optional)"
          value={category}
          onChangeText={(text) => {
            setCategory(text);
            if (categoryError) setCategoryError(null);
          }}
          placeholder="e.g. Food, Utilities, Transport"
          maxLength={50}
        />
        <FormError message={categoryError} />

        {categories.length > 0 ? (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsTitle}>Suggestions</Text>
            <View style={styles.chipsRow}>
              {categories.map((cat) => {
                const isSelected =
                  category.trim().toLowerCase() === cat.toLowerCase();
                return (
                  <Pressable
                    key={cat}
                    accessibilityLabel={`Select category ${cat}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      setCategory(isSelected ? '' : cat);
                      if (categoryError) setCategoryError(null);
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      isSelected && styles.chipSelected,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.fieldWrapper}>
        <FormField
          label="Date (YYYY-MM-DD)"
          value={occurredOn}
          onChangeText={(text) => {
            setOccurredOn(text);
            if (dateError) setDateError(null);
          }}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <FormError message={dateError} />
      </View>

      <FormError message={submitError} />

      <View style={styles.actionRow}>
        <PrimaryButton
          label={submitLabel ?? defaultSubmitLabel}
          onPress={handleSubmit}
          loading={submitting}
          disabled={isDeleting}
        />

        {onDelete ? (
          <Pressable
            accessibilityLabel={deleteLabel}
            accessibilityRole="button"
            accessibilityState={{
              busy: isDeleting,
              disabled: submitting || isDeleting,
            }}
            disabled={submitting || isDeleting}
            onPress={onDelete}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.pressed,
              (submitting || isDeleting) && styles.disabled,
            ]}
          >
            {isDeleting ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Text style={styles.deleteButtonText}>{deleteLabel}</Text>
            )}
          </Pressable>
        ) : null}

        {extraActions}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  segmentContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  segmentExpenseActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderColor: colors.danger,
    borderWidth: 1,
  },
  segmentIncomeActive: {
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    borderColor: colors.primary,
    borderWidth: 1,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  segmentExpenseTextActive: {
    color: colors.danger,
  },
  segmentIncomeTextActive: {
    color: colors.primary,
  },
  fieldWrapper: {
    gap: spacing.xs,
  },
  suggestionsContainer: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  suggestionsTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipSelected: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  actionRow: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.7,
  },
});
