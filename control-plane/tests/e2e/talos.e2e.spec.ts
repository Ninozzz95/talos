import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { capturePaintedTransition, expectPaintedTransition, rgbaDifferenceRatio } from './helpers/talosVisibleMotion'
import { waitForTalosWorkspaceReady as waitForWorkspaceReady } from './helpers/talosWorkspaceReady'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const talosThemePresetCount = 12
const talosMotionV6Defaults = {
    schema_version: 1,
    mode: 'adaptive',
    background_enabled: true,
    interface_enabled: true,
    scene_override: null,
    speed: 100,
    intensity: 65,
    glow_intensity: 0,
    density: 100,
    depth: 50,
    trails: 35,
    contrast: 60,
    parallax: 20,
    quality: 'adaptive',
    fps_cap: 30,
    dpr_cap: 1.25,
    pause_when_hidden: true,
    respect_data_saver: true,
    interface: {
        profile: 'preset',
        duration_scale: 50,
        intensity: 65,
        easing: 'precise',
        stagger: 40,
        categories: {
            windows: true,
            surfaces: true,
            navigation: true,
            composer: true,
            messages: true,
            feedback: true,
        },
    },
} as const

const talosMotionV6SubtleMigration = {
    ...talosMotionV6Defaults,
    mode: 'simple',
    speed: 75,
    intensity: 40,
} as const

const talosMotionV6Complex = {
    ...talosMotionV6Defaults,
    mode: 'complex',
    speed: 140,
    intensity: 85,
} as const

function hasExactMotionV6(
    preferences: Record<string, unknown> | undefined,
    expected: Record<string, unknown> = talosMotionV6Defaults,
) {
    return JSON.stringify(preferences?.theme_motion_v6) === JSON.stringify(expected)
}

function hasSettingsExpectedRevision(body: Record<string, unknown>) {
    return body.expected_revision === undefined
        || (Number.isSafeInteger(body.expected_revision) && Number(body.expected_revision) >= 0)
}

function settingsPatchBody(request: { postDataJSON: () => unknown }) {
    const body = request.postDataJSON() as Record<string, unknown>
    if (body.expected_revision !== undefined) {
        expect(hasSettingsExpectedRevision(body)).toBe(true)
    }
    return body
}

async function patchTalosSettings(page: Page, preferences: Record<string, unknown>) {
    await page.evaluate(async (nextPreferences) => {
        const currentResponse = await fetch('/api/talos/settings', { headers: { Accept: 'application/json' } })
        const currentPayload = await currentResponse.json() as { data?: { revision?: unknown } }
        const expectedRevision = currentPayload.data?.revision
        const hasRevision = Number.isSafeInteger(expectedRevision) && Number(expectedRevision) >= 0

        const response = await fetch('/api/talos/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                ...(hasRevision ? { expected_revision: expectedRevision } : {}),
                preferences: nextPreferences,
            }),
        })
        if (!response.ok) throw new Error(`Settings patch failed with ${response.status}.`)
        const payload = await response.json() as { data?: { revision?: unknown } }
        if (hasRevision && payload.data?.revision !== Number(expectedRevision) + 1) {
            throw new Error('Settings PATCH did not return the next revision.')
        }
    }, preferences)
}

async function expectNoHorizontalOverflow(page: Page) {
    const result = await page.evaluate(() => {
        const root = document.documentElement
        const overflow = Math.ceil(root.scrollWidth) - Math.ceil(root.clientWidth)

        if (overflow <= 1) {
            return { overflow, offenders: [] }
        }

        const viewportWidth = root.clientWidth
        const offenders = Array.from(document.querySelectorAll('body *')).flatMap((element) => {
            const rect = element.getBoundingClientRect()

            if (rect.right <= viewportWidth + 0.5 && rect.left >= -0.5) {
                return []
            }

            return [{
                tag: element.tagName.toLowerCase(),
                className: String(element.getAttribute('class') ?? '').slice(0, 160),
                text: String(element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
            }]
        }).slice(0, 5)

        return { overflow, offenders }
    })

    expect(result.overflow, JSON.stringify(result.offenders, null, 2)).toBeLessThanOrEqual(1)
}

async function expectProceduralBackgroundComposition(page: Page) {
    const composition = await page.getByTestId('talos-motion-background').evaluate((root) => {
        const canvas = root.querySelector('.talos-procedural-canvas') as HTMLElement | null
        const glow = root.querySelector('.talos-theme-background-glow') as HTMLElement | null
        const scrim = root.querySelector('.talos-theme-background-scrim') as HTMLElement | null
        const thread = document.querySelector('.talos-chat-thread') as HTMLElement | null

        return {
            hasCanvas: Boolean(canvas),
            hasGlow: Boolean(glow),
            hasScrim: Boolean(scrim),
            glowZIndex: glow ? Number(window.getComputedStyle(glow).zIndex) : null,
            scrimZIndex: scrim ? Number(window.getComputedStyle(scrim).zIndex) : null,
            scrimBackgroundImage: scrim ? window.getComputedStyle(scrim).backgroundImage : null,
            threadBackgroundImage: thread ? window.getComputedStyle(thread).backgroundImage : null,
        }
    })

    expect(composition.hasCanvas).toBe(true)
    expect(composition.hasGlow).toBe(true)
    expect(composition.hasScrim).toBe(true)
    expect(composition.scrimBackgroundImage).toContain('linear-gradient')
    expect(composition.scrimZIndex).toBeGreaterThan(composition.glowZIndex ?? Number.MAX_SAFE_INTEGER)
    expect(composition.threadBackgroundImage).toBe('none')
}

function workspaceMotionBackground(page: Page) {
    return page.getByTestId('talos-motion-background')
}

function workspaceMotionStage(page: Page) {
    return workspaceMotionBackground(page).locator('[data-talos-motion-stage]')
}

function workspaceMotionCanvas(page: Page) {
    return workspaceMotionBackground(page).getByTestId('talos-procedural-canvas')
}

async function expectProceduralCanvasFrameChanges(page: Page) {
    const canvas = workspaceMotionCanvas(page)
    await expect(canvas).toHaveCount(1)

    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL()), {
        timeout: 2500,
        intervals: [180, 240, 360, 520, 800],
    }).not.toBe(firstFrame)
}

async function expectProceduralCanvasFrameStaysStill(page: Page) {
    const canvas = workspaceMotionCanvas(page)
    await expect(canvas).toHaveCount(1)

    const firstFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())
    await page.waitForTimeout(360)
    const secondFrame = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())

    expect(secondFrame).toBe(firstFrame)
}

async function readSimpleMotionFrame(page: Page) {
    return workspaceMotionStage(page).evaluate((stage) => (
        Array.from(stage.querySelectorAll<HTMLElement>('.talos-v6-simple-layer')).map((layer) => {
            const style = window.getComputedStyle(layer)
            return [layer.dataset.talosMotionLayerRole ?? '', style.transform, style.opacity].join(':')
        }).join('|')
    ))
}

async function expectSimpleMotionFrameChanges(page: Page) {
    const stage = workspaceMotionStage(page)
    await expect(stage).toHaveAttribute('data-active-kind', 'simple')
    expect(await stage.locator('.talos-v6-simple-layer').count()).toBeGreaterThan(0)
    const firstFrame = await readSimpleMotionFrame(page)
    await expect.poll(() => readSimpleMotionFrame(page), {
        timeout: 2500,
        intervals: [180, 240, 360, 520, 800],
    }).not.toBe(firstFrame)
}

async function expectStaticMotionFrameStaysStill(page: Page) {
    const stage = workspaceMotionStage(page)
    await expect(stage).toHaveAttribute('data-active-kind', 'static')
    expect(await stage.locator('.talos-v6-simple-layer').count()).toBeGreaterThan(0)
    const firstFrame = await readSimpleMotionFrame(page)
    await page.waitForTimeout(360)
    expect(await readSimpleMotionFrame(page)).toBe(firstFrame)
}

async function expectProceduralCanvasHasVisibleSignal(page: Page) {
    const canvas = workspaceMotionCanvas(page)
    await expect(canvas).toHaveCount(1)

    const signal = await canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement
        const context = target.getContext('2d')

        if (!context) {
            return {
                hasContext: false,
                alphaCoverageRatio: 0,
                maxAlpha: 0,
            }
        }

        const data = context.getImageData(0, 0, target.width, target.height).data
        const sampleStep = 16 * 4
        let sampleCount = 0
        let alphaCoveredSampleCount = 0
        let maxAlpha = 0

        for (let index = 0; index < data.length; index += sampleStep) {
            const alpha = data[index + 3]

            sampleCount += 1
            if (alpha === 0) continue
            alphaCoveredSampleCount += 1
            maxAlpha = Math.max(maxAlpha, alpha)
        }

        return {
            hasContext: true,
            alphaCoverageRatio: alphaCoveredSampleCount / Math.max(1, sampleCount),
            maxAlpha,
        }
    })

    expect(signal.hasContext).toBe(true)
    expect(signal.alphaCoverageRatio, JSON.stringify(signal)).toBeGreaterThan(0)
    expect(signal.maxAlpha, JSON.stringify(signal)).toBeGreaterThan(0)
}

async function expectProceduralBackgroundVisiblyChanges(page: Page) {
    const background = page.getByTestId('talos-motion-background')
    await expect(background).toBeVisible()
    const clip = await background.evaluate((element) => {
        const rect = element.getBoundingClientRect()

        return {
            x: Math.max(0, Math.floor(rect.x)),
            y: Math.max(0, Math.floor(rect.y)),
            width: Math.max(1, Math.floor(rect.width)),
            height: Math.max(1, Math.floor(rect.height)),
        }
    })

    const firstFrame = await page.screenshot({ clip })
    await page.waitForTimeout(420)
    const secondFrame = await page.screenshot({ clip })

    expect(secondFrame.equals(firstFrame)).toBe(false)
}

async function expectNoComposerOverlap(page: Page) {
    const result = await page.evaluate(() => {
        const composer = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()

        if (!composer) {
            return { missingComposer: true, overlaps: [] }
        }

        const overlaps = Array.from(document.querySelectorAll('.talos-tool-window, [data-testid="talos-mobile-tool-sheet"]')).flatMap((element) => {
            const rect = element.getBoundingClientRect()
            const clippingStage = element.closest('[data-testid="talos-desktop-window-stage"]')?.getBoundingClientRect()
            const visibleRect = clippingStage
                ? {
                    top: Math.max(rect.top, clippingStage.top),
                    bottom: Math.min(rect.bottom, clippingStage.bottom),
                    left: Math.max(rect.left, clippingStage.left),
                    right: Math.min(rect.right, clippingStage.right),
                }
                : rect
            const intersects = visibleRect.bottom > visibleRect.top
                && visibleRect.right > visibleRect.left
                && visibleRect.bottom > composer.top - 8
                && visibleRect.top < composer.bottom + 8
                && visibleRect.right > composer.left
                && visibleRect.left < composer.right

            if (!intersects) {
                return []
            }

            const style = window.getComputedStyle(element)
            const stage = element.closest('[data-testid="talos-desktop-window-stage"]')?.getBoundingClientRect()

            return [{
                label: String(element.getAttribute('aria-label') ?? '').trim(),
                dataHeight: element.getAttribute('data-window-height'),
                cssHeight: style.height,
                cssMinHeight: style.minHeight,
                cssTransform: style.transform,
                heightToken: (element as HTMLElement).style.getPropertyValue('--talos-window-height'),
                minHeightToken: (element as HTMLElement).style.getPropertyValue('--talos-window-min-height'),
                xToken: (element as HTMLElement).style.getPropertyValue('--talos-window-x'),
                yToken: (element as HTMLElement).style.getPropertyValue('--talos-window-y'),
                stage: stage ? { top: Math.round(stage.top), bottom: Math.round(stage.bottom), height: Math.round(stage.height) } : null,
                windowTop: Math.round(rect.top),
                windowBottom: Math.round(rect.bottom),
                composerTop: Math.round(composer.top),
            }]
        })

        return { missingComposer: false, overlaps }
    })

    expect(result.missingComposer).toBe(false)
    expect(result.overlaps, JSON.stringify(result.overlaps, null, 2)).toEqual([])
}

async function expectWorkspaceFullscreenCoverage(page: Page, windowId: string) {
    const geometry = await page.evaluate((id) => {
        const windowElement = document.querySelector<HTMLElement>(`[data-window-id="${id}"]`)
        const stage = document.querySelector<HTMLElement>('[data-testid="talos-desktop-window-stage"]')
        const composer = document.querySelector<HTMLElement>('.talos-chat-composer-shell')
        const header = document.querySelector<HTMLElement>('.talos-workspace-header')
        if (!windowElement || !stage || !composer || !header) return null

        const rect = windowElement.getBoundingClientRect()
        const stageRect = stage.getBoundingClientRect()
        const composerRect = composer.getBoundingClientRect()
        const headerRect = header.getBoundingClientRect()

        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            stageLeft: stageRect.left,
            stageTop: stageRect.top,
            stageRight: stageRect.right,
            stageBottom: stageRect.bottom,
            coversComposer: rect.bottom > composerRect.top,
            coversHeader: rect.top <= headerRect.top && rect.bottom >= headerRect.bottom,
        }
    }, windowId)

    expect(geometry).not.toBeNull()
    expect(Math.abs(geometry!.left - geometry!.stageLeft)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry!.top - geometry!.stageTop)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry!.right - geometry!.stageRight)).toBeLessThanOrEqual(1)
    expect(Math.abs(geometry!.bottom - geometry!.stageBottom)).toBeLessThanOrEqual(1)
    expect(geometry!.coversComposer).toBe(true)
    expect(geometry!.coversHeader).toBe(true)
}

async function selectDashboardTab(page: Page, name: string) {
    const moduleName = {
        Agents: 'Model Lab',
        Knowledge: 'Library',
        Benchmarks: 'Compare',
        Runtime: 'Runtime',
        Productivity: 'Tasks',
        Admin: 'Doctor',
    }[name] ?? name
    const matcher = new RegExp(moduleName)
    const tab = page.getByRole('tab', { name: matcher }).first()

    if (await tab.isVisible().catch(() => false)) {
        await tab.click()
        return
    }

    const moduleButton = page.getByRole('button', { name: moduleName, exact: true }).first()
    if (!await moduleButton.isVisible().catch(() => false) && ['Tasks', 'Doctor'].includes(moduleName)) {
        await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    }
    await moduleButton.click()
}

async function chooseModelProfile(page: Page, profileId = 'profile-e2e') {
    await page.getByRole('button', { name: 'Choose model profile' }).click()
    await page.getByLabel('Server-side model profile').selectOption(profileId)
}

async function chooseContextSet(page: Page, contextSetId = 'context-set-e2e') {
    await page.getByRole('button', { name: 'Choose grounding context' }).click()
    await page.getByLabel('Grounding context set').selectOption(contextSetId)
}

async function clickMessageAction(scope: Page | Locator, name: string) {
    const action = scope.locator(`[aria-label="${name}"]`).first()
    const inlineAction = action.filter({ visible: true })
    if (await inlineAction.isVisible().catch(() => false)) {
        await inlineAction.click()
        return
    }

    const owner = action.locator('xpath=ancestor::*[@data-message-id][1]')
    await owner.getByRole('button', { name: 'More message actions', exact: true }).filter({ visible: true }).click()
    const menu = owner.getByRole('menu', { name: 'More message actions', exact: true }).filter({ visible: true })
    await expect(menu).toBeVisible()
    await menu.getByRole('menuitem', { name, exact: true }).click()
}

async function expandAdvancedRail(page: Page) {
    const knowledgeButton = page.getByRole('button', { name: 'Knowledge', exact: true })
    if (!await knowledgeButton.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    }
    await expect(knowledgeButton).toBeVisible()
}

