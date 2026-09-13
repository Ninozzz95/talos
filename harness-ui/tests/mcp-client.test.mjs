import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chiamaToolMcp,
  connettiServerMcp,
  elencaToolMcp,
  filtraToolMcp,
} from '../src/mcp-client.mjs';

/**
 * ⭐ Stesso principio di `pty-terminal.test.mjs`: mai un processo MCP
 * VERO nei test unitari (uno spawn `npx` non è deterministico e costa
 * secondi) — classi finte iniettabili che implementano esattamente la
 * superficie usata da `mcp-client.mjs` (`connect`/`close`/`listTools`/
 * `callTool`), verificate contro il server reale
 * `@modelcontextprotocol/server-filesystem` in uno script a parte
 * (`_verifica-mcp-temp.mjs`, girato dal vivo il 29/8: 14 tool reali
 * scoperti, un file letto per davvero, un errore onesto su un file
 * inesistente — non presunto, misurato prima di scrivere questi mock).
 */
function clientFinto({ tools = [], callToolFn = null, connectFn = null } = {}) {
  const chiamateConnect = [];
  const chiamateClose = [];
  const chiamateListTools = [];
  const chiamateCallTool = [];
  const finto = {
    async connect(transport) {
      chiamateConnect.push(transport);
      if (connectFn) await connectFn(transport);
    },
    async close() {
      chiamateClose.push(true);
    },
    async listTools() {
      chiamateListTools.push(true);
      return { tools };
    },
    async callTool(argomenti) {
      chiamateCallTool.push(argomenti);
      if (callToolFn) return callToolFn(argomenti);
      return { content: [], isError: false };
    },
    _chiamateConnect: chiamateConnect,
    _chiamateClose: chiamateClose,
    _chiamateListTools: chiamateListTools,
    _chiamateCallTool: chiamateCallTool,
  };
  return finto;
}

function transportFinto() {
  return { _tipo: 'transport-finto' };
}

