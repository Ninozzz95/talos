import test from 'node:test';
import assert from 'node:assert/strict';
import { caricaOppureSalta } from './_dipendenza-in-corso.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchNarration.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese.
 *
 * ⛔ `narration.mjs` importa `run.mjs`, che porta l'altra sessione di L3:
 * finché non è sul disco questi test si dichiarano saltati col motivo.
 *
 * La pagina deve dire CHE COSA sta facendo, non quanto ne ha fatto. Owner
 * 2026-08-03 sulla pagina di allora: «non c'è un progresso di quello che si sta
 * facendo … dei termini molto tecnici». Ogni caso qui sotto è la stessa
 * affermazione in una situazione diversa — che la frase nomina la domanda del
 * ramo, che è l'unico nome umano che un passo ha.
 */

const { modulo, motivo: salta } = await caricaOppureSalta('../../src/research/narration.mjs');
const { talosResearchDoneNotice, talosResearchNarration, talosResearchStepTitle } = modulo ?? {};

function step(over = {}) {
  return {
    id: 'b1:search',
    branchId: 'b1',
    kind: 'search',
    state: 'running',
    attempts: 1,
    startedAt: '2026-08-03T10:00:00.000Z',
    finishedAt: null,
    spend: { tokens: 0, searches: 0, pages: 0 },
    resultRef: null,
    error: null,
    ...over,
  };
}

function run(patch = {}) {
  return {
    id: 'run-1',
    sessionId: 'chat-1',
    question: 'chi ha inventato la moka',
    depth: 'quick',
    engine: 'device',
    status: 'collecting',
    title: null,
    plan: [
      { id: 'b1', question: 'chi la brevettò', estimate: { tokens: 1, searches: 1, pages: 1 } },
      { id: 'b2', question: 'in che anno', estimate: { tokens: 1, searches: 1, pages: 1 } },
    ],
    steps: [],
    startedAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    ...patch,
  };
}

test('FRASE-01 nomina il ramo che sta cercando, non l’id del passo', { skip: salta }, () => {
  // «sto cercando le fonti su «chi la brevettò»» — la domanda sta sul ramo,
  // approvato prima che si spendesse un centesimo, quindi non costa niente.
  assert.deepEqual(
    talosResearchNarration(run({ steps: [step()] }), true),
    { key: 'research.say.searching', params: { question: 'chi la brevettò' } },
  );
});

test('FRASE-02 segue il passo in corso al secondo ramo, non al primo', { skip: salta }, () => {
  // Una frase che nomina sempre il ramo uno leggerebbe come vera per tutta la
  // corsa ed è sbagliata per la maggior parte.
  const dopo = run({
    steps: [
      step({ id: 'b1:search', state: 'done', resultRef: 'file-1' }),
      step({ id: 'b2:search', branchId: 'b2' }),
    ],
  });
  assert.deepEqual(talosResearchNarration(dopo, true).params, { question: 'in che anno' });
});

test('FRASE-03 distingue leggere una pagina dal cercarne una', { skip: salta }, () => {
  assert.equal(talosResearchNarration(run({ steps: [step({ kind: 'read' })] }), true).key, 'research.say.reading');
});

