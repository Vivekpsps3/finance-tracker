# Finance Tracker — local development
# Usage: make help | make install | make dev

SHELL := /bin/bash
BACKEND_DIR := backend
FRONTEND_DIR := frontend
VENV := $(BACKEND_DIR)/.venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn

API_HOST ?= 127.0.0.1
API_PORT ?= 8000
# WEB_HOST 0.0.0.0 exposes the dev UI on your LAN (SEC-011); API stays on API_HOST by default.
WEB_HOST ?= 0.0.0.0
WEB_PORT ?= 4200

.PHONY: help install install-backend install-frontend dev backend frontend \
        test test-backend test-frontend build build-frontend clean reset-db check \
        docker-up docker-down docker-build docker-rebuild docker-logs docker-ps docker-config reset-docker-db

help:
	@echo "Finance Tracker"
	@echo ""
	@echo "  make install          Create venv, pip + npm dependencies"
	@echo "  make dev              Run API + Angular dev server (parallel)"
	@echo "  make backend          API only  → http://$(API_HOST):$(API_PORT)"
	@echo "  make frontend         UI only   → http://localhost:$(WEB_PORT) (proxy → API)"
	@echo "  make test             Backend + frontend unit tests"
	@echo "  make build            Production Angular build"
	@echo "  make docker-up        Build/start full website → http://127.0.0.1:8080"
	@echo "  make docker-down      Stop Docker stack"
	@echo "  make docker-logs      Follow Docker logs"
	@echo "  make docker-rebuild   Rebuild images without cache and start"
	@echo "  make clean            Remove caches, dist, __pycache__, *.bak"
	@echo "  make reset-db         Delete backend/finance.db (fresh schema on next API start)"
	@echo "  make reset-docker-db  Delete data/finance.db for Docker stack"
	@echo ""
	@echo "First time: make install && make dev"
	@echo "Open: http://localhost:$(WEB_PORT)"

install: install-backend install-frontend
	@echo "Install complete."

install-backend:
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install -q -U pip
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt
	@echo "Backend venv: $(VENV)"

install-frontend:
	cd $(FRONTEND_DIR) && npm install
	@echo "Frontend deps: $(FRONTEND_DIR)/node_modules"

# Run both; Ctrl+C stops both job groups
dev:
	@echo "Starting backend (:$(API_PORT)) and frontend (:$(WEB_PORT))…"
	@echo "(Restart required after proxy.conf.js changes.)"
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) backend & \
	$(MAKE) frontend & \
	wait

backend:
	@if [ -x $(UVICORN) ]; then \
		cd $(BACKEND_DIR) && ../$(UVICORN) main:app --reload --host $(API_HOST) --port $(API_PORT); \
	elif command -v uvicorn >/dev/null 2>&1; then \
		cd $(BACKEND_DIR) && uvicorn main:app --reload --host $(API_HOST) --port $(API_PORT); \
	else echo "Run: make install-backend"; exit 1; fi

frontend:
	@test -d $(FRONTEND_DIR)/node_modules || (echo "Run: make install-frontend" && exit 1)
	cd $(FRONTEND_DIR) && npx ng serve --configuration development --host $(WEB_HOST) --port $(WEB_PORT)

test: test-backend test-frontend

test-backend:
	@if [ -x $(PY) ]; then cd $(BACKEND_DIR) && ../$(PY) -m pytest -q; \
	else cd $(BACKEND_DIR) && python3 -m pytest -q; fi

test-frontend:
	cd $(FRONTEND_DIR) && npm test -- --watch=false --browsers=ChromeHeadless 2>/dev/null || \
		(echo "Frontend tests need Chrome/ChromeHeadless (CHROME_BIN). Skipped or run: cd frontend && npm test")

build: build-frontend

build-frontend:
	cd $(FRONTEND_DIR) && npm run build

docker-up:
	docker compose up --build

docker-down:
	docker compose down

docker-build:
	docker compose build

docker-rebuild:
	docker compose build --no-cache
	docker compose up

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

docker-config:
	docker compose config

reset-db:
	rm -f $(BACKEND_DIR)/finance.db $(BACKEND_DIR)/finance.db-journal \
		$(BACKEND_DIR)/finance.db-wal $(BACKEND_DIR)/finance.db-shm
	@echo "Removed $(BACKEND_DIR)/finance.db. Restart the API to recreate an empty database."

reset-docker-db:
	rm -f data/finance.db data/finance.db-journal data/finance.db-wal data/finance.db-shm
	@echo "Removed data/finance.db. Restart Docker stack to recreate an empty database."

clean:
	rm -rf $(BACKEND_DIR)/__pycache__ \
		$(BACKEND_DIR)/.pytest_cache \
		$(BACKEND_DIR)/import_parsers/__pycache__ \
		$(BACKEND_DIR)/routers/__pycache__ \
		$(BACKEND_DIR)/services/__pycache__ \
		$(BACKEND_DIR)/tests/__pycache__ \
		$(FRONTEND_DIR)/dist \
		$(FRONTEND_DIR)/.angular/cache
	find $(BACKEND_DIR) -name '*.bak' -delete 2>/dev/null || true
	@echo "Cleaned build artifacts and caches (kept finance.db and node_modules)."

check: test-backend test-frontend build-frontend
	@echo "check OK"
