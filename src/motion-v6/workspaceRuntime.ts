import type { TalosThemeId } from '../lib/talosThemes'
import type { TalosMotionValidationIssue, TalosMotionV6Preferences } from './contracts'
import { createDefaultTalosMotionV6Preferences } from './defaults'
import { resolveTalosThemeMotionV6Migration } from './migration'
import {
    resolveTalosMotionRuntimePolicy,
    type TalosMotionRuntimeDecision,
    type TalosMotionRuntimeEnvironment,
} from './runtimePolicy'
import type { SceneInput, SceneId } from './sceneRegistry'
import { getTalosThemeIdentityV6 } from './themeIdentity'

export type TalosWorkspaceMotionV6Result = Readonly<{
    success: boolean
    source: 'v6' | 'legacy' | 'default' | 'invalid'
    preferences: TalosMotionV6Preferences
    decision: TalosMotionRuntimeDecision
    sceneId: SceneId
    sceneInput: SceneInput
    issues: readonly TalosMotionValidationIssue[]
}>

export type TalosWorkspaceMotionV6Request = Readonly<{
    settingsPreferences: unknown
    themeId: TalosThemeId
    colorMode: 'light' | 'dark'
    environment: TalosMotionRuntimeEnvironment
    degradationStage?: number
}>

function deterministicSeed(value: string): number {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

function failClosedPreferences(): TalosMotionV6Preferences {
    const preferences = createDefaultTalosMotionV6Preferences()
    preferences.mode = 'static'
    preferences.interface_enabled = false
    preferences.interface.profile = 'off'
    return preferences
}

export function resolveTalosWorkspaceMotionV6(request: TalosWorkspaceMotionV6Request): TalosWorkspaceMotionV6Result {
    const migration = resolveTalosThemeMotionV6Migration(request.settingsPreferences)
    const success = migration.success
    const preferences = success ? migration.value : failClosedPreferences()
    const source = success ? migration.source : 'invalid'
    const issues = success ? [] : migration.issues
    const identity = getTalosThemeIdentityV6(request.themeId) ?? getTalosThemeIdentityV6('forge')!
    const sceneId = preferences.scene_override ?? request.themeId
    const decision = resolveTalosMotionRuntimePolicy(preferences, request.environment, request.degradationStage)
    const sceneInput: SceneInput = Object.freeze({
        colorMode: request.colorMode,
        palette: Object.freeze({
            light: Object.freeze({ ...identity.semantic_palette.light }),
            dark: Object.freeze({ ...identity.semantic_palette.dark }),
        }),
        viewport: Object.freeze({ width: 1, height: 1, pixelRatio: 1 }),
        seed: deterministicSeed(`${request.themeId}:${sceneId}`),
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: Object.freeze({
            speed: preferences.speed,
            intensity: preferences.intensity,
            density: preferences.density,
            depth: preferences.depth,
            trails: preferences.trails,
            contrast: preferences.contrast,
            parallax: preferences.parallax,
        }),
        effectiveQuality: Object.freeze({
            tier: decision.qualityTier,
            fpsCap: decision.fpsCap,
            dprCap: decision.dprCap,
            densityScale: decision.densityScale,
        }),
    })
    return Object.freeze({
        success,
        source,
        preferences,
        decision,
        sceneId,
        sceneInput,
        issues: Object.freeze([...issues]),
    })
}
