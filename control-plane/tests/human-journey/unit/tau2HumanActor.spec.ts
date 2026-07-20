import { expect, test } from '@playwright/test'
import {
    HumanJourneyScenarioSchema,
    HumanObservationSchema,
    Tau2CreateTrialRequestSchema,
    Tau2NextTurnRequestSchema,
    type HumanJourneyScenario,
    type HumanObservation,
    type Tau2CreateTrialRequest,
    type Tau2NextTurnRequest,
    type Tau2TerminalTurnResponse,
    type Tau2TurnResponse,
} from '../contracts'
import { Tau2HumanActor } from '../actors/Tau2HumanActor'
import {
    Tau2SidecarClient,
    Tau2SidecarFault,
    type Tau2SidecarTransport,
    type Tau2TrialHandle,
} from '../support/Tau2SidecarClient'

const timestamp = '2026-07-20T12:00:01.000Z'
const processToken = 'p'.repeat(32)
const trialToken = 'fixture-trial-token-000000000001'

function scenario(allowedActions: HumanJourneyScenario['allowed_actions'] = ['send_message', 'end_trial']): HumanJourneyScenario {
    return HumanJourneyScenarioSchema.parse({
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id: 'BROWSER-NATURAL-001',
        title: 'Adaptive browser journey',
        goal: 'Inspect a controlled page and retain grounded browser evidence.',
        user_facts: ['The user knows the visible target URL.'],
        persona: {
            id: 'hurried_typo_it',
            language: 'it-IT',
            traits: ['hurried', 'typo_prone', 'ambiguous'],
        },
        initial_state: {
            route: '/chat',
            authenticated: true,
            browse_enabled: true,
            conversation: [],
            fixture_ids: [],
        },
        allowed_actions: allowedActions,
        checkpoints: [{
            id: 'browse-enabled',
            description: 'Browse is visibly enabled.',
            required_visible_outcomes: ['Browse is visibly active.'],
            acceptable_alternatives: [],
            timeout_ms: 15_000,
        }],
        forbidden_outcomes: [{
            id: 'no-fabricated-evidence',
            description: 'No screenshot claim without rendered evidence.',
        }],
        budgets: {
            max_turns: 16,
            max_tool_calls: 12,
            max_duration_ms: 180_000,
            max_provider_tokens: 12_000,
            max_cost_usd: 2,
        },
        perturbations: [],
        graders: [{
            id: 'conversation-continuity',
            kind: 'conversation_continuity',
            expected_outcome: 'Visible context survives follow-up turns.',
            required: true,
        }],
        semantic_rubric: null,
        cleanup: {
            strategy: 'isolated_run',
            preserve_failure_evidence: true,
            max_retention_days: 7,
        },
    })
}

function observation(overrides: Partial<HumanObservation> = {}): HumanObservation {
    return HumanObservationSchema.parse({
        contract: 'talos.human_journey.observation',
        schema_version: 1,
        trial_id: 'browser-trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        checkpoint_id: 'browse-enabled',
        route: '/chat',
        transcript: [{
            role: 'assistant',
            content: 'La pagina e pronta. Come vuoi procedere?',
            occurred_at: timestamp,
        }],
        visible_regions: [{ role: 'main', name: 'TALOS chat', text: 'La pagina e pronta.' }],
        available_actions: [
            { kind: 'send_message', label: 'Send message' },
            { kind: 'end_trial', label: 'End trial' },
        ],
        available_fixtures: [],
        prior_actions: [],
        remaining_budget: {
            turns: 16,
            tool_calls: 12,
            duration_ms: 180_000,
            provider_tokens: 12_000,
            cost_usd: 2,
        },
        captured_at: timestamp,
        visible_state_sha256: 'a'.repeat(64),
        ...overrides,
    })
}

function createRequest(): Tau2CreateTrialRequest {
    return Tau2CreateTrialRequestSchema.parse({
        contract: 'talos.human_journey.tau2.create_trial',
        schema_version: 1,
        owner_id: 'hj_contract_fixture_001',
        trial_index: 0,
        seed: 42,
        scenario: {
            scenario_id: 'BROWSER-NATURAL-001',
            goal: 'Inspect a controlled page.',
            user_facts: ['The user knows the visible target URL.'],
            persona: { id: 'hurried_typo_it', language: 'it-IT', traits: ['hurried'] },
            allowed_actions: ['send_message', 'end_trial'],
            budgets: {
                max_turns: 16,
                max_provider_tokens: 12_000,
                max_cost_usd: 2,
                max_duration_ms: 180_000,
            },
        },
        model_under_test: {
            provider_id: 'talos-fixture-provider',
            model: 'talos-fixture-model',
            endpoint_sha256: `sha256:${'b'.repeat(64)}`,
        },
    })
}

