import { expect, test } from '@playwright/test'
import type { HumanJourneyScenario } from '../contracts'
import {
    BrowserModePersistenceGrader,
    CleanupGrader,
    ConversationContinuityGrader,
    NoDuplicateSideEffectGrader,
    NoRawFaultGrader,
    OwnedScreenshotArtifactGrader,
    PostActionEvidenceGrader,
    ReloadPersistenceGrader,
    TerminalStateGrader,
    CanonicalToolExecutionGrader,
    gradeTrial,
    type HumanJourneyGradeInput,
} from '../graders/HumanJourneyGraders'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function scenario(): HumanJourneyScenario {
    const kinds = [
        'conversation_continuity',
        'browser_mode_persistence',
        'canonical_tool_execution',
        'owned_screenshot_artifact',
        'post_action_evidence',
        'no_duplicate_side_effect',
        'no_raw_fault',
        'reload_persistence',
        'terminal_state',
        'cleanup',
    ] as const

    return {
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id: 'BROWSER-NATURAL-001',
        title: 'Natural Browser journey',
        goal: 'Complete a visible Browser journey with verified evidence.',
        user_facts: [],
        persona: { id: 'novice_it', language: 'it-IT', traits: ['novice'] },
        initial_state: {
            route: '/chat',
            authenticated: true,
            browse_enabled: false,
            conversation: [],
            fixture_ids: [],
        },
        allowed_actions: ['send_message', 'click_visible_control', 'reload_page', 'end_trial'],
        checkpoints: [{
            id: 'browser-complete',
            description: 'The Browser journey completed visibly.',
            required_visible_outcomes: ['The current verified frame is visible.'],
            acceptable_alternatives: [],
            timeout_ms: 30_000,
        }],
        forbidden_outcomes: [{ id: 'no-raw-fault', description: 'No raw operational fault is visible.' }],
        budgets: {
            max_turns: 16,
            max_tool_calls: 12,
            max_duration_ms: 180_000,
            max_provider_tokens: 12_000,
            max_cost_usd: 2,
        },
        perturbations: [],
        graders: kinds.map((kind) => ({
            id: kind.replaceAll('_', '-'),
            kind,
            expected_outcome: `The ${kind} contract passes from inspected evidence.`,
            required: true,
        })),
        semantic_rubric: null,
        cleanup: { strategy: 'isolated_run', preserve_failure_evidence: true, max_retention_days: 7 },
    }
}

function passingInput(): HumanJourneyGradeInput {
    return {
        scenario: scenario(),
        visibleTranscript: [
            { id: 'message-user-1', role: 'user', content: 'Apri la pagina.' },
            { id: 'message-assistant-1', role: 'assistant', content: 'Pagina verificata.' },
            { id: 'message-user-2', role: 'user', content: 'Cattura uno screenshot.' },
            { id: 'message-assistant-2', role: 'assistant', content: 'Screenshot captured and attached.' },
        ],
        expectedVisibleUserMessages: ['Apri la pagina.', 'Cattura uno screenshot.'],
        browserSessionSnapshots: [
            {
                id: 'browser-before-reload',
                phase: 'before_reload',
                talosSessionId: 'chat-1',
                browserSessionId: 'browser-1',
                enabled: true,
                status: 'active',
            },
            {
                id: 'browser-after-reload',
                phase: 'after_reload',
                talosSessionId: 'chat-1',
                browserSessionId: 'browser-1',
                enabled: true,
                status: 'active',
            },
        ],
        toolExecutions: [{
            id: 'tool-screenshot-1',
            operation: 'screenshot',
            canonical: true,
            status: 'succeeded',
            evidenceRefs: ['artifact-screen-1'],
        }],
        screenshotClaims: [{
            id: 'claim-screen-1',
            messageId: 'message-assistant-2',
            artifactId: 'artifact-screen-1',
        }],
        artifacts: [
            {
                id: 'artifact-screen-1',
                kind: 'screenshot',
                browserSessionId: 'browser-1',
                ownerScoped: true,
                visible: true,
                decoded: true,
                current: false,
                stateVersion: 1,
                declaredSha256: HASH_A,
                manifestSha256: HASH_A,
                bytesSha256: HASH_A,
            },
            {
                id: 'artifact-screen-2',
                kind: 'screenshot',
                browserSessionId: 'browser-1',
                ownerScoped: true,
                visible: true,
                decoded: true,
                current: true,
                stateVersion: 2,
                declaredSha256: HASH_B,
                manifestSha256: HASH_B,
                bytesSha256: HASH_B,
            },
        ],
        interactions: [{
            id: 'interaction-1',
            status: 'committed',
            browserSessionId: 'browser-1',
            beforeArtifactId: 'artifact-screen-1',
            afterArtifactId: 'artifact-screen-2',
            physicalDispatchCount: 1,
        }],
        reloads: [{
            id: 'reload-1',
            beforeTalosSessionId: 'chat-1',
            afterTalosSessionId: 'chat-1',
            beforeConversationSha256: HASH_A,
            afterConversationSha256: HASH_A,
            beforeBrowseEnabled: true,
            afterBrowseEnabled: true,
        }],
        terminalState: {
            evidenceRef: 'terminal-state-1',
            composerVisible: true,
            composerEditable: true,
            composerEmpty: true,
            processingVisible: false,
            approvalOpen: false,
            modalOpen: false,
            controlledFaultVisible: false,
        },
        cleanupState: {
            evidenceRef: 'cleanup-state-1',
            ownedProcessCount: 0,
            ownedPortCount: 0,
            temporaryResidueCount: 0,
        },
    }
}

