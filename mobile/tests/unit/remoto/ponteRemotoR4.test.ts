import { describe, expect, it, vi } from 'vitest'
import { creaPonteRemotoR4, type ClientePerIlPonte } from '@/lib/remoto/ponteRemotoR4'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, «R-M4 — ledger»): la schermata del
 * Codice parla con r4 attraverso `TalosR4ClientePonte`; qui un secondo ponte con la stessa interfaccia, sopra il canale remoto.
 * Il PC: `operazioni.mjs` `OPERAZIONI_HTTP` @ c6aff0362 (elenco CHIUSO, il telefono sceglie l'operazione, mai il percorso) e la
 * rotta `/events` (`http-app.mjs:3086`: `id: <_sequenza>`, `data: <json>`).
 */
function clienteFinto(rispondi: (op: string, args: Record<string, unknown>) => unknown = () => ({ ok: true })) {
    const chiamate: Array<{ op: string, args: Record<string, unknown> }> = []
    const iscrizioni: Array<{ sessionId: string, after: number, onEvento: (e: unknown) => void, disiscritta: boolean }> = []
    let chiusura: ((motivo: string) => void) | null = null
    const cliente: ClientePerIlPonte = {
        richiesta: vi.fn(async (op, args) => {
            chiamate.push({ op, args })
            const r = rispondi(op, args)
            if (r instanceof Error) throw r
            return r
        }),
        iscrivi: vi.fn(async (sessionId, after, onEvento) => {
            const voce = { sessionId, after, onEvento, disiscritta: false }
            iscrizioni.push(voce)
            return { sub: `s${iscrizioni.length}`, disiscrivi: async () => { voce.disiscritta = true } }
        }),
        onChiuso: (cb) => { chiusura = cb },
    }
    return { cliente, chiamate, iscrizioni, chiudi: (m: string) => chiusura?.(m) }
}

describe('il ponte r4 sopra il canale remoto', () => {
    it('PRR-01 ogni rotta del Codice diventa la sua operazione, con l\'id decodificato e il corpo come oggetto', async () => {
        const f = clienteFinto()
        const p = creaPonteRemotoR4(f.cliente)
        const id = encodeURIComponent('sess:1')
        const casi: Array<[ 'GET' | 'POST', string, string, Record<string, unknown> ]> = [
            ['GET', '/api/v1/sessions', 'sessions.list', {}],
            ['POST', '/api/v1/sessions/custom', 'session.start', { corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/resume`, 'session.send', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/queue`, 'session.queue', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/stop`, 'session.stop', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/approve`, 'session.approve', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/question`, 'session.answer', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/plan-decision`, 'session.plan', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/settings`, 'session.settings', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/rename`, 'session.rename', { sessionId: 'sess:1', corpo: { a: 1 } }],
            // revisione del blocco 3 (S3), owner 24/10 «Sì, uguali alle locali»: `session.delete` del PC da 9e548d7b8
            ['POST', `/api/v1/sessions/${id}/delete`, 'session.delete', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['GET', `/api/v1/sessions/${id}/file-undo`, 'session.undo.list', { sessionId: 'sess:1' }],
            ['GET', `/api/v1/sessions/${id}/file-undo/7`, 'session.undo.preview', { sessionId: 'sess:1', turn: 7 }],
            ['POST', `/api/v1/sessions/${id}/file-undo/redo`, 'session.undo.redo', { sessionId: 'sess:1' }],
            ['POST', `/api/v1/sessions/${id}/file-undo/7`, 'session.undo', { sessionId: 'sess:1', turn: 7, corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/close`, 'session.close', { sessionId: 'sess:1' }],
            ['GET', `/api/v1/sessions/${id}/mcp`, 'session.mcp.list', { sessionId: 'sess:1' }],
            ['POST', `/api/v1/sessions/${id}/mcp/srv-1/test`, 'session.mcp.test', { sessionId: 'sess:1', serverId: 'srv-1' }],
            // r4 c6aff0362: le viste della sessione del PC dal telefono (ELENCO-AZIONI §7)
            ['GET', `/api/v1/sessions/${id}/children`, 'session.children', { sessionId: 'sess:1' }],
            ['GET', `/api/v1/sessions/${id}/pending`, 'session.pending', { sessionId: 'sess:1' }],
            ['GET', `/api/v1/sessions/${id}/metrics`, 'session.metrics', { sessionId: 'sess:1' }],
            ['GET', `/api/v1/sessions/${id}/processes`, 'session.processes', { sessionId: 'sess:1' }],
            ['GET', `/api/v1/sessions/${id}/hooks`, 'session.hooks.list', { sessionId: 'sess:1' }],
            ['POST', `/api/v1/sessions/${id}/compact`, 'session.compact', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['GET', '/api/v1/doctor', 'doctor', {}],
            ['GET', '/api/v1/projects', 'projects.list', {}],
            ['GET', '/api/v1/models', 'models.list', {}],
            ['GET', '/api/v1/providers', 'providers.list', {}],
            // r4 2297237fd (R-M4 bis): i modelli di un fornitore del PC e i modelli locali del PC, ridotti dal PC
            ['GET', '/api/v1/providers/anthropic/models', 'provider.models', { provider: 'anthropic' }],
            ['GET', '/api/v1/local-models', 'local-models.list', {}],
            // IMPOSTAZIONI-DAL-VIVO (owner 27/10/2026, r4 f573cdc93 e 115cdc671): ogni impostazione anche dal dispositivo
            ['POST', `/api/v1/sessions/${id}/dove-girano-i-comandi`, 'session.commands-location', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/comandi-nella-conversazione`, 'session.commands-in-chat', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['GET', `/api/v1/sessions/${id}/goal`, 'session.goal', { sessionId: 'sess:1' }],
            ['POST', `/api/v1/sessions/${id}/goal`, 'session.goal.set', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ...(['pausa', 'riprendi', 'togli', 'contratto', 'criteri', 'proposta', 'verifica'] as const).map((action): ['POST', string, string, Record<string, unknown>] =>
                ['POST', `/api/v1/sessions/${id}/goal/${action}`, 'session.goal.action', { sessionId: 'sess:1', action, corpo: { a: 1 } }]),
            // CENSIMENTO G, punto (a) (Desktop 27/10): i pulsanti del dispositivo che finivano in «Solo dal computer»; le operazioni del PC
            // ci sono già (r4 ca94ffa1c `operazioni.mjs:191-207`), mancava la mappa
            ['POST', `/api/v1/sessions/${id}/queue/invia`, 'session.queue.send', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/queue/annulla`, 'session.queue.cancel', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/compaction/skip`, 'session.compact.skip', { sessionId: 'sess:1', corpo: { a: 1 } }],
            ['POST', `/api/v1/sessions/${id}/compaction/${encodeURIComponent('2026-10-27T15:00:00.000Z')}/undo`, 'session.compact.undo', { sessionId: 'sess:1', compactionAt: '2026-10-27T15:00:00.000Z' }],
            ['POST', `/api/v1/sessions/${id}/fork`, 'session.fork', { sessionId: 'sess:1' }],
        ]
        for (const [metodo, percorso, op, args] of casi) {
            const r = await p.richiesta({ metodo, percorso, ...(metodo === 'POST' ? { corpo: '{"a":1}' } : {}) })
            expect(r.stato, percorso).toBe(200)
            expect(f.chiamate.at(-1), percorso).toEqual({ op, args })
        }
    })

    it('PRR-02 la risposta torna nella busta di r4: {ok:true,data}', async () => {
        const f = clienteFinto(() => ({ items: [{ id: 'x' }] }))
        const p = creaPonteRemotoR4(f.cliente)
        const r = await p.richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
        expect(JSON.parse(r.corpo)).toEqual({ ok: true, data: { items: [{ id: 'x' }] } })
    })

    it('PRR-03 un rifiuto del PC diventa la busta d\'errore di r4 con uno stato HTTP coerente', async () => {
        const casi: Array<[string, number]> = [['NOT_FOUND', 404], ['BAD_MESSAGE', 400], ['RATE_LIMITED', 429], ['NOT_ALLOWED_REMOTELY', 403],
            ['UNKNOWN_OPERATION', 403], ['DISCONNECTED', 503], ['QUALCOSA', 500]]
        for (const [code, stato] of casi) {
            const f = clienteFinto(() => Object.assign(new Error('no'), { code }))
            const r = await creaPonteRemotoR4(f.cliente).richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
            expect(r.stato, code).toBe(stato)
            expect(JSON.parse(r.corpo), code).toEqual({ ok: false, error: { code, message: 'no' } })
        }
    })

    it('PRR-10 D-RM4-5 (Pad, 20/10): il motivo e i parametri del rifiuto restano nella busta di r4 (la riga d\'errore sceglie la frase da lì)', async () => {
        const f = clienteFinto(() => Object.assign(new Error('Invalid configuration'), { code: 'CONFIG_INVALID', reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } }))
        const r = await creaPonteRemotoR4(f.cliente).richiesta({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: '{}' })
        expect(JSON.parse(r.corpo)).toEqual({ ok: false, error: { code: 'CONFIG_INVALID', message: 'Invalid configuration', reason: 'provider-key-missing-named', params: { provider: 'OpenRouter' } } })
    })

    it('PRR-10b FRASI-UNICHE (27/10/2026): anche la frase precisa per la persona (`explanation`) resta nella busta', async () => {
        const precisa = 'The working mode is changed between turns, not while the model is working'
        const f = clienteFinto(() => Object.assign(new Error('Session not ready for this action'), { code: 'SESSION_NOT_READY', reason: 'mode-change-while-running', explanation: precisa }))
        const r = await creaPonteRemotoR4(f.cliente).richiesta({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: '{}' })
        expect(JSON.parse(r.corpo).error).toEqual({ code: 'SESSION_NOT_READY', message: 'Session not ready for this action', reason: 'mode-change-while-running', explanation: precisa })
    })

    it('PRR-11 RA-02 (revisione 21/10): una sessione che il PC non ha più ⇒ il motivo del nativo «HTTP 404» (il Codice smette di riprovare)', async () => {
        const f = clienteFinto()
        f.cliente.iscrivi = vi.fn(async () => { throw Object.assign(new Error('no'), { code: 'NOT_FOUND' }) })
        const p = creaPonteRemotoR4(f.cliente)
        const errori: Array<Record<string, unknown>> = []
        await p.addListener('r4Errore', (d) => errori.push(d))
        await p.apriFlusso({ id: 'f1', percorso: '/api/v1/sessions/s1/events?after=3' })
        f.cliente.iscrivi = vi.fn(async () => { throw Object.assign(new Error('piano'), { code: 'RATE_LIMITED' }) })
        await p.apriFlusso({ id: 'f2', percorso: '/api/v1/sessions/s1/events?after=3' })
        expect(errori).toEqual([{ id: 'f1', motivo: 'HTTP 404' }, { id: 'f2', motivo: 'RATE_LIMITED' }])
    })

    it('PRR-12 RA-06 (revisione 21/10): chiudere il flusso mentre l\'iscrizione è in volo ⇒ appena nata si disiscrive (niente orfane fino al tetto di 8)', async () => {
        const f = clienteFinto()
        let sblocca: () => void = () => undefined
        const disiscritta = vi.fn(async () => undefined)
        f.cliente.iscrivi = vi.fn(() => new Promise((ok) => { sblocca = () => ok({ sub: 's1', disiscrivi: disiscritta }) }))
        const p = creaPonteRemotoR4(f.cliente)
        const aperto = p.apriFlusso({ id: 'f1', percorso: '/api/v1/sessions/s1/events' })
        await Promise.resolve()
        await p.chiudiFlusso({ id: 'f1' })
        sblocca()
        await aperto
        expect(disiscritta).toHaveBeenCalledTimes(1)
    })

    it('PRR-13 RA-14 (revisione 21/10): un codice del PC come «__proto__» o «constructor» non è uno stato: 500, mai un successo', async () => {
        for (const code of ['__proto__', 'constructor', 'toString']) {
            const f = clienteFinto(() => Object.assign(new Error('x'), { code }))
            const r = await creaPonteRemotoR4(f.cliente).richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })
            expect(r.stato, code).toBe(500)
        }
    })

    it('PRR-14 RA-03 (revisione 21/10): una sessione nuova dal telefono porta solo la cartella per id, mai un percorso del PC', async () => {
        const f = clienteFinto()
        const p = creaPonteRemotoR4(f.cliente)
        await p.richiesta({ metodo: 'POST', percorso: '/api/v1/sessions/custom', corpo: JSON.stringify({ cartellaId: 'default', cartellaLibera: 'C:/Users/x', workspaceLaunchId: 'w1', consegna: 'ciao' }) })
        expect(f.chiamate.at(-1)).toEqual({ op: 'session.start', args: { corpo: { cartellaId: 'default', consegna: 'ciao' } } })
    })

    it('PRR-15 RA-04 (revisione 21/10): lo stato del PC vince sulla tabella dei codici (un 409 resta 409, non «esito incerto» 500)', async () => {
        const f = clienteFinto(() => Object.assign(new Error('non più attuale'), { code: 'QUESTION_NOT_PENDING', stato: 409 }))
        const r = await creaPonteRemotoR4(f.cliente).richiesta({ metodo: 'POST', percorso: '/api/v1/sessions/s1/question', corpo: '{}' })
        expect(r.stato).toBe(409)
        const g = clienteFinto(() => Object.assign(new Error('x'), { code: 'NOT_FOUND' }))
        expect((await creaPonteRemotoR4(g.cliente).richiesta({ metodo: 'GET', percorso: '/api/v1/sessions' })).stato).toBe(404)
    })

    it('PRR-04 una rotta fuori dall\'elenco del PC: 403 NOT_AVAILABLE_REMOTELY, e nessun traffico', async () => {
        const f = clienteFinto()
        // la frase la sceglie chi apre il ponte, nella lingua dell'app (`computer.onlyFromPc`): è quella che la riga d'errore mostra
        const p = creaPonteRemotoR4(f.cliente, { soloDalPc: () => 'Solo dal computer' })
        // restano solo dal PC (r4 c6aff0362): /export, terminali, albero dei file, politica di compattazione, azioni sui
        // processi e sugli hook, risorse dei processi, e ogni rotta d'accesso o di chiave dei fornitori
        const casi: Array<['GET' | 'POST', string]> = [['GET', '/api/v1/sessions/x/export'],
            ['GET', '/api/v1/sessions/x/compaction-policy'], ['GET', '/api/v1/sessions/x/processes/resources'],
            ['POST', '/api/v1/sessions/x/processes/t1/stop'], ['POST', '/api/v1/sessions/x/hooks/h1/trust'],
            ['GET', '/api/v1/sessions/x/../settings'], ['POST', '/api/v1/providers/chatgpt/access'], ['GET', '/api/v1/providers/ollama'],
            ['POST', '/api/v1/providers'], ['POST', '/api/v1/sessions/x/children'], ['GET', '/api/v1/sessions/x/compact'],
            ['GET', '/api/v1/providers/anthropic/models/x'], ['GET', '/api/v1/local-models/a/fit'], ['POST', '/api/v1/local-models/import'],
            // un'azione dell'obiettivo fuori dalla lista del PC non parte (r4 115cdc671), né con un pezzo in più, né letta in GET
            ['POST', '/api/v1/sessions/x/goal/cancella'], ['POST', '/api/v1/sessions/x/queue/svuota'], ['GET', '/api/v1/sessions/x/queue/invia'], ['POST', '/api/v1/sessions/x/compaction/a/b/undo'], ['POST', '/api/v1/sessions/x/goal/pausa/altro'], ['GET', '/api/v1/sessions/x/goal/pausa']]
        for (const [metodo, percorso] of casi) {
            const r = await p.richiesta({ metodo, percorso, corpo: '{}' })
            expect(r.stato, percorso).toBe(403)
            expect(JSON.parse(r.corpo).error.code, percorso).toBe('NOT_AVAILABLE_REMOTELY')
            expect(JSON.parse(r.corpo).error.message, percorso).toBe('Solo dal computer')
        }
        expect(f.chiamate).toEqual([])
    })

    it('PRR-09 un id di soli punti, anche codificato, o con caratteri fuori regola non parte (la regola del PC, ID_SESSIONE)', async () => {
        const f = clienteFinto()
        const p = creaPonteRemotoR4(f.cliente)
        for (const percorso of ['/api/v1/sessions/../settings', '/api/v1/sessions/%2E%2E/settings', '/api/v1/sessions/.../stop',
            '/api/v1/sessions/a%2Fb/stop', '/api/v1/sessions/a%20b/stop']) {
            const r = await p.richiesta({ metodo: 'POST', percorso, corpo: '{}' })
            expect([400, 403], percorso).toContain(r.stato)
        }
        // anche l'id di un fornitore (R-M4c, `provider.models`): mai soli punti, mai caratteri fuori regola
        for (const percorso of ['/api/v1/providers/%2E%2E/models', '/api/v1/providers/a%2Fb/models']) {
            const r = await p.richiesta({ metodo: 'GET', percorso })
            expect(r.stato, percorso).toBe(400)
        }
        expect(f.chiamate).toEqual([])
    })

    it('PRR-05 un corpo che non è un oggetto JSON non parte', async () => {
        const f = clienteFinto()
        const r = await creaPonteRemotoR4(f.cliente).richiesta({ metodo: 'POST', percorso: '/api/v1/sessions/x/resume', corpo: '[1,2]' })
        expect(r.stato).toBe(400)
        expect(f.chiamate).toEqual([])
    })

    it('PRR-06 il flusso: iscrizione dal numero chiesto, ogni evento in SSE come la rotta /events, chiudi ⇒ disiscritta', async () => {
        const f = clienteFinto()
        const p = creaPonteRemotoR4(f.cliente)
        const pezzi: Array<Record<string, unknown>> = []
        await p.addListener('r4Pezzo', (d) => pezzi.push(d))
        await p.apriFlusso({ id: 'f1', percorso: `/api/v1/sessions/${encodeURIComponent('sess:1')}/events?after=12` })
        expect(f.iscrizioni[0]).toMatchObject({ sessionId: 'sess:1', after: 12 })
        f.iscrizioni[0].onEvento({ type: 'RunStarted', _sequenza: 13 })
        f.iscrizioni[0].onEvento({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })
        expect(pezzi).toEqual([
            { id: 'f1', testo: 'id: 13\ndata: {"type":"RunStarted","_sequenza":13}\n\n' },
            { id: 'f1', testo: 'data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":null}\n\n' },
        ])
        await p.chiudiFlusso({ id: 'f1' })
        expect(f.iscrizioni[0].disiscritta).toBe(true)
    })

    it('PRR-07 senza «after» si parte da zero; la connessione che cade chiude i flussi con r4Errore', async () => {
        const f = clienteFinto()
        const p = creaPonteRemotoR4(f.cliente)
        const errori: Array<Record<string, unknown>> = []
        await p.addListener('r4Errore', (d) => errori.push(d))
        await p.apriFlusso({ id: 'f2', percorso: '/api/v1/sessions/sess-2/events' })
        expect(f.iscrizioni[0]).toMatchObject({ sessionId: 'sess-2', after: 0 })
        f.chiudi('DISCONNECTED')
        expect(errori).toEqual([{ id: 'f2', motivo: 'DISCONNECTED' }])
    })

    it('PRR-08 un flusso su una rotta che non è /events non parte, e lo dice', async () => {
        const f = clienteFinto()
        const p = creaPonteRemotoR4(f.cliente)
        const errori: Array<Record<string, unknown>> = []
        await p.addListener('r4Errore', (d) => errori.push(d))
        await p.apriFlusso({ id: 'f3', percorso: '/api/v1/sessions/x/terminals' })
        expect(f.iscrizioni).toEqual([])
        expect(errori).toEqual([{ id: 'f3', motivo: 'NOT_AVAILABLE_REMOTELY' }])
    })
})
