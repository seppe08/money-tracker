import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import {
  ApiError,
  deleteTransactionRequest,
  errorMessage,
  fetchTransaction,
  type Transaction,
  type TransactionInput,
  type TransactionUpdateInput,
  updateTransactionRequest,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { TransactionForm } from '@/components/TransactionForm';
import { colors, radius, spacing } from '@/theme/colors';
import {
  emitTransactionDeleted,
  emitTransactionUpdated,
} from '@/utils/transaction-events';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const transactionId = Array.isArray(id) ? id[0] : id;
  const { authedRequest } = useAuth();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(Boolean(transactionId));
  const [loadError, setLoadError] = useState<string | null>(
    transactionId ? null : 'Transaction ID is missing.',
  );
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    if (!transactionId) {
      return;
    }

    fetchTransaction(transactionId, authedRequest)
      .then((data) => {
        if (!active) return;
        setTransaction(data);
        setLoadError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError('This transaction was deleted');
        } else {
          setLoadError(errorMessage(err));
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authedRequest, transactionId]);

  const handleSave = useCallback(
    async (
      _values: TransactionInput,
      changedFields: TransactionUpdateInput,
    ) => {
      if (!transactionId) return;

      try {
        await updateTransactionRequest(
          transactionId,
          changedFields,
          authedRequest,
        );
        emitTransactionUpdated();
        router.back();
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          emitTransactionDeleted();
          const message = 'This transaction was deleted';
          Alert.alert('Notice', message, [
            {
              text: 'OK',
              onPress: () => {
                router.back();
              },
            },
          ]);
          if (Platform.OS === 'web') {
            window.alert(message);
            router.back();
          }
          throw new Error(message);
        }
        throw err;
      }
    },
    [authedRequest, transactionId],
  );

  const executeDelete = useCallback(async () => {
    if (!transactionId) return;

    setIsDeleting(true);
    try {
      await deleteTransactionRequest(transactionId, authedRequest);
      emitTransactionDeleted();
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        emitTransactionDeleted();
        router.back();
        return;
      }
      const message = errorMessage(err);
      Alert.alert('Error', message);
      if (Platform.OS === 'web') {
        window.alert(message);
      }
    } finally {
      setIsDeleting(false);
    }
  }, [authedRequest, transactionId]);

  const confirmDelete = useCallback(() => {
    const title = 'Delete Transaction';
    const message = 'Are you sure you want to delete this transaction?';

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void executeDelete();
        },
      },
    ]);

    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        void executeDelete();
      }
    }
  }, [executeDelete]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit Transaction</Text>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !transaction) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit Transaction</Text>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>
            {loadError ?? 'Transaction not found.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Edit Transaction</Text>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>

        <TransactionForm
          initialTransaction={transaction}
          submitLabel="Save Changes"
          onSubmit={handleSave}
          onDelete={confirmDelete}
          deleteLabel="Delete Transaction"
          isDeleting={isDeleting}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  cancelButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  centerContainer: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
