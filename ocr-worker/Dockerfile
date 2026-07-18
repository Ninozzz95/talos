# syntax=docker/dockerfile:1.7

FROM ghcr.io/astral-sh/uv:0.11.29@sha256:eb2843a1e56fd9e30c7276ce1a52cba86e64c7b385f5e3279a0e08e02dd058fc AS uv

FROM python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH=/app/.venv/bin:$PATH

COPY --from=uv /uv /uvx /usr/local/bin/

RUN groupadd --gid 10001 talos-ocr \
    && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/talos-ocr --shell /usr/sbin/nologin talos-ocr

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY --chown=10001:10001 src ./src

USER 10001:10001

EXPOSE 3200

CMD ["uvicorn", "talos_ocr_worker.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "3200", "--workers", "1", "--limit-concurrency", "4", "--no-access-log"]
