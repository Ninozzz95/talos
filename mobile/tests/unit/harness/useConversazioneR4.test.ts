import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { conversazioneDaEventi, leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ K3-B2 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`, punto 5): la conversazione del Codice su r4, dal client nativo
 * ai messaggi della chat. Il flusso arriva a pezzi tagliati dove capita (righe, blocchi, caratteri multibyte): i messaggi devono
 * essere gli STESSI di `conversazioneDaEventi` sul file intero. Se il flusso cade, si riapre da dove si era rimasti (`?after=`).
 */

const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
// Sul filo ogni evento finisce con una riga vuota (`scriviEventoSse`); il file l'ha persa in coda per `git diff --check`.
const vivo = readFileSync(resolve(FIXTURE, 'r4-99ffa3d38-vivo.sse'), 'utf8').replace(/\n*$/u, '\n\n')
const attesi = () => conversazioneDaEventi(leggiFlussoSse(vivo).map((e) => e.dati)).messaggi

type Ascoltatore = (dati: Record<string, unknown>) => void
interface Richiesta { metodo: string; percorso: string; corpo?: string }

function clienteFinto(rispondi: (r: Richiesta) => { stato: number; corpo: string } = () => ({ stato: 200, corpo: '{"ok":true,"data":{}}' })) {
    const ascoltatori: Record<string, Ascoltatore[]> = {}
    const flussi: { id: string; percorso: string }[] = []
    const chiusi: string[] = []
    const richieste: Richiesta[] = []
    const ponte: TalosR4ClientePonte = {
        richiesta: async (r) => { richieste.push(r); return rispondi(r) },
        apriFlusso: async (f) => { flussi.push(f) },
        chiudiFlusso: async ({ id }) => { chiusi.push(id) },
        addListener: async (evento, ascoltatore) => {
            ;(ascoltatori[evento] ??= []).push(ascoltatore)
            return { remove: async () => { ascoltatori[evento] = (ascoltatori[evento] ?? []).filter((a) => a !== ascoltatore) } }
        },
    }
    const emetti = (evento: string, dati: Record<string, unknown>) => { for (const a of [...(ascoltatori[evento] ?? [])]) a(dati) }
    const ultimo = () => flussi.at(-1)!
    return {
        ponte, flussi, chiusi, richieste,
        pezzo: (testo: string) => emetti('r4Pezzo', { id: ultimo().id, testo }),
        errore: (motivo: string) => emetti('r4Errore', { id: ultimo().id, motivo }),
        estraneo: (testo: string) => emetti('r4Pezzo', { id: 'un-altro-flusso', testo }),
        quantiAscoltano: () => Object.values(ascoltatori).reduce((n, a) => n + a.length, 0),
    }
}

/** Pezzi di lunghezza pseudo-casuale (1..97), ripetibili col seme. */
function aPezzi(testo: string, seme: number): string[] {
    let s = seme
    const pezzi: string[] = []
    for (let i = 0; i < testo.length;) {
        s = (s * 1103515245 + 12345) % 2147483648
        const n = 1 + (s % 97)
        pezzi.push(testo.slice(i, i + n))
        i += n
    }
    return pezzi
}

const aspetta = async () => {
    for (let i = 0; i < 5; i++) {
        await new Promise((fatto) => setTimeout(fatto, 0))
        await nextTick()
    }
}

let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!

describe('la conversazione del Codice su r4 (K3-B2)', () => {
    it.each([1, 7, 2026])('USR4-01 a pezzi tagliati dove capita (seme %i) dà gli stessi messaggi del file intero', async (seme) => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        expect(c.flussi[0].percorso).toBe('/api/v1/sessions/s1/events')
        for (const p of aPezzi(vivo, seme)) c.pezzo(p)
        c.estraneo('id: 999\ndata: {"type":"RunStarted","runId":"x","input":{"consegna":"NON MIO"}}\n\n')
        expect(conv.messaggi.value).toEqual(attesi())
        expect(conv.inCorso.value).toBeNull()
        expect(conv.storiaFinita.value).toBe(true)
    })

    it('USR4-02 se il flusso cade riapre con ?after= l\'ultima sequenza, e il blocco a metà non conta', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        const blocchi = vivo.split('\n\n')
        const taglio = blocchi.findIndex((b) => b.includes('"_sequenza":20,') || b.includes('"_sequenza":20}'))
        expect(taglio).toBeGreaterThan(0)
        // il blocco 21 arriva a metà del suo JSON: se restasse nel buffer, si incollerebbe al 21 rimandato e lo romperebbe
        const meta = blocchi[taglio + 1]
        expect(meta).toContain('"_sequenza":21')
        c.pezzo(blocchi.slice(0, taglio + 1).join('\n\n') + '\n\n' + meta.slice(0, Math.floor(meta.length / 2)))
        expect(conv.ultimaSequenza.value).toBe(20)
        c.errore('SocketException')
        await aspetta()
        expect(c.flussi).toHaveLength(2)
        expect(c.flussi[1].percorso).toBe('/api/v1/sessions/s1/events?after=20')
        expect(c.flussi[1].id).not.toBe(c.flussi[0].id)
        c.pezzo(blocchi.slice(taglio + 1).join('\n\n'))
        expect(conv.messaggi.value).toEqual(attesi())
    })

    it('USR4-03 il primo messaggio crea la sessione nella cartella del Codice e apre il suo flusso', async () => {
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions/custom'
            ? { stato: 200, corpo: '{"ok":true,"data":{"sessionId":"s9"}}' }
            : { stato: 404, corpo: '{}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/data/w', attesaRiapertura: () => 0 })
        const esito = conv.invia('Leggi NOTA.md e dimmi cosa dice')
        expect(conv.inviando.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(true)
        await esito
        expect(c.richieste[0]).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/custom',
            corpo: JSON.stringify({ cartellaLibera: '/data/w', consegna: 'Leggi NOTA.md e dimmi cosa dice' }) })
        // ⛔ K3-LOC (Pad, 15/10): niente `client: 'mobile'`. In r4 vuol dire «telefono attaccato al PC via adb» e ogni `shell` tornava
        // «No ADB device»: qui r4 gira DENTRO il telefono, la macchina locale è il Pad.
        expect(conv.sessioneId.value).toBe('s9')
        expect(c.flussi[0].percorso).toBe('/api/v1/sessions/s9/events')
        // finché il giro non comincia davvero, si sta ancora inviando
        expect(conv.inviando.value).toBe(true)
        c.pezzo('id: 1\ndata: {"type":"RunStarted","runId":"r1","input":{"consegna":"Leggi NOTA.md e dimmi cosa dice"},"_sequenza":1}\n\n')
        expect(conv.inviando.value).toBe(false)
        expect(conv.sorgente.sending.value).toBe(true)
        expect(conv.messaggi.value.map((m) => m.content)).toEqual(['Leggi NOTA.md e dimmi cosa dice'])
    })

    it('USR4-04 con la sessione il messaggio va a resume, e Stop a stop', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await conv.invia('  e adesso?  ')
        await conv.ferma()
        expect(c.richieste.filter((r) => r.metodo === 'POST')).toEqual([
            { metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: JSON.stringify({ messaggio: 'e adesso?' }) },
            { metodo: 'POST', percorso: '/api/v1/sessions/s1/stop', corpo: '{}' },
        ])
        expect(c.flussi).toHaveLength(1)
    })

    it('USR4-05 un rifiuto di r4 si dice col suo codice, e niente resta «in invio»', async () => {
        const c = clienteFinto(() => ({ stato: 400, corpo: '{"ok":false,"error":{"code":"QUERY_INVALID","message":"Invalid query"}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', attesaRiapertura: () => 0 })
        await conv.invia('ciao')
        expect(conv.inviando.value).toBe(false)
        expect(conv.errore.value).toEqual({ code: 'QUERY_INVALID', message: 'Invalid query' })
        expect(c.flussi).toHaveLength(0)
        expect(await conv.invia('   ')).toBe(false)
        expect(c.richieste).toHaveLength(1)
    })

    it('USR4-06 una sessione che non c\'è più non si riapre all\'infinito', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 'sparita', attesaRiapertura: () => 0 })
        await conv.apri()
        c.errore('HTTP 404')
        await aspetta()
        expect(c.flussi).toHaveLength(1)
        expect(conv.errore.value?.code).toBe('NOT_FOUND')
    })

    // K3-C1: le due azioni del menu «•••» dell'header, sulle rotte vere di r4.
    it('USR4-08 Riprendi manda resume senza messaggio, Compatta manda compact', async () => {
        const c = clienteFinto((r) => (r.percorso.endsWith('/compact')
            ? { stato: 200, corpo: '{"ok":true,"data":{"compattato":true,"at":"2026-10-15T20:00:00.000Z"}}' }
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.riprendi()
        const esito = await conv.compatta()
        expect(c.richieste.filter((r) => r.metodo === 'POST')).toEqual([
            { metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: '{}' },
            { metodo: 'POST', percorso: '/api/v1/sessions/s1/compact', corpo: '{}' },
        ])
        expect(esito).toEqual({ compattato: true })
    })

    it('USR4-09 Compatta che non riduce niente lo dice; un rifiuto di r4 va in errore', async () => {
        const c = clienteFinto((r) => (r.percorso.endsWith('/compact')
            ? { stato: 200, corpo: '{"ok":true,"data":{"compattato":false}}' }
            : { stato: 409, corpo: '{"ok":false,"error":{"code":"RUN_ACTIVE","message":"A run is active"}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await conv.compatta()).toEqual({ compattato: false })
        await conv.riprendi()
        expect(conv.errore.value).toEqual({ code: 'RUN_ACTIVE', message: 'A run is active' })
        const senza = monta({ cliente: c.ponte, cartella: '/w', attesaRiapertura: () => 0 })
        expect(await senza.compatta()).toBeNull()
    })

    it('USR4-10 il titolo viene dalla lista delle sessioni di r4', async () => {
        const c = clienteFinto((r) => (r.metodo === 'GET' && r.percorso === '/api/v1/sessions'
            // la forma VERA di r4 (misurata sul Pad il 15/10): `data.items`, non un elenco nudo
            ? { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: 'altra', nome: 'Altra' }, { sessionId: 's1', nome: 'Leggi NOTA.md' }] } }) }
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(conv.titolo.value).toBe('')
        await conv.apri()
        await aspetta()
        expect(conv.titolo.value).toBe('Leggi NOTA.md')
    })

    // K3-C3b-2b, visto sul Pad (15/10): aprendo una delega il titolo diceva «Codice (motore nuovo)». Nell'elenco una delega ha `nome: null`
    // e il suo compito in `taskDelega`; il desktop la intitola col compito (`session-item.js:247`), pulito su una riga.
    it('USR4-18 una delega senza nome prende per titolo il suo compito', async () => {
        const c = clienteFinto((r) => (r.metodo === 'GET' && r.percorso === '/api/v1/sessions'
            ? { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: 'f1', nome: null, taskDelega: '  Conta le righe\ndi NOTA.md‮ ' }] } }) }
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 'f1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        expect(conv.titolo.value).toBe('Conta le righe di NOTA.md')
    })

    // K3-C2: albero della sessione e hook del progetto, con le forme misurate su r4 il 15/10.
    it('USR4-11 figli e hook arrivano nella forma di r4; un guasto dà null', async () => {
        const c = clienteFinto((r) => {
            if (r.percorso.endsWith('/children')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { figli: [{ sessionId: 'f1', task: 'Leggi i test', conclusa: true, esitoDelega: 'concluso' }] } }) }
            if (r.percorso.endsWith('/hooks')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { hooks: [{ id: 'formatta', eventi: ['PostToolUse'], fidato: false }], errore: null } }) }
            return { stato: 500, corpo: '{}' }
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await conv.figli()).toEqual([{ sessionId: 'f1', task: 'Leggi i test', conclusa: true, esitoDelega: 'concluso' }])
        expect(await conv.hook()).toEqual({ hooks: [{ id: 'formatta', eventi: ['PostToolUse'], fidato: false }], errore: null })
        const rotto = monta({ cliente: clienteFinto(() => ({ stato: 500, corpo: 'no' })).ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await rotto.figli()).toBeNull()
        expect(await rotto.hook()).toBeNull()
    })

    it('USR4-12 Fida manda trust per quell\'hook; un rifiuto va in errore', async () => {
        const c = clienteFinto((r) => (r.percorso.includes('/hooks/rotto/')
            ? { stato: 403, corpo: '{"ok":false,"error":{"code":"HOOK_TRUST_FORBIDDEN","message":"Not allowed"}}' }
            : { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await conv.fidaHook('formatta prima')).toBe(true)
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/hooks/formatta%20prima/trust', corpo: '{}' })
        expect(await conv.fidaHook('rotto')).toBe(false)
        expect(conv.errore.value).toEqual({ code: 'HOOK_TRUST_FORBIDDEN', message: 'Not allowed' })
    })

    // K3-C3a: Rinomina e Duplica dalla tavolozza dei comandi, sulle rotte vere di r4.
    it('USR4-13 Rinomina manda il nome e aggiorna il titolo; un rifiuto va in errore e il titolo resta', async () => {
        const c = clienteFinto((r) => (r.corpo?.includes('"nome":"x"')
            ? { stato: 400, corpo: '{"ok":false,"error":{"code":"QUERY_INVALID","message":"Invalid name"}}' }
            : { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await conv.rinomina('  Leggi la nota  ')).toBe(true)
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/rename', corpo: JSON.stringify({ nome: 'Leggi la nota' }) })
        expect(conv.titolo.value).toBe('Leggi la nota')
        expect(await conv.rinomina('x')).toBe(false)
        expect(conv.titolo.value).toBe('Leggi la nota')
        expect(conv.errore.value?.code).toBe('QUERY_INVALID')
        expect(await conv.rinomina('   ')).toBe(false)
    })

    // REV-ELENCO-08 (review avversariale v0.1.42): rinominata dal titolo, la riga della colonna del tablet restava col nome vecchio
    it('REV-ELENCO-08 una rinomina riuscita si annuncia (la colonna si rilegge); una rifiutata no', async () => {
        const { talosCambiSessioniR4 } = await import('@/lib/harness/r4/avvisiSessioniR4')
        const c = clienteFinto((r) => (r.corpo?.includes('"nome":"x"')
            ? { stato: 400, corpo: '{"ok":false,"error":{"code":"QUERY_INVALID","message":"Invalid name"}}' }
            : { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.rinomina('Nome dal titolo')
        expect(talosCambiSessioniR4.value).toMatchObject({ id: 's1', nome: 'Nome dal titolo', eliminata: false })
        const n = talosCambiSessioniR4.value.n
        await conv.rinomina('x')
        expect(talosCambiSessioniR4.value.n).toBe(n)
    })

    it('USR4-14 Duplica manda fork e restituisce la sessione nuova; un guasto dà null', async () => {
        const c = clienteFinto((r) => (r.percorso.endsWith('/fork')
            ? { stato: 200, corpo: '{"ok":true,"data":{"sessionId":"s2"}}' }
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await conv.duplica()).toBe('s2')
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/fork', corpo: '{}' })
        const rotto = monta({ cliente: clienteFinto(() => ({ stato: 409, corpo: '{"ok":false,"error":{"code":"RUN_ACTIVE","message":"busy"}}' })).ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await rotto.duplica()).toBeNull()
        expect(rotto.errore.value?.code).toBe('RUN_ACTIVE')
    })

    // K3-C2b: il Doctor di r4 (`GET /api/v1/doctor`), la risposta grezza: le regole stanno in `doctorR4.ts`
    it('USR4-15 Doctor legge GET /api/v1/doctor e restituisce i dati; un guasto dà null', async () => {
        const c = clienteFinto((r) => (r.percorso === '/api/v1/doctor'
            ? { stato: 200, corpo: '{"ok":true,"data":{"chiaveApi":true,"shell":"desktop","git":false,"naviga":true}}' }
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await conv.doctor()).toEqual({ chiaveApi: true, shell: 'desktop', git: false, naviga: true })
        expect(c.richieste.at(-1)).toMatchObject({ metodo: 'GET', percorso: '/api/v1/doctor' })
        const rotto = monta({ cliente: clienteFinto(() => ({ stato: 500, corpo: 'x' })).ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await rotto.doctor()).toBeNull()
    })

    // K3-C3b-1: il pannello ▤ si aggiorna con gli STESSI eventi dei messaggi, a pezzi come arrivano; più politica e metriche di r4
    it('USR4-16 il pannello dagli stessi eventi (file toccati, misura del contesto), politica di compattazione e metriche', async () => {
        const scrittura = readFileSync(resolve(FIXTURE, 'r4-fc5e25d62-scrittura-vivo.sse'), 'utf8').replace(/\n*$/u, '\n\n')
        const c = clienteFinto((r) => (r.percorso.endsWith('/compaction-policy')
            ? { stato: 200, corpo: '{"ok":true,"data":{"triggerTokens":200000,"windowTokens":null,"source":"fallback"}}' }
            : r.percorso.endsWith('/metrics')
                ? { stato: 200, corpo: '{"ok":true,"data":{"cacheSessione":{"percentuale":85,"giriMisurati":11}}}' }
                : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        for (const p of aPezzi(scrittura, 7)) c.pezzo(p)
        // K3 Revisione: la voce porta anche giro, righe e simboli (provati in `revisioneR4.test.ts`); qui i conteggi
        expect(conv.pannello.value.file).toMatchObject([{ path: 'slugify.mjs', aggiunte: 4, rimozioni: 1, nuovo: false }])
        expect(conv.pannello.value.ultimaRichiesta).toEqual({ prompt_tokens: 100, completion_tokens: 0 })
        expect(await conv.politicaCompattazione()).toMatchObject({ triggerTokens: 200000, source: 'fallback' })
        expect(c.richieste.at(-1)).toMatchObject({ metodo: 'GET', percorso: '/api/v1/sessions/s1/compaction-policy' })
        expect(await conv.cacheSessione()).toEqual({ percentuale: 85, giriMisurati: 11 })
        expect(c.richieste.at(-1)).toMatchObject({ metodo: 'GET', percorso: '/api/v1/sessions/s1/metrics' })
    })

    // K3-C3b-2a: il menu della riga dei Processi e le risorse; un rifiuto dice il suo perché alla riga e non tocca l'errore della chat
    it('USR4-17 Ferma, Sfonda e Togli sulle rotte di r4; un 409 dice il perché; CPU e memoria per id', async () => {
        const c = clienteFinto((r) => (r.percorso.endsWith('/remove')
            ? { stato: 409, corpo: '{"ok":false,"error":{"code":"PROCESS_STILL_RUNNING","message":"This command is still running: stop it first"}}' }
            : r.percorso.endsWith('/processes/resources')
                ? { stato: 200, corpo: '{"ok":true,"data":{"metodo":"proc","processi":[{"toolCallId":"c1","cpuPercento":3.5,"memoriaByte":1048576,"processi":2},{"toolCallId":"c2","cpuPercento":null,"memoriaByte":null}]}}' }
                : { stato: 200, corpo: '{"ok":true,"data":{"stopped":true}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's 1', attesaRiapertura: () => 0 })
        expect(await conv.azioneProcesso('ferma', 'c/1')).toEqual({ ok: true })
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s%201/processes/c%2F1/stop', corpo: '{}' })
        expect(await conv.azioneProcesso('sfonda', 'c1')).toEqual({ ok: true })
        expect(c.richieste.at(-1)!.percorso).toBe('/api/v1/sessions/s%201/processes/c1/sfondo')
        const rifiuto = await conv.azioneProcesso('togli', 'c1')
        expect(rifiuto.ok).toBe(false)
        expect((rifiuto as { motivo: string | null }).motivo).toBe('This command is still running: stop it first')
        expect(conv.errore.value).toBeNull()
        const risorse = await conv.risorseProcessi()
        expect([...risorse!.entries()]).toEqual([['c1', { cpuPercento: 3.5, memoriaByte: 1048576 }], ['c2', { cpuPercento: null, memoriaByte: null }]])
        const giu = monta({ cliente: clienteFinto(() => { throw new Error('giù') }).ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await giu.azioneProcesso('ferma', 'c1')).toEqual({ ok: false, motivo: null })
        expect(await giu.risorseProcessi()).toBeNull()
    })

    /*
     * ⛔ K3-FILE: l'albero dei file sulle rotte /tree di r4, con le risposte VERE registrate sul Pad (`albero-701c6c0d2.json`). Un
     * rifiuto dice il perché con le parole del desktop; un «Invalid query» generico diventa l'azione non riuscita.
     */
    it('USR4-19 albero, ricerca, anteprima e azioni sui file: indirizzi, corpi, esiti e rifiuti', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const passi = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'albero-701c6c0d2.json'), 'utf8')).passi as { nome: string, stato: number, risposta: unknown }[]
        const vero = (nome: string) => { const x = passi.find((q) => q.nome === nome)!; return { stato: x.stato, corpo: JSON.stringify(x.risposta) } }
        const rotte: Record<string, string> = {
            'GET /tree?percorso=': 'radice', 'GET /tree?percorso=prova-albero': 'cartella-di-prova', 'GET /tree?percorso=..%2F': 'errore-albero-fuori',
            'GET /tree/search?q=nota': 'cerca', 'GET /tree/file?percorso=NOTA.md': 'anteprima-esistente', 'GET /tree/file?percorso=manca.md': 'errore-anteprima-mancante',
            'POST /tree/rename': 'rinomina', 'POST /tree/create': 'crea-file', 'POST /tree/copy': 'duplica', 'POST /tree/move': 'sposta', 'POST /tree/delete': 'elimina-file',
        }
        let rifiuta: string | null = null
        const c = clienteFinto((r) => {
            const coda = `${r.metodo} ${r.percorso.replace('/api/v1/sessions/s%201', '')}`
            if (rifiuta && coda === rifiuta) return vero('errore-rinomina-su-esistente')
            return vero(rotte[coda] ?? 'errore-elimina-radice')
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's 1', attesaRiapertura: () => 0 })
        const radice = await conv.albero('')
        expect(radice.ok && radice.voci.map((v) => v.nome)).toEqual((passi.find((q) => q.nome === 'radice')!.risposta as { data: { voci: { nome: string }[] } }).data.voci.map((v) => v.nome))
        expect(c.richieste.at(-1)).toEqual({ metodo: 'GET', percorso: '/api/v1/sessions/s%201/tree?percorso=' })
        expect(await conv.albero('prova-albero')).toEqual({ ok: true, voci: [{ nome: 'sotto', cartella: true }, { nome: 'nota prova.md', cartella: false }] })
        // pin r4 701c6c0d2 (#44): il rifiuto vero porta il motivo, e il perché è la sua frase
        expect(await conv.albero('../')).toEqual({ ok: false, motivo: 'Path outside the session folder' })
        const cerca = await conv.cercaFile('nota')
        expect(cerca.ok && cerca.risultati.length).toBeGreaterThan(0)
        expect(c.richieste.at(-1)!.percorso).toBe('/api/v1/sessions/s%201/tree/search?q=nota')
        const nota = await conv.apriFile('NOTA.md')
        expect(nota.ok && typeof nota.contenuto === 'string' && nota.dimensione).toBeGreaterThan(0)
        expect(await conv.apriFile('manca.md')).toEqual({ ok: false, motivo: 'File not found' })
        expect(await conv.azioneFile('rinomina', { percorso: 'prova-albero/nota prova.md', nuovoNome: 'nota.md' })).toEqual({ ok: true, percorso: 'prova-albero/nota.md' })
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s%201/tree/rename', corpo: JSON.stringify({ percorso: 'prova-albero/nota prova.md', nuovoNome: 'nota.md' }) })
        expect(await conv.azioneFile('crea', { percorsoBase: 'prova-albero', nome: 'nota prova.md', tipo: 'file' })).toEqual({ ok: true, percorso: 'prova-albero/nota prova.md' })
        expect(await conv.azioneFile('duplica', { percorso: 'prova-albero/nota prova.md' })).toEqual({ ok: true, percorso: 'prova-albero/nota prova (copia).md' })
        expect(await conv.azioneFile('sposta', { percorso: 'prova-albero/nota.md', cartellaDestinazione: 'prova-albero/sotto' })).toEqual({ ok: true, percorso: 'prova-albero/sotto/nota.md' })
        expect(await conv.azioneFile('elimina', { percorso: 'prova-albero/sotto/nota.md' })).toEqual({ ok: true, percorso: null })
        expect(c.richieste.at(-1)!.percorso).toBe('/api/v1/sessions/s%201/tree/delete')
        rifiuta = 'POST /tree/rename'
        expect(await conv.azioneFile('rinomina', { percorso: 'a', nuovoNome: 'b' })).toEqual({ ok: false, motivo: 'A file with this name already exists' })
        expect(conv.errore.value).toBeNull()
        const giu = monta({ cliente: clienteFinto(() => { throw new Error('giù') }).ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        expect(await giu.azioneFile('sposta', { percorso: 'a', cartellaDestinazione: '' })).toEqual({ ok: false, motivo: 'Move failed' })
        expect(await giu.albero('')).toEqual({ ok: false, motivo: 'Operation failed.' })
    })

    it('USR4-07 chiusa la schermata, il flusso si chiude, nessuno ascolta più e niente si riapre', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        const id = c.flussi[0].id
        scope.stop()
        await aspetta()
        expect(c.chiusi).toContain(id)
        expect(c.quantiAscoltano()).toBe(0)
        expect(c.flussi).toHaveLength(1)
    })

    /* ⛔ K3-AP1 (ledger `LEDGER-K3-APPROVAZIONI-2026-10-16.md`): la risposta alla carta, sulle rotte di r4 @ 2161afb32. */
    it('USR4-20 la politica dalla voce della sessione; le risposte alla carta: corpo esatto di /approve, «sempre» prima in settings', async () => {
        const voce = { sessionId: 's1', nome: 'Prova', permessi: 'On request', permessiPerAttrezzo: { scrivi: 'chiedi' } }
        let nonUniti: string[] = []
        let approva = 200
        const c = clienteFinto((r) => {
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [voce] } }) }
            if (r.percorso.endsWith('/settings')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { ok: true, nonUniti } }) }
            if (r.percorso.endsWith('/approve')) return approva === 200
                ? { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
                : { stato: approva, corpo: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } }) }
            return { stato: 200, corpo: '{"ok":true,"data":{}}' }
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.leggiPolitica()
        expect(conv.politica.value).toEqual({ permessi: 'On request', perAttrezzo: { scrivi: 'chiedi' } })

        expect(await conv.rispondiApprovazione('q1', 'unaVolta', 'shell')).toEqual({ ok: true, sempreNonSalvato: false })
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/approve', corpo: '{"requestId":"q1","approvato":true}' })
        await conv.rispondiApprovazione('q2', 'nega', 'shell')
        expect(JSON.parse(c.richieste.at(-1)!.corpo!)).toEqual({ requestId: 'q2', approvato: false })
        await conv.rispondiApprovazione('q3', 'cartella', 'scrivi')
        expect(JSON.parse(c.richieste.at(-1)!.corpo!)).toEqual({ requestId: 'q3', approvato: true, ambito: 'cartella' })

        // «Per questa sessione»: prima il «sempre» unito (vince un «nega» messo altrove), poi il sì a questa richiesta
        const prima = c.richieste.length
        expect(await conv.rispondiApprovazione('q4', 'sessione', 'shell')).toEqual({ ok: true, sempreNonSalvato: false })
        expect(c.richieste.slice(prima)).toEqual([
            { metodo: 'POST', percorso: '/api/v1/sessions/s1/settings', corpo: '{"unisciPermessiPerAttrezzo":{"shell":"sempre"},"rispettaNega":true}' },
            { metodo: 'POST', percorso: '/api/v1/sessions/s1/approve', corpo: '{"requestId":"q4","approvato":true}' },
        ])
        expect(conv.politica.value.perAttrezzo).toEqual({ scrivi: 'chiedi', shell: 'sempre' })
        nonUniti = ['prova']
        expect(await conv.rispondiApprovazione('q5', 'sessione', 'prova')).toEqual({ ok: true, sempreNonSalvato: true })
        expect(conv.politica.value.perAttrezzo).not.toHaveProperty('prova')

        // un rifiuto del server: non è andata, e il motivo è quello di r4
        approva = 404
        const no = await conv.rispondiApprovazione('q6', 'unaVolta', 'shell')
        expect(no.ok).toBe(false)
        expect(conv.errore.value).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' })
    })

    /* ⛔ K3-AP2 (ledger `LEDGER-K3-DOMANDE-2026-10-16.md`): la risposta alla carta delle domande (`POST /:id/question`, r4 2161afb32). */
    it('USR4-21 risposta e salto: corpo esatto; un rifiuto 400/422 torna com\'è, senza toccare l\'errore del Codice', async () => {
        let risposta = { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
        const c = clienteFinto((r) => (r.percorso.endsWith('/question') ? risposta : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        const corpo = { requestId: 'q1', status: 'answered', answers: { database: 'PostgreSQL', funzioni: ['Login', 'Backup'] } }
        expect(await conv.rispondiDomanda(corpo)).toEqual({ ok: true })
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/question', corpo: JSON.stringify(corpo) })
        expect(await conv.rispondiDomanda({ requestId: 'q2', status: 'skipped' })).toEqual({ ok: true })
        expect(c.richieste.at(-1)!.corpo).toBe('{"requestId":"q2","status":"skipped"}')
        risposta = { stato: 400, corpo: JSON.stringify({ ok: false, error: { code: 'QUERY_INVALID', message: 'answers must contain exactly the questions asked' } }) }
        const prima = c.richieste.length
        expect(await conv.rispondiDomanda(corpo)).toEqual({ ok: false, stato: 400, codice: 'QUERY_INVALID', messaggio: 'answers must contain exactly the questions asked' })
        expect(c.richieste.length).toBe(prima + 1) // 400/422: nessuna lettura del registro
        expect(conv.errore.value).toBeNull()
    })

    it('USR4-22 409 o guasto di rete: prima di dirlo si rilegge il registro (/export); se la domanda è già chiusa lì, è riconciliata', async () => {
        // la risposta VERA di r4 sul Pad a una domanda già chiusa (16/10)
        const nonInAttesa = { stato: 409, corpo: JSON.stringify({ ok: false, error: { code: 'QUESTION_NOT_PENDING', message: 'This question is no longer pending: the session has moved on', reason: 'question-expired' } }) }
        let registro: unknown[] = []
        let guasto = false
        const c = clienteFinto((r) => {
            if (r.percorso.endsWith('/question')) { if (guasto) throw new Error('rete caduta'); return nonInAttesa }
            if (r.percorso.endsWith('/export')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { sessionId: 's1', eventi: registro } }) }
            return { stato: 200, corpo: '{"ok":true,"data":{}}' }
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        const corpo = { requestId: 'q1', status: 'answered', answers: { database: 'SQLite' } }
        expect(await conv.rispondiDomanda(corpo)).toEqual({ ok: false, stato: 409, codice: 'QUESTION_NOT_PENDING', messaggio: 'This question is no longer pending: the session has moved on' })
        expect(c.richieste.at(-1)).toEqual({ metodo: 'GET', percorso: '/api/v1/sessions/s1/export' })
        registro = [{ type: 'UserQuestionResolved', requestId: 'altra', status: 'answered' }, { type: 'UserQuestionResolved', requestId: 'q1', status: 'answered', answers: { database: 'SQLite' }, at: '2026-10-16T12:00:00Z', da: 'persona' }]
        expect(await conv.rispondiDomanda(corpo)).toEqual({ ok: true, riconciliata: { status: 'answered', answers: { database: 'SQLite' }, at: '2026-10-16T12:00:00Z', da: 'persona' } })
        guasto = true
        registro = []
        expect(await conv.rispondiDomanda(corpo)).toEqual({ ok: false, stato: null, codice: null, messaggio: 'rete caduta' })
        expect(conv.errore.value).toBeNull()
    })

    /* ⛔ K3-AP3 (ledger `LEDGER-K3-FIGLIE-2026-10-16.md`): le richieste delle sotto-sessioni nella madre, dal flusso VERO registrato sul
       Pad (r4 2161afb32): istantanee `talos.agenti`, poi `/pending` della figlia, risposte con `rispostoDa`. */
    describe('le carte delle sotto-sessioni (K3-AP3)', () => {
        const figlie = JSON.parse(readFileSync(resolve(FIXTURE, 'figlie-701c6c0d2.json'), 'utf8'))
        const MADRE = '33333333-3333-4333-8333-333333333333'
        const FIGLIA1 = '66666666-6666-4666-8666-666666666661'
        const FIGLIA2 = '66666666-6666-4666-8666-666666666662'
        const blocchi = (figlie.flusso as string).split(/\n\n/u).filter((b) => b.includes('data:'))
        const operazione = (b: string) => {
            const d = JSON.parse(b.split('\n').find((r) => r.startsWith('data:'))!.slice(5)) as { name?: string; value?: { operation?: { kind?: string; status?: string } } }
            return d.name === 'talos.agenti' ? `${d.value?.operation?.kind}/${d.value?.operation?.status}` : ''
        }
        const fino = (op: string) => blocchi.slice(0, blocchi.findIndex((b) => operazione(b) === op) + 1)
        const dopo = (da: string, a: string) => blocchi.slice(blocchi.findIndex((b) => operazione(b) === da) + 1, blocchi.findIndex((b) => operazione(b) === a) + 1)
        const sse = (bs: string[]) => `${bs.join('\n\n')}\n\n`
        const carta = (m: { metadata: Record<string, unknown> }) => (m.metadata.approvazione ?? m.metadata.domanda) as { requestId: string; esito: unknown; figlia?: { sessionId: string; chi: string | null } } | undefined
        const rispondiConFixture = (extra: (r: Richiesta) => { stato: number; corpo: string } | null = () => null) => (r: Richiesta) => {
            const e = extra(r)
            if (e) return e
            if (r.percorso === `/api/v1/sessions/${FIGLIA1}/pending`) return { stato: 200, corpo: JSON.stringify({ ok: true, data: figlie.pending1 }) }
            if (r.percorso === `/api/v1/sessions/${FIGLIA2}/pending`) return { stato: 200, corpo: JSON.stringify({ ok: true, data: figlie.pending2 }) }
            return { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
        }

        it('USR4-23 l\'istantanea «in attesa» legge `/pending` della figlia e mette la carta dopo l\'ultimo messaggio; «risolta» scrive l\'esito', async () => {
            const c = clienteFinto(rispondiConFixture())
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: MADRE, attesaRiapertura: () => 0 })
            await conv.apri()
            c.pezzo(sse(fino('approval/waiting')))
            await aspetta()
            expect(c.richieste.filter((r) => r.percorso.endsWith('/pending')).map((r) => r.percorso)).toEqual([`/api/v1/sessions/${FIGLIA1}/pending`])
            const ultimo = conv.messaggi.value.at(-1)!
            expect(ultimo.role).toBe('system')
            expect(carta(ultimo)).toMatchObject({ requestId: '77777777-7777-4777-8777-777777777771', esito: null, figlia: { sessionId: FIGLIA1, chi: 'Esegui i test del progetto' } })
            // la stessa istantanea di nuovo (il rigioco del silenzio): nessuna seconda lettura, nessuna seconda carta
            c.pezzo(sse([fino('approval/waiting').at(-1)!]))
            await aspetta()
            expect(c.richieste.filter((r) => r.percorso.endsWith('/pending'))).toHaveLength(1)
            expect(conv.messaggi.value.filter((m) => carta(m)?.figlia)).toHaveLength(1)
            c.pezzo(sse(dopo('approval/waiting', 'approval/resolved')))
            await aspetta()
            expect(conv.messaggi.value.find((m) => carta(m)?.figlia)!.metadata.approvazione).toMatchObject({ esito: { approvato: true, ambito: null, motivo: null } })
        })

        it('USR4-24 nessuna carta orfana: risolta mentre la lettura di `/pending` era in volo, la carta non nasce', async () => {
            let sblocca: (() => void) | null = null
            const c = clienteFinto(rispondiConFixture())
            const lenta: TalosR4ClientePonte = { ...c.ponte, richiesta: async (r) => {
                if (r.percorso.endsWith('/pending')) await new Promise<void>((fatto) => { sblocca = fatto })
                return c.ponte.richiesta(r)
            } }
            const conv = monta({ cliente: lenta, cartella: '/w', sessioneId: MADRE, attesaRiapertura: () => 0 })
            await conv.apri()
            c.pezzo(sse(fino('approval/waiting')))
            await aspetta()
            c.pezzo(sse(dopo('approval/waiting', 'approval/resolved')))
            await aspetta()
            sblocca!()
            await aspetta()
            expect(conv.messaggi.value.filter((m) => carta(m)?.figlia)).toEqual([])
        })

        it('USR4-25 le risposte vanno alla figlia con `rispostoDa`; «sempre» nelle sue impostazioni solo se la stessa richiesta aspetta ancora', async () => {
            let ancoraInAttesa = true
            const c = clienteFinto(rispondiConFixture((r) => (r.percorso.endsWith(`${FIGLIA1}/pending`) && !ancoraInAttesa
                ? { stato: 200, corpo: '{"ok":true,"data":{"pending":null}}' } : null)))
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: MADRE, attesaRiapertura: () => 0 })
            const figlia = { sessionId: FIGLIA1 }
            const req = '77777777-7777-4777-8777-777777777771'
            expect(await conv.rispondiApprovazione(req, 'unaVolta', 'shell', figlia)).toEqual({ ok: true, sempreNonSalvato: false })
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: `/api/v1/sessions/${FIGLIA1}/approve`, corpo: JSON.stringify({ requestId: req, approvato: true, rispostoDa: MADRE }) })
            let prima = c.richieste.length
            await conv.rispondiApprovazione(req, 'sessione', 'shell', figlia)
            expect(c.richieste.slice(prima).map((r) => `${r.metodo} ${r.percorso.replace('/api/v1/sessions/', '')}`)).toEqual([`GET ${FIGLIA1}/pending`, `POST ${FIGLIA1}/settings`, `POST ${FIGLIA1}/approve`])
            expect(conv.politica.value.perAttrezzo).toEqual({}) // la politica della madre non cambia
            ancoraInAttesa = false
            prima = c.richieste.length
            await conv.rispondiApprovazione(req, 'sessione', 'shell', figlia)
            expect(c.richieste.slice(prima).map((r) => `${r.metodo} ${r.percorso.replace('/api/v1/sessions/', '')}`)).toEqual([`GET ${FIGLIA1}/pending`, `POST ${FIGLIA1}/approve`])
            // la domanda della figlia
            const corpo = { requestId: '77777777-7777-4777-8777-777777777772', status: 'answered', answers: { database: 'SQLite', funzioni: ['Ricerca'] } }
            expect(await conv.rispondiDomanda(corpo, { sessionId: FIGLIA2 })).toEqual({ ok: true })
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: `/api/v1/sessions/${FIGLIA2}/question`, corpo: JSON.stringify({ ...corpo, rispostoDa: MADRE }) })
        })

        it('USR4-26 a storia finita le figlie che aspettano ancora ritrovano la carta: elenco delle sessioni, `/children` del padre, `/pending`', async () => {
            const c = clienteFinto(rispondiConFixture((r) => {
                if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: figlie.sessioni1 } }) }
                if (r.percorso === `/api/v1/sessions/${MADRE}/children`) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { figli: [{ sessionId: FIGLIA1, taskCorto: 'Esegui i test del progetto' }] } }) }
                return null
            }))
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: MADRE, attesaRiapertura: () => 0 })
            await conv.apri()
            c.pezzo('data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":null}\n\n')
            await aspetta()
            expect(c.richieste.map((r) => r.percorso)).toEqual(expect.arrayContaining([`/api/v1/sessions/${MADRE}/children`, `/api/v1/sessions/${FIGLIA1}/pending`]))
            const ultima = conv.messaggi.value.at(-1)!
            expect(carta(ultima)).toMatchObject({ requestId: '77777777-7777-4777-8777-777777777771', esito: null, figlia: { sessionId: FIGLIA1, chi: 'Esegui i test del progetto' } })
        })
    })

    /* ⛔ K3-C Accoda (ledger `LEDGER-K3-ACCODA-2026-10-16.md`): la coda la tiene r4. Flusso e risposte VERI registrati sul Pad (r4 2161afb32). */
    describe('la coda del Codice (K3-C Accoda)', () => {
        const coda = readFileSync(resolve(FIXTURE, 'coda-2161afb32.sse'), 'utf8').replace(/\n*$/u, '\n\n')
        const risposte = JSON.parse(readFileSync(resolve(FIXTURE, 'coda-risposte-2161afb32.json'), 'utf8'))
        const ok = (x: { stato: number; d: unknown }) => ({ stato: x.stato, corpo: JSON.stringify(x.d) })

        it('USR4-27 lo stato della coda viene da `talos.coda`: due voci mentre il comando gira, poi la pausa dopo lo Stop, poi vuota', async () => {
            const c = clienteFinto()
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
            await conv.apri()
            expect(conv.coda.value).toEqual({ voci: [], inPausa: false })
            const blocchi = coda.split(/\n\n/u).filter((b) => b.includes('data:'))
            const finoA = (n: number) => blocchi.filter((b) => b.includes('"talos.coda"')).slice(0, n).at(-1)!
            c.pezzo(`${blocchi.slice(0, blocchi.indexOf(finoA(3)) + 1).join('\n\n')}\n\n`)
            expect(conv.coda.value.voci.map((v) => v.testo)).toEqual(['Controlla anche i test', 'Poi aggiorna il README'])
            expect(conv.coda.value.inPausa).toBe(false)
            const pausa = blocchi.find((b) => b.includes('"inPausa":true'))!
            c.pezzo(`${blocchi.slice(blocchi.indexOf(finoA(3)) + 1, blocchi.indexOf(pausa) + 1).join('\n\n')}\n\n`)
            expect(conv.coda.value).toEqual({ voci: [{ id: 'bc126fb1-ef62-4e98-b106-aec1091bf7a3', testo: 'Poi aggiorna il README', immagini: 0 }], inPausa: true })
            c.pezzo(`${blocchi.slice(blocchi.indexOf(pausa) + 1).join('\n\n')}\n\n`)
            expect(conv.coda.value).toEqual({ voci: [], inPausa: false })
        })

        it('USR4-28 accoda, invia, togli e riporta: i corpi esatti di r4; la risposta aggiorna la coda; un rifiuto lo dice e non perde niente', async () => {
            const c = clienteFinto((r) => {
                if (r.percorso.endsWith('/queue')) return JSON.parse(r.corpo!).messaggio.trim() ? ok(risposte.accoda1) : ok(risposte.vuoto)
                if (r.percorso.endsWith('/queue/invia')) return JSON.parse(r.corpo!).id === 'nessuna' ? ok(risposte.inviaIgnota) : ok(risposte.riprendi)
                if (r.percorso.endsWith('/queue/annulla')) return ok(risposte.annulla)
                return { stato: 200, corpo: '{"ok":true,"data":{}}' }
            })
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
            await conv.apri()
            expect(await conv.accoda('Controlla anche i test')).toBe(true)
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/queue', corpo: '{"messaggio":"Controlla anche i test"}' })
            expect(conv.coda.value.voci.map((v) => v.testo)).toEqual(['Controlla anche i test'])
            expect(await conv.accoda('   ')).toBe(false)
            expect(conv.errore.value?.code).toBe('QUERY_INVALID')
            conv.errore.value = null

            expect(await conv.inviaDallaCoda('7135b38f-57af-4dff-af6c-f7231edf07d2')).toBe(true)
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/queue/invia', corpo: '{"id":"7135b38f-57af-4dff-af6c-f7231edf07d2"}' })
            expect(conv.coda.value.voci).toEqual([])
            expect(await conv.inviaDallaCoda('nessuna')).toBe(false)
            expect(conv.errore.value?.code).toBe('NOT_FOUND')
            conv.errore.value = null

            expect(await conv.togliDallaCoda('2de1b2b8-6241-4aae-bf5f-80e9ae43f3b1')).toBe(true)
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/queue/annulla', corpo: '{"id":"2de1b2b8-6241-4aae-bf5f-80e9ae43f3b1"}' })
            expect(conv.coda.value.voci.map((v) => v.id)).toEqual(['7135b38f-57af-4dff-af6c-f7231edf07d2'])

            // «Modifica» = riporta: la voce esce dalla coda e torna il testo scritto dalla persona (la frase, non i file)
            c.pezzo('data: {"type":"CUSTOM","name":"talos.coda","value":{"voci":[{"id":"v9","testo":"Leggi\\n[file]","immagini":1,"bolla":{"testo":"Leggi"}}],"inPausa":false}}\n\n')
            expect(await conv.riportaDallaCoda('v9')).toBe('Leggi')
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/queue/annulla', corpo: '{"id":"v9"}' })
            expect(await conv.riportaDallaCoda('non-in-coda')).toBeNull()
            // una voce di sistema (risultato di un agente) non è testo della persona: non si riporta e non si toglie
            c.pezzo('data: {"type":"CUSTOM","name":"talos.coda","value":{"voci":[{"id":"d1","testo":"Sub-agent result (untrusted):\\n{}","immagini":0,"origine":"delega","childId":"f1"}],"inPausa":false}}\n\n')
            const prima = c.richieste.length
            expect(await conv.riportaDallaCoda('d1')).toBeNull()
            expect(c.richieste.length).toBe(prima)
        })
    })

    /*
     * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`): le risposte VERE di r4 registrate sul Pad
     * (`modello-2161afb32.json`). Il server è la fonte di verità: il modello cambia solo dopo che r4 ha accettato.
     */
    describe('il modello del Codice (K3-C Scelta del modello)', () => {
        const vere = JSON.parse(readFileSync(resolve(FIXTURE, 'modello-2161afb32.json'), 'utf8'))
        const SESSIONE = '33333333-3333-4333-8333-333333333333'
        const elenco = (voce: Record<string, unknown>) => ({ stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: SESSIONE, nome: 'Prova', permessi: 'Full access', ...voce }] } }) })

        it('USR4-30 modello e ragionamento vengono dalla sessione di r4; senza ragionamento scelto è `null`', async () => {
            let voce: Record<string, unknown> = vere.sessioneDopo
            const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions' ? elenco(voce) : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: SESSIONE, attesaRiapertura: () => 0 })
            await conv.apri()
            await vi.waitFor(() => expect(conv.modello.value).toBe('deepseek:deepseek-v4-pro'))
            expect(conv.ragionamento.value).toEqual({ effort: 'high' })
            voce = { modello: 'lmstudio:finto', reasoning: null }
            await conv.leggiPolitica()
            expect([conv.modello.value, conv.ragionamento.value]).toEqual(['lmstudio:finto', null])
        })

        it('USR4-31 `POST /settings` col corpo esatto; il modello cambia solo dopo `ok`; un rifiuto lascia quello di prima e lo dice', async () => {
            let risposta = vere.impostazioni
            const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions' ? elenco({ modello: 'lmstudio:finto', reasoning: null })
                : r.percorso.endsWith('/settings') ? { stato: risposta.stato, corpo: JSON.stringify(risposta.d) } : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
            const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: SESSIONE, attesaRiapertura: () => 0 })
            await conv.apri()
            await vi.waitFor(() => expect(conv.modello.value).toBe('lmstudio:finto'))
            const attesa = conv.impostaModello('deepseek:deepseek-v4-pro', { effort: 'high' })
            expect(conv.modello.value).toBe('lmstudio:finto') // la pastiglia non promette prima della risposta
            expect(await attesa).toBe(true)
            expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: `/api/v1/sessions/${SESSIONE}/settings`, corpo: '{"modello":"deepseek:deepseek-v4-pro","reasoning":{"effort":"high"}}' })
            expect([conv.modello.value, conv.ragionamento.value]).toEqual(['deepseek:deepseek-v4-pro', { effort: 'high' }])
            expect(await conv.impostaRagionamento({ effort: 'none' })).toBe(true)
            expect(c.richieste.at(-1)!.corpo).toBe('{"reasoning":{"effort":"none"}}')
            risposta = vere.modelloStorto
            expect(await conv.impostaModello('non un modello', null)).toBe(false)
            expect(conv.modello.value).toBe('deepseek:deepseek-v4-pro')
            expect(conv.errore.value?.code).toBe('MODEL_ID_INVALID')
            risposta = vere.ragionamentoStorto
            expect(await conv.impostaRagionamento({ effort: 'off' })).toBe(false)
            expect(conv.ragionamento.value).toEqual({ effort: 'none' })
            expect(conv.errore.value?.code).toBe('REASONING_INVALID')
        })

        it('USR4-32 senza sessione la scelta va in `custom`; `primaDiInviare` passa prima di `custom` e `resume`; il suo rifiuto ferma l\'invio', async () => {
            const ordine: string[] = []
            let rifiuta: Error | null = null
            const c = clienteFinto((r) => {
                ordine.push(`${r.metodo} ${r.percorso}`)
                if (r.percorso.endsWith('/custom')) return { stato: 200, corpo: JSON.stringify({ ok: true, data: { sessionId: SESSIONE } }) }
                if (r.percorso.endsWith('/resume')) return { stato: vere.invioSenzaChiave.stato, corpo: JSON.stringify(vere.invioSenzaChiave.d) }
                return { stato: 200, corpo: '{"ok":true,"data":{}}' }
            })
            const viste: (string | null)[] = []
            const conv = monta({
                cliente: c.ponte, cartella: '/w', attesaRiapertura: () => 0,
                primaDiInviare: async (m) => { viste.push(m); ordine.push(`prima ${m}`); if (rifiuta) throw rifiuta },
            })
            expect(await conv.impostaModello('z-ai/glm-4.7-flash', { effort: 'medium' })).toBe(true)
            expect(c.richieste).toEqual([]) // nessuna sessione: niente a r4, la scelta aspetta la prima
            expect(await conv.invia('Ciao')).toBe(true)
            const custom = c.richieste.find((r) => r.percorso.endsWith('/custom'))!
            expect(JSON.parse(custom.corpo!)).toEqual({ cartellaLibera: '/w', consegna: 'Ciao', modello: 'z-ai/glm-4.7-flash', reasoning: { effort: 'medium' } })
            expect(ordine.indexOf('prima z-ai/glm-4.7-flash')).toBeLessThan(ordine.indexOf('POST /api/v1/sessions/custom'))
            c.pezzo(['data: {"type":"RunStarted","runId":"r1","input":{"consegna":"Ciao"}}', 'data: {"type":"RunFinished","runId":"r1"}', ''].join(String.fromCharCode(10, 10)))
            // la ripresa senza chiave: r4 la ferma prima della rete e lo dice
            expect(await conv.invia('Ancora')).toBe(false)
            expect(conv.errore.value).toEqual({ code: 'CONFIG_INVALID', message: 'Invalid configuration', reason: 'provider-key-missing-named', params: { provider: 'DeepSeek' } })
            expect(viste).toEqual(['z-ai/glm-4.7-flash', 'z-ai/glm-4.7-flash'])
            // il passo prima rifiuta: niente parte
            rifiuta = Object.assign(new Error('Invalid body'), { code: 'QUERY_INVALID' })
            const prima = c.richieste.length
            expect(await conv.invia('Di nuovo')).toBe(false)
            expect(c.richieste.length).toBe(prima)
            expect(conv.errore.value).toEqual({ code: 'QUERY_INVALID', message: 'Invalid body' })
            expect(conv.inviando.value).toBe(false)
        })
    })

    // ⛔ K3-C Allegati A2 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): le immagini e la bolla vanno a r4 come il desktop (`custom` :6282,
    // `resume` :7059, `queue` :7933): `immagini: [{id}]` e `bolla: {testo, allegati}` accanto al testo per il modello.
    describe('le immagini e la bolla nei corpi (K3-C Allegati A2)', () => {
        it('USR4-33 `custom`, `resume` e `queue` portano `immagini` e `bolla` solo quando ci sono', async () => {
            const c = clienteFinto((r) => (r.percorso.endsWith('/custom') ? { stato: 200, corpo: JSON.stringify({ ok: true, data: { sessionId: 's9' } }) } : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
            const conv = monta({ cliente: c.ponte, cartella: '/w', attesaRiapertura: () => 0 })
            const immagini = [{ id: 'f'.repeat(64) }]
            const bolla = { testo: 'Guarda', allegati: [{ tipo: 'file', nome: 'a.md', percorso: '/w/allegati/a.md' }] }
            expect(await conv.invia('Describe the attached image.', { immagini })).toBe(true)
            expect(JSON.parse(c.richieste.find((r) => r.percorso.endsWith('/custom'))!.corpo!)).toEqual({ cartellaLibera: '/w', consegna: 'Describe the attached image.', immagini })
            c.pezzo(['data: {"type":"RunStarted","runId":"r1","input":{"consegna":"x"}}', 'data: {"type":"RunFinished","runId":"r1"}', ''].join(String.fromCharCode(10, 10)))
            const perIlModello = 'Guarda\n\nAttachments of this message:\n- attached file: /w/allegati/a.md'
            expect(await conv.invia(perIlModello, { bolla, immagini })).toBe(true)
            expect(JSON.parse(c.richieste.at(-1)!.corpo!)).toEqual({ messaggio: perIlModello, immagini, bolla })
            c.pezzo(['data: {"type":"RunStarted","runId":"r2","input":{"consegna":"x"}}', ''].join(String.fromCharCode(10, 10)))
            expect(await conv.accoda('Poi questo', { immagini, bolla: null })).toBe(true)
            expect(JSON.parse(c.richieste.at(-1)!.corpo!)).toEqual({ messaggio: 'Poi questo', immagini })
            expect(await conv.accoda('Solo testo')).toBe(true)
            expect(JSON.parse(c.richieste.at(-1)!.corpo!)).toEqual({ messaggio: 'Solo testo' })
        })
    })
})
