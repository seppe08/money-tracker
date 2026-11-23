# AGENT CONTEXT: Money Tracker Full-Stack Application

> **Single-File Context for AI Agents**: This document contains the complete, authoritative specification for the Money Tracker project. Feed or attach this single file to any AI agent to provide full context: tech stack, repository layout, implemented backend systems (models, cryptographic token engine, endpoints with exact JSON schemas), frontend systems (Expo SDK 58 rules, navigation, AuthContext state machine, component contracts), current nuances, developer commands, and a prioritized feature extension roadmap.

---

## 1. Executive Summary & Tech Stack

**Money Tracker** is a production-shaped personal finance application built with strict separation of concerns, enterprise-grade authentication, per-user data isolation, and a mobile-first design.

### Monorepo Architecture
* **Single Monorepo Root**: Git is initialized once at the root repository (`/`). A unified root `package.json` provides cross-platform npm scripts to run backend and frontend tasks together.
* **Backend (`backend/`)**:
  * **Runtime**: Python 3.14+ managed with [uv](https://docs.astral.sh/uv/)
  * **Framework**: FastAPI 0.120+ (fully async handlers, dependency injection)
  * **Database & ORM**: SQLAlchemy 2.0+ Async Engine with `aiosqlite` (development SQLite) and `asyncpg` (production PostgreSQL)
  * **Data Schemas & Settings**: Pydantic v2 & Pydantic Settings
  * **Database Migrations**: Alembic 1.16+
  * **Password Hashing**: Argon2id via `pwdlib[argon2]` (OWASP recommended memory-hard hashing)
  * **Tokens & Sessions**: PyJWT 2.15+ (HS256 access tokens + rotating SHA-256 hashed refresh tokens)
  * **Quality & Tests**: Pytest (49 unit/integration tests), Pytest-Asyncio, Pytest-Cov, Ruff, Mypy (strict)
* **Frontend (`frontend/`)**:
  * **Framework & SDK**: React Native 0.88.1 on Expo SDK 58 (React 19.3.0)
  * **Routing**: Expo Router 58 (file-based navigation with `Stack.Protected` declarative route barriers)
  * **Language**: TypeScript (strict configuration)
  * **Secure Storage**: `expo-secure-store` (hardware Keystore/Keychain on mobile; memory fallback on Web)
  * **Networking**: Custom fetch client with request timeouts, abort signals, auto-refresh on 401, and concurrent refresh de-duplication
  * **Design System**: Custom dark palette (`src/theme/colors.ts`), `react-native-safe-area-context`

---

## 2. Repository Layout & File Map

```text
money-tracker/
├── AGENT_CONTEXT.md              # THIS FILE: Single master context for AI agents
├── README.md                     # Project documentation & overview
├── package.json                  # Root monorepo scripts (dev, test, lint, format)
├── Makefile                      # Make shortcuts for bash/WSL environments
├── .env.example                  # Master environment variable template
├── .gitignore                    # Unified monorepo gitignore
├── .vscode/settings.json         # Workspace IDE configuration (Python + React Native)
├── backend/                      # FastAPI async backend service
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py           # Dependencies (get_db, get_current_user, get_owned_transaction)
│   │   │   ├── router.py         # Consolidated API v1 router
│   │   │   └── routes/
│   │   │       ├── auth.py       # POST /register, /login, /refresh, /logout, /logout-all
│   │   │       ├── health.py     # GET /health, /health/ready
│   │   │       ├── transactions.py # CRUD, filtering, pagination, summary calculations, categories
│   │   │       └── users.py      # Profile retrieval, updates, password change, account deletion
│   │   ├── core/
│   │   │   ├── config.py         # Settings class (Pydantic BaseSettings, env validation)
│   │   │   ├── logging.py        # Structured logging configuration with request correlation
│   │   │   ├── middleware.py     # RequestContext, SecurityHeaders, BodySizeLimit middlewares
│   │   │   ├── rate_limit.py     # SlidingWindowRateLimiter (in-process per-IP sliding window)
│   │   │   └── security.py       # Argon2id hashing, dummy verify, JWT sign/decode, token hashing
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
│   │   │   └── auth.py           # Business logic for auth, token rotation & revocation
│   │   └── main.py               # FastAPI app factory, middleware pipeline, lifespan
│   ├── migrations/               # Alembic configuration & migration versions (0001_initial.py)
│   ├── tests/                    # 49 Pytest test cases covering auth, transactions, security, and users
│   └── pyproject.toml            # Backend dependencies, ruff, mypy, and pytest configs
└── frontend/                     # Expo / React Native mobile & web app
    ├── src/
    │   ├── api/
    │   │   ├── api-url.ts        # Dynamic host discovery (Expo LAN IP, Android 10.0.2.2, Web, or ENV)
    │   │   └── client.ts         # Strongly typed API client, ApiError class, request wrapper
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
    │   ├── components/           # Reusable UI component library (FormField, PrimaryButton, etc.)
    │   ├── hooks/                # Custom React hooks (useTransactions, useApiHealth)
    │   ├── theme/colors.ts       # Dark theme color tokens, border radius, spacing constants
    │   └── utils/format.ts       # Currency formatter (Intl.NumberFormat) and ISO date formatter
    ├── app.json                  # Expo config, schemes, splash screen, plugins
    ├── package.json              # Frontend dependencies and npm scripts
    └── AGENTS.md                 # Expo SDK 58 instructions & rules
```

---

## 3. Backend Implementation & Features

### 3.1. Database Models & Schema Specifications

#### 1. `users` Table (`backend/app/models/user.py`)
```python
class User(TimestampMixin, Base):
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80), default="")
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    is_active: Mapped[bool] = mapped_column(default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    refresh_sessions: Mapped[list[RefreshSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
```
* **`token_version`**: When incremented (on password change or `logout-all`), all access tokens and refresh sessions issued under previous versions are rejected immediately on their next request.

#### 2. `refresh_sessions` Table (`backend/app/models/user.py`)
```python
class RefreshSession(Base):
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jti: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    token_hash: Mapped[str] = mapped_column(String(64))  # SHA-256 hash. Raw tokens are never stored!
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    replaced_by_jti: Mapped[str | None] = mapped_column(String(36), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
```

#### 3. `transactions` Table (`backend/app/models/transaction.py`)
```python
class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_user_occurred", "user_id", "occurred_on"),
        Index("ix_transactions_user_category", "user_id", "category"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # Positive = income, Negative = expense
    category: Mapped[str | None] = mapped_column(String(50), default=None)
    occurred_on: Mapped[date] = mapped_column(Date, default=date.today)
```

#### 4. `budgets` Table (`backend/app/models/budget.py`)
```python
class Budget(TimestampMixin, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category", name="uq_budgets_user_category"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(50))
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2))
```

#### 5. `recurring_transactions` Table (`backend/app/models/recurring.py`)
```python
class RecurringTransaction(TimestampMixin, Base):
    __tablename__ = "recurring_transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))  # Positive = income, Negative = expense
    category: Mapped[str | None] = mapped_column(String(50), default=None)
    frequency: Mapped[str] = mapped_column(String(20), default="monthly")  # daily, weekly, monthly, yearly
    start_date: Mapped[date] = mapped_column(Date, default=date.today)
    next_date: Mapped[date] = mapped_column(Date, default=date.today)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
```

---

### 3.2. Cryptography, JWT & Session Algorithms

* **Password Security**: Argon2id via `pwdlib`. Non-existent emails trigger `verify_dummy_password()` using a precomputed hash to neutralize response-timing enumeration attacks.
* **Access Tokens (15 min)**:
  * Signed with HS256 (`JWT_SECRET` ≥ 32 chars).
  * Claims: `sub` (user_id), `ver` (token_version), `typ="access"`, `jti`, `iss`, `aud`, `exp`, `nbf`, `iat`.
* **Refresh Tokens (30 days)**:
  * Signed with HS256. Single-use only.
  * Claims: `sub`, `sid` (session_id), `ver`, `typ="refresh"`, `jti`, etc.
* **Token Rotation & Theft Detection Algorithm (`services/auth.py`)**:
  1. Client sends `{"refresh_token": "..."}` to `POST /api/v1/auth/refresh`.
  2. Verify signature, issuer, audience, and assert `typ == "refresh"`.
  3. Load `RefreshSession` row by `claims["sid"]`.
  4. Compare token hash using `hmac.compare_digest(session.token_hash, hash_token(token))`.
  5. **Theft Detection**: If `session.revoked_at is not None` (token was already spent):
     * **Action**: Immediately revoke the entire `family_id` lineage (`_revoke_family()`). Attacker and legitimate user both lose access, forcing credential re-login.
  6. **Atomic Update**: `UPDATE refresh_sessions SET revoked_at = now, replaced_by_jti = new_jti WHERE id = session.id AND revoked_at IS NULL`. If row count != 1, revoke family and abort.
  7. Insert new `RefreshSession` in the same family, prune expired sessions, and return new `TokenPair`.

---

### 3.3. Complete API Endpoint Inventory

| Method | Path | Auth / Guard | Description & Schemas |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Liveness probe: `{"status": "ok", "environment": "...", "version": "..."}` |
| `GET` | `/api/v1/health/ready` | Public | Database readiness (`SELECT 1`). Returns 200 or 503 Service Unavailable. |
| `POST` | `/api/v1/auth/register` | Rate-limited | **Body**: `{"email", "password" (≥12 chars), "display_name"}`<br>**Response (201)**: `TokenPair` + `UserRead`<br>**Errors**: 409 (duplicate email), 422 (validation error). |
| `POST` | `/api/v1/auth/login` | Rate-limited | **Body**: `{"email", "password"}`<br>**Response (200)**: `TokenPair` + `UserRead`<br>**Errors**: 401 (invalid email or password). |
| `POST` | `/api/v1/auth/refresh` | Rate-limited | **Body**: `{"refresh_token": "..."}`<br>**Response (200)**: New `TokenPair` with rotated refresh token. |
| `POST` | `/api/v1/auth/logout` | Public | **Body**: `{"refresh_token": "..."}`. Revokes that specific session row (204). |
| `POST` | `/api/v1/auth/logout-all` | Bearer Token | Bumps `user.token_version` and revokes all active refresh sessions (204). |
| `GET` | `/api/v1/users/me` | Bearer Token | Current user profile (`UserRead`). |
| `PATCH` | `/api/v1/users/me` | Bearer Token | **Body**: `{"display_name": "...", "currency": "..."}`. Updates profile (200). |
| `POST` | `/api/v1/users/me/password` | Bearer Token | **Body**: `{"current_password", "new_password"}`. Revokes all sessions (204). |
| `DELETE` | `/api/v1/users/me` | Bearer Token | **Body**: `{"password"}`. Deletes user account and cascades all data (204). |
| `GET` | `/api/v1/transactions` | Bearer Token | **Query**: `limit` (default 20), `offset`, `search`, `category`, `kind` (`income`\|`expense`), `from_date`, `to_date`, `sort` (`date_desc`\|`date_asc`\|`amount_desc`\|`amount_asc`).<br>**Header**: `X-Total-Count`<br>**Response (200)**: `{"items": [...], "total": int, "limit": int, "offset": int}`. |
| `POST` | `/api/v1/transactions` | Bearer Token | **Body**: `{"description", "amount", "category", "occurred_on"}`.<br>**Response (201)**: Created `TransactionRead` with `Location` header. |
| `GET` | `/api/v1/transactions/summary` | Bearer Token | **Query**: Same filters as list.<br>**Response (200)**: `{"balance", "income", "expenses", "count", "currency"}` computed at database level. |
| `GET` | `/api/v1/transactions/categories` | Bearer Token | **Response (200)**: Distinct user categories `["Food", "Salary", ...]`. |
| `GET` | `/api/v1/transactions/{id}` | Bearer Token | Reads owned transaction. 404 if missing, 403 if owned by another user. |
| `PATCH` | `/api/v1/transactions/{id}` | Bearer Token | Updates owned transaction description, amount, category, or date. |
| `DELETE`| `/api/v1/transactions/{id}` | Bearer Token | Deletes owned transaction (204). |
| `GET` | `/api/v1/analytics/categories` | Bearer Token | **Query**: `from_date`, `to_date`.<br>**Response (200)**: `{"items": [{"category", "amount", "count", "percentage"}], "total_expenses", "currency"}`. |
| `GET` | `/api/v1/analytics/monthly` | Bearer Token | **Query**: `months` (1–24, default 6).<br>**Response (200)**: `{"items": [{"month", "label", "income", "expenses", "net"}], "currency"}`. |
| `GET` | `/api/v1/transactions/export` | Bearer Token | **Query**: Same filters as list.<br>**Response (200)**: Streams RFC 4180 CSV attachment (`Date,Description,Amount,Category`). |
| `POST`| `/api/v1/transactions/import` | Bearer Token | **Multipart**: `file: UploadFile` (CSV ≤5MB).<br>**Response (200)**: `{"imported": int, "skipped": int, "errors": list[str]}`. |
| `GET` | `/api/v1/budgets` | Bearer Token | **Query**: `month` (e.g. `2026-11`).<br>**Response (200)**: List of budgets with spend, remaining, %, and over-budget flag. |
| `POST`| `/api/v1/budgets` | Bearer Token | **Body**: `{"category", "monthly_limit"}`. Creates budget (201). 409 if exists. |
| `PATCH`| `/api/v1/budgets/{id}` | Bearer Token | **Body**: `{"monthly_limit"}`. Updates monthly limit. |
| `DELETE`| `/api/v1/budgets/{id}` | Bearer Token | Deletes category budget (204). |
| `GET` | `/api/v1/recurring` | Bearer Token | **Query**: `is_active: bool`. Lists active/inactive recurring rules. |
| `POST`| `/api/v1/recurring` | Bearer Token | **Body**: `{"description", "amount", "category", "frequency", "start_date"}`. Creates rule (201). |
| `POST`| `/api/v1/recurring/process` | Bearer Token | **Query**: `target_date: date`. Generates transactions due up to target date and advances `next_date`. |
| `GET` | `/api/v1/recurring/{id}` | Bearer Token | Reads recurring rule by ID. 404 if missing or unauthorized. |
| `PATCH`| `/api/v1/recurring/{id}` | Bearer Token | **Body**: `{"description", "amount", "category", "frequency", "is_active"}`. Updates rule. |
| `DELETE`| `/api/v1/recurring/{id}` | Bearer Token | Deletes recurring rule (204). |

---

## 4. Frontend Implementation & Expo SDK 58 Rules

### 4.1. Strict Expo SDK 58 Rules (`frontend/AGENTS.md`)
1. **Never edit `ios/` or `android/` folders directly**: These are generated by Continuous Native Generation (CNG). Configure native behavior in `app.json` and config plugins.
2. **Package Installation**: ALWAYS use `npx expo install <package>` instead of `npm/yarn/bun add`. This ensures SDK-compatible version resolution.
3. **Expo Go Limitations**: Expo Go only supports bundled native modules. Adding libraries with custom native code requires a development build (`npx expo run:ios|android` or `eas build`).
4. **Navigation**: Use **Expo Router** file-based navigation in `src/app/`. Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
5. **Always Verify**: Run `npm run typecheck` (`tsc --noEmit`) and `npm run lint` before finishing any frontend task.

---

### 4.2. Auth State Machine & Storage (`src/auth/`)

* **Storage Architecture (`token-storage.ts`)**:
  * **Native (iOS/Android)**: Stores refresh token in hardware Keystore/Keychain via `expo-secure-store`.
  * **Web**: Kept in-memory (`webRefreshToken`) to prevent long-lived XSS token persistence in `localStorage`.
  * **Access Token**: Stored strictly in-memory (`useRef<string | null>(null)` in `AuthContext.tsx`).
* **Silent Session Restore on App Startup**:
  1. On launch, reads stored refresh token.
  2. If present: calls `/api/v1/auth/refresh` -> then `/api/v1/users/me`.
  3. If successful: sets `user = profile`, `status = 'authenticated'`, and hides splash screen.
  4. If failed: clears storage, sets `status = 'unauthenticated'`, and shows login.
* **Transparent 401 Interceptor (`authedRequest<T>`)**:
  * If an API call fails with HTTP 401, automatically calls `refreshAccessToken()` (with deduplication across parallel requests) and retries the original request once. If the retry fails, signs out cleanly.

---

### 4.3. Dynamic API Discovery (`src/api/api-url.ts`)
The client automatically discovers the backend host without hardcoding:
* **Physical Device (Expo Go)**: Derives computer's LAN IP from `Constants.expoConfig.hostUri` (e.g. `http://192.168.1.50:8000`).
* **Android Emulator**: Rewrites loopback to `http://10.0.2.2:8000`.
* **Web**: Uses `window.location.hostname:8000`.
* **Override**: Honors `EXPO_PUBLIC_API_URL` environment variable if present.

---

### 4.4. Design Tokens & Component Library

* **Tokens (`src/theme/colors.ts`)**:
  * `background`: `#0B0F14` | `surface`: `#151C24` | `surfaceMuted`: `#1D2630` | `border`: `#26313D`
  * `text`: `#F5F7FA` | `textMuted`: `#8A97A6`
  * `primary`: `#3DDC97` (emerald green) | `danger`: `#FF6B6B` (rose red) | `warning`: `#FFC857`
  * `radius`: `sm: 8, md: 12, lg: 20` | `spacing`: `xs: 4, sm: 8, md: 16, lg: 24, xl: 32`
* **Reusable Components (`src/components/`)**:
  * `FormField`: Styled input with floating label, active focus border, and secure entry toggle.
  * `PrimaryButton`: Touchable CTA with disabled styling and activity spinner during submissions.
  * `BalanceCard`: Displays total balance, income, and expenses with divider.
  * `TransactionRow`: Formatted row displaying description, category, formatted date, and colored amount.
  * `ApiStatusPill`: Real-time backend status badge showing online/offline status with manual ping.
  * `FormError`: Consistent warning banner for API and client validation errors.

---

## 5. Current Codebase Nuances & Integration Notes

1. **Transaction List Shape**: `GET /api/v1/transactions` returns `{ items: Transaction[], total, limit, offset }`. In `src/hooks/useTransactions.ts`, extract `data.items` when setting transaction arrays.
2. **Server Summary Hookup**: `HomeScreen` currently calculates totals client-side from the initial slice of transactions in memory. The backend already provides `GET /api/v1/transactions/summary` which computes correct aggregates across all transactions in SQL. Wiring `BalanceCard` to `/summary` will guarantee true totals.
3. **Strict Ownership Rule**: Ownership must ALWAYS be resolved from `current_user.id` at the database query level. Never trust a `user_id` passed in request bodies or query params.

---

## 6. What Can Be Done (Prioritized Roadmap)

### ✅ Tier 1: Frontend User Experience (COMPLETED)
1. **"Add Transaction" Modal & Flow**:
   * FAB (`+`) on `HomeScreen` navigating to `/add`.
   * `TransactionForm` component with amount, segmented income/expense toggle, description, category suggestions, and date inputs.
   * Successfully wired to `POST /api/v1/transactions`.
2. **Edit & Delete Transaction Actions**:
   * Tap `TransactionRow` opens `/transaction/[id]`.
   * Form supports update (`PATCH /api/v1/transactions/{id}`) and deletion (`DELETE /api/v1/transactions/{id}`) with confirmation alerts.
3. **Filter & Search Bar**:
   * Search input with 300ms debounce.
   * Category filter chips populated from user categories.
   * Kind filter toggle (`All`, `Income`, `Expense`).
   * Date range selection (`from_date`, `to_date`).
   * Sort order selector (`date_desc`, `date_asc`, `amount_desc`, `amount_asc`).
4. **Infinite Scroll Pagination**:
   * `FlatList` with `onEndReached` fetching subsequent pages via `offset` and `limit` (`PAGE_SIZE = 50`).
5. **Connect Server-Side Summary**:
   * `BalanceCard` on `HomeScreen` hooked directly to SQL-aggregate `GET /api/v1/transactions/summary`.
6. **User Profile & Settings Screen**:
   * Profile screen at `/profile` supporting display name and currency updates (`PATCH /api/v1/users/me`).
   * Password change form (`POST /api/v1/users/me/password`).
   * "Sign Out of All Devices" action (`POST /api/v1/auth/logout-all`).
   * "Delete Account" action (`DELETE /api/v1/users/me`).
7. **Frontend Test Suite**:
   * Unit test suite running with Node test runner (`scripts/run-tests.mjs`) covering API errors, currency/date formatters, monthly view date ranges, and form input validation.

---

### 💡 Tier 2: Backend Expansions & Advanced Analytics (CURRENT FOCUS)
1. **Analytics & Aggregations Endpoints (COMPLETED)**:
   * `GET /api/v1/analytics/categories`: Category breakdown with amount, count, and percentage share of total expenses.
   * `GET /api/v1/analytics/monthly`: Monthly spend and income trends over trailing 6–12 months.
   * Visual category spending breakdown widget on HomeScreen (`CategoryBreakdown.tsx`).
2. **CSV Export & Import (COMPLETED)**:
   * `GET /api/v1/transactions/export`: Stream transactions as an RFC 4180 CSV file with active query filters.
   * `POST /api/v1/transactions/import`: Multipart form upload to parse CSV statements (flexible headers, date/amount normalization) and bulk-insert transactions.
   * "Export" button on Transactions screen with automatic Web download and mobile device alerts.
3. **Budgets & Spending Limits (COMPLETED)**:
   * Model: `Budget` (`id`, `user_id`, `category`, `monthly_limit`, timestamps).
   * Endpoints: `POST /api/v1/budgets`, `GET /api/v1/budgets` (calculates monthly spend vs limit), `PATCH /api/v1/budgets/{id}`, `DELETE /api/v1/budgets/{id}`.
   * `BudgetTracker` frontend component with live progress bars and color alerts (<80% green, 80–100% yellow, >100% red).
4. **Recurring Transactions & Subscriptions (COMPLETED)**:
   * Model: `RecurringTransaction` (`id`, `user_id`, `description`, `amount`, `category`, `frequency`, `start_date`, `next_date`, `is_active`).
   * Alembic migration: `0003_recurring_transactions.py`.
   * Endpoints: `GET /api/v1/recurring`, `POST /api/v1/recurring`, `POST /api/v1/recurring/process`, `GET /api/v1/recurring/{id}`, `PATCH /api/v1/recurring/{id}`, `DELETE /api/v1/recurring/{id}`.
   * `RecurringTransactionsTracker` frontend component on HomeScreen with frequency badges, due status indicators, pause/resume, and one-tap process action.
5. **Email Verification & Password Reset**:
   * Verification tokens table and transactional mailer integration (Resend / SendGrid).
6. **Distributed Rate Limiting with Redis**:
   * Replace in-memory sliding window with Redis `INCR` and `EXPIRE`.

---

### 🎨 Tier 3: Advanced Mobile & Full-Stack Capabilities
1. **Interactive Financial Charts**: Integrate `react-native-gifted-charts` for monthly spending bar charts and category donut charts.
2. **Biometric Authentication**: Integrate `expo-local-authentication` for Face ID / Fingerprint lock on app launch or resume.
3. **Receipt Scanner & OCR**: Camera capture via `expo-image-picker` with automated receipt parsing via OCR or Gemini API.
4. **Push Notifications**: Scheduled reminders via `expo-notifications` for daily expense logging and budget threshold alerts.
5. **Offline Support & Optimistic Cache**: Integrate TanStack Query with AsyncStorage persistence for offline read capability and optimistic UI updates.

---

## 7. Developer & Agent Operational Guide

### Command Cheat Sheet

#### From the Monorepo Root (using `package.json`):
```sh
npm run dev:backend       # Start FastAPI server on 0.0.0.0:8000
npm run dev:frontend      # Start Expo React Native dev server
npm run test              # Run backend pytest + frontend tests
npm run test:backend      # Run backend pytest (49 tests)
npm run test:frontend     # Run frontend Jest tests
npm run lint              # Run ruff check, mypy, and ESLint
npm run typecheck         # Run TypeScript check (tsc --noEmit)
npm run format            # Auto-format Python backend code
npm run migrate           # Run Alembic migrations
npm run install:all       # Install uv backend deps + npm frontend deps
```

#### Manual Subdirectory Commands:
* **Backend**:
  ```sh
  cd backend
  uv sync
  uv run alembic upgrade head
  uv run fastapi dev app/main.py --host 0.0.0.0
  uv run pytest
  uv run ruff check .
  uv run mypy app
  ```
* **Frontend**:
  ```sh
  cd frontend
  npm install
  npx expo start
  npm run typecheck
  npm run lint
  ```

---

## 8. Summary Prompt for AI Agents

Whenever starting a new session with an AI agent, you can simply say:

> "Read `AGENT_CONTEXT.md` in the repository root. It contains the complete system architecture, data models, API schemas, Expo SDK 58 rules, and roadmap for Money Tracker.
> 
> My request is: <DESCRIBE YOUR TASK HERE>"
