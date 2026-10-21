import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { provaUnServerMcp } from '../src/mcp-session.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 18/10/2026 — R5.8, «test e riconnessione di un MCP» (decisione owner del 17/10, dal PC e dal telefono). Le connessioni MCP vivono
 * un giro alla volta: la prova avvia UN server fidato come lo avvia un giro, lo chiude, e ne scrive l'esito negli eventi
 * (`talos.mcp-avvio`, `prova:true`), così Estensioni e la nota in chat si aggiornano e il prossimo giro lo usa.
 */
const SRV = (id) => ({ id, comando: 'node', argomenti: ['mcp-finto.mjs'], allowlist: ['leggi'], hash: `h-${id}` });
function dipendenze({ dichiarati = [SRV('docs')], fidati = [SRV('docs')], parte = true, attrezzi = [{ name: 'leggi', inputSchema: {} }, { name: 'scrivi', inputSchema: {} }] } = {}) {
  const chiamate = { connetti: 0, chiudi: 0 };
  return {
    chiamate,
    deps: {
      caricaServerMcpFn: async () => ({ server: dichiarati }),
      serverMcpFidatiFn: async () => ({ fidati }),
      connettiServerMcpFn: async () => { chiamate.connetti += 1; if (!parte) throw Object.assign(new Error('spawn node ENOENT'), { chiave: 'server.program.notOnPath', params: { program: 'node' } }); return { client: {}, chiudi: async () => { chiamate.chiudi += 1; } }; },
      elencaToolMcpFn: async () => attrezzi,
      filtraToolMcpFn: (tutti, allow) => tutti.filter((t) => allow.includes(t.name)),
      clock: (() => { let t = 1000; return () => (t += 25); })(),
    },
  };
}

test('MCP-PROVA-01 un server fidato si avvia come in un giro, si conta, si chiude', async () => {
  const d = dipendenze();
  const r = await provaUnServerMcp({ cartella: 'C:/p', cartellaTrust: 'C:/t', serverId: 'docs' }, d.deps);
  assert.deepEqual([r.trovato, r.fidato, r.esito.esito, r.esito.hash, r.attrezzi], [true, true, 'collegato', 'h-docs', 1], 'gli attrezzi contati dopo la lista ammessa');
  assert.deepEqual(d.chiamate, { connetti: 1, chiudi: 1 });
});

test('MCP-PROVA-02 al contrario: un server che non parte dà il motivo con la sua chiave; uno NON fidato non si avvia mai; uno non dichiarato non c\'è', async () => {
  const giu = dipendenze({ parte: false });
  const r = await provaUnServerMcp({ cartella: 'C:/p', cartellaTrust: 'C:/t', serverId: 'docs' }, giu.deps);
  assert.deepEqual([r.esito.esito, r.esito.motivoChiave], ['non-partito', 'server.program.notOnPath']);
  const nonFidato = dipendenze({ fidati: [] });
  const nf = await provaUnServerMcp({ cartella: 'C:/p', cartellaTrust: 'C:/t', serverId: 'docs' }, nonFidato.deps);
  assert.deepEqual([nf.trovato, nf.fidato, nonFidato.chiamate.connetti], [true, false, 0], 'mai eseguito codice di un server non fidato');
  const assente = await provaUnServerMcp({ cartella: 'C:/p', cartellaTrust: 'C:/t', serverId: 'altro' }, dipendenze().deps);
  assert.deepEqual([assente.trovato, assente.fidato], [false, false]);
});

async function registroCon(provaServerMcpFn) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-mcp-prova-'));
  await mkdir(join(radice, 'p'), { recursive: true });
  let fine;
  const registro = createSessionRegistry({
    modello: 'm', chiave: 'k', provaServerMcpFn,
    avviaSessioneFn: async (i) => { i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return new Promise((ok) => { fine = () => { i.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r1' }); ok({ ok: true }); }; }); },
    preparaEsecuzioneFn: (taskId) => ({ cartella: join(radice, 'p'), comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero');
  const banco = { registro, sessionId, togli: null, via: async () => { banco.togli?.(); fine?.(); await registro.attendiAssestamento?.(sessionId); await rimuoviCartellaDiProvaAttesa(radice); } };
  return banco;
}

test('MCP-PROVA-03 il registro scrive l\'esito negli eventi (prova:true) e lo dice; non fidato e non dichiarato sono rifiuti', async () => {
  const b = await registroCon(async ({ serverId }) => (serverId === 'docs'
    ? { trovato: true, fidato: true, esito: { serverId: 'docs', hash: 'h', esito: 'collegato' }, attrezzi: 3, ms: 40 }
    : serverId === 'nuovo' ? { trovato: true, fidato: false } : { trovato: false, fidato: false }));
  try {
    const ricevuti = [];
    b.togli = b.registro.iscriviti(b.sessionId, (e) => ricevuti.push(e)); // si toglie alla fine: un ascoltatore vivo tiene vivi i timer del giro
    assert.deepEqual(await b.registro.provaServerMcp(b.sessionId, 'docs'), { ok: true, esito: 'collegato', attrezzi: 3, ms: 40 });
    const ev = ricevuti.find((e) => e.type === 'CUSTOM' && e.name === 'talos.mcp-avvio');
    assert.deepEqual([ev?.value.prova, ev?.value.esiti], [true, [{ serverId: 'docs', hash: 'h', esito: 'collegato' }]]);
    const nf = await b.registro.provaServerMcp(b.sessionId, 'nuovo');
    assert.deepEqual([nf.code, nf.reason], ['SESSION_NOT_READY', 'mcp-not-trusted']);
    const na = await b.registro.provaServerMcp(b.sessionId, 'boh');
    assert.deepEqual([na.code, na.reason, na.params], ['NOT_FOUND', 'mcp-server-not-found', { serverId: 'boh' }]);
  } finally { await b.via(); }
});

test('MCP-PROVA-04 la rotta: POST a corpo vuoto, 400 con altre chiavi, 409 per un non fidato; il telefono ci arriva per id', async (t) => {
  const chiamate = [];
  const sessionRegistry = {
    provaServerMcp: async (id, srv) => { chiamate.push([id, srv]); return srv === 'nuovo' ? { erroreAvvio: 'x', code: 'SESSION_NOT_READY', reason: 'mcp-not-trusted' } : { ok: true, esito: 'collegato', attrezzi: 2, ms: 10 }; },
  };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chiedi = (p, corpo) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(corpo) });
  assert.equal((await (await chiedi('/api/v1/sessions/s-1/mcp/docs/test', {})).json()).data.attrezzi, 2);
  assert.equal((await chiedi('/api/v1/sessions/s-1/mcp/docs/test', { forza: true })).status, 400);
  assert.equal((await chiedi('/api/v1/sessions/s-1/mcp/nuovo/test', {})).status, 409);
  assert.deepEqual(chiamate, [['s-1', 'docs'], ['s-1', 'nuovo']]);
  const op = OPERAZIONI_HTTP['session.mcp.test'];
  assert.deepEqual([op.metodo, op.percorso({ sessionId: 's-1', serverId: 'docs' })], ['POST', '/api/v1/sessions/s-1/mcp/docs/test']);
  for (const serverId of ['../x', 'a/b', '', 5, null]) assert.throws(() => op.percorso({ sessionId: 's-1', serverId }), { code: 'BAD_MESSAGE' }, String(serverId));
});
