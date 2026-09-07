# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS dependencies

WORKDIR /app

COPY artifact-worker/package.json artifact-worker/package-lock.json artifact-worker/.npmrc ./
COPY artifact-worker/vendor ./vendor

RUN npm ci --no-audit --no-fund

FROM dependencies AS test

ENV FONTCONFIG_PATH=/app/assets/fontconfig

COPY artifact-worker/tsconfig.json artifact-worker/vitest.config.ts ./
COPY artifact-worker/Dockerfile artifact-worker/Dockerfile.dockerignore ./
COPY .gitignore /.gitignore
COPY artifact-worker/scripts ./scripts
COPY artifact-worker/src ./src
COPY artifact-worker/tests ./tests
COPY artifact-worker/assets ./assets
COPY THIRD_PARTY_NOTICES.md /THIRD_PARTY_NOTICES.md

RUN npm run verify:provenance \
    && npm audit --audit-level=high \
    && npm test \
    && npm run build

FROM test AS production-dependencies

RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS runtime

LABEL org.opencontainers.image.title="TALOS Artifact Worker" \
      org.opencontainers.image.description="Private bounded artifact generation worker" \
      org.opencontainers.image.source="https://github.com/pewdiepie-archdaemon/agent-virtual-machine"

WORKDIR /app

ENV NODE_ENV=production \
    ARTIFACT_WORKER_HOST=0.0.0.0 \
    ARTIFACT_WORKER_PORT=3200 \
    ARTIFACT_WORKER_TEMP_DIR=/tmp/talos-artifact-worker \
    FONTCONFIG_PATH=/app/assets/fontconfig

COPY --from=production-dependencies --chown=65532:65532 /app/package.json ./package.json
COPY --from=production-dependencies --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=65532:65532 /app/dist ./dist
COPY --from=production-dependencies --chown=65532:65532 /app/assets ./assets
COPY --from=production-dependencies --chown=65532:65532 /THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

USER 65532:65532
EXPOSE 3200
STOPSIGNAL SIGTERM

ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist/cli.js"]
