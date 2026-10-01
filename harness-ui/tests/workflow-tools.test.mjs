/*
 * ⛔⛔⛔ F-012 / rilievo 2 dell'owner (audit ZIP revisione, 28/09/2026; piano 0.1.19 §1.5) — «il modello
 * non vede gli agenti del workflow né ne verifica il progresso», errore grave: le rotte esistevano già
 * (`http-app.mjs`: pause|resume|cancel|retry, `events` SSE, `retry-preview`) ma NESSUN attrezzo del kernel
 * le raggiungeva. Il modello che avvia un'automazione non può né guardarla né fermarla.
 *
 * Cura (piano §1.5): tre attrezzi nel catalogo del kernel —
 *  · `workflow_status`  { runId? }   — elenco run della SESSIONE o dettaglio di uno: stato, passo
 *    corrente, passi ok/ko, avvio/durata, `outputRef` per ogni nodo concluso. Sola lettura.
 *  · `workflow_output`  { runId, nodeId, offset?, limit? } — contenuto integrale dal CAS (§1.6),
 *    paginato, con dichiarazione dei caratteri tagliati (stessa grammatica di `cerca`).
 *  · `workflow_control` { runId, azione: 'pause'|'resume'|'cancel' } — solo in Normale: in Piano
 *    entra in `ATTREZZI_PIANO` solo `workflow_status`/`workflow_output`. Restituisce l'esito VERO
 *    del control.
 * Cablaggio come le letture di sezione (owner 27/09, «capacità delle sezioni»): il kernel delega a
 * `onWorkflowFn(nome, argomenti)`, la catena server → registro → agent-service lo riempie chiamando
 * le funzioni GIÀ esistenti di store/read-model (`listRunSummariesForSession`, `readRunState`,
 * `requestRunControl` + `scheduler.sveglia`).
 *
 * Ricerca prima della cura (fonti con data, 28/09/2026): NESSUN concorrente espone i run DAG al
 * modello — opencode `packages/opencode/src/tool/task.ts` è SOLO il lancio di subagent in
 * primo/secondo piano («background=true launches the subagent asynchronously», notifica alla fine),
 * senza status/output/control dei run; Claude Code non ha un attrezzo equivalente (i Task sono
 * subagent); Hermes espone i risultati dei task padri solo NELLA consegna dei figli
 * (`hermes_cli/kanban_db.py:4110-4150`, già citato in `adapters/agent-session.mjs`). La forma del
 * vincolo è nostra: paginazione dichiarata (la grammatica di `cerca`), Piano sola lettura.
 *
 * ⛔ Queste prove girano nei DUE VERSI: che i tre attrezzi arrivino al root e funzionino, e che i
 * confini tengano (Piano senza control, niente attrezzi ai figli, niente attrezzi senza runtime,
 * esito onesto quando il runtime manca).
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { dettaglioRunPerIlModello, elencoRunPerIlModello, letturaOutputPerIlModello, NODE_OUTPUT_PREVIEW_MAX } from '../src/workflow/per-il-modello.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaDiProva(t) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f012-workflow-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    return cartella
}

/* ────────────────── il finto fornitore: fotogrammi SSE, la stessa forma dei test BC-57 ────────────────── */

const enc = new TextEncoder();
const sse = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
        c.enqueue(enc.encode('data: [DONE]\n\n'));
        c.close();
    },
}));
const chiamata = (nome, argomenti = {}, id = `call_${nome}`) => () => sse([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] },
]);
const testoFinale = () => sse([{ choices: [{ delta: { content: 'finito' } }] }]);

/** Un giro con il MODELLO che chiama gli attrezzi dati; ritorna gli esiti dei tool e gli attrezzi offerti. */
async function giro(cartella, chiamate, opzioni = {}) {
    let n = 0
    const offerti = []
    const esito = await talosLavora({
        cartella, task: { consegna: 'guarda il workflow' }, modello: 'x', chiave: 'y', onDelta: () => {},
        fetchDiRete: async (indirizzo, richieste = {}) => {
            /* ⛔ La lista degli attrezzi sta nel corpo di OGNI chiamata: si cattura prima di scegliere
               la risposta, così anche un giro senza tool-call dice cosa era offerto. */
            try { offerti.push(...(JSON.parse(richieste.body ?? '{}').tools ?? []).map((t) => t.function?.name).filter(Boolean)) } catch { /* corpo non leggibile */ }
            if (n < chiamate.length) return chiamate[n++]()
            return testoFinale()
        },
        ...opzioni,
    })
    return { esiti: esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content), offerti: [...new Set(offerti)] }
}

