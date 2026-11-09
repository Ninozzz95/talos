/*
 * G-B2 (05/11/2026), the host of scenes 1+4: names and versions persisted as durable `talos.blocco.versione` events, rebuilt on reload with
 * `storicoDagliEventi`, and the next turn of the model sees only the current version. The kernel runs for real with a fake network; no
 * server starts, so no APPDATA is touched (the temp folder is the workspace). Ledger §2 G-B2.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaOspiteDeiBlocchi } from '../src/blocchi/aggiorna.mjs';
import { catalogoBlocchiDaAmbiente } from '../src/blocchi/prompt-del-catalogo.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { statoDeiBlocchi } from '../src/blocchi/versioni.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TABELLA = readFileSync(new URL('./fixtures/blocchi/01-tabella.txt', import.meta.url), 'utf8').trim();
const uso = { prompt_tokens: 1, completion_tokens: 1 };
const testo = (content) => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: uso });
const chiama = (args, id) => ({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'blocco_aggiorna', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }], usage: uso });

/* one turn hosted like agent-service does it: the state comes from what is persisted, every event goes to `salvati` */
async function turno(storia, salvati, risposte, conversazione = 's1') {
  const richieste = [];
  const cartella = mkdtempSync(join(tmpdir(), 'talos-blocchi-ospite-'));
  let esito;
  try {
    const ospite = creaOspiteDeiBlocchi({
      stato: statoDeiBlocchi(salvati, storia), conversazione, ora: () => '2026-11-05T23:00:00.000Z',
      emetti: async (valore) => { salvati.push(valore); },
    });
    esito = await talosLavora({
      cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', _giriMassimiInterno: risposte.length + 1, catalogoBlocchi: { clic: true },
      messaggiIniziali: storia, ...ospite,
      fetchDiRete: async (_u, init) => { richieste.push(JSON.parse(init.body)); const r = risposte[richieste.length - 1]; return Response.json(r ?? testo("ok")); },
    });
  } finally { rimuoviCartellaDiProva(cartella); }
  await new Promise((fatto) => setImmediate(fatto));
  return { esito, richieste };
}
const senzaSistema = (m) => m.filter((x) => x.role !== 'system');

test('G-B2 host: v1 is persisted when the block is born, v2 before the model hears of it, and a reload rebuilds both', async () => {
  const salvati = [];
  const primo = await turno([{ role: 'user', content: 'una tabella' }], salvati, [testo(`Ecco:\n\`\`\`talos-blocco\n${TABELLA}\n\`\`\``)]);
  assert.deepEqual(salvati.map((e) => [e.blocco, e.versione, e.origine]), [['b1', 1, 'modello']]);
  assert.equal(salvati[0].sorgente, TABELLA);
  assert.equal(salvati[0].conversazione, 's1');

  const storia = [...senzaSistema(primo.esito.messaggiFinali), { role: 'user', content: 'aggiungi aprile' }];
  const secondo = await turno(storia, salvati, [chiama({ blocco: 'b1', modifiche: [{ vecchio: '["Marzo"]', nuovo: '["Marzo"],\n  ["Aprile", 3]' }] }, 'a1')]);
  assert.deepEqual(salvati.map((e) => e.versione), [1, 2]);
  assert.equal(salvati[1].origine, 'modello');
  assert.match(salvati[1].sorgente, /Aprile/u);
  assert.ok(salvati[1].cosaECambiato.length > 0, 'the label text «what changed» is persisted');
  assert.deepEqual(JSON.parse(secondo.richieste.at(-1).messages.at(-1).content), { ok: true, blocco: 'b1', versione: 2, tipo: 'tabella' });

  /* reload: the same events rebuild the history; the next turn sees ONLY the current version, under the same name */
  const ricaricato = statoDeiBlocchi(salvati, storia);
  assert.equal(ricaricato.prossimo, 2);
  assert.deepEqual(ricaricato.storici.get('b1').voci.map((v) => v.versione), [1, 2]);
  const terzo = await turno([...senzaSistema(secondo.esito.messaggiFinali), { role: 'user', content: 'e ora?' }], salvati, []);
  const assistente = terzo.richieste[0].messages.find((m) => m.role === 'assistant' && /talos-blocco/u.test(m.content ?? ''));
  assert.match(assistente.content, /nome=b1\n[\s\S]*Aprile/u);
  assert.doesNotMatch(assistente.content, /\["Marzo"\]\n\]/u, 'the v1 body is gone from what the model sees');
  assert.equal(salvati.length, 2, 'a reload announces nothing');
});

