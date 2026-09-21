import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaRegistroAttese } from '../src/openrouter-oauth.mjs';

/*
 * PO-01 (10/9) — le tre porte dell'accesso a OpenRouter, provate dal fuori.
 *
 * ⛔ LA CHIAVE FINTA HA UN NOME RICONOSCIBILE APPOSTA. In ogni prova, prima di guardare lo
 * stato o il corpo, si controlla che il TESTO INTERO della risposta non la contenga: è l'unico
 * modo per accorgersi che un giorno qualcuno l'ha rimessa dentro un errore «per aiutare a
 * capire». Stessa disciplina delle prove del portachiavi provider e della fonte di ricerca.
 *
 * ⛔ Le prove al VERSO CONTRARIO sono la metà che conta: stato mancante, ignoto, riusato,
 * scaduto, codice mancante, OpenRouter che risponde 4xx, un corpo senza chiave, la rete che cade
 * a metà scambio, la custodia che fallisce, la query in coda, i metodi sbagliati.
 */

const CHIAVE_FINTA = 'sk-or-v1-QUESTA-NON-DEVE-USCIRE-MAI';

function custodiaFinta({ fallisce = false } = {}) {
  const raccolte = [];
  const fn = async (chiave) => {
    if (fallisce) throw new Error(`il portachiavi ha rifiutato ${chiave}`); // ⛔ apposta: il messaggio CONTIENE la chiave
    raccolte.push(chiave);
  };
  fn.raccolte = raccolte;
  return fn;
}

function openRouterFinto({ ok = true, status = 200, corpo = { key: CHIAVE_FINTA }, cade = false } = {}) {
  const chiamate = [];
  const fn = async (indirizzo, opzioni) => {
    chiamate.push({ indirizzo, corpo: JSON.parse(opzioni.body) });
    if (cade) throw new Error('rete caduta a metà scambio');
    return { ok, status, json: async () => corpo, text: async () => JSON.stringify(corpo) };
  };
  fn.chiamate = chiamate;
  return fn;
}

