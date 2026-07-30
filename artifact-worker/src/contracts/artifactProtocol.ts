import { z } from 'zod'

import { ArtifactLimitsV1 } from './artifactLimits.js'
import { SemanticDocumentV1 } from './semanticDocument.js'

export const ArtifactFormatV1 = z.enum(['docx', 'pdf', 'pptx', 'xlsx', 'thumbnail'])

export const ARTIFACT_MIME_BY_FORMAT_V1 = Object.freeze({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  thumbnail: 'image/png',
})

export const ARTIFACT_EXTENSION_BY_FORMAT_V1 = Object.freeze({
  docx: '.docx',
  pdf: '.pdf',
  pptx: '.pptx',
  xlsx: '.xlsx',
  thumbnail: '.png',
})

const safeFilename = z.string().min(1).max(160).superRefine((value, context) => {
  if (
    value !== value.trim()
    || value.includes('/')
    || value.includes('\\')
    || value === '.'
    || value === '..'
    || /[\u0000-\u001f\u007f]/.test(value)
    || /[. ]$/.test(value)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Filename must be a safe basename',
    })
  }
})

export const ArtifactRequestV1 = z.strictObject({
  contract: z.literal('talos.artifact.request.v1'),
  request_id: z.uuid(),
  format: ArtifactFormatV1,
  filename: safeFilename,
  document: SemanticDocumentV1,
  limits: ArtifactLimitsV1,
}).superRefine((value, context) => {
  const expectedExtension = ARTIFACT_EXTENSION_BY_FORMAT_V1[value.format]
  if (!value.filename.toLowerCase().endsWith(expectedExtension)) {
    context.addIssue({
      code: 'custom',
      path: ['filename'],
      message: `Filename must end in ${expectedExtension}`,
    })
  }
})

const validation = z.strictObject({
  detected_mime: z.string().min(1).max(160),
  reopened: z.boolean(),
})

const artifactSuccess = z.strictObject({
  contract: z.literal('talos.artifact.response.v1'),
  request_id: z.uuid(),
  status: z.literal('succeeded'),
  format: ArtifactFormatV1,
  mime_type: z.string().min(1).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byte_size: z.number().int().positive().max(25_000_000),
  data_base64: z.string().min(1),
  validation,
}).superRefine((value, context) => {
  if (value.mime_type !== ARTIFACT_MIME_BY_FORMAT_V1[value.format]) {
    context.addIssue({
      code: 'custom',
      path: ['mime_type'],
      message: 'MIME type does not match artifact format',
    })
  }
})

const artifactFailure = z.strictObject({
  contract: z.literal('talos.artifact.response.v1'),
  request_id: z.uuid(),
  status: z.literal('failed'),
  error: z.strictObject({
    code: z.string().regex(/^ARTIFACT_[A-Z0-9_]+$/),
    message: z.string().min(1).max(500),
  }),
})

export const ArtifactResponseV1 = z.discriminatedUnion('status', [
  artifactSuccess,
  artifactFailure,
])

export const ArtifactWorkerReadinessV1 = z.strictObject({
  contract: z.literal('talos.artifact.readiness.v1'),
  status: z.enum(['ready', 'degraded']),
  worker_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  protocol_version: z.literal(1),
  formats: z.array(ArtifactFormatV1).min(1).max(5),
  limits: ArtifactLimitsV1,
})

export const ArtifactProblemV1 = z.strictObject({
  type: z.string().regex(/^urn:talos:artifact-worker:problem:[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  status: z.number().int().min(400).max(599),
  detail: z.string().min(1).max(500),
  code: z.string().regex(/^ARTIFACT_[A-Z0-9_]+$/),
  request_id: z.uuid().optional(),
})

export const ArtifactCancellationV1 = z.strictObject({
  contract: z.literal('talos.artifact.cancellation.v1'),
  request_id: z.uuid(),
  status: z.literal('cancellation_requested'),
})

export type ArtifactRequest = z.infer<typeof ArtifactRequestV1>
export type ArtifactResponse = z.infer<typeof ArtifactResponseV1>
export type ArtifactWorkerReadiness = z.infer<typeof ArtifactWorkerReadinessV1>
export type ArtifactFormat = z.infer<typeof ArtifactFormatV1>
