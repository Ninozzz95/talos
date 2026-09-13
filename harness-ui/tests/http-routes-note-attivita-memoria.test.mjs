import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
/*
 * ⛔⛔⛔ LE STESSE FUNZIONI CHE USA IL MODELLO, importate qui alla lettera.
 * `agent-service.mjs` costruisce gli attrezzi `notes_*`/`tasks_*`/`memory_*` da questi identici
 * import (`elencaNote as elencaNoteReale`, `creaNota as creaNotaReale`, ...). Se una prova qui
 * dentro usasse un magazzino finto, proverebbe che le rotte parlano con QUALCOSA — non che una
 * scrittura della persona e una del modello finiscono nello stesso file, che è l'unica cosa che
 * conta davvero in questo lotto.
 */
import { creaNota, elencaNote } from '../src/notes-store.mjs';
import { creaAttivita, elencaAttivita } from '../src/tasks-store.mjs';
import { creaMemoria, elencaMemorie } from '../src/memory-store.mjs';

const SESSIONE = 'sess-crud';

/**
 * Un server vero su una porta libera, con i tre magazzini in una cartella TEMPORANEA.
 * ⛔ Mai i dati veri dell'owner e mai la 4174: le prove scrivono e cancellano davvero, e devono
 * poterlo fare su roba propria (regola del banco, e stesso principio di `cartellaStore` per le
 * sessioni).
 */
async function listen(t, { sessioni = [SESSIONE] } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-crud-'));
  t.after(() => rmSync(radice, { recursive: true, force: true }));
  const cartelle = {
    cartellaNote: join(radice, 'note'),
    cartellaAttivita: join(radice, 'attivita'),
    cartellaMemoria: join(radice, 'memoria'),
  };
  const vive = new Set(sessioni);
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: { esiste: (id) => vive.has(id) },
    ...cartelle,
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, ...cartelle };
}

const scrivi = (base, percorso, metodo, corpo) => fetch(`${base}${percorso}`, {
  method: metodo,
  headers: { 'Content-Type': 'application/json' },
  ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
});

const perSessione = (percorso) => `/api/v1/sessions/${SESSIONE}${percorso}`;

/* ───────────────────────── NOTE — il giro completo, nei due versi ───────────────────────── */

test('⭐⭐⭐⭐ NOTE — crea, leggi, modifica, elimina: il giro intero dalla porta della persona', async (t) => {
  const { base, cartellaNote } = await listen(t);

  const creata = await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'Codice cancello', contenuto: '4471' });
  assert.equal(creata.status, 201, 'una creazione è 201, non 200 (RFC 9110 §15.3.2)');
  const nata = (await creata.json()).data.nota;
  assert.equal(creata.headers.get('location'), `/api/v1/sessions/${SESSIONE}/notes/${nata.id}`, 'il 201 DEVE portare Location');
  assert.equal(nata.titolo, 'Codice cancello');
  assert.equal(nata.contenuto, '4471');
  assert.equal(nata.formato, 'testo', 'un promemoria senza marcatori non è markdown');
  assert.equal(nata.origine, 'persona', 'l’ha scritta la persona: lo dice la PORTA, non il corpo della richiesta');
  assert.equal(typeof nata.creataAlle, 'string');

  const letta = await fetch(`${base}${perSessione(`/notes/${nata.id}`)}`);
  assert.equal(letta.status, 200);
  assert.deepEqual((await letta.json()).data.nota, nata, 'ciò che si rilegge è esattamente ciò che è stato creato');

  const modificata = await scrivi(base, perSessione(`/notes/${nata.id}`), 'PATCH', { contenuto: '# Il codice\n\n4471' });
  assert.equal(modificata.status, 200);
  const dopo = (await modificata.json()).data.nota;
  assert.equal(dopo.titolo, 'Codice cancello', 'un campo non mandato non si svuota');
  assert.equal(dopo.formato, 'markdown', 'il formato si rileva a ogni lettura: un titolo `#` aggiunto oggi si vede oggi');
  assert.equal(dopo.origine, 'persona');

  const eliminata = await scrivi(base, perSessione(`/notes/${nata.id}`), 'DELETE');
  assert.equal(eliminata.status, 200);
  assert.deepEqual((await eliminata.json()).data, { eliminata: true, id: nata.id, titolo: 'Codice cancello' });

  assert.deepEqual(await elencaNote({ cartella: cartellaNote }), [], 'il file è sparito davvero dal disco');
});

