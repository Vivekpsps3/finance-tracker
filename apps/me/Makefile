# me-app — Angular + FastAPI
# First time: make install && make dev
# Open: http://127.0.0.1:8090

SHELL := /bin/bash
CONTROL := /home/vivek/Deployments/_control
STACK := me-app

.PHONY: help install dev check test test-unit build preview \
	up down logs rebuild ps clean

help:
	@echo "me-app (Angular + FastAPI)"
	@echo ""
	@echo "  make install     frontend npm ci + backend venv"
	@echo "  make dev         API on :8090 (serves built UI if present)"
	@echo "  make build       ng build"
	@echo "  make up          Docker stack"
	@echo "  make down        stop Docker"
	@echo "  make rebuild     rebuild image and start"
	@echo "  make clean       caches"
	@echo ""
	@echo "First time: make install && make build && make dev"

install:
	cd frontend && npm ci
	python3 -m venv backend/.venv
	backend/.venv/bin/pip install -r backend/requirements.txt

dev:
	cd backend && ../backend/.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8090 --reload

build:
	cd frontend && npm run build

check:
	cd frontend && npx ng build --configuration=development

test-unit:
	cd backend && .venv/bin/python test_vault.py
	cd backend && .venv/bin/python test_timeline.py
	cd backend && .venv/bin/python test_csrf_smoke.py

test: test-unit

preview: build dev

up:
	make -C $(CONTROL) up STACK=$(STACK)

down:
	make -C $(CONTROL) down STACK=$(STACK)

logs:
	make -C $(CONTROL) logs STACK=$(STACK)

rebuild:
	sudo docker compose -f $(CONTROL)/compose/$(STACK).yml up -d --build

ps:
	make -C $(CONTROL) ps STACK=$(STACK)

clean:
	rm -rf frontend/dist backend/.venv
	@echo "Cleaned. data/ kept."
