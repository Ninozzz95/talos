/*
 * 21/10/2026 — due cose viste dal vivo dalla sessione video (app 0.1.34):
 *   · C-4 dell'indagine `INDAGINE-21-10-GOAL-REVISORE-SENZA-VERDETTO`: la fascia del /goal diceva solo «The reviewer could not reach a
 *     verdict», e il PERCHÉ (che il server manda in `confutazione.motivo`) non si vedeva;
 *   · la card della proposta di Workflow mostrava cinque righe identiche «The preflight check has a warning about this proposal.»:
 *     ogni codice di `src/workflow/preflight.mjs` ha ora la sua frase, coi soggetti come parametri, e gli avvisi uguali una riga.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { motivoDaLeggere } from '../../src/components/obiettivo-fascia.js';
import { righeDegliAvvisi, nomeDelLimite } from '../../src/components/workflow-proposal-card.js';
import { impostaLingua } from '../../src/components/lingua.js';

const pausa = (confutazione) => ({ id: 'ob-1', testo: 'x', stato: 'in-pausa', motivo: { tipo: 'confutatore-guasto' }, revisione: 2, ...(confutazione ? { confutazione } : {}) });

test('GOAL-REV-UI-01 — il revisore senza verdetto: le sue parole come citazione, con chi le ha dette', () => {
  impostaLingua('en');
  const m = motivoDaLeggere(pausa({ esito: 'senza-esito', motivo: 'I could not run git to check that no test file changed', alle: '2026-10-21T10:00:00.000Z' }));
  assert.equal(m.testo, 'The reviewer could not reach a verdict, so TALOS did not say «done».');
  assert.deepEqual(m.citazione, { chi: 'Reviewer', testo: 'I could not run git to check that no test file changed' });
  impostaLingua('it');
  assert.equal(motivoDaLeggere(pausa({ esito: 'senza-esito', motivo: 'non ho potuto lanciare git' })).citazione.chi, 'Revisore');
});

test('GOAL-REV-UI-02 — un codice di TALOS diventa una frase, mai il codice grezzo; ogni codice del server ha la sua', () => {
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    const frasi = new Set();
    for (const codice of ['refuter-no-model', 'refuter-not-started', 'refuter-failed', 'refuter-timeout', 'refuter-unreadable', 'refuter-undecided', 'refutation-without-evidence']) {
      const m = motivoDaLeggere(pausa({ esito: 'senza-esito', motivo: codice }));
      assert.equal(m.citazione, undefined, `${lingua} ${codice}: un codice non è una citazione del modello`);
      assert.ok(!m.testo.includes(codice) && !/refut/u.test(m.testo), `${lingua} ${codice}: niente codici a schermo («${m.testo}»)`);
      assert.ok(!/chat\.goal/u.test(m.testo), `${lingua} ${codice}: niente chiavi grezze`);
      frasi.add(m.testo);
    }
    assert.equal(frasi.size, 7, `${lingua}: sette codici, sette frasi diverse`);
  }
});

test('GOAL-REV-UI-03 — AL CONTRARIO: senza confutazione, o con un motivo vuoto, resta la frase di prima e niente citazione', () => {
  impostaLingua('en');
  for (const c of [null, { esito: 'senza-esito', motivo: '' }, { esito: 'senza-esito', motivo: '   ' }]) {
    const m = motivoDaLeggere(pausa(c));
    assert.equal(m.testo, 'The reviewer could not reach a verdict, so TALOS did not say «done».');
    assert.equal(m.citazione, undefined);
  }
  // un altro motivo di pausa non prende la confutazione rimasta da prima
  const altro = motivoDaLeggere({ ...pausa({ esito: 'senza-esito', motivo: 'parole vecchie' }), motivo: { tipo: 'nessun-progresso' } });
  assert.equal(altro.citazione, undefined);
  // un motivo che SEMBRA un codice ma non lo è: sono parole del modello
  assert.deepEqual(motivoDaLeggere(pausa({ esito: 'senza-esito', motivo: 'refuter-xyz' })).citazione, { chi: 'Reviewer', testo: 'refuter-xyz' });
});

const avviso = (code, subjects = []) => ({ code, message: 'technical text that must never show', subjects });

test('PREFLIGHT-UI-01 — i limiti dei passi oltre il limite del run: UNA riga, coi nomi dei limiti in parole', () => {
  impostaLingua('en');
  const righe = righeDegliAvvisi([
    avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['completionTokens']),
    avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['modelRequests']),
    avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['promptTokens']),
    avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['toolCalls']),
    avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['wallMs']),
  ]);
  assert.deepEqual(righe, ['The limits of the steps add up to more than the limit of the whole run, for: output tokens, model requests, input tokens, tool calls, and time.']);
  impostaLingua('it');
  assert.deepEqual(righeDegliAvvisi([avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['modelRequests']), avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', ['promptTokens'])]),
    ['I limiti dei passi, sommati, superano il limite dell’intera esecuzione per: richieste al modello e token in ingresso.']);
});

test('PREFLIGHT-UI-02 — ogni codice ha la sua frase, coi soggetti; nessun nome tecnico, nessun testo grezzo del server', () => {
  impostaLingua('en');
  const tutti = righeDegliAvvisi([
    avviso('PREFLIGHT_HOTSPOT_FILE', ['src/app.js', 'step-a', 'step-b']),
    avviso('PREFLIGHT_WRITESET_OVERLAP', ['docs/**', 'docs/guide.md', 'writer-1', 'writer-2']),
    avviso('PREFLIGHT_HIGH_FANOUT', ['14']),
    avviso('PREFLIGHT_LONG_CRITICAL_PATH', ['16', '9']), // ordinati come stringhe dal server: «16» prima di «9»
    avviso('PREFLIGHT_SINGLE_MODEL_JUDGE', ['judge-1', 'judge-2']),
    avviso('PREFLIGHT_UNKNOWN_COST', ['knownCostUsd']),
  ]);
  assert.deepEqual(tutti, [
    'Several steps write the same file: src/app.js. Their changes may collide.',
    'Two steps write to overlapping places: docs/** and docs/guide.md. They may have to run one after the other.',
    'Up to 14 steps can run at the same time, more than the usual 10.',
    'The longest chain of steps is 9 long, close to the limit of 16.',
    'All 2 judging steps use the same model: nothing checks its blind spots.',
    'The cost cannot be estimated in advance: it remains unknown, not zero.',
  ]);
  for (const riga of tutti) for (const tecnico of ['PREFLIGHT_', 'knownCostUsd', 'technical text', 'step-a', 'writer-1', 'judge-1']) assert.ok(!riga.includes(tecnico), `${tecnico} in «${riga}»`);
  assert.equal(new Set(tutti).size, tutti.length, 'sei codici, sei frasi diverse');
});

test('PREFLIGHT-UI-03 — AL CONTRARIO: un codice sconosciuto resta la frase generica, e due sconosciuti sono UNA riga; un percorso senza nome non si inventa', () => {
  impostaLingua('en');
  assert.deepEqual(righeDegliAvvisi([avviso('PREFLIGHT_FUTURE_ONE'), avviso('PREFLIGHT_FUTURE_TWO')]), ['The preflight check has a warning about this proposal.']);
  assert.deepEqual(righeDegliAvvisi([avviso('PREFLIGHT_HOTSPOT_FILE', ['step-a', 'step-b'])]), ['Several steps write the same file. Their changes may collide.']);
  assert.deepEqual(righeDegliAvvisi([]), []);
  assert.deepEqual(righeDegliAvvisi(null), []);
  // l'ordine è quello della prima comparsa di ogni codice
  assert.deepEqual(righeDegliAvvisi([avviso('PREFLIGHT_UNKNOWN_COST'), avviso('PREFLIGHT_HIGH_FANOUT', ['12']), avviso('PREFLIGHT_UNKNOWN_COST')]),
    ['The cost cannot be estimated in advance: it remains unknown, not zero.', 'Up to 12 steps can run at the same time, more than the usual 10.']);
});

test('PREFLIGHT-UI-04 — tanti file: i primi quattro e «N more»; un nome del modello con un carattere d’inganno passa dal filtro', () => {
  impostaLingua('en');
  const [riga] = righeDegliAvvisi([avviso('PREFLIGHT_HOTSPOT_FILE', ['a/1.js', 'a/2.js', 'a/3.js', 'a/4.js', 'a/5.js', 'a/6.js', 'step-x'])]);
  assert.equal(riga, 'Several steps write the same file: a/1.js, a/2.js, a/3.js, a/4.js, and 2 more. Their changes may collide.');
  const [inganno] = righeDegliAvvisi([avviso('PREFLIGHT_HOTSPOT_FILE', ['src/a‮sj.txt', 'step-a', 'step-b'])]);
  assert.ok(!inganno.includes('‮'), 'nessuna inversione bidirezionale a schermo');
  assert.equal(nomeDelLimite('nuovoLimite'), 'another limit');
});

/* La card DISEGNA le righe raggruppate (visto dal vivo: cinque <li> identici). Lo stesso documento finto di workflow-proposal-card.test. */
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

