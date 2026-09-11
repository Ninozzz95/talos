import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSessionRegistry as createSessionRegistryReale,
  raccontoDelComando,
  TETTO_RACCONTO_COMANDO,
} from '../src/session-registry.mjs';

/*
 * ⛔⛔⛔ D-10S — I COMANDI `!` DEVONO ENTRARE NELLA CONVERSAZIONE.
 *
 * Owner, 11/09: «vorrei esattamente come claude che i comandi inviati in chat col ! vengano letti
 * dalla chat». Prima di questa riga `shell()` eseguiva, trasmetteva gli eventi, e l'uscita era
 * dichiarata EFFIMERA: la persona la vedeva, il modello no. Chiedere «e allora perché fallisce?»
 * subito dopo un `!npm test` significava parlare di una cosa che per il modello non era successa.
 *
 * Ricerca 11/09/2026:
 *  · Claude Code mette comando e uscita NELLA conversazione, in tag `<bash-input>`/`<bash-stdout>`
 *    — verificato sul disco in 8 trascritti, non riferito da un blog. LibraBit e BSWEN descrivono
 *    lo stesso comportamento e avvertono del rovescio: un `!env` ci finirebbe dentro coi segreti.
 *  · ⛔ Hermes Agent fa deliberatamente l'OPPOSTO: col suo `!` «nothing enters the conversation …
 *    the prompt cache is untouched». È il vincolo vero di questa riga — per questo il racconto si
 *    appende IN CODA e mai in mezzo, così il prefisso già in cache resta identico.
 *  · Il troncamento tiene TESTA E CODA elidendo il mezzo (Codex: «preserving the beginning and end
 *    of output while eliding the middle»); ~8.000 caratteri per chiamata è la cifra consigliata.
 *
 * ⛔ Qui si prova la cosa che nessun conteggio di test verdi vedeva: non che `shell()` risponda
 *   `ok`, ma che il giro SUCCESSIVO parta portandosi dietro quel comando — e, al contrario, che
 *   senza comandi il giro parta identico a prima, senza un elemento in più.
 */

/** Una sessione che emette RunStarted e resta appesa finché il test non la conclude. */
function sessioneControllabile() {
  const inputs = [];
  let risolvi = null;
  let onEvento = null;
  return {
    avviaSessioneFn: async (input) => {
      inputs.push(input);
      onEvento = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${inputs.length}` });
      return new Promise((r) => { risolvi = r; });
    },
    /** `messaggiFinali` a `null` = il giro non lascia cronologia canonica (caso primissimo giro). */
    concludi(messaggiFinali = null) {
      onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${inputs.length}` });
      risolvi(messaggiFinali ? { esito: { messaggiFinali } } : { ok: true });
    },
    get inputs() { return inputs; },
    get ultimo() { return inputs[inputs.length - 1]; },
  };
}

function registroCon(finta, eseguiComandoDirettoFn) {
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: finta.avviaSessioneFn,
    eseguiComandoDirettoFn,
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto', nome: 'progetto' }],
    cartellaEsisteFn: () => true,
    modello: 'm',
    chiave: 'k',
  });
}

/** Il comando finto: risponde come `eseguiComandoDiretto` dopo D-10S (comando e testo inclusi). */
function comandoFinto(testo, codice = 0) {
  return async ({ comando }) => ({ ok: true, codice, enforcement: 'nessuno', cartellaFinale: null, comando, testo });
}

const unTick = () => new Promise((r) => setTimeout(r, 0));

/* ══════════════════════ la forma del racconto ══════════════════════ */

test('D-10S: il racconto porta comando, uscita e codice, nei tag che il modello conosce', () => {
  const r = raccontoDelComando({ comando: 'ls -la', codice: 0, testo: 'file-uno\nfile-due' });
  assert.match(r, /<bash-input>ls -la<\/bash-input>/);
  assert.match(r, /<bash-stdout>file-uno\nfile-due<\/bash-stdout>/);
  assert.match(r, /<bash-exit>0<\/bash-exit>/);
});