async function listen(t, deps = {}) {
  const app = createHttpApp({ staticHandler: async () => null, ...deps });
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

/** Ogni risposta si legge come TESTO prima che come JSON: la chiave si cerca lì dentro. */
async function leggi(risposta) {
  const testo = await risposta.text();
  assert.doesNotMatch(testo, /QUESTA-NON-DEVE-USCIRE-MAI/u, 'la chiave è finita in una risposta HTTP');
  let json = null;
  try { json = JSON.parse(testo); } catch { /* la pagina del rientro è HTML, non JSON */ }
  return { testo, json, stato: risposta.status };
}

function posta(base, percorso, corpo) {
  return fetch(`${base}${percorso}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo ?? {}),
  });
}

test('OR-HTTP-01 — POST /inizia: l’indirizzo è quello di OpenRouter, col rientro su questo server e S256', async (t) => {
  const base = await listen(t, { custodisciChiaveOpenRouter: custodiaFinta() });
  const { stato, json } = await leggi(await posta(base, '/api/v1/auth/openrouter/inizia'));
  assert.equal(stato, 200);
  assert.equal(json.data.modo, 'browser');
  assert.equal(json.data.scadeTraMs, 600_000, 'dieci minuti: la vita del codice dichiarata da OpenRouter');
  assert.match(json.data.stato, /^[A-Za-z0-9_-]{43}$/u);
  const indirizzo = new URL(json.data.indirizzo);
  assert.equal(indirizzo.origin + indirizzo.pathname, 'https://openrouter.ai/auth');
  assert.equal(indirizzo.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(indirizzo.searchParams.get('code_challenge').length, 43);
  const ritorno = new URL(indirizzo.searchParams.get('callback_url'));
  assert.equal(ritorno.pathname, `/api/v1/auth/openrouter/ritorno/${json.data.stato}`);
  assert.equal(ritorno.origin, base, 'il rientro deve tornare su QUESTO server, non su un altro');
  // ⛔ Il verificatore non è dedotto: la sfida è il suo SHA-256, e nella risposta non c'è altro.
  assert.deepEqual(Object.keys(json.data).sort(), ['indirizzo', 'modo', 'scadeTraMs', 'stato']);
});

test('OR-HTTP-02 — il giro intero: rientro dal browser, chiave alla custodia, PAGINA a chi guarda', async (t) => {
  const custodia = custodiaFinta();
  const rete = openRouterFinto();
  const base = await listen(t, { custodisciChiaveOpenRouter: custodia, fetchOpenRouterFn: rete });
  const inizio = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;

  const rientro = await fetch(`${base}/api/v1/auth/openrouter/ritorno/${inizio.stato}?code=CODICE-DI-RITORNO`);
  const { stato, testo } = await leggi(rientro);
  assert.equal(stato, 200);
  assert.match(rientro.headers.get('content-type'), /text\/html/u, 'chi rientra è una PERSONA, non del codice');
  assert.match(testo, /Account collegato/u);
  assert.match(rientro.headers.get('content-security-policy'), /default-src 'none'/u);
  assert.equal(rientro.headers.get('referrer-policy'), 'no-referrer', 'l’indirizzo di questa pagina contiene il codice');

  assert.deepEqual(custodia.raccolte, [CHIAVE_FINTA], 'la chiave va ALLA CUSTODIA, e solo lì');
  assert.equal(rete.chiamate.length, 1);
  assert.equal(rete.chiamate[0].indirizzo, 'https://openrouter.ai/api/v1/auth/keys');
  assert.equal(rete.chiamate[0].corpo.code, 'CODICE-DI-RITORNO');
  assert.equal(rete.chiamate[0].corpo.code_challenge_method, 'S256');
  assert.equal(rete.chiamate[0].corpo.code_verifier.length, 43);
});

test('OR-HTTP-03 — la modalità «codice a schermo»: senza rientro, e il codice si incolla da POST /codice', async (t) => {
  const custodia = custodiaFinta();
  const base = await listen(t, { custodisciChiaveOpenRouter: custodia, fetchOpenRouterFn: openRouterFinto() });
  const { json } = await leggi(await posta(base, '/api/v1/auth/openrouter/inizia', { senzaRitorno: true }));
  assert.equal(json.data.modo, 'schermo');
  const indirizzo = new URL(json.data.indirizzo);
  assert.equal(indirizzo.searchParams.get('callback_url'), null, 'omettere callback_url È la modalità senza rientro');
  assert.equal(indirizzo.searchParams.get('key_label'), 'TALOS Harness Desktop');
  assert.equal(indirizzo.searchParams.get('code_challenge').length, 43, 'qui la sfida è OBBLIGATORIA: il codice è visibile a chi guarda lo schermo');

  const esito = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: json.data.stato, codice: 'INCOLLATO-A-MANO' }));
  assert.equal(esito.stato, 200);
  assert.deepEqual(esito.json.data, { custodita: true });
  assert.deepEqual(custodia.raccolte, [CHIAVE_FINTA]);
});

test('OR-HTTP-04 — AL CONTRARIO: uno stato riusato e uno mai esistito sono INDISTINGUIBILI da fuori', async (t) => {
  const base = await listen(t, { custodisciChiaveOpenRouter: custodiaFinta(), fetchOpenRouterFn: openRouterFinto() });
  const inizio = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/ritorno/${inizio.stato}?code=C`)).status, 200);

  const riusato = await leggi(await fetch(`${base}/api/v1/auth/openrouter/ritorno/${inizio.stato}?code=C`));
  const inventato = await leggi(await fetch(`${base}/api/v1/auth/openrouter/ritorno/mai-esistito-questo?code=C`));
  assert.equal(riusato.stato, 400);
  assert.equal(inventato.stato, 400);
  /* ⛔ Il nonce della CSP è nuovo a ogni risposta, ed è l'UNICA cosa che può differire:
     si toglie prima di confrontare, altrimenti la prova sarebbe rossa per un motivo sano. */
  const senzaNonce = (html) => html.replace(/nonce="[^"]+"/gu, 'nonce=""');
  assert.equal(senzaNonce(riusato.testo), senzaNonce(inventato.testo), 'il rifiuto non deve dire QUALE dei tre casi è');

  // La stessa domanda dalla porta di chi incolla il codice: stesso codice, stesso messaggio.
  const daPost = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: inizio.stato, codice: 'C' }));
  const daPostIgnoto = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: 'altro-mai-visto', codice: 'C' }));
  assert.equal(daPost.stato, 400);
  assert.equal(daPost.json.error.code, 'OAUTH_ATTESA_IGNOTA');
  assert.equal(daPost.json.error.message, daPostIgnoto.json.error.message);
  assert.doesNotMatch(daPost.json.error.message, /stato|state|verifier|token/iu, 'niente nomi tecnici a chi legge');
});

