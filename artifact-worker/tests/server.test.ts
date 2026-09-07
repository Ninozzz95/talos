import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { request as createHttpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ArtifactCancellationV1,
  ArtifactProblemV1,
  ArtifactResponseV1,
  ArtifactWorkerReadinessV1,
  type ArtifactRequest,
  type ArtifactResponse,
} from '../src/contracts/artifactProtocol.js'
import { parseArtifactWorkerEnvironment } from '../src/cli.js'
import { ArtifactWorkerFault } from '../src/errors.js'
import { buildArtifactServer, type ArtifactGenerator } from '../src/server.js'

const TOKEN = 'artifact-worker-test-token-32-bytes-minimum'
const fixtureUrl = new URL('./fixtures/report.v1.json', import.meta.url)
const applications: FastifyInstance[] = []
const temporaryRoots: string[] = []

async function request(
  requestId = '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
): Promise<ArtifactRequest> {
  return {
    contract: 'talos.artifact.request.v1',
    request_id: requestId,
    format: 'pdf',
    filename: 'server-report.pdf',
    document: JSON.parse(await readFile(fixtureUrl, 'utf8')) as ArtifactRequest['document'],
    limits: {
      max_output_bytes: 10_000_000,
      max_duration_ms: 30_000,
      max_sections: 100,
      max_rows: 2_000,
      max_slides: 50,
      max_input_pixels: 16_000_000,
    },
  }
}

