import type { HumanJourneyScenario, HumanJourneyTrialResult } from '../contracts'

type ScenarioGrader = HumanJourneyScenario['graders'][number]
export type HumanJourneyGraderResult = HumanJourneyTrialResult['grader_results'][number]

type TranscriptEntry = {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
}

type BrowserSessionSnapshot = {
    id: string
    phase: 'before_reload' | 'after_reload' | 'current'
    talosSessionId: string
    browserSessionId: string
    enabled: boolean
    status: string
}

type ToolExecution = {
    id: string
    operation: string
    canonical: boolean
    status: 'succeeded' | 'failed' | 'denied' | 'pending'
    evidenceRefs: string[]
}

type ScreenshotClaim = {
    id: string
    messageId: string
    artifactId: string | null
}

type ArtifactEvidence = {
    id: string
    kind: 'screenshot' | 'snapshot' | 'other'
    browserSessionId: string
    ownerScoped: boolean
    visible: boolean
    decoded: boolean
    current: boolean
    stateVersion: number
    declaredSha256: string
    manifestSha256: string
    bytesSha256: string
}

type InteractionEvidence = {
    id: string
    status: 'committed' | 'failed' | 'recovery_required'
    browserSessionId: string
    beforeArtifactId: string
    afterArtifactId: string
    physicalDispatchCount: number
}

type ReloadEvidence = {
    id: string
    beforeTalosSessionId: string
    afterTalosSessionId: string
    beforeConversationSha256: string
    afterConversationSha256: string
    beforeBrowseEnabled: boolean
    afterBrowseEnabled: boolean
}

export interface HumanJourneyGradeInput {
    scenario: HumanJourneyScenario
    visibleTranscript: TranscriptEntry[]
    expectedVisibleUserMessages: string[]
    browserSessionSnapshots: BrowserSessionSnapshot[]
    toolExecutions: ToolExecution[]
    screenshotClaims: ScreenshotClaim[]
    artifacts: ArtifactEvidence[]
    interactions: InteractionEvidence[]
    reloads: ReloadEvidence[]
    terminalState: {
        evidenceRef: string
        composerVisible: boolean
        composerEditable: boolean
        composerEmpty: boolean
        processingVisible: boolean
        approvalOpen: boolean
        modalOpen: boolean
        controlledFaultVisible: boolean
    }
    cleanupState: {
        evidenceRef: string
        ownedProcessCount: number
        ownedPortCount: number
        temporaryResidueCount: number
    }
}

export interface HumanJourneyDeterministicGrader {
    readonly kind: ScenarioGrader['kind']
    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult
}

abstract class BaseGrader implements HumanJourneyDeterministicGrader {
    abstract readonly kind: ScenarioGrader['kind']
    abstract grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult

    protected result(grader: ScenarioGrader, passed: boolean, reason: string, evidenceRefs: string[]): HumanJourneyGraderResult {
        if (grader.kind !== this.kind) {
            throw new Error(`Grader ${grader.id} expected ${grader.kind}, received ${this.kind}.`)
        }

        return {
            grader_id: grader.id,
            kind: this.kind,
            passed,
            reason: boundedReason(reason),
            evidence_refs: unique(evidenceRefs).slice(0, 32),
        }
    }
}

export class ConversationContinuityGrader extends BaseGrader {
    readonly kind = 'conversation_continuity' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const visibleUsers = input.visibleTranscript.filter((entry) => entry.role === 'user')
        let cursor = 0
        const refs: string[] = []
        for (const expected of input.expectedVisibleUserMessages) {
            const index = visibleUsers.findIndex((entry, candidate) => candidate >= cursor && entry.content === expected)
            if (index < 0) {
                return this.result(grader, false, 'A recorded user turn is missing or out of order in the visible transcript.', refs)
            }
            refs.push(visibleUsers[index]!.id)
            cursor = index + 1
        }

        return this.result(
            grader,
            input.expectedVisibleUserMessages.length > 0,
            input.expectedVisibleUserMessages.length > 0
                ? 'Every expected user turn remains visible in original order.'
                : 'No expected user turns were supplied for continuity grading.',
            refs,
        )
    }
}

export class BrowserModePersistenceGrader extends BaseGrader {
    readonly kind = 'browser_mode_persistence' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const before = input.browserSessionSnapshots.find((snapshot) => snapshot.phase === 'before_reload')
        const after = input.browserSessionSnapshots.find((snapshot) => snapshot.phase === 'after_reload')
        const passed = Boolean(before
            && after
            && before.enabled
            && after.enabled
            && before.talosSessionId === after.talosSessionId
            && before.browserSessionId === after.browserSessionId
            && ['ready', 'active'].includes(after.status))

        return this.result(
            grader,
            passed,
            passed
                ? 'Browse remained enabled and bound to the same owned sessions after reload.'
                : 'Browse state or Browser ownership changed across reload.',
            [before?.id, after?.id].filter(isString),
        )
    }
}

