import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONCORRENZA_AVVIO_MCP_MASSIMA, concorrenzaAvvioMcp, nomeEspostoMcp, preparaToolMcpPerSessione,
} from '../src/mcp-session.mjs';

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

/*
 * ⭐⭐ 14/09 — F07 della review: la scoperta dei tool era SERIALE, e ogni avvio è ATTESA (un processo figlio che fa
 *   handshake), non calcolo. Qui non si misura il tempo — si misura la SOVRAPPOSIZIONE, che è la cosa che il tempo
 *   riflette e che un banco lento non può falsificare. Nessun timer vero: i server finti si fanno aspettare un numero
 *   dichiarato di micro-turni, quindi l'ordine di arrivo è deterministico e ROVESCIATO rispetto a quello dichiarato.
 */
function connettiConSovrapposizione({ saltiPerServer }) {
  const conteggio = { vivi: 0, massimoVivi: 0, ordineDiArrivo: [] };
  const connetti = async ({ nome }) => {
    const id = nome.replace('talos-harness-', '');
    conteggio.vivi += 1;
    conteggio.massimoVivi = Math.max(conteggio.massimoVivi, conteggio.vivi);
    for (let i = 0; i < (saltiPerServer[id] ?? 0); i += 1) await null;
    conteggio.vivi -= 1;
    conteggio.ordineDiArrivo.push(id);
    return { client: clientFinto(id), chiudi: async () => {} };
  };
  return { conteggio, connetti };
}

const QUATTRO = ['alfa', 'beta', 'gamma', 'delta'];
const SALTI_ROVESCIATI = { alfa: 6, beta: 4, gamma: 2, delta: 0 };

test('⭐⭐⭐ F07 — con la concorrenza accesa i server partono INSIEME, e l\'ordine dei tool resta quello DICHIARATO', async () => {
  const { conteggio, connetti } = connettiConSovrapposizione({ saltiPerServer: SALTI_ROVESCIATI });

  const { toolMcp, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: QUATTRO.map((id) => serverFinto(id)), nonFidati: [] }),
      connettiServerMcpFn: connetti,
      elencaToolMcpFn: async ({ client }) => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
      concorrenza: 4,
    },
  );

  assert.deepEqual(falliti, []);
  assert.equal(conteggio.massimoVivi, 4, 'quattro avvii aperti nello stesso momento, non uno dopo l\'altro');
  assert.deepEqual(conteggio.ordineDiArrivo, ['delta', 'gamma', 'beta', 'alfa'], 'arrivano al contrario: è il caso che smaschera un ordine preso dall\'arrivo');
  assert.deepEqual(
    toolMcp.map((t) => t.name),
    QUATTRO.map((id) => `mcp__${id}__read_file`),
    'l\'elenco esposto al modello NON dipende da chi è stato più svelto',
  );
});

test('⛔ F07 — di serie resta SERIALE: un avvio alla volta, byte per byte il comportamento di prima', async () => {
  const { conteggio, connetti } = connettiConSovrapposizione({ saltiPerServer: SALTI_ROVESCIATI });

  const { toolMcp } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: QUATTRO.map((id) => serverFinto(id)), nonFidati: [] }),
      connettiServerMcpFn: connetti,
      elencaToolMcpFn: async ({ client }) => client.tools,
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
      env: {}, // nessuna variabile: il default
    },
  );

  assert.equal(conteggio.massimoVivi, 1, 'nessuna sovrapposizione senza che qualcuno l\'abbia chiesta');
  assert.deepEqual(conteggio.ordineDiArrivo, QUATTRO, 'in fila, l\'ordine di arrivo È quello dichiarato');
  assert.equal(toolMcp.length, 4);
});

test('⛔⛔ F07 — in parallelo un server che non parte resta un FALLITO nominato, e non porta via gli altri', async () => {
  const { connetti } = connettiConSovrapposizione({ saltiPerServer: SALTI_ROVESCIATI });
  const chiusure = [];

  const { toolMcp, falliti } = await preparaToolMcpPerSessione(
    { cartella: '/tmp/prova', cartellaTrust: '/tmp/trust' },
    {
      serverMcpFidatiFn: async () => ({ fidati: QUATTRO.map((id) => serverFinto(id)), nonFidati: [] }),
      connettiServerMcpFn: async (spec) => {
        if (spec.nome.endsWith('beta')) throw new Error('comando inesistente');
        const esito = await connetti(spec);
        return { client: esito.client, chiudi: async () => { chiusure.push(esito.client.id); } };
      },
      elencaToolMcpFn: async ({ client }) => {
        if (client.id === 'gamma') throw new Error('protocollo muto');
        return client.tools;
      },
      filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
      concorrenza: 4,
    },
  );

  assert.deepEqual(toolMcp.map((t) => t.name), ['mcp__alfa__read_file', 'mcp__delta__read_file']);
  assert.deepEqual(falliti.map((f) => f.serverId), ['beta', 'gamma'], 'i falliti restano in ordine di dichiarazione, non di arrivo');
  assert.match(falliti[1].errore, /elenco tool fallito: protocollo muto/);
});

test('⛔⛔ F07 — concorrenzaAvvioMcp: spenta di serie, e qualunque valore storto torna 1 invece di far fallire la sessione', () => {
  assert.equal(concorrenzaAvvioMcp({}), 1);
  assert.equal(concorrenzaAvvioMcp({ TALOS_MCP_STARTUP_CONCURRENCY: '4' }), 4);
  assert.equal(concorrenzaAvvioMcp({ TALOS_MCP_STARTUP_CONCURRENCY: ' 3 ' }), 3);
  assert.equal(concorrenzaAvvioMcp({ TALOS_MCP_STARTUP_CONCURRENCY: '99' }), CONCORRENZA_AVVIO_MCP_MASSIMA, 'il tetto è un tetto');
  for (const storto of ['', 'due', '0', '-3', '2.5', 'NaN', null, undefined, {}]) {
    assert.equal(concorrenzaAvvioMcp({ TALOS_MCP_STARTUP_CONCURRENCY: storto }), 1, `«${String(storto)}» deve degradare a 1`);
  }
});