test('PREFLIGHT-UI-05 — la card disegna UNA riga per cinque avvisi di limite, e la frase vera; gli errori restano «da correggere»', async () => {
  impostaLingua('en');
  const { creaCardProposta, disegnaCardProposta, leggiRicevutaProposta } = await import('../../src/components/workflow-proposal-card.js');
  const HASH = `sha256:${'7cecbef4903d'.padEnd(64, '0')}`;
  const ricevuta = { schema: 'talos.workflow-proposal-receipt.v1', workflowId: 'bf05e156-1167-8e81-874c-a88b99cd9fc0', version: 1, definitionHash: HASH, status: 'proposed' };
  const document = fakeDocument();
  const card = creaCardProposta({ document, ricevuta: leggiRicevutaProposta(ricevuta) });
  disegnaCardProposta(card, { document, onApprova: () => {}, revisione: {
    schema: 'talos.workflow-proposal-view.v2', status: 'proposed', workflowId: ricevuta.workflowId, version: 1, definitionHash: HASH,
    title: 'T', objective: 'O', phases: [{ id: 'p', label: 'P', total: 4 }], budgets: { modelRequests: 40, knownCostUsd: null },
    preflight: { errors: [], warnings: ['completionTokens', 'modelRequests', 'promptTokens', 'toolCalls', 'wallMs'].map((f) => avviso('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT', [f])) },
  } });
  const note = tutti(card).filter((n) => n.dataset?.kind === 'warning');
  assert.equal(note.length, 1, 'una riga sola');
  assert.match(note[0].textContent, /^The limits of the steps add up to more than the limit of the whole run, for: output tokens, model requests, input tokens, tool calls, and time\.$/u);
  assert.ok(!card.textContent.includes('The preflight check has a warning'), 'niente frase generica');
});

test('GOAL-REV-UI-04 — parole del revisore che coincidono col nome di una proprietà di ogni oggetto restano parole', () => {
  impostaLingua('en');
  for (const parole of ['toString', 'constructor', '__proto__']) {
    assert.deepEqual(motivoDaLeggere(pausa({ esito: 'senza-esito', motivo: parole })).citazione, { chi: 'Reviewer', testo: parole }, parole);
  }
});
