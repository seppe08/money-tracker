import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  changePasswordRequest,
  deleteAccountRequest,
  errorMessage,
  logoutAllRequest,
  updateProfileRequest,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { FormError } from '@/components/FormError';
import { FormField } from '@/components/FormField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { colors, radius, spacing } from '@/theme/colors';

const CURRENCIES = [
  { code: 'USD', label: 'USD ($)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'CAD', label: 'CAD ($)' },
  { code: 'AUD', label: 'AUD ($)' },
  { code: 'JPY', label: 'JPY (¥)' },
  { code: 'CHF', label: 'CHF (Fr)' },
  { code: 'CNY', label: 'CNY (¥)' },
  { code: 'INR', label: 'INR (₹)' },
];

export default function ProfileScreen() {
  const { user, authedRequest, signOut, logoutAll, updateProfile } = useAuth();

  // Profile details state
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [selectedCurrency, setSelectedCurrency] = useState(user?.currency ?? 'USD');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Logout-all state
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSaveProfile = useCallback(async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileError('Display name cannot be blank.');
      return;
    }
    if (trimmed.length > 80) {
      setProfileError('Display name cannot exceed 80 characters.');
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const updated = await updateProfileRequest(
        { display_name: trimmed, currency: selectedCurrency },
        authedRequest,
      );
      await updateProfile({ displayName: updated.display_name, currency: updated.currency });
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileError(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }, [authedRequest, displayName, selectedCurrency, updateProfile]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setChangingPassword(true);
    setPasswordError(null);

    try {
      await changePasswordRequest(
        { current_password: currentPassword, new_password: newPassword },
        authedRequest,
      );
      // The API revokes all sessions on password change
      await signOut();
      router.replace('/login');
    } catch (err) {
      setPasswordError(errorMessage(err));
      setChangingPassword(false);
    }
  }, [authedRequest, currentPassword, newPassword, confirmPassword, signOut]);

  const handleLogoutAll = useCallback(async () => {
    const execute = async () => {
      setLoggingOutAll(true);
      try {
        await logoutAllRequest(authedRequest);
      } catch {
        // Continue clearing local session regardless
      } finally {
        await logoutAll();
        router.replace('/login');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out of all active devices?')) {
        void execute();
      }
    } else {
      Alert.alert(
        'Sign Out of All Devices',
        'Are you sure you want to sign out of all active devices? You will need to log back in.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out All', style: 'destructive', onPress: () => void execute() },
        ],
      );
    }
  }, [authedRequest, logoutAll]);

  const handleDeleteAccount = useCallback(async () => {
    if (!deletePassword) {
      setDeleteError('Password is required to confirm account deletion.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      await deleteAccountRequest(deletePassword, authedRequest);
      await signOut();
      router.replace('/login');
    } catch (err) {
      setDeleteError(errorMessage(err));
      setDeletingAccount(false);
    }
  }, [authedRequest, deletePassword, signOut]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to Home"
            accessibilityRole="button"
            onPress={handleBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backButtonText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Profile & Settings</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* User Email Card */}
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>Signed In As</Text>
            <Text style={styles.userEmail}>{user?.email ?? 'Unknown'}</Text>
          </View>

          {/* Profile & Currency Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Details</Text>

            <FormField
              label="Display Name"
              placeholder="Your name"
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                setProfileError(null);
                setProfileSuccess(null);
              }}
              autoCapitalize="words"
            />

            <View style={styles.currencyGroup}>
              <Text style={styles.fieldLabel}>Currency Preference</Text>
              <View style={styles.currencyGrid}>
                {CURRENCIES.map((c) => {
                  const isSelected = selectedCurrency === c.code;
                  return (
                    <Pressable
                      key={c.code}
                      accessibilityLabel={`Select currency ${c.label}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setSelectedCurrency(c.code);
                        setProfileError(null);
                        setProfileSuccess(null);
                      }}
                      style={({ pressed }) => [
                        styles.currencyChip,
                        isSelected && styles.currencyChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.currencyChipText,
                          isSelected && styles.currencyChipTextSelected,
                        ]}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <FormError message={profileError} />
            {profileSuccess ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{profileSuccess}</Text>
              </View>
            ) : null}

            <PrimaryButton
              disabled={savingProfile}
              label="Save Profile"
              loading={savingProfile}
              onPress={handleSaveProfile}
            />
          </View>

          {/* Change Password Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Change Password</Text>
            <Text style={styles.sectionSubtitle}>
              New password must be at least 12 characters. Changing your password will sign you out of all devices.
            </Text>

            <FormField
              label="Current Password"
              placeholder="••••••••••••"
              secureTextEntry
              value={currentPassword}
              onChangeText={(text) => {
                setCurrentPassword(text);
                setPasswordError(null);
              }}
            />

            <FormField
              label="New Password"
              placeholder="At least 12 characters"
              secureTextEntry
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setPasswordError(null);
              }}
            />

            <FormField
              label="Confirm New Password"
              placeholder="Re-enter new password"
              secureTextEntry
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setPasswordError(null);
              }}
            />

            <FormError message={passwordError} />

            <PrimaryButton
              disabled={changingPassword}
              label="Update Password"
              loading={changingPassword}
              onPress={handleChangePassword}
            />
          </View>

          {/* Sessions & Logout Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sessions</Text>
            <Text style={styles.sectionSubtitle}>
              Manage active sessions and sign out across devices.
            </Text>

            <Pressable
              accessibilityLabel="Sign out of all devices"
              accessibilityRole="button"
              disabled={loggingOutAll}
              onPress={handleLogoutAll}
              style={({ pressed }) => [
                styles.actionButton,
                styles.logoutAllButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.logoutAllText}>
                {loggingOutAll ? 'Signing out of all devices…' : 'Sign out of all devices'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Sign out of this device"
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [
                styles.actionButton,
                styles.signOutButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.signOutText}>Sign out of this device</Text>
            </Pressable>
          </View>

          {/* Danger Zone: Delete Account */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Danger Zone</Text>
            <Text style={styles.dangerSubtitle}>
              Permanently delete your account and all financial data. This action cannot be reversed.
            </Text>

            {!showDeleteModal ? (
              <Pressable
                accessibilityLabel="Delete Account"
                accessibilityRole="button"
                onPress={() => {
                  setShowDeleteModal(true);
                  setDeleteError(null);
                  setDeletePassword('');
                }}
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.deleteButtonText}>Delete Account</Text>
              </Pressable>
            ) : (
              <View style={styles.deleteConfirmContainer}>
                <Text style={styles.deleteConfirmPrompt}>
                  Confirm your password to permanently delete your account:
                </Text>

                <TextInput
                  autoFocus
                  placeholder="Enter current password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  style={styles.deletePasswordInput}
                  value={deletePassword}
                  onChangeText={(text) => {
                    setDeletePassword(text);
                    setDeleteError(null);
                  }}
                />

                <FormError message={deleteError} />

                <View style={styles.deleteButtonRow}>
                  <Pressable
                    accessibilityLabel="Cancel Account Deletion"
                    accessibilityRole="button"
                    disabled={deletingAccount}
                    onPress={() => {
                      setShowDeleteModal(false);
                      setDeletePassword('');
                      setDeleteError(null);
                    }}
                    style={({ pressed }) => [
                      styles.cancelDeleteBtn,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.cancelDeleteBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    accessibilityLabel="Confirm Account Deletion"
                    accessibilityRole="button"
                    disabled={deletingAccount}
                    onPress={handleDeleteAccount}
                    style={({ pressed }) => [
                      styles.confirmDeleteBtn,
                      deletingAccount && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.confirmDeleteBtnText}>
                      {deletingAccount ? 'Deleting…' : 'Delete Account'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerPlaceholder: {
    width: 60,
  },
  content: {
    gap: spacing.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  cardEyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  userEmail: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -spacing.xs,
  },
  currencyGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  currencyChip: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  currencyChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  currencyChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  currencyChipTextSelected: {
    color: colors.background,
    fontWeight: '700',
  },
  successBox: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  successText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  logoutAllButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.warning ?? '#eab308',
  },
  logoutAllText: {
    color: colors.warning ?? '#eab308',
    fontSize: 15,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  signOutText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerZone: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  dangerTitle: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: '700',
  },
  dangerSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -spacing.xs,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  deleteButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  deleteConfirmContainer: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  deleteConfirmPrompt: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  deletePasswordInput: {
    backgroundColor: colors.background,
    borderColor: colors.danger,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  deleteButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelDeleteBtn: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  cancelDeleteBtnText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  confirmDeleteBtnText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
