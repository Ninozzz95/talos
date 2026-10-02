/*
 * 02/10/2026 — tappa 3 della CLI (richieste interattive), decisione owner «Estendo il contratto»: la scheda delle domande del
 * mockup approvato ha un titolo breve per scheda, un'anteprima accanto all'opzione, una nota per risposta e il salto della
 * singola domanda. Proposta: `lavoro/PROPOSTA-PATCH-KERNEL-DOMANDE-2026-10-02.md` (cartella handoff della CLI).
 * Fonti: Claude Code AskUserQuestion (`header` ≤ 12, `preview` per opzione, `annotations.notes`); Codex
 * `tui/src/bottom_pane/request_user_input/mod.rs` (nota come `user_note: …`, domanda saltata ⇒ lista vuota); OpenCode
 * `tool/question.ts` («Unanswered»). Qui i campi restano SEPARATI (decisione owner 32: la ricevuta sa cosa è nota e cosa
 * è scelta), e tutto è facoltativo: domande e risposte di prima restano valide byte per byte.
 * Fa anche `-p` senza l'attrezzo (decisione owner 01/10, come Claude Code): il registro esporta la sua lista predefinita.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIMITI_DOMANDA_UTENTE, fingerprintDomanda, validaDomandeUtente, validaRispostaDomanda } from '../src/user-question-contract.mjs';
import { ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI, createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

const DOMANDE = [
  { id: 'fix', header: 'Fix', question: 'How should the test wait?', why: 'It decides what changes.', options: [
    { label: 'Wait for the cookie', description: 'product unchanged', recommended: true, preview: '-  await page.waitForTimeout(500)\n+  await waitForSession(page)\n' },
    { label: 'Shorten the retry', description: 'changes the product' },
  ] },
  { id: 'verify', header: 'Verify', question: 'Which checks?', why: 'More checks take longer.', multiSelect: true, options: [
    { label: 'Login e2e', description: 'proves the flake is gone' }, { label: 'Unit tests', description: 'about 40 s' },
  ] },
  { id: 'commit', question: 'Commit when green?', why: 'TALOS never commits without your say.', options: [
    { label: 'Yes', description: 'one local commit' }, { label: 'No', description: 'you review first' },
  ] },
];

test('DOMANDE-TITOLO: `header` facoltativo, ≤ 12 caratteri, conservato; troppo lungo o non testo è rifiutato', () => {
  assert.equal(LIMITI_DOMANDA_UTENTE.titoloMax, 12);
  const [prima, , terza] = validaDomandeUtente(DOMANDE);
  assert.equal(prima.header, 'Fix');
  assert.equal(Object.hasOwn(terza, 'header'), false, 'assente resta assente: la UI lo ricava dall\'id');
  assert.throws(() => validaDomandeUtente([{ ...DOMANDE[0], header: 'Thirteen char' }]), /header supera il limite di 12/u);
  assert.throws(() => validaDomandeUtente([{ ...DOMANDE[0], header: 7 }]), /header deve essere testo/u);
  assert.throws(() => validaDomandeUtente([{ ...DOMANDE[0], header: '   ' }]), /header non può essere vuoto/u);
});

test('DOMANDE-ANTEPRIMA: `preview` per opzione, spazi in testa conservati, a-capo finale tolto, limiti di caratteri e righe', () => {
  const [prima] = validaDomandeUtente(DOMANDE);
  assert.equal(prima.options[0].preview, '-  await page.waitForTimeout(500)\n+  await waitForSession(page)');
  assert.equal(Object.hasOwn(prima.options[1], 'preview'), false);
  const conAnteprima = (preview) => [{ ...DOMANDE[0], options: [{ ...DOMANDE[0].options[0], preview }, DOMANDE[0].options[1]] }];
  assert.equal(validaDomandeUtente(conAnteprima('  indented\r\n  code'))[0].options[0].preview, '  indented\n  code');
  assert.throws(() => validaDomandeUtente(conAnteprima('\n\n')), /preview non può essere vuota/u);
  assert.throws(() => validaDomandeUtente(conAnteprima('x'.repeat(LIMITI_DOMANDA_UTENTE.anteprimaMax + 1))), /supera il limite di 2000 caratteri/u);
  assert.throws(() => validaDomandeUtente(conAnteprima(Array.from({ length: 21 }, (_, i) => `line ${i}`).join('\n'))), /supera il limite di 20 righe/u);
  assert.notEqual(fingerprintDomanda(DOMANDE), fingerprintDomanda(conAnteprima('+  other')), 'l\'anteprima è parte di ciò che la persona ha visto');
});

test('DOMANDE-PRIMA: domande e risposte senza i campi nuovi restano valide come prima', () => {
  const vecchie = [{ id: 'scelta', question: 'Quale strada?', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }] }];
  assert.deepEqual(validaDomandeUtente(vecchie), vecchie);
  assert.deepEqual(validaRispostaDomanda(vecchie, { status: 'answered', answers: { scelta: 'A' } }), { status: 'answered', answers: { scelta: 'A' } });
  assert.throws(() => validaRispostaDomanda(DOMANDE, { status: 'answered', answers: { fix: 'Yes' } }), /una risposta per ogni domanda non saltata/u);
});

test('DOMANDE-SALTATA-E-NOTA: una domanda saltata da sola e una nota per risposta, in campi separati', () => {
  const risposta = { status: 'answered', answers: { fix: 'Wait for the cookie', commit: 'No' }, skipped: ['verify'], notes: { fix: 'keep the retry as is' } };
  assert.deepEqual(validaRispostaDomanda(DOMANDE, risposta), risposta);
  assert.deepEqual(validaRispostaDomanda(DOMANDE, { ...risposta, notes: { verify: 'not now' } }).notes, { verify: 'not now' }, 'una nota anche su una domanda saltata');
  for (const [sbagliata, motivo] of [
    [{ ...risposta, skipped: ['verify', 'verify'] }, /duplicati/u],
    [{ ...risposta, skipped: ['nope'] }, /sconosciute/u],
    [{ ...risposta, skipped: ['verify', 'fix'] }, /risposta ed essere saltata/u],
    [{ status: 'answered', answers: {}, skipped: ['fix', 'verify', 'commit'] }, /almeno una risposta/u],
    [{ ...risposta, notes: { nope: 'x' } }, /notes contiene id di domande sconosciute/u],
    [{ ...risposta, notes: { fix: 'x'.repeat(LIMITI_DOMANDA_UTENTE.notaMax + 1) } }, /supera il limite di 1000/u],
    [{ ...risposta, notes: 'x' }, /notes deve essere un oggetto/u],
    [{ status: 'skipped', skipped: ['fix'] }, /status skipped non deve contenere skipped/u],
    [{ status: 'cancelled', notes: { fix: 'x' } }, /status cancelled non deve contenere notes/u],
  ]) assert.throws(() => validaRispostaDomanda(DOMANDE, sbagliata), motivo, JSON.stringify(sbagliata));
});

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'scegli' } };
    }, ...opzioni });
}
function giroFinto() {
  const giri = [];
  return { avviaSessioneFn(input) { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); }, giro: (i) => giri[i] };
}

test('DOMANDE-REGISTRO: il modello riceve saltate e note, la ricevuta le conserva, la stessa risposta ripetuta ha lo stesso esito', async () => {
  const giri = giroFinto();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero');
  const attesa = giri.giro(0).chiediDomandaFn(DOMANDE, { toolCallId: 'call_ask' });
  const richiesta = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionRequested');
  assert.equal(richiesta.questions[0].header, 'Fix');
  assert.equal(richiesta.questions[0].options[0].preview.startsWith('-  await'), true);
  const risposta = { requestId: richiesta.requestId, status: 'answered', answers: { fix: 'Shorten the retry', commit: 'Yes' }, skipped: ['verify'], notes: { fix: 'cap it at 300 ms' } };
  assert.deepEqual(await registro.rispondiDomanda(sessionId, richiesta.requestId, risposta), { ok: true });
  assert.deepEqual(await attesa, { status: 'answered', answers: { fix: 'Shorten the retry', commit: 'Yes' }, skipped: ['verify'], notes: { fix: 'cap it at 300 ms' } });
  const risolta = registro.esporta(sessionId).eventi.find((e) => e.type === 'UserQuestionResolved');
  assert.deepEqual(risolta.skipped, ['verify']);
  assert.deepEqual(risolta.notes, { fix: 'cap it at 300 ms' });
  assert.deepEqual(await registro.rispondiDomanda(sessionId, richiesta.requestId, risposta), { ok: true }, 'idempotente: stessa risposta, stesso esito');
  const altraNota = await registro.rispondiDomanda(sessionId, richiesta.requestId, { ...risposta, notes: { fix: 'something else' } });
  assert.equal(altraNota.code, 'QUESTION_NOT_PENDING', 'una nota diversa è una risposta diversa');
});

test('DOMANDE-SCHEMA: l\'attrezzo descrive `header` e `preview` al modello', () => {
  const ask = ATTREZZI_ESTESI_OPENAI.map((t) => t.function ?? t).find((f) => f.name === 'ask_user_question');
  const domanda = (ask.parameters ?? ask.input_schema).properties.questions.items;
  assert.equal(domanda.properties.header.type, 'string');
  assert.equal(domanda.properties.header.maxLength, 12);
  const opzione = domanda.properties.options.items;
  assert.equal(opzione.properties.preview.type, 'string');
  assert.equal(opzione.properties.preview.maxLength, LIMITI_DOMANDA_UTENTE.anteprimaMax);
  assert.deepEqual(opzione.required, ['label', 'description'], 'l\'anteprima resta facoltativa');
});

test('DOMANDE-SENZA-SCHERMO: la lista predefinita degli attrezzi estesi è esportata, così chi non ha schermo la passa senza ask_user_question', () => {
  assert.ok(Array.isArray(STRUMENTI_ESTESI_PREDEFINITI) && Object.isFrozen(STRUMENTI_ESTESI_PREDEFINITI));
  assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes('ask_user_question'));
  const offerti = [];
  const registro = createSessionRegistry({ avviaSessioneFn: (input) => { offerti.push(input.strumentiEstesi); return new Promise(() => {}); },
    strumentiEstesi: STRUMENTI_ESTESI_PREDEFINITI.filter((nome) => nome !== 'ask_user_question') });
  registro.avvia('task-vero');
  assert.equal(offerti[0].includes('ask_user_question'), false);
  assert.ok(offerti[0].includes('present_plan'));
});
