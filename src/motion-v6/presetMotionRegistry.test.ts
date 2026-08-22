import { describe, expect, it } from 'vitest'
import {
    TALOS_DESKTOP_MOTION_PROFILES_V6,
    TALOS_DESKTOP_THEME_PRESETS_V6,
    composeTalosDesktopThemePresetV6,
    getTalosDesktopMotionProfileV6,
    getTalosDesktopThemePresetV6,
    type TalosDesktopMotionProfileV6,
} from './presetMotionRegistry'
import { exportTalosThemeIdentity, getTalosThemeIdentityV6 } from './themeIdentity'
import { TALOS_THEME_PRESETS } from '../lib/talosThemes'

const EXPECTED_THEME_IDS = [
    'forge',
    'paper',
    'terminal',
    'aurora',
    'glacier',
    'ember',
    'atlas',
    'noir',
    'signal',
    'violet',
    'claudius',
    'basicus',
    'telemetry',
    // F1 calm refactor (mobile design-lead): 14th preset, see backport ledger.
    'calm',
] as const

type MutableProfile = Record<string, any>

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
    if (typeof value !== 'object' || value === null || seen.has(value)) return
    seen.add(value)
    expect(Object.isFrozen(value)).toBe(true)
    for (const child of Object.values(value)) expectDeepFrozen(child, seen)
}

function profilePayload(id: typeof EXPECTED_THEME_IDS[number] = 'forge'): TalosDesktopMotionProfileV6 {
    const profile = getTalosDesktopMotionProfileV6(id)
    if (!profile) throw new Error(`Missing profile ${id}.`)
    return profile
}

