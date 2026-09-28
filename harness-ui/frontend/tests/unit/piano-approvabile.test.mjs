/*
 * ⛔ 24/09/2026 — la scheda del PIANO APPROVABILE (decisioni owner 3, 36-39). Quattro scelte nell'ordine dell'owner, «continua a
 * pianificare» con il suo campo, l'errore che resta sulla scheda e riabilita le scelte, la ricevuta scritta dall'evento del server
 * (mai dal clic), e il piano dal testo finale che resta da leggere e basta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCELTE_PIANO, applicaDecisionePiano, createPlanArtifact, parsePlanEvent } from '../../src/components/plan-artifact.js';

class Nodo {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map();
    this.listeners = new Map(); this.hidden = false; this.disabled = false; this.value = ''; this.className = ''; this._text = null;
  }
  append(...nodi) { for (const n of nodi) { n.parentElement?.children.splice(n.parentElement.children.indexOf(n), 1); n.parentElement = this; this.children.push(n); } }
  appendChild(n) { this.append(n); return n; }
  replaceWith(nuovo) { const i = this.parentElement.children.indexOf(this); nuovo.parentElement = this.parentElement; this.parentElement.children[i] = nuovo; this.parentElement = null; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(tipo, fn) { if (!this.listeners.has(tipo)) this.listeners.set(tipo, []); this.listeners.get(tipo).push(fn); }
  click() { if (this.disabled) return; for (const fn of this.listeners.get('click') ?? []) fn({ target: this }); }
  focus() { this.ownerDocument.activeElement = this; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text ?? this.children.map((c) => c.textContent).join(''); }
  *tutti() { for (const c of this.children) { yield c; if (c.tutti) yield* c.tutti(); } }
  querySelector(selettore) {
    const classi = selettore.split(',').map((x) => x.trim().replace(/^\./u, ''));
    for (const n of this.tutti()) if (typeof n.className === 'string' && n.className.split(/\s+/u).some((c) => classi.includes(c))) return n;
    return null;
  }
  querySelectorAll(selettore) {
    const classe = selettore.replace(/^\./u, '');
    return [...this.tutti()].filter((n) => typeof n.className === 'string' && n.className.split(/\s+/u).includes(classe));
  }
}
function documento() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => new Nodo(doc, tag);
  doc.createDocumentFragment = () => new Nodo(doc, '#fragment');
  doc.createTextNode = (v) => { const n = new Nodo(doc, '#text'); n._text = String(v); return n; };
  return doc;
}
const tick = () => new Promise((r) => setImmediate(r));
const HASH = 'sha256:' + 'c'.repeat(64);
const PIANO = '## Piano\n\n1. Leggo `a.txt`.\n2. Scrivo `b.txt`.';

function schedaApprovabile(onDecisione) {
  const document = documento();
  const radice = document.createElement('div');
  const card = createPlanArtifact({ document, text: PIANO, status: 'proposed', source: 'journal', planId: 'p1', revision: 2,
    requestId: 'r1', hash: HASH, onDecisione });
  radice.append(card);
  return { document, card, bottone: (d) => card.querySelectorAll('talos-plan-artifact__choice').find((b) => b.dataset.decisione === d) };
}

test('PLAN-CARD-FOUR-CHOICES: le quattro scelte nell’ordine dell’owner, ognuna dice che cosa succede', () => {
  const { card } = schedaApprovabile(async () => ({ ok: true }));
  const scelte = card.querySelectorAll('talos-plan-artifact__choice');
  assert.deepEqual(scelte.map((b) => b.dataset.decisione),
    ['procedi-con-conferma', 'procedi-accetta-modifiche', 'conversazione-pulita', 'continua-a-pianificare']);
  assert.deepEqual(scelte.map((b) => b.querySelector('talos-plan-artifact__choice-title').textContent),
    ['Procedi chiedendo conferma', 'Procedi accettando le modifiche', 'Procedi in una conversazione pulita', 'Continua a pianificare']);
  for (const b of scelte) assert.ok(b.querySelector('talos-plan-artifact__choice-description').textContent.length > 20);
  assert.equal(card.querySelector('talos-plan-artifact__state').textContent, 'Aspetta la tua scelta · rev. 2');
  assert.equal(card.querySelector('talos-plan-artifact__footer'), null, 'nessuna frase «non si approva da qui» su un piano approvabile');
  assert.equal(SCELTE_PIANO.length, 4);
});

test('PLAN-CARD-CHOICE-SENDS: un clic manda la scelta con richiesta e impronta; la ricevuta non la scrive il clic', async () => {
  const inviate = [];
  const { card, bottone } = schedaApprovabile(async (corpo) => { inviate.push(corpo); return { ok: true }; });
  bottone('procedi-accetta-modifiche').click();
  bottone('procedi-con-conferma').click(); // un secondo clic durante l'invio non parte
  await tick();
  assert.deepEqual(inviate, [{ requestId: 'r1', decisione: 'procedi-accetta-modifiche', hash: HASH }]);
  assert.equal(card.dataset.status, 'proposed', 'fino all’evento del server la scheda non si dichiara approvata');
  assert.equal(bottone('procedi-con-conferma').disabled, true, 'le scelte restano spente dopo un invio riuscito');
});

test('PLAN-CARD-ERROR-RETRY: una scelta rifiutata lo dice sulla scheda e riaccende le scelte', async () => {
  let volte = 0;
  const { card, bottone } = schedaApprovabile(async () => { volte += 1; return volte === 1 ? { ok: false, messaggio: 'Il server non risponde' } : { ok: true }; });
  bottone('procedi-con-conferma').click();
  await tick();
  const errore = card.querySelector('talos-plan-artifact__error');
  assert.equal(errore.hidden, false);
  assert.match(errore.textContent, /Il server non risponde/u);
  assert.equal(bottone('procedi-con-conferma').disabled, false);
  bottone('procedi-con-conferma').click();
  await tick();
  assert.equal(volte, 2);
  assert.equal(errore.hidden, true);
});

test('PLAN-CARD-KEEP-PLANNING: «continua a pianificare» apre il campo; Annulla lo richiude; Invia manda la correzione', async () => {
  const inviate = [];
  const { card, bottone, document } = schedaApprovabile(async (corpo) => { inviate.push(corpo); return { ok: true }; });
  const riquadro = card.querySelector('talos-plan-artifact__feedback');
  assert.equal(riquadro.hidden, true);
  bottone('continua-a-pianificare').click();
  assert.equal(riquadro.hidden, false);
  assert.equal(bottone('continua-a-pianificare').getAttribute('aria-expanded'), 'true');
  const campo = riquadro.children.find((n) => n.tagName === 'textarea');
  assert.equal(document.activeElement, campo, 'il fuoco va nel campo che la persona ha aperto');
  assert.equal(campo.className, 'talos-textarea', 'l’area di testo del sistema, non la riga singola con icona');
  assert.equal(inviate.length, 0, 'aprire il campo non manda niente');
  const [annulla, invia] = riquadro.querySelector('talos-plan-artifact__feedback-actions').children;
  annulla.click();
  assert.equal(riquadro.hidden, true);
  bottone('continua-a-pianificare').click();
  campo.value = '  Aggiungi i test prima di scrivere.  ';
  invia.click();
  await tick();
  assert.deepEqual(inviate, [{ requestId: 'r1', decisione: 'continua-a-pianificare', hash: HASH, feedback: 'Aggiungi i test prima di scrivere.' }]);
});

test('PLAN-CARD-RECEIPT: l’evento del server scrive la ricevuta; un’altra revisione non la tocca', () => {
  const { card, document } = schedaApprovabile(async () => ({ ok: true }));
  const base = { schema: 'talos.plan.v1', sessionId: 's', planId: 'p1', requestId: 'r1', hash: HASH, at: '2026-09-24T15:02:00.000Z' };
  const altraRevisione = parsePlanEvent({ ...base, revision: 1, status: 'approved', decisione: 'procedi-con-conferma' }, 's');
  assert.equal(applicaDecisionePiano(card, altraRevisione, { document }), false);
  assert.equal(card.dataset.status, 'proposed');
  const aperte = [];
  const pulita = parsePlanEvent({ ...base, revision: 2, status: 'approved', decisione: 'conversazione-pulita', nuovaSessionId: 'nuova-1', da: 'persona' }, 's');
  assert.equal(applicaDecisionePiano(card, pulita, { document, onApriSessione: (id) => aperte.push(id) }), true);
  assert.equal(card.dataset.status, 'approved');
  assert.equal(card.querySelector('talos-plan-artifact__state').textContent, 'Approvato · rev. 2');
  assert.equal(card.querySelector('talos-plan-artifact__heading').children[0].textContent, 'Piano approvato', 'il titolo segue lo stato');
  assert.equal(card.querySelector('talos-plan-artifact__choices'), null, 'le scelte spariscono');
  const ricevuta = card.querySelector('talos-plan-artifact__receipt');
  assert.match(ricevuta.textContent, /conversazione nuova/u);
  assert.match(ricevuta.textContent, /Impronta cccccccccccc/u);
  const apri = ricevuta.children.find((n) => n.tagName === 'button');
  apri.click();
  assert.deepEqual(aperte, ['nuova-1']);
});

test('PLAN-CARD-CLOSED-REASONS: chiusa senza scelta, una frase per motivo; mai «approvato»', () => {
  const frasi = {
    fermato: /hai fermato il giro/u, reindirizzamento: /nuova indicazione/u,
    'nuovo-messaggio': /altro messaggio/u, interrotta: /server si è riavviato/u,
  };
  for (const [motivo, attesa] of Object.entries(frasi)) {
    const { card, document } = schedaApprovabile(async () => ({ ok: true }));
    const fact = parsePlanEvent({ schema: 'talos.plan.v1', sessionId: 's', planId: 'p1', revision: 2, requestId: 'r1', hash: HASH,
      status: 'cancelled', motivo, da: motivo === 'interrotta' ? 'sistema' : 'persona', at: '2026-09-24T15:02:00.000Z' }, 's');
    applicaDecisionePiano(card, fact, { document });
    assert.equal(card.querySelector('talos-plan-artifact__state').textContent, 'Chiuso senza scelta');
    assert.match(card.querySelector('talos-plan-artifact__receipt').textContent, attesa, motivo);
    assert.doesNotMatch(card.textContent, /Approvato/u);
  }
});

test('PLAN-CARD-LEGACY-READ-ONLY: il piano dal testo finale (senza richiesta) resta da leggere, senza scelte', () => {
  const document = documento();
  const fact = parsePlanEvent({ schema: 'talos.plan.v1', sessionId: 's', planId: 'p1', revision: 1, status: 'proposed', content: PIANO,
    at: '2026-09-24T15:00:00.000Z' }, 's');
  assert.equal(fact.requestId, undefined);
  const card = createPlanArtifact({ document, ...fact, source: 'journal', onDecisione: async () => ({ ok: true }) });
  assert.equal(card.querySelectorAll('talos-plan-artifact__choice').length, 0);
  assert.match(card.querySelector('talos-plan-artifact__footer').textContent, /non si approva da qui/u);
  // Al contrario: una decisione senza impronta valida non è un fatto.
  assert.equal(parsePlanEvent({ schema: 'talos.plan.v1', sessionId: 's', planId: 'p1', revision: 1, status: 'approved',
    decisione: 'procedi-con-conferma', requestId: 'r1', hash: 'sha256:corta', at: '2026-09-24T15:00:00.000Z' }, 's'), null);
});
