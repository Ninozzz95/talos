import assert from 'node:assert/strict';
import test from 'node:test';

import { getDiagnosticProblem, logDiagnosticProblem, toPublicProblem } from '../src/public-problem.mjs';

test('CTX-HEADER-PUBLIC-COPY — creazione fallita spiega che la sessione non è partita senza segreti', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_HEADER_FAILED' });
  const problem = toPublicProblem(error, { requestId: 'header-1', operation: 'new-session' });
  assert.match(problem.title, /sessione|salvataggio/i);
  assert.match(problem.explanation, /non.*(avviat|creat|salvat)|impossibile.*salvar/i);
  assert.match(problem.action, /spazio|permiss|Doctor|riprova/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
});

test('CTX-DELETE-PROBLEM-COPY — delete fallita non promette successo e non espone il path', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_DELETE_FAILED' });
  const problem = toPublicProblem(error, { requestId: 'delete-1', operation: 'delete-session' });
  assert.match(problem.title, /elimina|rimuov/i);
  assert.match(problem.explanation, /non.*eliminat|rimast/i);
  assert.match(problem.action, /riprova|controlla/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
});

test('toPublicProblem translates internal failure into natural language without paths or secrets', () => {
  const problem = toPublicProblem(Object.assign(new Error('C:\\secret\\stack token sk-live-123'), { code: 'CONFIG_INVALID' }), { requestId: 'req-1', operation: 'new-session' });
  assert.equal(problem.title, 'Configurazione non pronta');
  assert.match(problem.explanation, /configurazione/i);
  assert.match(problem.action, /impostazioni|Doctor/i);
  assert.match(problem.doctorReference, /^doctor-[a-f0-9]{12}$/);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\secret|sk-live|stack|TALOS_HARNESS_UI_PROJECT_DIRS/i);
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
  assert.match(problem.title, /salvataggio|archivio|cronologia/i);
  assert.match(problem.explanation, /riassunto|cronologia|salvataggio/i);
  assert.match(problem.action, /riprova/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
});

test('CTX-STORE-AMBIGUOUS-PUBLIC — stato incerto chiede verifica, non promette rollback o retry cieco', () => {
  const error = Object.assign(new Error('C:\\private\\session.jsonl sk-live-123'), { code: 'SESSION_STORE_AMBIGUOUS' });
  const problem = toPublicProblem(error, { requestId: 'compact-ambiguous', operation: 'compact-session' });
  assert.match(problem.title, /verifica|incerto|archivio/i);
  assert.match(problem.explanation, /incerto|verificar/i);
  assert.match(problem.action, /verifica|Doctor|supporto/i);
  assert.doesNotMatch(problem.action, /^Riprova/i);
  assert.doesNotMatch(JSON.stringify(problem), /C:\\private|sk-live|session\.jsonl/i);
});
