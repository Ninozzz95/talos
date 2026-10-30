/*
 * 26/10/2026 — difetto riportato dalla CLI (stress test 0.6.14, riprodotto da lei): `prova` rispondeva «NOT RUN … there is no
 * package.json in this folder» anche quando il package.json c'era, se il modello l'aveva scritto NELLO STESSO GIRO. Causa:
 * `talosHarness.desktop-hotfix.mjs` calcolava `provaSenzaSuite` una volta sola, all'avvio del giro, e il kernel
 * (`talosHarness.mjs`, «provaSenzaSuite ?? await suiteMancante(…)») usava quel valore vecchio invece del controllo fresco. Cura: il
 * motivo si calcola al momento della chiamata a `prova` (una funzione, non un valore); un valore resta accettato com'era.
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { talosLavora as talosLavoraDesktop } from '../src/kernel/talosHarness.desktop-hotfix.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
const fintoBackend = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
    },
}))
const chiamata = (nome, argomenti = {}, id = `call_${nome}`) => () => fintoBackend([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] },
])
const testoFinale = () => fintoBackend([{ choices: [{ delta: { content: 'finito' } }] }])

async function giro(cartella, chiamate) {
    let n = 0
    const esito = await talosLavoraDesktop({
        cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', comandoProva: 'npm test',
        permessiSessione: { scrivi: 'sempre', prova: 'sempre' },
        onDelta: () => {},
        fetchDiRete: async () => (n < chiamate.length ? chiamate[n++]() : testoFinale()),
    })
    return esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => String(m.content))
}

it('PROVA-MOMENTO-01 un package.json scritto nello stesso giro si vede: prova non dice «there is no package.json»', async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-prova-momento-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const pacchetto = JSON.stringify({ name: 'p', version: '1.0.0', scripts: { test: 'node t.mjs' } })
    const esiti = await giro(cartella, [
        chiamata('scrivi', { percorso: 't.mjs', contenuto: "console.log('ok')\n" }, 'c1'),
        chiamata('scrivi', { percorso: 'package.json', contenuto: pacchetto }, 'c2'),
        chiamata('prova', {}, 'c3'),
    ])
    const prova = esiti.at(-1)
    assert.doesNotMatch(prova, /no package\.json in this folder/u, `prova ha usato il motivo calcolato all'avvio: ${prova.slice(0, 200)}`)
    assert.doesNotMatch(prova, /NOT RUN/u, prova.slice(0, 200))
})

it('PROVA-MOMENTO-02 al contrario: senza package.json, prova dice ancora NOT RUN col motivo vero', async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-prova-momento-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const esiti = await giro(cartella, [chiamata('prova', {}, 'c1')])
    assert.match(esiti.at(-1), /NOT RUN/u)
    assert.match(esiti.at(-1), /no package\.json in this folder/u)
})

it('PROVA-MOMENTO-03 (revisione del blocco) un chiamante che passa ancora un VALORE fisso funziona come prima', async (t) => {
    const { talosLavora } = await import('../src/kernel/talosHarness.mjs')
    const cartella = mkdtempSync(join(tmpdir(), 'talos-prova-momento-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    let n = 0
    const sequenza = [chiamata('prova', {}, 'c1')]
    const esito = await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', comandoProva: 'npm test',
        provaSenzaSuite: 'motivo fisso del chiamante',
        onDelta: () => {},
        fetchDiRete: async () => (n < sequenza.length ? sequenza[n++]() : testoFinale()),
    })
    const prova = esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => String(m.content)).at(-1)
    assert.match(prova, /NOT RUN/u)
    assert.match(prova, /motivo fisso del chiamante/u, 'il valore del chiamante arriva nell\'esito come prima')
})
