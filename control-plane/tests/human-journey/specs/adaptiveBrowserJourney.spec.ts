import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { access, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
    HumanJourneyScenarioSchema,
    Tau2ModelUnderTestSchema,
    type HumanJourneyScenario,
    type HumanObservation,
    type HumanTurn,
} from '../contracts'
import { Tau2HumanActor, type Tau2HumanActorMetrics } from '../actors/Tau2HumanActor'
import { TalosProductDriver } from '../driver/TalosProductDriver'
import { HumanJourneyEvidenceCollector } from '../evidence/HumanJourneyEvidenceCollector'
import { ObservationCollector } from '../observationCollector'
import { ScenarioRegistry } from '../scenarioRegistry'
import {
    AdaptiveTrialRecordSchema,
    type AdaptivePersonaId,
    type AdaptiveTrialRecord,
} from '../support/adaptiveTrialRecord'
import { Tau2SidecarClient, Tau2SidecarFault } from '../support/Tau2SidecarClient'
import { DeterministicProviderFixtureClient } from '../support/httpFixtureClient'

interface AdaptivePersonaProjection {
    readonly id: AdaptivePersonaId
    readonly traits: HumanJourneyScenario['persona']['traits']
    readonly bootstrapMessage: string
}

interface AdaptiveRuntimeEnvironment {
    readonly runId: string
    readonly artifactRoot: string
    readonly sidecarBaseUrl: string
    readonly sidecarToken: string
    readonly loginEmail: string
    readonly loginPassword: string
    readonly browserSiteOrigin: string
    readonly providerControlToken: string
    readonly modelUnderTest: z.infer<typeof Tau2ModelUnderTestSchema>
    readonly fixtureClient: DeterministicProviderFixtureClient
    readonly evidenceCollector: HumanJourneyEvidenceCollector
}

const personas: readonly AdaptivePersonaProjection[] = Object.freeze([
    { id: 'novice_it', traits: ['novice'], bootstrapMessage: 'Ciao, guidami in questa verifica passo per passo.' },
    { id: 'hurried_typo_it', traits: ['hurried', 'typo_prone'], bootstrapMessage: 'ciao facciamo sta prova veloce' },
    { id: 'skeptical_it', traits: ['skeptical'], bootstrapMessage: 'Questa e una verifica: separa sempre fatti e ipotesi.' },
    { id: 'expert_it', traits: ['expert'], bootstrapMessage: 'Avvia una verifica tecnica riproducibile del flusso.' },
    { id: 'ambiguous_it', traits: ['ambiguous'], bootstrapMessage: 'Ciao, controlliamo quella cosa di cui parlavamo.' },
])

const lane = requiredEnvironment('TALOS_HJ_LANE')
const requestedTrialRounds = parseIntegerEnvironment('TALOS_HJ_TRIALS', 1, 25)
if (lane === 'adaptive' && requestedTrialRounds < 3) {
    throw new Error('The adaptive Human Journey requires at least three trial rounds.')
}
const baseSeed = parseIntegerEnvironment('TALOS_HJ_SEED', 0, 0xffff_ffff)
const scenarioId = requiredEnvironment('TALOS_HJ_SCENARIO_ID')
const runtimeEnvironment = lane === 'adaptive' ? loadAdaptiveRuntimeEnvironment() : undefined

