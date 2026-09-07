FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir uv==0.11.29

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
COPY upstream ./upstream
COPY NOTICE.md ./NOTICE.md
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin talos

WORKDIR /app
COPY --from=builder --chown=talos:talos /app/.venv /app/.venv
COPY --from=builder --chown=talos:talos /app/upstream /app/upstream
COPY --from=builder --chown=talos:talos /app/NOTICE.md /app/NOTICE.md

USER talos
EXPOSE 8765
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/healthz', timeout=2).read()"]
CMD ["python", "-m", "uvicorn", "talos_human_journey.api:create_runtime_app", "--factory", "--host", "127.0.0.1", "--port", "8765", "--no-access-log"]

