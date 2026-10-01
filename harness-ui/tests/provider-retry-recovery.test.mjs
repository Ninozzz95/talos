import assert from 'node:assert/strict';
import test from 'node:test';
import { fork } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const partial = 'La nota è stata ricevuta; la verifica resta incompleta.';
const frame = content => `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', content } }] })}\n\n`;
const end = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

test('RETRY08-LEGACY: current preamble is declared, persisted and not rebuilt twice', { timeout: 30_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'talos-retry08-'));
  const workspace = join(root, 'workspace'), sessions = join(root, 'sessions');
  mkdirSync(workspace); mkdirSync(sessions);
  writeFileSync(join(workspace, 'nota.txt'), 'current-workspace');
  writeFileSync(join(workspace, 'AGENTS.md'), '# Regole attuali\nConserva il marcatore RETRY08-PROGETTO-ATTUALE.\n');
  const sessionId = 'retry08-legacy', original = 'Controlla la nota senza modificare file.';
  const records = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: 'retry08', cartella: workspace,
      task: { id: 'retry08', consegna: original }, modello: 'test/recovery-fixture', provider: 'cloud', avviataAlle: new Date().toISOString() },
    { type: 'RunStarted', runId: 'legacy-run', threadId: sessionId, input: { consegna: original }, _sequenza: 1 },
    { type: 'TextMessageStart', messageId: 'legacy-partial', role: 'assistant', _sequenza: 2 },
    { type: 'TextMessageContent', messageId: 'legacy-partial', delta: partial, _sequenza: 3 },
  ];
  const journal = join(sessions, `${sessionId}.jsonl`);
  const originalBytes = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  writeFileSync(journal, originalBytes);
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    requests.push(JSON.parse(Buffer.concat(chunks)));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(frame('Ripresa riuscita.') + end);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let first, second;
  try {
    const endpoint = `http://127.0.0.1:${server.address().port}/provider`;
    first = await worker(t, root, endpoint);
    assert.equal(requests.length, 0);
    assert.equal(readFileSync(journal, 'utf8'), originalBytes, 'boot is read-only');
    assert.equal((await first.request('resume', { sessionId, message: 'Continua dalla nota.' })).sessionId, sessionId);
    await first.event(e => e.type === 'RunFinished'); await first.request('settle', { sessionId });
    assert.equal(requests.length, 1);
    const messages = requests[0].messages;
    assert.equal(messages[0].role, 'system', 'RETRY08-LEGACY: core instructions must precede recovered chat');
    assert.ok(messages.some(m => m.role === 'system' && m.content.includes('RETRY08-PROGETTO-ATTUALE')), 'current project instructions are present');
    assert.ok(messages.some(m => m.role === 'system' && m.content.includes('TALOS initial context reconstructed')));
    assert.equal(messages.filter(m => m.role === 'user' && m.content === original).length, 1);
    assert.equal(messages.filter(m => m.role === 'user' && m.content === 'Continua dalla nota.').length, 1);
    assert.ok(JSON.stringify(messages).includes(partial));
    const state = await first.request('state', { sessionId });
    const notices = s => s.session.eventi.filter(e => e.type === 'StateDelta' && e.delta?.some(p => p.path === '/recuperoCronologia' && p.value?.contestoRicostruito));
    assert.equal(notices(state).length, 1);
    const prefix = readFileSync(journal, 'utf8');
    assert.ok(prefix.startsWith(originalBytes), 'legacy archive remains byte-identical');
    await first.kill();
    second = await worker(t, root, endpoint);
    assert.equal(requests.length, 1);
    assert.equal(notices(await second.request('state', { sessionId })).length, 1, 'notice survives restart');
    await second.request('resume', { sessionId, message: 'Riepiloga.' });
    await second.event(e => e.type === 'RunFinished'); await second.request('settle', { sessionId });
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].messages.slice(0, messages.length), messages, 'saved prefix is not rewritten');
    assert.equal(notices(await second.request('state', { sessionId })).length, 1);
  } finally {
    await first?.kill(); await second?.kill();
    server.closeAllConnections(); await new Promise(r => server.close(r));
    assert.equal(resolve(root, '..'), resolve(tmpdir())); assert.ok(basename(root).startsWith('talos-retry08-'));
    rimuoviCartellaDiProva(root);
  }
});

