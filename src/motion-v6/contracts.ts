export const TALOS_MOTION_RENDERER_MODES = Object.freeze([
    'off',
    'static',
    'simple',
    'complex',
    'adaptive',
] as const)

export const TALOS_MOTION_SCHEMA_VERSION = 1 as const

export const TALOS_MOTION_QUALITY_LEVELS = Object.freeze([
    'low',
    'balanced',
    'high',
    'adaptive',
] as const)

export const TALOS_MOTION_SCENE_IDS = Object.freeze([
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
    // F1 calm refactor (mobile design-lead): 14th theme scene; quiet visual
    // language shared with glacier until calm receives its own authored scene.
    'calm',
] as const)

export const TALOS_MOTION_FPS_CAPS = Object.freeze([20, 24, 30, 45, 60] as const)
export const TALOS_MOTION_DPR_CAPS = Object.freeze([1, 1.25, 1.5, 2] as const)

export const TALOS_INTERFACE_PROFILES = Object.freeze([
    'preset',
    'minimal',
    'expressive',
    'custom',
    'off',
] as const)

export const TALOS_INTERFACE_EASINGS = Object.freeze([
    'precise',
    'soft',
    'elastic-light',
    'linear',
    'cinematic',
] as const)

const motionRange = (min: number, max: number) => Object.freeze({ min, max })

export const TALOS_MOTION_RANGES = Object.freeze({
    speed: motionRange(25, 200),
    intensity: motionRange(0, 100),
    glow_intensity: motionRange(0, 100),
    density: motionRange(25, 150),
    depth: motionRange(0, 100),
    trails: motionRange(0, 100),
    contrast: motionRange(0, 100),
    parallax: motionRange(0, 100),
    interface_duration_scale: motionRange(50, 150),
    interface_intensity: motionRange(0, 100),
    interface_stagger: motionRange(0, 120),
})

export const TALOS_MOTION_MAX_ISSUES = 64 as const

const TOP_LEVEL_KEYS = [
    'schema_version',
    'mode',
    'background_enabled',
    'interface_enabled',
    'scene_override',
    'speed',
    'intensity',
    'glow_intensity',
    'density',
    'depth',
    'trails',
    'contrast',
    'parallax',
    'quality',
    'fps_cap',
    'dpr_cap',
    'pause_when_hidden',
    'respect_data_saver',
    'interface',
] as const

const INTERFACE_KEYS = [
    'profile',
    'duration_scale',
    'intensity',
    'easing',
    'stagger',
    'categories',
] as const

const CATEGORY_KEYS = [
    'windows',
    'surfaces',
    'navigation',
    'composer',
    'messages',
    'feedback',
] as const

export type TalosMotionRendererMode = typeof TALOS_MOTION_RENDERER_MODES[number]
export type TalosMotionQuality = typeof TALOS_MOTION_QUALITY_LEVELS[number]
export type TalosMotionSceneId = typeof TALOS_MOTION_SCENE_IDS[number]
export type TalosMotionFpsCap = typeof TALOS_MOTION_FPS_CAPS[number]
export type TalosMotionDprCap = typeof TALOS_MOTION_DPR_CAPS[number]
export type TalosInterfaceMotionProfile = typeof TALOS_INTERFACE_PROFILES[number]
export type TalosInterfaceMotionEasing = typeof TALOS_INTERFACE_EASINGS[number]

export type TalosInterfaceMotionCategories = {
    windows: boolean
    surfaces: boolean
    navigation: boolean
    composer: boolean
    messages: boolean
    feedback: boolean
}

export type TalosInterfaceMotionPreferences = {
    profile: TalosInterfaceMotionProfile
    duration_scale: number
    intensity: number
    easing: TalosInterfaceMotionEasing
    stagger: number
    categories: TalosInterfaceMotionCategories
}

export type TalosMotionInterfacePreferences = TalosInterfaceMotionPreferences

