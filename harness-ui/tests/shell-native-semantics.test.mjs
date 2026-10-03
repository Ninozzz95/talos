import test from 'node:test';
import { togliConfiniDati, neutralizzaDati } from '../src/kernel/confine-dati.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {talosLavora, ambienteSenzaCredenziali} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

const windows = {skip: process.platform !== 'win32'};
const encoded = script => `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(script, 'utf16le').toString('base64')}`;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-native-shell-'));
  t.after(() => {
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rimuoviCartellaDiProva(root);
  });
  return root;
}
function native(command, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, {cwd, shell: true, windowsHide: true, env: ambienteSenzaCredenziali()});
    let output = '';
    p.stdout.on('data', b => {output += b;});
    p.stderr.on('data', b => {output += b;});
    p.on('error', reject);
    p.on('close', code => resolve({code, output: output.trim()}));
  });
}
async function agent(command, cwd, dove = 'windows') {
  const requests = [], events = [];
  await talosLavora({cartella: cwd, task: {consegna: 'Verifica il comando.'}, modello: 'fixture/native-shell', chiave: 'fixture',
    messaggiIniziali: [{role: 'system', content: 'Verifica.'}, {role: 'user', content: 'Verifica il comando.'}],
    livelloAccesso: 'completo', _giriMassimiInterno: 3, ambienteComandiFn: () => ({dove, revisione: 0}),
    fetchDiRete: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      const message = requests.length === 1
        ? {role: 'assistant', content: '', tool_calls: [{id: 'native-shell-09', type: 'function', function: {name: 'shell', arguments: JSON.stringify({comando: command})}}]}
        : {role: 'assistant', content: 'Verificato.'};
      return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
    }, onGiro: event => events.push(event),
  });
  return {requests, events, output: events.find(e => e.tipo === 'tool-esito')};
}
async function compare(t, command, expectedCode, root = fixture(t)) {
  const direct = await native(command, root);
  assert.equal(direct.code, expectedCode, direct.output);
  const talos = await agent(command, root);
  assert.equal(talos.output.isError, expectedCode !== 0, talos.output.content);
  assert.match(talos.output.content, new RegExp(`^exit ${expectedCode}(?=\\s|$)`));
  // F-027: il modello vede l'uscita dentro il confine, e neutralizzata come un'uscita di comando (CRLF → LF, niente controlli)
  if (direct.output) assert.ok(togliConfiniDati(talos.output.content).includes(neutralizzaDati(direct.output, {comandi: true}).testo), talos.output.content);
  t.diagnostic(JSON.stringify({command, native: direct, talos: talos.output.content}));
  return talos;
}

test('SHELL09-EXIT42: Windows preserves an explicit nonzero process status', windows, async t => {
  await compare(t, 'cmd /d /c exit 42', 42);
});
test('SHELL09-AND: a failed first command prevents the second command', windows, async t => {
  const r = await compare(t, 'cmd /d /c exit 7 && echo UNEXPECTED', 7);
  assert.doesNotMatch(r.output.content, /UNEXPECTED/);
});
test('SHELL09-FORCEDZERO: 500 real failed file operations remain visible despite explicit exit zero', windows, async t => {
  const command = encoded("$ProgressPreference = 'SilentlyContinue'; $failed = 0; for ($i = 0; $i -lt 500; $i++) { try { Get-Item -LiteralPath ('missing-' + $i) -ErrorAction Stop | Out-Null } catch { $failed++ } }; Write-Output ('falliti=' + $failed); exit 0");
  const r = await compare(t, command, 0);
  assert.match(r.output.content, /falliti=500/);
});
test('SHELL09-TIMEOUT: the exact ZIP command fails with piped input outside and inside TALOS', windows, async t => {
  const command='timeout /t 3 /nobreak >nul',root=fixture(t),direct=await native(command,root);
  assert.notEqual(direct.code,0,'the resolved utility must fail for this noninteractive invocation');
  const r = await compare(t,command,direct.code,root);
  assert.ok(r.output.content.trim().length > `exit ${direct.code}`.length, 'native diagnostic stays visible');
});
test('SHELL09-TIMEOUT-WINDOWS: the System32 utility retains exit1 and diagnostic even when GNU timeout precedes it in PATH', windows, async t => {
  const command=`"${join(process.env.SystemRoot,'System32','timeout.exe')}" /t 3 /nobreak >nul`;
  const r=await compare(t,command,1);
  assert.ok(r.output.content.trim().length > 'exit 1'.length,'Windows redirected-input diagnostic stays visible');
});
const pipeline = "$values = 'first', 'second'; $values | Select-Object -First 1";
test('SHELL09-ENCODED: supported UTF-16LE encoding preserves PowerShell variables and pipelines', windows, async t => {
  const r = await compare(t, encoded(pipeline), 0);
  assert.match(r.output.content, /first/);
  assert.doesNotMatch(r.output.content, /second/);
});
test('SHELL09-FILE: script paths preserve the native PowerShell execution policy', windows, async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'prova à.ps1'), pipeline);
  const command = 'powershell.exe -NoProfile -NonInteractive -File "prova à.ps1"';
  const direct = await native(command, root);
  if (direct.code !== 0) {
    assert.equal(direct.code, 1);
    assert.match(direct.output, /UnauthorizedAccess/);
  }
  const r = await compare(t, command, direct.code, root);
  assert.match(r.output.content, direct.code === 0 ? /first/ : /UnauthorizedAccess/);
});
test('SHELL09-NESTED: malformed representative nested quoting fails equally in native cmd', windows, async t => {
  // The ZIP does not contain its complete command; this is a representative parsing failure.
  const command = 'cmd /d /c "powershell.exe -NoProfile -NonInteractive -Command "$values = 1,2,3; $values | Select-Object -First 1""';
  const root = fixture(t), direct = await native(command, root);
  assert.notEqual(direct.code, 0, direct.output);
  assert.match(direct.output, /Select-Object/);
  await compare(t, command, direct.code, root);
});
test('SHELL09-DESCRIPTION: model receives noninteractive Windows constraints before a real command', windows, async t => {
  const r = await compare(t, encoded(pipeline), 0);
  for (const name of ['shell', 'prova']) {
    const description = r.requests[0].tools.find(t => t.function.name === name).function.description;
    assert.match(description, /non.interactive/i);
    assert.match(description, /timeout \/t/);
    assert.match(description, /-EncodedCommand.*UTF-16LE/);
    assert.match(description, /outer.*exit|exit.*outer/i);
  }
});
test('SHELL09-AUTO-DESCRIPTION: automatic selection describes Windows constraints conditionally', windows, async t => {
  const r = await agent('echo SHELL09', fixture(t), null);
  assert.equal(r.output.isError, false);
  const description = r.requests[0].tools.find(t => t.function.name === 'shell').function.description;
  assert.match(description, /Automatic/);
  assert.match(description, /Windows.*non.interactive/i);
});
