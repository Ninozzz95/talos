import { createHash } from 'node:crypto'
import {
    HumanJourneyScenarioSchema,
    HumanObservationSchema,
    HumanTurnSchema,
    Tau2CreateTrialRequestSchema,
    Tau2ModelUnderTestSchema,
    Tau2NextTurnRequestSchema,
    type HumanJourneyScenario,
    type HumanObservation,
    type HumanTurn,
    type Tau2ModelUnderTest,
    type Tau2TerminalTurnResponse,
    type Tau2TurnResponse,
} from '../contracts'
import {
    Tau2SidecarFault,
    type Tau2SidecarTransport,
    type Tau2TrialHandle,
} from '../support/Tau2SidecarClient'
import type { HumanActor, HumanActorContext } from './HumanActor'

const MAX_VISIBLE_TARGET_URL_BYTES = 900

export interface Tau2HumanActorOptions {
    client: Tau2SidecarTransport
    ownerId: string
    modelUnderTest: Tau2ModelUnderTest
}

export interface Tau2HumanActorMetrics {
    turnCount: number
    promptTokens: number
    completionTokens: number
    providerTokens: number
    costUsd: number
    latencyMs: number
}

interface TrialIdentity {
    scenarioId: string
    seed: number
    trialIndex: number
}

export class Tau2HumanActor implements HumanActor {
    readonly mode = 'adaptive_simulator' as const
    readonly #client: Tau2SidecarTransport
    readonly #ownerId: string
    readonly #modelUnderTest: Tau2ModelUnderTest
    #handle?: Tau2TrialHandle
    #identity?: TrialIdentity
    #terminal = false
    #closed = false
    #metrics: Tau2HumanActorMetrics = {
        turnCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        providerTokens: 0,
        costUsd: 0,
        latencyMs: 0,
    }

    constructor(options: Tau2HumanActorOptions) {
        this.#client = options.client
        this.#ownerId = options.ownerId
        this.#modelUnderTest = Tau2ModelUnderTestSchema.parse(options.modelUnderTest)
    }

    async nextTurn(rawContext: HumanActorContext): Promise<HumanTurn> {
        if (this.#closed) throw new Tau2SidecarFault('TAU2_ACTOR_CLOSED', 'The adaptive human actor is closed.')
        if (this.#terminal) throw new Tau2SidecarFault('TAU2_TRIAL_TERMINAL', 'The adaptive human trial has ended.')

        const context = validateContext(rawContext)
        const assistantMessage = latestVisibleAssistantMessage(context.observation)
        if (assistantMessage === undefined) {
            throw new Tau2SidecarFault(
                'TAU2_OBSERVATION_MISSING_ASSISTANT',
                'The adaptive actor requires a visible assistant or system message.',
            )
        }

        const handle = await this.#trialFor(context)
        const request = Tau2NextTurnRequestSchema.parse({
            contract: 'talos.human_journey.tau2.next_turn',
            schema_version: 1,
            checkpoint_id: context.observation.checkpoint_id,
            assistant_message: assistantMessage,
            observation_sha256: `sha256:${context.observation.visible_state_sha256}`,
            created_at: context.createdAt,
        })
        const response = await this.#client.nextTurn(handle, request, context.signal)
        this.#recordMetrics(response)
        const turn = mapResponseToHumanTurn(context, response)
        if (response.kind === 'terminal') this.#terminal = true
        return turn
    }

    metrics(): Readonly<Tau2HumanActorMetrics> {
        return Object.freeze({ ...this.#metrics })
    }

    async close(): Promise<void> {
        if (this.#closed) return
        this.#closed = true
        const handle = this.#handle
        this.#handle = undefined
        if (handle === undefined) return
        try {
            if (this.#terminal) {
                await this.#client.delete(handle)
            } else {
                await this.#client.cancel(handle)
            }
        } catch (error) {
            if (!(error instanceof Tau2SidecarFault) || error.code !== 'SIDECAR_TRIAL_CLOSED') throw error
        }
    }

    async #trialFor(context: HumanActorContext): Promise<Tau2TrialHandle> {
        const identity = {
            scenarioId: context.scenario.id,
            seed: signedSeed(context.seed),
            trialIndex: context.trialIndex,
        }
        if (this.#handle !== undefined) {
            if (
                this.#identity?.scenarioId !== identity.scenarioId
                || this.#identity.seed !== identity.seed
                || this.#identity.trialIndex !== identity.trialIndex
            ) {
                throw new Tau2SidecarFault('TAU2_TRIAL_IDENTITY_CHANGED', 'An adaptive actor cannot switch trial identity.')
            }
            return this.#handle
        }

        const request = Tau2CreateTrialRequestSchema.safeParse({
            contract: 'talos.human_journey.tau2.create_trial',
            schema_version: 1,
            owner_id: this.#ownerId,
            trial_index: identity.trialIndex,
            seed: identity.seed,
            scenario: projectScenario(context.scenario, canonicalVisibleTargetUrl(context.visibleTargetUrl)),
            model_under_test: this.#modelUnderTest,
        })
        if (!request.success) {
            throw new Tau2SidecarFault('TAU2_SCENARIO_INVALID', 'The TALOS scenario cannot be projected into the adaptive simulator contract.')
        }
        this.#handle = await this.#client.createTrial(request.data, context.signal)
        this.#identity = identity
        return this.#handle
    }

    #recordMetrics(response: Tau2TurnResponse): void {
        const { prompt_tokens: promptTokens, completion_tokens: completionTokens, cost_usd: costUsd, latency_ms: latencyMs } = response.metrics
        this.#metrics = {
            turnCount: this.#metrics.turnCount + 1,
            promptTokens: this.#metrics.promptTokens + promptTokens,
            completionTokens: this.#metrics.completionTokens + completionTokens,
            providerTokens: this.#metrics.providerTokens + promptTokens + completionTokens,
            costUsd: this.#metrics.costUsd + costUsd,
            latencyMs: this.#metrics.latencyMs + latencyMs,
        }
    }
}

function validateContext(rawContext: HumanActorContext): HumanActorContext {
    const scenario = HumanJourneyScenarioSchema.parse(rawContext.scenario)
    const observation = HumanObservationSchema.parse(rawContext.observation)
    if (!Number.isInteger(rawContext.seed) || rawContext.seed < 0 || rawContext.seed > 0xffff_ffff) {
        throw new Tau2SidecarFault('TAU2_SEED_INVALID', 'Adaptive actor seed must be an unsigned 32-bit integer.')
    }
    if (!Number.isInteger(rawContext.trialIndex) || rawContext.trialIndex < 0 || rawContext.trialIndex > 1_000_000) {
        throw new Tau2SidecarFault('TAU2_TRIAL_INDEX_INVALID', 'Adaptive actor trial index is outside the supported range.')
    }
    if (observation.scenario_id !== scenario.id) {
        throw new Tau2SidecarFault('TAU2_SCENARIO_MISMATCH', 'The visible observation belongs to a different scenario.')
    }
    if (!scenario.checkpoints.some((checkpoint) => checkpoint.id === observation.checkpoint_id)) {
        throw new Tau2SidecarFault('TAU2_CHECKPOINT_UNKNOWN', 'The visible observation checkpoint is not in the scenario.')
    }
    return { ...rawContext, scenario, observation }
}

function projectScenario(scenario: HumanJourneyScenario, visibleTargetUrl: string | undefined) {
    const userFacts = [...scenario.user_facts]
    if (visibleTargetUrl !== undefined) {
        const targetFact = `The controlled target URL is ${visibleTargetUrl}.`
        if (!userFacts.includes(targetFact)) userFacts.push(targetFact)
    }
    return {
        scenario_id: scenario.id,
        goal: scenario.goal,
        user_facts: userFacts,
        persona: scenario.persona,
        allowed_actions: scenario.allowed_actions.filter((action): action is 'send_message' | 'end_trial' => (
            action === 'send_message' || action === 'end_trial'
        )),
        budgets: {
            max_turns: scenario.budgets.max_turns,
            max_provider_tokens: scenario.budgets.max_provider_tokens,
            max_cost_usd: scenario.budgets.max_cost_usd,
            max_duration_ms: scenario.budgets.max_duration_ms,
        },
    }
}

function canonicalVisibleTargetUrl(value: string | undefined): string | undefined {
    if (value === undefined) return undefined
    if (
        value === ''
        || value !== value.trim()
        || Buffer.byteLength(value, 'utf8') > MAX_VISIBLE_TARGET_URL_BYTES
    ) {
        throw new Tau2SidecarFault('TAU2_VISIBLE_TARGET_INVALID', 'The visible target URL is invalid or exceeds its bound.')
    }

    let target: URL
    try {
        target = new URL(value)
    } catch (error) {
        throw new Tau2SidecarFault('TAU2_VISIBLE_TARGET_INVALID', 'The visible target URL must be an absolute HTTP(S) URL.', {
            cause: error,
        })
    }
    if (!['http:', 'https:'].includes(target.protocol) || target.username !== '' || target.password !== '') {
        throw new Tau2SidecarFault('TAU2_VISIBLE_TARGET_INVALID', 'The visible target URL must use HTTP(S) without credentials.')
    }
    return target.toString()
}

function latestVisibleAssistantMessage(observation: HumanObservation): string | undefined {
    return [...observation.transcript]
        .reverse()
        .find((message) => message.role === 'assistant' || message.role === 'system')
        ?.content
}

function mapResponseToHumanTurn(context: HumanActorContext, response: Tau2TurnResponse): HumanTurn {
    if (response.kind === 'message') {
        if (!isActionAvailable(context, 'send_message')) {
            throw new Tau2SidecarFault('TAU2_ACTION_UNAVAILABLE', 'The simulator requested a message when sending is not visible and allowed.')
        }
        return HumanTurnSchema.parse({
            ...turnBase(context, response, response.content),
            action: 'send_message',
            message: response.content,
        })
    }

    if (!isActionAvailable(context, 'end_trial')) {
        throw new Tau2SidecarFault('TAU2_ACTION_UNAVAILABLE', 'The simulator ended a trial when termination is not visible and allowed.')
    }
    const outcome = humanTerminalOutcome(response.outcome)
    return HumanTurnSchema.parse({
        ...turnBase(context, response, `${outcome}:${response.reason}`),
        action: 'end_trial',
        outcome,
        reason: response.reason,
    })
}

function turnBase(context: HumanActorContext, response: Tau2TurnResponse, payload: string) {
    const digest = createHash('sha256').update(JSON.stringify({
        trial: context.observation.trial_id,
        checkpoint: context.observation.checkpoint_id,
        response: response.provider_response_sha256,
        turnIndex: response.turn_index,
        payload,
    })).digest('hex')
    return {
        contract: 'talos.human_journey.turn' as const,
        schema_version: 1 as const,
        turn_id: `turn-${digest.slice(0, 32)}`,
        checkpoint_id: context.observation.checkpoint_id,
        source: 'adaptive_simulator' as const,
        created_at: context.createdAt,
    }
}

function isActionAvailable(context: HumanActorContext, action: 'send_message' | 'end_trial'): boolean {
    return context.scenario.allowed_actions.includes(action)
        && context.observation.available_actions.some((available) => available.kind === action)
}

function humanTerminalOutcome(outcome: Tau2TerminalTurnResponse['outcome']): 'goal_reached' | 'blocked' | 'aborted' {
    if (outcome === 'goal_reached') return 'goal_reached'
    if (outcome === 'cancelled' || outcome === 'user_stopped') return 'aborted'
    return 'blocked'
}

function signedSeed(seed: number): number {
    return seed & 0x7fff_ffff
}
