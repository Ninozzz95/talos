import assert from 'node:assert/strict';
import test from 'node:test';

import { getDiagnosticProblem, logDiagnosticProblem, toPublicProblem } from '../src/public-problem.mjs';
import { AREE } from '../frontend/src/i18n/testi/index.js';

/*
 * 03/10/2026 (owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — il server dice le copie pubbliche
 * in INGLESE; l'italiano sta nel dizionario dell'interfaccia (`errori.<CODICE>.title|explanation|action`) e la scelta la fa il
 * CODICE. Ogni prova qui controlla lo STESSO significato di prima in entrambe le lingue: l'inglese del server e la voce italiana
 * del dizionario (le espressioni sull'italiano sono quelle di prima).
 */
const italiano = (codice) => ({
  title: AREE.errori.it[`${codice}.title`],
  explanation: AREE.errori.it[`${codice}.explanation`],
  action: AREE.errori.it[`${codice}.action`],
});

test('CTX-HEADER-PUBLIC-COPY — creazione fallita spiega che la sessione non è partita senza segreti', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_HEADER_FAILED' });
  const problem = toPublicProblem(error, { requestId: 'header-1', operation: 'new-session' });
  assert.match(problem.title, /session/i);
  assert.match(problem.explanation, /not (?:started|created)|was not .*created/i);
  assert.match(problem.action, /space|permission|Doctor|try again/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
  const it = italiano('SESSION_STORE_HEADER_FAILED');
  assert.match(it.title, /sessione|salvataggio/i);
  assert.match(it.explanation, /non.*(avviat|creat|salvat)|impossibile.*salvar/i);
  assert.match(it.action, /spazio|permiss|Doctor|riprova/i);
});

test('CTX-DELETE-PROBLEM-COPY — delete fallita non promette successo e non espone il path', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_DELETE_FAILED' });
  const problem = toPublicProblem(error, { requestId: 'delete-1', operation: 'delete-session' });
  assert.match(problem.title, /deletion|delet/i);
  assert.match(problem.explanation, /not deleted|remains/i);
  assert.match(problem.action, /try again|check/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
  const it = italiano('SESSION_STORE_DELETE_FAILED');
  assert.match(it.title, /elimina|rimuov/i);
  assert.match(it.explanation, /non.*eliminat|rimast/i);
  assert.match(it.action, /riprova|controlla/i);
});

test('toPublicProblem translates internal failure into natural language without paths or secrets', () => {
  const problem = toPublicProblem(Object.assign(new Error('C:\\secret\\stack token sk-live-123'), { code: 'CONFIG_INVALID' }), { requestId: 'req-1', operation: 'new-session' });
  assert.equal(problem.title, 'Configuration not ready');
  assert.match(problem.explanation, /configuration/i);
  assert.match(problem.action, /settings|Doctor/i);
  assert.match(problem.doctorReference, /^doctor-[a-f0-9]{12}$/);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\secret|sk-live|stack|TALOS_HARNESS_UI_PROJECT_DIRS/i);
  const it = italiano('CONFIG_INVALID');
  assert.equal(it.title, 'Configurazione non pronta');
  assert.match(it.explanation, /configurazione/i);
  assert.match(it.action, /impostazioni|Doctor/i);
});

test('logDiagnosticProblem stores only safe diagnostic detail and returns a copyable reference', () => {
  const logs = [];
  const reference = logDiagnosticProblem(Object.assign(new Error('secret sk-live-123'), { code: 'RUNTIME_NOT_AVAILABLE' }), { requestId: 'req-2', operation: 'runtime', logger: { warn: (entry) => logs.push(entry) } });
  assert.match(reference, /^doctor-/);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(logs[0], /secret|sk-live/i);
  const diagnostic = getDiagnosticProblem(reference);
  assert.equal(diagnostic.code, 'RUNTIME_NOT_AVAILABLE');
  assert.doesNotMatch(JSON.stringify(diagnostic), /secret|sk-live|[A-Za-z]:\\/i);
});

test('CTX-LEGACY-COMPACT-WRITE-FAILED-PUBLIC — errore di salvataggio spiega retry senza path o secret', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_WRITE_FAILED' });
  const problem = toPublicProblem(error, { requestId: 'compact-1', operation: 'compact-session' });
  assert.match(problem.title, /save|history/i);
  assert.match(problem.explanation, /summary|history|save/i);
  assert.match(problem.action, /try .*again/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
  const it = italiano('SESSION_STORE_WRITE_FAILED');
  assert.match(it.title, /salvataggio|archivio|cronologia/i);
  assert.match(it.explanation, /riassunto|cronologia|salvataggio/i);
  assert.match(it.action, /riprova/i);
});

test('CTX-STORE-AMBIGUOUS-PUBLIC — stato incerto chiede verifica, non promette rollback o retry cieco', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_AMBIGUOUS' });
  const problem = toPublicProblem(error, { requestId: 'compact-ambiguous', operation: 'compact-session' });
  assert.match(problem.title, /check|uncertain|needs/i);
  assert.match(problem.explanation, /uncertain/i);
  assert.match(problem.action, /check|Doctor|support/i);
  assert.doesNotMatch(problem.action, /^Try/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
  const it = italiano('SESSION_STORE_AMBIGUOUS');
  assert.match(it.title, /verifica|incerto|archivio/i);
  assert.match(it.explanation, /incerto|verificar/i);
  assert.match(it.action, /verifica|Doctor|supporto/i);
  assert.doesNotMatch(it.action, /^Riprova/i);
});
