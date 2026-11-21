# Authentication and authorization

This document explains the JWT authentication system, the decisions behind it, and what the mobile client and a production deployment still need to do.

## Stack assumptions

- **FastAPI + Pydantic v2 + SQLAlchemy 2 (async)** — added on top of the existing backend structure.
- **SQLite** (`sqlite+aiosqlite`) for local development. The models use portable SQLAlchemy types; switching to PostgreSQL only requires `DATABASE_URL=postgresql+asyncpg://...` (and running migrations).
- **Argon2id** password hashing via `pwdlib[argon2]`. Argon2id is memory-hard and the current OWASP recommendation; `pwdlib` replaces the unmaintained `passlib`.
- **HS256 JWTs** via PyJWT, using a 32+ character secret from the environment. A shared secret is sufficient here because a single backend both signs and verifies tokens. If you later split services or want verifiers that cannot mint tokens, switch to RS256/EdDSA with a private key held only by the issuer.
- **Access + rotating refresh tokens** — access tokens are short-lived (15 minutes); refresh tokens last 30 days and are single-use.

There was no data model yet, so `transactions` is included as the first user-owned resource. It demonstrates the ownership pattern that future resources (budgets, accounts, categories) should copy.

## Configuration

All settings live in `app/core/config.py` and come from `.env`:

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | *(required)* | 32+ characters. Startup fails if missing/short. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. |
| `JWT_ISSUER` | `money-tracker-api` | Validated on every decode. |
| `JWT_AUDIENCE` | `money-tracker-app` | Validated on every decode. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Keep short; the client refreshes proactively. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Rotation means each token is used once. |
| `AUTH_RATE_LIMIT_REQUESTS` / `AUTH_RATE_LIMIT_WINDOW_SECONDS` | `10` / `60` | Per-IP cap on auth endpoints. |
| `DATABASE_URL` | SQLite file | Use an async driver (`aiosqlite`, `asyncpg`). |

Rotating `JWT_SECRET` immediately invalidates every issued token.

## Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | – | Create a user, returns a token pair and the user. `201`, `409` on duplicate email. |
| `POST` | `/api/v1/auth/login` | – | Verify credentials, returns a token pair. `401` on any failure. |
| `POST` | `/api/v1/auth/refresh` | refresh token | Rotate the refresh token, returns a new pair. `401` if invalid/expired/reused. |
| `POST` | `/api/v1/auth/logout` | refresh token | Revoke that one session. Idempotent `204`. |
| `POST` | `/api/v1/auth/logout-all` | access token | Revoke every session and invalidate every access token. `204`. |
| `GET` | `/api/v1/users/me` | access token | Current user profile. |
| `GET/POST` | `/api/v1/transactions` | access token | List/create the current user's transactions. |
| `GET/PATCH/DELETE` | `/api/v1/transactions/{id}` | access token | Read/update/delete an owned transaction. |

Send credentials as `Authorization: Bearer <access_token>`. Refresh/logout send
`{"refresh_token": "..."}` in the JSON body, never in a URL.

## Token contents and validation