const TRE = ['workflow_status', 'workflow_output', 'workflow_control']
const onWorkflowFnFinto = async (nome, argomenti) => `(${nome}) ${JSON.stringify(argomenti)}`

/* ───────────────────────────── il catalogo e i confini, dal kernel vero ───────────────────────────── */

test('⭐⭐⭐ F-012-01 — il catalogo offre i TRE attrezzi al root in Normale', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], {
        strumentiEstesi: TRE, onWorkflowFn: onWorkflowFnFinto,
    })
    for (const nome of TRE) assert.ok(offerti.includes(nome), `manca all'appello: ${nome} (offerti: ${offerti.join(', ')})`)
})

test('⭐⭐⭐ F-012-02 — in Piano restano solo le due letture: `workflow_control` NON si offre', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], {
        strumentiEstesi: TRE, onWorkflowFn: onWorkflowFnFinto, modalitaOperativa: 'piano',
    })
    assert.ok(offerti.includes('workflow_status'), 'la lettura dello stato è di Piano')
    assert.ok(offerti.includes('workflow_output'), 'la lettura dell\'output è di Piano')
    assert.ok(!offerti.includes('workflow_control'), '⛔ controllare un run dalla modalità Piano non è esplorare')
})

test('⛔ F-012-03, AL CONTRARIO — senza runtime (`onWorkflowFn` assente) i tre NON si offrono: meglio assenti che rotti', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], { strumentiEstesi: TRE })
    for (const nome of TRE) assert.ok(!offerti.includes(nome), `${nome} senza runtime sarebbe un attrezzo che non può rispondere`)
})

test('⛔ F-012-04, AL CONTRARIO — a una figlia non si offrono: chi lavora per conto di un altro non guida i run', async (t) => {
    const { offerti } = await giro(cartellaDiProva(t), [], { strumentiEstesi: TRE, onWorkflowFn: onWorkflowFnFinto, agentRole: 'child' })
    for (const nome of TRE) assert.ok(!offerti.includes(nome), `ai figli no: ${nome}`)
})

/* ─────────────────── il dispatch: le chiamate arrivano al runtime e l'esito torna al modello ─────────────────── */

test('⭐⭐⭐ F-012-05 — `workflow_status` passa dal kernel al runtime col nome e gli argomenti VERI', async (t) => {
    const viste = []
    const { esiti } = await giro(cartellaDiProva(t), [chiamata('workflow_status', { runId: 'il-run' })], {
        strumentiEstesi: TRE,
        onWorkflowFn: async (nome, argomenti) => { viste.push([nome, argomenti]); return 'stato: running, 2/5 passi, outputRef sha256:abc…' },
    })
    assert.deepEqual(viste, [['workflow_status', { runId: 'il-run' }]], 'il runtime vede nome e argomenti così come li ha mandati il modello')
    assert.match(esiti[0], /stato: running, 2\/5 passi, outputRef sha256:abc…/, 'e il testo del runtime arriva al modello, non un riassunto inventato dal kernel')
})

test('⭐⭐⭐ F-012-06 — `workflow_output` inoltra offset e limit per la paginazione', async (t) => {
    const viste = []
    const { esiti } = await giro(cartellaDiProva(t), [chiamata('workflow_output', { runId: 'il-run', nodeId: 'n-1', offset: 0, limit: 100 })], {
        strumentiEstesi: TRE,
        onWorkflowFn: async (nome, argomenti) => { viste.push([nome, argomenti]); return '…primi cento caratteri…\n… and 4900 more characters' },
    })
    assert.deepEqual(viste, [['workflow_output', { runId: 'il-run', nodeId: 'n-1', offset: 0, limit: 100 }]])
    assert.match(esiti[0], /and 4900 more characters/, 'il taglio si DICHIARA, come in cerca')
})

