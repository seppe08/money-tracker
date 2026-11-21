import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  ApiError,
  type AuthResponse,
  type RequestOptions,
  loginRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
  request,
  type TokenPair,
  type User,
} from '@/api/client';
import { deleteRefreshToken, getRefreshToken, saveRefreshToken } from '@/auth/token-storage';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Authenticated request that refreshes the access token once on 401. */
  authedRequest: <T>(path: string, options?: RequestOptions) => Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);

  // Access tokens are kept in memory only; the refresh token lives in
  // SecureStore (native) or in memory (web).
  const accessToken = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string> | null>(null);

  const clearLocalSession = useCallback(async () => {
    accessToken.current = null;
    setUser(null);
    setStatus('unauthenticated');
    await deleteRefreshToken();
  }, []);

  const startSession = useCallback(async (pair: TokenPair) => {
    await saveRefreshToken(pair.refresh_token);
    accessToken.current = pair.access_token;
  }, []);

  /**
   * Refresh tokens rotate on every use, so concurrent refreshes are de-duped:
   * two parallel calls must not both spend the same single-use token.
   */
  const refreshAccessToken = useCallback(async (): Promise<string> => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }

    const promise = (async () => {
      const stored = await getRefreshToken();
      if (!stored) {
        throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
      }

      const pair = await refreshRequest(stored);
      await saveRefreshToken(pair.refresh_token);
      accessToken.current = pair.access_token;
      return pair.access_token;
    })();

    refreshInFlight.current = promise;
    try {
      return await promise;
    } finally {
      refreshInFlight.current = null;
    }
  }, []);

  // Silent sign-in on launch: exchange the stored refresh token, then load the
  // profile. Any failure clears the stored token and shows the login screen.
  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const token = await refreshAccessToken();
        const profile = await request<User>('/api/v1/users/me', { token });
        if (!active) {
          return;
        }
        setUser(profile);
        setStatus('authenticated');
      } catch {
        if (!active) {
          return;
        }
        accessToken.current = null;
        setUser(null);
        setStatus('unauthenticated');
        await deleteRefreshToken();
      }
    }

    void restoreSession();

    return () => {
      active = false;
    };
  }, [refreshAccessToken]);

  const applyAuthResponse = useCallback(
    async (response: AuthResponse) => {
      await startSession(response);
      setUser(response.user);
      setStatus('authenticated');
    },
    [startSession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await loginRequest(email, password);
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const response = await registerRequest({
        email: input.email,
        password: input.password,
        display_name: input.displayName,
      });
      await applyAuthResponse(response);
    },
    [applyAuthResponse],
  );

  const signOut = useCallback(async () => {
    const stored = await getRefreshToken();
    await clearLocalSession();

    if (stored) {
      try {
        await logoutRequest(stored);
      } catch {
        // The local session is already gone; a failed network call must not
        // keep the user signed in.
      }
    }
  }, [clearLocalSession]);

  const authedRequest = useCallback(
    async function authedRequest<T>(
      path: string,
      options: RequestOptions = {},
    ): Promise<T> {
      let token = accessToken.current;
      if (!token) {
        try {
          token = await refreshAccessToken();
        } catch {
          await clearLocalSession();
          throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
        }
      }

      try {
        return await request<T>(path, { ...options, token });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) {
          throw error;
        }

        // Access token expired (or was revoked): refresh once and retry.
        try {
          const refreshed = await refreshAccessToken();
          return await request<T>(path, { ...options, token: refreshed });
        } catch (retryError) {
          await clearLocalSession();
          if (retryError instanceof ApiError && retryError.status === 401) {
            throw new ApiError(401, SESSION_EXPIRED_MESSAGE);
          }
          throw retryError;
        }
      }
    },
    [clearLocalSession, refreshAccessToken],
  );

  return (
    <AuthContext.Provider
      value={{ status, user, signIn, signUp, signOut, authedRequest }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return value;
}
