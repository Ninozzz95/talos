/*
 * The local engine's key never on the command line (owner 11/11/2026 23:51, judge v1589 and v1591).
 * A command line is readable by every process of the user (WMI `Win32_Process.CommandLine`, `ps`) and lands in a spawn error's
 * `spawnargs`; the key goes in the child's ENVIRONMENT instead (Atomic `managed-api-key.ts:37-47`, `LLAMA_API_KEY` = `--api-key`'s
 * binding, `common/arg.cpp:3550`). Measured on b11669 (12/11/2026): with `LLAMA_API_KEY` only, 401 without the key, 200 with it, and
 * the WMI command line does not contain it.
 *   CK-01 the standalone engine: no key in its arguments, the key in its environment, the same key the supervisor sends
 *   CK-02 the embedding engine: the same
 *   CK-03 the router: no key in its arguments (it is in the file named by LLAMA_ARG_API_KEY_FILE, as before)
 *   CK-04 the router's key file is readable by this user only (Windows ACL, read back with icacls)
 *   CK-05 `scriviChiaveProtetta`: the ACL is cut on the EMPTY temporary file, before the key is written; rollback like Atomic
 * Round (a), judge v1599 (12/11/2026 00:23):
 *   CK-06 the embedding engine fails CLOSED: at start a request WITHOUT the key must get 401, else it stops with a clear error, keyless
 *   CK-07 with the real process policy: a user's own LLAMA_API_KEY loses to TALOS' key, TALOS' process.env is never written; a policy
 *         that drops the variable gives an open engine, and CK-06's check stops it
 *   CK-08 a spawn that fails: the key is in no error, log or status
 *   CK-09 the router: when icacls does not apply, the log line says so, without the key
 * After the reviewer, judge v1605 (12/11/2026 07:52):
 *   CK-03 now with a user's own LLAMA_API_KEY in TALOS' environment (reviewer R10)
 *   CK-10 an embedding engine that fails to start: the key is in no error (reviewer R03)
 *   CK-11 an open embedding engine being stopped is never reported ready by health() (reviewer A09: NOT equivalent, the author was wrong)
 *   CK-12 the standalone engine fails closed too: a keyless request at start must get 401, else it stops, with an error without the key
 * After the trial merge of core block 2, judge v1692 (12/11/2026 16:41):
 *   CK-16 icacls is started with `SystemRoot` only: nothing of the server's environment reaches it
 */
import assert from 'node:assert/strict';
import processi, { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createContextEmbeddingRuntime } from '../src/context-embedding-runtime.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import * as modRouter from '../src/llama-router-supervisor.mjs';
import { createProcessPolicy, DEFAULT_ENV_ALLOWLIST } from '../src/process-policy.mjs';
import { creaRouterFinto } from './aiuto/router-finto.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const BIN = 'C:\\talos\\llama-server.exe';
const CHIAVE = /^[a-f0-9]{64}$/u;
const nessunaChiaveNegliArgomenti = (args) => !args.includes('--api-key') && !args.some((a) => CHIAVE.test(String(a)));

/** The Authorization a fake engine sees, from a plain object or a `Headers`. */
const autorizzazione = (o) => (typeof o?.headers?.get === 'function' ? o.headers.get('Authorization') ?? undefined : o?.headers?.Authorization);

function figlio() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.kills = [];
  c.kill = (s) => { c.kills.push(s); c.emit('close', 0, s); return true; };
  return c;
}

