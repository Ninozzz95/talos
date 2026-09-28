/*
 * ⭐⭐ P18 fase 2/3 (owner 26/09/2026: «TALOS più veloce di tutti»; patch approvate via la lane desktop).
 *
 * Le `cerca` della STESSA risposta partono insieme (fino a 8) e il ciclo le consuma nell'ordine delle chiamate: qui si
 * prova che ogni risultato torna alla SUA chiamata, nell'ordine, anche quando partono insieme — e' la proprieta' che
 * una partenza anticipata puo' rompere (un risultato scambiato fra due ricerche e' peggio di una ricerca lenta).
 * E che lo Stop ferma una ricerca in volo senza ricadere sulla camminata JS.
 * Nessuna rete: il fornitore e' un `fetchDiRete` finto; ripgrep non serve (senza, `cerca` usa la camminata JS).
 */
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { cercaNelProgetto, discoNode, talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
const sse = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
    },
}))
const treCerca = () => sse([{ choices: [{ delta: { tool_calls: ['alfa', 'beta', 'gamma'].map((testo, index) => ({
    index, id: `call_${testo}`, function: { name: 'cerca', arguments: JSON.stringify({ testo }) },
})) } }] }])
const finale = () => sse([{ choices: [{ delta: { content: 'finito' } }] }])

function cartella(t) {
    const dir = mkdtempSync(join(tmpdir(), 'p18-insieme-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.txt'), 'alfa\n')
    writeFileSync(join(dir, 'src', 'b.txt'), 'beta\n')
    writeFileSync(join(dir, 'src', 'g.txt'), 'gamma\n')
    return dir
}

describe('P18 — `cerca` in parallelo nella stessa risposta', () => {
    it('tre `cerca` insieme: ogni risultato torna alla sua chiamata, nell\'ordine delle chiamate', async (t) => {
        const dir = cartella(t)
        let n = 0
        const esito = await talosLavora({
            cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {},
            fetchDiRete: async () => (n++ === 0 ? treCerca() : finale()),
        })
        const risultati = esito.messaggiFinali.filter((m) => m.role === 'tool')
        assert.deepEqual(risultati.map((m) => m.tool_call_id), ['call_alfa', 'call_beta', 'call_gamma'])
        assert.match(risultati[0].content, /src\/a\.txt/u)
        assert.doesNotMatch(risultati[0].content, /b\.txt|g\.txt/u)
        assert.match(risultati[1].content, /src\/b\.txt/u)
        assert.doesNotMatch(risultati[1].content, /a\.txt|g\.txt/u)
        assert.match(risultati[2].content, /src\/g\.txt/u)
        assert.doesNotMatch(risultati[2].content, /a\.txt|b\.txt/u)
    })

    it('una `cerca` DOPO una scrittura nella stessa risposta vede il file scritto (niente partenza anticipata oltre una scrittura)', async (t) => {
        const dir = cartella(t)
        let n = 0
        const scriviPoiCerca = () => sse([{ choices: [{ delta: { tool_calls: [
            { index: 0, id: 'call_scrivi', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'src/nuovo.txt', contenuto: 'delta\n' }) } },
            { index: 1, id: 'call_cerca_1', function: { name: 'cerca', arguments: JSON.stringify({ testo: 'delta' }) } },
            { index: 2, id: 'call_cerca_2', function: { name: 'cerca', arguments: JSON.stringify({ testo: 'alfa' }) } },
        ] } }] }])
        const esito = await talosLavora({
            cartella: dir, task: { consegna: 'scrivi e cerca' }, modello: 'x', chiave: 'y', onDelta: () => {},
            fetchDiRete: async () => (n++ === 0 ? scriviPoiCerca() : finale()),
        })
        const risultati = esito.messaggiFinali.filter((m) => m.role === 'tool')
        assert.deepEqual(risultati.map((m) => m.tool_call_id), ['call_scrivi', 'call_cerca_1', 'call_cerca_2'])
        assert.match(risultati[0].content, /nuovo\.txt/u, `la scrittura e' riuscita: ${risultati[0].content.slice(0, 200)}`)
        assert.match(risultati[1].content, /src\/nuovo\.txt/u, 'la ricerca vede il file scritto prima di lei')
    })

    it('lo Stop ferma anche la camminata JS (senza ripgrep)', async (t) => {
        const dir = cartella(t)
        const prima = process.env.TALOS_RG_PATH
        process.env.TALOS_RG_PATH = join(dir, 'nessun-rg.exe')
        t.after(() => { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima })
        const stop = new AbortController()
        stop.abort()
        const out = await cercaNelProgetto(discoNode({ radice: dir }), { testo: 'alfa' }, { radice: dir, segnale: stop.signal })
        assert.equal(out, 'stopped: the search was interrupted.')
    })

    it('lo Stop ferma una ricerca ripgrep in volo e non ricade sulla camminata JS', async (t) => {
        const rg = process.env.TALOS_RG_PATH
        if (!rg) { t.skip('nessun ripgrep in TALOS_RG_PATH (la CLI lo passa dal suo pacchetto)'); return }
        const dir = cartella(t)
        const stop = new AbortController()
        stop.abort()
        const out = await cercaNelProgetto(discoNode({ radice: dir }), { testo: 'alfa' }, { radice: dir, segnale: stop.signal })
        assert.equal(out, 'stopped: the search was interrupted.')
    })
})
