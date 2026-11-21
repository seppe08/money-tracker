# Money Tracker

A full-stack personal finance tracker: a FastAPI + SQLAlchemy API with rotating
JWT sessions, and an Expo/React Native client with secure token storage.

[![CI](../../actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![CodeQL](../../actions/workflows/codeql.yml/badge.svg)](../../actions/workflows/codeql.yml)
![Python 3.14](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.120+-009688?logo=fastapi&logoColor=white)
![Expo SDK 58](https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Why this project exists

Money Tracker is a reference implementation of the things that make a small
product production-shaped rather than demo-shaped:

- **Authentication done properly** — short-lived access tokens, rotating
  single-use refresh tokens with reuse detection, immediate global revocation,
  Argon2id hashing, and per-IP rate limiting.
- **Authorization at the data layer** — every transaction query is scoped to the
  authenticated user; ownership never comes from a client-supplied id.
- **A mobile client that respects secrets** — refresh tokens live in the iOS
  Keychain / Android Keystore, access tokens stay in memory, and concurrent
  refreshes are de-duplicated.
- **Operational hygiene** — migrations, health/readiness probes, structured
  request logging, security headers, request size limits, CI, dependency audits,
  and a documented threat model.

## Features

- Email/password registration and login with a modern, accessible dark UI.
- Create, edit, delete, search, filter, and paginate transactions.
- Server-side balance, income, and expense summaries (correct beyond one page).
- Categories, date ranges, and income/expense filters.
- Profile updates and password changes that revoke existing sessions.
- Refresh-token rotation with automatic reuse detection and family revocation.
- Secure session restore on app launch and graceful expiry handling.
- Health (`/health`) and database readiness (`/health/ready`) endpoints.

## Architecture

```text
┌─────────────────────────────┐        HTTPS / JSON        ┌──────────────────────────────┐
│  Expo app (React Native)    │  ───────────────────────▶  │  FastAPI (async)             │
│  Expo Router · TypeScript   │                            │  Pydantic v2 · SQLAlchemy 2  │
│  SecureStore refresh token  │  ◀───────────────────────  │  Argon2id · PyJWT · Alembic  │
└─────────────────────────────┘        access + refresh    └──────────────┬───────────────┘
                                                                         │
                                                              ┌──────────▼───────────┐
                                                              │ SQLite (dev)         │
                                                              │ PostgreSQL (prod)    │
                                                              └──────────────────────┘
```

The API is stateless for access tokens and stateful only for refresh-session
rows. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for request flows,
data model, and design trade-offs.

## Quick start

### 1. Backend

```sh
cd backend
uv sync
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET
uv run alembic upgrade head
uv run fastapi dev app/main.py --host 0.0.0.0
```

The API is at <http://127.0.0.1:8000>; interactive docs are at `/docs` outside
production.

### 2. Mobile app

```sh
cd frontend
npm install
npm start
```

Scan the QR code with Expo Go, or press `w` for the web build. The app discovers
the API from the Expo dev-server host; set `EXPO_PUBLIC_API_URL` only when the
backend lives elsewhere.

## API overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | – | Create an account |
| `POST` | `/api/v1/auth/login` | – | Sign in |
| `POST` | `/api/v1/auth/refresh` | refresh | Rotate the refresh token |
| `POST` | `/api/v1/auth/logout` | refresh | Revoke one session |
| `POST` | `/api/v1/auth/logout-all` | access | Revoke every session |
| `GET` | `/api/v1/users/me` | access | Current profile |
| `PATCH` | `/api/v1/users/me` | access | Update display name |
| `POST` | `/api/v1/users/me/password` | access | Change password |
| `GET` | `/api/v1/transactions` | access | List with filters and pagination |
| `POST` | `/api/v1/transactions` | access | Create |
| `GET` | `/api/v1/transactions/summary` | access | Balance, income, expenses |
| `GET` | `/api/v1/transactions/categories` | access | Distinct categories |
| `GET/PATCH/DELETE` | `/api/v1/transactions/{id}` | access | Read, update, delete |
| `GET` | `/api/v1/health` | – | Liveness |
| `GET` | `/api/v1/health/ready` | – | Database readiness |

Full request/response examples live in [docs/API.md](docs/API.md).

## Testing and quality

```sh
make test        # backend pytest + frontend Jest
make lint        # ruff, ESLint, TypeScript
make audit       # pip-audit + npm audit
```

Without `make`:

```sh
cd backend  && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd frontend && npm test && npm run lint && npm run typecheck
```

CI runs the same commands on every push and pull request, plus CodeQL and
Dependency Review.

## Repository layout

```text
backend/           FastAPI service
  app/api/         Routers and dependencies (auth guard, ownership)
  app/core/        Settings, security, logging, middleware, rate limiting
  app/db/          Async engine and session lifecycle
  app/models/      SQLAlchemy models
  app/schemas/     Pydantic request/response models
  app/services/    Business logic (auth, transactions)
  migrations/      Alembic migrations
  tests/           Pytest suite
frontend/          Expo / React Native client
  src/app/         Expo Router routes
  src/api/         Typed API client
  src/auth/        Session context and secure token storage
  src/components/  Reusable UI
  src/hooks/       Data fetching
docs/              Architecture, API, security, and development guides
.github/           CI, CodeQL, Dependabot, issue and PR templates
```

## Security

The short version: Argon2id passwords, HS256 JWTs with issuer/audience/type
validation, rotating refresh tokens stored only as SHA-256 hashes, reuse
detection, per-IP auth rate limits, strict per-user authorization, CORS
allow-lists, security headers, and request size limits.

Read [docs/SECURITY.md](docs/SECURITY.md) for the threat model and the
production checklist, and [SECURITY.md](SECURITY.md) to report an issue
privately.

## Roadmap

- [ ] Email verification and password reset.
- [ ] Shared budgets and recurring transactions.
- [ ] CSV import/export and monthly reports.
- [ ] Multi-currency accounts.
- [ ] Redis-backed rate limiting for multi-instance deployments.

## License

[MIT](LICENSE)
