import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DEFAULT_INHERITED_ENV_VARS } from '@modelcontextprotocol/client/stdio';
import { connettiAgenteAcp, validaRuntimeAgenteEsterno } from '../src/acp-agent.mjs';

const script = fileURLToPath(new URL('./fixtures/acp-agent-finto.mjs', import.meta.url));
async function prepara(t, modo = 'normale') {
  const cwd = await mkdtemp(join(tmpdir(), 'talos-pl-'));
  const risorse = {};
  t.after(async () => { await risorse.agente?.chiudi(); await rm(cwd, { recursive: true, force: true }); });
  const diario = join(cwd, 'diario.jsonl');
  return { risorse, runtime: { comando: process.execPath, argomenti: [script, modo, diario], cwd,
    variabiliAmbiente: [], timeoutMs: 2000 },
  leggi: async () => (await readFile(diario, 'utf8')).trim().split('\n').map(JSON.parse) };
}
const testo = [{ type: 'text', text: 'Ciao, leggi questo testo.' }];
const morto = pid => assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });

test('PL-ACP-01 — handshake reale, identità, cwd e capacità minime', async t => {
  const f = await prepara(t);
  const a = await connettiAgenteAcp(f.runtime);
  f.risorse.agente = a;
  assert.equal(a.nome, 'Agente di prova');
  assert.equal(a.sessionId, 'prova');
  const righe = await f.leggi();
  assert.equal(righe[0].cwd, f.runtime.cwd);
  assert.equal(righe[1].method, 'initialize');
  assert.equal(righe[1].params.protocolVersion, 1);
  assert.deepEqual(righe[1].params.clientCapabilities, {});
  assert.deepEqual(righe.find(m => m.method === 'session/new').params, { cwd: f.runtime.cwd, mcpServers: [] });
  await a.chiudi(); morto(a.pid);
});

test('PL-ACP-02 — aggiornamenti distinti in ordine, senza tool OpenAI inventati', async t => {
  const f = await prepara(t), eventi = [];
  const a = await connettiAgenteAcp(f.runtime, { onEvento: e => eventi.push(e) });
  f.risorse.agente = a;
  assert.equal((await a.prompt(testo)).stopReason, 'end_turn');
  assert.deepEqual(eventi.map(e => e.tipo), ['testo', 'testo', 'ragionamento', 'attivita', 'attivita']);
  assert.equal(eventi[0].testo + eventi[1].testo, 'Prima dopo.');
  assert.equal(eventi.some(e => e.tool_calls), false);
});

for (const modo of ['permesso', 'permesso-senza-rifiuto']) test(`PL-ACP-03 — ${modo}: nessuna approvazione implicita`, async t => {
  const f = await prepara(t, modo), eventi = [];
  const a = await connettiAgenteAcp(f.runtime, { onEvento: e => eventi.push(e) });
  f.risorse.agente = a;
  await a.prompt(testo);
  const r = (await f.leggi()).find(m => m.id === 'permesso-1' && m.result);
  assert.deepEqual(r.result.outcome, modo === 'permesso' ? { outcome: 'selected', optionId: 'no' } : { outcome: 'cancelled' });
  assert.match(eventi[0].testo, /rifiutata.*conferma/iu);
});

for (const modo of ['stop', 'ignora-stop']) test(`PL-ACP-04 — ${modo}: cancel e nessun processo orfano`, async t => {
  const f = await prepara(t, modo);
  const stop = new AbortController();
  const a = await connettiAgenteAcp(f.runtime, { signal: stop.signal, onEvento: () => stop.abort() });
  f.risorse.agente = a;
  await assert.rejects(a.prompt(testo), e => e.code === 'ACP_CANCELLED' && e.classe === 'fermato');
  await a.chiudi();
  assert.ok((await f.leggi()).some(m => m.method === 'session/cancel'));
  morto(a.pid);
});

test('PL-ACP-05 — morte a metà: errore classificato dalla tabella BC-44', async t => {
  const f = await prepara(t, 'muore');
  const a = await connettiAgenteAcp(f.runtime);
  f.risorse.agente = a;
  await assert.rejects(a.prompt(testo), e => e.code === 'ACP_PROCESS_EXITED' && e.classe === 'flusso-interrotto' && e.transitorio);
  await a.chiudi(); morto(a.pid);
});

test('PL-ACP-06 — versione sconosciuta chiude prima di session/new', async t => {
  const f = await prepara(t, 'versione');
  await assert.rejects(connettiAgenteAcp(f.runtime), { code: 'ACP_VERSION_UNSUPPORTED' });
  const righe = await f.leggi(); morto(righe[0].pid);
  assert.equal(righe.some(m => m.method === 'session/new'), false);
});

