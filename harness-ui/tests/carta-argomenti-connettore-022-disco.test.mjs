/*
 * Twin repair of 0.2.2, round 3 (judge v1853, point 4): the DISK. The same card through the real registry, the real agent service and the
 * real store, in its own file (its own process: after the kernel runs of carta-argomenti-connettore-022.test.mjs the registry run waited
 * past 10 s in the same process, measured 14/11; alone it answers in under a second). A fake secret made by the test goes in the arguments:
 * the card event, the pending question and every file of the store carry the masked copy, never the secret, through the new field.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const OSCURATO = '[redacted]';
const finto = () => `sk-proj-${randomBytes(24).toString('hex')}`;
const TOOL_MCP = [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } }];
const NOMI = { mcp_tool: 'mcp__github__create_issue' };

const leggiTutto = (radice) => {
  const fuori = [];
  const giu = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      const s = statSync(p);
      if (s.isDirectory()) giu(p); else fuori.push({ p, testo: readFileSync(p, 'latin1') });
    }
  };
  giu(radice);
  return fuori;
};

test('ARG-08: through the real registry: the card event, the pending question and the store on disk carry the masked arguments, never the secret', async (t) => {
  const radice = mkdtempSync(join(tmpdir(), 'carta-arg-disco-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const cartellaStore = join(radice, 'store');
  const progetto = join(radice, 'progetto');
  mkdirSync(progetto, { recursive: true });
  const segreto = finto();
  const ARG = { title: 'Weekly issue', api_key: segreto, body: `use ${segreto} now`, nested: { list: [{ password: segreto }] } };
  const enc = new TextEncoder();
  const flusso = (fotogrammi) => new Response(new ReadableStream({ start(ctl) { for (const x of fotogrammi) ctl.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`)); ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close(); } }));
  let chiamate = 0;
  const ricevutiDalServer = [];
  const fetchDiRete = async () => (chiamate++ === 0
    ? flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-arg', function: { name: NOMI.mcp_tool, arguments: JSON.stringify(ARG) } }] } }] }])
    : flusso([{ choices: [{ delta: { content: 'done' } }] }]));
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'open the issue' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({
      ...k, fetchDiRete, toolMcp: TOOL_MCP,
      chiamaToolMcpFn: async (nome, argomenti) => { ricevutiDalServer.push(JSON.stringify(argomenti)); return { content: [{ type: 'text', text: 'ok' }], isError: false }; },
    }) }),
  });
  t.after(async () => { await registro.chiudi?.(); });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const eventi = [];
  t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)));
  const aspetta = async (cond, ms = 10_000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); };
  await aspetta(() => eventi.some((e) => e.type === 'ApprovalRequested') || eventi.some((e) => e.type === 'RunError' || e.type === 'RunFinished'));
  const richiesta = eventi.find((e) => e.type === 'ApprovalRequested');
  assert.ok(richiesta, JSON.stringify(eventi.map((e) => (e.type === 'RunError' ? `${e.code}: ${e.message}` : e.name ?? e.type))));
  /* the card event and the pending question (session-registry.mjs `domandaInAttesa`) */
  assert.equal(richiesta.azione?.argomenti?.api_key, OSCURATO, 'the card event carries the masked key');
  assert.equal(richiesta.azione.argomenti.body, `use ${OSCURATO} now`);
  assert.equal(richiesta.azione.argomenti.nested.list[0].password, OSCURATO);
  const inAttesa = registro.domandaInAttesa(sessionId);
  assert.equal(inAttesa?.azione?.argomenti?.api_key, OSCURATO, 'the pending question carries the masked key');
  assert.ok(!JSON.stringify(inAttesa).includes(segreto), 'no secret in the pending question');
  assert.deepEqual(registro.rispondiApprovazione(sessionId, richiesta.requestId, true), { ok: true });
  await aspetta(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'));
  assert.deepEqual(ricevutiDalServer, [JSON.stringify(ARG)], 'the server got the real arguments, byte for byte');
  await attendiScritture({ cartellaStore });
  /* the disk: every file of the store and of the project, read whole */
  const file = [...leggiTutto(cartellaStore), ...leggiTutto(progetto)];
  const righe = file.flatMap(({ p, testo }) => testo.split('\n').map((riga) => ({ p, riga })));
  /* the lines that hold the CARD (the event with its `azione`); the agent timeline names the event too, without the card */
  const conCarta = righe.filter(({ riga }) => riga.includes('"ApprovalRequested"') && riga.includes('"azione"'));
  assert.ok(conCarta.length >= 1, 'premise: the card is in the journal');
  const senzaOscurato = conCarta.filter(({ riga }) => !riga.includes(`"api_key":"${OSCURATO}"`));
  assert.deepEqual(senzaOscurato.map(({ p, riga }) => `${p}: ${riga.slice(0, 300)}`), [], 'the journal keeps the card with the masked arguments');
  assert.ok(conCarta.every(({ riga }) => !riga.includes(segreto)), 'no secret through the new field');
  /* what held the secret before this repair (the model's own call, streamed) still does; nothing else */
  const conSegreto = righe.filter(({ riga }) => riga.includes(segreto));
  assert.ok(conSegreto.every(({ riga }) => !riga.includes('"ApprovalRequested"') && !riga.includes('"argomenti"')), JSON.stringify(conSegreto.map(({ riga }) => riga.slice(0, 120))));
});
