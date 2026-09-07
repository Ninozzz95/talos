import { expect, test } from '@playwright/test'
import type { HumanTurn } from '../contracts'
import {
    ObservationCollector,
    type ObservationCollectorCheckpoint,
} from '../observationCollector'

const capturedAt = '2026-07-19T00:00:00.000Z'

function checkpoint(overrides: Partial<ObservationCollectorCheckpoint> = {}): ObservationCollectorCheckpoint {
    return {
        trialId: 'trial-001',
        scenarioId: 'BROWSER-NATURAL-001',
        checkpointId: 'browse-enabled',
        capturedAt,
        priorActions: [],
        remainingBudget: {
            turns: 16,
            tool_calls: 12,
            duration_ms: 180_000,
            provider_tokens: 12_000,
            cost_usd: 2,
        },
        availableFixtures: [{ id: 'sample-text', name: 'sample.txt', media_type: 'text/plain', bytes: 64 }],
        allowedActions: ['send_message', 'click_visible_control', 'attach_fixture', 'reload_page', 'end_trial'],
        visibleControls: [
            { role: 'button', name: 'Enable Browse' },
            { role: 'button', name: 'Attach a file' },
        ],
        ...overrides,
    }
}

test('collects only rendered route, transcript, ARIA and semantic controls', async ({ page }) => {
    await page.setContent(`
        <main aria-label="TALOS chat">
            <article data-message-role="user">Apri example.test e dimmi cosa vedi.</article>
            <article data-message-role="assistant">La pagina e pronta.</article>
            <article data-message-role="system" hidden>grader_state: pass; #secret-selector</article>
            <textarea aria-label="Message TALOS"></textarea>
            <button aria-label="Send">Send</button>
            <button aria-label="Enable Browse">Browse</button>
            <button aria-label="Attach a file">Attach</button>
        </main>
    `)

    const result = await new ObservationCollector().collect(page, checkpoint())

    expect(result.route).toBe('/')
    expect(result.transcript.map(({ role, content }) => ({ role, content }))).toEqual([
        { role: 'user', content: 'Apri example.test e dimmi cosa vedi.' },
        { role: 'assistant', content: 'La pagina e pronta.' },
    ])
    expect(result.visible_regions).toHaveLength(1)
    expect(result.visible_regions[0]).toMatchObject({ role: 'main', name: 'TALOS chat' })
    expect(result.available_actions).toEqual(expect.arrayContaining([
        { kind: 'send_message', label: 'Send message' },
        {
            kind: 'click_visible_control',
            label: 'Enable Browse',
            control: { role: 'button', name: 'Enable Browse', exact: true },
        },
        { kind: 'attach_fixture', label: 'Attach a file', fixture_ids: ['sample-text'] },
        { kind: 'reload_page', label: 'Reload page' },
        { kind: 'end_trial', label: 'End trial' },
    ]))
    expect(result.visible_state_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toMatch(/grader_state|secret-selector|css|xpath|locator/i)
})

test('empty editable composer still exposes the composite send action before its submit button becomes enabled', async ({ page }) => {
    await page.setContent(`
        <main aria-label="TALOS chat">
            <div data-testid="talos-composer-prompt-row">
                <textarea aria-label="Message TALOS"></textarea>
                <button aria-label="Send" disabled>Send</button>
            </div>
        </main>
    `)

    const result = await new ObservationCollector().collect(page, checkpoint({
        allowedActions: ['send_message', 'end_trial'],
        visibleControls: [],
    }))

    expect(result.available_actions).toContainEqual({ kind: 'send_message', label: 'Send message' })
})

test('observation ARIA scope excludes unrelated growing navigation without raising the hard bound', async ({ page }) => {
    const unrelatedSessions = Array.from({ length: 96 }, (_, index) => (
        `<button>Unrelated historical session ${index} ${'navigation-noise-'.repeat(4)}</button>`
    )).join('')
    await page.setContent(`
        <nav aria-label="Chat history">${unrelatedSessions}</nav>
        <main aria-label="TALOS chat">
            <article data-message-role="assistant">La risposta corrente resta visibile.</article>
            <textarea aria-label="Message TALOS"></textarea>
            <button aria-label="Send">Send</button>
        </main>
    `)

    const result = await new ObservationCollector().collect(page, checkpoint({ visibleControls: [] }))

    expect(result.transcript.at(-1)?.content).toBe('La risposta corrente resta visibile.')
    expect(result.visible_regions[0]?.text).not.toContain('Unrelated historical session')
    expect(JSON.stringify(result)).not.toContain('navigation-noise')
})

test('observation accessibility projection excludes cumulative transcript while retaining it in the transcript channel', async ({ page }) => {
    const historicalMessages = Array.from({ length: 40 }, (_, index) => (
        `<article data-message-role="assistant">Historical answer ${index} ${'conversation-noise-'.repeat(8)}</article>`
    )).join('')
    await page.setContent(`
        <main aria-label="TALOS chat">
            <section aria-label="TALOS chat thread">${historicalMessages}</section>
            <div data-testid="talos-composer-prompt-row">
                <textarea aria-label="Message TALOS"></textarea>
                <button aria-label="Send">Send</button>
            </div>
            <div data-testid="talos-composer-capability-row">
                <button aria-label="Enable Browse">Browse</button>
            </div>
        </main>
    `)

    const result = await new ObservationCollector().collect(page, checkpoint({ visibleControls: [] }))

    expect(result.transcript).toHaveLength(40)
    expect(result.transcript.at(-1)?.content).toContain('Historical answer 39')
    expect(result.visible_regions[0]?.text).toContain('Message TALOS')
    expect(result.visible_regions[0]?.text).not.toContain('conversation-noise')
})

test('redacts privileged visible tokens before hashing or returning the observation', async ({ page }) => {
    const canaries = [
        'Bearer abcdefghijklmnopqrstuvwxyz123456',
        'sk-test-abcdefghijklmnopqrstuvwxyz123456',
        '550e8400-e29b-41d4-a716-446655440000',
        'C:\\Users\\ninox\\private\\token.txt',
        '/home/ninox/private/token.txt',
    ]
    await page.setContent(`
        <main aria-label="TALOS chat">
            <article data-message-role="assistant">${canaries.join(' | ')}</article>
            <textarea aria-label="Message TALOS"></textarea>
            <button aria-label="Send">Send</button>
        </main>
    `)

    const result = await new ObservationCollector().collect(page, checkpoint({ visibleControls: [] }))
    const encoded = JSON.stringify(result)

    for (const canary of canaries) expect(encoded).not.toContain(canary)
    expect(encoded).toContain('[REDACTED]')
})

test('projects a rendered Browser card as evidence rather than assistant transcript', async ({ page }) => {
    await page.setContent(`
        <main aria-label="TALOS chat">
            <article
                data-message-role="assistant"
                data-browser-task-id="task-private-001"
                aria-label="Current Browser task"
            >Screenshot preview visible for example.test.</article>
            <article
                data-message-role="browser"
                data-browser-session-activity
                aria-label="Current Browser session activity"
            >Snapshot committed and visible.</article>
        </main>
    `)

    const result = await new ObservationCollector().collect(page, checkpoint({ visibleControls: [] }))
    const browserRegions = result.visible_regions.filter((region) => region.name === 'Browser evidence')

    expect(result.transcript).toEqual([])
    expect(browserRegions).toHaveLength(2)
    expect(browserRegions.map((region) => region.text)).toEqual([
        'Screenshot preview visible for example.test.',
        'Snapshot committed and visible.',
    ])
    expect(JSON.stringify(result)).not.toContain('task-private-001')
})

test('fails closed before DOM, ARIA, transcript or declared-control bounds are exceeded', async ({ page }) => {
    await page.setContent(`
        <main aria-label="TALOS chat">
            <div><span>One</span><span>Two</span><span>Three</span></div>
            <article data-message-role="user">This transcript is intentionally longer than thirty-two bytes.</article>
            <article data-message-role="assistant">Second visible transcript entry.</article>
        </main>
    `)

    await expect(new ObservationCollector({ maxDomDescendants: 2 }).collect(page, checkpoint({ visibleControls: [] })))
        .rejects.toThrow(/DOM descendant limit/i)
    await expect(new ObservationCollector({ maxAriaNodes: 1 }).collect(page, checkpoint({ visibleControls: [] })))
        .rejects.toThrow(/ARIA node limit/i)
    await expect(new ObservationCollector({ maxAriaChars: 16 }).collect(page, checkpoint({ visibleControls: [] })))
        .rejects.toThrow(/ARIA character limit/i)
    await expect(new ObservationCollector({ maxTranscriptBytes: 32 }).collect(page, checkpoint({ visibleControls: [] })))
        .rejects.toThrow(/transcript byte limit/i)
    await expect(new ObservationCollector({ maxTranscriptEntries: 1 }).collect(page, checkpoint({ visibleControls: [] })))
        .rejects.toThrow(/transcript entry limit/i)
    await expect(new ObservationCollector({ maxDeclaredControls: 1 }).collect(page, checkpoint()))
        .rejects.toThrow(/declared control limit/i)
})

test('does not truncate malformed state into a valid observation', async ({ page }) => {
    await page.setContent(`
        <main aria-label="TALOS chat">
            <article data-message-role="user">${'x'.repeat(12_001)}</article>
        </main>
    `)

    await expect(new ObservationCollector().collect(page, checkpoint({ visibleControls: [] })))
        .rejects.toThrow(/observation contract|too big|maximum|limit exceeded/i)
})

test('rejects limit overrides that weaken hard safety bounds', () => {
    expect(() => new ObservationCollector({ maxDomDescendants: 5_001 })).toThrow(/cannot exceed/i)
    expect(() => new ObservationCollector({ maxAriaBytes: 16_001 })).toThrow(/cannot exceed/i)
    expect(() => new ObservationCollector({ maxTranscriptEntries: 65 })).toThrow(/cannot exceed/i)
})

test('preserves prior visible actions without exposing mutable references', async ({ page }) => {
    const prior: HumanTurn = {
        contract: 'talos.human_journey.turn',
        schema_version: 1,
        turn_id: 'turn-reload-001',
        checkpoint_id: 'browse-enabled',
        source: 'seeded_persona',
        created_at: capturedAt,
        action: 'reload_page',
    }
    const input = checkpoint({ priorActions: [prior], visibleControls: [] })
    await page.setContent('<main aria-label="TALOS chat">Reloaded</main>')

    const result = await new ObservationCollector().collect(page, input)
    input.priorActions.length = 0

    expect(result.prior_actions).toEqual([prior])
})