test('⭐⭐⭐ F-012-07 — `workflow_control` in Normale restituisce l\'esito VERO del control', async (t) => {
    const viste = []
    const { esiti } = await giro(cartellaDiProva(t), [chiamata('workflow_control', { runId: 'il-run', azione: 'pause' })], {
        strumentiEstesi: TRE,
        onWorkflowFn: async (nome, argomenti) => { viste.push([nome, argomenti]); return 'pause requested: the run will pause when the steps in flight finish.' },
    })
    assert.deepEqual(viste, [['workflow_control', { runId: 'il-run', azione: 'pause' }]])
    assert.match(esiti[0], /pause requested/, 'l\'esito del control, non un "done" generico')
})

test('⛔ F-012-08, AL CONTRARIO — un runtime che MANCA a metà giro risponde onesto, non crolla', async (t) => {
    const { esiti } = await giro(cartellaDiProva(t), [chiamata('workflow_status', {})], { strumentiEstesi: TRE })
    assert.match(esiti[0], /not configured|non disponibile/i, `esito onesto, ricevuto: ${esiti[0]}`)
})

/* ────────────────── i formatter (per-il-modello.mjs), la sostanza del testo che il modello legge ────────────────── */

/** Lo stato di un run come lo torna `readRunState`: la forma vera, non un doppio. */
function statoDiProva() {
    const nodeA = { nodeId: 'n-analisi', state: 'succeeded', resultRefIds: ['ref-a'], attempt: 1 }
    const nodeB = { nodeId: 'n-scrittura', state: 'running', resultRefIds: [], attempt: 0 }
    const nodeC = { nodeId: 'n-verifica', state: 'failed', resultRefIds: [], attempt: 2 }
    return {
        state: {
            run: { runId: '11111111-2222-4333-8444-555555555555', status: 'running', graphVersion: 1, pauseRequested: false, cancelRequested: false },
            definition: {
                nodes: [
                    { id: 'n-analisi', kind: 'agent', label: 'Analisi', role: 'researcher', priority: 1 },
                    { id: 'n-scrittura', kind: 'agent', label: 'Scrittura', role: null, priority: 2 },
                    { id: 'n-verifica', kind: 'agent', label: 'Verifica', role: 'reviewer', priority: 3 },
                ],
                edges: [],
            },
            nodes: new Map([['n-analisi', nodeA], ['n-scrittura', nodeB], ['n-verifica', nodeC]]),
            resultRefs: new Map([['ref-a', {
                id: 'ref-a', runId: '11111111-2222-4333-8444-555555555555', nodeId: 'n-analisi',
                sha256: 'sha256:' + 'a'.repeat(64), bytes: 42, summary: 'RIASSUNTO_A', kind: 'text', contentType: 'text/markdown',
            }]]),
            lastSeq: 12,
        },
        events: [
            { type: 'run_created', at: '2026-09-28T10:00:00.000Z', payload: { rootSessionId: 'sess-1', workflowId: 'wf-1' } },
            { type: 'run_started', at: '2026-09-28T10:00:01.000Z' },
            { type: 'node_succeeded', at: '2026-09-28T10:05:00.000Z', nodeId: 'n-analisi' },
        ],
    }
}

