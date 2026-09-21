import { expect, test, type Page } from '@playwright/test'

const MENU = '[aria-label="Open menu"]'
const SIDEBAR = '[data-testid="talos-mobile-sidebar"]'
const SHEET = '[data-testid="talos-mobile-tool-sheet"]'
const COMPOSER_ROOT = '[data-testid="talos-mobile-composer"]'
const MOTION_NAMES = new Set([
    'talos-composer-layout-expand',
    'talos-composer-layout-collapse',
    'talos-settings-tab-change',
])

type MotionRecord = {
    name: string
    testId: string
    settingsPanel: string
    appearanceSection: string
    modelLabSection: string
    properties: string[]
}

test.use({
    storageState: {
        cookies: [],
        origins: [{
            origin: 'http://127.0.0.1:4173',
            localStorage: [{
                name: 'CapacitorStorage.talos.mobile.settings',
                value: JSON.stringify({
                    defaults_v3: true,
                    presentation_v2: true,
                    shell: {
                        immersive_header: true,
                        composer_drawer: true,
                        immersive_composer: true,
                    },
                    onboarding: {
                        intro_version: 4,
                        intro_outcome: 'completed',
                        setup_dismissed: true,
                    },
                }),
            }],
        }],
    },
})

async function installMotionRecorder(page: Page): Promise<void> {
    await page.addInitScript(() => {
        type RecordedWindow = Window & {
            __TALOS_MOTION_TEST_EVENTS__: MotionRecord[]
        }
        const targetWindow = window as RecordedWindow
        targetWindow.__TALOS_MOTION_TEST_EVENTS__ = []
        document.addEventListener('animationstart', (rawEvent) => {
            const event = rawEvent as AnimationEvent
            const target = event.target
            if (!(target instanceof HTMLElement)) return
            const animation = target.getAnimations().find((candidate) => (
                'animationName' in candidate
                && (candidate as CSSAnimation).animationName === event.animationName
            ))
            const frames = animation?.effect instanceof KeyframeEffect
                ? animation.effect.getKeyframes()
                : []
            const properties = [...new Set(frames.flatMap((frame) => Object.keys(frame))
                .filter((property) => ![
                    'offset',
                    'computedOffset',
                    'easing',
                    'composite',
                ].includes(property)))]

            targetWindow.__TALOS_MOTION_TEST_EVENTS__.push({
                name: event.animationName,
                testId: target.dataset.testid ?? '',
                settingsPanel: target.dataset.settingsPanel ?? '',
                appearanceSection: target.dataset.appearanceSection ?? '',
                modelLabSection: target.dataset.modelLabSection ?? '',
                properties,
            })
        }, true)
    })
}

async function records(page: Page): Promise<MotionRecord[]> {
    return page.evaluate(() => (
        window as typeof window & { __TALOS_MOTION_TEST_EVENTS__: MotionRecord[] }
    ).__TALOS_MOTION_TEST_EVENTS__)
}

async function clearRecords(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as typeof window & {
            __TALOS_MOTION_TEST_EVENTS__: MotionRecord[]
        }).__TALOS_MOTION_TEST_EVENTS__.length = 0
    })
}

async function waitForBoot(page: Page): Promise<void> {
    const boot = page.locator('[data-testid="talos-boot-logo"]')
    await boot.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined)
    await boot.waitFor({ state: 'detached', timeout: 15_000 })
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
}

async function openSettings(page: Page, tablet = false): Promise<void> {
    await page.locator(tablet ? '[data-testid="talos-tablet-menu"]' : MENU).click()
    await page.locator(`${SIDEBAR} [aria-label="Open Settings"]`).click()
    await expect(page.locator(SHEET)).toBeVisible()
}

function relevant(recordsValue: MotionRecord[]): MotionRecord[] {
    return recordsValue.filter((record) => MOTION_NAMES.has(record.name))
}

