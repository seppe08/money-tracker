import { API_URL } from '@/api/api-url';
import { ApiError, buildQueryString, errorMessage } from './errors';

export { API_URL, ApiError, buildQueryString, errorMessage };

const DEFAULT_TIMEOUT_MS = 15_000;

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

export type CategorySpendingItem = {
  category: string;
  amount: string;
  count: number;
  percentage: number;
};

export type CategoryAnalyticsResponse = {
  items: CategorySpendingItem[];
  total_expenses: string;
  currency: string;
};

export type MonthlyTrendItem = {
  month: string;
  label: string;
  income: string;
  expenses: string;
  net: string;
};

export type MonthlyAnalyticsResponse = {
  items: MonthlyTrendItem[];
  currency: string;
};

export type TransactionImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

export type BudgetWithSpend = {
  id: string;
  category: string;
  monthly_limit: string;
  spent: string;
  remaining: string;
  percentage: number;
  is_over_budget: boolean;
  currency: string;
};

export type BudgetListResponse = {
  items: BudgetWithSpend[];
  total_budget: string;
  total_spent: string;
  currency: string;
  month: string;
};

export type BudgetCreateInput = {
  category: string;
  monthly_limit: string;
};

export type BudgetUpdateInput = {
  monthly_limit: string;
};

export type FrequencyType = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurringTransaction = {
  id: string;
  user_id: string;
  description: string;
  amount: string;
  category: string | null;
  frequency: FrequencyType;
  start_date: string;
  next_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RecurringCreateInput = {
  description: string;
  amount: string;
  category?: string | null;
  frequency?: FrequencyType;
  start_date?: string;
};

export type RecurringUpdateInput = {
  description?: string;
  amount?: string;
  category?: string | null;
  frequency?: FrequencyType;
  is_active?: boolean;
};

export type RecurringProcessResult = {
  processed: number;
  created_transactions: string[];
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  token?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type AuthedRequester = <T>(path: string, options?: RequestOptions) => Promise<T>;

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
  if (options.formData !== undefined) {
    // When sending FormData, do not set Content-Type header so the runtime
    // sets the appropriate multipart/form-data boundary.
  } else if (options.body !== undefined) {
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
      body:
        options.formData !== undefined
          ? options.formData
          : options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
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

  if (response.headers.get('content-type')?.includes('text/csv')) {
    return (await response.text()) as unknown as T;
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

export function fetchCurrentUser(
  tokenOrRequester: string | AuthedRequester,
): Promise<User> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<User>('/api/v1/users/me');
  }
  return request<User>('/api/v1/users/me', { token: tokenOrRequester });
}

export function updateProfileRequest(
  input: { display_name?: string; currency?: string },
  tokenOrRequester: string | AuthedRequester,
): Promise<User> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<User>('/api/v1/users/me', {
      method: 'PATCH',
      body: input,
    });
  }
  return request<User>('/api/v1/users/me', {
    method: 'PATCH',
    body: input,
    token: tokenOrRequester,
  });
}

export function changePasswordRequest(
  input: { current_password: string; new_password: string },
  tokenOrRequester: string | AuthedRequester,
): Promise<void> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<void>('/api/v1/users/me/password', {
      method: 'POST',
      body: input,
    });
  }
  return request<void>('/api/v1/users/me/password', {
    method: 'POST',
    body: input,
    token: tokenOrRequester,
  });
}

export function deleteAccountRequest(
  password: string,
  tokenOrRequester: string | AuthedRequester,
): Promise<void> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<void>('/api/v1/users/me', {
      method: 'DELETE',
      body: { password },
    });
  }
  return request<void>('/api/v1/users/me', {
    method: 'DELETE',
    body: { password },
    token: tokenOrRequester,
  });
}

export function logoutAllRequest(
  tokenOrRequester: string | AuthedRequester,
): Promise<void> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<void>('/api/v1/auth/logout-all', {
      method: 'POST',
    });
  }
  return request<void>('/api/v1/auth/logout-all', {
    method: 'POST',
    token: tokenOrRequester,
  });
}

export function fetchTransactions(
  query: TransactionQuery,
  tokenOrRequester: string | AuthedRequester,
): Promise<TransactionList> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<TransactionList>('/api/v1/transactions', {
      query: query as Record<string, string | number | undefined>,
    });
  }
  return request<TransactionList>('/api/v1/transactions', {
    token: tokenOrRequester,
    query: query as Record<string, string | number | undefined>,
  });
}

export function fetchTransaction(
  id: string,
  tokenOrRequester: string | AuthedRequester,
): Promise<Transaction> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<Transaction>(`/api/v1/transactions/${encodeURIComponent(id)}`);
  }
  return request<Transaction>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
    token: tokenOrRequester,
  });
}

export function createTransactionRequest(
  input: TransactionInput,
  tokenOrRequester: string | AuthedRequester,
): Promise<Transaction> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<Transaction>('/api/v1/transactions', {
      method: 'POST',
      body: input,
    });
  }
  return request<Transaction>('/api/v1/transactions', {
    method: 'POST',
    body: input,
    token: tokenOrRequester,
  });
}

export function updateTransactionRequest(
  id: string,
  input: TransactionUpdateInput,
  tokenOrRequester: string | AuthedRequester,
): Promise<Transaction> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<Transaction>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
  }
  return request<Transaction>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token: tokenOrRequester,
  });
}