async function expectUnifiedWorkspaceChrome(page: Page) {
    const header = page.getByTestId('talos-workspace-header')
    await expect(header).toBeVisible()
    await expect(header.getByRole('heading', { name: 'TALOS', exact: true })).toHaveCount(0)
    await expect(header.locator('.talos-short-logo')).toHaveCount(0)
    await expect(header.getByText('Ready for verified workflows', { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-testid="talos-workspace"], .talos-workspace').first()).toBeVisible()
    await expect(page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()

    await expandAdvancedRail(page)

    for (const name of ['New Chat', 'Knowledge', 'Brain', 'Compare', 'Artifacts', 'Notes', 'Settings', 'Doctor']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }

    await expect(page.getByText('No server-side model profiles')).toBeHidden()
    await expect(page.getByText('No Context Vault sets')).toBeHidden()
    await expect(page.locator('input[aria-label*="Provider API key" i], input[placeholder*="Provider API key" i]')).toBeHidden()
}

async function attachWorkspaceScreenshot(page: Page, testInfo: TestInfo, routeName: string) {
    await testInfo.attach(`talos-workspace-${routeName}-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
}

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function openWorkspace(page: Page) {
    if (await page.getByLabel('Message TALOS').isVisible().catch(() => false)) {
        await waitForWorkspaceReady(page)
        return
    }

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
}

async function submitLogin(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })

    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) {
        return false
    }

    await form.getByLabel('Email').fill(email)
    await form.getByLabel('Password').fill(password)
    await Promise.all([
        page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
        form.getByRole('button', { name: 'Sign in' }).click(),
    ])

    return isAuthenticatedWorkspace(page)
}

async function ensureTalosAuthenticated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    if (await isAuthenticatedWorkspace(page)) {
        await waitForWorkspaceReady(page)
        return
    }

    await page.goto('/setup', { waitUntil: 'domcontentloaded' })

    const setupForm = page.locator('#talos-setup-form')
    if (await setupForm.isVisible().catch(() => false)) {
        await setupForm.getByLabel('Name').fill('TALOS E2E Admin')
        await setupForm.getByLabel('Email').fill(e2eSetupEmail)
        await setupForm.getByLabel('Password', { exact: true }).fill(e2eSetupPassword)
        await setupForm.getByLabel('Confirm password').fill(e2eSetupPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded', timeout: 4_000 }).catch(() => undefined),
            setupForm.getByRole('button', { name: 'Create first admin' }).click(),
        ])

        if (await isAuthenticatedWorkspace(page)) {
            await waitForWorkspaceReady(page)
            return
        }
    }

    const credentials = [
        [e2eLoginEmail, e2eLoginPassword],
        [e2eSetupEmail, e2eSetupPassword],
    ] as const

    for (const [email, password] of credentials) {
        if (await submitLogin(page, email, password)) {
            await waitForWorkspaceReady(page)
            return
        }
    }

    throw new Error('TALOS E2E could not authenticate through setup or login.')
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await ensureTalosAuthenticated(page)
})

test('guest users see the auth gate before the TALOS workspace', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('#talos-workspace-root')).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'TALOS' })).toBeVisible()
        await expect(page.getByText(/Sign in with a Laravel operator account|Create the first local administrator/)).toBeVisible()
        await expect(page.getByRole('link', { name: 'Back to TALOS' })).toHaveCount(0)
    } finally {
        await context.close()
    }
})

test('root is the canonical TALOS workspace and legacy routes redirect to it', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await attachWorkspaceScreenshot(page, testInfo, 'root')
    await expectUnifiedWorkspaceChrome(page)
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-background-poster')).toHaveCount(0)
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'forge')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'forge')
    await expectNoHorizontalOverflow(page)

    for (const routePath of ['/chat', '/dashboard'] as const) {
        await page.goto(routePath, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/$/)
        await expectUnifiedWorkspaceChrome(page)
    }
})

test('notes loads retrieval context through the strict API mock', async ({ page }) => {
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Advanced', exact: true }).click()

    const retrievalContextResponse = page.waitForResponse((response) => (
        response.url().includes('/api/talos/notes/retrieval-context?')
        && response.request().method() === 'GET'
    ))
    await page.getByRole('button', { name: 'Notes', exact: true }).first().click()

    const response = await retrievalContextResponse
    expect(response.status()).toBe(200)

    const notesWindow = page.locator('[data-window-id="notes"]')
    await expect(notesWindow).toBeVisible()
    await expect(notesWindow.getByText('trust_level: untrusted.', { exact: false })).toBeVisible()
    await expect(notesWindow.getByText('UNHANDLED_E2E_API_MOCK', { exact: true })).toBeHidden()
})

test('notes and tasks form fields have distinct accessible names', async ({ page, isMobile }) => {
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Advanced', exact: true }).click()

    await page.getByRole('button', { name: 'Notes', exact: true }).first().click()
    const notesWindow = page.locator('[data-window-id="notes"]')
    await expect(notesWindow.locator('label[for="talos-note-title"]')).toHaveCount(1)
    await expect(notesWindow.locator('label[for="talos-note-content"]')).toHaveCount(1)
    expect(await notesWindow.locator('label[for="talos-note-title"]').evaluate((label) => (label as HTMLLabelElement).control?.id)).toBe('talos-note-title')
    expect(await notesWindow.locator('label[for="talos-note-content"]').evaluate((label) => (label as HTMLLabelElement).control?.id)).toBe('talos-note-content')
    await expect(notesWindow.getByRole('textbox', { name: 'Note title', exact: true })).toBeVisible()
    await expect(notesWindow.getByRole('textbox', { name: 'Note content', exact: true })).toBeVisible()
    expect((await notesWindow.locator('label[for="talos-note-title"]').boundingBox())?.width ?? 0).toBeGreaterThan(24)
    expect((await notesWindow.locator('label[for="talos-note-content"]').boundingBox())?.width ?? 0).toBeGreaterThan(24)

    if (isMobile) {
        await notesWindow.getByRole('button', { name: 'Close Notes' }).click()
        await expect(notesWindow).toHaveCount(0)
        await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    }

    await page.getByRole('button', { name: 'Tasks', exact: true }).first().click()
    const tasksWindow = page.locator('[data-window-id="tasks"]')
    await expect(tasksWindow.locator('label[for="talos-task-title"]')).toHaveCount(1)
    await expect(tasksWindow.locator('label[for="talos-task-description"]')).toHaveCount(1)
    expect(await tasksWindow.locator('label[for="talos-task-title"]').evaluate((label) => (label as HTMLLabelElement).control?.id)).toBe('talos-task-title')
    expect(await tasksWindow.locator('label[for="talos-task-description"]').evaluate((label) => (label as HTMLLabelElement).control?.id)).toBe('talos-task-description')
    await expect(tasksWindow.getByRole('textbox', { name: 'Task title', exact: true })).toBeVisible()
    await expect(tasksWindow.getByRole('textbox', { name: 'Task description', exact: true })).toBeVisible()
    expect((await tasksWindow.locator('label[for="talos-task-title"]').boundingBox())?.width ?? 0).toBeGreaterThan(24)
    expect((await tasksWindow.locator('label[for="talos-task-description"]').boundingBox())?.width ?? 0).toBeGreaterThan(24)
})

test('floating windows enter real fullscreen across the workspace width', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'mobile modules use the in-place sheet contract without fullscreen controls')
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Artifacts', exact: true }).click()
    const artifactWindow = page.locator('[data-window-id="gallery"]')
    await expect(artifactWindow).toBeVisible()
    await expect.poll(async () => artifactWindow.getAttribute('data-window-transition')).toBe('idle')

    await artifactWindow.getByRole('button', { name: 'Fullscreen Artifacts' }).click()
    await expect(artifactWindow).toHaveAttribute('data-window-fullscreen', 'true')
    await expect.poll(async () => artifactWindow.getAttribute('data-window-transition')).toBe('idle')

    const metrics = await artifactWindow.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const rail = document.querySelector('[aria-label="TALOS workspace rail"]')?.getBoundingClientRect()
        const railWidth = rail?.width ?? 0

        return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            expectedMinWidth: Math.round(window.innerWidth - railWidth - 48),
        }
    })

    expect(metrics.left).toBeLessThanOrEqual(280)
    expect(metrics.right).toBeGreaterThan(1200)
    expect(metrics.width, JSON.stringify(metrics)).toBeGreaterThanOrEqual(metrics.expectedMinWidth)
})

test('workspace exposes real persistent chat history', async ({ page, isMobile }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    const openMobileHistory = async () => {
        if (!isMobile) return
        await page.getByRole('button', { name: 'Open chat history' }).click()
        await expect(page.getByRole('button', { name: 'Close chat history' })).toBeVisible()
    }
    const closeMobileHistory = async () => {
        if (!isMobile) return
        await page.getByRole('button', { name: 'Close chat history' }).click()
        await expect(page.getByRole('button', { name: 'Close chat history' })).toHaveCount(0)
    }
    const history = page.getByTestId('talos-session-history')
    await openMobileHistory()
    await expect(history).toBeVisible()
    await expect(history).toContainText('New chat')
    await closeMobileHistory()

    await page.getByLabel('Message TALOS').fill('Investigate missing history rail')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
    await openMobileHistory()
    await expect(history).toContainText('Investigate missing history rail')
    await closeMobileHistory()

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    await openMobileHistory()
    await expect(history.getByRole('button', { name: 'Open chat New chat', exact: true })).toBeVisible()
    await history.getByRole('button', { name: 'Open chat Investigate missing history rail', exact: true }).click()
    await expect(page.getByLabel('TALOS chat thread').getByText('Investigate missing history rail')).toBeVisible()
})

test('workspace command feedback uses one dismissible status toast', async ({ page }) => {
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByRole('option', { name: /New session/ }).click()

    const toast = page.getByRole('status').filter({ hasText: 'New session opened.' })
    await expect(toast).toHaveCount(1)
    await expect(toast).toBeVisible()
    await toast.getByRole('button', { name: 'Dismiss notification' }).click()
    await expect(toast).toHaveCount(0)
})

test('left rail chat items expose connected management actions', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop session management is exposed by the desktop rail')
    await installTalosApiMocks(page, {
        initialSessions: [
            {
                id: 'session-manage-e2e',
                title: 'Managed chat',
                messages: [
                    {
                        role: 'user',
                        content: 'Original managed prompt',
                        metadata: { source: 'e2e-source' },
                    },
                    {
                        role: 'assistant',
                        content: 'Original managed answer',
                        run_id: 'run-e2e',
                        metadata: { source: 'talos_chat_proxy' },
                    },
                ],
            },
            { id: 'session-archive-e2e', title: 'Archived source' },
        ],
    })
    const copiedMessageRequests: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.url().includes('/api/talos/sessions/session-e2e/messages') && request.method() === 'POST') {
            copiedMessageRequests.push(request.postDataJSON() as Record<string, unknown>)
        }
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const history = page.getByTestId('talos-session-history')
    await expect(history).toBeVisible()
    await expect(history).toContainText('Managed chat')

    await history.getByRole('button', { name: 'Chat actions for Managed chat' }).click()
    await expect(page.getByRole('menu', { name: 'Chat actions' })).toBeVisible()

    const renameRequest = page.waitForRequest((request) => request.url().includes('/api/talos/sessions/session-manage-e2e') && request.method() === 'PATCH')
    await page.getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByLabel('Rename chat').fill('Renamed managed chat')
    await page.getByRole('button', { name: 'Save name' }).click()
    await renameRequest
    await expect(history).toContainText('Renamed managed chat')

    await history.getByRole('button', { name: 'Chat actions for Renamed managed chat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Favorite' }).click()
    await expect(history.getByText('Favorites')).toBeVisible()
    await expect(history.getByTestId('talos-session-folder-favorites')).toContainText('Renamed managed chat')

    await history.getByRole('button', { name: 'Chat actions for Renamed managed chat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Copy Chat' }).click()
    await expect(history).toContainText('Renamed managed chat copy')
    await expect.poll(() => copiedMessageRequests.length).toBe(2)
    expect(copiedMessageRequests.some((request) => Object.prototype.hasOwnProperty.call(request, 'run_id'))).toBe(false)
    expect(copiedMessageRequests[1].metadata).toMatchObject({
        source: 'talos_chat_copy',
        copied_from_session_id: 'session-manage-e2e',
        copied_from_run_id: 'run-e2e',
    })

    await history.getByRole('button', { name: 'Chat actions for Renamed managed chat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Move to folder' }).click()
    await page.getByLabel('Folder name').fill('Ops')
    await page.getByRole('button', { name: 'Move chat' }).click()
    const opsGroup = history.getByTestId('talos-session-folder-Ops')
    await expect(opsGroup).toContainText('Renamed managed chat')

    await opsGroup.getByRole('button', { name: 'Chat actions for Renamed managed chat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Archive' }).click()
    const archivedGroup = history.getByTestId('talos-session-folder-archived')
    await expect(archivedGroup).toContainText('Renamed managed chat')

    let nativeDeleteDialogOpened = false
    page.once('dialog', async (dialog) => {
        nativeDeleteDialogOpened = true
        await dialog.dismiss()
    })
    await archivedGroup.getByRole('button', { name: 'Chat actions for Renamed managed chat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete chat' })
    await expect(deleteDialog).toBeVisible()
    await expect(deleteDialog).toContainText('Renamed managed chat')
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(deleteDialog).toHaveCount(0)
    expect(nativeDeleteDialogOpened).toBe(false)

    await archivedGroup.getByRole('button', { name: 'Chat actions for Renamed managed chat', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('dialog', { name: 'Delete chat' }).getByRole('button', { name: 'Delete chat', exact: true }).click()
    await expect(history.getByRole('button', { name: 'Open chat Renamed managed chat', exact: true })).toHaveCount(0)
    await expect(history).toContainText('Renamed managed chat copy')
})

test('chat action menu escapes the scroll container and remains inside the viewport', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop session actions are exposed by the desktop rail')
    await installTalosApiMocks(page, {
        initialSessions: Array.from({ length: 14 }, (_, index) => ({
            id: `session-menu-layer-${index}`,
            title: `Layered chat ${index + 1}`,
        })),
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const history = page.getByTestId('talos-session-history')
    await history.getByRole('button', { name: 'Chat actions for Layered chat 1', exact: true }).click()

    const menu = page.getByRole('menu', { name: 'Chat actions' })
    await expect(menu).toBeVisible()
    await expect.poll(() => menu.evaluate((element) => element.closest('[data-testid="talos-session-history"]') === null)).toBe(true)
    await expect.poll(() => menu.evaluate((element) => window.getComputedStyle(element).position)).toBe('fixed')

    const geometry = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect()

        return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        }
    })

    expect(geometry.left).toBeGreaterThanOrEqual(8)
    expect(geometry.top).toBeGreaterThanOrEqual(8)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth - 8)
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 8)
})

test('left rail and empty chat brand remain polished without duplicating branding in the header', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop rail branding is covered by the desktop project')

    await openWorkspace(page)
    await expandAdvancedRail(page)

    const knowledgeButton = page.getByRole('button', { name: 'Knowledge', exact: true })
    await expect(knowledgeButton).toBeVisible()
    await expect.poll(async () => knowledgeButton.evaluate((element) => window.getComputedStyle(element).cursor)).toBe('pointer')

    const railBrand = page.getByTestId('talos-rail-brand')
    await expect(railBrand).toBeVisible()
    const brandMetrics = await railBrand.evaluate((element) => {
        const logo = element.querySelector('[data-testid="talos-rail-brand-logo"]')?.getBoundingClientRect()
        const copy = element.querySelector('[data-testid="talos-rail-brand-copy"]')?.getBoundingClientRect()

        return {
            hasLogo: Boolean(logo),
            hasCopy: Boolean(copy),
            logoLeft: Math.round(logo?.left ?? 0),
            copyLeft: Math.round(copy?.left ?? 0),
            logoCenterY: Math.round((logo?.top ?? 0) + ((logo?.height ?? 0) / 2)),
            copyCenterY: Math.round((copy?.top ?? 0) + ((copy?.height ?? 0) / 2)),
        }
    })
    expect(brandMetrics.hasLogo).toBe(true)
    expect(brandMetrics.hasCopy).toBe(true)
    expect(brandMetrics.logoLeft).toBeLessThan(brandMetrics.copyLeft)
    expect(Math.abs(brandMetrics.logoCenterY - brandMetrics.copyCenterY), JSON.stringify(brandMetrics)).toBeLessThanOrEqual(10)

    const emptyBrandLogo = page.getByTestId('talos-empty-brand').locator('.talos-short-logo').first()
    const logoSizes = await page.evaluate(() => {
        const empty = document.querySelector('[data-testid="talos-empty-brand"] .talos-short-logo')?.getBoundingClientRect()

        return {
            emptyWidth: Math.round(empty?.width ?? 0),
        }
    })
    await expect(emptyBrandLogo).toBeVisible()
    expect(logoSizes.emptyWidth, JSON.stringify(logoSizes)).toBeGreaterThanOrEqual(64)
    await expect(page.getByTestId('talos-workspace-header').locator('.talos-short-logo')).toHaveCount(0)
})

test('header account label opens settings directly on account tab', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: /Open account settings for/i }).click()

    const settingsWindow = page.locator('[data-window-id="settings"]')
    await expect(settingsWindow).toBeVisible()
    await expect(settingsWindow.getByRole('tab', { name: 'Account', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(settingsWindow.getByText('Authenticated Laravel operator session.')).toBeVisible()
})

test('desktop header action labels stay inside disjoint controls', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop header geometry is covered by the desktop project')
    await openWorkspace(page)

    const header = page.getByTestId('talos-workspace-header')
    const metrics = await header.locator('button').evaluateAll((buttons) => buttons
        .filter((button) => {
            const style = window.getComputedStyle(button)
            return style.display !== 'none' && style.visibility !== 'hidden'
        })
        .map((button) => {
            const rect = button.getBoundingClientRect()

            return {
                label: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                clientWidth: button.clientWidth,
                scrollWidth: button.scrollWidth,
            }
        }))

    expect(metrics.length).toBeGreaterThanOrEqual(4)
    for (const control of metrics) {
        expect(control.scrollWidth, JSON.stringify(control)).toBeLessThanOrEqual(control.clientWidth + 1)
    }
    for (let index = 1; index < metrics.length; index++) {
        const previous = metrics[index - 1]
        const current = metrics[index]
        const overlaps = previous.left < current.right
            && previous.right > current.left
            && previous.top < current.bottom
            && previous.bottom > current.top

        expect(overlaps, JSON.stringify({ previous, current })).toBe(false)
    }
})

test('chat loads, sends a deterministic persisted turn, and stays keyboard reachable', async ({ page, isMobile }, testInfo) => {
    await openWorkspace(page)

    await expect(page.getByRole('heading', { name: /^(What workflow should TALOS handle\?|What claim should we benchmark\?)$/ })).toBeVisible()
    await expect(page.getByTestId('talos-empty-brand')).toContainText('TALOS')
    await expect(page.getByTestId('talos-empty-brand').locator('.talos-short-logo-mark')).toBeVisible()
    if (isMobile) {
        await expect(page.getByRole('region', { name: 'TALOS guided start' })).toHaveCount(0)
    } else {
        await expect(page.getByRole('region', { name: 'TALOS guided start' })).toBeVisible()
        await expect(page.getByText('Model linked', { exact: true })).toBeVisible()
        await expect(page.getByText('Context optional', { exact: true })).toBeVisible()
        await expect(page.getByText('Session staged', { exact: true })).toBeVisible()
        await expect(page.getByText('Evidence pending', { exact: true })).toBeVisible()
    }
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose model profile' })).toContainText('E2E server-side profile')
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveAttribute('title', 'Type a workflow in the composer before sending.')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('send message')
    await expect(page.getByRole('option', { name: /Send message/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText('Type a workflow in the composer before sending.')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByLabel('Message TALOS').fill('Create a replayable file audit workflow.')
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('send message')
    await expect(page.getByRole('option', { name: /Send message/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Send message/ }).click()

    await expect(page.locator('p').filter({ hasText: 'Create a replayable file audit workflow.' })).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
    await expect(page.getByText('1 JMP')).toBeVisible()
    await expect(page.getByText('Persisted', { exact: true })).toBeVisible()
    await clickMessageAction(page, 'Open evidence')
    await expect(page.getByText('Run evidence', { exact: true })).toBeVisible()
    await expect(page.getByText('Run run-e2e', { exact: true })).toBeVisible()
    await expect(page.getByText('Model openai / gpt-e2e', { exact: true })).toBeVisible()
    await expect(page.getByText('Status succeeded', { exact: true })).toBeVisible()
    await expect(page.getByText('1 mutation', { exact: true })).toBeVisible()
    await expect(page.getByText('Sources 0', { exact: true })).toBeVisible()
    await expect(page.getByText('Only safe provenance is shown here. Local storage paths and raw extracted content stay out of chat.')).toBeVisible()
    const benchmarkFromRun = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/runs/run-e2e/benchmark') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.runs === 1
    })
    await clickMessageAction(page, 'Compare AVM ON/OFF')
    await benchmarkFromRun
    await expect(page.getByText('Benchmark run created for run-e2e. Group: benchmark-group-from-run-e2e. Open Compare to inspect persisted AVM ON/OFF lanes.')).toBeVisible()
    await expect(page.getByText('E2E benchmark from chat run')).toBeVisible()
    await expect(page.getByText('AVM ON from chat run')).toBeVisible()
    await expect(page.getByText('Chat run benchmark preserved replayable AVM evidence.')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`chat-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('chat repairs a stale local model selection and submits with Enter', async ({ page }) => {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        initialSettings: { default_model_profile_id: null },
    })
    await page.evaluate(() => {
        localStorage.setItem('talos_workspace_preferences', JSON.stringify({
            model_profile_id: 'deleted-model-profile',
            model_routing_profile_id: '',
            context_set_id: '',
        }))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Submit this repaired model selection with Enter.')
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
    await composer.press('Enter')

    await expect(page.locator('.talos-chat-thread').getByText('Submit this repaired model selection with Enter.', { exact: true })).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
})

test('chat provider failures render typed recovery guidance instead of generic errors', async ({ page }) => {
    await openWorkspace(page)
    await page.route('**/api/talos/chat', async (route) => {
        await route.fulfill({
            status: 502,
            contentType: 'application/json',
            body: JSON.stringify({
                error: 'Provider chat failed.',
                message: 'DeepSeek rejected the configured credential.',
                chat_error: {
                    layer: 'provider',
                    code: 'PROVIDER_AUTHENTICATION_FAILED',
                    message: 'DeepSeek rejected the configured credential.',
                    next_action: 'Open Model Lab, update the DeepSeek server-side profile secret, then run Test before sending again.',
                    retryable: false,
                    status: 401,
                    provider: 'deepseek',
                    model: 'deepseek-chat',
                },
                run: {
                    id: 'run-provider-auth-failed-e2e',
                },
            }),
        })
    }, { times: 1 })

    await page.getByLabel('Message TALOS').fill('Use DeepSeek for this request.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const systemMessage = page.locator('[data-message-role="system"]').last()
    const controlledFault = systemMessage.getByTestId('talos-controlled-fault')
    await expect(controlledFault).toHaveAttribute('role', 'alert')
    await expect(controlledFault).toHaveAttribute('data-fault-layer', 'provider')
    await expect(controlledFault).toHaveAttribute('data-fault-code', 'PROVIDER_AUTHENTICATION_FAILED')
    await expect(controlledFault).toContainText('Provider failure')
    await expect(controlledFault).toContainText('DeepSeek rejected the configured credential.')
    await expect(controlledFault).toContainText('Open Model Lab, update the DeepSeek server-side profile secret, then run Test before sending again.')
    await expect(controlledFault).toContainText('deepseek / deepseek-chat')
    await expect(controlledFault).toContainText('Manual action required')
    await expect(controlledFault).not.toContainText('{"layer"')
    await expect(page.getByText('TALOS chat failed after your prompt was saved.')).toHaveCount(0)
})

test('composer slash commands open real TALOS modules and keep unavailable actions disabled', async ({ page }) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('/')
    const slashMenu = page.getByTestId('talos-slash-command-menu')
    await expect(slashMenu).toBeVisible()
    await expect(page.getByRole('listbox', { name: 'Composer slash commands' })).toBeVisible()
    await expect.poll(async () => slashMenu.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-composer-popover-in')
    await expect(page.getByRole('option', { name: /\/model/ })).toContainText('Open model center')
    await expect(page.getByRole('option', { name: /\/doctor/ })).toContainText('Open doctor')
    await expect(page.getByRole('option', { name: /\/recover/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText('Select a failed node in the dashboard timeline.')).toBeVisible()
    await expect(page.getByRole('option', { name: /\/send\s+Send message/ })).toHaveCount(0)

    await page.getByRole('option', { name: /\/model/ }).click()
    await expect(page.locator('[data-window-id="model_lab"]')).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toHaveValue('')

    await page.getByLabel('Message TALOS').fill('/doctor')
    await expect(page.getByRole('listbox', { name: 'Composer slash commands' })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-window-id="doctor"]')).toBeVisible()
})

test('composer model and context popovers animate from the chat field', async ({ page }) => {
    await openWorkspace(page)

    const modelTrigger = page.getByRole('button', { name: 'Choose model profile' }).filter({ visible: true }).first()
    await modelTrigger.click()
    const modelPopover = page.getByTestId('talos-model-popover')
    await expect(modelPopover).toBeVisible()
    await expect.poll(async () => modelPopover.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-composer-popover-in')

    await page.keyboard.press('Escape')
    await expect(modelPopover).toBeHidden()
    await expect(modelTrigger).toBeFocused()

    await page.getByRole('button', { name: 'Choose grounding context' }).click()
    const contextPopover = page.getByTestId('talos-context-popover')
    await expect(contextPopover).toBeVisible()
    await expect.poll(async () => contextPopover.evaluate((element) => window.getComputedStyle(element).animationName)).toContain('talos-composer-popover-in')

    await page.getByTestId('talos-workspace-header').click({ position: { x: 4, y: 4 } })
    await expect(contextPopover).toBeHidden()

    await page.getByLabel('Message TALOS').fill('Improve this prompt without changing its intent.')
    const enhanceTrigger = page.getByRole('button', { name: 'Improve prompt' })
    await enhanceTrigger.click()
    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeHidden()
    await expect(enhanceTrigger).toBeFocused()

    await expectNoHorizontalOverflow(page)
})

test('message actions copy, reuse, resend, and retry through explicit chat controls', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8014' })
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Create a replayable file audit workflow.')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await page.getByRole('button', { name: 'Copy message' }).first().click()
    await expect(page.getByText('Message copied.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Create a replayable file audit workflow.')

    await clickMessageAction(page, 'Reuse prompt')
    await expect(page.getByLabel('Message TALOS')).toHaveValue('Create a replayable file audit workflow.')
    await expect(page.getByText('Prompt loaded for reuse.')).toBeVisible()

    const resendMessageRequest = page.waitForRequest((request) => {
        if (!request.url().includes('/api/talos/sessions/session-e2e/messages') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown> | undefined

        return body.role === 'user'
            && metadata?.command_id === 'resend_message'
            && metadata?.resend_of_message_id === 'message-e2e-1'
    })
    await page.getByRole('button', { name: 'Resend message' }).click()
    await resendMessageRequest
    await expect(page.getByText('Message resent through TALOS chat.')).toBeVisible()

    const retryMessageRequest = page.waitForRequest((request) => {
        if (!request.url().includes('/api/talos/sessions/session-e2e/messages') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown> | undefined

        return body.role === 'user'
            && metadata?.command_id === 'retry_assistant_response'
            && metadata?.retry_of_message_id === 'message-e2e-2'
            && metadata?.resend_of_message_id === 'message-e2e-1'
    })
    await page.getByRole('button', { name: 'Retry assistant response' }).first().click()
    await retryMessageRequest
    await expect(page.getByText('Assistant response retried through TALOS chat.')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toHaveCount(3)
})

test('assistant messages render safe structured Markdown with copyable bounded code', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8014' })
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        initialSessions: [{
            id: 'session-markdown-e2e',
            title: 'Structured answer',
            messages: [{
                role: 'assistant',
                content: `## Verified result

Use **two sources**.

- parent
  - [ ] open child
    - [x] completed grandchild

| State | Count |
| --- | ---: |
| Success | 2 |

\`\`\`php
${'x'.repeat(2000)}
\`\`\`

[Same origin](/settings) [Evidence](https://example.com)

![Remote screenshot](https://fabricated.example/private.png)

<img src=x onerror=alert(1)>
<iframe src="https://evil.example"></iframe>
<object data="https://evil.example"></object>
<form action="https://evil.example"><input></form>
<style>body { background: red }</style>
<div onclick="alert(1)">unsafe</div>`,
            }],
        }],
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openWorkspace(page)

    const content = page.getByTestId('talos-message-content').last()
        await expect(content.getByRole('heading', { name: 'Verified result', level: 2 })).toBeVisible()
        await expect(content.locator('strong')).toHaveText('two sources')
        await expect(content.getByRole('table')).toBeVisible()
        await expect(content.getByRole('region', { name: 'Scrollable message table' })).toBeVisible()
        await expect(content.getByRole('img', { name: 'Completed task' })).toBeVisible()
        await expect(content.getByRole('img', { name: 'Open task' })).toBeVisible()
        await expect(content.locator('img, form, input, script, iframe, object, style, [onclick]')).toHaveCount(0)
        await expect(content.getByText('External image omitted: Remote screenshot', { exact: true })).toBeVisible()
        await expect(content).not.toContainText('fabricated.example')
        await expect(content.getByRole('link', { name: 'Evidence' })).toHaveAttribute('rel', 'noopener noreferrer')
        await expect(content.getByRole('link', { name: 'Evidence' })).toHaveAttribute('target', '_blank')
        await expect(content.getByRole('link', { name: 'Same origin' })).not.toHaveAttribute('target')

        const code = content.locator('pre')
        await expect(code).toHaveAttribute('tabindex', '0')
        await expect(content.getByText('php', { exact: true })).toBeVisible()
        await expect(code).toHaveCSS('overflow-y', 'auto')
        await expect(code).toHaveCSS('overflow-x', 'auto')
        await code.focus()
        await expect(code).toBeFocused()
        await content.getByRole('button', { name: 'Copy code' }).click()
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('x'.repeat(2000))
        await expectNoHorizontalOverflow(page)
})

test('settings boolean preferences render as accessible switch controls', async ({ page, isMobile }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'AI Defaults' }).click()
    const visionSwitch = page.getByRole('switch', { name: 'Vision routing preference' })
    await expect(visionSwitch).toBeVisible()
    const initialVisionState = await visionSwitch.isChecked()
    await page.getByText('Vision routing preference', { exact: true }).click()
    await expect(visionSwitch).toBeChecked({ checked: !initialVisionState })
    const visionPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const aiDefaults = preferences?.ai_defaults as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && aiDefaults?.vision_enabled === !initialVisionState
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await visionPatchRequest

    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByText('Theme Motion Engine V6', { exact: true })).toBeVisible()
    await expect(page.getByText('Background, interface motion, performance policy and preview are managed from one canonical editor.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open Theme Engine', exact: true }).click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
    await expect(page.getByText('Motion Engine V6', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Motion', exact: true }).last()).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Close Theme', exact: true }).click()
    await expect(page.locator('[data-window-id="theme"]')).toHaveCount(0)
    if (isMobile) {
        await page.getByRole('button', { name: 'Settings', exact: true }).click()
        await page.getByRole('tab', { name: 'Appearance' }).click()
    }
    await page.getByRole('tab', { name: 'Visibility' }).click()
    await expect(page.getByRole('switch', { name: 'Brand name' })).toBeVisible()

    await page.getByRole('tab', { name: 'Agent Tools' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Runtime tool policy is read-only until the planner consumes these limits.' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Code tools' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Open Tool Registry' })).toBeEnabled()

    await page.getByRole('tab', { name: 'Reminders' }).click()
    await expect(page.getByText('Reminder delivery settings are read-only until a delivery worker advertises readiness.')).toBeVisible()
    await expect(page.getByLabel('Reminder channel')).toBeDisabled()
    await expect(page.getByLabel('Public app URL')).toBeDisabled()
    await expect(page.getByRole('switch', { name: 'AI synthesis for reminder text' })).toBeDisabled()
})

test('google integration shows connected account without exposing tokens', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: /Integrations/ }).click()

    await expect(page.getByText('Google Workspace')).toBeVisible()
    await expect(page.getByText('operator@example.test')).toBeVisible()
    await expect(page.getByText(/Access token|Refresh token|encrypted_/i)).toHaveCount(0)
})

test('dashboard loads cockpit panels and opens the command palette', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await expectUnifiedWorkspaceChrome(page)

    await selectDashboardTab(page, 'Agents')
    await expect(page.getByText('Model Center', { exact: true })).toBeVisible()
    const modelProfile = page.getByRole('button', { name: /E2E server-side profile/ })
    await expect(modelProfile).toContainText('AVM compatibility A')
    await expect(modelProfile).toContainText('JSON')
    await expect(modelProfile).toContainText('Tools')
    await expect(modelProfile).toContainText('Embeddings')
    await expect(modelProfile).toContainText('Remote')
    await expect(modelProfile).toContainText('Vision unavailable')
    await expect(page.getByText('sk-')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await selectDashboardTab(page, 'Knowledge')
    const libraryWindow = page.locator('[data-window-id="library"]')
    const librarySectionTabs = libraryWindow.getByTestId('talos-window-section-tabs-library')
    await expect(libraryWindow.getByTestId('talos-window-section-library-context').getByText('Context Vault', { exact: true })).toBeVisible()
    await librarySectionTabs.getByRole('tab', { name: 'Documents', exact: true }).click()
    await expect(librarySectionTabs.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await page.getByLabel('Search TALOS commands').fill('send message')
    await expect(page.getByRole('option', { name: /Send message/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await expect(page.getByText('Type a workflow in the composer before sending.')).toBeVisible()

    await page.getByLabel('Search TALOS commands').fill('new session')
    await expect(page.getByRole('option', { name: /New session/ })).toHaveAttribute('aria-disabled', 'false')
    const commandSessionRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/sessions')
        && request.method() === 'POST'
        && request.postDataJSON().title === 'New chat'
    ))
    await page.getByRole('option', { name: /New session/ }).click()
    await commandSessionRequest
    await expect(page.getByText('New session opened.')).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('model center')
    await page.getByRole('option', { name: /Open model center/ }).click()
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeHidden()
    await expect(page.getByText('Model Center', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('attach file')
    await expect(page.getByRole('option', { name: /Attach file/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Attach file/ }).click()
    await expect(librarySectionTabs.getByRole('tab', { name: 'Context Vault', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(libraryWindow.getByTestId('talos-window-section-library-context').getByText('Context Vault', { exact: true })).toBeVisible()
    await expect(page.locator('input[type="file"]')).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('trace replay')
    await expect(page.getByRole('option', { name: /Open trace replay/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Open trace replay/ }).click()
    await expect(page.getByRole('tab', { name: 'Trace replay' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Timeline' }).click()
    await expect(page.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('trace replay')
    await page.getByRole('option', { name: /Open trace replay/ }).click()
    await expect(page.getByRole('tab', { name: 'Trace replay' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('audit log')
    await expect(page.getByRole('option', { name: /Open audit log/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Open audit log/ }).click()
    const doctorWindow = page.locator('[data-window-id="doctor"]')
    const doctorSectionTabs = doctorWindow.getByTestId('talos-window-section-tabs-doctor')
    await expect(doctorSectionTabs.getByRole('tab', { name: 'Audit', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('talos-admin-section-audit')).toBeVisible()
    await expect(page.getByTestId('talos-admin-section-audit')).toContainText('Redacted security events')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('open doctor')
    await page.getByRole('option', { name: /Open doctor/ }).click()
    await expect(doctorSectionTabs.getByRole('tab', { name: 'Doctor', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('talos-admin-section-doctor')).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('policy panel')
    await page.getByRole('option', { name: /Open policy panel/ }).click()
    await expect(page.getByTestId('talos-admin-section-policy')).toBeVisible()
    await expect(page.getByTestId('talos-admin-section-policy')).toContainText('Capability boundary')

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('backup panel')
    await page.getByRole('option', { name: /Open backup panel/ }).click()
    await expect(page.getByTestId('talos-admin-section-backup')).toBeVisible()
    await expect(page.getByTestId('talos-admin-section-backup')).toContainText('Dry-run restore policy')
    await expect(page.getByTestId('talos-admin-section-backup').getByRole('button', { name: 'Validate restore dry-run' })).toBeDisabled()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('email triage')
    await page.getByRole('option', { name: /Open email triage/ }).click()
    const tasksWindow = page.locator('[data-window-id="tasks"]')
    const tasksSectionTabs = tasksWindow.getByTestId('talos-window-section-tabs-tasks')
    await expect(tasksSectionTabs.getByRole('tab', { name: 'Email', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('talos-productivity-section-email-triage')).toBeVisible()
    await expect(page.getByTestId('talos-productivity-section-email-triage')).toContainText('Read-only and draft-only')
    await expect(page.getByTestId('talos-productivity-section-email-triage')).toContainText('send_enabled false')
    await expect(page.getByTestId('talos-productivity-section-email-triage').getByRole('button', { name: 'Create draft' })).toBeDisabled()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('open tasks')
    await page.getByRole('option', { name: /Open tasks/ }).click()
    await expect(tasksSectionTabs.getByRole('tab', { name: 'Tasks', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(tasksWindow.getByTestId('talos-window-section-tasks-tasks')).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('send email draft')
    await expect(page.getByRole('option', { name: /Send email draft/ })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText('Email send is disabled until HMI confirmation and audit exist.')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeHidden()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`dashboard-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('model center offers provider-first quick add with optional draft test', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Agents')

    await expect(page.getByText('Provider-first model setup', { exact: true })).toBeVisible()
    const quickAdd = page.getByTestId('talos-model-quick-add')

    for (const provider of ['OpenAI', 'DeepSeek', 'Anthropic', 'Google Gemini', 'OpenRouter', 'Ollama Local']) {
        await expect(quickAdd.getByRole('button', { name: `Choose ${provider} provider` })).toBeVisible()
    }

    await quickAdd.getByRole('button', { name: 'Choose OpenRouter provider' }).click()
    await expect(quickAdd.getByLabel('Provider API key')).toBeVisible()
    await expect(quickAdd.getByLabel('Model name')).toBeHidden()
    await expect(quickAdd.getByLabel('Base URL')).toBeHidden()

    await quickAdd.getByLabel('Provider API key').fill('sk-openrouter-e2e-secret')
    await expect(quickAdd.getByRole('button', { name: 'Add profile' })).toBeEnabled()
    await quickAdd.getByRole('button', { name: 'Advanced options' }).click()
    await expect(quickAdd.getByLabel('Timeout seconds')).toBeVisible()
    await quickAdd.getByLabel('Timeout seconds').fill('45')
    const draftProbeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/model-profiles/probe-draft') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.provider === 'openrouter'
            && body.secret === 'sk-openrouter-e2e-secret'
            && body.model === 'openai/gpt-4.1-mini'
            && body.base_url === 'https://openrouter.ai/api/v1'
            && body.timeout_seconds === 45
    })

    await quickAdd.getByRole('button', { name: 'Test', exact: true }).click()
    await draftProbeRequest
    await expect(quickAdd.getByText('Draft probe healthy').first()).toBeVisible()

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/model-profiles') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.provider === 'openrouter'
            && body.secret === 'sk-openrouter-e2e-secret'
            && body.model === 'openai/gpt-4.1-mini'
            && body.base_url === 'https://openrouter.ai/api/v1'
            && body.timeout_seconds === 45
    })
    await quickAdd.getByRole('button', { name: 'Add profile' }).click()
    await createRequest

    const openRouterProfile = page.getByRole('button').filter({ hasText: 'OpenRouter quick profile' })
    await expect(openRouterProfile).toBeVisible()
    await expect(openRouterProfile.getByText('Secret stored server-side.')).toBeVisible()
    await expect(page.getByText('sk-openrouter-e2e-secret')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await quickAdd.getByRole('button', { name: 'Choose Ollama Local provider' }).click()
    await expect(quickAdd.getByLabel('Local endpoint')).toBeVisible()
    await expect(quickAdd.getByLabel('Provider API key')).toBeHidden()
    await expect(page.getByText('Local providers are allowed only without bearer tokens.')).toBeVisible()

    await testInfo.attach(`model-center-quick-add-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })

    await page.getByRole('button', { name: 'Close Model Lab' }).click()
    await page.getByRole('button', { name: 'Choose model profile' }).click()
    await expect(page.getByLabel('Server-side model profile').locator('option', { hasText: 'OpenRouter quick profile' })).toHaveCount(1)
})

test('model center can save a provider profile after a failed optional draft probe', async ({ page }) => {
    await page.route('**/api/talos/model-profiles/probe-draft', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                data: {
                    status: 'failed',
                    result: {
                        ok: false,
                        code: 'PROVIDER_HTTP_ERROR',
                        message: 'Provider rejected the test request.',
                    },
                },
            }),
        })
    })

    await openWorkspace(page)
    await selectDashboardTab(page, 'Agents')

    const quickAdd = page.getByTestId('talos-model-quick-add')
    await quickAdd.getByRole('button', { name: 'Choose OpenRouter provider' }).click()
    await quickAdd.getByLabel('Provider API key').fill('sk-openrouter-e2e-secret')
    await expect(quickAdd.getByRole('button', { name: 'Add profile' })).toBeEnabled()

    await quickAdd.getByRole('button', { name: 'Test', exact: true }).click()
    await expect(quickAdd.getByText('Draft probe failed').first()).toBeVisible()
    await expect(quickAdd.getByText('Provider rejected the test request.').first()).toBeVisible()
    await expect(quickAdd.getByRole('button', { name: 'Add profile' })).toBeEnabled()

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/model-profiles') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.provider === 'openrouter'
            && body.secret === 'sk-openrouter-e2e-secret'
            && body.status === 'untested'
    })

    await quickAdd.getByRole('button', { name: 'Add profile' }).click()
    await createRequest
    await expect(page.getByRole('button').filter({ hasText: 'OpenRouter quick profile' })).toBeVisible()
})

test('cookbook model lab shows hardware scan fit score and preview-only commands', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')
    await page.getByRole('button', { name: /Model Lab|Cookbook/ }).click()

    const modelLab = page.locator('[data-window-id="model_lab"]')
    await expect(modelLab.getByRole('heading', { name: 'Model Lab', exact: true })).toBeVisible()
    await modelLab.getByRole('tab', { name: 'Cookbook', exact: true }).click()
    await expect(modelLab.getByText('Hardware scan', { exact: true })).toBeVisible()
    await expect(modelLab.getByText('Fit score', { exact: true })).toBeVisible()

    await modelLab.getByRole('tab', { name: 'Download' }).click()
    const previewRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/cookbook/download-preview')
        && request.method() === 'POST'
    ))
    await page.getByRole('button', { name: /Preview download command/ }).click()
    await previewRequest
    await expect(page.getByText('Dry-run preview')).toBeVisible()
    await expect(page.getByText('No host command has been executed.')).toBeVisible()

    await testInfo.attach('cookbook-model-lab.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('settings window loads safe preferences and persists theme through the settings API', async ({ page }, testInfo) => {
    test.setTimeout(130_000)

    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Keep focus in the composer.')
    await page.keyboard.press('Control+K')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()
    await expect(page.getByText('Workspace defaults, model behavior and operator preferences from /api/talos/settings.')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'AI Defaults' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Search' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByText('api_key')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await page.getByRole('tab', { name: 'Search' }).click()
    await expect(page.getByText('Search execution settings are read-only until a search worker advertises readiness.')).toBeVisible()
    await expect(page.getByLabel('Search provider')).toBeDisabled()
    await expect(page.getByLabel('Results per query')).toBeDisabled()
    await expect(page.getByLabel('Search endpoint URL')).toBeDisabled()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Presets' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Customize' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Video backgrounds' })).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-preview-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-preview-poster')).toHaveCount(talosThemePresetCount)
    const themePosters = page.getByTestId('talos-theme-preview-poster')
    for (let index = 0; index < talosThemePresetCount; index += 1) {
        const poster = themePosters.nth(index)
        await poster.scrollIntoViewIfNeeded()
        await expect.poll(() => poster.evaluate((image) => (
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
        ))).toBe(true)
    }
    const posterSources = await themePosters.evaluateAll((images) => (
        images.map((image) => (image as HTMLImageElement).getAttribute('src'))
    ))
    expect(new Set(posterSources).size).toBe(talosThemePresetCount)
    expect(posterSources).toContain('/talos/backgrounds/violet-poster.webp')
    expect(posterSources).toContain('/talos/backgrounds/claudius-poster.webp')
    expect(posterSources).toContain('/talos/backgrounds/basicus-poster.webp')
    await expect(page.locator('[data-testid="talos-theme-preset"]')).toHaveCount(talosThemePresetCount)
    await expect(page.locator('[data-testid="talos-theme-preview-swatch"]')).toHaveCount(talosThemePresetCount)
    const forgeActionMotion = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    const terminalThemePreset = page.getByRole('button', { name: 'Terminal Operator' })
    await expect(terminalThemePreset).toContainText('Motion V6')
    const themePatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme === 'terminal'
    })
    await terminalThemePreset.click()
    await themePatchRequest
    await expect(page.getByText('Theme saved through /api/talos/settings.')).toBeVisible()
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    const terminalActionMotion = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    expect(terminalActionMotion).not.toEqual(forgeActionMotion)
    expect(terminalActionMotion).toMatchObject({
        surface: 'scanline',
        feedback: 'trace',
        hover: 'underline',
    })
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-background-poster')).toHaveCount(0)
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'terminal')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.locator('[data-talos-motion-stage]')).toHaveAttribute('data-scene-id', 'terminal')
    await expect(page.locator('[data-talos-motion-stage]')).toHaveAttribute('data-active-kind', 'complex')

    await page.getByRole('tab', { name: 'Customize' }).click()
    await expect(page.getByText('Workspace customization', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Background effect')).toHaveCount(0)
    await expect(page.getByLabel('Effect intensity')).toHaveCount(0)
    await page.getByLabel('Font', { exact: true }).selectOption('serif')
    await page.getByLabel('Density').selectOption('spacious')
    await page.getByLabel('Corner radius').selectOption('soft')
    const customizationPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && customization?.font === 'serif'
            && customization?.density === 'spacious'
            && customization?.radius === 'soft'
            && !Object.prototype.hasOwnProperty.call(customization, 'effect')
            && !Object.prototype.hasOwnProperty.call(customization, 'effect_intensity')
    })
    await page.getByRole('button', { name: 'Save customization' }).click()
    await customizationPatchRequest
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-density-spacious/)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-radius-soft/)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-font-ui:\s*"Source Serif 4"/)
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'terminal')
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByText('Theme customization saved through /api/talos/settings.')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-density-spacious/)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-radius-soft/)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-font-ui:\s*"Source Serif 4"/)
    await expect(page.getByTestId('talos-theme-background-video')).toHaveCount(0)
    await expect(page.getByTestId('talos-theme-background-poster')).toHaveCount(0)
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'terminal')
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const auroraPreset = page.getByRole('button', { name: 'Aurora Research' })
    const presetResetPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme === 'aurora'
            && customization !== undefined
            && Object.keys(customization).length === 0
    })
    await auroraPreset.click()
    await presetResetPatchRequest
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-aurora/)
    await expect(page.locator('.talos-shell')).not.toHaveAttribute('style', /--talos-font-ui:\s*"Source Serif 4"/)
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'aurora')
    const auroraActionMotion = await page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)

        return {
            surface: style.getPropertyValue('--talos-motion-surface-style').trim(),
            feedback: style.getPropertyValue('--talos-motion-feedback-style').trim(),
            hover: style.getPropertyValue('--talos-motion-hover-style').trim(),
        }
    })
    expect(auroraActionMotion).toMatchObject({
        surface: 'scale-fade',
        feedback: 'pulse',
        hover: 'node-glow',
    })
    const auroraAccent = await page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-accent').trim()
    ))
    expect(auroraAccent).toBe('#42e7c7')

    await testInfo.attach(`settings-theme-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('theme engine V6 manages custom themes, live preview, motion, area tokens and import export', async ({ page }, testInfo) => {
    test.setTimeout(120_000)

    await openWorkspace(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByLabel('Accent color').fill('#7c3aed')
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-accent:\s*#7c3aed/)

    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.locator('.talos-shell')).not.toHaveAttribute('style', /#7c3aed/)

    await page.getByLabel('Font', { exact: true }).selectOption('mono')
    const saveNamedThemeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && Array.isArray(library)
            && library.some((theme) => theme.name === 'Ninox Dark' && (theme.tokens as Record<string, unknown> | undefined)?.font === 'mono')
            && typeof preferences?.active_custom_theme_id === 'string'
            && customization?.font === 'mono'
    })
    await page.getByRole('button', { name: 'Save as theme' }).click()
    await page.getByLabel('Theme name').fill('Ninox Dark')
    await page.getByRole('button', { name: 'Create theme' }).click()
    await saveNamedThemeRequest
    await expect(page.getByText('Ninox Dark', { exact: true })).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Library' }).click()
    await expect(page.getByText('Ninox Dark', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Export active theme' }).click()
    const exportedTheme = await page.getByTestId('talos-theme-export-json').inputValue()
    const parsedExportedTheme = JSON.parse(exportedTheme) as Record<string, unknown>
    expect(parsedExportedTheme).toMatchObject({
        schema: 'talos_theme_export_v2',
        theme: {
            name: 'Ninox Dark',
            motion_v6: { schema_version: 1 },
        },
    })
    expect((parsedExportedTheme.theme as Record<string, unknown>).motion_v6).toEqual(talosMotionV6Defaults)
    expect(parsedExportedTheme.theme).not.toHaveProperty('motion')
    expect(parsedExportedTheme.theme).not.toHaveProperty('ui_animation_profile')
    expect(parsedExportedTheme.theme).not.toHaveProperty('ui_animation_customization')

    await page.getByLabel('Import theme JSON').fill('{bad json')
    await page.getByRole('button', { name: 'Import theme' }).click()
    await expect(page.getByText('TALOS rejected this theme import.')).toBeVisible()

    await page.getByLabel('Import theme JSON').fill('{"schema":"wrong","theme":{"name":"Bad"}}')
    await page.getByRole('button', { name: 'Import theme' }).click()
    await expect(page.getByText('TALOS rejected this theme import.')).toBeVisible()

    await page.getByLabel('Import theme JSON').fill(JSON.stringify({
        schema: 'talos_theme_export_v1',
        exported_at: '2026-07-08T12:00:00.000Z',
        theme: {
            id: 'imported-e2e',
            name: 'Imported Mint',
            base_theme: 'aurora',
            tokens: {
                font: 'mono',
            },
            motion: 'subtle',
            chat_layout: {
                bubble_scale: 'expanded',
                composer_mode: 'minimal',
                advanced_rail_expanded: true,
            },
        },
    }))
    const importThemeRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH'
    ))
    await page.getByRole('button', { name: 'Import theme' }).click()
    const importedPreferences = settingsPatchBody(await importThemeRequest).preferences as Record<string, unknown>
    const importedLibrary = importedPreferences.theme_library as Array<Record<string, unknown>>
    expect(importedLibrary.some((theme) => theme.name === 'Imported Mint')).toBe(true)
    expect(importedPreferences.theme_motion_v6).toEqual(talosMotionV6SubtleMigration)
    expect(importedPreferences).not.toHaveProperty('theme_motion')
    expect(importedPreferences).not.toHaveProperty('ui_animation_profile')
    expect(importedPreferences).not.toHaveProperty('ui_animation_customization')
    expect(importedPreferences.chat_layout).toMatchObject({
        bubble_scale: 'expanded',
        composer_mode: 'minimal',
        advanced_rail_expanded: true,
    })
    await expect(page.getByText('Imported Mint', { exact: true })).toBeVisible()
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Expanded')
    await expect(page.getByRole('button', { name: 'Use full composer' })).toBeVisible()

    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
    await expect(page.getByText('Live product preview', { exact: true })).toBeVisible()

    const motionOffRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Off', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const motionOffPreferences = settingsPatchBody(await motionOffRequest).preferences as Record<string, unknown>
    expect(motionOffPreferences.theme_motion_v6).toEqual({ ...talosMotionV6SubtleMigration, mode: 'off' })
    expect(motionOffPreferences).not.toHaveProperty('theme_motion')
    expect(motionOffPreferences).not.toHaveProperty('ui_animation_profile')
    expect(motionOffPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'off')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'off')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'aurora')
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)

    const motionComplexRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Complex', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const motionComplexPreferences = settingsPatchBody(await motionComplexRequest).preferences as Record<string, unknown>
    expect(motionComplexPreferences.theme_motion_v6).toEqual({ ...talosMotionV6SubtleMigration, mode: 'complex' })
    expect(motionComplexPreferences).not.toHaveProperty('theme_motion')
    expect(motionComplexPreferences).not.toHaveProperty('ui_animation_profile')
    expect(motionComplexPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'aurora')
    await expect(workspaceMotionCanvas(page)).toHaveCount(1)
    await expectProceduralCanvasHasVisibleSignal(page)
    await expectProceduralBackgroundComposition(page)
    const backgroundOpacity = await page.getByTestId('talos-motion-background').evaluate((element) => (
        Number(window.getComputedStyle(element).opacity)
    ))
    expect(backgroundOpacity).toBe(1)

    await page.getByRole('tab', { name: 'Advanced' }).evaluate((element) => {
        (element as HTMLElement).click()
    })
    await page.getByLabel('Area', { exact: true }).selectOption('composer')
    let areaPatchCount = 0
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH') areaPatchCount += 1
    })
    await page.getByLabel('Area background').fill('#000000')
    await page.getByLabel('Area surface').fill('#000000')
    await page.getByLabel('Area text').fill('#111111')
    await page.getByLabel('Area muted').fill('#222222')
    const beforeUnsafeAreaSave = areaPatchCount
    await page.getByRole('button', { name: 'Save area tokens' }).click()
    await expect(page.getByText(/Area token contrast rejected:/)).toBeVisible()
    await expect.poll(() => areaPatchCount).toBe(beforeUnsafeAreaSave)

    await page.getByLabel('Area background').fill('#111827')
    await page.getByLabel('Area surface').fill('#1f2937')
    await page.getByLabel('Area text').fill('#f9fafb')
    await page.getByLabel('Area muted').fill('#cbd5e1')
    const areaTokenRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const areaTokens = preferences?.theme_area_tokens as Record<string, Record<string, unknown>> | undefined

        return hasSettingsExpectedRevision(body)
            && areaTokens?.composer?.background === '#111827'
    })
    await page.getByRole('button', { name: 'Save area tokens' }).click()
    await areaTokenRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('style', /--talos-area-composer-background:\s*#111827/)
    const scopedAreaTokens = await page.evaluate(() => {
        const composer = document.querySelector('.talos-composer-area') as HTMLElement | null
        const sidebar = document.querySelector('.talos-left-rail') as HTMLElement | null
        const composerStyle = composer ? window.getComputedStyle(composer) : null
        const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null

        return {
            composerBackground: composerStyle?.getPropertyValue('--talos-composer-bg').trim(),
            composerSurface: composerStyle?.getPropertyValue('--talos-card').trim(),
            composerText: composerStyle?.getPropertyValue('--talos-text').trim(),
            sidebarText: sidebarStyle?.getPropertyValue('--talos-text').trim(),
        }
    })
    expect(scopedAreaTokens).toMatchObject({
        composerBackground: '#111827',
        composerSurface: '#1f2937',
        composerText: '#f9fafb',
    })
    expect(scopedAreaTokens.sidebarText).not.toBe('#f9fafb')

    await testInfo.attach(`theme-engine-v6-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('theme engine V6 completes the named theme lifecycle and reset contract', async ({ page }, testInfo) => {
    test.setTimeout(120_000)

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()

    await expect(page.getByTestId('talos-theme-product-preview')).toBeVisible()
    await expect(page.getByTestId('talos-theme-preview-message')).toBeVisible()
    await expect(page.getByTestId('talos-theme-preview-code')).toBeVisible()
    await expect(page.getByTestId('talos-theme-preview-input')).toBeVisible()
    await expect(page.getByTestId('talos-theme-preview-status')).toContainText('Run succeeded')
    await expect(page.getByTestId('talos-theme-preview-evidence')).toContainText('Evidence attached')
    await expect(page.getByTestId('talos-theme-preview-layout')).toContainText('balanced messages, full composer')

    await page.getByLabel('Theme chat message size').selectOption('compact')
    await page.getByLabel('Theme chat composer mode').selectOption('minimal')
    const conflictingLayoutRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const layout = preferences?.chat_layout as Record<string, unknown> | undefined
        return layout?.bubble_scale === 'compact' && layout?.composer_mode === 'minimal'
    })
    await page.getByRole('button', { name: 'Save customization', exact: true }).click()
    await conflictingLayoutRequest
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Compact')
    await expect(page.getByRole('button', { name: 'Use full composer', exact: true })).toBeVisible()

    await page.getByLabel('Theme chat message size').selectOption('expanded')
    await page.getByLabel('Theme chat composer mode').selectOption('full')
    await page.getByLabel('Theme name').fill('Lifecycle Theme')
    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        const layout = preferences?.chat_layout as Record<string, unknown> | undefined
        return Array.isArray(library)
            && library.some((theme) => theme.name === 'Lifecycle Theme')
            && JSON.stringify(library.at(-1)?.motion_v6) === JSON.stringify(talosMotionV6Defaults)
            && layout?.bubble_scale === 'expanded'
            && layout?.composer_mode === 'full'
    })
    await page.getByRole('button', { name: 'Create theme', exact: true }).click()
    await createRequest
    await expect(page.getByText('Lifecycle Theme', { exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Expanded')
    await expect(page.getByRole('button', { name: 'Use minimal composer', exact: true })).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Expanded')
    await expect(page.getByRole('button', { name: 'Use minimal composer', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Library' }).click()

    const lifecycleArticle = page.locator('article').filter({ hasText: 'Lifecycle Theme' }).first()
    await expect(lifecycleArticle).toBeVisible()

    const duplicateRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        return Array.isArray(library) && library.some((theme) => theme.name === 'Lifecycle Theme copy')
    })
    await lifecycleArticle.getByRole('button', { name: 'Duplicate', exact: true }).click()
    await duplicateRequest
    await expect(page.getByText('Lifecycle Theme copy', { exact: true })).toBeVisible()

    const copiedArticle = page.locator('article').filter({ hasText: 'Lifecycle Theme copy' }).first()
    const applyCopyRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        return (preferences?.active_custom_theme_id as string | undefined)?.startsWith('lifecycle-theme-copy-') === true
    })
    await copiedArticle.getByRole('button', { name: 'Apply', exact: true }).click()
    await applyCopyRequest
    await expect(copiedArticle.getByText('Active', { exact: true })).toBeVisible()

    let themePatchCount = 0
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH') themePatchCount += 1
    })
    await lifecycleArticle.getByRole('button', { name: 'Rename', exact: true }).click()
    await page.getByLabel('Rename theme').fill('')
    const blankRenameCount = themePatchCount
    await lifecycleArticle.getByRole('button', { name: 'Save name', exact: true }).click()
    await expect(page.getByText('Theme name is required.', { exact: true })).toBeVisible()
    await expect.poll(() => themePatchCount).toBe(blankRenameCount)

    await page.getByLabel('Rename theme').fill('Lifecycle Renamed')
    const renameRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        return Array.isArray(library) && library.some((theme) => theme.name === 'Lifecycle Renamed')
    })
    await lifecycleArticle.getByRole('button', { name: 'Save name', exact: true }).click()
    await renameRequest
    await expect(page.getByText('Lifecycle Renamed', { exact: true })).toBeVisible()

    const applyRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        return (preferences?.active_custom_theme_id as string | undefined)?.startsWith('lifecycle-theme-') === true
            && !(preferences?.active_custom_theme_id as string).startsWith('lifecycle-theme-copy-')
    })
    await page.locator('article').filter({ hasText: 'Lifecycle Renamed' }).first().getByRole('button', { name: 'Apply', exact: true }).click()
    const appliedThemeRequest = await applyRequest
    const appliedThemePreferences = settingsPatchBody(appliedThemeRequest).preferences as Record<string, unknown>
    expect(appliedThemePreferences.chat_layout).toMatchObject({
        bubble_scale: 'expanded',
        composer_mode: 'full',
    })

    await page.getByRole('button', { name: 'Export active theme', exact: true }).click()
    const exportedJson = await page.getByTestId('talos-theme-export-json').inputValue()
    const exportedTheme = JSON.parse(exportedJson) as Record<string, unknown>
    expect(exportedTheme).toMatchObject({
        schema: 'talos_theme_export_v2',
        theme: {
            name: 'Lifecycle Renamed',
            motion_v6: { schema_version: 1 },
            chat_layout: {
                bubble_scale: 'expanded',
                composer_mode: 'full',
            },
        },
    })
    expect((exportedTheme.theme as Record<string, unknown>).motion_v6).toEqual(talosMotionV6Defaults)
    const exportedThemePayload = exportedTheme.theme as Record<string, unknown>
    expect(exportedThemePayload).not.toHaveProperty('motion')
    expect(exportedThemePayload).not.toHaveProperty('ui_animation_profile')
    expect(exportedThemePayload).not.toHaveProperty('ui_animation_customization')

    await page.getByRole('button', { name: 'Copy export', exact: true }).click()
    await expect(page.getByText('Theme export copied.', { exact: true })).toBeVisible()
    const clipboardJson = await page.evaluate(() => navigator.clipboard.readText())
    expect(JSON.parse(clipboardJson)).toEqual(exportedTheme)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download export', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('talos-theme.json')
    await expect(page.getByText('Theme export downloaded.', { exact: true })).toBeVisible()

    const activeDeleteRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        return preferences?.active_custom_theme_id === null
            && JSON.stringify(preferences?.theme_customization) === '{}'
            && JSON.stringify(preferences?.theme_area_tokens) === '{}'
            && preferences?.theme_mode === 'system'
            && hasExactMotionV6(preferences)
            && !Object.prototype.hasOwnProperty.call(preferences ?? {}, 'theme_motion')
            && !Object.prototype.hasOwnProperty.call(preferences ?? {}, 'ui_animation_profile')
            && !Object.prototype.hasOwnProperty.call(preferences ?? {}, 'ui_animation_customization')
            && (preferences?.theme_library as unknown[] | undefined)?.some((theme) => (theme as Record<string, unknown>).name === 'Lifecycle Theme copy') === true
    })
    await page.locator('article').filter({ hasText: 'Lifecycle Renamed' }).first().getByRole('button', { name: 'Delete', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: /Delete Lifecycle Renamed/ })
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(deleteDialog).toBeHidden()
    await page.locator('article').filter({ hasText: 'Lifecycle Renamed' }).first().getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('dialog', { name: /Delete Lifecycle Renamed/ })).toBeVisible()
    await page.getByRole('dialog', { name: /Delete Lifecycle Renamed/ }).getByRole('button', { name: 'Delete theme', exact: true }).click()
    await activeDeleteRequest
    await expect(page.getByText('Lifecycle Renamed', { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Balanced')
    await expect(page.getByRole('button', { name: 'Use minimal composer', exact: true })).toBeVisible()

    const beforeInvalidImport = themePatchCount
    await page.getByLabel('Import theme JSON').fill(JSON.stringify({ schema: 'talos_theme_export_v2' }))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    await expect(page.getByText('TALOS rejected this theme import.', { exact: true })).toBeVisible()
    await expect.poll(() => themePatchCount).toBe(beforeInvalidImport)

    const rawImportTheme = {
        id: 'raw-lifecycle-theme',
        name: 'Raw Lifecycle',
        base_theme: 'terminal',
        tokens: {},
    }
    const beforeMissingBaseImport = themePatchCount
    const { base_theme: _baseTheme, ...themeWithoutBase } = rawImportTheme
    await page.getByLabel('Import theme JSON').fill(JSON.stringify({
        schema: 'talos_theme_export_v1',
        exported_at: '2026-07-10T12:00:00.000Z',
        theme: themeWithoutBase,
    }))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    await expect(page.getByText('Theme import requires theme.base_theme to name a supported base preset.', { exact: true })).toBeVisible()
    await expect.poll(() => themePatchCount).toBe(beforeMissingBaseImport)

    const beforeMissingTokensImport = themePatchCount
    const { tokens: _tokens, ...themeWithoutTokens } = rawImportTheme
    await page.getByLabel('Import theme JSON').fill(JSON.stringify({
        schema: 'talos_theme_export_v1',
        exported_at: '2026-07-10T12:00:00.000Z',
        theme: themeWithoutTokens,
    }))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    await expect(page.getByText('Theme import requires theme.tokens to be an object.', { exact: true })).toBeVisible()
    await expect.poll(() => themePatchCount).toBe(beforeMissingTokensImport)

    const importedTheme = {
        schema: 'talos_theme_export_v1',
        exported_at: '2026-07-10T12:00:00.000Z',
        theme: {
            id: 'imported-lifecycle-theme',
            name: 'Imported Lifecycle',
            base_theme: 'terminal',
            tokens: {},
            chat_layout: {
                bubble_scale: 'compact',
                composer_mode: 'minimal',
                advanced_rail_expanded: true,
            },
        },
    }
    await page.getByLabel('Import theme JSON').fill(JSON.stringify(importedTheme))
    const importRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const layout = preferences?.chat_layout as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        return preferences?.theme === 'terminal'
            && preferences?.active_custom_theme_id === 'imported-lifecycle-theme'
            && layout?.bubble_scale === 'compact'
            && layout?.composer_mode === 'minimal'
            && Array.isArray(library)
            && library.some((theme) => theme.id === 'imported-lifecycle-theme')
    })
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    await importRequest
    await expect(page.getByText('Imported Lifecycle', { exact: true })).toBeVisible()
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Compact')
    await expect(page.getByRole('button', { name: 'Use full composer', exact: true })).toBeVisible()

    const beforeDuplicateImport = themePatchCount
    await page.getByLabel('Import theme JSON').fill(JSON.stringify({
        ...importedTheme,
        theme: { ...importedTheme.theme, name: 'Silent Replacement' },
    }))
    await page.getByRole('button', { name: 'Import theme', exact: true }).click()
    await expect(page.getByText('A theme with this ID already exists. Rename or delete it before importing.', { exact: true })).toBeVisible()
    await expect.poll(() => themePatchCount).toBe(beforeDuplicateImport)
    await expect(page.getByText('Silent Replacement', { exact: true })).toHaveCount(0)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Compact')
    await expect(page.getByRole('button', { name: 'Use full composer', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()

    const resetRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const chat = preferences?.chat_layout as Record<string, unknown> | undefined
        return preferences?.active_custom_theme_id === null
            && JSON.stringify(preferences?.theme_customization) === '{}'
            && JSON.stringify(preferences?.theme_area_tokens) === '{}'
            && preferences?.theme_mode === 'system'
            && hasExactMotionV6(preferences)
            && chat?.bubble_scale === 'balanced'
            && chat?.composer_mode === 'full'
    })
    await page.getByRole('button', { name: 'Reset to preset', exact: true }).click()
    const resetThemeRequest = await resetRequest
    const resetPreferences = settingsPatchBody(resetThemeRequest).preferences as Record<string, unknown>
    expect(resetPreferences).not.toHaveProperty('theme_motion')
    expect(resetPreferences).not.toHaveProperty('ui_animation_profile')
    expect(resetPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.getByTestId('talos-message-scale-status')).toContainText('Balanced')
    await expect(page.getByRole('button', { name: 'Use minimal composer', exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Library' })).toBeVisible()
    const settingsAfterReset = await page.evaluate(async () => {
        const response = await fetch('/api/talos/settings', { headers: { Accept: 'application/json' } })
        return response.json() as Promise<{ data: { preferences: Record<string, unknown> } }>
    })
    expect(settingsAfterReset.data.preferences.theme).toBe('terminal')
    expect(settingsAfterReset.data.preferences.theme_library).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'imported-lifecycle-theme' }),
    ]))

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`theme-engine-v6-lifecycle-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('named theme apply rolls the visible theme and local preference back when persistence fails', async ({ page }, testInfo) => {
    await page.addInitScript(() => {
        const originalSetItem = Storage.prototype.setItem
        ;(window as typeof window & { __talosThemeWrites?: string[] }).__talosThemeWrites = []
        Storage.prototype.setItem = function setItem(key: string, value: string) {
            if (key === 'talos_theme') {
                ;(window as typeof window & { __talosThemeWrites?: string[] }).__talosThemeWrites?.push(value)
            }
            originalSetItem.call(this, key, value)
        }
    })
    const namedTheme = {
        id: 'rollback-theme-e2e',
        name: 'Rollback theme',
        base_theme: 'claudius',
        theme_mode: 'dark',
        tokens: {},
        area_tokens: {},
        motion_v6: talosMotionV6Complex,
        chat_layout: {},
        created_at: '2026-07-10T12:00:00.000Z',
        updated_at: '2026-07-10T12:00:00.000Z',
    }

    await openWorkspace(page)
    await patchTalosSettings(page, {
        theme: 'forge',
        theme_motion_v6: talosMotionV6Defaults,
        theme_customization: {},
        active_custom_theme_id: null,
        theme_library: [namedTheme],
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const workspace = page.getByTestId('talos-workspace')
    await expect(workspace).toHaveAttribute('data-theme-preset', 'forge')

    let rejectedApply = false
    let rejectedApplyPreferences: Record<string, unknown> | undefined
    await page.route('**/api/talos/settings', async (route) => {
        const request = route.request()
        if (request.method() === 'PATCH') {
            const body = request.postDataJSON() as Record<string, unknown>
            const preferences = body.preferences as Record<string, unknown> | undefined
            if (preferences?.active_custom_theme_id === namedTheme.id) {
                expect(hasSettingsExpectedRevision(body)).toBe(true)
                rejectedApply = true
                rejectedApplyPreferences = preferences
                await route.fulfill({
                    status: 422,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'Rejected named theme for rollback test.' }),
                })
                return
            }
        }

        await route.fallback()
    })

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Library' }).click()
    await page.locator('article').filter({ hasText: namedTheme.name }).getByRole('button', { name: 'Apply', exact: true }).click()

    await expect.poll(() => rejectedApply).toBe(true)
    expect(rejectedApplyPreferences?.theme_motion_v6).toEqual(talosMotionV6Complex)
    expect(rejectedApplyPreferences).not.toHaveProperty('theme_motion')
    expect(rejectedApplyPreferences).not.toHaveProperty('ui_animation_profile')
    expect(rejectedApplyPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.getByText('Rejected named theme for rollback test.', { exact: true })).toBeVisible()
    const themeWrites = await page.evaluate(() => (window as typeof window & { __talosThemeWrites?: string[] }).__talosThemeWrites ?? [])
    expect(themeWrites.at(-1), JSON.stringify(themeWrites)).toBe('forge')
    await expect(workspace).toHaveAttribute('data-theme-preset', 'forge')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('talos_theme'))).toBe('forge')

    await testInfo.attach(`theme-apply-rollback-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.getByTestId('talos-workspace')).toHaveAttribute('data-theme-preset', 'forge')
})

