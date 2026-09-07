// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import TalosCapabilityPolicyPanel from './TalosCapabilityPolicyPanel.vue'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
}

let policyContext: any
let app: ReturnType<typeof createApp> | undefined

vi.mock('../../../composables/useTalosCapabilityPolicies', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../composables/useTalosCapabilityPolicies')>()
    return { ...actual, useTalosCapabilityPolicies: () => policyContext }
})

vi.mock('../../../composables/useTalosToast', () => ({
    useTalosToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
}))

function contract() {
    return {
        schema_version: 1,
        revision: 7,
        policies: [
            { capability: 'web.search', actions: ['read', 'outbound'], decision: 'ask', source: 'user', risk: 'low', updated_at: null, last_used_at: null },
            { capability: 'browser.write', actions: ['write', 'outbound'], decision: 'ask', source: 'managed', risk: 'high', updated_at: null, last_used_at: null },
        ],
        grants: [
            { id: 'g1', capability: 'web.search', actions: ['read'], scope: 'once', scope_id: null, status: 'active', granted_at: '2026-08-05T10:00:00.000000Z', expires_at: null, risk_acknowledged: false },
        ],
    }
}

function metadata() {
    return {
        catalog: [
            { capability: 'web.search', group: 'web', label: 'Search the web', description: 'Query a search provider.', risk: 'low', actions: ['read', 'outbound'], master_enable_eligible: true },
            { capability: 'browser.write', group: 'browser', label: 'Interact with browser pages', description: 'Click or type in a remote page.', risk: 'high', actions: ['write', 'outbound'], master_enable_eligible: false },
        ],
        master_enable: { eligible: ['web.search'], excluded: ['browser.write'] },
        faults: [{ code: 'invalid_stored_grant', capability: 'browser.write', grant_id: 'bad', message: 'A malformed grant was forced closed.' }],
    }
}

function mountPanel() {
    const portal = document.createElement('div')
    portal.id = 'talos-portal-root'
    document.body.append(portal)
    const mountPoint = document.createElement('div')
    document.body.append(mountPoint)
    app = createApp(TalosCapabilityPolicyPanel, { activeTalosSessionId: 'session-1' })
    app.mount(mountPoint)
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

beforeEach(() => {
    policyContext = {
        contract: ref(contract()),
        meta: ref(metadata()),
        loadState: ref('loaded'),
        policyError: ref(null),
        conflictMessage: ref(null),
        pendingOperation: ref(null),
        mutating: ref(false),
        catalogByCapability: ref(new Map()),
        loadPolicies: vi.fn().mockResolvedValue(contract()),
        updateDecision: vi.fn().mockResolvedValue(contract()),
        createGrant: vi.fn().mockResolvedValue(contract()),
        revokeGrant: vi.fn().mockResolvedValue(contract()),
        masterEnable: vi.fn().mockResolvedValue(contract()),
        revokeAll: vi.fn().mockResolvedValue(contract()),
    }
})

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

describe('TalosCapabilityPolicyPanel', () => {
    it('loads policy truth and renders exactly three decisions for every capability', async () => {
        mountPanel()
        await settle()

        expect(policyContext.loadPolicies).toHaveBeenCalledTimes(1)
        expect(document.querySelectorAll('[data-capability-policy]').length).toBe(2)
        expect(document.querySelectorAll('[data-capability-policy] [role="radio"]').length).toBe(6)
        expect(document.body.textContent).toContain('A malformed grant was forced closed.')
    })

    it('updates a low-risk decision directly from the segmented radio group', async () => {
        mountPanel()
        await settle()
        const allow = document.querySelector<HTMLInputElement>('[data-capability-policy="web.search"] [data-decision="allow"]')
        allow?.click()
        await settle()

        expect(policyContext.updateDecision).toHaveBeenCalledWith('web.search', 'allow', false)
    })

    it('disables every network action while a policy mutation is pending', async () => {
        policyContext.pendingOperation.value = 'decision:web.search'
        policyContext.mutating.value = true
        mountPanel()
        await settle()

        expect(document.querySelector<HTMLButtonElement>('[aria-label="Refresh capability policies"]')?.disabled).toBe(true)
        expect([...document.querySelectorAll<HTMLInputElement>('[data-decision]')].every((input) => input.closest('fieldset')?.disabled)).toBe(true)
        expect([...document.querySelectorAll<HTMLButtonElement>('[aria-label^="Create grant for"]')].every((button) => button.disabled)).toBe(true)
        expect(document.querySelector<HTMLButtonElement>('[aria-label="Revoke grant g1"]')?.disabled).toBe(true)
    })

    it('keeps reconciled stale-revision guidance ahead of the shorter API error', async () => {
        policyContext.conflictMessage.value = 'Capability policy state changed in another session. Review the current values and retry explicitly.'
        policyContext.updateDecision.mockRejectedValueOnce(new Error('Capability policy state changed in another session.'))
        mountPanel()
        await settle()

        document.querySelector<HTMLInputElement>('[data-capability-policy="web.search"] [data-decision="deny"]')?.click()
        await settle()

        expect(document.body.textContent).toContain('Capability policy state changed in another session. Review the current values and retry explicitly.')
    })

    it('requires a local acknowledgement before high-risk allow', async () => {
        mountPanel()
        await settle()
        const allow = document.querySelector<HTMLInputElement>('[data-capability-policy="browser.write"] [data-decision="allow"]')
        expect(allow?.disabled).toBe(true)

        document.querySelector<HTMLInputElement>('[aria-label="Acknowledge browser.write risk"]')?.click()
        await nextTick()
        expect(allow?.disabled).toBe(false)
        allow?.click()
        await settle()

        expect(policyContext.updateDecision).toHaveBeenCalledWith('browser.write', 'allow', true)
    })

    it('creates a once grant and exposes scope-dependent session fields', async () => {
        mountPanel()
        await settle()
        document.querySelector<HTMLButtonElement>('[aria-label="Create grant for web.search"]')?.click()
        await nextTick()

        expect(document.querySelector('[data-testid="talos-capability-grant-form"]')).not.toBeNull()
        document.querySelector<HTMLButtonElement>('[data-testid="talos-capability-grant-submit"]')?.click()
        await settle()
        expect(policyContext.createGrant).toHaveBeenCalledWith('web.search', expect.objectContaining({ scope: 'once', actions: ['read', 'outbound'] }))

        document.querySelector<HTMLButtonElement>('[aria-label="Create grant for web.search"]')?.click()
        await nextTick()
        const trigger = document.querySelector('[data-testid="talos-capability-grant-form"] [data-testid="talos-themed-select-trigger"]')
        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()
        const session = document.querySelector<HTMLElement>('[data-value="session"]')
        session?.focus()
        session?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()
        expect(document.querySelector('[aria-label="Session identifier"]')).not.toBeNull()
        expect(document.querySelector('[aria-label="Session grant TTL seconds"]')).not.toBeNull()
    })

    it('revokes an active grant through its explicit command', async () => {
        mountPanel()
        await settle()
        document.querySelector<HTMLButtonElement>('[aria-label="Revoke grant g1"]')?.click()
        await settle()
        expect(policyContext.revokeGrant).toHaveBeenCalledWith('g1')
    })
})