export function deleteTransactionRequest(
  id: string,
  tokenOrRequester: string | AuthedRequester,
): Promise<void> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<void>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  return request<void>(`/api/v1/transactions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: tokenOrRequester,
  });
}

export function fetchTransactionSummary(
  query: TransactionQuery,
  tokenOrRequester: string | AuthedRequester,
): Promise<TransactionSummary> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<TransactionSummary>('/api/v1/transactions/summary', {
      query: query as Record<string, string | number | undefined>,
    });
  }
  return request<TransactionSummary>('/api/v1/transactions/summary', {
    token: tokenOrRequester,
    query: query as Record<string, string | number | undefined>,
  });
}

export function fetchCategories(
  tokenOrRequester: string | AuthedRequester,
): Promise<string[]> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<string[]>('/api/v1/transactions/categories');
  }
  return request<string[]>('/api/v1/transactions/categories', {
    token: tokenOrRequester,
  });
}

export function fetchCategoryAnalytics(
  query: { from_date?: string; to_date?: string },
  tokenOrRequester: string | AuthedRequester,
): Promise<CategoryAnalyticsResponse> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<CategoryAnalyticsResponse>('/api/v1/analytics/categories', {
      query: query as Record<string, string | number | undefined>,
    });
  }
  return request<CategoryAnalyticsResponse>('/api/v1/analytics/categories', {
    token: tokenOrRequester,
    query: query as Record<string, string | number | undefined>,
  });
}

export function fetchMonthlyAnalytics(
  months: number,
  tokenOrRequester: string | AuthedRequester,
): Promise<MonthlyAnalyticsResponse> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<MonthlyAnalyticsResponse>('/api/v1/analytics/monthly', {
      query: { months },
    });
  }
  return request<MonthlyAnalyticsResponse>('/api/v1/analytics/monthly', {
    token: tokenOrRequester,
    query: { months },
  });
}

export function exportTransactionsCsvRequest(
  query: TransactionQuery,
  tokenOrRequester: string | AuthedRequester,
): Promise<string> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<string>('/api/v1/transactions/export', {
      query: query as Record<string, string | number | undefined>,
    });
  }
  return request<string>('/api/v1/transactions/export', {
    token: tokenOrRequester,
    query: query as Record<string, string | number | undefined>,
  });
}

export function importTransactionsCsvRequest(
  formData: FormData,
  tokenOrRequester: string | AuthedRequester,
): Promise<TransactionImportResult> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<TransactionImportResult>('/api/v1/transactions/import', {
      method: 'POST',
      formData,
    });
  }
  return request<TransactionImportResult>('/api/v1/transactions/import', {
    method: 'POST',
    formData,
    token: tokenOrRequester,
  });
}

export function fetchBudgets(
  month: string | undefined,
  tokenOrRequester: string | AuthedRequester,
): Promise<BudgetListResponse> {
  const query = month ? { month } : undefined;
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<BudgetListResponse>('/api/v1/budgets', {
      query,
    });
  }
  return request<BudgetListResponse>('/api/v1/budgets', {
    token: tokenOrRequester,
    query,
  });
}

export function createBudgetRequest(
  input: BudgetCreateInput,
  tokenOrRequester: string | AuthedRequester,
): Promise<BudgetWithSpend> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<BudgetWithSpend>('/api/v1/budgets', {
      method: 'POST',
      body: input,
    });
  }
  return request<BudgetWithSpend>('/api/v1/budgets', {
    method: 'POST',
    body: input,
    token: tokenOrRequester,
  });
}

export function updateBudgetRequest(
  id: string,
  input: BudgetUpdateInput,
  tokenOrRequester: string | AuthedRequester,
): Promise<BudgetWithSpend> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<BudgetWithSpend>(`/api/v1/budgets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
  }
  return request<BudgetWithSpend>(`/api/v1/budgets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token: tokenOrRequester,
  });
}

export function deleteBudgetRequest(
  id: string,
  tokenOrRequester: string | AuthedRequester,
): Promise<void> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<void>(`/api/v1/budgets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  return request<void>(`/api/v1/budgets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: tokenOrRequester,
  });
}

export function fetchRecurringTransactions(
  isActive?: boolean,
  tokenOrRequester?: string | AuthedRequester,
): Promise<RecurringTransaction[]> {
  const query = isActive !== undefined ? { is_active: isActive } : undefined;
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<RecurringTransaction[]>('/api/v1/recurring', { query });
  }
  return request<RecurringTransaction[]>('/api/v1/recurring', {
    token: tokenOrRequester,
    query,
  });
}

export function createRecurringRequest(
  input: RecurringCreateInput,
  tokenOrRequester?: string | AuthedRequester,
): Promise<RecurringTransaction> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<RecurringTransaction>('/api/v1/recurring', {
      method: 'POST',
      body: input,
    });
  }
  return request<RecurringTransaction>('/api/v1/recurring', {
    method: 'POST',
    body: input,
    token: tokenOrRequester,
  });
}

export function updateRecurringRequest(
  id: string,
  input: RecurringUpdateInput,
  tokenOrRequester?: string | AuthedRequester,
): Promise<RecurringTransaction> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<RecurringTransaction>(`/api/v1/recurring/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
  }
  return request<RecurringTransaction>(`/api/v1/recurring/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token: tokenOrRequester,
  });
}

export function deleteRecurringRequest(
  id: string,
  tokenOrRequester?: string | AuthedRequester,
): Promise<void> {
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<void>(`/api/v1/recurring/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
  return request<void>(`/api/v1/recurring/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token: tokenOrRequester,
  });
}

export function processRecurringRequest(
  targetDate?: string,
  tokenOrRequester?: string | AuthedRequester,
): Promise<RecurringProcessResult> {
  const query = targetDate ? { target_date: targetDate } : undefined;
  if (typeof tokenOrRequester === 'function') {
    return tokenOrRequester<RecurringProcessResult>('/api/v1/recurring/process', {
      method: 'POST',
      query,
    });
  }
  return request<RecurringProcessResult>('/api/v1/recurring/process', {
    method: 'POST',
    query,
    token: tokenOrRequester,
  });
}

