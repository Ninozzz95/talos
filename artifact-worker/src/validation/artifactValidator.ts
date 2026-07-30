import { createHash } from 'node:crypto'

import { fileTypeFromBuffer } from 'file-type'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import * as XLSX from 'xlsx'

import {
  ARTIFACT_MIME_BY_FORMAT_V1,
  type ArtifactFormat,
} from '../contracts/artifactProtocol.js'
import type { ArtifactLimits } from '../contracts/artifactLimits.js'
import { ArtifactWorkerFault } from '../errors.js'
import { reopenOfficeArtifact } from './officeReopenValidator.js'

export interface ArtifactValidationResult {
  byteSize: number
  detectedMime: string
  reopened: true
  sha256: string
}

export async function validateArtifact(
  bytes: Buffer,
  format: ArtifactFormat,
  limits: ArtifactLimits,
  signal?: AbortSignal,
): Promise<ArtifactValidationResult> {
  signal?.throwIfAborted()
  if (bytes.byteLength === 0) {
    throw new ArtifactWorkerFault('ARTIFACT_VALIDATION_FAILED', 'Generated artifact is empty')
  }
  if (bytes.byteLength > limits.max_output_bytes) {
    throw new ArtifactWorkerFault(
      'ARTIFACT_OUTPUT_TOO_LARGE',
      'Generated artifact exceeds the requested byte limit',
    )
  }

  const detected = await fileTypeFromBuffer(bytes)
  const expectedMime = ARTIFACT_MIME_BY_FORMAT_V1[format]
  if (detected?.mime !== expectedMime) {
    throw new ArtifactWorkerFault(
      'ARTIFACT_VALIDATION_FAILED',
      'Generated artifact MIME does not match the requested format',
    )
  }

  try {
    if (format === 'docx' || format === 'pptx') {
      await reopenOfficeArtifact(bytes, format, signal)
    } else if (format === 'pdf') {
      if ((await PDFDocument.load(bytes)).getPageCount() === 0) {
        throw new Error('PDF has no pages')
      }
    } else if (format === 'xlsx') {
      const workbook = XLSX.read(bytes, { type: 'buffer', cellFormula: true })
      if (workbook.SheetNames.length === 0) {
        throw new Error('Workbook has no worksheets')
      }
    } else {
      const metadata = await sharp(bytes, {
        failOn: 'warning',
        limitInputPixels: limits.max_input_pixels,
        sequentialRead: true,
      }).metadata()
      if ((metadata.pages ?? 1) !== 1 || metadata.format !== 'png') {
        throw new Error('Thumbnail must be a one-frame PNG')
      }
    }
  } catch (error) {
    if (error instanceof ArtifactWorkerFault) {
      throw error
    }
    throw new ArtifactWorkerFault(
      'ARTIFACT_VALIDATION_FAILED',
      'Generated artifact could not be reopened safely',
      { cause: error },
    )
  }

  return {
    byteSize: bytes.byteLength,
    detectedMime: expectedMime,
    reopened: true,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}
