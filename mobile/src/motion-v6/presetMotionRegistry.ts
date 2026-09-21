import {
    TALOS_MOTION_DPR_CAPS,
    TALOS_MOTION_FPS_CAPS,
    TALOS_MOTION_QUALITY_LEVELS,
    TALOS_MOTION_RENDERER_MODES,
    TALOS_MOTION_SCENE_IDS,
    type TalosMotionDprCap,
    type TalosMotionFpsCap,
    type TalosMotionQuality,
    type TalosMotionRendererMode,
    type TalosMotionSceneId,
} from './contracts'
import {
    TALOS_THEME_IDENTITIES_V6,
    deepFreezeTalosCanonical,
    exportTalosThemeIdentity,
    importTalosThemeIdentity,
    type TalosThemeIdentity,
} from './themeIdentity'
import {
    TALOS_THEME_IDS,
    TALOS_THEME_PRESETS,
    isTalosThemeId,
    type TalosThemeId,
    type TalosThemePreset,
} from '../lib/talosThemes'

export const TALOS_DESKTOP_MOTION_PROFILE_SCHEMA_VERSION = 1 as const

export type TalosDesktopMotionProfileV6 = {
    schema_version: typeof TALOS_DESKTOP_MOTION_PROFILE_SCHEMA_VERSION
    identity_id: TalosThemeId
    simple_scene_id: TalosMotionSceneId
    complex_scene_id: TalosMotionSceneId
    timing: {
        simple_duration_ms: number
        complex_duration_ms: number
        interface_duration_scale: number
    }
    default_mode: TalosMotionRendererMode
    default_quality: TalosMotionQuality
    fps_cap: TalosMotionFpsCap
    dpr_cap: TalosMotionDprCap
    desktop_policy: {
        enabled: true
        allow_complex_scene: boolean
        respect_reduced_motion: true
        pause_when_hidden: boolean
        respect_data_saver: boolean
    }
}

export type TalosDesktopThemePresetV6 = {
    id: TalosThemeId
    label: string
    shortLabel: string
    description: string
    mood: string
    motion: string
    isLight: boolean
    fontUi: string
    fontMono: string
    defaultDensity: TalosThemePreset['defaultDensity']
    defaultRadius: TalosThemePreset['defaultRadius']
    defaultMotion: TalosThemePreset['defaultMotion']
    preview: TalosThemePreset['preview']
    density: TalosThemePreset['defaultDensity']
    radius: TalosThemePreset['defaultRadius']
    poster: string
    defaultEffect: TalosThemePreset['defaultEffect']
    effect_mapping: {
        default: TalosThemePreset['defaultEffect']
        legacy_effect: TalosThemePreset['defaultEffect']
        simple_scene_id: TalosMotionSceneId
        complex_scene_id: TalosMotionSceneId
    }
    identity: TalosThemeIdentity
    motion_profile: TalosDesktopMotionProfileV6
}

type ProfileRecord = Record<string, unknown>

const PROFILE_KEYS = [
    'schema_version',
    'identity_id',
    'simple_scene_id',
    'complex_scene_id',
    'timing',
    'default_mode',
    'default_quality',
    'fps_cap',
    'dpr_cap',
    'desktop_policy',
] as const
const TIMING_KEYS = ['simple_duration_ms', 'complex_duration_ms', 'interface_duration_scale'] as const
const POLICY_KEYS = [
    'enabled',
    'allow_complex_scene',
    'respect_reduced_motion',
    'pause_when_hidden',
    'respect_data_saver',
] as const
const MAX_SCENE_DURATION_MS = 120_000

const PROFILE_RENDERING_DEFAULTS: Record<
    TalosThemeId,
    Pick<TalosDesktopMotionProfileV6, 'default_mode' | 'default_quality' | 'fps_cap' | 'dpr_cap'>
> = {
    forge: { default_mode: 'adaptive', default_quality: 'balanced', fps_cap: 30, dpr_cap: 1.25 },
    paper: { default_mode: 'simple', default_quality: 'low', fps_cap: 24, dpr_cap: 1 },
    terminal: { default_mode: 'complex', default_quality: 'high', fps_cap: 45, dpr_cap: 1.25 },
    aurora: { default_mode: 'adaptive', default_quality: 'high', fps_cap: 30, dpr_cap: 1.5 },
    glacier: { default_mode: 'simple', default_quality: 'balanced', fps_cap: 24, dpr_cap: 1.25 },
    ember: { default_mode: 'complex', default_quality: 'high', fps_cap: 45, dpr_cap: 1.5 },
    atlas: { default_mode: 'adaptive', default_quality: 'balanced', fps_cap: 30, dpr_cap: 1.25 },
    noir: { default_mode: 'simple', default_quality: 'balanced', fps_cap: 30, dpr_cap: 1 },
    signal: { default_mode: 'complex', default_quality: 'high', fps_cap: 45, dpr_cap: 1.5 },
    violet: { default_mode: 'adaptive', default_quality: 'high', fps_cap: 30, dpr_cap: 1.5 },
    claudius: { default_mode: 'simple', default_quality: 'low', fps_cap: 24, dpr_cap: 1 },
    basicus: { default_mode: 'adaptive', default_quality: 'balanced', fps_cap: 30, dpr_cap: 1.25 },
    telemetry: { default_mode: 'adaptive', default_quality: 'balanced', fps_cap: 30, dpr_cap: 1.25 },
    // F1-T2 calm refactor: quiet profile — background off by default, subtle micro-motion only.
    calm: { default_mode: 'simple', default_quality: 'low', fps_cap: 24, dpr_cap: 1 },
}