test('G-B2 host: a fork inherits names and counter from its source; its own events win over the source', () => {
  const sorgente = [{ blocco: 'b1', versione: 1, sorgente: TABELLA }, { blocco: 'b2', versione: 1, sorgente: TABELLA }];
  const messaggiDellaSorgente = [{ role: 'assistant', content: `\`\`\`talos-blocco nome=b3\n${TABELLA}\n\`\`\`` }];
  const stato = statoDeiBlocchi(sorgente, messaggiDellaSorgente);
  assert.equal(stato.prossimo, 4, 'b3 lived only in a message that was regenerated: its number is still taken');
  const proprio = { blocco: 'b1', versione: 2, sorgente: TABELLA.replace('980.5', '990'), origine: 'vista', cosaECambiato: 'x' };
  const altro = { blocco: 'b1', versione: 2, sorgente: TABELLA.replace('980.5', '111'), origine: 'modello', cosaECambiato: 'y' };
  const ramo = statoDeiBlocchi([proprio, ...sorgente, altro], []);
  assert.deepEqual(ramo.storici.get('b1').voci.map((v) => v.versione), [1, 2]);
  assert.match(ramo.correnti.b1, /990/u);
  assert.equal(ramo.correnti.b2, undefined, 'a block still at v1 is not rewritten for the model');
});

test('G-B2 host: an update that does not apply persists nothing and answers with the reader code', async () => {
  const salvati = [];
  const ospite = creaOspiteDeiBlocchi({ stato: statoDeiBlocchi([{ blocco: 'b1', versione: 1, sorgente: TABELLA }]), emetti: (v) => { salvati.push(v); } });
  assert.equal((await ospite.onAggiornaBlocco({ blocco: 'b1', modifiche: [{ vecchio: 'Luglio', nuovo: 'Agosto' }] })).codice, 'nessunaModifica');
  assert.equal((await ospite.onAggiornaBlocco({ blocco: 'b7', sorgente: TABELLA })).codice, 'bloccoSconosciuto');
  assert.deepEqual(salvati, []);
});

test('G-B2 host in the registry: the turn gets the state of the conversation, and a fork gets its source names and counter', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-blocchi-registro-'));
  const giri = [];
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, cartelleProgetto: [],
    catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => { const i = giri.length; giri.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` }); }),
  });
  t.after(async () => {
    for (const g of giri) { try { g.risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }); } catch { /* chiuso */ } }
    await r.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {});
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const attendi = async (n) => { const fine = Date.now() + 5_000; while (giri.length < n) { if (Date.now() > fine) throw new Error('giro mai partito'); await new Promise((f) => setTimeout(f, 10)); } };
  const { sessionId } = r.avvia('task');
  await attendi(1);
  assert.equal(giri[0].input.blocchiDellaConversazione.prossimo, 1);
  assert.equal(giri[0].input.blocchiDellaConversazione.conversazione, sessionId);
  for (const nome of ['b1', 'b2']) await giri[0].input.onEvento({ type: 'CUSTOM', name: 'talos.blocco.versione', value: { blocco: nome, versione: 1, sorgente: TABELLA, origine: 'modello' } }, { durable: true });
  giri[0].input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  giri[0].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: `\`\`\`talos-blocco nome=b3
${TABELLA}
\`\`\`` }] } });
  await r.attendiAssestamento(sessionId);
  const ramo = r.forka(sessionId);
  await attendi(2);
  const stato = giri[1].input.blocchiDellaConversazione;
  assert.equal(stato.prossimo, 4, 'the fork continues the source counter');
  assert.deepEqual([...stato.storici.keys()].sort(), ['b1', 'b2']);
  assert.equal(stato.conversazione, ramo.sessionId);
});