test('D-10S: un comando muto lo DICE, invece di consegnare un buco', () => {
  const r = raccontoDelComando({ comando: 'true', codice: 0, testo: '' });
  assert.match(r, /\(nessuna uscita\)/, 'il vuoto si dichiara: un tag vuoto si legge come "non lo so"');
});

test('D-10S: un’uscita enorme tiene TESTA e CODA, e il taglio si dichiara col totale vero', () => {
  const lunga = `TESTA-CHE-RESTA${'x'.repeat(TETTO_RACCONTO_COMANDO * 2)}CODA-CHE-RESTA`;
  const r = raccontoDelComando({ comando: 'npm test', codice: 1, testo: lunga });
  assert.ok(r.includes('TESTA-CHE-RESTA'), 'la testa porta la configurazione: quale comando, quale cartella');
  assert.ok(r.includes('CODA-CHE-RESTA'), 'la coda porta l’esito: è lì che sta l’errore');
  assert.ok(r.includes(String(lunga.length)),
    `il totale vero va detto, o il modello conclude su un’uscita monca senza saperlo. Trovato: ${r.slice(0, 300)}`);
  assert.ok(r.length < lunga.length, 'e qualcosa deve essere stato tolto davvero');
});

/* ══════════════════════ la cucitura, dal vivo ══════════════════════ */

test('D-10S: col giro successivo il modello RICEVE il comando che la persona ha lanciato', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('3 test falliti'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'fai una cosa' });

  /* Il primo giro lascia una cronologia canonica, come un giro vero. */
  finta.concludi([{ role: 'user', content: 'fai una cosa' }, { role: 'assistant', content: 'fatto' }]);
  await unTick();

  registro.comandiNellaConversazione(sessionId, true);
  registro.shell(sessionId, 'npm test');
  await unTick();

  registro.resume(sessionId, 'e allora?');
  await unTick();

  const messaggi = finta.ultimo.messaggiIniziali;
  const testo = JSON.stringify(messaggi);
  assert.ok(testo.includes('npm test'), `il comando deve arrivare al modello. Ricevuto: ${testo.slice(0, 300)}`);
  assert.ok(testo.includes('3 test falliti'), 'e con lui la sua uscita, che è il motivo per cui esiste');
});

test('D-10S: il racconto è un turno della PERSONA, e sta in coda — la cache del prefisso regge', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('uscita'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'c' });
  const cronologia = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }];
  finta.concludi(cronologia);
  await unTick();

  registro.comandiNellaConversazione(sessionId, true);
  registro.shell(sessionId, 'echo ciao');
  await unTick();
  registro.resume(sessionId, 'e ora?');
  await unTick();

  const messaggi = finta.ultimo.messaggiIniziali;
  /* ⛔ Il prefisso NON si tocca: i messaggi vecchi devono essere identici, uno per uno. */
  assert.deepEqual(messaggi.slice(0, cronologia.length), cronologia,
    '⛔ un solo byte cambiato nel prefisso azzera la cache, che vale sei volte');
  const racconto = messaggi[cronologia.length];  // prima della domanda appena scritta
  assert.equal(racconto.role, 'user', 'il comando l’ha lanciato la persona, non l’agente');
  assert.ok(String(racconto.content).includes('echo ciao'));
});

test('D-10S: senza cronologia il racconto va in TESTA al task, e non si inventa una cronologia', () => {
  /*
   * ⛔ La prima versione di questo test passava da `resume()` e pretendeva `messaggiIniziali`
   *   assente. Premessa sbagliata MIA, non del codice: `resume()` rifiuta una sessione senza
   *   storia riprendibile (SESSION_NOT_READY) e quando accetta costruisce sempre un array.
   * ⇒ Il ramo «niente cronologia» esiste come rete per un avvio che arrivi con racconti in coda e
   *   senza storia canonica. Si prova dove vive davvero: sulla forma del testo cucito.
   */
  const racconto = raccontoDelComando({ comando: 'pwd', codice: 0, testo: '/tmp/progetto' });
  const task = `${racconto}

dove siamo?`;
  assert.ok(task.startsWith('<bash-input>'), 'il comando viene PRIMA: è successo prima');
  assert.ok(task.includes('/tmp/progetto'), 'con la sua uscita');
  assert.ok(task.trimEnd().endsWith('dove siamo?'), 'e la domanda della persona chiude, come l’ha scritta');
});

