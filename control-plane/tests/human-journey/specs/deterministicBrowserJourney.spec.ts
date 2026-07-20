import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { HumanJourneyScenarioSchema } from '../contracts'
import { TalosProductDriver } from '../driver/TalosProductDriver'
import { ScenarioRegistry } from '../scenarioRegistry'
import { DeterministicProviderFixtureClient } from '../support/httpFixtureClient'

interface PersonaJourney {
    id: 'novice_it' | 'hurried_typo_it' | 'skeptical_it'
    ordinaryOpening: string
    ordinaryFollowUp: string
    urlPrompt: (url: string) => string
    retryPrompt: string
    observePrompt: string
    screenshotPrompt: string
    postClickPrompt: string
    resumePrompt: string
}

const personaJourneys: readonly PersonaJourney[] = [
    {
        id: 'novice_it',
        ordinaryOpening: 'Ciao, sto preparando una prova semplice.',
        ordinaryFollowUp: 'Ti ricordi che sto preparando una prova semplice?',
        urlPrompt: (url) => `Puoi controllare ${url} e spiegarmi cosa contiene?`,
        retryPrompt: 'Puoi riprovare usando il link di prima?',
        observePrompt: 'Cosa vedi nella pagina adesso?',
        screenshotPrompt: 'Riesci a catturare uno screenshot?',
        postClickPrompt: 'Cosa e cambiato adesso nella pagina?',
        resumePrompt: 'Puoi continuare da dove eri rimasto?',
    },
    {
        id: 'hurried_typo_it',
        ordinaryOpening: 'ciao, sto facendo una prova veloce',
        ordinaryFollowUp: 'ti ricordi la prova veloce di prima?',
        urlPrompt: (url) => `${url} aprilo e dimmi cosa ce`,
        retryPrompt: 'riprova col link di prima',
        observePrompt: 'quindi cosa vedi adesso?',
        screenshotPrompt: 'screen?',
        postClickPrompt: 'ora cosa e cambiato nella pagina?',
        resumePrompt: 'continua quello di prima',
    },
    {
        id: 'skeptical_it',
        ordinaryOpening: 'Prima di iniziare, registra che questa e una verifica.',
        ordinaryFollowUp: 'Qual era lo scopo che ti ho appena indicato?',
        urlPrompt: (url) => `Verifica direttamente ${url} e separa i fatti dalle ipotesi.`,
        retryPrompt: 'Ritenta la stessa richiesta usando l URL precedente.',
        observePrompt: 'Descrivi soltanto cio che osservi nella pagina corrente.',
        screenshotPrompt: 'Cattura uno screenshot come prova visibile.',
        postClickPrompt: 'Verifica quale stato visibile risulta adesso nella pagina.',
        resumePrompt: 'Riprendi il risultato precedente senza perdere il contesto.',
    },
]

const requestedTrialCount = parseIntegerEnvironment('TALOS_HJ_TRIALS', 1, 25)
const baseSeed = parseIntegerEnvironment('TALOS_HJ_SEED', 0, 0xffff_ffff)
const lane = requiredEnvironment('TALOS_HJ_LANE')
const scenarioId = requiredEnvironment('TALOS_HJ_SCENARIO_ID')
const fixtureClient = new DeterministicProviderFixtureClient(
    requiredEnvironment('TALOS_HJ_PROVIDER_BASE_URL'),
    requiredEnvironment('TALOS_HJ_PROVIDER_CONTROL_TOKEN'),
)

test.skip(lane !== 'deterministic', 'The deterministic Browser journey runs only in the deterministic lane.')

for (let trialIndex = 0; trialIndex < requestedTrialCount; trialIndex += 1) {
    const persona = personaJourneys[trialIndex % personaJourneys.length]!
    const seed = deriveTrialSeed(baseSeed, trialIndex)

    test(`HJ5 ${persona.id} seed ${seed} completes the visible Browser journey`, async ({ page }) => {
        const registry = await ScenarioRegistry.load(fileURLToPath(new URL('../scenarios/browser-natural-v1.json', import.meta.url)))
        const scenario = HumanJourneyScenarioSchema.parse({
            ...registry.get(scenarioId),
            persona: {
                ...registry.get(scenarioId).persona,
                id: persona.id,
            },
        })
        test.setTimeout(scenario.budgets.max_duration_ms)
        await fixtureClient.reset()

        const driver = new TalosProductDriver(page, {
            loginEmail: requiredEnvironment('TALOS_HJ_LOGIN_EMAIL'),
            loginPassword: requiredEnvironment('TALOS_HJ_LOGIN_PASSWORD'),
            browserSiteOrigin: requiredEnvironment('TALOS_HJ_BROWSER_SITE_ORIGIN'),
            assistantTimeoutMs: Math.min(60_000, scenario.budgets.max_duration_ms),
        })

        await test.step('visible login and fresh chat', async () => {
            await driver.login()
            await driver.startNewChat()
        })

        await test.step('ordinary multi-turn chat keeps context', async () => {
            await driver.sendMessage(persona.ordinaryOpening)
            await driver.sendMessage(persona.ordinaryFollowUp)
            await driver.assertConversationContains([persona.ordinaryOpening, persona.ordinaryFollowUp])
        })

        await test.step('URL is sent with Browse off, then contextual retry uses the prior URL', async () => {
            await driver.assertBrowseInactive()
            await driver.sendMessage(persona.urlPrompt(driver.browserSiteOrigin))
            await driver.assertBrowseInactive()
            await driver.enableBrowse()
            const grounded = await driver.sendMessage(persona.retryPrompt)
            await expect(grounded).toContainText(/Evidenza browser verificata|TALOS deterministic catalog/i)
        })

        await test.step('grounded follow-up and natural screenshot render owned evidence', async () => {
            const observation = await driver.sendMessage(persona.observePrompt)
            await expect(observation).toContainText(/Evidenza browser verificata|TALOS deterministic catalog/i)
            const screenshotAnswer = await driver.sendMessage(persona.screenshotPrompt)
            await expect(screenshotAnswer).toContainText(/Screenshot verificato|screenshot/i)
            await driver.expectOwnedScreenshot()
        })

        const interaction = await test.step('lightbox click commits a new current frame', async () => {
            await driver.openLatestBrowserCapture()
            return driver.clickCurrentBrowserFrame(0.37, 0.57)
        })
        expect(interaction.afterArtifactId).not.toBe(interaction.beforeArtifactId)
        expect(interaction.pointerRequestCount).toBe(1)

        await test.step('post-click follow-up is grounded in current Browser state', async () => {
            const postClick = await driver.sendMessage(persona.postClickPrompt)
            await expect(postClick).toContainText(/Evidenza browser verificata|Cookie preferences accepted/i)
        })

        await test.step('reload and Browse off/on preserve unrelated conversation state', async () => {
            await driver.reloadWorkspace()
            await driver.assertBrowseActive()
            await driver.expectOwnedScreenshot(interaction.afterArtifactId)
            await driver.assertConversationContains([persona.ordinaryOpening, persona.screenshotPrompt])
            await driver.sendMessage(persona.resumePrompt)
            await driver.disableBrowse()
            await driver.assertBrowseInactive()
            await driver.enableBrowse()
            await driver.assertConversationContains([persona.ordinaryOpening, persona.resumePrompt])
        })

        await driver.assertTerminalState()
        await driver.assertForbiddenOutcomesAbsent()
    })
}

function requiredEnvironment(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} is required for the deterministic Human Journey.`)
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
