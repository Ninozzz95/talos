import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {SALTA_SENZA_WSL} from './aiuto/wsl-reale.mjs';

for (const mode of ['capture', 'legacy', 'wsl']) {
  test(`OUTPUT17-HEAP-${mode}: 64MiB does not remain in the zero-test classifier`, {skip: mode === 'wsl' ? SALTA_SENZA_WSL : false}, t => {
    const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(new URL('./fixtures/prova-output-memory-driver.mjs', import.meta.url)), mode],
      {windowsHide: true, encoding: 'utf8', timeout: 30_000, maxBuffer: 1_000_000});
    assert.equal(result.status, 0, result.stderr);
    const measured = JSON.parse(result.stdout.trim().split('\n').at(-1));
    t.diagnostic(JSON.stringify({...measured, events: undefined}));
    assert.equal(measured.executions, 'x', 'command executes exactly once');
    assert.equal(measured.calls, 2, 'fixture provider only');
    assert.equal(measured.events.length, 1);
    assert.equal(measured.events[0].isError, true);
    /* F009 (01/10/2026): la prova in Linux dichiara con che utente ha girato; la via di Windows resta senza intestazione. */
    assert.match(measured.events[0].content, mode === 'wsl' ? /^exit 127 \[sandbox: wsl2 \(Linux in WSL [^\]]+\)\]\nexit 0 but NO tests ran \(# tests 0\)/ : /^exit 127\nexit 0 but NO tests ran \(# tests 0\)/);
    assert.ok(measured.samples >= 3, 'real samples during output, not just after close');
    if (mode !== 'legacy') {
      assert.equal(measured.deliveredBytes, 64 * 1024 * 1024 + 11);
      assert.equal(measured.exitCode, 127);
      assert.equal(measured.actualExitCode, 0);
    }
    assert.ok(measured.retainedGrowth < 16 * 1024 * 1024,
      `retained heap grew ${measured.retainedGrowth} bytes for 64MiB output`);
  });
}
for (const mode of ['capture-stop', 'legacy-stop']) {
  test(`OUTPUT17-STOP-${mode}: a zero-test declaration cannot override cancellation`, () => {
    const result = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(new URL('./fixtures/prova-output-memory-driver.mjs', import.meta.url)), mode],
      {windowsHide: true, encoding: 'utf8', timeout: 30_000, maxBuffer: 1_000_000});
    assert.equal(result.status, 0, result.stderr);
    const measured = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(measured.executions, 'x');
    assert.equal(measured.calls, 1, 'Stop never starts a second provider call');
    assert.equal(measured.events.length, 1);
    assert.equal(measured.events[0].isError, true);
    assert.match(measured.events[0].content, /^exit 130\n/);
    assert.doesNotMatch(measured.events[0].content, /NO tests ran/);
  });
}
