/*
 * K4a (03/10/2026, owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — i testi che il server
 * manda alla persona come DATI (Doctor, fonti di ricerca, fornitori, scheda GitHub) si dicono nella lingua dell'interfaccia
 * dalla chiave stabile; senza la chiave nel dizionario si mostra la frase inglese del server, mai la chiave.
 * Il contratto lato server (la frase inglese uguale alla voce inglese, i valori nei segnaposto) è in
 * `harness-ui/tests/k4a-testi-del-server.test.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { controlliDoctor } from '../../src/components/doctor.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { normalizzaFonteRicerca } from '../../src/components/fonte-ricerca.js';
import {
  CHIAVE_ESECUZIONE_FORNITORE, CHIAVE_NOME_FORNITORE, esecuzioneDelFornitore, nomeDelFornitore, testoDelCampo, testoDelServer,
} from '../../src/components/testo-server.js';
import { TESTI } from '../../src/i18n/testi/index.js';

const base = { chiaveApi: true, shell: 'desktop', git: true, naviga: true };
const righeDi = (controlli, id) => controlli.find((c) => c.id === id).righe.join(' | ');

test('K4A-01 — una chiave del dizionario si dice nella lingua corrente, coi valori dentro', () => {
  impostaLingua('it');
  assert.equal(testoDelServer('server.probe.noKeySaved', { provider: 'Groq' }, 'No key saved for Groq.'), 'Nessuna chiave salvata per Groq.');
  impostaLingua('en');
  assert.equal(testoDelServer('server.probe.noKeySaved', { provider: 'Groq' }, 'No key saved for Groq.'), 'No key saved for Groq.');
  impostaLingua('it');
});

test('K4A-02 — AL CONTRARIO: una chiave che il dizionario non ha mostra la frase del server, mai la chiave', () => {
  for (const lingua of ['it', 'en']) {
    impostaLingua(lingua);
    assert.equal(testoDelServer('server.non.esiste', { n: 1 }, 'The server sentence.'), 'The server sentence.');
    assert.equal(testoDelServer('non una chiave', undefined, 'Another sentence.'), 'Another sentence.');
    assert.equal(testoDelServer(undefined, undefined, 'No key at all.'), 'No key at all.');
    assert.equal(testoDelServer(42, undefined, 'A number is not a key.'), 'A number is not a key.');
  }
  impostaLingua('it');
});

test('K4A-03 — il plurale: una chiave con `One` e `Many` sceglie col numero `n`, nelle due lingue', () => {
  impostaLingua('it');
  assert.equal(testoDelServer('server.doctor.scratch.summary', { n: 1, bytes: 10, path: 'C:/t' }, 'x'), '1 voce, 10 byte in C:/t. Ciò che resta fermo per 24 ore si toglie all\'avvio.');
  assert.equal(testoDelServer('server.doctor.scratch.summary', { n: 2, bytes: 10, path: 'C:/t' }, 'x'), '2 voci, 10 byte in C:/t. Ciò che resta fermo per 24 ore si toglie all\'avvio.');
  impostaLingua('en');
  assert.equal(testoDelServer('server.doctor.scratch.summary', { n: 1, bytes: 10, path: 'C:/t' }, 'x'), '1 entry, 10 bytes in C:/t. Anything left idle for 24 hours is removed at startup.');
  assert.equal(testoDelServer('server.doctor.scratch.summary', { n: 0, bytes: 0, path: 'C:/t' }, 'x'), '0 entries, 0 bytes in C:/t. Anything left idle for 24 hours is removed at startup.');
  /* senza il numero non si sceglie a caso: resta la frase del server */
  assert.equal(testoDelServer('server.doctor.scratch.summary', { bytes: 0 }, 'The server sentence.'), 'The server sentence.');
  impostaLingua('it');
});