test('Claudius font-only customization preserves palette and active background motion', async ({ page }) => {
    await openWorkspace(page)
    await patchTalosSettings(page, {
        theme: 'claudius',
        theme_mode: 'light',
        theme_customization: {},
        theme_motion_v6: { ...talosMotionV6Defaults, mode: 'complex' },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const palette = async () => page.locator('.talos-shell').evaluate((element) => {
        const style = window.getComputedStyle(element)
        return Object.fromEntries([
            '--talos-background',
            '--talos-panel',
            '--talos-text',
            '--talos-accent',
            '--talos-secondary',
            '--talos-border',
            '--talos-chat-bg',
            '--talos-composer-bg',
            '--talos-code-bg',
            '--talos-user',
            '--talos-user-text',
        ].map((token) => [token, style.getPropertyValue(token).trim()]))
    })
    const before = await palette()
    await expectProceduralCanvasFrameChanges(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByLabel('Font', { exact: true }).selectOption('manrope')
    await expect.poll(() => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-font-ui').trim()
    ))).toContain('Manrope')
    expect(await palette()).toEqual(before)

    const saveRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        return JSON.stringify(preferences?.theme_customization) === JSON.stringify({ font: 'manrope' })
    })
    await page.getByRole('button', { name: 'Save customization', exact: true }).click()
    await saveRequest
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    expect(await palette()).toEqual(before)
    await expect.poll(() => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-font-ui').trim()
    ))).toContain('Manrope')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-mode', 'motion')
    await expectProceduralCanvasFrameChanges(page)
})