describe('TALOS desktop motion profile V6 registry', () => {
    it('uses exact unique Simple and Complex renderer namespaces for all thirteen IDs', () => {
        expect(EXPECTED_THEME_IDS).toHaveLength(14)
        expect(new Set(EXPECTED_THEME_IDS)).toHaveLength(14)
        expect(TALOS_DESKTOP_MOTION_PROFILES_V6).toHaveLength(14)

        const identityIds = TALOS_DESKTOP_MOTION_PROFILES_V6.map((profile) => profile.identity_id)
        const simpleIds = TALOS_DESKTOP_MOTION_PROFILES_V6.map((profile) => profile.simple_scene_id)
        const complexIds = TALOS_DESKTOP_MOTION_PROFILES_V6.map((profile) => profile.complex_scene_id)

        expect(identityIds).toEqual(EXPECTED_THEME_IDS)
        expect(simpleIds).toEqual(EXPECTED_THEME_IDS)
        expect(complexIds).toEqual(EXPECTED_THEME_IDS)
        expect(new Set(simpleIds)).toHaveLength(14)
        expect(new Set(complexIds)).toHaveLength(14)

        for (const profile of TALOS_DESKTOP_MOTION_PROFILES_V6) {
            expect(profile.simple_scene_id).toBe(profile.identity_id)
            expect(profile.complex_scene_id).toBe(profile.identity_id)
        }
    })

    it('composes every current metadata field and explicit legacy effect mapping', () => {
        expect(TALOS_DESKTOP_THEME_PRESETS_V6.map((preset) => preset.id)).toEqual(EXPECTED_THEME_IDS)

        for (const current of TALOS_THEME_PRESETS) {
            const preset = getTalosDesktopThemePresetV6(current.id)
            expect(preset).toMatchObject({
                id: current.id,
                label: current.label,
                shortLabel: current.shortLabel,
                description: current.description,
                mood: current.mood,
                motion: current.motion,
                isLight: current.isLight,
                fontUi: current.fontUi,
                fontMono: current.fontMono,
                defaultDensity: current.defaultDensity,
                defaultRadius: current.defaultRadius,
                defaultMotion: current.defaultMotion,
                preview: current.preview,
                density: current.defaultDensity,
                radius: current.defaultRadius,
                poster: current.poster,
                defaultEffect: current.defaultEffect,
                effect_mapping: {
                    default: current.defaultEffect,
                    legacy_effect: current.defaultEffect,
                    simple_scene_id: current.id,
                    complex_scene_id: current.id,
                },
            })
            expect(preset?.identity.id).toBe(current.id)
            expect(preset?.motion_profile.identity_id).toBe(current.id)
        }
    })

    it('recomposes a valid desktop profile delta without changing identity bytes', () => {
        const identity = getTalosThemeIdentityV6('forge')
        if (!identity) throw new Error('Missing forge identity.')
        const before = JSON.stringify(exportTalosThemeIdentity(identity))
        const profileCopy = profilePayload() as MutableProfile

        profileCopy.default_mode = 'complex'
        profileCopy.default_quality = 'high'
        profileCopy.fps_cap = 45
        profileCopy.dpr_cap = 1.5
        profileCopy.timing.simple_duration_ms = 6100
        profileCopy.timing.complex_duration_ms = 9100
        profileCopy.timing.interface_duration_scale = 120
        profileCopy.desktop_policy.allow_complex_scene = false
        profileCopy.desktop_policy.pause_when_hidden = false
        profileCopy.desktop_policy.respect_data_saver = false

        const recomposed = composeTalosDesktopThemePresetV6(identity, profileCopy as TalosDesktopMotionProfileV6)
        expect(recomposed.motion_profile).toMatchObject(profileCopy)
        expect(JSON.stringify(exportTalosThemeIdentity(recomposed.identity))).toBe(before)
    })

    it('rejects malformed profile references, enums, ranges, timing, policy, and shape', () => {
        const identity = getTalosThemeIdentityV6('forge')
        if (!identity) throw new Error('Missing forge identity.')
        const mutations: Array<(profile: MutableProfile) => void> = [
            (profile) => { profile.schema_version = 2 },
            (profile) => { profile.identity_id = 'paper' },
            (profile) => { profile.simple_scene_id = 'paper' },
            (profile) => { profile.complex_scene_id = 'paper' },
            (profile) => { profile.default_mode = 'invalid' },
            (profile) => { profile.default_quality = 'invalid' },
            (profile) => { profile.fps_cap = 25 },
            (profile) => { profile.dpr_cap = 1.1 },
            (profile) => { profile.timing.simple_duration_ms = 0 },
            (profile) => { profile.timing.complex_duration_ms = Number.NaN },
            (profile) => { profile.timing.interface_duration_scale = 49 },
            (profile) => { profile.desktop_policy.enabled = false },
            (profile) => { profile.desktop_policy.allow_complex_scene = 'true' },
            (profile) => { profile.extra = true },
        ]

        for (const mutate of mutations) {
            const profile = profilePayload() as MutableProfile
            mutate(profile)
            expect(() => composeTalosDesktopThemePresetV6(identity, profile as TalosDesktopMotionProfileV6)).toThrow(TypeError)
        }
    })

    it('rejects profile custom prototypes and nested accessors without invoking them', () => {
        const identity = getTalosThemeIdentityV6('forge')
        if (!identity) throw new Error('Missing forge identity.')

        for (const path of [[], ['timing'], ['desktop_policy']] as const) {
            const profile = profilePayload() as MutableProfile
            const target = path.reduce((value, key) => value[key], profile)
            Object.setPrototypeOf(target, { inherited: true })
            expect(() => composeTalosDesktopThemePresetV6(identity, profile as TalosDesktopMotionProfileV6)).toThrow(TypeError)
        }

        const accessorProfile = profilePayload() as MutableProfile
        let reads = 0
        Object.defineProperty(accessorProfile.timing, 'simple_duration_ms', {
            configurable: true,
            enumerable: true,
            get() {
                reads += 1
                return 7400
            },
        })
        expect(() => composeTalosDesktopThemePresetV6(identity, accessorProfile as TalosDesktopMotionProfileV6)).toThrow(TypeError)
        expect(reads).toBe(0)
    })

    it('deep-freezes identities, profiles, and composed registry without contaminating getters', () => {
        expectDeepFrozen(TALOS_DESKTOP_MOTION_PROFILES_V6)
        expectDeepFrozen(TALOS_DESKTOP_THEME_PRESETS_V6)
        const beforeProfile = profilePayload()
        const beforeIdentity = exportTalosThemeIdentity(TALOS_DESKTOP_THEME_PRESETS_V6[0].identity)

        expect(() => {
            ;(TALOS_DESKTOP_MOTION_PROFILES_V6[0].timing as MutableProfile).simple_duration_ms = 1
        }).toThrow(TypeError)
        expect(() => {
            ;(TALOS_DESKTOP_THEME_PRESETS_V6[0].effect_mapping as MutableProfile).default = 'none'
        }).toThrow(TypeError)

        expect(getTalosDesktopMotionProfileV6('forge')).toEqual(beforeProfile)
        expect(exportTalosThemeIdentity(TALOS_DESKTOP_THEME_PRESETS_V6[0].identity)).toEqual(beforeIdentity)
    })

    it('returns independent values and fails closed for unknown IDs', () => {
        const first = getTalosDesktopMotionProfileV6('forge')
        const second = getTalosDesktopMotionProfileV6('forge')
        expect(first).not.toBe(second)
        expect(first?.timing).not.toBe(second?.timing)
        expect(first?.desktop_policy).not.toBe(second?.desktop_policy)
        expect(getTalosDesktopMotionProfileV6('unknown')).toBeNull()
        expect(getTalosDesktopThemePresetV6('unknown')).toBeNull()
    })
})