test('K4A-04 — un parametro `<nome>Chiave` dice che il valore è a sua volta un testo del dizionario (il nome della fonte)', () => {
  const dato = { dettaglio: 'The address of the SearXNG (your instance) instance is still needed.', dettaglioChiave: 'server.doctor.search.endpointMissing',
    dettaglioParams: { label: 'SearXNG (your instance)', labelChiave: 'server.search.label.searxng' } };
  impostaLingua('it');
  assert.equal(testoDelCampo(dato, 'dettaglio'), 'Serve ancora l\'indirizzo dell\'istanza SearXNG (istanza tua).');
  impostaLingua('en');
  assert.equal(testoDelCampo(dato, 'dettaglio'), 'The address of the SearXNG (your instance) instance is still needed.');
  /* e se la chiave del nome manca nel dizionario, entra il nome com'è: mai una chiave nella frase */
  const nomeSconosciuto = { dettaglio: 'x', dettaglioChiave: 'server.doctor.search.ready', dettaglioParams: { label: 'Tavily', labelChiave: 'server.search.label.tavily' } };
  assert.equal(testoDelCampo(nomeSconosciuto, 'dettaglio'), 'Ready: Tavily.');
  impostaLingua('it');
});

test('K4A-05 — il Doctor dice i dettagli del server nella lingua corrente, e senza chiavi resta com\'era', () => {
  const dati = {
    ...base,
    labs: { accesi: ['a', 'b'], dettaglio: 'Labs on: a, b (NOT_LIVE_VALIDATED until tested).', dettaglioChiave: 'server.doctor.labs.on', dettaglioParams: { list: 'a, b' } },
    cartelleProgetto: { disponibili: true, conteggio: 1, dettaglio: '1 project folder available.', dettaglioChiave: 'server.doctor.folders.available', dettaglioParams: { n: 1 } },
    ricercaWeb: { fonte: 'duckduckgo', etichetta: 'DuckDuckGo (no key)', etichettaChiave: 'server.search.label.duckduckgo', pronta: true,
      dettaglio: 'Ready, no key needed: DuckDuckGo (public page, may block under heavy use).', dettaglioChiave: 'server.doctor.search.readyKeyless' },
    sessioniPersistenza: { corrotte: [], ultimaLettura: { ripristinate: 3, totali: 5 }, dettaglio: '3 of 5 sessions restored: none discarded.', dettaglioChiave: 'server.doctor.sessions.restoredAll', dettaglioParams: { restored: 3, total: 5 } },
    ownerRuntime: { configurato: true, pronto: true, dettaglio: 'Agent runtime ready.', dettaglioChiave: 'server.doctor.runtime.ready' },
  };
  impostaLingua('it');
  let c = controlliDoctor(dati);
  assert.match(righeDi(c, 'labs'), /Labs accesi: a, b \(NOT_LIVE_VALIDATED finché non provati\)\./);
  assert.match(righeDi(c, 'cartelle'), /1 cartella di progetto disponibili\./);
  assert.match(righeDi(c, 'ricerca'), /DuckDuckGo \(senza chiave\)/);
  assert.match(righeDi(c, 'ricerca'), /Pronta, senza chiave: DuckDuckGo/);
  assert.match(righeDi(c, 'sessioni'), /3 sessioni ripristinate su 5: nessuna scartata\./);
  assert.match(righeDi(c, 'runtime'), /Runtime agente pronto\./);
  impostaLingua('en');
  c = controlliDoctor(dati);
  assert.match(righeDi(c, 'labs'), /Labs on: a, b \(NOT_LIVE_VALIDATED until tested\)\./);
  assert.match(righeDi(c, 'ricerca'), /DuckDuckGo \(no key\)/);
  assert.match(righeDi(c, 'sessioni'), /3 of 5 sessions restored: none discarded\./);
  assert.match(righeDi(c, 'runtime'), /Agent runtime ready\./);
  /* AL CONTRARIO: un server più vecchio, senza chiavi, mostra la sua frase com'è */
  c = controlliDoctor({ ...base, labs: { accesi: [], dettaglio: 'Labs accesi: nessuno.' } });
  assert.match(righeDi(c, 'labs'), /Labs accesi: nessuno\./);
  impostaLingua('it');
});