async function worker(t, root, endpoint) {
  const profile = join(root, 'profile');
  mkdirSync(profile, { recursive: true });
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(SystemRoot|WINDIR|PATH|TEMP|TMP|COMSPEC|PATHEXT)$/iu.test(k)));
  Object.assign(env, { USERPROFILE: profile, HOME: profile, APPDATA: profile, LOCALAPPDATA: profile,
    TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_SCRATCH_DIR: join(profile, 'scratch') });
  const child = fork(fileURLToPath(new URL('./fixtures/provider-retry-recovery-worker.mjs', import.meta.url)),
    [join(root, 'sessions'), join(root, 'workspace'), endpoint], { env, execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const messages = [], pending = new Map();
  let nextId = 0, stderr = '';
  child.stderr.on('data', b => { stderr = (stderr + b).slice(-4000); });
  child.on('message', m => {
    messages.push(m);
    if (m.kind === 'reply' && pending.has(m.id)) {
      const { resolve: yes, reject: no, timer } = pending.get(m.id);
      clearTimeout(timer); pending.delete(m.id);
      if (m.error) no(Object.assign(Error(m.error.message), { code: m.error.code })); else yes(m.data);
    }
  });
  child.on('error', error => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); });
  const exited = new Promise(resolveExit => child.once('close', (code, signal) => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error(`Fixture exited ${code}/${signal}: ${stderr}`)); }
    pending.clear(); resolveExit({ code, signal });
  }));
  const kill = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  };
  t.after(kill);
  await t.waitFor(() => {
    assert.equal(child.exitCode, null, stderr);
    assert.ok(messages.some(m => m.kind === 'ready'), stderr);
  }, { timeout: 10_000 });
  return { child, messages, kill,
    request(command, fields = {}) {
      const id = ++nextId;
      return new Promise((resolveReply, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(Error(`Fixture IPC timeout: ${command}`)); }, 10_000);
        pending.set(id, { resolve: resolveReply, reject, timer });
        child.send({ command, id, ...fields });
      });
    },
    async event(predicate) {
      let found;
      await t.waitFor(() => { found = messages.find(m => m.kind === 'event' && predicate(m.event)); assert.ok(found); }, { timeout: 10_000 });
      return found.event;
    },
  };
}