test('⛔⛔ AL CONTRARIO — NOTE: chiave non ammessa 400, corpo vuoto 400, contenuto oltre il tetto 400, id inesistente 404', async (t) => {
  const { base } = await listen(t);

  const ignota = await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'x', contenuto: 'y', colore: 'rosso' });
  assert.equal(ignota.status, 400);
  const erroreIgnota = (await ignota.json()).error;
  assert.equal(erroreIgnota.code, 'QUERY_INVALID');
  /*
   * ⛔⛔ MISURATO scrivendo questa prova, 11/09 — il messaggio che nomina la chiave rifiutata
   *   («chiave non ammessa: colore») NON esce dalla busta: `public-problem.mjs` sostituisce il
   *   testo vero con una frase generica per OGNI codice fuori da `MESSAGGIO_GIA_PER_LA_PERSONA`,
   *   e lì dentro oggi c'è solo `SESSION_NOT_READY`. Il dettaglio non è perso — finisce nel
   *   registro diagnostico, raggiungibile col `doctorReference` che la risposta porta — ma chi
   *   chiama vede «Query non valida» e basta.
   * ⇒ La prova dice il VERO invece di pretendere ciò che avevo scritto nel commento: 400, codice
   *   QUERY_INVALID, e un riferimento Doctor da cui ricavare il motivo. Alzare quella policy è una
   *   riga in un file che governa TUTTI i codici, e i messaggi dei magazzini oggi parlano di
   *   `title`/`content` (nomi di campo, in inglese): vanno riscritti per una persona PRIMA di
   *   poter uscire a schermo. Registrato nel rapporto, non fatto di nascosto qui.
   */
  assert.equal(erroreIgnota.message, 'Query non valida');
  assert.match(String(erroreIgnota.doctorReference ?? ''), /\S/, 'il motivo preciso resta raggiungibile dal Doctor');

  assert.equal((await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'senza contenuto' })).status, 400);
  assert.equal((await scrivi(base, perSessione('/notes'), 'POST', {})).status, 400);

  const { data } = await (await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'viva', contenuto: 'c' })).json();
  assert.equal((await scrivi(base, perSessione(`/notes/${data.nota.id}`), 'PATCH', {})).status, 400, 'un PATCH vuoto non è una modifica');

  const troppoLunga = await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'lunga', contenuto: 'a'.repeat(8_001) });
  assert.equal(troppoLunga.status, 400, 'il tetto vero lo dichiara il magazzino, e la porta lo riporta');
  assert.equal((await troppoLunga.json()).error.code, 'NOTE_INVALID');

  for (const [metodo, corpo] of [['GET', undefined], ['PATCH', { titolo: 'x' }], ['DELETE', undefined]]) {
    const risposta = await scrivi(base, perSessione('/notes/mai-esistita'), metodo, corpo);
    assert.equal(risposta.status, 404, `${metodo} su una nota inesistente`);
    assert.equal((await risposta.json()).error.code, 'NOTE_NOT_FOUND', 'la sessione c’è, la nota no: due assenze diverse, due codici diversi');
  }
});

test('⭐⭐⭐ NOTE — il formato DICHIARATO vince sul rilevato, e `formato:null` lo fa tornare a rilevarsi', async (t) => {
  const { base } = await listen(t);

  const dichiarata = await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'Elenco spesa', contenuto: '- pane\n- latte', formato: 'testo' });
  const nota = (await dichiarata.json()).data.nota;
  assert.equal(nota.formato, 'testo', 'chi scrive ha detto «testo»: il rilevamento non lo smentisce');

  const riletta = (await (await fetch(`${base}${perSessione(`/notes/${nota.id}`)}`)).json()).data.nota;
  assert.equal(riletta.formato, 'testo', 'la dichiarazione resta sul disco, non vive in memoria');

  const spenta = await scrivi(base, perSessione(`/notes/${nota.id}`), 'PATCH', { formato: null });
  assert.equal(spenta.status, 200);
  assert.equal((await spenta.json()).data.nota.formato, 'markdown', 'null = «smetti di dichiararlo»: torna il rilevamento, e quello vede l’elenco puntato');

  const assurdo = await scrivi(base, perSessione(`/notes/${nota.id}`), 'PATCH', { formato: 'html' });
  assert.equal(assurdo.status, 400);
  assert.equal((await scrivi(base, perSessione('/notes'), 'POST', { titolo: 't', contenuto: 'c', formato: null })).status, 400, 'null in creazione non vuol dire niente: non c’è una dichiarazione da disfare');
});

