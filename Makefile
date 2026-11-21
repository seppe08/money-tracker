# Developer shortcuts. On Windows, run these from Git Bash or WSL, or use the
# underlying commands documented in CONTRIBUTING.md.
.PHONY: help install dev-backend dev-frontend test test-backend test-frontend lint lint-backend lint-frontend format audit migrate docker

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Install backend and frontend dependencies
	cd backend && uv sync
	cd frontend && npm ci

dev-backend: ## Run the API with reload
	cd backend && uv run fastapi dev app/main.py --host 0.0.0.0

dev-frontend: ## Start the Expo dev server
	cd frontend && npm start

test: test-backend test-frontend ## Run all tests

test-backend: ## Run backend tests with coverage
	cd backend && uv run pytest --cov=app --cov-report=term-missing

test-frontend: ## Run frontend tests
	cd frontend && npm test -- --runInBand

lint: lint-backend lint-frontend ## Run all linters and type checks

lint-backend: ## Ruff check, format check, and mypy
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app

lint-frontend: ## ESLint and TypeScript
	cd frontend && npm run lint && npm run typecheck

format: ## Auto-format backend code
	cd backend && uv run ruff check --fix . && uv run ruff format .

audit: ## Audit dependencies for known vulnerabilities
	cd backend && uv export --format requirements-txt --no-hashes --no-dev | uvx pip-audit -r /dev/stdin
	cd frontend && npm audit --audit-level=moderate

migrate: ## Apply database migrations
	cd backend && uv run alembic upgrade head

docker: ## Build and run the API container
	docker compose up --build