test('G-B2 k8 a reply where the model itself writes `nome=b1` for a NEW block is renamed b2: names are TALOS\'s, never the model\'s', async () => {
  const salvati = [];
  const primo = await turno([{ role: 'user', content: 'una tabella' }], salvati, [testo(`Ecco:\n\`\`\`talos-blocco\n${TABELLA}\n\`\`\``)]);
  const storia = [...senzaSistema(primo.esito.messaggiFinali), { role: 'user', content: 'un\'altra' }];
  const altra = TABELLA.replace('Marzo', 'Aprile');
  const secondo = await turno(storia, salvati, [testo(`Ecco:\n\`\`\`talos-blocco nome=b1\n${altra}\n\`\`\``)]);
  assert.deepEqual(salvati.map((e) => [e.blocco, e.versione]), [['b1', 1], ['b2', 1]]);
  assert.equal(salvati[1].sorgente, altra);
  assert.match(secondo.esito.messaggiFinali.at(-1).content, /```talos-blocco nome=b2\n/u);
});

test('G-B2 k9 a name already in the history is never reborn as v1 when announced again', async () => {
  const salvati = [];
  const ospite = creaOspiteDeiBlocchi({ stato: statoDeiBlocchi([], []), conversazione: 's1', ora: () => 'q', emetti: async (v) => { salvati.push(v); } });
  ospite.onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  await new Promise((fatto) => setImmediate(fatto)); // v1 is written on a microtask, as in the kernel the update comes a network round later
  await ospite.onAggiornaBlocco({ blocco: 'b1', modifiche: [{ vecchio: '["Marzo"]', nuovo: '["Marzo"],\n  ["Aprile", 3]' }] });
  ospite.onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  await new Promise((fatto) => setImmediate(fatto));
  assert.deepEqual(salvati.map((e) => e.versione), [1, 2], 'b1 stays at v2, no second v1');
  assert.match(ospite.sorgentiCorrentiDeiBlocchi?.b1 ?? salvati[1].sorgente, /Aprile/u);
});

// ---- G-B3 (06/11/2026): the v1 bound to its message, durable before the turn ends; the route of the local versions; the fork cut ----
import { readdirSync, readFileSync as leggiFile } from 'node:fs';
import { impronta } from '../src/blocchi/impronta.mjs';

function registroDiProva(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-blocchi-gb3-'));
  const giri = [];
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, cartelleProgetto: [],
    catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => { const i = giri.length; giri.push({ input, risolvi }); input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` }); }),
  });
  t.after(async () => {
    for (const g of giri) { try { g.risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }); } catch { /* chiuso */ } }
    await r.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {});
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const attendi = async (n) => { const fine = Date.now() + 5_000; while (giri.length < n) { if (Date.now() > fine) throw new Error('giro mai partito'); await new Promise((f) => setTimeout(f, 10)); } };
  const eventi = (sessionId) => { const fuori = []; r.iscriviti(sessionId, (e) => fuori.push(e))(); return fuori; };
  /* every line of the journal files, in order: what a reload reads */
  const giornale = async () => {
    await attendiScritture({ cartellaStore });
    const righe = [];
    const giro = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) giro(p); else if (f.name.endsWith('.jsonl')) righe.push(...leggiFile(p, 'utf8').split('\n').filter(Boolean)); } };
    giro(cartellaStore);
    return righe.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  };
  return { r, giri, attendi, eventi, giornale };
}
const ospiteDel = (g, sessionId) => creaOspiteDeiBlocchi({
  stato: g.input.blocchiDellaConversazione, conversazione: sessionId,
  emetti: (valore) => g.input.onEvento({ type: 'CUSTOM', name: 'talos.blocco.versione', value: valore }, { durable: true }),
});
const recinto = (corpo) => `\`\`\`talos-blocco\n${corpo}\n\`\`\``;
const versioni = (lista) => lista.filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.blocco.versione').map((e) => e.value);
const soloVersioniEFine = (righe) => righe.map((x) => (x.type === 'CUSTOM' ? x.name : x.type)).filter((x) => x === 'talos.blocco.versione' || x === 'RunFinished');

test('G-B3 UIG-1.15 streamed answer: the v1 carries the screen message id, the fence position and the impronta', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  g.input.onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  g.input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: `Ecco:\n${recinto(TABELLA)}\nE di nuovo:\n` });
  g.input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: `${recinto(TABELLA)}\n` });
  ospiteDel(g, sessionId).onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }, { nome: 'b2', sorgente: TABELLA }] });
  const v = versioni(p.eventi(sessionId));
  assert.deepEqual(v.map((x) => [x.blocco, x.messaggio, x.posizione, x.impronta]), [['b1', 'm1', 0, impronta(TABELLA)], ['b2', 'm1', 1, impronta(TABELLA)]],
    'the same text twice gets two names, bound to two fences');
});