Every token carries `sub` (user id), `iss`, `aud`, `iat`, `nbf`, `exp`, `jti`,
`typ` (`access` or `refresh`) and `ver` (the user's token version). Refresh
tokens also carry `sid` (the database session id).

`decode_token()` in `app/core/security.py` validates the signature, expiry,
not-before time, issuer, audience, required claims, and token type. The type
check is what stops a refresh JWT from being replayed as an access token.

`get_current_user` in `app/api/deps.py` is the guard used by protected routes.
After decoding, it reloads the user and compares `ver` with `user.token_version`
so a token can be invalidated before its natural expiry.

## Ownership model

- `user_id` is never read from a request body or query string.
- Creation takes the owner from `current_user.id`.
- Listing filters with `WHERE user_id = current_user.id`.
- Single-record routes use the `get_owned_transaction` dependency, which loads
  the record, returns `404` if it does not exist, and `403` if it belongs to
  someone else. The `403` makes the authorization failure explicit; be aware it
  also confirms that the ID exists. If hiding existence matters more for a
  future resource, return `404` for both cases and document the choice.

## Refresh-token lifecycle

1. Login/register creates a `refresh_sessions` row with a random `jti`, a
   `family_id`, and a SHA-256 hash of the refresh JWT. The raw token is never
   stored, so a database leak does not expose usable tokens.
2. `POST /auth/refresh` verifies the JWT, checks its hash against the stored
   row, then revokes the old row and issues a new one in the same family.
3. Reusing an already-rotated token is treated as theft: every active token in
   that family is revoked. Both the attacker and the legitimate client must log
   in again.
4. `logout` revokes one session. `logout-all` bumps `token_version` (killing
   existing access tokens) and revokes all refresh sessions.

Access tokens are stateless, so revocation is bounded by their 15-minute
lifetime for single-session logout. Bumping `token_version` gives immediate
revocation for the "all devices" case.

## Brute-force and abuse protection

- Argon2id hashing plus constant-time dummy verification for unknown emails so
  response timing does not reveal registered accounts.
- Login always returns the same `401 Invalid email or password.` for a wrong
  password and an unknown email.
- Duplicate registration returns `409`; this does reveal that an email is
  registered, which is a deliberate usability trade-off. Use email verification
  if that matters for your threat model.
- Sliding-window per-IP limits on all `/auth/*` endpoints (`429` with
  `Retry-After`). The limiter is **in-process**; with multiple workers or
  instances, back it with Redis or enforce limits at the proxy/API gateway.
- Passwords are 12–128 characters with no composition rules (length beats
  forced symbols). Only Argon2 hashes are stored.

## Client storage guidance (React Native / Expo)

- Store the **refresh token in `expo-secure-store`** (Keychain on iOS, Keystore
  on Android). Do **not** use `AsyncStorage`, `localStorage`, or plain files.
- Keep the **access token in memory** (React context/state). This limits the
  blast radius if a device is lost and avoids writing short-lived secrets to
  disk at all.
- On app start, restore the refresh token from SecureStore, call `/auth/refresh`,
  and keep the rotated pair. Persist only the newest refresh token; a failed
  refresh means the user must log in again.
- Never log tokens or include them in crash reports/analytics.
- Always use HTTPS outside local development. Bearer tokens are not protected by
  CSRF because they are sent from JavaScript, but they are exposed to XSS if the
  app renders untrusted HTML; avoid injecting remote content.
- For a web client, prefer a `HttpOnly; Secure; SameSite` refresh cookie and keep
  access tokens in memory, which avoids storing long-lived tokens in
  `localStorage`.

## Replay and tampering

- Signatures prevent tampering; changing any claim invalidates the token.
- Access tokens expire quickly, and refresh tokens rotate with reuse detection.
- `jti` gives every token a unique identity for logging/anomaly detection.
- There is no stateless denylist: per-session immediate revocation relies on the
  refresh session, and global revocation on `token_version`.
- Pin the algorithm on decode (`algorithms=["HS256"]`) to prevent algorithm
  confusion attacks.

## Production checklist

- [ ] Generate a unique `JWT_SECRET` per environment and keep it in a secrets
      manager, not in git.
- [ ] Set `ENVIRONMENT=production`, `DEBUG=false`, `DATABASE_ECHO=false`, and
      `CREATE_TABLES_ON_STARTUP=false`.
- [ ] Add Alembic migrations (the current `create_all` is development-only).
- [ ] Use PostgreSQL (`postgresql+asyncpg`) and a connection pool sized for the
      deployment.
- [ ] Move rate limiting to Redis/proxy so every worker shares counters.
- [ ] Configure `uvicorn --forwarded-allow-ips` so per-IP limits see the real
      client address behind a trusted proxy.
- [ ] Enforce HTTPS and HSTS at the edge.
- [ ] Add account email verification and a password-reset flow (reuse
      `hash_password`, `token_version`, and the session revocation helpers).
- [ ] Add structured audit logging for login failures, refreshes, and
      reuse-detection events without recording tokens or passwords.
- [ ] Consider RS256/EdDSA if token verification moves to other services.
