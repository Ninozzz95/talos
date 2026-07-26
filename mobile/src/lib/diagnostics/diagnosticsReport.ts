import type { TalosDeviceIssue } from '@/lib/talosDeviceLog'
import type { TalosDoctorRow } from '@/lib/diagnostics/doctorSections'
import type { TalosSendTrace } from '@/lib/diagnostics/sendTrace'

/**
 * Everything the owner needs, in one paste.
 *
 * Owner 2026-07-26: "fa in modo che lo possa copiare bene e darti un JSON o
 * comunque tutti i dati con un click".
 *
 * On the shape, from the research (2026-07-26, logged in the ledger): there is
 * no universal trace FILE format. OTLP/JSON is the universal ENVELOPE, and
 * `gen_ai.*` (OpenTelemetry) and OpenInference are two competing vocabularies
 * that every vendor adapts — and neither one defines the two numbers that
 * matter most here, time to first token and cost. Full OTLP was considered and
 * rejected on purpose: it would triple the size with hex ids, decimal-string
 * nanoseconds and a nested resourceSpans/scopeSpans envelope, and the research
 * found no vendor that offers a drag-a-JSON-file import anyway. This payload is
 * going into a chat message to be read by a human, so it borrows the standards'
 * SEMANTICS — provider and model named separately, input and output counted
 * apart, absolute timings kept, a kind discriminator per row — while staying
 * readable. `schema` names it so a converter can be written later without
 * guessing.
 */
export interface TalosDiagnosticsReport {
    schema: 'talos.diagnostics/1'
    app: { build: string; platform: string }
    /** The conclusion, first: a report whose answer is buried has failed. */
    summary: {
        checksFailed: number
        checksPassed: number
        sendsRecorded: number
        slowestSendMs: number | null
        anyRoundRanToolsInParallel: boolean
    }
    /** False means nothing was measured — NOT that everything was fast. */
    timingsRecorded: boolean
    /**
     * How many secret-shaped spans had to be scrubbed. Zero is the expected
     * value; one secret can account for more than one span, so treat any
     * non-zero number as "something upstream leaked", not as a count of keys.
     */
    redactions: number
    checks: TalosDoctorRow[]
    issues: TalosDeviceIssue[]
    sends: TalosSendTrace[]
}

export interface TalosDiagnosticsInput {
    buildId: string
    platform: string
    rows: readonly TalosDoctorRow[]
    issues: readonly TalosDeviceIssue[]
    traces: readonly TalosSendTrace[]
    diagnosticsEnabled: boolean
}

/**
 * Scrub anything key-shaped out of free text.
 *
 * The trace recorder is never GIVEN a secret — it only ever sees tool names, a
 * provider and a model — but the device issue log takes free text from any call
 * site, and one future `String(error)` carrying an Authorization header would
 * turn this button into a way to publish a key. Defence at the boundary, so it
 * holds for call sites that do not exist yet.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
    // The scheme AND what follows it. SF-critic 2026-07-26: ending at `\S+`
    // consumed the word "Bearer" on the canonical two-token header and left the
    // credential sitting in the payload — the exact opposite of the intent.
    /\b(?:proxy-)?authorization\b\s*[:=]\s*(?:bearer|basic|token|apikey)?\s*[^\s,;]+/gi,
    /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    /\b(?:x-)?(?:goog-)?api[-_ ]?key\b\s*[:=]\s*[^\s,;]+/gi,
    // Deliberately a SUPERSET rather than one rule per vendor: TALOS will be
    // distributed and providers come and go, so `sk-` catches OpenAI, DeepSeek
    // and whatever ships next without anyone remembering to add a rule.
    /\b(?:sk|tvly|xai|gsk|pplx)[-_][A-Za-z0-9_-]{8,}/gi,
    // Google puts the key in the query string, so a Gemini URL inside an error
    // message IS a live credential — matched by the PARAMETER NAME, never by
    // hoping the value happens to be long enough.
    /[?&](?:key|api[-_]?key|apikey|access_token|token|password|secret)=[^&\s]+/gi,
    /\bAIza[\w-]{35}\b/g,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    /-----BEGIN[ A-Z]*PRIVATE KEY-----/g,
    // The last net: any opaque run long enough that no diagnostic sentence
    // would contain one. `+ / = .` are INSIDE the class — excluding them is
    // exactly how base64 and JWTs slipped between the dots.
    /\b[A-Za-z0-9_-][A-Za-z0-9_\-+/=.]{19,}\b/g,
]

export function redactTalosSecrets(text: string): { text: string; hits: number } {
    let out = text
    let hits = 0
    for (const pattern of SECRET_PATTERNS) {
        out = out.replace(pattern, () => { hits += 1; return '[redacted]' })
    }
    return { text: out, hits }
}

export function buildTalosDiagnosticsReport(
    input: TalosDiagnosticsInput,
): TalosDiagnosticsReport {
    const checksFailed = input.rows.filter((row) => !row.ok).length
    // Counted and reported: a non-zero number here is not reassurance that the
    // net worked, it is the signal that something upstream put a secret into a
    // diagnostic string and needs fixing at the source.
    let redactions = 0
    const issues = input.issues.map((issue) => {
        const scrubbed = redactTalosSecrets(issue.detail)
        redactions += scrubbed.hits
        return { ...issue, detail: scrubbed.text }
    })
    const checks = input.rows.map((row) => {
        // Scrubbed as well: a probe VALUE is free text from a native plugin —
        // the speech row embeds the plugin's own error string — and the critic
        // was right that only the issue log was being cleaned. Computed BEFORE
        // the literal: object properties evaluate in order, so counting these
        // inside `checks:` reported them after `redactions` had been read.
        const scrubbed = redactTalosSecrets(row.value)
        redactions += scrubbed.hits
        return { ...row, value: scrubbed.text }
    })
    const slowest = input.traces.reduce<number | null>(
        (worst, trace) => (worst === null || trace.durationMs > worst ? trace.durationMs : worst),
        null,
    )

    return {
        schema: 'talos.diagnostics/1',
        app: { build: input.buildId, platform: input.platform },
        summary: {
            checksFailed,
            checksPassed: input.rows.length - checksFailed,
            sendsRecorded: input.traces.length,
            slowestSendMs: slowest,
            // The single fact that decides whether the concurrency work has
            // anything to act on, or the time is going somewhere else entirely.
            anyRoundRanToolsInParallel: input.traces.some(
                (trace) => trace.rounds.some((round) => round.parallel),
            ),
        },
        timingsRecorded: input.diagnosticsEnabled,
        redactions,
        checks,
        issues,
        sends: input.traces.map((trace) => ({
            ...trace,
            rounds: trace.rounds.map((round) => ({
                ...round,
                tools: round.tools.map((tool) => ({ ...tool })),
            })),
        })),
    }
}
