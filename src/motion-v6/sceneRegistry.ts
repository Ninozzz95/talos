import {
    TALOS_MOTION_DPR_CAPS,
    TALOS_MOTION_FPS_CAPS,
    TALOS_MOTION_RANGES,
    TALOS_MOTION_SCENE_IDS,
    type TalosMotionSceneId,
} from './contracts'
import { ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS } from './clock'
import type { TalosMotionRuntimeQualityTier } from './runtimePolicy'
import { TALOS_MOTION_RUNTIME_QUALITY_TIERS } from './runtimePolicy'
import {
    TALOS_THEME_IDENTITY_PALETTE_ROLES,
    isTalosThemeIdentityCanonicalColor,
    type TalosThemeIdentityPalette,
} from './themeIdentity'

export const SCENE_REGISTRY_MAX_ASSETS = 16
export const SCENE_REGISTRY_MAX_PALETTE_KEYS = 32
export const SCENE_REGISTRY_MAX_STRING_LENGTH = 256
export const SCENE_REGISTRY_MAX_VIEWPORT_DIMENSION = 16_384
export const SCENE_REGISTRY_MAX_DELTA_MS = ABSOLUTE_MOTION_CLOCK_MAX_DELTA_MS
export const SCENE_REGISTRY_MAX_LOGICAL_TIME_MS = Number.MAX_SAFE_INTEGER

const ASSET_ID_PATTERN = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/
const LOCAL_ASSET_PATH_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/
const SCENE_KINDS = ['static', 'simple', 'complex'] as const
export const SCENE_REGISTRY_MAX_ENTRIES = TALOS_MOTION_SCENE_IDS.length * SCENE_KINDS.length
const REGISTRATION_KEYS = ['id', 'kind', 'factory', 'assets'] as const
const ASSET_KEYS = ['id', 'path', 'provenance'] as const
const INPUT_KEYS = [
    'colorMode',
    'palette',
    'viewport',
    'seed',
    'logicalTimeMs',
    'deltaMs',
    'parameters',
    'effectiveQuality',
] as const
const PALETTE_PAIR_KEYS = ['light', 'dark'] as const
const VIEWPORT_KEYS = ['width', 'height', 'pixelRatio'] as const
const PARAMETER_KEYS = [
    'speed',
    'intensity',
    'density',
    'depth',
    'trails',
    'contrast',
    'parallax',
] as const
const QUALITY_KEYS = ['tier', 'fpsCap', 'dprCap', 'densityScale'] as const
const MOUNT_KEYS = ['kind', 'target'] as const
const INSTANCE_KEYS = [
    'kind',
    'mount',
    'renderOrUpdate',
    'resize',
    'pause',
    'resume',
    'dispose',
] as const

export type SceneKind = typeof SCENE_KINDS[number]
export type SceneId = TalosMotionSceneId
export type SceneAsset = Readonly<{
    id: string
    path: string
    provenance: 'local'
}>

export type SceneResolvedPalette = Readonly<TalosThemeIdentityPalette>
export type ScenePalettePair = Readonly<{
    light: SceneResolvedPalette
    dark: SceneResolvedPalette
}>

export type SceneViewport = Readonly<{
    width: number
    height: number
    pixelRatio: number
}>

export type SceneMotionParameters = Readonly<{
    speed: number
    intensity: number
    density: number
    depth: number
    trails: number
    contrast: number
    parallax: number
}>

export type SceneEffectiveQuality = Readonly<{
    tier: TalosMotionRuntimeQualityTier
    fpsCap: number
    dprCap: number
    densityScale: number
}>

export type SceneInput = Readonly<{
    colorMode: 'light' | 'dark'
    palette: ScenePalettePair
    viewport: SceneViewport
    seed: number
    logicalTimeMs: number
    deltaMs: number
    parameters: SceneMotionParameters
    effectiveQuality: SceneEffectiveQuality
}>

export type SceneMountContext<K extends SceneKind = SceneKind> = Readonly<{
    kind: K
    target: unknown
}>