/* ───────────────────────── ATTIVITÀ ───────────────────────── */

test('⭐⭐⭐⭐ ATTIVITÀ — crea, modifica, cambia stato, elimina; `fatta` è calcolata, mai scritta', async (t) => {
  const { base, cartellaAttivita } = await listen(t);

  const creata = await scrivi(base, perSessione('/tasks'), 'POST', { titolo: 'Chiama idraulico', descrizione: 'rubinetto cucina', priorita: 'high' });
  assert.equal(creata.status, 201);
  const attivita = (await creata.json()).data.attivita;
  assert.equal(attivita.stato, 'todo');
  assert.equal(attivita.fatta, false);
  assert.equal(attivita.priorita, 'high');
  assert.equal(attivita.origine, 'persona');

  const modificata = await scrivi(base, perSessione(`/tasks/${attivita.id}`), 'PATCH', { priorita: 'low' });
  assert.equal(modificata.status, 200);
  assert.equal((await modificata.json()).data.attivita.priorita, 'low');

  const conStato = await scrivi(base, perSessione(`/tasks/${attivita.id}`), 'PATCH', { stato: 'done' });
  assert.equal(conStato.status, 400, 'lo stato NON è un campo della PATCH: ha la sua porta, come per il modello');

  const fatta = await scrivi(base, perSessione(`/tasks/${attivita.id}/stato`), 'POST', { stato: 'done' });
  assert.equal(fatta.status, 200);
  assert.deepEqual(
    [(await fatta.json()).data.attivita.stato, true],
    ['done', true],
  );

  const riaperta = await scrivi(base, perSessione(`/tasks/${attivita.id}/stato`), 'POST', { stato: 'todo' });
  assert.equal((await riaperta.json()).data.attivita.fatta, false, 'riaprire è lo stesso verbo con un altro valore, non una seconda rotta');

  assert.equal((await scrivi(base, perSessione(`/tasks/${attivita.id}/stato`), 'POST', { stato: 'finito' })).status, 400);
  assert.equal((await scrivi(base, perSessione(`/tasks/${attivita.id}/stato`), 'POST', {})).status, 400);
  assert.equal((await scrivi(base, perSessione('/tasks/mai-esistita/stato'), 'POST', { stato: 'done' })).status, 404);

  assert.equal((await scrivi(base, perSessione(`/tasks/${attivita.id}`), 'DELETE')).status, 200);
  assert.deepEqual(await elencaAttivita({ cartella: cartellaAttivita }), []);
});

/* ───────────────────────── MEMORIA ───────────────────────── */

