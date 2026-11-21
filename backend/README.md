# Money Tracker API

> **Note**: For the complete full-stack architecture, shared schemas, and project-wide roadmap, refer to the unified root [README.md](../README.md).

FastAPI backend for the Money Tracker app, with JWT authentication and
per-user data ownership.

## Requirements

- Python 3.14+
- [uv](https://docs.astral.sh/uv/)

## Setup

```sh
uv sync
cp .env.example .env
```

`JWT_SECRET` is required. Generate one and paste it into `.env`:

```sh
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The local `.env` in this checkout already has a generated development secret and
is git-ignored.

## Run

```sh
uv run fastapi dev app/main.py --host 0.0.0.0
```

Binding to `0.0.0.0` (instead of the default `127.0.0.1`) lets phones and
emulators on your network reach the API. If Windows Firewall prompts you, allow
Python access on private networks. The API is then reachable at
<http://127.0.0.1:8000> locally and `http://<your-lan-ip>:8000` from a phone.

- `GET /` – service metadata
- `GET /api/v1/health` – health check
- `GET /docs` – interactive OpenAPI docs (disabled in production)

Tables are created on startup for local SQLite development. Set
`CREATE_TABLES_ON_STARTUP=false` and use migrations in production.

## Authentication

All user data routes require `Authorization: Bearer <access_token>`. Access
tokens live for 15 minutes; refresh tokens live for 30 days, rotate on every
use, and are stored only as SHA-256 hashes.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | – | Create an account and get a token pair |
| `POST` | `/api/v1/auth/login` | – | Log in and get a token pair |
| `POST` | `/api/v1/auth/refresh` | refresh token | Rotate the refresh token |
| `POST` | `/api/v1/auth/logout` | refresh token | Revoke one session |
| `POST` | `/api/v1/auth/logout-all` | access token | Revoke every session |
| `GET` | `/api/v1/users/me` | access token | Current user |
| `GET`/`POST` | `/api/v1/transactions` | access token | List/create own transactions |
| `GET`/`PATCH`/`DELETE` | `/api/v1/transactions/{id}` | access token | Manage an owned transaction |

Ownership comes from the verified token, never from request parameters. Another
user's record returns `403`; a missing record returns `404`. Missing or invalid
tokens return `401` with `WWW-Authenticate: Bearer`.

See [docs/authentication.md](docs/authentication.md) for the token lifecycle,
client storage guidance, and the production security checklist.

## Test and lint

```sh
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

## Layout

```
app/
  api/        # routers and dependencies (auth guard, ownership check)
  core/       # settings, password/JWT security, rate limiting
  db/         # async engine, session dependency, dev table creation
  models/     # SQLAlchemy models (users, refresh sessions, transactions)
  schemas/    # Pydantic request/response models
  services/   # authentication business logic
tests/        # auth, token validation, and ownership tests
docs/         # security documentation
```
