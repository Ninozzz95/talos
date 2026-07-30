import { createHash } from 'node:crypto'

import Fastify, {
  type FastifyInstance,
  type FastifyReply,
} from 'fastify'
import { z } from 'zod'

import { verifyWorkerToken, assertWorkerTokenConfigured } from './auth.js'
import { GenerationRegistry } from './cancellation/generationRegistry.js'
import {
  beginRequestLifecycle,
  settleWithinRequestLifecycle,
} from './cancellation/requestLifecycle.js'
import { ARTIFACT_HARD_LIMITS_V1 } from './contracts/artifactLimits.js'
import {
  ArtifactProblemV1,
  ArtifactRequestV1,
  ArtifactResponseV1,
  ArtifactWorkerReadinessV1,
  type ArtifactRequest,
  type ArtifactResponse,
} from './contracts/artifactProtocol.js'
import {
  ArtifactWorkerFault,
  type ArtifactWorkerFaultCode,
} from './errors.js'
import {
  generateArtifact,
  type GenerateArtifactOptions,
} from './generateArtifact.js'
import {
  TemporaryArtifactStore,
  type ArtifactTemporaryStore,
} from './storage/temporaryArtifactStore.js'

const MAXIMUM_BODY_LIMIT_BYTES = 8_000_000
const MAXIMUM_HANDLER_TIMEOUT_MS = 180_000
const MAXIMUM_CONCURRENT_GENERATIONS = 16
const REQUEST_TIMEOUT_MS = 15_000
const CONNECTION_TIMEOUT_MS = 15_000
const REQUEST_ID = z.uuid()

export const ARTIFACT_SERVER_DEFAULTS_V1 = Object.freeze({
  bodyLimitBytes: 4_000_000,
  handlerTimeoutMs: ARTIFACT_HARD_LIMITS_V1.max_duration_ms + 5_000,
  maxConcurrentGenerations: 2,
  maximumBodyLimitBytes: MAXIMUM_BODY_LIMIT_BYTES,
  maximumConcurrentGenerations: MAXIMUM_CONCURRENT_GENERATIONS,
  maximumHandlerTimeoutMs: MAXIMUM_HANDLER_TIMEOUT_MS,
  workerVersion: '0.1.0',
})

const PUBLIC_FAULT_MESSAGES: Record<ArtifactWorkerFaultCode, string> = {
  ARTIFACT_BODY_TOO_LARGE: 'Artifact request body exceeds the configured byte limit',
  ARTIFACT_CANCELLED: 'Artifact generation was cancelled',
  ARTIFACT_CAPACITY_EXCEEDED: 'Artifact worker generation capacity is exhausted',
  ARTIFACT_GENERATION_FAILED: 'Artifact generation could not be completed',
  ARTIFACT_HANDLER_TIMEOUT: 'Artifact generation exceeded the worker handler timeout',
  ARTIFACT_INTERNAL_ERROR: 'The artifact worker could not complete the request',
  ARTIFACT_INVALID_JSON: 'Request body must contain valid JSON',
  ARTIFACT_INVALID_REQUEST: 'Artifact request does not match talos.artifact.request.v1',
  ARTIFACT_OUTPUT_TOO_LARGE: 'Generated artifact exceeds the requested byte limit',
  ARTIFACT_REQUEST_ACTIVE: 'An artifact request with this identifier is already active',
  ARTIFACT_REQUEST_NOT_ACTIVE: 'No active artifact request has this identifier',
  ARTIFACT_TEMP_IO_FAILED: 'Temporary artifact verification could not be completed',
  ARTIFACT_UNAUTHORIZED: 'A valid artifact worker Bearer token is required',
  ARTIFACT_UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json',
  ARTIFACT_VALIDATION_FAILED: 'Generated artifact did not pass validation',
}

