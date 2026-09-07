export type ArtifactWorkerFaultCode =
  | 'ARTIFACT_BODY_TOO_LARGE'
  | 'ARTIFACT_CANCELLED'
  | 'ARTIFACT_CAPACITY_EXCEEDED'
  | 'ARTIFACT_GENERATION_FAILED'
  | 'ARTIFACT_HANDLER_TIMEOUT'
  | 'ARTIFACT_INTERNAL_ERROR'
  | 'ARTIFACT_INVALID_JSON'
  | 'ARTIFACT_INVALID_REQUEST'
  | 'ARTIFACT_OUTPUT_TOO_LARGE'
  | 'ARTIFACT_REQUEST_ACTIVE'
  | 'ARTIFACT_REQUEST_NOT_ACTIVE'
  | 'ARTIFACT_TEMP_IO_FAILED'
  | 'ARTIFACT_UNAUTHORIZED'
  | 'ARTIFACT_UNSUPPORTED_MEDIA_TYPE'
  | 'ARTIFACT_VALIDATION_FAILED'

export class ArtifactWorkerFault extends Error {
  readonly code: ArtifactWorkerFaultCode
  readonly statusCode: number

  constructor(
    code: ArtifactWorkerFaultCode,
    message: string,
    options: { cause?: unknown; statusCode?: number } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ArtifactWorkerFault'
    this.code = code
    this.statusCode = options.statusCode ?? 422
  }
}