test('OR-HTTP-05 — AL CONTRARIO: senza codice lo stato NON si brucia, e il giro si può ancora chiudere', async (t) => {
  const custodia = custodiaFinta();
  const rete = openRouterFinto();
  const base = await listen(t, { custodisciChiaveOpenRouter: custodia, fetchOpenRouterFn: rete });
  const inizio = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;

  const senzaCodice = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: inizio.stato }));
  assert.equal(senzaCodice.stato, 400);
  assert.equal(senzaCodice.json.error.code, 'OAUTH_CODICE_MANCANTE');
  assert.equal(rete.chiamate.length, 0, 'una richiesta incompleta non deve costare un giro di rete');

  const dopo = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: inizio.stato, codice: 'ADESSO-SI' }));
  assert.equal(dopo.stato, 200, 'il primo tentativo a metà non doveva consumare l’accesso');
  assert.deepEqual(custodia.raccolte, [CHIAVE_FINTA]);
});

test('OR-HTTP-06 — AL CONTRARIO: OpenRouter che rifiuta, che risponde senza chiave, o la rete che cade', async (t) => {
  const casi = [
    { deps: { fetchOpenRouterFn: openRouterFinto({ ok: false, status: 403 }) }, code: 'OAUTH_SCAMBIO_RIFIUTATO', stato: 502 },
    { deps: { fetchOpenRouterFn: openRouterFinto({ corpo: { api_key: CHIAVE_FINTA } }) }, code: 'OAUTH_RISPOSTA_INATTESA', stato: 502 },
    { deps: { fetchOpenRouterFn: openRouterFinto({ cade: true }) }, code: 'OAUTH_RETE', stato: 502 },
    { deps: { custodisciChiaveOpenRouter: custodiaFinta({ fallisce: true }), fetchOpenRouterFn: openRouterFinto() }, code: 'OAUTH_CUSTODIA_FALLITA', stato: 500 },
  ];
  for (const caso of casi) {
    const base = await listen(t, { custodisciChiaveOpenRouter: custodiaFinta(), ...caso.deps });
    const inizio = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;
    // ⛔ `leggi` fallisce da sola se la chiave finta compare: è il caso `api_key`, dove il corpo
    //   di OpenRouter la CONTENEVA, e quello della custodia, il cui errore la nomina apposta.
    const esito = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: inizio.stato, codice: 'C' }));
    assert.equal(esito.json.error.code, caso.code);
    assert.equal(esito.stato, caso.stato);
  }
});

test('OR-HTTP-07 — AL CONTRARIO: senza custodia collegata non comincia nemmeno, e non esce in rete', async (t) => {
  const rete = openRouterFinto();
  const base = await listen(t, { custodisciChiaveOpenRouter: null, fetchOpenRouterFn: rete });
  const inizio = await leggi(await posta(base, '/api/v1/auth/openrouter/inizia'));
  assert.equal(inizio.stato, 503);
  assert.equal(inizio.json.error.code, 'OAUTH_NON_CONFIGURATO');
  const rientro = await leggi(await fetch(`${base}/api/v1/auth/openrouter/ritorno/qualunque?code=C`));
  assert.equal(rientro.stato, 400);
  assert.match(rientro.testo, /Non sono riuscito a collegare/u, 'anche qui risponde una pagina, non un JSON');
  assert.equal(rete.chiamate.length, 0);
});

