/*
 * ⛔⛔ GLI ERRORI DEL GIRO E DEL SERVER, NELLA LINGUA DELLA PERSONA (owner 03/10/2026: «ogni singola parola nella app deve essere
 *   sia in inglese che in italiano, non negoziabile»). Le frasi di `components/errori.js` stanno nel dizionario (area `errori`,
 *   chiavi `turno.*`) e si dicono con `t()` AL MOMENTO della chiamata; `testoErroreServer` sceglie dal CODICE il testo di un
 *   errore del server. Ogni controllo si prova anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TESTI } from '../../src/i18n/testi/index.js';
import { impostaLingua } from '../../src/components/lingua.js';
import {
  ORIGINI, erroreInUnaRiga, spiegaErrore, spiegaRifiutoAttrezzo, testoErroreServer, tonoDelTick, vestizioneErrore,
} from '../../src/components/errori.js';
import { createApiClient, publicProblem } from '../../src/services/api-client.ts';

const SORGENTE = readFileSync(new URL('../../src/components/errori.js', import.meta.url), 'utf8');
const LETTERE_ITALIANE = /[àèìòù]|\b(?:il|della|non|che|una|per)\b/u;

/** Un esempio per ogni regola di `spiegaErrore`, senza testo grezzo del server che finirebbe nella frase (quello resta com'è). */
const ESEMPI = [
  ['x', 'PROVIDER_BUDGET_OCCUPIED'], ['x', 'PROVIDER_KEY_SPEND_LIMIT'], ['x', 'PROVIDER_REQUEST_BUDGET'], ['x', 'PROVIDER_CREDIT_LIMIT'],
  ['x', 'PROVIDER_PAYMENT_REQUIRED'], ['x', 'PROVIDER_OUTCOME_UNKNOWN'], ['x', 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO'],
  ['PROVIDER_KEY_MISSING Manca la chiave per Z.AI.', ''], ['PROVIDER_KEY_MISSING', ''], ['LOCAL_RUNTIME_NOT_CONFIGURED', ''],
  ['CTX_SUMMARY_RESPONSE_INVALID', 'CTX_SUMMARY_RESPONSE_INVALID'], ['CTX_INVALID_SOURCE', 'CTX_INVALID_SOURCE'],
  ['CTX_TRUNCATED_SUMMARY', 'CTX_TRUNCATED_SUMMARY'], ['CTX_TRUNCATED_SUMMARY 12345 token nel ragionamento', 'CTX_TRUNCATED_SUMMARY'],
  ['request (17993 tokens) exceeds the available context size (16384 tokens)', ''], ['LOCAL_CONTEXT_EXCEEDED', 'LOCAL_CONTEXT_EXCEEDED'],
  ['RUNTIME_ARCH_UNSUPPORTED', 'RUNTIME_ARCH_UNSUPPORTED'], ['RUNTIME_OUT_OF_MEMORY', 'RUNTIME_OUT_OF_MEMORY'],
  ['llama-server non è diventato pronto', ''], ['llama-server non è diventato pronto entro 36 s', ''], ['runtime non pronto (modello di 12 GB)', ''],
  ['llama-server non è diventato pronto entro 36 s (modello di 12 GB)', ''],
  ['⛔ interrotto su richiesta.', 'fermato'], ['⛔ interrotto su richiesta: mentre aspettavo.', 'fermato'], ['', 'fermato'],
  ['flusso SSE senza contenuto ne tool_calls', ''], ['x', 'PROVIDER_EMPTY_RESPONSE'], ['MALFORMED_FUNCTION_CALL ha risposto senza testo né attrezzi (motivo del fornitore: MALFORMED_FUNCTION_CALL)', ''],
  ['x', 'giri-esauriti'], ['canale di approvazione', ''], ['La risposta del fornitore si è interrotta', ''], ['Credenziale rifiutata dal fornitore', ''],
  ['Il fornitore non ha accettato la richiesta', ''], ['ECONNREFUSED', ''], ['HTTP 429', ''], ['qualcosa di mai visto', 'boh'],
];

test('ERRORI-LINGUA-01 — ogni chiave `errori.` scritta in errori.js esiste nel dizionario, e ogni voce `turno.*` del dizionario è usata', () => {
  const scritte = new Set([...SORGENTE.matchAll(/'(errori\.[A-Za-z0-9_.]+)'/gu)].map((m) => m[1]));
  const mancanti = [...scritte].filter((k) => TESTI.en[k] === undefined || TESTI.it[k] === undefined);
  assert.deepEqual(mancanti, []);
  // le chiavi composte (famiglia dei limiti del fornitore; le quattro forme del motore non pronto) si controllano qui, una per una
  const composte = [];
  for (const f of ['budgetOccupato', 'limiteSpesaChiave', 'richiestaCostosa', 'creditoInsufficiente', 'limiteSpesaSconosciuto']) composte.push(`errori.turno.${f}.cosa`, `errori.turno.${f}.perche`, `errori.turno.${f}.rimedio1`);
  for (const forma of ['', 'Taglia', 'Attesa', 'TagliaAttesa']) composte.push(`errori.turno.runtimeNonPronto.perche${forma}`);
  assert.deepEqual(composte.filter((k) => TESTI.en[k] === undefined), []);
  const usate = new Set([...scritte, ...composte, 'errori.turno.limiteSpesaChiave.rimedio2', 'errori.turno.richiestaCostosa.rimedio2']);
  const inutilizzate = Object.keys(TESTI.en).filter((k) => k.startsWith('errori.turno.') && !usate.has(k));
  assert.deepEqual(inutilizzate, [], 'voci `turno.*` che nessuno dice più');
});

test('ERRORI-LINGUA-02 — in italiano e in inglese: ogni esempio dà una carta completa, mai una chiave grezza, e in inglese nessuna frase propria resta italiana', () => {
  try {
    for (const lingua of ['it', 'en']) {
      impostaLingua(lingua);
      for (const [messaggio, codice] of ESEMPI) {
        for (const contesto of [{}, { origine: ORIGINI.REINDIRIZZAMENTO }]) {
          const s = spiegaErrore(messaggio, codice, contesto);
          for (const testo of [s.cosa, s.perche, ...s.rimedi]) {
            assert.equal(typeof testo, 'string');
            /* il motivo grezzo della carta `architettura-sconosciuta` è il testo del server: senza testo, resta vuoto */
            assert.ok(testo.trim().length > 0 || s.id === 'architettura-sconosciuta', `${lingua} ${s.id}: testo vuoto`);
            assert.doesNotMatch(testo, /errori\.|\{[a-z]+\}|undefined/u, `${lingua} ${s.id}: chiave grezza o segnaposto non risolto in «${testo}»`);
          }
          if (lingua === 'en' && s.riconosciuto) {
            for (const testo of [s.cosa, ...s.rimedi]) assert.doesNotMatch(testo, LETTERE_ITALIANE, `en ${s.id}: «${testo}» è ancora italiano`);
          }
        }
      }
    }
    // AL CONTRARIO: il rilevatore di sopra vede davvero l'italiano
    impostaLingua('it');
    assert.match(spiegaErrore('x', 'giri-esauriti').cosa, LETTERE_ITALIANE);
  } finally { impostaLingua('it'); }
});

test('ERRORI-LINGUA-03 — la lingua si legge AL MOMENTO della chiamata: cambiarla cambia la carta, senza ricaricare niente', () => {
  try {
    impostaLingua('it');
    const italiano = spiegaErrore('x', 'giri-esauriti');
    impostaLingua('en');
    const inglese = spiegaErrore('x', 'giri-esauriti');
    assert.equal(italiano.cosa, 'L’invio ha usato tutte le richieste al modello che aveva, senza chiudere il compito.');
    assert.equal(inglese.cosa, 'This message used up the model requests it had, without finishing the task.');
    assert.equal(erroreInUnaRiga('x', 'giri-esauriti'), inglese.cosa);
    assert.deepEqual(inglese.rimedi, ['The next message continues the same task in the same session.', 'Press “New” to start a separate task, with its own cap.']);
    // pseudo-lingua del cancello: ciò che passa dal dizionario esce marcato, ciò che è dato grezzo (il testo del server) no
    impostaLingua('qps');
    assert.match(spiegaErrore('x', 'giri-esauriti').cosa, /^⟦.*⟧$/u);
    assert.equal(spiegaErrore('qualcosa di mai visto', 'boh').tecnico, 'qualcosa di mai visto');
  } finally { impostaLingua('it'); }
});

test('ERRORI-LINGUA-04 — i valori: il nome del fornitore, il punto di fermata, i numeri nella lingua e le quattro forme del motore non pronto', () => {
  try {
    impostaLingua('it');
    assert.equal(spiegaErrore('PROVIDER_KEY_MISSING Manca la chiave per Z.AI.', '').cosa, 'Manca la chiave per Z.AI.');
    assert.equal(spiegaErrore('PROVIDER_KEY_MISSING', '').cosa, 'Manca la chiave del fornitore scelto.');
    assert.match(spiegaErrore('', 'fermato').perche, /primo punto sicuro, come chiesto/u);
    assert.match(spiegaErrore('⛔ interrotto su richiesta: mentre aspettavo.', 'fermato').perche, /\(mentre aspettavo\)/u);
    assert.match(spiegaErrore('request (17993 tokens) exceeds the available context size (16384 tokens)', '').perche, /Servivano 17\.993 token, la finestra ne tiene 16\.384\./u);
    assert.match(spiegaErrore('CTX_TRUNCATED_SUMMARY 12345 token nel ragionamento', '').perche, /ha speso 12\.345 token nel ragionamento/u);
    const forme = ['llama-server non è diventato pronto', 'runtime non pronto (modello di 12 GB)', 'llama-server non è diventato pronto entro 36 s', 'llama-server non è diventato pronto entro 36 s (modello di 12 GB)']
      .map((m) => spiegaErrore(m, '').perche);
    assert.equal(new Set(forme).size, 4, 'quattro forme diverse');
    assert.match(forme[1], /\(qui 12 GB\)/u);
    assert.match(forme[2], /l'attesa si è fermata a 36 secondi/u);
    assert.match(forme[3], /\(qui 12 GB\), e l'attesa si è fermata a 36 secondi\./u);
    impostaLingua('en');
    assert.equal(spiegaErrore('PROVIDER_KEY_MISSING Manca la chiave per Z.AI.', '').cosa, 'The key for Z.AI is missing.');
    assert.match(spiegaErrore('request (17993 tokens) exceeds the available context size (16384 tokens)', '').perche, /needed 17,993 tokens, the window holds 16,384\./iu);
    assert.match(spiegaErrore('CTX_TRUNCATED_SUMMARY 12345 token nel ragionamento', '').perche, /spent 12,345 tokens on reasoning/u);
    assert.match(spiegaErrore('llama-server non è diventato pronto entro 36 s (modello di 12 GB)', '').perche, /\(here 12 GB\), and the wait stopped at 36 seconds\./u);
  } finally { impostaLingua('it'); }
});

test('ERRORI-LINGUA-05 — i no del kernel, la vestizione della carta e il tono del tick nelle due lingue', () => {
  try {
    impostaLingua('it');
    assert.equal(spiegaRifiutoAttrezzo('REFUSED. Empty html: nothing was created.').detto, 'L’HTML era vuoto: non è stato creato niente.');
    assert.equal(spiegaRifiutoAttrezzo('NOT FOUND x').detto, 'Quello che l’attrezzo cercava non c’è: non è cambiato niente.');
    assert.equal(spiegaRifiutoAttrezzo('tutto bene').rifiutato, false);
    assert.deepEqual(vestizioneErrore({ famiglia: 'fermato' }), { badge: 'Fermato', titolo: 'TALOS · fermato', tono: 'accent' });
    assert.deepEqual(vestizioneErrore(null), { badge: 'Errore', titolo: 'TALOS · errore', tono: 'danger' });
    impostaLingua('en');
    assert.equal(spiegaRifiutoAttrezzo('REFUSED. Empty html: nothing was created.').detto, 'The HTML was empty: nothing was created.');
    assert.equal(spiegaRifiutoAttrezzo('AMBIGUOUS x').detto, 'The text to replace appears more than once: nothing changed.');
    assert.equal(spiegaRifiutoAttrezzo('REFUSED troppo grande').detto, 'The content was too large to be accepted.');
    assert.deepEqual(vestizioneErrore({ famiglia: 'fermato' }), { badge: 'Stopped', titolo: 'TALOS · stopped', tono: 'accent' });
    assert.deepEqual(vestizioneErrore({ famiglia: 'reindirizzato' }), { badge: 'Redirected', titolo: 'TALOS · new direction', tono: 'accent', silenziosa: true });
    assert.deepEqual(vestizioneErrore(undefined), { badge: 'Error', titolo: 'TALOS · error', tono: 'danger' });
    // il tono non dipende dalla lingua, e l'oggetto che torna è una copia: cambiarlo non cambia la tabella
    assert.equal(tonoDelTick(vestizioneErrore({ famiglia: 'fermato' })), null);
    vestizioneErrore({ famiglia: 'fermato' }).badge = 'x';
    assert.equal(vestizioneErrore({ famiglia: 'fermato' }).badge, 'Stopped');
  } finally { impostaLingua('it'); }
});

test('ERRORI-LINGUA-06 — testoErroreServer da un ApiError vero: il codice sceglie la frase nella lingua, i `params` passano, le frasi inglesi del cliente si traducono', async () => {
  try {
    const api = createApiClient({
      fetchFn: async () => Response.json({ ok: false, error: { code: 'NOTE_NOT_FOUND', message: 'This note no longer exists', title: 'Operation failed', explanation: 'An unexpected problem occurred during the operation.', action: 'Open Doctor, copy the reference and try again.', doctorReference: 'doctor-abc', params: { nome: 'x', annidato: { a: 1 } } } }, { status: 404 }),
    });
    const errore = await api.get('/x').then(() => null, (e) => e);
    assert.deepEqual(errore.problem.params, { nome: 'x' }, 'solo valori piatti');
    impostaLingua('it');
    assert.deepEqual(testoErroreServer(errore), {
      message: 'Questa nota non esiste più', title: 'Operazione non riuscita',
      explanation: 'Si è verificato un problema imprevisto durante l’operazione.', action: 'Apri Doctor, copia il riferimento e riprova.',
    });
    impostaLingua('en');
    assert.equal(testoErroreServer(errore).message, 'This note no longer exists');
    // le frasi che fabbrica il cliente (risposta non JSON, busta senza messaggio)
    const nonJson = await createApiClient({ fetchFn: async () => new Response('<html>', { status: 502 }) }).get('/x').then(() => null, (e) => e);
    impostaLingua('it');
    assert.equal(testoErroreServer(nonJson).message, 'Risposta locale non valida');
    impostaLingua('en');
    assert.equal(testoErroreServer(nonJson).message, 'Invalid local response');
    impostaLingua('it');
    assert.equal(testoErroreServer(publicProblem(null)).message, 'Richiesta locale non riuscita');
    // un problema nudo (la busta `error`) e un oggetto con `problem` danno lo stesso testo
    const busta = { code: 'QUERY_INVALID', message: 'Invalid query' };
    assert.equal(testoErroreServer(busta).message, 'Query non valida');
    assert.equal(testoErroreServer({ code: 'QUERY_INVALID', problem: busta }).message, 'Query non valida');
  } finally { impostaLingua('it'); }
});
