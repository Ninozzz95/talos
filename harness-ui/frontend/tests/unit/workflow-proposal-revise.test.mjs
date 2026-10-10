/*
 * F3-33b (25/09/2026) — «Modifica» i tetti nella card della proposta. Decisioni owner del 25/09 sera: i sei tetti del run,
 * in loco, mai spenti (intero > 0, costo facoltativo), una versione nuova da riapprovare, la versione approvata prima resta
 * avviabile finché la nuova non è approvata. Ricerca: `.claude/RICERCA-10x4-F3-33b-TETTI-2026-09-25.md`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bozzaDaiTetti, creaCardProposta, disegnaCardProposta, leggiBozzaTetti, leggiRicevutaProposta } from '../../src/components/workflow-proposal-card.js';
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

const HASH = `sha256:${'7cecbef4903d'.padEnd(64, '0')}`;
const HASH_V1 = `sha256:${'1'.repeat(64)}`;
const W = 'bf05e156-1167-8e81-874c-a88b99cd9fc0';
const RICEVUTA = { schema: 'talos.workflow-proposal-receipt.v1', workflowId: W, version: 1, definitionHash: HASH, status: 'proposed' };
const TETTI = { wallMs: 7_200_000, modelRequests: 240, promptTokens: 2_400_000, completionTokens: 240_000, toolCalls: 1_000, knownCostUsd: null };
const revisione = (extra = {}) => ({
  schema: 'talos.workflow-proposal-view.v2', status: 'proposed', workflowId: W, version: 1, definitionHash: HASH,
  title: 'Allineamento guida', objective: 'Riassumere due file.', phases: [{ id: 'f', label: 'Riassunti', total: 2 }],
  budgets: TETTI, preflight: { errors: [], warnings: [] }, ...extra,
});
const vuoto = { status: 200, body: { data: { items: [] } } };

test('WF-REVISE-DRAFT-READ: integers > 0, time in minutes, cost optional; only what changed is sent; invalid never switches off', () => {
  const bozza = bozzaDaiTetti(TETTI);
  assert.deepEqual(bozza, { wallMs: '120', modelRequests: '240', promptTokens: '2400000', completionTokens: '240000', toolCalls: '1000', knownCostUsd: '' });
  assert.deepEqual(leggiBozzaTetti(bozza, TETTI), { cambiati: {}, errori: {}, valida: true, vuota: true });
  assert.deepEqual(leggiBozzaTetti({ ...bozza, wallMs: '180', knownCostUsd: '1,50' }, TETTI).cambiati, { wallMs: 10_800_000, knownCostUsd: 1.5 });
  for (const sbagliato of ['0', '-3', '1.5', 'abc', '', ' ', '1e3']) {
    const esito = leggiBozzaTetti({ ...bozza, toolCalls: sbagliato }, TETTI);
    assert.equal(esito.valida, false, sbagliato);
    assert.equal(Object.hasOwn(esito.cambiati, 'toolCalls'), false, 'an invalid value is never sent (it would switch the limit off)');
  }
  assert.equal(leggiBozzaTetti({ ...bozza, knownCostUsd: '0' }, TETTI).valida, false);
  assert.equal(leggiBozzaTetti({ ...bozza, knownCostUsd: '1.234' }, TETTI).valida, false, 'cents, not fractions of a cent');
  assert.deepEqual(leggiBozzaTetti({ ...bozza, knownCostUsd: '' }, { ...TETTI, knownCostUsd: 2 }).cambiati, { knownCostUsd: null }, 'emptying the cost unsets it');
});

test('WF-REVISE-CARD-EDIT: «Modifica» turns the limits into fields in place; errors and the value before are written; save sends the changes', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(RICEVUTA) });
  const rev = revisione();
  let modifica = 0;
  for (const stato of ['proposed', 'approved']) {
    disegnaCardProposta(card, { document, revisione: revisione({ status: stato }), onApprova: () => {}, onAvvia: () => {}, onModifica: () => { modifica += 1; } });
    bottoni(card).find((b) => b.dataset.azione === 'modifica-tetti').listeners.click[0]();
  }
  assert.equal(modifica, 2, '«Modifica» before approval and before start');
  disegnaCardProposta(card, { document, revisione: rev, run: { runId: 'r', status: 'running' }, onModifica: () => {} });
  assert.equal(bottoni(card).some((b) => b.dataset.azione === 'modifica-tetti'), false, 'no «Modifica» once started');
  const bozza = bozzaDaiTetti(TETTI);
  let salvati = null; let annullato = false;
  disegnaCardProposta(card, { document, revisione: rev, bozzaTetti: bozza, onApriDiagramma: () => {}, onApprova: () => {}, onModifica: () => {},
    onSalvaTetti: (c) => { salvati = c; }, onAnnullaModifica: () => { annullato = true; } });
  const campi = tutti(card).filter((n) => n.tag === 'input');
  assert.equal(campi.length, 6, 'the six run limits');
  const salva = bottoni(card).find((b) => b.dataset.azione === 'salva-tetti');
  assert.equal(salva.textContent, 'Salva come versione 2');
  assert.equal(salva.disabled, true, 'nothing changed yet');
  assert.equal(bottoni(card).some((b) => ['diagramma', 'approva', 'modifica-tetti'].includes(b.dataset.azione)), false, 'editing shows only its own actions');
  const tempo = campi[0];
  tempo.value = '0'; tempo.listeners.input[0]();
  assert.equal(salva.disabled, true);
  assert.equal(tempo.attributes.get('aria-invalid'), 'true');
  assert.match(tutti(card).find((n) => n.className === 'talos-workflow-proposal__limit-error').textContent, /maggiore di zero/u);
  tempo.value = '180'; tempo.listeners.input[0]();
  assert.equal(salva.disabled, false);
  assert.equal(tempo.attributes.get('aria-invalid'), 'false');
  assert.equal(tutti(card).find((n) => n.className === 'talos-workflow-proposal__limit-before').textContent, 'prima: 2 h', 'the value before is written');
  salva.listeners.click[0]();
  assert.deepEqual(salvati, { wallMs: 10_800_000 });
  tempo.listeners.keydown[0]({ key: 'Escape' });
  assert.equal(annullato, true);
});

test('WF-REVISE-CARD-VERSION-2: the new version says what it was, and the approved version 1 can still start', () => {
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(RICEVUTA) });
  let avviataPrima = false;
  disegnaCardProposta(card, { document, revisione: revisione({ version: 2, budgets: { ...TETTI, wallMs: 10_800_000 } }), precedente: TETTI,
    avviabilePrima: { version: 1, definitionHash: HASH_V1 }, onApprova: () => {}, onAvviaPrima: () => { avviataPrima = true; } });
  const cambiati = tutti(card).filter((n) => n.tag === 'dd' && n.dataset.cambiato === 'true');
  assert.equal(cambiati.length, 1, 'only what changed is marked');
  assert.equal(cambiati[0].children.find((c) => c.className === 'talos-workflow-proposal__limit-was').textContent, ' (era 2 h)');
  const prima = bottoni(card).find((b) => b.dataset.azione === 'avvia-prima');
  assert.equal(prima.textContent, 'Avvia la versione 1');
  prima.listeners.click[0]();
  assert.equal(avviataPrima, true);
  assert.equal(card.dataset.status, 'da-approvare');
  // senza una versione approvata prima, niente «Avvia la versione …»
  disegnaCardProposta(card, { document, revisione: revisione({ version: 2 }), precedente: TETTI, onApprova: () => {}, onAvviaPrima: () => {} });
  assert.equal(bottoni(card).some((b) => b.dataset.azione === 'avvia-prima'), false);
});

test('WF-REVISE-CLIENT: the card follows the latest version; a revision is one POST, an ambiguous outcome a re-read', async () => {
  const f = fetchFinto([
    { status: 200, body: { data: { items: [{ workflowId: W, version: 2, status: 'proposed', definitionHash: HASH }, { workflowId: W, version: 1, status: 'approved', definitionHash: HASH_V1 }] } } },
    { status: 200, body: { data: revisione({ version: 2 }) } },
    vuoto,
    { status: 200, body: { data: revisione({ version: 1 }) } },
  ]);
  const letto = await creaClientProposta({ fetchFn: f.fn, sessionId: 's' }).leggi(RICEVUTA);
  assert.equal(letto.revisione.version, 2);
  assert.match(f.chiamate[1].url, /\/versions\/2$/u);
  assert.deepEqual(letto.precedente, TETTI);
  assert.deepEqual(letto.avviabilePrima, { version: 1, definitionHash: HASH_V1 });
  const g = fetchFinto([{ status: 201, body: { data: { version: 2 } } }]);
  assert.equal((await creaClientProposta({ fetchFn: g.fn, sessionId: 's' }).rivedi({ ...RICEVUTA, budgets: { wallMs: 60_000 } })).ok, true);
  assert.deepEqual([g.chiamate[0].metodo, g.chiamate[0].corpo], ['POST', { definitionHash: HASH, budgets: { wallMs: 60_000 } }]);
  assert.match(g.chiamate[0].url, /\/versions\/1\/revise$/u);
  // C11 (10/10/2026): la rilettura è la versione N+1 ESATTA, e vale solo coi tetti chiesti
  const h = fetchFinto([new Error('rete'), { status: 200, body: { data: revisione({ version: 2, budgets: { ...TETTI, wallMs: 60_000 } }) } }]);
  const ambiguo = await creaClientProposta({ fetchFn: h.fn, sessionId: 's' }).rivedi({ ...RICEVUTA, budgets: { wallMs: 60_000 } });
  assert.deepEqual([ambiguo.ok, ambiguo.riletto], [true, true]);
  assert.equal(h.chiamate.filter((c) => c.metodo === 'POST').length, 1, 'never a second POST on its own');
  assert.match(h.chiamate[1].url, /\/versions\/2$/u, 'version N+1, exactly');
  // C11, al contrario: una versione 2 nata da un'ALTRA modifica (altri tetti) non è la prova di questa
  const altra = fetchFinto([new Error('rete'), { status: 200, body: { data: revisione({ version: 2, budgets: { ...TETTI, wallMs: 30_000 } }) } }]);
  const daAltri = await creaClientProposta({ fetchFn: altra.fn, sessionId: 's' }).rivedi({ ...RICEVUTA, budgets: { wallMs: 60_000 } });
  assert.deepEqual([daAltri.ok, daAltri.ambiguo], [false, true]);
  // e se la versione 2 non c'è: ambiguo
  const nessuna = fetchFinto([new Error('rete'), { status: 404, body: { error: { code: 'NOT_FOUND' } } }]);
  assert.deepEqual(await creaClientProposta({ fetchFn: nessuna.fn, sessionId: 's' }).rivedi({ ...RICEVUTA, budgets: { wallMs: 60_000 } }), { ok: false, ambiguo: true });
  const k = fetchFinto([{ status: 409, body: { error: { code: 'WORKFLOW_VERSION_NOT_LATEST' } } }]);
  assert.deepEqual(await creaClientProposta({ fetchFn: k.fn, sessionId: 's' }).rivedi({ ...RICEVUTA, budgets: { wallMs: 60_000 } }),
    { ok: false, code: 'WORKFLOW_VERSION_NOT_LATEST', status: 409 });
});