export type SceneInstance<K extends SceneKind = SceneKind> = Readonly<{
    kind: K
    mount: (context: SceneMountContext<K>) => void
    renderOrUpdate: (input: SceneInput) => void
    resize: (viewport: SceneViewport) => void
    pause: () => void
    resume: () => void
    dispose: () => void
}>

export type SceneFactory<K extends SceneKind = SceneKind> = (input: SceneInput) => SceneInstance<K>

export type StaticSceneRegistration = Readonly<{
    id: SceneId
    kind: 'static'
    factory: SceneFactory<'static'>
    assets: readonly SceneAsset[]
}>

export type SimpleSceneRegistration = Readonly<{
    id: SceneId
    kind: 'simple'
    factory: SceneFactory<'simple'>
    assets: readonly SceneAsset[]
}>

export type ComplexSceneRegistration = Readonly<{
    id: SceneId
    kind: 'complex'
    factory: SceneFactory<'complex'>
    assets: readonly SceneAsset[]
}>

export type SceneRegistration =
    | StaticSceneRegistration
    | SimpleSceneRegistration
    | ComplexSceneRegistration

export type SceneRegistryErrorCode =
    | 'invalid_registration'
    | 'invalid_scene_id'
    | 'duplicate_scene_id'
    | 'registry_limit_exceeded'
    | 'invalid_asset'
    | 'asset_limit_exceeded'
    | 'palette_limit_exceeded'
    | 'invalid_input'
    | 'factory_failed'
    | 'invalid_instance'
    | 'scene_not_mounted'
    | 'scene_disposed'
    | 'mount_failed'
    | 'render_failed'
    | 'resize_failed'
    | 'pause_failed'
    | 'resume_failed'
    | 'dispose_failed'

export class SceneRegistryError extends TypeError {
    readonly code: SceneRegistryErrorCode
    readonly cause: unknown
    readonly cleanupCause: unknown

    constructor(code: SceneRegistryErrorCode, message: string, cause?: unknown, cleanupCause?: unknown) {
        super(`[${code}] ${message}`)
        this.name = 'SceneRegistryError'
        this.code = code
        this.cause = cause
        this.cleanupCause = cleanupCause
        Object.setPrototypeOf(this, new.target.prototype)
    }
}

export type SceneRegistry = Readonly<{
    lookup: <K extends SceneKind>(
        id: string,
        kind: K,
    ) => Extract<SceneRegistration, { kind: K }> | null
    create: <K extends SceneKind>(
        id: string,
        kind: K,
        input: SceneInput,
    ) => SceneInstance<K> | null
    snapshot: () => readonly SceneRegistration[]
}>

export type SceneRegistryBuilder = Readonly<{
    register: (registration: SceneRegistration) => SceneRegistryBuilder
    build: () => SceneRegistry
}>

type DataRecord = Record<string, unknown>

function isPlainPrototype(value: object): boolean {
    try {
        const prototype = Reflect.getPrototypeOf(value)
        return prototype === Object.prototype || prototype === null
    } catch {
        return false
    }
}

function readDataRecord(
    value: unknown,
    expectedKeys: readonly string[],
    maxKeys: number,
): DataRecord | null {
    if (typeof value !== 'object' || value === null || !isPlainPrototype(value)) return null

    try {
        const ownKeys = Reflect.ownKeys(value)
        if (ownKeys.length > maxKeys || ownKeys.length !== expectedKeys.length) return null
        const expected = new Set(expectedKeys)
        if (ownKeys.some((key) => typeof key !== 'string' || !expected.has(key))) return null

        const record: DataRecord = Object.create(null)
        for (const key of expectedKeys) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, key)
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null
            record[key] = descriptor.value
        }
        return record
    } catch {
        return null
    }
}

