/*
 * Centro assistenza (owner 01/11/2026): `talos_help` lungo TUTTO il filo (lezione del 17/10 e del 21/10: un'opzione nuova si è persa
 * due volte nell'inoltro campo per campo) — dal server (`aiutoDelServer`) al registro, al servizio, al kernel vero con un fornitore
 * finto, fino al risultato che torna al modello. E le condizioni: senza la guida l'attrezzo non esiste; dietro il ponte con la lista
 * davanti invariata (Performance); una lettura, anche in Piano, in sola lettura e alle figlie.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { ATTREZZI_DIFFERIBILI } from '../src/kernel/ponte-attrezzi.mjs'
import { creaAiutoTalos, NOME_AIUTO } from '../src/kernel/aiuto-talos.mjs'
import { aiutoDelServer } from '../src/aiuto/aiuto-del-server.mjs'
import { createSessionRegistry, STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const INDICE = {
    versione: 1,
    fonte: { commit: 'sito123' },
    pagine: [{ percorso: 'desktop/guides/automations', titolo: 'Schedule an automation', descrizione: 'A task runs again by itself.', prodotto: 'desktop',
        controllataSu: { desktop: '0.1.19' }, lingua: 'en',
        sezioni: [{ id: 'create-one', titolo: 'Create one', testo: 'Open Automations in the sidebar. Set the interval and the daily cap.' }] }],
}
const aiuto = () => creaAiutoTalos({ prodotto: 'desktop', versione: '0.1.39', leggiIndice: async () => INDICE })

function cartella(t) {
    const c = mkdtempSync(join(tmpdir(), 'talos-aiuto-k-'))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function giro(c, risposte, extra = {}) {
    let n = 0
    const offerti = []
    const testi = []
    const corpi = []
    const r = await talosLavora({
        cartella: c, task: { consegna: 'aiuto' }, modello: 'x', chiave: 'y', strumentiEstesi: [...STRUMENTI_ESTESI_PREDEFINITI],
        fetchDiRete: async (_url, init) => {
            const corpo = JSON.parse(init?.body ?? '{}')
            offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
            testi.push(JSON.stringify(corpo.tools ?? []))
            corpi.push(init?.body ?? '')
            const prossima = risposte[n++]
            const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
            return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
        },
        chiediApprovazioneFn: async () => true,
        ...extra,
    })
    return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, testi, corpi }
}

test('AIUTO-K-01: senza la guida l\'attrezzo non esiste; con, si offre anche in Piano, in sola lettura e alle figlie', async (t) => {
    const c = cartella(t)
    assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes(NOME_AIUTO), 'nell\'elenco di serie del desktop')
    const senza = await giro(c, [])
    assert.equal(senza.offerti[0].includes(NOME_AIUTO), false)
    assert.doesNotMatch(senza.testi[0], /talos_help/u)
    // un ospite che chiede SOLO questo attrezzo (nessun altro nome accende il filtro dei ruoli) e non porta la guida: niente
    const solo = await giro(c, [], { strumentiEstesi: [NOME_AIUTO] })
    assert.equal(solo.offerti[0].includes(NOME_AIUTO), false, 'chiesto da solo, senza guida: non offerto')
    const soloCon = await giro(c, [], { strumentiEstesi: [NOME_AIUTO], aiutoTalos: aiuto() })
    assert.equal(soloCon.offerti[0].includes(NOME_AIUTO), true)
    for (const extra of [{}, { modalitaOperativa: 'piano' }, { livelloAccesso: 'lettura' }, { agentRole: 'child' }]) {
        const con = await giro(c, [], { aiutoTalos: aiuto(), ...extra })
        assert.equal(con.offerti[0].includes(NOME_AIUTO), true, JSON.stringify(extra))
    }
})

test('AIUTO-K-02: la chiamata legge la guida e torna al modello; senza ospite (dal ponte) un rifiuto onesto', async (t) => {
    const c = cartella(t)
    const r = await giro(c, [chiama('a1', NOME_AIUTO, { query: 'automation daily cap' }), chiama('a2', NOME_AIUTO, { page: 'desktop/guides/automations', section: 'create-one' })], { aiutoTalos: aiuto() })
    assert.match(r.esito('a1'), /page "desktop\/guides\/automations", section "create-one"/u)
    assert.match(r.esito('a2'), /Open Automations in the sidebar\. Set the interval and the daily cap\./u)
    assert.match(r.esito('a2'), /Checked on Desktop 0\.1\.19; this app is 0\.1\.39/u)
    const senza = await giro(c, [chiama('a3', NOME_AIUTO, { query: 'x' })])
    assert.match(senza.esito('a3'), /not available|unknown|not offered|REFUSED/iu)
})

test('AIUTO-K-03: dietro il ponte (Performance): fuori dalla lista davanti, trovato da tool_search, eseguito da tool_call; la lista non cambia fra due giri', async (t) => {
    const c = cartella(t)
    assert.ok(ATTREZZI_DIFFERIBILI.has(NOME_AIUTO))
    const r = await giro(c, [
        chiama('p1', 'tool_search', { queries: ['TALOS user guide'] }),
        chiama('p2', 'tool_call', { name: NOME_AIUTO, arguments: { query: 'automation' } }),
    ], { aiutoTalos: aiuto(), attrezziDifferiti: true })
    assert.equal(r.offerti[0].includes(NOME_AIUTO), false, 'non davanti')
    assert.match(r.esito('p1'), /talos_help/u)
    assert.match(r.esito('p2'), /section "create-one"/u)
    assert.deepEqual(r.offerti[1], r.offerti[0], 'la lista davanti è la stessa al giro dopo: la cache del prefisso resta')
    assert.equal(r.testi[1], r.testi[0])
    assert.match(r.corpi[0], /talos_help/u, 'con la guida, il catalogo del ponte la nomina')
    // CLI 01/11: senza la guida nemmeno il catalogo del ponte la nomina (nessun token per un attrezzo che non si può chiamare)
    const senza = await giro(c, [chiama('p3', 'tool_search', { queries: ['TALOS user guide'] })], { attrezziDifferiti: true })
    for (const corpo of senza.corpi) assert.doesNotMatch(corpo, /talos_help/u)
    assert.doesNotMatch(senza.esito('p3'), /talos_help/u)
})

test('AIUTO-S-01: il server offre la guida solo se `index.json` c\'è; prodotto e versione dall\'ambiente', async (t) => {
    const c = cartella(t)
    assert.equal(aiutoDelServer({}, { cartellaPredefinita: c }), null, 'senza index.json: niente attrezzo')
    writeFileSync(join(c, 'index.json'), JSON.stringify(INDICE))
    const pc = aiutoDelServer({}, { cartellaPredefinita: c, versioneDesktopFn: () => '0.1.39' })
    assert.equal(pc.prodotto, 'desktop')
    assert.match((await pc.rispondi({ query: 'automation' })).testo, /this app is 0\.1\.39/u)
    assert.equal(aiutoDelServer({ TALOS_LOCALE_OSPITE_DIR: 'C:/x' }, { cartellaPredefinita: c }).prodotto, 'android', 'il server dell\'app del telefono')
    assert.equal(aiutoDelServer({ TALOS_AIUTO_PRODOTTO: 'cli' }, { cartellaPredefinita: c }).prodotto, 'cli')
    assert.equal(aiutoDelServer({ TALOS_AIUTO_PRODOTTO: 'phone' }, { cartellaPredefinita: c }).prodotto, 'desktop', 'un prodotto sconosciuto non passa')
    const altrove = cartella(t)
    assert.equal(aiutoDelServer({ TALOS_AIUTO_DIR: altrove }, { cartellaPredefinita: c }), null, 'TALOS_AIUTO_DIR vince sulla cartella accanto al server')
    // e il server lo passa davvero al registro, dalla sua cartella
    const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
    assert.match(server, /aiutoTalos: aiutoDelServer\(process\.env, \{\s*cartellaPredefinita: fileURLToPath\(new URL\('\.\/aiuto\/', import\.meta\.url\)\)/u)
})

async function ascolta(t, opzioni) {
    const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...opzioni }))
    await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
    t.after(() => new Promise((ok) => server.close(() => ok())))
    return `http://127.0.0.1:${server.address().port}`
}

test('AIUTO-FILO-01: dalla rotta vera `POST /api/v1/sessions` al kernel vero: il modello chiama talos_help e legge la guida', async (t) => {
    const radice = await mkdtemp(join(tmpdir(), 'talos-aiuto-filo-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(radice))
    const progetto = join(radice, 'progetto')
    await mkdir(progetto, { recursive: true })
    const enc = new TextEncoder()
    const flusso = (fotogrammi) => new Response(new ReadableStream({ start(ctl) { for (const x of fotogrammi) ctl.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`)); ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close() } }))
    const f = { offerti: [], chiamate: 0 }
    f.fetchDiRete = async (_url, init) => {
        f.offerti.push((JSON.parse(init?.body ?? '{}').tools ?? []).map((a) => a.function?.name).filter(Boolean))
        return f.chiamate++ === 0
            ? flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-aiuto', function: { name: NOME_AIUTO, arguments: JSON.stringify({ query: 'automation daily cap' }) } }] } }] }])
            : flusso([{ choices: [{ delta: { content: 'Apri Automazioni nella barra laterale.' } }] }])
    }
    const registro = createSessionRegistry({
        modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, aiutoTalos: aiuto(),
        preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'come creo un\'automazione?' } }),
        avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete: f.fetchDiRete }) }),
    })
    const base = await ascolta(t, { sessionRegistry: registro, listaTaskDisponibili: () => [{ id: 'sconto-a-scaglioni', progetto: 'p', difficolta: 1, consegnaCorta: 'x' }] })
    const risposta = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ taskId: 'sconto-a-scaglioni' }) })
    assert.equal(risposta.status, 200)
    const { sessionId } = (await risposta.json()).data
    const eventi = []
    t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)))
    const inizio = Date.now()
    while (!eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError') && Date.now() - inizio < 10_000) await new Promise((r) => setTimeout(r, 20))
    const esito = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call-aiuto')
    assert.ok(esito, JSON.stringify(eventi.map((e) => (e.type === 'RunError' ? `${e.code}: ${e.message}` : e.name ?? e.type))))
    assert.match(esito.content, /page "desktop\/guides\/automations", section "create-one"/u, 'la guida è arrivata fino al kernel e ha risposto')
    assert.ok(f.offerti[0].includes(NOME_AIUTO) || f.offerti[0].includes('tool_search'), 'offerta davanti o dal ponte')
})
