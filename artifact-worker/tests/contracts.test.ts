import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  ArtifactRequestV1,
  ArtifactCancellationV1,
  ArtifactProblemV1,
  ArtifactResponseV1,
  ArtifactWorkerReadinessV1,
} from '../src/contracts/artifactProtocol.js'
import { ArtifactLimitsV1 } from '../src/contracts/artifactLimits.js'
import { SemanticDocumentV1 } from '../src/contracts/semanticDocument.js'

const fixtureUrl = new URL('./fixtures/report.v1.json', import.meta.url)

async function fixture(): Promise<unknown> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'))
}

function request(document: unknown): Record<string, unknown> {
  return {
    contract: 'talos.artifact.request.v1',
    request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
    format: 'pdf',
    filename: 'quarterly-report.pdf',
    document,
    limits: {
      max_output_bytes: 10_000_000,
      max_duration_ms: 30_000,
      max_sections: 100,
      max_rows: 2_000,
      max_slides: 50,
      max_input_pixels: 16_000_000
    }
  }
}

describe('SemanticDocumentV1', () => {
  it('accepts the canonical bounded report fixture', async () => {
    const result = SemanticDocumentV1.safeParse(await fixture())

    expect(result.success).toBe(true)
  })

  it('rejects unknown keys and executable markup', async () => {
    const document = await fixture() as Record<string, unknown>

    expect(SemanticDocumentV1.safeParse({ ...document, html: '<script>alert(1)</script>' }).success).toBe(false)
    expect(SemanticDocumentV1.safeParse({ ...document, sections: [{ type: 'html', html: '<b>x</b>' }] }).success).toBe(false)
  })

  it('rejects empty and excessive document structures', async () => {
    const document = await fixture() as Record<string, unknown>

    expect(SemanticDocumentV1.safeParse({ ...document, sections: [] }).success).toBe(false)
    expect(SemanticDocumentV1.safeParse({
      ...document,
      sections: Array.from({ length: 201 }, () => ({ type: 'paragraph', text: 'bounded' })),
    }).success).toBe(false)
  })

  it('rejects worksheet formulas as executable formula cells', async () => {
    const document = await fixture() as Record<string, unknown>

    expect(SemanticDocumentV1.safeParse({
      ...document,
      sheets: [{
        name: 'Unsafe',
        columns: ['Value'],
        rows: [[{ formula: 'SUM(A1:A2)' }]],
      }],
    }).success).toBe(false)
  })
})

describe('ArtifactLimitsV1', () => {
  it('accepts finite limits within hard caps', () => {
    expect(ArtifactLimitsV1.safeParse(request({}).limits).success).toBe(true)
  })

  it('rejects zero, negative, and above-cap values', () => {
    const valid = request({}).limits as Record<string, number>

    expect(ArtifactLimitsV1.safeParse({ ...valid, max_output_bytes: 0 }).success).toBe(false)
    expect(ArtifactLimitsV1.safeParse({ ...valid, max_duration_ms: -1 }).success).toBe(false)
    expect(ArtifactLimitsV1.safeParse({ ...valid, max_input_pixels: 100_000_000 }).success).toBe(false)
  })
})

describe('ArtifactRequestV1', () => {
  it('accepts a canonical request and rejects unsafe filenames', async () => {
    const canonical = request(await fixture())

    expect(ArtifactRequestV1.safeParse(canonical).success).toBe(true)
    expect(ArtifactRequestV1.safeParse({ ...canonical, filename: '../report.pdf' }).success).toBe(false)
    expect(ArtifactRequestV1.safeParse({ ...canonical, filename: 'folder/report.pdf' }).success).toBe(false)
    expect(ArtifactRequestV1.safeParse({ ...canonical, extra: true }).success).toBe(false)
  })

  it('requires the filename extension to match the requested format', async () => {
    const canonical = request(await fixture())

    expect(ArtifactRequestV1.safeParse({ ...canonical, format: 'docx', filename: 'report.pdf' }).success).toBe(false)
  })
})

describe('worker response contracts', () => {
  it('accepts strict success and readiness envelopes', () => {
    const response = {
      contract: 'talos.artifact.response.v1',
      request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
      status: 'succeeded',
      format: 'pdf',
      mime_type: 'application/pdf',
      sha256: 'a'.repeat(64),
      byte_size: 128,
      data_base64: Buffer.from('%PDF-test').toString('base64'),
      validation: {
        detected_mime: 'application/pdf',
        reopened: true
      }
    }
    const readiness = {
      contract: 'talos.artifact.readiness.v1',
      status: 'ready',
      worker_version: '0.1.0',
      protocol_version: 1,
      formats: ['docx', 'pdf', 'pptx', 'xlsx', 'thumbnail'],
      limits: {
        max_output_bytes: 25_000_000,
        max_duration_ms: 120_000,
        max_sections: 200,
        max_rows: 5_000,
        max_slides: 100,
        max_input_pixels: 16_000_000
      }
    }

    expect(ArtifactResponseV1.safeParse(response).success).toBe(true)
    expect(ArtifactWorkerReadinessV1.safeParse(readiness).success).toBe(true)
    expect(ArtifactResponseV1.safeParse({ ...response, temp_path: 'C:\\secret' }).success).toBe(false)
  })

  it('accepts strict cancellation and RFC 9457 problem envelopes', () => {
    const cancellation = {
      contract: 'talos.artifact.cancellation.v1',
      request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
      status: 'cancellation_requested',
    }
    const problem = {
      type: 'urn:talos:artifact-worker:problem:invalid-request',
      title: 'Invalid artifact request',
      status: 422,
      detail: 'The request does not match the artifact contract.',
      code: 'ARTIFACT_INVALID_REQUEST',
      request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
    }

    expect(ArtifactCancellationV1.safeParse(cancellation).success).toBe(true)
    expect(ArtifactProblemV1.safeParse(problem).success).toBe(true)
    expect(ArtifactProblemV1.safeParse({ ...problem, stack: 'secret path' }).success).toBe(false)
  })
})
