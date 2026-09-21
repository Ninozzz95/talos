/*
 * BC-07 — QUANDO IL CONTESTO NON RIESCE, IL SERVER LO DICE (e il pannello non deve inventare).
 *
 * Il difetto, misurato il 13/09/2026 su una porta effimera (mai il 4174): le rotte del pannello
 * Contesto rispondevano `{"error":{"code":"…","message":"…"}}` e basta — niente `ok:false`, niente
 * `meta`, niente frase da mostrare — oppure, peggio, con la copia di INTERNAL_ERROR: «Si è
 * verificato un problema imprevisto · Apri Doctor, copia il riferimento».
 *
 * ⛔⛔ RIFACIMENTO DELLO STESSO GIORNO. La prima stesura di questo file aveva tre difetti, trovati
 *   da un revisore e verificati uno per uno da me PRIMA di riscrivere:
 *   1. copriva METÀ della famiglia: `?x=1` e un corpo JSON malformato uscivano ancora con la copia
 *      rassicurante — misurato 400 su cinque indirizzi diversi, più 500 su un guasto senza codice.
 *      Ora la busta del contesto vale per TUTTE le uscite di questa famiglia di rotte.
 *   2. `assert.equal(casi.length, 8)` con otto `push` scritti a mano: un numero che non poteva
 *      essere diverso da otto qualunque cosa facesse il prodotto, e un commento che prometteva
 *      «se ne nasce una nona questo numero lo dice». Non era vero. Ora i casi si ricavano da
 *      `COPIA_CONTESTO`, che è del PRODOTTO: una copia nuova senza la sua prova fa diventare rosso
 *      questo file.
 *   3. il divieto di «imprevisto» e di rimandare a Doctor era asserito su UNA copia su sette.
 *      Verificato rompendo la premessa: mettendo quella frase dentro `CTX_STALE_REVISION` le
 *      quattro prove restavano VERDI. Ora il divieto gira su OGNI copia della tabella, ripiego
 *      compreso.
 *
 * ⛔ Ogni asserzione qui è stata provata anche NEL VERSO CHE DEVE FALLIRE, rompendo la premessa nel
 *   codice di produzione e guardando la prova diventare rossa.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { API_SCHEMA, COPIA_CONTESTO, COPIA_CONTESTO_PREDEFINITA, createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';

const RADICE = '/api/v1/sessions/s/context';

/** Un servizio del contesto che fallisce SEMPRE col codice chiesto: serve a raggiungere il `catch`. */
const servizioCheLancia = (code, message) => ({
  request: async () => { throw Object.assign(new Error(message), { code }); },
  close: async () => {},
});
/** Un servizio che si rompe come si rompe il codice vero: un errore SENZA codice. */
const servizioCheSiRompe = () => ({
  request: async () => { throw new Error('un guasto qualunque, senza codice'); },
  close: async () => {},
});
/** Un servizio SANO: serve a raggiungere le uscite che nascono nel server, non nel servizio. */
const servizioSano = () => ({
  request: async () => ({ schema: 'talos.context.snapshot.v1', revision: 0 }),
  close: async () => {},
});

async function conServer(t, opzioni) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...opzioni }));
  await new Promise((risolvi, rifiuta) => { server.once('error', rifiuta); server.listen(0, '127.0.0.1', risolvi); });
  t.after(() => new Promise((risolvi) => server.close(risolvi)));
  return `http://127.0.0.1:${server.address().port}`;
}

/*
 * ⛔ Gli indirizzi delle prove si CHIEDONO al prodotto, non si scrivono a mano: se un domani
 *   `/inventata` diventasse una rotta vera, una prova scritta a mano continuerebbe a dire «404»
 *   misurando un'altra cosa. Qui la sonda si ferma e lo dice.
 */
