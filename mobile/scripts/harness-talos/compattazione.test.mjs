import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from './talosHarness.mjs'
import { compattazione } from './dist/kernelPerIlBanco.js'

/*
 * ⭐⭐⭐ P4-ter (02/10/2026) — la compattazione del Codice nel giro vero del kernel. Prima: lo «Stadio A» (ogni 8 giri del
 *   TURNO, attrezzi passati al riassuntore, storia grezza SOSTITUITA). Ora il nucleo unico (`src/lib/kernel/compattazione.ts`,
 *   porta del desktop `75108d7ee`… `e027390ba`): soglia sulla finestra utile, storia grezza intatta, record, overflow, anti-ciclo.
 *   Ledger `.claude/ragionamento/LEDGER-P4TER-COMPATTATORE-2026-10-02.md`.
 */
const { MARCATORE_RIASSUNTO, MAX_TOKEN_RIASSUNTO, creaRecord } = compattazione

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-comp-'))
    t.after(() => rmSync(c, { recursive: true, force: true }))
    return c
}

const eRiassunto = (corpo) => typeof corpo.messages.at(-1)?.content === 'string' && corpo.messages.at(-1).content.startsWith('CONTEXT COMPACTION')

/**
 * Una rete finta: registra ogni corpo; alla richiesta di riassunto risponde `riassunto(n)`, alle altre `normale(n)`.
 * `n` conta le chiamate di quel tipo, da 0.
 */
function rete({ riassunto = () => ({ content: 'RIASSUNTO-FINTO' }), normale = () => ({ content: 'Fatto.' }), usage = () => ({ prompt_tokens: 10, completion_tokens: 10 }) } = {}) {
    const corpi = []
    let nRiassunti = 0
    let nNormali = 0
    const fetchDiRete = async (_url, init) => {
        const corpo = JSON.parse(init.body)
        corpi.push(corpo)
        const risposta = eRiassunto(corpo) ? riassunto(nRiassunti++) : normale(nNormali++)
        if (risposta?.errore) {
            return { ok: false, status: risposta.errore.status, text: async () => risposta.errore.corpo, json: async () => ({}) }
        }
        return {
            ok: true, status: 200, text: async () => '',
            json: async () => ({ choices: [{ message: { role: 'assistant', ...risposta }, finish_reason: risposta.tool_calls ? 'tool_calls' : 'stop' }], usage: usage(corpo) }),
        }
    }
    return { fetchDiRete, corpi, riassunti: () => corpi.filter(eRiassunto), normali: () => corpi.filter((c) => !eRiassunto(c)) }
}

/** Una storia già lunga: `scambi` richieste, ognuna con una lettura da `caratteri` caratteri. */
function storiaLunga(scambi, caratteri, { esitoExtra = '' } = {}) {
    const lista = [{ role: 'system', content: 'Sei TALOS.' }]
    for (let i = 0; i < scambi; i += 1) {
        lista.push({ role: 'user', content: `richiesta ${i}` })
        lista.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `src/file${i}.mjs` }) } }] })
        lista.push({ role: 'tool', tool_call_id: `c${i}`, content: `${'x'.repeat(caratteri)}${esitoExtra}` })
        lista.push({ role: 'assistant', content: `fatto ${i}` })
    }
    lista.push({ role: 'user', content: 'e adesso?' })
    return lista
}

async function giro(t, { messaggiIniziali, ...opzioni }, r) {
    return talosLavora({ cartella: cartella(t), task: { consegna: 'continua' }, modello: 'test', chiave: 'test', messaggiIniziali, fetchDiRete: r.fetchDiRete, ...opzioni })
}

