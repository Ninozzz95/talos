import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { ArtifactProblemV1, ArtifactResponseV1, ArtifactWorkerReadinessV1 } from '../dist/contracts/artifactProtocol.js'
import { ARTIFACT_HARD_LIMITS_V1 } from '../dist/contracts/artifactLimits.js'
import { validateArtifact } from '../dist/validation/artifactValidator.js'

const FORMAT_FIXTURES = Object.freeze([
  { format: 'docx', filename: 'talos-runtime-probe.docx' },
  { format: 'pdf', filename: 'talos-runtime-probe.pdf' },
  { format: 'pptx', filename: 'talos-runtime-probe.pptx' },
  { format: 'xlsx', filename: 'talos-runtime-probe.xlsx' },
  { format: 'thumbnail', filename: 'talos-runtime-probe.png' },
])
const REQUEST_TIMEOUT_MS = 180_000

function requiredEnvironment(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`)
  }
  return value
}

function endpointUrl(path) {
  const endpoint = new URL(requiredEnvironment('ARTIFACT_WORKER_PROBE_URL'))
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username !== '' || endpoint.password !== '') {
    throw new Error('ARTIFACT_WORKER_PROBE_URL must be an HTTP(S) URL without credentials')
  }
  return new URL(path, endpoint)
}

async function fetchWithDeadline(path, options = {}) {
  return fetch(endpointUrl(path), {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

async function proveReadiness(token) {
  const unauthenticated = await fetchWithDeadline('/ready')
  const unauthenticatedProblem = ArtifactProblemV1.parse(await unauthenticated.json())
  if (
    unauthenticated.status !== 401
    || unauthenticatedProblem.code !== 'ARTIFACT_UNAUTHORIZED'
  ) {
    throw new Error('Unauthenticated readiness did not fail closed')
  }

  const authenticated = await fetchWithDeadline('/ready', {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!authenticated.ok) {
    throw new Error(`Authenticated readiness failed with HTTP ${authenticated.status}`)
  }
  return ArtifactWorkerReadinessV1.parse(await authenticated.json())
}

async function proveFormat(token, document, fixture) {
  const requestId = randomUUID()
  const response = await fetchWithDeadline('/generate', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contract: 'talos.artifact.request.v1',
      request_id: requestId,
      format: fixture.format,
      filename: fixture.filename,
      document,
      limits: ARTIFACT_HARD_LIMITS_V1,
    }),
  })
  if (!response.ok) {
    const problem = ArtifactProblemV1.parse(await response.json())
    throw new Error(`${fixture.format} failed with HTTP ${response.status} ${problem.code}`)
  }

  const artifact = ArtifactResponseV1.parse(await response.json())
  if (
    artifact.status !== 'succeeded'
    || artifact.request_id !== requestId
    || artifact.format !== fixture.format
  ) {
    throw new Error(`${fixture.format} returned an inconsistent success envelope`)
  }

  const bytes = Buffer.from(artifact.data_base64, 'base64')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (bytes.byteLength !== artifact.byte_size || sha256 !== artifact.sha256) {
    throw new Error(`${fixture.format} response integrity metadata does not match its bytes`)
  }

  const validation = await validateArtifact(bytes, fixture.format, ARTIFACT_HARD_LIMITS_V1)
  if (
    validation.sha256 !== artifact.sha256
    || validation.byteSize !== artifact.byte_size
    || validation.detectedMime !== artifact.validation.detected_mime
    || artifact.validation.reopened !== true
  ) {
    throw new Error(`${fixture.format} validation evidence is inconsistent`)
  }

  return {
    format: fixture.format,
    byte_size: artifact.byte_size,
    sha256: artifact.sha256,
    detected_mime: validation.detectedMime,
    reopened: validation.reopened,
  }
}

async function main() {
  const token = requiredEnvironment('ARTIFACT_WORKER_PROBE_TOKEN')
  const document = JSON.parse(
    await readFile(new URL('../tests/fixtures/report.v1.json', import.meta.url), 'utf8'),
  )
  const readiness = await proveReadiness(token)
  const artifacts = []
  for (const fixture of FORMAT_FIXTURES) {
    artifacts.push(await proveFormat(token, document, fixture))
  }

  process.stdout.write(`${JSON.stringify({
    contract: 'talos.artifact.runtime_probe.v1',
    status: 'passed',
    worker_version: readiness.worker_version,
    protocol_version: readiness.protocol_version,
    artifacts,
  })}\n`)
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : 'Unknown runtime probe failure'
  process.stderr.write(`ARTIFACT_RUNTIME_PROBE_FAILED: ${detail}\n`)
  process.exitCode = 1
})