for (const scenario of ['SETTLED-UNKNOWN', 'CRASH-BACKOFF', 'CRASH-PARTIAL', 'CRASH-AFTER-TOOL', 'CRASH-FOLLOWUP', 'CRASH-TOOL-ARGS', 'CRASH-DELETE']) {
  test(`RETRY07-${scenario}: processo nuovo, nessun reinvio e recupero esplicito`, { timeout: 30_000 }, async t => {
    const root = mkdtempSync(join(tmpdir(), 'talos-retry07-'));
    mkdirSync(join(root, 'workspace')); mkdirSync(join(root, 'sessions'));
    const marker = 'RISULTATO-REALE-RETRY07-🐇';
    writeFileSync(join(root, 'workspace', 'nota.txt'), marker);
    const beforeCrashRequests = ['CRASH-AFTER-TOOL', 'CRASH-FOLLOWUP'].includes(scenario) ? 2 : 1;
    const requests = [], responses = new Set();
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      requests.push(JSON.parse(Buffer.concat(chunks)));
      responses.add(res); res.on('close', () => responses.delete(res));
      if (requests.length > beforeCrashRequests || (scenario === 'CRASH-FOLLOWUP' && requests.length === 1)) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(frame('Ho ripreso dalla nota senza ripetere operazioni.') + end); return;
      }
      if (scenario === 'CRASH-BACKOFF') { res.writeHead(503, { 'Retry-After': '60' }); res.end('temporarily unavailable'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if ((scenario === 'CRASH-AFTER-TOOL' && requests.length === 1) || scenario === 'CRASH-TOOL-ARGS') {
        const incomplete = scenario === 'CRASH-TOOL-ARGS';
        const tool_calls = [{ index: 0, id: 'tool-retry07', type: 'function', function: {
          name: incomplete ? 'scrivi' : 'leggi', arguments: incomplete ? '{"percorso":"mai.txt","testo":' : JSON.stringify({ percorso: 'nota.txt' }),
        } }];
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls } }] })}\n\n`);
        if (!incomplete) res.end('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n');
        return;
      }
      res.write(frame(partial));
      if (scenario === 'SETTLED-UNKNOWN') res.end();
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const endpoint = `http://127.0.0.1:${server.address().port}/provider`;
    let first, second, third;
    try {
      first = await worker(t, root, endpoint);
      const { sessionId, code } = await first.request('start');
      assert.ok(sessionId, code);
      if (scenario === 'CRASH-FOLLOWUP') {
        await first.event(e => e.type === 'RunFinished');
        await first.request('settle', { sessionId });
        assert.equal((await first.request('resume', { sessionId, message: 'Controlla anche il secondo punto.' })).sessionId, sessionId);
      }
      if (scenario === 'SETTLED-UNKNOWN') {
        await first.event(e => e.type === 'RunError' && e.code === 'PROVIDER_OUTCOME_UNKNOWN');
        await first.request('settle', { sessionId });
      } else if (scenario === 'CRASH-BACKOFF') {
        await first.event(e => e.name === 'talos.provider-retry' && e.value.fase === 'attesa');
      } else if (scenario === 'CRASH-TOOL-ARGS') await first.event(e => e.type === 'ToolCallArgs');
      else await first.event(e => e.type === 'TextMessageContent' && e.delta.includes(partial));
      if (scenario === 'CRASH-AFTER-TOOL') await first.event(e => e.type === 'ToolCallResult' && e.content.includes(marker));
      await first.request('flush', { sessionId });
      assert.equal(requests.length, beforeCrashRequests);
      const before = await first.request('state', { sessionId });
      const journal = readFileSync(join(root, 'sessions', `${sessionId}.jsonl`), 'utf8');
      assert.match(journal, scenario === 'CRASH-BACKOFF' ? /talos\.provider-retry/u : scenario === 'CRASH-TOOL-ARGS' ? /ToolCallArgs/u : /La nota è stata ricevuta/u);
      const firstPid = first.child.pid;
      await first.kill();
      second = await worker(t, root, endpoint);
      assert.notEqual(second.child.pid, firstPid);
      const restored = await second.request('state', { sessionId });
      assert.equal(restored.invocazioni, 0);
      assert.equal(requests.length, beforeCrashRequests, 'ripristinare il journal non invia richieste');
      assert.equal(restored.session.sessionId, sessionId);
      assert.ok(restored.session.conclusa || restored.session.interrotta);
      if (!['CRASH-BACKOFF', 'CRASH-TOOL-ARGS'].includes(scenario)) assert.ok(restored.session.eventi.some(e => e.type === 'TextMessageContent' && e.delta.includes(partial)));
      if (scenario === 'CRASH-BACKOFF') {
        const oldWait = before.session.eventi.find(e => e.name === 'talos.provider-retry');
        const newWait = restored.session.eventi.find(e => e.name === 'talos.provider-retry');
        assert.equal(newWait.value.retryAt, oldWait.value.retryAt, 'nessun nuovo conto alla rovescia al riavvio');
      }
      if (scenario !== 'SETTLED-UNKNOWN') {
        assert.equal((await second.request('resume', { sessionId })).code, 'SESSION_NOT_READY');
        assert.equal(requests.length, beforeCrashRequests);
      }
      if (scenario === 'CRASH-DELETE') {
        const messageId = restored.session.eventi.find(e => e.type === 'TextMessageContent' && e.delta.includes(partial)).messageId;
        const removed = await second.request('remove', { sessionId, riferimento: messageId });
        assert.equal(removed.toltoDalModello, true, JSON.stringify(removed));
      }
      const resume = await second.request('resume', { sessionId, message: 'continua dalla nota, senza ripetere operazioni' });
      assert.equal(resume.sessionId, sessionId, JSON.stringify(resume));
      await second.event(e => e.type === 'RunFinished');
      await second.request('settle', { sessionId });
      assert.equal(requests.length, beforeCrashRequests + 1, 'una sola richiesta nuova dopo consenso esplicito');
      const next = requests[beforeCrashRequests].messages;
      const originalSystem = requests[0].messages.filter(m => m.role === 'system');
      assert.ok(originalSystem.length > 0, 'la prova deve esercitare un preambolo reale');
      assert.ok(originalSystem.every(original => next.some(m => m.role === 'system'
        && JSON.stringify(m.content) === JSON.stringify(original.content))),
      'RETRY07-INITIAL-SYSTEM-CONTEXT: la ripresa conserva anche il preambolo iniziale, non solo le bolle di chat');
      assert.ok(next.some(m => m.role === 'user' && m.content === 'Controlla la nota senza modificare file.'));
      assert.equal(next.filter(m => m.role === 'user' && m.content === 'continua dalla nota, senza ripetere operazioni').length, 1);
      if (!['CRASH-BACKOFF', 'CRASH-TOOL-ARGS', 'CRASH-DELETE'].includes(scenario)) assert.ok(JSON.stringify(next).includes(partial), 'il testo ricevuto resta disponibile anche al modello nella ripresa');
      if (scenario === 'CRASH-DELETE') assert.equal(JSON.stringify(next).includes(partial), false);
      if (scenario === 'CRASH-AFTER-TOOL') assert.ok(JSON.stringify(next).includes(marker), 'il risultato del tool reale resta disponibile');
      if (scenario === 'CRASH-TOOL-ARGS') {
        assert.equal(existsSync(join(root, 'workspace', 'mai.txt')), false);
        assert.equal(next.some(m => m.tool_calls?.some(c => c.id === 'tool-retry07')), false);
        assert.ok(next.some(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('outcome unknown')));
      }
      if (scenario === 'CRASH-FOLLOWUP') {
        assert.equal(next.filter(m => m.role === 'user' && m.content === 'Controlla anche il secondo punto.').length, 1);
        await second.kill();
        third = await worker(t, root, endpoint);
        assert.equal((await third.request('state', { sessionId })).invocazioni, 0);
        assert.equal(requests.length, beforeCrashRequests + 1);
        assert.equal((await third.request('resume', { sessionId, message: 'Ora riepiloga.' })).sessionId, sessionId);
        await third.event(e => e.type === 'RunFinished');
        await third.request('settle', { sessionId });
        assert.equal(requests.length, beforeCrashRequests + 2);
        const again = requests.at(-1).messages;
        assert.equal(JSON.stringify(again).split(partial).length - 1, 1, 'secondo riavvio senza duplicazione del frammento');
        const messageId = restored.session.eventi.find(e => e.type === 'TextMessageContent' && e.delta.includes(partial)).messageId;
        assert.equal((await third.request('remove', { sessionId, riferimento: messageId })).toltoDalModello, true);
        await third.kill();
        third = await worker(t, root, endpoint);
        await third.request('resume', { sessionId, message: 'Verifica la cancellazione.' });
        await third.event(e => e.type === 'RunFinished');
        await third.request('settle', { sessionId });
        assert.equal(JSON.stringify(requests.at(-1).messages).includes(partial), false, 'lapide onorata anche dopo riavvio');
      }
      t.diagnostic(`Processi distinti; richieste prima della ripresa: ${beforeCrashRequests}; scenario ${scenario}.`);
    } finally {
      await first?.kill(); await second?.kill(); await third?.kill();
      for (const res of responses) res.destroy();
      server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose));
      assert.ok(basename(root).startsWith('talos-retry07-'));
      assert.equal(resolve(root, '..'), resolve(tmpdir()));
      rimuoviCartellaDiProva(root);
    }
  });
}
