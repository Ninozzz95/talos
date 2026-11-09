/*
 * FE-003 (forma del 03/11/2026, OK di Performance, CLI e Mobile): il catalogo dei blocchi entra nel primo messaggio di sistema solo se chi
 * ospita lo chiede, solo su una conversazione nuova, solo per i modelli di rete. Il NUCLEO resta spento di serie (la CLI e chi lo chiama da
 * solo non vedono niente di nuovo); l'ospite del PC lo accende di serie dal 04/11 (decisione 139), con la preferenza «Blocchi vivi nelle
 * risposte» letta alla nascita della conversazione (decisione 140) e fuori dalle conversazioni nate dal telefono fino a UI-137 (Mobile).
 * ⛔ Il prefisso resta identico per tutta la sessione: è la condizione della cache.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { LINGUA_DEL_RECINTO } from '../src/blocchi/catalogo.mjs';
import * as promptDelCatalogoMod from '../src/blocchi/prompt-del-catalogo.mjs';
import { TETTO_TOKEN_DEL_PROMPT, catalogoBlocchiDaAmbiente, promptDelCatalogo, stimaToken } from '../src/blocchi/prompt-del-catalogo.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const PC = { clic: true };
const testo = (m) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content));

async function primaRichiesta(ingresso = {}) {
  let ricevuti = null;
  const cartella = mkdtempSync(join(tmpdir(), 'talos-blocchi-sistema-'));
  try {
    await talosLavora({
      cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 1,
      ...ingresso,
      fetchDiRete: async (_url, init) => {
        ricevuti ??= JSON.parse(init.body).messages;
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
      },
    });
  } finally { rimuoviCartellaDiProva(cartella); }
  return ricevuti;
}
const primo = async (ingresso) => testo((await primaRichiesta(ingresso))[0]);

test('BLOCCHI-SIS-01 senza opzione il primo messaggio non cambia, anche con il campo assente come nell\'ingresso della CLI', async () => {
  const assente = await primo();
  assert.equal(await primo({ catalogoBlocchi: null }), assente, 'null e assente sono la stessa cosa, byte per byte');
  assert.equal(assente.includes(LINGUA_DEL_RECINTO), false);
  assert.equal(assente.includes('## Blocks'), false);
});

test('BLOCCHI-SIS-02 con l\'opzione il catalogo c\'è, prima della riga della lingua, e due conversazioni hanno lo stesso prefisso', async () => {
  const una = await primo({ catalogoBlocchi: PC });
  assert.ok(una.includes(promptDelCatalogo(PC)));
  assert.ok(una.indexOf('## Blocks') < una.indexOf('Always reply in'), 'la riga della lingua resta in fondo');
  assert.equal(await primo({ catalogoBlocchi: PC }), una, 'byte per byte');
  assert.equal(await primo({ catalogoBlocchi: { clic: true, minimo: true } }), una, 'il nucleo minimo non si chiede da fuori');
});

test('BLOCCHI-SIS-03 un modello locale non lo riceve, una figlia nemmeno', async () => {
  for (const modello of ['local:qualcosa', 'locale-ospite:qualcosa', 'lmstudio:qualcosa']) {
    assert.equal((await primo({ modello, catalogoBlocchi: PC })).includes(LINGUA_DEL_RECINTO), false, modello);
  }
  assert.equal((await primo({ agentRole: 'child', catalogoBlocchi: PC })).includes(LINGUA_DEL_RECINTO), false);
});

test('BLOCCHI-SIS-04 clic: false non nomina il modulo e non promette clic', async () => {
  const senza = await primo({ catalogoBlocchi: { clic: false } });
  assert.ok(senza.includes('## Blocks'));
  assert.equal(senza.includes('Modulo('), false);
  assert.equal(senza.includes(promptDelCatalogo({ clic: false })), true);
});

test('BLOCCHI-SIS-05 cambiando modello il primo messaggio resta identico; una chat già esistente non riceve il catalogo', async () => {
  const conCatalogo = await primaRichiesta({ catalogoBlocchi: PC });
  const storia = [...conCatalogo, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'e adesso?' }];
  for (const modello of ['z', 'local:qualcosa']) {
    const dopo = await primaRichiesta({ modello, catalogoBlocchi: PC, messaggiIniziali: storia });
    assert.equal(testo(dopo[0]), testo(conCatalogo[0]), modello);
    assert.equal(dopo.filter((m) => m.role === 'system' && testo(m).includes('## Blocks')).length, 1, 'mai una seconda copia in coda');
  }
  const senzaCatalogo = await primaRichiesta();
  const vecchia = [...senzaCatalogo, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'e adesso?' }];
  const ripresa = await primaRichiesta({ catalogoBlocchi: PC, messaggiIniziali: vecchia });
  assert.equal(testo(ripresa[0]), testo(senzaCatalogo[0]));
  assert.equal(ripresa.some((m) => testo(m).includes('## Blocks')), false, 'niente aggiunte a metà');
});

test('BLOCCHI-SIS-06 il banco, che chiama il nucleo da solo, può accenderlo col testo del PC', async () => {
  const banco = await primo({ catalogoBlocchi: catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '1' }), nessunoDavanti: true, senzaPersona: true });
  assert.ok(banco.includes(promptDelCatalogo(PC)));
});

test('BLOCCHI-SIS-07 acceso di serie sul PC (decisione 139): solo TALOS_CATALOGO_BLOCCHI=0 lo spegne, e il PC lo legge dall\'ambiente', () => {
  for (const ambiente of [{}, { TALOS_CATALOGO_BLOCCHI: '' }, { TALOS_CATALOGO_BLOCCHI: '1' }, undefined]) {
    assert.deepEqual(catalogoBlocchiDaAmbiente(ambiente), PC, JSON.stringify(ambiente));
  }
  assert.equal(catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '0' }), null, 'l\'interruttore di emergenza e il lato «spento» del banco');
  /* revisione Z, Z-3.1: il PC lo legge dall'ambiente, e il server del telefono lo tiene spento (REVZ-TEL-01/02) */
  assert.match(readFileSync(new URL('../server.mjs', import.meta.url), 'utf8'), /catalogoBlocchi: catalogoBlocchiDaAmbiente\(process\.env, \{ telefono: accessoLocaleOspite\.attivo \}\)/u);
});

