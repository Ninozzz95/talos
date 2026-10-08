import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ContrattoDomandaUtenteError,
  LIMITI_DOMANDA_UTENTE,
  fingerprintDomanda,
  validaDomandeUtente,
  validaRispostaDomanda,
} from '../src/user-question-contract.mjs';

const chiusa = {
  id: 'scelta',
  question: 'Quale strada?',
  options: [
    { label: 'A', description: 'Prima strada' },
    { label: 'B', description: 'Seconda strada' },
  ],
};

test('DOMANDA-CONTRATTO — normalizza una domanda chiusa e una libera senza inventare campi', () => {
  assert.deepEqual(validaDomandeUtente([
    { ...chiusa, question: '  Quale strada?  ' },
    { id: 'nota', question: 'Aggiungi un dettaglio?' },
  ]), [
    chiusa,
    { id: 'nota', question: 'Aggiungi un dettaglio?' },
  ]);
});

test('DOMANDA-CONTRATTO — id unici snake_case, 1..4 domande e 2..4 opzioni sono hard gate', () => {
  for (const invalide of [
    [],
    Array.from({ length: LIMITI_DOMANDA_UTENTE.domandeMax + 1 }, (_, i) => ({ id: `q_${i}`, question: 'x' })),
    [{ id: 'NonSnake', question: 'x' }],
    [{ id: 'dup', question: 'x' }, { id: 'dup', question: 'y' }],
    [{ id: 'x', question: 'x', options: [{ label: 'A', description: 'a' }] }],
    [{ id: 'x', question: 'x', options: [
      { label: 'A', description: 'a' }, { label: 'a', description: 'b' },
    ] }],
    [{ id: 'x', question: 'x', multiSelect: true }],
  ]) {
    assert.throws(() => validaDomandeUtente(invalide), ContrattoDomandaUtenteError);
  }
});

test('DOMANDA-CONTRATTO — fingerprint è canonico, stabile e sensibile alla semantica', () => {
  const atteso = 'sha256:dd9a4c03a66e9e0103412a5510692cb7be1f95c59a9c76c7be01b9b47e99f810';
  assert.equal(fingerprintDomanda([chiusa]), atteso);
  assert.equal(fingerprintDomanda([{ ...chiusa, question: '  Quale strada?  ' }]), atteso,
    'spazi normalizzati non devono cambiare la decisione canonica');
  assert.notEqual(fingerprintDomanda([{ ...chiusa, question: 'Quale strada scegliere?' }]), atteso,
    'una domanda semanticamente diversa deve avere fingerprint diverso');
});

test('DOMANDA-CONTRATTO — limiti stringa e campi extra falliscono chiusi', () => {
  const troppo = (n) => 'x'.repeat(n + 1);
  for (const invalide of [
    [{ ...chiusa, extra: true }],
    [{ ...chiusa, id: troppo(LIMITI_DOMANDA_UTENTE.idMax) }],
    [{ ...chiusa, question: troppo(LIMITI_DOMANDA_UTENTE.domandaMax) }],
    [{ ...chiusa, options: [
      { label: troppo(LIMITI_DOMANDA_UTENTE.etichettaMax), description: 'a' },
      { label: 'B', description: 'b' },
    ] }],
    [{ ...chiusa, options: [
      { label: 'A', description: troppo(LIMITI_DOMANDA_UTENTE.descrizioneMax) },
      { label: 'B', description: 'b' },
    ] }],
    [{ ...chiusa, options: [
      { label: 'A', description: 'a', extra: true },
      { label: 'B', description: 'b' },
    ] }],
  ]) {
    assert.throws(() => validaDomandeUtente(invalide), ContrattoDomandaUtenteError);
  }
});

test('DOMANDA-CONTRATTO — answered richiede esattamente tutte le risposte', () => {
  const questions = [chiusa, { id: 'nota', question: 'Dettaglio?' }];
  assert.deepEqual(validaRispostaDomanda(questions, {
    status: 'answered',
    answers: { scelta: 'A', nota: 'testo' },
  }), { status: 'answered', answers: { scelta: 'A', nota: 'testo' } });
  assert.throws(() => validaRispostaDomanda(questions, {
    status: 'answered', answers: { scelta: 'A' },
  }), /exactly/u);
  assert.throws(() => validaRispostaDomanda(questions, {
    status: 'answered', answers: { scelta: 'A', nota: 'x', intrusa: 'y' },
  }), /exactly/u);
});

