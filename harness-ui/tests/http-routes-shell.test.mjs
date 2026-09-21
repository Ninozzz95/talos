import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';

/*
 * ⛔⛔⛔ PO-06 — IL COMANDO DIRETTO (`!comando` nel composer), META' SERVER.
 *
 * La rotta `POST /api/v1/sessions/:id/shell` (src/http-app.mjs:2776-2803) esiste dal 27/8 e
 * non aveva NESSUNA prova al livello HTTP: i test del comando diretto stanno tutti un piano
 * sotto — `tests/session-registry.test.mjs` (shell(): NOT_FOUND, SESSION_NOT_READY, cartella,
 * mobile) e `tests/agent-service.test.mjs` (l'ordine dei cinque eventi AG-UI). Cioe' nessuno
 * provava la traduzione fra i due: quale STATO esce da un codice, quale corpo viene rifiutato,
 * e che un'uscita diversa da zero NON e' un errore della rotta.
 *
 * ⛔ Qui si prova SOLO quel livello — status, buste, validazione del corpo — con un registro
 * finto che il test stesso controlla riga per riga. E' la stessa disciplina dichiarata in
 * `tests/http-routes-sessions.test.mjs` («session-registry.mjs ha gia' i suoi test; questo
 * file prova SOLO il livello HTTP»), non una scorciatoia presa qui.
 *
 * ## Ricerca fatta PRIMA di scrivere (fonte + data, come vuole la regola)
 *
 * - OWASP, «OS Command Injection Defense Cheat Sheet»
 *   (cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html,
 *   letto il 10/09/2026): la difesa e' passare gli argomenti come elementi DISTINTI di un
 *   array, mai concatenati in una stringa data a una shell; e la validazione dell'ingresso e'
 *   il SECONDO strato, mai il primo.
 * - Node.js, `child_process` (nodejs.org/api/child_process.html, letto il 10/09/2026):
 *   «If the shell option is enabled, do not pass unsanitized user input to this function» —
 *   `shell: true` rimette esattamente la vulnerabilita' che `spawn` esiste per evitare.
 * - Anthropic, «Interactive mode», sezione «Shell mode with `!` prefix» (letto il 10/09/2026):
 *   il prefisso «adds the command and its output to the conversation context» e «doesn't
 *   require Claude to interpret or approve the command». ⛔ E' il MODELLO a non dover
 *   approvare — non la politica di processo del progetto, che e' un'altra cosa.
 * - Cloud Security Alliance, «The Agentic AI Trust-Boundary Crisis» e il materiale 2026 sul
 *   confused deputy nei control-plane locali (letti il 10/09/2026): su un server locale la
 *   minaccia non e' il proprietario che digita, e' chi raggiunge la porta al posto suo. Qui
 *   quel confine e' gia' presidiato dal cancello del token (`AUTH_REQUIRED`, http-app.mjs:1449),
 *   e questo file lo prova al contrario nell'ultimo test.
 */

/**
 * Registro finto: registra ogni chiamata a `shell()` e risponde come il registro VERO
 * (src/session-registry.mjs:3913-3932) — stesse tre uscite possibili, niente di piu'.
 * ⛔ Nessun processo parte mai da qui: le prove sull'esecuzione vera stanno in
 * `tests/agent-service.test.mjs`, questo file non deve toccare la macchina.
 */
function registroFinto() {
  const chiamate = [];
  return {
    chiamate,
    cartellaDi: (id) => (id === 'sess-conclusa' || id === 'sess-viva' ? 'C:/lavoro/uno' : null),
    shell(sessionId, comando) {
      chiamate.push({ sessionId, comando });
      if (sessionId === 'sess-viva') {
        return { erroreAvvio: 'La sessione è ancora in corso: aspetta che concluda prima di un comando diretto', code: 'SESSION_NOT_READY' };
      }
      if (sessionId !== 'sess-conclusa') return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return { ok: true };
    },
  };
}

async function listen(t, { senzaRegistro = false, token = null } = {}) {
  const sessionRegistry = senzaRegistro ? null : registroFinto();
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry,
    token,
  });
  const server = createServer(app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, sessionRegistry };
}

function postComando(base, sessionId, corpo, opzioni = {}) {
  return fetch(`${base}/api/v1/sessions/${sessionId}/shell`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opzioni.headers ?? {}) },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
}

test('⭐⭐⭐ il caso dritto: `!comando` su una sessione conclusa risponde 200 e il comando arriva al registro INTATTO', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await postComando(base, 'sess-conclusa', { comando: 'npm test -- --reporter=dot' });
  assert.equal(risposta.status, 200);
  const corpo = await risposta.json();
  assert.deepEqual(corpo.data, { ok: true });
  assert.deepEqual(sessionRegistry.chiamate, [{ sessionId: 'sess-conclusa', comando: 'npm test -- --reporter=dot' }]);
});