test.describe('HJ9 adaptive Browser journey', () => {
    test.skip(lane !== 'adaptive', 'The adaptive Browser journey runs only in the adaptive lane.')

    test.beforeAll(async () => {
        await mkdir(requireAdaptiveRuntimeEnvironment().artifactRoot, { recursive: true })
    })

    for (let trialRound = 1; trialRound <= requestedTrialRounds; trialRound += 1) {
        for (const [personaIndex, persona] of personas.entries()) {
            test(`HJ9 ${persona.id} adaptive round ${trialRound} completes the visible Browser journey`, async ({ page }, testInfo) => {
                const runtime = requireAdaptiveRuntimeEnvironment()
                const registry = await ScenarioRegistry.load(fileURLToPath(new URL('../scenarios/browser-natural-v1.json', import.meta.url)))
                const scenario = adaptiveScenario(registry.get(scenarioId), persona)
                test.setTimeout(scenario.budgets.max_duration_ms)
                await runtime.fixtureClient.reset()

                const project = canonicalProjectName(testInfo.project.name)
                const trialIndex = ((trialRound - 1) * personas.length) + personaIndex
                const seed = deriveTrialSeed(baseSeed, trialIndex)
                const trialId = adaptiveTrialId(project, persona.id, trialRound)
                const startedAt = new Date().toISOString()
                const startedMs = Date.now()
                const turns: HumanTurn[] = []
                let toolCallsConsumed = 0
                let failure: unknown

                const driver = new TalosProductDriver(page, {
                    loginEmail: runtime.loginEmail,
                    loginPassword: runtime.loginPassword,
                    browserSiteOrigin: runtime.browserSiteOrigin,
                    assistantTimeoutMs: Math.min(60_000, scenario.budgets.max_duration_ms),
                })
                const client = new Tau2SidecarClient({
                    baseUrl: runtime.sidecarBaseUrl,
                    bearerToken: runtime.sidecarToken,
                    requestTimeoutMs: Math.min(60_000, scenario.budgets.max_duration_ms),
                })
                const actor = new Tau2HumanActor({ client, ownerId: runtime.runId, modelUnderTest: runtime.modelUnderTest })
                const observations = new ObservationCollector()

                try {
                    await test.step('visible login, fresh chat and assistant bootstrap', async () => {
                        await driver.login()
                        await driver.startNewChat()
                        await driver.sendMessage(persona.bootstrapMessage)
                        await driver.assertBrowseInactive()
                    })

                    const urlTurn = requireAdaptiveMessage(await actor.nextTurn({
                        scenario,
                        observation: await collectAdaptiveObservation(
                            observations,
                            page,
                            scenario,
                            trialId,
                            'conversation-started',
                            turns,
                            actor.metrics(),
                            startedMs,
                            toolCallsConsumed,
                        ),
                        seed,
                        trialIndex,
                        createdAt: new Date().toISOString(),
                        visibleTargetUrl: driver.browserSiteOrigin,
                    }))
                    turns.push(urlTurn)

                    await test.step('adaptive URL is sent with Browse off', async () => {
                        await driver.assertBrowseInactive()
                        const answer = await driver.sendMessage(urlTurn.message)
                        await expect(answer).toContainText(/Browse.*(?:attivo|active)|Abilita Browse/i)
                        await driver.assertBrowseInactive()
                    })

                    await test.step('Browse is enabled visibly and adaptive retry uses prior URL context', async () => {
                        await driver.enableBrowse()
                        const retryTurn = requireAdaptiveMessage(await actor.nextTurn({
                            scenario,
                            observation: await collectAdaptiveObservation(
                                observations,
                                page,
                                scenario,
                                trialId,
                                'browse-enabled',
                                turns,
                                actor.metrics(),
                                startedMs,
                                toolCallsConsumed,
                            ),
                            seed,
                            trialIndex,
                            createdAt: new Date().toISOString(),
                            visibleTargetUrl: driver.browserSiteOrigin,
                        }))
                        turns.push(retryTurn)
                        const grounded = await driver.sendMessage(retryTurn.message)
                        await expect(grounded).toContainText(/Evidenza browser verificata|TALOS deterministic catalog/i)
                        toolCallsConsumed += 1
                    })

                    let screenshotTurn: Extract<HumanTurn, { action: 'send_message' }> | undefined
                    await test.step('adaptive screenshot request renders owned evidence', async () => {
                        screenshotTurn = requireAdaptiveMessage(await actor.nextTurn({
                            scenario,
                            observation: await collectAdaptiveObservation(
                                observations,
                                page,
                                scenario,
                                trialId,
                                'browse-enabled',
                                turns,
                                actor.metrics(),
                                startedMs,
                                toolCallsConsumed,
                            ),
                            seed,
                            trialIndex,
                            createdAt: new Date().toISOString(),
                            visibleTargetUrl: driver.browserSiteOrigin,
                        }))
                        turns.push(screenshotTurn)
                        const answer = await driver.sendMessage(screenshotTurn.message)
                        await expect(answer).toContainText(/Screenshot verificato|screenshot/i)
                        await driver.expectOwnedScreenshot()
                        toolCallsConsumed += 1
                    })

                    const interaction = await test.step('lightbox interaction commits one new current frame', async () => {
                        await driver.openLatestBrowserCapture()
                        return driver.clickCurrentBrowserFrame(0.37, 0.57)
                    })
                    expect(interaction.afterArtifactId).not.toBe(interaction.beforeArtifactId)
                    expect(interaction.pointerRequestCount).toBe(1)
                    toolCallsConsumed += 1

                    await test.step('adaptive post-action follow-up is grounded in current evidence', async () => {
                        const postActionTurn = requireAdaptiveMessage(await actor.nextTurn({
                            scenario,
                            observation: await collectAdaptiveObservation(
                                observations,
                                page,
                                scenario,
                                trialId,
                                'owned-screenshot-visible',
                                turns,
                                actor.metrics(),
                                startedMs,
                                toolCallsConsumed,
                            ),
                            seed,
                            trialIndex,
                            createdAt: new Date().toISOString(),
                            visibleTargetUrl: driver.browserSiteOrigin,
                        }))
                        turns.push(postActionTurn)
                        const answer = await driver.sendMessage(postActionTurn.message)
                        await expect(answer).toContainText(/Evidenza browser verificata|Cookie preferences accepted/i)
                        toolCallsConsumed += 1
                    })

                    await test.step('reload preserves evidence and adaptive continuation context', async () => {
                        await driver.reloadWorkspace()
                        await driver.assertBrowseActive()
                        await driver.expectOwnedScreenshot(interaction.afterArtifactId)
                        if (screenshotTurn === undefined) throw new Error('The adaptive screenshot turn was not recorded.')
                        await driver.assertConversationContains([persona.bootstrapMessage, urlTurn.message, screenshotTurn.message])

                        const resumeTurn = requireAdaptiveMessage(await actor.nextTurn({
                            scenario,
                            observation: await collectAdaptiveObservation(
                                observations,
                                page,
                                scenario,
                                trialId,
                                'context-survives-reload',
                                turns,
                                actor.metrics(),
                                startedMs,
                                toolCallsConsumed,
                            ),
                            seed,
                            trialIndex,
                            createdAt: new Date().toISOString(),
                            visibleTargetUrl: driver.browserSiteOrigin,
                        }))
                        turns.push(resumeTurn)
                        await driver.sendMessage(resumeTurn.message)

                        const terminalTurn = await actor.nextTurn({
                            scenario,
                            observation: await collectAdaptiveObservation(
                                observations,
                                page,
                                scenario,
                                trialId,
                                'context-survives-reload',
                                turns,
                                actor.metrics(),
                                startedMs,
                                toolCallsConsumed,
                            ),
                            seed,
                            trialIndex,
                            createdAt: new Date().toISOString(),
                            visibleTargetUrl: driver.browserSiteOrigin,
                        })
                        if (terminalTurn.action !== 'end_trial' || terminalTurn.outcome !== 'goal_reached') {
                            throw new Error('The adaptive simulator did not terminate the completed journey with goal_reached.')
                        }
                        turns.push(terminalTurn)
                    })

                    await driver.assertTerminalState()
                    await driver.assertForbiddenOutcomesAbsent()
                } catch (error) {
                    failure = error
                }

                try {
                    await actor.close()
                    await client.close()
                } catch (error) {
                    failure ??= error
                }

                let record = adaptiveTrialRecord({
                    project,
                    trialId,
                    scenario,
                    persona,
                    trialRound,
                    seed,
                    turns,
                    metrics: actor.metrics(),
                    startedAt,
                    startedMs,
                    failure,
                })
                try {
                    await retainAdaptiveTrialEvidence(page, testInfo, record)
                } catch (error) {
                    failure ??= error
                    record = adaptiveTrialRecord({
                        project,
                        trialId,
                        scenario,
                        persona,
                        trialRound,
                        seed,
                        turns,
                        metrics: actor.metrics(),
                        startedAt,
                        startedMs,
                        failure,
                    })
                    await runtime.evidenceCollector.writeRedactedJson(adaptiveTrialReportPath(record), record)
                }

                await testInfo.attach('adaptive-trial-record', {
                    body: Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'),
                    contentType: 'application/json',
                })
                if (failure !== undefined) throw failure
            })
        }
    }

    test.afterAll(async ({}, testInfo) => {
        if (lane !== 'adaptive') return
        await writeAdaptiveProjectReport(testInfo)
    })
})

