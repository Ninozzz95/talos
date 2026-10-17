import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leggiFlussoSse } from '@/lib/harness/r4/eventiR4'
import {
    anteprimaIndiceGiriR4, applicaEventoPannelloR4, contaDiffR4, creaPannelloR4, giriDelPannelloR4, kiloR4, limiteCheAgisceR4,
    percentoR4, percheDelLimiteR4, riassuntoFileR4, righeAmbienteR4, righeFileR4, righeFinestraR4, righeFinestraSulLimiteR4,
    righeGiriR4, testoPannelloR4, testoRiusoCacheR4,
} from '@/lib/harness/r4/pannelloR4'

/**
 * ⛔ K3-C3b-1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): le schede Contesto e File del pannello ▤ dicono ESATTAMENTE
 * ciò che dicono le funzioni del desktop r4. Il golden l'hanno calcolato `inspector.js`, `contesto-scheda.js`, `consumo-sessione.js` e
 * `review.js` @ fc5e25d62 (in Node, `impostaLingua('it'|'en')`); lo stato viene dal golden VERO di una sessione che scrive un file.
 */
const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const golden = JSON.parse(readFileSync(resolve(FIXTURE, 'pannello-fc5e25d62.json'), 'utf8'))
const stato = (nome: string) => leggiFlussoSse(readFileSync(resolve(FIXTURE, nome), 'utf8')).map((e) => e.dati)
    .reduce(applicaEventoPannelloR4, creaPannelloR4())

