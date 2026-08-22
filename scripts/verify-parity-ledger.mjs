#!/usr/bin/env node
/**
 * Zero-dependency TALOS Mobile feature-parity governance verifier.
 *
 * This is an independent JavaScript implementation of the canonical
 * TypeScript parser. Differential tests require both implementations to make
 * the same accept/reject decision for every contract regression fixture.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TALOS_PARITY_LEDGER_CONTRACT = 'talos.mobile.feature-parity/v1'
export const TALOS_PARITY_LEDGER_SCHEMA_VERSION = 1

const DESKTOP_OWNERS = ['core', 'validator', 'control_plane', 'talos_ui', 'kadmos']
const MOBILE_OWNERS = ['mobile_shell', 'mobile_core', 'zethos_android', 'native_adapter']
const SUPPORT_STATES = ['unassessed', 'blocked', 'planned', 'implemented', 'verified']
const EXECUTION_LOCATIONS = ['local_mobile', 'trusted_node', 'remote_provider', 'unavailable']
const FEATURE_ID_PATTERN = /^[a-z][a-z0-9_]*$/
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
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

function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    try {
        const prototype = Reflect.getPrototypeOf(value)
        return prototype === Object.prototype || prototype === null
    } catch {
        return false
    }
}

function isRealCalendarDate(value) {
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(5, 7))
    const day = Number(value.slice(8, 10))
    if (year < 1970 || month < 1 || month > 12 || day < 1) return false
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return day <= monthLengths[month - 1]
}

function isNonEmptyString(value) {
    return typeof value === 'string'
        && value.trim() !== ''
        && value.length <= MAX_STRING_LENGTH
        && !CONTROL_CHARS.test(value)
}

function validateExactKeys(value, allowed, where, errors) {
    let keys
    try {
        keys = Reflect.ownKeys(value)
    } catch {
        errors.push(`${where}: cannot be inspected safely`)
        return
    }
    for (const key of keys) {
        if (typeof key !== 'string') {
            errors.push(`${where}: must contain only JSON string keys`)
        } else if (!allowed.includes(key)) {
            errors.push(`${where}: unknown field "${key}"`)
        }
    }
}

function validateStringList(value, field, errors, { allowEmpty = true, unique = true } = {}) {
    if (!Array.isArray(value)
        || value.length > MAX_LIST_ITEMS
        || (!allowEmpty && value.length === 0)
        || value.some((item) => !isNonEmptyString(item))) {
        errors.push(`${field}: must be a bounded ${allowEmpty ? '' : 'non-empty '}list of non-empty strings`)
        return []
    }
    if (unique) {
        const seen = new Set()
        for (const item of value) {
            if (seen.has(item)) errors.push(`${field}: duplicates "${item}"`)
            seen.add(item)
        }
    }
    return value
}

function validateEntry(entry, index, snapshotRevision, errors) {
    const where = isPlainObject(entry) && isNonEmptyString(entry.feature_id)
        ? `entry "${entry.feature_id}"`
        : `entry at index ${index}`

    if (!isPlainObject(entry)) {
        errors.push(`${where}: must be a JSON object`)
        return
    }
    validateExactKeys(entry, ENTRY_KEYS, where, errors)

    if (!isNonEmptyString(entry.feature_id) || !FEATURE_ID_PATTERN.test(entry.feature_id)) {
        errors.push(`${where}: feature_id must be snake_case`)
    }
    if (!isNonEmptyString(entry.desktop_contract)) {
        errors.push(`${where}: desktop_contract must be a bounded non-empty string`)
    }
    if (!DESKTOP_OWNERS.includes(entry.desktop_owner)) {
        errors.push(`${where}: desktop_owner "${String(entry.desktop_owner)}" is not one of ${DESKTOP_OWNERS.join(', ')}`)
    }
    if (!MOBILE_OWNERS.includes(entry.mobile_owner)) {
        errors.push(`${where}: mobile_owner "${String(entry.mobile_owner)}" is not one of ${MOBILE_OWNERS.join(', ')}`)
    }
    if (!isNonEmptyString(entry.mobile_surface)) {
        errors.push(`${where}: mobile_surface must be a bounded non-empty string`)
    }

    const locations = validateStringList(entry.execution_location, `${where}.execution_location`, errors, { allowEmpty: false })
    for (const location of locations) {
        if (!EXECUTION_LOCATIONS.includes(location)) {
            errors.push(`${where}: execution_location "${String(location)}" is not supported`)
        }
    }
    validateStringList(entry.required_capabilities, `${where}.required_capabilities`, errors)
    if (!isNonEmptyString(entry.evidence_contract)) {
        errors.push(`${where}: evidence_contract must be a bounded non-empty string`)
    }
    if (!SUPPORT_STATES.includes(entry.status)) {
        errors.push(`${where}: status "${String(entry.status)}" is not a MobileSupportState`)
    }

    if (entry.blocking_reason !== null && typeof entry.blocking_reason !== 'string') {
        errors.push(`${where}: blocking_reason must be null or a string`)
    }
    if (entry.status === 'blocked' && !isNonEmptyString(entry.blocking_reason)) {
        errors.push(`${where}: blocked entries must name a blocking_reason`)
    }
    if (SUPPORT_STATES.includes(entry.status) && entry.status !== 'blocked' && entry.blocking_reason !== null) {
        errors.push(`${where}: ${entry.status} entries cannot keep a blocking_reason`)
    }

    const testIds = validateStringList(entry.test_ids, `${where}.test_ids`, errors)
    // Coherence audit 2026-07-25: the gate validated SHAPE, not truth — 4 entries
    // cited test files that do not exist, so a feature could claim evidence it
    // never had. A cited test path must resolve on disk.
    for (const testId of testIds) {
        if (!testId.includes('/')) continue // symbolic ids (e.g. a test name) are allowed
        const relative = testId.startsWith('mobile/') ? testId.slice('mobile/'.length) : testId
        if (!existsSync(resolvePath(process.cwd(), relative))) {
            errors.push(`${where}.test_ids: "${testId}" does not exist on disk`)
        }
    }
    if (entry.status === 'verified' && testIds.length === 0) {
        errors.push(`${where}: verified entries must reference at least one real test id in test_ids`)
    }
    // Coherence audit 2026-07-26: `implemented` required NO evidence at all, and
    // there are zero `verified` entries — so the strictest rule above was dead
    // code and the gate reduced to a spell-check. On the day the tool suite
    // shipped, this ledger still called it "planned" with an empty test list and
    // `npm run build` stayed green. Claiming "implemented" now costs a test.
    if (entry.status === 'implemented' && testIds.length === 0) {
        errors.push(`${where}: implemented entries must cite at least one test in test_ids`)
    }

    if (!isNonEmptyString(entry.desktop_revision)) {
        errors.push(`${where}: desktop_revision must be a bounded non-empty string`)
    } else if (isNonEmptyString(snapshotRevision) && entry.desktop_revision !== snapshotRevision) {
        errors.push(`${where}: desktop_revision must equal payload.desktop_revision`)
    }
}

/** Return expected desktop feature ids that have no parity entry. */
export function missingDesktopFeatureIds(expectedIds, entries) {
    const present = new Set(
        (Array.isArray(entries) ? entries : [])
            .filter(isPlainObject)
            .map((entry) => entry.feature_id),
    )
    return (Array.isArray(expectedIds) ? expectedIds : []).filter((id) => !present.has(id))
}