test('G-B3 UIG-1.19 the turn ends right after the answer: the v1 is in the journal, before RunFinished, bound to the late message', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  /* not streamed: the name is announced BEFORE the answer's text events exist (agent-service emits them after onGiro risposta) */
  ospiteDel(g, sessionId).onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  g.input.onEvento({ type: 'TextMessageStart', messageId: 'm9', role: 'assistant' });
  g.input.onEvento({ type: 'TextMessageContent', messageId: 'm9', delta: `Ecco:\n${recinto(TABELLA)}` });
  g.input.onEvento({ type: 'TextMessageEnd', messageId: 'm9' });
  g.input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  const righe = await p.giornale();
  assert.deepEqual(soloVersioniEFine(righe), ['talos.blocco.versione', 'RunFinished']);
  const v1 = righe.find((x) => x.name === 'talos.blocco.versione').value;
  assert.equal(v1.messaggio, 'm9');
  assert.equal(v1.posizione, 0);
});

test('G-B3 UIG-1.19 a v1 whose fence never shows up is still written before the terminal event, unbound', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  ospiteDel(g, sessionId).onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  g.input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  assert.deepEqual(soloVersioniEFine(await p.giornale()), ['talos.blocco.versione', 'RunFinished']);
});

test('G-B3 UIG-1.18 the route writes a durable vista/ritorno version, starts no turn, and a second identical call writes nothing', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  await g.input.onEvento({ type: 'CUSTOM', name: 'talos.blocco.versione', value: { blocco: 'b1', versione: 1, sorgente: TABELLA, origine: 'modello', messaggio: 'm1', posizione: 0 } }, { durable: true });
  g.input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  g.risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } });
  await p.r.attendiAssestamento(sessionId);
  const valore = { conversazione: sessionId, messaggio: 'm1', blocco: 'b1', versione: 2, sorgente: TABELLA, cosaECambiato: 'Bars', origine: 'vista', quando: '2026-11-06T00:00:00.000Z' };
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, valore), { ok: true, blocco: 'b1', versione: 2 });
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, valore), { ok: true, blocco: 'b1', versione: 2, giaSalvata: true });
  const ritorno = { ...valore, versione: 3, origine: 'ritorno', aVersione: 1, cosaECambiato: 'Back to v1' };
  assert.equal((await p.r.salvaVersioneDelBlocco(sessionId, ritorno)).ok, true);
  for (const male of [{ ...valore, versione: 1 }, { ...valore, origine: 'modello' }, { ...valore, blocco: 'x1' }, { ...valore, sorgente: 'tipo: tabella\ncolonne: [' }, { ...ritorno, versione: 4, aVersione: undefined }]) {
    assert.equal((await p.r.salvaVersioneDelBlocco(sessionId, male)).ok, false, JSON.stringify(male).slice(0, 80));
  }
  assert.equal(p.giri.length, 1, 'no turn, no model call');
  const v = versioni(await p.giornale());
  assert.deepEqual(v.map((x) => [x.blocco, x.versione, x.origine, x.aVersione]), [['b1', 1, 'modello', undefined], ['b1', 2, 'vista', undefined], ['b1', 3, 'ritorno', 1]]);
  assert.equal(statoDeiBlocchi(v).storici.get('b1').voci.at(-1).versione, 3, 'a reload rebuilds the chosen version');
  assert.deepEqual(await p.r.salvaVersioneDelBlocco('nessuna', valore), { ok: false, codice: 'session-not-found' });
});

// ---- G-B4 (06/11/2026): one number per version (UIG-1.20), the name check (UIG-1.21), r1 ----
import { storicoDagliEventi } from '../src/blocchi/versioni.mjs';

const VISTA = (sessionId, extra = {}) => ({ conversazione: sessionId, messaggio: 'm1', blocco: 'b1', versione: 2, sorgente: TABELLA, cosaECambiato: 'Bars', origine: 'vista', quando: '2026-11-06T00:00:00.000Z', ...extra });

test('G-B4 UIG-1.20 a turn running: the screen saves v2, then the model updates b1 — the model gets v3, never a second v2', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  const ospite = ospiteDel(g, sessionId);
  ospite.onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  g.input.onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  g.input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: `${recinto(TABELLA)}\n` });
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId)), { ok: true, blocco: 'b1', versione: 2 });
  const esito = await ospite.onAggiornaBlocco({ blocco: 'b1', modifiche: [{ vecchio: '980.5', nuovo: '990' }] });
  assert.equal(esito.ok, true);
  assert.equal(esito.versione, 3, 'the host re-reads the journal: v2 is taken by the screen');
  const v = versioni(p.eventi(sessionId)).filter((x) => x.blocco === 'b1');
  assert.deepEqual(v.map((x) => [x.versione, x.origine]), [[1, 'modello'], [2, 'vista'], [3, 'modello']]);
  assert.deepEqual(storicoDagliEventi('b1', TABELLA, v).voci.map((x) => x.versione), [1, 2, 3], 'one label per version');
  /* a second update in the same turn goes on from its own v3 */
  assert.equal((await ospite.onAggiornaBlocco({ blocco: 'b1', modifiche: [{ vecchio: '990', nuovo: '995' }] })).versione, 4);
});

