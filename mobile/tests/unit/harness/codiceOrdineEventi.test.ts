import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Il server importa il kernel col percorso del telefono: `vitest.config.ts` lo mappa sul kernel del repository.
import { registraRiga } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-store.mjs'
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'

/**
 * ⛔ Difetto 5 del ledger B3, trovato sul Pad il 24/09/2026: riaperta dopo un riavvio, una risposta del Codice era
 * RIMESCOLATA («Fatto! creato Hopro-bva1.txt con la par olaciao.» invece di «Fatto! Ho creato `prova-b1.txt` con la
 * parola `ciao`.»). Il frontend attacca i pezzi nell'ordine in cui arrivano; il server rilegge la trascrizione dal disco
 * nell'ordine delle righe; e le righe le scriveva `broadcast()` con un `appendFile` asincrono per evento, lanciato senza
 * aspettare il precedente. Node lo dice: con i metodi a callback o a promise «there is no guaranteed ordering», e più
 * scritture sullo stesso file senza aspettarle «is unsafe» (https://nodejs.org/api/fs.html, letto il 24/09/2026).
 *
 * Cura in due metà: le righe di un file si scrivono in fila (ORDINE-01…03) e la rilettura rimette gli eventi in ordine
 * di `_sequenza` (ORDINE-04/05), che ripara anche i file già scritti male sui telefoni.
 */

const cartelle: string[] = []
afterEach(() => {
    for (const cartella of cartelle.splice(0)) rmSync(cartella, { recursive: true, force: true })
})

function attesa(ms: number) {
    return new Promise((ok) => setTimeout(ok, ms))
}

describe('le righe di una sessione del Codice finiscono sul disco nell’ordine in cui nascono', () => {
    it('ORDINE-01 una scrittura più lenta non viene scavalcata da quella dopo', async () => {
        const file: string[] = []
        // La prima scrittura ci mette di più: senza fila, la seconda arriva sul disco per prima.
        const ritardi = [30, 1]
        const appendFileFn = async (_percorso: string, riga: string) => {
            await attesa(ritardi.shift() ?? 0)
            file.push(riga.trim())
        }
        const deps = { appendFileFn, mkdirFn: async () => undefined }

        await Promise.all([
            registraRiga({ cartellaStore: '/x', sessionId: 's', record: { _sequenza: 1 } }, deps),
            registraRiga({ cartellaStore: '/x', sessionId: 's', record: { _sequenza: 2 } }, deps),
        ])

        expect(file).toEqual(['{"_sequenza":1}', '{"_sequenza":2}'])
    })

    it('ORDINE-02 una scrittura fallita rifiuta la SUA promessa e non blocca le successive', async () => {
        const file: string[] = []
        let chiamate = 0
        const appendFileFn = async (_percorso: string, riga: string) => {
            chiamate += 1
            if (chiamate === 1) throw new Error('disco pieno')
            file.push(riga.trim())
        }
        const deps = { appendFileFn, mkdirFn: async () => undefined }

        const prima = registraRiga({ cartellaStore: '/x', sessionId: 's', record: { n: 1 } }, deps)
        const seconda = registraRiga({ cartellaStore: '/x', sessionId: 's', record: { n: 2 } }, deps)

        await expect(prima).rejects.toThrow('disco pieno')
        await seconda
        expect(file).toEqual(['{"n":2}'])
    })

    it('ORDINE-03 sul filesystem vero: 300 righe lanciate senza aspettare escono nello stesso ordine', async () => {
        const cartellaStore = mkdtempSync(join(tmpdir(), 'codice-ordine-'))
        cartelle.push(cartellaStore)
        const scritture = Array.from({ length: 300 }, (_, i) =>
            registraRiga({ cartellaStore, sessionId: 'vera', record: { _sequenza: i + 1, delta: `p${i}` } }))
        await Promise.all(scritture)

        const sequenze = readFileSync(join(cartellaStore, 'vera.jsonl'), 'utf8').trim().split('\n')
            .map((riga) => (JSON.parse(riga) as { _sequenza: number })._sequenza)
        expect(sequenze).toEqual(Array.from({ length: 300 }, (_, i) => i + 1))
    })
})