test('grades every declared deterministic contract from structured evidence', () => {
    const results = gradeTrial(passingInput())

    expect(results).toHaveLength(10)
    expect(results.map((result) => result.kind)).toEqual(scenario().graders.map((grader) => grader.kind))
    expect(results.every((result) => result.passed)).toBe(true)
    expect(results.every((result) => result.evidence_refs.length > 0)).toBe(true)
})

test('HJREG-006 rejects a screenshot claim without an owned artifact', () => {
    const input = passingInput()
    input.screenshotClaims[0] = { ...input.screenshotClaims[0]!, artifactId: null }

    const result = new OwnedScreenshotArtifactGrader().grade(input, input.scenario.graders[3]!)

    expect(result.passed).toBe(false)
    expect(result.reason).toContain('claim')
})

test('rejects a screenshot whose owner or exact byte hash is not verified', () => {
    for (const artifact of [
        { ...passingInput().artifacts[0]!, ownerScoped: false },
        { ...passingInput().artifacts[0]!, bytesSha256: HASH_B },
    ]) {
        const input = passingInput()
        input.artifacts[0] = artifact

        expect(new OwnedScreenshotArtifactGrader().grade(input, input.scenario.graders[3]!).passed).toBe(false)
    }
})

test('rejects duplicate physical side effects even when the interaction eventually committed', () => {
    const input = passingInput()
    input.interactions[0] = { ...input.interactions[0]!, physicalDispatchCount: 2 }

    const result = new NoDuplicateSideEffectGrader().grade(input, input.scenario.graders[5]!)

    expect(result.passed).toBe(false)
    expect(result.evidence_refs).toEqual(['interaction-1'])
})

test('each grader fails its own missing or inconsistent evidence boundary', () => {
    const cases = [
        {
            grader: new ConversationContinuityGrader(),
            mutate: (input: HumanJourneyGradeInput) => input.visibleTranscript.splice(2, 1),
            index: 0,
        },
        {
            grader: new BrowserModePersistenceGrader(),
            mutate: (input: HumanJourneyGradeInput) => { input.browserSessionSnapshots[1]!.enabled = false },
            index: 1,
        },
        {
            grader: new CanonicalToolExecutionGrader(),
            mutate: (input: HumanJourneyGradeInput) => { input.toolExecutions[0]!.canonical = false },
            index: 2,
        },
        {
            grader: new PostActionEvidenceGrader(),
            mutate: (input: HumanJourneyGradeInput) => { input.interactions[0]!.afterArtifactId = 'artifact-screen-1' },
            index: 4,
        },
        {
            grader: new NoRawFaultGrader(),
            mutate: (input: HumanJourneyGradeInput) => input.visibleTranscript.push({ id: 'fault-1', role: 'system', content: 'SQLSTATE[HY000] leaked' }),
            index: 6,
        },
        {
            grader: new ReloadPersistenceGrader(),
            mutate: (input: HumanJourneyGradeInput) => { input.reloads[0]!.afterConversationSha256 = HASH_B },
            index: 7,
        },
        {
            grader: new TerminalStateGrader(),
            mutate: (input: HumanJourneyGradeInput) => { input.terminalState.processingVisible = true },
            index: 8,
        },
        {
            grader: new CleanupGrader(),
            mutate: (input: HumanJourneyGradeInput) => { input.cleanupState.ownedProcessCount = 1 },
            index: 9,
        },
    ] as const

    for (const entry of cases) {
        const input = passingInput()
        entry.mutate(input)
        expect(entry.grader.grade(input, input.scenario.graders[entry.index]!).passed).toBe(false)
    }
})

test('rejects duplicate grader kinds instead of producing ambiguous promotion evidence', () => {
    const input = passingInput()
    input.scenario.graders[1] = {
        ...input.scenario.graders[1]!,
        kind: input.scenario.graders[0]!.kind,
    }

    expect(() => gradeTrial(input)).toThrow(/duplicate grader kind/i)
})
