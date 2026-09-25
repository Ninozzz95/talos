import { describe, expect, it } from 'vitest'
import * as moduloCatalogo from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/model-catalog.mjs'
import * as moduloHttp from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'

/**
 * ⭐ CATALOGO-MODELLI (owner 25/09/2026, «Portare la rotta dal desktop»; dossier
 * `.claude/ricerche/2026-09-25-punto-6-decisioni-10x4.md`).
 *
 * Misurato sul Pad: il server del Codice mobile rispondeva 404 a `GET /api/v1/models`, e il selettore del modello del
 * Codice non poteva elencare niente. La rotta viene dal desktop (`AVM-harness-desktop/harness-ui/src/model-catalog.mjs`,
 * letto il 25/09/2026, sola lettura), SENZA il catalogo di riserva (`provider-registry.mjs` sul telefono non c'è): senza
 * rete e senza copia salvata la rotta lo dice (`CATALOG_UNREACHABLE`, 503), non inventa un elenco.
 * Catalogo vero misurato il 25/09/2026 senza chiave: HTTP 200, 460 modelli, 18 id con la tilde.
 */

type Modello = { id: string, provider: string, alias: boolean, nome: string, contextLength: number | null }
type Esito = { modelli: Modello[], daCache: boolean, aggiornatoAlle: string | null, fallbackRete?: boolean }
type Catalogo = { ottieni(o?: { forzaAggiornamento?: boolean }): Promise<Esito> }
const { createModelCatalog } = moduloCatalogo as unknown as {
    createModelCatalog(o: Record<string, unknown>): Catalogo
}
const { createHttpApp } = moduloHttp as unknown as {
    createHttpApp(o: Record<string, unknown>): (req: unknown, res: unknown) => Promise<void>
}

const GREZZI = [
    { id: 'z-ai/glm-5.3-flash', name: 'Z.ai: GLM 5.3 Flash', context_length: 200000, pricing: { prompt: '0.0000001', completion: '0.0000004' } },
    { id: '~anthropic/claude-latest', name: 'Anthropic: Claude (latest)', context_length: 1000000 },
    { id: 'anthropic/claude-opus-5-5', name: 'Anthropic: Claude Opus 5.5' },
    { name: 'senza id' },
]

function rispostaFinta(corpo: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => corpo }
}

function fetchContato(esito: () => Promise<unknown>) {
    const chiamate: { url: string, init: Record<string, unknown> }[] = []
    const fn = async (url: string, init: Record<string, unknown>) => { chiamate.push({ url, init }); return esito() }
    return { fn, chiamate }
}

describe('CATALOGO-MODELLI: il catalogo OpenRouter nel server del Codice', () => {
    it('CAT-MOD-01: normalizza, tiene la tilde nell\'id ma non nel fornitore, scarta le voci senza id, ordina', async () => {
        const rete = fetchContato(async () => rispostaFinta({ data: GREZZI }))
        const { modelli, daCache } = await createModelCatalog({ fetchFn: rete.fn }).ottieni()
        expect(daCache).toBe(false)
        expect(modelli.map((m) => m.id)).toEqual(['~anthropic/claude-latest', 'anthropic/claude-opus-5-5', 'z-ai/glm-5.3-flash'])
        expect(modelli[0]).toMatchObject({ provider: 'anthropic', alias: true, contextLength: 1000000 })
        expect(modelli[2]).toMatchObject({ nome: 'Z.ai: GLM 5.3 Flash', provider: 'z-ai', alias: false })
    })

    it('CAT-MOD-02: il catalogo è pubblico — nessuna chiave, nessuna intestazione Authorization', async () => {
        const rete = fetchContato(async () => rispostaFinta({ data: GREZZI }))
        await createModelCatalog({ fetchFn: rete.fn }).ottieni()
        expect(rete.chiamate).toHaveLength(1)
        expect(rete.chiamate[0]!.url).toBe('https://openrouter.ai/api/v1/models')
        expect(JSON.stringify(rete.chiamate[0]!.init.headers ?? {})).not.toMatch(/authorization/i)
    })

    it('CAT-MOD-03: dentro la validità risponde dalla copia; «forza» rifà la lettura', async () => {
        let adesso = new Date('2026-09-25T10:00:00.000Z')
        const rete = fetchContato(async () => rispostaFinta({ data: GREZZI }))
        const catalogo = createModelCatalog({ fetchFn: rete.fn, clock: () => adesso })
        await catalogo.ottieni()
        adesso = new Date(adesso.getTime() + 60_000)
        expect((await catalogo.ottieni()).daCache).toBe(true)
        expect(rete.chiamate).toHaveLength(1)
        expect((await catalogo.ottieni({ forzaAggiornamento: true })).daCache).toBe(false)
        expect(rete.chiamate).toHaveLength(2)
    })

    it('CAT-MOD-04: senza rete e senza copia lo dice (CATALOG_UNREACHABLE), non inventa un elenco', async () => {
        const catalogo = createModelCatalog({ fetchFn: async () => { throw new TypeError('fetch failed') } })
        await expect(catalogo.ottieni()).rejects.toMatchObject({ name: 'ModelCatalogError', code: 'CATALOG_UNREACHABLE' })
    })

    it('CAT-MOD-05: una risposta sbagliata di OpenRouter è CATALOG_UPSTREAM_ERROR', async () => {
        await expect(createModelCatalog({ fetchFn: async () => rispostaFinta({}, false, 502) }).ottieni())
            .rejects.toMatchObject({ code: 'CATALOG_UPSTREAM_ERROR' })
        await expect(createModelCatalog({ fetchFn: async () => rispostaFinta({ data: 'no' }) }).ottieni())
            .rejects.toMatchObject({ code: 'CATALOG_UPSTREAM_ERROR' })
    })

    it('CAT-MOD-06: con una copia salvata e la rete giù risponde con la copia, dichiarandolo', async () => {
        let adesso = new Date('2026-09-25T10:00:00.000Z')
        let giu = false
        const catalogo = createModelCatalog({
            fetchFn: async () => { if (giu) throw new TypeError('fetch failed'); return rispostaFinta({ data: GREZZI }) },
            clock: () => adesso,
        })
        await catalogo.ottieni()
        giu = true
        adesso = new Date(adesso.getTime() + 60 * 60_000)
        const esito = await catalogo.ottieni()
        expect(esito).toMatchObject({ daCache: true, fallbackRete: true })
        expect(esito.modelli).toHaveLength(3)
    })
})