test('⭐⭐⭐ F-012-09 — `dettaglioRunPerIlModello`: stato, passi, durata e l\'outputRef del nodo concluso', () => {
    const testo = dettaglioRunPerIlModello(statoDiProva())
    assert.match(testo, /running/, 'lo stato del run')
    assert.match(testo, /1 succeeded.*1 failed.*1 running/s, 'i conteggi veri, anche i brutti')
    assert.match(testo, /n-scrittura/, 'il passo corrente si vede')
    assert.match(testo, /n-analisi/, 'il nodo concluso con il suo outputRef')
    assert.match(testo, /sha256:a{64}/, 'il ref DENTRO il testo: il modello sa cosa chiedere a workflow_output')
    assert.match(testo, /workflow_output\(/, 'e la FRASE che dice la strada, come il piano §1.6')
    assert.match(testo, /2026-09-28T10:00:00/, 'l\'avvio del run')
    assert.ok(!/SEGRETO/.test(testo), 'il testo resta nei fatti pubblici del run')
})

test('⭐⭐⭐ F-012-10 — `letturaOutputPerIlModello`: paginata, col taglio DICHIARATO alla maniera di cerca', () => {
    const lungo = 'A'.repeat(5000)
    const pagina = letturaOutputPerIlModello({ runId: 'r', nodeId: 'n', sha256: 'sha256:' + 'b'.repeat(64), bytes: 5000, testo: lungo, offset: 0, limit: 100 })
    assert.match(pagina, /^A{100}$/m, 'i primi 100 caratteri richiesti')
    assert.match(pagina, /and 4900 more characters/, 'il taglio dichiarato: 5000 − 100')
    const seconda = letturaOutputPerIlModello({ runId: 'r', nodeId: 'n', sha256: 'sha256:' + 'b'.repeat(64), bytes: 5000, testo: lungo, offset: 4900, limit: 100 })
    assert.match(seconda, /A{100}/, 'l\'ultima pagina arriva in fondo')
})

test('⛔ F-012-11, AL CONTRARIO — un run senza nodi conclusi NON inventa outputRef', () => {
    const input = statoDiProva()
    input.state.nodes.get('n-analisi').state = 'running'
    input.state.nodes.get('n-analisi').resultRefIds = []
    input.state.resultRefs = new Map()
    const testo = dettaglioRunPerIlModello(input)
    assert.ok(!/sha256:/.test(testo), 'nessun ref dove nessun nodo ha concluso')
    assert.match(testo, /no node has finished yet/, 'e lo dice a parole: non è un silenzio')
})

test('⛔ F-012-12, AL CONTRARIO — l\'elenco dei run vuoto è onesto', () => {
    const testo = elencoRunPerIlModello([])
    assert.match(testo, /no workflow runs/i, 'zero run si dice zero run')
})

test('⭐ F-012-13 — `NODE_OUTPUT_PREVIEW_MAX` è 2000, la costante del piano §1.6 (stessa regola di PLANNED_TASK_PREVIEW_MAX)', () => {
    assert.equal(NODE_OUTPUT_PREVIEW_MAX, 2000)
})

/*
 * AUDIT29-RUN-DURATION (retest 29/09): un run BLOCCATO da ~24 ore diceva «716 s so far». `per-il-modello.mjs` misurava dal
 * primo all'ULTIMO EVENTO e lo chiamava «so far»: per un run fermo è il tempo fino all'ultima attività, non fino ad adesso,
 * e per un run concluso «so far» è la parola sbagliata. Hermes misura il tempo di un lavoro in corso rispetto al momento
 * della domanda (`tools/process_registry.py:1950`, `"uptime_seconds": int(time.time() - session.started_at)`). ⇒ Concluso:
 * inizio, fine, durata. In corso: da quanto è partito E da quanto non succede niente, all'ora della chiamata. Mai un «tempo
 * attivo» che sommi le pause: non c'è un fatto che lo misuri.
 */
test('RUN-DURATION-01 — un run in corso ma fermo da un giorno dice da quanto è fermo, non «so far» sull ultima attività', () => {
    const testo = dettaglioRunPerIlModello(statoDiProva(), { adesso: '2026-09-29T10:05:00.000Z' })
    assert.doesNotMatch(testo, /so far/)
    assert.match(testo, /started 2026-09-28T10:00:00\.000Z \(86700 s ago\)/)
    assert.match(testo, /last activity 2026-09-28T10:05:00\.000Z \(86400 s ago\)/)
    assert.match(testo, /as of 2026-09-29T10:05:00\.000Z/)
})

test('RUN-DURATION-02 — un run concluso dice inizio, fine e durata, e niente «ago»', () => {
    const input = statoDiProva()
    input.state.run.status = 'succeeded'
    input.events.push({ type: 'run_succeeded', at: '2026-09-28T10:12:00.000Z' })
    const testo = dettaglioRunPerIlModello(input, { adesso: '2026-09-30T00:00:00.000Z' })
    assert.match(testo, /started 2026-09-28T10:00:00\.000Z, ended 2026-09-28T10:12:00\.000Z \(720 s\)/)
    assert.doesNotMatch(testo, /so far| ago\)|as of/)
})

test('RUN-DURATION-03 — un run in pausa conta il tempo da orologio e lo dice come tale, senza sommare nulla', () => {
    const input = statoDiProva()
    input.state.run.status = 'paused'
    const testo = dettaglioRunPerIlModello(input, { adesso: '2026-09-28T11:00:00.000Z' })
    assert.match(testo, /run 11111111-2222-4333-8444-555555555555 — paused/)
    assert.match(testo, /started 2026-09-28T10:00:00\.000Z \(3600 s ago\); last activity 2026-09-28T10:05:00\.000Z \(3300 s ago\)/)
    assert.doesNotMatch(testo, /active|so far/)
})
