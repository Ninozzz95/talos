import { describe, expect, it } from 'vitest'
import * as superficie from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/error-surface.mjs'

/**
 * ⛔ ERRCOD (30/09/2026) — ledger `.claude/ragionamento/LEDGER-ERRORI-CODICE-2026-09-30.md`, dossier
 * `.claude/ricerche/2026-09-30-errori-codice-10x4.md`. Owner: «che indovini tutti gli errori possibili e immaginabili».
 * Ogni riga della tassonomia è una prova: il descrittore si decide dalla STRUTTURA (stato HTTP, `error_type` di
 * OpenRouter, `cause.code`, codice del server), mai da una regex sul testo libero (regola della 65).
 */

type Descrittore = {
    schema: string, layer: string, code: string, retryable: boolean | null, action: string,
    status?: number, provider?: string, model?: string, detail?: string, midStream?: boolean,
}
const { descriviErrore, descrittorePerFineGiro, mascheraSegreti } = superficie as unknown as {
    descriviErrore(errore: unknown, contesto?: { provider?: string, model?: string }): Descrittore
    descrittorePerFineGiro(esito: { comeFinita: string, fermatoDallaPersona?: boolean }): Descrittore | null
    mascheraSegreti(testo: string): string
}

function http(stato: number, errore?: Record<string, unknown>) {
    const corpo = errore ? JSON.stringify({ error: errore }) : `errore ${stato}`
    return Object.assign(new Error(`HTTP ${stato} dopo 4 tentativi: ${corpo}`), { fase: 'http', stato, corpo, erroreFornitore: errore ?? null })
}
const tipo = (stato: number, errorType: string) => http(stato, { code: stato, message: 'x', metadata: { error_type: errorType } })
function rete(code: string) {
    return Object.assign(new TypeError('fetch failed'), { fase: 'rete', cause: Object.assign(new Error(code), { code }) })
}