test('BLOCCHI-SIS-08 il tetto è 1000 token (catalogo v2, UIG-9.4) e il catalogo pieno ci sta', () => {
  assert.equal(TETTO_TOKEN_DEL_PROMPT, 1000);
  assert.ok(stimaToken(promptDelCatalogo(PC)) <= TETTO_TOKEN_DEL_PROMPT, String(stimaToken(promptDelCatalogo(PC))));
});

test('BLOCCHI-SIS-09 avviaSessione lo inoltra al nucleo; assente resta assente', async () => {
  const ricevuti = [];
  const comune = { cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: async (input) => { ricevuti.push(input); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; } };
  await avviaSessione({ ...comune, catalogoBlocchi: PC });
  await avviaSessione(comune);
  assert.deepEqual(ricevuti[0].catalogoBlocchi, PC);
  assert.equal(Object.hasOwn(ricevuti[1], 'catalogoBlocchi'), false);
});

function registro(t, opzioni = {}) {
  const giri = [];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-blocchi-registro-'));
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => new Promise((risolvi) => { giri.push({ input, risolvi }); }),
    ...opzioni,
  });
  t.after(async () => { for (const g of giri) g.risolvi({ comeFinita: 'concluso' }); await r.chiudi?.(); await new Promise((f) => setTimeout(f, 30)); rimuoviCartellaDiProva(cartellaStore); });
  return { r, giri };
}
const attesa = () => new Promise((f) => setTimeout(f, 30));

test('BLOCCHI-SIS-10 il registro passa il valore dell\'ospite; senza ospite niente; senza persona davanti niente', async (t) => {
  const acceso = registro(t, { catalogoBlocchi: PC });
  acceso.r.avvia('task');
  await attesa();
  assert.deepEqual(acceso.giri[0].input.catalogoBlocchi, PC);

  const spento = registro(t);
  spento.r.avvia('task');
  await attesa();
  assert.equal(Object.hasOwn(spento.giri[0].input, 'catalogoBlocchi'), false);

  const senzaNessuno = registro(t, { catalogoBlocchi: PC });
  senzaNessuno.r.avvia('task', { senzaInterfaccia: true });
  await attesa();
  assert.equal(senzaNessuno.giri[0].input.nessunoDavanti, true, 'la prova deve guardare una sessione senza persona');
  assert.equal(Object.hasOwn(senzaNessuno.giri[0].input, 'catalogoBlocchi'), false);
});

/* ---------- 04/11/2026, decisioni 139 e 140 + condizioni di CLI, Performance e Mobile ---------- */

async function finche(condizione, tetto = 5_000) {
  const fine = Date.now() + tetto;
  while (!condizione()) {
    if (Date.now() > fine) throw new Error('condizione mai vera');
    await new Promise((f) => setTimeout(f, 10));
  }
}

/* Il filo intero: registro vero → agent-service vero → nucleo vero, e la richiesta al fornitore presa al volo. */
function registroDalFilo(t, opzioni = {}) {
  const richieste = [];
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-blocchi-filo-'));
  const rete = async (_url, init) => {
    richieste.push(JSON.parse(init.body).messages);
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  };
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, _giriMassimiInterno: 1, fetchDiRete: rete }) }),
    ...opzioni,
  });
  t.after(async () => { await r.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {}); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });
  return { r, richieste };
}
/* Sul filo il primo messaggio di sistema arriva a pezzi di testo (`[{ type: 'text', text }]`, col segno della cache): si legge il testo
   dei pezzi, mai il JSON (che raddoppia gli a capo e non conterrebbe mai il catalogo intero). */
