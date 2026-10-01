/*
 * ⭐ P18 — la verifica del desktop sulla patch della CLI (26/09/2026, owner: «appena arriva il ticket dalla cli su
 * ottimizzazione tool call dobbiamo implementarlo il prima possibile»).
 *
 * `p18-cerca-insieme.test.mjs` (della CLI) prova che ogni risultato torna alla SUA chiamata, nell'ordine: ma resta verde
 * anche se si toglie la partenza anticipata (verificato rompendola), quindi non dice che le ricerche partono INSIEME.
 * L'hook della prima `cerca` aspetta le letture REALI delle tre ricerche prima di cambiare i file.
 * Nessuna attesa fissa: il vecchio sleep400 cancellava il contenuto troppo presto sotto carico.
 * Qui si seleziona esplicitamente la camminata JS; le altre suite cerca coprono anche ripgrep.
 */
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import fsPromesse from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

function osservaLetture(t, dir, percorsi, perFile) {
  const originale = fsPromesse.readFile
  const rgPrima = process.env.TALOS_RG_PATH
  const lette = new Map(percorsi.map((p) => [p, 0]))
  const { promise, resolve, reject } = Promise.withResolvers()
  const ferma = () => reject(t.signal.reason)
  t.signal.addEventListener('abort', ferma, { once: true })
  const osservata = t.mock.method(fsPromesse, 'readFile', async (...args) => {
    const contenuto = await originale(...args)
    if (lette.has(args[0])) {
      lette.set(args[0], lette.get(args[0]) + 1)
      if ([...lette.values()].every((n) => n >= perFile)) resolve()
    }
    return contenuto
  })
  // La copia del binding ESM è quella usata dal disco reale dentro il bundle.
  syncBuiltinESMExports()
  process.env.TALOS_RG_PATH = join(dir, 'ripgrep-non-installato')
  t.after(() => {
    osservata.mock.restore()
    syncBuiltinESMExports()
    t.signal.removeEventListener('abort', ferma)
    if (rgPrima === undefined) delete process.env.TALOS_RG_PATH
    else process.env.TALOS_RG_PATH = rgPrima
  })
  return { completate: promise, lette }
}

describe('P18 sul desktop — le `cerca` della stessa risposta partono davvero insieme', () => {
  it('P18-LOAD-SENSITIVE: tutte le letture precedono la cancellazione, senza sleep', { timeout: 5000 }, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'p18-desktop-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.txt'), 'alfa\n')
    writeFileSync(join(dir, 'src', 'b.txt'), 'beta\n')
    writeFileSync(join(dir, 'src', 'g.txt'), 'gamma\n')
    const letture = osservaLetture(t, dir, [join(dir, 'src', 'b.txt'), join(dir, 'src', 'g.txt')], 3)
    let prima = true
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {}, segnaleStop: t.signal,
      fetchDiRete: async () => (n++ === 0 ? chiamateCerca(['alfa', 'beta', 'gamma']) : finale()),
      hookFn: async (evento) => {
        if (evento?.tipo !== 'pre_tool_call' || evento.azione !== 'cerca' || !prima) return undefined
        prima = false
        await letture.completate
        writeFileSync(join(dir, 'src', 'b.txt'), 'nulla\n')
        writeFileSync(join(dir, 'src', 'g.txt'), 'nulla\n')
        return undefined
      },
    })
    assert.deepEqual([...letture.lette.values()], [3, 3], 'tre ricerche reali hanno letto entrambi i file')
    const risultati = esito.messaggiFinali.filter((m) => m.role === 'tool')
    assert.deepEqual(risultati.map((m) => m.tool_call_id), ['call_alfa', 'call_beta', 'call_gamma'])
    assert.match(risultati[1].content, /src\/b\.txt/u, 'la seconda aveva già cercato prima che il file cambiasse')
    assert.match(risultati[2].content, /src\/g\.txt/u, 'e anche la terza')
  })

  it('una `cerca` sola non parte in anticipo: con una chiamata il ciclo fa come prima', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'p18-desktop-uno-'))
    t.after(() => rimuoviCartellaDiProva(dir))
    writeFileSync(join(dir, 'b.txt'), 'beta\n')
    const letture = osservaLetture(t, dir, [join(dir, 'b.txt')], 1)
    let lettePrimaDellHook
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0 ? chiamateCerca(['beta']) : finale()),
      hookFn: async (evento) => {
        if (evento?.tipo !== 'pre_tool_call' || evento.azione !== 'cerca') return undefined
        lettePrimaDellHook = letture.lette.get(join(dir, 'b.txt'))
        writeFileSync(join(dir, 'b.txt'), 'nulla\n')
        return undefined
      },
    })
    await letture.completate
    assert.equal(lettePrimaDellHook, 0, 'nessuna lettura della chiamata singola prima dell’hook')
    const [risultato] = esito.messaggiFinali.filter((m) => m.role === 'tool')
    assert.match(risultato.content, /no file matches/u, 'la ricerca è partita DOPO l’hook, come prima di P18')
  })
})