export type TalosMotionV6Preferences = {
    schema_version: 1
    mode: TalosMotionRendererMode
    background_enabled: boolean
    interface_enabled: boolean
    scene_override: TalosMotionSceneId | null
    speed: number
    intensity: number
    glow_intensity: number
    density: number
    depth: number
    trails: number
    contrast: number
    parallax: number
    quality: TalosMotionQuality
    fps_cap: TalosMotionFpsCap
    dpr_cap: TalosMotionDprCap
    pause_when_hidden: boolean
    respect_data_saver: boolean
    interface: TalosInterfaceMotionPreferences
}

export type TalosMotionValidationIssueCode =
    | 'invalid_type'
    | 'invalid_value'
    | 'invalid_property'
    | 'missing_key'
    | 'not_finite'
    | 'not_integer'
    | 'out_of_range'
    | 'uninspectable_object'
    | 'unknown_key'

export type TalosMotionValidationIssue = {
    path: string
    code: TalosMotionValidationIssueCode
    message: string
}

export type TalosMotionV6ValidationIssue = TalosMotionValidationIssue

export type TalosMotionParseSuccess = {
    success: true
    value: TalosMotionV6Preferences
}

export type TalosMotionParseFailure = {
    success: false
    issues: TalosMotionValidationIssue[]
}

export type TalosMotionParseResult = TalosMotionParseSuccess | TalosMotionParseFailure
export type TalosMotionV6ParseResult = TalosMotionParseResult

type MotionRecord = Record<string, unknown>
type StringAllowlist = readonly string[]
type NumberAllowlist = readonly number[]
type InterfaceSnapshot = {
    value: MotionRecord
    categories: MotionRecord
}

function hasOwn(record: MotionRecord, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key)
}

function addIssue(
    issues: TalosMotionValidationIssue[],
    path: string,
    code: TalosMotionValidationIssueCode,
    message: string,
) {
    if (issues.length >= TALOS_MOTION_MAX_ISSUES) return
    issues.push({ path, code, message })
}

function pathFor(parent: string, key: string): string {
    return parent === '$' ? key : `${parent}.${key}`
}

function uninspectableObject(
    issues: TalosMotionValidationIssue[],
    path: string,
) {
    addIssue(
        issues,
        path,
        'uninspectable_object',
        `Object at "${path}" could not be inspected safely. Provide a plain JSON object.`,
    )
}

function invalidProperty(
    issues: TalosMotionValidationIssue[],
    path: string,
) {
    addIssue(
        issues,
        path,
        'invalid_property',
        `Property at "${path}" must be an enumerable own data property. Provide plain JSON data without accessors.`,
    )
}

function snapshotStrictObject(
    value: unknown,
    expectedKeys: readonly string[],
    parentPath: string,
    expectedType: string,
    issues: TalosMotionValidationIssue[],
    optionalKeys: readonly string[] = [],
): MotionRecord | null {
    if (typeof value !== 'object' || value === null) {
        invalidType(issues, parentPath, expectedType)
        return null
    }

    try {
        if (Array.isArray(value)) {
            invalidType(issues, parentPath, expectedType)
            return null
        }
    } catch {
        uninspectableObject(issues, parentPath)
        return null
    }

    let ownKeys: PropertyKey[]
    try {
        ownKeys = Reflect.ownKeys(value)
    } catch {
        uninspectableObject(issues, parentPath)
        return null
    }

    const stringKeys = ownKeys.filter((key): key is string => typeof key === 'string')
    const ownStringKeys = new Set(stringKeys)
    const optional = new Set(optionalKeys)
    for (const key of expectedKeys) {
        if (!ownStringKeys.has(key) && !optional.has(key)) {
            const path = pathFor(parentPath, key)
            addIssue(issues, path, 'missing_key', `Missing required key "${path}".`)
        }
    }

    const expected = new Set(expectedKeys)
    const unknownKeys = stringKeys
        .filter((key) => !expected.has(key))
        .sort()

    for (const key of unknownKeys) {
        const path = pathFor(parentPath, key)
        addIssue(issues, path, 'unknown_key', `Unknown key "${path}". Remove it from the payload.`)
    }

    const unknownSymbols = ownKeys
        .filter((key): key is symbol => typeof key === 'symbol')
        .map(String)
        .sort()

    for (const key of unknownSymbols) {
        const path = pathFor(parentPath, key)
        addIssue(issues, path, 'unknown_key', `Unknown key "${path}". Remove it from the payload.`)
    }

    const snapshot = Object.create(null) as MotionRecord
    for (const key of expectedKeys) {
        if (!ownStringKeys.has(key)) continue

        let descriptor: PropertyDescriptor | undefined
        try {
            descriptor = Reflect.getOwnPropertyDescriptor(value, key)
        } catch {
            uninspectableObject(issues, pathFor(parentPath, key))
            return null
        }

        if (!descriptor) {
            uninspectableObject(issues, pathFor(parentPath, key))
            return null
        }
        if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
            invalidProperty(issues, pathFor(parentPath, key))
            continue
        }

        snapshot[key] = descriptor.value
    }

    return snapshot
}