describe('P4-ter — la compattazione nel giro del Codice', () => {
    it('COMP-01 sotto la soglia nessun riassunto: nessuna chiamata in più', async (t) => {
        const r = rete()
        await giro(t, { messaggiIniziali: storiaLunga(3, 400), finestraToken: 128_000 }, r)
        assert.equal(r.riassunti().length, 0)
        assert.equal(r.normali().length, 1)
    })

    it('COMP-02 sopra la soglia: riassunto SENZA attrezzi e con tetto d\'uscita; al modello va la proiezione; la storia grezza resta', async (t) => {
        const r = rete()
        const iniziale = storiaLunga(8, 2_000)
        const esito = await giro(t, { messaggiIniziali: iniziale, tettoToken: 2_000, finestraToken: 1_000_000 }, r)
        assert.equal(r.riassunti().length, 1, 'un riassunto')
        const richiesta = r.riassunti()[0]
        assert.ok(!('tools' in richiesta) || richiesta.tools.length === 0, 'nessun attrezzo al riassuntore (K4 del desktop)')
        assert.ok(!('tool_choice' in richiesta), 'nessun tool_choice senza attrezzi')
        assert.equal(richiesta.max_tokens, MAX_TOKEN_RIASSUNTO)
        const inviata = r.normali()[0].messages
        assert.ok(inviata.some((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO)), 'il modello riceve la proiezione')
        assert.ok(inviata.length < iniziale.length)
        // La storia GREZZA resta: decisione 3 dell'owner (desktop 24/09).
        assert.deepEqual(esito.messaggiFinali.slice(0, iniziale.length), iniziale)
        assert.ok(!esito.messaggiFinali.some((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO)))
        assert.equal(esito.recordDiCompattazione.length, 1)
        assert.equal(esito.recordDiCompattazione[0].coveredThrough, iniziale.length)
        // Nessun giro di lavoro consumato dal riassunto (lo Stadio A faceva `continue`).
        assert.equal(esito.compattazioni, 1)
    })

    it('COMP-03 il record del turno prima si applica dal primo giro del turno dopo, senza ripagare il riassunto', async (t) => {
        const iniziale = storiaLunga(8, 2_000)
        const proiezione = [iniziale[0], { role: 'user', content: `${MARCATORE_RIASSUNTO}\n\nGIA-RIASSUNTO` }, ...iniziale.slice(-5)]
        const record = creaRecord({ coveredThrough: iniziale.length - 1, riassunto: proiezione })
        const r = rete()
        await giro(t, { messaggiIniziali: iniziale, recordCompattazioneIniziale: record, tettoToken: 100_000 }, r)
        assert.equal(r.riassunti().length, 0)
        assert.ok(r.normali()[0].messages.some((m) => m.content?.includes?.('GIA-RIASSUNTO')))
    })

    it('COMP-04 il fornitore dice «contesto pieno»: un ritentativo con la storia compattata', async (t) => {
        const pieno = JSON.stringify({ error: { code: 400, message: "This endpoint's maximum context length is 131072 tokens. However, you requested about 135349 tokens" } })
        const r = rete({ normale: (n) => (n === 0 ? { errore: { status: 400, corpo: pieno } } : { content: 'Fatto.' }) })
        const esito = await giro(t, { messaggiIniziali: storiaLunga(8, 2_000), tettoToken: 1_000_000 }, r)
        assert.equal(r.riassunti().length, 1, 'compattazione forzata dall\'overflow')
        assert.equal(r.normali().length, 2, 'la richiesta fallita e il ritentativo')
        assert.ok(r.normali()[1].messages.some((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO)))
        assert.equal(esito.comeFinita, 'concluso')
    })

    it('COMP-05 finestra piccola: con la risposta riservata scatta prima di sfondare (Hermes, finestra utile)', async (t) => {
        // ~2.600 token stimati: sopra 0,75 × (4.096 − 1.024) = 2.304, sotto 0,75 × 4.096 = 3.072.
        const storia = storiaLunga(4, 2_400)
        const conRiserva = rete()
        await giro(t, { messaggiIniziali: storia, finestraToken: 4_096, riservaUscita: 1_024 }, conRiserva)
        assert.equal(conRiserva.riassunti().length, 1)
        const senza = rete()
        await giro(t, { messaggiIniziali: storia, finestraToken: 4_096 }, senza)
        assert.equal(senza.riassunti().length, 0, 'verso contrario: senza riserva non scatta')
    })

    it('COMP-06 una chiave dentro un esito non arriva al riassuntore; il percorso sì (+1 su Hermes)', async (t) => {
        const chiave = 'sk-or-v1-0123456789abcdef0123456789abcdef'
        const r = rete()
        await giro(t, { messaggiIniziali: storiaLunga(8, 2_000, { esitoExtra: `\nOPENROUTER_API_KEY=${chiave}` }), tettoToken: 2_000 }, r)
        const corpo = JSON.stringify(r.riassunti()[0])
        assert.ok(!corpo.includes(chiave), 'la chiave è oscurata')
        assert.ok(corpo.includes('src/file0.mjs'), 'il percorso resta')
    })

    it('COMP-07 un riassunto che fallisce due volte: si continua senza, nessun ciclo di riassunti', async (t) => {
        const r = rete({
            riassunto: () => ({ content: '' }),
            normale: (n) => (n < 3
                ? { content: null, tool_calls: [{ id: `x${n}`, type: 'function', function: { name: 'elenca', arguments: '{}' } }] }
                : { content: 'Fatto.' }),
        })
        const esito = await giro(t, { messaggiIniziali: storiaLunga(8, 2_000), tettoToken: 2_000, finestraToken: 1_000_000 }, r)
        assert.equal(r.riassunti().length, 2, 'un tentativo e un ritentativo, poi basta per questo turno')
        assert.equal(esito.comeFinita, 'concluso')
        assert.ok(!r.normali()[0].messages.some((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO)), 'senza riassunto parte la storia com\'è')
    })

    it('COMP-08 anti-ciclo: se il fornitore dice che dopo la compattazione si è ancora sopra, al secondo verdetto si smette', async (t) => {
        // Ogni richiesta normale «costa» 50.000 token secondo il fornitore: sopra la soglia (2.000) anche dopo ogni compattazione.
        const r = rete({
            usage: (corpo) => ({ prompt_tokens: eRiassunto(corpo) ? 10 : 50_000, completion_tokens: 10 }),
            normale: (n) => (n < 6
                ? { content: null, tool_calls: [{ id: `y${n}`, type: 'function', function: { name: 'elenca', arguments: '{}' } }] }
                : { content: 'Fatto.' }),
        })
        await giro(t, { messaggiIniziali: storiaLunga(10, 2_000), tettoToken: 2_000, finestraToken: 1_000_000 }, r)
        // ⛔ Prima qui c'era «≤ 6» (la rete di sicurezza): il mutante che spegneva i due verdetti sopravviveva. Due verdetti
        // inefficaci ⇒ due riassunti e basta, anche se le richieste dopo restano sopra la soglia.
        assert.equal(r.riassunti().length, 2, `due verdetti inefficaci, poi si smette: ${r.riassunti().length}`)
        assert.ok(r.normali().length >= 7, 'il turno continua senza riassunti')
    })

    it('COMP-09 gli eventi della compattazione portano i numeri per la UI (prima → dopo, motivo)', async (t) => {
        const eventi = []
        const r = rete()
        await giro(t, { messaggiIniziali: storiaLunga(8, 2_000), tettoToken: 2_000, finestraToken: 1_000_000, onGiro: (e) => eventi.push(e) }, r)
        const inizio = eventi.find((e) => e.tipo === 'compattazione-inizio')
        const fine = eventi.find((e) => e.tipo === 'compattazione-fine')
        assert.equal(inizio.motivo, 'soglia')
        assert.ok(inizio.tokenMisurati > 2_000)
        assert.equal(fine.compattato, true)
        assert.ok(fine.record.tokenDopo < fine.record.tokenPrima)
    })
})
