import { createHash } from 'node:crypto'
import {
    DirectorCheckpointSchema,
    HumanJourneyScenarioSchema,
    HumanObservationSchema,
    HumanTurnSchema,
    type DirectorDecision,
    type HumanActionKind,
    type HumanObservation,
    type HumanTurn,
} from '../contracts'
import {
    DirectorSpool,
    DirectorSpoolError,
    hashDirectorValue,
} from '../support/directorSpool'
import type { HumanActor, HumanActorContext } from './HumanActor'

const MIN_TIMEOUT_MS = 100
const MAX_TIMEOUT_MS = 120_000

export interface DirectorActorOptions {
    spool: DirectorSpool
    timeoutMs: number
}

export interface DirectorAssistanceProvenance {
    requestId: string
    decisionId: string
    provider: string
    model: string
    configurationSha256: string
    category: DirectorDecision['category']
    requestSha256: string
    observationSha256: string
    createdAt: string
}

export interface DirectorResultFence {
    classification: 'discovery_assisted'
    promotionEligible: false
    provenance: DirectorAssistanceProvenance
}

export class DirectorActor implements HumanActor {
    readonly mode = 'agent_override' as const
    private readonly spool: DirectorSpool
    private readonly timeoutMs: number
    private resultFence: DirectorResultFence | null = null

    constructor(options: DirectorActorOptions) {
        if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < MIN_TIMEOUT_MS || options.timeoutMs > MAX_TIMEOUT_MS) {
            throw new Error(`Director actor timeout must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms.`)
        }
        this.spool = options.spool
        this.timeoutMs = options.timeoutMs
    }

    async nextTurn(rawContext: HumanActorContext): Promise<HumanTurn> {
        if (this.resultFence !== null) {
            throw new Error('Director actor accepts exactly one override decision per instance.')
        }
        const context: HumanActorContext = {
            ...rawContext,
            scenario: HumanJourneyScenarioSchema.parse(rawContext.scenario),
            observation: HumanObservationSchema.parse(rawContext.observation),
        }
        this.validateContext(context)

        const allowedActions = visibleAllowedActionKinds(context)
        if (allowedActions.length === 0) {
            throw new Error('Director actor has no visible non-recursive action available.')
        }
        const timeoutMs = Math.min(this.timeoutMs, context.observation.remaining_budget.duration_ms)
        if (timeoutMs < MIN_TIMEOUT_MS) {
            throw new Error('Director actor visible duration budget is exhausted.')
        }
        const requestId = directorRequestId(context)
        const createdAtMs = Date.parse(context.createdAt)
        const checkpoint = DirectorCheckpointSchema.parse({
            contract: 'talos.human_journey.director_checkpoint',
            schema_version: 1,
            request_id: requestId,
            trial_id: context.observation.trial_id,
            scenario_id: context.observation.scenario_id,
            checkpoint_id: context.observation.checkpoint_id,
            observation: context.observation,
            allowed_actions: allowedActions,
            remaining_budget: context.observation.remaining_budget,
            observation_sha256: hashDirectorValue(context.observation),
            created_at: context.createdAt,
            expires_at: new Date(createdAtMs + timeoutMs).toISOString(),
        })
        const request = await this.spool.publishCheckpoint(checkpoint)
        const decision = await this.spool.consumeDecision(request, {
            timeoutMs,
            signal: context.signal,
        })
        const turn = this.validateVisibleDecision(decision, context.observation, allowedActions)
        this.resultFence = {
            classification: 'discovery_assisted',
            promotionEligible: false,
            provenance: {
                requestId: decision.request_id,
                decisionId: decision.decision_id,
                provider: decision.director.provider,
                model: decision.director.model,
                configurationSha256: decision.director.configuration_sha256,
                category: decision.category,
                requestSha256: decision.request_sha256,
                observationSha256: decision.observation_sha256,
                createdAt: decision.created_at,
            },
        }

        return turn
    }

    getResultFence(): DirectorResultFence | null {
        return this.resultFence === null
            ? null
            : structuredClone(this.resultFence)
    }

    private validateContext(context: HumanActorContext): void {
        if (!Number.isInteger(context.seed) || context.seed < 0 || context.seed > 0xffff_ffff) {
            throw new Error('Director actor seed must be an unsigned 32-bit integer.')
        }
        if (!Number.isSafeInteger(context.trialIndex) || context.trialIndex < 0 || context.trialIndex > 1_000_000) {
            throw new Error('Director actor trial index is outside its bounded range.')
        }
        if (Number.isNaN(Date.parse(context.createdAt))) {
            throw new Error('Director actor createdAt must be an ISO timestamp.')
        }
        if (context.observation.scenario_id !== context.scenario.id) {
            throw new Error('Director observation scenario does not match the actor scenario.')
        }
        if (!context.scenario.checkpoints.some((checkpoint) => checkpoint.id === context.observation.checkpoint_id)) {
            throw new Error('Director observation checkpoint does not exist in the actor scenario.')
        }
        if (!context.scenario.allowed_actions.includes('request_director_override')) {
            throw new Error('Director override is not allowed by the scenario.')
        }
    }

    private validateVisibleDecision(
        rawDecision: DirectorDecision,
        observation: HumanObservation,
        allowedActions: HumanActionKind[],
    ): HumanTurn {
        const decision = rawDecision
        const turn = HumanTurnSchema.parse(decision.turn)
        if (!allowedActions.includes(turn.action)) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', `Director action is not visible and allowed: ${turn.action}.`)
        }
        if (turn.action === 'request_director_override') {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director cannot recursively request another override.')
        }
        if (turn.action === 'click_visible_control') {
            const visible = observation.available_actions.some((action) => (
                action.kind === 'click_visible_control'
                && action.control.role === turn.control.role
                && action.control.name === turn.control.name
                && action.control.exact === turn.control.exact
            ))
            if (!visible) {
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director click target is not an exact visible control.')
            }
        }
        if (turn.action === 'attach_fixture') {
            const available = observation.available_actions.some((action) => (
                action.kind === 'attach_fixture' && action.fixture_ids.includes(turn.fixture_id)
            ))
            if (!available) {
                throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director fixture is not available in the visible observation.')
            }
        }
        if (turn.action === 'wait_for_visible_state' && turn.timeout_ms > observation.remaining_budget.duration_ms) {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director wait exceeds the visible remaining duration budget.')
        }
        if (decision.category === 'return_control' && turn.action !== 'yield_to_simulator') {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director return_control category requires yield_to_simulator.')
        }
        if (turn.action === 'yield_to_simulator' && decision.category !== 'return_control') {
            throw new DirectorSpoolError('DIRECTOR_RESPONSE_BINDING_MISMATCH', 'Director yield_to_simulator requires return_control provenance.')
        }

        return turn
    }
}

function visibleAllowedActionKinds(context: HumanActorContext): HumanActionKind[] {
    const visible = new Set(context.observation.available_actions.map((action) => action.kind))
    return context.scenario.allowed_actions.filter((action) => (
        action !== 'request_director_override' && visible.has(action)
    ))
}

function directorRequestId(context: HumanActorContext): string {
    const digest = createHash('sha256').update(JSON.stringify({
        trialId: context.observation.trial_id,
        checkpointId: context.observation.checkpoint_id,
        visibleStateSha256: context.observation.visible_state_sha256,
        priorActionCount: context.observation.prior_actions.length,
        seed: context.seed,
        trialIndex: context.trialIndex,
    })).digest('hex')
    return `request-${digest.slice(0, 32)}`
}
