/** Provider-neutral compatibility verdict for one on-device GGUF. */

import type {
    TalosLocalTemplateCapabilities,
    TalosLocalToolTransport,
} from '@/services/localEngine'

export const TALOS_LOCAL_PARITY_CHECK_IDS = [
    'plain_text',
    'no_false_tool',
    'tool_call',
    'tool_result_roundtrip',
    'protocol_hygiene',
    'cancel',
] as const

export type TalosLocalParityCheckId = typeof TALOS_LOCAL_PARITY_CHECK_IDS[number]
export type TalosLocalParityCheckStatus = 'pass' | 'fail' | 'skipped'

export interface TalosLocalParityCheck {
    id: TalosLocalParityCheckId
    status: TalosLocalParityCheckStatus
    durationMs: number
    /** Stable support code. Never model/user text. */
    code: string
}

export interface TalosLocalModelParityReport {
    schema: 'talos.local-model-parity/1'
    verdict: 'compatible' | 'incompatible' | 'incomplete'
    model: {
        name: string
        bytes: number | null
        modifiedAt: number | null
    }
    appBuild: string
    engineBuild: string | null
    /** The renderer selected from the GGUF's measured template capabilities. */
    toolTransport: TalosLocalToolTransport
    /** `null` means an old or malformed bridge, never an assertion of support. */
    templateCapabilities: TalosLocalTemplateCapabilities | null
    /** Stable identity without exporting the device path. */
    fingerprint: string
    summary: { passed: number, failed: number, skipped: number }
    checks: TalosLocalParityCheck[]
}

export interface TalosLocalModelParityReportInput {
    modelPath: string
    modelBytes: number | null
    modelModifiedAt: number | null
    appBuild: string
    engineBuild: string | null
    toolTransport?: TalosLocalToolTransport
    templateCapabilities?: TalosLocalTemplateCapabilities | null
    checks: readonly TalosLocalParityCheck[]
}

function fileName(path: string): string {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'model.gguf'
}

/** FNV-1a 64-bit: deterministic identity, not a security primitive. */
function fingerprintOf(value: string): string {
    let hash = 0xcbf29ce484222325n
    for (let index = 0; index < value.length; index += 1) {
        hash ^= BigInt(value.charCodeAt(index))
        hash = BigInt.asUintN(64, hash * 0x100000001b3n)
    }
    return hash.toString(16).padStart(16, '0')
}

function boundedCheck(check: TalosLocalParityCheck): TalosLocalParityCheck {
    return {
        id: check.id,
        status: check.status,
        durationMs: Number.isFinite(check.durationMs)
            ? Math.max(0, Math.round(check.durationMs))
            : 0,
        // A diagnostic code is a vocabulary item, never a free-text channel.
        code: /^[A-Z0-9_]{1,80}$/.test(check.code)
            ? check.code
            : 'TALOS_LOCAL_PARITY_UNCLASSIFIED',
    }
}

function boundedTemplateCapabilities(
    value: TalosLocalTemplateCapabilities | null | undefined,
): TalosLocalTemplateCapabilities | null {
    if (!value) return null
    if (
        typeof value.supportsTools !== 'boolean'
        || typeof value.supportsToolCalls !== 'boolean'
        || typeof value.supportsSystemRole !== 'boolean'
    ) return null
    return {
        supportsTools: value.supportsTools,
        supportsToolCalls: value.supportsToolCalls,
        supportsSystemRole: value.supportsSystemRole,
    }
}

export function buildTalosLocalModelParityReport(
    input: TalosLocalModelParityReportInput,
): TalosLocalModelParityReport {
    const modelName = fileName(input.modelPath)
    const toolTransport: TalosLocalToolTransport = input.toolTransport === 'native-template'
        ? 'native-template'
        : 'prompt-json-v1'
    const templateCapabilities = boundedTemplateCapabilities(input.templateCapabilities)
    const byId = new Map(input.checks.map((entry) => [entry.id, boundedCheck(entry)]))
    const checks = TALOS_LOCAL_PARITY_CHECK_IDS.map((id) => byId.get(id) ?? {
        id,
        status: 'skipped' as const,
        durationMs: 0,
        code: 'TALOS_LOCAL_PARITY_NOT_RUN',
    })
    const summary = {
        passed: checks.filter((entry) => entry.status === 'pass').length,
        failed: checks.filter((entry) => entry.status === 'fail').length,
        skipped: checks.filter((entry) => entry.status === 'skipped').length,
    }
    const verdict = summary.failed > 0
        ? 'incompatible' as const
        : summary.skipped > 0
            ? 'incomplete' as const
            : 'compatible' as const

    return {
        schema: 'talos.local-model-parity/1',
        verdict,
        model: {
            name: modelName,
            bytes: input.modelBytes,
            modifiedAt: input.modelModifiedAt,
        },
        appBuild: input.appBuild,
        engineBuild: input.engineBuild,
        toolTransport,
        templateCapabilities,
        fingerprint: fingerprintOf([
            modelName,
            input.modelBytes ?? '',
            input.modelModifiedAt ?? '',
            input.appBuild,
            input.engineBuild ?? '',
            toolTransport,
            templateCapabilities?.supportsTools ?? '',
            templateCapabilities?.supportsToolCalls ?? '',
            templateCapabilities?.supportsSystemRole ?? '',
        ].join('|')),
        summary,
        checks,
    }
}

/** Closed protocol vocabulary: used only on model output, never user input. */
export function talosContainsLocalProtocol(text: string | null | undefined): boolean {
    if (!text) return false
    return /(?:^|\n)[ \t]*TOOL_CODE[ \t]*(?:\n|$)/i.test(text)
        || /<\/?(?:tools|tool_details|tool_name|tool_description|tool_input|tool_results?|tool_call)(?:\s[^>]*)?>/i.test(text)
        || /(?:^|\n)[ \t]*tool_details[ \t]*:[ \t]*[A-Za-z0-9_]/i.test(text)
}
