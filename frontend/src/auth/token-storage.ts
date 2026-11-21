import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'money_tracker.refresh_token';

// expo-secure-store has no web implementation. On web we deliberately keep the
// refresh token in memory only: a page reload requires signing in again, which
// is safer than persisting a long-lived token in localStorage. A production
// web client should use an HttpOnly refresh cookie instead.
let webRefreshToken: string | null = null;

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webRefreshToken;
  }

  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webRefreshToken = token;
    return;
  }

  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function deleteRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webRefreshToken = null;
    return;
  }

  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing to delete, or the entry was already invalidated.
  }
}
