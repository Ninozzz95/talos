import { readTalosCacheUsage } from '@/lib/chat/promptCache'

/**
 * «Dettagli esecuzione» — owner 2026-09-13: token e costo, tempi, attrezzi ed esito.
 *
 * Qui vivono i DATI del giro: che cosa si e' contato, sommato su tutti i passaggi del
 * ciclo dell'agente (il modello chiama, gli attrezzi rispondono, il modello richiama).
 *
 * ⛔ Due regole che valgono per ogni campo:
 * - un conteggio che il fornitore NON manda resta `null`, mai 0. Gemini 3 Flash a volte
 *   omette `thoughtsTokenCount` (discuss.ai.google.dev, letto il 2026-09-13): uno zero li'
 *   direbbe «nessun ragionamento», che e' falso;
 * - il costo riportato conta come VERO solo se l'hanno riportato TUTTI i passaggi. Un
 *   costo di due passaggi su tre e' un numero piu' basso del vero con l'aria di una misura.
 */
export interface TalosRunTokens {
    input: number | null
    output: number | null
    reasoning: number | null
    cached: number | null
}

export interface TalosRunRecord {
    v: 1
    provider: string
    model: string
    rounds: number
    tokens: TalosRunTokens
    /** Somma di `usage.cost` (USD) dei passaggi che l'hanno riportato. */
    reportedCostUsd: number | null
    /** Quanti passaggi hanno riportato un costo: vero solo se === rounds. */
    reportedCostRounds: number
    callIds: string[]
    startedAt: string
    firstChunkMs: number | null
    totalMs: number | null
}

function firstNumber(usage: Record<string, unknown>, keys: readonly string[]): number | null {
    for (const key of keys) {
        const value = usage[key]
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
    }
    return null
}

/**
 * I nomi dei conteggi cambiano da fornitore a fornitore:
 * OpenAI/OpenRouter/DeepSeek `prompt_tokens`/`completion_tokens`/`reasoning_tokens`;
 * Anthropic `input_tokens`/`output_tokens`; Gemini `promptTokenCount`/
 * `candidatesTokenCount`/`thoughtsTokenCount`. La cache la legge `readTalosCacheUsage`,
 * che conosce gia' tutti i nomi.
 */
export function talosRunTokens(usage: Record<string, unknown> | null | undefined): TalosRunTokens {
    if (!usage) return { input: null, output: null, reasoning: null, cached: null }
    return {
        input: firstNumber(usage, ['prompt_tokens', 'input_tokens', 'promptTokenCount']),
        output: firstNumber(usage, ['completion_tokens', 'output_tokens', 'candidatesTokenCount']),
        reasoning: firstNumber(usage, ['reasoning_tokens', 'thoughtsTokenCount']),
        cached: readTalosCacheUsage(usage)?.readTokens ?? null,
    }
}

const sum = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : a + b)

export interface TalosRunMeter {
    /** Un passaggio del modello e' finito: il suo uso e l'id della chiamata. */
    add(usage: Record<string, unknown> | null | undefined, callId?: string | null): void
    /** Il primo pezzo di risposta e' arrivato (conta solo il primo del giro). */
    firstChunk(): void
    finish(context: { provider: string, model: string }): TalosRunRecord
}

export function createTalosRunMeter(options: { clock?: () => number, nowIso?: () => string } = {}): TalosRunMeter {
    const clock = options.clock ?? (() => Date.now())
    const startedMs = clock()
    const startedAt = (options.nowIso ?? (() => new Date().toISOString()))()
    let firstChunkMs: number | null = null
    let rounds = 0
    let tokens: TalosRunTokens = { input: null, output: null, reasoning: null, cached: null }
    let reportedCostUsd: number | null = null
    let reportedCostRounds = 0
    const callIds: string[] = []
    return {
        add(usage, callId) {
            rounds += 1
            const round = talosRunTokens(usage)
            tokens = {
                input: sum(tokens.input, round.input),
                output: sum(tokens.output, round.output),
                reasoning: sum(tokens.reasoning, round.reasoning),
                cached: sum(tokens.cached, round.cached),
            }
            const cost = usage?.cost
            if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
                reportedCostUsd = sum(reportedCostUsd, cost)
                reportedCostRounds += 1
            }
            if (callId && !callIds.includes(callId)) callIds.push(callId)
        },
        firstChunk() {
            if (firstChunkMs === null) firstChunkMs = Math.max(0, clock() - startedMs)
        },
        finish({ provider, model }) {
            return {
                v: 1,
                provider,
                model,
                rounds,
                tokens,
                reportedCostUsd,
                reportedCostRounds,
                callIds: [...callIds],
                startedAt,
                firstChunkMs,
                totalMs: Math.max(0, clock() - startedMs),
            }
        },
    }
}

const nullableNumber = (value: unknown): value is number | null =>
    value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)

/** Legge un `run` salvato con il messaggio. Una forma che non torna e' «non registrato», non un errore. */
export function talosReadRunRecord(metadata: Readonly<Record<string, unknown>> | null | undefined): TalosRunRecord | null {
    const raw = metadata?.run as Partial<TalosRunRecord> | undefined
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null
    const tokens = raw.tokens as Partial<TalosRunTokens> | undefined
    if (
        typeof raw.provider !== 'string' || typeof raw.model !== 'string'
        || typeof raw.rounds !== 'number' || !tokens
        || !nullableNumber(tokens.input) || !nullableNumber(tokens.output)
        || !nullableNumber(tokens.reasoning) || !nullableNumber(tokens.cached)
        || !nullableNumber(raw.reportedCostUsd) || typeof raw.reportedCostRounds !== 'number'
        || !Array.isArray(raw.callIds) || typeof raw.startedAt !== 'string'
        || !nullableNumber(raw.firstChunkMs) || !nullableNumber(raw.totalMs)
    ) return null
    return raw as TalosRunRecord
}