test('K4A-06 — il nome di una fonte di ricerca e di un fornitore con una parola italiana si dicono nel dizionario', () => {
  const dati = {
    source: 'searxng', endpoint: '', readiness: 'indirizzo-mancante',
    fonti: ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom'].map((id) => ({ id, label: { duckduckgo: 'DuckDuckGo (no key)', searxng: 'SearXNG (your instance)', custom: 'Custom endpoint' }[id] ?? id, ...(['duckduckgo', 'searxng', 'custom'].includes(id) ? { labelChiave: `server.search.label.${id}` } : {}),
      needsKey: id === 'tavily' || id === 'brave', needsEndpoint: id === 'searxng' || id === 'custom', keyless: id === 'duckduckgo', keyConfigured: false })),
  };
  impostaLingua('it');
  assert.deepEqual(normalizzaFonteRicerca(dati).fonti.map((f) => f.label), ['DuckDuckGo (senza chiave)', 'tavily', 'brave', 'SearXNG (istanza tua)', 'Endpoint personalizzato']);
  impostaLingua('en');
  assert.deepEqual(normalizzaFonteRicerca(dati).fonti.map((f) => f.label), ['DuckDuckGo (no key)', 'tavily', 'brave', 'SearXNG (your instance)', 'Custom endpoint']);
  /* i fornitori: i quattro con una parola italiana nel nome, e gli altri col nome del server */
  assert.equal(nomeDelFornitore({ id: 'zai-anthropic', label: 'Z.AI (porta Anthropic)' }), 'Z.AI (Anthropic port)');
  assert.equal(nomeDelFornitore({ id: 'esterno', label: 'Agente esterno' }), 'External agent');
  assert.equal(nomeDelFornitore({ id: 'groq', label: 'Groq' }), 'Groq');
  assert.equal(nomeDelFornitore({ id: 'nuovo', label: 'Un nome del server' }), 'Un nome del server');
  impostaLingua('it');
  assert.equal(nomeDelFornitore({ id: 'zai-anthropic', label: 'Z.AI (porta Anthropic)' }), 'Z.AI (porta Anthropic)');
  assert.equal(nomeDelFornitore({ id: 'local', label: 'Motore locale (llama.cpp)' }), 'Motore locale (llama.cpp)');
});

test('K4A-07 — lo stato di esecuzione di un fornitore nel Doctor: i valori noti nel dizionario, uno sconosciuto com\'è', () => {
  impostaLingua('en');
  assert.deepEqual(['collegato', 'runtime locale', 'motore locale', 'configurato', 'da configurare', 'da configurare sul computer', 'altro'].map(esecuzioneDelFornitore),
    ['connected', 'local runtime', 'local engine', 'configured', 'to configure', 'to configure on the computer', 'altro']);
  impostaLingua('it');
  /* in italiano il valore resta quello che il server ha sempre mandato */
  for (const valore of Object.keys(CHIAVE_ESECUZIONE_FORNITORE)) assert.equal(esecuzioneDelFornitore(valore), valore);
  const c = controlliDoctor({ ...base, providers: { storeAvailable: true, items: [{ id: 'groq', label: 'Groq', keyConfigured: true, execution: 'collegato' }, { id: 'local', label: 'Motore locale (llama.cpp)', keyConfigured: false, requiresKey: false, execution: 'motore locale' }] } });
  assert.match(righeDi(c, 'fornitori'), /Groq: .* · collegato/);
  impostaLingua('en');
  const e = controlliDoctor({ ...base, providers: { storeAvailable: true, items: [{ id: 'local', label: 'Motore locale (llama.cpp)', keyConfigured: false, requiresKey: false, execution: 'motore locale' }] } });
  assert.match(righeDi(e, 'fornitori'), /Local engine \(llama\.cpp\): .* · local engine/);
  impostaLingua('it');
});

test('K4A-08 — ogni chiave della tabella dei nomi e dell\'esecuzione ha la sua voce in italiano e in inglese', () => {
  for (const chiave of [...Object.values(CHIAVE_NOME_FORNITORE), ...Object.values(CHIAVE_ESECUZIONE_FORNITORE)]) {
    assert.ok(TESTI.it[chiave] !== undefined && TESTI.en[chiave] !== undefined, chiave);
  }
});