test('theme engine v6 persists interface motion, previews the product surface, and exports V2', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'adaptive')
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
    await expect(page.getByText('Motion Engine V6', { exact: true })).toBeVisible()
    await expect(page.getByText('Live product preview', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Light preview', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dark preview', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Light preview', exact: true }).click()
    await expect(page.getByTestId('talos-motion-v6-preview').locator('[data-preview-color-mode="light"]')).toBeVisible()
    await page.getByRole('button', { name: 'Dark preview', exact: true }).click()
    await expect(page.getByTestId('talos-motion-v6-preview').locator('[data-preview-color-mode="dark"]')).toBeVisible()
    await page.getByRole('button', { name: 'Restart preview', exact: true }).click()
    await expect(page.getByTestId('talos-motion-v6-preview').locator('[data-preview-sample="window"]')).toBeVisible()

    const customMotion = {
        ...talosMotionV6Defaults,
        mode: 'complex',
        interface: {
            ...talosMotionV6Defaults.interface,
            profile: 'custom',
            duration_scale: 125,
            intensity: 86,
            easing: 'cinematic',
            stagger: 65,
            categories: {
                ...talosMotionV6Defaults.interface.categories,
                windows: false,
            },
        },
    } as const

    await page.getByRole('button', { name: 'Motion mode Complex', exact: true }).click()
    await page.getByLabel('Interface motion profile').selectOption('custom')
    await page.getByLabel('Interface easing').selectOption('cinematic')
    await page.getByRole('slider', { name: 'Interface duration' }).fill('125')
    await page.getByRole('slider', { name: 'Interface intensity' }).fill('86')
    await page.getByRole('slider', { name: 'Interface stagger' }).fill('65')
    await page.getByLabel('Animate windows').click()

    const saveMotionRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const savedPreferences = settingsPatchBody(await saveMotionRequest).preferences as Record<string, unknown>
    expect(savedPreferences.theme_motion_v6).toEqual(customMotion)
    expect(savedPreferences).not.toHaveProperty('theme_motion')
    expect(savedPreferences).not.toHaveProperty('ui_animation_profile')
    expect(savedPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect(page.getByTestId('talos-motion-v6-editor')).toContainText('v6')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByLabel('Interface motion profile')).toHaveValue('custom')
    await expect(page.getByLabel('Interface easing')).toHaveValue('cinematic')
    await expect(page.getByRole('slider', { name: 'Interface duration' })).toHaveValue('125')
    await expect(page.getByRole('slider', { name: 'Interface intensity' })).toHaveValue('86')
    await expect(page.getByRole('slider', { name: 'Interface stagger' })).toHaveValue('65')
    await expect(page.getByLabel('Animate windows')).not.toBeChecked()

    await page.getByRole('tab', { name: 'Library' }).click()
    await page.getByRole('button', { name: 'Export active theme' }).click()
    const exportedTheme = JSON.parse(await page.getByTestId('talos-theme-export-json').inputValue()) as Record<string, unknown>
    expect(exportedTheme).toMatchObject({
        schema: 'talos_theme_export_v2',
        theme: {
            motion_v6: { schema_version: 1 },
        },
    })
    expect((exportedTheme.theme as Record<string, unknown>).motion_v6).toEqual(customMotion)
    const exportedThemePayload = exportedTheme.theme as Record<string, unknown>
    expect(exportedThemePayload).not.toHaveProperty('motion')
    expect(exportedThemePayload).not.toHaveProperty('ui_animation_profile')
    expect(exportedThemePayload).not.toHaveProperty('ui_animation_customization')

    await testInfo.attach(`theme-engine-v6-motion-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('browser reduced motion remains a hard override until the OS preference changes', async ({ page }) => {
    await openWorkspace(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await patchTalosSettings(page, {
        theme: 'forge',
        reduced_motion: false,
        theme_motion_v6: talosMotionV6Defaults,
        theme_customization: {
            effect: 'dag-flow',
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'forge')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'adaptive')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'static')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'true')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).toBe('0ms')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-motion-disabled', 'true')
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)
    await expectStaticMotionFrameStaysStill(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    const motionComplexRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Complex', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const motionComplexPreferences = settingsPatchBody(await motionComplexRequest).preferences as Record<string, unknown>
    expect(motionComplexPreferences.theme_motion_v6).toEqual({ ...talosMotionV6Defaults, mode: 'complex' })
    expect(motionComplexPreferences).not.toHaveProperty('theme_motion')
    expect(motionComplexPreferences).not.toHaveProperty('ui_animation_profile')
    expect(motionComplexPreferences).not.toHaveProperty('ui_animation_customization')

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'forge')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'static')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'true')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).toBe('0ms')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-motion-disabled', 'true')
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)
    await expectStaticMotionFrameStaysStill(page)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).not.toBe('0ms')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-motion-disabled', 'false')
    await expectProceduralBackgroundComposition(page)
    await expectProceduralCanvasFrameChanges(page)
})

test('theme engine V6 exposes adaptive, simple, and complex renderer modes', async ({ page }) => {
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()

    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Motion mode Adaptive', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('switch', { name: 'Procedural background' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Interface motion' })).toBeChecked()

    const simpleMotionRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Simple', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const simplePreferences = settingsPatchBody(await simpleMotionRequest).preferences as Record<string, unknown>
    expect(simplePreferences.theme_motion_v6).toEqual({ ...talosMotionV6Defaults, mode: 'simple' })
    expect(simplePreferences).not.toHaveProperty('theme_motion')
    expect(simplePreferences).not.toHaveProperty('ui_animation_profile')
    expect(simplePreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'simple')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'simple')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'forge')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-simple-animation', 'true')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-mode', 'motion')
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)
    await expectSimpleMotionFrameChanges(page)

    const complexMotionRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Complex', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const complexPreferences = settingsPatchBody(await complexMotionRequest).preferences as Record<string, unknown>
    expect(complexPreferences.theme_motion_v6).toEqual({ ...talosMotionV6Defaults, mode: 'complex' })
    expect(complexPreferences).not.toHaveProperty('theme_motion')
    expect(complexPreferences).not.toHaveProperty('ui_animation_profile')
    expect(complexPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'forge')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-simple-animation', 'false')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-mode', 'motion')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-dpr-cap', '1.25')
    await expectProceduralCanvasFrameChanges(page)
})

test('theme switches disable motion separately from the procedural background', async ({ page }) => {
    test.setTimeout(90_000)

    await openWorkspace(page)
    await patchTalosSettings(page, {
        theme: 'terminal',
        reduced_motion: false,
        theme_motion_v6: talosMotionV6Complex,
        theme_customization: {
            effect: 'trace-rain',
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(workspaceMotionCanvas(page)).toHaveCount(1)
    await expectProceduralCanvasFrameChanges(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByRole('button', { name: 'Motion mode Complex', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('switch', { name: 'Procedural background' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Interface motion' })).toBeChecked()
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-mode', 'motion')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-raf-active', 'true')

    const staticMotionRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Static', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const staticPreferences = settingsPatchBody(await staticMotionRequest).preferences as Record<string, unknown>
    expect(staticPreferences.theme_motion_v6).toEqual({ ...talosMotionV6Complex, mode: 'static' })
    expect(staticPreferences).not.toHaveProperty('theme_motion')
    expect(staticPreferences).not.toHaveProperty('ui_animation_profile')
    expect(staticPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'static')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'static')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'terminal')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-motion-disabled', 'true')
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)
    await expectStaticMotionFrameStaysStill(page)

    const backgroundDisabledRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('switch', { name: 'Procedural background' }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const backgroundDisabledPreferences = settingsPatchBody(await backgroundDisabledRequest).preferences as Record<string, unknown>
    expect(backgroundDisabledPreferences.theme_motion_v6).toEqual({ ...talosMotionV6Complex, mode: 'static', background_enabled: false })
    expect(backgroundDisabledPreferences).not.toHaveProperty('theme_motion')
    expect(backgroundDisabledPreferences).not.toHaveProperty('ui_animation_profile')
    expect(backgroundDisabledPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'terminal')
    await expect(workspaceMotionStage(page)).toHaveCount(0)
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)

    const backgroundEnabledRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('switch', { name: 'Procedural background' }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const backgroundEnabledPreferences = settingsPatchBody(await backgroundEnabledRequest).preferences as Record<string, unknown>
    expect(backgroundEnabledPreferences.theme_motion_v6).toEqual({ ...talosMotionV6Complex, mode: 'static' })
    expect(backgroundEnabledPreferences).not.toHaveProperty('theme_motion')
    expect(backgroundEnabledPreferences).not.toHaveProperty('ui_animation_profile')
    expect(backgroundEnabledPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(workspaceMotionCanvas(page)).toHaveCount(0)
    await expectStaticMotionFrameStaysStill(page)

    const motionEnabledRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('button', { name: 'Motion mode Complex', exact: true }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const motionEnabledPreferences = settingsPatchBody(await motionEnabledRequest).preferences as Record<string, unknown>
    expect(motionEnabledPreferences.theme_motion_v6).toEqual(talosMotionV6Complex)
    expect(motionEnabledPreferences).not.toHaveProperty('theme_motion')
    expect(motionEnabledPreferences).not.toHaveProperty('ui_animation_profile')
    expect(motionEnabledPreferences).not.toHaveProperty('ui_animation_customization')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(workspaceMotionCanvas(page)).toHaveCount(1)
    await expectProceduralCanvasFrameChanges(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-mode', 'motion')
    await expectProceduralCanvasFrameChanges(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByRole('button', { name: 'Motion mode Complex', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('switch', { name: 'Procedural background' })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Interface motion' })).toBeChecked()

    const interfaceDisabledRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH')
    await page.getByRole('switch', { name: 'Interface motion' }).click()
    await page.getByRole('button', { name: 'Save motion', exact: true }).click()
    const interfaceDisabledPreferences = settingsPatchBody(await interfaceDisabledRequest).preferences as Record<string, unknown>
    expect(interfaceDisabledPreferences.theme_motion_v6).toEqual({ ...talosMotionV6Complex, interface_enabled: false })
    expect(interfaceDisabledPreferences).not.toHaveProperty('theme_motion')
    expect(interfaceDisabledPreferences).not.toHaveProperty('ui_animation_profile')
    expect(interfaceDisabledPreferences).not.toHaveProperty('ui_animation_customization')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'true')
    await expect.poll(async () => page.locator('.talos-shell').evaluate((element) => (
        window.getComputedStyle(element).getPropertyValue('--talos-motion-open-duration').trim()
    ))).toBe('0ms')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-motion-disabled', 'false')
    await expect(workspaceMotionCanvas(page)).toHaveCount(1)
    await expectProceduralCanvasFrameChanges(page)

    await patchTalosSettings(page, {
        theme: 'terminal',
        reduced_motion: false,
        theme_motion_v6: {
            ...talosMotionV6Complex,
            interface: {
                ...talosMotionV6Complex.interface,
                profile: 'off',
            },
        },
        theme_customization: {
            effect: 'trace-rain',
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-ui-motion-disabled', 'true')
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByLabel('Interface motion profile')).toHaveValue('off')
    await expect(page.getByRole('switch', { name: 'Interface motion' })).not.toBeChecked()
})

test('settings preset changes refresh procedural background immediately', async ({ page }) => {
    test.setTimeout(75_000)

    await openWorkspace(page)
    await patchTalosSettings(page, {
        theme: 'forge',
        theme_motion_v6: talosMotionV6Complex,
        theme_customization: {
            effect: 'none',
            effect_intensity: 0,
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'forge')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'forge')
    await expectProceduralCanvasFrameChanges(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByLabel('Theme preset').selectOption('terminal')
    const settingsPresetRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const customization = preferences?.theme_customization as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme === 'terminal'
            && customization !== undefined
            && Object.keys(customization).length === 0
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await settingsPresetRequest

    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', 'terminal')
    await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', 'terminal')
    await expectProceduralBackgroundComposition(page)
    await expectProceduralCanvasFrameChanges(page)
    await expectProceduralCanvasHasVisibleSignal(page)
})

test('every theme preset switches to its distinct Motion V6 scene', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(120_000)
    test.skip(Boolean(isMobile), 'desktop covers exhaustive preset animation; mobile verifies preset refresh in the targeted settings flow.')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Presets' }).click()

    const presets = [
        ['AVM Forge', 'talos-theme-forge'],
        ['Paper Review', 'talos-theme-paper'],
        ['Terminal Operator', 'talos-theme-terminal'],
        ['Aurora Research', 'talos-theme-aurora'],
        ['Glacier Desk', 'talos-theme-glacier'],
        ['Ember Incident', 'talos-theme-ember'],
        ['Atlas Enterprise', 'talos-theme-atlas'],
        ['Noir Contrast', 'talos-theme-noir'],
        ['Signal Command', 'talos-theme-signal'],
        ['Violet Lab', 'talos-theme-violet'],
        ['Claudius Review', 'talos-theme-claudius'],
        ['Basicus Material', 'talos-theme-basicus'],
    ] as const

    for (const [label, themeClass] of presets) {
        const sceneId = themeClass.replace('talos-theme-', '')
        const presetRequest = page.waitForRequest((request) => {
            if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
                return false
            }

            const body = request.postDataJSON() as Record<string, unknown>
            const preferences = body.preferences as Record<string, unknown> | undefined
            const customization = preferences?.theme_customization as Record<string, unknown> | undefined

            return hasSettingsExpectedRevision(body)
                && preferences?.theme === sceneId
                && customization !== undefined
                && Object.keys(customization).length === 0
        })

        await page.getByRole('button', { name: label }).click()
        const presetPreferences = settingsPatchBody(await presetRequest).preferences as Record<string, unknown>
        expect(presetPreferences).not.toHaveProperty('theme_motion')
        expect(presetPreferences).not.toHaveProperty('ui_animation_profile')
        expect(presetPreferences).not.toHaveProperty('ui_animation_customization')
        await expect(page.locator('.talos-shell')).toHaveClass(new RegExp(themeClass))
        await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-scene', sceneId)
        await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-scene-id', sceneId)
        await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-requested', 'adaptive')
        await expect(page.locator('.talos-shell')).toHaveAttribute('data-motion-v6-effective', 'complex')
        await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-mode', 'motion')
        await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-simple-animation', 'false')
        await expect(page.getByTestId('talos-motion-background')).toHaveAttribute('data-performance-dpr-cap', '1.25')
        await expectProceduralBackgroundComposition(page)
        await expectProceduralCanvasFrameChanges(page)
        await expectProceduralCanvasHasVisibleSignal(page)
        await testInfo.attach(`theme-preset-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${testInfo.project.name}.png`, {
            body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
            contentType: 'image/png',
        })
    }
})

test('theme color mode forces light and dark variants across presets and chat bubbles', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Show theme color contrast in the chat runtime.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Presets' }).click()

    const lightModeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme_mode === 'light'
    })
    await page.getByLabel('Theme color mode').selectOption('light')
    await lightModeRequest

    const terminalRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme === 'terminal' && preferences?.theme_mode === 'light'
    })
    await page.getByRole('button', { name: 'Terminal Operator' }).click()
    await terminalRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-preset', 'terminal')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-mode', 'light')

    const lightVariant = await page.locator('.talos-shell').evaluate((shell) => {
        const style = window.getComputedStyle(shell)
        const user = document.querySelector('[data-message-role="user"] > div') as HTMLElement | null
        const assistant = document.querySelector('[data-message-role="assistant"] > div') as HTMLElement | null
        const userStyle = user ? window.getComputedStyle(user) : null
        const assistantStyle = assistant ? window.getComputedStyle(assistant) : null

        return {
            background: style.getPropertyValue('--talos-background').trim(),
            text: style.getPropertyValue('--talos-text').trim(),
            userBackground: userStyle?.backgroundColor ?? '',
            userText: userStyle?.color ?? '',
            assistantBackground: assistantStyle?.backgroundColor ?? '',
            assistantText: assistantStyle?.color ?? '',
        }
    })

    const darkModeRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme_mode === 'dark'
    })
    await page.getByLabel('Theme color mode').selectOption('dark')
    await darkModeRequest

    const paperRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && preferences?.theme === 'paper' && preferences?.theme_mode === 'dark'
    })
    await page.getByRole('button', { name: 'Paper Review' }).click()
    await paperRequest
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-preset', 'paper')
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-mode', 'dark')

    const darkVariant = await page.locator('.talos-shell').evaluate((shell) => {
        const style = window.getComputedStyle(shell)
        const user = document.querySelector('[data-message-role="user"] > div') as HTMLElement | null
        const assistant = document.querySelector('[data-message-role="assistant"] > div') as HTMLElement | null
        const userStyle = user ? window.getComputedStyle(user) : null
        const assistantStyle = assistant ? window.getComputedStyle(assistant) : null

        return {
            background: style.getPropertyValue('--talos-background').trim(),
            text: style.getPropertyValue('--talos-text').trim(),
            userBackground: userStyle?.backgroundColor ?? '',
            userText: userStyle?.color ?? '',
            assistantBackground: assistantStyle?.backgroundColor ?? '',
            assistantText: assistantStyle?.color ?? '',
        }
    })

    expect(lightVariant.background).not.toBe(darkVariant.background)
    expect(lightVariant.text).not.toBe(darkVariant.text)
    expect(lightVariant.userBackground).not.toBe(darkVariant.userBackground)
    expect(lightVariant.assistantBackground).not.toBe(darkVariant.assistantBackground)
    expect(lightVariant.userText).toBeTruthy()
    expect(darkVariant.assistantText).toBeTruthy()

    await testInfo.attach(`theme-color-mode-variants-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('V6 theme visual matrix covers every preset in forced light and dark', async ({ page, isMobile }, testInfo) => {
    test.setTimeout(180_000)
    await page.setViewportSize(isMobile ? { width: 375, height: 812 } : { width: 1440, height: 900 })
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Presets' }).click()

    const presets = [
        ['forge', 'AVM Forge'],
        ['paper', 'Paper Review'],
        ['terminal', 'Terminal Operator'],
        ['aurora', 'Aurora Research'],
        ['glacier', 'Glacier Desk'],
        ['ember', 'Ember Incident'],
        ['atlas', 'Atlas Enterprise'],
        ['noir', 'Noir Contrast'],
        ['signal', 'Signal Command'],
        ['violet', 'Violet Lab'],
        ['claudius', 'Claudius Review'],
        ['basicus', 'Basicus Material'],
    ] as const
    const artifactDirectory = `storage/playwright-live/v6-theme-matrix/${testInfo.project.name}`
    mkdirSync(artifactDirectory, { recursive: true })

    for (const mode of ['light', 'dark'] as const) {
        const modeRequest = page.waitForRequest((request) => {
            if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
            const body = request.postDataJSON() as Record<string, unknown>
            if (!hasSettingsExpectedRevision(body)) return false
            const preferences = body.preferences as Record<string, unknown> | undefined
            return preferences?.theme_mode === mode
        })
        await page.getByLabel('Theme color mode').selectOption(mode)
        settingsPatchBody(await modeRequest)

        for (const [id, label] of presets) {
            const presetRequest = page.waitForRequest((request) => {
                if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
                const body = request.postDataJSON() as Record<string, unknown>
                if (!hasSettingsExpectedRevision(body)) return false
                const preferences = body.preferences as Record<string, unknown> | undefined
                return preferences?.theme === id && preferences?.theme_mode === mode
            })
            await page.getByRole('button', { name: label }).click()
            settingsPatchBody(await presetRequest)
            await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-preset', id)
            await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-mode', mode)
            await expect(page.getByRole('tab', { name: 'Presets' })).toBeVisible()
            await expectNoHorizontalOverflow(page)

            const canvas = workspaceMotionCanvas(page)
            await expect(canvas).toHaveCount(1)
            await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).width)).toBeGreaterThan(100)
            await expect.poll(async () => canvas.evaluate((element) => (element as HTMLCanvasElement).height)).toBeGreaterThan(100)

            const screenshot = await page.screenshot({
                path: `${artifactDirectory}/${mode}-${id}.png`,
                animations: 'disabled',
            })
            await testInfo.attach(`v6-${mode}-${id}-${testInfo.project.name}.png`, {
                body: screenshot,
                contentType: 'image/png',
            })
        }
    }
})