test('PL-ACP-07 — ambiente minimo e nomi dichiarati, segreti vietati negli argomenti', async t => {
  const f = await prepara(t);
  f.runtime.variabiliAmbiente = ['PL_CHIAVE_DICHIARATA'];
  const env = { PL_CHIAVE_DICHIARATA: 'segreto-finto-pl', PL_CHIAVE_VIETATA: 'non-passare', NODE_OPTIONS: '--non-valido' };
  const a = await connettiAgenteAcp(f.runtime, { env });
  f.risorse.agente = a;
  const prima = (await f.leggi())[0];
  assert.equal(prima.dichiarata, true);
  assert.equal(prima.vietata, false);
  // PL-REG-WINDOWS-ENV: queste tre variabili OS sono aggiunte su questo Windows.
  const aggiunteOs = process.platform === 'win32' ? ['LOGONSERVER', 'USERDOMAIN', 'WINDIR'] : [];
  assert.ok(prima.ambiente.every(k => [...DEFAULT_INHERITED_ENV_VARS, ...aggiunteOs, 'PL_CHIAVE_DICHIARATA'].map(v => v.toUpperCase()).includes(k.toUpperCase())));
  assert.throws(() => validaRuntimeAgenteEsterno({ ...f.runtime, argomenti: ['--api-key', 'segreto-finto-pl'] }, { env }), { code: 'ACP_RUNTIME_INVALID' });
  assert.throws(() => validaRuntimeAgenteEsterno({ ...f.runtime, variabiliAmbiente: ['NODE_OPTIONS'] }, { env }), { code: 'ACP_RUNTIME_INVALID' });
  assert.throws(() => validaRuntimeAgenteEsterno({ ...f.runtime, cwd: '.' }), { code: 'ACP_RUNTIME_INVALID' });
  assert.throws(() => validaRuntimeAgenteEsterno({ ...f.runtime, argomenti: ['--auth-token=qualunque'] }, { env }), { code: 'ACP_RUNTIME_INVALID' });
  assert.throws(() => validaRuntimeAgenteEsterno({ ...f.runtime, argomenti: ['non-passare'] }, { env: { ...env, OPENAI_API_KEY: 'non-passare' } }), { code: 'ACP_RUNTIME_INVALID' });
});

// PL-REG-STDIO-NONJSON: il parser upstream ignora SyntaxError; il limite temporale resta attivo.
for (const [modo, codice] of [['handshake-fermo', 'ACP_TIMEOUT'], ['malformato', 'ACP_TIMEOUT'], ['forma-invalida', 'ACP_PROTOCOL_INVALID'], ['errore', 'ACP_REQUEST_FAILED'], ['sessione-estranea', 'ACP_PROTOCOL_INVALID']]) test(`PL-ACP-08/09 — ${modo}: errore visibile e processo chiuso`, async t => {
  const f = await prepara(t, modo);
  f.runtime.timeoutMs = modo === 'handshake-fermo' ? 100 : 2000;
  let a;
  await assert.rejects(async () => { a = await connettiAgenteAcp(f.runtime); await a.prompt(testo); }, e => e.code === codice && !e.message.includes('segreto-finto-pl'));
  await a?.chiudi();
  const righe = await f.leggi(); morto(righe[0].pid);
});

test('PL-ACP-10 — filesystem non annunciato rifiutato e comunicato', async t => {
  const f = await prepara(t, 'rpc-fs'), eventi = [];
  const a = await connettiAgenteAcp(f.runtime, { onEvento: e => eventi.push(e) });
  f.risorse.agente = a;
  await a.prompt(testo);
  assert.equal((await f.leggi()).find(m => m.id === 'fs-1' && m.error).error.code, -32601);
  assert.equal(eventi[0].tipo, 'avviso');
});

test('PL-ACP-11 — messaggi nei due versi conformi allo schema upstream fissato; mutazioni respinte', async t => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/acp-v1-conformita.json', import.meta.url), 'utf8'));
  const schemi = new Map();
  const valida = (nome, dato) => {
    if (!schemi.has(nome)) schemi.set(nome, z.fromJSONSchema({ ...fixture.schema, $ref: `#/$defs/${nome}` }));
    return schemi.get(nome).safeParse(dato);
  };
  const nomi = { initialize: ['InitializeRequest', 'InitializeResponse'], 'session/new': ['NewSessionRequest', 'NewSessionResponse'],
    'session/prompt': ['PromptRequest', 'PromptResponse'], 'session/cancel': ['CancelNotification'],
    'session/update': ['SessionNotification'], 'session/request_permission': ['RequestPermissionRequest', 'RequestPermissionResponse'] };
  for (const modo of ['normale', 'permesso', 'stop']) {
    const f = await prepara(t, modo), stop = new AbortController();
    const a = await connettiAgenteAcp(f.runtime, { signal: stop.signal, onEvento: () => { if (modo === 'stop') stop.abort(); } });
    f.risorse.agente = a;
    if (modo === 'stop') await assert.rejects(a.prompt(testo), { code: 'ACP_CANCELLED' });
    else await a.prompt(testo);
    await a.chiudi();
    const richieste = new Map();
    for (const riga of await f.leggi()) {
      if (riga.pid) continue;
      const direzione = riga.direzione ?? 'client';
      const m = riga.messaggio ?? riga;
      assert.equal(m.jsonrpc, '2.0');
      if (m.method) {
        const nome = nomi[m.method]?.[0];
        assert.ok(nome, `Metodo inatteso: ${m.method}`);
        assert.equal(valida(nome, m.params).success, true, `${m.method}: ${JSON.stringify(valida(nome, m.params).error)}`);
        if (m.id !== undefined) richieste.set(`${direzione}:${m.id}`, m.method);
      } else {
        const metodo = richieste.get(`${direzione === 'agente' ? 'client' : 'agente'}:${m.id}`);
        assert.ok(metodo, 'Risposta senza richiesta');
        assert.equal(valida(nomi[metodo][1], m.result).success, true, metodo);
      }
    }
  }
  assert.equal(valida('InitializeRequest', { protocolVersion: '1' }).success, false);
  assert.equal(valida('NewSessionRequest', { cwd: '/progetto' }).success, false);
  assert.equal(valida('PromptResponse', { stopReason: 'inventato' }).success, false);
  assert.equal(valida('RequestPermissionResponse', { outcome: { outcome: 'selected' } }).success, false);
});
