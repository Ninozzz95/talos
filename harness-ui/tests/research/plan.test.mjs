/*
 * Traduzione fedele di AVM/mobile/tests/unit/research/researchPlan.test.ts
 * (vitest → node:test + node:assert/strict). Stessi casi, stessi nomi, stesse
 * asserzioni; in più i tre casi segnati «⭐ MIO» che il mobile non provava.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TALOS_RESEARCH_DEPTHS,
  talosResearchPlanCost,
  talosResearchPlanFor,
  talosResearchPlanReworded,
  talosResearchPlanTotals,
  talosResearchPlanWith,
  talosResearchPlanWithout,
  talosResearchSynthesisLoad,
} from '../../src/research/plan.mjs';

const QUESTION = 'quale tablet conviene';

test('apre la domanda su lati diversi, non quattro parafrasi della stessa', () => {
  const plan = talosResearchPlanFor(QUESTION, 'deep');

  assert.equal(plan.length, TALOS_RESEARCH_DEPTHS.deep.branches);
  // Un piano i cui rami dicono la stessa cosa spende quattro volte per
  // imparare una cosa sola: è il guasto che quest'ordine esiste per evitare.
  assert.equal(new Set(plan.map((branch) => branch.question)).size, plan.length);
  assert.equal(plan.every((branch) => branch.question.startsWith(QUESTION)), true);
});

test('cresce con la profondità, in ogni dimensione su cui l\'utente sta decidendo', () => {
  const quick = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'quick'));
  const deep = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'deep'));
  const exhaustive = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'exhaustive'));

  assert.ok(quick.pages < deep.pages);
  assert.ok(deep.pages < exhaustive.pages);
  assert.ok(quick.tokens < deep.tokens);
  assert.ok(quick.minutes <= deep.minutes);
});

test('non annuncia mai un giro di zero minuti quando dentro c\'è lavoro', () => {
  // «0 minuti» per una cosa che ne prende quaranta di secondi è una bugia
  // sull'unica cosa che l'utente aveva chiesto prima di premere avvia.
  const tiny = talosResearchPlanFor(QUESTION, 'quick').slice(0, 1);

  assert.ok(talosResearchPlanTotals(tiny).minutes >= 1);
  assert.equal(talosResearchPlanTotals([]).minutes, 0);
});

/*
 * L'asserzione per cui questo modulo esiste.
 *
 * I prezzi cambiano, e un listino dentro un pacchetto è una bugia con una data
 * di rilascio sopra. OpenRouter pubblica tariffe per token che possiamo
 * leggere; gli altri fornitori non pubblicano niente di leggibile a macchina.
 * Quindi quando nessun prezzo è stato ottenuto la risposta è «non conoscibile
 * da qui» — mai una cifra plausibile, e mai zero, che si leggerebbe «gratis».
 */
test('rifiuta di inventare un prezzo che non gli è mai stato dato', () => {
  const totals = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'deep'));

  const cost = talosResearchPlanCost(totals, null);

  assert.deepEqual(cost, { known: false });
  assert.equal(Object.prototype.hasOwnProperty.call(cost, 'amount'), false);
});

test('dice il denaro quando un prezzo pubblicato è stato davvero ottenuto', () => {
  const totals = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, 'deep'));

  const cost = talosResearchPlanCost(totals, {
    currency: 'USD',
    promptPerMillion: 3,
    completionPerMillion: 15,
  });

  assert.equal(cost.known, true);
  assert.equal(cost.currency, 'USD');
  // Leggere domina un giro di ricerca, quindi la tariffa del prompt porta la
  // maggior parte del totale: a 85/15 la risposta sta più vicina a 3 che a 15
  // per milione.
  const perMillion = (cost.amount / totals.tokens) * 1_000_000;
  assert.ok(perMillion > 3);
  assert.ok(perMillion < 6);
});

