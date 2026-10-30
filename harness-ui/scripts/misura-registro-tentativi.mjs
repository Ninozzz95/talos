/*
 * L1 1.2, fase 1 (contratto con la CLI, 26/10/2026): il registro dei tentativi IN OMBRA sulle sessioni salvate. Rigioca ogni giro
 *   (`RunStarted` apre un giro nuovo, come nel kernel) con `creaRegistroTentativi` e dice dove avrebbe dato la nota e dove si sarebbe
 *   fermato. Il registro si accende solo se la nota scatta in meno dell'1% dei giri sani e la fermata mai.
 * Uso: node scripts/misura-registro-tentativi.mjs <file.jsonl | cartella>… [--dettaglio]
 * Sola lettura: non scrive niente, non chiama nessuno.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { creaRegistroTentativi } from '../src/kernel/registro-tentativi.mjs'
import { modalitaDiScrittura } from '../src/kernel/talosHarness.mjs' // la stessa tabella dei modi di scrittura del kernel (revisione R4)

const argomenti = process.argv.slice(2)
const dettaglio = argomenti.includes('--dettaglio')
const file = []
/* Una cartella: i .jsonl che contiene, e poi, scendendo, quelli delle cartelle `sessions` (i profili dello stress test della CLI). */
function raccogli(cartella, radice) {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
        const p = join(cartella, voce.name)
        if (voce.isDirectory()) { if (voce.name !== 'node_modules' && voce.name !== '.git') raccogli(p, false) }
        else if (voce.name.endsWith('.jsonl') && (radice || cartella.endsWith('sessions'))) file.push(p)
    }
}
for (const a of argomenti.filter((x) => !x.startsWith('--'))) {
    if (statSync(a).isDirectory()) raccogli(a, true)
    else file.push(a)
}

const totali = { sessioni: 0, giri: 0, giriConNota: 0, giriConFermata: 0, chiamate: 0 }
for (const percorso of file) {
    const giri = []
    let giro = null
    const chiamate = new Map()
    for (const riga of readFileSync(percorso, 'utf8').split('\n')) {
        if (!riga) continue
        let e
        try { e = JSON.parse(riga) } catch { continue }
        if (e.type === 'RunStarted') { giro = { registro: creaRegistroTentativi({ modalitaDiScrittura }), n: 0, primaNota: null, primaFermata: null, massimo: 0 }; giri.push(giro) }
        else if (e.type === 'ToolCallStart' && giro) chiamate.set(e.toolCallId, { nome: e.toolCallName, args: '', giro })
        else if (e.type === 'ToolCallArgs' && chiamate.has(e.toolCallId)) chiamate.get(e.toolCallId).args += e.delta ?? ''
        else if (e.type === 'ToolCallResult' && chiamate.has(e.toolCallId)) {
            const c = chiamate.get(e.toolCallId)
            chiamate.delete(e.toolCallId)
            c.giro.n += 1
            totali.chiamate += 1
            const testo = String(e.content ?? '')
            /* Le copie scartate dal kernel (`talosHarness.mjs:1282`, «This tool did not run.») non arrivano mai al registro nel kernel:
               le toglie prima di eseguire. Qui si saltano allo stesso modo. */
            if (/This tool did not run\./u.test(testo)) continue
            const fallito = /^(?:⛔|Error|ERROR|Nothing was (?:written|changed))/u.test(testo.trimStart())
            const r = c.giro.registro.osserva({ nome: c.nome, argomenti: c.args, esito: testo, fallito })
            c.giro.massimo = Math.max(c.giro.massimo, r.livello)
            if (r.livello >= 1 && c.giro.primaNota === null) c.giro.primaNota = c.giro.n
            if (r.livello === 3 && c.giro.primaFermata === null) c.giro.primaFermata = c.giro.n
            if (dettaglio && r.nota) console.log(`  ${percorso.split(/[\\/]/u).at(-1)} giro ${giri.indexOf(c.giro) + 1} chiamata ${c.giro.n} ${c.nome}: livello ${r.livello} A=${r.A} B=${r.B}`)
        }
    }
    totali.sessioni += 1
    for (const g of giri) {
        totali.giri += 1
        if (g.primaNota !== null) totali.giriConNota += 1
        if (g.primaFermata !== null) totali.giriConFermata += 1
        if (g.massimo > 0) console.log(`${percorso}: giro ${giri.indexOf(g) + 1} di ${g.n} chiamate — nota alla ${g.primaNota}${g.primaFermata !== null ? `, fermata alla ${g.primaFermata}` : ''}`)
    }
}
const pct = (n) => (totali.giri ? `${((100 * n) / totali.giri).toFixed(2)}%` : '—')
console.log(`\n${totali.sessioni} sessioni, ${totali.giri} giri, ${totali.chiamate} chiamate · giri con nota ${totali.giriConNota} (${pct(totali.giriConNota)}) · giri con fermata ${totali.giriConFermata} (${pct(totali.giriConFermata)})`)
