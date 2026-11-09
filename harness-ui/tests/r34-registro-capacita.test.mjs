/*
 * R-34 parte 2, LATO REGISTRO (owner 30/10/2026; PROPOSTA-R34-PARTE-2-2026-10-30.md, sì di Desktop, CLI, Mobile e Performance).
 * La carta di una chiamata che un modello locale ha scritto come testo (`semprePersona`) la vede SOLO un client che ha dichiarato la
 * capacità `chiamata-dal-testo`, su ogni strada (eventi, `pending`, bolla verso il padre); senza persona o senza client capace la
 * domanda risponde «nessuna persona» (mai un «no»), e la porta della presenza arriva al nucleo lungo tutto il filo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { capacitaDichiarate, eventoVisibileCon, CAPACITA_DEI_CLIENT } from '../src/capacita-dei-client.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function runtimeControllabile() {
  const runs = [];
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const index = runs.length;
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` });
      return promise;
    },
  };
}

async function scena(t, opzioniRegistro = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-r34r-'));
  const runtime = runtimeControllabile();
  const registry = createSessionRegistry({ promuoviDalTesto: true, cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, ...opzioniRegistro });
  t.after(async () => {
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  return { registry, runtime, sessionId, input: runtime.runs[0].input };
}

const CARTA = { tipo: 'chiamata-dal-testo', semprePersona: true, toolCallId: 'daTesto-abc-1', nome: 'shell', argomenti: { comando: 'ls' } };
const pausa = () => new Promise((r) => setTimeout(r, 10));

test('R34R-01: senza un client capace la carta NON nasce: «nessuna persona», motivo nessun-client (mai un no)', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t);
  const vecchio = [];
  const via = registry.iscriviti(sessionId, (e) => vecchio.push(e)); // un client vecchio, senza capacità
  t.after(() => via());
  assert.deepEqual(await input.chiediApprovazioneFn(CARTA), { nessunaPersona: true, motivo: 'nessun-client' });
  assert.equal(registry.domandaInAttesa(sessionId), null, 'nessuna carta in attesa');
  assert.equal(vecchio.some((e) => e.type === 'ApprovalRequested'), false);
});

test('R34R-02: con un client capace la carta nasce, la vede SOLO lui; il client vecchio non la riceve né dal vivo né rigiocata', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t);
  const vecchio = [];
  const capace = [];
  const via1 = registry.iscriviti(sessionId, (e) => vecchio.push(e));
  const via2 = registry.iscriviti(sessionId, (e) => capace.push(e), 0, { capacita: 'chiamata-dal-testo' });
  t.after(() => { via1(); via2(); });
  const domanda = input.chiediApprovazioneFn(CARTA);
  await pausa();
  assert.equal(capace.some((e) => e.type === 'ApprovalRequested' && e.azione?.semprePersona), true, 'il client capace la vede');
  assert.equal(vecchio.some((e) => e.type === 'ApprovalRequested'), false, 'il client vecchio no');
  const tardivo = [];
  const via3 = registry.iscriviti(sessionId, (e) => tardivo.push(e)); // si collega dopo: il rigioco non gliela porta
  t.after(() => via3());
  assert.equal(tardivo.some((e) => e.type === 'ApprovalRequested'), false);
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId, { capacita: ['chiamata-dal-testo'] }).requestId, true);
  assert.equal(await domanda, true);
});

test('R34R-03 (Mobile b): un client capace ma la persona non c\'è (lo dice chi ospita) ⇒ «nessuna persona», motivo nessuna-persona', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t, { personaPresenteFn: () => false });
  const via = registry.iscriviti(sessionId, () => {}, 0, { capacita: ['chiamata-dal-testo'] });
  t.after(() => via());
  assert.deepEqual(await input.chiediApprovazioneFn(CARTA), { nessunaPersona: true, motivo: 'nessuna-persona' });
});

test('R34R-04: la porta della presenza va al giro, vera solo con la persona E un client capace', async (t) => {
  let presente = true;
  const { registry, sessionId, input } = await scena(t, { personaPresenteFn: () => presente });
  assert.equal(typeof input.personaPresenteFn, 'function', 'il registro passa la porta al giro');
  assert.equal(input.personaPresenteFn(), false, 'nessun client capace');
  const via = registry.iscriviti(sessionId, () => {}, 0, { capacita: 'chiamata-dal-testo' });
  assert.equal(input.personaPresenteFn(), true);
  presente = false;
  assert.equal(input.personaPresenteFn(), false, 'la persona è andata via');
  presente = true;
  via();
  assert.equal(input.personaPresenteFn(), false, 'il client capace si è scollegato');
});

test('R34R-05 AL CONTRARIO: una carta ordinaria arriva a tutti, come prima', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t);
  const vecchio = [];
  const via = registry.iscriviti(sessionId, (e) => vecchio.push(e));
  t.after(() => via());
  const domanda = input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' });
  await pausa();
  assert.equal(vecchio.some((e) => e.type === 'ApprovalRequested'), true);
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false);
  await domanda;
});

test('R34R-06: la lista delle capacità è chiusa; un valore sconosciuto si ignora', () => {
  assert.deepEqual([...CAPACITA_DEI_CLIENT], ['chiamata-dal-testo']);
  assert.deepEqual([...capacitaDichiarate('chiamata-dal-testo, inventata')], ['chiamata-dal-testo']);
  assert.deepEqual([...capacitaDichiarate(null)], []);
  assert.equal(eventoVisibileCon({ type: 'ApprovalRequested', azione: { semprePersona: true } }, new Set()), false);
  assert.equal(eventoVisibileCon({ type: 'ApprovalRequested', azione: { tipo: 'shell' } }, new Set()), true);
});

test('R34R-07: `pending` filtra la carta per chi non ha dichiarato la capacità; un\'altra chiave è una query sbagliata', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t);
  const via = registry.iscriviti(sessionId, () => {}, 0, { capacita: 'chiamata-dal-testo' });
  t.after(() => via());
  const { createHttpApp } = await import('../src/http-app.mjs');
  const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registry }));
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok); });
  t.after(() => new Promise((ok) => server.close(() => ok())));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(sessionId)}`;
  const domanda = input.chiediApprovazioneFn(CARTA);
  await pausa();
  assert.equal((await (await fetch(`${base}/pending`)).json()).data.pending, null, 'il client vecchio non vede la carta');
  assert.equal((await (await fetch(`${base}/pending?capacita=chiamata-dal-testo`)).json()).data.pending?.azione?.semprePersona, true);
  assert.equal((await fetch(`${base}/pending?altro=1`)).status, 400);
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId, { capacita: 'chiamata-dal-testo' }).requestId, false);
  await domanda;
});

test('R34R-08: il filo arriva al nucleo — avviaSessione inoltra personaPresenteFn a talosLavora', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-r34r-filo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let ricevuta = null;
  const porta = () => true;
  await avviaSessione({ cartella, task: { consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: () => {}, personaPresenteFn: porta,
    talosLavoraFn: async (input) => { ricevuta = input.personaPresenteFn; return { ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }; } });
  assert.equal(ricevuta, porta);
});

test('R34R-09 (CLI): in PROCESSO, domandaInAttesa con { capacita } vede la carta; senza dichiarazione no', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t);
  const via = registry.iscriviti(sessionId, () => {}, 0, { capacita: ['chiamata-dal-testo'] });
  t.after(() => via());
  const domanda = input.chiediApprovazioneFn(CARTA);
  await pausa();
  assert.equal(registry.domandaInAttesa(sessionId), null, 'chi non dichiara non la vede');
  const vista = registry.domandaInAttesa(sessionId, { capacita: ['chiamata-dal-testo'] });
  assert.equal(vista?.azione?.semprePersona, true);
  registry.rispondiApprovazione(sessionId, vista.requestId, false);
  await domanda;
});

/* Decisione 44 (03/11), condizione della CLI: il filo dell'opzione. Un ospite che non la chiede non la passa al giro, quindi il nucleo non promuove
   e la carta FE-005 non nasce (P2-44); chi la chiede la passa. */
test('R34R-10 (decisione 44): senza l opzione il registro non la passa al giro; con l opzione sì', { timeout: 5_000 }, async (t) => {
  const senza = await scena(t, { promuoviDalTesto: false });
  assert.equal(senza.input.promuoviDalTesto, undefined, 'di serie il giro non la riceve');
  const con = await scena(t, { promuoviDalTesto: true });
  assert.equal(con.input.promuoviDalTesto, true, 'chi la chiede la passa al giro');
});

test('R34R-11 (decisione 44): avviaSessione inoltra promuoviDalTesto a talosLavora, e di serie non la inventa', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-r34r-filo44-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const ricevute = [];
  const prova = (extra) => avviaSessione({ cartella, task: { consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: () => {}, ...extra,
    talosLavoraFn: async (input) => { ricevute.push(input.promuoviDalTesto); return { ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }; } });
  await prova({ promuoviDalTesto: true });
  await prova({});
  assert.deepEqual(ricevute, [true, undefined]);
});