describe('il pannello ▤ del Codice su r4 (K3-C3b-1)', () => {
    it('PAN-01 le regole del desktop, parola per parola, in italiano e in inglese', () => {
        const c = golden.casi
        for (const e of golden.esiti) {
            const l = e.lingua
            expect(c.ambiente.map((x: any) => righeAmbienteR4(x, l)), `${l} ambiente`).toEqual(e.ambiente)
            expect(c.limite.map((x: any) => limiteCheAgisceR4(x)), `${l} limite`).toEqual(e.limite)
            expect(c.limite.map((x: any) => percheDelLimiteR4(limiteCheAgisceR4(x))), `${l} perché`).toEqual(e.perche)
            expect(c.finestraSulLimite.map((x: any) => righeFinestraSulLimiteR4(x, l)), `${l} finestra sul limite`).toEqual(e.finestraSulLimite)
            expect(c.finestra.map((a: any[]) => righeFinestraR4(a[0], a[1], a[2], a[3], l)), `${l} finestra`).toEqual(e.finestra)
            expect([null, { percentuale: 85, giriMisurati: 11 }, { percentuale: 100, giriMisurati: 1 }, { percentuale: 120, giriMisurati: 2 }]
                .map((m) => testoRiusoCacheR4(m, l)), `${l} cache`).toEqual(e.cache)
            expect(c.giri.map((g: any) => righeGiriR4(g, l)), `${l} giri`).toEqual(e.giri)
            expect(c.giri.map((g: any) => anteprimaIndiceGiriR4(g, l)), `${l} anteprima`).toEqual(e.anteprimaGiri)
            expect(c.file.map((f: any) => righeFileR4(f)), `${l} file`).toEqual(e.file)
            expect(c.file.map((f: any) => riassuntoFileR4(f, l)), `${l} riassunto`).toEqual(e.riassuntoFile)
            expect([0, 400, 41234, 200000, -1, 'x'].map((n) => kiloR4(n, l)), `${l} kilo`).toEqual(e.kilo)
            expect([[3.75, 100], [1, 3], [5, 0]].map(([a, b]) => percentoR4(a, b, l)), `${l} percento`).toEqual(e.percento)
        }
    })

    it('PAN-02 la sessione vera che scrive un file: +1 alla nascita, poi +4 −1 sulla riscrittura (col suo «prima»)', () => {
        const p = stato('r4-fc5e25d62-scrittura-vivo.sse')
        // K3 Revisione: la voce porta anche giro, righe e simboli (provati in `revisioneR4.test.ts`); qui i conteggi
        expect(p.file).toMatchObject([{ path: 'slugify.mjs', aggiunte: 4, rimozioni: 1, nuovo: false }])
        expect(riassuntoFileR4(p.file, 'it')).toBe('1 file modificato · +4 −1')
        const soloNascita = leggiFlussoSse(readFileSync(resolve(FIXTURE, 'r4-fc5e25d62-scrittura-vivo.sse'), 'utf8')).map((e) => e.dati)
        const finoAllaNascita = soloNascita.slice(0, soloNascita.findIndex((e) => (e.delta as any)?.[0]?.op === 'replace' && String((e.delta as any)?.[0]?.path).startsWith('/file/')))
        expect(finoAllaNascita.reduce(applicaEventoPannelloR4, creaPannelloR4()).file).toMatchObject([{ path: 'slugify.mjs', aggiunte: 1, rimozioni: 0, nuovo: true }])
    })

    it('PAN-03 ambiente, misura del contesto (solo il prompt dell\'ultima chiamata) e giri dagli eventi', () => {
        const p = stato('r4-fc5e25d62-scrittura-vivo.sse')
        expect(p.contesto).toMatchObject({ progetto: 'progetto', modello: 'lmstudio:finto' })
        expect(p.ultimaRichiesta).toEqual({ prompt_tokens: 100, completion_tokens: 0 })
        const giri = giriDelPannelloR4(p)
        // il titolo è l'inizio del testo COME SI LEGGE (5 parole, senza «##», «-» o accenti gravi), come `titoloRispostaDaTurno`
        expect(giri).toEqual([
            { numero: 1, titolo: 'Leggi NOTA.md e dimmi cosa', tu: true },
            { numero: 2, titolo: 'Cosa dice la nota Il', attrezzi: 1 },
            { numero: 3, titolo: 'Riassumi in una riga', tu: true },
            { numero: 4, titolo: 'In una riga: la nota', attrezzi: 0 },
            { numero: 5, titolo: 'Scrivi slugify.mjs con una prima', tu: true },
            { numero: 6, titolo: 'Fatto: slugify.mjs ora toglie gli', attrezzi: 2 },
        ])
        expect(righeGiriR4(giri, 'it')[1]).toEqual(['2 · Cosa dice la nota Il', '1 attrezzo', ''])
        expect(anteprimaIndiceGiriR4(giri, 'it')).toBe('3 giri · 3 messaggi')
    })

    it('PAN-04 la storia rigiocata dà lo stesso pannello del dal vivo', () => {
        const vivo = stato('r4-fc5e25d62-scrittura-vivo.sse')
        const rigiocata = stato('r4-fc5e25d62-scrittura-rigiocata.sse')
        expect(rigiocata.file).toEqual(vivo.file)
        expect(rigiocata.contesto).toEqual(vivo.contesto)
        expect(giriDelPannelloR4(rigiocata)).toEqual(giriDelPannelloR4(vivo))
    })

    it('PAN-05 diff onesto: senza «prima» una riscrittura non conta righe; oltre 1.500 righe non si finge un diff', () => {
        expect(contaDiffR4('a\nb\nc\n', 'a\nx\nc\n')).toEqual({ aggiunte: 1, rimozioni: 1 })
        expect(contaDiffR4('', 'uno\ndue\n')).toEqual({ aggiunte: 2, rimozioni: 0 })
        expect(contaDiffR4('x\n'.repeat(1501), 'y')).toBeNull()
        let p = creaPannelloR4()
        p = applicaEventoPannelloR4(p, { type: 'StateDelta', delta: [{ op: 'replace', path: '/file/a.txt', value: 'nuovo\ntesto' }] })
        expect(p.file).toMatchObject([{ path: 'a.txt', aggiunte: 0, rimozioni: 0, nuovo: false, diffVero: false }])
        p = applicaEventoPannelloR4(p, { type: 'StateDelta', delta: [{ op: 'add', path: '/file/b.txt', value: 'uno\ndue\ntre\n' }] })
        p = applicaEventoPannelloR4(p, { type: 'StateDelta', delta: [{ op: 'replace', path: '/file/a.txt', value: 'z', prima: 'nuovo\ntesto' }] })
        expect(p.file.map((f) => f.path)).toEqual(['a.txt', 'b.txt'])
        // K3 Revisione (golden 701c6c0d2, `vecchio-chiamante.txt`): senza «prima» il desktop disegna `dopo.split('\n')` e conta le
        // righe disegnate (`contaDiff`): un a-capo finale è una riga «+» vuota in più. Prima qui c'era 3 (contato con `righeDelTesto`).
        expect(p.file[1]).toMatchObject({ path: 'b.txt', aggiunte: 4, rimozioni: 0, nuovo: true, diffVero: false })
        // un uso fallito o a zero non è una misura; `/usage` cumulativo non tocca la misura del contesto
        p = applicaEventoPannelloR4(p, { type: 'CUSTOM', name: 'consumo-fornitore', value: { usage: { prompt_tokens: 0 }, esito: 'completato' } })
        p = applicaEventoPannelloR4(p, { type: 'CUSTOM', name: 'consumo-fornitore', value: { usage: { prompt_tokens: 900 }, esito: 'interrotto' } })
        p = applicaEventoPannelloR4(p, { type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: 99999 } }] })
        expect(p.ultimaRichiesta).toBeNull()
        expect(testoPannelloR4('modello.inspector.contextWindow', 'it')).toBe('Finestra del contesto')
        expect(testoPannelloR4('modello.inspector.contextWindow', 'en')).toBe('Context window')
    })
})