const primoDiSistema = (messaggi) => {
  const m = messaggi.find((x) => x.role === 'system');
  return Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : testo(m);
};

test('BLOCCHI-SIS-11 di serie (ambiente vuoto) una conversazione nuova del PC ha il catalogo nel primo messaggio di sistema; con 0 no; automazione, figlia e locale no', async (t) => {
  const diSerie = registroDalFilo(t, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}) });
  diSerie.r.avvia('task');
  await finche(() => diSerie.richieste.length > 0);
  assert.ok(primoDiSistema(diSerie.richieste[0]).includes(promptDelCatalogo(PC)), 'il catalogo del PC, intero, nel prefisso');

  const spento = registroDalFilo(t, { catalogoBlocchi: catalogoBlocchiDaAmbiente({ TALOS_CATALOGO_BLOCCHI: '0' }) });
  spento.r.avvia('task');
  await finche(() => spento.richieste.length > 0);
  assert.equal(primoDiSistema(spento.richieste[0]).includes('## Blocks'), false, 'TALOS_CATALOGO_BLOCCHI=0 spegne tutto');

  const automazione = registroDalFilo(t, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}) });
  automazione.r.avvia('task', { senzaInterfaccia: true });
  await finche(() => automazione.richieste.length > 0);
  assert.equal(automazione.richieste[0].some((m) => testo(m).includes('## Blocks')), false, 'nessuno davanti, nessun blocco');

  const diSerieValore = catalogoBlocchiDaAmbiente({});
  assert.ok(diSerieValore, 'la prova deve guardare il valore di serie, non null');
  for (const modello of ['local:qualcosa', 'locale-ospite:qualcosa']) {
    assert.equal((await primo({ modello, catalogoBlocchi: diSerieValore })).includes(LINGUA_DEL_RECINTO), false, modello);
  }
  assert.equal((await primo({ agentRole: 'child', catalogoBlocchi: diSerieValore })).includes(LINGUA_DEL_RECINTO), false, 'figlia');
});

/* Un ospite col giro che si chiude a comando: ogni giro scrive RunStarted, e `fine(i)` lo chiude come la suite di F-010. */
function registroAComando(cartellaStore, opzioni = {}) {
  const giri = [];
  const r = createSessionRegistry({
    cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    cartelleProgetto: [], preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const fineGiro = new Promise((ok) => { risolvi = ok; });
      const i = giri.length;
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${i}`, runId: `r${i}` });
      return fineGiro;
    },
    ...opzioni,
  });
  const fine = (i) => {
    giri[i].input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` });
    giri[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ok' }] } });
  };
  const chiudiTutto = async () => { for (let i = 0; i < giri.length; i += 1) { try { fine(i); } catch { /* già chiuso */ } } await r.chiudi?.({ attesaMassimaMs: 2_000 }).catch(() => {}); };
  return { r, giri, fine, chiudiTutto };
}
const haIlCatalogo = (giro) => Object.hasOwn(giro.input, 'catalogoBlocchi');