test('OR-HTTP-08 — AL CONTRARIO: query in coda, metodi sbagliati, corpo che non è JSON', async (t) => {
  const base = await listen(t, { custodisciChiaveOpenRouter: custodiaFinta(), fetchOpenRouterFn: openRouterFinto() });

  const conQuery = await leggi(await posta(base, '/api/v1/auth/openrouter/inizia?x=1'));
  assert.equal(conQuery.json.error.code, 'QUERY_INVALID');

  const metodi = [
    { percorso: '/api/v1/auth/openrouter/inizia', metodo: 'GET', allow: 'POST' },
    { percorso: '/api/v1/auth/openrouter/codice', metodo: 'DELETE', allow: 'POST' },
    { percorso: '/api/v1/auth/openrouter/ritorno', metodo: 'POST', allow: 'GET, HEAD' },
    { percorso: '/api/v1/auth/openrouter/ritorno/abc', metodo: 'PUT', allow: 'GET, HEAD' },
  ];
  for (const caso of metodi) {
    const risposta = await fetch(`${base}${caso.percorso}`, { method: caso.metodo });
    assert.equal(risposta.status, 405, `${caso.metodo} ${caso.percorso}`);
    assert.equal(risposta.headers.get('allow'), caso.allow, `Allow di ${caso.percorso}`);
  }
  // ⛔ E ciò che NON esiste sotto lo stesso prefisso resta 404, non 405: il difetto del 07/9 non torna.
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/inventata`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/ritorno/a/b`)).status, 404);

  const corpoRotto = await fetch(`${base}/api/v1/auth/openrouter/codice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{non-json',
  });
  assert.equal((await corpoRotto.json()).error.code, 'QUERY_INVALID');
});

test('OR-HTTP-09 — la forma di ripiego `?state=` funziona quanto quella nel percorso', async (t) => {
  const custodia = custodiaFinta();
  const base = await listen(t, { custodisciChiaveOpenRouter: custodia, fetchOpenRouterFn: openRouterFinto() });
  const inizio = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;
  const risposta = await fetch(`${base}/api/v1/auth/openrouter/ritorno?code=C&state=${encodeURIComponent(inizio.stato)}`);
  assert.equal((await leggi(risposta)).stato, 200);
  assert.deepEqual(custodia.raccolte, [CHIAVE_FINTA]);
});

test('OR-HTTP-10 — due «inizia» di fila: il PRIMO stato resta valido (chi preme due volte non resta fuori)', async (t) => {
  const custodia = custodiaFinta();
  const base = await listen(t, { custodisciChiaveOpenRouter: custodia, fetchOpenRouterFn: openRouterFinto() });
  const primo = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;
  const secondo = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;
  assert.notEqual(primo.stato, secondo.stato);
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/ritorno/${primo.stato}?code=C`)).status, 200);
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/ritorno/${secondo.stato}?code=C`)).status, 200);
  assert.equal(custodia.raccolte.length, 2);
});

test('OR-HTTP-11 — lo stato scaduto è rifiutato come uno ignoto (orologio iniettato, nessuna attesa vera)', async (t) => {
  let adesso = 1_000_000;
  const base = await listen(t, {
    custodisciChiaveOpenRouter: custodiaFinta(),
    fetchOpenRouterFn: openRouterFinto(),
    registroOAuthOpenRouter: creaRegistroAttese({ clock: () => adesso }),
  });
  const inizio = (await (await posta(base, '/api/v1/auth/openrouter/inizia')).json()).data;
  adesso += inizio.scadeTraMs + 1;
  const esito = await leggi(await posta(base, '/api/v1/auth/openrouter/codice', { stato: inizio.stato, codice: 'C' }));
  assert.equal(esito.json.error.code, 'OAUTH_ATTESA_IGNOTA');
});

test('OR-HTTP-12 — ⛔⛔⛔ il cancello a token: /inizia lo pretende, il RIENTRO no (SameSite=Strict)', async (t) => {
  const custodia = custodiaFinta();
  const base = await listen(t, {
    token: 'segreto-di-casa', custodisciChiaveOpenRouter: custodia, fetchOpenRouterFn: openRouterFinto(),
  });
  // Senza cookie l'API resta chiusa, esattamente come prima di questa funzione.
  assert.equal((await posta(base, '/api/v1/auth/openrouter/inizia')).status, 401);
  assert.equal((await posta(base, '/api/v1/auth/openrouter/codice', { stato: 'x', codice: 'y' })).status, 401);
  assert.equal((await fetch(`${base}/api/v1/sessions`)).status, 401, 'il resto dell’API non si è allentato');

  const conCookie = { headers: { 'Content-Type': 'application/json', Cookie: 'talos_token=segreto-di-casa' } };
  const inizio = (await (await fetch(`${base}/api/v1/auth/openrouter/inizia`, { method: 'POST', ...conCookie, body: '{}' })).json()).data;

  /*
   * ⛔ Il rientro arriva SENZA cookie perché il browser non lo manda: MDN «Set-Cookie», letta il
   *   10/09/2026 — «Strict: send the cookie only for requests originating from the same site»,
   *   nessuna eccezione per le navigazioni di primo livello, e il rientro da openrouter.ai è
   *   esattamente una di quelle. Senza l'esenzione questa riga sarebbe 401 e l'accesso non
   *   potrebbe funzionare MAI sulla macchina dell'owner, che il token ce l'ha sempre.
   */
  const rientro = await fetch(`${base}/api/v1/auth/openrouter/ritorno/${inizio.stato}?code=C`);
  assert.equal(rientro.status, 200);
  assert.deepEqual(custodia.raccolte, [CHIAVE_FINTA]);
});

test('OR-HTTP-13 — AL CONTRARIO: l’esenzione dal token è STRETTA, non copre le altre due porte', async (t) => {
  const base = await listen(t, { token: 't', custodisciChiaveOpenRouter: custodiaFinta(), fetchOpenRouterFn: openRouterFinto() });
  // Se l'esenzione fosse scritta su tutto il prefisso /auth/openrouter/, queste tre passerebbero.
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/inizia`)).status, 401);
  assert.equal((await posta(base, '/api/v1/auth/openrouter/codice', { stato: 'x', codice: 'y' })).status, 401);
  assert.equal((await fetch(`${base}/api/v1/auth/openrouter/ritorno/x?code=C`, { method: 'POST' })).status, 401,
    'l’esenzione vale solo per la GET: una POST sullo stesso indirizzo resta dietro il cancello');
});