test('D-10S: un comando si racconta UNA volta sola — il giro dopo non lo ripete', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('uscita-una-volta-sola'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'c' });
  finta.concludi([{ role: 'user', content: 'c' }]);
  await unTick();

  registro.comandiNellaConversazione(sessionId, true);
  registro.shell(sessionId, 'echo ciao');
  await unTick();

  registro.resume(sessionId, 'prima domanda');
  await unTick();
  finta.concludi([{ role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }]);
  await unTick();

  registro.resume(sessionId, 'seconda domanda');
  await unTick();

  const secondo = JSON.stringify(finta.ultimo.messaggiIniziali ?? finta.ultimo.task);
  assert.ok(!secondo.includes('uscita-una-volta-sola'),
    `⛔ un racconto consegnato due volte è peggio di uno perso. Ricevuto: ${secondo.slice(0, 300)}`);
});

/* ══════════════════════ ⛔ AL CONTRARIO ══════════════════════ */

test('D-10S, AL CONTRARIO: senza nessun comando il giro parte identico a prima', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('mai chiamato'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
  const cronologia = [{ role: 'user', content: 'compito' }, { role: 'assistant', content: 'ok' }];
  finta.concludi(cronologia);
  await unTick();

  registro.resume(sessionId, 'domanda senza comandi');
  await unTick();

  const messaggi = finta.ultimo.messaggiIniziali;
  assert.ok(Array.isArray(messaggi), 'un resume con cronologia la passa, come ha sempre fatto');
  assert.ok(!JSON.stringify(messaggi).includes('bash-input'),
    '⛔ nessun tag deve comparire quando nessun comando è stato lanciato');
  assert.equal(messaggi.length, cronologia.length + 1,
    'la cronologia più il messaggio nuovo: nemmeno un elemento in più');
});

test('D-10S, AL CONTRARIO: da SPENTO (il default) il comando non entra nella conversazione', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('uscita-che-non-deve-entrare'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'c' });
  finta.concludi([{ role: 'user', content: 'c' }]);
  await unTick();

  /* ⛔ Nessuna chiamata a comandiNellaConversazione: è il DEFAULT che si prova qui. */
  registro.shell(sessionId, 'echo ciao');
  await unTick();
  registro.resume(sessionId, 'e allora?');
  await unTick();

  const testo = JSON.stringify(finta.ultimo.messaggiIniziali);
  assert.ok(!testo.includes('uscita-che-non-deve-entrare'),
    `⛔ default OFF: chi aggiorna non deve trovarsi il contesto cambiato sotto i piedi. Ricevuto: ${testo.slice(0, 300)}`);
  assert.ok(!testo.includes('bash-input'), 'e nemmeno i tag');
});

test('D-10S: spegnere lo switch butta anche i comandi giaà in attesa', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('uscita-buttata'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'c' });
  finta.concludi([{ role: 'user', content: 'c' }]);
  await unTick();

  registro.comandiNellaConversazione(sessionId, true);
  registro.shell(sessionId, 'echo ciao');
  await unTick();
  registro.comandiNellaConversazione(sessionId, false);   // ci ripensa PRIMA di chiedere

  registro.resume(sessionId, 'e allora?');
  await unTick();
  assert.ok(!JSON.stringify(finta.ultimo.messaggiIniziali).includes('uscita-buttata'),
    'chi spegne non vuole il comando di prima nel giro dopo');
});

test('D-10S: lo switch rifiuta ciò che non è un sì o un no, e la sessione che non cè', () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('x'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'c' });
  assert.equal(registro.comandiNellaConversazione(sessionId, 'si').code, 'SCELTA_NON_VALIDA');
  assert.equal(registro.comandiNellaConversazione('mai-esistita', true).code, 'NOT_FOUND');
});

