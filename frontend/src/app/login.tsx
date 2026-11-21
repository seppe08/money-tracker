import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { API_URL, errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ApiStatusPill } from '@/components/ApiStatusPill';
import { AuthScreen } from '@/components/AuthScreen';
import { FormError } from '@/components/FormError';
import { FormField } from '@/components/FormField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useApiHealth } from '@/hooks/useApiHealth';
import { colors, spacing } from '@/theme/colors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { status, refresh } = useApiHealth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // The root navigator's auth guard switches to the app group.
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to see your balance, spending, and recent activity."
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            New here?{' '}
            <Link href="/register" asChild>
              <Pressable accessibilityRole="link">
                <Text style={styles.footerLink}>Create an account</Text>
              </Pressable>
            </Link>
          </Text>
          <ApiStatusPill status={status} label={API_URL} onRefresh={refresh} />
        </View>
      }
    >
      <FormField
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        label="Email"
        placeholder="you@example.com"
        returnKeyType="next"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <FormField
        autoCapitalize="none"
        autoComplete="current-password"
        label="Password"
        placeholder="Your password"
        returnKeyType="go"
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => void handleSubmit()}
      />
      <FormError message={error} />
      <PrimaryButton label="Sign in" loading={submitting} onPress={() => void handleSubmit()} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: spacing.md,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  footerLink: {
    color: colors.primary,
    fontWeight: '600',
  },
});