function nextRequest(): Tau2NextTurnRequest {
    return Tau2NextTurnRequestSchema.parse({
        contract: 'talos.human_journey.tau2.next_turn',
        schema_version: 1,
        checkpoint_id: 'browse-enabled',
        assistant_message: 'La pagina e pronta.',
        observation_sha256: `sha256:${'a'.repeat(64)}`,
        created_at: timestamp,
    })
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

function messageResponse(turnIndex = 1): Tau2TurnResponse {
    return {
        contract: 'talos.human_journey.tau2.turn_response',
        schema_version: 1,
        kind: 'message',
        turn_index: turnIndex,
        content: 'riprova col link di prima',
        metrics: { prompt_tokens: 10, completion_tokens: 6, cost_usd: 0.001, latency_ms: 20 },
        provider_response_sha256: `sha256:${'c'.repeat(64)}`,
    }
}

function terminalResponse(outcome: Tau2TerminalTurnResponse['outcome'] = 'goal_reached'): Tau2TerminalTurnResponse {
    return {
        contract: 'talos.human_journey.tau2.turn_response',
        schema_version: 1,
        kind: 'terminal',
        turn_index: 2,
        outcome,
        reason: 'The adaptive user reached a terminal state.',
        metrics: { prompt_tokens: 10, completion_tokens: 2, cost_usd: 0.001, latency_ms: 20 },
        provider_response_sha256: `sha256:${'d'.repeat(64)}`,
    }
}

test('sidecar client accepts only an exact loopback origin and a bounded process token', () => {
    expect(() => new Tau2SidecarClient({ baseUrl: 'http://localhost:43123', bearerToken: processToken })).toThrow(/127\.0\.0\.1/i)
    expect(() => new Tau2SidecarClient({ baseUrl: 'http://127.0.0.1:43123/path', bearerToken: processToken })).toThrow(/origin/i)
    expect(() => new Tau2SidecarClient({ baseUrl: 'http://127.0.0.1:43123', bearerToken: 'short' })).toThrow(/token/i)
})

test('sidecar client sends process and trial auth without exposing the raw trial token', async () => {
    const requests: Array<{ url: string, init: RequestInit }> = []
    const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}) => {
        requests.push({ url: String(input), init })
        if (requests.length === 1) {
            return jsonResponse({
                contract: 'talos.human_journey.tau2.trial_created',
                schema_version: 1,
                trial_id: 'trial_fixture_001',
                trial_token: trialToken,
                status: 'ready',
                max_turns: 16,
            }, 201)
        }
        return jsonResponse(messageResponse())
    }
    const client = new Tau2SidecarClient({
        baseUrl: 'http://127.0.0.1:43123',
        bearerToken: processToken,
        fetchImpl: fetchImpl as typeof fetch,
    })

    const handle = await client.createTrial(createRequest())
    const response = await client.nextTurn(handle, nextRequest())

    expect(response.kind).toBe('message')
    expect(JSON.stringify(handle)).not.toContain(trialToken)
    expect(new Headers(requests[0]!.init.headers).get('authorization')).toBe(`Bearer ${processToken}`)
    expect(new Headers(requests[0]!.init.headers).has('x-talos-trial-token')).toBe(false)
    expect(new Headers(requests[1]!.init.headers).get('x-talos-trial-token')).toBe(trialToken)
    expect(requests.every((request) => request.init.redirect === 'error')).toBe(true)
})

