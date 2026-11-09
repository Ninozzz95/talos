/*
 * Decisioni 57 e 144 (04/11/2026): il prezzo del modello lungo tutto il filo (trappola già pagata: agent-service e il registro ricostruiscono
 *   le opzioni campo per campo). server → registro → servizio dell'agente → nucleo (la carta della ricerca); registro → orchestratore (ciò che
 *   il modello legge quando la ricerca parte: la seconda porta, con la STESSA cifra della carta).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as ms } from 'node:timers/promises';
import { avviaSessione } from '../src/agent-service.mjs';
import { azioneCartaRicerca } from '../src/kernel/talosHarness.mjs';
import { prezzoDelModelloEntro } from '../src/kernel/costo-in-dollari.mjs';
import { prezzoPerMilione } from '../src/impostazioni/prezzo-del-modello.mjs';
import { createModelCatalog } from '../src/model-catalog.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { aggiornaRicerca } from '../src/research-store.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function registroDiProva(t, opzioni = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-dollari-filo-'));
  const ingressi = [];
  const fine = [];
  /* Treno J (05/11/2026): la ricerca avviata dalla prova si conclude quando la pulizia libera le sessioni finte, e scrive la sua
     meta.json mentre la cartella sparisce (rifiuto non gestito, ENOENT su meta.json.tmp-). Le scritture in volo si aspettano;
     a pulizia iniziata non se ne aprono di nuove. */
  const scrittureRicerca = new Set();
  let pulizia = false;
  const aggiornaRicercaFn = (input, deps) => {
    if (pulizia) return Promise.resolve();
    const p = aggiornaRicerca(input, deps);
    scrittureRicerca.add(p);
    p.then(() => scrittureRicerca.delete(p), () => scrittureRicerca.delete(p));
    return p;
  };
  const registry = createSessionRegistry({ cartellaStore, aggiornaRicercaFn, modello: 'z-ai/glm-5.3-flash', chiave: 'k', cartellaEsisteFn: () => true,
    // l'osservatore vero della cartella resterebbe acceso dopo la prova (misurato: 4 timer di `workspace-watcher.mjs:211` tenevano vivo il processo)
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn(input) { ingressi.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${ingressi.length}` }); return new Promise((r) => fine.push(r)); },
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'leggi' } }), ...opzioni });
  t.after(async () => { for (const r of fine) r({}); await registry.chiudi?.(); try { await attendiScritture({ cartellaStore }); } catch { /* va comunque */ } await ms(20);
    pulizia = true;
    await Promise.allSettled([...scrittureRicerca]);
    rimuoviCartellaDiProva(cartellaStore); });
  return { registry, ingressi };
}

for (const [nome, opzione] of [['data', async () => ({ in: 1, out: 2 })], ['assente (la CLI)', undefined]]) {
  test(`DOLL-FILO-1 il registro passa prezzoDelModelloFn al servizio dell'agente: ${nome}`, async (t) => {
    const { registry, ingressi } = registroDiProva(t, opzione ? { prezzoDelModelloFn: opzione } : {});
    registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
    await ms(5);
    assert.equal(ingressi.length, 1);
    if (opzione) assert.equal(ingressi[0].prezzoDelModelloFn, opzione, 'la stessa funzione, senza logica propria');
    else assert.equal(ingressi[0].prezzoDelModelloFn ?? null, null);
  });
}

for (const [nome, opzione] of [['data', async () => ({ in: 1, out: 2 })], ['assente', undefined]]) {
  test(`DOLL-FILO-2 il servizio dell'agente la passa al nucleo: ${nome}`, async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-dollari-as-'));
    t.after(() => rimuoviCartellaDiProva(cartella));
    let visto;
    await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, ...(opzione ? { prezzoDelModelloFn: opzione } : {}),
      talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} }; } });
    if (opzione) assert.equal(visto.prezzoDelModelloFn, opzione);
    else assert.equal('prezzoDelModelloFn' in visto, false, 'assente resta assente');
  });
}

test('DOLL-FILO-3 seconda porta: quando la ricerca parte il modello legge la stessa cifra della carta', async (t) => {
  const chiesti = [];
  const prezzoDelModelloFn = async (m) => { chiesti.push(m); return { in: 0.4, out: 1.6 }; };
  const { registry, ingressi } = registroDiProva(t, { prezzoDelModelloFn });
  registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  await ms(5);
  const esito = await ingressi[0].onRicercaAvvia({ question: 'Come fanno i concorrenti?', depth: 'quick' });
  assert.equal(esito.ok, true, JSON.stringify(esito).slice(0, 300));
  const carta = azioneCartaRicerca('c', { question: 'Come fanno i concorrenti?', depth: 'quick' }, { in: 0.4, out: 1.6 });
  assert.ok(esito.esito.includes(`${carta.fraseParams.dollari} at the published price`), esito.esito);
  assert.ok(chiesti.includes('z-ai/glm-5.3-flash'), `il prezzo del modello della ricerca: ${chiesti}`);
});