function readDenseArray(value: unknown, maximumLength: number): unknown[] | null {
    try {
        if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return null
        const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length')
        if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, 'value')) return null
        const length = lengthDescriptor.value
        if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > maximumLength) return null

        const ownKeys = Reflect.ownKeys(value)
        if (ownKeys.length !== length + 1) return null
        const result: unknown[] = []
        for (let index = 0; index < length; index += 1) {
            const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index))
            if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null
            result.push(descriptor.value)
        }
        return result
    } catch {
        return null
    }
}

function boundedString(value: unknown): value is string {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= SCENE_REGISTRY_MAX_STRING_LENGTH
        && !/[\u0000-\u001f\u007f]/.test(value)
}

function validSceneId(value: unknown): value is SceneId {
    return typeof value === 'string' && (TALOS_MOTION_SCENE_IDS as readonly string[]).includes(value)
}

function validSceneKind(value: unknown): value is SceneKind {
    return typeof value === 'string' && (SCENE_KINDS as readonly string[]).includes(value)
}

function invalid(code: SceneRegistryErrorCode, message: string, cause?: unknown): never {
    throw new SceneRegistryError(code, message, cause)
}

function normalizeAssetPath(value: unknown): string {
    if (!boundedString(value) || !LOCAL_ASSET_PATH_PATTERN.test(value)) {
        invalid('invalid_asset', 'Asset path must be a normalized local static path.')
    }
    if (value.includes('//') || value.includes('\\')) {
        invalid('invalid_asset', 'Asset path must not contain duplicate separators or backslashes.')
    }
    const segments = value.slice(1).split('/')
    if (segments.length > 64 || segments.some((segment) => segment === '.' || segment === '..')) {
        invalid('invalid_asset', 'Asset path must not contain traversal segments.')
    }
    return value
}

function normalizeAssets(value: unknown): readonly SceneAsset[] {
    const values = readDenseArray(value, SCENE_REGISTRY_MAX_ASSETS + 1)
    if (!values) invalid('invalid_asset', 'Assets must be a bounded dense array of local descriptors.')
    if (values.length > SCENE_REGISTRY_MAX_ASSETS) {
        invalid('asset_limit_exceeded', 'A scene may declare at most the bounded asset limit.')
    }

    const normalized: SceneAsset[] = []
    const ids = new Set<string>()
    for (const value of values) {
        const record = readDataRecord(value, ASSET_KEYS, ASSET_KEYS.length)
        if (!record
            || !boundedString(record.id)
            || !ASSET_ID_PATTERN.test(record.id)
            || record.provenance !== 'local') {
            invalid('invalid_asset', 'Each asset must be a local descriptor with a strict ID.')
        }
        if (ids.has(record.id)) invalid('invalid_asset', `Asset ID "${record.id}" is duplicated.`)
        ids.add(record.id)
        normalized.push(Object.freeze({
            id: record.id,
            path: normalizeAssetPath(record.path),
            provenance: 'local' as const,
        }))
    }
    return Object.freeze(normalized)
}

function normalizePalette(value: unknown): SceneResolvedPalette {
    if (typeof value !== 'object' || value === null) invalid('invalid_input', 'Palette must be a strict resolved palette object.')
    let ownKeys: PropertyKey[]
    try {
        ownKeys = Reflect.ownKeys(value)
    } catch (cause) {
        invalid('invalid_input', 'Palette could not be inspected safely.', cause)
    }
    if (ownKeys.length > SCENE_REGISTRY_MAX_PALETTE_KEYS) {
        invalid('palette_limit_exceeded', 'Palette contains more keys than the bounded limit.')
    }
    const record = readDataRecord(value, TALOS_THEME_IDENTITY_PALETTE_ROLES, SCENE_REGISTRY_MAX_PALETTE_KEYS)
    if (!record) invalid('invalid_input', 'Palette must contain exactly the resolved semantic roles as data properties.')

    const normalized = {} as TalosThemeIdentityPalette
    for (const key of TALOS_THEME_IDENTITY_PALETTE_ROLES) {
        if (!isTalosThemeIdentityCanonicalColor(record[key])) {
            invalid('invalid_input', `Palette role "${key}" must be a lowercase canonical #rrggbb color.`)
        }
        normalized[key] = record[key] as string
    }
    return Object.freeze(normalized)
}

function finiteInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= min
        && value <= max
}

function integerInRange(value: unknown, min: number, max: number): value is number {
    return finiteInRange(value, min, max) && Number.isInteger(value)
}

function normalizeViewport(value: unknown): SceneViewport {
    const record = readDataRecord(value, VIEWPORT_KEYS, VIEWPORT_KEYS.length)
    if (!record
        || !integerInRange(record.width, 1, SCENE_REGISTRY_MAX_VIEWPORT_DIMENSION)
        || !integerInRange(record.height, 1, SCENE_REGISTRY_MAX_VIEWPORT_DIMENSION)
        || !finiteInRange(record.pixelRatio, 0.25, 2)) {
        invalid('invalid_input', 'Viewport must contain bounded width, height, and explicit pixelRatio values.')
    }
    return Object.freeze({
        width: record.width as number,
        height: record.height as number,
        pixelRatio: record.pixelRatio as number,
    })
}

function normalizeParameters(value: unknown): SceneMotionParameters {
    const record = readDataRecord(value, PARAMETER_KEYS, PARAMETER_KEYS.length)
    if (!record) invalid('invalid_input', 'Scene parameters must be a strict V6 data object.')

    for (const key of PARAMETER_KEYS) {
        const range = TALOS_MOTION_RANGES[key]
        if (!integerInRange(record[key], range.min, range.max)) {
            invalid('invalid_input', `Scene parameter "${key}" is outside its V6 bounds.`)
        }
    }
    return Object.freeze({
        speed: record.speed as number,
        intensity: record.intensity as number,
        density: record.density as number,
        depth: record.depth as number,
        trails: record.trails as number,
        contrast: record.contrast as number,
        parallax: record.parallax as number,
    })
}

function normalizeQuality(value: unknown): SceneEffectiveQuality {
    const record = readDataRecord(value, QUALITY_KEYS, QUALITY_KEYS.length)
    if (!record
        || !(TALOS_MOTION_RUNTIME_QUALITY_TIERS as readonly string[]).includes(record.tier as string)
        || !TALOS_MOTION_FPS_CAPS.includes(record.fpsCap as (typeof TALOS_MOTION_FPS_CAPS)[number])
        || !TALOS_MOTION_DPR_CAPS.includes(record.dprCap as (typeof TALOS_MOTION_DPR_CAPS)[number])
        || !finiteInRange(record.densityScale, 0, 2)) {
        invalid('invalid_input', 'Effective quality must use bounded V6 quality caps and density.')
    }
    return Object.freeze({
        tier: record.tier as TalosMotionRuntimeQualityTier,
        fpsCap: record.fpsCap as number,
        dprCap: record.dprCap as number,
        densityScale: record.densityScale as number,
    })
}

function normalizeInput(value: unknown): SceneInput {
    const record = readDataRecord(value, INPUT_KEYS, INPUT_KEYS.length)
    if (!record) invalid('invalid_input', 'Scene input must be a strict immutable data object.')
    const palette = readDataRecord(record.palette, PALETTE_PAIR_KEYS, PALETTE_PAIR_KEYS.length)
    if (!palette) invalid('invalid_input', 'Scene input must provide light and dark resolved palettes.')
    if (record.colorMode !== 'light' && record.colorMode !== 'dark') {
        invalid('invalid_input', 'Scene input must provide an explicit light or dark color mode.')
    }
    if (!integerInRange(record.seed, 0, 0xffff_ffff)
        || !finiteInRange(record.logicalTimeMs, 0, SCENE_REGISTRY_MAX_LOGICAL_TIME_MS)
        || !finiteInRange(record.deltaMs, 0, SCENE_REGISTRY_MAX_DELTA_MS)) {
        invalid('invalid_input', 'Seed and logical time values must be finite and bounded.')
    }

    return Object.freeze({
        colorMode: record.colorMode,
        palette: Object.freeze({
            light: normalizePalette(palette.light),
            dark: normalizePalette(palette.dark),
        }),
        viewport: normalizeViewport(record.viewport),
        seed: record.seed as number,
        logicalTimeMs: record.logicalTimeMs as number,
        deltaMs: record.deltaMs as number,
        parameters: normalizeParameters(record.parameters),
        effectiveQuality: normalizeQuality(record.effectiveQuality),
    })
}

