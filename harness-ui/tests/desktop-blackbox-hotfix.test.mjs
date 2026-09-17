import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { creaAvvioFiglio } from '../desktop/runtime.mjs';
import { fileProduzione } from '../desktop/scripts/prepara-pacchetto.mjs';
import * as canonical from '../src/kernel/talosHarness.mjs';
import * as hotfix from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import {
  DESKTOP_BLACKBOX_HOTFIX_VERSION,
  NO_TEST_SUITE_CODE,
  STALL_DIAGNOSTIC_EVENT,
  comandoProvaDesktop,
  correggiEsitoToolDesktop,
  correggiMessaggiDesktop,
  creaTelemetriaStallo,
  talosLavora,
} from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-blackbox-hotfix-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}

function okJson(message, usage = null) {
  return new Response(JSON.stringify({ choices: [{ message }], ...(usage ? { usage } : {}) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('desktop hotfix preserves every canonical export except the intentional talosLavora override', () => {
  assert.notStrictEqual(hotfix.talosLavora, canonical.talosLavora);
  for (const [name, value] of Object.entries(canonical)) {
    if (name === 'talosLavora') continue;
    assert.strictEqual(hotfix[name], value, `canonical export ${name} must remain identical`);
  }
  assert.equal(DESKTOP_BLACKBOX_HOTFIX_VERSION, '2026-09-15');
});

test('desktop package filter includes the hotfix adapter', () => {
  assert.equal(fileProduzione('src/kernel/talosHarness.desktop-hotfix.mjs'), true);
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

test('tool-call ids are resolved in conversation order, even if a provider reuses an id later', (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'one.txt'), 'x');
  const generic = '"one.txt" is not a readable folder of this workspace. Check the project map you received at the start, or use `cerca` to find where it is. Note: `elenca` opens FOLDERS — to read a file use `leggi`.';
  const fixed = correggiMessaggiDesktop([
    { role: 'assistant', tool_calls: [{ id: 'reused', type: 'function', function: { name: 'shell', arguments: '{"comando":"echo ok"}' } }] },
    { role: 'tool', tool_call_id: 'reused', content: 'exit 0 [sandbox: none]\nok' },
    { role: 'assistant', tool_calls: [{ id: 'reused', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"one.txt"}' } }] },
    { role: 'tool', tool_call_id: 'reused', content: generic },
  ], { cartella: dir });
  assert.match(fixed[1].content, /stdout and stderr combined/);
  assert.match(fixed[3].content, /is a FILE, not a folder/);
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

test('T-05 contrary case: a refused shell call is not labelled as combined stdout/stderr', () => {
  const refused = 'REFUSED. Shell is not allowed by the current permission.';
  assert.equal(correggiEsitoToolDesktop({ name: 'shell', args: {}, cartella: '/tmp', content: refused }), refused);
});

test('T-08: elenca distinguishes a file from a missing path and fails closed on absolute paths', (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'one.txt'), 'x');
  const generic = '"one.txt" is not a readable folder of this workspace. Check the project map you received at the start, or use `cerca` to find where it is. Note: `elenca` opens FOLDERS — to read a file use `leggi`.';
  const file = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: 'one.txt' }, content: generic, cartella: dir });
  assert.match(file, /is a FILE, not a folder/);
  assert.match(file, /`leggi`/);

  const missing = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: 'missing' }, content: generic.replaceAll('one.txt', 'missing'), cartella: dir });
  assert.match(missing, /does not exist in this workspace/);

  const absolutePath = join(dir, 'one.txt');
  const absolute = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: absolutePath }, content: generic, cartella: dir });
  assert.match(absolute, /^REFUSED\./);
  assert.doesNotMatch(absolute, /is a FILE/);
});

test('T-07: default npm test is replaced by an explicit no-suite diagnostic when scripts.test is absent', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {} }));
  const command = await comandoProvaDesktop({ cartella: dir, comandoProva: 'npm test' });
  assert.match(command, new RegExp(NO_TEST_SUITE_CODE));
  assert.match(command, /process\.exit\(2\)/);
});

test('T-07 contrary cases: a real test or malformed package.json keeps npm test and its truthful diagnostic', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }));
  assert.equal(await comandoProvaDesktop({ cartella: dir, comandoProva: 'npm test' }), 'npm test');
  writeFileSync(join(dir, 'package.json'), '{ broken json');
  assert.equal(await comandoProvaDesktop({ cartella: dir, comandoProva: 'npm test' }), 'npm test');
  assert.equal(await comandoProvaDesktop({ cartella: dir, comandoProva: 'npm test -- --runInBand' }), 'npm test -- --runInBand');
  assert.equal(await comandoProvaDesktop({ cartella: join(dir, 'gone'), comandoProva: 'npm test' }), 'npm test');
});