function rottaSconosciuta() {
  const candidato = `${RADICE}/inventata`;
  assert.equal(metodiAmmessiPerRotta(candidato), null, `${candidato} non è più sconosciuta al prodotto: la sonda del 404 misurerebbe un'altra cosa`);
  return candidato;
}
function rottaConMetodoVietato() {
  for (const percorso of [`${RADICE}/facts`, `${RADICE}/settings`, `${RADICE}/jobs`, RADICE]) {
    const ammessi = metodiAmmessiPerRotta(percorso);
    if (!ammessi) continue;
    for (const metodo of ['PUT', 'DELETE', 'PATCH', 'POST']) if (!ammessi.includes(metodo)) return { percorso, metodo };
  }
  throw new Error('nessuna rotta del contesto rifiuta un metodo: è la SONDA a essere rotta, non il prodotto');
}

/*
 * ⛔ IL DIVIETO, in un posto solo perché vale in OGNI posto. «Si è verificato un problema
 *   imprevisto» e «Apri Doctor» sono la copia di INTERNAL_ERROR: su queste rotte è falsa due volte
 *   — non è imprevisto, e Doctor non ha niente da spiegare su una funzione non attiva o su una
 *   richiesta storta. È la voragine che il prodotto ha già pagato due volte (O-49, L5).
 * ⛔ `doctorReference` resta ammesso: è un DATO per il registro, non un consiglio a chi guarda. Il
 *   divieto morde il TESTO, che è la cosa che arriva a una persona.
 */
function asserisciNienteCopiaRassicurante(copia, dove) {
  for (const campo of ['title', 'explanation', 'action']) {
    const testo = String(copia[campo] ?? '');
    assert.ok(!/imprevist/iu.test(testo), `${dove}/${campo}: «imprevisto» è falso qui — questa risposta è previstissima`);
    assert.ok(!/doctor/iu.test(testo), `${dove}/${campo}: Doctor non può spiegare questa risposta`);
  }
}

/**
 * Il contratto che il pannello può leggere: la busta standard PIÙ una frase per la persona.
 * ⛔ Non basta che ci sia la chiave: deve esserci del TESTO. Una `explanation: ''` supererebbe un
 *   controllo di presenza e a schermo resterebbe un pannello muto — cioè il difetto di oggi.
 */
function asserisciBustaLeggibile(corpo, { code, stato }) {
  assert.equal(corpo.ok, false, `${code}: la busta deve dichiarare ok:false come ogni altra rotta`);
  assert.equal(corpo.error.code, code);
  for (const campo of ['message', 'title', 'explanation', 'action']) {
    assert.equal(typeof corpo.error[campo], 'string', `${code}: ${campo} deve essere testo`);
    assert.ok(corpo.error[campo].trim().length > 0, `${code}: ${campo} non può essere vuoto — il pannello non avrebbe niente da scrivere`);
  }
  assert.equal(typeof corpo.error.riprovabile, 'boolean', `${code}: chi legge deve sapere se ha senso riprovare`);
  assert.equal(corpo.meta.schema, API_SCHEMA, `${code}: la busta deve portare lo schema dell'API`);
  assert.ok(!Number.isNaN(Date.parse(corpo.meta.generatedAt)), `${code}: meta.generatedAt deve essere una data vera`);
  assert.notEqual(stato, 200, `${code}: un guasto non esce mai come 200`);
  asserisciNienteCopiaRassicurante(corpo.error, code);
}

test('BC-07/1 — col motore del contesto spento la rotta del pannello DICE cosa succede, e non somiglia a una misura', async (t) => {
  const base = await conServer(t, {}); // nessun contextService: è lo stato normale dell'app installata
  const risposta = await fetch(`${base}${RADICE}`);
  const corpo = await risposta.json();

  assert.equal(risposta.status, 503, 'lo status NON cambia con questa cura: cambia il corpo');
  asserisciBustaLeggibile(corpo, { code: 'CTX_NOT_ENABLED', stato: risposta.status });

  /*
   * ⛔ IL CUORE DELLA RIGA: la risposta non deve poter essere scambiata per un contesto vero. Se
   *   un giorno qualcuno «riparasse» il 503 restituendo uno snapshot vuoto di cortesia, il pannello
   *   ricomincerebbe a mostrare numeri che il server non ha misurato — e questo caso diventerebbe
   *   rosso, che è esattamente il suo mestiere.
   */
  for (const campo of ['measurement', 'settings', 'revision', 'jobs', 'facts', 'activeVersion']) {
    assert.equal(corpo[campo], undefined, `un corpo d'errore non porta mai ${campo}: sarebbe una misura inventata`);
    assert.equal(corpo.data?.[campo], undefined, `nemmeno dentro data: ${campo}`);
  }
  assert.notEqual(corpo.schema, 'talos.context.snapshot.v1', 'non deve spacciarsi per uno snapshot del contesto');
  assert.equal(corpo.error.riprovabile, false, 'non è attivo su questa installazione: riprovare non cambia niente');
});

