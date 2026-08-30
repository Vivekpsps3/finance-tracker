# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY --from=packages . /packages
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
COPY --from=node:22-bookworm-slim /usr/local /usr/local
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=ui /ui/dist/frontend/browser /app/static
ENV STATIC_DIR=/app/static
ENV PI_CODING_AGENT_DIR=/data/pi
ENV AGENT_CWD=/data
ENV PI_SKIP_VERSION_CHECK=1
ENV PI_TELEMETRY=0
EXPOSE 8090
CMD ["sh", "-c", "uvicorn app:app --host ${HOST:-127.0.0.1} --port ${PORT:-8090}"]
