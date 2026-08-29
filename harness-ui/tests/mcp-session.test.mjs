import assert from 'node:assert/strict';
import test from 'node:test';

import { nomeEspostoMcp, preparaToolMcpPerSessione } from '../src/mcp-session.mjs';

/**
 * ⭐ Stesso principio di mcp-client.test.mjs: mai un processo/registro
 * VERO nei test unitari — tutte le dipendenze di preparaToolMcpPerSessione
 * sono iniettabili (deps), qui finte.
 */
function serverFinto(id, { comando = 'npx', argomenti = [], allowlist = ['read_file'] } = {}) {
  return { id, comando, argomenti, allowlist, hash: `hash-${id}` };
}

function clientFinto(id, { tools = [{ name: 'read_file', description: 'legge', inputSchema: { type: 'object' } }], callToolFn = null } = {}) {
  const chiuso = { valore: false };
  return {
    id,
    tools,
    callToolFn,
    chiuso,
    chiudi: async () => { chiuso.valore = true; },
  };
}

test('⭐ nomeEspostoMcp: pura, formato mcp__<serverId>__<toolName>', () => {
  assert.equal(nomeEspostoMcp('filesystem', 'read_file'), 'mcp__filesystem__read_file');
});

test('⭐⭐⭐ un server fidato: toolMcp col nome prefissato, chiamaToolMcpFn instrada al client giusto col nome ORIGINALE', async () => {
  const server = serverFinto('filesystem');
  const client = clientFinto('filesystem', { callToolFn: null });
  const chiamateCallTool = [];

  const { toolMcp, chiamaToolMcpFn, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [server], nonFidati: [] }),
      connettiServerMcpFn: async () => ({ client, chiudi: client.chiudi }),
      elencaToolMcpFn: async () => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
      chiamaToolMcpFn: async ({ client: c }, nome, argomenti) => { chiamateCallTool.push({ clientId: c.id, nome, argomenti }); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    },
  );

  assert.deepEqual(falliti, []);
  assert.equal(toolMcp.length, 1);
  assert.equal(toolMcp[0].name, 'mcp__filesystem__read_file');
  assert.equal(toolMcp[0].description, 'legge');

  const esito = await chiamaToolMcpFn('mcp__filesystem__read_file', { path: '/tmp/x.txt' });
  assert.deepEqual(chiamateCallTool, [{ clientId: 'filesystem', nome: 'read_file', argomenti: { path: '/tmp/x.txt' } }]);
  assert.equal(esito.content[0].text, 'ok');
});

test('⭐⭐ due server con un tool OMONIMO: entrambi compaiono, nomi diversi, instradati al client giusto ciascuno', async () => {
  const serverA = serverFinto('alfa');
  const serverB = serverFinto('beta');
  const clientA = clientFinto('alfa');
  const clientB = clientFinto('beta');
  const chiamate = [];

  const { toolMcp, chiamaToolMcpFn } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [serverA, serverB], nonFidati: [] }),
      connettiServerMcpFn: async ({ nome }) => (nome.includes('alfa') ? { client: clientA, chiudi: clientA.chiudi } : { client: clientB, chiudi: clientB.chiudi }),
      elencaToolMcpFn: async ({ client }) => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
      chiamaToolMcpFn: async ({ client: c }, nome) => { chiamate.push({ clientId: c.id, nome }); return { content: [], isError: false }; },
    },
  );

  assert.deepEqual(toolMcp.map((t) => t.name).sort(), ['mcp__alfa__read_file', 'mcp__beta__read_file']);
  await chiamaToolMcpFn('mcp__alfa__read_file', {});
  await chiamaToolMcpFn('mcp__beta__read_file', {});
  assert.deepEqual(chiamate, [{ clientId: 'alfa', nome: 'read_file' }, { clientId: 'beta', nome: 'read_file' }]);
});

test('⭐⭐ filtraToolMcpFn è applicato: un tool fuori allowlist non compare in toolMcp', async () => {
  const server = serverFinto('filesystem', { allowlist: ['read_file'] });
  const client = clientFinto('filesystem', { tools: [
    { name: 'read_file', description: 'legge', inputSchema: {} },
    { name: 'delete_file', description: 'elimina — NON nell\'allowlist', inputSchema: {} },
  ] });

  const { toolMcp } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [server], nonFidati: [] }),
      connettiServerMcpFn: async () => ({ client, chiudi: client.chiudi }),
      elencaToolMcpFn: async () => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
    },
  );

  assert.deepEqual(toolMcp.map((t) => t.name), ['mcp__filesystem__read_file']);
});

