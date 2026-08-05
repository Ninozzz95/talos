import { expect, test, type Page, type Route } from '@playwright/test'
import { installTalosApiMocks } from './helpers/talosApiMocks'
import { waitForTalosWorkspaceReady } from './helpers/talosWorkspaceReady'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const now = '2026-08-05T10:00:00.000000Z'

type Decision = 'allow' | 'ask' | 'deny'
type Risk = 'low' | 'medium' | 'high' | 'critical'
type Action = 'read' | 'write' | 'outbound'

type CatalogEntry = {
    capability: string
    group: string
    label: string
    description: string
    risk: Risk
    actions: Action[]
    master_enable_eligible: boolean
}

type Policy = {
    capability: string
    actions: Action[]
    decision: Decision
    source: 'default' | 'user' | 'managed'
    risk: Risk
    updated_at: string | null
    last_used_at: string | null
}

type Grant = {
    id: string
    capability: string
    tool_id?: string | null
    actions: Action[]
    scope: 'once' | 'session' | 'device' | 'account'
    scope_id?: string | null
    status: 'active' | 'consumed' | 'expired' | 'revoked'
    granted_at: string
    expires_at?: string | null
    risk_acknowledged: boolean
}

type RequestEntry = {
    actor: string
    method: string
    path: string
    body: Record<string, unknown>
    status: number
}

const catalog: CatalogEntry[] = [
    ['artifacts.generate', 'artifacts', 'Generate artifacts', 'Generate managed documents or images.', 'medium', ['write'], false],
    ['files.write', 'files', 'Write TALOS files', 'Create or change files inside TALOS-managed storage.', 'medium', ['write'], false],
    ['files.transfer_to_provider', 'files', 'Transfer files to providers', 'Send selected file bytes to an external model provider.', 'critical', ['read', 'outbound'], false],
    ['web.search', 'web', 'Search the web', 'Query a configured web-search provider.', 'low', ['read', 'outbound'], true],
    ['web.fetch', 'web', 'Fetch web pages', 'Fetch a public web resource.', 'low', ['read', 'outbound'], true],
    ['browser.read', 'browser', 'Read browser pages', 'Navigate, inspect, snapshot, or screenshot a browser page.', 'low', ['read', 'outbound'], true],
    ['browser.write', 'browser', 'Interact with browser pages', 'Click, type, submit, or otherwise change remote browser state.', 'high', ['write', 'outbound'], false],
    ['browser.upload', 'browser', 'Upload files in the browser', 'Upload an authorized user file through a browser page.', 'critical', ['read', 'write', 'outbound'], false],
    ['email.read', 'email', 'Read email', 'Read data from a connected mailbox.', 'high', ['read', 'outbound'], false],
    ['email.send', 'email', 'Send email', 'Send an external email.', 'critical', ['write', 'outbound'], false],
    ['calendar.read', 'calendar', 'Read calendars', 'Read data from a connected calendar.', 'high', ['read', 'outbound'], false],
    ['calendar.write', 'calendar', 'Change calendars', 'Create or change external calendar data.', 'critical', ['write', 'outbound'], false],
    ['filesystem.read', 'filesystem', 'Read the host filesystem', 'Read files outside TALOS-managed storage.', 'high', ['read'], false],
    ['filesystem.write', 'filesystem', 'Write the host filesystem', 'Write files outside TALOS-managed storage.', 'critical', ['write'], false],
    ['integrations.external', 'integrations', 'Use external integrations', 'Invoke another external integration.', 'high', ['outbound'], false],
].map(([capability, group, label, description, risk, actions, masterEnableEligible]) => ({
    capability: capability as string,
    group: group as string,
    label: label as string,
    description: description as string,
    risk: risk as Risk,
    actions: actions as Action[],
    master_enable_eligible: masterEnableEligible as boolean,
}))

