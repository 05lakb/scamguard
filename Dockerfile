# Builds the Last Mile Guard app. Google Cloud builds this on its own machines.

# Stage 1: build the web pages.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
# "ci" installs exactly the locked versions; "ignore-scripts" blocks install-time code.
RUN npm ci --ignore-scripts
COPY web/ ./
RUN npm run build

# Stage 2: the server that serves the pages and the checks.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LMG_DISK_CACHE=0
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY redteam/__init__.py redteam/factory.py redteam/attacks.py redteam/customer_agent.py redteam/report.py redteam/
COPY data/typologies.json data/typologies.json
COPY --from=web /web/dist web/dist

# Run as a normal user, not as the administrator.
RUN useradd --create-home appuser
USER appuser

# Cloud Run tells the server which port to use.
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8080}"]