function adaptiveScenario(base: HumanJourneyScenario, persona: AdaptivePersonaProjection): HumanJourneyScenario {
    return HumanJourneyScenarioSchema.parse({
        ...base,
        persona: { id: persona.id, language: 'it-IT', traits: [...persona.traits] },
        checkpoints: [{
            id: 'conversation-started',
            description: 'An ordinary visible assistant reply is available before Browse is enabled.',
            required_visible_outcomes: ['The chat shows an ordinary assistant response while Browse remains off.'],
            acceptable_alternatives: [],
            timeout_ms: 15_000,
        }, ...base.checkpoints],
    })
}

async function collectAdaptiveObservation(
    collector: ObservationCollector,
    page: Page,
    scenario: HumanJourneyScenario,
    trialId: string,
    checkpointId: string,
    turns: HumanTurn[],
    metrics: Readonly<Tau2HumanActorMetrics>,
    startedMs: number,
    toolCallsConsumed: number,
): Promise<HumanObservation> {
    return collector.collect(page, {
        trialId,
        scenarioId: scenario.id,
        checkpointId,
        capturedAt: new Date().toISOString(),
        priorActions: [...turns],
        remainingBudget: {
            turns: Math.max(0, scenario.budgets.max_turns - turns.length),
            tool_calls: Math.max(0, scenario.budgets.max_tool_calls - toolCallsConsumed),
            duration_ms: Math.max(0, scenario.budgets.max_duration_ms - (Date.now() - startedMs)),
            provider_tokens: Math.max(0, scenario.budgets.max_provider_tokens - metrics.providerTokens),
            cost_usd: Math.max(0, scenario.budgets.max_cost_usd - metrics.costUsd),
        },
        availableFixtures: [],
        allowedActions: ['send_message', 'end_trial'],
        visibleControls: [],
    })
}

