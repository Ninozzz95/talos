/*
 * Spesa di servizio, parte 2 A (owner 30/10/2026; contratto CONTRATTO-SPESA-DI-SERVIZIO §5.4; progetto PROGETTO-SPESA-DI-SERVIZIO-PARTE-2).
 * Il riassunto DENTRO il giro: il kernel lo segna (`servizio`), la fetch del giro lo riceve come `init.talosServizio`, il multi-fornitore lo
 * toglie prima della rete e deposita la spesa in `consumo-di-servizio` invece che in `consumo-fornitore` — SPOSTATA, mai doppia
 * (Performance), e la barra del contesto non la prende per la chat (Mobile, CLI). Server finto locale, nessuna chiave vera, nessuna porta fissa.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function bancoFornitore(t) {
  const viste = [];
  const server = createServer(async (req, res) => {
    let corpo = ''; for await (const pezzo of req) corpo += pezzo;
    const intestazioni = { ...req.headers }; delete intestazioni['content-length']; delete intestazioni.host; delete intestazioni.connection;
    viste.push({ url: req.url, corpo, intestazioni });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'RIASSUNTO' }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 6, cost: 0.0003 } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));
  assert.notEqual(server.address().port, 4174);
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'finta-deepseek' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  store.setRuntime('deepseek', { endpoint: `http://127.0.0.1:${server.address().port}/deepseek` });
  return { viste, opzioni: { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [] } };
}
const chiamata = { modello: 'deepseek:deepseek-chat', chiave: 'finta', messaggi: [{ role: 'system', content: 'Riassumi.' }, { role: 'user', content: 'Storia.' }], attrezzi: [], dormi: async () => {}, caso: () => 0, tentativiMassimi: 1 };
function righe() {
  const fornitore = []; const servizio = [];
  return { fornitore, servizio, porte: { onCambioFornitore: async () => {}, onConsumoFornitore: async (v) => { fornitore.push(v); }, onConsumoDiServizio: async (v) => { servizio.push(v); } } };
}
const percorri = (f, extra = {}) => f.eseguiConFallback((aggiunte) => chiamaConRitenta({ ...chiamata, ...extra, ...aggiunte }), chiamata);

test('SERVIZIO-GIRO-01 — un riassunto segnato dal kernel: UNA riga consumo-di-servizio e ZERO consumo-fornitore (spostata, mai doppia)', async (t) => {
  const banco = await bancoFornitore(t);
  const r = righe();
  const f = creaFetchMultiProvider(fetch, { ...banco.opzioni, ...r.porte });
  await percorri(f, { servizio: { scopo: 'riassunto', inPrimoPiano: true } });
  assert.equal(r.fornitore.length, 0, `la barra del contesto non deve vedere il riassunto: ${JSON.stringify(r.fornitore)}`);
  assert.equal(r.servizio.length, 1, JSON.stringify(r.servizio));
  const v = r.servizio[0];
  assert.equal(v.schema, 'talos.consumo-di-servizio.v1');
  assert.equal(v.scopo, 'riassunto');
  assert.equal(v.inPrimoPiano, true);
  assert.equal(v.esito, 'completato');
  assert.equal(v.fonte, 'deepseek');
  assert.equal(v.modelloRemoto, 'deepseek-chat');
  assert.equal(v.usage.prompt_tokens, 40);
  assert.equal(v.costoDichiarato, 0.0003);
  assert.ok(Number.isSafeInteger(v.durataMs) && v.durataMs >= 0);
});

test('SERVIZIO-GIRO-02 — AL CONTRARIO: una richiesta della chat (nessun segno) resta consumo-fornitore, e il conto totale non cambia', async (t) => {
  const banco = await bancoFornitore(t);
  const chat = righe();
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...chat.porte }));
  assert.equal(chat.fornitore.length, 1);
  assert.equal(chat.servizio.length, 0);
  /* stesso giro, una volta come chat e una come riassunto: il totale dei due nomi è lo stesso (Performance) */
  const riassunto = righe();
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...riassunto.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: false } });
  const totale = (x) => [...x.fornitore, ...x.servizio].reduce((s, v) => s + (v.usage?.prompt_tokens ?? 0) + (v.usage?.completion_tokens ?? 0), 0);
  assert.equal(totale(riassunto), totale(chat));
});

