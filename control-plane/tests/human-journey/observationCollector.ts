import { createHash } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import {
    HumanObservationSchema,
    type HumanActionKind,
    type HumanObservation,
    type HumanTurn,
} from './contracts'

const HARD_LIMITS = Object.freeze({
    maxDomDescendants: 5_000,
    maxAriaNodes: 512,
    maxAriaDepth: 16,
    maxAriaChars: 4_000,
    maxAriaBytes: 16_000,
    maxTranscriptEntries: 64,
    maxTranscriptBytes: 131_072,
    maxDeclaredControls: 12,
})

type AvailableFixture = HumanObservation['available_fixtures'][number]
type RemainingBudget = HumanObservation['remaining_budget']
type VisibleControlRole = Extract<HumanObservation['available_actions'][number], { kind: 'click_visible_control' }>['control']['role']

export interface VisibleControlCandidate {
    role: VisibleControlRole
    name: string
}

export interface ObservationCollectorLimits {
    maxDomDescendants: number
    maxAriaNodes: number
    maxAriaDepth: number
    maxAriaChars: number
    maxAriaBytes: number
    maxTranscriptEntries: number
    maxTranscriptBytes: number
    maxDeclaredControls: number
}

export interface ObservationCollectorCheckpoint {
    trialId: string
    scenarioId: string
    checkpointId: string
    capturedAt: string
    priorActions: HumanTurn[]
    remainingBudget: RemainingBudget
    availableFixtures: AvailableFixture[]
    allowedActions: HumanActionKind[]
    visibleControls: VisibleControlCandidate[]
}

function safeRoute(pageUrl: string): string {
    try {
        const url = new URL(pageUrl)
        if (url.protocol === 'http:' || url.protocol === 'https:') return url.pathname || '/'
    } catch {
        // Non-network fixture URLs deliberately collapse to the visible root route.
    }
    return '/'
}

function redactVisibleText(input: string): string {
    return input
        .replace(/\[ref=[^\]]+\]/gi, '')
        .replace(/\[box=[^\]]+\]/gi, '')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, '[REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .replace(/\b(?:api[_-]?key)\s*[:=_-]?\s*[A-Za-z0-9_-]{12,}\b/gi, '[REDACTED]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[REDACTED]')
        .replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gi, '[REDACTED]')
        .replace(/\b[A-Za-z]:\\Users\\[^\\\s|]+\\[^\s|]+/g, '[REDACTED]')
        .replace(/\/(?:home|Users)\/[^/\s|]+\/[^\s|]+/g, '[REDACTED]')
        .replace(/[ \t]+\n/g, '\n')
        .trim()
}

function ariaMetrics(snapshot: string): { nodes: number; depth: number } {
    let nodes = 0
    let depth = 0
    for (const line of snapshot.split(/\r?\n/)) {
        if (line.trim() === '') continue
        nodes += 1
        const spaces = line.match(/^\s*/)?.[0].length ?? 0
        depth = Math.max(depth, Math.floor(spaces / 2) + 1)
    }
    return { nodes, depth }
}

function assertBound(label: string, actual: number, maximum: number): void {
    if (actual > maximum) throw new Error(`${label} exceeded: ${actual} > ${maximum}.`)
}

async function isVisibleAndEnabled(locator: ReturnType<Page['getByRole']>): Promise<boolean> {
    if (await locator.count() !== 1) return false
    if (!await locator.isVisible()) return false
    return locator.isEnabled().catch(() => true)
}

async function isVisible(locator: ReturnType<Page['getByRole']>): Promise<boolean> {
    return await locator.count() === 1 && locator.isVisible()
}

async function isVisibleAndEditable(locator: ReturnType<Page['getByRole']>): Promise<boolean> {
    if (!await isVisible(locator)) return false
    return locator.isEditable().catch(() => false)
}