test('MOTION-E2E-01 phone composer and Settings transitions preserve focus and animate compositor properties only', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installMotionRecorder(page)
    await page.goto('/')
    await waitForBoot(page)

    const composer = page.getByLabel('Message TALOS')
    await clearRecords(page)
    await composer.focus()
    await expect.poll(async () => relevant(await records(page))
        .some((record) => record.name === 'talos-composer-layout-expand')).toBe(true)
    await expect(composer).toBeFocused()

    await composer.evaluate((element) => (element as HTMLElement).blur())
    await expect.poll(async () => relevant(await records(page))
        .some((record) => record.name === 'talos-composer-layout-collapse')).toBe(true)
    await expect(composer).not.toBeFocused()

    await openSettings(page)
    await clearRecords(page)
    const appearanceTrigger = page.locator('[data-settings-tab="appearance"]')
    await appearanceTrigger.click()
    const detailPane = page.getByTestId('settings-detail-pane')
    await expect(detailPane).toBeVisible()
    await expect.poll(() => page.evaluate(() => (
        document.activeElement?.getAttribute('data-testid')
    ))).toBe('settings-detail-pane')
    await expect.poll(async () => relevant(await records(page))
        .some((record) => (
            record.name === 'talos-settings-tab-change'
            && record.testId === 'settings-detail-pane'
        ))).toBe(true)

    await clearRecords(page)
    await page.getByRole('tab', { name: 'Motion', exact: true }).click()
    await expect(page.locator('[data-appearance-section="motion"]')).toBeVisible()
    await expect.poll(async () => relevant(await records(page))
        .some((record) => record.appearanceSection === 'motion')).toBe(true)

    await clearRecords(page)
    await page.getByTestId('talos-sheet-back').click()
    const categoryPane = page.getByTestId('settings-category-pane')
    await expect(categoryPane).toBeVisible()
    await expect.poll(() => page.evaluate(() => (
        document.activeElement?.getAttribute('data-settings-tab')
    ))).toBe('appearance')
    await expect.poll(async () => relevant(await records(page))
        .some((record) => (
            record.name === 'talos-settings-tab-change'
            && record.testId === 'settings-category-pane'
        ))).toBe(true)

    const unexpectedProperties = relevant(await records(page))
        .flatMap((record) => record.properties)
        .filter((property) => !['transform', 'opacity'].includes(property))
    expect(unexpectedProperties).toEqual([])
    await expect(page.locator(COMPOSER_ROOT)).toBeVisible()
})

test('MOTION-E2E-02 tablet Settings keeps activation focus on the selected category trigger', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await installMotionRecorder(page)
    await page.goto('/')
    await waitForBoot(page)
    await openSettings(page, true)

    await clearRecords(page)
    const appearanceTrigger = page.locator('[data-settings-tab="appearance"]')
    await appearanceTrigger.click()
    await expect(appearanceTrigger).toBeFocused()
    await expect(page.locator('[data-settings-panel="appearance"]')).toBeVisible()
    await expect.poll(async () => relevant(await records(page))
        .some((record) => record.settingsPanel === 'appearance')).toBe(true)
})

test('MOTION-E2E-03 reduced motion applies final state immediately without interaction animations', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await installMotionRecorder(page)
    await page.goto('/')
    await waitForBoot(page)

    const composer = page.getByLabel('Message TALOS')
    await clearRecords(page)
    await composer.focus()
    await expect(composer).toBeFocused()
    await expect(page.locator(COMPOSER_ROOT).getByLabel('Choose model profile')).toBeVisible()
    expect(relevant(await records(page))).toEqual([])

    await openSettings(page)
    await clearRecords(page)
    /*
     * ⛔ Si porta la voce SOTTO GLI OCCHI prima di toccarla.
     *
     * Le impostazioni sono una lista lunga dentro uno scorrevole. La voce
     * si trova nel DOM ma non diventa mai «visible, enabled and stable»
     * per Playwright, che aspetta sessanta secondi e poi rinuncia — pur
     * essendo cliccabile, come ho verificato sondando la pagina viva.
     */
    await page.locator('[data-settings-tab="appearance"]').scrollIntoViewIfNeeded()
    await page.locator('[data-settings-tab="appearance"]').click()
    await expect(page.getByTestId('settings-detail-pane')).toBeVisible()
    await expect.poll(() => page.evaluate(() => (
        document.activeElement?.getAttribute('data-testid')
    ))).toBe('settings-detail-pane')
    expect(relevant(await records(page))).toEqual([])
    await expect.poll(() => page.evaluate(() => (
        document.getAnimations().filter((animation) => (
            'animationName' in animation
            && [
                'talos-composer-layout-expand',
                'talos-composer-layout-collapse',
                'talos-settings-tab-change',
            ].includes((animation as CSSAnimation).animationName)
        )).length
    ))).toBe(0)
})