/** Una richiesta e una risposta finte, abbastanza per `createHttpApp`. */
async function chiama(app: (req: unknown, res: unknown) => Promise<void>, url: string) {
    const risposta = { status: 0, corpo: '', destroyed: false, writableEnded: false }
    const res = {
        get destroyed() { return risposta.destroyed },
        get writableEnded() { return risposta.writableEnded },
        setHeader() {},
        writeHead(status: number) { risposta.status = status },
        end(payload?: Buffer) { risposta.corpo = payload ? payload.toString('utf8') : ''; risposta.writableEnded = true },
    }
    await app({ method: 'GET', url, headers: {}, aborted: false }, res)
    return { status: risposta.status, json: JSON.parse(risposta.corpo) as Record<string, any> }
}

function app(catalogoModelliFn: unknown) {
    return createHttpApp({
        campaignService: { listCampaigns: async () => [] },
        staticHandler: async () => undefined,
        catalogoModelliFn,
    })
}

describe('CATALOGO-MODELLI: la rotta GET /api/v1/models', () => {
    it('ROTTA-MOD-01: risponde col catalogo; «?forza=1» chiede la lettura nuova', async () => {
        const richieste: unknown[] = []
        const fn = async (opzioni: unknown) => { richieste.push(opzioni); return { modelli: [{ id: 'z-ai/glm-5.3-flash', nome: 'Z.ai: GLM 5.3 Flash' }], daCache: false, aggiornatoAlle: null } }
        const semplice = await chiama(app(fn), '/api/v1/models')
        expect(semplice.status).toBe(200)
        expect(semplice.json.data.modelli[0].nome).toBe('Z.ai: GLM 5.3 Flash')
        await chiama(app(fn), '/api/v1/models?forza=1')
        expect(richieste).toEqual([{ forzaAggiornamento: false }, { forzaAggiornamento: true }])
    })

    it('ROTTA-MOD-02: una chiave di query sconosciuta è 400', async () => {
        const risposta = await chiama(app(async () => ({ modelli: [] })), '/api/v1/models?x=1')
        expect(risposta.status).toBe(400)
        expect(risposta.json.error.code).toBe('QUERY_INVALID')
    })

    it('ROTTA-MOD-03: il catalogo irraggiungibile arriva al Codice come 503 col suo codice', async () => {
        const fallisce = async () => { const e = new Error('giù') as Error & { code: string }; e.code = 'CATALOG_UNREACHABLE'; throw e }
        const risposta = await chiama(app(fallisce), '/api/v1/models')
        expect(risposta.status).toBe(503)
        expect(risposta.json.error).toMatchObject({ code: 'CATALOG_UNREACHABLE', message: 'Catalogo modelli non raggiungibile' })
    })
})

describe('CATALOGO-MODELLI: il server del telefono passa il catalogo alla rotta', () => {
    it('ROTTA-MOD-04: server.mjs costruisce il catalogo e lo dà a createHttpApp', async () => {
        const { readFileSync } = await import('node:fs')
        const sorgente = readFileSync(new URL('../../../android/app/src/main/assets/talos-harness-ui/harness-ui/server.mjs', import.meta.url), 'utf8')
        expect(sorgente).toMatch(/import \{ createModelCatalog \} from '\.\/src\/model-catalog\.mjs'/)
        expect(sorgente).toMatch(/catalogoModelliFn: \(opzioni\) => catalogoModelli\.ottieni\(opzioni\)/)
    })
})
