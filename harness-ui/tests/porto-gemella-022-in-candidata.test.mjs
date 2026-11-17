/*
 * Port of the released 0.2.2 twin into the 0.2.3 candidate (16/11/2026, judge v1954 and v1979). Two lines met in conflict:
 * - «yes for this tool in this conversation» (`ambito: 'strumento'`): the candidate wrote `si && strumentoEmulato`
 *   (`const si = approvato === true`, decision 373 round 2: «a yes is ONLY `true`»); the twin wrote
 *   `approvato === true && (strumentoEmulato || strumentoMcp)` (P018: the same scope on a connector, plugin or Tool Forge card).
 *   The merge keeps both: a STRICT yes, on an emulated card or an outside-tool card. These tests fall with either side alone:
 *   with the candidate's line the outside-tool card is refused (PORTO-01, PORTO-03), with a non-strict yes a 1 opens it (PORTO-02).
 * - the goal refuter: the candidate's No to a computer use control file (decision 373 round 3) and the twin's mark
 *   `automatico: true` on the refuter's No (CTRL-9). The control-file No is the rule's No too: it carries the mark (PORTO-05).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chiaveDellaCartaDiFuori } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CARTA_EMULATA = { tipo: 'chiamata-dal-testo', emulata: true, nome: 'scrivi', toolCallId: 'emulata-1', argomenti: { percorso: 'b.txt' } };
const CARTA_MCP = { tipo: 'mcp_tool', toolCallId: 'c1', nome: 'mcp__github__create_issue', server: 'github', attrezzo: 'create_issue' };
const CARTA_PLUGIN = { tipo: 'plugin_tool', toolCallId: 'p1', nome: 'plugin__notes__write', plugin: 'notes', attrezzo: 'write' };

async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'porto-gemella-'));
  const runs = [];
  const registro = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` });
      return promise;
    },
  });
  t.after(async () => {
    for (const [i, run] of runs.entries()) {
      try {
        run.input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` });
        run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } });
      } catch { /* already closed */ }
    }
    await registro.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup anyway */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registro.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  return { registro, sessionId, input: runs[0].input };
}
async function domanda(registro, id, input, azione) {
  const promessa = input.chiediApprovazioneFn(azione);
  await new Promise((r) => setTimeout(r, 10));
  const requestId = registro.domandaInAttesa(id)?.requestId;
  assert.ok(requestId, `premise: ${id} has an open question`);
  return { promessa, requestId };
}
const elenco = (input, campo) => [...(input.consensiSessione?.[campo] ?? [])];

test('PORTO-01: a person\'s yes «for this tool» on a connector card and on a plugin card is accepted and remembered from the question', async (t) => {
  const s = await scena(t);
  for (const carta of [CARTA_MCP, CARTA_PLUGIN]) {
    const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, carta);
    assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento' }), { ok: true }, carta.tipo);
    assert.equal(await promessa, true, carta.tipo);
  }
  assert.deepEqual(elenco(s.input, 'attrezziMcpConsentiti'), [chiaveDellaCartaDiFuori(CARTA_MCP), chiaveDellaCartaDiFuori(CARTA_PLUGIN)]);
  assert.deepEqual(elenco(s.input, 'strumentiEmulatiConsentiti'), [], 'an outside tool is not an emulated tool');
});

test('PORTO-02: only `true` is a yes «for this tool»: 1, "true", "yes" and an object are refused on both kinds of card, the question stays open', async (t) => {
  const s = await scena(t);
  for (const carta of [CARTA_MCP, CARTA_EMULATA]) {
    const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, carta);
    for (const quasi of [1, 'true', 'yes', { approvato: true }]) {
      const r = s.registro.rispondiApprovazione(s.sessionId, requestId, quasi, { ambito: 'strumento' });
      assert.equal(r.code, 'QUERY_INVALID', `${carta.tipo} ${JSON.stringify(quasi)}`);
      assert.equal(s.registro.domandaInAttesa(s.sessionId)?.requestId, requestId, 'the person can still answer');
    }
    assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, false), { ok: true });
    await promessa;
  }
  assert.deepEqual(elenco(s.input, 'attrezziMcpConsentiti'), []);
  assert.deepEqual(elenco(s.input, 'strumentiEmulatiConsentiti'), []);
});

test('PORTO-03: the emulated card keeps its «for this tool» next to the connector one, each in its own list', async (t) => {
  const s = await scena(t);
  const e = await domanda(s.registro, s.sessionId, s.input, CARTA_EMULATA);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, e.requestId, true, { ambito: 'strumento' }), { ok: true });
  await e.promessa;
  const m = await domanda(s.registro, s.sessionId, s.input, CARTA_MCP);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, m.requestId, true, { ambito: 'strumento' }), { ok: true });
  await m.promessa;
  assert.deepEqual(elenco(s.input, 'strumentiEmulatiConsentiti'), ['scrivi']);
  assert.deepEqual(elenco(s.input, 'attrezziMcpConsentiti'), [chiaveDellaCartaDiFuori(CARTA_MCP)]);
});

test('PORTO-04: a No «for this tool» on a connector card remembers nothing; on a card of no tool it is refused', async (t) => {
  const s = await scena(t);
  /* Long tasks, B (owner 13/11/2026 04:35), ported onto 0.2.3: on a connector card that No is now «No to this tool until your next
     message» — accepted, marked for the kernel, and it still remembers nothing for the session (the check at the end) */
  const mcp = await domanda(s.registro, s.sessionId, s.input, CARTA_MCP);
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, mcp.requestId, false, { ambito: 'strumento' }), { ok: true });
  assert.deepEqual(await mcp.promessa, { approvato: false, noAlloStrumento: true });
  const scrivi = await domanda(s.registro, s.sessionId, s.input, { tipo: 'scrivi', percorso: 'b.txt', toolCallId: 'w1' });
  assert.equal(s.registro.rispondiApprovazione(s.sessionId, scrivi.requestId, false, { ambito: 'strumento' }).code, 'QUERY_INVALID');
  assert.equal(s.registro.rispondiApprovazione(s.sessionId, scrivi.requestId, true, { ambito: 'strumento' }).code, 'QUERY_INVALID');
  assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, scrivi.requestId, false), { ok: true });
  await scrivi.promessa;
  assert.deepEqual(elenco(s.input, 'attrezziMcpConsentiti'), []);
});

