/**
 * Pick one representative GGUF variant for a phone-sized browse row.
 *
 * Hugging Face's `gguf.totalFileSize` is the sum of repository files, not the
 * size of one downloadable quantisation. The sibling names tell us which
 * variants actually exist; byte sizes are exact only when the response also
 * carries a positive LFS size. Otherwise the estimate is explicit.
 */

export type TalosBrowseVariantSource =
    | 'sibling-lfs'
    | 'parameter-estimate'
    | 'name-estimate'

export interface TalosBrowseSibling {
    path: string
    sizeBytes: number | null
    sha256: string | null
}

export interface TalosBrowseVariant {
    quantisation: string
    /** Every path for a split GGUF; one path for an ordinary file. */
    paths: readonly string[]
    fileBytes: number
    workingBytes: number
    /** A set has one digest per shard, so this is present only for one file. */
    sha256: string | null
    source: TalosBrowseVariantSource
    estimated: boolean
}

export interface TalosBrowseVariantInput {
    id: string
    parameters: number | null
    siblings: readonly TalosBrowseSibling[]
}

export const TALOS_MOBILE_QUANTISATION_ORDER = Object.freeze([
    'Q4_K_M',
    'Q4_K_S',
    'Q4_1',
    'Q4_0',
    'IQ4_XS',
    'IQ4_NL',
    'UD-Q4_K_XL',
] as const)

const BITS_PER_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
    Q4_K_M: 4.8,
    Q4_K_S: 4.6,
    Q4_1: 5.0,
    Q4_0: 4.5,
    IQ4_XS: 4.3,
    IQ4_NL: 4.5,
    'UD-Q4_K_XL': 4.8,
})

const PARAMS_IN_NAME = /(?:^|[-_.\s])(\d+(?:\.\d+)?)\s*b(?=[-_.\s]|$)/i
const SHARD = /-(\d{5})-of-(\d{5})\.gguf$/i
const WORKING_MULTIPLIER = 1.25

export function talosEstimateGgufBytesFromParameters(
    parameters: number,
    quantisation: string,
): number | null {
    const bits = BITS_PER_WEIGHT[quantisation.toUpperCase()]
    if (!bits || !Number.isFinite(parameters) || parameters <= 0) return null
    return Math.ceil((parameters * bits) / 8)
}

function quantisationOf(path: string): string | null {
    if (!path.toLowerCase().endsWith('.gguf')) return null
    const upper = path.toUpperCase()
    return TALOS_MOBILE_QUANTISATION_ORDER.find((quantisation) => {
        const escaped = quantisation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`(?:^|[-_.])${escaped}(?=[-_.]|$)`, 'u').test(upper)
    }) ?? null
}

function stablePath(left: TalosBrowseSibling, right: TalosBrowseSibling): number {
    if (left.path.length !== right.path.length) return left.path.length - right.path.length
    return left.path < right.path ? -1 : (left.path > right.path ? 1 : 0)
}

/** Choose a complete set, never one shard from it. */
function pathsFor(rows: readonly TalosBrowseSibling[]): TalosBrowseSibling[] | null {
    const singles = rows.filter((row) => !SHARD.test(row.path)).sort(stablePath)
    if (singles.length > 0) return [singles[0]!]

    const groups = new Map<string, TalosBrowseSibling[]>()
    for (const row of rows) {
        const match = SHARD.exec(row.path)
        if (!match) continue
        const key = row.path.replace(SHARD, '-{shard}.gguf')
        const group = groups.get(key) ?? []
        group.push(row)
        groups.set(key, group)
    }

    for (const key of [...groups.keys()].sort()) {
        const group = groups.get(key)!
        const parsed = group.map((row) => {
            const match = SHARD.exec(row.path)
            return {
                row,
                index: Number(match?.[1] ?? 0),
                total: Number(match?.[2] ?? 0),
            }
        })
        const expected = parsed[0]?.total ?? 0
        const sameTotal = parsed.every((part) => part.total === expected)
        const indices = new Set(parsed.map((part) => part.index))
        const contiguous = expected > 0
            && Array.from({ length: expected }, (_, index) => index + 1)
                .every((index) => indices.has(index))
        if (
            sameTotal
            && contiguous
            && group.length === expected
            && indices.size === expected
        ) {
            return [...group].sort((left, right) => (
                Number(SHARD.exec(left.path)?.[1] ?? 0)
                - Number(SHARD.exec(right.path)?.[1] ?? 0)
            ))
        }
    }
    return null
}

function parametersFromName(id: string): number | null {
    const match = PARAMS_IN_NAME.exec(id)
    if (!match) return null
    const billions = Number(match[1])
    return Number.isFinite(billions) && billions > 0 && billions <= 2_000
        ? billions * 1_000_000_000
        : null
}

function variantFrom(
    quantisation: string,
    rows: readonly TalosBrowseSibling[],
    input: TalosBrowseVariantInput,
): TalosBrowseVariant | null {
    const complete = pathsFor(rows)
    if (!complete) return null

    const exact = complete.every((row) => (
        row.sizeBytes !== null && Number.isFinite(row.sizeBytes) && row.sizeBytes > 0
    ))
    const exactBytes = exact
        ? complete.reduce((total, row) => total + row.sizeBytes!, 0)
        : null
    const parameterBytes = exactBytes === null && input.parameters !== null
        ? talosEstimateGgufBytesFromParameters(input.parameters, quantisation)
        : null
    const namedParameters = exactBytes === null && parameterBytes === null
        ? parametersFromName(input.id)
        : null
    const nameBytes = namedParameters === null
        ? null
        : talosEstimateGgufBytesFromParameters(namedParameters, quantisation)
    const fileBytes = exactBytes ?? parameterBytes ?? nameBytes
    if (fileBytes === null) return null

    const source: TalosBrowseVariantSource = exactBytes !== null
        ? 'sibling-lfs'
        : (parameterBytes !== null ? 'parameter-estimate' : 'name-estimate')
    const singleSha = complete.length === 1 && /^[0-9a-f]{64}$/iu.test(complete[0]!.sha256 ?? '')
        ? complete[0]!.sha256
        : null

    return {
        quantisation,
        paths: complete.map((row) => row.path),
        fileBytes,
        workingBytes: Math.ceil(fileBytes * WORKING_MULTIPLIER),
        sha256: singleSha,
        source,
        estimated: source !== 'sibling-lfs',
    }
}

export function talosSelectMobileBrowseVariant(
    input: TalosBrowseVariantInput,
): TalosBrowseVariant | null {
    for (const quantisation of TALOS_MOBILE_QUANTISATION_ORDER) {
        const rows = input.siblings.filter((row) => quantisationOf(row.path) === quantisation)
        if (rows.length === 0) continue
        const variant = variantFrom(quantisation, rows, input)
        if (variant) return variant
    }

    // Backward-compatible cached rows may predate sibling expansion. In that
    // case the model name can still support an explicitly estimated Q4 row.
    if (input.siblings.length === 0) {
        const parameters = input.parameters ?? parametersFromName(input.id)
        if (parameters === null) return null
        const fileBytes = talosEstimateGgufBytesFromParameters(parameters, 'Q4_K_M')
        if (fileBytes === null) return null
        return {
            quantisation: 'Q4_K_M',
            paths: [],
            fileBytes,
            workingBytes: Math.ceil(fileBytes * WORKING_MULTIPLIER),
            sha256: null,
            source: input.parameters === null ? 'name-estimate' : 'parameter-estimate',
            estimated: true,
        }
    }

    return null
}