test('BLOCCHI-SIS-12 preferenza spenta: niente catalogo nelle conversazioni nuove; quella già aperta resta com\'era, anche dopo un riavvio; letta una volta sola per nascita', async (t) => {
  const { blocchiViviAllaNascita } = promptDelCatalogoMod;
  assert.equal(typeof blocchiViviAllaNascita, 'function', 'la funzione dell\'ospite che legge la preferenza alla nascita');
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-blocchi-preferenza-'));
  let preferenza = true;
  let letture = 0;
  const opzioni = { catalogoBlocchi: catalogoBlocchiDaAmbiente({}), blocchiViviPerNuoveFn: blocchiViviAllaNascita(() => { letture += 1; return preferenza; }) };
  const primo = registroAComando(cartellaStore, opzioni);
  let secondo = null;
  t.after(async () => { await primo.chiudiTutto(); await secondo?.chiudiTutto(); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });

  const { sessionId: aperta } = primo.r.avvia('task');
  await finche(() => primo.giri.length === 1);
  assert.ok(haIlCatalogo(primo.giri[0]), 'di serie la preferenza è accesa');
  preferenza = false;
  const { sessionId: nuova } = primo.r.avvia('task');
  await finche(() => primo.giri.length === 2);
  assert.equal(haIlCatalogo(primo.giri[1]), false, 'spenta: la conversazione nuova nasce senza catalogo');
  assert.equal(letture, 2, 'una lettura per nascita');

  primo.fine(0); primo.fine(1);
  await primo.r.attendiAssestamento(aperta); await primo.r.attendiAssestamento(nuova);
  primo.r.resume(aperta, 'e adesso?');
  await finche(() => primo.giri.length === 3);
  assert.ok(haIlCatalogo(primo.giri[2]), 'la conversazione già aperta non cambia un byte del prefisso');
  primo.fine(2);
  await primo.r.attendiAssestamento(aperta);
  primo.r.resume(nuova, 'e adesso?');
  await finche(() => primo.giri.length === 4);
  assert.equal(haIlCatalogo(primo.giri[3]), false);
  assert.equal(letture, 2, 'mai a ogni richiesta (Performance)');

  /* Riavvio: la preferenza torna accesa, ma ogni conversazione tiene il timbro con cui è nata. */
  primo.fine(3);
  await primo.r.attendiAssestamento(nuova);
  await primo.chiudiTutto();
  await attendiScritture({ cartellaStore });
  preferenza = true;
  secondo = registroAComando(cartellaStore, opzioni);
  await secondo.r.ripristina();
  secondo.r.resume(nuova, 'dopo il riavvio');
  await finche(() => secondo.giri.length === 1);
  assert.equal(haIlCatalogo(secondo.giri[0]), false, 'il timbro «spenta» regge al riavvio');
  secondo.fine(0);
  await secondo.r.attendiAssestamento(nuova);
  secondo.r.resume(aperta, 'dopo il riavvio');
  await finche(() => secondo.giri.length === 2);
  assert.ok(haIlCatalogo(secondo.giri[1]), 'e quella nata accesa resta accesa');
  assert.equal(letture, 2, 'il ripristino non rilegge la preferenza');

  /* Un ramo porta la storia del padre e quindi il suo prefisso: nato da una conversazione «spenta» resta senza, anche con la
     preferenza accesa, e non la rilegge (mutante M10 del 04/11: senza questa parte l'eredità non la guardava nessuno). */
  secondo.fine(1);
  await secondo.r.attendiAssestamento(aperta);
  const ramo = secondo.r.forka(nuova);
  assert.ok(ramo.sessionId, JSON.stringify(ramo));
  await finche(() => secondo.giri.length === 3); // il ramo parte da solo col suo primo giro
  secondo.fine(2);
  assert.equal(haIlCatalogo(secondo.giri[2]), false, 'il ramo eredita il timbro del padre');
  assert.equal(letture, 2, 'un ramo non rilegge la preferenza');
});

test('BLOCCHI-SIS-13 una conversazione nata dal telefono resta senza catalogo fino a UI-137; una nata sul PC e aperta dal telefono resta com\'è', async (t) => {
  const { blocchiViviAllaNascita } = promptDelCatalogoMod;
  assert.equal(typeof blocchiViviAllaNascita, 'function');
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-blocchi-telefono-'));
  const viste = [];
  const b = registroAComando(cartellaStore, { catalogoBlocchi: catalogoBlocchiDaAmbiente({}),
    blocchiViviPerNuoveFn: (nascita) => { viste.push(nascita); return blocchiViviAllaNascita(() => true)(nascita); } });
  t.after(async () => { await b.chiudiTutto(); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia */ } rimuoviCartellaDiProva(cartellaStore); });

  const dalTelefono = b.r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'ciao dal Pad', dispositivoDelGiro: 'padnino0001aaaa' });
  assert.ok(dalTelefono.sessionId, JSON.stringify(dalTelefono));
  await finche(() => b.giri.length === 1);
  assert.equal(haIlCatalogo(b.giri[0]), false, 'nata dal telefono: niente catalogo');
  assert.deepEqual(viste.at(-1), { dispositivo: 'padnino0001aaaa' }, 'il registro dice all\'ospite da quale dispositivo nasce');

  const dalPc = b.r.avviaLibero({ cartellaLibera: cartellaStore, consegna: 'ciao dal PC' });
  await finche(() => b.giri.length === 2);
  assert.ok(haIlCatalogo(b.giri[1]), 'nata sul PC: il catalogo');
  assert.deepEqual(viste.at(-1), { dispositivo: null });

  b.fine(0); b.fine(1);
  await b.r.attendiAssestamento(dalTelefono.sessionId); await b.r.attendiAssestamento(dalPc.sessionId);
  b.r.resume(dalPc.sessionId, 'scrivo dal Pad', [], { dispositivoDelGiro: 'padnino0001aaaa' });
  await finche(() => b.giri.length === 3);
  assert.ok(haIlCatalogo(b.giri[2]), 'aperta dal telefono, il prefisso resta quello della nascita');
  b.r.resume(dalTelefono.sessionId, 'adesso dal PC', [], { dispositivoDelGiro: null });
  await finche(() => b.giri.length === 4);
  assert.equal(haIlCatalogo(b.giri[3]), false, 'e quella nata dal telefono resta senza, anche scritta dal PC');
});
