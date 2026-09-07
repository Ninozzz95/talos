import { createHash, timingSafeEqual } from 'node:crypto'

const MINIMUM_TOKEN_BYTES = 32
const BEARER_HEADER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i
const TOKEN_VALUE = /^[A-Za-z0-9\-._~+/]+=*$/

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function assertWorkerTokenConfigured(token: string | undefined): string {
  if (token === undefined || token.length === 0) {
    throw new Error('ARTIFACT_WORKER_TOKEN is required')
  }

  if (!TOKEN_VALUE.test(token)) {
    throw new Error('ARTIFACT_WORKER_TOKEN must be a valid Bearer token value')
  }

  if (Buffer.byteLength(token, 'utf8') < MINIMUM_TOKEN_BYTES) {
    throw new Error('ARTIFACT_WORKER_TOKEN must contain at least 32 UTF-8 bytes')
  }

  return token
}

export function verifyWorkerToken(
  authorizationHeader: string | undefined,
  expectedToken: string,
): boolean {
  const configured = assertWorkerTokenConfigured(expectedToken)
  const match = authorizationHeader?.match(BEARER_HEADER)
  const presented = match?.[1] ?? ''

  return timingSafeEqual(digest(presented), digest(configured))
}