test('DOLL-FILO-4 AL CONTRARIO: senza prezzo il modello legge il lavoro, nessun dollaro', async (t) => {
  const { registry, ingressi } = registroDiProva(t, { prezzoDelModelloFn: async () => null });
  registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  await ms(5);
  const esito = await ingressi[0].onRicercaAvvia({ question: 'q', depth: 'quick' });
  assert.equal(esito.ok, true);
  assert.doesNotMatch(esito.esito, /\$|USD/u);
  assert.match(esito.esito, /~\d+ tokens\./u);
});

/* Il primo anello, nel server: la fonte del prezzo è quella che c'era già (catalogo → `prezzoPerMilione`), una sola, e arriva al registro.
   Il server intero non si avvia in una prova d'unità: si legge il sorgente, come le altre prove di cablaggio di server.mjs. */
test('DOLL-FILO-5 il server dà al registro la sola fonte del prezzo che esiste già', () => {
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /const prezzoDelModelloFn = async \(id\) => prezzoPerMilione\(await readModelCapabilities\(id\)\);/u);
  const registro = sorgente.slice(sorgente.indexOf('createSessionRegistry(resumeDiagnostics.registryOptions({'));
  assert.match(registro.slice(0, registro.indexOf('})));')), /\n\s+prezzoDelModelloFn,/u, 'la stessa funzione passata al registro');
});

/* Condizione 1 di Performance (04/11/2026): col catalogo FREDDO la prima carta non aspetta la rete oltre il tetto; la lettura però continua
   e riempie il catalogo, così la volta dopo il prezzo c'è subito. Il catalogo vero (`createModelCatalog`, con la sua cache) e la stessa
   composizione di `server.mjs:455` (`prezzoPerMilione` sulle capacità del modello), con la rete finta che pende finché la prova la libera. */
test('DOLL-FILO-6 Performance: catalogo freddo ⇒ prima carta senza attesa; la lettura continua e la volta dopo il prezzo c\'è', async () => {
  let libera;
  const rete = new Promise((r) => { libera = r; });
  let chiamateDiRete = 0;
  const catalogo = createModelCatalog({ fetchFn: async () => {
    chiamateDiRete += 1;
    await rete;
    return { ok: true, json: async () => ({ data: [{ id: 'a/b', name: 'A', pricing: { prompt: '0.0000004', completion: '0.0000016' } }] }) };
  } });
  const prezzoDelModelloFn = async (id) => prezzoPerMilione((await catalogo.ottieni()).modelli.find((m) => m.id === id) ?? null);
  const t0 = performance.now();
  assert.equal(await prezzoDelModelloEntro(prezzoDelModelloFn, 'a/b'), null, 'freddo: la carta esce col lavoro');
  assert.ok(performance.now() - t0 < 450, `attesa ${Math.round(performance.now() - t0)} ms (tetto 300 ms)`);
  libera();
  await ms(20);
  const t1 = performance.now();
  const prezzo = await prezzoDelModelloEntro(prezzoDelModelloFn, 'a/b');
  assert.ok(performance.now() - t1 < 100, 'caldo: nessuna attesa');
  assert.ok(Math.abs(prezzo.in - 0.4) < 1e-9 && Math.abs(prezzo.out - 1.6) < 1e-9, JSON.stringify(prezzo));
  assert.equal(chiamateDiRete, 1, 'la seconda carta legge la memoria, non la rete');
});

/* Prova dell'escape (Desktop 04/11/2026, dopo CRC-11 del Mobile): il testo vero dell'orchestratore, quello che il modello legge quando la
   ricerca parte, porta «~$<0.0001» e un importo normale come testo, uguali alla carta. */
const SEGNI_HTML = /&(?:lt|gt|amp|quot|#\d+);/u;
for (const [nome, prezzo, minuscolo] of [['~$<0.0001', { in: 0.000001, out: 0.000001 }, true], ['importo normale', { in: 0.4, out: 1.6 }, false]]) {
  test(`DOLL-FILO-ESCAPE ${nome}: il modello legge i dollari dell'orchestratore come testo, gli stessi della carta`, async (t) => {
    const { registry, ingressi } = registroDiProva(t, { prezzoDelModelloFn: async () => prezzo });
    registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
    await ms(5);
    const esito = await ingressi[0].onRicercaAvvia({ question: 'Come fanno i concorrenti?', depth: 'quick' });
    assert.equal(esito.ok, true, JSON.stringify(esito).slice(0, 300));
    const dollari = azioneCartaRicerca('c', { question: 'Come fanno i concorrenti?', depth: 'quick' }, prezzo).fraseParams.dollari;
    if (minuscolo) assert.equal(dollari, '~$<0.0001');
    else assert.match(dollari, /^~\$\d+\.\d{2,4}$/u);
    assert.ok(esito.esito.includes(`${dollari} at the published price`), esito.esito);
    assert.doesNotMatch(esito.esito, SEGNI_HTML);
  });
}