test('⭐⭐⭐ connettiServerMcp: costruisce Client/Transport coi parametri giusti e chiama connect', async () => {
  const client = clientFinto();
  let argomentiClient = null;
  let argomentiTransport = null;
  const ClientCls = function (opts) { argomentiClient = opts; return client; };
  const TransportCls = function (opts) { argomentiTransport = opts; return transportFinto(); };

  const risultato = await connettiServerMcp(
    { comando: 'npx', argomenti: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/prova'], nome: 'prova', versione: '2.0.0' },
    { ClientCls, TransportCls },
  );

  assert.deepEqual(argomentiClient, { name: 'prova', version: '2.0.0' });
  assert.deepEqual(argomentiTransport, { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp/prova'] });
  assert.equal(client._chiamateConnect.length, 1);
  assert.equal(risultato.client, client);
  assert.equal(typeof risultato.chiudi, 'function');
});

test('⭐⭐ connettiServerMcp: nome/versione hanno un default onesto quando non passati', async () => {
  const client = clientFinto();
  let argomentiClient = null;
  const ClientCls = function (opts) { argomentiClient = opts; return client; };
  const TransportCls = function () { return transportFinto(); };

  await connettiServerMcp({ comando: 'npx' }, { ClientCls, TransportCls });

  assert.equal(argomentiClient.name, 'talos-harness-desktop');
  assert.equal(argomentiClient.version, '1.0.0');
});

test('⭐⭐ connettiServerMcp: argomenti assenti diventano un array vuoto, mai undefined verso il transport', async () => {
  const client = clientFinto();
  let argomentiTransport = null;
  const ClientCls = function () { return client; };
  const TransportCls = function (opts) { argomentiTransport = opts; return transportFinto(); };

  await connettiServerMcp({ comando: 'npx' }, { ClientCls, TransportCls });

  assert.deepEqual(argomentiTransport.args, []);
});

test('⭐⭐⭐ connettiServerMcp: chiudi() chiama DAVVERO client.close()', async () => {
  const client = clientFinto();
  const ClientCls = function () { return client; };
  const TransportCls = function () { return transportFinto(); };

  const { chiudi } = await connettiServerMcp({ comando: 'npx' }, { ClientCls, TransportCls });
  assert.equal(client._chiamateClose.length, 0);
  await chiudi();
  assert.equal(client._chiamateClose.length, 1);
});

test('⛔⛔⛔ AL CONTRARIO — connettiServerMcp: un connect() che fallisce si propaga, non sparisce in un null', async () => {
  const client = clientFinto({ connectFn: async () => { throw new Error('server non parte'); } });
  const ClientCls = function () { return client; };
  const TransportCls = function () { return transportFinto(); };

  await assert.rejects(
    connettiServerMcp({ comando: 'npx' }, { ClientCls, TransportCls }),
    /server non parte/,
  );
});

test('⭐⭐⭐ elencaToolMcp: torna l\'array grezzo di client.listTools()', async () => {
  const tools = [
    { name: 'read_file', description: 'legge un file', inputSchema: { type: 'object' } },
    { name: 'write_file', description: 'scrive un file', inputSchema: { type: 'object' } },
  ];
  const client = clientFinto({ tools });

  const risultato = await elencaToolMcp({ client });

  assert.deepEqual(risultato, tools);
  assert.equal(client._chiamateListTools.length, 1);
});

test('⛔⭐⭐ AL CONTRARIO — elencaToolMcp: zero tool è un array vuoto, mai un errore', async () => {
  const client = clientFinto({ tools: [] });
  const risultato = await elencaToolMcp({ client });
  assert.deepEqual(risultato, []);
});

test('⭐⭐⭐ filtraToolMcp: un nome nell\'allowlist passa, tutti gli altri no', () => {
  const tool = [
    { name: 'read_file' },
    { name: 'write_file' },
    { name: 'delete_file' },
  ];
  const filtrati = filtraToolMcp(tool, ['read_file']);
  assert.deepEqual(filtrati.map((t) => t.name), ['read_file']);
});

test('⭐⭐ filtraToolMcp: più nomi nell\'allowlist, ordine originale preservato', () => {
  const tool = [
    { name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' },
  ];
  const filtrati = filtraToolMcp(tool, ['c', 'a']);
  assert.deepEqual(filtrati.map((t) => t.name), ['a', 'c']);
});

test('⛔⛔⛔ AL CONTRARIO — filtraToolMcp: un nome INVENTATO nell\'allowlist non fa passare nulla', () => {
  const tool = [{ name: 'read_file' }, { name: 'write_file' }];
  const filtrati = filtraToolMcp(tool, ['nome-che-non-esiste-di-sicuro']);
  assert.deepEqual(filtrati, []);
});

test('⛔⭐⭐ AL CONTRARIO — filtraToolMcp: allowlist vuota non fa passare nulla, anche con tool reali', () => {
  const tool = [{ name: 'read_file' }, { name: 'write_file' }];
  const filtrati = filtraToolMcp(tool, []);
  assert.deepEqual(filtrati, []);
});

test('⭐⭐⭐ chiamaToolMcp: passa {name, arguments} a client.callTool, torna il risultato grezzo', async () => {
  const client = clientFinto({
    callToolFn: () => ({ content: [{ type: 'text', text: 'contenuto vero' }], isError: false }),
  });

  const risultato = await chiamaToolMcp({ client }, 'read_file', { path: '/tmp/ciao.txt' });

  assert.deepEqual(client._chiamateCallTool[0], { name: 'read_file', arguments: { path: '/tmp/ciao.txt' } });
  assert.deepEqual(risultato.content, [{ type: 'text', text: 'contenuto vero' }]);
  assert.equal(risultato.isError, false);
});

test('⛔⛔⭐⭐⭐ AL CONTRARIO — chiamaToolMcp: un isError:true del tool NON lancia, torna un esito onesto', async () => {
  const client = clientFinto({
    callToolFn: () => ({ content: [{ type: 'text', text: 'file non trovato' }], isError: true }),
  });

  // Non deve rifiutare la promise — un isError:true è un ESITO del
  // tool, non un guasto del trasporto (stessa distinzione già in uso
  // in corsaDiCoding.mjs fra "fallito" e "erroreDellHarness").
  const risultato = await chiamaToolMcp({ client }, 'read_file', { path: '/tmp/non-esiste.txt' });
  assert.equal(risultato.isError, true);
});

test('⛔⭐⭐ AL CONTRARIO — chiamaToolMcp: un guasto VERO del trasporto (callTool rifiuta) si propaga', async () => {
  const client = clientFinto({
    callToolFn: () => { throw new Error('connessione persa'); },
  });

  await assert.rejects(
    chiamaToolMcp({ client }, 'read_file', { path: '/tmp/x.txt' }),
    /connessione persa/,
  );
});
