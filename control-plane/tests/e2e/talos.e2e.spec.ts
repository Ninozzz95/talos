import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { installTalosApiMocks } from './helpers/talosApiMocks'

const e2eSetupEmail = 'talos-e2e@example.test'
const e2eSetupPassword = 'talos-e2e-password-123'
const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

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

async function expectNoComposerOverlap(page: Page) {
    const result = await page.evaluate(() => {
        const composer = document.querySelector('.talos-chat-composer-shell')?.getBoundingClientRect()

        if (!composer) {
            return { missingComposer: true, overlaps: [] }
        }

        const overlaps = Array.from(document.querySelectorAll('.talos-tool-window')).flatMap((element) => {
            const rect = element.getBoundingClientRect()
            const intersects = rect.bottom > composer.top - 8
                && rect.top < composer.bottom + 8
                && rect.right > composer.left
                && rect.left < composer.right

            if (!intersects) {
                return []
            }

            return [{
                label: String(element.getAttribute('aria-label') ?? '').trim(),
                windowBottom: Math.round(rect.bottom),
                composerTop: Math.round(composer.top),
            }]
        })

        return { missingComposer: false, overlaps }
    })

    expect(result.missingComposer).toBe(false)
    expect(result.overlaps, JSON.stringify(result.overlaps, null, 2)).toEqual([])
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

    await page.getByRole('button', { name: moduleName, exact: true }).first().click()
}

async function chooseModelProfile(page: Page, profileId = 'profile-e2e') {
    await page.getByRole('button', { name: 'Choose model profile' }).click()
    await page.getByLabel('Server-side model profile').selectOption(profileId)
}

async function chooseContextSet(page: Page, contextSetId = 'context-set-e2e') {
    await page.getByRole('button', { name: 'Choose grounding context' }).click()
    await page.getByLabel('Grounding context set').selectOption(contextSetId)
}