test('SERVIZIO-GIRO-03 — senza la porta nuova (un ospite che non la collega) il riassunto resta consumo-fornitore, come oggi', async (t) => {
  const banco = await bancoFornitore(t);
  const r = righe();
  delete r.porte.onConsumoDiServizio;
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...r.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true } });
  assert.equal(r.fornitore.length, 1);
});

test('SERVIZIO-GIRO-04 (Performance, CLI) — il segno non va MAI in rete: corpo e intestazioni identici byte per byte con e senza', async (t) => {
  const banco = await bancoFornitore(t);
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...righe().porte }));
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...righe().porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true } });
  assert.equal(banco.viste.length, 2);
  assert.equal(banco.viste[1].corpo, banco.viste[0].corpo);
  assert.deepEqual(banco.viste[1].intestazioni, banco.viste[0].intestazioni);
  assert.ok(!banco.viste[1].corpo.includes('talosServizio'));
});

test('SERVIZIO-GIRO-05 (CLI) — un involucro che ricopia le opzioni ({...init}) e un fetch interno che costruisce una Request: il segno arriva, e non passa oltre', async (t) => {
  const banco = await bancoFornitore(t);
  const r = righe();
  /* il fetch più interno (dove sta l'osservatore della CLI) costruisce una Request vera: scarta le chiavi sconosciute */
  const segniArrivati = [];
  const interno = (url, init) => { segniArrivati.push(Boolean(init && 'talosServizio' in init)); return fetch(new Request(url, init)); };
  const f = creaFetchMultiProvider(interno, { ...banco.opzioni, ...r.porte });
  /* un involucro FRA il kernel e il multi-fornitore, che ricopia le opzioni con lo spread a ogni richiesta (come `fetchConImmagini`) */
  let attraversato = 0;
  const involucro = { eseguiConFallback: (fn, c) => f.eseguiConFallback((aggiunte) => fn({ ...aggiunte,
    fetchDiRete: (u, i) => { attraversato += 1; return aggiunte.fetchDiRete(u, { ...i }); } }), c) };
  await chiamaConRitenta({ ...chiamata, fetchDiRete: involucro, servizio: { scopo: 'riassunto', inPrimoPiano: false } });
  assert.ok(attraversato >= 1, 'premessa: la richiesta è passata dall\'involucro');
  assert.equal(r.servizio.length, 1, JSON.stringify(r));
  assert.equal(r.servizio[0].inPrimoPiano, false);
  assert.equal(r.fornitore.length, 0);
  assert.ok(segniArrivati.length >= 1 && segniArrivati.every((s) => s === false), `il segno non arriva al fetch più interno (la rete): ${segniArrivati}`);
});

/* Mobile (30/10, punto 1): una prova per OSPITE che fallisce se l'ospite si dimentica la porta — qui il servizio del desktop
   (`agent-service.mjs`), che è anche quello della CLI: la porta arriva al kernel e la sua riga va nel flusso DUREVOLE della sessione. */
test('SERVIZIO-OSPITE-DESKTOP — agent-service passa onConsumoDiServizio al kernel e la riga diventa un CUSTOM consumo-di-servizio durevole', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-servizio-ospite-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const visti = [];
  let porta = null;
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (evento, opzioni) => { visti.push({ evento, opzioni }); },
    talosLavoraFn: async (input) => {
      porta = input.onConsumoDiServizio;
      await input.onConsumoDiServizio?.({ schema: 'talos.consumo-di-servizio.v1', scopo: 'riassunto', esito: 'completato', usage: null, at: 'x', inPrimoPiano: true });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} };
    } });
  assert.equal(typeof porta, 'function', 'l\'ospite desktop deve collegare la porta della spesa di servizio');
  const riga = visti.find((v) => v.evento?.type === 'CUSTOM' && v.evento.name === 'consumo-di-servizio');
  assert.ok(riga, JSON.stringify(visti.map((v) => v.evento?.name ?? v.evento?.type)));
  assert.equal(riga.opzioni?.durable, true, 'durevole, come consumo-fornitore');
  /* Performance (30/10): il runId del giro, per allineare la riga alla compattazione dello stesso giro */
  const avvio = visti.find((v) => v.evento?.type === 'RUN_STARTED' || v.evento?.type === 'RunStarted');
  assert.equal(typeof riga.evento.value.runId, 'string');
  if (avvio?.evento?.runId) assert.equal(riga.evento.value.runId, avvio.evento.runId);
});

