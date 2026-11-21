# Contributing

Thanks for taking the time to improve Money Tracker. This project favours small,
focused pull requests and a readable history over large, unreviewable changes.

## Development setup

Prerequisites: Python 3.14+, [uv](https://docs.astral.sh/uv/), Node.js 20+, and
npm.

```sh
# Backend
cd backend
uv sync
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into JWT_SECRET
uv run alembic upgrade head
uv run fastapi dev app/main.py --host 0.0.0.0

# Frontend (second terminal)
cd frontend
npm install
npm start
```

See the [development guide](docs/DEVELOPMENT.md) for the full workflow,
including database migrations and the Expo web build.

## Branching model

| Branch | Purpose |
|---|---|
| `main` | Always releasable. Protected; merge through a pull request. |
| `feat/<slug>` | New user-facing behaviour. |
| `fix/<slug>` | Bug fixes. |
| `chore/<slug>` | Tooling, dependencies, documentation. |

Keep branches short-lived and rebase on `main` before requesting review. Do not
force-push a branch that someone else is reviewing without telling them.

## Commit messages

This repository uses [Conventional Commits](https://www.conventionalcommits.org/)
so the changelog and release notes can be generated mechanically. The
`.githooks/commit-msg` hook validates the format; enable it once per clone:

```sh
git config core.hooksPath .githooks
```

Format:

```text
<type>(<optional scope>): <imperative summary, max 72 chars>

<optional body explaining why, wrapped at 72 characters>

<optional footer, e.g. BREAKING CHANGE: or Refs: #123>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

Examples:

```text
feat(transactions): add server-side summary endpoint
fix(auth): revoke the token family when a rotated token is reused
docs: document the production security checklist
```

## Definition of done

Before opening a pull request:

- [ ] `make lint` and `make test` pass locally.
- [ ] New behaviour has tests (backend: `pytest`; frontend: `npm test`).
- [ ] Public API changes are reflected in `docs/API.md` and the OpenAPI schema.
- [ ] Security-sensitive changes are noted in the pull request description.
- [ ] No secrets, tokens, database files, or `.env` files are committed.
- [ ] Screenshots or a short recording are attached for UI changes.

## Pull requests

Use the pull request template. Describe the problem, the approach, and how you
verified the change. Reviewers look for correctness, security, accessibility,
and tests before style. Keep unrelated refactors out of a feature PR.

## Reporting security issues

Do **not** open a public issue for a suspected vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.
