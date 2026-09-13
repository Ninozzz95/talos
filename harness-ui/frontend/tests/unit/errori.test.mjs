import test from 'node:test';
import assert from 'node:assert/strict';
import { spiegaErrore, erroreInUnaRiga, spiegaRifiutoAttrezzo, vestizioneErrore } from '../../src/components/errori.js';

// 06/09 — i due errori che l'owner ha visto a schermo con un modello locale, e il verso contrario.

test('ERRORI-CONTESTO: il JSON crudo diventa una frase, coi numeri veri dentro', () => {
  const grezzo = 'HTTP 400 dopo 4 tentativi: {"error":{"code":400,"message":"request (17993 tokens) exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error","n_prompt_tokens":17993,"n_ctx":16384}}';
  const s = spiegaErrore(grezzo, 'internal-error');
  assert.equal(s.id, 'contesto-pieno');
  assert.equal(s.riconosciuto, true);
  assert.match(s.cosa, /non entra nella finestra/);
  assert.match(s.perche, /17\.993/); // i numeri dell'errore si usano, non si buttano
  assert.match(s.perche, /16\.384/);
  assert.ok(s.rimedi.length >= 3);
  assert.match(s.rimedi[0], /Compatta/); // prima si compatta: il contesto non azzerato dà lo stesso 400 anche su prompt corti
  assert.equal(s.tecnico, grezzo); // il testo del server non sparisce mai
});

test('ERRORI-CONTESTO senza numeri: la frase regge lo stesso', () => {
  const s = spiegaErrore('context length exceeded', 'internal-error');
  assert.equal(s.id, 'contesto-pieno');
  assert.doesNotMatch(s.perche, /Servivano/);
});

test('ERRORI-VUOTO: «flusso SSE senza contenuto» diventa cosa, perché e tre cose da fare', () => {
  const s = spiegaErrore('flusso SSE senza contenuto ne tool_calls', 'internal-error');
  assert.equal(s.id, 'risposta-vuota');
  assert.match(s.cosa, /senza dire niente/);
  assert.match(s.perche, /modelli locali/);
  assert.ok(s.rimedi.some((r) => /Riprova/i.test(r)));
});

test('ERRORI-ALTRI: giri, canale di approvazione, rete e quota', () => {
  assert.equal(spiegaErrore('24 su 24 usati senza chiudere il task', 'giri-esauriti').id, 'giri-esauriti');
  assert.equal(spiegaErrore('la sessione non ha un canale di approvazione attivo').id, 'senza-canale-approvazione');
  assert.equal(spiegaErrore('fetch failed: ECONNREFUSED 127.0.0.1:8080').id, 'rete');
  assert.equal(spiegaErrore('HTTP 429 rate limit exceeded').id, 'quota');
});

test('ERRORI-SCONOSCIUTO: non si inventa una causa, si dice che non si sa e si mostra il testo', () => {
  const s = spiegaErrore('qualcosa di mai visto', 'internal-error');
  assert.equal(s.id, 'sconosciuto');
  assert.equal(s.riconosciuto, false);
  assert.match(s.perche, /non è ancora tradotta/);
  assert.equal(s.tecnico, 'qualcosa di mai visto');
  // AL CONTRARIO: anche senza messaggio non si rompe e non si finge di sapere
  const vuoto = spiegaErrore('', '');
  assert.equal(vuoto.id, 'sconosciuto');
  assert.equal(vuoto.tecnico, '');
});

test('ERRORI-UNA-RIGA: per i posti stretti resta solo il «cosa»', () => {
  assert.match(erroreInUnaRiga('flusso SSE senza contenuto ne tool_calls', 'internal-error'), /senza dire niente/);
});