test('OR-HTTP-14 — un Host che non è di loopback ricade sulla modalità a schermo, non promette un rientro falso', async (t) => {
  const base = await listen(t, { custodisciChiaveOpenRouter: custodiaFinta() });
  /*
   * ⛔ Qui NON si può usare `fetch`: `Host` è un'intestazione proibita per il client fetch
   *   (WHATWG Fetch, «forbidden header name») e viene scartata in silenzio — la prova sarebbe
   *   passata misurando il contrario di quello che dice. Si scende a `node:http`, che il valore
   *   lo manda per davvero.
   */
  const porta = Number(new URL(base).port);
  const risposta = await new Promise((resolve, reject) => {
    const richiesta = request({
      host: '127.0.0.1', port: porta, method: 'POST', path: '/api/v1/auth/openrouter/inizia',
      headers: { Host: 'esempio.com', 'Content-Type': 'application/json', 'Content-Length': 2 },
    }, (res) => {
      let testo = '';
      res.on('data', (pezzo) => { testo += pezzo; });
      res.on('end', () => resolve({ status: res.statusCode, testo }));
    });
    richiesta.on('error', reject);
    richiesta.end('{}');
  });
  assert.equal(risposta.status, 200);
  assert.doesNotMatch(risposta.testo, /QUESTA-NON-DEVE-USCIRE-MAI/u);
  const dati = JSON.parse(risposta.testo).data;
  assert.equal(dati.modo, 'schermo', 'un Host che non è di loopback non può produrre un rientro raggiungibile');
  assert.equal(new URL(dati.indirizzo).searchParams.get('callback_url'), null);
  assert.equal(new URL(dati.indirizzo).searchParams.get('key_label'), 'TALOS Harness Desktop');
});