async function collectAccessibleControlProjection(page: Page): Promise<string> {
    const dialogs = page.getByRole('dialog')
    for (let index = (await dialogs.count()) - 1; index >= 0; index -= 1) {
        const dialog = dialogs.nth(index)
        if (await dialog.isVisible()) return dialog.ariaSnapshot({ mode: 'default', depth: 8 })
    }

    const productRoots: readonly [string, Locator][] = [
        ['composer prompt', page.getByTestId('talos-composer-prompt-row')],
        ['composer capabilities', page.getByTestId('talos-composer-capability-row')],
    ]
    const snapshots: string[] = []
    for (const [label, root] of productRoots) {
        const count = await root.count()
        if (count > 1) throw new Error(`Accessible ${label} projection root must be unique.`)
        if (count === 1 && await root.isVisible()) {
            snapshots.push(await root.ariaSnapshot({ mode: 'default', depth: 8 }))
        }
    }
    if (snapshots.length > 0) return snapshots.filter((snapshot) => snapshot.trim() !== '').join('\n')

    const main = page.getByRole('main')
    const fallback = await main.count() === 1 && await main.isVisible()
        ? main
        : page.locator('body')
    return fallback.ariaSnapshot({ mode: 'default', depth: 8 })
}

export class ObservationCollector {
    private readonly limits: Readonly<ObservationCollectorLimits>

    constructor(overrides: Partial<ObservationCollectorLimits> = {}) {
        const limits = { ...HARD_LIMITS, ...overrides }
        for (const [key, hardMaximum] of Object.entries(HARD_LIMITS) as [keyof ObservationCollectorLimits, number][]) {
            const value = limits[key]
            if (!Number.isInteger(value) || value < 1) throw new Error(`${key} must be a positive integer.`)
            if (value > hardMaximum) throw new Error(`${key} cannot exceed hard safety maximum ${hardMaximum}.`)
        }
        this.limits = Object.freeze(limits)
    }