test('favicon follows the active theme accent without reloading the workspace', async ({ page }) => {
    await openWorkspace(page)

    const favicon = page.locator('link[rel~="icon"][data-talos-dynamic-favicon="true"]')
    await expect(favicon).toHaveCount(1)
    const initialHref = await favicon.getAttribute('href')

    const initialAccent = await page.locator('.talos-shell').evaluate((shell) => (
        window.getComputedStyle(shell).getPropertyValue('--talos-accent').trim()
    ))
    await expect(favicon).toHaveAttribute('data-talos-favicon-color', initialAccent)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Presets' }).click()
    await page.getByRole('button', { name: 'Terminal Operator' }).click()
    await expect(page.locator('.talos-shell')).toHaveAttribute('data-theme-preset', 'terminal')

    const terminalAccent = await page.locator('.talos-shell').evaluate((shell) => (
        window.getComputedStyle(shell).getPropertyValue('--talos-accent').trim()
    ))
    await expect(favicon).toHaveAttribute('data-talos-favicon-color', terminalAccent)
    await expect.poll(() => favicon.getAttribute('href')).not.toBe(initialHref)
    expect(terminalAccent).not.toBe(initialAccent)
})

test('theme engine shows workspace policy lock as read only', async ({ page }) => {
    await openWorkspace(page)
    await patchTalosSettings(page, {
        theme_policy_locked: true,
        theme_motion_v6: talosMotionV6Defaults,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.getByRole('button', { name: 'Decrease message size' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Increase message size' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Use minimal composer' })).toBeDisabled()

    const advancedRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const layout = preferences?.chat_layout as Record<string, unknown> | undefined
        return layout?.advanced_rail_expanded === true
            && !Object.prototype.hasOwnProperty.call(layout, 'bubble_scale')
            && !Object.prototype.hasOwnProperty.call(layout, 'composer_mode')
    })
    await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    await advancedRequest

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme changes are locked by workspace policy.')).toBeVisible()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await expect(page.getByRole('button', { name: 'Save customization' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save as theme' })).toBeDisabled()
    await expect(page.getByLabel('Theme chat message size')).toBeDisabled()
    await expect(page.getByLabel('Theme chat composer mode')).toBeDisabled()
    await page.getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByTestId('talos-motion-v6-editor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Motion mode Adaptive', exact: true })).toBeDisabled()
    await expect(page.getByRole('switch', { name: 'Procedural background' })).toBeDisabled()
    await expect(page.getByRole('switch', { name: 'Interface motion' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Reset background', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Reset interface', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save motion', exact: true })).toBeDisabled()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await expect(page.getByLabel('Chat message size', { exact: true })).toBeDisabled()
    await expect(page.getByLabel('Chat composer mode', { exact: true })).toBeDisabled()
    await expect(page.getByRole('switch', { name: 'Expand Advanced by default' })).toBeEnabled()
})

test('desktop sidebar collapses, expands, and resizes without overflow', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop sidebar behavior is covered by the desktop project')
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await openWorkspace(page)

    const rail = page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()
    const expandedBefore = await rail.boundingBox()
    expect(expandedBefore?.width).toBeGreaterThan(200)

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(rail).toHaveAttribute('data-sidebar-state', 'collapsed')
    const collapsedMotion = await rail.evaluate((element) => {
        const style = window.getComputedStyle(element)
        const duration = style.transitionDuration.split(',')[0]?.trim() ?? '0s'
        const durationMs = duration.endsWith('ms')
            ? Number(duration.replace('ms', ''))
            : Number(duration.replace('s', '')) * 1000

        return {
            transitionProperty: style.transitionProperty,
            transitionDurationMs: durationMs,
        }
    })
    expect(collapsedMotion.transitionProperty).toContain('width')
    expect(collapsedMotion.transitionDurationMs).toBeGreaterThanOrEqual(140)
    await expect.poll(async () => {
        const collapsed = await rail.boundingBox()

        return collapsed?.width ?? 0
    }).toBeLessThan(96)

    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(rail).toHaveAttribute('data-sidebar-state', 'expanded')
    await expect.poll(async () => {
        const expanded = await rail.boundingBox()

        return expanded?.width ?? 0
    }).toBeGreaterThan(180)
    const expanded = await rail.boundingBox()

    const resizeHandle = page.getByLabel('Resize sidebar')
    const handleBox = await resizeHandle.boundingBox()
    expect(handleBox).toBeTruthy()

    await page.mouse.move((handleBox?.x ?? 0) + 2, (handleBox?.y ?? 0) + 24)
    await page.mouse.down()
    await page.mouse.move((handleBox?.x ?? 0) + 44, (handleBox?.y ?? 0) + 24)
    await page.mouse.up()

    const resized = await rail.boundingBox()
    expect(resized?.width).toBeGreaterThan((expanded?.width ?? 0) + 24)
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`sidebar-resize-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('floating tool windows are independent, draggable, and the right dock is only visible when populated', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop floating windows are covered by the desktop project')

    await openWorkspace(page)
    await expect(page.getByTestId('talos-right-dock')).toHaveCount(0)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    const before = await themeWindow.boundingBox()
    const dragHandle = page.getByLabel('Drag Theme window')
    const handleBox = await dragHandle.boundingBox()
    expect(before).toBeTruthy()
    expect(handleBox).toBeTruthy()

    await page.mouse.move((handleBox?.x ?? 0) + 24, (handleBox?.y ?? 0) + 10)
    await page.mouse.down()
    await page.mouse.move((handleBox?.x ?? 0) - 96, (handleBox?.y ?? 0) + 52)
    await page.mouse.up()

    const after = await themeWindow.boundingBox()
    expect(after?.x).toBeLessThan((before?.x ?? 0) - 40)
    expect(after?.y).toBeGreaterThan((before?.y ?? 0) + 24)

    await page.getByRole('button', { name: 'Dock Theme' }).click()
    await expect(page.getByTestId('talos-right-dock')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`floating-window-dock-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('floating windows launch from the sidebar and animate minimize, restore, and expand', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop window transition behavior is covered by the desktop project')

    await openWorkspace(page)

    const rail = page.locator('.talos-left-rail')
    const railBox = await rail.boundingBox()
    expect(railBox).toBeTruthy()

    const themeLauncher = page.getByRole('button', { name: 'Theme', exact: true })
    const themeLauncherBox = await themeLauncher.boundingBox()
    expect(themeLauncherBox).toBeTruthy()
    await themeLauncher.click()
    const themeWindow = page.locator('[data-window-id="theme"]')
    const themeFrame = page.locator('[data-window-frame-id="theme"]')
    await expect(themeWindow).toBeVisible()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'opening')
    await expect(themeFrame).toHaveAttribute('data-window-origin-source', 'sidebar')

    await expect.poll(() => themeWindow.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0)
    const openingOriginX = Number(await themeFrame.getAttribute('data-window-origin-x'))
    expect(openingOriginX).toBeLessThan(0)
    const stageBox = await page.getByTestId('talos-desktop-window-stage').boundingBox()
    expect(stageBox).toBeTruthy()
    expect(Math.abs(
        Number(await themeFrame.getAttribute('data-window-origin-x'))
        - (themeLauncherBox!.x + (themeLauncherBox!.width / 2) - stageBox!.x),
    )).toBeLessThanOrEqual(1)
    expect(Math.abs(
        Number(await themeFrame.getAttribute('data-window-origin-y'))
        - (themeLauncherBox!.y + (themeLauncherBox!.height / 2) - stageBox!.y),
    )).toBeLessThanOrEqual(1)

    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'minimizing')
    const minimizeMotion = await themeWindow.evaluate((element) => {
        const animations = element.getAnimations()
        const duration = animations[0]?.effect?.getTiming().duration

        return {
            animationCount: animations.length,
            animationDurationMs: typeof duration === 'number' ? duration : 0,
            opacity: Number(window.getComputedStyle(element).opacity),
        }
    })
    expect(minimizeMotion.animationCount).toBeGreaterThan(0)
    expect(minimizeMotion.animationDurationMs).toBeGreaterThan(0)
    expect(minimizeMotion.opacity).toBeGreaterThan(0.1)
    const pendingMinimizeTarget = page.getByTestId('talos-minimize-target-theme')
    await expect(pendingMinimizeTarget).toHaveCount(1)
    const pendingTargetRect = await pendingMinimizeTarget.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    expect(Math.abs(
        Number(await themeFrame.getAttribute('data-window-origin-x'))
        - (pendingTargetRect.x + (pendingTargetRect.width / 2) - stageBox!.x),
    )).toBeLessThanOrEqual(1)
    expect(Math.abs(
        Number(await themeFrame.getAttribute('data-window-origin-y'))
        - (pendingTargetRect.y + (pendingTargetRect.height / 2) - stageBox!.y),
    )).toBeLessThanOrEqual(1)
    await expect(themeWindow).toHaveCount(0)

    const restoreButton = page.getByTestId('talos-restore-window-theme')
    await expect(restoreButton).toBeVisible()
    await restoreButton.click()
    await expect(themeWindow).toBeVisible()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'restoring')
    await expect(themeFrame).toHaveAttribute('data-window-origin-source', 'dock')
    await expect.poll(() => themeWindow.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0)
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'opening')
    await expect(themeFrame).toHaveAttribute('data-window-origin-source', 'sidebar')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'minimizing')
    await expect.poll(() => themeWindow.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0)
    await page.waitForTimeout(170)
    const sidebarRefocusMinimizeMotion = await themeWindow.evaluate((element) => {
        return {
            opacity: Number(window.getComputedStyle(element).opacity),
            animationCount: element.getAnimations().length,
        }
    })
    expect(sidebarRefocusMinimizeMotion.animationCount).toBeGreaterThan(0)
    expect(sidebarRefocusMinimizeMotion.opacity).toBeGreaterThanOrEqual(0)
    expect(sidebarRefocusMinimizeMotion.opacity).toBeLessThan(1)
    await expect(themeWindow).toHaveCount(0)
    await restoreButton.click()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await page.getByRole('button', { name: 'Fullscreen Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-transition', 'maximizing')
    await expect.poll(() => themeWindow.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0)
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    await expectWorkspaceFullscreenCoverage(page, 'theme')

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`floating-window-transitions-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('window modules stay out of initial requests and load once on first open', async ({ page }) => {
    const moduleRequests = async (moduleName: string) => page.evaluate((name) => (
        performance.getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((url) => url.includes(name))
    ), moduleName)

    expect(await moduleRequests('TalosThemeWindow')).toEqual([])

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toBeVisible()
    await expect.poll(async () => (await moduleRequests('TalosThemeWindow')).length).toBe(1)

    const firstRequest = await moduleRequests('TalosThemeWindow')
    await page.getByRole('button', { name: 'Close Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Theme Engine', exact: true })).toBeVisible()
    expect(await moduleRequests('TalosThemeWindow')).toEqual(firstRequest)
})

test('floating windows organize multi-section modules with first-level section tabs', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop section tab navigation is covered by the desktop project')

    await openWorkspace(page)
    const advancedToggle = page.getByRole('button', { name: 'Advanced', exact: true })
    if (await advancedToggle.getAttribute('aria-expanded') === 'false') {
        await advancedToggle.click()
    }

    const windows = [
        {
            button: 'Library',
            windowId: 'library',
            tabs: ['Context Vault', 'Documents'],
            secondTab: 'Documents',
            secondPanelTestId: 'talos-window-section-library-documents',
        },
        {
            button: 'Brain',
            windowId: 'brain',
            tabs: ['Memory', 'Skills', 'Skill Audit'],
            secondTab: 'Skills',
            secondPanelTestId: 'talos-window-section-brain-skills',
        },
        {
            button: 'Model Lab',
            windowId: 'model_lab',
            tabs: ['Cookbook', 'Models'],
            secondTab: 'Models',
            secondPanelTestId: 'talos-window-section-model_lab-models',
        },
        {
            button: 'Tasks',
            windowId: 'tasks',
            tabs: ['Tasks', 'Email'],
            secondTab: 'Email',
            secondPanelTestId: 'talos-window-section-tasks-email',
        },
        {
            button: 'Doctor',
            windowId: 'doctor',
            tabs: ['Doctor', 'Policy', 'Shell', 'Backup', 'Audit'],
            secondTab: 'Policy',
            secondPanelTestId: 'talos-window-section-doctor-policy',
        },
        {
            button: 'Knowledge',
            windowId: 'search',
            tabs: ['Context Vault', 'Documents'],
            secondTab: 'Documents',
            secondPanelTestId: 'talos-window-section-search-documents',
        },
    ] as const

    for (const item of windows) {
        await page.getByRole('button', { name: item.button, exact: true }).click()
        const window = page.locator(`[data-window-id="${item.windowId}"]`)
        await expect(window).toBeVisible()
        await expect.poll(async () => window.getAttribute('data-window-transition')).toBe('idle')

        const tablist = window.getByTestId(`talos-window-section-tabs-${item.windowId}`)
        await expect(tablist).toBeVisible()

        const layout = await tablist.evaluate((element) => {
            const style = window.getComputedStyle(element)

            return {
                display: style.display,
                flexDirection: style.flexDirection,
                cursor: window.getComputedStyle(element.querySelector('[role="tab"]') as Element).cursor,
            }
        })
        expect(layout.display).toBe('flex')
        expect(layout.flexDirection).toBe('row')
        expect(layout.cursor).toBe('pointer')

        for (const label of item.tabs) {
            const tab = tablist.getByRole('tab', { name: label, exact: true })
            await expect(tab).toBeVisible()
            const panelId = await tab.getAttribute('aria-controls')
            expect(panelId).toBeTruthy()
            await expect(window.locator(`#${panelId}`)).toHaveCount(1)
        }

        await tablist.getByRole('tab', { name: item.secondTab, exact: true }).click()
        await expect(tablist.getByRole('tab', { name: item.secondTab, exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(window.getByTestId(item.secondPanelTestId)).toBeVisible()
    }

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`window-section-tabs-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('floating tool windows are resizable and can reset their saved size', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop window resizing is covered by the desktop project')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()

    const themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    const before = await themeWindow.boundingBox()
    const resizeHandle = page.getByLabel('Resize Theme window bottom right')
    const handleBox = await resizeHandle.boundingBox()
    expect(before).toBeTruthy()
    expect(handleBox).toBeTruthy()

    await page.mouse.move((handleBox?.x ?? 0) + 8, (handleBox?.y ?? 0) + 8)
    await page.mouse.down()
    await page.mouse.move((handleBox?.x ?? 0) + 168, (handleBox?.y ?? 0) + 108)
    await page.mouse.up()

    const resized = await themeWindow.boundingBox()
    expect(resized?.width).toBeGreaterThan((before?.width ?? 0) + 100)
    expect(resized?.height).toBeGreaterThan((before?.height ?? 0) + 70)
    await expect(themeWindow).toHaveAttribute('data-window-width', String(Math.round(resized?.width ?? 0)))
    await expect(themeWindow).toHaveAttribute('data-window-height', String(Math.round(resized?.height ?? 0)))
    const storedLayout = await page.evaluate(() => ({
        v2: JSON.parse(window.localStorage.getItem('talos.windowLayout.v2') ?? '{}'),
        v1: window.localStorage.getItem('talos.windowLayout.v1'),
    }))
    expect(storedLayout.v2?.schema_version).toBe(2)
    expect(storedLayout.v2?.layouts?.desktop?.windows?.theme?.bounds?.width).toBe(Math.round(resized?.width ?? 0))
    expect(storedLayout.v2?.layouts?.desktop?.windows?.theme?.bounds?.height).toBe(Math.round(resized?.height ?? 0))
    expect(storedLayout.v1).toBeNull()
    await expectNoComposerOverlap(page)

    await page.getByRole('button', { name: 'Reset Theme size' }).click()
    const reset = await themeWindow.boundingBox()
    expect(reset?.width).toBeLessThan((resized?.width ?? 0) - 80)
    await expectNoHorizontalOverflow(page)

    await testInfo.attach(`floating-window-resize-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('resizing a side-snapped window reflows chat in the same interaction and persists the split', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop split resizing is covered by the desktop project')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    let themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    const titleSpace = page.getByLabel('Drag Theme window')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    await titleSpace.focus()
    await page.keyboard.press('Control+ArrowLeft')
    await expect(page.locator('[data-window-frame-id="theme"]')).toHaveAttribute('data-window-tile-target', 'left-half')
    await expect(page.locator('.talos-left-rail')).toHaveAttribute('data-sidebar-state', 'collapsed')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    const stage = page.getByTestId('talos-desktop-window-stage')
    const thread = page.locator('.talos-chat-thread').first()
    const header = page.locator('.talos-workspace-header').first()
    const composer = page.locator('.talos-composer-area').first()
    const beforeWindow = await themeWindow.boundingBox()
    const beforeThread = await thread.boundingBox()
    const beforeHeader = await header.boundingBox()
    const beforeComposer = await composer.boundingBox()
    const stageBounds = await stage.boundingBox()
    const resizeHandle = page.getByLabel('Resize Theme window right')
    const handleBounds = await resizeHandle.boundingBox()
    expect(beforeWindow).toBeTruthy()
    expect(beforeThread).toBeTruthy()
    expect(beforeHeader).toBeTruthy()
    expect(beforeComposer).toBeTruthy()
    expect(stageBounds).toBeTruthy()
    expect(handleBounds).toBeTruthy()

    const handleX = (handleBounds?.x ?? 0) + ((handleBounds?.width ?? 0) / 2)
    const handleY = (handleBounds?.y ?? 0) + Math.min(120, (handleBounds?.height ?? 0) / 2)
    await page.mouse.move(handleX, handleY)
    await page.mouse.down()
    await page.mouse.move(handleX + 120, handleY, { steps: 8 })

    await expect(stage).toHaveAttribute('data-window-interaction', 'resize')
    const duringWindow = await themeWindow.boundingBox()
    const duringThread = await thread.boundingBox()
    const duringHeader = await header.boundingBox()
    const duringComposer = await composer.boundingBox()
    const duringTransitions = await Promise.all([thread, header, composer].map((surface) => (
        surface.evaluate((element) => getComputedStyle(element).transitionDuration)
    )))
    const windowDelta = (duringWindow?.width ?? 0) - (beforeWindow?.width ?? 0)
    expect(duringWindow?.width).toBeGreaterThan((beforeWindow?.width ?? 0) + 90)
    expect(Math.abs((duringWindow?.height ?? 0) - (stageBounds?.height ?? 0))).toBeLessThanOrEqual(1)
    for (const [beforeSurface, duringSurface] of [
        [beforeThread, duringThread],
        [beforeHeader, duringHeader],
        [beforeComposer, duringComposer],
    ] as const) {
        expect(duringSurface?.x).toBeGreaterThan((beforeSurface?.x ?? 0) + 90)
        expect(Math.abs(((duringSurface?.x ?? 0) - (beforeSurface?.x ?? 0)) - windowDelta)).toBeLessThanOrEqual(3)
    }
    expect(duringTransitions.every((transition) => transition.split(',').every((duration) => duration.trim() === '0s'))).toBe(true)

    await page.mouse.up()
    await expect(stage).toHaveAttribute('data-window-interaction', 'idle')
    const savedWidth = Math.round((await themeWindow.boundingBox())?.width ?? 0)
    const storedWidth = await page.evaluate(() => JSON.parse(window.localStorage.getItem('talos.windowLayout.v2') ?? '{}')?.layouts?.desktop?.windows?.theme?.bounds?.width)
    expect(storedWidth).toBe(savedWidth)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const reloadedWidth = (await themeWindow.boundingBox())?.width ?? 0
    const reloadDiagnostic = await page.evaluate(() => ({
        railState: document.querySelector('.talos-left-rail')?.getAttribute('data-sidebar-state'),
        railWidth: getComputedStyle(document.querySelector('[data-testid="talos-workspace"]')!).getPropertyValue('--talos-rail-width'),
        reflowLeft: getComputedStyle(document.querySelector('.talos-chat-scroll-root')!).getPropertyValue('--talos-window-reflow-left'),
        stored: JSON.parse(window.localStorage.getItem('talos.windowLayout.v2') ?? '{}')?.layouts?.desktop?.windows?.theme,
    }))
    expect(Math.abs(reloadedWidth - savedWidth), JSON.stringify({ savedWidth, reloadedWidth, reloadDiagnostic }, null, 2)).toBeLessThanOrEqual(1)
})

test('closing or minimizing a desktop window returns focus to its launcher and removes its interaction surface', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'mobile focus return is owned by the modal sheet contract')

    await openWorkspace(page)
    const launcher = page.getByRole('button', { name: 'Theme', exact: true })
    await launcher.focus()
    await launcher.click()
    const themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect(themeWindow).toBeVisible()
    await themeWindow.getByRole('button', { name: 'Close Theme' }).click()
    await expect(themeWindow).toHaveCount(0)
    await expect(launcher).toBeFocused()

    await launcher.click()
    await expect(themeWindow).toBeVisible()
    await themeWindow.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(themeWindow).toHaveCount(0)
    await expect(launcher).toBeFocused()
    await expect(page.getByTestId('talos-restore-window-theme')).toBeVisible()
})