test('BC-07/2 — due 503 diversi non sono la stessa cosa: «non attivo qui» contro «guasto adesso»', async (t) => {
  /*
   * ⛔ La conflazione che questa riga chiude: `CTX_NOT_ENABLED` e `CTX_SERVICE_CLOSED` finivano
   *   sullo stesso 503 con un corpo nudo, e da fuori erano indistinguibili. Uno è permanente su
   *   questa installazione, l'altro passa: sono due azioni diverse per chi legge.
   */
  const spento = await conServer(t, {});
  const inChiusura = await conServer(t, { contextService: servizioCheLancia('CTX_SERVICE_CLOSED', 'Il servizio del contesto è chiuso.') });

  const a = await fetch(`${spento}${RADICE}`);
  const b = await fetch(`${inChiusura}${RADICE}`);
  const corpoA = await a.json(); const corpoB = await b.json();

  assert.equal(a.status, 503); assert.equal(b.status, 503);
  assert.equal(corpoA.error.riprovabile, false);
  assert.equal(corpoB.error.riprovabile, true);
  assert.notEqual(corpoA.error.explanation, corpoB.error.explanation, 'due stati diversi non possono avere la stessa spiegazione');
});

/*
 * ⛔⛔⛔ LE USCITE NON SI CONTANO A MANO: SI CHIEDONO AL PRODOTTO.
 *
 * Ogni codice con una copia in `COPIA_CONTESTO` deve avere qui una richiesta VERA che lo produce.
 * L'elenco dei casi non è una lista scritta da me: è `Object.keys(COPIA_CONTESTO)`, e il confronto
 * è fra INSIEMI di nomi, non fra numeri — un numero uguale con nomi diversi passerebbe.
 * ⛔ Fino al 16/09 c'era UN'esclusione, motivata da una misura: `PAYLOAD_LIMIT` non era raggiungibile
 *   perché `leggiCorpoJson` faceva `req.destroy()` oltre i 4096 byte e con un socket grezzo tornavano
 *   ZERO byte. ✅ Dal 16/09 quel ramo risponde (413, drenando) e il tetto è iniettabile
 *   (`createHttpApp({ limiteCorpoByte })`): la copia si prova con una richiesta VERA come tutte le
 *   altre, e la mappa delle esclusioni resta vuota — se un giorno torna a riempirsi, deve dire perché.
 */
const NON_RAGGIUNGIBILI_DALL_ESTERNO = new Map([]);