test('CK-01 the standalone engine gets its key in the environment (LLAMA_API_KEY), never in its arguments', async (t) => {
  /* a LLAMA_API_KEY of the user's own must not win over the supervisor's key */
  process.env.LLAMA_API_KEY = 'quella-del-utente';
  t.after(() => { delete process.env.LLAMA_API_KEY; });
  let lancio;
  const portatori = [];
  const sup = createLlamaServerSupervisor({
    binaryPath: BIN,
    spawnImpl: (...a) => { lancio = a; return figlio(); },
    /* like b11669: /health is public, everything else 401 without the key (judge v1605: the standalone engine checks it at start) */
    fetchImpl: async (url, o) => {
      const auth = autorizzazione(o);
      portatori.push({ via: new URL(url).pathname, auth });
      if (!url.endsWith('/health') && auth !== `Bearer ${lancio?.[2]?.env?.LLAMA_API_KEY}`) return { status: 401, ok: false };
      return { status: 200, ok: true };
    },
    portAllocator: async () => 18090,
    pollIntervalMs: 1,
  });
  const stato = await sup.start({ modelPath: 'C:\\models\\model.gguf' });
  assert.equal(stato.state, 'ready');
  const [, args, opzioni] = lancio;
  assert.ok(nessunaChiaveNegliArgomenti(args), `no key on the command line: ${args.join(' ')}`);
  assert.match(opzioni.env.LLAMA_API_KEY ?? '', CHIAVE, 'the key reaches the child through its environment');
  assert.equal(opzioni.env.LLAMA_ARG_OFFLINE, '1', 'the offline variable is still there');
  assert.deepEqual(portatori.filter((p) => p.auth === undefined).map((p) => p.via), ['/v1/models'], 'one keyless request: the check at start');
  assert.ok(portatori.filter((p) => p.auth !== undefined).every((p) => p.auth === `Bearer ${opzioni.env.LLAMA_API_KEY}`), 'the supervisor sends the same key');
  assert.equal(JSON.stringify(stato).includes(opzioni.env.LLAMA_API_KEY), false, 'not in the status');
  await sup.stop();
});

test('CK-02 the embedding engine gets its key in the environment, never in its arguments', async (t) => {
  const { runtime, lanci, richieste, corpiLiberati } = bancoEmbedding(t);
  await runtime.embedContextBatch({ texts: ['alpha'], kind: 'document' });
  assert.equal(lanci.length, 1);
  const { args, options } = lanci[0];
  assert.ok(nessunaChiaveNegliArgomenti(args), `no key on the command line: ${args.join(' ')}`);
  assert.match(options.env?.LLAMA_API_KEY ?? '', CHIAVE, 'the key reaches the child through its environment');
  /* round (a), judge v1599: one request goes WITHOUT the key on purpose (the 401 check of CK-06); every other one carries the same key */
  const senza = richieste.filter((r) => r.auth === undefined);
  assert.deepEqual(senza.map((r) => new URL(r.url).pathname), ['/v1/models'], 'one keyless request: the check at start');
  assert.deepEqual(corpiLiberati, ['/v1/models'], 'the body of the 401 is freed');
  assert.ok(richieste.filter((r) => r.auth !== undefined).every((r) => r.auth === `Bearer ${options.env.LLAMA_API_KEY}`), 'the runtime sends the same key');
});

/**
 * A fake embedding llama-server that behaves like b11669 (measured 12/11/2026): `/health` is public (`server-http.cpp:252-256`), every
 * other route answers 401 without the key the process was started with; started with NO key it answers everything.
 * `apertoComunque` = an engine that answers 200 even without the key (what the check must catch).
 */