test('T-04: stall telemetry is stage-specific and emits once per uninterrupted inactivity window', () => {
  let now = 0;
  const pending = [];
  const logs = [];
  const timer = creaTelemetriaStallo({
    timeoutMs: 50,
    now: () => now,
    log: (record) => logs.push(record),
    setTimer: (fn) => { pending.push(fn); return { unref() {} }; },
    clearTimer: () => {},
  });
  timer.mark('provider-response');
  const armedBeforeFirstFire = pending.length;
  now = 75;
  pending.at(-1)();
  assert.equal(pending.length, armedBeforeFirstFire, 'a hard hang must not re-arm itself and flood logs');
  assert.deepEqual(logs[0], { event: STALL_DIAGNOSTIC_EVENT, stage: 'provider-response', stalledMs: 75 });

  timer.mark('tool:shell');
  assert.equal(pending.length, armedBeforeFirstFire + 1, 'new activity arms a new inactivity window');
  now = 140;
  pending.at(-1)();
  timer.close();
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[1], { event: STALL_DIAGNOSTIC_EVENT, stage: 'tool:shell', stalledMs: 65 });

  let scheduled = false;
  const disabled = creaTelemetriaStallo({ timeoutMs: 0, setTimer: () => { scheduled = true; } });
  disabled.close();
  assert.equal(scheduled, false, 'timeout 0 explicitly disables diagnostic scheduling');
});

test('context hook sees corrected tool semantics before it can project or compact them', async (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, 'one.txt'), 'x');
  const seen = [];
  let call = 0;
  const fetchDiRete = async () => {
    call += 1;
    if (call === 1) {
      return okJson({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'list-file', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"one.txt"}' } }],
      });
    }
    return okJson({ role: 'assistant', content: 'done' });
  };
  const contextHooks = {
    async prepare(payload) {
      seen.push(payload.messages);
      return { messages: payload.messages };
    },
  };

  await talosLavora({
    cartella: dir,
    task: { consegna: 'Inspect one.txt.' },
    modello: 'test/model', chiave: 'test', fetchDiRete, contextHooks,
    _giriMassimiInterno: 3,
  });

  const second = seen[1];
  const tool = second.find((message) => message.role === 'tool' && message.tool_call_id === 'list-file');
  assert.ok(tool);
  assert.match(tool.content, /is a FILE, not a folder/);
});

test('configured context hooks without prepare fail closed before provider inference', async (t) => {
  const dir = tempDir(t);
  let networkCalls = 0;
  await assert.rejects(
    () => talosLavora({
      cartella: dir,
      task: { consegna: 'Do nothing.' },
      modello: 'test/model', chiave: 'test',
      fetchDiRete: async () => { networkCalls += 1; return okJson({ role: 'assistant', content: 'done' }); },
      contextHooks: { capture() {} },
      _giriMassimiInterno: 1,
    }),
    /contextHooks\.prepare/,
  );
  assert.equal(networkCalls, 0);
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
  const root = resolve('fixture-harness-ui');
  const percorsi = {
    root,
    server: join(root, 'server.mjs'),
    bootstrap: resolve('fixture-desktop', 'child-bootstrap.mjs'),
  };
  const common = {
    execPath: resolve('fixture-electron.exe'), percorsi, port: 5511, token: 'a'.repeat(64),
    reportFile: resolve('fixture-report.json'), dataDir: resolve('fixture-data'),
  };
  const automatic = creaAvvioFiglio({ ...common, env: {} });
  assert.equal(
    automatic.options.env.TALOS_OWNER_RUNTIME_MODULE,
    join(root, 'src', 'kernel', 'talosHarness.desktop-hotfix.mjs'),
  );
  const explicitPath = resolve('custom-runtime.mjs');
  const explicit = creaAvvioFiglio({ ...common, env: { TALOS_OWNER_RUNTIME_MODULE: explicitPath } });
  assert.equal(explicit.options.env.TALOS_OWNER_RUNTIME_MODULE, explicitPath);
});

test('desktop browser launchers also pin the hotfix adapter while preserving explicit overrides', () => {
  for (const relative of ['../scripts/avvia-talos.mjs', '../scripts/aggiorna-4174.ps1']) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.match(source, /talosHarness\.desktop-hotfix\.mjs/);
    assert.match(source, /TALOS_OWNER_RUNTIME_MODULE/);
  }
});
