/*
 * Owner 17/10/2026 («Avviso in chat + stato in Estensioni»): l'esito d'avvio di ogni server MCP fidato diventa un evento durevole della
 * sessione (`talos.mcp-avvio`). Prima i server che non partivano si scartavano in silenzio (`agent-service.mjs`, `falliti` mai letto).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { preparaToolMcpPerSessione } from '../src/mcp-session.mjs';
import { avviaSessione } from '../src/agent-service.mjs';

const server = (id) => ({ id, comando: id, argomenti: [], allowlist: ['read_file'], hash: `hash-${id}` });
const client = { tools: [{ name: 'read_file', description: 'legge', inputSchema: { type: 'object' } }] };

test('MCP-ESITI-01 — every trusted server gets its outcome, in order, with its hash and translated reason', async () => {
  const { esiti, falliti } = await preparaToolMcpPerSessione({ cartella: '/tmp/p', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [server('fs'), server('git'), server('muto')], nonFidati: [] }),
    connettiServerMcpFn: async ({ comando }) => {
      if (comando === 'git') throw Object.assign(new Error('"git" was not found on PATH.'), { chiave: 'server.program.notOnPath', params: { command: 'git', example: './git' } });
      return { client, chiudi: async () => {} };
    },
    elencaToolMcpFn: async ({ client: c }) => { if (c !== client) throw new Error('?'); return client.tools; },
    filtraToolMcpFn: (tool, allowlist) => tool.filter((t) => allowlist.includes(t.name)),
  });
  assert.deepEqual(esiti.map((e) => [e.serverId, e.hash, e.esito]), [['fs', 'hash-fs', 'collegato'], ['git', 'hash-git', 'non-partito'], ['muto', 'hash-muto', 'collegato']]);
  assert.equal(esiti[1].motivoChiave, 'server.program.notOnPath');
  assert.deepEqual(esiti[1].motivoParams, { command: 'git', example: './git' });
  assert.equal(falliti.length, 1, 'falliti unchanged for whoever already reads it');
});

test('MCP-ESITI-02 — a server whose tool list fails is "non-partito" with an English reason and its key', async () => {
  const { esiti } = await preparaToolMcpPerSessione({ cartella: '/tmp/p', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [server('rotto')], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client, chiudi: async () => {} }),
    elencaToolMcpFn: async () => { throw new Error('protocollo muto'); },
    filtraToolMcpFn: (tool) => tool,
  });
  assert.equal(esiti[0].esito, 'non-partito');
  assert.equal(esiti[0].motivo, 'listing the tools failed: protocollo muto');
  assert.equal(esiti[0].motivoChiave, 'server.mcp.toolListFailed');
  assert.deepEqual(esiti[0].motivoParams, { detail: 'protocollo muto' });
});

test('MCP-ESITI-03 — the session emits ONE durable talos.mcp-avvio event with the outcomes; AL CONTRARIO none without servers', async () => {
  const lancia = async (esiti) => {
    const eventi = [];
    await avviaSessione({
      cartella: '/tmp/p', task: { consegna: 'x' }, modello: 'm', chiave: 'k', cartellaTrustMcp: '/tmp/t',
      onEvento: (evento, opzioni) => { eventi.push({ evento, opzioni }); },
      talosLavoraFn: async () => ({ comeFinita: 'concluso', detto: 'fatto' }),
      preparaToolMcpPerSessioneFn: async () => ({ toolMcp: [], chiamaToolMcpFn: null, falliti: [], esiti, chiudiTutti: async () => {} }),
    });
    return eventi.filter(({ evento }) => evento.type === 'CUSTOM' && evento.name === 'talos.mcp-avvio');
  };
  const esiti = [{ serverId: 'git', hash: 'h', esito: 'non-partito', motivo: 'boom' }];
  const emessi = await lancia(esiti);
  assert.equal(emessi.length, 1);
  assert.deepEqual(emessi[0].evento.value.esiti, esiti);
  assert.equal(typeof emessi[0].evento.value.id, 'string');
  assert.equal(emessi[0].opzioni?.durable, true);
  assert.equal((await lancia([])).length, 0);
});

test('MCP-ESITI-04 — revisione D: a third-party reason is capped before it is written (50.000 characters were a 50.000-character note)', async () => {
  const lungo = 'x'.repeat(50_000);
  const { esiti } = await preparaToolMcpPerSessione({ cartella: '/tmp/p', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [server('rotto')], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client, chiudi: async () => {} }),
    elencaToolMcpFn: async () => { throw new Error(lungo); },
    filtraToolMcpFn: (tool) => tool,
  });
  assert.ok(esiti[0].motivo.length <= 500, String(esiti[0].motivo.length));
  assert.ok(esiti[0].motivoParams.detail.length <= 300, String(esiti[0].motivoParams.detail.length));
  /* AL CONTRARIO: un motivo corto resta intero */
  const { esiti: brevi } = await preparaToolMcpPerSessione({ cartella: '/tmp/p', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [server('rotto')], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client, chiudi: async () => {} }),
    elencaToolMcpFn: async () => { throw new Error('protocollo muto'); },
    filtraToolMcpFn: (tool) => tool,
  });
  assert.equal(brevi[0].motivoParams.detail, 'protocollo muto');
  /* riverifica D: il taglio non spezza un'emoji (una mezza coppia surrogata arrivava a schermo come U+FFFD) */
  const conEmoji = `${'y'.repeat(298)}\u{1F600}\u{1F600}${'z'.repeat(50)}`;
  const { esiti: tagliati } = await preparaToolMcpPerSessione({ cartella: '/tmp/p', cartellaTrust: '/tmp/t' }, {
    serverMcpFidatiFn: async () => ({ fidati: [server('rotto')], nonFidati: [] }),
    connettiServerMcpFn: async () => ({ client, chiudi: async () => {} }),
    elencaToolMcpFn: async () => { throw new Error(conEmoji); },
    filtraToolMcpFn: (tool) => tool,
  });
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(tagliati[0].motivoParams.detail), false, 'no lone surrogate');
});