test('G-B4 UIG-1.20 the route takes only the next number: a taken one answers version-taken with the next', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  const ospite = ospiteDel(g, sessionId);
  ospite.onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  g.input.onEvento({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant' });
  g.input.onEvento({ type: 'TextMessageContent', messageId: 'm1', delta: `${recinto(TABELLA)}
` });
  assert.equal((await ospite.onAggiornaBlocco({ blocco: 'b1', modifiche: [{ vecchio: '980.5', nuovo: '990' }] })).versione, 2);
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId)), { ok: false, codice: 'version-taken', prossima: 3 });
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { versione: 5 })), { ok: false, codice: 'version-taken', prossima: 3 }, 'a number past the next is refused too');
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { versione: 3 })), { ok: true, blocco: 'b1', versione: 3 });
  assert.deepEqual(versioni(p.eventi(sessionId)).map((x) => x.versione), [1, 2, 3]);
});

test('G-B4 UIG-1.21 the route checks the name: no v1 in the session or its chain answers invalid, a stamped message is enough', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId)), { ok: false, codice: 'invalid-block-version' }, 'b1 was never born here');
  g.input.onEvento({ type: 'RunFinished', threadId: 't0', runId: 'r0' });
  g.risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: `Ecco:\n\`\`\`talos-blocco nome=b7\n${TABELLA}\n\`\`\`` }] } });
  await p.r.attendiAssestamento(sessionId);
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId)), { ok: false, codice: 'invalid-block-version' }, 'b1 still unknown');
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { blocco: 'b7' })), { ok: true, blocco: 'b7', versione: 2 }, 'a name only in a stamped message');
});

test('G-B4 r1 a ritorno must go back: aVersione equal to or past its own version answers invalid', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  ospiteDel(p.giri[0], sessionId).onNomiDeiBlocchi({ nuovi: [{ nome: 'b1', sorgente: TABELLA }] });
  for (const aVersione of [2, 3]) {
    assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { origine: 'ritorno', aVersione })), { ok: false, codice: 'invalid-block-version' }, `aVersione ${aVersione}`);
  }
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { origine: 'ritorno', aVersione: 1 })), { ok: true, blocco: 'b1', versione: 2 });
});

// ---- G-BG2 (06/11/2026): UIG-1.24 (r2) ----
test('G-BG2 UIG-1.24 a stale v2 written after v3 does not pull the counter back: next is 4, a second v3 is refused', async (t) => {
  const p = registroDiProva(t);
  const { sessionId } = p.r.avvia('task');
  await p.attendi(1);
  const g = p.giri[0];
  const scrivi = (versione, extra = {}) => g.input.onEvento({ type: 'CUSTOM', name: 'talos.blocco.versione', value: {
    blocco: 'b1', versione, sorgente: TABELLA.replace('980.5', String(900 + versione)), origine: versione === 1 ? 'modello' : 'vista', messaggio: 'm1', posizione: 0, ...extra,
  } }, { durable: true });
  /* the journal in this order: v1, v2, v3, then a v2 that arrived late (an old tab, a retried write) */
  await scrivi(1);
  await scrivi(2, { cosaECambiato: 'a' });
  await scrivi(3, { cosaECambiato: 'b' });
  await scrivi(2, { cosaECambiato: 'stale' });
  assert.deepEqual(versioni(p.eventi(sessionId)).map((x) => x.versione), [1, 2, 3, 2], 'premise: the stale v2 is in the journal after v3');
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { versione: 3 })), { ok: false, codice: 'version-taken', prossima: 4 }, 'v3 is taken: the next is 4, not 3');
  assert.deepEqual(await p.r.salvaVersioneDelBlocco(sessionId, VISTA(sessionId, { versione: 4 })), { ok: true, blocco: 'b1', versione: 4 });
});