test('lascia andare un ramo, e gli altri tengono il loro nome', () => {
  const plan = talosResearchPlanFor(QUESTION, 'deep');

  const shorter = talosResearchPlanWithout(plan, 'b2');

  assert.deepEqual(shorter.map((branch) => branch.id), ['b1', 'b3', 'b4']);
  assert.ok(talosResearchPlanTotals(shorter).pages < talosResearchPlanTotals(plan).pages);
});

/*
 * Togliere e poi aggiungere non deve riusare un nome.
 *
 * Un passo è identificato dal suo ramo, quindi un secondo `b2` prenderebbe il
 * posto del primo nel giornale — e il giornale è ciò che decide se una cosa era
 * già stata pagata.
 */
test('non dà mai a un ramo nuovo il nome di uno che era stato tolto', () => {
  const plan = talosResearchPlanFor(QUESTION, 'deep');

  const edited = talosResearchPlanWith(talosResearchPlanWithout(plan, 'b2'), 'e i prezzi usati?', 'deep');

  assert.deepEqual(edited.map((branch) => branch.id), ['b1', 'b3', 'b4', 'b5']);
  assert.equal(new Set(edited.map((branch) => branch.id)).size, edited.length);
});

test('riformula un ramo senza cambiare quanto ci si aspetta che costi', () => {
  const plan = talosResearchPlanFor(QUESTION, 'quick');

  const reworded = talosResearchPlanReworded(plan, 'b1', '  quanto durano le batterie  ');

  assert.equal(reworded[0].question, 'quanto durano le batterie');
  assert.deepEqual(reworded[0].estimate, plan[0].estimate);
  assert.deepEqual(talosResearchPlanTotals(reworded), talosResearchPlanTotals(plan));
});

/*
 * ⭐ MIO — il mobile non lo provava.
 *
 * `localAuthor` è la leva che tiene la sintesi dentro un prompt che un modello
 * sul dispositivo scrive in minuti. Il commento del sorgente dichiara due cose
 * misurabili: il tetto è sul TOTALE (sei fonti), e vale a QUALSIASI profondità
 * — cioè «Esaustiva» non deve mostrare meno pagine di «Rapida». Quel difetto
 * c'è già stato («più profonda che rende meno … sembra rotta, e lo era»), e un
 * porto che lo reintroducesse passerebbe tutti i test qui sopra.
 */
test('⭐ MIO — con autore locale il totale delle pagine è sei a ogni profondità', () => {
  for (const depth of /** @type {const} */ (['quick', 'deep', 'exhaustive'])) {
    const totals = talosResearchPlanTotals(talosResearchPlanFor(QUESTION, depth, true));
    assert.equal(totals.pages, 6, `profondità ${depth}`);
  }
});

test('⭐ MIO — l\'autore locale non gonfia mai un giro rapido', () => {
  // «Si ABBASSA soltanto»: quick chiede 5 pagine per ramo su due rami, e il
  // tetto locale le porta a 3+3 — mai sopra ciò che la profondità chiedeva.
  const remoto = talosResearchPlanFor(QUESTION, 'quick');
  const locale = talosResearchPlanFor(QUESTION, 'quick', true);

  for (const [i, branch] of locale.entries()) {
    assert.ok(branch.estimate.pages <= remoto[i].estimate.pages);
  }
});

test('⭐ MIO — il carico della sintesi conta le pagine, non i totali del giro', () => {
  // Dire i token TOTALI dove il modello ne legge molti meno è «una cifra
  // plausibile invece che vera», che è proprio ciò che la disciplina vieta.
  const plan = talosResearchPlanFor(QUESTION, 'deep');
  const totals = talosResearchPlanTotals(plan);

  assert.equal(talosResearchSynthesisLoad(plan), totals.pages * 1_500);
  assert.ok(talosResearchSynthesisLoad(plan) < totals.tokens);
  assert.equal(talosResearchSynthesisLoad([]), 0);
});
