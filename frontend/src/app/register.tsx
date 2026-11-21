import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { AuthScreen } from '@/components/AuthScreen';
import { FormError } from '@/components/FormError';
import { FormField } from '@/components/FormField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors } from '@/theme/colors';

const MIN_PASSWORD_LENGTH = 12;

export default function RegisterScreen() {
  const { signUp } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    if (!displayName.trim() || !email.trim()) {
      setError('Enter your name and email.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="Start tracking where your money goes. Your data stays private to your account."
      footer={
        <Text style={styles.footerText}>
          Already have an account?{' '}
          <Link href="/login" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.footerLink}>Sign in</Text>
            </Pressable>
          </Link>
        </Text>
      }
    >
      <FormField
        autoCapitalize="words"
        autoComplete="name"
        label="Name"
        placeholder="Ada Lovelace"
        returnKeyType="next"
        textContentType="name"
        value={displayName}
        onChangeText={setDisplayName}
      />
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
        autoComplete="new-password"
        label="Password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        returnKeyType="next"
        secureTextEntry
        textContentType="newPassword"
        value={password}
        onChangeText={setPassword}
      />
      <FormField
        autoCapitalize="none"
        autoComplete="new-password"
        label="Confirm password"
        placeholder="Repeat your password"
        returnKeyType="go"
        secureTextEntry
        textContentType="newPassword"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        onSubmitEditing={() => void handleSubmit()}
      />
      <FormError message={error} />
      <PrimaryButton
        label="Create account"
        loading={submitting}
        onPress={() => void handleSubmit()}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
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