function invalidType(
    issues: TalosMotionValidationIssue[],
    path: string,
    expected: string,
) {
    addIssue(issues, path, 'invalid_type', `Expected ${expected} at "${path}". Provide a value with that type.`)
}

function validateBoolean(value: unknown, path: string, issues: TalosMotionValidationIssue[]): value is boolean {
    if (typeof value !== 'boolean') {
        invalidType(issues, path, 'a boolean')
        return false
    }
    return true
}

function validateStringAllowlist<T extends StringAllowlist>(
    value: unknown,
    path: string,
    allowlist: T,
    issues: TalosMotionValidationIssue[],
): value is T[number] {
    if (typeof value !== 'string') {
        invalidType(issues, path, 'an allowlisted string')
        return false
    }
    if (!allowlist.includes(value)) {
        addIssue(issues, path, 'invalid_value', `Value at "${path}" is not allowed. Choose one of the documented values.`)
        return false
    }
    return true
}

function validateNumberRange(
    value: unknown,
    path: string,
    range: { min: number; max: number },
    issues: TalosMotionValidationIssue[],
): value is number {
    if (typeof value !== 'number') {
        invalidType(issues, path, 'an integer')
        return false
    }
    if (!Number.isFinite(value)) {
        addIssue(issues, path, 'not_finite', `Value at "${path}" must be a finite number.`)
        return false
    }
    if (!Number.isInteger(value)) {
        addIssue(issues, path, 'not_integer', `Value at "${path}" must be an integer.`)
        return false
    }
    if (value < range.min || value > range.max) {
        addIssue(
            issues,
            path,
            'out_of_range',
            `Value at "${path}" must be an integer from ${range.min} through ${range.max}.`,
        )
        return false
    }
    return true
}

function validateNumberAllowlist<T extends NumberAllowlist>(
    value: unknown,
    path: string,
    allowlist: T,
    issues: TalosMotionValidationIssue[],
): value is T[number] {
    if (typeof value !== 'number') {
        invalidType(issues, path, 'an allowlisted number')
        return false
    }
    if (!Number.isFinite(value)) {
        addIssue(issues, path, 'not_finite', `Value at "${path}" must be a finite number.`)
        return false
    }
    if (!allowlist.includes(value)) {
        addIssue(issues, path, 'invalid_value', `Value at "${path}" is not allowed. Choose one of the documented values.`)
        return false
    }
    return true
}

function validateSchemaVersion(value: unknown, issues: TalosMotionValidationIssue[]): value is 1 {
    if (typeof value !== 'number') {
        invalidType(issues, 'schema_version', 'the number 1')
        return false
    }
    if (!Number.isFinite(value)) {
        addIssue(issues, 'schema_version', 'not_finite', 'Value at "schema_version" must be a finite number.')
        return false
    }
    if (value !== TALOS_MOTION_SCHEMA_VERSION) {
        addIssue(issues, 'schema_version', 'invalid_value', 'schema_version must equal 1 for this contract.')
        return false
    }
    return true
}