export class CanonicalToolExecutionGrader extends BaseGrader {
    readonly kind = 'canonical_tool_execution' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const passed = input.toolExecutions.length > 0
            && input.toolExecutions.every((execution) => execution.canonical && execution.status === 'succeeded')

        return this.result(
            grader,
            passed,
            passed
                ? 'Every inspected Browser tool execution used the canonical contract and succeeded.'
                : 'A Browser tool execution was absent, non-canonical or non-terminal.',
            input.toolExecutions.flatMap((execution) => [execution.id, ...execution.evidenceRefs]),
        )
    }
}

export class OwnedScreenshotArtifactGrader extends BaseGrader {
    readonly kind = 'owned_screenshot_artifact' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const refs: string[] = []
        if (input.screenshotClaims.length === 0) {
            return this.result(grader, false, 'No screenshot claim was available for owned-artifact verification.', refs)
        }

        for (const claim of input.screenshotClaims) {
            refs.push(claim.id, claim.messageId)
            const artifact = claim.artifactId === null
                ? undefined
                : input.artifacts.find((candidate) => candidate.id === claim.artifactId)
            if (!artifact) {
                return this.result(grader, false, 'A screenshot claim does not resolve to a retained TALOS artifact.', refs)
            }
            refs.push(artifact.id)
            if (artifact.kind !== 'screenshot'
                || !artifact.ownerScoped
                || !artifact.visible
                || !artifact.decoded
                || !validDigest(artifact.declaredSha256)
                || artifact.declaredSha256 !== artifact.manifestSha256
                || artifact.declaredSha256 !== artifact.bytesSha256) {
                return this.result(grader, false, 'A screenshot claim failed owner, visibility, decode or exact-byte integrity verification.', refs)
            }
        }

        return this.result(grader, true, 'Every screenshot claim resolves to visible owner-scoped evidence with matching byte hashes.', refs)
    }
}

export class PostActionEvidenceGrader extends BaseGrader {
    readonly kind = 'post_action_evidence' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const refs: string[] = []
        if (input.interactions.length === 0) {
            return this.result(grader, false, 'No committed HMI interaction was available for post-action verification.', refs)
        }
        for (const interaction of input.interactions) {
            refs.push(interaction.id, interaction.beforeArtifactId, interaction.afterArtifactId)
            const before = input.artifacts.find((artifact) => artifact.id === interaction.beforeArtifactId)
            const after = input.artifacts.find((artifact) => artifact.id === interaction.afterArtifactId)
            if (interaction.status !== 'committed'
                || !before
                || !after
                || before.id === after.id
                || before.browserSessionId !== interaction.browserSessionId
                || after.browserSessionId !== interaction.browserSessionId
                || after.stateVersion <= before.stateVersion
                || !after.current
                || !verifiedArtifactHash(after)) {
                return this.result(grader, false, 'The HMI action lacks a distinct, current and integrity-verified post-action frame.', refs)
            }
        }

        return this.result(grader, true, 'Every HMI action committed a distinct current evidence frame.', refs)
    }
}

export class NoDuplicateSideEffectGrader extends BaseGrader {
    readonly kind = 'no_duplicate_side_effect' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const identities = new Set<string>()
        for (const interaction of input.interactions) {
            if (identities.has(interaction.id) || interaction.physicalDispatchCount !== 1) {
                return this.result(grader, false, 'An interaction identity or physical side effect was dispatched more than once.', [interaction.id])
            }
            identities.add(interaction.id)
        }

        return this.result(
            grader,
            input.interactions.length > 0,
            input.interactions.length > 0
                ? 'Every interaction identity maps to exactly one physical dispatch.'
                : 'No interaction dispatch evidence was available.',
            input.interactions.map((interaction) => interaction.id),
        )
    }
}

const RAW_FAULT_SIGNATURES = [
    'SQLSTATE[',
    'TALOS_BROWSER_COMMAND_MALFORMED',
    'TALOS_BROWSER_REPEATED_COMMAND',
    'TALOS_BROWSER_WORKER_FAILURE',
    'PROVIDER_CHAT_FAILED',
    'Browser worker is not configured',
    'Browser worker request failed',
    'The validator rejected the chat payload',
] as const

export class NoRawFaultGrader extends BaseGrader {
    readonly kind = 'no_raw_fault' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const fault = input.visibleTranscript.find((entry) => RAW_FAULT_SIGNATURES.some((signature) => (
            entry.content.toLocaleLowerCase('en-US').includes(signature.toLocaleLowerCase('en-US'))
        )))

        return this.result(
            grader,
            fault === undefined,
            fault === undefined ? 'No raw operational fault is visible in the transcript.' : 'A raw operational fault leaked into the visible transcript.',
            fault ? [fault.id] : input.visibleTranscript.map((entry) => entry.id),
        )
    }
}