function strictProfileRecord(value: unknown, expectedKeys: readonly string[]): ProfileRecord | null {
    if (typeof value !== 'object' || value === null) return null
    try {
        if (Array.isArray(value)) return null
        const prototype = Reflect.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) return null
    } catch {
        return null
    }

    let ownKeys: PropertyKey[]
    try {
        ownKeys = Reflect.ownKeys(value)
    } catch {
        return null
    }
    const expected = new Set(expectedKeys)
    if (ownKeys.length !== expectedKeys.length) return null
    if (ownKeys.some((key) => typeof key === 'symbol' || !expected.has(key as string))) return null

    const result: ProfileRecord = Object.create(null)
    for (const key of expectedKeys) {
        let descriptor: PropertyDescriptor | undefined
        try {
            descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        } catch {
            return null
        }
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null
        result[key] = descriptor.value
    }
    return result
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number'
        && Number.isFinite(value)
        && Number.isInteger(value)
        && value >= min
        && value <= max
}

function parseDesktopMotionProfile(value: unknown): TalosDesktopMotionProfileV6 | null {
    const record = strictProfileRecord(value, PROFILE_KEYS)
    if (!record || record.schema_version !== TALOS_DESKTOP_MOTION_PROFILE_SCHEMA_VERSION) return null
    if (!isTalosThemeId(record.identity_id)) return null
    const identityId = record.identity_id
    if (record.simple_scene_id !== identityId || record.complex_scene_id !== identityId) return null
    if (!TALOS_MOTION_SCENE_IDS.includes(identityId)) return null
    if (!TALOS_MOTION_RENDERER_MODES.includes(record.default_mode as TalosMotionRendererMode)) return null
    if (!TALOS_MOTION_QUALITY_LEVELS.includes(record.default_quality as TalosMotionQuality)) return null
    if (!TALOS_MOTION_FPS_CAPS.includes(record.fps_cap as TalosMotionFpsCap)) return null
    if (!TALOS_MOTION_DPR_CAPS.includes(record.dpr_cap as TalosMotionDprCap)) return null

    const timing = strictProfileRecord(record.timing, TIMING_KEYS)
    if (!timing
        || !boundedInteger(timing.simple_duration_ms, 1, MAX_SCENE_DURATION_MS)
        || !boundedInteger(timing.complex_duration_ms, 1, MAX_SCENE_DURATION_MS)
        || !boundedInteger(timing.interface_duration_scale, 50, 150)) return null

    const policy = strictProfileRecord(record.desktop_policy, POLICY_KEYS)
    if (!policy
        || policy.enabled !== true
        || policy.respect_reduced_motion !== true
        || typeof policy.allow_complex_scene !== 'boolean'
        || typeof policy.pause_when_hidden !== 'boolean'
        || typeof policy.respect_data_saver !== 'boolean') return null

    return {
        schema_version: TALOS_DESKTOP_MOTION_PROFILE_SCHEMA_VERSION,
        identity_id: identityId,
        simple_scene_id: identityId,
        complex_scene_id: identityId,
        timing: {
            simple_duration_ms: timing.simple_duration_ms,
            complex_duration_ms: timing.complex_duration_ms,
            interface_duration_scale: timing.interface_duration_scale,
        },
        default_mode: record.default_mode as TalosMotionRendererMode,
        default_quality: record.default_quality as TalosMotionQuality,
        fps_cap: record.fps_cap as TalosMotionFpsCap,
        dpr_cap: record.dpr_cap as TalosMotionDprCap,
        desktop_policy: {
            enabled: true,
            allow_complex_scene: policy.allow_complex_scene,
            respect_reduced_motion: true,
            pause_when_hidden: policy.pause_when_hidden,
            respect_data_saver: policy.respect_data_saver,
        },
    }
}

