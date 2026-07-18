import { expect, test, type Locator, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { browserFramePoint, livePointerCoordinate } from '../../resources/js/lib/talosBrowserHmiCoordinates'

const setupEmail = 'talos-e2e@example.test'
const setupPassword = 'talos-e2e-password-123'
const loginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const loginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const devEvidence = process.env.TALOS_E2E_DEV_BROWSER_EVIDENCE === '1'
const realBrowserIntegration = process.env.TALOS_E2E_REAL_BROWSER === '1'
const expectedLiveBrowserUrl = process.env.TALOS_E2E_EXPECT_LIVE_BROWSER_URL
const mockBrowserFrames = new Map<string, Buffer>()

function mockBrowserFrame(artifactId: string) {
    const cached = mockBrowserFrames.get(artifactId)
    if (cached) return cached

    const seed = [...artifactId].reduce((value, character) => ((value * 33) ^ character.charCodeAt(0)) >>> 0, 5381)
    const png = new PNG({ width: 1280, height: 800 })
    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const offset = (png.width * y + x) * 4
            png.data[offset] = (seed + x) % 256
            png.data[offset + 1] = ((seed >>> 8) + y) % 256
            png.data[offset + 2] = ((seed >>> 16) + x + y) % 256
            png.data[offset + 3] = 255
        }
    }

    const frame = PNG.sync.write(png)
    mockBrowserFrames.set(artifactId, frame)
    return frame
}

function configuredLivePointerCoordinate(name: 'X' | 'Y', fallback: number) {
    const label = `TALOS_E2E_LIVE_BROWSER_${name}`
    return livePointerCoordinate(process.env[label], fallback, label)
}

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function waitForAuthenticatedWorkspace(page: Page, timeout = 15_000) {
    return expect(page.locator('#talos-workspace-root[data-authenticated="true"]'))
        .toHaveCount(1, { timeout })
        .then(() => true)
        .catch(() => false)
}

async function openWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function submitLogin(page: Page, email: string, password: string) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const form = page.locator('#talos-login-form')
    if (!await form.isVisible().catch(() => false)) return waitForAuthenticatedWorkspace(page)

    await form.getByLabel('Email').fill(email)
    await form.getByLabel('Password').fill(password)
    await form.getByRole('button', { name: 'Sign in' }).click()

    return waitForAuthenticatedWorkspace(page)
}

async function ensureAuthenticated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await isAuthenticatedWorkspace(page)) return

    await page.goto('/setup', { waitUntil: 'domcontentloaded' })
    const setupForm = page.locator('#talos-setup-form')
    if (await setupForm.isVisible().catch(() => false)) {
        await setupForm.getByLabel('Name').fill('TALOS HMI E2E Admin')
        await setupForm.getByLabel('Email').fill(setupEmail)
        await setupForm.getByLabel('Password', { exact: true }).fill(setupPassword)
        await setupForm.getByLabel('Confirm password').fill(setupPassword)
        await setupForm.getByRole('button', { name: 'Create first admin' }).click()
        if (await waitForAuthenticatedWorkspace(page)) return
    }

    for (const [email, password] of [[loginEmail, loginPassword], [setupEmail, setupPassword]] as const) {
        if (await submitLogin(page, email, password)) return
    }

    throw new Error('TALOS HMI E2E could not authenticate through setup or login.')
}

async function realApi(
    page: Page,
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
) {
    const csrfMeta = page.locator('meta[name="csrf-token"]')
    const csrf = await csrfMeta.count() > 0
        ? await csrfMeta.getAttribute('content')
        : await page.locator('#talos-workspace-root').getAttribute('data-csrf-token')
    const response = await page.context().request.fetch(new URL(path, page.url()).toString(), {
        method,
        data: body,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            ...extraHeaders,
        },
    })
    if (!response.ok()) throw new Error(`${method} ${path} failed: ${response.status()} ${await response.text()}`)
    const text = await response.text()
    return text === ''
        ? { data: {} }
        : JSON.parse(text) as { data: Record<string, unknown> }
}

async function findRealChat(page: Page) {
    const response = await page.context().request.get(new URL('/api/talos/sessions?surface=chat', page.url()).toString(), {
        headers: { Accept: 'application/json' },
    })
    if (!response.ok()) throw new Error(`GET /api/talos/sessions failed: ${response.status()} ${await response.text()}`)
    const payload = await response.json() as { data: Array<Record<string, unknown>> }
    return payload.data.find((session) => session.title === 'Browser HMI E2E') ?? null
}