/*
 * ⛔ K3-C3b-2a: il pannello tiene gli eventi dei comandi (solo di quelli visti partire), i giri cominciati e se l'ultimo è vivo.
 * Dal golden VERO di r4: un comando fermato con lo Stop (130), uno che esce 2, uno riuscito; nella rigiocata il primo è «tolto».
 */
describe('i comandi nello stato del pannello (K3-C3b-2a)', () => {
    it('PAN-06 dal flusso alle righe dei Processi; un attrezzo che non è un comando non entra; il giro finito non è vivo', async () => {
        const { processiDagliEventiR4 } = await import('@/lib/harness/r4/processiR4')
        const vivo = stato('r4-fc5e25d62-comando-vivo.sse')
        expect(vivo.giriVisti).toBe(3)
        expect(vivo.giroVivo).toBe(false)
        expect(vivo.attrezzi.every((a) => /^comando[0-2]$/u.test(a.toolCallId) || a.type === 'ApprovalResolved')).toBe(true)
        const righe = processiDagliEventiR4(vivo.attrezzi, { giroCorrente: vivo.giriVisti, giroVivo: vivo.giroVivo })
        expect(righe.map((p) => [p.id, p.stato, p.uscita])).toEqual([['comando2', 'riuscito', 0], ['comando1', 'fallito', 2], ['comando0', 'annullato', 130]])
        const rigiocata = stato('r4-fc5e25d62-comando-rigiocata.sse')
        expect(processiDagliEventiR4(rigiocata.attrezzi, { giroCorrente: rigiocata.giriVisti, giroVivo: false }).filter((p) => p.tolto).map((p) => p.id)).toEqual(['comando0'])
        // `reduce` passa l'indice come terzo argomento: non deve diventare l'ora d'arrivo
        const prima = Date.now()
        const p = applicaEventoPannelloR4(creaPannelloR4(), { type: 'ToolCallStart', toolCallId: 'x', toolCallName: 'shell' }, 3 as never)
        expect(p.attrezzi[0].ricevutoA as number).toBeGreaterThanOrEqual(prima)
        expect(applicaEventoPannelloR4(creaPannelloR4(), { type: 'ToolCallStart', toolCallId: 'y', toolCallName: 'leggi' }).attrezzi).toEqual([])
    })

    /*
     * ⛔ K3-IDX (15/10 sera, foto del Pad di K3-PAN840): l'«Indice dei giri» diceva «2 · Ho delegato due compiti.Fatto: conta». Un
     * risultato di sotto-agente consegnato DENTRO il giro divide la risposta in due messaggi (K3-RISDEL); il desktop fa l'indice dai
     * blocchi della sua conversazione, quindi qui una riga per parte, ognuna col suo titolo e i suoi attrezzi.
     */
    it('PAN-07 un risultato consegnato dentro il giro apre una riga nuova dell\'indice: niente testi incollati', () => {
        const giri = leggiFlussoSse(readFileSync(resolve(FIXTURE, 'r4-fc5e25d62-delega-rigiocata.sse'), 'utf8')).map((e) => e.dati as Record<string, unknown>).reduce((p, e) => applicaEventoPannelloR4(p, e), creaPannelloR4()).giri
        const dopo = giri.slice(giri.findIndex((g) => g.tu && g.titolo === 'Delega ancora un controllo') + 1)
        expect(dopo.map((g) => ({ titolo: g.titolo, attrezzi: g.attrezzi, tu: g.tu ?? false }))).toEqual([
            { titolo: 'Ho delegato un compito.', attrezzi: 1, tu: false },
            { titolo: 'Fatto: controlla la data di', attrezzi: 0, tu: false },
        ])
        expect(giri.map((g) => g.numero)).toEqual(giri.map((_, i) => i + 1))
        expect(giri.some((g) => /\.[A-Z]/u.test(g.titolo ?? ''))).toBe(false)
        // una consegna della persona (senza `origine`) non divide la riga
        let p = creaPannelloR4()
        for (const e of [
            { type: 'RunStarted', input: { consegna: 'x' } },
            { type: 'TextMessageContent', delta: 'Prima parte.' },
            { type: 'QueuedMessageDelivered', testo: 'seguito' },
            { type: 'TextMessageContent', delta: ' Seconda.' },
            { type: 'RunFinished' },
        ]) p = applicaEventoPannelloR4(p, e)
        expect(p.giri.filter((g) => !g.tu).map((g) => g.titolo)).toEqual(['Prima parte. Seconda.'])
    })
})
