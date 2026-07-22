import {
    parseTalosMotionV6Preferences,
    type TalosMotionValidationIssue,
    type TalosMotionV6Preferences,
} from './contracts'
import { createDefaultTalosMotionV6Preferences } from './defaults'

const LEGACY_MOTION_VALUES = ['system', 'off', 'subtle', 'normal', 'cinematic'] as const
const LEGACY_UI_PROFILES = ['preset', 'minimal', 'expressive', 'custom', 'off'] as const
const LEGACY_UI_EASINGS = ['precise', 'soft', 'elastic-light', 'linear', 'cinematic'] as const
const LEGACY_MOTION_KEYS = [
    'theme_motion',
    'theme_motion_disabled',
    'theme_simple_animation',
    'theme_background_disabled',
] as const
const ROOT_KEYS = [
    'theme_motion_v6',
    ...LEGACY_MOTION_KEYS,
    'ui_animation_profile',
    'ui_animation_customization',
] as const
const CUSTOMIZATION_KEYS = ['duration_scale', 'intensity', 'easing', 'stagger'] as const
const MAX_INSPECTION_NODES = 256
const MAX_INSPECTION_DEPTH = 16
const MAX_CONTAINER_KEYS = 64

type LegacyRecord = Record<string, unknown>
export type TalosThemeMotionV6MigrationSource = 'v6' | 'legacy' | 'default'

export type TalosThemeMotionV6MigrationSuccess = {
    success: true
    value: TalosMotionV6Preferences
    source: TalosThemeMotionV6MigrationSource
    shouldPersist: false
}

export type TalosThemeMotionV6MigrationFailure = {
    success: false
    issues: TalosMotionValidationIssue[]
}

export type TalosThemeMotionV6MigrationResult =
    | TalosThemeMotionV6MigrationSuccess
    | TalosThemeMotionV6MigrationFailure

type Inspection = {
    record: LegacyRecord | null
    issue?: TalosMotionValidationIssue
}

function issue(
    path: string,
    code: TalosMotionValidationIssue['code'],
    message: string,
): TalosMotionValidationIssue {
    return { path, code, message }
}

function inspectKnownRecord(value: unknown, path: string, keys: readonly string[]): Inspection {
    if (typeof value !== 'object' || value === null) {
        return {
            record: null,
            issue: issue(path, 'invalid_type', `Expected a complete non-array object at "${path}".`),
        }
    }

    try {
        if (Array.isArray(value)) {
            return {
                record: null,
                issue: issue(path, 'invalid_type', `Expected a complete non-array object at "${path}".`),
            }
        }

        const prototype = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
            return {
                record: null,
                issue: issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`),
            }
        }

        const record: LegacyRecord = Object.create(null) as LegacyRecord
        for (const key of keys) {
            const keyPath = `${path === '$' ? '' : `${path}.`}${key}`
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor) continue
            if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                return {
                    record: null,
                    issue: issue(keyPath, 'invalid_property', `Property at "${keyPath}" must be an enumerable own data property.`),
                }
            }
            record[key] = descriptor.value
        }
        return { record }
    } catch {
        return {
            record: null,
            issue: issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`),
        }
    }
}