async function installBrowserBackend(page: Page) {
    await page.route('**/api/talos/browser/**', async (route) => {
        if (!realBrowserIntegration && route.request().method() === 'GET') {
            const url = new URL(route.request().url())
            const artifactId = url.pathname.match(/\/artifacts\/([^/]+)\/preview$/)?.[1]
            if (artifactId) {
                const response = await route.fetch()
                await route.fulfill({
                    response,
                    body: mockBrowserFrame(artifactId),
                    headers: {
                        ...response.headers(),
                        'content-type': 'image/png',
                    },
                })
                return
            }
        }

        await route.continue()
    })
}

async function prepareChat(page: Page) {
    await ensureAuthenticated(page)
    await openWorkspace(page)
    const existing = await findRealChat(page)
    if (typeof existing?.id === 'string') {
        await realApi(page, 'DELETE', `/api/talos/sessions/${encodeURIComponent(existing.id)}`, {})
    }
    const sessionId = String((await realApi(page, 'POST', '/api/talos/sessions', {
        title: 'Browser HMI E2E',
        mode: 'verified_execution',
        persistence_mode: 'persistent',
        surface: 'chat',
    })).data.id)

    await page.unroute('**/api/**')
    await installTalosApiMocks(page, {
        initialSessions: [{ id: sessionId, title: 'Browser HMI E2E' }],
        initialSettings: {
            preferences: {
                chat_layout: {
                    mobile_window_presentation: 'fullscreen',
                },
            },
        },
    })
    await installBrowserBackend(page)
    await realApi(page, 'PATCH', '/api/talos/settings', {
        preferences: { browser_hmi_mode: 'confirm_sensitive' },
    })
    await openWorkspace(page)
    return sessionId
}

async function openScreenshotDialog(page: Page) {
    const liveTarget = process.env.TALOS_E2E_LIVE_BROWSER_TARGET
    const createdBrowserSession = liveTarget
        ? page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && new URL(response.url()).pathname === '/api/talos/browser/sessions'
        ))
        : null
    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)

    if (liveTarget && createdBrowserSession) {
        const response = await createdBrowserSession
        expect(response.status(), await response.text()).toBe(201)
        const payload = await response.json() as { data: { id: string; talos_session_id: string } }
        await realApi(
            page,
            'POST',
            `/api/talos/browser/sessions/${encodeURIComponent(payload.data.id)}/navigate`,
            { url: liveTarget },
            { 'X-Talos-Session-Id': payload.data.talos_session_id },
        )
    }

    const existingTrigger = page.locator('[data-testid^="browser-evidence-open-"]').last()
    if (await existingTrigger.count() === 0) {
        const screenshotResponse = page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && /\/api\/talos\/browser\/sessions\/[^/]+\/screenshot$/.test(new URL(response.url()).pathname)
        ))
        await page.getByRole('button', { name: 'Capture browser screenshot' }).click()
        await screenshotResponse
    }
    const trigger = page.locator('[data-testid^="browser-evidence-open-"]').last()
    await expect(trigger).toBeVisible()
    const triggerTestId = await trigger.getAttribute('data-testid')
    const artifactId = triggerTestId?.replace('browser-evidence-open-', '') ?? ''
    expect(artifactId).not.toBe('')
    await trigger.click()

    const dialog = page.locator('[role="dialog"]').filter({ hasText: 'Integrity-verified capture' })
    await expect(dialog).toBeVisible()
    const image = page.getByTestId(`browser-evidence-image-${artifactId}`)
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1280)
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalHeight)).toBe(800)
    if (realBrowserIntegration) await expectRenderedPreviewMatchesArtifact(page, image)

    return { artifactId, dialog, image }
}

async function samplePreviewPixels(page: Page, image: Locator) {
    const source = await image.getAttribute('src')
    if (!source) throw new Error('Browser HMI image has no authenticated preview source.')

    const response = await page.context().request.get(new URL(source, page.url()).toString(), {
        headers: { Accept: 'image/png' },
    })
    expect(response.ok(), await response.text()).toBe(true)
    expect(response.headers()['content-type'] ?? '').toContain('image/png')

    const png = PNG.sync.read(await response.body())
    const points = [
        [17, 23],
        [Math.floor(png.width / 4), Math.floor(png.height / 4)],
        [Math.floor(png.width / 2), Math.floor(png.height / 2)],
        [Math.floor((png.width * 3) / 4), Math.floor((png.height * 3) / 4)],
        [Math.max(0, png.width - 18), Math.max(0, png.height - 24)],
    ] as const

    return {
        width: png.width,
        height: png.height,
        pixels: points.map(([x, y]) => {
            const offset = ((y * png.width) + x) * 4
            return [...png.data.subarray(offset, offset + 4)]
        }),
    }
}

