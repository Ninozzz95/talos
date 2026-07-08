import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { installTalosApiMocks } from './helpers/talosApiMocks'

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

async function selectDashboardTab(page: Page, name: string) {
    const matcher = new RegExp(name)
    const tab = page.getByRole('tab', { name: matcher }).first()

    if (await tab.isVisible().catch(() => false)) {
        await tab.click()
        return
    }

    await page.getByRole('button', { name: matcher }).first().click()
}

test.beforeEach(async ({ page }) => {
    await installTalosApiMocks(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('chat loads, sends a deterministic persisted turn, and stays keyboard reachable', async ({ page }, testInfo) => {
    await page.goto('/chat', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'What workflow should TALOS handle?' })).toBeVisible()
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expect(page.getByLabel('Server-side model profile')).toContainText('E2E server-side profile')

    await page.getByLabel('Server-side model profile').selectOption('profile-e2e')
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
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'TALOS control cockpit' })).toBeVisible()

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

test('dashboard exports a persisted benchmark report through a real endpoint', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
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
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
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
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
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

    await page.goto('/chat', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Server-side model profile').selectOption('profile-e2e')
    await page.getByLabel('Grounding context set').selectOption('context-set-e2e')
    await expect(page.getByText('Grounding context set: E2E grounded context. Uploaded content is injected server-side as untrusted data.')).toBeVisible()

    await page.getByLabel('Message TALOS').fill('Use the uploaded file and cite the source.')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('E2E response from AVM with replayable evidence and grounded file context.')).toBeVisible()
    await expect(page.getByText('Source provenance')).toBeVisible()
    await expect(page.getByText('workflow.md')).toBeVisible()
    await expect(page.getByText('Workflow file says approve the deployment checklist.')).toBeVisible()
})

test('dashboard replays a persisted failed run and exposes fault evidence', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('button', { name: /run-e2e verified execution/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ })).toBeVisible()
    await expect(page.getByText('2 events', { exact: true })).toBeVisible()
    await expect(page.getByText('1 node states')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.getByText('HTTP 503 failure')).toBeVisible()
    await expect(page.getByRole('button', { name: /#2 node_failed HTTP 503 failure fault/ }).getByText('fault', { exact: true })).toBeVisible()
})

test('dashboard replay filters to fault steps through a real control', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

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
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await selectDashboardTab(page, 'Benchmarks')

    await page.getByLabel('Benchmark scenario path').fill('benchmark-scenarios/e2e/generated.json')
    await page.getByLabel('Benchmark runs').fill('1')
    await page.getByRole('button', { name: 'Compare' }).click()

    await expect(page.getByText('Benchmark comparison completed.')).toBeVisible()
    await expect(page.getByText('E2E generated compare')).toBeVisible()
    await expect(page.getByText('AVM ON generated')).toBeVisible()
    await expect(page.getByText('AVM OFF generated')).toBeVisible()
    await expect(page.getByText('Generated AVM lane preserved node evidence.')).toBeVisible()
    await expect(page.getByText('Direct lane completed without replayable node evidence.')).toBeVisible()
})

test('mobile chat and dashboard avoid layout overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile overflow is covered by the mobile project')

    await page.goto('/chat', { waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'TALOS control cockpit' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
})