test('desktop title-space keyboard snapping and Escape cancellation reach the window manager', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'mobile sheets intentionally expose no desktop window geometry commands')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.getByRole('region', { name: 'Theme' })
    const titleSpace = page.getByLabel('Drag Theme window')
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    await titleSpace.focus()

    await page.keyboard.press('Control+ArrowLeft')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const leftBounds = await themeWindow.boundingBox()
    expect(leftBounds).toBeTruthy()
    await titleSpace.focus()
    await page.keyboard.press('Control+ArrowRight')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const rightBounds = await themeWindow.boundingBox()
    expect(rightBounds).toBeTruthy()
    expect(rightBounds!.x).toBeGreaterThan(leftBounds!.x + 200)
    expect(Math.abs(rightBounds!.width - leftBounds!.width)).toBeLessThanOrEqual(2)

    await themeWindow.getByRole('button', { name: 'Reset Theme size' }).click()
    const handleBounds = await titleSpace.boundingBox()
    expect(handleBounds).toBeTruthy()
    await page.mouse.move(handleBounds!.x + 32, handleBounds!.y + 12)
    await page.mouse.down()
    await page.mouse.move(handleBounds!.x + 82, handleBounds!.y + 42)
    const cancelledAt = await themeWindow.boundingBox()
    await page.keyboard.press('Escape')
    await page.mouse.move(handleBounds!.x + 220, handleBounds!.y + 160)
    await page.mouse.up()
    const afterCancellation = await themeWindow.boundingBox()

    expect(Math.abs((afterCancellation?.x ?? 0) - (cancelledAt?.x ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((afterCancellation?.y ?? 0) - (cancelledAt?.y ?? 0))).toBeLessThanOrEqual(1)
})

test('desktop window layout survives reload and corrupt V2 geometry fails closed', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop layout persistence is intentionally separate from mobile sheets')

    await openWorkspace(page)
    const launcher = page.getByRole('button', { name: 'Theme', exact: true })
    await launcher.click()
    let themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const titleSpace = page.getByLabel('Drag Theme window')
    const handle = await titleSpace.boundingBox()
    expect(handle).toBeTruthy()
    await page.mouse.move(handle!.x + 36, handle!.y + 12)
    await page.mouse.down()
    await page.mouse.move(handle!.x + 92, handle!.y + 56)
    await page.mouse.up()
    const savedBounds = await themeWindow.boundingBox()
    expect(savedBounds).toBeTruthy()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const reloadedBounds = await themeWindow.boundingBox()
    expect(Math.abs((reloadedBounds?.x ?? 0) - savedBounds!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs((reloadedBounds?.y ?? 0) - savedBounds!.y)).toBeLessThanOrEqual(1)

    await themeWindow.getByRole('button', { name: 'Dock Theme' }).click()
    await expect(page.getByTestId('talos-right-dock')).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect(page.getByTestId('talos-right-dock')).toContainText('Theme Engine')

    await themeWindow.getByRole('button', { name: 'Undock Theme' }).click()
    await themeWindow.getByRole('button', { name: 'Fullscreen Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    await expectWorkspaceFullscreenCoverage(page, 'theme')

    await themeWindow.getByRole('button', { name: 'Exit fullscreen Theme' }).click()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const reloadedTitleSpace = page.getByLabel('Drag Theme window')
    await reloadedTitleSpace.focus()
    await page.keyboard.press('Control+ArrowRight')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const snappedBounds = await themeWindow.boundingBox()
    const snappedLayout = await page.evaluate(() => window.localStorage.getItem('talos.windowLayout.v2'))
    expect(snappedBounds).toBeTruthy()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const reloadedSnapBounds = await themeWindow.boundingBox()
    const snapDiagnostic = JSON.stringify({ snappedBounds, reloadedSnapBounds, snappedLayout })
    expect(Math.abs((reloadedSnapBounds?.x ?? 0) - snappedBounds!.x), snapDiagnostic).toBeLessThanOrEqual(1)
    expect(Math.abs((reloadedSnapBounds?.width ?? 0) - snappedBounds!.width), snapDiagnostic).toBeLessThanOrEqual(1)

    await page.evaluate(() => window.localStorage.setItem('talos.windowLayout.v2', JSON.stringify({
        schema_version: 2,
        layouts: {
            desktop: {
                windows: {
                    theme: {
                        bounds: { x: 'invalid', y: -999999, width: -1, height: 0 },
                        presentation: 'floating',
                    },
                },
            },
            tablet: { windows: {} },
        },
    })))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    themeWindow = page.getByRole('region', { name: 'Theme' })
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    await expectNoComposerOverlap(page)
    await expectNoHorizontalOverflow(page)
})

test('slice one appearance shortcuts and fullscreen windows stay connected to workspace state', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop fullscreen and keyboard shortcut behavior is covered by the desktop project')

    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByRole('tab', { name: 'Visibility' }).click()
    const appearancePatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const appearance = preferences?.appearance_visibility as Record<string, Record<string, unknown>> | undefined

        return hasSettingsExpectedRevision(body)
            && appearance?.chat_area?.welcome_message === false
            && appearance?.chat_area?.full_width_chat === true
            && appearance?.chat_area?.mission_path === false
    })
    await page.getByRole('switch', { name: 'Welcome message' }).click()
    await page.getByRole('switch', { name: 'Full-width chat' }).click()
    await page.getByRole('switch', { name: 'Mission Path' }).click()
    await page.getByRole('button', { name: 'Save settings' }).click()
    await appearancePatchRequest
    await expect(page.locator('[aria-label="TALOS chat thread"] h2')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'TALOS guided start' })).toHaveCount(0)

    await page.getByRole('tab', { name: 'Shortcuts' }).click()
    const compareShortcutRow = page.getByTestId('talos-shortcut-row-open_compare')
    await compareShortcutRow.getByRole('button', { name: /^Set$/ }).click()
    await page.keyboard.press('Control+Alt+M')
    await expect(compareShortcutRow.getByText('Ctrl+Alt+M')).toBeVisible()

    const cookbookShortcutRow = page.getByTestId('talos-shortcut-row-open_cookbook')
    await cookbookShortcutRow.getByRole('button', { name: /^Set$/ }).click()
    await page.keyboard.press('Control+Alt+M')
    await expect(page.getByText('Ctrl+Alt+M is already assigned to Open Compare.')).toBeVisible()
    await page.keyboard.press('Escape')

    const shortcutPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const shortcuts = preferences?.keyboard_shortcuts as Record<string, unknown> | undefined

        return hasSettingsExpectedRevision(body)
            && shortcuts?.open_compare === 'Ctrl+Alt+M'
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await shortcutPatchRequest

    await page.locator('body').click({ position: { x: 24, y: 24 } })
    await page.keyboard.press('Control+Alt+M')
    await expect(page.getByRole('heading', { name: 'Compare', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.getByRole('region', { name: 'Theme' }).first()
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    await page.getByRole('button', { name: 'Fullscreen Theme' }).click()
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')
    const fullscreenBox = await themeWindow.boundingBox()
    expect(fullscreenBox?.width).toBeGreaterThan(900)
    await expectWorkspaceFullscreenCoverage(page, 'theme')

    await page.getByRole('button', { name: 'Minimize Theme' }).click()
    await expect(page.getByTestId('talos-minimized-window-dock')).toBeVisible()
    await page.getByTestId('talos-restore-window-theme').click()
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')

    await testInfo.attach(`slice-one-workspace-controls-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('a minimized desktop window can be closed without being restored', async ({ page }) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeWindow = page.locator('[data-window-id="theme"]')
    await expect(themeWindow).toBeVisible()
    await expect.poll(async () => themeWindow.getAttribute('data-window-transition')).toBe('idle')

    await themeWindow.getByRole('button', { name: 'Minimize Theme', exact: true }).click()
    const restoreButton = page.getByTestId('talos-restore-window-theme')
    const closeButton = page.getByTestId('talos-close-minimized-window-theme')
    await expect(restoreButton).toBeVisible()
    await expect(closeButton).toBeVisible()

    await closeButton.click()

    await expect(themeWindow).toHaveCount(0)
    await expect(restoreButton).toHaveCount(0)
    await expect(closeButton).toHaveCount(0)
})

test('prompt enhancer uses the selected model and supports review, cancel, insert, replace, and final send', async ({ page }, testInfo) => {
    await openWorkspace(page)

    const originalPrompt = 'Draft a recovery plan for failed payment jobs.'
    const expectedEnhancement = `Create an execution-ready plan for: ${originalPrompt}\n\nInclude scope, constraints, evidence, and verifiable acceptance checks.`
    const chatRequests: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/chat') && request.method() === 'POST') {
            chatRequests.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByLabel('Message TALOS').fill(`  ${originalPrompt}  `)
    const enhancementRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/prompts/enhance') && request.method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Improve prompt' }).click()
    const enhancementBody = (await enhancementRequest).postDataJSON() as Record<string, unknown>

    expect(enhancementBody).toMatchObject({
        prompt: originalPrompt,
        model_profile_id: 'profile-e2e',
    })
    expect(enhancementBody).not.toHaveProperty('api_key')
    expect(enhancementBody).not.toHaveProperty('secret')
    expect(enhancementBody).not.toHaveProperty('encrypted_secret')
    expect(chatRequests).toHaveLength(0)

    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeVisible()
    await expect(page.getByText('Enhanced with openai · gpt-e2e', { exact: true })).toBeVisible()
    await expect(page.getByText(expectedEnhancement, { exact: true })).toBeVisible()
    await expect(page.getByText('Adds an explicit output contract and verification criteria.', { exact: true })).toBeVisible()
    await expect(page.getByText('Acceptance checks', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toHaveValue(`  ${originalPrompt}  `)

    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeHidden()
    await expect(page.getByLabel('Message TALOS')).toHaveValue(`  ${originalPrompt}  `)

    await page.getByLabel('Message TALOS').fill('Keep this original request.')
    await page.getByRole('button', { name: 'Improve prompt' }).click()
    const insertedEnhancement = 'Create an execution-ready plan for: Keep this original request.\n\nInclude scope, constraints, evidence, and verifiable acceptance checks.'
    await expect(page.getByText(insertedEnhancement, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Insert below' }).click()
    await expect(page.getByLabel('Message TALOS')).toHaveValue(`Keep this original request.\n\n${insertedEnhancement}`)
    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeHidden()

    await page.getByLabel('Message TALOS').fill(originalPrompt)
    await page.getByRole('button', { name: 'Improve prompt' }).click()
    await expect(page.getByText(expectedEnhancement, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Replace prompt' }).click()
    await expect(page.getByLabel('Message TALOS')).toHaveValue(expectedEnhancement)
    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeHidden()

    const chatRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/chat') && request.method() === 'POST'
    ))
    await page.getByRole('button', { name: 'Send' }).click()
    expect((await chatRequest).postDataJSON()).toMatchObject({ message: expectedEnhancement })
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    expect(chatRequests).toHaveLength(1)

    await testInfo.attach(`prompt-enhancer-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('prompt enhancer exposes pending and controlled provider failure states without mutating or sending', async ({ page }) => {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        promptEnhancement: {
            delayMs: 350,
            failure: {
                status: 503,
                code: 'PROMPT_ENHANCER_PROVIDER_UNAVAILABLE',
                message: 'The selected model provider could not be reached. Check the profile and try again.',
                retryable: true,
            },
        },
    })
    await openWorkspace(page)

    const chatRequests: string[] = []
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/chat') && request.method() === 'POST') {
            chatRequests.push(request.url())
        }
    })

    const prompt = 'Preserve this prompt after failure.'
    await page.getByLabel('Message TALOS').fill(prompt)
    await page.getByRole('button', { name: 'Improve prompt' }).click()

    await expect(page.getByText('Enhancing prompt', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Improve prompt' })).toBeDisabled()
    await expect(page.getByText('The selected model provider could not be reached. Check the profile and try again.', { exact: true }).first()).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toHaveValue(prompt)
    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeHidden()
    expect(chatRequests).toHaveLength(0)
})

test('temporary chat mode creates an explicit temporary session before sending', async ({ page }, testInfo) => {
    await openWorkspace(page)

    const temporaryChat = page.getByRole('button', { name: 'Temporary chat' })
    await temporaryChat.click()
    await expect(temporaryChat).toHaveAttribute('aria-pressed', 'true')

    await page.getByLabel('Message TALOS').fill('Run this as a disposable investigation.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('Temporary session')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await testInfo.attach(`temporary-session-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('temporary chat mode starts a temporary session instead of reusing an active persistent session', async ({ page }) => {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        initialSessions: [
            {
                id: 'session-persistent',
                title: 'Persistent history',
                persistence_mode: 'persistent',
            },
        ],
    })

    const persistentMessagesRequest = page.waitForRequest((request) => (
        request.url().includes('/api/talos/sessions/session-persistent/messages') && request.method() === 'GET'
    ))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await persistentMessagesRequest

    await page.getByRole('button', { name: 'Temporary chat' }).click()
    const temporarySessionRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/sessions') || request.method() !== 'POST') {
            return false
        }

        return request.postDataJSON().persistence_mode === 'temporary'
    })

    await page.getByLabel('Message TALOS').fill('Do not append this to persistent history.')
    await page.getByRole('button', { name: 'Send' }).click()
    await temporarySessionRequest

    await expect(page.getByText('Temporary session')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
})