export class ReloadPersistenceGrader extends BaseGrader {
    readonly kind = 'reload_persistence' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const passed = input.reloads.length > 0 && input.reloads.every((reload) => (
            reload.beforeTalosSessionId === reload.afterTalosSessionId
            && validDigest(reload.beforeConversationSha256)
            && reload.beforeConversationSha256 === reload.afterConversationSha256
            && reload.beforeBrowseEnabled
            && reload.afterBrowseEnabled
        ))

        return this.result(
            grader,
            passed,
            passed
                ? 'Reload preserved the chat identity, ordered conversation digest and Browse state.'
                : 'Reload changed chat identity, conversation digest or Browse state.',
            input.reloads.map((reload) => reload.id),
        )
    }
}

export class TerminalStateGrader extends BaseGrader {
    readonly kind = 'terminal_state' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const state = input.terminalState
        const passed = state.composerVisible
            && state.composerEditable
            && state.composerEmpty
            && !state.processingVisible
            && !state.approvalOpen
            && !state.modalOpen
            && !state.controlledFaultVisible

        return this.result(
            grader,
            passed,
            passed ? 'The final user surface is idle, editable and free of blocking state.' : 'The final user surface retained a blocking or unusable state.',
            [state.evidenceRef],
        )
    }
}

export class CleanupGrader extends BaseGrader {
    readonly kind = 'cleanup' as const

    grade(input: HumanJourneyGradeInput, grader: ScenarioGrader): HumanJourneyGraderResult {
        const state = input.cleanupState
        const passed = [state.ownedProcessCount, state.ownedPortCount, state.temporaryResidueCount]
            .every((value) => Number.isSafeInteger(value) && value === 0)

        return this.result(
            grader,
            passed,
            passed ? 'The journey left no owned process, port or temporary residue.' : 'The journey left owned runtime residue after cleanup.',
            [state.evidenceRef],
        )
    }
}

const GRADERS: Readonly<Record<ScenarioGrader['kind'], HumanJourneyDeterministicGrader>> = Object.freeze({
    conversation_continuity: new ConversationContinuityGrader(),
    browser_mode_persistence: new BrowserModePersistenceGrader(),
    canonical_tool_execution: new CanonicalToolExecutionGrader(),
    owned_screenshot_artifact: new OwnedScreenshotArtifactGrader(),
    post_action_evidence: new PostActionEvidenceGrader(),
    no_duplicate_side_effect: new NoDuplicateSideEffectGrader(),
    no_raw_fault: new NoRawFaultGrader(),
    reload_persistence: new ReloadPersistenceGrader(),
    terminal_state: new TerminalStateGrader(),
    cleanup: new CleanupGrader(),
})

export function gradeTrial(input: HumanJourneyGradeInput): HumanJourneyGraderResult[] {
    const kinds = new Set<ScenarioGrader['kind']>()
    const knownRefs = evidenceReferences(input)

    return input.scenario.graders.map((config) => {
        if (kinds.has(config.kind)) throw new Error(`Duplicate grader kind is not allowed: ${config.kind}.`)
        kinds.add(config.kind)
        const grader = GRADERS[config.kind]
        if (!grader) throw new Error(`Unsupported deterministic grader kind: ${String(config.kind)}.`)
        const result = grader.grade(input, config)
        for (const reference of result.evidence_refs) {
            if (!knownRefs.has(reference)) throw new Error(`Grader ${config.id} returned unknown evidence reference ${reference}.`)
        }
        return result
    })
}

function evidenceReferences(input: HumanJourneyGradeInput): Set<string> {
    return new Set([
        ...input.visibleTranscript.map((entry) => entry.id),
        ...input.browserSessionSnapshots.map((snapshot) => snapshot.id),
        ...input.toolExecutions.flatMap((execution) => [execution.id, ...execution.evidenceRefs]),
        ...input.screenshotClaims.flatMap((claim) => [claim.id, claim.messageId]),
        ...input.artifacts.map((artifact) => artifact.id),
        ...input.interactions.map((interaction) => interaction.id),
        ...input.reloads.map((reload) => reload.id),
        input.terminalState.evidenceRef,
        input.cleanupState.evidenceRef,
    ])
}

function verifiedArtifactHash(artifact: ArtifactEvidence): boolean {
    return validDigest(artifact.declaredSha256)
        && artifact.declaredSha256 === artifact.manifestSha256
        && artifact.declaredSha256 === artifact.bytesSha256
}

function validDigest(value: string): boolean {
    return /^[a-f0-9]{64}$/.test(value)
}

function boundedReason(reason: string): string {
    const normalized = reason.trim()
    if (normalized.length < 1 || normalized.length > 2_000) throw new Error('Grader reason must contain between 1 and 2000 characters.')
    return normalized
}

function unique(values: string[]): string[] {
    return [...new Set(values)]
}

function isString(value: string | undefined): value is string {
    return typeof value === 'string'
}