function validateInterface(
    value: unknown,
    issues: TalosMotionValidationIssue[],
): InterfaceSnapshot | null {
    const interfaceSnapshot = snapshotStrictObject(value, INTERFACE_KEYS, 'interface', 'a strict object', issues)
    if (!interfaceSnapshot) return null

    if (hasOwn(interfaceSnapshot, 'profile')) {
        validateStringAllowlist(interfaceSnapshot.profile, 'interface.profile', TALOS_INTERFACE_PROFILES, issues)
    }
    if (hasOwn(interfaceSnapshot, 'duration_scale')) {
        validateNumberRange(interfaceSnapshot.duration_scale, 'interface.duration_scale', TALOS_MOTION_RANGES.interface_duration_scale, issues)
    }
    if (hasOwn(interfaceSnapshot, 'intensity')) {
        validateNumberRange(interfaceSnapshot.intensity, 'interface.intensity', TALOS_MOTION_RANGES.interface_intensity, issues)
    }
    if (hasOwn(interfaceSnapshot, 'easing')) {
        validateStringAllowlist(interfaceSnapshot.easing, 'interface.easing', TALOS_INTERFACE_EASINGS, issues)
    }
    if (hasOwn(interfaceSnapshot, 'stagger')) {
        validateNumberRange(interfaceSnapshot.stagger, 'interface.stagger', TALOS_MOTION_RANGES.interface_stagger, issues)
    }

    if (!hasOwn(interfaceSnapshot, 'categories')) return null
    const categoriesSnapshot = snapshotStrictObject(
        interfaceSnapshot.categories,
        CATEGORY_KEYS,
        'interface.categories',
        'a strict object',
        issues,
    )
    if (!categoriesSnapshot) return null

    for (const key of CATEGORY_KEYS) {
        if (hasOwn(categoriesSnapshot, key)) {
            validateBoolean(categoriesSnapshot[key], `interface.categories.${key}`, issues)
        }
    }
    return { value: interfaceSnapshot, categories: categoriesSnapshot }
}