test('dashboard exports a persisted benchmark report through a real endpoint', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Benchmarks')

    await expect(page.getByText('E2E benchmark export')).toBeVisible()
    await expect(page.getByText('Fairness contract')).toBeVisible()
    await expect(page.getByText('Proof Builder', { exact: true })).toBeVisible()
    await expect(page.getByText('Persisted benchmark group', { exact: true })).toBeVisible()
    await expect(page.getByText('2 persisted lanes', { exact: true })).toBeVisible()
    await expect(page.getByText('Export ready', { exact: true })).toBeVisible()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export report' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('talos-benchmark-benchmark-group-e2e.json')
    const path = await download.path()
    expect(path).toBeTruthy()
    const report = JSON.parse(readFileSync(path as string, 'utf8'))
    expect(report.report_type).toBe('talos_benchmark_export')
    expect(report.export_status).toBe('complete')
    expect(report.fairness_contract.same_prompt).toBe('prompthash-e2e')
    expect(report.results).toHaveLength(2)
    await expect(page.getByText('Benchmark report exported.')).toBeVisible()
})

test('dashboard ingests a user file and creates a grounded context set', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.locator('input[type="file"]').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Approve deployment only after replay evidence is attached.'),
    })

    await expect(page.getByText('workflow.md uploaded through /api/files/ingest.')).toBeVisible()
    await expect(page.getByText('workflow.md').first()).toBeVisible()

    await page.getByRole('button', { name: /workflow.md/ }).click()
    await page.getByPlaceholder('Incident response context').fill('E2E grounded context')
    await page.getByRole('button', { name: 'Create context set' }).click()

    await expect(page.getByText('Context set "E2E grounded context" created with 1 sources.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose grounding context' })).toContainText('E2E grounded context')
})

test('dashboard opens a real file benchmark scenario from a fresh upload', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.locator('input[type="file"]').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Approve deployment only after replay evidence is attached.'),
    })

    await expect(page.getByText('workflow.md uploaded through /api/files/ingest.')).toBeVisible()
    await page.getByRole('button', { name: 'Benchmark this file' }).click()

    await expect(page.getByRole('heading', { name: 'AVM ON/OFF evidence' })).toBeVisible()
    await expect(page.getByText('Proof Builder', { exact: true })).toBeVisible()
    await expect(page.getByText('File handoff', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Benchmark scenario ref')).toHaveValue('018f47a2-7f42-7d10-9b37-000000000003')

    const fileBenchmarkRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/benchmarks/compare') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>

        return body.scenario_ref === '018f47a2-7f42-7d10-9b37-000000000003'
            && body.runs === 1
    })
    await page.getByRole('button', { name: 'Open command palette' }).click()
    await page.getByLabel('Search TALOS commands').fill('run avm compare')
    await expect(page.getByRole('option', { name: /Run AVM compare/ })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('option', { name: /Run AVM compare/ }).click()
    await fileBenchmarkRequest
    await expect(page.getByText('Benchmark comparison completed.')).toBeVisible()
    await expect(page.getByText('E2E generated compare')).toBeVisible()
})

test('file context grounds a chat turn and exposes source provenance', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.locator('input[type="file"]').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('Approve deployment only after replay evidence is attached.'),
    })
    await page.getByRole('button', { name: /workflow.md/ }).click()
    await page.getByPlaceholder('Incident response context').fill('E2E grounded context')
    await page.getByRole('button', { name: 'Create context set' }).click()
    await expect(page.getByText('Context set "E2E grounded context" created with 1 sources.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose grounding context' })).toContainText('E2E grounded context')

    await page.getByLabel('Message TALOS').fill('Use the uploaded file and cite the source.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('E2E response from AVM with replayable evidence and grounded file context.')).toBeVisible()
    const chatThread = page.getByLabel('TALOS chat thread')
    await expect(chatThread.getByText('Source provenance')).toBeVisible()
    await expect(chatThread.getByText('workflow.md').first()).toBeVisible()
    await expect(chatThread.getByText('Workflow file says approve the deployment checklist.')).toBeVisible()
})

test('context vault can import a selected google drive file through the real import endpoint', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Knowledge')

    await page.getByRole('button', { name: /Import from Drive/ }).click()
    await page.getByRole('button', { name: /Import Drive Notes.md/ }).click()

    await expect(page.getByText('Imported Drive Notes.md into Context Vault.')).toBeVisible()
})

