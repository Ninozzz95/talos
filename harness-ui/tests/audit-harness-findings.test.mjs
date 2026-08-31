import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFindingLedger,
  classifyFinding,
} from '../scripts/audit-harness-findings.mjs';

test('RegExp.exec non è un avvio di processo', () => {
  const result = classifyFinding({
    rule: 'shell-execution',
    file: 'harness-ui/src/http-app.mjs',
    line: 20,
    excerpt: 'const match = /^x$/.exec(value);',
  });

  assert.equal(result.classification, 'FALSE-POSITIVE');
  assert.match(result.reason, /RegExp|metodo/i);
});

test('un import verso un checkout esterno resta un finding critico', () => {
  const result = classifyFinding({
    rule: 'cross-repository-import',
    file: 'harness-ui/src/workspace-tree.mjs',
    line: 24,
    excerpt: "from '../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs';",
  });

  assert.equal(result.classification, 'VALIDATED');
  assert.equal(result.severity, 'critical');
  assert.equal(result.phase, 'P0.1');
});

test('un marker in documentazione non viene conteggiato come simulazione runtime', () => {
  const result = classifyFinding({
    rule: 'simulation-marker',
    file: '.claude/QA-VISIVA-HARNESS-2026-08-30.md',
    line: 12,
    excerpt: 'La UI demo deve essere dichiarata come tale.',
  });

  assert.equal(result.classification, 'ACCEPTED-RISK');
  assert.equal(result.severity, 'none');
});

test('il ledger mantiene una riga per ogni finding e conteggi per classificazione', () => {
  const ledger = buildFindingLedger([
    {
      rule: 'optimistic-running-state',
      file: 'harness-ui/public/app.js',
      line: 77,
      excerpt: 'running: true',
    },
    {
      rule: 'shell-execution',
      file: 'harness-ui/src/http-app.mjs',
      line: 20,
      excerpt: 'const match = /^x$/.exec(value);',
    },
  ]);

  assert.equal(ledger.total, 2);
  assert.equal(ledger.validated, 1);
  assert.equal(ledger.falsePositives, 1);
  assert.deepEqual(ledger.findings.map((item) => item.phase), ['P0.2', null]);
});
