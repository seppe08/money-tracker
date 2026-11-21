import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Port the FastAPI backend listens on during development. */
const API_PORT = 8000;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** `hostUri` looks like `192.168.1.20:8081` or `[::1]:8081`. */
function hostFromUri(hostUri: string): string {
  const withoutScheme = hostUri.replace(/^[a-z]+:\/\//i, '');

  if (withoutScheme.startsWith('[')) {
    const end = withoutScheme.indexOf(']');
    return end === -1 ? withoutScheme : withoutScheme.slice(0, end + 1);
  }

  return withoutScheme.split('/')[0].split(':')[0];
}

/**
 * The machine serving the JavaScript bundle is normally the machine running
 * the backend too, so reuse its address (usually the LAN IP when the bundle is
 * loaded on a phone).
 */
function devServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) {
    return null;
  }

  const host = hostFromUri(hostUri);
  if (!host) {
    return null;
  }

  // Inside the Android emulator `localhost` is the emulated device, not the
  // development machine. 10.0.2.2 is the emulator's alias for the host.
  if (Platform.OS === 'android' && LOOPBACK_HOSTS.has(host)) {
    return '10.0.2.2';
  }

  return host;
}

function resolveApiUrl(): string {
  // An explicit value always wins, e.g. when the backend runs on another
  // machine or is reached through a tunnel.
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  // On web the app and the backend usually share the page's hostname.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;
  }

  const host = devServerHost();
  if (host) {
    return `http://${host}:${API_PORT}`;
  }

  // Fallback for release builds with no dev server information.
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${API_PORT}`
    : `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl();