function authorization(token = TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}` }
}

function successfulPdfResponse(requestId: string): ArtifactResponse {
  const bytes = Buffer.from('%PDF-1.4\n%%EOF\n')
  return {
    contract: 'talos.artifact.response.v1',
    request_id: requestId,
    status: 'succeeded',
    format: 'pdf',
    mime_type: 'application/pdf',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byte_size: bytes.byteLength,
    data_base64: bytes.toString('base64'),
    validation: {
      detected_mime: 'application/pdf',
      reopened: true,
    },
  }
}

function temporaryRoot(name: string): string {
  const root = join(tmpdir(), `talos-artifact-server-${name}-${crypto.randomUUID()}`)
  temporaryRoots.push(root)
  return root
}

function application(
  name: string,
  options: {
    bodyLimitBytes?: number
    generator?: ArtifactGenerator
    handlerTimeoutMs?: number
    maxConcurrentGenerations?: number
    temporaryStore?: {
      createLease(): Promise<{
        writeArtifact(format: ArtifactRequest['format'], bytes: Buffer): Promise<string>
        readArtifact(): Promise<Buffer>
        cleanup(): Promise<void>
      }>
    }
  } = {},
): FastifyInstance {
  const app = buildArtifactServer({
    token: TOKEN,
    temporaryRoot: temporaryRoot(name),
    workerVersion: '0.1.0',
    ...options,
  })
  applications.push(app)
  return app
}

async function listen(application: FastifyInstance): Promise<{
  host: string
  port: number
  url: string
}> {
  await application.listen({
    host: '127.0.0.1',
    port: 0,
    listenTextResolver: () => '',
  })
  const address = application.server.address() as AddressInfo | null
  if (address === null || typeof address === 'string') {
    throw new Error('Artifact worker did not expose a TCP address')
  }
  return {
    host: '127.0.0.1',
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
  }
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map(async (app) => app.close()))
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })),
  )
})

describe('artifact worker HTTP boundary', () => {
  it('authenticates every route and returns a controlled RFC 9457 problem', async () => {
    const response = await application('auth').inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(401)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.headers['www-authenticate']).toBe('Bearer realm="talos-artifact-worker"')
    expect(ArtifactProblemV1.parse(response.json())).toMatchObject({
      status: 401,
      code: 'ARTIFACT_UNAUTHORIZED',
    })
    expect(response.body).not.toContain(TOKEN)
  })

  it('reports a strict authenticated readiness contract for all enabled formats', async () => {
    const response = await application('ready').inject({
      method: 'GET',
      url: '/ready',
      headers: authorization(),
    })

    expect(response.statusCode).toBe(200)
    expect(ArtifactWorkerReadinessV1.parse(response.json())).toMatchObject({
      contract: 'talos.artifact.readiness.v1',
      status: 'ready',
      worker_version: '0.1.0',
      protocol_version: 1,
      formats: ['docx', 'pdf', 'pptx', 'xlsx', 'thumbnail'],
    })
  })

  it('rejects invalid JSON, oversized bodies, and unknown request members before generation', async () => {
    const invalidJson = await application('invalid-json').inject({
      method: 'POST',
      url: '/generate',
      headers: {
        ...authorization(),
        'content-type': 'application/json',
      },
      payload: '{"contract":',
    })
    expect(invalidJson.statusCode).toBe(400)
    expect(ArtifactProblemV1.parse(invalidJson.json())).toMatchObject({
      status: 400,
      code: 'ARTIFACT_INVALID_JSON',
    })

    const bodyLimited = await application('body-limit', { bodyLimitBytes: 256 }).inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: await request(),
    })
    expect(bodyLimited.statusCode).toBe(413)
    expect(ArtifactProblemV1.parse(bodyLimited.json())).toMatchObject({
      status: 413,
      code: 'ARTIFACT_BODY_TOO_LARGE',
    })

    const malformed = {
      ...await request(),
      untrusted_options: { shell: 'calc.exe' },
    }
    const strict = await application('strict').inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: malformed,
    })
    expect(strict.statusCode).toBe(422)
    expect(ArtifactProblemV1.parse(strict.json())).toMatchObject({
      status: 422,
      code: 'ARTIFACT_INVALID_REQUEST',
      request_id: malformed.request_id,
    })
  })

  it('generates through the real boundary and removes terminal temporary bytes', async () => {
    const root = temporaryRoot('generate')
    const app = buildArtifactServer({
      token: TOKEN,
      temporaryRoot: root,
      workerVersion: '0.1.0',
    })
    applications.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: await request(),
    })

    expect(response.statusCode).toBe(200)
    const artifact = ArtifactResponseV1.parse(response.json())
    expect(artifact).toMatchObject({
      status: 'succeeded',
      format: 'pdf',
      validation: { reopened: true },
    })
    expect(await readdir(root)).toEqual([])
  }, 30_000)

  it('releases request ownership when terminal temporary cleanup fails', async () => {
    let verifiedBytes = Buffer.alloc(0)
    let cleanupCalls = 0
    const app = application('cleanup-failure', {
      temporaryStore: {
        async createLease() {
          return {
            async writeArtifact(_format, bytes) {
              verifiedBytes = Buffer.from(bytes)
              return 'opaque-worker-owned-path'
            },
            async readArtifact() {
              return verifiedBytes
            },
            async cleanup() {
              cleanupCalls += 1
              throw new Error('C:\\private\\temporary-cleanup-failure')
            },
          }
        },
      },
    })
    const artifactRequest = await request()

    const first = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: artifactRequest,
    })
    const second = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: artifactRequest,
    })

    expect(first.statusCode).toBe(500)
    expect(second.statusCode).toBe(500)
    expect(ArtifactProblemV1.parse(first.json())).toMatchObject({
      code: 'ARTIFACT_INTERNAL_ERROR',
    })
    expect(ArtifactProblemV1.parse(second.json())).toMatchObject({
      code: 'ARTIFACT_INTERNAL_ERROR',
    })
    expect(first.body).not.toContain('C:\\private')
    expect(second.body).not.toContain('C:\\private')
    expect(cleanupCalls).toBe(2)
  }, 30_000)

  it('keeps a real POST generation alive after the request body stream closes normally', async () => {
    const app = application('real-post')
    const endpoint = await listen(app)
    const artifactRequest = await request()
    artifactRequest.format = 'docx'
    artifactRequest.filename = 'real-post.docx'

    const response = await fetch(`${endpoint.url}/generate`, {
      method: 'POST',
      headers: {
        ...authorization(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(artifactRequest),
    })

    expect(response.status).toBe(200)
    expect(ArtifactResponseV1.parse(await response.json())).toMatchObject({
      request_id: artifactRequest.request_id,
      status: 'succeeded',
      format: 'docx',
      validation: { reopened: true },
    })
  }, 30_000)

  it('enforces the finite handler timeout on a real POST after body completion', async () => {
    const neverSettles: ArtifactGenerator = async (_input, options): Promise<ArtifactResponse> => {
      await new Promise<never>((_resolve, reject) => {
        const abort = (): void => {
          reject(options.signal?.reason ?? new Error('Generation aborted'))
        }
        if (options.signal?.aborted === true) {
          abort()
          return
        }
        options.signal?.addEventListener('abort', abort, { once: true })
      })
    }
    const app = application('real-timeout', {
      generator: neverSettles,
      handlerTimeoutMs: 50,
    })
    const endpoint = await listen(app)

    const response = await fetch(`${endpoint.url}/generate`, {
      method: 'POST',
      headers: {
        ...authorization(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(await request()),
    })

    expect(response.status).toBe(503)
    expect(ArtifactProblemV1.parse(await response.json())).toMatchObject({
      status: 503,
      code: 'ARTIFACT_HANDLER_TIMEOUT',
    })
  })

  it('returns the handler timeout without awaiting an uncooperative generator', async () => {
    const ignoresCancellation: ArtifactGenerator = async (): Promise<ArtifactResponse> => {
      await sleep(500)
      throw new Error('Uncooperative generator completed after the owned deadline')
    }
    const app = application('uncooperative-timeout', {
      generator: ignoresCancellation,
      handlerTimeoutMs: 50,
    })
    const endpoint = await listen(app)
    const startedAt = performance.now()

    const response = await fetch(`${endpoint.url}/generate`, {
      method: 'POST',
      headers: {
        ...authorization(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(await request()),
    })
    const elapsedMs = performance.now() - startedAt

    expect(response.status).toBe(503)
    expect(ArtifactProblemV1.parse(await response.json())).toMatchObject({
      status: 503,
      code: 'ARTIFACT_HANDLER_TIMEOUT',
    })
    expect(elapsedMs).toBeLessThan(300)
  })

  it('aborts owned generation when a real HTTP client disconnects', async () => {
    let markStarted: (() => void) | undefined
    let markAborted: ((premature: boolean) => void) | undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const aborted = new Promise<boolean>((resolve) => {
      markAborted = resolve
    })
    let clientDisconnected = false
    const waitsForDisconnect: ArtifactGenerator = async (_input, options): Promise<ArtifactResponse> => {
      markStarted?.()
      await new Promise<never>((_resolve, reject) => {
        const abort = (): void => {
          markAborted?.(!clientDisconnected)
          reject(options.signal?.reason ?? new Error('Generation aborted'))
        }
        if (options.signal?.aborted === true) {
          abort()
          return
        }
        options.signal?.addEventListener('abort', abort, { once: true })
      })
    }
    const app = application('real-disconnect', {
      generator: waitsForDisconnect,
      handlerTimeoutMs: 5_000,
    })
    const endpoint = await listen(app)
    const payload = JSON.stringify(await request())
    const client = createHttpRequest({
      host: endpoint.host,
      port: endpoint.port,
      path: '/generate',
      method: 'POST',
      headers: {
        ...authorization(),
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    })
    client.on('error', () => undefined)
    client.on('response', (response) => response.resume())
    client.end(payload)

    await started
    await sleep(25)
    clientDisconnected = true
    client.destroy()

    expect(await aborted).toBe(false)
  })

  it('enforces one owner, supports explicit cancellation, and cleans the active lease', async () => {
    let started: (() => void) | undefined
    const generationStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const delayed: ArtifactGenerator = async (input, options): Promise<ArtifactResponse> => {
      const parsed = input as ArtifactRequest
      started?.()
      await new Promise<never>((_resolve, reject) => {
        const abort = (): void => {
          reject(new ArtifactWorkerFault('ARTIFACT_CANCELLED', 'Artifact generation was cancelled'))
        }
        if (options.signal?.aborted === true) {
          abort()
          return
        }
        options.signal?.addEventListener('abort', abort, { once: true })
      })
      return {
        contract: 'talos.artifact.response.v1',
        request_id: parsed.request_id,
        status: 'failed',
        error: {
          code: 'ARTIFACT_GENERATION_FAILED',
          message: 'Unreachable generator result',
        },
      }
    }
    const app = application('cancel', { generator: delayed })
    const artifactRequest = await request()
    const pending = app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: artifactRequest,
    })
    await generationStarted

    const duplicate = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: artifactRequest,
    })
    expect(duplicate.statusCode).toBe(409)
    expect(ArtifactProblemV1.parse(duplicate.json())).toMatchObject({
      code: 'ARTIFACT_REQUEST_ACTIVE',
      request_id: artifactRequest.request_id,
    })

    const cancellation = await app.inject({
      method: 'POST',
      url: `/cancel/${artifactRequest.request_id}`,
      headers: authorization(),
    })
    expect(cancellation.statusCode).toBe(202)
    expect(ArtifactCancellationV1.parse(cancellation.json())).toEqual({
      contract: 'talos.artifact.cancellation.v1',
      request_id: artifactRequest.request_id,
      status: 'cancellation_requested',
    })

    const cancelled = await pending
    expect(cancelled.statusCode).toBe(422)
    expect(ArtifactResponseV1.parse(cancelled.json())).toMatchObject({
      request_id: artifactRequest.request_id,
      status: 'failed',
      error: { code: 'ARTIFACT_CANCELLED' },
    })

    const noLongerActive = await app.inject({
      method: 'POST',
      url: `/cancel/${artifactRequest.request_id}`,
      headers: authorization(),
    })
    expect(noLongerActive.statusCode).toBe(404)
    expect(ArtifactProblemV1.parse(noLongerActive.json())).toMatchObject({
      code: 'ARTIFACT_REQUEST_NOT_ACTIVE',
    })
  })

  it('rejects excess generation before invoking its generator and admits work after release', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    let invocations = 0
    const generationStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const generationRelease = new Promise<void>((resolve) => {
      release = resolve
    })
    const capacityBoundGenerator: ArtifactGenerator = async (input): Promise<ArtifactResponse> => {
      const artifactRequest = input as ArtifactRequest
      invocations += 1
      if (invocations === 1) {
        started?.()
        await generationRelease
      }
      return successfulPdfResponse(artifactRequest.request_id)
    }
    const app = application('capacity', {
      generator: capacityBoundGenerator,
      maxConcurrentGenerations: 1,
    })
    const firstRequest = await request('019f9b4f-42c3-72f4-b5bb-8b237f98f7c2')
    const first = app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: firstRequest,
    })
    await generationStarted

    const excessRequest = await request('019f9b4f-42c3-72f4-b5bb-8b237f98f7c3')
    const excess = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: excessRequest,
    })
    expect(excess.statusCode).toBe(503)
    expect(excess.headers['retry-after']).toBe('1')
    expect(ArtifactProblemV1.parse(excess.json())).toMatchObject({
      status: 503,
      code: 'ARTIFACT_CAPACITY_EXCEEDED',
      request_id: excessRequest.request_id,
    })
    expect(invocations).toBe(1)

    release?.()
    expect((await first).statusCode).toBe(200)

    const admittedRequest = await request('019f9b4f-42c3-72f4-b5bb-8b237f98f7c4')
    const admitted = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: admittedRequest,
    })
    expect(admitted.statusCode).toBe(200)
    expect(invocations).toBe(2)
  })

  it('retains capacity until an uncooperative timed-out generator actually settles', async () => {
    let release: (() => void) | undefined
    let started: (() => void) | undefined
    let invocations = 0
    const generationStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    const generationRelease = new Promise<void>((resolve) => {
      release = resolve
    })
    const ignoresCancellation: ArtifactGenerator = async (input): Promise<ArtifactResponse> => {
      const artifactRequest = input as ArtifactRequest
      invocations += 1
      if (invocations === 1) {
        started?.()
        await generationRelease
        throw new Error('Detached generator settled after its request deadline')
      }
      return successfulPdfResponse(artifactRequest.request_id)
    }
    const app = application('detached-capacity', {
      generator: ignoresCancellation,
      handlerTimeoutMs: 50,
      maxConcurrentGenerations: 1,
    })
    const first = app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: await request('019f9b4f-42c3-72f4-b5bb-8b237f98f7c2'),
    })
    await generationStarted

    expect((await first).statusCode).toBe(503)

    const excessRequest = await request('019f9b4f-42c3-72f4-b5bb-8b237f98f7c3')
    const excess = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: excessRequest,
    })
    expect(excess.statusCode).toBe(503)
    expect(ArtifactProblemV1.parse(excess.json())).toMatchObject({
      code: 'ARTIFACT_CAPACITY_EXCEEDED',
      request_id: excessRequest.request_id,
    })
    expect(invocations).toBe(1)

    release?.()
    await sleep(10)

    const admitted = await app.inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: await request('019f9b4f-42c3-72f4-b5bb-8b237f98f7c4'),
    })
    expect(admitted.statusCode).toBe(200)
    expect(invocations).toBe(2)
  })

  it('maps handler timeout and unexpected internals without leaking raw details', async () => {
    const neverSettles: ArtifactGenerator = async (_input, options): Promise<ArtifactResponse> => {
      await new Promise<never>((_resolve, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(new Error('C:\\private\\worker\\secret-token-value')),
          { once: true },
        )
      })
    }
    const timeout = await application('timeout', {
      generator: neverSettles,
      handlerTimeoutMs: 50,
    }).inject({
      method: 'POST',
      url: '/generate',
      headers: authorization(),
      payload: await request(),
    })

    expect(timeout.statusCode).toBe(503)
    expect(ArtifactProblemV1.parse(timeout.json())).toMatchObject({
      status: 503,
      code: 'ARTIFACT_HANDLER_TIMEOUT',
    })
    expect(timeout.body).not.toContain('C:\\private')
    expect(timeout.body).not.toContain('secret-token-value')
  })
})

describe('artifact worker CLI configuration', () => {
  it('defaults to loopback with finite worker limits and accepts explicit internal binding', () => {
    const explicitTemporaryRoot = join(tmpdir(), 'talos-artifacts-explicit')
    const defaults = parseArtifactWorkerEnvironment({
      ARTIFACT_WORKER_TOKEN: TOKEN,
    })
    expect(defaults).toMatchObject({
      host: '127.0.0.1',
      port: 3_200,
      token: TOKEN,
      bodyLimitBytes: 4_000_000,
      handlerTimeoutMs: 125_000,
      maxConcurrentGenerations: 2,
      workerVersion: '0.1.0',
    })
    expect(defaults.temporaryRoot).toContain('talos-artifact-worker')

    expect(parseArtifactWorkerEnvironment({
      ARTIFACT_WORKER_TOKEN: TOKEN,
      ARTIFACT_WORKER_HOST: '0.0.0.0',
      ARTIFACT_WORKER_PORT: '4321',
      ARTIFACT_WORKER_TEMP_DIR: explicitTemporaryRoot,
      ARTIFACT_WORKER_BODY_LIMIT_BYTES: '2048',
      ARTIFACT_WORKER_HANDLER_TIMEOUT_MS: '60000',
      ARTIFACT_WORKER_MAX_CONCURRENT_GENERATIONS: '4',
    })).toMatchObject({
      host: '0.0.0.0',
      port: 4_321,
      temporaryRoot: explicitTemporaryRoot,
      bodyLimitBytes: 2_048,
      handlerTimeoutMs: 60_000,
      maxConcurrentGenerations: 4,
    })
  })

  it.each([
    [{}, 'ARTIFACT_WORKER_TOKEN'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_HOST: 'public.example.com' }, 'HOST'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_PORT: '0' }, 'PORT'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_PORT: '3200.5' }, 'PORT'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_BODY_LIMIT_BYTES: 'unbounded' }, 'BODY'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_HANDLER_TIMEOUT_MS: '-1' }, 'TIMEOUT'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_MAX_CONCURRENT_GENERATIONS: '0' }, 'CONCURRENT'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_MAX_CONCURRENT_GENERATIONS: '17' }, 'CONCURRENT'],
    [{ ARTIFACT_WORKER_TOKEN: TOKEN, ARTIFACT_WORKER_TEMP_DIR: ' ' }, 'TEMP'],
  ])('fails closed for invalid environment %#', (environment, message) => {
    expect(() => parseArtifactWorkerEnvironment(environment)).toThrow(message)
  })
})
