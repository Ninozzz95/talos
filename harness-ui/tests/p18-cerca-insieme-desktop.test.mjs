/*
 * ⭐ P18 — la verifica del desktop sulla patch della CLI (26/09/2026, owner: «appena arriva il ticket dalla cli su
 * ottimizzazione tool call dobbiamo implementarlo il prima possibile»).
 *
 * `p18-cerca-insieme.test.mjs` (della CLI) prova che ogni risultato torna alla SUA chiamata, nell'ordine: ma resta verde
 * anche se si toglie la partenza anticipata (verificato rompendola), quindi non dice che le ricerche partono INSIEME.
 * Questa prova lo dice senza misurare tempi: l'hook `pre_tool_call` della PRIMA `cerca` aspetta e poi cancella il testo
 * dai file delle altre due. Se sono partite insieme, l'avevano già trovato; in fila, non lo trovano più.
 * Senza ripgrep (il desktop oggi): la camminata JS, la stessa strada del 4174.
 */
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as dormi } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
const sse = (fotogrammi) => new Response(new ReadableStream({
  start(c) {
    for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`))
    c.enqueue(enc.encode('data: [DONE]\n\n'))
    c.close()
  },
}))
const chiamateCerca = (parole) => sse([{ choices: [{ delta: { tool_calls: parole.map((testo, index) => ({
  index, id: `call_${testo}`, function: { name: 'cerca', arguments: JSON.stringify({ testo }) },
})) } }] }])
const finale = () => sse([{ choices: [{ delta: { content: 'finito' } }] }])

describe('P18 sul desktop — le `cerca` della stessa risposta partono davvero insieme', () => {
  it('la seconda e la terza hanno già cercato mentre il ciclo è ancora sulla prima', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'p18-desktop-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.txt'), 'alfa\n')
    writeFileSync(join(dir, 'src', 'b.txt'), 'beta\n')
    writeFileSync(join(dir, 'src', 'g.txt'), 'gamma\n')
    let prima = true
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0 ? chiamateCerca(['alfa', 'beta', 'gamma']) : finale()),
      hookFn: async (evento) => {
        if (evento?.tipo !== 'pre_tool_call' || evento.azione !== 'cerca' || !prima) return undefined
        prima = false
        await dormi(400)
        writeFileSync(join(dir, 'src', 'b.txt'), 'nulla\n')
        writeFileSync(join(dir, 'src', 'g.txt'), 'nulla\n')
        return undefined
      },
    })
    const risultati = esito.messaggiFinali.filter((m) => m.role === 'tool')
    assert.deepEqual(risultati.map((m) => m.tool_call_id), ['call_alfa', 'call_beta', 'call_gamma'])
    assert.match(risultati[1].content, /src\/b\.txt/u, 'la seconda aveva già cercato prima che il file cambiasse')
    assert.match(risultati[2].content, /src\/g\.txt/u, 'e anche la terza')
  })

  it('una `cerca` sola non parte in anticipo: con una chiamata il ciclo fa come prima', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'p18-desktop-uno-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    writeFileSync(join(dir, 'b.txt'), 'beta\n')
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0 ? chiamateCerca(['beta']) : finale()),
      hookFn: async (evento) => {
        if (evento?.tipo !== 'pre_tool_call' || evento.azione !== 'cerca') return undefined
        // Lo stesso tempo della prova sopra: una ricerca partita in anticipo avrebbe già trovato «beta».
        await dormi(400)
        writeFileSync(join(dir, 'b.txt'), 'nulla\n')
        return undefined
      },
    })
    const [risultato] = esito.messaggiFinali.filter((m) => m.role === 'tool')
    assert.match(risultato.content, /no file matches/u, 'la ricerca è partita DOPO l’hook, come prima di P18')
  })
})