function createState() {
    return {
        revision: 1,
        policies: catalog.map<Policy>((entry) => ({
            capability: entry.capability,
            actions: [...entry.actions],
            decision: 'ask',
            source: 'default',
            risk: entry.risk,
            updated_at: null,
            last_used_at: null,
        })),
        grants: [] as Grant[],
        grantSequence: 0,
        requests: [] as RequestEntry[],
    }
}

function json(route: Route, payload: unknown, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload),
    })
}

function snapshot(state: ReturnType<typeof createState>) {
    return {
        schema_version: 1,
        revision: state.revision,
        policies: state.policies.map((policy) => ({ ...policy, actions: [...policy.actions] })),
        grants: state.grants.map((grant) => ({ ...grant, actions: [...grant.actions] })),
    }
}

function envelope(state: ReturnType<typeof createState>) {
    return {
        data: snapshot(state),
        meta: {
            catalog,
            master_enable: {
                eligible: catalog.filter((entry) => entry.master_enable_eligible).map((entry) => entry.capability),
                excluded: catalog.filter((entry) => !entry.master_enable_eligible).map((entry) => entry.capability),
            },
            faults: [],
        },
    }
}

async function installCapabilityPolicyApi(page: Page, state: ReturnType<typeof createState>, actor: string) {
    await page.route('**/api/talos/capability-policies**', async (route) => {
        const request = route.request()
        const method = request.method()
        const path = new URL(request.url()).pathname
        const body = request.postDataJSON() as Record<string, unknown> | null ?? {}

        if (path === '/api/talos/capability-policies' && method === 'GET') {
            return json(route, envelope(state))
        }

        const stale = body.expected_revision !== state.revision
        if (stale) {
            state.requests.push({ actor, method, path, body, status: 409 })
            return json(route, {
                message: 'Capability policy state changed in another session.',
                code: 'TALOS_CAPABILITY_POLICY_REVISION_CONFLICT',
                data: snapshot(state),
            }, 409)
        }

        const policyMatch = path.match(/^\/api\/talos\/capability-policies\/([^/]+)$/)
        if (policyMatch && method === 'PUT') {
            const capability = decodeURIComponent(policyMatch[1])
            const policy = state.policies.find((candidate) => candidate.capability === capability)
            if (!policy) return json(route, { message: 'Unknown capability.' }, 404)
            policy.decision = body.decision as Decision
            policy.source = 'user'
            policy.updated_at = now
            state.revision += 1
            state.requests.push({ actor, method, path, body, status: 200 })
            return json(route, { data: snapshot(state) })
        }

        const grantMatch = path.match(/^\/api\/talos\/capability-policies\/([^/]+)\/grants$/)
        if (grantMatch && method === 'POST') {
            const capability = decodeURIComponent(grantMatch[1])
            state.grantSequence += 1
            state.grants.push({
                id: `grant-${state.grantSequence}`,
                capability,
                ...(typeof body.tool_id === 'string' ? { tool_id: body.tool_id } : {}),
                actions: body.actions as Action[],
                scope: body.scope as Grant['scope'],
                ...(['session', 'device'].includes(String(body.scope)) ? { scope_id: String(body.scope_id) } : {}),
                status: 'active',
                granted_at: now,
                ...(body.scope === 'session' ? { expires_at: '2026-08-05T11:00:00.000000Z' } : {}),
                risk_acknowledged: body.risk_acknowledged === true,
            })
            state.revision += 1
            state.requests.push({ actor, method, path, body, status: 201 })
            return json(route, { data: snapshot(state) }, 201)
        }

        const revokeMatch = path.match(/^\/api\/talos\/capability-policies\/grants\/([^/]+)$/)
        if (revokeMatch && method === 'DELETE') {
            const grant = state.grants.find((candidate) => candidate.id === decodeURIComponent(revokeMatch[1]))
            if (!grant) return json(route, { message: 'Unknown grant.' }, 404)
            grant.status = 'revoked'
            state.revision += 1
            state.requests.push({ actor, method, path, body, status: 200 })
            return json(route, { data: snapshot(state) })
        }

        if (path === '/api/talos/capability-policies/master-enable' && method === 'POST') {
            for (const policy of state.policies) {
                const entry = catalog.find((candidate) => candidate.capability === policy.capability)
                if (entry?.master_enable_eligible) {
                    policy.decision = 'allow'
                    policy.source = 'user'
                    policy.updated_at = now
                }
            }
            state.revision += 1
            state.requests.push({ actor, method, path, body, status: 200 })
            return json(route, {
                data: snapshot(state),
                meta: {
                    enabled_capabilities: catalog.filter((entry) => entry.master_enable_eligible).map((entry) => entry.capability),
                    excluded_capabilities: catalog.filter((entry) => !entry.master_enable_eligible).map((entry) => entry.capability),
                },
            })
        }

        if (path === '/api/talos/capability-policies/revoke-all' && method === 'POST') {
            for (const policy of state.policies) {
                if (policy.decision === 'allow') policy.decision = 'ask'
            }
            for (const grant of state.grants) {
                if (grant.status === 'active') grant.status = 'revoked'
            }
            state.revision += 1
            state.requests.push({ actor, method, path, body, status: 200 })
            return json(route, { data: snapshot(state) })
        }

        return json(route, { message: `Unhandled capability policy request: ${method} ${path}` }, 405)
    })
}

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