test('DOMANDA-CONTRATTO — multi-select conserva scelte note più un solo Altro', () => {
  const questions = [{ ...chiusa, multiSelect: true }];
  assert.deepEqual(validaRispostaDomanda(questions, {
    status: 'answered', answers: { scelta: ['A', 'Una terza strada'] },
  }), { status: 'answered', answers: { scelta: ['A', 'Una terza strada'] } });
  assert.throws(() => validaRispostaDomanda(questions, {
    status: 'answered', answers: { scelta: ['A', 'Altro 1', 'Altro 2'] },
  }), /at most one/u);
});

test('DOMANDA-CONTRATTO — skipped/cancelled non trasportano answers', () => {
  assert.deepEqual(validaRispostaDomanda([chiusa], { status: 'skipped' }), { status: 'skipped' });
  assert.deepEqual(validaRispostaDomanda([chiusa], { status: 'cancelled' }), { status: 'cancelled' });
  assert.throws(() => validaRispostaDomanda([chiusa], { status: 'skipped', answers: {} }), /must not contain/u);
});

// 23/09/2026, decisione owner: 1-4 domande × 2-4 opzioni. Numeri scritti IN CHIARO, non le costanti:
// se qualcuno rimette i limiti vecchi (3 / 5) questa prova diventa rossa.
test('DOMANDA-CONTRATTO-LIMITI-OWNER — quattro domande e quattro opzioni passano, la quinta no', () => {
  const opzioni = (n) => Array.from({ length: n }, (_, i) => ({ label: `Scelta ${i + 1}`, description: `Motivo ${i + 1}` }));
  const domanda = (i, n) => ({ id: `d_${i}`, question: `Domanda ${i}?`, options: opzioni(n) });
  assert.equal(validaDomandeUtente([0, 1, 2, 3].map((i) => domanda(i, 4))).length, 4);
  assert.throws(() => validaDomandeUtente([0, 1, 2, 3, 4].map((i) => domanda(i, 2))), ContrattoDomandaUtenteError);
  assert.throws(() => validaDomandeUtente([domanda(0, 5)]), ContrattoDomandaUtenteError);
});

// 24/09/2026, decisione owner 32 (AskUserQuestion): «perché conta» OBBLIGATORIO per ogni domanda del modello, al più
// un'opzione «consigliata» e sempre per prima. Numeri e forme scritti in chiaro, come sopra.
const conPerche = (extra = {}) => ({ ...chiusa, why: 'Decide quale ramo del lavoro parte per primo.', ...extra });

test('DOMANDA-PERCHE-OBBLIGATORIO-AL-MODELLO — senza «why» il modello è respinto, con «why» passa e resta nella forma canonica', () => {
  assert.throws(() => validaDomandeUtente([chiusa], { perche: 'obbligatorio' }), /why/u);
  assert.throws(() => validaDomandeUtente([conPerche({ why: '   ' })], { perche: 'obbligatorio' }), /why/u);
  assert.throws(() => validaDomandeUtente([conPerche({ why: 'x'.repeat(301) })], { perche: 'obbligatorio' }), /300/u);
  const [canonica] = validaDomandeUtente([conPerche({ why: '  Decide quale ramo del lavoro parte per primo.  ' })], { perche: 'obbligatorio' });
  assert.deepEqual(Object.keys(canonica), ['id', 'question', 'why', 'options']);
  assert.equal(canonica.why, 'Decide quale ramo del lavoro parte per primo.');
});

test('DOMANDA-PERCHE-STORICO — una domanda salvata prima del 24/09 senza «why» resta valida (risposte e ricevute delle sessioni vecchie)', () => {
  assert.deepEqual(validaDomandeUtente([chiusa]), [chiusa]);
  assert.deepEqual(validaRispostaDomanda([chiusa], { status: 'answered', answers: { scelta: 'A' } }), { status: 'answered', answers: { scelta: 'A' } });
  // ma se c'è, si valida anche nel modo storico: mai una forma diversa sul disco
  assert.throws(() => validaDomandeUtente([conPerche({ why: 42 })]), /why/u);
});