test('cancelled adaptive trials are deleted before local handle invalidation and cannot exhaust sidecar capacity', async () => {
    const requests: Array<{ url: string, init: RequestInit }> = []
    const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
        const url = String(input)
        requests.push({ url, init })
        if (url.endsWith('/v1/trials')) {
            return jsonResponse({
                contract: 'talos.human_journey.tau2.trial_created',
                schema_version: 1,
                trial_id: 'trial_fixture_001',
                trial_token: trialToken,
                status: 'ready',
                max_turns: 16,
            }, 201)
        }
        if (url.endsWith('/cancel')) return jsonResponse(terminalResponse('cancelled'))
        if (init.method === 'DELETE') return new Response(null, { status: 204 })
        throw new Error(`Unexpected sidecar request: ${init.method} ${url}`)
    }
    const client = new Tau2SidecarClient({
        baseUrl: 'http://127.0.0.1:43123',
        bearerToken: processToken,
        fetchImpl: fetchImpl as typeof fetch,
    })
    const handle = await client.createTrial(createRequest())

    await client.cancel(handle)

    expect(requests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`)).toEqual([
        'POST /v1/trials',
        'POST /v1/trials/trial_fixture_001/cancel',
        'DELETE /v1/trials/trial_fixture_001',
    ])
    await expect(client.nextTurn(handle, nextRequest())).rejects.toMatchObject({ code: 'SIDECAR_TRIAL_CLOSED' })
})

test('aborted sidecar turn performs one bounded cancel and never reuses the trial token', async () => {
    const requests: Array<{ url: string, init: RequestInit }> = []
    const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
        const url = String(input)
        requests.push({ url, init })
        if (url.endsWith('/v1/trials')) {
            return jsonResponse({
                contract: 'talos.human_journey.tau2.trial_created',
                schema_version: 1,
                trial_id: 'trial_fixture_001',
                trial_token: trialToken,
                status: 'ready',
                max_turns: 16,
            }, 201)
        }
        if (url.endsWith('/turns')) {
            return new Promise((_resolve, reject) => {
                const signal = init.signal
                if (signal?.aborted) {
                    reject(signal.reason)
                    return
                }
                signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
            })
        }
        if (init.method === 'DELETE') return new Response(null, { status: 204 })
        return jsonResponse(terminalResponse('cancelled'))
    }
    const client = new Tau2SidecarClient({
        baseUrl: 'http://127.0.0.1:43123',
        bearerToken: processToken,
        fetchImpl: fetchImpl as typeof fetch,
        requestTimeoutMs: 2_000,
    })
    const handle = await client.createTrial(createRequest())
    const controller = new AbortController()
    const pending = client.nextTurn(handle, nextRequest(), controller.signal)

    await Promise.resolve()
    controller.abort(new DOMException('human journey stopped', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ code: 'SIDECAR_ABORTED' })

    const callsAfterCancel = requests.length
    await expect(client.nextTurn(handle, nextRequest())).rejects.toMatchObject({ code: 'SIDECAR_TRIAL_CLOSED' })
    expect(requests).toHaveLength(callsAfterCancel)
    expect(requests.filter((request) => request.url.endsWith('/cancel'))).toHaveLength(1)
    expect(requests.filter((request) => request.init.method === 'DELETE')).toHaveLength(1)
    expect(requests.filter((request) => (
        new Headers(request.init.headers).get('x-talos-trial-token') === trialToken
    ))).toHaveLength(3)
})

class FakeTau2Transport implements Tau2SidecarTransport {
    readonly handle: Tau2TrialHandle = Object.freeze({ trialId: 'trial_fixture_001', maxTurns: 16 })
    readonly createRequests: Tau2CreateTrialRequest[] = []
    readonly nextRequests: Tau2NextTurnRequest[] = []
    response: Tau2TurnResponse = messageResponse()
    cancelCount = 0
    deleteCount = 0

    async createTrial(request: Tau2CreateTrialRequest): Promise<Tau2TrialHandle> {
        this.createRequests.push(request)
        return this.handle
    }

    async nextTurn(_handle: Tau2TrialHandle, request: Tau2NextTurnRequest): Promise<Tau2TurnResponse> {
        this.nextRequests.push(request)
        return this.response
    }

    async cancel(): Promise<Tau2TerminalTurnResponse | undefined> {
        this.cancelCount += 1
        return terminalResponse('cancelled')
    }

    async delete(): Promise<void> {
        this.deleteCount += 1
    }

    async close(): Promise<void> {}
}

function actorContext(observed = observation(), selectedScenario = scenario()) {
    return {
        scenario: selectedScenario,
        observation: observed,
        seed: 42,
        trialIndex: 0,
        createdAt: timestamp,
        visibleTargetUrl: 'https://example.test/catalog',
    }
}

test('Tau2HumanActor emits only adaptive send_message or end_trial from visible observation', async () => {
    const transport = new FakeTau2Transport()
    const actor = new Tau2HumanActor({
        client: transport,
        ownerId: 'hj_contract_fixture_001',
        modelUnderTest: createRequest().model_under_test,
    })

    const message = await actor.nextTurn(actorContext())
    expect(message).toMatchObject({ action: 'send_message', source: 'adaptive_simulator', message: 'riprova col link di prima' })
    expect(transport.createRequests).toHaveLength(1)
    expect(transport.createRequests[0]?.scenario.allowed_actions).toEqual(['send_message', 'end_trial'])
    expect(transport.nextRequests[0]).toMatchObject({
        assistant_message: 'La pagina e pronta. Come vuoi procedere?',
        observation_sha256: `sha256:${'a'.repeat(64)}`,
    })
    expect(JSON.stringify(message)).not.toMatch(/selector|xpath|tool_command|api_key|trial_token/i)

    transport.response = terminalResponse('out_of_scope')
    const terminal = await actor.nextTurn(actorContext())
    expect(terminal).toMatchObject({ action: 'end_trial', source: 'adaptive_simulator', outcome: 'blocked' })
    await actor.close()
    expect(transport.deleteCount).toBe(1)
})

test('Tau2HumanActor reports cumulative provider tokens, cost and latency without exposing raw responses', async () => {
    const transport = new FakeTau2Transport()
    const actor = new Tau2HumanActor({
        client: transport,
        ownerId: 'hj_contract_fixture_001',
        modelUnderTest: createRequest().model_under_test,
    })

    const initial = actor.metrics()
    expect(initial).toEqual({
        turnCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        providerTokens: 0,
        costUsd: 0,
        latencyMs: 0,
    })
    expect(Object.isFrozen(initial)).toBe(true)

    await actor.nextTurn(actorContext())
    transport.response = terminalResponse()
    await actor.nextTurn(actorContext())

    const metrics = actor.metrics()
    expect(metrics).toEqual({
        turnCount: 2,
        promptTokens: 20,
        completionTokens: 8,
        providerTokens: 28,
        costUsd: 0.002,
        latencyMs: 40,
    })
    expect(Object.isFrozen(metrics)).toBe(true)
    expect(initial.turnCount).toBe(0)
    expect(JSON.stringify(metrics)).not.toMatch(/riprova|provider_response|sha256|trial_token/i)
})

test('Tau2HumanActor includes the canonical visible target URL in simulator facts', async () => {
    const transport = new FakeTau2Transport()
    const actor = new Tau2HumanActor({
        client: transport,
        ownerId: 'hj_contract_fixture_001',
        modelUnderTest: createRequest().model_under_test,
    })

    await actor.nextTurn({
        ...actorContext(),
        visibleTargetUrl: 'https://example.test/catalog?q=visible#details',
    })

    expect(transport.createRequests).toHaveLength(1)
    expect(transport.createRequests[0]?.scenario.user_facts).toContain(
        'The controlled target URL is https://example.test/catalog?q=visible#details.',
    )
})

test('Tau2HumanActor rejects unsafe or oversized visible target URLs before creating a trial', async () => {
    const unsafeTargets = [
        'file:///C:/secret.txt',
        'https://user:password@example.test/catalog',
        `https://example.test/${'x'.repeat(4_096)}`,
    ]

    for (const visibleTargetUrl of unsafeTargets) {
        const transport = new FakeTau2Transport()
        const actor = new Tau2HumanActor({
            client: transport,
            ownerId: 'hj_contract_fixture_001',
            modelUnderTest: createRequest().model_under_test,
        })

        await expect(actor.nextTurn({ ...actorContext(), visibleTargetUrl })).rejects.toMatchObject({
            code: 'TAU2_VISIBLE_TARGET_INVALID',
        })
        expect(transport.createRequests).toHaveLength(0)
    }
})