function normalizeRegistration(value: unknown): SceneRegistration {
    const record = readDataRecord(value, REGISTRATION_KEYS, REGISTRATION_KEYS.length)
    if (!record) {
        invalid('invalid_registration', 'Scene registration must contain strict data properties.')
    }
    if (!validSceneId(record.id)) {
        invalid('invalid_scene_id', 'Scene ID must be one of the canonical V6 scene IDs.')
    }
    if (!validSceneKind(record.kind) || typeof record.factory !== 'function') {
        invalid('invalid_registration', 'Scene registration must contain a strict kind, factory, and assets array.')
    }
    return Object.freeze({
        id: record.id,
        kind: record.kind,
        factory: record.factory,
        assets: normalizeAssets(record.assets),
    }) as SceneRegistration
}

function normalizeMountContext<K extends SceneKind>(value: unknown, kind: K): SceneMountContext<K> {
    const record = readDataRecord(value, MOUNT_KEYS, MOUNT_KEYS.length)
    if (!record || record.kind !== kind) invalid('invalid_input', `Mount context kind must be "${kind}".`)
    return Object.freeze({ kind, target: record.target })
}

function normalizeInstance<K extends SceneKind>(value: unknown, kind: K): SceneInstance<K> {
    const record = readDataRecord(value, INSTANCE_KEYS, INSTANCE_KEYS.length)
    if (!record || record.kind !== kind
        || typeof record.mount !== 'function'
        || typeof record.renderOrUpdate !== 'function'
        || typeof record.resize !== 'function'
        || typeof record.pause !== 'function'
        || typeof record.resume !== 'function'
        || typeof record.dispose !== 'function') {
        invalid('invalid_instance', `Factory must return a complete ${kind} scene lifecycle instance.`)
    }
    return record as SceneInstance<K>
}

function lifecycleError(
    code: SceneRegistryErrorCode,
    kind: SceneKind,
    cause?: unknown,
    cleanupCause?: unknown,
): SceneRegistryError {
    return new SceneRegistryError(code, `The ${kind} scene lifecycle operation failed.`, cause, cleanupCause)
}

function wrapInstance<K extends SceneKind>(value: unknown, kind: K): SceneInstance<K> {
    const raw = normalizeInstance(value, kind) as MutableInstance<K>
    let mounted = false
    let paused = false
    let disposed = false

    const requireActive = (): void => {
        if (disposed) invalid('scene_disposed', 'Scene instance has already been disposed.')
        if (!mounted) invalid('scene_not_mounted', 'Scene instance must be mounted before use.')
    }

    const dispose = (): void => {
        if (disposed) return
        disposed = true
        try {
            raw.dispose.call(value)
        } catch (cause) {
            throw lifecycleError('dispose_failed', kind, cause)
        }
    }

    return Object.freeze({
        kind,
        mount: (context: SceneMountContext): void => {
            if (disposed) invalid('scene_disposed', 'Scene instance has already been disposed.')
            if (mounted) invalid('invalid_input', 'Scene instance cannot be mounted more than once.')
            const normalized = normalizeMountContext(context, kind)
            try {
                raw.mount.call(value, normalized)
                mounted = true
            } catch (cause) {
                disposed = true
                let cleanupCause: unknown
                try {
                    raw.dispose.call(value)
                } catch (cleanupError) {
                    cleanupCause = cleanupError
                }
                throw lifecycleError('mount_failed', kind, cause, cleanupCause)
            }
        },
        renderOrUpdate: (nextInput: SceneInput): void => {
            requireActive()
            const normalizedInput = normalizeInput(nextInput)
            try {
                raw.renderOrUpdate.call(value, normalizedInput)
            } catch (cause) {
                throw lifecycleError('render_failed', kind, cause)
            }
        },
        resize: (viewport: SceneViewport): void => {
            requireActive()
            const normalizedViewport = normalizeViewport(viewport)
            try {
                raw.resize.call(value, normalizedViewport)
            } catch (cause) {
                throw lifecycleError('resize_failed', kind, cause)
            }
        },
        pause: (): void => {
            requireActive()
            if (paused) return
            try {
                raw.pause.call(value)
                paused = true
            } catch (cause) {
                throw lifecycleError('pause_failed', kind, cause)
            }
        },
        resume: (): void => {
            requireActive()
            if (!paused) return
            try {
                raw.resume.call(value)
                paused = false
            } catch (cause) {
                throw lifecycleError('resume_failed', kind, cause)
            }
        },
        dispose,
    }) as SceneInstance<K>
}

