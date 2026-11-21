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
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}
