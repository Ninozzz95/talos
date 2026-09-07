import {
  ARTIFACT_MIME_BY_FORMAT_V1,
  ArtifactRequestV1,
  ArtifactResponseV1,
  type ArtifactRequest,
  type ArtifactResponse,
} from './contracts/artifactProtocol.js'
import type { SemanticDocument } from './contracts/semanticDocument.js'
import { ArtifactWorkerFault } from './errors.js'
import { generateDocx } from './formats/docxGenerator.js'
import { generatePdf } from './formats/pdfGenerator.js'
import { generatePptx } from './formats/pptxGenerator.js'
import { generateXlsx } from './formats/xlsxGenerator.js'
import { generateThumbnail } from './images/thumbnailGenerator.js'
import { validateArtifact } from './validation/artifactValidator.js'

export interface GenerateArtifactOptions {
  signal?: AbortSignal
}

function isCancelled(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true
}

function enforceRequestScopedLimits(request: ArtifactRequest): void {
  const document = request.document
  const rowCount = document.sections.reduce(
    (count, section) => count + (section.type === 'table' ? section.rows.length : 0),
    0,
  ) + (document.sheets ?? []).reduce((count, sheet) => count + sheet.rows.length, 0)

  if (
    document.sections.length > request.limits.max_sections
    || (document.slides?.length ?? 0) > request.limits.max_slides
    || rowCount > request.limits.max_rows
  ) {
    throw new ArtifactWorkerFault(
      'ARTIFACT_INVALID_REQUEST',
      'Semantic document exceeds the request-scoped structure limits',
    )
  }
}

async function generateBytes(
  request: ArtifactRequest,
  document: SemanticDocument,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (request.format === 'docx') {
    return generateDocx(document, signal)
  }
  if (request.format === 'pdf') {
    return generatePdf(document, signal)
  }
  if (request.format === 'pptx') {
    return generatePptx(document, signal)
  }
  if (request.format === 'xlsx') {
    return generateXlsx(document, signal)
  }
  return generateThumbnail(document, request.limits.max_input_pixels, signal)
}

export async function generateArtifact(
  input: unknown,
  options: GenerateArtifactOptions = {},
): Promise<ArtifactResponse> {
  const parsed = ArtifactRequestV1.safeParse(input)
  if (!parsed.success) {
    throw new ArtifactWorkerFault(
      'ARTIFACT_INVALID_REQUEST',
      'Artifact request does not match talos.artifact.request.v1',
    )
  }

  const request = parsed.data
  enforceRequestScopedLimits(request)
  if (isCancelled(options.signal)) {
    throw new ArtifactWorkerFault('ARTIFACT_CANCELLED', 'Artifact generation was cancelled')
  }

  let bytes: Buffer
  try {
    bytes = await generateBytes(request, request.document, options.signal)
  } catch (error) {
    if (error instanceof ArtifactWorkerFault) {
      throw error
    }
    if (options.signal?.aborted) {
      throw new ArtifactWorkerFault('ARTIFACT_CANCELLED', 'Artifact generation was cancelled')
    }
    throw new ArtifactWorkerFault(
      'ARTIFACT_GENERATION_FAILED',
      'Artifact generator could not produce the requested format',
      { cause: error },
    )
  }

  let validation: Awaited<ReturnType<typeof validateArtifact>>
  try {
    validation = await validateArtifact(bytes, request.format, request.limits, options.signal)
  } catch (error) {
    if (isCancelled(options.signal)) {
      throw new ArtifactWorkerFault('ARTIFACT_CANCELLED', 'Artifact generation was cancelled')
    }
    throw error
  }
  return ArtifactResponseV1.parse({
    contract: 'talos.artifact.response.v1',
    request_id: request.request_id,
    status: 'succeeded',
    format: request.format,
    mime_type: ARTIFACT_MIME_BY_FORMAT_V1[request.format],
    sha256: validation.sha256,
    byte_size: validation.byteSize,
    data_base64: bytes.toString('base64'),
    validation: {
      detected_mime: validation.detectedMime,
      reopened: validation.reopened,
    },
  })
}