test('⛔⛔⛔ AL CONTRARIO — un server che fallisce a CONNETTERSI finisce in "falliti", non blocca gli altri server', async () => {
  const serverRotto = serverFinto('rotto');
  const serverSano = serverFinto('sano');
  const clientSano = clientFinto('sano');

  const { toolMcp, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [serverRotto, serverSano], nonFidati: [] }),
      connettiServerMcpFn: async ({ nome }) => {
        if (nome.includes('rotto')) throw new Error('comando non trovato');
        return { client: clientSano, chiudi: clientSano.chiudi };
      },
      elencaToolMcpFn: async () => clientSano.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
    },
  );

  assert.equal(falliti.length, 1);
  assert.equal(falliti[0].serverId, 'rotto');
  assert.match(falliti[0].errore, /comando non trovato/);
  assert.deepEqual(toolMcp.map((t) => t.name), ['mcp__sano__read_file'], 'il server sano deve funzionare comunque');
});

test('⛔⛔ AL CONTRARIO — un server che fallisce a ELENCARE i tool finisce in "falliti", zero tool da lui, altri intatti', async () => {
  const serverRotto = serverFinto('rotto');
  const serverSano = serverFinto('sano');
  const clientRotto = clientFinto('rotto');
  const clientSano = clientFinto('sano');

  const { toolMcp, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [serverRotto, serverSano], nonFidati: [] }),
      connettiServerMcpFn: async ({ nome }) => (nome.includes('rotto') ? { client: clientRotto, chiudi: clientRotto.chiudi } : { client: clientSano, chiudi: clientSano.chiudi }),
      elencaToolMcpFn: async ({ client }) => { if (client.id === 'rotto') throw new Error('protocollo non risponde'); return client.tools; },
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
    },
  );

  assert.equal(falliti.length, 1);
  assert.match(falliti[0].errore, /elenco tool fallito/);
  assert.deepEqual(toolMcp.map((t) => t.name), ['mcp__sano__read_file']);
});

test('⛔ AL CONTRARIO — zero server fidati: toolMcp vuoto, chiamaToolMcpFn null (mai una funzione inerte)', async () => {
  const { toolMcp, chiamaToolMcpFn, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    { serverMcpFidatiFn: async () => ({ fidati: [], nonFidati: [] }) },
  );
  assert.deepEqual(toolMcp, []);
  assert.equal(chiamaToolMcpFn, null);
  assert.deepEqual(falliti, []);
});

test('⛔⛔ AL CONTRARIO — il registro che LANCIA degrada a "nessun server", mai un\'eccezione che blocca la sessione', async () => {
  const { toolMcp, chiamaToolMcpFn, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    { serverMcpFidatiFn: async () => { throw new Error('registro illeggibile') } },
  );
  assert.deepEqual(toolMcp, []);
  assert.equal(chiamaToolMcpFn, null);
  assert.deepEqual(falliti, []);
});

test('⭐⭐⭐ chiudiTutti(): chiude DAVVERO ogni connessione aperta', async () => {
  const serverA = serverFinto('alfa');
  const serverB = serverFinto('beta');
  const clientA = clientFinto('alfa');
  const clientB = clientFinto('beta');

  const { chiudiTutti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [serverA, serverB], nonFidati: [] }),
      connettiServerMcpFn: async ({ nome }) => (nome.includes('alfa') ? { client: clientA, chiudi: clientA.chiudi } : { client: clientB, chiudi: clientB.chiudi }),
      elencaToolMcpFn: async ({ client }) => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
    },
  );

  assert.equal(clientA.chiuso.valore, false);
  assert.equal(clientB.chiuso.valore, false);
  await chiudiTutti();
  assert.equal(clientA.chiuso.valore, true);
  assert.equal(clientB.chiuso.valore, true);
});

test('⛔ AL CONTRARIO — chiudiTutti() con un chiudi() che LANCIA non impedisce agli altri di chiudersi', async () => {
  const serverA = serverFinto('alfa');
  const serverB = serverFinto('beta');
  const clientB = clientFinto('beta');

  const { chiudiTutti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [serverA, serverB], nonFidati: [] }),
      connettiServerMcpFn: async ({ nome }) => (nome.includes('alfa')
        ? { client: { id: 'alfa', tools: [] }, chiudi: async () => { throw new Error('chiusura fallita') } }
        : { client: clientB, chiudi: clientB.chiudi }),
      elencaToolMcpFn: async ({ client }) => client.tools ?? [],
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
    },
  );

  await chiudiTutti(); // non deve lanciare
  assert.equal(clientB.chiuso.valore, true, 'beta deve chiudersi comunque anche se alfa fallisce');
});

test('⛔⛔⛔ AL CONTRARIO — chiamaToolMcpFn su un nome MAI connesso in questa sessione lancia, mai un tentativo verso un client a caso', async () => {
  const server = serverFinto('filesystem');
  const client = clientFinto('filesystem');

  const { chiamaToolMcpFn } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: [server], nonFidati: [] }),
      connettiServerMcpFn: async () => ({ client, chiudi: client.chiudi }),
      elencaToolMcpFn: async () => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
    },
  );

  await assert.rejects(
    chiamaToolMcpFn('mcp__server-inventato__tool-inventato', {}),
    /non è fra quelli connessi/,
  );
});