/* Mobile (punto 3): l'istantaneo preparato in sottofondo si conta UNA volta, alla sua chiamata pagata (inPrimoPiano false); usarne il testo
   dopo non chiama nessuno, quindi non scrive righe. Qui la preparazione (`secondaria`) e la richiesta del giro partono insieme. */
test('SERVIZIO-GIRO-06 — l\'istantaneo in sottofondo: UNA riga di servizio (non in primo piano) e la richiesta del giro UNA riga della chat, mai di più', async (t) => {
  const banco = await bancoFornitore(t);
  const r = righe();
  const f = creaFetchMultiProvider(fetch, { ...banco.opzioni, ...r.porte });
  await Promise.all([
    chiamaConRitenta({ ...chiamata, fetchDiRete: f }),
    chiamaConRitenta({ ...chiamata, fetchDiRete: f, secondaria: true, messaggi: [{ role: 'user', content: 'Riassumi.' }], servizio: { scopo: 'riassunto', inPrimoPiano: false } }),
  ]);
  assert.equal(banco.viste.length, 2, 'premessa: due chiamate pagate');
  assert.equal(r.servizio.length, 1, JSON.stringify(r.servizio));
  assert.equal(r.servizio[0].inPrimoPiano, false);
  assert.equal(r.fornitore.length, 1, 'la richiesta del giro resta della chat');
});

/* Mobile (30/10, punto 2): un guasto della riga di servizio non fa MAI fallire una chiamata già servita e pagata — la spesa si conta come
   richiesta e il giro va avanti. Due strade: uno scopo che il costruttore non conosce (lancia) e la porta che lancia. */
test('SERVIZIO-GIRO-07 (Mobile, CLI) — costruttore che lancia: la chiamata riesce e la spesa è UNA riga consumo-fornitore; porta che lancia: niente ripiego, mai due righe', async (t) => {
  const banco = await bancoFornitore(t);
  const sconosciuto = righe();
  const r1 = await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...sconosciuto.porte }), { servizio: { scopo: 'boh', inPrimoPiano: true } });
  assert.equal(r1?.testo ?? r1?.content ?? 'RIASSUNTO', 'RIASSUNTO');
  assert.equal(sconosciuto.servizio.length, 0);
  assert.equal(sconosciuto.fornitore.length, 1, JSON.stringify(sconosciuto));
  const rotta = righe();
  rotta.porte.onConsumoDiServizio = async () => { throw new Error('porta rotta'); };
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...rotta.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true } });
  assert.equal(rotta.fornitore.length, 0, 'la porta può aver già scritto: un ripiego conterebbe due volte (CLI)');
  /* CLI: la porta che SCRIVE e poi lancia (un lettore a valle) ⇒ una sola riga in tutto, e nessuna nell'«ultima richiesta» */
  const scriveELancia = righe();
  scriveELancia.porte.onConsumoDiServizio = async (v) => { scriveELancia.servizio.push(v); throw new Error('lettore a valle'); };
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...scriveELancia.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true } });
  assert.equal(scriveELancia.servizio.length + scriveELancia.fornitore.length, 1, JSON.stringify(scriveELancia));
  assert.equal(scriveELancia.fornitore.length, 0);
});

