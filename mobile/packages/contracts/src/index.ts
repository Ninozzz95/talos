/**
 * TALOS Mobile canonical contracts.
 *
 * This package owns portable transport and parity-governance shapes only.
 * Domain state remains with core, Laravel, or the mobile runtime. Every JSON
 * boundary is exact-key and version/discriminator checked before payload use.
 */

export const TALOS_MOBILE_CONTRACT_SCHEMA_VERSION = 1
export const TALOS_MOBILE_FEATURE_PARITY_CONTRACT = 'talos.mobile.feature-parity/v1'

export type MobileSupportState =
    | 'unassessed'
    | 'blocked'
    | 'planned'
    | 'implemented'
    | 'verified'

export type MobileExecutionLocation =
    | 'local_mobile'
    | 'trusted_node'
    | 'remote_provider'
    | 'unavailable'

export type TalosDesktopOwner =
    | 'core'
    | 'validator'
    | 'control_plane'
    | 'talos_ui'
    | 'kadmos'

export type TalosMobileOwner =
    | 'mobile_shell'
    | 'mobile_core'
    | 'zethos_android'
    | 'native_adapter'

export interface MobileFeatureParityEntry {
    feature_id: string
    desktop_contract: string
    desktop_owner: TalosDesktopOwner
    mobile_owner: TalosMobileOwner
    mobile_surface: string
    execution_location: MobileExecutionLocation[]
    required_capabilities: string[]
    evidence_contract: string
    status: MobileSupportState
    blocking_reason: string | null
    test_ids: string[]
    desktop_revision: string
}

export interface MobileFeatureParityPayload {
    desktop_revision: string
    generated_at: string
    generated_by: string
    expected_desktop_feature_ids: string[]
    features: MobileFeatureParityEntry[]
}

export interface TalosVersionedContract<T> {
    schema_version: number
    contract: string
    payload: T
}

export type TalosContractErrorCode =
    | 'invalid_shape'
    | 'unknown_schema_version'
    | 'invalid_contract'
    | 'unknown_field'
    | 'invalid_owner'
    | 'invalid_enum'
    | 'invalid_state'

export class TalosContractError extends Error {
    readonly code: TalosContractErrorCode

    constructor(code: TalosContractErrorCode, message: string) {
        super(message)
        this.name = 'TalosContractError'
        this.code = code
    }
}

const DESKTOP_OWNERS: readonly TalosDesktopOwner[] = [
    'core',
    'validator',
    'control_plane',
    'talos_ui',
    'kadmos',
]

const MOBILE_OWNERS: readonly TalosMobileOwner[] = [
    'mobile_shell',
    'mobile_core',
    'zethos_android',
    'native_adapter',
]

const SUPPORT_STATES: readonly MobileSupportState[] = [
    'unassessed',
    'blocked',
    'planned',
    'implemented',
    'verified',
]

const EXECUTION_LOCATIONS: readonly MobileExecutionLocation[] = [
    'local_mobile',
    'trusted_node',
    'remote_provider',
    'unavailable',
]

const FEATURE_ID_PATTERN = /^[a-z][a-z0-9_]*$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
// C0 controls, DEL and C1 controls are never legitimate parity prose. Non-ASCII
// human text (accents, symbols) is above this range and stays accepted.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/
const MAX_STRING_LENGTH = 4096
const MAX_LIST_ITEMS = 256

const ENVELOPE_KEYS = ['schema_version', 'contract', 'payload']
const PAYLOAD_KEYS = [
    'desktop_revision',
    'generated_at',
    'generated_by',
    'expected_desktop_feature_ids',
    'features',
]
const ENTRY_KEYS = [
    'feature_id',
    'desktop_contract',
    'desktop_owner',
    'mobile_owner',
    'mobile_surface',
    'execution_location',
    'required_capabilities',
    'evidence_contract',
    'status',
    'blocking_reason',
    'test_ids',
    'desktop_revision',
]

/** True only for a real Gregorian calendar date (shape already checked). */
function isRealCalendarDate(value: string): boolean {
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(5, 7))
    const day = Number(value.slice(8, 10))
    if (year < 1970 || month < 1 || month > 12 || day < 1) return false
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day <= monthLengths[month - 1]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    try {
        const prototype = Reflect.getPrototypeOf(value)
        return prototype === Object.prototype || prototype === null
    } catch {
        return false
    }
}

function ownKeys(value: Record<string, unknown>, where: string): string[] {
    try {
        const keys = Reflect.ownKeys(value)
        if (keys.some((key) => typeof key !== 'string')) {
            throw new TalosContractError('invalid_shape', `${where} must contain only JSON string keys`)
        }
        return keys as string[]
    } catch (error) {
        if (error instanceof TalosContractError) throw error
        throw new TalosContractError('invalid_shape', `${where} cannot be inspected safely`)
    }
}

function assertNoUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], where: string): void {
    for (const key of ownKeys(value, where)) {
        if (!allowed.includes(key)) {
            throw new TalosContractError('unknown_field', `${where} contains unknown field "${key}"`)
        }
    }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_STRING_LENGTH) {
        throw new TalosContractError('invalid_shape', `${field} must be a bounded non-empty string`)
    }
    if (CONTROL_CHARS.test(value)) {
        throw new TalosContractError('invalid_shape', `${field} must not contain control characters`)
    }
}

function parseStringList(value: unknown, field: string, allowEmpty: boolean, requireUnique = true): string[] {
    if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS || (!allowEmpty && value.length === 0)) {
        throw new TalosContractError('invalid_shape', `${field} must be a bounded ${allowEmpty ? '' : 'non-empty '}list of strings`)
    }
    const seen = new Set<string>()
    const result: string[] = []
    for (const item of value) {
        assertNonEmptyString(item, field)
        if (requireUnique && seen.has(item)) {
            throw new TalosContractError('invalid_state', `${field} duplicates "${item}"`)
        }
        seen.add(item)
        result.push(item)
    }
    return result
}

/**
 * Parse a versioned envelope only after binding it to an exact discriminator
 * and a payload parser. This function never turns an unchecked payload into T.
 */
export function parseTalosVersionedContract<T>(
    value: unknown,
    expectedContract: string,
    parsePayload: (payload: unknown) => T,
): TalosVersionedContract<T> {
    if (!isPlainObject(value)) {
        throw new TalosContractError('invalid_shape', 'versioned contract must be a JSON object')
    }
    assertNonEmptyString(expectedContract, 'expectedContract')
    if (typeof parsePayload !== 'function') {
        throw new TalosContractError('invalid_shape', 'parsePayload must be a function')
    }
    assertNoUnknownKeys(value, ENVELOPE_KEYS, 'versioned contract')

    if (typeof value.schema_version !== 'number' || !Number.isInteger(value.schema_version)) {
        throw new TalosContractError('invalid_shape', 'schema_version must be an integer')
    }
    if (value.schema_version !== TALOS_MOBILE_CONTRACT_SCHEMA_VERSION) {
        throw new TalosContractError(
            'unknown_schema_version',
            `unsupported schema_version ${String(value.schema_version)}; supported: ${TALOS_MOBILE_CONTRACT_SCHEMA_VERSION}`,
        )
    }
    if (value.contract !== expectedContract) {
        throw new TalosContractError(
            'invalid_contract',
            `contract must be "${expectedContract}"; received "${String(value.contract)}"`,
        )
    }
    if (!Object.hasOwn(value, 'payload')) {
        throw new TalosContractError('invalid_shape', 'payload is required')
    }

    return {
        schema_version: TALOS_MOBILE_CONTRACT_SCHEMA_VERSION,
        contract: expectedContract,
        payload: parsePayload(value.payload),
    }
}

/** Validate one exact feature-parity entry. */
export function parseMobileFeatureParityEntry(value: unknown): MobileFeatureParityEntry {
    if (!isPlainObject(value)) {
        throw new TalosContractError('invalid_shape', 'feature entry must be a JSON object')
    }
    assertNoUnknownKeys(value, ENTRY_KEYS, `feature entry ${String(value.feature_id ?? '<unknown>')}`)

    assertNonEmptyString(value.feature_id, 'feature_id')
    if (!FEATURE_ID_PATTERN.test(value.feature_id)) {
        throw new TalosContractError('invalid_shape', `feature_id "${value.feature_id}" must be snake_case`)
    }
    assertNonEmptyString(value.desktop_contract, 'desktop_contract')
    if (!DESKTOP_OWNERS.includes(value.desktop_owner as TalosDesktopOwner)) {
        throw new TalosContractError('invalid_owner', `desktop_owner "${String(value.desktop_owner)}" is not a canonical owner`)
    }
    if (!MOBILE_OWNERS.includes(value.mobile_owner as TalosMobileOwner)) {
        throw new TalosContractError('invalid_owner', `mobile_owner "${String(value.mobile_owner)}" is not a canonical owner`)
    }
    assertNonEmptyString(value.mobile_surface, 'mobile_surface')

    if (!Array.isArray(value.execution_location) || value.execution_location.length === 0) {
        throw new TalosContractError('invalid_shape', 'execution_location must be a non-empty list')
    }
    const locations = parseStringList(value.execution_location, 'execution_location', false)
    for (const location of locations) {
        if (!EXECUTION_LOCATIONS.includes(location as MobileExecutionLocation)) {
            throw new TalosContractError('invalid_enum', `execution_location "${location}" is not supported`)
        }
    }
    const requiredCapabilities = parseStringList(value.required_capabilities, 'required_capabilities', true)
    assertNonEmptyString(value.evidence_contract, 'evidence_contract')

    if (!SUPPORT_STATES.includes(value.status as MobileSupportState)) {
        throw new TalosContractError('invalid_enum', `status "${String(value.status)}" is not a MobileSupportState`)
    }
    const status = value.status as MobileSupportState

    if (value.blocking_reason !== null && typeof value.blocking_reason !== 'string') {
        throw new TalosContractError('invalid_shape', 'blocking_reason must be null or a string')
    }
    if (status === 'blocked') {
        assertNonEmptyString(value.blocking_reason, 'blocking_reason')
    } else if (value.blocking_reason !== null) {
        throw new TalosContractError('invalid_state', `${status} entries cannot keep a blocking_reason`)
    }

    const testIds = parseStringList(value.test_ids, 'test_ids', true)
    if (status === 'verified' && testIds.length === 0) {
        throw new TalosContractError('invalid_state', 'verified entries must reference at least one real test id')
    }

    assertNonEmptyString(value.desktop_revision, 'desktop_revision')

    return {
        feature_id: value.feature_id,
        desktop_contract: value.desktop_contract,
        desktop_owner: value.desktop_owner as TalosDesktopOwner,
        mobile_owner: value.mobile_owner as TalosMobileOwner,
        mobile_surface: value.mobile_surface,
        execution_location: locations as MobileExecutionLocation[],
        required_capabilities: requiredCapabilities,
        evidence_contract: value.evidence_contract,
        status,
        blocking_reason: value.blocking_reason as string | null,
        test_ids: testIds,
        desktop_revision: value.desktop_revision,
    }
}