async function sampleRenderedPixels(image: Locator, points: ReadonlyArray<readonly [number, number]>) {
    return image.evaluate((element, coordinates) => {
        const source = element as HTMLImageElement
        const canvas = document.createElement('canvas')
        canvas.width = source.naturalWidth
        canvas.height = source.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Canvas 2D context is unavailable.')
        context.drawImage(source, 0, 0)
        return coordinates.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data])
    }, points)
}

async function expectRenderedPreviewMatchesArtifact(page: Page, image: Locator) {
    const preview = await samplePreviewPixels(page, image)
    const points = [
        [17, 23],
        [Math.floor(preview.width / 4), Math.floor(preview.height / 4)],
        [Math.floor(preview.width / 2), Math.floor(preview.height / 2)],
        [Math.floor((preview.width * 3) / 4), Math.floor((preview.height * 3) / 4)],
        [Math.max(0, preview.width - 18), Math.max(0, preview.height - 24)],
    ] as const

    expect(await sampleRenderedPixels(image, points)).toEqual(preview.pixels)
}

async function stageCenter(page: Page) {
    return stagePoint(page, 0.5, 0.5)
}

async function stagePoint(page: Page, normalizedX: number, normalizedY: number) {
    const stage = page.getByTestId('browser-evidence-stage')
    const box = await stage.boundingBox()
    if (!box) throw new Error('Browser HMI stage has no painted surface.')
    const image = stage.locator('img[data-browser-artifact-id]').last()
    const naturalSize = await image.evaluate((element) => ({
        width: (element as HTMLImageElement).naturalWidth,
        height: (element as HTMLImageElement).naturalHeight,
    }))
    return {
        stage,
        position: browserFramePoint(
            { left: box.x, top: box.y, width: box.width, height: box.height },
            naturalSize,
            normalizedX,
            normalizedY,
        ),
    }
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await prepareChat(page)
})

test('BREG-006 authenticated desktop sends a fractional lightbox click through Laravel HMI and renders the exact verified frame', async ({ page, isMobile }) => {
    test.skip(!realBrowserIntegration, 'Requires the real browser-worker integration gate')
    test.skip(isMobile, 'Desktop coverage')

    const { artifactId: initialArtifactId } = await openScreenshotDialog(page)
    const { stage, position } = await stagePoint(
        page,
        configuredLivePointerCoordinate('X', 0.6173),
        configuredLivePointerCoordinate('Y', 0.3679),
    )
    const pointerRequest = page.waitForRequest((request) => (
        request.method() === 'POST'
        && /\/api\/talos\/browser\/sessions\/[^/]+\/interactions\/pointer$/.test(new URL(request.url()).pathname)
    ))
    const pointerResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/api\/talos\/browser\/sessions\/[^/]+\/interactions\/pointer$/.test(new URL(response.url()).pathname)
    ))

    await stage.click({ position })
    const request = await pointerRequest
    let response = await pointerResponse
    let responseBody = await response.text()
    let confirmationRequired = false
    if (response.status() === 428) {
        confirmationRequired = true
        expect(JSON.parse(responseBody)).toMatchObject({
            code: 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED',
        })
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible()
        const confirmation = page.waitForResponse((candidate) => (
            candidate.request().method() === 'POST'
            && /\/interactions\/[^/]+\/confirm$/.test(new URL(candidate.url()).pathname)
        ))
        await page.getByTestId('browser-hmi-confirm').click()
        response = await confirmation
        responseBody = await response.text()
        await expect(alert).toBeHidden()
    }
    expect(response.status(), responseBody).toBe(201)
    const payload = JSON.parse(responseBody) as {
        data: { screenshot: { id: string }, session: { state_version: number, current_url: string } }
    }
    const requestBody = request.postDataJSON() as Record<string, unknown>
    expect(new URL(request.url()).pathname).toMatch(/\/api\/talos\/browser\/sessions\/[^/]+\/interactions\/pointer$/)
    expect(requestBody).toMatchObject({
        schema_version: 'talos_browser_hmi_pointer_v2',
        interaction_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        artifact_id: initialArtifactId,
        click_count: 1,
    })
    expect(requestBody.normalized_x).toEqual(expect.any(Number))
    expect(requestBody.normalized_y).toEqual(expect.any(Number))
    const workerX = Number(requestBody.normalized_x) * 1280
    const workerY = Number(requestBody.normalized_y) * 800
    expect(Math.abs(workerX - Math.round(workerX))).toBeGreaterThan(0.01)
    expect(Math.abs(workerY - Math.round(workerY))).toBeGreaterThan(0.01)
    expect(payload.data.session.state_version).toBeGreaterThan(0)
    expect(payload.data.screenshot.id).not.toBe(initialArtifactId)
    if (expectedLiveBrowserUrl) {
        expect(confirmationRequired).toBe(false)
        expect(payload.data.session.current_url).toBe(expectedLiveBrowserUrl)
    }

    const updatedImage = page.getByTestId(`browser-evidence-image-${payload.data.screenshot.id}`)
    await expect(updatedImage).toBeVisible()
    await expect.poll(() => updatedImage.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1280)
    await expect.poll(() => updatedImage.evaluate((element) => (element as HTMLImageElement).naturalHeight)).toBe(800)
    await expectRenderedPreviewMatchesArtifact(page, updatedImage)
    expect(await page.locator('a[target="_blank"]').count()).toBe(0)
})

