/*
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70 «MobileOriginCapacitor OPEN») — il server del Codice risponde solo a TALOS.
 *
 * Misurato con la sonda del 30/09: un POST `text/plain` avviava una sessione sulla 4174 senza nessun segreto, e il
 * server rifletteva qualunque `Origin`. Owner, 30/09: segreto in ogni richiesta, solo `https://localhost`, solo JSON,
 * Host di loopback; il segreto lo crea il server. Ledger `.claude/ragionamento/LEDGER-70A-SERVER-CODICE-PROTETTO-2026-09-30.md`.
 *
 * Server vero su `listen(0)` a 127.0.0.1, chiuso a fine test (permesso dall'owner il 30/09). Le richieste passano da
 * `node:http` e non da `fetch`, perché servono `Host` e `Origin` scelti dal test.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createServer as creaServerHttp, request as richiestaHttp } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHttpApp } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'
import { descriviErrore } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/error-surface.mjs'

const SEGRETO = 'a'.repeat(64)
const cartelle: string[] = []
afterEach(() => {
    for (const cartella of cartelle.splice(0)) rmSync(cartella, { recursive: true, force: true })
})

type Risposta = { stato: number, intestazioni: Record<string, string | string[] | undefined>, corpo: string }

async function conServer(prova: (porta: number) => Promise<void>) {
    const registro = createSessionRegistry({
        cartellaStore: '/finta', chiave: 'chiave-finta-mai-usata-in-rete',
        registraRigaFn: async () => undefined, elencaSessioniPersistiteFn: async () => [],
    } as never)
    const app = createHttpApp({
        campaignService: { list: async () => [], get: async () => null },
        staticHandler: async (percorso: string) => (percorso === '/' || percorso === '/app.js'
            ? { statusCode: 200, contentType: 'text/plain; charset=utf-8', body: Buffer.from('statico') }
            : null),
        sessionRegistry: registro,
        segreto: SEGRETO,
    } as never)
    const server = creaServerHttp(app as never)
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
    try {
        await prova((server.address() as { port: number }).port)
    } finally {
        server.closeAllConnections?.()
        server.close()
    }
}

function chiedi(porta: number, percorso: string, { metodo = 'GET', intestazioni = {}, corpo }: {
    metodo?: string, intestazioni?: Record<string, string>, corpo?: string,
} = {}): Promise<Risposta> {
    return new Promise((risolvi, rifiuta) => {
        const richiesta = richiestaHttp({
            host: '127.0.0.1', port: porta, path: percorso, method: metodo,
            headers: { Host: `127.0.0.1:${porta}`, ...intestazioni },
        }, (risposta) => {
            const pezzi: Buffer[] = []
            // Un flusso di eventi non finisce: basta il primo pezzo per sapere che si è aperto.
            if (String(risposta.headers['content-type'] ?? '').startsWith('text/event-stream')) {
                risolvi({ stato: risposta.statusCode ?? 0, intestazioni: risposta.headers, corpo: '' })
                risposta.destroy()
                return
            }
            risposta.on('data', (pezzo: Buffer) => pezzi.push(pezzo))
            risposta.on('end', () => risolvi({ stato: risposta.statusCode ?? 0, intestazioni: risposta.headers, corpo: Buffer.concat(pezzi).toString('utf8') }))
        })
        richiesta.on('error', rifiuta)
        if (corpo !== undefined) richiesta.write(corpo)
        richiesta.end()
    })
}

const codice = (r: Risposta) => (JSON.parse(r.corpo) as { error?: { code?: string } }).error?.code
const conSegreto = { Authorization: `Bearer ${SEGRETO}` }

describe('SEC70 — il server del Codice risponde solo a TALOS', () => {
    it('SEC70-01 senza segreto l’API risponde 401 AUTH_REQUIRED', async () => {
        await conServer(async (porta) => {
            const r = await chiedi(porta, '/api/v1/health')
            expect(r.stato).toBe(401)
            expect(codice(r)).toBe('AUTH_REQUIRED')
            expect(String(r.intestazioni['www-authenticate'])).toMatch(/^Bearer/)
        })
    })

    it('SEC70-02 segreto sbagliato o di lunghezza diversa: 401 senza eccezioni; segreto giusto: 200', async () => {
        await conServer(async (porta) => {
            expect((await chiedi(porta, '/api/v1/health', { intestazioni: { Authorization: `Bearer ${'b'.repeat(64)}` } })).stato).toBe(401)
            expect((await chiedi(porta, '/api/v1/health', { intestazioni: { Authorization: 'Bearer corto' } })).stato).toBe(401)
            expect((await chiedi(porta, '/api/v1/health', { intestazioni: { Authorization: SEGRETO } })).stato).toBe(401)
            expect((await chiedi(porta, '/api/v1/health', { intestazioni: conSegreto })).stato).toBe(200)
        })
    })

    it('SEC70-03 un’altra origine col segreto giusto riceve 403 ORIGIN_FORBIDDEN e nessuna intestazione CORS', async () => {
        await conServer(async (porta) => {
            const r = await chiedi(porta, '/api/v1/health', { intestazioni: { ...conSegreto, Origin: 'https://evil.example' } })
            expect(r.stato).toBe(403)
            expect(codice(r)).toBe('ORIGIN_FORBIDDEN')
            expect(r.intestazioni['access-control-allow-origin']).toBeUndefined()
        })
    })

    it('SEC70-04 l’origine di TALOS (https://localhost) passa, e il preflight ammette Authorization; un preflight estraneo no', async () => {
        await conServer(async (porta) => {
            const r = await chiedi(porta, '/api/v1/health', { intestazioni: { ...conSegreto, Origin: 'https://localhost' } })
            expect(r.stato).toBe(200)
            expect(r.intestazioni['access-control-allow-origin']).toBe('https://localhost')
            const preflight = await chiedi(porta, '/api/v1/sessions', {
                metodo: 'OPTIONS',
                intestazioni: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
            })
            expect(preflight.stato).toBe(204)
            expect(String(preflight.intestazioni['access-control-allow-headers']).toLowerCase()).toContain('authorization')
            const estraneo = await chiedi(porta, '/api/v1/sessions', {
                metodo: 'OPTIONS',
                intestazioni: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
            })
            expect(estraneo.stato).toBe(403)
            expect(estraneo.intestazioni['access-control-allow-origin']).toBeUndefined()
        })
    })

    it('SEC70-05 un POST text/plain col segreto giusto riceve 415 e non avvia niente', async () => {
        await conServer(async (porta) => {
            const r = await chiedi(porta, '/api/v1/sessions', {
                metodo: 'POST', intestazioni: { ...conSegreto, 'Content-Type': 'text/plain' }, corpo: JSON.stringify({ messaggio: 'ciao' }),
            })
            expect(r.stato).toBe(415)
            expect(codice(r)).toBe('CONTENT_TYPE_UNSUPPORTED')
        })
    })

    it('SEC70-06 un Host che non è il telefono stesso (DNS rebinding) riceve 403 HOST_FORBIDDEN', async () => {
        await conServer(async (porta) => {
            const r = await chiedi(porta, '/api/v1/health', { intestazioni: { ...conSegreto, Host: `evil.example:${porta}` } })
            expect(r.stato).toBe(403)
            expect(codice(r)).toBe('HOST_FORBIDDEN')
            for (const host of [`localhost:${porta}`, `127.0.0.1:${porta}`, `[::1]:${porta}`]) {
                expect((await chiedi(porta, '/api/v1/health', { intestazioni: { ...conSegreto, Host: host } })).stato, host).toBe(200)
            }
        })
    })

    it('SEC70-07 (caratterizzante) i file statici restano leggibili senza segreto', async () => {
        await conServer(async (porta) => {
            expect((await chiedi(porta, '/')).stato).toBe(200)
            expect((await chiedi(porta, '/app.js')).stato).toBe(200)
        })
    })

    it('SEC70-08 il flusso degli eventi vuole il segreto', async () => {
        await conServer(async (porta) => {
            expect((await chiedi(porta, '/api/v1/sessions/non-esiste/events')).stato).toBe(401)
            const conIlSegreto = await chiedi(porta, '/api/v1/sessions/non-esiste/events', { intestazioni: conSegreto })
            expect(conIlSegreto.stato).not.toBe(401)
            expect(conIlSegreto.stato).not.toBe(403)
        })
    })
})

describe('SEC70-09 — il segreto lo crea il server, in un file solo suo', () => {
    it('SEC70-09a 64 caratteri esadecimali, scritti nel file e riscritti a ogni avvio', async () => {
        const { creaSegretoServer, NOME_FILE_SEGRETO, segretoValido } = await import('../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/server-secret.mjs')
        const cartella = mkdtempSync(join(tmpdir(), 'codice-segreto-'))
        cartelle.push(cartella)
        const primo = creaSegretoServer({ cartella })
        expect(primo).toMatch(/^[0-9a-f]{64}$/)
        expect(segretoValido(primo)).toBe(true)
        expect(readFileSync(join(cartella, NOME_FILE_SEGRETO), 'utf8')).toBe(primo)
        const secondo = creaSegretoServer({ cartella })
        expect(secondo).not.toBe(primo)
        expect(readFileSync(join(cartella, NOME_FILE_SEGRETO), 'utf8')).toBe(secondo)
        // Nessun file temporaneo lasciato indietro.
        expect(readdirSync(cartella)).toEqual([NOME_FILE_SEGRETO])
        if (process.platform !== 'win32') expect(statSync(join(cartella, NOME_FILE_SEGRETO)).mode & 0o777).toBe(0o600)
    })

    it('SEC70-09b un file già presente al nome temporaneo non viene seguito né riscritto', async () => {
        const { creaSegretoServer, NOME_FILE_SEGRETO } = await import('../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/server-secret.mjs')
        const cartella = mkdtempSync(join(tmpdir(), 'codice-segreto-'))
        cartelle.push(cartella)
        const casuale = (quanti: number) => Buffer.alloc(quanti, 7)
        const atteso = '07'.repeat(32)
        // Chi prepara in anticipo il nome temporaneo non deve ricevere il segreto. Il suffisso viene da un'estrazione
        // a parte (8 byte), mai da un pezzo del segreto.
        const trappola = join(cartella, `${NOME_FILE_SEGRETO}.${'07'.repeat(8)}.tmp`)
        writeFileSync(trappola, 'trappola')
        // Qui il suffisso è sempre lo stesso: dopo qualche tentativo il server rinuncia invece di scrivere nella trappola.
        expect(() => creaSegretoServer({ cartella, randomBytesFn: casuale })).toThrow()
        expect(readFileSync(trappola, 'utf8')).toBe('trappola')
        expect(existsSync(join(cartella, NOME_FILE_SEGRETO))).toBe(false)
        expect(atteso).toHaveLength(64)
        // Con un suffisso libero lo stesso segreto viene scritto.
        let estrazioni = 0
        const segreto = creaSegretoServer({ cartella, randomBytesFn: (quanti: number) => (quanti === 8 && estrazioni++ === 0 ? Buffer.alloc(8, 7) : Buffer.alloc(quanti, 9)) })
        expect(segreto).toBe('09'.repeat(32))
        expect(readFileSync(join(cartella, NOME_FILE_SEGRETO), 'utf8')).toBe(segreto)
        expect(readFileSync(trappola, 'utf8')).toBe('trappola')
    })

    it('SEC70-09c segretoValido rifiuta tutto ciò che non è 64 esadecimali minuscoli', async () => {
        const { segretoValido } = await import('../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/server-secret.mjs')
        for (const testo of ['', 'a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(64)}\n`, 'g'.repeat(64), null, undefined, 42]) {
            expect(segretoValido(testo as never), String(testo)).toBe(false)
        }
    })
})

describe('SEC70-10 — la scheda d’errore riconosce il rifiuto del server', () => {
    it('SEC70-10 AUTH_REQUIRED diventa SERVER_AUTH_FAILED; le altre tre diventano REQUEST_INVALID', () => {
        expect(descriviErrore({ code: 'AUTH_REQUIRED' })).toMatchObject({ layer: 'system', code: 'SERVER_AUTH_FAILED', retryable: false, action: 'none' })
        for (const codiceServer of ['ORIGIN_FORBIDDEN', 'HOST_FORBIDDEN', 'CONTENT_TYPE_UNSUPPORTED']) {
            expect(descriviErrore({ code: codiceServer }).code, codiceServer).toBe('REQUEST_INVALID')
        }
    })
})

describe('SEC70-NOME — app e server cercano lo stesso file', () => {
    it('SEC70-NOME-01 il nome del file del segreto è uguale nel server e nel nativo', async () => {
        const { NOME_FILE_SEGRETO } = await import('../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/server-secret.mjs')
        const plugin = readFileSync(join(__dirname, '../../../android/app/src/main/java/ai/talos/terminal/TalosTerminalPlugin.kt'), 'utf8')
        const riga = plugin.match(/FILE_SEGRETO_REMOTO = "\$AREA_STATO_REMOTO\/([^"]+)"/)
        expect(riga?.[1]).toBe(NOME_FILE_SEGRETO)
        expect(existsSync(join(__dirname, '../../../android/app/src/main/java/ai/talos/terminal/TalosSegretoServer.kt'))).toBe(true)
    })
})
