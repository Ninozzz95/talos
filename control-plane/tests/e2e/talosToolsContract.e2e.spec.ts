import { expect, test, type Page, type Route } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { waitForTalosWorkspaceReady } from './helpers/talosWorkspaceReady'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

function json(route: Route, data: Record<string, unknown>) {
    return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
    })
}

function contract(overrides: Record<string, unknown> = {}) {
    return {
        schema_version: 1,
        id: 'managed-tool-e2e',
        name: 'HTTP_REQUEST',
        title: 'HTTP request',
        description: 'Fetch a public HTTP resource.',
        input_schema: { type: 'object', required: ['url'] },
        output_schema: { type: 'object', properties: { status: { type: 'integer' } } },
        capabilities: ['http.request', 'network.public'],
        actions: ['read', 'outbound'],
        confirmation: 'policy',
        risk: 'medium',
        effects: {
            mutates_state: false,
            parallel_safe: true,
            requires_approval: false,
            produces_evidence: true,
        },
        lifecycle: { kind: 'managed_registry', revision: 'managed-registry:4' },
        execution: { locations: ['trusted_node'], implementation_key: 'registry.http_request' },
        connector_id: null,
        enabled: true,
        planning_enabled: true,
        ...overrides,
    }
}

function tool(overrides: Record<string, unknown> = {}) {
    const canonical = contract(overrides.contract as Record<string, unknown> | undefined)
    return {
        id: canonical.id,
        connector_id: canonical.connector_id ?? null,
        name: canonical.name,
        display_name: canonical.title,
        description: canonical.description,
        input_schema: canonical.input_schema,
        risk_level: canonical.risk,
        capability: canonical.capabilities[0],
        policy: null,
        is_enabled: canonical.enabled,
        planning_enabled: canonical.planning_enabled,
        created_at: null,
        updated_at: null,
        contract: canonical,
        availability: { available: true, reason: null },
        ...overrides,
    }
}

const managedTool = tool()
const mobileOnlyTool = tool({
    id: 'bundled-mobile-e2e',
    name: 'browser_navigate',
    display_name: 'Navigate browser',
    contract: contract({
        id: 'bundled-mobile-e2e',
        name: 'BROWSER_NAVIGATE',
        title: 'Navigate browser',
        output_schema: null,
        capabilities: ['browser.navigation'],
        actions: ['read'],
        lifecycle: { kind: 'bundled', revision: 'bundled:2' },
        execution: { locations: ['local_mobile'], implementation_key: 'browser_navigate' },
    }),
    availability: { available: false, reason: 'desktop_location_unsupported' },
})

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#talos-workspace-root[data-authenticated="true"]').count() === 0) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        const form = page.locator('#talos-login-form')
        await expect(form).toBeVisible()
        await form.getByLabel('Email').fill(e2eLoginEmail)
        await form.getByLabel('Password').fill(e2eLoginPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
    }
    await waitForTalosWorkspaceReady(page)
}

async function openToolRegistry(page: Page) {
    const workbench = page.getByRole('button', { name: 'Workbench', exact: true })
    if (await workbench.getAttribute('aria-expanded') !== 'true') {
        await workbench.click()
    }
    const tools = page.getByRole('button', { name: 'Tools', exact: true })
    await expect(tools).toBeVisible()
    await tools.click()
    await expect(page.locator('[data-window-id="tools"]')).toBeVisible()
}

test('C1 Tool Registry renders canonical lifecycle, availability, and schemas through the desktop UI', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop C1 contract journey')

    await installTalosApiMocks(page)
    let toolListRequests = 0
    await page.route('**/api/talos/tools?*', async (route) => {
        const url = new URL(route.request().url())
        expect(url.searchParams.get('include_disabled')).toBe('1')
        expect(url.searchParams.get('include_bundled')).toBe('1')
        toolListRequests += 1
        await json(route, { data: [managedTool, mobileOnlyTool] })
    })
    await page.route('**/api/talos/tools/planning-context', async (route) => {
        await json(route, {
            data: {
                source: 'talos_tool_registry',
                policy: {
                    disabled_tools_excluded: true,
                    disabled_connectors_excluded: true,
                    unsupported_execution_excluded: true,
                    tool_outputs_are_untrusted: true,
                },
                tools: [{
                    name: 'HTTP_REQUEST',
                    display_name: 'HTTP request',
                    description: 'Fetch a public HTTP resource.',
                    input_schema: { type: 'object' },
                    risk_level: 'medium',
                    capability: 'http.request',
                    connector: null,
                    contract: managedTool.contract,
                }],
                excluded_tools: [{ name: 'BROWSER_NAVIGATE', reason: 'desktop_location_unsupported' }],
            },
        })
    })

    await openAuthenticatedWorkspace(page)
    await openToolRegistry(page)

    const window = page.locator('[data-window-id="tools"]')
    const cards = window.getByTestId('talos-tool-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0)).toContainText('Managed')
    await expect(cards.nth(0)).toContainText('managed-registry:4')
    await expect(cards.nth(1)).toContainText('Bundled')
    await expect(cards.nth(1)).toContainText('Desktop location unsupported')
    await expect(cards.nth(1)).toHaveAttribute('data-available', 'false')

    const viewer = window.getByTestId('talos-tool-contract-viewer')
    await expect(viewer.getByTestId('talos-tool-input-schema')).toContainText('"url"')
    await expect(viewer.getByTestId('talos-tool-output-schema')).toContainText('"status"')
    await expect(viewer.locator('[data-capability="http.request"]')).toHaveCount(1)
    await expect(viewer.locator('[data-action="outbound"]')).toHaveCount(1)

    await cards.nth(1).click()
    await expect(viewer).toContainText('Canonical: BROWSER_NAVIGATE')
    await expect(viewer).toContainText('local_mobile')
    await expect(viewer.getByTestId('talos-tool-output-schema-empty')).toContainText('No output schema declared')
    await expect(window.getByRole('button', { name: /invoke|run tool|execute/i })).toHaveCount(0)

    const overflow = await window.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    await window.getByTitle('Refresh tool registry').click()
    await expect.poll(() => toolListRequests).toBe(2)
    await expect(window.locator('[data-tool-id="bundled-mobile-e2e"]')).toHaveAttribute('data-available', 'false')

    await testInfo.attach('c1-tool-registry-desktop.png', {
        body: await window.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
    })
})