async function openCapabilityPolicies(page: Page) {
    const backToChat = page.getByRole('button', { name: 'Back to chat', exact: true })
    if (await backToChat.isVisible().catch(() => false)) {
        await backToChat.click()
        await expect(page.getByTestId('talos-mobile-tool-sheet')).toHaveCount(0)
    }

    const settings = page.getByRole('button', { name: 'Settings', exact: true })
    if (!await settings.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click()
        await expect(page.getByRole('dialog', { name: 'TALOS navigation', exact: true })).toBeVisible()
    }
    await settings.click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Capabilities', exact: true }).click()
    await expect(page.getByTestId('talos-capability-policy-panel')).toBeVisible()
}

function policyCard(page: Page, capability: string) {
    return page.locator(`[data-capability-policy="${capability}"]`)
}

async function chooseDecision(page: Page, capability: string, decision: Decision) {
    const card = policyCard(page, capability)
    const label = decision.charAt(0).toUpperCase() + decision.slice(1)
    await card.getByText(label, { exact: true }).click()
    await expect(card.getByRole('radio', { name: label, exact: true })).toBeChecked()
}

test('capability policies expose the canonical choices, scoped grants, audited batches and reload persistence', async ({ page }, testInfo) => {
    const state = createState()
    await installTalosApiMocks(page)
    await installCapabilityPolicyApi(page, state, 'primary')
    await openAuthenticatedWorkspace(page)
    await openCapabilityPolicies(page)

    const panel = page.getByTestId('talos-capability-policy-panel')
    await expect(panel.locator('[data-capability-policy]')).toHaveCount(15)
    await expect(panel.getByRole('radio')).toHaveCount(45)
    for (const card of await panel.locator('[data-capability-policy]').all()) {
        await expect(card.getByRole('radio')).toHaveCount(3)
    }

    const search = policyCard(page, 'web.search')
    await chooseDecision(page, 'web.search', 'allow')

    const browserWrite = policyCard(page, 'browser.write')
    await chooseDecision(page, 'browser.write', 'deny')

    await search.getByRole('button', { name: 'Create grant for web.search', exact: true }).click()
    await page.getByLabel('Capability grant scope').click()
    await page.getByRole('option', { name: 'Session', exact: true }).click()
    await page.getByLabel('Session identifier').fill('session-policy-e2e')
    await page.getByLabel('Session grant TTL seconds').fill('3600')
    await page.getByTestId('talos-capability-grant-submit').click()
    await expect(search.getByRole('button', { name: 'Revoke grant grant-1', exact: true })).toBeVisible()

    const grantRequest = state.requests.find((entry) => entry.path.endsWith('/web.search/grants'))
    expect(grantRequest?.body).toMatchObject({
        expected_revision: 3,
        scope: 'session',
        scope_id: 'session-policy-e2e',
        session_ttl_seconds: 3600,
        actions: ['read', 'outbound'],
    })

    await search.getByRole('button', { name: 'Revoke grant grant-1', exact: true }).click()
    await expect(search.getByRole('button', { name: 'Revoke grant grant-1', exact: true })).toHaveCount(0)

    await panel.getByRole('button', { name: 'Enable eligible set', exact: true }).click()
    const enableDialog = page.getByRole('alertdialog', { name: 'Enable the eligible capability set?', exact: true })
    await expect(enableDialog).toContainText('web.search, web.fetch, browser.read')
    await expect(enableDialog).toContainText('browser.write')
    await enableDialog.getByRole('button', { name: 'Enable eligible', exact: true }).click()
    await expect(policyCard(page, 'web.fetch').getByRole('radio', { name: 'Allow', exact: true })).toBeChecked()
    await expect(browserWrite.getByRole('radio', { name: 'Deny', exact: true })).toBeChecked()

    await panel.getByRole('button', { name: 'Revoke all', exact: true }).click()
    const revokeDialog = page.getByRole('alertdialog', { name: 'Revoke all capability access?', exact: true })
    await expect(revokeDialog).toContainText('Explicit Deny decisions remain unchanged.')
    await revokeDialog.getByRole('button', { name: 'Revoke all', exact: true }).click()
    await expect(policyCard(page, 'web.fetch').getByRole('radio', { name: 'Ask', exact: true })).toBeChecked()
    await expect(browserWrite.getByRole('radio', { name: 'Deny', exact: true })).toBeChecked()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForTalosWorkspaceReady(page)
    await openCapabilityPolicies(page)
    await expect(policyCard(page, 'web.fetch').getByRole('radio', { name: 'Ask', exact: true })).toBeChecked()
    await expect(policyCard(page, 'browser.write').getByRole('radio', { name: 'Deny', exact: true })).toBeChecked()

    const geometry = await page.getByTestId('talos-capability-policy-panel').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
            left: rect.left,
            right: rect.right,
            viewportWidth: window.innerWidth,
            pageScrollWidth: document.documentElement.scrollWidth,
            pageClientWidth: document.documentElement.clientWidth,
        }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 0.5)
    expect(geometry.pageScrollWidth).toBeLessThanOrEqual(geometry.pageClientWidth + 1)

    const screenshotPath = `storage/framework/testing/c2-capability-policies-${testInfo.project.name}.png`
    await page.screenshot({ path: screenshotPath, animations: 'disabled' })
    await testInfo.attach(`capability-policies-${testInfo.project.name}.png`, {
        path: screenshotPath,
        contentType: 'image/png',
    })
})

test('a stale second tab reconciles the authoritative snapshot once without replaying its decision', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'two-tab revision conflict runs once in desktop Chromium')

    const state = createState()
    await installTalosApiMocks(page)
    await installCapabilityPolicyApi(page, state, 'first-tab')
    await openAuthenticatedWorkspace(page)
    await openCapabilityPolicies(page)

    const second = await context.newPage()
    await installTalosApiMocks(second)
    await installCapabilityPolicyApi(second, state, 'second-tab')
    await openAuthenticatedWorkspace(second)
    await openCapabilityPolicies(second)

    await chooseDecision(page, 'web.search', 'allow')

    await policyCard(second, 'web.search').getByText('Deny', { exact: true }).click()
    await expect(second.getByTestId('talos-capability-policy-panel').getByRole('alert')).toContainText('Capability policy state changed in another session. Review the current values and retry explicitly.')
    await expect(policyCard(second, 'web.search').getByRole('radio', { name: 'Allow', exact: true })).toBeChecked()

    expect(state.requests.filter((entry) => entry.actor === 'second-tab' && entry.method === 'PUT')).toHaveLength(1)
    expect(state.requests.at(-1)?.status).toBe(409)
    await second.close()
})
