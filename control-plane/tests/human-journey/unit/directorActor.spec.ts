import { expect, test } from '@playwright/test'
import { createHash, createHmac } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    HumanJourneyScenarioSchema,
    HumanJourneyTrialResultSchema,
    HumanObservationSchema,
    type DirectorCheckpoint,
    type DirectorDecision,
    type HumanJourneyScenario,
    type HumanObservation,
    type HumanTurn,
} from '../contracts'
import { DirectorActor } from '../actors/DirectorActor'
import {
    DirectorSpool,
    DirectorSpoolResponseEnvelopeSchema,
    type DirectorSpoolRequestEnvelope,
} from '../support/directorSpool'

let temporaryRoot = ''
let spoolRoot = ''
const trialToken = 'A'.repeat(43)

test.beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'talos-hj-director-'))
    spoolRoot = join(temporaryRoot, 'director')
    await mkdir(spoolRoot)
})

test.afterEach(async () => {
    if (temporaryRoot !== '') await rm(temporaryRoot, { recursive: true, force: true })
})

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]))
    }
    return value
}

function digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
}

function nowIso(offsetMs = 0): string {
    return new Date(Date.now() + offsetMs).toISOString()
}

function scenario(): HumanJourneyScenario {
    return HumanJourneyScenarioSchema.parse({
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id: 'BROWSER-NATURAL-001',
        title: 'Director discovery journey',
        goal: 'Use one visible director turn without granting release authority.',
        user_facts: ['Only visible chat and Browser state may reach the director.'],
        persona: { id: 'novice_it', language: 'it-IT', traits: ['novice', 'ambiguous'] },
        initial_state: {
            route: '/chat',
            authenticated: true,
            browse_enabled: true,
            conversation: [],
            fixture_ids: ['sample-text'],
        },
        allowed_actions: [
            'send_message',
            'click_visible_control',
            'attach_fixture',
            'reload_page',
            'wait_for_visible_state',
            'yield_to_simulator',
            'request_director_override',
            'end_trial',
        ],
        checkpoints: [{
            id: 'director-needed',
            description: 'The deterministic actor requests one discovery-only override.',
            required_visible_outcomes: ['The director receives only visible state.'],
            acceptable_alternatives: ['The director returns control to the simulator.'],
            timeout_ms: 10_000,
        }],
        forbidden_outcomes: [{
            id: 'no-private-api',
            description: 'The director cannot invoke private product APIs.',
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
            expected_outcome: 'The visible conversation remains coherent.',
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
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        checkpoint_id: 'director-needed',
        route: '/chat',
        transcript: [{ role: 'user', content: 'Riprova usando quello di prima.', occurred_at: nowIso(-1_000) }],
        visible_regions: [{ role: 'main', name: 'TALOS chat', text: 'Browse active. The prior request is visible.' }],
        available_actions: [
            { kind: 'send_message', label: 'Send message' },
            {
                kind: 'click_visible_control',
                label: 'Open Browser evidence',
                control: { role: 'button', name: 'Open Browser evidence', exact: true },
            },
            { kind: 'attach_fixture', label: 'Attach fixture', fixture_ids: ['sample-text'] },
            { kind: 'reload_page', label: 'Reload page' },
            { kind: 'wait_for_visible_state', label: 'Wait for visible state' },
            { kind: 'yield_to_simulator', label: 'Return control' },
            { kind: 'request_director_override', label: 'Request director override' },
            { kind: 'end_trial', label: 'End trial' },
        ],
        available_fixtures: [{ id: 'sample-text', name: 'sample.txt', media_type: 'text/plain', bytes: 32 }],
        prior_actions: [],
        remaining_budget: {
            turns: 12,
            tool_calls: 8,
            duration_ms: 120_000,
            provider_tokens: 8_000,
            cost_usd: 1,
        },
        captured_at: nowIso(),
        visible_state_sha256: 'a'.repeat(64),
        ...overrides,
    })
}

function checkpoint(requestId = 'request-001', overrides: Partial<DirectorCheckpoint> = {}): DirectorCheckpoint {
    const visibleObservation = observation()
    return {
        contract: 'talos.human_journey.director_checkpoint',
        schema_version: 1,
        request_id: requestId,
        trial_id: visibleObservation.trial_id,
        scenario_id: visibleObservation.scenario_id,
        checkpoint_id: visibleObservation.checkpoint_id,
        observation: visibleObservation,
        allowed_actions: ['send_message', 'click_visible_control', 'attach_fixture', 'reload_page', 'wait_for_visible_state', 'yield_to_simulator', 'end_trial'],
        remaining_budget: visibleObservation.remaining_budget,
        observation_sha256: digest(visibleObservation),
        created_at: nowIso(),
        expires_at: nowIso(30_000),
        ...overrides,
    }
}

function defaultTurn(checkpointValue: DirectorCheckpoint): HumanTurn {
    return {
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: `turn-${checkpointValue.request_id}`,
        checkpoint_id: checkpointValue.checkpoint_id,
        source: 'agent_override',
        created_at: nowIso(),
        action: 'send_message',
        message: 'Riprova adesso usando la pagina gia visibile.',
    }
}

function response(
    request: DirectorSpoolRequestEnvelope,
    overrides: Partial<DirectorDecision> & { signingToken?: string } = {},
) {
    const { signingToken = trialToken, ...decisionOverrides } = overrides
    const decision: DirectorDecision = {
        contract: 'talos.human_journey.director_decision',
        schema_version: 1,
        decision_id: `decision-${request.checkpoint.request_id}`,
        request_id: request.checkpoint.request_id,
        observation_sha256: request.checkpoint.observation_sha256,
        director: {
            provider: 'openai',
            model: 'gpt-director-test',
            configuration_sha256: 'b'.repeat(64),
        },
        category: 'recovery',
        turn: defaultTurn(request.checkpoint),
        request_sha256: request.request_sha256,
        created_at: nowIso(),
        ...decisionOverrides,
    }

    return DirectorSpoolResponseEnvelopeSchema.parse({
        contract: 'talos.human_journey.director_spool_response',
        schema_version: 1,
        decision,
        auth_hmac_sha256: createHmac('sha256', signingToken)
            .update(JSON.stringify(canonicalize(decision)))
            .digest('hex'),
    })
}

function spool(options: { rootDirectory?: string, trialId?: string, trialToken?: string, pollIntervalMs?: number } = {}) {
    return new DirectorSpool({
        rootDirectory: options.rootDirectory ?? spoolRoot,
        trialId: options.trialId ?? 'trial-001',
        trialToken: options.trialToken ?? trialToken,
        pollIntervalMs: options.pollIntervalMs ?? 10,
    })
}

async function publishResponse(request: DirectorSpoolRequestEnvelope, value = response(request)): Promise<void> {
    const paths = spool().pathsFor(request.checkpoint.request_id)
    const temporaryPath = `${paths.responsePath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, paths.responsePath)
}

async function waitForRequest(): Promise<DirectorSpoolRequestEnvelope> {
    const trialRoot = join(spoolRoot, 'trial-001')
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const requestIds = await readdir(trialRoot).catch(() => [])
        const requestId = requestIds[0]
        if (requestId !== undefined) {
            const bytes = await readFile(join(trialRoot, requestId, 'request.json'), 'utf8').catch(() => undefined)
            if (bytes !== undefined) return JSON.parse(bytes) as DirectorSpoolRequestEnvelope
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Director request was not published in time.')
}

function actor(options: { timeoutMs?: number, spool?: DirectorSpool } = {}) {
    return new DirectorActor({
        spool: options.spool ?? spool(),
        timeoutMs: options.timeoutMs ?? 1_000,
    })
}

function actorContext(overrides: { observation?: HumanObservation, signal?: AbortSignal } = {}) {
    return {
        scenario: scenario(),
        observation: overrides.observation ?? observation(),
        seed: 7,
        trialIndex: 0,
        createdAt: nowIso(),
        signal: overrides.signal,
    }
}

test('publishes only a visible hash-bound checkpoint through an atomic owned request file', async () => {
    const director = actor()
    const pending = director.nextTurn(actorContext())
    const request = await waitForRequest()

    expect(request.contract).toBe('talos.human_journey.director_spool_request')
    expect(request.checkpoint.observation).toEqual(observation({
        transcript: request.checkpoint.observation.transcript,
        captured_at: request.checkpoint.observation.captured_at,
    }))
    expect(request.checkpoint.observation_sha256).toBe(digest(request.checkpoint.observation))
    expect(request.request_sha256).toBe(digest(request.checkpoint))
    expect(request.checkpoint.allowed_actions).not.toContain('request_director_override')
    expect(JSON.stringify(request)).not.toMatch(/"trial_token":|chain_of_thought|selector|private_api/i)
    expect(await readdir(spool().pathsFor(request.checkpoint.request_id).requestDirectory)).toEqual(['request.json'])

    await publishResponse(request)
    await expect(pending).resolves.toMatchObject({ action: 'send_message', source: 'agent_override' })
})

test('consumes one typed visible decision and exposes non-promotional provenance', async () => {
    const director = actor()
    const pending = director.nextTurn(actorContext())
    const request = await waitForRequest()
    await publishResponse(request)

    const turn = await pending
    expect(turn).toMatchObject({ action: 'send_message', source: 'agent_override' })
    expect(director.getResultFence()).toEqual({
        classification: 'discovery_assisted',
        promotionEligible: false,
        provenance: {
            requestId: request.checkpoint.request_id,
            decisionId: `decision-${request.checkpoint.request_id}`,
            provider: 'openai',
            model: 'gpt-director-test',
            configurationSha256: 'b'.repeat(64),
            category: 'recovery',
            requestSha256: request.request_sha256,
            observationSha256: request.checkpoint.observation_sha256,
            createdAt: expect.any(String),
        },
    })
    expect(JSON.stringify(director.getResultFence())).not.toMatch(/trial_token|chain_of_thought/i)
})

test('publishes a signed response atomically without persisting the trial token', async () => {
    const activeSpool = spool()
    const request = await activeSpool.publishCheckpoint(checkpoint())
    const decision = response(request).decision

    const published = await activeSpool.publishDecision(request, decision)
    const paths = activeSpool.pathsFor(request.checkpoint.request_id)
    const persisted = await readFile(paths.responsePath, 'utf8')

    expect(published).toEqual(JSON.parse(persisted))
    expect(published.auth_hmac_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(persisted).not.toContain(trialToken)
    expect(persisted).not.toMatch(/"trial_token":/)
    expect((await readdir(paths.requestDirectory)).sort()).toEqual(['request.json', 'response.json', 'response.publish.lock'])
    await expect(activeSpool.consumeDecision(request, { timeoutMs: 500 })).resolves.toEqual(decision)
})

test('returns control only through a typed yield_to_simulator turn', async () => {
    const director = actor()
    const pending = director.nextTurn(actorContext())
    const request = await waitForRequest()
    await publishResponse(request, response(request, {
        category: 'return_control',
        turn: {
            contract: 'talos.human_journey.turn',
            schema_version: 1,
            turn_id: 'turn-return-control',
            checkpoint_id: request.checkpoint.checkpoint_id,
            source: 'agent_override',
            created_at: nowIso(),
            action: 'yield_to_simulator',
            reason: 'The adaptive simulator can continue from the visible state.',
        },
    }))

    await expect(pending).resolves.toMatchObject({ action: 'yield_to_simulator', source: 'agent_override' })
})

test('rejects private, unavailable control, unavailable fixture and recursive override actions', async () => {
    const cases: Array<{ label: string, turn: (request: DirectorSpoolRequestEnvelope) => Record<string, unknown> }> = [
        {
            label: 'private API',
            turn: (request) => ({ ...defaultTurn(request.checkpoint), action: 'call_private_api', endpoint: '/api/talos/admin' }),
        },
        {
            label: 'unavailable control',
            turn: (request) => ({
                ...defaultTurn(request.checkpoint),
                action: 'click_visible_control',
                control: { role: 'button', name: 'Delete all data', exact: true },
            }),
        },
        {
            label: 'unavailable fixture',
            turn: (request) => ({ ...defaultTurn(request.checkpoint), action: 'attach_fixture', fixture_id: 'secret-file' }),
        },
        {
            label: 'recursive override',
            turn: (request) => ({ ...defaultTurn(request.checkpoint), action: 'request_director_override', reason: 'Escalate again.' }),
        },
    ]

    for (const [index, candidate] of cases.entries()) {
        const caseRoot = join(temporaryRoot, `case-${index}`)
        await mkdir(caseRoot)
        spoolRoot = caseRoot
        const director = actor()
        const pending = director.nextTurn(actorContext())
        const request = await waitForRequest()
        const rawDecision = {
            ...response(request).decision,
            turn: candidate.turn(request),
        }
        const raw = {
            contract: 'talos.human_journey.director_spool_response',
            schema_version: 1,
            decision: rawDecision,
            auth_hmac_sha256: createHmac('sha256', trialToken)
                .update(JSON.stringify(canonicalize(rawDecision)))
                .digest('hex'),
        }
        await publishResponse(request, raw as ReturnType<typeof response>)
        await expect(pending, candidate.label).rejects.toThrow(/director|decision|action|visible|fixture|contract/i)
    }
})

test('rejects wrong trial token, request hash, observation hash and checkpoint binding', async () => {
    const cases: Array<(request: DirectorSpoolRequestEnvelope) => ReturnType<typeof response>> = [
        (request) => response(request, { signingToken: Buffer.alloc(32, 2).toString('base64url') }),
        (request) => response(request, { request_sha256: 'c'.repeat(64) }),
        (request) => response(request, { observation_sha256: 'd'.repeat(64) }),
        (request) => response(request, {
            turn: { ...defaultTurn(request.checkpoint), checkpoint_id: 'other-checkpoint' },
        }),
    ]

    for (const [index, mutate] of cases.entries()) {
        const caseRoot = join(temporaryRoot, `binding-${index}`)
        await mkdir(caseRoot)
        spoolRoot = caseRoot
        const checkpointValue = checkpoint(`request-${index}`)
        const request = await spool().publishCheckpoint(checkpointValue)
        await publishResponse(request, mutate(request))
        await expect(spool().consumeDecision(request, { timeoutMs: 500 })).rejects.toThrow(/token|hash|checkpoint|binding/i)
    }
})

test('rejects path traversal and symbolic spool paths without writing outside the owned root', async () => {
    expect(() => spool({ trialId: '../outside' })).toThrow(/trial|identifier|path/i)
    expect(() => spool().pathsFor('../outside')).toThrow(/request|identifier|path/i)

    const outside = join(temporaryRoot, 'outside')
    const linkedRoot = join(temporaryRoot, 'linked-director')
    await mkdir(outside)
    await symlink(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')
    const linkedSpool = spool({ rootDirectory: linkedRoot })
    await expect(linkedSpool.publishCheckpoint(checkpoint())).rejects.toThrow(/symbolic|junction|owned root/i)
    expect(await readdir(outside)).toEqual([])
})

test('rejects a spool root replaced by a junction after publication', async () => {
    const activeSpool = spool()
    const request = await activeSpool.publishCheckpoint(checkpoint())
    const relocatedRoot = join(temporaryRoot, 'relocated-director')
    await rename(spoolRoot, relocatedRoot)
    await symlink(relocatedRoot, spoolRoot, process.platform === 'win32' ? 'junction' : 'dir')
    await publishResponse(request)

    await expect(activeSpool.consumeDecision(request, { timeoutMs: 500 })).rejects.toThrow(/symbolic|junction|owned root/i)
})

test('allows exactly one consumer and rejects response replay across spool instances', async () => {
    const checkpointValue = checkpoint()
    const firstSpool = spool()
    const secondSpool = spool()
    const request = await firstSpool.publishCheckpoint(checkpointValue)
    await publishResponse(request)

    const attempts = await Promise.allSettled([
        firstSpool.consumeDecision(request, { timeoutMs: 500 }),
        secondSpool.consumeDecision(request, { timeoutMs: 500 }),
    ])
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    await expect(spool().consumeDecision(request, { timeoutMs: 500 })).rejects.toThrow(/replay|consumed/i)
})

test('times out within the configured bound and rejects a late response', async () => {
    const request = await spool().publishCheckpoint(checkpoint())
    const startedAt = Date.now()
    await expect(spool().consumeDecision(request, { timeoutMs: 100 })).rejects.toThrow(/timeout/i)
    expect(Date.now() - startedAt).toBeLessThan(750)

    await publishResponse(request)
    await expect(spool().consumeDecision(request, { timeoutMs: 500 })).rejects.toThrow(/timeout|late|consumed|replay/i)
})

test('honours AbortSignal and never consumes the later response', async () => {
    const request = await spool().publishCheckpoint(checkpoint())
    const abort = new AbortController()
    const pending = spool().consumeDecision(request, { timeoutMs: 1_000, signal: abort.signal })
    setTimeout(() => abort.abort('operator cancelled'), 25)
    await expect(pending).rejects.toThrow(/cancel/i)

    await publishResponse(request)
    await expect(spool().consumeDecision(request, { timeoutMs: 500 })).rejects.toThrow(/cancel|late|consumed|replay/i)
})

test('keeps agent-assisted trial results discovery-only and promotion-ineligible', async () => {
    const director = actor()
    const pending = director.nextTurn(actorContext())
    const request = await waitForRequest()
    await publishResponse(request)
    const turn = await pending
    const fence = director.getResultFence()
    expect(fence).not.toBeNull()

    const result = {
        contract: 'talos.human_journey.trial_result',
        schema_version: 1,
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        seed: 7,
        actor_mode: 'agent_override',
        classification: fence!.classification,
        status: 'passed',
        promotion_eligible: fence!.promotionEligible,
        started_at: nowIso(-1_000),
        finished_at: nowIso(),
        duration_ms: 1_000,
        turns: [turn],
        grader_results: [{
            grader_id: 'conversation-continuity',
            kind: 'conversation_continuity',
            passed: true,
            reason: 'The visible conversation remained coherent.',
            evidence_refs: [],
        }],
        metrics: {
            turn_count: 1,
            tool_call_count: 0,
            provider_tokens: 0,
            latency_ms: 1_000,
            cost_usd: 0,
        },
        failure: null,
        evidence_manifest_path: 'trials/trial-001/evidence.json',
    }

    expect(HumanJourneyTrialResultSchema.safeParse(result).success).toBe(true)
    expect(HumanJourneyTrialResultSchema.safeParse({ ...result, promotion_eligible: true }).success).toBe(false)
    expect(HumanJourneyTrialResultSchema.safeParse({ ...result, classification: 'deterministic_autonomous' }).success).toBe(false)
})
