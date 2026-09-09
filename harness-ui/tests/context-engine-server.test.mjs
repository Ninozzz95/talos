import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const delay = ms => new Promise(done => setTimeout(done, ms));
async function unusedPort() {
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const { port } = server.address(); await new Promise(done => server.close(done)); return port;
}

test('CTX-SERVER-TRIAL-ROUNDTRIP real server imports and persists context across process restart', { timeout: 60000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-server-'));
  const workspace = join(directory, 'workspace'); await mkdir(workspace);
  const port = await unusedPort(); const token = randomBytes(24).toString('hex'); const sessionId = 'ctx-server-smoke';
  const model = 'fixture/no-inference'; const messages = [{ role: 'user', content: 'Avevamo scelto SQLite. Riprendiamo da qui.' }, { role: 'assistant', content: 'Confermo la decisione.' }];
  await writeFile(join(directory, `${sessionId}.jsonl`), [
    { tipo: 'intestazione', sessionId, taskId: 'fixture', cartella: workspace, task: { consegna: messages[0].content }, modello: model, avviataAlle: '2026-09-09T00:00:00.000Z' },
    { tipo: 'messaggi-finali', versioneGiro: 1, messaggiFinali: messages }, { type: 'RunFinished', _sequenza: 1 },
  ].map(record => JSON.stringify(record)).join('\n') + '\n');
  const base = `http://127.0.0.1:${port}/api/v1/sessions/${sessionId}/context`;
  const headers = { Cookie: `talos_token=${token}`, 'Content-Type': 'application/json' };
  let child;
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(done => child.once('exit', done)); child.kill(); await exited;
  }
  t.after(async () => { await stop(); await rm(directory, { recursive: true, force: true }); });
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, TALOS_HARNESS_UI_PORT: String(port), TALOS_HARNESS_UI_TOKEN: token,
      TALOS_HARNESS_UI_SESSIONS_DIR: directory, TALOS_HARNESS_UI_PROJECT_DIRS: workspace,
      TALOS_CONTEXT_TRIAL: JSON.stringify({ sessionIds: [sessionId], models: [{ provider: 'openrouter', model, windowTokens: 16384, responseReserve: 2048 }] }),
    } });
    child.stdout.resume(); child.stderr.resume();
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`Isolated server exited with ${child.exitCode}`);
      try { return await fetch(base, { headers, signal: AbortSignal.timeout(500) }); } catch { await delay(100); }
    }
    throw new Error('Isolated server did not become ready');
  }
  const response = await start(); assert.equal(response.status, 200);
  const initial = await response.json(); assert.equal(initial.headSequence, 2);
  const body = { fact: { id: 'database', text: 'La decisione confermata è SQLite.' }, expectedRevision: initial.revision, idempotencyKey: 'pin-database' };
  const pinned = await fetch(`${base}/facts`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(pinned.status, 200); await pinned.json();
  await stop(); const resumed = await start(); assert.equal(resumed.status, 200);
  const state = await resumed.json(); assert.equal(state.facts[0].text, body.fact.text);
  const replay = await fetch(`${base}/facts`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(replay.status, 200); await replay.json();
  const exported = await fetch(`${base}/export`, { headers }); const archive = await exported.json();
  assert.deepEqual(archive.records.map(record => record.message), messages);
});