const TABELLA: Array<[string, unknown, Partial<Descrittore>]> = [
    ['401', http(401, { code: 401, message: 'User not found.' }), { code: 'PROVIDER_AUTH', layer: 'provider', retryable: false, action: 'provider-keys', status: 401 }],
    ['authentication', tipo(401, 'authentication'), { code: 'PROVIDER_AUTH' }],
    ['402', http(402, { code: 402, message: 'Insufficient credits' }), { code: 'PROVIDER_BILLING', retryable: false, action: 'none' }],
    ['403 permesso', tipo(403, 'permission_denied'), { code: 'PROVIDER_FORBIDDEN', layer: 'policy', action: 'pick-model' }],
    ['403 moderazione', http(403, { code: 403, message: 'flagged', metadata: { reasons: ['violence'], flagged_input: '…' } }), { code: 'PROVIDER_CONTENT_POLICY', layer: 'policy', retryable: false, action: 'none' }],
    ['403 content_policy_violation', tipo(403, 'content_policy_violation'), { code: 'PROVIDER_CONTENT_POLICY' }],
    ['403 refusal', tipo(403, 'refusal'), { code: 'PROVIDER_CONTENT_POLICY' }],
    ['404', http(404, { code: 404, message: 'No endpoints found' }), { code: 'PROVIDER_MODEL_NOT_FOUND', action: 'pick-model' }],
    ['contesto', tipo(400, 'context_length_exceeded'), { code: 'PROVIDER_CONTEXT_TOO_LONG', retryable: false, action: 'new-session' }],
    ['token_limit', tipo(400, 'token_limit_exceeded'), { code: 'PROVIDER_CONTEXT_TOO_LONG' }],
    ['string_too_long', tipo(400, 'string_too_long'), { code: 'PROVIDER_CONTEXT_TOO_LONG' }],
    ['max_tokens', tipo(400, 'max_tokens_exceeded'), { code: 'PROVIDER_OUTPUT_LIMIT', retryable: true, action: 'continue' }],
    ['413', http(413), { code: 'PROVIDER_PAYLOAD_TOO_LARGE', action: 'new-session' }],
    ['immagine', tipo(400, 'image_too_large'), { code: 'PROVIDER_IMAGE', layer: 'validator' }],
    ['formato immagine', tipo(400, 'unsupported_image_format'), { code: 'PROVIDER_IMAGE' }],
    ['400', http(400, { code: 400, message: 'bad' }), { code: 'PROVIDER_BAD_REQUEST', layer: 'validator', action: 'pick-model' }],
    ['422', http(422), { code: 'PROVIDER_BAD_REQUEST' }],
    ['429', http(429), { code: 'PROVIDER_RATE_LIMIT', retryable: true, action: 'retry' }],
    ['503', http(503), { code: 'PROVIDER_OVERLOADED', retryable: true, action: 'retry' }],
    ['529', http(529), { code: 'PROVIDER_OVERLOADED' }],
    ['502', http(502), { code: 'PROVIDER_UNAVAILABLE', retryable: true, action: 'pick-model' }],
    ['408', http(408), { code: 'PROVIDER_TIMEOUT', layer: 'network', retryable: true, action: 'retry' }],
    ['504', http(504), { code: 'PROVIDER_TIMEOUT' }],
    ['500', http(500), { code: 'PROVIDER_SERVER', retryable: true, action: 'retry' }],
    ['520', http(520), { code: 'PROVIDER_SERVER' }],
    ['unmapped', tipo(500, 'unmapped'), { code: 'PROVIDER_SERVER' }],
    ['flusso 502', Object.assign(new Error('flusso'), { fase: 'flusso', stato: 502, erroreFornitore: { code: 502, message: 'x', metadata: { error_type: 'provider_unavailable' } } }), { code: 'PROVIDER_UNAVAILABLE', midStream: true }],
    ['flusso contesto', Object.assign(new Error('flusso'), { fase: 'flusso', stato: 400, erroreFornitore: { code: 400, message: 'x', metadata: { error_type: 'context_length_exceeded' } } }), { code: 'PROVIDER_CONTEXT_TOO_LONG', midStream: true }],
    ['vuoto', Object.assign(new Error('flusso SSE senza contenuto'), { fase: 'vuoto' }), { code: 'PROVIDER_EMPTY', retryable: true, action: 'retry' }],
    ['ENOTFOUND', rete('ENOTFOUND'), { code: 'NETWORK_OFFLINE', layer: 'network', retryable: true, action: 'retry' }],
    ['EAI_AGAIN', rete('EAI_AGAIN'), { code: 'NETWORK_OFFLINE' }],
    ['ENETUNREACH', rete('ENETUNREACH'), { code: 'NETWORK_OFFLINE' }],
    ['certificato', rete('CERT_HAS_EXPIRED'), { code: 'NETWORK_TLS', retryable: false, action: 'none' }],
    ['firma', rete('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), { code: 'NETWORK_TLS' }],
    ['ECONNREFUSED', rete('ECONNREFUSED'), { code: 'NETWORK_REFUSED', retryable: true }],
    ['ECONNRESET', rete('ECONNRESET'), { code: 'NETWORK_REFUSED' }],
    ['UND_ERR_SOCKET', rete('UND_ERR_SOCKET'), { code: 'NETWORK_REFUSED' }],
    ['ETIMEDOUT', rete('ETIMEDOUT'), { code: 'NETWORK_TIMEOUT', retryable: true, action: 'retry' }],
    ['UND_ERR_CONNECT_TIMEOUT', rete('UND_ERR_CONNECT_TIMEOUT'), { code: 'NETWORK_TIMEOUT' }],
    ['AbortSignal.timeout', Object.assign(new DOMException('The operation was aborted due to timeout', 'TimeoutError'), { fase: 'rete' }), { code: 'NETWORK_TIMEOUT' }],
    ['chiave mancante', Object.assign(new Error('Chiave API non configurata'), { code: 'CONFIG_INVALID' }), { code: 'PROVIDER_KEY_MISSING', action: 'provider-keys' }],
    ['sessione non pronta', { code: 'SESSION_NOT_READY' }, { code: 'SESSION_NOT_READY', layer: 'system', action: 'new-session' }],
    ['sessione assente', { code: 'NOT_FOUND' }, { code: 'SESSION_NOT_FOUND', action: 'new-session' }],
    ['richiesta non valida', { code: 'QUERY_INVALID' }, { code: 'REQUEST_INVALID', layer: 'validator', action: 'none' }],
    ['corpo troppo grande', { code: 'PAYLOAD_LIMIT' }, { code: 'REQUEST_INVALID' }],
    ['bug', new RangeError('Invalid array length'), { code: 'UNKNOWN', layer: 'system', retryable: null, action: 'new-session' }],
    ['niente', undefined, { code: 'UNKNOWN' }],
    ['stringa', 'qualcosa di strano', { code: 'UNKNOWN' }],
]

describe('ERRCOD-SURFACE — ogni errore diventa un descrittore, e ogni descrittore ha una via d\'uscita', () => {
    for (const [nome, errore, atteso] of TABELLA) {
        it(`ERRCOD-SURFACE ${nome} → ${atteso.code}`, () => {
            const descrittore = descriviErrore(errore, { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' })
            expect(descrittore).toMatchObject({ schema: 'talos.codice-errore.v1', ...atteso })
        })
    }

    it('ERRCOD-SURFACE-SEMPRE: qualunque cosa riceva, non lancia e ha sempre layer, code, action e un dettaglio stringa', () => {
        const strani: unknown[] = [null, 0, Symbol('x'), { get code() { throw new Error('getter') } }, Object.create(null), [1, 2], () => 1]
        for (const strano of strani) {
            const descrittore = descriviErrore(strano)
            expect(typeof descrittore.layer).toBe('string')
            expect(typeof descrittore.code).toBe('string')
            expect(typeof descrittore.action).toBe('string')
            expect(typeof descrittore.detail).toBe('string')
        }
    })

    it('ERRCOD-SURFACE-IDENTITA: fornitore e modello del giro viaggiano sul descrittore', () => {
        expect(descriviErrore(http(429), { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }))
            .toMatchObject({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash' })
    })

    it('ERRCOD-SURFACE-DETTAGLIO: il dettaglio è il testo grezzo, tagliato a 500 caratteri e senza chiavi', () => {
        const corpo = `Bearer sk-or-v1-${'a'.repeat(64)} ${'x'.repeat(800)}`
        const descrittore = descriviErrore(Object.assign(new Error(corpo), { fase: 'http', stato: 401, corpo }))
        expect(descrittore.detail.length).toBeLessThanOrEqual(500)
        expect(descrittore.detail).not.toMatch(/sk-or-v1-a{8}/)
        expect(descrittore.detail).not.toMatch(/Bearer sk/)
    })

    it('ERRCOD-SURFACE-MASCHERA: le chiavi note si coprono, il resto del testo resta', () => {
        expect(mascheraSegreti('key sk-or-v1-0123456789abcdef0123 rifiutata')).toBe('key sk-… rifiutata')
        expect(mascheraSegreti('Authorization: Bearer abc.def.ghi')).toBe('Authorization: Bearer …')
        expect(mascheraSegreti('nessun segreto qui')).toBe('nessun segreto qui')
    })
})

describe('ERRCOD-FINEGIRO — come è finito il giro', () => {
    it('ERRCOD-FINEGIRO-01 giri esauriti: si può continuare', () => {
        expect(descrittorePerFineGiro({ comeFinita: 'giri-esauriti' })).toMatchObject({ code: 'RUN_STEP_LIMIT', layer: 'worker', retryable: true, action: 'continue' })
    })
    it('ERRCOD-FINEGIRO-02 lo Stop della persona NON è un errore', () => {
        expect(descrittorePerFineGiro({ comeFinita: 'fermato', fermatoDallaPersona: true })).toMatchObject({ code: 'RUN_STOPPED', layer: 'none', action: 'none' })
    })
    it('ERRCOD-FINEGIRO-03 fermo senza risposta e senza Stop: si riprova', () => {
        expect(descrittorePerFineGiro({ comeFinita: 'fermato' })).toMatchObject({ code: 'RUN_NO_ANSWER', layer: 'worker', retryable: true, action: 'retry' })
    })
    it('ERRCOD-FINEGIRO-04 concluso: nessun descrittore', () => {
        expect(descrittorePerFineGiro({ comeFinita: 'concluso' })).toBeNull()
    })
})

// ⛔ ERRCOD-SERVER: dal fornitore finto fino all'evento RunError, attraverso il server e il kernel spedito.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { avviaSessione } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/agent-service.mjs'

const cartelleServer: string[] = []
afterEach(() => { for (const c of cartelleServer.splice(0)) rmSync(c, { recursive: true, force: true }) })

async function sessioneCon(fetchFinta: () => Promise<Response>, opzioni: Record<string, unknown> = {}) {
    const cartella = mkdtempSync(join(tmpdir(), 'codice-errcod-'))
    cartelleServer.push(cartella)
    const eventi: Array<Record<string, unknown>> = []
    await avviaSessione({
        cartella, task: { consegna: 'prova' }, modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta-mai-usata-in-rete',
        onEvento: (e: Record<string, unknown>) => eventi.push(e),
        creaFetchMultiProviderFn: () => fetchFinta,
        politicaRagionamentoFn: async () => null,
        leggiContestoWorkspaceFn: () => ({}),
        ...opzioni,
    })
    return eventi.find((e) => e.type === 'RunError') as { code?: string, message?: string, errore?: Descrittore } | undefined
}

describe('ERRCOD-SERVER — il RunError porta il descrittore', () => {
    it('ERRCOD-SERVER-01 un 401 del fornitore arriva come PROVIDER_AUTH con l\'azione «chiavi dei fornitori»', async () => {
        const corpo = JSON.stringify({ error: { message: 'User not found.', code: 401 } })
        const errore = await sessioneCon(async () => new Response(corpo, { status: 401 }))
        expect(errore?.code).toBe('internal-error')
        expect(errore?.errore).toMatchObject({ code: 'PROVIDER_AUTH', action: 'provider-keys', status: 401, model: 'z-ai/glm-5.3-flash' })
    })

    it('ERRCOD-SERVER-02 un errore nello stream arriva come errore del fornitore, non come «flusso vuoto»', async () => {
        const pacchetto = { error: { code: 503, message: 'overloaded', metadata: { error_type: 'provider_overloaded' } }, choices: [{ index: 0, delta: {}, finish_reason: 'error' }] }
        const errore = await sessioneCon(async () => new Response(`data: ${JSON.stringify(pacchetto)}\n\n`, { status: 200 }))
        expect(errore?.errore).toMatchObject({ code: 'PROVIDER_OVERLOADED', midStream: true, action: 'retry' })
    })

    it('ERRCOD-SERVER-03 lo Stop della persona arriva come RUN_STOPPED, non come errore', async () => {
        const controller = new AbortController()
        controller.abort()
        const errore = await sessioneCon(async () => new Response('data: [DONE]\n\n', { status: 200 }), { segnaleStop: controller.signal })
        expect(errore?.errore).toMatchObject({ code: 'RUN_STOPPED', layer: 'none' })
    })
})

// ⛔ ERRCOD-RIPRESA lato server (trovato sul Pad il 30/09: «Invio non riuscito: Sessione non pronta per questa azione»).
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'

describe('ERRCOD-RIPRESA — dopo un errore del modello la sessione si riprende', () => {
    it('ERRCOD-RIPRESA-02 avviaSessione restituisce la conversazione anche quando il modello fallisce', async () => {
        const cartella = mkdtempSync(join(tmpdir(), 'codice-ripresa-'))
        cartelleServer.push(cartella)
        const corpo = JSON.stringify({ error: { message: 'User not found.', code: 401 } })
        const risultato = await avviaSessione({
            cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'chiave-finta-mai-usata-in-rete', onEvento: () => {},
            creaFetchMultiProviderFn: () => async () => new Response(corpo, { status: 401 }),
            politicaRagionamentoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
        }) as { ok: boolean, messaggiFinali?: Array<{ role: string }> }
        expect(risultato.ok).toBe(false)
        expect(risultato.messaggiFinali?.at(-1)?.role).toBe('user')
    })

    it('ERRCOD-RIPRESA-03 il registro conserva quella conversazione: resume() riparte invece di dire «non pronta»', async () => {
        let chiamate = 0
        const registro = createSessionRegistry({
            cartellaStore: '/finta', chiave: 'chiave-finta-mai-usata-in-rete',
            registraRigaFn: async () => undefined, elencaSessioniPersistiteFn: async () => [],
            preparaEsecuzioneLiberaFn: () => ({ cartella: '/finta/workspace', task: { consegna: 'ciao' }, comandoProva: null }),
            avviaSessioneFn: async () => {
                chiamate += 1
                return chiamate === 1
                    ? { threadId: 't', runId: 'r', ok: false, esito: null, erroreInterno: 'HTTP 401', messaggiFinali: [{ role: 'system', content: 's' }, { role: 'user', content: 'ciao' }] }
                    : { threadId: 't', runId: 'r2', ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] }, erroreInterno: null }
            },
        } as never)
        const avvio = registro.avviaLibero({ cartellaId: 'workspace', consegna: 'ciao', modello: 'z-ai/glm-5.3-flash', mobile: true } as never) as { sessionId: string }
        await new Promise((ok) => setTimeout(ok, 0))
        const ripresa = registro.resume(avvio.sessionId) as { erroreAvvio?: string, code?: string }
        expect(ripresa.code).toBeUndefined()
        await new Promise((ok) => setTimeout(ok, 0))
        expect(chiamate).toBe(2)
    })
})

// ⛔ ERRCOD-E2 lato server: anche la risposta d'errore HTTP del server del Codice porta il descrittore.
import { createServer as creaServerHttp } from 'node:http'
import { createHttpApp } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'

describe('ERRCOD-E2-SERVER — l’envelope d’errore porta il descrittore', () => {
    it('ERRCOD-E2-SERVER-01 riprendere una sessione che non c’è risponde con SESSION_NOT_FOUND e l’azione «sessione nuova»', async () => {
        const registro = createSessionRegistry({
            cartellaStore: '/finta', chiave: 'chiave-finta-mai-usata-in-rete',
            registraRigaFn: async () => undefined, elencaSessioniPersistiteFn: async () => [],
        } as never)
        // ⛔ 70-A (30/09/2026): il server vuole il suo segreto (vedi codiceServerProtetto.test.ts).
        const segreto = 'd'.repeat(64)
        const app = createHttpApp({ campaignService: { list: async () => [], get: async () => null }, staticHandler: async () => null, sessionRegistry: registro, segreto } as never)
        const server = creaServerHttp(app as never)
        await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
        try {
            const porta = (server.address() as { port: number }).port
            const risposta = await fetch(`http://127.0.0.1:${porta}/api/v1/sessions/non-esiste/resume`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${segreto}` }, body: '{}',
            })
            const busta = await risposta.json() as { ok: boolean, error: { code: string, errore?: Descrittore } }
            expect(busta.ok).toBe(false)
            expect(busta.error.code).toBe('NOT_FOUND')
            expect(busta.error.errore).toMatchObject({ schema: 'talos.codice-errore.v1', code: 'SESSION_NOT_FOUND', action: 'new-session' })
        } finally {
            server.close()
        }
    })
})

describe('ERRCOD-E3-SERVER — il perché di un attrezzo fallito arriva alla UI', () => {
    it('ERRCOD-E3-SERVER-01 una nota che non c’è arriva come ToolCallResult con errorCode NOT_FOUND', async () => {
        const cartella = mkdtempSync(join(tmpdir(), 'codice-e3-'))
        cartelleServer.push(cartella)
        const eventi: Array<Record<string, unknown>> = []
        let chiamate = 0
        const chiamataNota = { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'notes_delete', arguments: '{"id":"x"}' } }] }
        await avviaSessione({
            cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'chiave-finta-mai-usata-in-rete',
            onEvento: (e: Record<string, unknown>) => eventi.push(e), strumentiEstesi: ['notes_delete'],
            eliminaNotaFn: async () => { throw new Error('TALOS_NOTE_NOT_FOUND') },
            creaFetchMultiProviderFn: () => async () => {
                chiamate += 1
                const delta = chiamate === 1 ? chiamataNota : { content: 'fatto' }
                return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, { status: 200 })
            },
            politicaRagionamentoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
        })
        expect(eventi.find((e) => e.type === 'ToolCallResult')).toMatchObject({ isError: true, errorCode: 'NOT_FOUND' })
    })
})
