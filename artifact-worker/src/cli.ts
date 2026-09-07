import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'

import { assertWorkerTokenConfigured } from './auth.js'
import {
  ARTIFACT_SERVER_DEFAULTS_V1,
  buildArtifactServer,
} from './server.js'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 3_200

export interface ArtifactWorkerRuntimeConfiguration {
  host: string
  port: number
  token: string
  temporaryRoot: string
  bodyLimitBytes: number
  handlerTimeoutMs: number
  maxConcurrentGenerations: number
  workerVersion: string
}

function integerEnvironment(
  value: string | undefined,
  fallback: number,
  maximum: number,
  variable: string,
): number {
  if (value === undefined) {
    return fallback
  }
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${variable} must be a positive base-10 integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${variable} exceeds its finite maximum of ${maximum}`)
  }
  return parsed
}

function hostEnvironment(value: string | undefined): string {
  const host = value ?? DEFAULT_HOST
  if (!['127.0.0.1', '0.0.0.0', '::1', '::'].includes(host)) {
    throw new Error(
      'ARTIFACT_WORKER_HOST must be an explicit loopback or all-interfaces bind address',
    )
  }
  return host
}

function temporaryRootEnvironment(value: string | undefined): string {
  if (value !== undefined && value.trim().length === 0) {
    throw new Error('ARTIFACT_WORKER_TEMP_DIR must not be blank')
  }
  const path = value ?? join(tmpdir(), 'talos-artifact-worker')
  if (!isAbsolute(path)) {
    throw new Error('ARTIFACT_WORKER_TEMP_DIR must be an absolute path')
  }
  return resolve(path)
}

export function parseArtifactWorkerEnvironment(
  environment: NodeJS.ProcessEnv,
): ArtifactWorkerRuntimeConfiguration {
  return {
    host: hostEnvironment(environment.ARTIFACT_WORKER_HOST),
    port: integerEnvironment(
      environment.ARTIFACT_WORKER_PORT,
      DEFAULT_PORT,
      65_535,
      'ARTIFACT_WORKER_PORT',
    ),
    token: assertWorkerTokenConfigured(environment.ARTIFACT_WORKER_TOKEN),
    temporaryRoot: temporaryRootEnvironment(environment.ARTIFACT_WORKER_TEMP_DIR),
    bodyLimitBytes: integerEnvironment(
      environment.ARTIFACT_WORKER_BODY_LIMIT_BYTES,
      ARTIFACT_SERVER_DEFAULTS_V1.bodyLimitBytes,
      ARTIFACT_SERVER_DEFAULTS_V1.maximumBodyLimitBytes,
      'ARTIFACT_WORKER_BODY_LIMIT_BYTES',
    ),
    handlerTimeoutMs: integerEnvironment(
      environment.ARTIFACT_WORKER_HANDLER_TIMEOUT_MS,
      ARTIFACT_SERVER_DEFAULTS_V1.handlerTimeoutMs,
      ARTIFACT_SERVER_DEFAULTS_V1.maximumHandlerTimeoutMs,
      'ARTIFACT_WORKER_HANDLER_TIMEOUT_MS',
    ),
    maxConcurrentGenerations: integerEnvironment(
      environment.ARTIFACT_WORKER_MAX_CONCURRENT_GENERATIONS,
      ARTIFACT_SERVER_DEFAULTS_V1.maxConcurrentGenerations,
      ARTIFACT_SERVER_DEFAULTS_V1.maximumConcurrentGenerations,
      'ARTIFACT_WORKER_MAX_CONCURRENT_GENERATIONS',
    ),
    workerVersion: ARTIFACT_SERVER_DEFAULTS_V1.workerVersion,
  }
}

export async function startArtifactWorker(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<FastifyInstance> {
  const configuration = parseArtifactWorkerEnvironment(environment)
  const app = buildArtifactServer(configuration)
  let closing: Promise<void> | undefined

  const removeSignalHandlers = (): void => {
    process.off('SIGINT', handleSignal)
    process.off('SIGTERM', handleSignal)
  }
  const close = (): Promise<void> => {
    closing ??= app.close()
    return closing
  }
  const handleSignal = (): void => {
    void close().catch(() => {
      process.exitCode = 1
    })
  }

  process.once('SIGINT', handleSignal)
  process.once('SIGTERM', handleSignal)
  app.addHook('onClose', async () => {
    removeSignalHandlers()
  })

  try {
    await app.listen({
      host: configuration.host,
      port: configuration.port,
      listenTextResolver: () => '',
    })
  } catch (error) {
    removeSignalHandlers()
    await close().catch(() => undefined)
    throw error
  }

  process.stdout.write(`${JSON.stringify({
    contract: 'talos.artifact.worker.lifecycle.v1',
    status: 'listening',
    host: configuration.host,
    port: configuration.port,
  })}\n`)
  return app
}

const invokedPath = process.argv[1]
const isEntrypoint = invokedPath !== undefined
  && resolve(invokedPath) === resolve(fileURLToPath(import.meta.url))

if (isEntrypoint) {
  void startArtifactWorker().catch((error: unknown) => {
    const detail = error instanceof Error
      ? error.message
      : 'Artifact worker could not start'
    process.stderr.write(`ARTIFACT_WORKER_STARTUP_FAILED: ${detail}\n`)
    process.exitCode = 1
  })
}
