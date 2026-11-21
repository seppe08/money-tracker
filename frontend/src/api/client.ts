import { API_URL } from '@/api/api-url';

export { API_URL };

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    message: string,
    options: { requestId?: string; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export type User = {
  id: string;
  email: string;
  display_name: string;
  currency: string;
  created_at: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  /** Access token lifetime in seconds. */
  expires_in: number;
};

export type AuthResponse = TokenPair & {
  user: User;
};

export type Transaction = {
  id: string;
  user_id: string;
  description: string;
  /** Decimal serialised by the API as a string, e.g. "-12.50". */
  amount: string;
  category: string | null;
  occurred_on: string;
  created_at: string;
  updated_at: string;
};

export type TransactionList = {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
};

export type TransactionSummary = {
  /** Decimal strings; parse with Number() only for display. */
  balance: string;
  income: string;
  expenses: string;
  count: number;
  currency: string;
};

export type TransactionInput = {
  description: string;
  amount: string;
  category?: string | null;
  occurred_on?: string;
};

export type TransactionUpdateInput = Partial<TransactionInput>;

export type SortOrder = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';
export type TransactionKind = 'income' | 'expense';

export type TransactionQuery = {
  limit?: number;
  offset?: number;
  search?: string;
  category?: string;
  kind?: TransactionKind;
  from_date?: string;
  to_date?: string;
  sort?: SortOrder;
};

export type HealthResponse = {
  status: string;
  environment: string;
  version: string;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429 && error.retryAfterSeconds) {
      return `${error.message} Try again in ${error.retryAfterSeconds}s.`;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function buildQueryString(
  query: Record<string, string | number | boolean | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
}

export async function errorFromResponse(response: Response): Promise<ApiError> {
  let message = `Request failed with status ${response.status}.`;

  try {
    const data = (await response.json()) as { detail?: unknown };
    if (typeof data.detail === 'string') {
      message = data.detail;
    } else if (Array.isArray(data.detail)) {
      const first = data.detail[0] as { msg?: unknown } | undefined;
      if (first && typeof first.msg === 'string') {
        message = first.msg;
      }
    }
  } catch {
    // Keep the generic message when the body is not JSON.
  }

  const retryAfter = Number(response.headers.get('Retry-After'));
  return new ApiError(response.status, message, {
    requestId: response.headers.get('X-Request-ID') ?? undefined,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const query = options.query ? buildQueryString(options.query) : '';
  const url = `${API_URL}${path}${query ? `?${query}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(
        0,
        options.signal?.aborted
          ? 'The request was cancelled.'
          : 'The request timed out. Check your connection and try again.',
      );
    }
    throw new ApiError(
      0,
      `Could not reach the API at ${API_URL}. Check that the backend is running and EXPO_PUBLIC_API_URL is correct.`,
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!response.ok) {
    throw await errorFromResponse(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function loginRequest(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function registerRequest(input: {
  email: string;
  password: string;
  display_name: string;
}): Promise<AuthResponse> {
  return request<AuthResponse>('/api/v1/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function refreshRequest(refreshToken: string): Promise<TokenPair> {
  return request<TokenPair>('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

export function logoutRequest(refreshToken: string): Promise<void> {
  return request<void>('/api/v1/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
}

export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/v1/health', { method: 'GET' });
}

export function fetchCurrentUser(token: string): Promise<User> {
  return request<User>('/api/v1/users/me', { token });
}

export function updateProfileRequest(
  input: { display_name?: string; currency?: string },
  token: string,
): Promise<User> {
  return request<User>('/api/v1/users/me', {
    method: 'PATCH',
    body: input,
    token,
  });
}

export function changePasswordRequest(
  input: { current_password: string; new_password: string },
  token: string,
): Promise<void> {
  return request<void>('/api/v1/users/me/password', {
    method: 'POST',
    body: input,
    token,
  });
}

export function deleteAccountRequest(password: string, token: string): Promise<void> {
  return request<void>('/api/v1/users/me', {
    method: 'DELETE',
    body: { password },
    token,
  });
}

export function fetchTransactions(
  query: TransactionQuery,
  token: string,
): Promise<TransactionList> {
  return request<TransactionList>('/api/v1/transactions', {
    token,
    query: query as Record<string, string | number | undefined>,
  });
}

export function fetchTransaction(id: string, token: string): Promise<Transaction> {
  return request<Transaction>(`/api/v1/transactions/${encodeURIComponent(id)}`, { token });
}

export function createTransactionRequest(
  input: TransactionInput,
  token: string,
): Promise<Transaction> {
  return request<Transaction>('/api/v1/transactions', {
    method: 'POST',
    body: input,
    token,
  });
}

export function updateTransactionRequest(
  id: string,
  input: TransactionUpdateInput,
  token: string,
): Promise<Transaction> {
  return request<Transaction>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

export function deleteTransactionRequest(id: string, token: string): Promise<void> {
  return request<void>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

export function fetchTransactionSummary(
  query: TransactionQuery,
  token: string,
): Promise<TransactionSummary> {
  return request<TransactionSummary>('/api/v1/transactions/summary', {
    token,
    query: query as Record<string, string | number | undefined>,
  });
}

export function fetchCategories(token: string): Promise<string[]> {
  return request<string[]>('/api/v1/transactions/categories', { token });
}
