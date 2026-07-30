import { z } from 'zod'

export const ARTIFACT_HARD_LIMITS_V1 = Object.freeze({
  max_output_bytes: 25_000_000,
  max_duration_ms: 120_000,
  max_sections: 200,
  max_rows: 5_000,
  max_slides: 100,
  max_input_pixels: 16_000_000,
})

const boundedInteger = (maximum: number) => z.number().int().positive().max(maximum)

export const ArtifactLimitsV1 = z.strictObject({
  max_output_bytes: boundedInteger(ARTIFACT_HARD_LIMITS_V1.max_output_bytes),
  max_duration_ms: boundedInteger(ARTIFACT_HARD_LIMITS_V1.max_duration_ms),
  max_sections: boundedInteger(ARTIFACT_HARD_LIMITS_V1.max_sections),
  max_rows: boundedInteger(ARTIFACT_HARD_LIMITS_V1.max_rows),
  max_slides: boundedInteger(ARTIFACT_HARD_LIMITS_V1.max_slides),
  max_input_pixels: boundedInteger(ARTIFACT_HARD_LIMITS_V1.max_input_pixels),
})

export type ArtifactLimits = z.infer<typeof ArtifactLimitsV1>
