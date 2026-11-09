/*
 * Fase 8 «Impostazioni dalla chat» (owner 01/11/2026) — `app_settings` nel NUCLEO, con un fornitore finto: le condizioni delle sessioni
 * (forma §6) come prove.
 *   · CLI: senza ospite zero tracce (schema e ponte); un ospite che non è una funzione non lo accende; `SENZA_CARTA_IN_ACCESSO_PIENO`
 *     cambia solo per `app_settings`.
 *   · Performance: dietro il ponte con una riga < 200 caratteri; la richiesta non cambia fra un giro e l'altro (nemmeno dopo un set).
 *   · Carta (D3, D5, D7): niente carta in Accesso pieno, tranne i gruppi sicurezza e aggiornamenti; un no non scrive niente.
 *   · Mai alle figlie; nel Piano solo la lettura.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, SENZA_CARTA_IN_ACCESSO_PIENO, ATTREZZI_AUTOMAZIONI } from '../src/kernel/talosHarness.mjs'
import { ATTREZZI_DIFFERIBILI } from '../src/kernel/ponte-attrezzi.mjs'
import { NOME_IMPOSTAZIONI, cartaAncheInAccessoPieno } from '../src/kernel/impostazioni-app.mjs'
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-imp-k-'))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function giro(c, risposte, extra = {}) {
    let n = 0
    const offerti = []
    const strumenti = []
    const sistemi = []
    const corpi = []
    const r = await talosLavora({
        cartella: c, task: { consegna: 'impostazioni' }, modello: 'x', chiave: 'y', strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI],
        fetchDiRete: async (_url, init) => {
            const corpo = JSON.parse(init?.body ?? '{}')
            offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
            strumenti.push(JSON.stringify(corpo.tools ?? []))
            sistemi.push(JSON.stringify((corpo.messages ?? []).filter((m) => m.role === 'system')))
            corpi.push(init?.body ?? '')
            const prossima = risposte[n++]
            const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
            return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
        },
        chiediApprovazioneFn: async () => true,
        ...extra,
    })
    return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, strumenti, sistemi, corpi }
}

/** Un ospite finto: registra le chiamate; `gruppo` è il gruppo dell'unico cambio del set. */
function ospite({ gruppo = null } = {}) {
    const chiamate = []
    const fn = async (nome, argomenti, { fase, toolCallId }) => {
        chiamate.push({ nome, azione: argomenti?.action, fase, toolCallId })
        if (argomenti?.action === 'list') return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'appearance (10). Revision 5.' }
        if (argomenti?.action === 'set' || argomenti?.action === 'undo') {
            return fase === 'anteprima'
                ? { ok: true, carta: true, azione: { tipo: NOME_IMPOSTAZIONI, azione: argomenti.action, dove: 'pc', cambi: [{ chiave: 'appearance.theme', prima: 'forge', dopo: 'paper', gruppo }] } }
                : { ok: true, testo: 'appearance.theme: "forge" → "paper" (this app). Receipt set-1.' }
        }
        return { ok: false, messaggio: 'no' }
    }
    return { fn, chiamate }
}

test('IMP-K-01 (CLI 1 e 3): senza ospite, o con un ospite che non è una funzione, app_settings non esiste; con, si offre al root', async (t) => {
    const c = cartella(t)
    assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes(NOME_IMPOSTAZIONI), 'nell\'elenco di serie del desktop')
    const senza = await giro(c, [])
    assert.equal(senza.offerti[0].includes(NOME_IMPOSTAZIONI), false)
    assert.doesNotMatch(senza.corpi[0], /app_settings/u)
    const soloNome = await giro(c, [], { strumentiEstesi: [NOME_IMPOSTAZIONI] })
    assert.equal(soloNome.offerti[0].includes(NOME_IMPOSTAZIONI), false, 'chiesto da solo, senza ospite: non offerto')
    const rotto = await giro(c, [], { onImpostazioniFn: { non: 'una funzione' } })
    assert.doesNotMatch(rotto.corpi[0], /app_settings/u, 'un ospite in errore non lo accende')
    const con = await giro(c, [], { onImpostazioniFn: ospite().fn })
    assert.equal(con.offerti[0].includes(NOME_IMPOSTAZIONI), true)
    const soloCon = await giro(c, [], { strumentiEstesi: [NOME_IMPOSTAZIONI], onImpostazioniFn: ospite().fn })
    assert.equal(soloCon.offerti[0].includes(NOME_IMPOSTAZIONI), true)
    const figlia = await giro(c, [], { onImpostazioniFn: ospite().fn, agentRole: 'child' })
    assert.equal(figlia.offerti[0].includes(NOME_IMPOSTAZIONI), false, 'mai alle figlie')
})