/* Performance (30/10): l'indice della richiesta dentro il giro (da 0) arriva sulla riga, in un campo suo — 0 compreso */
test('SERVIZIO-GIRO-08 (Performance) — richiestaDelGiro arriva sulla riga, anche quando vale 0; assente se manca', async (t) => {
  const banco = await bancoFornitore(t);
  const zero = righe();
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...zero.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true, richiestaDelGiro: 0 } });
  assert.equal(zero.servizio[0].richiestaDelGiro, 0);
  assert.equal('giro' in zero.servizio[0], false, 'il giro della conversazione non si inventa');
  const tre = righe();
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...tre.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true, richiestaDelGiro: 3 } });
  assert.equal(tre.servizio[0].richiestaDelGiro, 3);
  const senza = righe();
  await percorri(creaFetchMultiProvider(fetch, { ...banco.opzioni, ...senza.porte }), { servizio: { scopo: 'riassunto', inPrimoPiano: true } });
  assert.equal('richiestaDelGiro' in senza.servizio[0], false);
});

/* Performance (30/10): il tratto che il banco usa per il join — una compattazione VERA dentro il giro (l'adattatore desktop, fornitore
   finto) ⇒ una riga consumo-di-servizio il cui `richiestaDelGiro` è il `giro` della compattazione-fine dello stesso giro. Il runId lo
   aggiunge agent-service (SERVIZIO-OSPITE-DESKTOP). Se il filo hotfix → chiediRiassunto → segno si rompe, il join sparisce in silenzio. */
test('SERVIZIO-GIRO-09 (Performance) — compattazione vera nel giro: la riga di servizio porta richiestaDelGiro == giro della compattazione', async (t) => {
  const { VARIABILE_TETTO_TOKEN } = await import('../src/kernel/compattazione-desktop.mjs');
  const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
  const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
  const { writeFileSync } = await import('node:fs');
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-servizio-giro-'));
  /* Rule 6 (03/11): under load rmSync met EPERM here (a process still closing with its folder inside; the sync path never retries EPERM
     on Windows, measured 13/09 in the helper). The async path sees EBUSY, retries, and warns, so the race stays visible. */
  t.after(() => rimuoviCartellaDiProvaAttesa(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const storia = (coppie) => Array.from({ length: coppie }, (_, i) => [
    { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` }]).flat();
  let coppie = 10; while (stima(storia(coppie + 1)) < 2600) coppie += 1;
  let fatte = 0, riassuntiPagati = 0;
  const interno = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      riassuntiPagati += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });
    }
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (fatte < 12) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'finta-deepseek' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  store.setRuntime('deepseek', { endpoint: 'http://127.0.0.1:9/deepseek' });
  const r = righe();
  const fetchDiRete = creaFetchMultiProvider(interno, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [], ...r.porte });
  const fine = [];
  await talosLavora({ cartella, modello: 'deepseek:deepseek-chat', chiave: 'finta', task: { consegna: 'Leggi.' },
    messaggiIniziali: [...storia(coppie), { role: 'user', content: 'Leggi i file.' }], contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.compattato) fine.push(e); } });
  assert.ok(fine.length >= 1 && riassuntiPagati >= 1, `premessa: una compattazione vera col modello (${fine.length}, ${riassuntiPagati})`);
  const delServizio = r.servizio.filter((v) => v.scopo === 'riassunto');
  assert.equal(delServizio.length, riassuntiPagati, `una riga per riassunto pagato: ${JSON.stringify(delServizio)}`);
  for (const v of delServizio) assert.ok(Number.isSafeInteger(v.richiestaDelGiro), JSON.stringify(v));
  const giriCompattati = new Set(fine.map((e) => e.giro));
  assert.ok(delServizio.some((v) => giriCompattati.has(v.richiestaDelGiro)), `join: ${JSON.stringify(delServizio.map((v) => v.richiestaDelGiro))} contro ${JSON.stringify([...giriCompattati])}`);
  assert.equal(r.fornitore.filter((v) => !v.usage?.prompt_tokens || v.usage.prompt_tokens === 1000).length, 0, 'nessun riassunto fra le richieste della chat');
});
