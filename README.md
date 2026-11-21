# Money Tracker — Master System Context & Implementation Specification

> **Context Document for AI Agents & Engineers**: This comprehensive reference documents 100% of the Money Tracker full-stack codebase across backend and frontend: core architectural design, implemented data models, exact API request/response schemas, validation rules, security algorithms, component catalogs, state machines, and a prioritized feature extension roadmap.

---

## 1. Executive Architecture & Tech Stack

**Money Tracker** is a full-stack personal finance application with a strict security boundary, per-user data isolation, and a mobile-first design.

### Tech Stack Snapshot
* **Backend**:
  * **Runtime**: Python 3.14+ managed via [uv](https://docs.astral.sh/uv/)
  * **Framework**: FastAPI 0.120+ (fully asynchronous async/await handlers)
  * **ORM & Database**: SQLAlchemy 2.0+ Async Engine with `aiosqlite` (dev) and `asyncpg` (PostgreSQL prod ready)
  * **Data Schemas & Settings**: Pydantic v2 & Pydantic Settings
  * **Database Migrations**: Alembic 1.16+
  * **Password Hashing**: Argon2id via `pwdlib[argon2]` (OWASP recommended memory-hard hashing)
  * **Tokens & Sessions**: PyJWT 2.15+ (HS256 access tokens + rotating SHA-256 hashed refresh tokens)
  * **Quality & Tests**: Pytest, Pytest-Asyncio, Pytest-Cov (49 passing tests), Ruff, Mypy (strict)
* **Frontend**:
  * **Framework & SDK**: React Native 0.88.1 on Expo SDK 58 (React 19.3.0)
  * **Routing**: Expo Router 58 (file-based navigation with `Stack.Protected` auth barriers)
  * **Language**: TypeScript (strict configuration)
  * **Secure Storage**: `expo-secure-store` (hardware Keystore/Keychain on mobile; memory fallback on Web)
  * **Networking**: Custom fetch client with request timeouts, abort signals, auto-refresh on 401, and concurrent refresh de-duplication
  * **Design System**: Custom dark palette (`src/theme/colors.ts`), `react-native-safe-area-context`

---

## 2. Complete Repository Directory Map

```text
money-tracker/
├── Makefile                      # Standardized build shortcuts (dev, test, lint, format, audit)
├── README.md                     # This master system context document
├── backend/                      # FastAPI async backend service
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py           # Dependency injection (get_db, get_current_user, get_owned_transaction)
│   │   │   ├── router.py         # Consolidated API v1 router mounting all sub-routes
│   │   │   └── routes/
│   │   │       ├── auth.py       # POST /register, /login, /refresh, /logout, /logout-all
│   │   │       ├── health.py     # GET /health, /health/ready
│   │   │       ├── transactions.py # CRUD, filters, pagination, summary calculations, categories
│   │   │       └── users.py      # Profile retrieval, name/currency updates, password change, account deletion
│   │   ├── core/
│   │   │   ├── config.py         # Settings class (Pydantic BaseSettings, env parsing, validation)
│   │   │   ├── logging.py        # Structured logging configuration with request correlation
│   │   │   ├── middleware.py     # RequestContextMiddleware, SecurityHeadersMiddleware, BodySizeLimitMiddleware
│   │   │   ├── rate_limit.py     # SlidingWindowRateLimiter (in-process per-IP sliding window)
│   │   │   └── security.py       # Argon2id hashing, timing-safe dummy verify, JWT sign/decode, token hashing
│   │   ├── db/
│   │   │   ├── base.py           # DeclarativeBase with TimestampMixin & utcnow helper
│   │   │   └── session.py        # Async engine, sessionmaker, and get_db dependency
│   │   ├── models/
│   │   │   ├── user.py           # User & RefreshSession SQLAlchemy models
│   │   │   └── transaction.py    # Transaction SQLAlchemy model
│   │   ├── schemas/
│   │   │   ├── auth.py           # Auth request/response DTOs & password validators
│   │   │   ├── transaction.py    # Transaction CRUD, list, and summary DTOs
│   │   │   └── user.py           # User profile, password change, and deletion DTOs
│   │   ├── services/
│   │   │   └── auth.py           # Business logic for registration, authentication, token rotation & revocation
│   │   └── main.py               # FastAPI app factory, middleware pipeline, lifespan management
│   ├── migrations/               # Alembic configuration & migration versions
│   │   └── versions/             # Migration scripts (e.g. 0001_initial.py)
│   ├── tests/                    # 49 Pytest test cases covering auth, transactions, security, and users
│   ├── pyproject.toml            # Backend dependencies, ruff, mypy, and pytest configs
│   └── docs/authentication.md    # Security architecture and threat model deep dive
└── frontend/                     # Expo / React Native mobile & web app
    ├── assets/                   # App icons, splash screens, favicon
    ├── src/
    │   ├── api/
    │   │   ├── api-url.ts        # Dynamic host discovery (Expo LAN IP, Android 10.0.2.2, Web, or ENV)
    │   │   └── client.ts         # Strongly typed API client, ApiError class, request wrapper & endpoint bindings
    │   ├── app/                  # Expo Router file-based screens
    │   │   ├── _layout.tsx       # Root layout, splash screen controller, Stack.Protected routing
    │   │   ├── login.tsx         # Sign-in screen with API health status pill
    │   │   ├── register.tsx      # Sign-up screen with client validation
    │   │   └── (app)/            # Authenticated route group
    │   │       ├── _layout.tsx   # Authenticated stack navigator
    │   │       └── index.tsx     # Home dashboard (balance card, recent activity list, pull-to-refresh)
    │   ├── auth/
    │   │   ├── AuthContext.tsx   # Session management, silent restore, auto-refresh on 401, sign-out
    │   │   └── token-storage.ts  # SecureStore wrapper (iOS Keychain/Android Keystore) with web memory fallback
    │   ├── components/           # Reusable UI component library
    │   │   ├── ApiStatusPill.tsx # Backend connectivity indicator with refresh trigger
    │   │   ├── AuthScreen.tsx    # Scrollable keyboard-aware auth container
    │   │   ├── BalanceCard.tsx   # Card displaying net balance, total income, and total expenses
    │   │   ├── FormError.tsx     # Standardized red error banner
    │   │   ├── FormField.tsx     # Styled text inputs with dark-theme labels and focus states
    │   │   ├── PrimaryButton.tsx # Touchable CTA button with loading activity indicator
    │   │   └── TransactionRow.tsx# Row displaying description, category, formatted date, and colored amount
    │   ├── hooks/
    │   │   ├── useApiHealth.ts   # Periodically/manually checks backend liveness
    │   │   └── useTransactions.ts# Fetches transactions with pull-to-refresh state
    │   ├── theme/
    │   │   └── colors.ts         # Dark theme color tokens, border radius, spacing constants
    │   └── utils/
    │       └── format.ts         # Currency formatter (Intl.NumberFormat) and ISO date formatter
    ├── app.json                  # Expo config, schemes, splash screen, plugins
    ├── package.json              # Frontend dependencies and npm scripts
    └── AGENTS.md                 # Expo-specific LLM instructions & rules
```

---

## 3. Backend Implementation & Features ("What Is Implemented")

### 3.1. Database Models & Schema Specifications

#### 1. `users` Table (`app/models/user.py`)
* `id` (`Uuid`, Primary Key): Random UUIDv4.
* `email` (`String(320)`, Unique, Indexed): Case-normalized email.
* `password_hash` (`String(255)`): Argon2id password hash string.
* `display_name` (`String(80)`): User's profile name.
* `currency` (`String(3)`, Default `"USD"`): ISO 4217 3-letter currency code used for formatting.
* `is_active` (`Boolean`, Default `True`): Soft disable flag.
* `token_version` (`Integer`, Default `0`): Monotonically increasing counter. When bumped, all access tokens and refresh sessions issued under previous versions become invalid instantly.
* `created_at`, `updated_at` (`DateTime(timezone=True)`): UTC timestamps automatically managed by `TimestampMixin`.
* Relationship: `refresh_sessions` -> `cascade="all, delete-orphan", passive_deletes=True`.

#### 2. `refresh_sessions` Table (`app/models/user.py`)
* `id` (`Uuid`, Primary Key): Unique session ID (matches JWT `sid` claim).
* `user_id` (`Uuid`, Indexed, Foreign Key -> `users.id`, `ondelete="CASCADE"`).
* `jti` (`String(36)`, Unique, Indexed): JWT ID of the refresh token.
* `family_id` (`Uuid`, Indexed): Group identifier for token lineage (used for reuse/theft detection).
* `token_hash` (`String(64)`): SHA-256 hex digest of the raw refresh token. **Raw tokens are never stored in the database.**
* `expires_at` (`DateTime(timezone=True)`): Absolute expiration timestamp (default: 30 days).
* `revoked_at` (`DateTime(timezone=True)`, Nullable): Timestamp when rotated or logged out.
* `replaced_by_jti` (`String(36)`, Nullable): Pointer to the successor refresh token's JTI.
* `created_at` (`DateTime(timezone=True)`): UTC creation timestamp.

#### 3. `transactions` Table (`app/models/transaction.py`)
* `id` (`Uuid`, Primary Key): Random UUIDv4.
* `user_id` (`Uuid`, Indexed, Foreign Key -> `users.id`, `ondelete="CASCADE"`): Absolute owner ID.
* `description` (`String(200)`): Transaction summary/vendor.
* `amount` (`Numeric(12, 2)`): Decimal currency value. Positive values represent income; negative values represent expenses.
* `category` (`String(50)`, Nullable): Categorization tag (e.g., `"Groceries"`, `"Salary"`).
* `occurred_on` (`Date`): Calendar date of transaction (default: `date.today`).
* `created_at`, `updated_at` (`DateTime(timezone=True)`): UTC timestamps.
* **Indices**:
  * `ix_transactions_user_occurred` (`user_id`, `occurred_on`): Powers date-range filters and default sorting.
  * `ix_transactions_user_category` (`user_id`, `category`): Powers category filtering and category aggregations.

---

### 3.2. Authentication & Cryptographic Implementation Details

#### Password Security
* **Argon2id Hashing**: Uses `pwdlib.PasswordHash.recommended()` with Argon2id parameters.
* **Timing-Attack Resistance**: When an unregistered email attempts to authenticate, `verify_dummy_password(password)` runs against a precomputed dummy hash (`_DUMMY_HASH`) so that response latency is identical for existent and non-existent users.
* **Password Validation Rules** (`app/schemas/auth.py`):
  * Length: 12 to 128 characters.
  * Common password denylist check against known sequences (`"password1234"`, `"letmein12345"`, etc.).
  * Diversity check: At least 4 distinct characters (`len(set(password)) >= 4`).

#### JWT Tokens & Claims Structure
Both token types are signed with HS256 using `JWT_SECRET` (minimum 32 characters validated on boot).
* **Access Token**:
  * Lifetime: 15 minutes (`ACCESS_TOKEN_EXPIRE_MINUTES`).
  * Claims:
    * `sub`: String representation of `user.id`.
    * `iss`: `"money-tracker-api"` (verified).
    * `aud`: `"money-tracker-app"` (verified).
    * `ver`: Current `user.token_version`.
    * `typ`: `"access"` (prevents refresh tokens from being sent to protected endpoints).
    * `iat`, `nbf`, `exp`, `jti`.
* **Refresh Token**:
  * Lifetime: 30 days (`REFRESH_TOKEN_EXPIRE_DAYS`).
  * Additional Claims:
    * `sid`: String representation of `refresh_sessions.id`.
    * `typ`: `"refresh"`.

#### Token Rotation & Theft Detection Algorithm (`services/auth.py`)
1. Client calls `POST /api/v1/auth/refresh` sending `{"refresh_token": "..."}`.
2. Decode JWT: Validate signature, issuer, audience, and ensure `typ == "refresh"`.
3. Lookup database session using `claims["sid"]`.
4. Validate SHA-256 token hash using `hmac.compare_digest(session.token_hash, hash_token(token))`.
5. **Theft Detection Trigger**:
   * If `session.revoked_at is not None`, someone is attempting to reuse an already rotated token.
   * **Action**: Immediately revoke all sessions sharing that `family_id` (`_revoke_family()`). Both the legitimate user and the attacker lose access, forcing credential re-authentication.
6. Verify token is not expired and user is active with matching `user.token_version`.
7. **Atomic Single-Use Transition**:
   * Execute an atomic SQL update: `UPDATE refresh_sessions SET revoked_at = now, replaced_by_jti = new_jti WHERE id = session.id AND revoked_at IS NULL`.
   * If `rowcount != 1` (a race condition occurred), revoke family and throw `401`.
8. Create and insert successor `RefreshSession` in the same `family_id`, prune long-expired sessions, commit, and return the new `TokenPair`.

#### Revocation Mechanics
* **Single Session (`POST /api/v1/auth/logout`)**: Sets `revoked_at` on that specific session row. Idempotent `204`.
* **All Sessions (`POST /api/v1/auth/logout-all`)**: Increments `user.token_version` by 1 and revokes all active refresh sessions. Any existing access token will fail the `claims["ver"] == user.token_version` check in `get_current_user` on its next request.

---

### 3.3. Middleware & Security Hardening Pipeline

Execution order (reverse of registration in `main.py`):
1. **`TrustedHostMiddleware`**: Enforces allowed HTTP `Host` header values from `TRUSTED_HOSTS` (wildcard permitted only outside production).
2. **`RequestContextMiddleware`**: Extracts incoming `X-Request-ID` or generates a UUIDv4 hex string. Stores it in a `contextvars.ContextVar`, sets response header `X-Request-ID`, and logs structured HTTP metrics: `method`, `path`, `status`, and `duration_ms`.
3. **`CORSMiddleware`**: Configured with allowed methods (`GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`), allowed headers, and exposed headers (`X-Request-ID`, `X-Total-Count`). Development uses `DEV_ORIGIN_REGEX` to automatically allow local network IPs.
4. **`BodySizeLimitMiddleware`**: Inspects `Content-Length` and measures streaming byte chunks during request intake. Rejects bodies > 1MB with HTTP 413.
5. **`SecurityHeadersMiddleware`**: Emits `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=()`, and `Cache-Control: no-store` on all API responses.
6. **`SlidingWindowRateLimiter` (`app/core/rate_limit.py`)**:
   * In-process per-IP rate limiter with sliding expiration window.
   * Default: 10 requests per 60 seconds on sensitive endpoints (`/auth/register`, `/auth/login`, `/auth/refresh`, `/users/me/password`, `/users/me` delete).
   * Returns HTTP 429 with `Retry-After: <seconds>`.

---

### 3.4. Complete API Endpoint Specification

#### Health & System
* `GET /api/v1/health`
  * Response (200): `{"status": "ok", "environment": "development", "version": "1.0.0"}`
* `GET /api/v1/health/ready`
  * Response (200): `{"status": "ok", "database": "ok", "version": "1.0.0"}`
  * Response (503): `{"status": "degraded", "database": "unavailable", "version": "1.0.0"}`

#### Authentication
* `POST /api/v1/auth/register`
  * Request Body: `{"email": "user@example.com", "password": "securepassword123", "display_name": "Alex"}`
  * Response (201): `{"access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 900, "user": {...}}`
  * Errors: 409 Conflict (email exists), 422 (validation error).
* `POST /api/v1/auth/login`
  * Request Body: `{"email": "user@example.com", "password": "securepassword123"}`
  * Response (200): `{"access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 900, "user": {...}}`
  * Errors: 401 Unauthorized (invalid email or password).
* `POST /api/v1/auth/refresh`
  * Request Body: `{"refresh_token": "..."}`
  * Response (200): `{"access_token": "...", "refresh_token": "...", "token_type": "bearer", "expires_in": 900}`
  * Errors: 401 Unauthorized (invalid, expired, or reused token).
* `POST /api/v1/auth/logout`
  * Request Body: `{"refresh_token": "..."}`
  * Response: 204 No Content.
* `POST /api/v1/auth/logout-all`
  * Headers: `Authorization: Bearer <access_token>`
  * Response: 204 No Content.

#### User Profile
* `GET /api/v1/users/me`
  * Headers: `Authorization: Bearer <access_token>`
  * Response (200): `{"id": "...", "email": "user@example.com", "display_name": "Alex", "currency": "USD", "created_at": "..."}`
* `PATCH /api/v1/users/me`
  * Request Body: `{"display_name": "Alexander", "currency": "EUR"}` (fields optional)
  * Response (200): Updated `UserRead` object.
* `POST /api/v1/users/me/password`
  * Request Body: `{"current_password": "oldpassword123", "new_password": "newpassword123"}`
  * Response: 204 No Content (revokes all active sessions).
* `DELETE /api/v1/users/me`
  * Request Body: `{"password": "password123"}`
  * Response: 204 No Content (cascades deletion across transactions and sessions).

#### Transactions
* `GET /api/v1/transactions`
  * Query Parameters:
    * `limit` (int, default 20, max 100)
    * `offset` (int, default 0)
    * `search` (string, max 100, matches description or category with escaped ILIKE)
    * `category` (string, max 50)
    * `kind` (`"income"` for amount > 0, `"expense"` for amount < 0)
    * `from_date`, `to_date` (ISO dates `YYYY-MM-DD`, validates `from_date <= to_date`)
    * `sort` (`"date_desc"` [default], `"date_asc"`, `"amount_desc"`, `"amount_asc"`)
  * Headers: Returns `X-Total-Count: <total_matching>`
  * Response (200):
    ```json
    {
      "items": [
        {
          "id": "uuid",
          "user_id": "uuid",
          "description": "Coffee",
          "amount": "-4.50",
          "category": "Food",
          "occurred_on": "2026-11-21",
          "created_at": "2026-11-21T10:00:00Z",
          "updated_at": "2026-11-21T10:00:00Z"
        }
      ],
      "total": 1,
      "limit": 20,
      "offset": 0
    }
    ```
* `POST /api/v1/transactions`
  * Request Body: `{"description": "Freelance", "amount": 1200.00, "category": "Work", "occurred_on": "2026-11-21"}`
  * Response (201): Created `TransactionRead` object with `Location` header.
* `GET /api/v1/transactions/summary`
  * Query Parameters: Supports identical `search`, `category`, `kind`, `from_date`, `to_date` filters as the list endpoint.
  * SQL Implementation: Uses single aggregate query:
    `SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)` as income,
    `SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END)` as expenses, and `COUNT(id)`.
  * Response (200):
    ```json
    {
      "balance": "1195.50",
      "income": "1200.00",
      "expenses": "4.50",
      "count": 2,
      "currency": "USD"
    }
    ```
* `GET /api/v1/transactions/categories`
  * Response (200): Array of distinct, non-empty categories created by user: `["Food", "Salary", "Utilities"]`.
* `GET /api/v1/transactions/{id}`
  * Response (200): `TransactionRead` object.
  * Errors: 404 Not Found, 403 Forbidden (transaction owned by another user).
* `PATCH /api/v1/transactions/{id}`
  * Request Body: `{"description": "New Desc", "amount": -15.00, "category": "Groceries", "occurred_on": "2026-11-20"}`
  * Response (200): Updated `TransactionRead` object.
* `DELETE /api/v1/transactions/{id}`
  * Response: 204 No Content.

---

## 4. Frontend Implementation & Features ("What Is Implemented")

### 4.1. Navigation Architecture & Route Guards (`src/app/`)
* **Expo Router** filesystem-based navigation.
* **`_layout.tsx` (Root Navigation)**:
  * Mounts `<SafeAreaProvider>`, `<StatusBar style="light" />`, and `<AuthProvider>`.
  * Controls native splash screen via `SplashScreenController`: holds splash open while `status === "loading"` and dismisses it via `SplashScreen.hideAsync()` once auth state resolves.
  * Declarative protection via `Stack.Protected`:
    ```tsx
    <Stack.Protected guard={isAuthenticated}>
      <Stack.Screen name="(app)" />
    </Stack.Protected>
    <Stack.Protected guard={!isAuthenticated}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack.Protected>
    ```
* **`(app)/_layout.tsx`**: Stack navigator for authenticated user flows.

---

### 4.2. Auth State Machine & Storage Lifecycle (`src/auth/`)

#### Storage Separation (`token-storage.ts`)
* **Mobile (iOS & Android)**: Uses `expo-secure-store` with key `"money_tracker.refresh_token"`. Backed by iOS Keychain and Android Keystore (encrypted at rest).
* **Web**: Fallback to in-memory variable `webRefreshToken` (deliberately not stored in `localStorage` to guard against XSS token leakage).

#### `AuthContext.tsx` State Machine & Lifecycle
* **State Variables**:
  * `status`: `'loading' | 'authenticated' | 'unauthenticated'`
  * `user`: `User | null`
  * `accessToken`: `useRef<string | null>(null)` (in memory only, never written to disk)
  * `refreshInFlight`: `useRef<Promise<string> | null>(null)`
* **App Startup Sequence (Silent Restore)**:
  1. On initial mount, reads stored refresh token from `getRefreshToken()`.
  2. If missing -> sets `status = 'unauthenticated'` and hides splash.
  3. If present -> calls `refreshAccessToken()` -> calls `fetchCurrentUser(token)`.
  4. If successful -> sets `user = profile`, `status = 'authenticated'`.
  5. If failed -> invokes `clearLocalSession()` and sets `status = 'unauthenticated'`.
* **Refresh De-duplication**:
  * If multiple requests trigger a refresh simultaneously, only the first call executes `refreshRequest(token)`; subsequent requests await the shared in-flight promise.
* **Transparent `authedRequest<T>` Interceptor**:
  * Automatically injects `Authorization: Bearer <accessToken>`.
  * If API returns HTTP 401: catches error, calls `refreshAccessToken()`, and retries the original request once with the new token.
  * If retry fails with 401: calls `clearLocalSession()` and signs the user out cleanly.

---

### 4.3. Dynamic API Discovery (`src/api/api-url.ts`)
Resolves backend URL automatically in development:
1. If `EXPO_PUBLIC_API_URL` environment variable is defined -> uses explicit URL.
2. If running on **Web** -> uses `window.location.hostname` with backend port 8000.
3. If running on **Physical Device (Expo Go)** -> parses `Constants.expoConfig.hostUri` to extract dev machine's LAN IP (e.g. `http://192.168.1.50:8000`).
4. If running on **Android Emulator** -> rewrites loopback addresses to `http://10.0.2.2:8000`.

---

### 4.4. Component Library & Theming

* **Design Tokens (`src/theme/colors.ts`)**:
  * `background`: `#0B0F14` (deep dark blue-black)
  * `surface`: `#151C24` (card background)
  * `surfaceMuted`: `#1D2630` (elevated background)
  * `border`: `#26313D`
  * `text`: `#F5F7FA`, `textMuted`: `#8A97A6`
  * `primary`: `#3DDC97` (emerald green for positive balance/CTA)
  * `danger`: `#FF6B6B` (rose red for expenses/errors)
  * `warning`: `#FFC857` (amber for warnings)
  * `radius`: `sm: 8, md: 12, lg: 20`
  * `spacing`: `xs: 4, sm: 8, md: 16, lg: 24, xl: 32`
* **Component Catalog (`src/components/`)**:
  * **`FormField`**: Styled input component with label, focus-state border coloration (`primary`), and placeholder text color support.
  * **`PrimaryButton`**: Touchable CTA with disabled styling and internal `ActivityIndicator` spinner during async requests.
  * **`FormError`**: Standard error presentation banner with icon and formatted message.
  * **`AuthScreen`**: Keyboard-avoiding, scrollable container for login/register layouts.
  * **`BalanceCard`**: Prominent card showing net balance in 40pt bold font, with a divided bottom row displaying total income and expenses.
  * **`TransactionRow`**: Row item displaying transaction description, category tag, calendar date (`formatDate`), and colored monetary amount (`formatCurrency`).
  * **`ApiStatusPill`**: Live connectivity badge showing online/offline status, resolved API URL, and a manual ping trigger.

---

## 5. Current Codebase Nuances & Integration Notes

1. **Transaction List Response Shape**:
   * Backend endpoint `GET /api/v1/transactions` returns an object: `{ items: Transaction[], total: number, limit: number, offset: number }`.
   * Frontend `src/hooks/useTransactions.ts` currently requests `authedRequest<Transaction[]>`. When enhancing transaction listing, unpack `data.items`.
2. **Server-Side Summary Integration Opportunity**:
   * `HomeScreen` currently calculates totals using `transactions.reduce(...)` on the first slice of transactions loaded in memory.
   * The backend already provides `GET /api/v1/transactions/summary` which computes correct aggregates across all transactions in SQL. Wiring `BalanceCard` to `/summary` will guarantee true totals regardless of pagination.
3. **Web Refresh Token Behavior**:
   * On Web, refresh tokens are held in-memory; a browser page reload returns to the login screen. A production web build should add HttpOnly cookie session support.
4. **Rate Limiting Scalability**:
   * The rate limiter is currently in-memory. Multi-worker deployments should back `SlidingWindowRateLimiter` with Redis.

---

## 6. What Can Be Done ("Prioritized Roadmap")

### 🚀 Tier 1: Core Frontend Experience (Backend Ready)
The backend already implements all necessary endpoints for these features:

1. **"Add Transaction" Modal & Flow**:
   * Floating Action Button (FAB `+`) on `HomeScreen`.
   * Modal form with description, amount, Income/Expense switch, category selector, and date picker.
   * Calls `POST /api/v1/transactions`.
2. **Edit & Delete Transaction Actions**:
   * Tap `TransactionRow` to open an edit modal (`PATCH /api/v1/transactions/{id}`).
   * Swipe-to-delete or delete button with confirmation dialog (`DELETE /api/v1/transactions/{id}`).
3. **Filter & Search Controls**:
   * Search input for keyword filtering (`search`).
   * Category filter chips populated via `GET /api/v1/transactions/categories`.
   * Kind filter toggle (`All`, `Income`, `Expense`).
   * Date range selection (`from_date`, `to_date`).
4. **Infinite Scroll Pagination**:
   * Replace current basic list with `FlatList` using `onEndReached` to fetch subsequent pages using `offset` and `limit`.
5. **Connect Server-Side Summary**:
   * Replace client-side `.reduce()` with a hook consuming `GET /api/v1/transactions/summary`.
6. **User Profile & Settings Screen**:
   * Screen displaying user email and registration date.
   * Form to update display name and currency preference (`PATCH /api/v1/users/me`).
   * Password change form (`POST /api/v1/users/me/password`).
   * "Sign Out of All Devices" button (`POST /api/v1/auth/logout-all`).
   * "Delete Account" button with password confirmation (`DELETE /api/v1/users/me`).

---

### 💡 Tier 2: Backend Feature Expansions (New Schemas & Services)

1. **Budgets & Spending Limits**:
   * **Model**: `Budget` (`id`, `user_id`, `category`, `monthly_limit`, timestamps).
   * **Endpoints**: `POST /api/v1/budgets`, `GET /api/v1/budgets` (calculates monthly spending against budget limit).
2. **Recurring Transactions & Subscriptions**:
   * **Model**: `RecurringRule` (`id`, `user_id`, `description`, `amount`, `category`, `frequency`, `next_date`).
   * Scheduler service or startup hook to generate transactions on maturity.
3. **Analytics & Aggregations Endpoints**:
   * `GET /api/v1/analytics/monthly`: Monthly spend and income trends over the last 12 months.
   * `GET /api/v1/analytics/categories`: Category breakdown with percentage share of total expenses.
4. **CSV Export & Import**:
   * `GET /api/v1/transactions/export`: Stream transactions as a CSV file.
   * `POST /api/v1/transactions/import`: Multipart form upload to parse bank statements and bulk-insert transactions.
5. **Email Verification & Password Reset**:
   * Verification tokens table and transactional mailer integration (Resend / SendGrid).
6. **Distributed Rate Limiting with Redis**:
   * Replace in-memory sliding window with Redis `INCR` and `EXPIRE`.

---

### 🎨 Tier 3: Advanced Mobile & Full-Stack Capabilities

1. **Interactive Financial Charts**:
   * Integrate `react-native-gifted-charts` for interactive monthly bar charts and category donut charts.
2. **Biometric Authentication**:
   * Integrate `expo-local-authentication` for Face ID / Fingerprint lock on app launch or resume.
3. **Receipt Scanner & OCR**:
   * Camera capture via `expo-image-picker` with automated receipt parsing via OCR or Gemini API.
4. **Push Notifications**:
   * Scheduled reminders via `expo-notifications` for daily expense logging and budget threshold alerts.
5. **Offline Support & Optimistic Cache**:
   * Integrate TanStack Query with AsyncStorage persistence for offline read capability and optimistic UI updates.

---

## 7. Developer & Agent Operational Guide

### Essential Commands

#### Backend Service
```sh
cd backend
uv sync                                                 # Install dependencies
cp .env.example .env                                    # Setup environment variables
uv run alembic upgrade head                             # Run database migrations
uv run fastapi dev app/main.py --host 0.0.0.0          # Start API server on all interfaces
uv run pytest                                           # Run test suite
uv run ruff check .                                     # Run linter
uv run ruff format --check .                            # Run format check
uv run mypy app                                         # Run strict type checks
```

#### Frontend Mobile Client
```sh
cd frontend
npm install                                             # Install dependencies
npx expo start                                          # Start Expo development server
npm run android                                         # Launch on Android emulator/device
npm run ios                                             # Launch on iOS simulator (macOS)
npm run web                                             # Launch in browser
npm run typecheck                                       # Type check TypeScript (tsc --noEmit)
npm run lint                                            # Run ESLint (expo lint)
```

### Operational Rules for Agents
* **Frontend Rules**:
  * Never manually edit `ios/` or `android/` folders (use `app.json` config plugins).
  * Always install packages using `npx expo install <package>` to resolve SDK 58 compatible versions.
  * Keep all screen routes inside `src/app/` and components in `src/components/`.
  * Run `npm run typecheck` and `npm run lint` before declaring any frontend task done.
* **Backend Rules**:
  * Authorization at data layer: Always filter user-owned tables with `WHERE user_id = current_user.id`. Never trust user IDs sent in client payloads.
  * Separate models (`app/models/`), schemas (`app/schemas/`), and business logic (`app/services/`).
  * Run database migrations via Alembic whenever changing models.
  * Run `uv run pytest`, `uv run ruff check .`, and `uv run mypy app` before declaring any backend task done.