    async collect(page: Page, rawCheckpoint: ObservationCollectorCheckpoint): Promise<HumanObservation> {
        const checkpoint = structuredClone(rawCheckpoint)
        assertBound('Declared control limit', checkpoint.visibleControls.length, this.limits.maxDeclaredControls)
        if (new Set(checkpoint.allowedActions).size !== checkpoint.allowedActions.length) {
            throw new Error('Observation checkpoint contains duplicate allowed actions.')
        }

        const descendantCount = await page.locator('body *').count()
        assertBound('DOM descendant limit', descendantCount, this.limits.maxDomDescendants)

        const main = page.getByRole('main')
        const rawAriaSnapshot = await collectAccessibleControlProjection(page)
        assertBound('ARIA character limit', rawAriaSnapshot.length, this.limits.maxAriaChars)
        assertBound('ARIA byte limit', Buffer.byteLength(rawAriaSnapshot, 'utf8'), this.limits.maxAriaBytes)
        const metrics = ariaMetrics(rawAriaSnapshot)
        assertBound('ARIA node limit', metrics.nodes, this.limits.maxAriaNodes)
        assertBound('ARIA depth limit', metrics.depth, this.limits.maxAriaDepth)

        const transcript: HumanObservation['transcript'] = []
        let transcriptBytes = 0
        const messageNodes = page.locator('[data-message-role]')
        for (let index = 0; index < await messageNodes.count(); index += 1) {
            const node = messageNodes.nth(index)
            if (!await node.isVisible()) continue
            const role = await node.getAttribute('data-message-role')
            if (role !== 'user' && role !== 'assistant' && role !== 'system') continue
            if (await node.getAttribute('data-browser-task-id') !== null) continue

            const rawContent = (await node.innerText()).trim()
            if (rawContent === '') continue
            transcriptBytes += Buffer.byteLength(rawContent, 'utf8')
            assertBound('Visible transcript entry limit', transcript.length + 1, this.limits.maxTranscriptEntries)
            assertBound('Visible transcript byte limit', transcriptBytes, this.limits.maxTranscriptBytes)
            transcript.push({
                role,
                content: redactVisibleText(rawContent),
                occurred_at: checkpoint.capturedAt,
            })
        }

        const mainName = await main.count() === 1 && await main.isVisible()
            ? (await main.getAttribute('aria-label'))?.trim()
            : undefined
        const pageTitle = (await page.title()).trim()
        const regionText = redactVisibleText(rawAriaSnapshot)
        const visibleRegions: HumanObservation['visible_regions'] = [{
            role: 'main',
            name: mainName || pageTitle || 'TALOS',
            text: regionText || 'No accessible content is currently rendered.',
        }]
        const browserEvidenceNodes = page.locator('[data-browser-task-id], [data-message-role="browser"]')
        for (let index = 0; index < await browserEvidenceNodes.count(); index += 1) {
            const node = browserEvidenceNodes.nth(index)
            if (!await node.isVisible()) continue
            const rawText = (await node.innerText()).trim()
            if (rawText === '') continue
            assertBound('Browser evidence character limit', rawText.length, 4_000)
            assertBound('Browser evidence byte limit', Buffer.byteLength(rawText, 'utf8'), this.limits.maxAriaBytes)
            assertBound('Visible region limit', visibleRegions.length + 1, 128)
            visibleRegions.push({
                role: 'region',
                name: 'Browser evidence',
                text: redactVisibleText(rawText),
            })
        }

        const actions: HumanObservation['available_actions'] = []
        const allowed = new Set(checkpoint.allowedActions)
        if (allowed.has('send_message')) {
            const textbox = page.getByRole('textbox', { name: 'Message TALOS', exact: true })
            const send = page.getByRole('button', { name: 'Send', exact: true })
            if (await isVisibleAndEditable(textbox) && await isVisible(send)) {
                actions.push({ kind: 'send_message', label: 'Send message' })
            }
        }

        if (allowed.has('click_visible_control')) {
            const identities = new Set<string>()
            for (const candidate of checkpoint.visibleControls) {
                const identity = `${candidate.role}:${candidate.name}`
                if (identities.has(identity)) throw new Error(`Duplicate declared visible control: ${identity}`)
                identities.add(identity)
                const locator = page.getByRole(candidate.role, { name: candidate.name, exact: true })
                if (await isVisibleAndEnabled(locator)) {
                    actions.push({
                        kind: 'click_visible_control',
                        label: candidate.name,
                        control: { role: candidate.role, name: candidate.name, exact: true },
                    })
                }
            }
        }

        if (allowed.has('attach_fixture') && checkpoint.availableFixtures.length > 0) {
            const attach = page.getByRole('button', { name: 'Attach a file', exact: true })
            if (await isVisibleAndEnabled(attach)) {
                actions.push({
                    kind: 'attach_fixture',
                    label: 'Attach a file',
                    fixture_ids: checkpoint.availableFixtures.map((fixture) => fixture.id),
                })
            }
        }
        if (allowed.has('reload_page')) actions.push({ kind: 'reload_page', label: 'Reload page' })
        if (allowed.has('wait_for_visible_state')) actions.push({ kind: 'wait_for_visible_state', label: 'Wait for visible state' })
        if (allowed.has('end_trial')) actions.push({ kind: 'end_trial', label: 'End trial' })
        assertBound('Available action limit', actions.length, 16)

        const route = safeRoute(page.url())
        const availableFixtures = structuredClone(checkpoint.availableFixtures)
        const priorActions = structuredClone(checkpoint.priorActions)
        const remainingBudget = structuredClone(checkpoint.remainingBudget)
        const visibleState = {
            route,
            transcript,
            visible_regions: visibleRegions,
            available_actions: actions,
            available_fixtures: availableFixtures,
            prior_actions: priorActions,
            remaining_budget: remainingBudget,
            captured_at: checkpoint.capturedAt,
        }
        const visibleStateSha256 = createHash('sha256').update(JSON.stringify(visibleState)).digest('hex')

        const parsed = HumanObservationSchema.safeParse({
            contract: 'talos.human_journey.observation',
            schema_version: 1,
            trial_id: checkpoint.trialId,
            scenario_id: checkpoint.scenarioId,
            checkpoint_id: checkpoint.checkpointId,
            ...visibleState,
            visible_state_sha256: visibleStateSha256,
        })
        if (!parsed.success) {
            throw new Error(`Human observation contract rejected collected state: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`)
        }

        return parsed.data
    }
}
