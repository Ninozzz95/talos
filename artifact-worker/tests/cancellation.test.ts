import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GenerationRegistry } from '../src/cancellation/generationRegistry.js'
import { ArtifactWorkerFault } from '../src/errors.js'
import { generateArtifact } from '../src/generateArtifact.js'
import { TemporaryArtifactStore } from '../src/storage/temporaryArtifactStore.js'

const cleanupRoots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'talos-artifact-test-'))
  cleanupRoots.push(root)
  return root
}

async function pdfRequest(): Promise<unknown> {
  return {
    contract: 'talos.artifact.request.v1',
    request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
    format: 'pdf',
    filename: 'cancelled-report.pdf',
    document: {
      contract: 'talos.semantic_document.v1',
      title: 'Cancellation',
      locale: 'en-US',
      author: 'TALOS',
      sections: [{ type: 'paragraph', text: 'Bounded cancellation fixture' }],
    },
    limits: {
      max_output_bytes: 10_000_000,
      max_duration_ms: 30_000,
      max_sections: 10,
      max_rows: 10,
      max_slides: 10,
      max_input_pixels: 1_000_000,
    },
  }
}

afterEach(async () => {
  await Promise.all(cleanupRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('GenerationRegistry', () => {
  it('enforces one active owner and permits reuse only after terminal cleanup', () => {
    const registry = new GenerationRegistry()
    const lease = registry.begin('request-1', 10_000)

    expect(() => registry.begin('request-1', 10_000)).toThrowError(
      expect.objectContaining<Partial<ArtifactWorkerFault>>({ code: 'ARTIFACT_REQUEST_ACTIVE' }),
    )
    expect(registry.size).toBe(1)

    lease.finish()

    expect(registry.size).toBe(0)
    expect(() => registry.begin('request-1', 10_000).finish()).not.toThrow()
  })

  it('rejects excess unique owners and releases capacity only after terminal cleanup', () => {
    const registry = new GenerationRegistry(1)
    const active = registry.begin('request-1', 10_000)

    expect(() => registry.begin('request-1', 10_000)).toThrowError(
      expect.objectContaining<Partial<ArtifactWorkerFault>>({ code: 'ARTIFACT_REQUEST_ACTIVE' }),
    )
    expect(() => registry.begin('request-2', 10_000)).toThrowError(
      expect.objectContaining<Partial<ArtifactWorkerFault>>({
        code: 'ARTIFACT_CAPACITY_EXCEEDED',
      }),
    )
    expect(registry.size).toBe(1)

    active.finish()

    const admitted = registry.begin('request-2', 10_000)
    expect(registry.size).toBe(1)
    admitted.finish()
    expect(registry.size).toBe(0)
  })

  it('converges explicit cancellation and timeout on the owned signal', async () => {
    const registry = new GenerationRegistry()
    const cancelled = registry.begin('cancel-me', 10_000)

    expect(registry.cancel('cancel-me')).toBe(true)
    expect(cancelled.signal.aborted).toBe(true)
    expect(registry.cancel('unknown')).toBe(false)
    cancelled.finish()

    const timedOut = registry.begin('time-out', 10)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(timedOut.signal.aborted).toBe(true)
    timedOut.finish()
    expect(registry.size).toBe(0)
  })
})

describe('TemporaryArtifactStore', () => {
  it('uses generated private paths, atomic writes, and terminal cleanup', async () => {
    const root = await temporaryRoot()
    const store = new TemporaryArtifactStore(root)
    const lease = await store.createLease()
    const bytes = Buffer.from('%PDF-bounded')
    const path = await lease.writeArtifact('pdf', bytes)

    expect(relative(root, path).startsWith('..')).toBe(false)
    expect(basename(path)).toMatch(/^[a-f0-9-]+\.pdf$/)
    expect(dirname(path)).not.toBe(root)
    expect(await readFile(path)).toEqual(bytes)

    await lease.cleanup()

    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects unsupported output extensions before writing', async () => {
    const store = new TemporaryArtifactStore(await temporaryRoot())
    const lease = await store.createLease()

    await expect(lease.writeArtifact('exe' as never, Buffer.from('x'))).rejects.toMatchObject({
      code: 'ARTIFACT_TEMP_IO_FAILED',
    })
    await lease.cleanup()
  })
})

describe('generation cancellation boundary', () => {
  it('maps a pre-aborted signal to the controlled cancellation fault', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(generateArtifact(await pdfRequest(), { signal: controller.signal })).rejects.toMatchObject({
      code: 'ARTIFACT_CANCELLED',
    })
  })
})
