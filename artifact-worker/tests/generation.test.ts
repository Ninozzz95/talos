import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { fileTypeFromBuffer } from 'file-type'
import { parseOffice } from 'officeparser'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import {
  ArtifactResponseV1,
  type ArtifactFormat,
} from '../src/contracts/artifactProtocol.js'
import { ArtifactWorkerFault } from '../src/errors.js'
import { generateArtifact } from '../src/generateArtifact.js'

const fixtureUrl = new URL('./fixtures/report.v1.json', import.meta.url)
const filenames: Record<ArtifactFormat, string> = {
  docx: 'verified-report.docx',
  pdf: 'verified-report.pdf',
  pptx: 'verified-report.pptx',
  xlsx: 'verified-report.xlsx',
  thumbnail: 'verified-report.png',
}

const expectedMime: Record<ArtifactFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  thumbnail: 'image/png',
}

async function request(format: ArtifactFormat, maxOutputBytes = 25_000_000): Promise<unknown> {
  return {
    contract: 'talos.artifact.request.v1',
    request_id: '019f9b4f-42c3-72f4-b5bb-8b237f98f7c2',
    format,
    filename: filenames[format],
    document: JSON.parse(await readFile(fixtureUrl, 'utf8')) as unknown,
    limits: {
      max_output_bytes: maxOutputBytes,
      max_duration_ms: 30_000,
      max_sections: 100,
      max_rows: 2_000,
      max_slides: 50,
      max_input_pixels: 16_000_000,
    },
  }
}

describe('generateArtifact', () => {
  it.each(Object.keys(filenames) as ArtifactFormat[])(
    'generates, identifies, hashes, and reopens %s bytes',
    async (format) => {
      const response = await generateArtifact(await request(format))
      const parsed = ArtifactResponseV1.parse(response)

      expect(parsed.status).toBe('succeeded')
      if (parsed.status !== 'succeeded') {
        throw new Error('Expected successful generation')
      }

      const bytes = Buffer.from(parsed.data_base64, 'base64')
      const detected = await fileTypeFromBuffer(bytes)

      expect(parsed.format).toBe(format)
      expect(parsed.mime_type).toBe(expectedMime[format])
      expect(parsed.validation).toEqual({
        detected_mime: expectedMime[format],
        reopened: true,
      })
      expect(parsed.byte_size).toBe(bytes.byteLength)
      expect(parsed.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
      expect(detected?.mime).toBe(expectedMime[format])

      if (format === 'pdf') {
        expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0)
      }

      if (format === 'docx' || format === 'pptx') {
        const ast = await parseOffice(bytes, {
          abortSignal: AbortSignal.timeout(10_000),
          ocr: false,
          extractAttachments: false,
          includeRawContent: false,
          decompressionLimits: {
            maxUncompressedBytes: 25_000_000,
            maxZipEntries: 2_000,
            maxTableCells: 100_000,
          },
        })
        expect(ast.toText()).toContain('日本語')
      }

      if (format === 'xlsx') {
        const workbook = XLSX.read(bytes, { type: 'buffer', cellFormula: true })
        const sheet = workbook.Sheets.Evidence

        expect(sheet).toBeDefined()
        expect(sheet?.B3?.v).toBe('=2+2')
        expect(sheet?.B3?.f).toBeUndefined()
      }

      if (format === 'thumbnail') {
        const metadata = await sharp(bytes, { failOn: 'warning', limitInputPixels: 16_000_000 }).metadata()
        expect(metadata).toMatchObject({ format: 'png', width: 1_200, height: 630 })
        expect(metadata.pages ?? 1).toBe(1)
      }
    },
    30_000,
  )

  it('rejects malformed semantic input before invoking a generator', async () => {
    const malformed = await request('pdf') as Record<string, unknown>
    malformed.document = { contract: 'talos.semantic_document.v1', html: '<script>x</script>' }

    await expect(generateArtifact(malformed)).rejects.toMatchObject({
      code: 'ARTIFACT_INVALID_REQUEST',
    })
  })

  it('rejects bytes that exceed the request output limit', async () => {
    await expect(generateArtifact(await request('pdf', 128))).rejects.toEqual(
      expect.objectContaining<Partial<ArtifactWorkerFault>>({
        code: 'ARTIFACT_OUTPUT_TOO_LARGE',
      }),
    )
  })
})