test('Tau2HumanActor rejects hidden input and unavailable sidecar actions', async () => {
    const transport = new FakeTau2Transport()
    const actor = new Tau2HumanActor({
        client: transport,
        ownerId: 'hj_contract_fixture_001',
        modelUnderTest: createRequest().model_under_test,
    })

    await expect(actor.nextTurn(actorContext(observation({ transcript: [] })))).rejects.toMatchObject({
        code: 'TAU2_OBSERVATION_MISSING_ASSISTANT',
    })
    expect(transport.createRequests).toHaveLength(0)

    transport.response = messageResponse()
    await expect(actor.nextTurn(actorContext(observation({
        available_actions: [{ kind: 'end_trial', label: 'End trial' }],
    }), scenario(['end_trial'])))).rejects.toMatchObject({ code: 'TAU2_ACTION_UNAVAILABLE' })
})

test('sidecar faults never include raw response bodies or tokens', async () => {
    const client = new Tau2SidecarClient({
        baseUrl: 'http://127.0.0.1:43123',
        bearerToken: processToken,
        maxResponseBytes: 1_024,
        fetchImpl: (async () => new Response(`raw-${trialToken}-${'x'.repeat(2_000)}`, { status: 500 })) as typeof fetch,
    })

    let captured: unknown
    try {
        await client.createTrial(createRequest())
    } catch (error) {
        captured = error
    }
    expect(captured).toBeInstanceOf(Tau2SidecarFault)
    expect(String(captured)).not.toContain(trialToken)
    expect(String(captured)).not.toContain('raw-')
})