test('ERRORI-RUNTIME: il motore locale che non si accende in tempo, trovato su una sessione vera', () => {
  const s = spiegaErrore('llama-server non è diventato pronto entro 36 s (modello di 12 GB)', 'internal-error');
  assert.equal(s.id, 'runtime-non-pronto');
  assert.match(s.cosa, /non si è acceso in tempo/);
  assert.match(s.perche, /12 GB/); // la taglia dichiarata nell'errore si usa
  assert.match(s.perche, /36 secondi/);
  assert.equal(s.rimedi.length, 3);
  // AL CONTRARIO: senza numeri la frase resta sensata
  const senza = spiegaErrore('failed to load model', 'internal-error');
  assert.equal(senza.id, 'runtime-non-pronto');
  assert.doesNotMatch(senza.perche, /\(qui/);
});

test('RIFIUTI: un REFUSED del kernel si legge in italiano, e il testo originale resta', () => {
  // il caso che l'owner ha visto: «REFUSED. Empty html: nothing was created.»
  const r = spiegaRifiutoAttrezzo('REFUSED. Empty html: nothing was created.');
  assert.equal(r.rifiutato, true);
  assert.match(r.detto, /HTML era vuoto/);
  assert.equal(r.tecnico, 'REFUSED. Empty html: nothing was created.');
  // altri rifiuti veri del kernel
  assert.match(spiegaRifiutoAttrezzo('REFUSED. cartella is required and must be a non-empty absolute path.').detto, /Manca la cartella/);
  assert.match(spiegaRifiutoAttrezzo('REFUSED. cartella must be a string (an absolute path)').detto, /non era scritto come testo/);
  // un rifiuto che non conosciamo si dichiara tale, senza inventare un motivo
  assert.equal(spiegaRifiutoAttrezzo('REFUSED. qualcosa di nuovo').detto, 'L’attrezzo ha rifiutato la richiesta.');
  // AL CONTRARIO: un esito normale NON è un rifiuto, e non si tocca
  assert.equal(spiegaRifiutoAttrezzo('ok: 3 file letti').rifiutato, false);
  assert.equal(spiegaRifiutoAttrezzo('').rifiutato, false);
  assert.equal(spiegaRifiutoAttrezzo(null).rifiutato, false);
});

test('ERRORI-STOP: fermare un giro non è un guasto, e non si chiede di riprovare', () => {
  // T05-D2: premendo «Ferma» usciva una carta rossa con «[internal-error] This operation was aborted»
  const s = spiegaErrore('This operation was aborted', 'internal-error');
  assert.equal(s.id, 'fermato-da-te');
  assert.equal(s.cosa, 'Hai fermato il giro.');
  assert.match(s.perche, /punto sicuro/);
  assert.equal(s.rimedi.length, 1);
  assert.doesNotMatch(s.rimedi[0], /Riprova/i, 'non si suggerisce di riprovare ciò che hai fermato apposta');
  // AL CONTRARIO: un errore vero resta un errore
  assert.notEqual(spiegaErrore('fetch failed', 'internal-error').id, 'fermato-da-te');
});

/*
 * ⛔⛔⛔ 09/09 — TRE GIRI VERI con `z-ai/glm-5.3-flash`: la compattazione automatica è fallita e in
 * chat è uscita la carta GENERICA («Il giro si è interrotto per un errore» · «Questa forma di errore
 * non è ancora tradotta»). Il server, invece, l'errore lo diceva benissimo e in italiano — la modale
 * «Context Manager» lo mostrava già in rosso sotto lo stato del lavoro (context-compactor.js:148,
 * `view.job.error.message`), la chat no.
 *
 * I tre codici veri, con il messaggio che il motore manda davvero:
 *   · CTX_SUMMARY_RESPONSE_INVALID — «La sintesi non dichiara testo e stato finale.»
 *       (harness-ui/src/runtime-owner-adapter.mjs:775)
 *   · CTX_INVALID_SOURCE          — «Nessuna citazione corrisponde agli originali (es. «…» in …).»
 *       (context-engine/src/summary.mjs:51)
 *   · CTX_TRUNCATED_SUMMARY       — «La sintesi non è stata completata.»
 *       (context-engine/src/summary.mjs:20)
 *
 * ⛔ Il codice NON arriva alla chat: `harness-ui/src/agent-service.mjs:1395` scrive
 * `code: 'internal-error'` fisso quando `talosLavora` lancia, e la `ContextEngineError` che
 * `contextHooks.prepare` fa uscire da `talosHarness.mjs:4801` passa di lì. Perciò ogni regola qui
 * sotto deve riconoscere ANCHE dal solo messaggio — e continuare a funzionare il giorno in cui il
 * codice arriverà davvero (patch descritta nel resoconto).
 */

const TRE_GIRI_VERI = [
  ['CTX_SUMMARY_RESPONSE_INVALID', 'La sintesi non dichiara testo e stato finale.', 'contesto-sintesi-invalida'],
  ['CTX_INVALID_SOURCE', 'Nessuna citazione corrisponde agli originali (es. «adottiamo la regola R1» in m-7).', 'contesto-citazioni'],
  ['CTX_TRUNCATED_SUMMARY', 'La sintesi non è stata completata.', 'contesto-sintesi-troncata'],
];

test('ERRORI-CONTESTO-COMPATTAZIONE: i tre casi visti dal vivo hanno una carta loro, col codice CADUTO', () => {
  for (const [codice, messaggio, id] of TRE_GIRI_VERI) {
    // ⛔ così arrivano OGGI: il codice è già diventato 'internal-error' in agent-service.mjs:1395
    const s = spiegaErrore(messaggio, 'internal-error');
    assert.equal(s.id, id, `${codice} finiva nella carta generica`);
    assert.equal(s.riconosciuto, true);
    assert.match(s.cosa, /compattazione del contesto/i, 'si deve capire che è il CONTESTO ad aver fallito');
    assert.doesNotMatch(s.cosa, /CTX_/, 'niente nomi tecnici a schermo');
    assert.doesNotMatch(s.perche, /CTX_/);
    assert.match(s.perche, /Nessun messaggio è stato modificato/, 'si dice cosa NON è successo');
    assert.match(s.rimedi[0], /Context Manager/, 'l’azione utile è aprire Context Manager, non «riprova»');
    assert.doesNotMatch(s.rimedi[0], /^Riprova il giro/);
    assert.equal(s.tecnico.includes(messaggio), true, 'il testo del server resta accessibile');
  }
});

test('ERRORI-CONTESTO-COMPATTAZIONE: gli stessi tre riconosciuti anche dal CODICE, quando arriverà', () => {
  for (const [codice, messaggio, id] of TRE_GIRI_VERI) {
    assert.equal(spiegaErrore(messaggio, codice).id, id);
    // un messaggio che non conosciamo, ma col codice giusto, resta comunque nella sua carta
    assert.equal(spiegaErrore('testo mai visto dal server', codice).id, id);
  }
});

test('ERRORI-CONTESTO-COMPATTAZIONE: il codice non si mostra come titolo, ma resta nel dettaglio', () => {
  const s = spiegaErrore('La sintesi non dichiara testo e stato finale.', 'CTX_SUMMARY_RESPONSE_INVALID');
  assert.match(s.tecnico, /CTX_SUMMARY_RESPONSE_INVALID/, 'il codice si incolla in una segnalazione: sta nel grezzo');
  assert.match(s.tecnico, /La sintesi non dichiara testo e stato finale\./);
  // e non si duplica se il messaggio già lo contiene
  const doppio = spiegaErrore('CTX_INVALID_SOURCE: Nessuna citazione corrisponde agli originali.', 'CTX_INVALID_SOURCE');
  assert.equal(doppio.tecnico.match(/CTX_INVALID_SOURCE/g).length, 1);
});

test('ERRORI-CONTESTO-TRONCATA: il ritentativo si dichiara per quello che è — UNO, e solo qui', () => {
  const s = spiegaErrore('La sintesi non è stata completata.', 'CTX_TRUNCATED_SUMMARY');
  // engine.mjs:103-107 ritenta una volta sola, e SOLO su CTX_TRUNCATED_SUMMARY
  assert.match(s.perche, /una seconda volta/);
  // ⛔ non si promette un ritentativo automatico dove il motore non ne fa nessuno
  for (const codice of ['CTX_SUMMARY_RESPONSE_INVALID', 'CTX_INVALID_SOURCE', 'CTX_CONTEXT_OVERFLOW']) {
    const carta = spiegaErrore('x', codice);
    assert.doesNotMatch(carta.perche, /seconda volta|riproverà|riprova da solo|automaticamente/i);
  }
  /*
   * Il caso col ragionamento: il numero dell'errore si usa, non si butta.
   * ⛔ Misurato scrivendo questo test, non dedotto: in italiano `toLocaleString('it-IT')` NON
   * raggruppa i numeri di quattro cifre — il CLDR italiano ha `minimumGroupingDigits: 2`, quindi
   * 2048 resta «2048» e solo da cinque cifre in su compare il punto («16.384»). Chi si aspetta
   * «2.048» sta guardando l'inglese, non l'italiano.
   */
  const conRagionamento = spiegaErrore('Il modello ha speso 2048 token nel ragionamento e non ha lasciato spazio alla sintesi.', 'CTX_TRUNCATED_SUMMARY');
  assert.equal(conRagionamento.id, 'contesto-sintesi-troncata');
  assert.match(conRagionamento.perche, /ha speso 2048 token nel ragionamento/);
  const conMigliaia = spiegaErrore('Il modello ha speso 16384 token nel ragionamento e non ha lasciato spazio alla sintesi.', 'CTX_TRUNCATED_SUMMARY');
  assert.match(conMigliaia.perche, /ha speso 16\.384 token/);
  // AL CONTRARIO: senza il numero la frase resta sensata, e non spunta un «undefined»
  const senzaNumero = spiegaErrore('La sintesi non è stata completata.', 'CTX_TRUNCATED_SUMMARY');
  assert.doesNotMatch(senzaNumero.perche, /ragionamento|undefined|NaN/);
});

test('ERRORI-CONTESTO-ALTRI: un CTX_ che non conosciamo dice comunque CHE COSA ha fallito, e riporta le parole del server', () => {
  const s = spiegaErrore('Il contesto supera la finestra. Compattare o modificare le informazioni protette.', 'CTX_CONTEXT_OVERFLOW');
  assert.equal(s.id, 'contesto');
  assert.equal(s.riconosciuto, true);
  assert.match(s.cosa, /compattazione del contesto/i);
  assert.match(s.perche, /Il contesto supera la finestra/, 'il messaggio del server è già in italiano: si usa');
  assert.match(s.perche, /Nessun messaggio è stato modificato/);
  assert.match(s.rimedi[0], /Context Manager/);
});

test('ERRORI-CONTESTO: AL CONTRARIO — chi non è del contesto non finisce nella carta del contesto', () => {
  // un errore del giro resta un errore del giro
  assert.notEqual(spiegaErrore('fetch failed: ECONNREFUSED', 'internal-error').id, 'contesto');
  assert.equal(spiegaErrore('HTTP 429 rate limit exceeded', 'internal-error').id, 'quota');
  // la finestra piena del modello locale ha già la sua carta, e non la perde
  assert.equal(spiegaErrore('exceeds the available context size (16384 tokens)', 'internal-error').id, 'contesto-pieno');
  // «Ferma» durante una compattazione resta «Hai fermato il giro»
  assert.equal(spiegaErrore('This operation was aborted', 'internal-error').id, 'fermato-da-te');
  // e una frase italiana qualsiasi non diventa un guasto del contesto solo perché è italiana
  assert.equal(spiegaErrore('Il modello non ha risposto in tempo.', 'internal-error').id, 'sconosciuto');
});

test('VESTIZIONE: la carta del contesto si distingue a colpo d’occhio da quella di un errore del giro', () => {
  const contesto = vestizioneErrore(spiegaErrore('La sintesi non è stata completata.', 'CTX_TRUNCATED_SUMMARY'));
  assert.equal(contesto.badge, 'Contesto');
  assert.match(contesto.titolo, /contesto/i);
  assert.notEqual(contesto.tono, 'danger', 'non è la tua richiesta ad aver sbagliato: non porta il rosso del guasto');
  const guasto = vestizioneErrore(spiegaErrore('fetch failed', 'internal-error'));
  assert.deepEqual(guasto, { badge: 'Errore', titolo: 'TALOS · errore', tono: 'danger' });
  const fermato = vestizioneErrore(spiegaErrore('This operation was aborted', 'internal-error'));
  assert.deepEqual(fermato, { badge: 'Fermato', titolo: 'TALOS · fermato', tono: 'accent' });
  // AL CONTRARIO: senza spiegazione si torna alla forma dell'errore, mai a una carta muta
  assert.deepEqual(vestizioneErrore(null), { badge: 'Errore', titolo: 'TALOS · errore', tono: 'danger' });
});

test('ERRORI-UNA-RIGA: anche nei posti stretti si legge che è il contesto', () => {
  assert.match(erroreInUnaRiga('La sintesi non dichiara testo e stato finale.', 'internal-error'), /compattazione del contesto/i);
});