test('desktop zoom and pan keep a click on the visible image center at normalized coordinates', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop zoom and pan coverage')

    const { artifactId } = await openScreenshotDialog(page)
    const stage = page.getByTestId('browser-evidence-stage')
    const image = page.getByTestId(`browser-evidence-image-${artifactId}`)
    await expect(image).toBeVisible()

    await page.getByRole('button', { name: 'Zoom in' }).click()
    await expect(page.getByText('125%', { exact: true })).toBeVisible()

    const stageBox = await stage.boundingBox()
    const beforeImageBox = await image.boundingBox()
    if (!stageBox || !beforeImageBox) throw new Error('Browser HMI image did not expose a draggable DOM surface.')

    const dragStart = {
        x: stageBox.x + stageBox.width / 2,
        y: stageBox.y + stageBox.height / 2,
    }
    const dragEnd = { x: dragStart.x + 48, y: dragStart.y + 24 }
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 4 })
    await page.mouse.up()

    const afterImageBox = await image.boundingBox()
    if (!afterImageBox) throw new Error('Browser HMI image disappeared after pan.')
    expect(Math.abs(afterImageBox.x - beforeImageBox.x) + Math.abs(afterImageBox.y - beforeImageBox.y)).toBeGreaterThan(3)

    const visibleCenter = {
        x: afterImageBox.x + afterImageBox.width / 2,
        y: afterImageBox.y + afterImageBox.height / 2,
    }
    const pointerRequest = page.waitForRequest((request) => (
        request.method() === 'POST'
        && /\/api\/talos\/browser\/sessions\/[^/]+\/interactions\/pointer$/.test(new URL(request.url()).pathname)
    ))
    const pointerResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/api\/talos\/browser\/sessions\/[^/]+\/interactions\/pointer$/.test(new URL(response.url()).pathname)
    ))

    await page.mouse.click(visibleCenter.x, visibleCenter.y)
    const request = await pointerRequest
    const response = await pointerResponse
    expect(response.status(), await response.text()).toBe(201)

    const body = request.postDataJSON() as Record<string, unknown>
    expect(body).toMatchObject({
        schema_version: 'talos_browser_hmi_pointer_v2',
        interaction_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        click_count: 1,
    })
    expect(body.normalized_x).toBeCloseTo(0.5, 2)
    expect(body.normalized_y).toBeCloseTo(0.5, 2)
})

test('extreme pan remains bounded so the decoded frame stays reachable on desktop and mobile', async ({ page }) => {
    const { artifactId } = await openScreenshotDialog(page)
    const stage = page.getByTestId('browser-evidence-stage')
    const image = page.getByTestId(`browser-evidence-image-${artifactId}`)
    for (let index = 0; index < 4; index += 1) {
        await page.getByRole('button', { name: 'Zoom in' }).click()
    }

    const stageBox = await stage.boundingBox()
    if (!stageBox) throw new Error('Browser HMI stage has no draggable bounds.')
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(1, 1, { steps: 8 })
    await page.mouse.up()

    const imageBox = await image.boundingBox()
    if (!imageBox) throw new Error('Browser HMI image disappeared after an extreme pan.')
    expect(imageBox.x).toBeLessThan(stageBox.x + stageBox.width)
    expect(imageBox.x + imageBox.width).toBeGreaterThan(stageBox.x)
    expect(imageBox.y).toBeLessThan(stageBox.y + stageBox.height)
    expect(imageBox.y + imageBox.height).toBeGreaterThan(stageBox.y)
})