/*
 * ⛔⛔ La risposta NON contiene l'output: la rotta e' «fire and forget» per costruzione
 * (session-registry.mjs:3924, nessun await sull'esecuzione), e l'uscita del comando viaggia
 * sulla SSE della sessione come ToolCallResult. Provato qui perche' e' la cosa che un
 * chiamante nuovo sbaglia per prima — e perche' e' il motivo per cui una rotta
 * `shell-utente` che RESTITUISCE l'output sarebbe un secondo vocabolario, non un'aggiunta.
 */
test('⛔ la busta di successo dice solo {ok:true}: uscita, stdout e codice NON sono nella risposta HTTP — viaggiano sulla SSE', async (t) => {
  const { base } = await listen(t);
  const corpo = await (await postComando(base, 'sess-conclusa', { comando: 'echo ciao' })).json();
  assert.deepEqual(Object.keys(corpo.data), ['ok']);
  for (const chiave of ['uscita', 'stdout', 'stderr', 'troncato', 'millisecondi', 'codice']) {
    assert.equal(Object.hasOwn(corpo.data, chiave), false, `«${chiave}» non e' nel contratto di questa rotta`);
  }
});

test('⛔⛔ AL CONTRARIO — comando VUOTO (e solo spazi): 400, e il registro non viene mai chiamato', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  for (const comando of ['', '   ', '\n\t ']) {
    const risposta = await postComando(base, 'sess-conclusa', { comando });
    assert.equal(risposta.status, 400, `comando ${JSON.stringify(comando)}`);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  }
  assert.deepEqual(sessionRegistry.chiamate, [], 'un corpo malformato non deve MAI arrivare al registro');
});

test('⛔⛔ AL CONTRARIO — corpo assente, chiave sbagliata, tipo sbagliato, chiave in piu\': tutti 400', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const casi = [
    ['corpo vuoto', '{}'],
    ['nessun corpo', ''],
    ['chiave sbagliata', { cmd: 'echo x' }],
    ['numero invece di stringa', { comando: 42 }],
    ['array invece di stringa', { comando: ['echo', 'x'] }],
    ['null', { comando: null }],
    ['una chiave in piu\'', { comando: 'echo x', cartella: 'C:/altrove' }],
    ['JSON rotto', '{comando:'],
  ];
  for (const [nome, corpo] of casi) {
    const risposta = await postComando(base, 'sess-conclusa', corpo);
    assert.equal(risposta.status, 400, nome);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', nome);
  }
  assert.deepEqual(sessionRegistry.chiamate, [], 'nessuno di questi otto corpi deve raggiungere il registro');
});

/*
 * ⛔⛔⛔ La chiave in piu' non e' pedanteria: `requireComandoBody` (http-app.mjs:1161) e'
 * un'allowlist di UNA chiave, ed e' l'unica cosa che impedisce a un chiamante di provare a
 * passare una `cartella` propria. Se un giorno la rotta accettasse un campo in piu' senza
 * dichiararlo, la cartella smetterebbe di venire SOLO dalla voce della sessione — che e'
 * esattamente il difetto che `terminal-registry.mjs` documenta per le PTY (OWASP API1:2023,
 * un identificativo del client che decide un oggetto del server).
 */
test('⛔⛔⛔ la cartella NON e\' negoziabile dal chiamante: `{comando, cartella}` viene rifiutato, non ignorato in silenzio', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await postComando(base, 'sess-conclusa', { comando: 'echo x', cartella: 'C:/Windows/System32' });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.deepEqual(sessionRegistry.chiamate, []);
});

test('⛔⛔ AL CONTRARIO — sessione inesistente: 404 NOT_FOUND (non 400, non 500)', async (t) => {
  const { base } = await listen(t);
  const risposta = await postComando(base, 'sessione-mai-esistita', { comando: 'echo x' });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔ AL CONTRARIO — un id che non si decodifica (percent-encoding rotto): 404, mai un crash', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/%E0%A4%A/shell`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comando: 'echo x' }),
  });
  assert.equal(risposta.status, 404);
  assert.equal((await risposta.json()).error.code, 'NOT_FOUND');
  assert.deepEqual(sessionRegistry.chiamate, [], 'l\'id rotto viene fermato PRIMA di leggere il corpo');
});

/*
 * ⛔⛔⛔ IL DIFETTO PO-06, MESSO SOTTO PROVA COM'E' OGGI — non come dovrebbe essere.
 *
 * Una sessione ANCORA IN CORSO rifiuta il comando dell'utente con 409 SESSION_NOT_READY
 * (session-registry.mjs:3916-3922). Cioe': mentre il modello lavora, la persona non puo'
 * digitare `!npm test`. Il ticket PO-06 nomina esplicitamente la concorrenza col modello.
 *
 * ⛔ Questo test NON e' il guardiano di una cura: e' la misura dello stato attuale, scritta
 * perche' il giorno in cui la concorrenza viene aperta questo test diventa rosso NEL PUNTO
 * GIUSTO, con scritto qui accanto cosa si e' deciso e perche'. Un difetto senza una riga che
 * lo nomina e' un difetto che si riscopre da capo.
 */