test('IMP-K-02 (CLI 1): senza ospite la richiesta è byte per byte quella senza il nome nell\'elenco (zero tracce, anche nel ponte)', async (t) => {
    const c = cartella(t)
    const senzaNome = STRUMENTI_ESTESI_PREDEFINITI.filter((n) => n !== NOME_IMPOSTAZIONI)
    for (const differiti of [false, true]) {
        const a = await giro(c, [], { attrezziDifferiti: differiti })
        const b = await giro(c, [], { attrezziDifferiti: differiti, strumentiEstesi: senzaNome })
        assert.equal(a.corpi[0], b.corpi[0], `differiti=${differiti}`)
    }
})

test('IMP-K-03 (Performance 1, 2, 6): dietro il ponte, una riga < 200 caratteri; la lista e il sistema non cambiano fra i giri, nemmeno dopo un set', async (t) => {
    const c = cartella(t)
    assert.ok(ATTREZZI_DIFFERIBILI.has(NOME_IMPOSTAZIONI))
    const o = ospite()
    const r = await giro(c, [
        chiama('p1', 'tool_call', { name: NOME_IMPOSTAZIONI, arguments: { action: 'list' } }),
        chiama('p2', 'tool_call', { name: NOME_IMPOSTAZIONI, arguments: { action: 'set', changes: [{ key: 'appearance.theme', value: 'paper' }], expected_revision: 5 } }),
    ], { onImpostazioniFn: o.fn, attrezziDifferiti: true, livelloAccesso: 'accesso-pieno' })
    assert.equal(r.offerti[0].includes(NOME_IMPOSTAZIONI), false, 'non davanti')
    const ponte = JSON.parse(r.strumenti[0]).find((a) => a.function.name === 'tool_search')
    const riga = ponte.function.description.split('\n').find((l) => l.startsWith(`- ${NOME_IMPOSTAZIONI}:`))
    assert.ok(riga, 'nel catalogo del ponte')
    assert.ok(riga.length < 200, `riga di ${riga.length} caratteri`)
    assert.equal(r.strumenti[1], r.strumenti[0])
    assert.equal(r.strumenti[2], r.strumenti[0])
    assert.equal(r.sistemi[2], r.sistemi[0], 'nessun promemoria nel prompt dopo il set')
    assert.match(r.esito('p1'), /Revision 5/u)
    assert.match(r.esito('p2'), /Receipt set-1/u)
    /* l'unica differenza con o senza ospite è la riga del ponte (e il conto «N more tools») */
    const senza = await giro(c, [], { attrezziDifferiti: true, livelloAccesso: 'accesso-pieno' })
    const togli = (testo) => testo.replace(/\\n- app_settings: [^\\"]*/u, '').replace(/Search \d+ more tools/u, 'Search N more tools')
    const [x, y] = [togli(r.strumenti[0]), togli(senza.strumenti[0])]
    const dove = [...x].findIndex((ch, i) => ch !== y[i])
    assert.equal(x === y, true, `prima differenza a ${dove}: «${x.slice(dove - 80, dove + 120)}» contro «${y.slice(dove - 80, dove + 120)}»`)
})

test('IMP-K-04 (D5): fuori da Accesso pieno la carta c\'è, e un no non scrive', async (t) => {
    const c = cartella(t)
    const o = ospite()
    const carte = []
    const r = await giro(c, [chiama('s1', NOME_IMPOSTAZIONI, { action: 'set', changes: [{ key: 'appearance.theme', value: 'paper' }], expected_revision: 5 })],
        { onImpostazioniFn: o.fn, livelloAccesso: 'scrittura-progetto', chiediApprovazioneFn: async (azione) => { carte.push(azione); return false } })
    assert.equal(carte.length, 1)
    assert.equal(carte[0].tipo, NOME_IMPOSTAZIONI)
    assert.equal(carte[0].dove, 'pc', 'la carta dice dove (Mobile 2)')
    assert.match(r.esito('s1'), /^DECLINED\. The person said no/u)
    assert.deepEqual(o.chiamate.map((x) => x.fase), ['anteprima'], 'niente esegui dopo il no')
})

test('IMP-K-05 (D3, D5, D7): in Accesso pieno niente carta, tranne sicurezza e aggiornamenti; l\'esito dice che non si è chiesto', async (t) => {
    const c = cartella(t)
    for (const [gruppo, attesa] of [[null, 0], ['costo', 0], ['sicurezza', 1], ['aggiornamenti', 1]]) {
        const o = ospite({ gruppo })
        const carte = []
        const r = await giro(c, [chiama('s1', NOME_IMPOSTAZIONI, { action: 'set', changes: [{ key: 'k', value: 'v' }], expected_revision: 5 })],
            { onImpostazioniFn: o.fn, livelloAccesso: 'accesso-pieno', chiediApprovazioneFn: async (azione) => { carte.push(azione); return true } })
        assert.equal(carte.length, attesa, `gruppo ${gruppo}`)
        assert.match(r.esito('s1'), /Receipt set-1/u)
        if (attesa === 0) assert.match(r.esito('s1'), /Full access: done without asking the person\./u)
        else assert.doesNotMatch(r.esito('s1'), /Full access: done without asking/u)
    }
    assert.equal(cartaAncheInAccessoPieno({ cambi: [{ gruppo: 'costo' }, { gruppo: 'sicurezza' }] }), true, 'un cambio solo basta')
    assert.equal(cartaAncheInAccessoPieno({ cambi: [] }), false)
})

test('IMP-K-06 (CLI 2): SENZA_CARTA_IN_ACCESSO_PIENO cambia solo per app_settings', () => {
    // `local_model` è entrato coi blocchi 25-26: stessa regola di `local_model_window`
    // `computer_use_places_remove` è entrato col computer use (03/11): in Accesso pieno toglie senza carta e lo dice (LUOGHI-K-03)
    const prima = [...ATTREZZI_AUTOMAZIONI, 'computer_use_places_remove', 'provider_exclude', 'provider_allow', 'local_model_window', 'local_model', 'file_changes_undo', 'remote_phone_revoke', 'remote_phone_folder_revoke', 'remote_device_send_file']
    assert.deepEqual([...SENZA_CARTA_IN_ACCESSO_PIENO].sort(), [...prima, NOME_IMPOSTAZIONI].sort())
})

test('IMP-K-07: nel Piano si offre e si legge, ma un set è rifiutato prima dell\'ospite', async (t) => {
    const c = cartella(t)
    const o = ospite()
    const r = await giro(c, [
        chiama('l1', NOME_IMPOSTAZIONI, { action: 'list' }),
        chiama('s1', NOME_IMPOSTAZIONI, { action: 'set', changes: [{ key: 'appearance.theme', value: 'paper' }], expected_revision: 5 }),
    ], { onImpostazioniFn: o.fn, modalitaOperativa: 'piano' })
    assert.equal(r.offerti[0].includes(NOME_IMPOSTAZIONI), true)
    assert.match(r.esito('l1'), /Revision 5/u)
    assert.match(r.esito('s1'), /^REFUSED\. .*Plan mode/u)
    assert.equal(o.chiamate.some((x) => x.azione === 'set'), false)
})

test('IMP-K-09: una figlia che chiama app_settings per nome (non offerto) riceve un rifiuto, e l\'ospite non è toccato', async (t) => {
    const c = cartella(t)
    const o = ospite()
    const r = await giro(c, [chiama('f1', NOME_IMPOSTAZIONI, { action: 'list' })], { onImpostazioniFn: o.fn, agentRole: 'child' })
    assert.match(r.esito('f1'), /not available|not offered|unknown|REFUSED/iu)
    assert.equal(o.chiamate.length, 0)
})

test('IMP-K-08 (Mobile 2): undo col receipt_id passa dal ponte fino all\'ospite', async (t) => {
    const c = cartella(t)
    const o = ospite()
    const r = await giro(c, [chiama('u1', 'tool_call', { name: NOME_IMPOSTAZIONI, arguments: { action: 'undo', receipt_id: 'set-1' } })],
        { onImpostazioniFn: o.fn, attrezziDifferiti: true, livelloAccesso: 'accesso-pieno' })
    assert.deepEqual(o.chiamate.map((x) => `${x.azione}:${x.fase}`), ['undo:anteprima', 'undo:esegui'])
    assert.match(r.esito('u1'), /Receipt set-1/u)
})