function inspectCustomization(value: unknown, path: string): Inspection {
    try {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return { record: null }
    } catch {
        return { record: null, issue: issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`) }
    }
    return inspectBoundedRecord(value, path, CUSTOMIZATION_KEYS)
}

function inspectBoundedRecord(value: object, path: string, keys: readonly string[]): Inspection {
    try {
        const prototype = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
            return { record: null, issue: issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`) }
        }
        const record: LegacyRecord = Object.create(null) as LegacyRecord
        for (const key of keys) {
            const keyPath = `${path}.${String(key)}`
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor) continue
            if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                return { record: null, issue: issue(path, 'invalid_property', `Property at "${keyPath}" must be an enumerable own data property.`) }
            }
            record[key] = descriptor.value
        }
        return { record }
    } catch {
        return { record: null, issue: issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`) }
    }
}

function inspectTree(
    value: unknown,
    path: string,
    state: { nodes: number; active: Set<object> },
    depth = 0,
): TalosMotionValidationIssue | undefined {
    state.nodes += 1
    if (state.nodes > MAX_INSPECTION_NODES || depth > MAX_INSPECTION_DEPTH) {
        return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
    }
    if (typeof value !== 'object' || value === null) return undefined

    try {
        if (Array.isArray(value)) {
            const ownKeys = Reflect.ownKeys(value)
            const elementKeys = ownKeys.filter((key) => key !== 'length')
            if (elementKeys.length > MAX_CONTAINER_KEYS) {
                return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
            }
            const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length')
            const length = lengthDescriptor?.value
            if (!lengthDescriptor || typeof length !== 'number' || !Number.isInteger(length) || length < 0 || length > MAX_CONTAINER_KEYS) {
                return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
            }
            for (let index = 0; index < length; index++) {
                const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
                if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                    return issue(`${path}.${index}`, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
                }
            }
            return undefined
        }
        const prototype = Object.getPrototypeOf(value)
        if (prototype !== Object.prototype && prototype !== null) {
            return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
        }
        if (state.active.has(value)) {
            return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
        }
        const ownKeys = Reflect.ownKeys(value)
        if (ownKeys.length > MAX_CONTAINER_KEYS) {
            return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
        }
        state.active.add(value)
        for (const key of ownKeys) {
            const keyPath = `${path === '$' ? '' : `${path}.`}${String(key)}`
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor) {
                return issue(keyPath, 'uninspectable_object', `Property at "${keyPath}" could not be inspected safely.`)
            }
            if (typeof key === 'symbol' || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
                return issue(keyPath, typeof key === 'symbol' ? 'unknown_key' : 'invalid_property', `Property at "${keyPath}" must be an enumerable own data property.`)
            }
            const nestedIssue = inspectTree(descriptor.value, keyPath, state, depth + 1)
            if (nestedIssue) return nestedIssue
        }
        state.active.delete(value)
    } catch {
        return issue(path, 'uninspectable_object', `Object at "${path}" could not be inspected safely.`)
    }
    return undefined
}

function hasOwn(record: LegacyRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key)
}

function isLegacyMotion(value: unknown): value is typeof LEGACY_MOTION_VALUES[number] {
    return typeof value === 'string' && (LEGACY_MOTION_VALUES as readonly string[]).includes(value)
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max
}

function isLegacyProfile(value: unknown): value is typeof LEGACY_UI_PROFILES[number] {
    return typeof value === 'string' && (LEGACY_UI_PROFILES as readonly string[]).includes(value)
}

function migrateLegacy(record: LegacyRecord): TalosThemeMotionV6MigrationResult {
    const value = createDefaultTalosMotionV6Preferences()
    let hasLegacy = false
    let hasRendererLegacy = false
    let motion: typeof LEGACY_MOTION_VALUES[number] | undefined

    if (hasOwn(record, 'theme_motion')) {
        hasLegacy = true
    }
    if (hasOwn(record, 'theme_motion') && isLegacyMotion(record.theme_motion)) {
        hasRendererLegacy = true
        motion = record.theme_motion
        const profile = {
            system: [100, 65],
            off: [100, 65],
            subtle: [75, 40],
            normal: [100, 65],
            cinematic: [140, 85],
        }[motion]
        value.speed = profile[0]
        value.intensity = profile[1]
    }

    for (const key of LEGACY_MOTION_KEYS.slice(1)) {
        if (hasOwn(record, key)) hasLegacy = true
        if (hasOwn(record, key) && typeof record[key] === 'boolean') {
            hasLegacy = true
            hasRendererLegacy = true
        }
    }

    const customizationInspection = hasOwn(record, 'ui_animation_customization')
        ? inspectCustomization(record.ui_animation_customization, 'ui_animation_customization')
        : { record: null }
    if (customizationInspection.issue) return { success: false, issues: [customizationInspection.issue] }
    const customization = customizationInspection.record
    const profile = hasOwn(record, 'ui_animation_profile') && isLegacyProfile(record.ui_animation_profile)
        ? record.ui_animation_profile
        : undefined
    if (hasOwn(record, 'ui_animation_profile') || hasOwn(record, 'ui_animation_customization')) hasLegacy = true
    if (profile !== undefined) {
        hasLegacy = true
        value.interface.profile = profile
        value.interface_enabled = profile !== 'off'
    }
    if (customization) {
        const { duration_scale, intensity, easing, stagger } = customization
        let migrated = false
        if (isIntegerInRange(duration_scale, 50, 150)) {
            value.interface.duration_scale = duration_scale
            migrated = true
        }
        if (isIntegerInRange(intensity, 0, 100)) {
            value.interface.intensity = intensity
            migrated = true
        }
        if (typeof easing === 'string' && (LEGACY_UI_EASINGS as readonly string[]).includes(easing)) {
            value.interface.easing = easing as typeof value.interface.easing
            migrated = true
        }
        if (isIntegerInRange(stagger, 0, 120)) {
            value.interface.stagger = stagger
            migrated = true
        }
        if (migrated || Object.keys(customization).length > 0) {
            hasLegacy = true
        }
    }

    if (hasLegacy) {
        value.mode = 'adaptive'
    }

    if (record.theme_background_disabled === true) {
        value.mode = 'off'
        value.background_enabled = false
    } else if (motion === 'off' || record.theme_motion_disabled === true) {
        value.mode = 'static'
    } else if (record.theme_simple_animation === false) {
        value.mode = 'complex'
    } else if (hasRendererLegacy) {
        value.mode = 'simple'
    }

    return { success: true, value: deepFreeze(value), source: hasLegacy ? 'legacy' : 'default', shouldPersist: false }
}

export function resolveTalosThemeMotionV6Migration(input: unknown): TalosThemeMotionV6MigrationResult {
    const root = inspectKnownRecord(input, '$', ROOT_KEYS)
    if (!root.record) return { success: false, issues: [root.issue!] }

    if (hasOwn(root.record, 'theme_motion_v6')) {
        const boundaryIssue = inspectTree(root.record.theme_motion_v6, 'theme_motion_v6', { nodes: 0, active: new Set() })
        if (boundaryIssue) return { success: false, issues: [boundaryIssue] }

        const parsed = parseTalosMotionV6Preferences(root.record.theme_motion_v6)
        if (!parsed.success) {
            return {
                success: false,
                issues: parsed.issues.map((currentIssue) => ({
                    ...currentIssue,
                    path: currentIssue.path === '$' ? 'theme_motion_v6' : `theme_motion_v6.${currentIssue.path}`,
                })),
            }
        }
        return {
            success: true,
            value: deepFreeze(parsed.value),
            source: 'v6',
            shouldPersist: false,
        }
    }

    return migrateLegacy(root.record)
}

export function createTalosThemeMotionV6FirstSaveDelta(input: unknown): { theme_motion_v6: TalosMotionV6Preferences } {
    const boundaryIssue = inspectTree(input, 'theme_motion_v6', { nodes: 0, active: new Set() })
    if (boundaryIssue) {
        throw new TypeError('Cannot create a V6 save delta from an unsafe motion payload.')
    }
    const parsed = parseTalosMotionV6Preferences(input)
    if (!parsed.success) {
        throw new TypeError('Cannot create a V6 save delta from an invalid motion payload.')
    }
    return deepFreeze({ theme_motion_v6: deepFreeze(parsed.value) })
}

export const createTalosThemeMotionV6SaveDelta = createTalosThemeMotionV6FirstSaveDelta

function deepFreeze<T>(value: T): T {
    if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
    for (const key of Reflect.ownKeys(value)) {
        deepFreeze((value as Record<PropertyKey, unknown>)[key])
    }
    return Object.freeze(value)
}
