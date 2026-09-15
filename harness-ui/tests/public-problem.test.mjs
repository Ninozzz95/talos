import assert from 'node:assert/strict';
import test from 'node:test';

import { getDiagnosticProblem, logDiagnosticProblem, toPublicProblem } from '../src/public-problem.mjs';

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