function bancoEmbedding(t, { politica = null, apertoComunque = false } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'ck-emb-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const modelPath = join(cartella, 'embedding.gguf');
  const dati = Buffer.from('GGUF fixture bytes, no model inference');
  writeFileSync(modelPath, dati);
  const lanci = [];
  const richieste = [];
  const figli = [];
  const corpiLiberati = [];
  const spawnFinto = (binary, args, options) => {
    lanci.push({ binary, args, options });
    const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough();
    c.kill = () => { c.killed = true; queueMicrotask(() => c.emit('close', 0)); return true; };
    figli.push(c);
    return c;
  };
  const processPolicy = politica ? politica(spawnFinto) : { spawn: spawnFinto };
  const fetchFn = async (url, init) => {
    const auth = init?.headers?.Authorization;
    richieste.push({ url, auth });
    const chiave = lanci.at(-1)?.options?.env?.LLAMA_API_KEY;
    if (url.endsWith('/health')) return { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
    if (chiave && !apertoComunque && auth !== `Bearer ${chiave}`) {
      /* a real 401 has a body: the runtime must free it, or undici keeps the connection busy */
      return { ok: false, status: 401, body: { cancel: async () => { corpiLiberati.push(new URL(url).pathname); } }, json: async () => ({ error: { message: 'Invalid API Key' } }) };
    }
    if (url.endsWith('/v1/models')) return { ok: true, status: 200, json: async () => ({ data: [] }) };
    return { ok: true, status: 200, json: async () => ({ data: JSON.parse(init.body).input.map((_, index) => ({ index, embedding: Array(1024).fill(1) })) }) };
  };
  const runtime = createContextEmbeddingRuntime({ binaryPath: process.execPath, modelPath, modelSha256: createHash('sha256').update(dati).digest('hex'), processPolicy, fetchFn });
  t.after(() => runtime.close());
  return { runtime, lanci, richieste, figli, corpiLiberati };
}

test('CK-06 the embedding engine fails closed: an engine that answers without the key is stopped, with an error that has no key', async (t) => {
  const { runtime, lanci, richieste, figli } = bancoEmbedding(t, { apertoComunque: true });
  const errore = await runtime.embedContextBatch({ texts: ['alpha'], kind: 'document' }).then(() => null, (e) => e);
  assert.ok(errore, 'the batch is refused');
  assert.equal(errore.code, 'CTX_EMBEDDING_UNPROTECTED');
  const chiave = lanci[0].options.env.LLAMA_API_KEY;
  assert.equal(`${errore.message} ${errore.stack} ${JSON.stringify(errore)}`.includes(chiave), false, 'the key is not in the error');
  assert.match(errore.message, /without its key/u);
  assert.equal(figli[0].killed, true, 'the open engine is stopped');
  assert.equal(richieste.some((r) => r.url.endsWith('/v1/embeddings')), false, 'no text reaches an open engine');
  assert.equal((await runtime.health()).ready, false);
});

test('CK-07 with the real process policy: the user\'s LLAMA_API_KEY loses, TALOS\' environment is untouched; a policy that drops it fails closed', async (t) => {
  const prima = process.env.LLAMA_API_KEY;
  t.after(() => { if (prima === undefined) delete process.env.LLAMA_API_KEY; else process.env.LLAMA_API_KEY = prima; });
  process.env.LLAMA_API_KEY = 'quella-del-utente';
  const giusta = (spawnFn) => createProcessPolicy({ allowedExecutables: [process.execPath], envAllowlist: [...DEFAULT_ENV_ALLOWLIST, 'LLAMA_API_KEY'], spawnFn });
  const a = bancoEmbedding(t, { politica: giusta });
  await a.runtime.embedContextBatch({ texts: ['alpha'], kind: 'document' });
  assert.match(a.lanci[0].options.env.LLAMA_API_KEY, CHIAVE, 'TALOS\' key, not the user\'s');
  assert.equal(process.env.LLAMA_API_KEY, 'quella-del-utente', 'TALOS never writes its own process.env');
  /* the variable dropped by the policy: the engine starts with no key, answers everything, and the check stops it */
  const senza = (spawnFn) => createProcessPolicy({ allowedExecutables: [process.execPath], envAllowlist: [...DEFAULT_ENV_ALLOWLIST], spawnFn });
  const b = bancoEmbedding(t, { politica: senza });
  await assert.rejects(b.runtime.embedContextBatch({ texts: ['alpha'], kind: 'document' }), { code: 'CTX_EMBEDDING_UNPROTECTED' });
  assert.equal(Object.hasOwn(b.lanci[0].options.env, 'LLAMA_API_KEY'), false);
  assert.equal(b.figli[0].killed, true);
});

test('CK-08 a spawn that fails: the key is in no error, log or status, and TALOS\' process.env is untouched', async (t) => {
  const prima = process.env.LLAMA_API_KEY;
  const cartella = mkdtempSync(join(tmpdir(), 'ck-spawn-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiave = null;
  const righe = [];
  const sup = createLlamaServerSupervisor({ binaryPath: join(cartella, 'llama-server.exe'), sondaBinario: () => '', pollIntervalMs: 1, healthTimeoutMs: 5_000,
    portAllocator: async () => 18095, fetchImpl: async () => { throw new TypeError('fetch failed'); }, registro: (r) => righe.push(r),
    spawnImpl: (c, a, o) => { chiave = o.env.LLAMA_API_KEY; return spawn(c, a, o); } }); // the real spawn of a file that is not there: ENOENT
  sup.subscribeLogs((e) => righe.push(e));
  const errore = await sup.start({ modelPath: join(cartella, 'm.gguf') }).then(() => null, (e) => e);
  assert.ok(errore, 'the start fails');
  assert.match(chiave ?? '', CHIAVE, 'the child was given a key');
  const tutto = JSON.stringify({ m: errore.message, s: errore.stack, e: errore, c: errore.cause, righe, stato: sup.status() },
    (_k, v) => (v instanceof Error ? { message: v.message, stack: v.stack, ...v } : v));
  assert.equal(tutto.includes(chiave), false, 'not in the error, the logs or the status');
  assert.equal(process.env.LLAMA_API_KEY, prima, 'TALOS\' process.env is untouched');
});

function preparaRouter(t, { registro = () => {} } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'ck-router-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const a = join(cartella, 'a.gguf');
  writeFileSync(a, 'GGUF-finto-a');
  const banco = creaRouterFinto();
  const comuni = { binaryPath: BIN, spawnImpl: banco.spawnImpl, fetchImpl: banco.fetchImpl, portAllocator: banco.portAllocator, pollIntervalMs: 1, attesaChiusuraMs: 500 };
  const standalone = createLlamaServerSupervisor({ ...comuni, gpuLayers: 0, sondaBinario: () => '' });
  const router = modRouter.createLlamaRouterSupervisor({ ...comuni, standalone, presetFile: join(cartella, 'router', 'presets.ini'), healthTimeoutMs: 2_000,
    modelliInstallati: async () => [{ modelId: 'mod-a', modelPath: a, opzioni: { contextLength: 8_192 } }], memoriaUtilizzabile: async () => null,
    registro, uccidiAlbero: async (f) => { f.kill('SIGTERM'); } });
  t.after(() => router.chiudi());
  return { cartella, a, banco, router };
}

test('CK-03 the router: no key in its arguments, the key in the file its environment names', async (t) => {
  /* reviewer R10 (12/11): a user's own LLAMA_API_KEY must not reach the router, whose allow-list does not name it */
  const prima = process.env.LLAMA_API_KEY;
  t.after(() => { if (prima === undefined) delete process.env.LLAMA_API_KEY; else process.env.LLAMA_API_KEY = prima; });
  process.env.LLAMA_API_KEY = 'quella-del-utente';
  const p = preparaRouter(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const { args, opzioni } = p.banco.spawn[0];
  assert.ok(nessunaChiaveNegliArgomenti(args), `no key on the command line: ${args.join(' ')}`);
  assert.match(readFileSync(opzioni.env.LLAMA_ARG_API_KEY_FILE, 'utf8').trim(), CHIAVE);
  assert.equal(Object.hasOwn(opzioni.env, 'LLAMA_API_KEY'), false, 'one way for the router: the file');
});

/**
 * One file's DACL as SDDL (`icacls <file> /save <out>`: UTF-16LE, line 1 the name, line 2 `D:<flags>(ace)(ace)…`), and this user's SID
 * (`whoami /user /fo csv /nh`). Both are language independent: the localized icacls listing is not read.
 */
function daclDelFile(t, file) {
  const sistema = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  const cartella = mkdtempSync(join(tmpdir(), 'ck-sddl-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const uscita = join(cartella, 'acl.txt');
  execFileSync(join(sistema, 'icacls.exe'), [file, '/save', uscita], { windowsHide: true });
  const righe = readFileSync(uscita).toString('utf16le').replace(/^\uFEFF/u, '').split(/\r?\n/u).filter(Boolean);
  const dacl = /^D:([A-Z]*)((?:\([^()]*\))+)$/u.exec(righe[1] ?? '');
  assert.ok(dacl, `a DACL in SDDL: ${righe.join(' | ')}`);
  const voci = [...dacl[2].matchAll(/\(([^()]*)\)/gu)].map((m) => { const [tipo, eredita, diritti, , , sid] = m[1].split(';'); return { tipo, eredita, diritti, sid }; });
  const chi = execFileSync(join(sistema, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true }).trim();
  const sid = /"(S-1-5-[\d-]+)"$/u.exec(chi)?.[1];
  assert.ok(sid, `this user's SID: ${chi}`);
  return { flags: dacl[1], voci, sid, sddl: righe[1] };
}

test('CK-04 the router\'s key file is readable by this user only (ACL read back with icacls)', { skip: process.platform !== 'win32' && 'Windows ACL' }, async (t) => {
  const p = preparaRouter(t);
  await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  const file = p.banco.spawn[0].opzioni.env.LLAMA_ARG_API_KEY_FILE;
  const { flags, voci, sid, sddl } = daclDelFile(t, file);
  /* the built-in local administrator (RID 500) may be written with its SDDL alias */
  const mio = (s) => s === sid || (/-500$/u.test(sid) && s === 'LA');
  assert.match(flags, /P/u, `the folder's ACL is cut (protected DACL): ${sddl}`);
  assert.equal(voci.some((v) => /ID/u.test(v.eredita)), false, `nothing inherited from the folder: ${sddl}`);
  assert.ok(voci.some((v) => v.tipo === 'A' && v.eredita === '' && v.diritti === 'FA' && mio(v.sid)), `this user, full control: ${sddl}`);
  /* a folder that offers nothing to inherit (an administrator's TEMP on a CI runner) gives the new file the token's default DACL:
     SYSTEM and Administrators stay, as explicit entries; they can read every file anyway. Any other principal is a leak. */
  const ammessi = new Set(['SY', 'S-1-5-18', 'BA', 'S-1-5-32-544']);
  assert.deepEqual(voci.filter((v) => !mio(v.sid) && !ammessi.has(v.sid)), [], `only this user, SYSTEM and Administrators: ${sddl}`);
  assert.match(readFileSync(file, 'utf8').trim(), CHIAVE, 'still readable by us');
});

test('CK-05 scriviChiaveProtetta cuts the ACL on the empty temporary file, then writes the key; rollback like Atomic', async (t) => {
  assert.equal(typeof modRouter.scriviChiaveProtetta, 'function', 'scriviChiaveProtetta is exported');
  const cartella = mkdtempSync(join(tmpdir(), 'ck-acl-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, 'k.key');
  const temporaneo = `${file}.${process.pid}.tmp`;
  /* 1. the order: icacls on the temporary file while it is still EMPTY, the key written after, the temporary renamed */
  const chiamate = [];
  const protetto = modRouter.scriviChiaveProtetta(file, 'abc\n', { piattaforma: 'win32', utente: () => 'u',
    eseguiIcacls: (args) => { chiamate.push({ args, contenuto: readFileSync(args[0], 'utf8') }); } });
  assert.deepEqual(chiamate, [{ args: [temporaneo, '/inheritance:r', '/grant:r', 'u:F'], contenuto: '' }]);
  assert.equal(protetto, true);
  assert.equal(readFileSync(file, 'utf8'), 'abc\n');
  assert.equal(existsSync(temporaneo), false, 'no temporary file left');
  /* 2. the ACL locked us out (another principal resolved): /reset, and the file says it is not protected */
  const reset = [];
  const esito = modRouter.scriviChiaveProtetta(file, 'def\n', { piattaforma: 'win32', utente: () => 'u', eseguiIcacls: (args) => { reset.push(args); },
    leggi: () => { throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); } });
  assert.deepEqual(reset, [[temporaneo, '/inheritance:r', '/grant:r', 'u:F'], [temporaneo, '/reset']]);
  assert.equal(esito, false);
  assert.equal(readFileSync(file, 'utf8'), 'def\n');
  /* 3. icacls missing: the key is still written (the folder's ACL, as before), and the answer says so */
  assert.equal(modRouter.scriviChiaveProtetta(file, 'ghi\n', { piattaforma: 'win32', utente: () => 'u', eseguiIcacls: () => { throw new Error('ENOENT'); } }), false);
  assert.equal(readFileSync(file, 'utf8'), 'ghi\n');
  /* 4. no user name: no icacls at all */
  const nessuna = [];
  assert.equal(modRouter.scriviChiaveProtetta(file, 'jkl\n', { piattaforma: 'win32', utente: () => '', eseguiIcacls: (a) => { nessuna.push(a); } }), false);
  assert.deepEqual(nessuna, []);
  /* 5. off Windows: no icacls, the mode does it */
  const fuori = [];
  assert.equal(modRouter.scriviChiaveProtetta(file, 'mno\n', { piattaforma: 'linux', utente: () => 'u', eseguiIcacls: (a) => { fuori.push(a); } }), true);
  assert.deepEqual(fuori, []);
  assert.equal(readFileSync(file, 'utf8'), 'mno\n');
});

test('CK-09 the router: when icacls does not apply, one log line says so, without the key; the router still starts', { skip: process.platform !== 'win32' && 'Windows ACL' }, async (t) => {
  /* icacls is run by its full path under SystemRoot (J-R4): a SystemRoot with no System32 makes it fail as on a PC without icacls */
  const prima = process.env.SystemRoot;
  t.after(() => { process.env.SystemRoot = prima; });
  process.env.SystemRoot = join(mkdtempSync(join(tmpdir(), 'ck-sysroot-')), 'Windows');
  const righe = [];
  const p = preparaRouter(t, { registro: (r) => righe.push(r) });
  const esito = await p.router.start({ modelId: 'mod-a', modelPath: p.a, contextLength: 8_192 });
  process.env.SystemRoot = prima;
  assert.equal(esito.state, 'ready', 'a key file with the folder\'s ACL still starts the router, as before');
  const chiave = readFileSync(p.banco.spawn[0].opzioni.env.LLAMA_ARG_API_KEY_FILE, 'utf8').trim();
  assert.match(chiave, CHIAVE);
  const sullAcl = righe.filter((r) => /key file keeps its folder's permissions/u.test(r));
  assert.equal(sullAcl.length, 1, `one line: ${righe.join(' | ')}`);
  assert.equal(righe.join('\n').includes(chiave), false, 'the key is in no log line');
});

/*
 * CK-16 (judge v1692, 12/11/2026): icacls never gets the server's environment. Without `env`, node:child_process hands the child the
 * WHOLE `process.env` (nodejs.org/api/child_process.html, «env … Default: process.env»): the local API token, the keys of the receipts
 * and of the search. `spawn-senza-ambiente-del-server.test.mjs` reads the TEXT of the call; this one reads what the call passes: the
 * built-in `execFileSync` is replaced through its live binding (`syncBuiltinESMExports`, as `cerca-file-segreti.test.mjs` does), so
 * the supervisor's own icacls (no `eseguiIcacls` given) is the one that runs.
 */
test('CK-16 icacls is started with SystemRoot only: nothing of the server\'s environment reaches it', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'ck-ambiente-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, 'k.key');
  const nomi = ['SystemRoot', 'TALOS_HARNESS_UI_TOKEN'];
  const prima = nomi.map((nome) => process.env[nome]);
  const lanci = [];
  const finto = t.mock.method(processi, 'execFileSync', (programma, args, opzioni) => { lanci.push({ programma, args, opzioni }); return ''; });
  syncBuiltinESMExports();
  try {
    process.env.TALOS_HARNESS_UI_TOKEN = 'ck-16-not-a-real-token';
    process.env.SystemRoot = 'D:\\WinNT';
    assert.equal(modRouter.scriviChiaveProtetta(file, 'abc\n', { piattaforma: 'win32', utente: () => 'u' }), true);
    process.env.SystemRoot = '\\\\server\\share'; // not a drive root with a letter: never trusted (J-R4)
    assert.equal(modRouter.scriviChiaveProtetta(file, 'def\n', { piattaforma: 'win32', utente: () => 'u' }), true);
  } finally {
    finto.mock.restore(); syncBuiltinESMExports();
    nomi.forEach((nome, i) => { if (prima[i] === undefined) delete process.env[nome]; else process.env[nome] = prima[i]; });
  }
  assert.deepEqual(lanci.map((l) => l.programma), ['D:\\WinNT\\System32\\icacls.exe', 'C:\\Windows\\System32\\icacls.exe'], 'by its full path, twice');
  assert.deepEqual(lanci[0].args, [`${file}.${process.pid}.tmp`, '/inheritance:r', '/grant:r', 'u:F']);
  assert.deepEqual(lanci[0].opzioni.env, { SystemRoot: 'D:\\WinNT' }, 'SystemRoot and nothing else: not the token, not a key');
  assert.deepEqual(lanci[1].opzioni.env, { SystemRoot: 'C:\\Windows' }, 'a SystemRoot that is not a drive root is not passed on');
  assert.equal(readFileSync(file, 'utf8'), 'def\n', 'the key is written');
});

/** A fake model file with its digest, for the embedding runtime. */
function modelloFinto(t, prefisso) {
  const cartella = mkdtempSync(join(tmpdir(), prefisso));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const modelPath = join(cartella, 'embedding.gguf');
  const dati = Buffer.from('GGUF fixture bytes, no model inference');
  writeFileSync(modelPath, dati);
  return { modelPath, modelSha256: createHash('sha256').update(dati).digest('hex') };
}

test('CK-10 an embedding engine that fails to start: the key is in no error (reviewer R03)', async (t) => {
  let chiave = null;
  const spawnFallito = (_b, _a, o) => {
    chiave = o.env.LLAMA_API_KEY;
    const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough();
    c.kill = () => true;
    queueMicrotask(() => { c.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })); c.emit('close', -4058); });
    return c;
  };
  const runtime = createContextEmbeddingRuntime({ binaryPath: process.execPath, ...modelloFinto(t, 'ck-r03-'), processPolicy: { spawn: spawnFallito },
    fetchFn: async () => { throw new TypeError('fetch failed'); } });
  t.after(() => runtime.close());
  const errore = await runtime.embedContextBatch({ texts: ['alpha'], kind: 'document' }).then(() => null, (e) => e);
  assert.ok(errore, 'the batch fails');
  assert.match(chiave ?? '', CHIAVE);
  assert.equal(`${errore.message} ${errore.stack} ${JSON.stringify(errore)}`.includes(chiave), false, 'the key is in no error');
});

test('CK-11 an open embedding engine being stopped is never reported ready by health() (reviewer A09)', async (t) => {
  /* the process dies SLOWLY (300 ms after SIGTERM, like a real one): during that stop no health() may say «ready» */
  const spawnLento = () => {
    const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough();
    c.kill = () => { setTimeout(() => c.emit('close', 0), 300); return true; };
    return c;
  };
  const apertoATutti = async (url) => (url.endsWith('/health')
    ? { ok: true, status: 200, json: async () => ({ status: 'ok' }) }
    : { ok: true, status: 200, json: async () => ({ data: [] }) });
  const runtime = createContextEmbeddingRuntime({ binaryPath: process.execPath, ...modelloFinto(t, 'ck-a09-'), processPolicy: { spawn: spawnLento }, fetchFn: apertoATutti });
  t.after(() => runtime.close());
  let finito = false;
  const lotto = runtime.embedContextBatch({ texts: ['alpha'], kind: 'document' }).then(() => null, (e) => e).finally(() => { finito = true; });
  const visti = [];
  while (!finito) { visti.push((await runtime.health()).ready); await new Promise((r) => setTimeout(r, 5)); }
  assert.equal((await lotto)?.code, 'CTX_EMBEDDING_UNPROTECTED');
  assert.ok(visti.length > 1, 'health() was asked during the stop');
  assert.equal(visti.includes(true), false, `health() said ready while the open engine was being stopped (${visti.filter(Boolean).length} times)`);
});

test('CK-12 the standalone engine fails closed: one that answers without its key is stopped, with an error that has no key', async () => {
  let lancio;
  const richieste = [];
  const figli = [];
  const sup = createLlamaServerSupervisor({
    binaryPath: BIN,
    spawnImpl: (...a) => { lancio = a; const c = figlio(); figli.push(c); return c; },
    fetchImpl: async (url, o) => { richieste.push({ via: new URL(url).pathname, auth: autorizzazione(o) }); return { status: 200, ok: true }; }, // open to anyone
    portAllocator: async () => 18096,
    pollIntervalMs: 1,
  });
  const righe = [];
  sup.subscribeLogs((e) => righe.push(e));
  const errore = await sup.start({ modelPath: 'C:\\models\\model.gguf' }).then(() => null, (e) => e);
  assert.ok(errore, 'the start is refused');
  const chiave = lancio[2].env.LLAMA_API_KEY;
  assert.match(chiave, CHIAVE);
  assert.match(errore.message, /without its key/u);
  assert.equal(errore.code, 'RUNTIME_PROCESS_FAILED', 'a process failure, not a timeout: callers read the code');
  const tutto = JSON.stringify({ m: errore.message, s: errore.stack, e: errore, righe, stato: sup.status() });
  assert.equal(tutto.includes(chiave), false, 'the key is in no error, log or status');
  assert.ok(figli.length >= 1 && figli.every((c) => c.kills.length > 0), 'every open engine is stopped');
  assert.notEqual(sup.status().state, 'ready');
  assert.deepEqual(richieste.filter((r) => r.auth === undefined).map((r) => r.via).slice(0, 1), ['/v1/models'], 'the keyless check');
  assert.equal(richieste.some((r) => r.via === '/props'), false, 'nothing else is asked of an open engine');
});

test('CK-13 an open engine with the image projector is not opened a second time without it: the projector is not the cause', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'ck-vista-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const proiettore = join(cartella, 'mmproj.gguf');
  writeFileSync(proiettore, 'GGUF-proiettore-finto');
  const lanci = [];
  const sup = createLlamaServerSupervisor({
    binaryPath: BIN,
    spawnImpl: (...a) => { lanci.push(a); return figlio(); },
    fetchImpl: async () => ({ status: 200, ok: true }), // open to anyone
    portAllocator: async () => 18097,
    pollIntervalMs: 1,
  });
  const errore = await sup.start({ modelPath: 'C:\\models\\model.gguf', proiettore: { path: proiettore, bytes: 21 } }).then(() => null, (e) => e);
  assert.ok(errore, 'the start is refused');
  assert.match(errore.message, /without its key/u);
  assert.ok(lanci[0][1].includes('--mmproj'), 'the first opening had the projector');
  assert.equal(lanci.length, 1, 'one opening only: no second open engine without the projector');
});

test('CK-14 the standalone keyless check frees the body of the 401, and the engine becomes ready', async () => {
  let liberati = 0;
  const sup = createLlamaServerSupervisor({
    binaryPath: BIN,
    spawnImpl: () => figlio(),
    fetchImpl: async (url, o) => (new URL(url).pathname === '/v1/models' && autorizzazione(o) === undefined
      ? { status: 401, ok: false, body: { cancel: async () => { liberati += 1; } } }
      : { status: 200, ok: true }),
    portAllocator: async () => 18098,
    pollIntervalMs: 1,
  });
  assert.equal((await sup.start({ modelPath: 'C:\\models\\model.gguf' })).state, 'ready');
  assert.equal(liberati, 1, 'the 401 body is freed once');
  await sup.stop();
});

test('CK-15 a standalone keyless check that never gets through is never taken as protected: no ready, a timeout', async () => {
  const richieste = [];
  const sup = createLlamaServerSupervisor({
    binaryPath: BIN,
    spawnImpl: () => figlio(),
    fetchImpl: async (url, o) => {
      const via = new URL(url).pathname;
      richieste.push(via);
      if (via === '/v1/models' && autorizzazione(o) === undefined) throw new TypeError('fetch failed');
      return { status: 200, ok: true };
    },
    portAllocator: async () => 18099,
    pollIntervalMs: 1,
    healthTimeoutMs: 150,
  });
  const errore = await sup.start({ modelPath: 'C:\\models\\model.gguf' }).then(() => null, (e) => e);
  assert.ok(errore, 'the start is refused');
  assert.equal(errore.code, 'RUNTIME_HEALTH_TIMEOUT');
  assert.notEqual(sup.status().state, 'ready');
  assert.ok(richieste.filter((v) => v === '/v1/models').length >= 2, 'asked again on the next turn');
  assert.equal(richieste.includes('/props'), false, 'nothing else is asked of an engine not proven protected');
});
