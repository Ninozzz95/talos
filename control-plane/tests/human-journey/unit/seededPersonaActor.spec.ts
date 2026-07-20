import { expect, test } from '@playwright/test'
import {
    HumanJourneyScenarioSchema,
    HumanObservationSchema,
    type HumanJourneyScenario,
    type HumanObservation,
    type HumanTurn,
} from '../contracts'
import { SeededPersonaActor } from '../actors/SeededPersonaActor'

const capturedAt = '2026-07-19T00:00:00.000Z'
const targetUrl = 'https://example.test/catalog?kind=car'

function scenario(personaId = 'novice_it'): HumanJourneyScenario {
    const traits = personaId === 'hurried_typo_it'
        ? ['hurried', 'typo_prone', 'ambiguous']
        : personaId === 'skeptical_it'
            ? ['skeptical', 'expert']
            : ['novice', 'ambiguous']

    return HumanJourneyScenarioSchema.parse({
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id: 'BROWSER-NATURAL-001',
        title: 'Natural browser journey',
        goal: 'Inspect a visible page and retain screenshot evidence across reload.',
        user_facts: ['The user knows only the target URL.'],
        persona: { id: personaId, language: 'it-IT', traits },
        initial_state: {
            route: '/chat',
            authenticated: true,
            browse_enabled: false,
            conversation: [],
            fixture_ids: [],
        },
        allowed_actions: [
            'send_message',
            'click_visible_control',
            'reload_page',
            'wait_for_visible_state',
            'end_trial',
        ],
        checkpoints: [{
            id: 'browse-enabled',
            description: 'Browse is enabled from a visible control.',
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
        trial_id: 'trial-001',
        scenario_id: 'BROWSER-NATURAL-001',
        checkpoint_id: 'browse-enabled',
        route: '/chat',
        transcript: [],
        visible_regions: [{ role: 'main', name: 'TALOS chat', text: 'Ready' }],
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
        captured_at: capturedAt,
        visible_state_sha256: 'a'.repeat(64),
        ...overrides,
    })
}

async function nextTurn(input: {
    personaId?: string
    seed?: number
    observation?: HumanObservation
    visibleTargetUrl?: string
} = {}): Promise<HumanTurn> {
    const actor = new SeededPersonaActor()

    return actor.nextTurn({
        scenario: scenario(input.personaId),
        observation: input.observation ?? observation(),
        seed: input.seed ?? 7,
        trialIndex: 0,
        createdAt: capturedAt,
        visibleTargetUrl: input.visibleTargetUrl ?? targetUrl,
    })
}

test('replays the exact turn stream for an identical seed and visible context', async () => {
    const first = await nextTurn({ seed: 91 })
    const second = await nextTurn({ seed: 91 })

    expect(second).toEqual(first)
    expect(first.source).toBe('seeded_persona')
    expect(first.checkpoint_id).toBe('browse-enabled')
})

test('varies wording across seeds without changing semantics', async () => {
    const turns = await Promise.all(Array.from({ length: 48 }, (_, seed) => nextTurn({ seed })))
    const messages = turns.map((turn) => turn.action === 'send_message' ? turn.message : '')

    expect(turns.every((turn) => turn.action === 'send_message')).toBe(true)
    expect(new Set(messages).size).toBeGreaterThan(3)
    expect(turns.every((turn) => turn.checkpoint_id === 'browse-enabled')).toBe(true)
    expect(messages.every((message) => message.includes('example.test/catalog'))).toBe(true)
})

test('covers URL order, bare URL and punctuation for every seeded persona', async () => {
    for (const personaId of ['novice_it', 'hurried_typo_it', 'skeptical_it']) {
        const turns = await Promise.all(Array.from({ length: 96 }, (_, seed) => nextTurn({ personaId, seed })))
        const messages = turns.flatMap((turn) => turn.action === 'send_message' ? [turn.message] : [])

        expect(messages.some((message) => /^(?:https:\/\/)?example\.test\/catalog/.test(message))).toBe(true)
        expect(messages.some((message) => !message.startsWith('http') && /example\.test\/catalog/.test(message))).toBe(true)
        expect(messages.some((message) => /[?!]$/.test(message))).toBe(true)
        expect(messages.every((message) => /example\.test\/catalog/.test(message))).toBe(true)
    }
})

test('produces three distinct replayable persona transcripts from the same seed', async () => {
    const personaIds = ['novice_it', 'hurried_typo_it', 'skeptical_it']
    const first = await Promise.all(personaIds.map((personaId) => nextTurn({ personaId, seed: 23 })))
    const replay = await Promise.all(personaIds.map((personaId) => nextTurn({ personaId, seed: 23 })))
    const messages = first.map((turn) => turn.action === 'send_message' ? turn.message : '')

    expect(replay).toEqual(first)
    expect(new Set(messages).size).toBe(3)
    expect(new Set(first.map((turn) => turn.checkpoint_id))).toEqual(new Set(['browse-enabled']))
    if (process.env.TALOS_HJ_PRINT_TRANSCRIPTS === '1') {
        console.log(JSON.stringify(personaIds.map((persona, index) => ({ persona, message: messages[index] }))))
    }
})

test('uses only visible retry, screenshot, complaint, reload and resume context', async () => {
    const retry = await nextTurn({
        observation: observation({
            transcript: [{ role: 'system', content: 'Browser worker request failed.', occurred_at: capturedAt }],
        }),
    })
    expect(retry).toMatchObject({ action: 'send_message' })
    expect((retry as Extract<HumanTurn, { action: 'send_message' }>).message).toMatch(/riprova|prova ancora|ritenta/i)

    const complaint = await nextTurn({
        observation: observation({
            transcript: [{ role: 'assistant', content: 'Screenshot captured and attached.', occurred_at: capturedAt }],
        }),
    })
    expect(complaint).toMatchObject({ action: 'send_message' })
    expect((complaint as Extract<HumanTurn, { action: 'send_message' }>).message).toMatch(/non (?:lo|la) vedo|allegato|screenshot/i)

    const screenshot = await nextTurn({
        observation: observation({
            transcript: [
                { role: 'user', content: `Apri ${targetUrl}`, occurred_at: capturedAt },
                { role: 'assistant', content: 'La pagina e aperta e leggibile.', occurred_at: capturedAt },
            ],
        }),
    })
    expect(screenshot).toMatchObject({ action: 'send_message' })
    expect((screenshot as Extract<HumanTurn, { action: 'send_message' }>).message).toMatch(/screen|schermata|immagine/i)

    const reload = await nextTurn({
        observation: observation({
            transcript: [{ role: 'user', content: `Apri ${targetUrl}`, occurred_at: capturedAt }],
            visible_regions: [{ role: 'region', name: 'Browser evidence', text: 'Screenshot preview visible.' }],
            available_actions: [{ kind: 'reload_page', label: 'Reload page' }],
        }),
    })
    expect(reload).toMatchObject({ action: 'reload_page' })

    const priorReload = reload.action === 'reload_page' ? reload : undefined
    expect(priorReload).toBeDefined()
    const resume = await nextTurn({
        observation: observation({
            transcript: [{ role: 'user', content: `Apri ${targetUrl}`, occurred_at: capturedAt }],
            visible_regions: [{ role: 'region', name: 'Browser evidence', text: 'Screenshot preview visible.' }],
            prior_actions: [priorReload!],
        }),
    })
    expect(resume).toMatchObject({ action: 'send_message' })
    expect((resume as Extract<HumanTurn, { action: 'send_message' }>).message).toMatch(/quello di prima|continua|dove eravamo/i)
})

test('clicks only a declared visible control and refuses unavailable privileged actions', async () => {
    const browse = await nextTurn({
        observation: observation({
            available_actions: [{
                kind: 'click_visible_control',
                label: 'Enable Browse',
                control: { role: 'button', name: 'Enable Browse', exact: true },
            }],
        }),
    })
    expect(browse).toMatchObject({
        action: 'click_visible_control',
        control: { role: 'button', name: 'Enable Browse', exact: true },
    })
    expect(JSON.stringify(browse)).not.toMatch(/selector|xpath|database|api_call|tool_command/i)

    await expect(nextTurn({
        observation: observation({
            available_actions: [{ kind: 'request_director_override', label: 'Escalate' }],
        }),
    })).rejects.toThrow(/visible action|available action/i)
})

test('does not repeat target or screenshot turns while visible state is unchanged', async () => {
    const targetTurn = await nextTurn({ seed: 11 })
    expect(targetTurn.action).toBe('send_message')

    const waitingAfterTarget = await nextTurn({
        seed: 11,
        observation: observation({
            prior_actions: [targetTurn],
            available_actions: [
                { kind: 'send_message', label: 'Send message' },
                { kind: 'wait_for_visible_state', label: 'Wait for visible state' },
            ],
        }),
    })
    expect(waitingAfterTarget.action).toBe('wait_for_visible_state')

    const screenshotTurn: HumanTurn = {
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: 'turn-screenshot-001',
        checkpoint_id: 'browse-enabled',
        source: 'seeded_persona',
        created_at: capturedAt,
        action: 'send_message',
        message: 'screen?',
    }
    const waitingAfterScreenshot = await nextTurn({
        seed: 11,
        observation: observation({
            transcript: [
                { role: 'user', content: `Apri ${targetUrl}`, occurred_at: capturedAt },
                { role: 'assistant', content: 'La pagina e aperta.', occurred_at: capturedAt },
            ],
            prior_actions: [targetTurn, screenshotTurn],
            available_actions: [
                { kind: 'send_message', label: 'Send message' },
                { kind: 'wait_for_visible_state', label: 'Wait for visible state' },
            ],
        }),
    })
    expect(waitingAfterScreenshot.action).toBe('wait_for_visible_state')
})