const PROBLEM_TITLES: Record<ArtifactWorkerFaultCode, string> = {
  ARTIFACT_BODY_TOO_LARGE: 'Request body too large',
  ARTIFACT_CANCELLED: 'Artifact generation cancelled',
  ARTIFACT_CAPACITY_EXCEEDED: 'Artifact worker capacity exceeded',
  ARTIFACT_GENERATION_FAILED: 'Artifact generation failed',
  ARTIFACT_HANDLER_TIMEOUT: 'Artifact worker timeout',
  ARTIFACT_INTERNAL_ERROR: 'Artifact worker failure',
  ARTIFACT_INVALID_JSON: 'Invalid JSON',
  ARTIFACT_INVALID_REQUEST: 'Invalid artifact request',
  ARTIFACT_OUTPUT_TOO_LARGE: 'Artifact output too large',
  ARTIFACT_REQUEST_ACTIVE: 'Artifact request already active',
  ARTIFACT_REQUEST_NOT_ACTIVE: 'Artifact request not active',
  ARTIFACT_TEMP_IO_FAILED: 'Temporary artifact failure',
  ARTIFACT_UNAUTHORIZED: 'Unauthorized',
  ARTIFACT_UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  ARTIFACT_VALIDATION_FAILED: 'Artifact validation failed',
}

export type ArtifactGenerator = (
  input: unknown,
  options?: GenerateArtifactOptions,
) => Promise<ArtifactResponse>

export interface BuildArtifactServerOptions {
  token: string
  temporaryRoot: string
  workerVersion?: string
  bodyLimitBytes?: number
  handlerTimeoutMs?: number
  maxConcurrentGenerations?: number
  generator?: ArtifactGenerator
  temporaryStore?: ArtifactTemporaryStore
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string,
): number {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error(`${label} must be a positive integer no greater than ${maximum}`)
  }
  return resolved
}

function validatedRequestId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('request_id' in value)) {
    return undefined
  }
  const parsed = REQUEST_ID.safeParse(value.request_id)
  return parsed.success ? parsed.data : undefined
}

function sendProblem(
  reply: FastifyReply,
  status: number,
  code: ArtifactWorkerFaultCode,
  requestId?: string,
): FastifyReply {
  const problem = ArtifactProblemV1.parse({
    type: `urn:talos:artifact-worker:problem:${code.toLowerCase().replaceAll('_', '-')}`,
    title: PROBLEM_TITLES[code],
    status,
    detail: PUBLIC_FAULT_MESSAGES[code],
    code,
    ...(requestId === undefined ? {} : { request_id: requestId }),
  })
  return reply
    .code(status)
    .type('application/problem+json')
    .send(problem)
}

function faultStatus(error: ArtifactWorkerFault): number {
  if (error.code === 'ARTIFACT_CANCELLED') {
    return 422
  }
  if (
    error.code === 'ARTIFACT_GENERATION_FAILED'
    || error.code === 'ARTIFACT_TEMP_IO_FAILED'
    || error.code === 'ARTIFACT_INTERNAL_ERROR'
  ) {
    return 500
  }
  return error.statusCode
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    ? error.code
    : undefined
}

function verifySuccessfulResponse(response: ArtifactResponse): Buffer {
  if (response.status !== 'succeeded') {
    throw new ArtifactWorkerFault(
      'ARTIFACT_GENERATION_FAILED',
      'Artifact generator returned a failure response',
      { statusCode: 500 },
    )
  }

  const bytes = Buffer.from(response.data_base64, 'base64')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== response.byte_size || sha256 !== response.sha256) {
    throw new ArtifactWorkerFault(
      'ARTIFACT_VALIDATION_FAILED',
      'Artifact response bytes do not match their declared integrity metadata',
      { statusCode: 500 },
    )
  }
  return bytes
}