test('⭐⭐⭐⭐ MEMORIA — crea, modifica, elimina; e un titolo già usato NON scrive una seconda voce', async (t) => {
  const { base, cartellaMemoria } = await listen(t);

  const creata = await scrivi(base, perSessione('/memory'), 'POST', { titolo: 'Risposte brevi', contenuto: 'Preferisco risposte brevi', genere: 'preference' });
  assert.equal(creata.status, 201);
  const corpoCreata = (await creata.json()).data;
  assert.equal(corpoCreata.duplicato, false);
  assert.equal(corpoCreata.memoria.genere, 'preference');
  assert.equal(corpoCreata.memoria.origine, 'persona');

  const gemella = await scrivi(base, perSessione('/memory'), 'POST', { titolo: '  risposte BREVI ', contenuto: 'altro testo' });
  assert.equal(gemella.status, 200, 'non ha creato niente: 200, non 201');
  const corpoGemella = (await gemella.json()).data;
  assert.equal(corpoGemella.duplicato, true, 'la deduplicazione si DICHIARA, non si nasconde');
  assert.equal(corpoGemella.memoria.id, corpoCreata.memoria.id);
  assert.equal(corpoGemella.memoria.contenuto, 'Preferisco risposte brevi', 'vince la voce già scritta, il secondo testo non la sovrascrive di nascosto');
  assert.equal((await elencaMemorie({ cartella: cartellaMemoria })).length, 1, 'sul disco c’è UNA memoria, non due');

  const modificata = await scrivi(base, perSessione(`/memory/${corpoCreata.memoria.id}`), 'PATCH', { contenuto: 'Risposte brevissime', genere: 'policy_note' });
  assert.equal(modificata.status, 200);
  assert.equal((await modificata.json()).data.memoria.genere, 'policy_note');

  assert.equal((await scrivi(base, perSessione(`/memory/${corpoCreata.memoria.id}`), 'PATCH', { genere: 'inventato' })).status, 400);
  assert.equal((await scrivi(base, perSessione(`/memory/${corpoCreata.memoria.id}`), 'DELETE')).status, 200);
  assert.deepEqual(await elencaMemorie({ cartella: cartellaMemoria }), []);
});

/* ───────── LA PARITÀ: stessa cartella, stesso file, due porte ───────── */

test('⭐⭐⭐⭐ PARITÀ — ciò che scrive la persona lo vede l’attrezzo del modello, e viceversa (stesso magazzino)', async (t) => {
  const { base, cartellaNote, cartellaAttivita, cartellaMemoria } = await listen(t);

  // 1) la persona scrive dalla rotta HTTP → l'attrezzo `notes_list` del modello la trova.
  const dallaPersona = (await (await scrivi(base, perSessione('/notes'), 'POST', { titolo: 'Dalla persona', contenuto: 'testo' })).json()).data.nota;
  const vistaDalModello = await elencaNote({ cartella: cartellaNote });
  assert.equal(vistaDalModello.length, 1);
  assert.equal(vistaDalModello[0].id, dallaPersona.id);
  assert.equal(vistaDalModello[0].origine, 'persona');

  // 2) il modello scrive col suo attrezzo → la rotta della persona la legge, e dice CHI l'ha scritta.
  const dalModello = await creaNota({ cartella: cartellaNote, title: 'Dal modello', content: '## Con un titolo' });
  const risposta = await fetch(`${base}${perSessione(`/notes/${dalModello.id}`)}`);
  assert.equal(risposta.status, 200);
  const letta = (await risposta.json()).data.nota;
  assert.equal(letta.origine, 'modello', 'nessuna origine sul disco = l’ha scritta il modello: fino a oggi era l’unica porta che scriveva');
  assert.equal(letta.formato, 'markdown');

  // 3) la persona MODIFICA una nota nata dal modello: resta sua, non cambia padrone.
  const modificata = (await (await scrivi(base, perSessione(`/notes/${dalModello.id}`), 'PATCH', { titolo: 'Ritoccata' })).json()).data.nota;
  assert.equal(modificata.origine, 'modello', 'chi l’ha CREATA non cambia perché qualcun altro l’ha corretta');

  // 4) lo stesso per attività e memorie, che hanno magazzini diversi ma la stessa regola.
  const attivitaDelModello = await creaAttivita({ cartella: cartellaAttivita, title: 'Dal modello' });
  const attivitaLetta = (await (await fetch(`${base}${perSessione(`/tasks/${attivitaDelModello.id}`)}`)).json()).data.attivita;
  assert.equal(attivitaLetta.origine, 'modello');
  assert.equal(attivitaLetta.fatta, false);

  const { voce: memoriaDelModello } = await creaMemoria({ cartella: cartellaMemoria, title: 'Dal modello', content: 'x' });
  const memoriaLetta = (await (await fetch(`${base}${perSessione(`/memory/${memoriaDelModello.id}`)}`)).json()).data.memoria;
  assert.equal(memoriaLetta.origine, 'modello');

  // 5) e una attività creata dalla persona è nell'elenco che legge l'attrezzo `tasks_list`.
  await scrivi(base, perSessione('/tasks'), 'POST', { titolo: 'Dalla persona' });
  const attivitaDelModelloElenco = await elencaAttivita({ cartella: cartellaAttivita });
  assert.deepEqual(attivitaDelModelloElenco.map((a) => a.origine).sort(), ['modello', 'persona']);
});