/** Validate a complete parity ledger without throwing. */
export function validateParityLedger(value) {
    const errors = []

    if (!isPlainObject(value)) {
        return { ok: false, errors: ['ledger must be a JSON object'], missing: [] }
    }
    validateExactKeys(value, ENVELOPE_KEYS, 'ledger', errors)
    if (value.schema_version !== TALOS_PARITY_LEDGER_SCHEMA_VERSION) {
        errors.push(`schema_version must be ${TALOS_PARITY_LEDGER_SCHEMA_VERSION}`)
    }
    if (value.contract !== TALOS_PARITY_LEDGER_CONTRACT) {
        errors.push(`contract must be "${TALOS_PARITY_LEDGER_CONTRACT}"`)
    }
    if (!isPlainObject(value.payload)) {
        errors.push('payload must be a JSON object')
        return { ok: false, errors, missing: [] }
    }

    const payload = value.payload
    validateExactKeys(payload, PAYLOAD_KEYS, 'payload', errors)
    if (!isNonEmptyString(payload.desktop_revision)) {
        errors.push('payload.desktop_revision must be a bounded non-empty string')
    }
    if (!isNonEmptyString(payload.generated_at) || !ISO_DATE_PATTERN.test(payload.generated_at)) {
        errors.push('payload.generated_at must use YYYY-MM-DD')
    } else if (!isRealCalendarDate(payload.generated_at)) {
        errors.push('payload.generated_at must be a real calendar date')
    }
    if (!isNonEmptyString(payload.generated_by)) {
        errors.push('payload.generated_by must be a bounded non-empty string')
    }

    const expectedIds = validateStringList(
        payload.expected_desktop_feature_ids,
        'payload.expected_desktop_feature_ids',
        errors,
        { allowEmpty: false },
    )
    for (const id of expectedIds) {
        if (!FEATURE_ID_PATTERN.test(id)) {
            errors.push(`expected desktop feature "${id}" must be snake_case`)
        }
    }
    if (!Array.isArray(payload.features) || payload.features.length > MAX_LIST_ITEMS) {
        errors.push('payload.features must be a bounded JSON list, not an object or scalar')
        return { ok: false, errors, missing: [] }
    }

    const seenIds = new Set()
    payload.features.forEach((entry, index) => {
        if (isPlainObject(entry) && isNonEmptyString(entry.feature_id)) {
            if (seenIds.has(entry.feature_id)) {
                errors.push(`duplicate feature_id "${entry.feature_id}" at index ${index}`)
            }
            seenIds.add(entry.feature_id)
        }
        validateEntry(entry, index, payload.desktop_revision, errors)
    })

    const missing = missingDesktopFeatureIds(expectedIds, payload.features)
    for (const id of missing) {
        errors.push(`expected desktop feature "${id}" has no parity entry`)
    }
    const expectedSet = new Set(expectedIds)
    for (const entry of payload.features) {
        if (isPlainObject(entry) && isNonEmptyString(entry.feature_id) && !expectedSet.has(entry.feature_id)) {
            errors.push(`parity entry "${entry.feature_id}" is absent from expected_desktop_feature_ids`)
        }
    }

    return { ok: errors.length === 0, errors, missing }
}

/** Read and validate one parity ledger file. */
export function verifyParityLedgerFile(path) {
    let parsed
    try {
        parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
        return { ok: false, errors: [`cannot read or parse "${path}": ${error.message}`], missing: [] }
    }
    return validateParityLedger(parsed)
}

const isMain = typeof process.argv[1] === 'string'
    && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
    const target = process.argv[2]
    if (!target) {
        console.error('usage: node verify-parity-ledger.mjs <feature-parity.json>')
        process.exit(2)
    }
    const result = verifyParityLedgerFile(target)
    console.log(JSON.stringify({
        ok: result.ok,
        errors: result.errors,
        missing: result.missing,
        checked: target,
    }, null, 2))
    process.exit(result.ok ? 0 : 1)
}