function requireAdaptiveMessage(turn: HumanTurn): Extract<HumanTurn, { action: 'send_message' }> {
    if (turn.action !== 'send_message') {
        throw new Error(`The adaptive simulator ended before the visible journey completed (${turn.action}).`)
    }
    return turn
}

function adaptiveTrialRecord(input: {
    project: string
    trialId: string
    scenario: HumanJourneyScenario
    persona: AdaptivePersonaProjection
    trialRound: number
    seed: number
    turns: HumanTurn[]
    metrics: Readonly<Tau2HumanActorMetrics>
    startedAt: string
    startedMs: number
    failure: unknown
}): AdaptiveTrialRecord {
    const runtime = requireAdaptiveRuntimeEnvironment()
    const finishedAt = new Date().toISOString()
    return AdaptiveTrialRecordSchema.parse({
        contract: 'talos.human_journey.adaptive_trial',
        schema_version: 1,
        run_id: runtime.runId,
        project: input.project,
        trial_id: input.trialId,
        scenario_id: input.scenario.id,
        persona_id: input.persona.id,
        trial_round: input.trialRound,
        seed: input.seed,
        status: input.failure === undefined ? 'passed' : 'failed',
        model_under_test: runtime.modelUnderTest,
        metrics: { ...input.metrics },
        unrecorded_provider_turn_count: Math.max(0, input.metrics.turnCount - input.turns.length),
        turns: [...input.turns],
        started_at: input.startedAt,
        finished_at: finishedAt,
        duration_ms: Math.min(900_000, Math.max(0, Date.now() - input.startedMs)),
        failure: input.failure === undefined ? null : safeFailure(input.failure),
    })
}

async function retainAdaptiveTrialEvidence(page: Page, testInfo: TestInfo, record: AdaptiveTrialRecord): Promise<void> {
    const runtime = requireAdaptiveRuntimeEnvironment()
    const reportPath = adaptiveTrialReportPath(record)
    const screenshotPath = adaptiveTrialScreenshotPath(record)
    const manifestPath = adaptiveTrialManifestPath(record)
    await runtime.evidenceCollector.writeRedactedJson(reportPath, record)
    await page.screenshot({ path: resolve(runtime.artifactRoot, ...screenshotPath.split('/')), fullPage: true })
    const manifest = await runtime.evidenceCollector.collect({
        trialId: record.trial_id,
        scenarioId: record.scenario_id,
        artifacts: [
            { id: `${record.trial_id}:report`, kind: 'report', relativePath: reportPath, mediaType: 'application/json', retained: true },
            { id: `${record.trial_id}:screenshot`, kind: 'screenshot', relativePath: screenshotPath, mediaType: 'image/png', retained: true },
        ],
        redaction: { applied: true, notes: ['Structured report keys and configured secret canaries were checked.'] },
        createdAt: new Date().toISOString(),
    })
    await runtime.evidenceCollector.writeRedactedJson(manifestPath, manifest)
    await testInfo.attach('adaptive-evidence-manifest', {
        body: Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8'),
        contentType: 'application/json',
    })
}