describe('la rilettura di una sessione del Codice rimette gli eventi in ordine', () => {
    const delta = (sequenza: number, testo: string) =>
        ({ type: 'TextMessageContent', messageId: 'm1', delta: testo, _sequenza: sequenza })

    type Evento = { type: string, delta?: string, _sequenza?: number }

    async function registroRipristinato(righe: unknown[], eseguiComandoDirettoFn?: unknown) {
        // Le opzioni del registro sono tipizzate dal JSDoc del .mjs, che non elenca `cartellaStore`: si passa com'è.
        // `registraRigaFn` muto: nessuna scrittura vera su disco da un test.
        const opzioni = {
            cartellaStore: '/finta',
            elencaSessioniPersistiteFn: async () => ['s1'],
            leggiRegistroFn: async () => righe,
            registraRigaFn: async () => undefined,
            ...(eseguiComandoDirettoFn ? { eseguiComandoDirettoFn } : {}),
        }
        const registro = createSessionRegistry(opzioni as never)
        await registro.ripristina()
        return registro
    }

    async function ripristinataDa(righe: unknown[]) {
        const registro = await registroRipristinato(righe)
        const visti: Evento[] = []
        registro.iscriviti('s1', (evento: Evento) => visti.push(evento))
        return visti
    }

    it('ORDINE-04 un file scritto fuori ordine (come quello del Pad) si rilegge in ordine di sequenza', async () => {
        const visti = await ripristinataDa([
            { tipo: 'intestazione', taskId: 'libero', avviataAlle: '2026-09-23T20:07:58.000Z' },
            { type: 'RunStarted', _sequenza: 1 },
            delta(2, 'Fatto!'),
            delta(4, ' creato'),
            delta(3, ' Ho'),
            delta(6, 'va-b1.txt`'),
            delta(5, ' `pro'),
            { type: 'RunFinished', _sequenza: 7 },
        ])

        expect(visti.map((evento) => evento._sequenza)).toEqual([1, 2, 3, 4, 5, 6, 7])
        expect(visti.map((evento) => evento.delta ?? '').join('')).toBe('Fatto! Ho creato `prova-b1.txt`')
    })

    it('ORDINE-05 un file già in ordine resta identico', async () => {
        const visti = await ripristinataDa([
            { tipo: 'intestazione', taskId: 'libero', avviataAlle: '2026-09-23T20:07:58.000Z' },
            { type: 'RunStarted', _sequenza: 1 },
            delta(2, 'Ciao'),
            { type: 'RunFinished', _sequenza: 3 },
        ])

        expect(visti.map((evento) => evento._sequenza)).toEqual([1, 2, 3])
    })

    it('ORDINE-06 dopo il riavvio un evento nuovo prende il numero dopo il PIÙ ALTO, mai uno già usato', async () => {
        // L'ultima riga del file NON è la più alta: prima della cura la sessione sembrava interrotta e ripartiva da 5.
        const registro = await registroRipristinato([
            { tipo: 'intestazione', taskId: 'libero', avviataAlle: '2026-09-23T20:07:58.000Z' },
            { type: 'RunStarted', _sequenza: 1 },
            delta(2, 'Fa'),
            delta(3, 'tto'),
            { type: 'RunFinished', _sequenza: 6 },
            delta(4, '!'),
            delta(5, ' Ciao'),
        ], async ({ onEvento }: { onEvento: (evento: Evento) => void }) => { onEvento({ type: 'RunStarted' }) })
        const visti: Evento[] = []
        registro.iscriviti('s1', (evento: Evento) => visti.push(evento))

        expect(registro.shell('s1', 'ls')).toEqual({ ok: true })
        await attesa(0)

        const sequenze = visti.map((evento) => evento._sequenza)
        expect(sequenze).toEqual([1, 2, 3, 4, 5, 6, 7])
        expect(new Set(sequenze).size).toBe(sequenze.length)
    })
})