test('deep research v3 queues source-backed draft reports with claim graph evidence', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Deep Research')

    await expect(page.getByRole('heading', { name: 'Deep Research V3' })).toBeVisible()
    await expect(page.getByLabel('Research query')).toBeVisible()
    await page.getByLabel('Report title').fill('AVM evidence review')
    await page.getByLabel('Research query').fill('Map AVM evidence to every product claim before publishing.')
    await page.getByLabel('Primary source URL').fill('https://example.com/avm-evidence')
    await page.getByLabel('Source title').fill('AVM evidence source')
    await page.getByLabel('Initial claim').fill('AVM research claims stay pending until fetched evidence exists.')

    await page.getByRole('button', { name: 'Research settings' }).click()
    await page.getByLabel('Rounds selector').selectOption('2')
    await page.getByLabel('Format selector').selectOption('briefing')
    await page.getByLabel('Search engine selector').selectOption('searxng')
    await page.getByLabel('Endpoint selector').selectOption('local')
    await page.getByLabel('Model selector').selectOption('profile-e2e')

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/research-reports') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown>
        const sources = body.sources as Array<Record<string, unknown>>
        const claims = body.claims as Array<Record<string, unknown>>

        return metadata.queue_status === 'queued'
            && metadata.rounds === 2
            && metadata.format === 'briefing'
            && metadata.search_engine === 'searxng'
            && metadata.endpoint === 'local'
            && metadata.model_profile_id === 'profile-e2e'
            && sources[0]?.status === 'planned'
            && claims[0]?.status === 'pending'
    })

    await page.getByRole('button', { name: 'Queue report' }).click()
    await createRequest

    await expect(page.getByText('Research queue')).toBeVisible()
    const queuedReport = page.getByRole('button', { name: /AVM evidence review/ })
    await expect(queuedReport.getByText('queue_status')).toBeVisible()
    await expect(queuedReport.getByText('queued', { exact: true })).toBeVisible()
    await expect(page.getByText('Claim-source graph')).toBeVisible()
    await expect(page.getByText('src-1 -> claim #1')).toBeVisible()
    await expect(page.getByText('planned').first()).toBeVisible()
    await expect(page.getByText('pending').first()).toBeVisible()
    await expect(page.getByText(/ref research-art \/ run research-run/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Chat with report unavailable' })).toBeDisabled()
    await expect(page.getByText('talos://research-reports/')).toHaveCount(0)

    const exportRequest = page.waitForRequest((request) => request.url().includes('/api/talos/research-reports/research-report-e2e-1/export?format=markdown') && request.method() === 'GET')
    await page.getByRole('button', { name: 'Export report' }).click()
    await exportRequest
    await expect(page.getByText('Research report exported.')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`deep-research-v3-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('calendar v3 renders drafts as events and parses quick add safely', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Calendar')

    await expect(page.getByRole('heading', { name: 'Calendar V3' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous month' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Today' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next month' })).toBeVisible()
    await expect(page.getByLabel('Calendar view mode')).toContainText('Week')
    await expect(page.getByLabel('Calendar view mode')).toContainText('Month')
    await expect(page.getByLabel('Calendar view mode')).toContainText('Year')
    await expect(page.getByLabel('Calendar view mode')).toContainText('Agenda')
    await expect(page.getByText('Month grid')).toBeVisible()

    await page.getByLabel('Quick add event').fill('just vibes')
    await page.getByRole('button', { name: 'Quick add' }).click()
    await expect(page.getByText('Could not parse quick add. Try "crew muster 10am daily", "meeting tomorrow 15:00", or "review Friday 9-10".')).toBeVisible()
    await expect(page.getByLabel('Quick add event')).toHaveValue('just vibes')

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/calendar-drafts') || request.method() !== 'POST') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const metadata = body.metadata as Record<string, unknown>

        return body.title === 'crew muster'
            && body.timezone === 'Europe/Rome'
            && metadata.quick_add_raw === 'crew muster 10am daily'
            && metadata.recurrence === 'daily'
    })

    await page.getByLabel('Quick add event').fill('crew muster 10am daily')
    await page.getByRole('button', { name: 'Quick add' }).click()
    await createRequest

    await expect(page.getByText('crew muster')).toBeVisible()
    await expect(page.getByText('confirmation_required: true')).toBeVisible()
    await page.getByLabel('Search all events').fill('crew')
    await expect(page.getByText('crew muster')).toBeVisible()

    const confirmRequest = page.waitForRequest((request) => request.url().includes('/api/talos/calendar-drafts/calendar-draft-e2e-1/confirm') && request.method() === 'POST')
    await page.getByRole('button', { name: 'Confirm draft' }).click()
    await confirmRequest
    await expect(page.getByText('confirmed')).toBeVisible()
    await expect(page.getByText('confirmation_required: false')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`calendar-v3-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('calendar shows google sync state and keeps publish gated', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Productivity')
    await page.getByRole('button', { name: /Calendar/ }).click()

    await expect(page.getByText('Google Calendar')).toBeVisible()
    await expect(page.getByText('External writes require confirmation.')).toBeVisible()
})

test('dashboard replays a persisted failed run and exposes fault evidence', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')

    await expect(page.getByRole('button', { name: /run-e2e verified execution/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed/ })).toBeVisible()
    await expect(page.getByLabel('Run timeline').getByText('3 events', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Trace replay' }).click()
    await expect(page.getByText('2 node states')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ }).getByText('fault', { exact: true })).toBeVisible()
})

test('dashboard replay filters to fault steps through a real control', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')
    await page.getByRole('tab', { name: 'Trace replay', exact: true }).click()

    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()

    await page.getByLabel('Replay step filter').selectOption('fault')

    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#3 node_blocked Blocked by node-e2e fault/ })).toBeVisible()
    await expect(page.getByText('1/2')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
})

test('runtime cockpit organizes run evidence into summary tabs and recovery preview', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')

    await expect(page.getByRole('heading', { name: 'Runtime cockpit' })).toBeVisible()
    const runSummary = page.getByLabel('Run summary')
    await expect(runSummary.getByText('Run summary')).toBeVisible()
    await expect(runSummary.getByText('Model', { exact: true })).toBeVisible()
    await expect(runSummary.getByText('profile-e2e')).toBeVisible()
    await expect(runSummary.getByText('AVM mode')).toBeVisible()
    await expect(runSummary.getByText('verified execution')).toBeVisible()
    await expect(runSummary.getByText('Replayable')).toBeVisible()
    await expect(runSummary.getByText('3 events')).toBeVisible()
    await expect(runSummary.getByText('2 nodes')).toBeVisible()

    await page.getByRole('tab', { name: 'Trace replay', exact: true }).click()
    await page.getByLabel('Replay step filter').selectOption('fault')
    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#3 node_blocked Blocked by node-e2e fault/ })).toBeVisible()

    await page.getByRole('tab', { name: 'DAG', exact: true }).click()
    await expect(page.getByText('Blocked by dependency')).toBeVisible()
    await expect(page.getByText('Parent node node-e2e failed before this branch could run.')).toBeVisible()

    await page.getByRole('tab', { name: 'Timeline', exact: true }).click()
    await page.getByLabel('Runtime event filter').selectOption('fault')
    await expect(page.getByRole('button', { name: /#1 node_started/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#3 node_blocked/ })).toBeVisible()

    await page.getByRole('button', { name: /#2 node_failed/ }).click()
    await expect(page.getByText('Validation faults')).toBeVisible()
    await expect(page.getByLabel('Validation faults evidence').getByText('UPSTREAM_UNAVAILABLE')).toBeVisible()
    await expect(page.getByText('Policy decisions')).toBeVisible()
    await expect(page.getByText('Worker output')).toBeVisible()
    await expect(page.getByLabel('Worker output evidence').getByText('HTTP 503')).toBeVisible()

    await page.getByRole('tab', { name: 'Recovery', exact: true }).click()
    await expect(page.getByText('Recovery preview')).toBeVisible()
    await expect(page.getByText('Target node node-e2e')).toBeVisible()
    await page.getByLabel('Recovery reason').fill('Retry after upstream returned healthy.')
    await page.getByRole('button', { name: 'Submit recovery' }).click()
    await expect(page.getByText('Audit: recovery.requested for node-e2e')).toBeVisible()

    await page.getByRole('tab', { name: 'Artifacts', exact: true }).click()
    await expect(page.getByText('Run evidence report')).toBeVisible()
    await expect(page.getByText(/ref artifact-run \/ run run-e2e/)).toBeVisible()
    await expect(page.getByText('local://reports/run-e2e.json')).toHaveCount(0)

    await page.getByRole('button', { name: 'Open audit log' }).click()
    await expect(page.getByTestId('talos-admin-section-audit')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`runtime-cockpit-v3-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('dashboard runs a fresh benchmark comparison and inspects created lanes', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Benchmarks')

    await page.getByLabel('Benchmark scenario ref').fill('018f47a2-7f42-7d10-9b37-000000000002')
    await page.getByLabel('Benchmark runs').fill('1')
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click()

    await expect(page.getByText('Benchmark comparison completed.')).toBeVisible()
    await expect(page.getByText('E2E generated compare')).toBeVisible()
    await expect(page.getByText('AVM ON generated')).toBeVisible()
    await expect(page.getByText('AVM OFF generated')).toBeVisible()
    await expect(page.getByText('Generated AVM lane preserved node evidence.')).toBeVisible()
    await expect(page.getByText('Direct lane completed without replayable node evidence.')).toBeVisible()
})

test('dashboard runs a blind model comparison, reveals vote, and promotes benchmark evidence', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Benchmarks')

    await page.getByRole('tab', { name: 'Model Compare' }).click()
    await expect(page.getByRole('heading', { name: 'Model Compare V4' })).toBeVisible()

    await page.getByLabel('Comparison prompt').fill('Compare recovery options for a blocked DAG.')
    await page.getByLabel('Model slot A').selectOption('profile-e2e')
    await page.getByLabel('Model slot B').selectOption('profile-alt-e2e')
    await page.getByRole('button', { name: 'Start blind comparison' }).click()

    await expect(page.getByText('Model comparison completed.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Model A' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Model B' })).toBeVisible()
    await expect(page.getByText('Identity hidden until vote').first()).toBeVisible()
    await expect(page.getByTestId('talos-comparison-lane-model-a').getByText('Run hidden')).toBeVisible()

    await page.getByRole('button', { name: 'Vote Model A' }).click()
    await expect(page.getByTestId('talos-comparison-lane-model-a').getByText('E2E server-side profile')).toBeVisible()
    await expect(page.getByTestId('talos-comparison-lane-model-b').getByText('E2E alternate profile')).toBeVisible()

    await page.getByRole('button', { name: 'Promote to benchmark' }).click()
    await expect(page.getByText('Model comparison promoted to benchmark evidence.')).toBeVisible()
    await expect(page.getByText('Model comparison V4')).toBeVisible()
    await expect(page.getByText('Model Lane A')).toBeVisible()
    await expect(page.getByText('Model Lane B')).toBeVisible()
    await expect(page.getByText('Export ready')).toBeVisible()
    const exportButton = page.getByRole('button', { name: 'Export report', exact: true })
    await expect(exportButton).toBeEnabled()
    const exportRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/benchmark-groups/benchmark-group-model-comparison-e2e/export')
        && request.method() === 'GET'
    ))
    await exportButton.click()
    await exportRequest
    await expect(page.getByText('Benchmark report exported.')).toBeVisible()
})

test('window lifecycle produces a perceptible painted-frame trajectory with the real interface switches', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop window lifecycle is measured by the desktop project')
    test.setTimeout(90_000)

    await patchTalosSettings(page, {
        theme: 'ember',
        reduced_motion: false,
        theme_motion_v6: {
            ...talosMotionV6Defaults,
            mode: 'adaptive',
            background_enabled: false,
            interface_enabled: true,
            interface: {
                ...talosMotionV6Defaults.interface,
                profile: 'expressive',
                intensity: 70,
                easing: 'soft',
            },
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const workspace = page.getByTestId('talos-workspace')
    await expect(workspace).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect(workspace).toHaveAttribute('data-ui-animation-profile', 'expressive')

    const themeWindow = page.locator('[data-window-id="theme"]')
    const stage = page.getByTestId('talos-desktop-window-stage')
    const themeLauncher = page.getByRole('button', { name: 'Theme', exact: true })
    const opening = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: stage,
        action: () => themeLauncher.click(),
        waitForFinal: () => expect(themeWindow).toHaveAttribute('data-window-transition', 'idle'),
    })
    expect(opening.presentation.lifecycle).toBe('opening')
    expectPaintedTransition(opening, { minimumDurationMs: 384 })
    await expect(themeWindow).toBeFocused()
    await expect.poll(() => themeWindow.evaluate((element) => element.getAnimations().length)).toBe(0)

    const minimizing = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: stage,
        action: () => page.getByRole('button', { name: 'Minimize Theme' }).click(),
        waitForFinal: () => expect(themeWindow).toHaveCount(0),
    })
    expect(minimizing.presentation.lifecycle).toBe('minimizing')
    expectPaintedTransition(minimizing, { minimumDurationMs: 456, midpointInteractive: false })
    await expect(themeWindow).toHaveCount(0)

    const restoreButton = page.getByTestId('talos-restore-window-theme')
    await expect(restoreButton).toBeVisible()
    const restoring = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: stage,
        action: () => restoreButton.click(),
        waitForFinal: () => expect(themeWindow).toHaveAttribute('data-window-transition', 'idle'),
    })
    expect(restoring.presentation.lifecycle).toBe('restoring')
    expectPaintedTransition(restoring, { minimumDurationMs: 384 })
    await expect(themeWindow).toBeFocused()

    const regularRect = await themeWindow.boundingBox()
    const maximizing = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: stage,
        action: () => page.getByRole('button', { name: 'Fullscreen Theme' }).click(),
        waitForFinal: () => expect(themeWindow).toHaveAttribute('data-window-transition', 'idle'),
    })
    expect(maximizing.presentation.lifecycle).toBe('maximizing')
    expectPaintedTransition(maximizing, { minimumDurationMs: 384, minimumPixelRatio: 0.01 })
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'true')
    const fullscreenRect = await themeWindow.boundingBox()
    expect((fullscreenRect?.width ?? 0) - (regularRect?.width ?? 0)).toBeGreaterThan(200)
    const stageRect = await stage.boundingBox()
    expect(stageRect).toBeTruthy()
    expect(fullscreenRect).toBeTruthy()
    expect(Math.abs((fullscreenRect?.x ?? 0) - (stageRect?.x ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((fullscreenRect?.y ?? 0) - (stageRect?.y ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((fullscreenRect?.width ?? 0) - (stageRect?.width ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((fullscreenRect?.height ?? 0) - (stageRect?.height ?? 0))).toBeLessThanOrEqual(1)

    const unmaximizing = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: stage,
        action: () => page.getByRole('button', { name: 'Exit fullscreen Theme' }).click(),
        waitForFinal: () => expect(themeWindow).toHaveAttribute('data-window-transition', 'idle'),
    })
    expect(unmaximizing.presentation.lifecycle).toBe('unmaximizing')
    expectPaintedTransition(unmaximizing, { minimumDurationMs: 384, minimumPixelRatio: 0.01 })
    await expect(themeWindow).toHaveAttribute('data-window-fullscreen', 'false')

    const snapping = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: workspace,
        action: async () => {
            const dragHandle = themeWindow.locator('.talos-window-drag-handle')
            await dragHandle.focus()
            await dragHandle.press('Control+ArrowLeft')
        },
        waitForFinal: () => expect(themeWindow).toHaveAttribute('data-window-transition', 'idle'),
    })
    expect(snapping.presentation.lifecycle).toBe('snapping')
    expectPaintedTransition(snapping, { minimumDurationMs: 384, minimumPixelRatio: 0.01 })
    await expect(page.locator('[data-window-frame-id="theme"]')).toHaveAttribute('data-window-tile-target', 'left-half')
    const snappedRect = await themeWindow.boundingBox()
    const snappedStageRect = await stage.boundingBox()
    expect(snappedRect).toBeTruthy()
    expect(snappedStageRect).toBeTruthy()
    expect(Math.abs((snappedRect?.y ?? 0) - (snappedStageRect?.y ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((snappedRect?.height ?? 0) - (snappedStageRect?.height ?? 0))).toBeLessThanOrEqual(1)

    const closing = await capturePaintedTransition({
        page,
        target: themeWindow,
        paintSurface: stage,
        action: () => page.getByRole('button', { name: 'Close Theme' }).click(),
        waitForFinal: () => expect(themeWindow).toHaveCount(0),
    })
    expect(closing.presentation.lifecycle).toBe('closing')
    expectPaintedTransition(closing, { minimumDurationMs: 288, midpointInteractive: false })
    await expect(themeWindow).toHaveCount(0)
    await expect(themeLauncher).toBeVisible()
})

test('workspace motion integrity produces painted-frame changes for background, rail, and composer popover', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop workspace motion integrity is measured by the desktop project')
    test.setTimeout(60_000)

    await patchTalosSettings(page, {
        theme: 'terminal',
        reduced_motion: false,
        theme_motion_v6: {
            ...talosMotionV6Defaults,
            mode: 'complex',
            background_enabled: true,
            interface_enabled: true,
            speed: 100,
            intensity: 70,
            interface: {
                ...talosMotionV6Defaults.interface,
                profile: 'expressive',
                duration_scale: 120,
                intensity: 75,
                easing: 'soft',
            },
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const workspace = page.getByTestId('talos-workspace')
    await expect(workspace).toHaveAttribute('data-ui-motion-disabled', 'false')
    await expect(workspace).toHaveAttribute('data-motion-v6-effective', 'complex')
    const canvas = workspace.locator('canvas[data-testid="talos-procedural-canvas"]').first()
    await expect(canvas).toBeVisible()
    const backgroundBefore = await canvas.screenshot({ animations: 'allow' })
    await page.waitForTimeout(400)
    const backgroundAfter = await canvas.screenshot({ animations: 'allow' })
    expect(rgbaDifferenceRatio(backgroundBefore, backgroundAfter, 4)).toBeGreaterThan(0.0001)

    const rail = workspace.locator('.talos-left-rail')
    if (await rail.getAttribute('data-sidebar-state') === 'collapsed') {
        await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
        await expect(rail).toHaveAttribute('data-sidebar-state', 'expanded')
        await expect.poll(() => rail.evaluate((element) => element.getAnimations().length)).toBe(0)
    }
    const railMotion = await capturePaintedTransition({
        page,
        target: rail,
        paintSurface: workspace,
        action: () => page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click(),
        waitForFinal: async () => {
            await expect(rail).toHaveAttribute('data-sidebar-state', 'collapsed')
            await expect.poll(() => rail.evaluate((element) => element.getAnimations().length)).toBe(0)
        },
    })
    expectPaintedTransition(railMotion, { minimumDurationMs: 120, minimumPixelRatio: 0.002 })

    const modelPopover = page.getByTestId('talos-model-popover')
    const popoverMotion = await capturePaintedTransition({
        page,
        target: modelPopover,
        paintSurface: workspace,
        action: () => page.getByRole('button', { name: 'Choose model profile', exact: true }).click(),
        waitForFinal: async () => {
            await expect(modelPopover).toBeVisible()
            await expect.poll(() => modelPopover.evaluate((element) => (
                element.getAnimations().filter((animation) => animation.playState === 'running').length
            ))).toBe(0)
        },
    })
    expectPaintedTransition(popoverMotion, { minimumDurationMs: 120, minimumPixelRatio: 0.002 })

    const popoverCloseMotion = await capturePaintedTransition({
        page,
        target: modelPopover,
        paintSurface: workspace,
        action: () => page.getByRole('button', { name: 'Choose model profile', exact: true }).click(),
        waitForFinal: () => expect(modelPopover).toHaveCount(0),
        midpointProgress: 0.9,
    })
    try {
        expectPaintedTransition(popoverCloseMotion, {
            minimumDurationMs: 90,
            minimumPixelRatio: 0.002,
            midpointInteractive: false,
        })
    } catch (error) {
        await testInfo.attach('popover-close-target-before', { body: popoverCloseMotion.targetBefore, contentType: 'image/png' })
        await testInfo.attach('popover-close-target-midpoint', { body: popoverCloseMotion.targetMidpoint, contentType: 'image/png' })
        await testInfo.attach('popover-close-target-after', { body: popoverCloseMotion.targetAfter, contentType: 'image/png' })
        throw error
    }
})

test('mobile sheet open and close produce a perceptible painted-frame trajectory', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile sheet motion is measured by the mobile project')
    test.setTimeout(60_000)

    await patchTalosSettings(page, {
        theme: 'ember',
        reduced_motion: false,
        theme_motion_v6: {
            ...talosMotionV6Defaults,
            mode: 'adaptive',
            background_enabled: false,
            interface_enabled: true,
            interface: {
                ...talosMotionV6Defaults.interface,
                profile: 'expressive',
                intensity: 70,
                easing: 'soft',
            },
        },
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)

    const workspace = page.getByTestId('talos-workspace')
    const sheet = page.getByTestId('talos-mobile-tool-sheet')
    const opening = await capturePaintedTransition({
        page,
        target: sheet,
        paintSurface: workspace,
        action: () => page.getByRole('button', { name: 'Theme', exact: true }).first().click(),
        waitForFinal: () => expect(sheet).toHaveAttribute('data-window-transition', 'idle'),
    })
    expect(opening.presentation.lifecycle).toBe('opening')
    expectPaintedTransition(opening, { minimumDurationMs: 384, minimumPixelRatio: 0.01 })
    await expect(sheet.getByRole('button', { name: 'Back to chat' })).toBeFocused()

    const closing = await capturePaintedTransition({
        page,
        target: sheet,
        paintSurface: workspace,
        action: () => sheet.getByRole('button', { name: 'Close Theme' }).click(),
        waitForFinal: () => expect(sheet).toHaveCount(0),
    })
    expect(closing.presentation.lifecycle).toBe('closing')
    expectPaintedTransition(closing, { minimumDurationMs: 288, minimumPixelRatio: 0.01, midpointInteractive: false })
    await expect(sheet).toHaveCount(0)
})

test('mobile chat and dashboard avoid layout overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile overflow is covered by the mobile project')

    await openWorkspace(page)
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await openWorkspace(page)
    await expectUnifiedWorkspaceChrome(page)
    await expectNoHorizontalOverflow(page)
})

test('chat exports session evidence pack with context and benchmark readiness', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Create a replayable export pack.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await page.getByRole('button', { name: 'Export session' }).click()
    const exportDialog = page.getByRole('dialog', { name: 'Export session evidence' })
    await expect(exportDialog).toBeVisible()
    await expect(exportDialog.getByText('JSON evidence pack', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('Markdown transcript', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('Context manifest', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('Benchmark scenario', { exact: true })).toBeVisible()

    const jsonRequest = page.waitForRequest((request) => request.url().includes('/api/talos/sessions/session-e2e/export?format=json') && request.method() === 'GET')
    await page.getByRole('button', { name: 'Export JSON evidence pack' }).click()
    await jsonRequest
    await expect(exportDialog.getByText('talos_session_export', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('workflow.md').first()).toBeVisible()
    await expect(exportDialog.getByText('Benchmark ready', { exact: true })).toBeVisible()
    await expect(page.getByText('sk-live-secret')).toBeHidden()
    await expect(page.getByText('private/storage/path')).toBeHidden()

    const markdownRequest = page.waitForRequest((request) => request.url().includes('/api/talos/sessions/session-e2e/export?format=markdown') && request.method() === 'GET')
    await page.getByRole('button', { name: 'Export Markdown transcript' }).click()
    await markdownRequest
    await expect(exportDialog.getByText('talos_session_markdown_export', { exact: true })).toBeVisible()
    await expect(exportDialog.getByText('# TALOS Session Export')).toBeVisible()

    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`session-export-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true, animations: 'disabled' }),
        contentType: 'image/png',
    })
})

test('mobile tool windows stay above the composer', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile window overlap is covered by the mobile project')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()
    await page.getByLabel('Message TALOS').fill('Line one\nLine two\nLine three\nLine four\nLine five')

    await expectNoComposerOverlap(page)
    await expectNoHorizontalOverflow(page)
})

test('320px workspace keeps header actions, mobile navigation and Theme tabs reachable', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await openWorkspace(page)

    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const headerActions = [
        page.getByRole('button', { name: 'Open command palette' }),
        page.getByRole('button', { name: 'Export session' }),
    ]

    for (const action of headerActions) {
        await expect(action).toBeVisible()
        const bounds = await action.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewportWidth)
        expect(bounds!.width).toBeGreaterThanOrEqual(44)
        expect(bounds!.height).toBeGreaterThanOrEqual(44)
    }

    await headerActions[0].focus()
    await expect(page.getByRole('tooltip', { name: 'Commands' })).toBeVisible()
    await expect(headerActions[0]).toHaveAttribute('aria-describedby', /talos-tooltip-/)

    const mobileRail = page.getByRole('navigation', { name: 'TALOS workspace rail' })
    await expect(mobileRail).toHaveAttribute('data-overflow-affordance', 'true')
    await expect(mobileRail.getByTestId('talos-mobile-rail-edge-start')).toBeVisible()
    await expect(mobileRail.getByTestId('talos-mobile-rail-edge-end')).toBeVisible()

    await mobileRail.getByRole('button', { name: 'Theme', exact: true }).click()
    const themeTabs = page.getByRole('tablist', { name: 'Theme controls' })
    await expect(themeTabs).toBeVisible()
    await expect(page.locator('[data-window-id="theme"] .talos-window-resize-handle:visible')).toHaveCount(0)

    const tabs = themeTabs.getByRole('tab')
    await expect(tabs).toHaveCount(5)
    for (let index = 0; index < 5; index += 1) {
        await expect.poll(async () => (await tabs.nth(index).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    }

    await tabs.nth(0).focus()
    await tabs.nth(0).press('ArrowRight')
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#talos-theme-control-panel-customize')).toBeVisible()
    await expectNoHorizontalOverflow(page)
})

test('chat centers the sent turn and keeps the latest response above the measured composer', async ({ page }) => {
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, { chatDelayMs: 1800 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openWorkspace(page)
    const prompt = 'Center this submitted turn before the answer arrives.'
    await page.getByLabel('Message TALOS').fill(prompt)
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('.talos-chat-thread').getByText(prompt, { exact: true })).toBeVisible()
    await expect(page.getByLabel('TALOS chat thread').getByText('Processing', { exact: true })).toBeVisible()
    await expect(page.getByText('Kadmos is processing', { exact: true })).toHaveCount(0)

    await expect.poll(() => page.evaluate(() => {
        const thread = document.querySelector('.talos-chat-thread')?.getBoundingClientRect()
        const composer = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()
        const message = Array.from(document.querySelectorAll('.talos-chat-message')).find((element) => element.textContent?.includes('Center this submitted turn'))?.getBoundingClientRect()
        if (!thread || !message) return false

        const composerTop = composer?.top ?? thread.bottom
        const messageCenter = (message.top + message.bottom) / 2
        const viewportCenter = (thread.top + Math.min(thread.bottom, composerTop)) / 2
        const tolerance = Math.max(48, (composerTop - thread.top) * 0.15)

        return Math.abs(messageCenter - viewportCenter) <= tolerance
    })).toBe(true)

    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
    const responseGeometry = await page.evaluate(() => {
        const composerTop = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect().top ?? 0
        const lastMessageBottom = Math.max(...Array.from(document.querySelectorAll('.talos-chat-message')).map((element) => element.getBoundingClientRect().bottom))
        return { composerTop, lastMessageBottom }
    })
    expect(responseGeometry.lastMessageBottom, JSON.stringify(responseGeometry)).toBeLessThanOrEqual(responseGeometry.composerTop + 1)
})

test('chat surfaces unseen evidence updates and returns to the live edge', async ({ page }) => {
    const messages = Array.from({ length: 18 }, (_, index) => [
        { role: 'user', content: `Long conversation prompt ${index + 1}` },
        { role: 'assistant', content: `Long conversation answer ${index + 1}`, run_id: `run-live-edge-${index + 1}` },
    ]).flat()
    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        initialSessions: [{
            id: 'session-live-edge',
            title: 'Live edge coverage',
            messages,
        }],
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openWorkspace(page)

    const thread = page.locator('.talos-chat-thread')
    await expect.poll(() => thread.evaluate((element) => (
        element.scrollHeight - element.scrollTop - element.clientHeight
    ))).toBeLessThanOrEqual(56)
    await thread.evaluate(async (element) => {
        element.scrollTo({ top: 0, behavior: 'auto' })
        element.dispatchEvent(new Event('scroll'))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    await expect.poll(() => thread.evaluate((element) => element.scrollTop)).toBe(0)

    await clickMessageAction(thread, 'Open evidence')
    const returnToLatest = page.getByRole('button', { name: 'Return to latest' })
    await expect(returnToLatest).toBeVisible()
    await expect(returnToLatest).toContainText('1')
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.locator('[data-window-id="settings"]')).toBeVisible()
    const returnControlGeometry = await returnToLatest.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const composer = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()
        const hitTarget = document.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2))

        return {
            teleported: element.parentElement === document.body,
            topmost: hitTarget === element || Boolean(hitTarget && element.contains(hitTarget)),
            overlapsComposer: Boolean(composer && rect.bottom > composer.top),
        }
    })
    expect(returnControlGeometry.teleported, JSON.stringify(returnControlGeometry)).toBe(true)
    expect(returnControlGeometry.topmost, JSON.stringify(returnControlGeometry)).toBe(true)
    expect(returnControlGeometry.overlapsComposer, JSON.stringify(returnControlGeometry)).toBe(false)

    await returnToLatest.click()
    await expect(returnToLatest).toBeHidden()
    await expect.poll(() => thread.evaluate((element) => (
        element.scrollHeight - element.scrollTop - element.clientHeight
    ))).toBeLessThanOrEqual(56)
})

test('mobile chat history is an isolated focus-trapped dialog that restores its launcher focus', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile history modal contract runs in the mobile project')
    await openWorkspace(page)

    const launcher = page.getByRole('button', { name: 'Open chat history' })
    await launcher.click()
    const dialog = page.getByRole('dialog', { name: 'Chat history' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog.getByRole('button', { name: 'Close chat history' })).toBeFocused()
    await expect(page.locator('.talos-chat-scroll-root')).toHaveAttribute('inert', '')

    await page.keyboard.press('Shift+Tab')
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(launcher).toBeFocused()
    await expect(page.locator('.talos-chat-scroll-root')).not.toHaveAttribute('inert', '')
})

test('minimized windows remain clear of the measured composer', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'minimized window dock is desktop-only')
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settingsWindow = page.locator('[data-window-id="settings"]')
    await expect(settingsWindow).toBeVisible()
    await settingsWindow.getByRole('button', { name: 'Minimize Settings' }).click()
    const dock = page.getByTestId('talos-minimized-window-dock')
    await expect(dock).toBeVisible()

    const geometry = await dock.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const composer = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()
        const workspace = document.querySelector<HTMLElement>('.talos-workspace')

        return {
            composerTop: composer?.top ?? 0,
            dockBottom: rect.bottom,
            composerHeightToken: workspace?.style.getPropertyValue('--talos-composer-height') ?? '',
        }
    })
    expect(geometry.composerHeightToken).toMatch(/^\d+px$/)
    expect(geometry.dockBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.composerTop - 8)
})

test('model profile deletion uses the theme dialog and keeps the API deletion behavior', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'model center delete confirmation is tested in the desktop floating window')
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Model Lab', exact: true }).click()
    const modelCenter = page.locator('[data-window-id="model_lab"]')
    await expect(modelCenter).toBeVisible()
    const profile = modelCenter.locator('article').filter({ hasText: 'E2E server-side profile' })
    await profile.getByRole('button', { name: 'Delete', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete model profile' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E2E server-side profile')
    const deleteRequest = page.waitForRequest((request) => request.url().endsWith('/api/talos/model-profiles/profile-e2e') && request.method() === 'DELETE')
    await dialog.getByRole('button', { name: 'Confirm delete' }).click()
    await deleteRequest
    await expect(dialog).toHaveCount(0)
    await expect(modelCenter.getByText('E2E server-side profile', { exact: true })).toHaveCount(0)
})

test('chat layout controls persist bubble scale, composer mode, and Advanced disclosure', async ({ page }) => {
    await openWorkspace(page)
    const settingsRequests: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH') {
            settingsRequests.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByRole('button', { name: 'Increase message size' }).click()
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Expanded')
    await page.getByRole('button', { name: 'Use minimal composer' }).click()
    await expect(page.getByRole('button', { name: 'Use full composer' })).toBeVisible()
    await page.getByRole('button', { name: 'Advanced', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Tasks', exact: true })).toBeVisible()

    await expect.poll(() => settingsRequests.some((request) => {
        if (!hasSettingsExpectedRevision(request)) return false
        const layout = (request.preferences as Record<string, unknown> | undefined)?.chat_layout as Record<string, unknown> | undefined

        return layout?.bubble_scale === 'expanded' && layout?.composer_mode === 'minimal'
    })).toBe(true)
    await expect.poll(() => settingsRequests.some((request) => {
        if (!hasSettingsExpectedRevision(request)) return false
        const layout = (request.preferences as Record<string, unknown> | undefined)?.chat_layout as Record<string, unknown> | undefined

        return layout?.advanced_rail_expanded === true
    })).toBe(true)
})

test('Appearance and Theme Engine share the persisted chat layout contract', async ({ page }) => {
    await openWorkspace(page)

    const settingsRequests: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH') {
            settingsRequests.push(request.postDataJSON() as Record<string, unknown>)
        }
    })

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByLabel('Chat message size').selectOption('compact')
    await page.getByLabel('Chat composer mode').selectOption('minimal')
    await page.getByRole('switch', { name: 'Expand Advanced by default' }).click()
    await page.getByRole('button', { name: 'Save settings' }).click()

    await expect.poll(() => settingsRequests.some((request) => {
        if (!hasSettingsExpectedRevision(request)) return false
        const preferences = request.preferences as Record<string, unknown> | undefined
        const layout = preferences?.chat_layout as Record<string, unknown> | undefined
        return layout?.bubble_scale === 'compact'
            && layout?.composer_mode === 'minimal'
            && layout?.advanced_rail_expanded === true
    })).toBe(true)
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Compact')
    await expect(page.getByRole('button', { name: 'Use full composer' })).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByLabel('Theme chat message size').selectOption('expanded')
    await page.getByLabel('Theme chat composer mode').selectOption('full')
    await page.getByRole('button', { name: 'Save customization' }).click()

    await expect.poll(() => settingsRequests.some((request) => {
        if (!hasSettingsExpectedRevision(request)) return false
        const preferences = request.preferences as Record<string, unknown> | undefined
        const layout = preferences?.chat_layout as Record<string, unknown> | undefined
        return layout?.bubble_scale === 'expanded'
            && layout?.composer_mode === 'full'
            && layout?.advanced_rail_expanded === true
    })).toBe(true)
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Expanded')
    await expect(page.getByRole('button', { name: 'Use minimal composer' })).toBeVisible()
})

test('Settings opens Doctor directly on the Backup section', async ({ page, isMobile }) => {
    test.skip(Boolean(isMobile), 'desktop multi-window routing is covered by the desktop project')
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'System', exact: true }).click()
    await page.getByRole('button', { name: 'Open Backup', exact: true }).click()

    const doctor = page.getByRole('region', { name: 'Doctor' })
    await expect(doctor).toBeVisible()
    await expect(doctor.getByRole('tab', { name: 'Backup', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(doctor.getByTestId('talos-admin-section-backup')).toBeVisible()
})

test('named theme chat layout overrides current layout and reset returns to preset defaults', async ({ page }) => {
    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByLabel('Theme chat message size').selectOption('expanded')
    await page.getByLabel('Theme chat composer mode').selectOption('minimal')
    await page.getByLabel('Theme name').fill('E2E layout theme')

    const createRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') return false
        const body = request.postDataJSON() as Record<string, unknown>
        if (!hasSettingsExpectedRevision(body)) return false
        const preferences = body.preferences as Record<string, unknown> | undefined
        const library = preferences?.theme_library as Array<Record<string, unknown>> | undefined
        const layout = library?.at(-1)?.chat_layout as Record<string, unknown> | undefined
        return layout?.bubble_scale === 'expanded' && layout?.composer_mode === 'minimal'
    })
    await page.getByRole('button', { name: 'Create theme' }).click()
    await createRequest
    await expect(page.getByText('E2E layout theme', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('tab', { name: 'Appearance' }).click()
    await page.getByLabel('Chat message size', { exact: true }).selectOption('compact')
    await page.getByLabel('Chat composer mode', { exact: true }).selectOption('full')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Compact')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Compact')
    await expect(page.getByRole('button', { name: 'Use minimal composer' })).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('tab', { name: 'Library' }).click()
    const applyRequest = page.waitForRequest((request) => (
        request.url().endsWith('/api/talos/settings') && request.method() === 'PATCH'
    ))
    await page.getByRole('button', { name: 'Apply', exact: true }).click()
    const appliedPreferences = settingsPatchBody(await applyRequest).preferences as Record<string, unknown>
    expect(appliedPreferences.active_custom_theme_id).not.toBeNull()
    expect(appliedPreferences.chat_layout).toMatchObject({
        bubble_scale: 'expanded',
        composer_mode: 'minimal',
    })
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Expanded')
    await expect(page.getByRole('button', { name: 'Use full composer' })).toBeVisible()

    await page.getByRole('tab', { name: 'Customize' }).click()
    await page.getByRole('button', { name: 'Reset to preset' }).click()
    await expect(page.locator('[data-testid="talos-message-scale-status"]')).toContainText('Balanced')
    await expect(page.getByRole('button', { name: 'Use minimal composer' })).toBeVisible()
})
