import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { createTransactionRequest } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { TransactionForm } from '@/components/TransactionForm';
import { colors, spacing } from '@/theme/colors';
import { emitTransactionCreated } from '@/utils/transaction-events';

export default function AddTransactionScreen() {
  const { authedRequest } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Add Transaction</Text>
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
          autoFocusAmount
          onSubmit={async (values) => {
            await createTransactionRequest(values, authedRequest);
            emitTransactionCreated();
            router.back();
          }}
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
  pressed: {
    opacity: 0.7,
  },
});