test('sensitive confirmation uses the upstream AlertDialog and cancel then confirm are real route decisions', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop confirmation coverage')

    await realApi(page, 'PATCH', '/api/talos/settings', {
        preferences: { browser_hmi_mode: 'confirm_sensitive' },
    })
    await openScreenshotDialog(page)
    const { stage, position } = await stagePoint(page, 0.25, 0.5)

    const firstPointer = page.waitForResponse((response) => response.request().method() === 'POST' && /\/interactions\/pointer$/.test(new URL(response.url()).pathname))
    await stage.click({ position })
    expect((await firstPointer).status()).toBe(428)

    const alert = page.getByRole('alertdialog')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Confirm browser action')
    await expect(alert).toContainText('Buy now')
    await expect(alert).toContainText('https://example.com')
    await expect(alert).toContainText('Category: sensitive')

    const rejectResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/interactions\/[^/]+\/confirm$/.test(new URL(response.url()).pathname))
    await page.getByTestId('browser-hmi-reject').click()
    expect((await rejectResponse).status()).toBe(200)
    await expect(alert).toBeHidden()

    const secondPointer = page.waitForResponse((response) => response.request().method() === 'POST' && /\/interactions\/pointer$/.test(new URL(response.url()).pathname))
    await stage.click({ position })
    expect((await secondPointer).status()).toBe(428)
    await expect(alert).toBeVisible()

    const confirmResponse = page.waitForResponse((response) => response.request().method() === 'POST' && /\/interactions\/[^/]+\/confirm$/.test(new URL(response.url()).pathname))
    await page.getByTestId('browser-hmi-confirm').click()
    expect((await confirmResponse).status()).toBe(201)
    await expect(alert).toBeHidden()
    await expect(page.getByTestId('talos-browser-activity')).toContainText('Integrity-verified capture')
})

test('recovery failure is visible in the lightbox without replaying the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop recovery coverage')

    await openScreenshotDialog(page)
    const { stage, position } = await stageCenter(page)
    let attempts = 0
    await page.route('**/api/talos/browser/sessions/*/interactions/pointer', async (route) => {
        attempts += 1
        await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
                code: 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED',
                message: 'Browser recovery required before this action can continue.',
                details: {},
            }),
        })
    })

    await stage.click({ position })
    await expect(page.getByText('Browser recovery required before this action can continue.')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await page.waitForTimeout(250)
    expect(attempts).toBe(1)
})

test('BREG-019 mobile lightbox is explicitly fullscreen, has no horizontal overflow, keeps focus, and restores it after Escape', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile coverage')

    const { artifactId, dialog } = await openScreenshotDialog(page)
    const viewport = page.viewportSize()
    const bounds = await dialog.boundingBox()
    expect(viewport).not.toBeNull()
    expect(bounds).not.toBeNull()
    expect(bounds?.x).toBe(0)
    expect(bounds?.y).toBe(0)
    expect(bounds?.width).toBe(viewport?.width)
    expect(bounds?.height).toBeGreaterThan((viewport?.height ?? 0) - 2)

    const focusState = await dialog.evaluate((element) => ({
        containsFocus: element.contains(document.activeElement),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        bodyWidth: document.body.scrollWidth,
    }))
    expect(focusState.containsFocus).toBe(true)
    expect(focusState.documentWidth).toBeLessThanOrEqual(focusState.viewportWidth + 1)
    expect(focusState.bodyWidth).toBeLessThanOrEqual(focusState.viewportWidth + 1)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId(`browser-evidence-open-${artifactId}`)).toBeFocused()
})

test('production does not disclose raw browser evidence', async ({ page, isMobile }) => {
    test.skip(devEvidence || isMobile, 'Production disclosure coverage')

    await openScreenshotDialog(page)
    await expect(page.getByTestId('talos-browser-raw-evidence-trigger')).toHaveCount(0)
    await expect(page.getByTestId('talos-browser-snapshot-viewer')).toHaveCount(0)
})

test('development raw browser evidence disclosure starts collapsed', async ({ page, isMobile }) => {
    test.skip(!devEvidence || isMobile, 'Development disclosure coverage')

    await page.getByRole('button', { name: 'Browse', exact: true }).click()
    await expect(page.getByTestId('talos-browse-mode')).toContainText(/Ready|Active/)
    await page.getByRole('button', { name: 'Browse actions' }).click()
    const snapshotResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && /\/api\/talos\/browser\/sessions\/[^/]+\/snapshot$/.test(new URL(response.url()).pathname)
    ))
    await page.getByRole('menuitem', { name: 'Capture page structure' }).click()
    expect((await snapshotResponse).status()).toBe(201)

    const disclosure = page.getByTestId('talos-browser-raw-evidence-trigger')
    await expect(disclosure).toBeVisible()
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('talos-browser-snapshot-viewer')).toHaveCount(0)
})