/** Per ogni codice dichiarato dal prodotto, la richiesta vera che lo fa uscire. */
async function casiMisurati(t) {
  const sano = await conServer(t, { contextService: servizioSano() });
  const spento = await conServer(t, {});
  const rotto = await conServer(t, { contextService: servizioCheSiRompe() });
  const stretto = await conServer(t, { contextService: servizioSano(), limiteCorpoByte: 256 });
  const vietato = rottaConMetodoVietato();

  const misure = [
    ['CTX_ROUTE_NOT_FOUND', 404, () => fetch(`${spento}${rottaSconosciuta()}`)],
    ['METHOD_NOT_ALLOWED', 405, () => fetch(`${spento}${vietato.percorso}`, { method: vietato.metodo })],
    ['CTX_NOT_ENABLED', 503, () => fetch(`${spento}${RADICE}`)],
    /* ⛔ Le due uscite che nascono DENTRO il try, col motore ACCESO: erano la metà scoperta. */
    ['QUERY_INVALID', 400, () => fetch(`${sano}${RADICE}?x=1`)],
    ['INTERNAL_ERROR', 500, () => fetch(`${rotto}${RADICE}`)],
    /* ⛔ 16/09 — la terza, che prima era «non provabile»: un corpo oltre il tetto (qui iniettato a 256 byte). */
    ['PAYLOAD_LIMIT', 413, () => fetch(`${stretto}${RADICE}/facts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testo: 'y'.repeat(600) }),
    })],
  ];
  const daServizio = [
    ['CTX_INVALID_INPUT', 400], ['CTX_STALE_REVISION', 409], ['CTX_SERVICE_CLOSED', 503],
    ['CTX_SESSION_NOT_FOUND', 404], ['CTX_JOB_NOT_FOUND', 404], ['CTX_FACT_CONFLICT_NOT_FOUND', 404],
    ['CTX_HISTORY_DIVERGED', 409], ['CTX_NOTHING_TO_COMPACT', 409],
  ];
  for (const [code, atteso] of daServizio) {
    const base = await conServer(t, { contextService: servizioCheLancia(code, `Messaggio vero di ${code}.`) });
    misure.push([code, atteso, () => fetch(`${base}${RADICE}`)]);
  }

  const casi = [];
  for (const [code, atteso, chiama] of misure) {
    const risposta = await chiama();
    casi.push({ code, atteso, stato: risposta.status, corpo: await risposta.json() });
  }
  return casi;
}

test('BC-07/3 — OGNI copia del prodotto ha una richiesta vera che la produce, e nessuna è la copia rassicurante', async (t) => {
  const casi = await casiMisurati(t);
  const provati = new Set(casi.map((caso) => caso.code));
  const dichiarati = new Set(Object.keys(COPIA_CONTESTO));

  const senzaProva = [...dichiarati].filter((code) => !provati.has(code) && !NON_RAGGIUNGIBILI_DALL_ESTERNO.has(code));
  assert.deepEqual(senzaProva, [], `copie dichiarate dal prodotto e mai provate da una richiesta vera: ${senzaProva.join(', ')}`);
  const proveSenzaCopia = [...provati].filter((code) => !dichiarati.has(code));
  assert.deepEqual(proveSenzaCopia, [], `provo codici che il prodotto non dichiara: ${proveSenzaCopia.join(', ')}`);
  for (const [code, perche] of NON_RAGGIUNGIBILI_DALL_ESTERNO) {
    assert.ok(dichiarati.has(code), `${code} è escluso dalle prove ma non è più nella tabella: l'esclusione va tolta (${perche})`);
  }

  for (const caso of casi) {
    assert.equal(caso.stato, caso.atteso, `${caso.code}: lo status resta quello di prima`);
    asserisciBustaLeggibile(caso.corpo, { code: caso.code, stato: caso.stato });
  }
});

test('BC-07/4 — il messaggio vero del servizio arriva a chi legge, non viene sostituito', async (t) => {
  /* ⛔ Il verso contrario di O-49: la frase scritta dal servizio è quella utile, e non deve essere
     buttata via dalla copia generica. Qui si controlla che sopravviva al passaggio. */
  const base = await conServer(t, { contextService: servizioCheLancia('CTX_NOTHING_TO_COMPACT', 'Non ci sono scambi precedenti da compattare.') });
  const risposta = await fetch(`${base}${RADICE}`);
  const corpo = await risposta.json();
  assert.equal(corpo.error.message, 'Non ci sono scambi precedenti da compattare.');
  asserisciBustaLeggibile(corpo, { code: 'CTX_NOTHING_TO_COMPACT', stato: risposta.status });
});

test('BC-07/5 — un codice VERO senza copia sua cade sul ripiego, che parla comunque del contesto', async (t) => {
  /* ⛔ `CTX_NO_REDUCTION` esiste davvero (`context-engine/src/engine.mjs`) e NON ha una riga nella
     tabella: è il caso che prova il ripiego senza inventare un codice finto. */
  assert.equal(COPIA_CONTESTO.CTX_NO_REDUCTION, undefined, 'se un giorno avrà una copia sua, questa prova va spostata su un altro codice senza copia');
  const base = await conServer(t, { contextService: servizioCheLancia('CTX_NO_REDUCTION', 'La sintesi non libera spazio sufficiente.') });
  const risposta = await fetch(`${base}${RADICE}`);
  const corpo = await risposta.json();
  assert.equal(corpo.error.explanation, COPIA_CONTESTO_PREDEFINITA.explanation, 'un codice senza copia deve prendere il ripiego del contesto');
  asserisciBustaLeggibile(corpo, { code: 'CTX_NO_REDUCTION', stato: risposta.status });
  assert.equal(typeof corpo.error.doctorReference, 'string', 'un codice che non sappiamo spiegare lascia comunque una traccia nel registro');
});

test('BC-07/6 — il divieto vale su TUTTE le copie del prodotto, non su quella che ho guardato', () => {
  /*
   * ⛔ È il difetto che il revisore ha trovato, verificato da me: mettendo «problema imprevisto ·
   *   Apri Doctor» dentro `CTX_STALE_REVISION` le prove restavano VERDI, perché il divieto era
   *   scritto su una copia sola. Qui gira su tutte, ripiego compreso, agganciato all'oggetto del
   *   PRODOTTO e non a una lista mia.
   */
  const tutte = [...Object.entries(COPIA_CONTESTO), ['(ripiego)', COPIA_CONTESTO_PREDEFINITA]];
  assert.ok(tutte.length >= 7, `la tabella del prodotto ha ${tutte.length} copie: è la SONDA a non leggere il prodotto`);
  for (const [code, copia] of tutte) {
    asserisciNienteCopiaRassicurante(copia, code);
    for (const campo of ['title', 'explanation', 'action']) {
      assert.equal(typeof copia[campo], 'string', `${code}: ${campo} deve essere testo`);
      assert.ok(copia[campo].trim().length > 0, `${code}: ${campo} vuoto lascia il pannello muto`);
    }
    assert.equal(typeof copia.riprovabile, 'boolean', `${code}: manca la distinzione fra permanente e transitorio`);
  }
});

/*
 * ⛔⛔ L'INVENTARIO VERO, letto dal prodotto e NON dal file che dichiara la tabella.
 * Il revisore accusava tre codici di non esistere: verificati uno per uno, esistono tutti. Ma la
 * domanda dietro l'accusa è giusta e non aveva una risposta automatica: una copia può essere
 * scritta per un codice che nessuno lancia, e nessuno se ne accorge. Qui i codici si contano nei
 * sorgenti del server e del motore — ESCLUSO `http-app.mjs`, che è dove la tabella vive: leggerlo
 * renderebbe la prova una conferma di se stessa.
 */
function codiciDelProdotto() {
  const radice = dirname(fileURLToPath(new URL('../src/http-app.mjs', import.meta.url)));
  const cartelle = [radice, join(radice, '..', '..', 'context-engine', 'src')];
  const trovati = new Set();
  const visita = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isDirectory()) { if (voce.name !== 'node_modules') visita(percorso); continue; }
      if (!voce.name.endsWith('.mjs') || voce.name === 'http-app.mjs') continue;
      for (const trovato of readFileSync(percorso, 'utf8').matchAll(/CTX_[A-Z_]+/gu)) trovati.add(trovato[0]);
    }
  };
  for (const cartella of cartelle) visita(cartella);
  return trovati;
}

test('BC-07/7 — ogni copia CTX_ della tabella è scritta per un codice che il prodotto nomina davvero', () => {
  const esistenti = codiciDelProdotto();
  assert.ok(esistenti.size > 50, `l'inventario ha trovato solo ${esistenti.size} codici: è la SONDA a essere rotta, non il prodotto`);
  const inventati = Object.keys(COPIA_CONTESTO).filter((code) => code.startsWith('CTX_') && !esistenti.has(code));
  assert.deepEqual(inventati, [], `copie scritte per codici che nessun file del prodotto nomina: ${inventati.join(', ')}`);
});