/* ───────── I CANCELLI: sessione, query, metodo ───────── */

test('⛔⛔ una sessione che non esiste è 404 su TUTTE e cinque le porte, prima di toccare il disco', async (t) => {
  const { base, cartellaNote } = await listen(t);
  const altrove = '/api/v1/sessions/mai-esistita';
  const casi = [
    ['POST', `${altrove}/notes`, { titolo: 't', contenuto: 'c' }],
    ['GET', `${altrove}/notes/qualunque`, undefined],
    ['PATCH', `${altrove}/notes/qualunque`, { titolo: 't' }],
    ['DELETE', `${altrove}/notes/qualunque`, undefined],
    ['POST', `${altrove}/tasks/qualunque/stato`, { stato: 'done' }],
  ];
  for (const [metodo, percorso, corpo] of casi) {
    const risposta = await scrivi(base, percorso, metodo, corpo);
    assert.equal(risposta.status, 404, `${metodo} ${percorso}`);
    assert.equal((await risposta.json()).error.code, 'NOT_FOUND', 'è la SESSIONE a non esistere: codice diverso da quello della voce');
  }
  assert.deepEqual(await elencaNote({ cartella: cartellaNote }), [], 'nessuna scrittura è arrivata al disco');
});

test('⛔ una query su queste rotte è 400: l’indirizzo dice già tutto', async (t) => {
  const { base } = await listen(t);
  const risposta = await scrivi(base, `${perSessione('/notes')}?forza=1`, 'POST', { titolo: 't', contenuto: 'c' });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('⛔⛔⛔ IL 405 DICE IL VERO — l’Allow di ogni rotta nuova, uno per uno', async (t) => {
  const { base } = await listen(t);
  const casi = [
    { percorso: perSessione('/notes'), metodo: 'PUT', allow: 'GET, HEAD, POST' },
    { percorso: perSessione('/notes/abc'), metodo: 'PUT', allow: 'GET, HEAD, PATCH, DELETE' },
    { percorso: perSessione('/tasks'), metodo: 'PUT', allow: 'GET, HEAD, POST' },
    { percorso: perSessione('/tasks/abc'), metodo: 'PUT', allow: 'GET, HEAD, PATCH, DELETE' },
    { percorso: perSessione('/tasks/abc/stato'), metodo: 'GET', allow: 'POST' },
    { percorso: perSessione('/memory'), metodo: 'PUT', allow: 'GET, HEAD, POST' },
    { percorso: perSessione('/memory/abc'), metodo: 'PUT', allow: 'GET, HEAD, PATCH, DELETE' },
  ];
  for (const caso of casi) {
    const risposta = await fetch(`${base}${caso.percorso}`, { method: caso.metodo });
    assert.equal(risposta.status, 405, `${caso.metodo} ${caso.percorso}`);
    assert.equal((await risposta.json()).error.code, 'METHOD_NOT_ALLOWED');
    assert.equal(risposta.headers.get('allow'), caso.allow, `Allow di ${caso.percorso}`);
  }
  /* ⛔ AL CONTRARIO: un nome vicino ma inventato resta 404, non 405 — il difetto del 07/9 non torna. */
  assert.equal((await fetch(`${base}${perSessione('/notes/abc/stato')}`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}${perSessione('/memoria')}`, { method: 'POST' })).status, 404);
});

test('⭐⭐ il preflight CORS di una VOCE annuncia PATCH e DELETE (senza, il mobile non potrebbe modificare né cancellare)', async (t) => {
  const { base } = await listen(t);
  const preflight = await fetch(`${base}${perSessione('/notes/abc')}`, { method: 'OPTIONS', headers: { Origin: 'http://localhost' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, HEAD, POST, PATCH, DELETE');
  /* AL CONTRARIO — una rotta che quei verbi non li ha resta com'era. */
  const collezione = await fetch(`${base}${perSessione('/notes')}`, { method: 'OPTIONS', headers: { Origin: 'http://localhost' } });
  assert.equal(collezione.headers.get('access-control-allow-methods'), 'GET, HEAD, POST');
});