test('⛔⛔⛔ MISURA DEL DIFETTO — sessione ancora in corso: 409 SESSION_NOT_READY, il comando della persona e\' impossibile mentre il modello lavora', async (t) => {
  const { base } = await listen(t);
  const risposta = await postComando(base, 'sess-viva', { comando: 'npm test' });
  assert.equal(risposta.status, 409);
  const corpo = await risposta.json();
  assert.equal(corpo.error.code, 'SESSION_NOT_READY');
  assert.match(corpo.error.message ?? corpo.error.messaggio ?? '', /./, 'il rifiuto porta comunque un messaggio leggibile da una persona');
});

test('⛔ AL CONTRARIO — una query in coda all\'indirizzo e\' rifiutata: 400, e il comando non parte', async (t) => {
  const { base, sessionRegistry } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/sessions/sess-conclusa/shell?forza=1`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comando: 'echo x' }),
  });
  assert.equal(risposta.status, 400);
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
  assert.deepEqual(sessionRegistry.chiamate, []);
});

test('⛔ AL CONTRARIO — GET/PUT/DELETE sulla stessa rotta: 405 con Allow: POST (esiste, ma non a quel colpo)', async (t) => {
  const { base } = await listen(t);
  for (const metodo of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const risposta = await fetch(`${base}/api/v1/sessions/sess-conclusa/shell`, { method: metodo });
    assert.equal(risposta.status, 405, metodo);
    assert.equal((await risposta.json()).error.code, 'METHOD_NOT_ALLOWED', metodo);
    assert.equal(risposta.headers.get('allow'), 'POST', `Allow per ${metodo}`);
  }
});

/*
 * ⛔ L'inventario `ROTTE_API` (http-app.mjs:638) e' la sola cosa che distingue «questo
 * indirizzo non esiste» da «esiste, ma non con questo metodo». La riga di /shell c'e' gia'
 * (riga 753): qui si prova che c'e' DAVVERO, cosi' una rimozione accidentale diventa rossa.
 */
test('⛔ /shell e\' dichiarata nell\'inventario delle rotte: POST e nient\'altro', async () => {
  assert.deepEqual(metodiAmmessiPerRotta('/api/v1/sessions/qualunque-id/shell'), ['POST']);
  assert.equal(metodiAmmessiPerRotta('/api/v1/sessions/qualunque-id/shell-utente'), null, 'non esiste una seconda rotta per lo stesso lavoro');
});

test('⛔ senza registro sessioni la rotta non finge: cade sul 405 come le altre, mai un 200 vuoto', async (t) => {
  const { base } = await listen(t, { senzaRegistro: true });
  const risposta = await postComando(base, 'sess-conclusa', { comando: 'echo x' });
  assert.equal(risposta.status, 405);
  assert.equal((await risposta.json()).error.code, 'METHOD_NOT_ALLOWED');
});

/*
 * ⛔⛔⛔ IL CONFINE VERO di questa rotta, provato al contrario.
 *
 * Su un server locale la minaccia non e' il proprietario che digita `!npm test` — e' chi
 * raggiunge la porta al posto suo (confused deputy / CSRF su localhost: ricerca del
 * 10/09/2026, vedi l'intestazione). Con un token configurato, `/api/*` senza il cookie
 * `talos_token` e' 401 PRIMA che qualunque comando venga anche solo letto.
 */
test('⛔⛔⛔ col token attivo, un comando senza cookie e\' 401 e NON esegue niente', async (t) => {
  const { base, sessionRegistry } = await listen(t, { token: 'segreto-di-loopback' });
  const risposta = await postComando(base, 'sess-conclusa', { comando: 'echo x' });
  assert.equal(risposta.status, 401);
  assert.equal((await risposta.json()).error.code, 'AUTH_REQUIRED');
  assert.deepEqual(sessionRegistry.chiamate, [], 'il cancello del token viene PRIMA della lettura del comando');

  const conCookie = await fetch(`${base}/api/v1/sessions/sess-conclusa/shell`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'talos_token=segreto-di-loopback' },
    body: JSON.stringify({ comando: 'echo x' }),
  });
  assert.equal(conCookie.status, 200, 'e AL CONTRARIO: col cookie giusto la stessa richiesta passa');
  assert.deepEqual(sessionRegistry.chiamate, [{ sessionId: 'sess-conclusa', comando: 'echo x' }]);
});