test('PORTO-07: a loose yes «for this tool» does not close a plugin or Tool Forge card: the person\'s `true` after it still does, once', async (t) => {
  const s = await scena(t);
  const forge = { tipo: 'forge_tool', toolCallId: 'f1', nome: 'forge__daily_note', attrezzo: 'daily_note' };
  for (const carta of [CARTA_PLUGIN, forge]) {
    const { promessa, requestId } = await domanda(s.registro, s.sessionId, s.input, carta);
    assert.equal(s.registro.rispondiApprovazione(s.sessionId, requestId, 1, { ambito: 'strumento' }).code, 'QUERY_INVALID', carta.tipo);
    assert.deepEqual(s.registro.rispondiApprovazione(s.sessionId, requestId, true, { ambito: 'strumento' }), { ok: true }, carta.tipo);
    assert.equal(await promessa, true, carta.tipo);
  }
  assert.deepEqual(elenco(s.input, 'attrezziMcpConsentiti'), [chiaveDellaCartaDiFuori(CARTA_PLUGIN), chiaveDellaCartaDiFuori(forge)]);
});

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'porto-gemella-revisore-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  writeFileSync(join(radice, 'README.md'), '# demo\n');
  return radice;
}
async function aspetta(condizione, cosa, ms = 20_000) {
  const fino = Date.now() + ms;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail(`never happened: ${cosa}`);
}

/** The goal refuter of the registry (real): its fake model asks `carte` in order; returns the answers of the registry, by name. */
async function confutatore(t, cartellaStore, contratto, carte) {
  const cartella = progetto(t);
  const risposte = {};
  const giri = [];
  const { registro } = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    confutaObiettivoFn: undefined,
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: contratto, task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
      if (String(input.task?.consegna ?? '').includes('You are the TALOS goal refuter')) {
        for (const [nome, azione] of carte) risposte[nome] = await input.chiediApprovazioneFn(azione);
        risposte.finito = true;
        input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'rc' });
        const detto = '{"refuted": null, "reason": "probe"}';
        return { ok: true, esito: { comeFinita: 'concluso', detto, messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: detto }] } };
      }
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      giri.push({ concludi: () => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }] } }); } });
      return attesa;
    },
  });
  const { sessionId } = registro.avvia('task-vero', {});
  giri.at(-1).concludi();
  await passo();
  await registro.impostaObiettivo(sessionId, 'write the marker', { criteri: [{ testo: 'the command passes', verifica: { tipo: 'comando', comando: contratto } }] });
  registro.resume(sessionId, 'lavora');
  await aspetta(() => giri.length === 2, 'the person\'s turn');
  giri.at(-1).concludi();
  await aspetta(() => risposte.finito === true, 'the cards of the refuter');
  return risposte;
}
const CONTRATTO_CU = 'echo x> .computer-use-luoghi.json';

test('PORTO-05: every No of the goal refuter is the rule\'s, marked automatico — the control-file No and the No to a command outside the contract', async (t) => conStore(t, async (cartellaStore) => {
  const risposte = await confutatore(t, cartellaStore, CONTRATTO_CU, [
    ['controllo', { tipo: 'shell', comando: CONTRATTO_CU, fileDiControllo: true, sempreNonBasta: true }],
    ['fuori', { tipo: 'shell', toolCallId: 'c9', comando: 'echo other> y.txt' }],
    ['ordinaria', { tipo: 'shell', toolCallId: 'c1', comando: CONTRATTO_CU }],
  ]);
  assert.equal(risposte.controllo?.approvato, false);
  assert.match(risposte.controllo?.motivo ?? '', /computer use settings file/u, 'the candidate\'s reason stays');
  assert.equal(risposte.controllo?.automatico, true, 'the control-file No is the rule\'s, not the person\'s');
  assert.equal(risposte.fuori?.approvato, false);
  assert.equal(risposte.fuori?.automatico, true, 'the twin\'s mark stays on the No outside the contract');
  assert.equal(risposte.ordinaria, true, 'the contract command on an ordinary card is still a yes');
}));

test('PORTO-06: the control-file No of the refuter keeps both cures on a `prova` card and without sempreNonBasta: its own reason and the mark', async (t) => conStore(t, async (cartellaStore) => {
  const risposte = await confutatore(t, cartellaStore, CONTRATTO_CU, [
    ['prova', { tipo: 'prova', comando: CONTRATTO_CU, fileDiControllo: true }],
    ['soloControllo', { tipo: 'shell', comando: CONTRATTO_CU, fileDiControllo: true }],
    ['vuoto', { tipo: 'shell', toolCallId: 'c8', comando: '' }],
  ]);
  for (const nome of ['prova', 'soloControllo']) {
    assert.equal(risposte[nome]?.approvato, false, nome);
    assert.match(risposte[nome]?.motivo ?? '', /computer use settings file/u, nome);
    assert.equal(risposte[nome]?.automatico, true, nome);
  }
  assert.equal(risposte.vuoto?.approvato, false);
  assert.equal(risposte.vuoto?.automatico, true, 'an empty command is refused by the rule too');
}));