test('DOMANDA-CONSIGLIATA-PRIMA — la consigliata va in testa, al più una, e solo come booleano', () => {
  const opzioni = [
    { label: 'A', description: 'Prima strada' },
    { label: 'B', description: 'Seconda strada', recommended: true },
    { label: 'C', description: 'Terza strada', recommended: false },
  ];
  const [canonica] = validaDomandeUtente([conPerche({ options: opzioni })], { perche: 'obbligatorio' });
  assert.deepEqual(canonica.options, [
    { label: 'B', description: 'Seconda strada', recommended: true },
    { label: 'A', description: 'Prima strada' },
    { label: 'C', description: 'Terza strada' },
  ]);
  assert.throws(() => validaDomandeUtente([conPerche({ options: [
    { label: 'A', description: 'a', recommended: true }, { label: 'B', description: 'b', recommended: true },
  ] })]), /recommended option/u);
  assert.throws(() => validaDomandeUtente([conPerche({ options: [
    { label: 'A', description: 'a', recommended: 'sì' }, { label: 'B', description: 'b' },
  ] })]), /recommended/u);
  // l'impronta segue la forma canonica: stessa domanda con la consigliata altrove ⇒ stessa impronta
  const invertita = [{ label: 'A', description: 'Prima strada' }, { label: 'B', description: 'Seconda strada', recommended: true }];
  const diretta = [{ label: 'B', description: 'Seconda strada', recommended: true }, { label: 'A', description: 'Prima strada' }];
  assert.equal(fingerprintDomanda([conPerche({ options: invertita })]), fingerprintDomanda([conPerche({ options: diretta })]));
});

// 24/09/2026, decisione owner 35 (scadenza facoltativa come impostazione) e 9 (scaduta ⇒ il giro si ferma).
test('DOMANDA-SCADUTA: «expired» è un esito ammesso, senza risposte', () => {
  assert.deepEqual(validaRispostaDomanda([chiusa], { status: 'expired' }), { status: 'expired' });
  assert.throws(() => validaRispostaDomanda([chiusa], { status: 'expired', answers: { scelta: 'A' } }), /must not contain/u);
});

/*
 * ⭐ 27/09/2026, decisione owner 46 — la sessione 56066b64: glm-5.3-flash ha mandato un `id` dentro ogni opzione («u1», «u2»…),
 *   la domanda è stata rifiutata e l'owner ha visto l'errore. Alla porta del modello i campi in più si ignorano (come Hermes);
 *   la forma che esce è quella canonica, senza di loro.
 */
test('DOMANDA-CAMPI-IN-PIU-AL-MODELLO — alla porta del modello un campo in più si IGNORA e non entra nella domanda; le altre porte restano rigide', () => {
  const comeGlm = {
    id: 'features', question: 'Che cosa aggiungo?', why: 'Decide che cosa costruisco per primo.', header: 'Funzioni',
    options: [
      { id: 'u1', label: 'Economia', description: 'Un idle-game completo', recommended: true },
      { id: 'u2', label: 'Terminale', description: 'Un terminale finto' },
    ],
  };
  const [canonica] = validaDomandeUtente([comeGlm], { perche: 'obbligatorio', campiInPiu: 'ignora' });
  /* 02/10/2026, tappa 3 CLI: `header` (≤ 12) è diventato un campo del contratto — glm-5.3-flash lo mandava già da solo —
     quindi resta; gli `id` dentro le opzioni restano campi in più, ignorati. */
  assert.deepEqual(canonica, {
    id: 'features', header: 'Funzioni', question: 'Che cosa aggiungo?', why: 'Decide che cosa costruisco per primo.',
    options: [
      { label: 'Economia', description: 'Un idle-game completo', recommended: true },
      { label: 'Terminale', description: 'Un terminale finto' },
    ],
  });
  // AL CONTRARIO: la porta predefinita (registro, HTTP) rifiuta ancora, e alla porta del modello «why» resta obbligatorio
  assert.throws(() => validaDomandeUtente([comeGlm]), /unrecognized fields/u);
  const { why, ...senzaPerche } = comeGlm;
  assert.ok(why);
  assert.throws(() => validaDomandeUtente([senzaPerche], { perche: 'obbligatorio', campiInPiu: 'ignora' }), /why is required/u);
  // e ignorare non vuol dire accettare tutto: tipi, limiti e doppioni restano rifiuti
  assert.throws(() => validaDomandeUtente([{ ...comeGlm, options: [comeGlm.options[0], { ...comeGlm.options[0], id: 'u9' }] }], { perche: 'obbligatorio', campiInPiu: 'ignora' }), /duplicate/u);
  assert.throws(() => validaDomandeUtente([{ ...comeGlm, multiSelect: 'sì' }], { perche: 'obbligatorio', campiInPiu: 'ignora' }), /boolean/u);
});