export function parseTalosMotionV6Preferences(input: unknown): TalosMotionParseResult {
    const issues: TalosMotionValidationIssue[] = []
    const inputSnapshot = snapshotStrictObject(
        input,
        TOP_LEVEL_KEYS,
        '$',
        'a complete non-array object',
        issues,
        ['glow_intensity'],
    )
    if (!inputSnapshot) {
        return { success: false, issues }
    }

    if (hasOwn(inputSnapshot, 'schema_version')) {
        validateSchemaVersion(inputSnapshot.schema_version, issues)
    }
    if (hasOwn(inputSnapshot, 'mode')) {
        validateStringAllowlist(inputSnapshot.mode, 'mode', TALOS_MOTION_RENDERER_MODES, issues)
    }
    if (hasOwn(inputSnapshot, 'background_enabled')) {
        validateBoolean(inputSnapshot.background_enabled, 'background_enabled', issues)
    }
    if (hasOwn(inputSnapshot, 'interface_enabled')) {
        validateBoolean(inputSnapshot.interface_enabled, 'interface_enabled', issues)
    }
    if (hasOwn(inputSnapshot, 'scene_override')) {
        if (inputSnapshot.scene_override !== null) {
            validateStringAllowlist(inputSnapshot.scene_override, 'scene_override', TALOS_MOTION_SCENE_IDS, issues)
        }
    }
    if (hasOwn(inputSnapshot, 'speed')) {
        validateNumberRange(inputSnapshot.speed, 'speed', TALOS_MOTION_RANGES.speed, issues)
    }
    if (hasOwn(inputSnapshot, 'intensity')) {
        validateNumberRange(inputSnapshot.intensity, 'intensity', TALOS_MOTION_RANGES.intensity, issues)
    }
    if (hasOwn(inputSnapshot, 'glow_intensity')) {
        validateNumberRange(inputSnapshot.glow_intensity, 'glow_intensity', TALOS_MOTION_RANGES.glow_intensity, issues)
    }
    if (hasOwn(inputSnapshot, 'density')) {
        validateNumberRange(inputSnapshot.density, 'density', TALOS_MOTION_RANGES.density, issues)
    }
    if (hasOwn(inputSnapshot, 'depth')) {
        validateNumberRange(inputSnapshot.depth, 'depth', TALOS_MOTION_RANGES.depth, issues)
    }
    if (hasOwn(inputSnapshot, 'trails')) {
        validateNumberRange(inputSnapshot.trails, 'trails', TALOS_MOTION_RANGES.trails, issues)
    }
    if (hasOwn(inputSnapshot, 'contrast')) {
        validateNumberRange(inputSnapshot.contrast, 'contrast', TALOS_MOTION_RANGES.contrast, issues)
    }
    if (hasOwn(inputSnapshot, 'parallax')) {
        validateNumberRange(inputSnapshot.parallax, 'parallax', TALOS_MOTION_RANGES.parallax, issues)
    }
    if (hasOwn(inputSnapshot, 'quality')) {
        validateStringAllowlist(inputSnapshot.quality, 'quality', TALOS_MOTION_QUALITY_LEVELS, issues)
    }
    if (hasOwn(inputSnapshot, 'fps_cap')) {
        validateNumberAllowlist(inputSnapshot.fps_cap, 'fps_cap', TALOS_MOTION_FPS_CAPS, issues)
    }
    if (hasOwn(inputSnapshot, 'dpr_cap')) {
        validateNumberAllowlist(inputSnapshot.dpr_cap, 'dpr_cap', TALOS_MOTION_DPR_CAPS, issues)
    }
    if (hasOwn(inputSnapshot, 'pause_when_hidden')) {
        validateBoolean(inputSnapshot.pause_when_hidden, 'pause_when_hidden', issues)
    }
    if (hasOwn(inputSnapshot, 'respect_data_saver')) {
        validateBoolean(inputSnapshot.respect_data_saver, 'respect_data_saver', issues)
    }

    const interfaceSnapshot = hasOwn(inputSnapshot, 'interface')
        ? validateInterface(inputSnapshot.interface, issues)
        : null

    if (issues.length > 0 || !interfaceSnapshot) {
        return { success: false, issues }
    }

    const interfaceValues = interfaceSnapshot.value
    const categories = interfaceSnapshot.categories
    return {
        success: true,
        value: {
            schema_version: inputSnapshot.schema_version as 1,
            mode: inputSnapshot.mode as TalosMotionRendererMode,
            background_enabled: inputSnapshot.background_enabled as boolean,
            interface_enabled: inputSnapshot.interface_enabled as boolean,
            scene_override: inputSnapshot.scene_override as TalosMotionSceneId | null,
            speed: inputSnapshot.speed as number,
            intensity: inputSnapshot.intensity as number,
            glow_intensity: hasOwn(inputSnapshot, 'glow_intensity')
                ? inputSnapshot.glow_intensity as number
                : 0,
            density: inputSnapshot.density as number,
            depth: inputSnapshot.depth as number,
            trails: inputSnapshot.trails as number,
            contrast: inputSnapshot.contrast as number,
            parallax: inputSnapshot.parallax as number,
            quality: inputSnapshot.quality as TalosMotionQuality,
            fps_cap: inputSnapshot.fps_cap as TalosMotionFpsCap,
            dpr_cap: inputSnapshot.dpr_cap as TalosMotionDprCap,
            pause_when_hidden: inputSnapshot.pause_when_hidden as boolean,
            respect_data_saver: inputSnapshot.respect_data_saver as boolean,
            interface: {
                profile: interfaceValues.profile as TalosInterfaceMotionProfile,
                duration_scale: interfaceValues.duration_scale as number,
                intensity: interfaceValues.intensity as number,
                easing: interfaceValues.easing as TalosInterfaceMotionEasing,
                stagger: interfaceValues.stagger as number,
                categories: {
                    windows: categories.windows as boolean,
                    surfaces: categories.surfaces as boolean,
                    navigation: categories.navigation as boolean,
                    composer: categories.composer as boolean,
                    messages: categories.messages as boolean,
                    feedback: categories.feedback as boolean,
                },
            },
        },
    }
}