test('FRASE-04 dice che sta scrivendo appena la sintesi è il passo in corso', { skip: salta }, () => {
  const scrive = run({
    status: 'synthesising',
    steps: [step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise' })],
  });
  // Qui non c'è domanda di ramo, e non se ne inventa una.
  assert.deepEqual(talosResearchNarration(scrive, true), { key: 'research.say.writing', params: {} });
});

test('FRASE-05 dice che cosa STA PER fare nello scarto fra due passi', { skip: salta }, () => {
  // Il motore ha già deciso; lo scarto è di millisecondi. Tacere proprio nel
  // fotogramma in cui è più probabile che una persona guardi è peggio.
  const inMezzo = run({ steps: [step({ state: 'done', resultRef: 'file-1' })] });
  assert.deepEqual(
    talosResearchNarration(inMezzo, true),
    { key: 'research.say.searching', params: { question: 'in che anno' } },
  );
});

test('FRASE-06 dice che sta scrivendo quando ogni ramo è finito e non gira niente', { skip: salta }, () => {
  const raccolto = run({
    steps: [
      step({ id: 'b1:search', state: 'done', resultRef: 'file-1' }),
      step({ id: 'b2:search', branchId: 'b2', state: 'done', resultRef: 'file-2' }),
    ],
  });
  assert.equal(talosResearchNarration(raccolto, true).key, 'research.say.writing');
});

test('FRASE-07 non pretende di star cercando quando nessuno guida la corsa', { skip: salta }, () => {
  // Il giornale legge ancora `collecting` dopo che l'app è stata uccisa. Una
  // pagina che dice «sto cercando» di quella è una bugia che si può guardare
  // per un'ora.
  const abbandonata = run({ steps: [step({ state: 'interrupted' })] });
  assert.deepEqual(
    talosResearchNarration(abbandonata, false),
    { key: 'research.say.stoppedAt', params: { question: 'chi la brevettò' } },
  );
  // E con qualcuno che la guida, la stessa corsa sta cercando di nuovo.
  assert.equal(talosResearchNarration(abbandonata, true).key, 'research.say.searching');
});

test('FRASE-08 dice da dove ripartirà una corsa in pausa', { skip: salta }, () => {
  const inRiposo = run({
    status: 'paused',
    steps: [step({ id: 'b1:search', state: 'done', resultRef: 'file-1' })],
  });
  assert.deepEqual(
    talosResearchNarration(inRiposo, true),
    { key: 'research.say.pausedAt', params: { question: 'in che anno' } },
  );
});

test('FRASE-09 non chiama in pausa una corsa che sta ancora finendo un passo', { skip: salta }, () => {
  // «Drain then checkpoint»: un passo già pagato può finire e depositare. Lo
  // scarto può essere un minuto di qualcuno che fissa un pulsante già premuto,
  // e «in pausa» lì è la parola della pagina contro quella della rotella.
  const chiesta = run({ status: 'pause_requested', steps: [step()] });
  assert.deepEqual(talosResearchNarration(chiesta, true), { key: 'research.say.pausing', params: {} });
});

test('FRASE-10 distingue i finali', { skip: salta }, () => {
  // «annullata» e «si è fermata per un errore» sono due cose diverse da fare
  // dopo, e la pagina diceva una parola sola per entrambe.
  assert.equal(talosResearchNarration(run({ status: 'cancelled' }), false).key, 'research.cancelledHere');
  assert.equal(talosResearchNarration(run({ status: 'failed' }), false).key, 'research.say.failed');
});

test('FRASE-11 non annuncia un rapporto che non è mai stato scritto', { skip: salta }, () => {
  // Owner 2026-08-03: una corsa era finita, la pagina diceva «conclusa», e non
  // c'era niente da leggere. Stesso stato, situazione completamente diversa — e
  // le ore che è costato sono state spese a cercare un difetto nel posto sbagliato.
  const scritto = step({
    id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', state: 'done', resultRef: 'file-report',
  });
  assert.equal(talosResearchNarration(run({ status: 'done', steps: [scritto] }), false).key, 'research.say.done');
  assert.equal(talosResearchNarration(run({ status: 'done', steps: [] }), false).key, 'research.doneNoReport');
  // Una sintesi partita e fallita non ha lasciato un rapporto nemmeno lei.
  assert.equal(
    talosResearchNarration(run({ status: 'done', steps: [{ ...scritto, state: 'failed', resultRef: null }] }), false).key,
    'research.doneNoReport',
  );
});

test('FRASE-12 non va a cercare lavoro che una corsa terminale non deve più', { skip: salta }, () => {
  // Una corsa annullata ha rami in sospeso sulla carta. Nominarne uno
  // prometterebbe che verrà ripreso.
  assert.deepEqual(talosResearchNarration(run({ status: 'cancelled' }), false).params, {});
});

test('FRASE-13 dice che sta pianificando solo finché non c’è un piano', { skip: salta }, () => {
  assert.equal(talosResearchNarration(run({ plan: [] }), true).key, 'research.say.planning');
});

test('FRASE-14 non lascia mai un segnaposto vuoto quando un ramo è sparito', { skip: salta }, () => {
  // Un passo che punta a un ramo che il piano non ha stamperebbe a schermo il
  // testo letterale `{question}`.
  const orfano = run({ steps: [step({ branchId: 'ghost' })] });
  const detto = talosResearchNarration(orfano, true);
  assert.equal(detto.key, 'research.say.collecting');
  assert.deepEqual(detto.params, {});
});

test('FRASE-15 il nome di un passo è a che cosa serviva, mai l’identificativo del motore', { skip: salta }, () => {
  // `b1:search` è utile a esattamente un lettore, e l'ha scritto lui.
  assert.deepEqual(
    talosResearchStepTitle(run(), step()),
    { key: 'research.stepTitle.search', params: { question: 'chi la brevettò' } },
  );
  assert.equal(talosResearchStepTitle(run(), step({ kind: 'read' })).key, 'research.stepTitle.read');
});

test('FRASE-16 nomina senza domanda i due passi che non appartengono a nessun ramo', { skip: salta }, () => {
  const scrive = step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise' });
  assert.deepEqual(talosResearchStepTitle(run(), scrive), { key: 'research.stepTitle.write', params: {} });
  assert.equal(talosResearchStepTitle(run(), step({ kind: 'verify' })).key, 'research.stepTitle.verify');
});

test('FRASE-17 ripiega su un nome semplice invece di stampare una citazione vuota', { skip: salta }, () => {
  assert.equal(talosResearchStepTitle(run(), step({ branchId: 'ghost' })).key, 'research.stepTitle.searchPlain');
  assert.equal(talosResearchStepTitle(run(), step({ branchId: 'ghost', kind: 'read' })).key, 'research.stepTitle.readPlain');
});

const scritto = step({
  id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', state: 'done', resultRef: 'file-report',
});

test('AVVISO-01 non dice niente mentre sta ancora andando', { skip: salta }, () => {
  assert.equal(talosResearchDoneNotice(run({ status: 'collecting' })), null);
  assert.equal(talosResearchDoneNotice(run({ status: 'paused' })), null);
  assert.equal(talosResearchDoneNotice(run({ status: 'pause_requested' })), null);
});

test('AVVISO-02 tace su una ricerca che la persona ha annullato da sé', { skip: salta }, () => {
  // Dirle che si è fermata è l'app che le ripete la sua stessa azione, e ogni
  // notifica così rende più facile scartare la prossima senza leggerla.
  assert.equal(talosResearchDoneNotice(run({ status: 'cancelled' })), null);
});

test('AVVISO-03 porta l’indirizzo di QUESTA ricerca, non dell’app', { skip: salta }, () => {
  const avviso = talosResearchDoneNotice(run({ status: 'done', steps: [scritto] }));
  assert.equal(avviso.route, '/research/run-1');
});

test('AVVISO-04 parla con le parole della persona, e dice la stessa cosa che dice la pagina', { skip: salta }, () => {
  const avviso = talosResearchDoneNotice(run({ status: 'done', steps: [scritto] }));
  assert.equal(avviso.title, 'chi ha inventato la moka');
  assert.equal(avviso.text.key, 'research.say.done');
});

test('AVVISO-05 preferisce il titolo che la persona ha scelto alla domanda che ha scritto', { skip: salta }, () => {
  const rinominata = run({ status: 'done', title: 'La moka', steps: [scritto] });
  assert.equal(talosResearchDoneNotice(rinominata).title, 'La moka');
});

test('AVVISO-06 non annuncia un rapporto che non è mai stato scritto', { skip: salta }, () => {
  // Stesso stato, situazione diversa — e «conclusa» sulla schermata di blocco
  // per una corsa senza niente da leggere è la caccia del 2026-08-03 da capo.
  assert.equal(talosResearchDoneNotice(run({ status: 'done', steps: [] })).text.key, 'research.doneNoReport');
  assert.equal(talosResearchDoneNotice(run({ status: 'failed' })).text.key, 'research.say.failed');
});