async function writeAdaptiveProjectReport(testInfo: TestInfo): Promise<void> {
    const runtime = requireAdaptiveRuntimeEnvironment()
    const project = canonicalProjectName(testInfo.project.name)
    const records: AdaptiveTrialRecord[] = []
    const missingTrialIds: string[] = []
    for (let trialRound = 1; trialRound <= requestedTrialRounds; trialRound += 1) {
        for (const persona of personas) {
            const trialId = adaptiveTrialId(project, persona.id, trialRound)
            const path = `adaptive/${project}/${trialId}/trial.json`
            try {
                records.push(AdaptiveTrialRecordSchema.parse(JSON.parse(await readFile(resolve(runtime.artifactRoot, ...path.split('/')), 'utf8'))))
            } catch {
                missingTrialIds.push(trialId)
            }
        }
    }

    const perPersona = personas.map((persona) => {
        const matching = records.filter((record) => record.persona_id === persona.id)
        const passed = matching.filter((record) => record.status === 'passed').length
        return {
            persona_id: persona.id,
            trials_expected: requestedTrialRounds,
            trials_observed: matching.length,
            trials_passed: passed,
            pass_at_n: matching.length === requestedTrialRounds && passed > 0,
            all_trials_passed: matching.length === requestedTrialRounds && passed === requestedTrialRounds,
            pass_rate: matching.length === 0 ? 0 : passed / matching.length,
        }
    })
    const reportPath = `adaptive/${project}/report.json`
    const report = {
        contract: 'talos.human_journey.adaptive_report',
        schema_version: 1,
        run_id: runtime.runId,
        scenario_id: scenarioId,
        project,
        model_under_test: runtime.modelUnderTest,
        trial_rounds: requestedTrialRounds,
        persona_count: personas.length,
        expected_trial_count: requestedTrialRounds * personas.length,
        observed_trial_count: records.length,
        passed_trial_count: records.filter((record) => record.status === 'passed').length,
        promotion_ready: missingTrialIds.length === 0 && records.every((record) => record.status === 'passed'),
        per_persona: perPersona,
        totals: records.reduce((totals, record) => ({
            provider_tokens: totals.provider_tokens + record.metrics.providerTokens,
            prompt_tokens: totals.prompt_tokens + record.metrics.promptTokens,
            completion_tokens: totals.completion_tokens + record.metrics.completionTokens,
            cost_usd: totals.cost_usd + record.metrics.costUsd,
            latency_ms: totals.latency_ms + record.metrics.latencyMs,
        }), { provider_tokens: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, latency_ms: 0 }),
        missing_trial_ids: missingTrialIds,
        trials: records,
        generated_at: new Date().toISOString(),
    }
    await runtime.evidenceCollector.writeRedactedJson(reportPath, report)

    const artifacts: Array<{
        id: string
        kind: 'report' | 'screenshot'
        relativePath: string
        mediaType: string
        retained: boolean
    }> = [{ id: `adaptive-${project}-report`, kind: 'report', relativePath: reportPath, mediaType: 'application/json', retained: true }]
    for (const record of records) {
        const trialReportPath = adaptiveTrialReportPath(record)
        const screenshotPath = adaptiveTrialScreenshotPath(record)
        artifacts.push({ id: `${record.trial_id}:report`, kind: 'report', relativePath: trialReportPath, mediaType: 'application/json', retained: true })
        if (await fileExists(resolve(runtime.artifactRoot, ...screenshotPath.split('/')))) {
            artifacts.push({ id: `${record.trial_id}:screenshot`, kind: 'screenshot', relativePath: screenshotPath, mediaType: 'image/png', retained: true })
        }
    }
    const manifest = await runtime.evidenceCollector.collect({
        trialId: `adaptive-${project}-aggregate`,
        scenarioId,
        artifacts,
        redaction: { applied: true, notes: ['Aggregate report contains only validated trial records and retained screenshots.'] },
        createdAt: new Date().toISOString(),
    })
    const manifestPath = `adaptive/${project}/evidence-manifest.json`
    await runtime.evidenceCollector.writeRedactedJson(manifestPath, manifest)
    await testInfo.attach('adaptive-project-report', {
        body: Buffer.from(`${JSON.stringify(report)}\n`, 'utf8'),
        contentType: 'application/json',
    })
}

function adaptiveTrialReportPath(record: AdaptiveTrialRecord): string {
    return `adaptive/${record.project}/${record.trial_id}/trial.json`
}

