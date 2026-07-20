import { z } from 'zod'
import {
    HumanTurnSchema,
    Tau2ModelUnderTestSchema,
} from '../contracts'

export const AdaptivePersonaIdSchema = z.enum([
    'novice_it',
    'hurried_typo_it',
    'skeptical_it',
    'expert_it',
    'ambiguous_it',
])
export type AdaptivePersonaId = z.infer<typeof AdaptivePersonaIdSchema>

export const AdaptiveTrialRecordSchema = z.strictObject({
    contract: z.literal('talos.human_journey.adaptive_trial'),
    schema_version: z.literal(1),
    run_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    project: z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    trial_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    scenario_id: z.string().min(1).max(128).regex(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/),
    persona_id: AdaptivePersonaIdSchema,
    trial_round: z.int().min(1).max(25),
    seed: z.int().min(0).max(0xffff_ffff),
    status: z.enum(['passed', 'failed']),
    model_under_test: Tau2ModelUnderTestSchema,
    metrics: z.strictObject({
        turnCount: z.int().min(0).max(64),
        promptTokens: z.int().min(0).max(2_000_000),
        completionTokens: z.int().min(0).max(2_000_000),
        providerTokens: z.int().min(0).max(2_000_000),
        costUsd: z.number().min(0).max(1_000),
        latencyMs: z.int().min(0).max(900_000),
    }),
    unrecorded_provider_turn_count: z.int().min(0).max(64),
    turns: z.array(HumanTurnSchema).max(64),
    started_at: z.iso.datetime(),
    finished_at: z.iso.datetime(),
    duration_ms: z.int().min(0).max(900_000),
    failure: z.strictObject({
        code: z.string().min(1).max(128).regex(/^[A-Z][A-Z0-9_]{2,127}$/),
        message: z.string().min(1).max(2_000),
    }).nullable(),
}).superRefine((value, context) => {
    const unrecordedProviderTurns = value.metrics.turnCount - value.turns.length
    if (unrecordedProviderTurns < 0) {
        context.addIssue({ code: 'custom', message: 'Recorded adaptive actions cannot exceed consumed provider responses.' })
    }
    if (value.unrecorded_provider_turn_count !== unrecordedProviderTurns) {
        context.addIssue({ code: 'custom', message: 'Adaptive unrecorded provider turn count is inconsistent.' })
    }
    if (value.status === 'passed' && unrecordedProviderTurns !== 0) {
        context.addIssue({ code: 'custom', message: 'Passing adaptive trials require exact provider-response and action parity.' })
    }
    if ((value.status === 'passed') !== (value.failure === null)) {
        context.addIssue({ code: 'custom', message: 'Passing adaptive trials cannot carry a failure.' })
    }
    if (Date.parse(value.finished_at) < Date.parse(value.started_at)) {
        context.addIssue({ code: 'custom', message: 'Adaptive finished_at cannot precede started_at.' })
    }
})

export type AdaptiveTrialRecord = z.infer<typeof AdaptiveTrialRecordSchema>
