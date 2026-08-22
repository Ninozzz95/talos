// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const prefs = new Map<string, string>()
vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => { prefs.set(key, value) },
    },
}))

import { Preferences } from '@capacitor/preferences'
import {
    DEFAULT_SETTINGS_STATE,
    parseTalosMobileSettings,
    TALOS_MOBILE_SETTINGS_KEY,
    useSettingsStore,
    __resetSettingsStoreForTests,
} from '@/stores/settings'
import { createDefaultTalosMotionV6Preferences } from '@/motion-v6/defaults'
import { TALOS_DEFAULT_MODEL_LAB_PREFERENCES } from '@/lib/modelLabContracts'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'
import { TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES } from '@/lib/browser/browserContracts'

beforeEach(() => {
    prefs.clear()
    __resetSettingsStoreForTests()
})

describe('parseTalosMobileSettings', () => {
    it('returns sane defaults for null / garbage', () => {
        expect(parseTalosMobileSettings(null)).toEqual(DEFAULT_SETTINGS_STATE)
        expect(parseTalosMobileSettings('{bad')).toEqual(DEFAULT_SETTINGS_STATE)
    })
    it('TOOL-AUTH-08 parses missing or corrupt persistent grants as empty', () => {
        expect(parseTalosMobileSettings(null).tool_authorizations).toEqual({
            schema_version: 1,
            revision: 0,
            grants: {},
        })
        expect(parseTalosMobileSettings(JSON.stringify({
            tool_authorizations: {
                schema_version: 1,
                revision: 4,
                grants: {
                    document_create: {
                        schema_version: 1,
                        tool: 'generate_image',
                        actions: ['write'],
                        scope: 'device',
                        granted_at: 'invalid',
                    },
                },
            },
        })).tool_authorizations).toEqual({
            schema_version: 1,
            revision: 4,
            grants: {},
        })
    })
    it('P1-CTX-COMPAT-03 preserves an existing explicit Library context opt-in', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            library_defaults_v1: true,
            shell: { library_context_enabled: true },
        }))

        expect(parsed.shell.library_context_enabled).toBe(true)
    })
    it('P1-CTX-COMPAT-04 keeps Library context off by default', () => {
        expect(parseTalosMobileSettings(null).shell.library_context_enabled).toBe(false)
    })
    it('P1-CTX-POLICY-03 resolves legacy Library settings without synthesizing policy state', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            library_defaults_v1: true,
            shell: { library_context_enabled: true },
        }))

        expect(parsed.shell.library_context_enabled).toBe(true)
        expect(parsed.shell.library_context_policy).toBeNull()
    })
    it('sanitizes each subtree via the desktop resolvers', () => {
        const motion = createDefaultTalosMotionV6Preferences()
        motion.mode = 'complex'
        motion.speed = 150
        const parsed = parseTalosMobileSettings(JSON.stringify({
            chat_layout: { bubble_scale: 'compact', composer_mode: 'minimal', mobile_window_presentation: 'fullscreen', advanced_rail_expanded: true },
            ai_defaults: { utility_model_mode: 'default_profile', research_model_mode: 'nonsense', vision_enabled: false },
            composer_defaults: { model_profile_id: 'openrouter:model-a', effort: 'medium', thinking: true },
            motion_v6: motion,
        }))
        expect(parsed.chat_layout.bubble_scale).toBe('compact')
        expect(parsed.ai_defaults.utility_model_mode).toBe('default_profile')
        expect(parsed.ai_defaults.research_model_mode).toBe('same_as_chat') // invalid -> default
        expect(parsed.ai_defaults.vision_enabled).toBe(false)
        expect(parsed.composer_defaults).toEqual({
            model_profile_id: 'openrouter:model-a',
            effort: 'medium',
            thinking: true,
        })
        expect(parsed.motion_v6.mode).toBe('complex')
        expect(parsed.motion_v6.speed).toBe(150)
        // visibility falls back to a complete valid map (F4-#25: shortcuts removed)
    })

    it('fails malformed composer defaults closed', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            composer_defaults: {
                model_profile_id: ['not-a-model'],
                effort: 'maximum',
                thinking: 'yes',
            },
        }))

        expect(parsed.composer_defaults).toEqual({
            model_profile_id: null,
            effort: 'high',
            thinking: false,
        })
    })

    it('fails malformed Model Lab preferences closed without retaining secret-like fields', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            model_lab: {
                schema_version: 1,
                manual_models: [],
                model_overrides: {},
                provider_runtime: {},
                probe_results: {},
                api_key: 'must-not-survive',
            },
        }))

        expect(parsed.model_lab).toEqual(TALOS_DEFAULT_MODEL_LAB_PREFERENCES)
        expect(JSON.stringify(parsed.model_lab)).not.toContain('must-not-survive')
    })

    it('parses Browser preferences atomically and rejects stored worker credentials', () => {
        expect(parseTalosMobileSettings(JSON.stringify({
            browser: {
                schema_version: 1,
                hmi_mode: 'confirm_every_interaction',
                presentation: 'system_browser',
                suggest_for_urls: false,
                developer_untrusted_evidence: true,
            },
        })).browser).toEqual({
            schema_version: 1,
            hmi_mode: 'confirm_every_interaction',
            presentation: 'system_browser',
            suggest_for_urls: false,
            developer_untrusted_evidence: true,
        })

        expect(parseTalosMobileSettings(JSON.stringify({
            browser: {
                ...TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
                service_token: 'forbidden',
            },
        })).browser).toEqual(TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES)
    })

    it('DICT-SETTINGS-01 parses dictation language fail-closed', () => {
        // ⛔ Il default e' AUTOMATICO: una lingua inchiodata all'installazione
        // e' esattamente cio' che ha fatto perdere una dettatura all'owner.
        expect(parseTalosMobileSettings(null).voice.dictation_language).toBe('auto')
        expect(parseTalosMobileSettings(JSON.stringify({
            voice: { dictation_language: 'it' },
        })).voice.dictation_language).toBe('auto')
        expect(parseTalosMobileSettings(JSON.stringify({
            voice: { dictation_language: 'de-DE' },
        })).voice.dictation_language).toBe('de-DE')
    })

    // Blueprint §37.1 "Settings" - the additive personal-voice schema (Fase 4).
    it('PVOICE-SETTINGS-01 settings written before the personal engine existed parse identically to today', () => {
        const legacy = JSON.stringify({
            voice: { voice_uri: 'it-IT-language', rate: 1.3, pitch: 0.9, dictation_language: 'it-IT' },
        })
        const parsed = parseTalosMobileSettings(legacy).voice
        expect(parsed.voice_uri).toBe('it-IT-language')
        expect(parsed.rate).toBe(1.3)
        expect(parsed.pitch).toBe(0.9)
        expect(parsed.dictation_language).toBe('it-IT')
        // None of these fields existed in that JSON - a fresh install's defaults, not a crash and not `undefined`.
        expect(parsed.engine).toBe('system')
        expect(parsed.personal_profile_id).toBeNull()
        expect(parsed.personal_rate).toBe(1)
        expect(parsed.personal_pitch).toBe(1)
    })

    it('PVOICE-SETTINGS-02 an unknown or corrupted engine value falls back to system, never personal', () => {
        expect(parseTalosMobileSettings(null).voice.engine).toBe('system')
        expect(parseTalosMobileSettings(JSON.stringify({ voice: { engine: 'quantum' } })).voice.engine).toBe('system')
        expect(parseTalosMobileSettings(JSON.stringify({ voice: { engine: 42 } })).voice.engine).toBe('system')
        expect(parseTalosMobileSettings(JSON.stringify({ voice: { engine: 'personal' } })).voice.engine).toBe('personal')
    })

    it('PVOICE-SETTINGS-03 a malformed profile id parses to null, a real UUID survives', () => {
        expect(parseTalosMobileSettings(JSON.stringify({
            voice: { personal_profile_id: 'DROP TABLE profiles' },
        })).voice.personal_profile_id).toBeNull()
        expect(parseTalosMobileSettings(JSON.stringify({
            voice: { personal_profile_id: 42 },
        })).voice.personal_profile_id).toBeNull()
        const uuid = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
        expect(parseTalosMobileSettings(JSON.stringify({
            voice: { personal_profile_id: uuid },
        })).voice.personal_profile_id).toBe(uuid)
    })

    it('PVOICE-SETTINGS-04 personal rate/pitch are clamped, system rate/pitch are untouched by the same write', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({
            voice: { rate: 1.2, pitch: 1, personal_rate: 9, personal_pitch: -3 },
        })).voice
        expect(parsed.rate).toBe(1.2)
        expect(parsed.pitch).toBe(1)
        expect(parsed.personal_rate).toBe(2) // clamp ceiling, same 0.5..2 range `rate` already uses
        expect(parsed.personal_pitch).toBe(0) // clamp floor, same 0..2 range `pitch` already uses
    })
})
describe('useSettingsStore', () => {

    it('PIANO — la porta nasce CHIUSA, e un valore inventato non la apre', async () => {
        const store = useSettingsStore()
        // Owner 2026-08-07: «porte che l'utente sceglie consapevolmente di
        // aprire». Una porta che si trova aperta non e' una scelta.
        expect(store.state.shell?.plan_scope).toBe('turn')

        await store.setShell({ plan_scope: 'qualunque-cosa' as never })
        expect(store.state.shell?.plan_scope).toBe('turn')

        await store.setShell({ plan_scope: 'conversation' })
        expect(store.state.shell?.plan_scope).toBe('conversation')
    })
    it('TOOL-AUTH-04 persists and rehydrates an exact per-tool grant', async () => {
        const store = useSettingsStore()

        await store.grantToolAuthorization('document_create', ['write'])
        expect(store.state.tool_authorizations).toMatchObject({
            schema_version: 1,
            revision: 1,
            grants: {
                document_create: {
                    tool: 'document_create',
                    actions: ['write'],
                    scope: 'device',
                },
            },
        })
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).tool_authorizations)
            .toEqual(store.state.tool_authorizations)

        __resetSettingsStoreForTests()
        const reloaded = useSettingsStore()
        await reloaded.hydrate()
        expect(reloaded.state.tool_authorizations).toEqual(store.state.tool_authorizations)
    })

    it('TOOL-AUTH-04 publishes grants only after persistence and recovers after rejection', async () => {
        const set = vi.spyOn(Preferences, 'set')
            .mockRejectedValueOnce(new Error('native Preferences write failed'))
        const store = useSettingsStore()

        try {
            await expect(store.grantToolAuthorization('document_create', ['write']))
                .rejects.toThrow('native Preferences write failed')
            expect(store.state.tool_authorizations.grants.document_create).toBeUndefined()
            expect(store.state.tool_authorizations.revision).toBe(0)

            await store.grantToolAuthorization('document_create', ['write'])
            expect(store.state.tool_authorizations.grants.document_create).toBeDefined()
            expect(store.state.tool_authorizations.revision).toBe(1)
        } finally {
            set.mockRestore()
        }
    })

    it('TOOL-AUTH-04 serializes overlapping exact-tool grants without a lost update', async () => {
        let releaseFirst!: () => void
        let callCount = 0
        const set = vi.spyOn(Preferences, 'set').mockImplementation(async ({ key, value }) => {
            callCount += 1
            if (callCount === 1) {
                await new Promise<void>((resolve) => { releaseFirst = resolve })
            }
            prefs.set(key, value)
        })
        const store = useSettingsStore()

        try {
            const first = store.grantToolAuthorization('document_create', ['write'])
            const second = store.grantToolAuthorization('generate_image', ['write', 'outbound'])
            await Promise.resolve()
            expect(set).toHaveBeenCalledTimes(1)

            releaseFirst()
            await Promise.all([first, second])

            expect(store.state.tool_authorizations.revision).toBe(2)
            expect(Object.keys(store.state.tool_authorizations.grants).sort())
                .toEqual(['document_create', 'generate_image'])
            const persisted = JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!)
            expect(Object.keys(persisted.tool_authorizations.grants).sort())
                .toEqual(['document_create', 'generate_image'])
        } finally {
            set.mockRestore()
        }
    })

    it('TOOL-AUTH-20 revokes a saved grant and persists ask-again state', async () => {
        const store = useSettingsStore()
        await store.grantToolAuthorization('document_create', ['write'])

        await store.revokeToolAuthorization('document_create')

        expect(store.state.tool_authorizations.revision).toBe(2)
        expect(store.state.tool_authorizations.grants.document_create).toBeUndefined()
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!)
            .tool_authorizations.grants.document_create).toBeUndefined()
    })

    it('P1-CTX-POLICY-03 does not rewrite a legacy broad preference during hydration', async () => {
        prefs.set(TALOS_MOBILE_SETTINGS_KEY, JSON.stringify({
            library_defaults_v1: true,
            shell: { library_context_enabled: true },
        }))
        const set = vi.spyOn(Preferences, 'set')
        const store = useSettingsStore()

        try {
            await store.hydrate()

            expect(store.state.shell.library_context_enabled).toBe(true)
            expect(store.state.shell.library_context_policy).toBeNull()
            expect(set).not.toHaveBeenCalled()
        } finally {
            set.mockRestore()
        }
    })

    it('P1-CTX-POLICY-02 leaves reactive and persisted policy intact after a failed write', async () => {
        const set = vi.spyOn(Preferences, 'set')
            .mockRejectedValueOnce(new Error('native Preferences write failed'))
        const store = useSettingsStore()

        try {
            await expect(store.setLibraryContextPolicy({
                enabled: true,
                mode: 'smart_relevant_v1',
            }, 0)).rejects.toThrow('native Preferences write failed')

            expect(store.state.shell.library_context_policy).toBeNull()
            expect(store.state.shell.library_context_enabled).toBe(false)
            expect(prefs.has(TALOS_MOBILE_SETTINGS_KEY)).toBe(false)

            const committed = await store.setLibraryContextPolicy({
                enabled: true,
                mode: 'smart_relevant_v1',
            }, 0)

            expect(committed).toMatchObject({
                revision: 1,
                enabled: true,
                mode: 'smart_relevant_v1',
            })
            expect(store.state.shell.library_context_policy).toEqual(committed)
            expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).shell)
                .toMatchObject({
                    library_context_enabled: true,
                    library_context_policy: committed,
                })
        } finally {
            set.mockRestore()
        }
    })

    it('P1-CTX-POLICY-02 serializes revision-checked policy writes without losing updates', async () => {
        let releaseFirst!: () => void
        let callCount = 0
        const set = vi.spyOn(Preferences, 'set').mockImplementation(async ({ key, value }) => {
            callCount += 1
            if (callCount === 1) {
                await new Promise<void>((resolve) => { releaseFirst = resolve })
            }
            prefs.set(key, value)
        })
        const store = useSettingsStore()

        try {
            const first = store.setLibraryContextPolicy({ enabled: true }, 0)
            const second = store.setLibraryContextPolicy({ mode: 'ask_before_use_v1' }, 1)
            await Promise.resolve()

            expect(set).toHaveBeenCalledTimes(1)
            expect(store.state.shell.library_context_policy).toBeNull()

            releaseFirst()
            const [, committed] = await Promise.all([first, second])

            expect(set).toHaveBeenCalledTimes(2)
            expect(committed).toMatchObject({
                revision: 2,
                enabled: true,
                mode: 'ask_before_use_v1',
            })
            expect(store.state.shell.library_context_policy).toEqual(committed)
            expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).shell
                .library_context_policy).toEqual(committed)
        } finally {
            set.mockRestore()
        }
    })

    it('AGENT-TOOLS-03 hydrates and persists one known switch while dropping unknown tools', async () => {
        prefs.set(TALOS_MOBILE_SETTINGS_KEY, JSON.stringify({
            agent_tools: {
                library_search: false,
                future_shell: true,
            },
        }))
        const store = useSettingsStore()

        await store.hydrate()

        expect(store.state.agent_tools.library_search).toBe(false)
        expect(store.state.agent_tools).not.toHaveProperty('future_shell')
        expect(store.state.agent_tools.library_context_policy_update).toBe(false)
        // ⛔ Contro il CATALOGO, non contro un numero: un conteggio scritto a
        // mano fissa l'implementazione invece dell'invariante, e cade ogni
        // volta che si aggiunge un tool anche quando niente e' rotto. Cio' che
        // deve valere e' che lo store rispecchi il catalogo, uno a uno.
        expect(Object.keys(store.state.agent_tools)).toHaveLength(TALOS_AGENT_TOOL_CONTROLS.length)

        await store.setAgentToolEnabled('library_search', true)

        expect(store.state.agent_tools.library_search).toBe(true)
        const persisted = JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!)
        expect(persisted.agent_tools.library_search).toBe(true)
        expect(persisted.agent_tools).not.toHaveProperty('future_shell')
    })

    it('AGENT-TOOLS-PERSIST-01 aborts reactive state when Preferences rejects and allows a later retry', async () => {
        const set = vi.spyOn(Preferences, 'set')
            .mockRejectedValueOnce(new Error('native Preferences write failed'))
        const store = useSettingsStore()

        try {
            await expect(store.setAgentToolEnabled('library_search', false))
                .rejects.toThrow('native Preferences write failed')
            expect(store.state.agent_tools.library_search).toBe(true)
            expect(prefs.has(TALOS_MOBILE_SETTINGS_KEY)).toBe(false)

            await store.setAgentToolEnabled('library_search', false)

            expect(store.state.agent_tools.library_search).toBe(false)
            expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).agent_tools.library_search)
                .toBe(false)
        } finally {
            set.mockRestore()
        }
    })

    it('AGENT-TOOLS-PERSIST-02 serializes overlapping switches without losing an update', async () => {
        let releaseFirst!: () => void
        let callCount = 0
        const set = vi.spyOn(Preferences, 'set').mockImplementation(async ({ key, value }) => {
            callCount += 1
            if (callCount === 1) {
                await new Promise<void>((resolve) => { releaseFirst = resolve })
            }
            prefs.set(key, value)
        })
        const store = useSettingsStore()

        try {
            const first = store.setAgentToolEnabled('library_search', false)
            const second = store.setAgentToolEnabled('web_search', false)
            await Promise.resolve()
            const callsBeforeFirstSettlement = set.mock.calls.length

            releaseFirst()
            await Promise.all([first, second])

            expect(callsBeforeFirstSettlement).toBe(1)
            expect(set).toHaveBeenCalledTimes(2)
            expect(store.state.agent_tools.library_search).toBe(false)
            expect(store.state.agent_tools.web_search).toBe(false)
            const persisted = JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!)
            expect(persisted.agent_tools.library_search).toBe(false)
            expect(persisted.agent_tools.web_search).toBe(false)
        } finally {
            set.mockRestore()
        }
    })

    it('hydrates from Preferences', async () => {
        prefs.set(TALOS_MOBILE_SETTINGS_KEY, JSON.stringify({ defaults_v3: true, chat_layout: { bubble_scale: 'expanded' } }))
        const store = useSettingsStore()
        await store.hydrate()
        expect(store.state.chat_layout.bubble_scale).toBe('expanded')
    })

    it('sanitizes and persists composer defaults', async () => {
        const store = useSettingsStore()

        await store.setComposerDefaults({
            model_profile_id: 'anthropic:claude-live',
            effort: 'low',
            thinking: true,
        })

        expect(store.state.composer_defaults).toEqual({
            model_profile_id: 'anthropic:claude-live',
            effort: 'low',
            thinking: true,
        })
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).composer_defaults)
            .toEqual(store.state.composer_defaults)
    })

    it('hydrates and persists the versioned Model Lab subtree as one validated value', async () => {
        const modelLab = {
            schema_version: 1 as const,
            manual_models: [{
                id: 'manual-openai-local',
                provider: 'openai' as const,
                model: 'local-model',
                display_name: 'Local model',
                input_modalities: ['text'],
                output_modalities: ['text'],
                supported_parameters: ['reasoning_effort'],
            }],
            model_overrides: {},
            provider_runtime: { openai: { timeout_seconds: 45 } },
            probe_results: {},
        }
        prefs.set(TALOS_MOBILE_SETTINGS_KEY, JSON.stringify({ model_lab: modelLab }))
        const store = useSettingsStore()

        await store.hydrate()
        expect(store.state.model_lab).toEqual(modelLab)

        const updated = {
            ...modelLab,
            model_overrides: { 'openai:local-model': { display_name: 'Local primary', show_in_composer: false } },
        }
        await store.setModelLabPreferences(updated)

        expect(store.state.model_lab).toEqual(updated)
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).model_lab).toEqual(updated)
    })

    it('persists Browser policy as one validated value', async () => {
        const store = useSettingsStore()
        await store.setBrowserPreferences({
            hmi_mode: 'confirm_every_interaction',
            presentation: 'system_browser',
            suggest_for_urls: false,
        })

        expect(store.state.browser).toEqual({
            ...TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
            hmi_mode: 'confirm_every_interaction',
            presentation: 'system_browser',
            suggest_for_urls: false,
        })
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).browser).toEqual(store.state.browser)
    })

    it('persists and rehydrates an explicit dictation language', async () => {
        const store = useSettingsStore()
        await store.setVoicePreferences({ dictation_language: 'it-IT' })
        __resetSettingsStoreForTests()
        const fresh = useSettingsStore()

        await fresh.hydrate()

        expect(fresh.state.voice.dictation_language).toBe('it-IT')
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).voice.dictation_language).toBe('it-IT')
    })

    it('sanitizes and persists Motion V6 preferences through the canonical parser', async () => {
        const store = useSettingsStore()
        await store.setMotionPreferences({
            mode: 'complex',
            speed: 125,
            interface: { duration_scale: 75 },
        })

        expect(store.state.motion_v6.mode).toBe('complex')
        expect(store.state.motion_v6.speed).toBe(125)
        expect(store.state.motion_v6.interface.duration_scale).toBe(75)
        expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).motion_v6.mode).toBe('complex')
    })

    /**
     * I-08. `setAgentToolEnabled` already got this right — candidate, queue,
     * persist, publish. Its neighbours did not: `setToolPermissions`,
     * `setShell` and `setSecurity` mutated the live state and persisted
     * afterwards, so a rejected native write left a permission switched on in
     * a registry the executor reads, and gone again on the next launch.
     *
     * A capability that is live but not durable is the worst of both: it
     * authorises the action now and denies ever having done so later.
     */
    it('P1-CAP-PERSIST-01 a rejected write never publishes a tool permission', async () => {
        const set = vi.spyOn(Preferences, 'set')
            .mockRejectedValueOnce(new Error('native Preferences write failed'))
        const store = useSettingsStore()
        const before = store.state.tools.write

        try {
            await expect(store.setToolPermissions({ write: 'allow' }))
                .rejects.toThrow('native Preferences write failed')
            // The executor reads this. It must not see a grant that did not survive.
            expect(store.state.tools.write).toBe(before)
            expect(prefs.has(TALOS_MOBILE_SETTINGS_KEY)).toBe(false)

            await store.setToolPermissions({ write: 'allow' })

            expect(store.state.tools.write).toBe('allow')
            expect(JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!).tools.write).toBe('allow')
        } finally {
            set.mockRestore()
        }
    })

    it('P1-CAP-PERSIST-02 a rejected write never publishes the Library master switch', async () => {
        const set = vi.spyOn(Preferences, 'set')
            .mockRejectedValueOnce(new Error('native Preferences write failed'))
        const store = useSettingsStore()
        const before = store.state.shell.library_context_enabled

        try {
            await expect(store.setShell({ library_context_enabled: !before }))
                .rejects.toThrow('native Preferences write failed')
            expect(store.state.shell.library_context_enabled).toBe(before)
            expect(prefs.has(TALOS_MOBILE_SETTINGS_KEY)).toBe(false)
        } finally {
            set.mockRestore()
        }
    })

    it('P1-CAP-PERSIST-03 a rejected write never publishes an app-lock change', async () => {
        const set = vi.spyOn(Preferences, 'set')
            .mockRejectedValueOnce(new Error('native Preferences write failed'))
        const store = useSettingsStore()
        const before = store.state.security.app_lock_enabled

        try {
            await expect(store.setSecurity({ app_lock_enabled: !before }))
                .rejects.toThrow('native Preferences write failed')
            expect(store.state.security.app_lock_enabled).toBe(before)
        } finally {
            set.mockRestore()
        }
    })

    /**
     * Beyond the ticket. `persist()` serialises the WHOLE state, and the
     * capability domains each had their own queue. Two domains writing at once
     * therefore each snapshot the other's *unpublished* value — whichever
     * write lands last silently reverts the other. Separate queues do not
     * order writes that share a single stored document.
     */
    it('P1-CAP-PERSIST-04 concurrent writes across settings domains cannot lose an update', async () => {
        let releaseFirst!: () => void
        let callCount = 0
        const set = vi.spyOn(Preferences, 'set').mockImplementation(async ({ key, value }) => {
            callCount += 1
            if (callCount === 1) await new Promise<void>((resolve) => { releaseFirst = resolve })
            prefs.set(key, value)
        })
        const store = useSettingsStore()

        try {
            const first = store.setToolPermissions({ write: 'allow' })
            const second = store.setAgentToolEnabled('library_search', false)
            await Promise.resolve()

            releaseFirst()
            await Promise.all([first, second])

            const persisted = JSON.parse(prefs.get(TALOS_MOBILE_SETTINGS_KEY)!)
            // Both survive, whatever order the native writes settled in.
            expect(persisted.tools.write).toBe('allow')
            expect(persisted.agent_tools.library_search).toBe(false)
            expect(store.state.tools.write).toBe('allow')
            expect(store.state.agent_tools.library_search).toBe(false)
        } finally {
            set.mockRestore()
        }
    })

})