function adaptiveTrialScreenshotPath(record: AdaptiveTrialRecord): string {
    return `adaptive/${record.project}/${record.trial_id}/final.png`
}

function adaptiveTrialManifestPath(record: AdaptiveTrialRecord): string {
    return `adaptive/${record.project}/${record.trial_id}/evidence-manifest.json`
}

function adaptiveTrialId(project: string, personaId: AdaptivePersonaProjection['id'], trialRound: number): string {
    return `hj9-${project}-${personaId}-r${trialRound}`
}

function canonicalProjectName(value: string): string {
    const canonical = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(canonical)) throw new Error('Playwright project name is not artifact-safe.')
    return canonical
}

function safeFailure(error: unknown): { code: string, message: string } {
    const runtime = requireAdaptiveRuntimeEnvironment()
    const code = error instanceof Tau2SidecarFault && /^[A-Z][A-Z0-9_]{2,127}$/.test(error.code)
        ? error.code
        : 'HJ_ADAPTIVE_TRIAL_FAILED'
    const raw = error instanceof Error ? error.message : String(error)
    const message = [...new Set([runtime.loginPassword, runtime.providerControlToken, runtime.sidecarToken])]
        .reduce((value, secret) => value.replaceAll(secret, '[REDACTED]'), raw)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .trim()
        .slice(0, 2_000)
    return { code, message: message || 'Adaptive Human Journey failed without a visible error message.' }
}

async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

function loadAdaptiveRuntimeEnvironment(): AdaptiveRuntimeEnvironment {
    const runId = requiredEnvironment('TALOS_HJ_RUN_ID')
    const artifactRoot = resolve(requiredEnvironment('TALOS_HJ_ARTIFACT_ROOT'))
    const sidecarBaseUrl = requiredEnvironment('TALOS_HJ_TAU2_SIDECAR_URL')
    const sidecarToken = requiredEnvironment('TALOS_HJ_TAU2_SIDECAR_TOKEN')
    const loginEmail = requiredEnvironment('TALOS_HJ_LOGIN_EMAIL')
    const loginPassword = requiredEnvironment('TALOS_HJ_LOGIN_PASSWORD')
    const browserSiteOrigin = requiredEnvironment('TALOS_HJ_BROWSER_SITE_ORIGIN')
    const providerControlToken = requiredEnvironment('TALOS_HJ_PROVIDER_CONTROL_TOKEN')
    const modelUnderTest = Tau2ModelUnderTestSchema.parse({
        provider_id: requiredEnvironment('TALOS_HJ_MODEL_PROVIDER_ID'),
        model: requiredEnvironment('TALOS_HJ_MODEL_NAME'),
        endpoint_sha256: requiredEnvironment('TALOS_HJ_MODEL_ENDPOINT_SHA256'),
    })
    const fixtureClient = new DeterministicProviderFixtureClient(
        requiredEnvironment('TALOS_HJ_PROVIDER_BASE_URL'),
        providerControlToken,
    )
    const evidenceCollector = new HumanJourneyEvidenceCollector({
        workspaceRoot: fileURLToPath(new URL('../../../../', import.meta.url)),
        artifactRoot,
        secretCanaries: [...new Set([loginPassword, providerControlToken, sidecarToken])],
    })
    return Object.freeze({
        runId,
        artifactRoot,
        sidecarBaseUrl,
        sidecarToken,
        loginEmail,
        loginPassword,
        browserSiteOrigin,
        providerControlToken,
        modelUnderTest,
        fixtureClient,
        evidenceCollector,
    })
}

function requireAdaptiveRuntimeEnvironment(): AdaptiveRuntimeEnvironment {
    if (runtimeEnvironment === undefined) {
        throw new Error('Adaptive runtime environment is unavailable outside the adaptive lane.')
    }
    return runtimeEnvironment
}

function requiredEnvironment(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} is required for the adaptive Human Journey.`)
    return value
}

function parseIntegerEnvironment(name: string, minimum: number, maximum: number): number {
    const raw = requiredEnvironment(name)
    if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) throw new Error(`${name} must be a canonical non-negative integer.`)
    const value = Number(raw)
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be between ${minimum} and ${maximum}.`)
    }
    return value
}

function deriveTrialSeed(seed: number, trialIndex: number): number {
    return (seed + Math.imul(trialIndex, 0x9e37_79b1)) >>> 0
}
