// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import {
    TALOS_CAPABILITIES_KEY,
    type TalosCapabilitiesContext,
} from '../../../composables/useTalosCapabilities'
import {
    TALOS_CAPABILITY_CONTRACT,
    parseTalosCapabilityManifest,
    type TalosCapabilityId,
} from '../../../lib/talosCapabilities'
import TalosSettingsCenter from './TalosSettingsCenter.vue'

vi.mock('../../../composables/useTalosSettings', () => ({
    useTalosSettings: () => ({
        settings: ref(null),
        loadingSettings: ref(false),
        savingSettings: ref(false),
        settingsError: ref(null),
        settingsSavedMessage: ref(''),
        loadSettings: () => Promise.resolve(null),
        updateSettings: () => Promise.resolve(null),
    }),
}))

vi.mock('../../../composables/useTalosCapabilityPolicies', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../composables/useTalosCapabilityPolicies')>()
    return {
        ...actual,
        useTalosCapabilityPolicies: () => ({
            contract: ref({ schema_version: 1, revision: 0, policies: [], grants: [] }),
            meta: ref({ catalog: [], master_enable: { eligible: [], excluded: [] }, faults: [] }),
            loadState: ref('loaded'),
            policyError: ref(null),
            conflictMessage: ref(null),
            pendingOperation: ref(null),
            mutating: ref(false),
            catalogByCapability: ref(new Map()),
            loadPolicies: () => Promise.resolve(null),
            updateDecision: () => Promise.resolve(null),
            createGrant: () => Promise.resolve(null),
            revokeGrant: () => Promise.resolve(null),
            masterEnable: () => Promise.resolve(null),
            revokeAll: () => Promise.resolve(null),
        }),
    }
})

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

function capabilitiesContext(): TalosCapabilitiesContext {
    const manifest = ref(parseTalosCapabilityManifest({
        contract: TALOS_CAPABILITY_CONTRACT,
        revision: '2026-07-28.1',
        capabilities: [
            {
                id: 'models.profiles',
                state: 'available',
                reason: null,
                evidence: ['api:GET /api/talos/model-profiles'],
            },
            {
                id: 'models.local_runtime',
                state: 'planned',
                reason: 'Local runtime is not promoted yet.',
                evidence: ['roadmap:P6-local-runtime'],
            },
            {
                id: 'models.multi_model_orchestration',
                state: 'planned',
                reason: 'Multi-model execution is not promoted yet.',
                evidence: ['roadmap:P6-multi-model-orchestration'],
            },
        ],
    }))
    const capability = (id: TalosCapabilityId) => manifest.value.capabilities.find((entry) => entry.id === id) ?? {
        id,
        state: 'blocked' as const,
        reason: 'Not verified.',
        evidence: ['client:unverified'],
    }

    return {
        manifest,
        loadState: ref('loaded'),
        error: ref(null),
        capability,
        isAvailable: (id) => capability(id).state === 'available',
        isUsable: (id) => ['available', 'degraded'].includes(capability(id).state),
        loadCapabilities: async () => manifest.value,
        dispose: () => undefined,
    }
}

describe('TalosSettingsCenter capability truth', () => {
    it('shows Available and Roadmap from the injected manifest without an action on planned rows', async () => {
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)

        app = createApp(defineComponent({
            setup() {
                return () => h(TalosSettingsCenter, {
                    modelProfiles: [],
                    contextSets: [],
                    selectedModelProfileId: '',
                    selectedContextSetId: '',
                    focusedTab: 'models',
                    focusedTabRevision: 1,
                })
            },
        }))
        app.provide(TALOS_CAPABILITIES_KEY, capabilitiesContext())
        app.mount(mountPoint)
        await nextTick()
        await nextTick()

        const profiles = document.querySelector('[data-capability-id="models.profiles"]')
        const runtime = document.querySelector('[data-capability-id="models.local_runtime"]')

        expect(profiles?.textContent).toContain('Provider profiles')
        expect(profiles?.textContent).toContain('Available')
        expect(runtime?.textContent).toContain('Local model runtime')
        expect(runtime?.textContent).toContain('Roadmap')
        expect(runtime?.textContent).toContain('Local runtime is not promoted yet.')
        expect(runtime?.querySelector('button, a')).toBeNull()
    })

    it('opens a dedicated policy tab without the unrelated workspace save command', async () => {
        const portal = document.createElement('div')
        portal.id = 'talos-portal-root'
        document.body.append(portal)
        const mountPoint = document.createElement('div')
        document.body.append(mountPoint)

        app = createApp(defineComponent({
            setup() {
                return () => h(TalosSettingsCenter, {
                    modelProfiles: [],
                    contextSets: [],
                    selectedModelProfileId: '',
                    selectedContextSetId: '',
                    focusedTab: 'policies',
                    focusedTabRevision: 2,
                    activeTalosSessionId: 'session-1',
                })
            },
        }))
        app.provide(TALOS_CAPABILITIES_KEY, capabilitiesContext())
        app.mount(mountPoint)
        await nextTick()
        await nextTick()

        expect(document.getElementById('talos-settings-tab-policies')).not.toBeNull()
        const panel = document.getElementById('talos-settings-panel-policies')
        expect(panel?.querySelector('[data-testid="talos-capability-policy-panel"]')).not.toBeNull()
        expect([...panel?.querySelectorAll('button') ?? []].some((button) => button.textContent?.includes('Save settings'))).toBe(false)
    })
})
