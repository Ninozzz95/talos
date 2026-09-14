import type { TalosModelPrice } from '@/lib/chat/runCost'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

/**
 * Il listino pubblico di OpenRouter, per la STIMA del costo dei fornitori diretti.
 *
 * Decisione dell'owner, 13/09: «si scarica anche senza account OpenRouter, come richiesta
 * pubblica anonima (nessun dato, nessuna chiave), al massimo una volta al giorno, tenuto
 * sul telefono. Senza rete: l'ultimo listino salvato, o "non disponibile"».
 *
 * `GET https://openrouter.ai/api/v1/models` risponde senza autenticazione, coi prezzi in
 * `pricing.prompt/completion/input_cache_read` — stringhe in USD per token (verificato sul
 * listino vero il 2026-09-13).
 *
 * ⛔ «Al massimo una volta al giorno» vale anche per i TENTATIVI: senza rete non si riprova
 * a ogni apertura del foglio. Si registra quando si e' provato, non solo quando e' riuscito.
 */
export const TALOS_OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const CACHE_KEY = 'talos.openrouter.pricelist.v1'
const DAY_MS = 24 * 60 * 60 * 1000

export interface TalosPriceList {
    /** Il giorno del listino (YYYY-MM-DD), da mostrare accanto alla parola «stima». */
    date: string
    prices: ReadonlyMap<string, TalosModelPrice>
}

export interface TalosPriceListPorts {
    transport: TalosMobileHttpTransport
    storage: { get(key: string): Promise<string | null>, set(key: string, value: string): Promise<void> }
    now: () => number
}

interface Stored {
    attemptedAt: number
    fetchedAt: number | null
    date: string | null
    prices: Array<[string, TalosModelPrice]>
}

function toPrice(raw: unknown): TalosModelPrice | null {
    if (!raw || typeof raw !== 'object') return null
    const pricing = raw as Record<string, unknown>
    const number = (value: unknown): number | null => {
        const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    }
    const prompt = number(pricing.prompt)
    const completion = number(pricing.completion)
    // Un modello senza prezzo di ingresso o di uscita non si stima: meglio «non comunicato».
    if (prompt === null || completion === null) return null
    return { prompt, completion, cacheRead: number(pricing.input_cache_read) }
}

export function talosParseOpenRouterPrices(data: unknown): Map<string, TalosModelPrice> {
    const prices = new Map<string, TalosModelPrice>()
    const list = (data as { data?: unknown } | null)?.data
    if (!Array.isArray(list)) return prices
    for (const model of list) {
        const id = (model as { id?: unknown } | null)?.id
        const price = toPrice((model as { pricing?: unknown } | null)?.pricing)
        if (typeof id === 'string' && id && price) prices.set(id, price)
    }
    return prices
}

function readStored(raw: string | null): Stored | null {
    if (!raw) return null
    try {
        const value = JSON.parse(raw) as Stored
        return typeof value?.attemptedAt === 'number' && Array.isArray(value.prices) ? value : null
    } catch {
        return null
    }
}

const toList = (stored: Stored | null): TalosPriceList | null =>
    stored && stored.date && stored.prices.length ? { date: stored.date, prices: new Map(stored.prices) } : null

export async function talosLoadOpenRouterPriceList(ports: TalosPriceListPorts): Promise<TalosPriceList | null> {
    const stored = readStored(await ports.storage.get(CACHE_KEY).catch(() => null))
    const now = ports.now()
    if (stored && now - stored.attemptedAt < DAY_MS) return toList(stored)
    const attempt: Stored = { ...(stored ?? { fetchedAt: null, date: null, prices: [] }), attemptedAt: now }
    try {
        // Anonima di proposito: nessuna intestazione, nessuna chiave.
        const response = await ports.transport.request({ method: 'GET', url: TALOS_OPENROUTER_MODELS_URL, connectTimeout: 10_000, readTimeout: 20_000 })
        const prices = response.status >= 200 && response.status < 300 ? talosParseOpenRouterPrices(response.data) : new Map()
        if (prices.size > 0) {
            attempt.fetchedAt = now
            attempt.date = new Date(now).toISOString().slice(0, 10)
            attempt.prices = [...prices]
        }
    } catch {
        // Senza rete: resta l'ultimo listino salvato, se c'e'.
    }
    await ports.storage.set(CACHE_KEY, JSON.stringify(attempt)).catch(() => undefined)
    return toList(attempt)
}

/** Le porte vere: il trasporto nativo gia' usato per i cataloghi, e Preferences. */
export async function talosDefaultPriceListPorts(): Promise<TalosPriceListPorts> {
    const [{ talosMobileHttpTransport }, { Preferences }] = await Promise.all([
        import('@/lib/chat/httpTransport'),
        import('@capacitor/preferences'),
    ])
    return {
        transport: talosMobileHttpTransport,
        storage: {
            get: async (key) => (await Preferences.get({ key })).value,
            set: async (key, value) => { await Preferences.set({ key, value }) },
        },
        now: () => Date.now(),
    }
}
