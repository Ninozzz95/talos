/*
 * F3-33a (25/09/2026) — la card della proposta di workflow nel transcript (decisione owner D20) e il suo cliente.
 * Ledger: `.claude/LEDGER-F3-WORKFLOW-UI-2026-09-25.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaCardProposta, disegnaCardProposta, leggiRicevutaProposta, righeTetti, statoCardProposta } from '../../src/components/workflow-proposal-card.js';
import { creaClientProposta } from '../../src/components/workflow-proposal-client.js';

function fakeDocument() {
  const create = (tag) => ({
    tag, children: [], dataset: {}, attributes: new Map(), listeners: {}, disabled: false,
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    setAttribute(key, value) { this.attributes.set(key, String(value)); },
    removeAttribute(key) { this.attributes.delete(key); },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    set textContent(value) { this._text = String(value); this.children = []; },
    get textContent() { return this._text ?? this.children.map((child) => child.textContent).join(' '); },
  });
  return { createElement: create };
}
const tutti = (radice) => (radice?.children || []).flatMap((c) => [c, ...tutti(c)]);
const bottoni = (radice) => tutti(radice).filter((n) => n.tag === 'button');

const HASH = `sha256:${'7cecbef4903d'.padEnd(64, '0')}`;
const RICEVUTA = { schema: 'talos.workflow-proposal-receipt.v1', workflowId: 'bf05e156-1167-8e81-874c-a88b99cd9fc0', version: 1, definitionHash: HASH, status: 'proposed' };
const revisione = (extra = {}) => ({
  schema: 'talos.workflow-proposal-view.v2', status: 'proposed', workflowId: RICEVUTA.workflowId, version: 1, definitionHash: HASH,
  title: 'Allineamento guida vs note di riunione', objective: 'Riassumere i due file e dire cosa manca alla guida.',
  phases: [{ id: 'riassunti', label: 'Riassunti', total: 2 }, { id: 'confronto', label: 'Confronto', total: 1 }],
  budgets: { wallMs: 7_200_000, modelRequests: 240, promptTokens: 2_400_000, completionTokens: 240_000, knownCostUsd: null },
  preflight: { errors: [], warnings: [{ code: 'PREFLIGHT_UNKNOWN_COST', message: 'At least one cost bound is unknown; cost remains null rather than zero.', subjects: ['knownCostUsd'] }] },
  ...extra,
});

test('WF-PROPOSAL-RECEIPT: only the real receipt makes a card; a future schema is «not available», garbage is nothing', () => {
  assert.deepEqual(leggiRicevutaProposta(JSON.stringify(RICEVUTA)), { workflowId: RICEVUTA.workflowId, version: 1, definitionHash: HASH });
  assert.deepEqual(leggiRicevutaProposta({ ...RICEVUTA, schema: 'talos.workflow-proposal-receipt.v2' }), { nonSupportata: true });
  for (const cattivo of ['testo di errore', '{', { ...RICEVUTA, definitionHash: 'sha256:corta' }, { ...RICEVUTA, version: 0 }, null]) {
    assert.equal(leggiRicevutaProposta(cattivo), null);
  }
});

test('R4-WF-PROPOSAL-CARD-STATES: every state says itself in words, from the server data only', () => {
  assert.equal(statoCardProposta({ carica: true }).etichetta, 'Carico la proposta');
  assert.equal(statoCardProposta({ revisione: revisione() }).chiave, 'da-approvare');
  assert.equal(statoCardProposta({ revisione: revisione({ status: 'approved' }) }).etichetta, 'Approvato, da avviare');
  for (const [status, etichetta] of [['running', 'In esecuzione'], ['paused', 'In pausa'], ['needs_attention', 'Serve attenzione'], ['succeeded', 'Riuscito'], ['failed', 'Non riuscito'], ['cancelled', 'Annullato']]) {
    assert.equal(statoCardProposta({ revisione: revisione({ status: 'approved' }), run: { status } }).etichetta, etichetta, status);
  }
  assert.equal(statoCardProposta({ nonDisponibile: true }).chiave, 'non-disponibile');
});

test('R4-WF-PROPOSAL-CARD-REAL: title, numbered phases with counts, limits in words, the warning translated — no technical names', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(RICEVUTA) });
  assert.equal(card.dataset.status, 'carica');
  disegnaCardProposta(card, { document, revisione: revisione(), onApprova: () => {} });
  assert.equal(card.dataset.status, 'da-approvare');
  const testo = card.textContent;
  assert.match(testo, /Allineamento guida vs note di riunione/u);
  const fasi = tutti(card).find((n) => n.tag === 'ol');
  assert.deepEqual(fasi.children.map((li) => li.children.map((c) => c.textContent).join('')), ['Riassunti 2 passi', 'Confronto 1 passo'], 'the space is in the text, not only in the CSS margin');
  assert.match(testo, /Tempo massimo 2 h/u);
  assert.match(testo, /Costo non stimabile in anticipo/u);
  assert.match(testo, /Il costo non si può stimare in anticipo: resta sconosciuto, non zero\./u);
  for (const tecnico of ['PREFLIGHT_', 'knownCostUsd', 'sha256:', 'At least one', 'null', 'workflowId']) assert.ok(!testo.includes(tecnico), tecnico);
  assert.match(testo, /impronta 7cecbef4903d/u, 'the short hash, without the algorithm prefix');
  const [approva] = bottoni(card);
  assert.equal(approva.textContent, 'Approva');
  assert.equal(approva.disabled, false);
});

test('R4-WF-APPROVE-DISABLED-ON-ERRORS: with preflight errors «Approva» is off and the reason is written', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(RICEVUTA) });
  disegnaCardProposta(card, { document, revisione: revisione({ preflight: { errors: [{ code: 'PREFLIGHT_CYCLE' }], warnings: [] } }), onApprova: () => {} });
  const [approva] = bottoni(card);
  assert.equal(approva.disabled, true);
  assert.match(card.textContent, /Da correggere: Il controllo preliminare ha un avviso/u);
  assert.match(card.textContent, /Non si può approvare finché/u);
});

test('R4-WF-START-AFTER-APPROVE: approved shows «Avvia» only; a run shows no command and says when it started', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(RICEVUTA) });
  disegnaCardProposta(card, { document, revisione: revisione({ status: 'approved', approval: { approvedAt: '2026-09-25T11:36:24.364Z' } }), onAvvia: () => {} });
  assert.deepEqual(bottoni(card).map((b) => b.dataset.azione), ['avvia']);
  assert.doesNotMatch(card.textContent, /leggono e cercano/u, 'without a read-only policy the card does not promise read-only');
  disegnaCardProposta(card, { document, revisione: revisione({ status: 'approved', policy: { capabilityCeiling: 'read' } }), onAvvia: () => {} });
  assert.match(card.textContent, /I passi leggono e cercano, non scrivono./u);
  disegnaCardProposta(card, { document, revisione: revisione({ status: 'approved' }), run: { runId: 'r', status: 'running', createdAt: '2026-09-25T11:36:24.380Z' } });
  assert.equal(card.dataset.status, 'in-esecuzione');
  assert.deepEqual(bottoni(card), []);
  assert.match(card.textContent, /Avviato alle \d{2}:\d{2}\./u);
  // in volo: il bottone si spegne nello stesso istante (niente secondo clic)
  disegnaCardProposta(card, { document, revisione: revisione(), inVolo: 'approva', onApprova: () => {} });
  assert.equal(bottoni(card)[0].disabled, true);
  assert.equal(bottoni(card)[0].textContent, 'Approvo…');
});

test('WF-PROPOSAL-OPEN-DIAGRAM: «Apri diagramma» is on the card in every state that has data, and opens this workflow (D20)', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(RICEVUTA) });
  let aperture = 0;
  const onApriDiagramma = () => { aperture += 1; };
  for (const vista of [{ revisione: revisione() }, { revisione: revisione({ status: 'approved' }) },
    { revisione: revisione({ status: 'approved' }), run: { runId: 'r', status: 'succeeded', createdAt: '2026-09-25T11:36:24.380Z' } }]) {
    disegnaCardProposta(card, { document, ...vista, onApprova: () => {}, onAvvia: () => {}, onApriDiagramma });
    const diagramma = bottoni(card).find((b) => b.dataset.azione === 'diagramma');
    assert.equal(diagramma?.textContent, 'Apri diagramma');
    diagramma.listeners.click[0]();
  }
  assert.equal(aperture, 3);
  disegnaCardProposta(card, { document, carica: true, onApriDiagramma });
  assert.equal(bottoni(card).some((b) => b.dataset.azione === 'diagramma'), false, 'nothing to open while the card is loading');
  disegnaCardProposta(card, { document, revisione: revisione() });
  assert.equal(bottoni(card).some((b) => b.dataset.azione === 'diagramma'), false, 'no handler, no button');
});

test('WF-PROPOSAL-LIMITS-HONEST: an unknown cost stays unknown, a missing limit is not invented', () => {
  assert.deepEqual(righeTetti({}), [['Costo', 'non stimabile in anticipo']]);
  assert.deepEqual(righeTetti({ wallMs: 5_400_000, knownCostUsd: 1.5 }), [['Tempo massimo', '1 h 30 min'], ['Costo', 'fino a 1.50 $']]);
});

function fetchFinto(risposte) {
  const chiamate = [];
  const fn = async (url, opzioni = {}) => {
    chiamate.push({ url, metodo: opzioni.method ?? 'GET', corpo: opzioni.body ? JSON.parse(opzioni.body) : null });
    const r = risposte.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { fn, chiamate };
}

test('R4-WF-APPROVE-EXACT-HASH: one commandId per gesture; an ambiguous outcome is resolved by a GET, never by a second POST', async () => {
  let n = 0;
  const uuid = () => `00000000-0000-4000-8000-00000000000${++n}`;
  // riuscito
  let f = fetchFinto([{ status: 200, body: { data: {} } }]);
  let esito = await creaClientProposta({ fetchFn: f.fn, sessionId: 's', uuid }).approva({ ...RICEVUTA });
  assert.equal(esito.ok, true);
  assert.deepEqual(f.chiamate.map((c) => c.metodo), ['POST']);
  assert.equal(f.chiamate[0].corpo.definitionHash, HASH);
  // la rete cade: si rilegge, ed era arrivato
  // F3-33b: la rilettura parte dall'elenco delle versioni del workflow (proposte della sessione), poi revisione e run
  f = fetchFinto([new Error('rete'), { status: 200, body: { data: { items: [] } } }, { status: 200, body: { data: revisione({ status: 'approved' }) } }, { status: 200, body: { data: { items: [] } } }]);
  esito = await creaClientProposta({ fetchFn: f.fn, sessionId: 's', uuid }).approva({ ...RICEVUTA });
  assert.deepEqual([esito.ok, esito.riletto], [true, true]);
  assert.deepEqual(f.chiamate.map((c) => c.metodo), ['POST', 'GET', 'GET', 'GET'], 'no second POST');
  // la rete cade e non era arrivato: si dice, non si ripete da soli
  f = fetchFinto([new Error('rete'), { status: 200, body: { data: { items: [] } } }, { status: 200, body: { data: revisione() } }, { status: 200, body: { data: { items: [] } } }]);
  esito = await creaClientProposta({ fetchFn: f.fn, sessionId: 's', uuid }).approva({ ...RICEVUTA });
  assert.deepEqual([esito.ok, esito.ambiguo], [false, true]);
  assert.equal(f.chiamate.filter((c) => c.metodo === 'POST').length, 1, 'exactly one POST for one gesture');
  // un rifiuto con codice è un esito, non un'ambiguità
  f = fetchFinto([{ status: 503, body: { error: { code: 'WORKFLOW_RUNTIME_NOT_READY' } } }]);
  esito = await creaClientProposta({ fetchFn: f.fn, sessionId: 's', uuid }).avvia({ ...RICEVUTA });
  assert.deepEqual([esito.ok, esito.code], [false, 'WORKFLOW_RUNTIME_NOT_READY']);
  // due gesti, due commandId diversi
  const ids = new Set();
  for (let i = 0; i < 2; i++) {
    f = fetchFinto([{ status: 200, body: { data: {} } }]);
    await creaClientProposta({ fetchFn: f.fn, sessionId: 's', uuid }).approva({ ...RICEVUTA });
    ids.add(f.chiamate[0].corpo.commandId);
  }
  assert.equal(ids.size, 2);
});

test('WF-PROPOSAL-CLIENT-READ: the run of THIS version is found among the session runs; a missing proposal is «not available»', async () => {
  const f = fetchFinto([
    { status: 200, body: { data: { items: [] } } },
    { status: 200, body: { data: revisione({ status: 'approved' }) } },
    { status: 200, body: { data: { items: [
      { runId: 'altro', workflowId: 'aaaaaaaa-0000-4000-8000-000000000000', version: 1, status: 'running' },
      { runId: 'mio', workflowId: RICEVUTA.workflowId, version: 1, status: 'succeeded' },
    ] } } },
  ]);
  const letto = await creaClientProposta({ fetchFn: f.fn, sessionId: 's' }).leggi(RICEVUTA);
  assert.equal(letto.run.runId, 'mio');
  const assente = await creaClientProposta({ fetchFn: fetchFinto([{ status: 200, body: { data: { items: [] } } }, { status: 404, body: null }]).fn, sessionId: 's' }).leggi(RICEVUTA);
  assert.deepEqual(assente, { nonDisponibile: true });
});
