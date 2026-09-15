import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaAvvioFiglio } from '../desktop/runtime.mjs';
import {
  ATTREZZI_OPENAI,
  DESKTOP_BLACKBOX_HOTFIX_VERSION,
  NO_TEST_SUITE_CODE,
  STALL_DIAGNOSTIC_EVENT,
  comandoProvaDesktop,
  correggiEsitoToolDesktop,
  creaTelemetriaStallo,
  talosLavora,
} from '../src/kernel/talosHarness.desktop-hotfix.mjs';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-blackbox-hotfix-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function okJson(message, usage = null) {
  return new Response(JSON.stringify({ choices: [{ message }], ...(usage ? { usage } : {}) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('desktop hotfix preserves the kernel contract and declares its version', () => {
  assert.ok(Array.isArray(ATTREZZI_OPENAI));
  assert.equal(DESKTOP_BLACKBOX_HOTFIX_VERSION, '2026-09-15');
});

test('T-01/T-02: an incomplete search never becomes a hard absence claim', () => {
  const result = correggiEsitoToolDesktop({
    name: 'cerca', args: { testo: 'needle' }, cartella: '/tmp',
    content: 'no file matches. Scanned 20000 files (5000 read for content). Try a shorter or different "testo".\n⚠ incomplete scan: I stopped after collecting 20000 paths — the tree has more. Search inside a subfolder.',
  });
  assert.match(result, /^SEARCH INCOMPLETE:/);
  assert.match(result, /Absence is NOT established/i);
  assert.doesNotMatch(result, /^no file matches\./i);
});

test('T-05/T-06: shell output declares merged streams and distrusts PowerShell diagnostics with exit 0', () => {
  const result = correggiEsitoToolDesktop({
    name: 'shell', args: { comando: 'Get-Thing' }, cartella: '/tmp',
    content: 'exit 0 [sandbox: none]\nCategoryInfo : ObjectNotFound: (Get-Thing:String) [], CommandNotFoundException\nFullyQualifiedErrorId : CommandNotFoundException',
  });
  assert.match(result, /SHELL_DIAGNOSTIC_WITH_ZERO_EXIT/);
  assert.match(result, /stdout and stderr combined in arrival order/);
  assert.match(result, /NOT VERIFIED/);
});

test('T-08: elenca distinguishes a file from a missing path', (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'one.txt'), 'x');
  const generic = '"one.txt" is not a readable folder of this workspace. Check the project map you received at the start, or use `cerca` to find where it is. Note: `elenca` opens FOLDERS — to read a file use `leggi`.';
  const file = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: 'one.txt' }, content: generic, cartella: dir });
  assert.match(file, /is a FILE, not a folder/);
  assert.match(file, /`leggi`/);

  const missing = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: 'missing' }, content: generic.replaceAll('one.txt', 'missing'), cartella: dir });
  assert.match(missing, /does not exist in this workspace/);
});

test('T-07: default npm test is replaced by an explicit no-suite diagnostic when scripts.test is absent', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {} }));
  const command = await comandoProvaDesktop({ cartella: dir, comandoProva: 'npm test' });
  assert.match(command, new RegExp(NO_TEST_SUITE_CODE));
  assert.match(command, /process\.exit\(2\)/);
});

test('T-07 contrary case: a real scripts.test keeps npm test unchanged', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }));
  assert.equal(await comandoProvaDesktop({ cartella: dir, comandoProva: 'npm test' }), 'npm test');
});

test('T-04: stall telemetry records the stage instead of a generic hang', () => {
  let now = 0;
  let pending = null;
  const logs = [];
  const timer = creaTelemetriaStallo({
    timeoutMs: 50,
    now: () => now,
    log: (record) => logs.push(record),
    setTimer: (fn) => { pending = fn; return { unref() {} }; },
    clearTimer: () => { pending = null; },
  });
  timer.mark('provider-response');
  now = 75;
  pending();
  timer.close();
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], { event: STALL_DIAGNOSTIC_EVENT, stage: 'provider-response', stalledMs: 75 });
});

test('T-03: tool results longer than 8k reach the next model turn intact when Context Engine is off', async (t) => {
  const dir = tempDir(t);
  const payload = `${'A'.repeat(9_500)}<END>`;
  writeFileSync(join(dir, 'large.txt'), payload);
  const requests = [];
  let call = 0;
  const fetchDiRete = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    call += 1;
    if (call === 1) {
      return okJson({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'read-large', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'large.txt' }) } }],
      });
    }
    return okJson({ role: 'assistant', content: 'done' });
  };

  await talosLavora({
    cartella: dir,
    task: { consegna: 'Read large.txt.' },
    modello: 'test/model', chiave: 'test', fetchDiRete,
    _giriMassimiInterno: 3,
  });

  assert.equal(requests.length, 2);
  const tool = requests[1].messages.find((message) => message.role === 'tool' && message.tool_call_id === 'read-large');
  assert.ok(tool, 'the second request must contain the tool result');
  assert.equal(tool.content, payload);
  assert.ok(tool.content.length > 8_000);
});

test('T-09: the reflection checkpoint is a user message, never text appended to a tool result', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'small.txt'), 'SMALL-CONTENT');
  const requests = [];
  let call = 0;
  const fetchDiRete = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    call += 1;
    if (call <= 7) {
      return okJson({
        role: 'assistant', content: null,
        tool_calls: [{ id: `read-${call}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'small.txt' }) } }],
      });
    }
    return okJson({ role: 'assistant', content: 'done' });
  };

  await talosLavora({
    cartella: dir,
    task: { consegna: 'Read the file repeatedly for the checkpoint test.' },
    modello: 'test/model', chiave: 'test', fetchDiRete,
    _giriMassimiInterno: 10,
  });

  assert.equal(requests.length, 8);
  const checkpointRequest = requests[7];
  const checkpoint = checkpointRequest.messages.find((message) => message.role === 'user' && /checkpoint di riflessione/i.test(String(message.content)));
  assert.ok(checkpoint, 'the checkpoint must be a separate user message');
  const previousTool = [...checkpointRequest.messages].reverse().find((message) => message.role === 'tool');
  assert.equal(previousTool.content, 'SMALL-CONTENT', 'the tool result must remain byte-identical');
});


test('desktop launchers select the hotfix adapter by default without overriding an explicit runtime', () => {
  const percorsi = { root: '/opt/talos/harness-ui', server: '/opt/talos/harness-ui/server.mjs', bootstrap: '/opt/talos/desktop/child-bootstrap.mjs' };
  const common = {
    execPath: '/opt/talos/electron', percorsi, port: 5511, token: 'a'.repeat(64),
    reportFile: '/tmp/report.json', dataDir: '/tmp/talos-data',
  };
  const automatic = creaAvvioFiglio({ ...common, env: {} });
  assert.equal(
    automatic.options.env.TALOS_OWNER_RUNTIME_MODULE,
    '/opt/talos/harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs',
  );
  const explicit = creaAvvioFiglio({ ...common, env: { TALOS_OWNER_RUNTIME_MODULE: '/custom/runtime.mjs' } });
  assert.equal(explicit.options.env.TALOS_OWNER_RUNTIME_MODULE, '/custom/runtime.mjs');
});


test('desktop browser launchers also pin the hotfix adapter while preserving explicit overrides', () => {
  for (const relative of ['../scripts/avvia-talos.mjs', '../scripts/aggiorna-4174.ps1']) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /talosHarness\.desktop-hotfix\.mjs/);
    assert.match(source, /TALOS_OWNER_RUNTIME_MODULE/);
  }
});