async function expectUnifiedWorkspaceChrome(page: Page) {
    await expect(page.getByRole('heading', { name: 'TALOS', exact: true })).toBeVisible()
    await expect(page.locator('[data-testid="talos-workspace"], .talos-workspace').first()).toBeVisible()
    await expect(page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()

    for (const name of ['New Chat', 'Brain', 'Compare', 'Notes', 'Settings', 'Doctor']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }

    await expect(page.getByText('No server-side model profiles')).toBeHidden()
    await expect(page.getByText('No Context Vault sets')).toBeHidden()
    await expect(page.locator('input[aria-label*="Provider API key" i], input[placeholder*="Provider API key" i]')).toBeHidden()
}

async function attachWorkspaceScreenshot(page: Page, testInfo: TestInfo, routeName: string) {
    await testInfo.attach(`talos-workspace-${routeName}-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
}

async function isAuthenticatedWorkspace(page: Page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function waitForWorkspaceReady(page: Page) {
    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
}

async function openWorkspace(page: Page) {
    if (await page.getByLabel('Message TALOS').isVisible().catch(() => false)) {
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
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await ensureTalosAuthenticated(page)
})

test('guest users see the auth gate before the TALOS workspace', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        await page.goto('/', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('#talos-workspace-root')).toHaveCount(0)
        await expect(page.getByText(/TALOS Access|TALOS Setup/)).toBeVisible()
        await expect(page.getByRole('link', { name: 'Back to TALOS' })).toHaveCount(0)
    } finally {
        await context.close()
    }
})

test('root is the canonical TALOS workspace and legacy routes redirect to it', async ({ page }, testInfo) => {
    await openWorkspace(page)
    await attachWorkspaceScreenshot(page, testInfo, 'root')
    await expectUnifiedWorkspaceChrome(page)
    await expectNoHorizontalOverflow(page)

    for (const routePath of ['/chat', '/dashboard'] as const) {
        await page.goto(routePath, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/$/)
        await expectUnifiedWorkspaceChrome(page)
    }
})

test('chat loads, sends a deterministic persisted turn, and stays keyboard reachable', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await expect(page.getByRole('heading', { name: 'What workflow should TALOS handle?' })).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose model profile' })).toContainText('E2E server-side profile')

    await page.getByLabel('Message TALOS').fill('Create a replayable file audit workflow.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.locator('p').filter({ hasText: 'Create a replayable file audit workflow.' })).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()
    await expect(page.getByText('1 JMP')).toBeVisible()
    await expect(page.getByText('Persisted', { exact: true })).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`chat-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('dashboard loads cockpit panels and opens the command palette', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await expectUnifiedWorkspaceChrome(page)

    await selectDashboardTab(page, 'Agents')
    await expect(page.getByText('Model Center', { exact: true })).toBeVisible()

    await selectDashboardTab(page, 'Knowledge')
    await expect(page.getByText('Context Vault', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Open command palette' }).click()
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeVisible()
    await page.getByLabel('Search TALOS commands').fill('doctor')
    await expect(page.getByRole('option', { name: /Open doctor/ })).toBeVisible()
    await expect(page.getByText('Command palette navigation is not wired yet; use the dashboard Doctor panel.')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'TALOS commands' })).toBeHidden()
    await expectNoHorizontalOverflow(page)
    await testInfo.attach(`dashboard-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('settings window loads safe preferences and persists theme through the settings API', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()
    await expect(page.getByText('Workspace defaults, model behavior and operator preferences from /api/talos/settings.')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'AI Defaults' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Search' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByText('api_key')).toBeHidden()
    await expect(page.getByText('encrypted_secret')).toBeHidden()

    await page.getByRole('tab', { name: 'Search' }).click()
    await page.getByLabel('Search provider').selectOption('searxng')
    await page.getByLabel('Results per query').fill('7')
    await page.getByLabel('Search endpoint URL').fill('http://localhost:8080')
    const searchPatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined
        const search = preferences?.search as Record<string, unknown> | undefined

        return search?.provider === 'searxng'
            && Number(search?.results_per_query) === 7
            && search?.url === 'http://localhost:8080'
    })
    await page.getByRole('button', { name: 'Save settings' }).click()
    await searchPatchRequest
    await expect(page.getByText('Settings saved through /api/talos/settings.')).toBeVisible()

    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()
    await expect(page.locator('[data-testid="talos-theme-preset"]')).toHaveCount(10)
    const themePatchRequest = page.waitForRequest((request) => {
        if (!request.url().endsWith('/api/talos/settings') || request.method() !== 'PATCH') {
            return false
        }

        const body = request.postDataJSON() as Record<string, unknown>
        const preferences = body.preferences as Record<string, unknown> | undefined

        return preferences?.theme === 'terminal'
    })
    await page.getByRole('button', { name: 'Terminal Operator' }).click()
    await themePatchRequest
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    await expect(page.getByText('Theme saved through /api/talos/settings.')).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await expect(page.locator('.talos-shell')).toHaveClass(/talos-theme-terminal/)
    await expectNoHorizontalOverflow(page)

    await testInfo.attach(`settings-theme-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('desktop sidebar collapses, expands, and resizes without overflow', async ({ page, isMobile }, testInfo) => {
    test.skip(Boolean(isMobile), 'desktop sidebar behavior is covered by the desktop project')

    await openWorkspace(page)

    const rail = page.locator('[aria-label="TALOS workspace rail"]').filter({ visible: true }).first()
    const expandedBefore = await rail.boundingBox()
    expect(expandedBefore?.width).toBeGreaterThan(200)

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    const collapsed = await rail.boundingBox()
    expect(collapsed?.width).toBeLessThan(96)

    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    const expanded = await rail.boundingBox()
    expect(expanded?.width).toBeGreaterThan(180)

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
        body: await page.screenshot({ fullPage: true }),
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
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('prompt enhancer previews the server-side prompt template without sending the chat turn', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByLabel('Message TALOS').fill('Draft a recovery plan for failed payment jobs.')
    await page.getByRole('button', { name: 'Improve prompt' }).click()

    await expect(page.getByText('Prompt enhancement preview', { exact: true })).toBeVisible()
    await expect(page.getByText('Server-side prompt template through /api/talos/prompts/enhance.')).toBeVisible()
    await expect(page.getByText('Objective:')).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toHaveValue('Draft a recovery plan for failed payment jobs.')

    await page.getByRole('button', { name: 'Replace prompt' }).click()

    await expect(page.getByLabel('Message TALOS')).toHaveValue(/Objective:\n\nDraft a recovery plan/)
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeHidden()

    await testInfo.attach(`prompt-enhancer-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    })
})

test('temporary chat mode creates an explicit temporary session before sending', async ({ page }, testInfo) => {
    await openWorkspace(page)

    await page.getByRole('button', { name: 'Temporary chat' }).click()
    await expect(page.getByText('Temporary mode')).toBeVisible()

    await page.getByLabel('Message TALOS').fill('Run this as a disposable investigation.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('Temporary session')).toBeVisible()
    await expect(page.getByText('E2E response from AVM with replayable evidence.')).toBeVisible()

    await testInfo.attach(`temporary-session-${testInfo.project.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
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
    await expect(page.getByText('E2E grounded context', { exact: true })).toBeVisible()
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

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(page)
    await chooseModelProfile(page)
    await chooseContextSet(page)
    await expect(page.getByRole('button', { name: 'Choose grounding context' })).toContainText('E2E grounded context')

    await page.getByLabel('Message TALOS').fill('Use the uploaded file and cite the source.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('E2E response from AVM with replayable evidence and grounded file context.')).toBeVisible()
    await expect(page.getByText('Source provenance')).toBeVisible()
    await expect(page.getByText('workflow.md')).toBeVisible()
    await expect(page.getByText('Workflow file says approve the deployment checklist.')).toBeVisible()
})

test('dashboard replays a persisted failed run and exposes fault evidence', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')

    await expect(page.getByRole('button', { name: /run-e2e verified execution/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByText('2 events', { exact: true })).toBeVisible()
    await expect(page.getByText('1 node states')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByText('HTTP 503 failure')).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ }).getByText('fault', { exact: true })).toBeVisible()
})

test('dashboard replay filters to fault steps through a real control', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Runtime')

    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()

    await page.getByLabel('Replay step filter').selectOption('fault')

    await expect(page.getByRole('button', { name: /#1 node_started Node started state/ })).toBeHidden()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByText('1/1')).toBeVisible()

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toBeVisible()
})

test('dashboard runs a fresh benchmark comparison and inspects created lanes', async ({ page }) => {
    await openWorkspace(page)
    await selectDashboardTab(page, 'Benchmarks')

    await page.getByLabel('Benchmark scenario path').fill('benchmark-scenarios/e2e/generated.json')
    await page.getByLabel('Benchmark runs').fill('1')
    await page.getByRole('button', { name: 'Compare', exact: true }).last().click()

    await expect(page.getByText('Benchmark comparison completed.')).toBeVisible()
    await expect(page.getByText('E2E generated compare')).toBeVisible()
    await expect(page.getByText('AVM ON generated')).toBeVisible()
    await expect(page.getByText('AVM OFF generated')).toBeVisible()
    await expect(page.getByText('Generated AVM lane preserved node evidence.')).toBeVisible()
    await expect(page.getByText('Direct lane completed without replayable node evidence.')).toBeVisible()
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

test('mobile tool windows stay above the composer', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile window overlap is covered by the mobile project')

    await openWorkspace(page)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await expect(page.getByText('Theme Engine', { exact: true })).toBeVisible()
    await page.getByLabel('Message TALOS').fill('Line one\nLine two\nLine three\nLine four\nLine five')

    await expectNoComposerOverlap(page)
    await expectNoHorizontalOverflow(page)
})