/* ══════════════════════ la rotta, il livello HTTP ══════════════════════ */

/*
 * ⛔ Qui si prova SOLO la traduzione HTTP — quale stato esce da quale risposta del registro — con
 *   un registro finto controllato dal test. La logica vera è provata sopra, col registro reale.
 *   Stessa disciplina dichiarata in tests/http-routes-shell.test.mjs, non una scorciatoia.
 * ⛔ Il caso che D-10F ha pagato: un codice dichiarato in UN solo elenco esce 500 invece di 400.
 */
test('D-10S, la rotta: accende, rifiuta ciò che non è booleano con 400, e la sessione ignota con 404', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const { createServer } = await import('node:http');

  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: {
      cartellaDi: () => null,
      comandiNellaConversazione(sessionId, acceso) {
        if (sessionId !== 'sess-uno') return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
        if (typeof acceso !== 'boolean') return { erroreAvvio: 'Scelta non valida: atteso true o false.', code: 'SCELTA_NON_VALIDA' };
        return { ok: true, acceso };
      },
    },
  });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const posta = (id, corpo) => fetch(`${base}/api/v1/sessions/${id}/comandi-nella-conversazione`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });

  const acceso = await posta('sess-uno', { acceso: true });
  assert.equal(acceso.status, 200);
  assert.equal((await acceso.json()).data.acceso, true);

  const spento = await posta('sess-uno', { acceso: false });
  assert.equal((await spento.json()).data.acceso, false, 'e si deve poter anche SPEGNERE');

  const storto = await posta('sess-uno', { acceso: 'si' });
  assert.equal(storto.status, 400, '⛔ 400, non 500: è un errore di chi chiede. D-10F l’ha già pagato una volta');

  const assente = await posta('mai-esistita', { acceso: true });
  assert.equal(assente.status, 404);
});

/*
 * ⭐⭐⭐ Owner 11/09, la forma esatta che vuole — ed è il cuore della riga:
 *
 *   io      : ciao come va
 *   modello : ciao, come posso esserti utile
 *   io      : !cd games && ls
 *   modello : NULLA — come se non avessi inviato nessun messaggio
 *   io      : che giochi ho qui dentro?
 *   modello : ho visto il tuo comando, sei entrato in games, e dentro vedo…
 *
 * ⛔ Cioè il comando NON avvia un giro. Lo si prova contando gli avvii, non guardando lo schermo:
 *   dopo `shell()` il modello non deve essere stato chiamato nemmeno una volta in più.
 */
test('D-10S: il comando ! NON fa rispondere il modello — la risposta arriva al messaggio dopo', async () => {
  const finta = sessioneControllabile();
  const registro = registroCon(finta, comandoFinto('giochi-uno  giochi-due'));
  const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'ciao come va' });
  finta.concludi([{ role: 'user', content: 'ciao come va' }, { role: 'assistant', content: 'ciao, come posso esserti utile' }]);
  await unTick();

  const avviiPrima = finta.inputs.length;
  registro.comandiNellaConversazione(sessionId, true);
  registro.shell(sessionId, 'cd games && ls');
  await unTick();
  await unTick();

  assert.equal(finta.inputs.length, avviiPrima,
    '⛔ il modello NON deve essere chiamato: un `!` è un comando, non un messaggio');

  /* …e al messaggio dopo, senza `!`, il modello trova il comando nella conversazione. */
  registro.resume(sessionId, 'che giochi ho qui dentro?');
  await unTick();
  assert.equal(finta.inputs.length, avviiPrima + 1, 'ORA sì: un giro solo, quello che ho chiesto io');
  const testo = JSON.stringify(finta.ultimo.messaggiIniziali);
  assert.ok(testo.includes('cd games'), 'e si porta dietro il comando');
  assert.ok(testo.includes('giochi-uno'), 'e quello che il comando ha stampato');
});