/** Validate a JSON list of exact feature-parity entries. */
export function parseMobileFeatureParityLedger(value: unknown): MobileFeatureParityEntry[] {
    if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
        throw new TalosContractError('invalid_shape', 'feature entries must be a bounded JSON list, not an object or scalar')
    }
    const seenIds = new Set<string>()
    return value.map((entry, index) => {
        const parsed = parseMobileFeatureParityEntry(entry)
        if (seenIds.has(parsed.feature_id)) {
            throw new TalosContractError('invalid_state', `duplicate feature_id "${parsed.feature_id}" at index ${index}`)
        }
        seenIds.add(parsed.feature_id)
        return parsed
    })
}

function parseMobileFeatureParityPayload(value: unknown): MobileFeatureParityPayload {
    if (!isPlainObject(value)) {
        throw new TalosContractError('invalid_shape', 'feature parity payload must be a JSON object')
    }
    assertNoUnknownKeys(value, PAYLOAD_KEYS, 'feature parity payload')
    assertNonEmptyString(value.desktop_revision, 'payload.desktop_revision')
    assertNonEmptyString(value.generated_at, 'payload.generated_at')
    if (!ISO_DATE_PATTERN.test(value.generated_at)) {
        throw new TalosContractError('invalid_shape', 'payload.generated_at must use YYYY-MM-DD')
    }
    if (!isRealCalendarDate(value.generated_at)) {
        throw new TalosContractError('invalid_shape', 'payload.generated_at must be a real calendar date')
    }
    assertNonEmptyString(value.generated_by, 'payload.generated_by')

    const expectedIds = parseStringList(
        value.expected_desktop_feature_ids,
        'payload.expected_desktop_feature_ids',
        false,
    )
    for (const featureId of expectedIds) {
        if (!FEATURE_ID_PATTERN.test(featureId)) {
            throw new TalosContractError('invalid_shape', `expected desktop feature "${featureId}" must be snake_case`)
        }
    }

    const features = parseMobileFeatureParityLedger(value.features)
    const expectedSet = new Set(expectedIds)
    const actualSet = new Set(features.map((entry) => entry.feature_id))
    for (const featureId of expectedIds) {
        if (!actualSet.has(featureId)) {
            throw new TalosContractError('invalid_state', `expected desktop feature "${featureId}" has no parity entry`)
        }
    }
    for (const entry of features) {
        if (!expectedSet.has(entry.feature_id)) {
            throw new TalosContractError('invalid_state', `parity entry "${entry.feature_id}" is absent from expected_desktop_feature_ids`)
        }
        if (entry.desktop_revision !== value.desktop_revision) {
            throw new TalosContractError(
                'invalid_state',
                `feature "${entry.feature_id}" desktop_revision must equal payload.desktop_revision`,
            )
        }
    }

    return {
        desktop_revision: value.desktop_revision,
        generated_at: value.generated_at,
        generated_by: value.generated_by,
        expected_desktop_feature_ids: expectedIds,
        features,
    }
}

/** Parse the complete canonical mobile parity contract. */
export function parseMobileFeatureParityContract(
    value: unknown,
): TalosVersionedContract<MobileFeatureParityPayload> {
    return parseTalosVersionedContract(
        value,
        TALOS_MOBILE_FEATURE_PARITY_CONTRACT,
        parseMobileFeatureParityPayload,
    )
}