export function buildArtifactServer(options: BuildArtifactServerOptions): FastifyInstance {
  const token = assertWorkerTokenConfigured(options.token)
  if (options.temporaryRoot.trim().length === 0) {
    throw new Error('Artifact temporary root is required')
  }

  const bodyLimit = boundedPositiveInteger(
    options.bodyLimitBytes,
    ARTIFACT_SERVER_DEFAULTS_V1.bodyLimitBytes,
    MAXIMUM_BODY_LIMIT_BYTES,
    'Artifact body limit',
  )
  const handlerTimeout = boundedPositiveInteger(
    options.handlerTimeoutMs,
    ARTIFACT_SERVER_DEFAULTS_V1.handlerTimeoutMs,
    MAXIMUM_HANDLER_TIMEOUT_MS,
    'Artifact handler timeout',
  )
  const maxConcurrentGenerations = boundedPositiveInteger(
    options.maxConcurrentGenerations,
    ARTIFACT_SERVER_DEFAULTS_V1.maxConcurrentGenerations,
    MAXIMUM_CONCURRENT_GENERATIONS,
    'Maximum concurrent artifact generations',
  )
  const workerVersion = options.workerVersion ?? ARTIFACT_SERVER_DEFAULTS_V1.workerVersion
  const readiness = ArtifactWorkerReadinessV1.parse({
    contract: 'talos.artifact.readiness.v1',
    status: 'ready',
    worker_version: workerVersion,
    protocol_version: 1,
    formats: ['docx', 'pdf', 'pptx', 'xlsx', 'thumbnail'],
    limits: ARTIFACT_HARD_LIMITS_V1,
  })
  const generator = options.generator ?? generateArtifact
  const registry = new GenerationRegistry(maxConcurrentGenerations)
  const store = options.temporaryStore ?? new TemporaryArtifactStore(options.temporaryRoot)
  const app = Fastify({
    bodyLimit,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    // Fastify 5.10.0 aborts request.signal when a POST body closes normally.
    // The owned lifecycle below preserves the timeout and disconnect contract.
    handlerTimeout: 0,
    logger: false,
    requestTimeout: REQUEST_TIMEOUT_MS,
    trustProxy: false,
  })

  app.addHook('onRequest', async (request, reply) => {
    if (!verifyWorkerToken(request.headers.authorization, token)) {
      reply.header('www-authenticate', 'Bearer realm="talos-artifact-worker"')
      return sendProblem(reply, 401, 'ARTIFACT_UNAUTHORIZED')
    }
  })

  app.addHook('preClose', async () => {
    registry.cancelAll()
  })

  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof ArtifactWorkerFault
      && error.code === 'ARTIFACT_HANDLER_TIMEOUT'
    ) {
      return sendProblem(reply, 503, 'ARTIFACT_HANDLER_TIMEOUT')
    }
    const code = errorCode(error)
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return sendProblem(reply, 413, 'ARTIFACT_BODY_TOO_LARGE')
    }
    if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return sendProblem(reply, 400, 'ARTIFACT_INVALID_JSON')
    }
    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return sendProblem(reply, 415, 'ARTIFACT_UNSUPPORTED_MEDIA_TYPE')
    }
    if (code === 'FST_ERR_HANDLER_TIMEOUT') {
      return sendProblem(reply, 503, 'ARTIFACT_HANDLER_TIMEOUT')
    }
    return sendProblem(reply, 500, 'ARTIFACT_INTERNAL_ERROR')
  })

  app.get('/ready', async () => readiness)

  app.post('/generate', async (request, reply) => {
    const parsed = ArtifactRequestV1.safeParse(request.body)
    if (!parsed.success) {
      return sendProblem(
        reply,
        422,
        'ARTIFACT_INVALID_REQUEST',
        validatedRequestId(request.body),
      )
    }

    const artifactRequest: ArtifactRequest = parsed.data
    const lifecycle = beginRequestLifecycle(request.raw, reply.raw, handlerTimeout)
    let lease: ReturnType<GenerationRegistry['begin']>
    try {
      lease = registry.begin(
        artifactRequest.request_id,
        artifactRequest.limits.max_duration_ms,
        lifecycle.signal,
      )
    } catch (error) {
      lifecycle.finish()
      if (error instanceof ArtifactWorkerFault && error.code === 'ARTIFACT_REQUEST_ACTIVE') {
        return sendProblem(
          reply,
          409,
          'ARTIFACT_REQUEST_ACTIVE',
          artifactRequest.request_id,
        )
      }
      if (error instanceof ArtifactWorkerFault && error.code === 'ARTIFACT_CAPACITY_EXCEEDED') {
        reply.header('retry-after', '1')
        return sendProblem(
          reply,
          503,
          'ARTIFACT_CAPACITY_EXCEEDED',
          artifactRequest.request_id,
        )
      }
      throw error
    }

    let temporaryLease: Awaited<ReturnType<ArtifactTemporaryStore['createLease']>> | undefined
    let generationOperation: Promise<ArtifactResponse> | undefined
    let response: ArtifactResponse
    let responseStatus: number
    try {
      generationOperation = generator(artifactRequest, { signal: lease.signal })
      const generated = ArtifactResponseV1.parse(
        await settleWithinRequestLifecycle(
          generationOperation,
          lease.signal,
        ),
      )
      const generatedBytes = verifySuccessfulResponse(generated)
      temporaryLease = await store.createLease()
      await temporaryLease.writeArtifact(artifactRequest.format, generatedBytes)
      const verifiedBytes = await temporaryLease.readArtifact()
      if (!verifiedBytes.equals(generatedBytes)) {
        throw new ArtifactWorkerFault(
          'ARTIFACT_VALIDATION_FAILED',
          'Temporary artifact bytes changed during verification',
          { statusCode: 500 },
        )
      }
      response = generated
      responseStatus = 200
    } catch (error) {
      if (
        lifecycle.signal.reason instanceof ArtifactWorkerFault
        && lifecycle.signal.reason.code === 'ARTIFACT_HANDLER_TIMEOUT'
      ) {
        throw lifecycle.signal.reason
      }
      const fault = error instanceof ArtifactWorkerFault
        ? error
        : lease.signal.aborted
          ? new ArtifactWorkerFault(
              errorCode(lease.signal.reason) === 'FST_ERR_HANDLER_TIMEOUT'
                || (
                  lease.signal.reason instanceof DOMException
                  && lease.signal.reason.name === 'TimeoutError'
                )
                ? 'ARTIFACT_HANDLER_TIMEOUT'
                : 'ARTIFACT_CANCELLED',
              'Artifact generation stopped at the owned cancellation boundary',
              {
                statusCode: (
                  lease.signal.reason instanceof DOMException
                  && lease.signal.reason.name === 'TimeoutError'
                ) ? 503 : 422,
              },
            )
          : new ArtifactWorkerFault(
              'ARTIFACT_GENERATION_FAILED',
              'Artifact generator raised an unexpected error',
              { cause: error, statusCode: 500 },
            )
      response = ArtifactResponseV1.parse({
        contract: 'talos.artifact.response.v1',
        request_id: artifactRequest.request_id,
        status: 'failed',
        error: {
          code: fault.code,
          message: PUBLIC_FAULT_MESSAGES[fault.code],
        },
      })
      responseStatus = faultStatus(fault)
    } finally {
      try {
        await temporaryLease?.cleanup()
      } finally {
        lifecycle.finish()
        if (generationOperation === undefined) {
          lease.finish()
        } else {
          void generationOperation.then(
            () => lease.finish(),
            () => lease.finish(),
          )
        }
      }
    }
    return reply.code(responseStatus).send(response)
  })

  app.post<{ Params: { requestId: string } }>('/cancel/:requestId', async (request, reply) => {
    const requestId = REQUEST_ID.safeParse(request.params.requestId)
    if (!requestId.success) {
      return sendProblem(reply, 422, 'ARTIFACT_INVALID_REQUEST')
    }
    if (!registry.cancel(requestId.data)) {
      return sendProblem(reply, 404, 'ARTIFACT_REQUEST_NOT_ACTIVE', requestId.data)
    }
    return reply.code(202).send({
      contract: 'talos.artifact.cancellation.v1',
      request_id: requestId.data,
      status: 'cancellation_requested',
    })
  })

  return app
}
