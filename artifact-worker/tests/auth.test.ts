import { describe, expect, it } from 'vitest'

import {
  assertWorkerTokenConfigured,
  verifyWorkerToken,
} from '../src/auth.js'

const expectedToken = 'artifact-worker-test-token-0123456789abcdef'

describe('worker bearer authentication', () => {
  it('accepts the configured token through the Authorization header', () => {
    expect(verifyWorkerToken(`Bearer ${expectedToken}`, expectedToken)).toBe(true)
    expect(verifyWorkerToken(`bearer ${expectedToken}`, expectedToken)).toBe(true)
  })

  it('rejects missing, malformed, duplicated, and incorrect credentials', () => {
    expect(verifyWorkerToken(undefined, expectedToken)).toBe(false)
    expect(verifyWorkerToken(expectedToken, expectedToken)).toBe(false)
    expect(verifyWorkerToken('Basic Zm9vOmJhcg==', expectedToken)).toBe(false)
    expect(verifyWorkerToken(`Bearer ${expectedToken}, Bearer other`, expectedToken)).toBe(false)
    expect(verifyWorkerToken('Bearer wrong', expectedToken)).toBe(false)
    expect(verifyWorkerToken(`Bearer ${expectedToken} `, expectedToken)).toBe(false)
  })

  it('fails closed when the configured token is absent or too short', () => {
    expect(() => assertWorkerTokenConfigured(undefined)).toThrowError('ARTIFACT_WORKER_TOKEN')
    expect(() => assertWorkerTokenConfigured('short')).toThrowError('at least 32 UTF-8 bytes')
    expect(assertWorkerTokenConfigured(expectedToken)).toBe(expectedToken)
  })
})
