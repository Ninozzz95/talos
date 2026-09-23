import type { TalosRunRecord } from '@/lib/chat/runDetails'

/**
 * Il costo di un giro, come lo mostra «Dettagli esecuzione» — decisione dell'owner, 13/09:
 *
 * - **vero** per le chiamate via OpenRouter: `usage.cost`, che OpenRouter manda sempre
 *   (openrouter.ai/docs/use-cases/usage-accounting, letto il 2026-09-13);
 * - **«gratis, sul telefono»** per il motore locale;
 * - **stima**, marcata come tale, per i fornitori diretti, coi prezzi pubblici del listino
 *   OpenRouter (`pricing.prompt/completion/input_cache_read`, USD per token, stringhe);
 * - **non comunicato** quando il modello non ha un prezzo nel listino, o il listino non c'e'.
 *
 * ⛔ La parola «stima» non e' decorazione: il prezzo diretto puo' differire da quello
 * elencato su OpenRouter, ed e' la condizione perche' il numero sia onesto.
 */
export interface TalosModelPrice {
    prompt: number
    completion: number
    cacheRead: number | null
}

export type TalosRunCost =
    | { kind: 'real', usd: number }
    | { kind: 'free' }
    | { kind: 'estimate', usd: number, priceListDate: string }
    | { kind: 'unknown' }

/** Il prefisso con cui OpenRouter elenca i modelli di ogni fornitore diretto. */
const OPENROUTER_PREFIX: Readonly<Record<string, string>> = {
    anthropic: 'anthropic',
    openai: 'openai',
    gemini: 'google',
    deepseek: 'deepseek',
}

/**
 * Gli id con cui cercare nel listino un modello usato DIRETTAMENTE.
 *
 * Misurato sul listino il 13/09: Anthropic diretto `claude-fable-5-1`, su OpenRouter
 * `anthropic/claude-fable-5.1`; le versioni datate (`claude-haiku-4-5-20251001`) vi
 * compaiono senza data. Si provano solo trasformazioni che cambiano la FORMA dell'id,
 * mai il modello: nessuna ricerca per somiglianza, che pescherebbe il prezzo di un altro.
 */
export function talosOpenRouterCandidates(provider: string, modelId: string): string[] {
    if (provider === 'openrouter') return [modelId]
    const prefix = OPENROUTER_PREFIX[provider]
    if (!prefix) return []
    const bare = modelId.includes('/') ? modelId.slice(modelId.indexOf('/') + 1) : modelId
    const senzaData = bare.replace(/-\d{8}$/, '')
    const conPunto = senzaData.replace(/-(\d+)-(\d+)$/, '-$1.$2')
    return [...new Set([bare, senzaData, conPunto])].map((id) => `${prefix}/${id}`)
}

export function talosResolveRunCost(
    run: TalosRunRecord,
    priceList: { date: string, prices: ReadonlyMap<string, TalosModelPrice> } | null,
): TalosRunCost {
    if (run.provider === 'local') return { kind: 'free' }
    if (run.provider === 'openrouter' && run.reportedCostUsd !== null && run.rounds > 0 && run.reportedCostRounds === run.rounds) {
        return { kind: 'real', usd: run.reportedCostUsd }
    }
    if (!priceList) return { kind: 'unknown' }
    const price = talosOpenRouterCandidates(run.provider, run.model)
        .map((id) => priceList.prices.get(id))
        .find((found): found is TalosModelPrice => found !== undefined)
    const { input, output, cached } = run.tokens
    if (!price || input === null || output === null) return { kind: 'unknown' }
    /*
     * Anthropic conta i token letti dalla cache FUORI da `input_tokens`; OpenAI, OpenRouter,
     * DeepSeek e Gemini li contano DENTRO. Senza questa distinzione la stima di Anthropic
     * sottrarrebbe due volte la parte in cache.
     */
    const lettiDallaCache = cached ?? 0
    const pieni = run.provider === 'anthropic' ? input : Math.max(0, input - lettiDallaCache)
    const usd = pieni * price.prompt
        + lettiDallaCache * (price.cacheRead ?? price.prompt)
        + output * price.completion
    return { kind: 'estimate', usd, priceListDate: priceList.date }
}