type MutableInstance<K extends SceneKind> = {
    mount: SceneInstance<K>['mount']
    renderOrUpdate: SceneInstance<K>['renderOrUpdate']
    resize: SceneInstance<K>['resize']
    pause: SceneInstance<K>['pause']
    resume: SceneInstance<K>['resume']
    dispose: SceneInstance<K>['dispose']
}

function buildRegistry(entries: readonly SceneRegistration[]): SceneRegistry {
    const byKey = new Map<string, SceneRegistration>()
    for (const entry of entries) byKey.set(`${entry.kind}:${entry.id}`, entry)
    const snapshot = Object.freeze(entries.slice())

    const lookup = <K extends SceneKind>(id: string, kind: K): Extract<SceneRegistration, { kind: K }> | null => {
        if (!validSceneId(id) || !validSceneKind(kind)) return null
        return (byKey.get(`${kind}:${id}`) ?? null) as Extract<SceneRegistration, { kind: K }> | null
    }

    const create = <K extends SceneKind>(id: string, kind: K, input: SceneInput): SceneInstance<K> | null => {
        const entry = lookup(id, kind)
        if (!entry) return null
        const normalizedInput = normalizeInput(input)
        let produced: unknown
        try {
            produced = entry.factory(normalizedInput)
        } catch (cause) {
            throw new SceneRegistryError('factory_failed', `Scene factory "${id}" failed.`, cause)
        }
        return wrapInstance(produced, kind)
    }

    return Object.freeze({
        lookup,
        create,
        snapshot: () => snapshot,
    })
}

export function createSceneRegistryBuilder(): SceneRegistryBuilder {
    const entries: SceneRegistration[] = []
    const keys = new Set<string>()

    const register = (value: SceneRegistration): SceneRegistryBuilder => {
        if (entries.length >= SCENE_REGISTRY_MAX_ENTRIES) {
            invalid('registry_limit_exceeded', 'Scene registry exceeds its bounded entry limit.')
        }
        const entry = normalizeRegistration(value)
        const key = `${entry.kind}:${entry.id}`
        if (keys.has(key)) invalid('duplicate_scene_id', `Scene key "${key}" is already registered.`)
        keys.add(key)
        entries.push(entry)
        return builder
    }

    const build = (): SceneRegistry => buildRegistry(entries)
    const builder = Object.freeze({ register, build })
    return builder
}

export function createSceneRegistry(values: readonly SceneRegistration[] = []): SceneRegistry {
    const definitions = readDenseArray(values, SCENE_REGISTRY_MAX_ENTRIES)
    if (!definitions) invalid('invalid_registration', 'Registry definitions must be a bounded dense array.')
    const builder = createSceneRegistryBuilder()
    for (const definition of definitions) builder.register(definition as SceneRegistration)
    return builder.build()
}