function profileFromPreset(preset: (typeof TALOS_THEME_PRESETS)[number]): TalosDesktopMotionProfileV6 {
    const defaults = PROFILE_RENDERING_DEFAULTS[preset.id]
    const cinematic = preset.defaultMotion === 'cinematic'
    const subtle = preset.defaultMotion === 'subtle'

    return {
        schema_version: TALOS_DESKTOP_MOTION_PROFILE_SCHEMA_VERSION,
        identity_id: preset.id,
        simple_scene_id: preset.id,
        complex_scene_id: preset.id,
        timing: {
            simple_duration_ms: subtle ? 12000 : cinematic ? 5800 : 7400,
            complex_duration_ms: subtle ? 20000 : cinematic ? 8000 : 12000,
            interface_duration_scale: subtle ? 80 : cinematic ? 110 : 100,
        },
        default_mode: defaults.default_mode,
        default_quality: defaults.default_quality,
        fps_cap: defaults.fps_cap,
        dpr_cap: defaults.dpr_cap,
        desktop_policy: {
            enabled: true,
            allow_complex_scene: true,
            respect_reduced_motion: true,
            pause_when_hidden: true,
            respect_data_saver: true,
        },
    }
}

function cloneProfile(profile: TalosDesktopMotionProfileV6): TalosDesktopMotionProfileV6 {
    return {
        schema_version: profile.schema_version,
        identity_id: profile.identity_id,
        simple_scene_id: profile.simple_scene_id,
        complex_scene_id: profile.complex_scene_id,
        timing: { ...profile.timing },
        default_mode: profile.default_mode,
        default_quality: profile.default_quality,
        fps_cap: profile.fps_cap,
        dpr_cap: profile.dpr_cap,
        desktop_policy: { ...profile.desktop_policy },
    }
}

export const TALOS_DESKTOP_MOTION_PROFILES_V6 = deepFreezeTalosCanonical(
    TALOS_THEME_PRESETS.map(profileFromPreset),
)

export function composeTalosDesktopThemePresetV6(
    identity: TalosThemeIdentity,
    motionProfile: TalosDesktopMotionProfileV6,
): TalosDesktopThemePresetV6 {
    const canonicalIdentity = importTalosThemeIdentity(exportTalosThemeIdentity(identity))
    const canonicalProfile = parseDesktopMotionProfile(motionProfile)
    if (!canonicalIdentity || !canonicalProfile || canonicalProfile.identity_id !== canonicalIdentity.id) {
        throw new TypeError('Theme identity and desktop motion profile must be canonical and reference the same preset.')
    }
    const current = TALOS_THEME_PRESETS.find((preset) => preset.id === canonicalIdentity.id)
    if (!current) throw new TypeError('Theme identity references an unknown preset.')

    return {
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
        preview: { ...current.preview },
        density: current.defaultDensity,
        radius: current.defaultRadius,
        poster: current.poster,
        defaultEffect: current.defaultEffect,
        effect_mapping: {
            default: current.defaultEffect,
            legacy_effect: current.defaultEffect,
            simple_scene_id: canonicalProfile.simple_scene_id,
            complex_scene_id: canonicalProfile.complex_scene_id,
        },
        identity: canonicalIdentity,
        motion_profile: cloneProfile(canonicalProfile),
    }
}

export const TALOS_DESKTOP_THEME_PRESETS_V6 = deepFreezeTalosCanonical(
    TALOS_THEME_PRESETS.map((preset) => composeTalosDesktopThemePresetV6(
        TALOS_THEME_IDENTITIES_V6.find((identity) => identity.id === preset.id)!,
        TALOS_DESKTOP_MOTION_PROFILES_V6.find((profile) => profile.identity_id === preset.id)!,
    )),
)

export function getTalosDesktopMotionProfileV6(value: unknown): TalosDesktopMotionProfileV6 | null {
    if (!isTalosThemeId(value)) return null
    const profile = TALOS_DESKTOP_MOTION_PROFILES_V6.find((candidate) => candidate.identity_id === value)
    return profile ? cloneProfile(profile) : null
}

export function getTalosDesktopThemePresetV6(value: unknown): TalosDesktopThemePresetV6 | null {
    if (!isTalosThemeId(value)) return null
    const preset = TALOS_DESKTOP_THEME_PRESETS_V6.find((candidate) => candidate.id === value)
    return preset ? composeTalosDesktopThemePresetV6(preset.identity, preset.motion_profile) : null
}

export const TALOS_DESKTOP_THEME_IDS_V6 = deepFreezeTalosCanonical([...TALOS_THEME_IDS])
export const TALOS_DESKTOP_SCENE_IDS_V6 = deepFreezeTalosCanonical([...TALOS_MOTION_SCENE_IDS])
export const TALOS_DESKTOP_QUALITY_LEVELS_V6 = deepFreezeTalosCanonical([...TALOS_MOTION_QUALITY_LEVELS])
export const TALOS_DESKTOP_RENDERER_MODES_V6 = deepFreezeTalosCanonical([...TALOS_MOTION_RENDERER_MODES])
export const TALOS_DESKTOP_FPS_CAPS_V6 = deepFreezeTalosCanonical([...TALOS_MOTION_FPS_CAPS])
export const TALOS_DESKTOP_DPR_CAPS_V6 = deepFreezeTalosCanonical([...TALOS_MOTION_DPR_CAPS])
