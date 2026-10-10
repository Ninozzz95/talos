/*
 * Gli errori del giro, detti a una persona.
 *
 * ⛔ 06/9, owner con due screenshot: «con un modello locale ogni tanto spunta questo» —
 * `[internal-error] flusso SSE senza contenuto ne tool_calls` — e, subito dopo,
 * `[internal-error] HTTP 400 dopo 4 tentativi: {"error":{"code":400,"message":"request (17993 tokens)
 * exceeds the available context size (16384 tokens), try increasing it","type":"exceed_context_size_error",
 * "n_prompt_tokens":17993,"n_ctx":16384}}`. Cioè: gergo e JSON crudo, davanti a chi sta lavorando.
 *
 * Il secondo non è nemmeno un guasto: è un limite dichiarato. La finestra del modello locale è più
 * piccola di ciò che gli abbiamo mandato, e il numero esatto sta dentro l'errore — buttarlo via e
 * mostrare la graffa è il modo peggiore di usarlo.
 *
 * Qui vive UNA mappa sola: da ciò che dice il server a «cosa è successo · perché · cosa puoi fare».
 * Il testo tecnico non sparisce mai — resta come dettaglio secondario, perché è quello che si incolla
 * in una segnalazione. Nessuna riga inventa un rimedio che TALOS non ha: se non sappiamo cosa fare,
 * lo diciamo.
 *
 * Ricerca 06/09/2026, prima di scrivere:
 * - llama.cpp `--ctx-size`/`-c` è la finestra del server locale; con `--parallel N` viene DIVISA per N
 *   (ggml-org/llama.cpp #11681), e alcuni modelli tappano comunque lo slot alla loro finestra di
 *   addestramento: si verifica il runtime caricato, non il flag di avvio (ggml-org/llama.cpp #18376).
 * - Il contesto non azzerato fra un messaggio e l'altro produce lo stesso 400 anche su prompt corti
 *   (continuedev/continue #9797): per questo il primo rimedio è compattare, non alzare la finestra.
 *
 * ⛔⛔⛔ 09/9 — TRE GIRI VERI con `z-ai/glm-5.3-flash`: la compattazione automatica del contesto è
 * fallita e in chat è uscita la carta GENERICA («Il giro si è interrotto per un errore» · «Questa
 * forma di errore non è ancora tradotta»). Il server, invece, l'errore lo diceva benissimo e in
 * italiano — tanto che la modale «Context Manager» lo mostrava già in rosso sotto lo stato del
 * lavoro (`context-compactor.js`, `view.job.error.message`). Chi guardava la chat capiva solo che
 * il giro era «errore», e sembrava colpa della domanda appena scritta.
 *
 * Ricerca 09/09/2026, prima di scrivere:
 * - Nous Research, Hermes Agent, `docs/micro-compaction.md` (letto 09/09/2026): quando una sintesi
 *   fallisce «the transcript is left untouched and the failure is counted», e dopo tre fallimenti di
 *   fila il cursore avanza invece di ritentare all'infinito. ⇒ «gli originali restano» non è una
 *   rassicurazione di cortesia: è il fatto che descrive la macchina, e va detto per primo. ⛔ Vincolo
 *   scoperto lì e non deducibile dal nostro codice: da Hermes un fallimento di compattazione NON
 *   interrompe il turno; da noi sì, perché arriva solo quando il contesto non entra più.
 * - Nielsen Norman Group, «Error-Message Guidelines» (14/05/2023) più le euristiche collegate, lette
 *   via ctx7 il 09/09/2026: un messaggio generico come «An error occurred» «lacks context»; si
 *   descrive il problema con precisione, si offre un rimedio, e si evitano «technical jargon,
 *   obscure error codes, and abbreviations, reserving them only for technical diagnostic purposes».
 *   ⇒ il codice `CTX_*` vive SOLO nel dettaglio richiuso, mai come titolo.
 * - Nielsen Norman Group, «Hostile Patterns in Error Messages» (30/10/2022): non si usa lo stile
 *   dell'errore per ciò che non è un errore di chi legge — «Let's assist users, not admonish them».
 *   ⇒ la carta della compattazione ha badge, titolo e tono suoi (vedi `vestizioneErrore`), non il
 *   rosso di «hai sbagliato tu».
 * - Pencil & Paper, «Error Message UX, Handling & Feedback», Meganne Ohata (25/10/2024): gli errori
 *   si dividono fra quelli che nascono DAL SISTEMA e quelli che nascono da un'incomprensione di chi
 *   usa lo strumento; «Share details about what happened and what impact it might have had» e «Let
 *   the user know what they can do to move ahead», senza soluzioni-uguali-per-tutti. ⇒ ogni carta
 *   qui sotto dice anche COSA NON È SUCCESSO, e porta l'azione della sua famiglia (Context Manager),
 *   non un «riprova» buono per qualunque cosa.
 */

/*
 * ⛔ 09/9 — le tre frasi che i tre giri veri hanno prodotto, con la loro sorgente:
 *   · CTX_SUMMARY_RESPONSE_INVALID — «La sintesi non dichiara testo e stato finale.»
 *       `harness-ui/src/runtime-owner-adapter.mjs`, ramo `choice.message.content` non stringa
 *   · CTX_INVALID_SOURCE           — «Nessuna citazione corrisponde agli originali (es. «…» in …).»
 *       `context-engine/src/summary.mjs`, quando nessuna citazione si ritrova negli originali
 *   · CTX_TRUNCATED_SUMMARY        — «La sintesi non è stata completata.»
 *       `context-engine/src/summary.mjs`, `finishReason` diverso da stop/end_turn
 *
 * ⛔⛔ Il CODICE non arriva alla chat: quando `contextHooks.prepare` lancia dentro `talosLavora`,
 * `harness-ui/src/agent-service.mjs` scrive `code: 'internal-error'` FISSO, e la `ContextEngineError`
 * perde il suo `.code` per strada. Perciò ogni regola riconosce dal MESSAGGIO — che è già in
 * italiano e sopravvive — e in più dal codice, così il giorno in cui il server lo passerà (patch
 * separata: non è questo file) qui non cambia niente.
 */
/*
 * ⛔⛔ 03/10/2026 (owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — TUTTE le frasi di questo
 * file stanno nel dizionario, area `errori` (`i18n/testi/errori.js`, chiavi `turno.*`), e si dicono con `t()` AL MOMENTO della
 * chiamata: la lingua si può cambiare mentre l'app è aperta. Le espressioni regolari che RICONOSCONO una frase del server o del
 * kernel (italiana o inglese) restano com'erano: sono logica, non testo a schermo.
 */
import { interpola, linguaCorrenteDiT, t } from './lingua.js';
import { TESTI } from '../i18n/testi/index.js';

/** I numeri nella lingua corrente (stesso uso di `capability.js`: italiano con il punto delle migliaia, altrimenti inglese). */
const numeroLocale = (n) => Number(n).toLocaleString(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');

/*
 * ⛔ È vero, ed è la cosa che chi legge deve sapere per prima: il motore non pubblica NIENTE finché
 * la sintesi non passa la verifica (la versione nuova si scrive solo su `committed`), quindi un
 * fallimento lascia la conversazione esattamente com'era. Stessa scelta di Hermes, citata sopra.
 * (La frase è `turno.contesto.originaliIntatti`.)
 */
const COSA_CONTESTO = () => t('errori.turno.contesto.cosa');
const ORIGINALI_INTATTI = () => t('errori.turno.contesto.originaliIntatti');

/** I rimedi della famiglia contesto: dove guardare, poi il consiglio del caso, poi cosa si può rifare. */
const rimediContesto = (proprio) => [t('errori.turno.contesto.apriContextManager'), ...(proprio ? [proprio] : []), t('errori.turno.contesto.compattaAMano')];

const CODICE_CONTESTO = /\bCTX_[A-Z0-9_]+/;

/**
 * ⛔⛔⛔ 13/09 — LA PROVENIENZA DI UN EVENTO: QUALE COMANDO L'HA GENERATO.
 *
 * Un evento che dice «il giro si è chiuso» senza dire CHI gliel'ha chiesto costringe chi legge a
 * indovinarlo dalle parole — e le parole dei due comandi sono IDENTICHE (vedi la regola
 * 'reindirizzato'). Queste sono le parole con cui la provenienza si dichiara: chi costruisce
 * l'evento e chi lo legge devono usare le stesse, quindi vivono qui, esportate, e non scritte a
 * mano in due posti diversi.
 *
 * ⛔ 13/09, sera — LA DIPENDENZA E' CHIUSA: `legacy/app.js` le passa, sul `RunError` del giro
 * vecchio, ricavandole da `provenienzaDelGiroFinito` qui sotto. Finche' non lo faceva, la famiglia
 * `reindirizzato` era IRRAGGIUNGIBILE per costruzione — la sua regola pretende l'origine (r. 332) —
 * e la prova verde su questo modulo non poteva accorgersene: misurava la funzione, non la catena.
 */
export const ORIGINI = Object.freeze({
  /** «Ferma» — la persona ha chiesto di fermare il giro, e basta. */
  STOP: 'stop',
  /** «Reindirizza» — la persona ha cambiato direzione: il giro vecchio si chiude per lasciare il posto al nuovo. */
  REINDIRIZZAMENTO: 'reindirizzamento',
});

/**
 * La provenienza di un giro che si e' appena chiuso, per chi tiene lo stato della sessione.
 *
 * ⛔ TORNA `null` QUANDO NON SA, e non e' una pigrizia: e' il contratto. Cercate sette forme di
 *   uno stop esplicito nel monolite (`stopRequest`, `stopPending`, `richiestaStop`, `RunStopped`…)
 *   il 13/09: nessuna esiste. Quindi «non c'e' un reindirizzamento in volo» NON significa «la
 *   persona ha premuto Ferma» — puo' benissimo essere un guasto vero che nessuno ha chiesto.
 *   Restituire `ORIGINI.STOP` qui sarebbe stato INVENTARE una provenienza, ed e' esattamente cio'
 *   che `spiegaErrore` vieta: «assente = provenienza ignota, e si dice cosi' invece di indovinarla».
 *
 * ⛔ E la provenienza da sola non basta a dichiarare un cambio di direzione: la regola pretende
 *   ANCHE che l'esito sia davvero un fermo su richiesta. Un guasto vero capitato mentre un
 *   reindirizzamento e' in volo resta rosso — c'e' una prova apposta, al contrario.
 *
 * @param {{reindirizzamentoInVolo?:boolean}} stato
 * @returns {{origine:string}|{}} il contesto da passare a `spiegaErrore`, vuoto se non si sa
 */
export function provenienzaDelGiroFinito({ reindirizzamentoInVolo = false } = {}) {
  return reindirizzamentoInVolo ? { origine: ORIGINI.REINDIRIZZAMENTO } : {};
}

/**
 * Le parole con cui un fermo su richiesta arriva DAVVERO qui: l'italiano del motore
 * (`talosHarness.mjs`, «⛔ interrotto su richiesta: …») e l'inglese del browser
 * (`AbortController`, «This operation was aborted»). ⛔ Fin qui c'era solo la seconda metà.
 */
const FERMO_SU_RICHIESTA = /stopped on request|interrotto su richiesta|operation was aborted|AbortError|aborted by user|fermato dall'utente/i;

/**
 * ⛔⛔⛔ 13/09, IN REVISIONE — `comeFinita: 'fermato'` NON vuol dire «l'ha chiesto la persona».
 *
 * La prima stesura di questa cura si fidava del solo codice (`codice === 'fermato'` ⇒ fermo). Ma
 * il kernel produce quel codice in DUE punti, e solo uno è un fermo su richiesta:
 *   · `talosHarness.mjs` ≈9334 — `⛔ interrotto su richiesta[: <punto>].`, e quello sì;
 *   · `talosHarness.mjs` ≈1443 (`comeSonoFinitiIGiri`, ramo `haRisposto === false`) — «⛔ la
 *     generazione si e fermata senza risposta e senza esaurire i giri.», che NESSUNO ha chiesto:
 *     è il modello che ha chiuso il turno muto.
 * ⇒ MISURATO sul file curato, prima di stringere: quel guasto usciva come «Hai fermato il giro.»,
 *   e con un reindirizzamento in attesa come «Hai cambiato direzione.». È lo stesso difetto della
 *   carta rossa, solo capovolto: la colpa spostata su chi legge, invece che addosso a lui.
 */
/**
 * Vero quando il giro si è chiuso perché QUALCUNO l'ha chiesto: lo dicono le PAROLE del motore
 * (l'italiano di `talosHarness.mjs`, l'inglese dell'`AbortController`) — mai il codice da solo.
 *
 * ⛔ Il codice da solo basta in UN caso e uno solo: quando non ci sono parole affatto. È il fermo
 * del runtime locale — `session-registry.mjs` ≈2312/2322 chiude con `comeFinita: 'fermato'` e
 * NESSUN `detto`, perché il controller è stato annullato. Tenerlo è ciò che impedisce a questa
 * stretta di creare il falso negativo speculare (un fermo vero letto come guasto): togliere quel
 * pezzo fa diventare ROSSA la prova FERMATO-SENZA-PAROLE, provato.
 *
 * ⛔⛔ E l'esclusione del guasto di `comeSonoFinitiIGiri` è STRUTTURALE, non una lista nera: quel
 * testo semplicemente non dice le parole di un fermo, e le parole sono l'unica cosa di cui ci si
 * fida. Una prima stesura di questa revisione ci aveva messo davanti anche un rifiuto esplicito
 * (`if (/la generazione si e fermata.../) return false`): toltolo, NON cadeva nessuna prova — era
 * codice inerte con un commento che prometteva una guardia. Via, e la conoscenza resta qui scritta.
 *
 * ⛔ `testo` arriva come `${codice} ${messaggio}` (vedi `spiegaErrore`): il codice si toglie prima
 * di guardare le parole, altrimenti «non ci sono parole» non è mai vero.
 */
function eFermoSuRichiesta(testo, codice) {
  const intero = String(testo ?? '').trim();
  const cod = String(codice ?? '');
  const parole = cod && intero.startsWith(cod) ? intero.slice(cod.length).trim() : intero;
  return FERMO_SU_RICHIESTA.test(parole) || (codice === 'fermato' && parole === '');
}

/**
 * DOVE si è fermato, quando il motore lo dice — «mentre aspettavo la tua approvazione per "scrivi"».
 * ⛔ Solo la PRIMA riga: `esito.detto` porta la frase del fermo e SOTTO l'ultimo testo del modello
 * (il kernel le unisce con un a capo), e il punto fermo di quella coda non è il punto di fermata.
 * Null quando il motore non l'ha detto: mai una parentesi vuota a schermo.
 */
function puntoDiFermata(testo) {
  const primaRiga = String(testo ?? '').split('\n')[0];
  /* Due forme per sempre: l'inglese di oggi («stopped on request») e l'italiano delle sessioni salvate («interrotto su richiesta»). */
  const punto = /(?:stopped on request|interrotto su richiesta):\s*(.+?)\s*\.?\s*$/.exec(primaRiga)?.[1]?.trim();
  return punto ? puntoNellaLingua(punto) : null;
}

/**
 * Il punto di fermata, nella lingua dell'interfaccia. Il kernel lo scrive in inglese (è testo del motore); qui si riconosce la
 * forma e si sceglie la frase dal dizionario. Una forma che non si riconosce — l'italiano scritto da una sessione salvata, o un
 * punto nuovo che il kernel ancora non dichiarava — passa com'è: mai una parentesi che sparisce.
 */
const PUNTI_DI_FERMATA = [
  [/^while waiting for your approval for "(.+)"$/u, (m) => ['errori.turno.punto.approvazione', { nome: m[1] }]],
  [/^while "(.+)" was running$/u, (m) => ['errori.turno.punto.inCorso', { nome: m[1] }]],
  [/^before round (\d+)$/u, (m) => ['errori.turno.punto.primaDelGiro', { n: m[1] }]],
  [/^while the model was answering, at round (\d+)$/u, (m) => ['errori.turno.punto.rispostaDelModello', { n: m[1] }]],
  [/^while waiting to ask again after an empty answer, at round (\d+)$/u, (m) => ['errori.turno.punto.attesaDopoRispostaVuota', { n: m[1] }]],
  [/^during compaction, at round (\d+)$/u, (m) => ['errori.turno.punto.compattazione', { n: m[1] }]],
  [/^while working with the tools of round (\d+); (\d+) not run \((.+)\)$/u, (m) => ['errori.turno.punto.attrezziNonEseguiti', { n: m[1], quanti: m[2], elenco: m[3] }]],
  [/^while working with the tools of round (\d+)$/u, (m) => ['errori.turno.punto.attrezzi', { n: m[1] }]],
];
export function puntoNellaLingua(punto) {
  for (const [forma, chiave] of PUNTI_DI_FERMATA) {
    const m = forma.exec(punto);
    if (m) { const [k, valori] = chiave(m); return t(k, valori); }
  }
  return punto;
}

/**
 * Il grezzo della famiglia contesto: il codice tecnico NON si mostra a schermo (regola: niente nomi
 * tecnici nella UI) ma è quello che si incolla in una segnalazione, quindi entra nel dettaglio
 * richiuso — e non si duplica se il server l'aveva già scritto dentro il messaggio.
 */
function grezzoContesto(tecnico, codice) {
  const trovato = CODICE_CONTESTO.exec(String(codice ?? ''))?.[0];
  if (!trovato || tecnico.includes(trovato)) return tecnico;
  return tecnico ? `[${trovato}] ${tecnico}` : `[${trovato}]`;
}

/*
 * ⛔ K4b (07/10/2026) — i due messaggi del motore locale arrivano dal server in inglese a forma stabile (e in italiano dalle
 *   sessioni salvate prima): se ne estraggono i VALORI e la frase si scrive nella lingua di chi guarda. Se la forma non
 *   torna, resta il testo grezzo — mai una frase inventata.
 */
const gbNellaLingua = (s) => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n.toLocaleString(linguaCorrenteDiT() === 'it' ? 'it-IT' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(s);
};
function perchéArchitettura(testo) {
  const grezzo = String(testo).replace(/\bRUNTIME_ARCH_UNSUPPORTED\b\s*/u, '').trim();
  const architettura = /architecture "([^"]+)"/u.exec(grezzo)?.[1] ?? /architettura «([^»]+)»/u.exec(grezzo)?.[1];
  if (!architettura) return grezzo;
  const build = /llama\.cpp (b\d{3,6})/u.exec(grezzo)?.[1];
  const motore = build ? t('errori.turno.architetturaSconosciuta.motoreConBuild', { build }) : t('errori.turno.architetturaSconosciuta.motoreInstallato');
  return t('errori.turno.architetturaSconosciuta.perche', { architettura, motore });
}
function dettaglioMemoriaPiena(testo) {
  const grezzo = String(testo).replace(/\bRUNTIME_OUT_OF_MEMORY\b\s*/u, '').trim();
  if (!/does not fit in the graphics card memory|non entra nella memoria della scheda/u.test(grezzo)) return grezzo;
  const modelloGb = /^(?:The model|Il modello) \((\d+(?:[.,]\d+)?) GB\)/u.exec(grezzo)?.[1];
  /* Il nome si legge AVIDO dalla parentesi che segue «memory»/«scheda grafica» fino all'ultimo «: N GB, …»: i nomi veri hanno
     parentesi («AMD Radeon(TM) 780M Graphics», «Radeon 8060S Graphics (RADV GFX1151)»). Review del bugfixer, 07/10/2026. */
  const scheda = /(?:memory|scheda grafica) \((.+): (\d+(?:[.,]\d+)?) GB, (?:(\d+(?:[.,]\d+)?) GB free|liberi (\d+(?:[.,]\d+)?) GB)\)\.?$/u.exec(grezzo);
  return t('errori.turno.modelloNonEntra.dettaglio', {
    modello: modelloGb ? t('errori.turno.modelloNonEntra.parteModello', { gb: gbNellaLingua(modelloGb) }) : '',
    scheda: scheda ? t('errori.turno.modelloNonEntra.parteScheda', { nome: scheda[1].trim(), totale: gbNellaLingua(scheda[2]), liberi: gbNellaLingua(scheda[3] ?? scheda[4]) }) : '',
  });
}

/** Il codice tecnico e il messaggio grezzo, come li manda il server. */
const REGOLE = [
  ...[
    { codice: 'PROVIDER_BUDGET_OCCUPIED', id: 'budget-occupato', chiave: 'budgetOccupato', rimedi: ['rimedio1'] },
    { codice: 'PROVIDER_KEY_SPEND_LIMIT', id: 'limite-spesa-chiave', chiave: 'limiteSpesaChiave', rimedi: ['rimedio1', 'rimedio2'] },
    { codice: 'PROVIDER_REQUEST_BUDGET', id: 'richiesta-costosa', chiave: 'richiestaCostosa', rimedi: ['rimedio1', 'rimedio2'] },
    { codice: 'PROVIDER_CREDIT_LIMIT', id: 'credito-insufficiente', chiave: 'creditoInsufficiente', rimedi: ['rimedio1'] },
    { codice: 'PROVIDER_PAYMENT_REQUIRED', id: 'limite-spesa-sconosciuto', chiave: 'limiteSpesaSconosciuto', rimedi: ['rimedio1'] },
  ].map(({ codice, id, chiave, rimedi }) => ({
    id, famiglia: 'limite-fornitore', riconosce: (_testo, code) => code === codice,
    /* Le chiavi si compongono qui (`errori.turno.<chiave>.cosa|perche|rimedioN`): la prova `errori-chiavi` le controlla tutte. */
    spiega: tecnico => ({
      cosa: t(`errori.turno.${chiave}.cosa`),
      perche: t(`errori.turno.${chiave}.perche`),
      rimedi: rimedi.map((r) => t(`errori.turno.${chiave}.${r}`)),
      tecnico: tecnico.includes(codice) ? tecnico : `[${codice}]${tecnico ? ` ${tecnico}` : ''}`,
    }),
  })),
  /* Decisione 14, nota 2 del bugfixer (08/10/2026 notte): l'elenco degli esclusi copre TUTTI i fornitori del modello. Non è un
     limite del servizio (la famiglia sopra direbbe «Limite del servizio», falso): è una scelta della persona, e la carta dice dove
     si cambia. Il codice lo mette il server (`classificaTuttiEsclusiOpenRouter`) dal dato strutturato di OpenRouter. */
  {
    id: 'tutti-esclusi', riconosce: (_testo, code) => code === 'OPENROUTER_ALL_PROVIDERS_EXCLUDED',
    spiega: tecnico => ({
      cosa: t('errori.turno.tuttiEsclusi.cosa'),
      perche: t('errori.turno.tuttiEsclusi.perche'),
      rimedi: [t('errori.turno.tuttiEsclusi.rimedio1'), t('errori.turno.tuttiEsclusi.rimedio2')],
      tecnico: tecnico.includes('OPENROUTER_ALL_PROVIDERS_EXCLUDED') ? tecnico : `[OPENROUTER_ALL_PROVIDERS_EXCLUDED]${tecnico ? ` ${tecnico}` : ''}`,
    }),
  },
  {
    // RETRY05: il codice del backend prevale sulle parole del messaggio.
    // Un esito incerto non dimostra invio mancato, costo nullo o credenziale invalida.
    id: 'esito-fornitore-incerto',
    famiglia: 'esito-fornitore-incerto',
    riconosce: (_testo, codice) => codice === 'PROVIDER_OUTCOME_UNKNOWN',
    spiega: (tecnico, codice) => ({
      cosa: t('errori.turno.esitoIncerto.cosa'),
      perche: t('errori.turno.esitoIncerto.perche'),
      rimedi: [t('errori.turno.esitoIncerto.rimedio1')],
      tecnico: tecnico.includes(codice) ? tecnico : `[${codice}]${tecnico ? ` ${tecnico}` : ''}`,
    }),
  },
  {
    /* ⛔⭐ BUG-16 (05/10/2026): l'esito incerto che ha esaurito i SUOI reinvii automatici — il kernel
       ha già ritentato da solo (cap 10), reinvii fatti solo a zero effetti. La carta dice che il
       tentativo automatico è finito e resta «ripresa manuale», ultima spiaggia onesta. Stessa
       famiglia: il badge non cambia, è il TESTO a distinguere i due casi (piano BUG-16 §6). */
    id: 'esito-fornitore-incerto-esaurito',
    famiglia: 'esito-fornitore-incerto',
    riconosce: (_testo, codice) => codice === 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO',
    spiega: (tecnico, codice) => ({
      cosa: t('errori.turno.esitoIncertoEsaurito.cosa'),
      perche: t('errori.turno.esitoIncertoEsaurito.perche'),
      rimedi: [t('errori.turno.esitoIncertoEsaurito.rimedio1')],
      tecnico: tecnico.includes(codice) ? tecnico : `[${codice}]${tecnico ? ` ${tecnico}` : ''}`,
    }),
  },
  {
    /*
     * ⭐⭐⭐ CLI-REQ-03, metà A SCHERMO (17/09/2026) — LA CHIAVE CHE MANCA NON È UN GUASTO.
     *
     * Il primo giro ha curato il server: una chiave mancante non si travveste più da rifiuto del
     * fornitore e non scrive un consumo. Ma a schermo non cambiava NIENTE, e il revisore l'ha
     * misurato con un grep: `PROVIDER_KEY_MISSING` compariva zero volte in `frontend/src`. Chi
     * apriva TALOS leggeva la frase generica dello sconosciuto — «questa forma di errore non è
     * ancora tradotta» — davanti a una cosa che si risolve in dieci secondi.
     *
     * ⛔ È la prima regola dell'elenco perché è la sola che parla di una CONFIGURAZIONE e non di
     *   un guasto: la persona non deve riprovare, deve collegare una chiave.
     * ⛔ Il nome umano arriva dal server dentro il messaggio: qui non si mappa niente: la mappa
     *   dei nomi è una sola (`fonti-modelli.js`) e sta dall'altra parte del muro. Se un giorno il
     *   messaggio arrivasse senza nome, la frase resta vera e non inventa un fornitore.
     */
    id: 'chiave-fornitore-mancante',
    famiglia: 'chiave-fornitore',
    riconosce: (t) => /\bPROVIDER_KEY_MISSING\b/.test(t) || /Manca la chiave per\b/i.test(t) || /\bThe key for .+ is missing\b/i.test(t),
    spiega: (testo) => {
      /*
       * ⛔⛔ 17/09 — TROVATO IN UNA FOTO: la carta diceva «Manca la chiave per Z.». Il nome era
       *   «Z.AI», e un `[^.]+` si ferma al PRIMO punto — cioè proprio dentro il nome del
       *   fornitore che questa regola esiste per mostrare. Si prende tutto fino alla fine della
       *   riga e si toglie il punto finale, uno solo.
       */
      const nome = (/Manca la chiave per\s+(.+)$/im.exec(testo)?.[1] ?? /The key for\s+(.+?)\s+is missing\.?\s*$/im.exec(testo)?.[1])?.trim().replace(/\.$/u, '') || null;
      return {
        cosa: nome ? t('errori.turno.chiaveMancante.cosa', { nome }) : t('errori.turno.chiaveMancante.cosaSenzaNome'),
        perche: t('errori.turno.chiaveMancante.perche'),
        rimedi: [
          /* «per», non «di»: la stessa preposizione del messaggio del server (D18).
             ⛔ 23/09/2026 — l'ultimo passo si chiama come la scheda che si VEDE, «Provider»: «Fornitori e
             accessi» era il titolo del velo tolto per decisione owner (e, dentro il laboratorio, una
             testata nascosta). Il pulsante «Collega un modello» accanto porta proprio lì. */
          nome ? t('errori.turno.chiaveMancante.rimedio1', { nome }) : t('errori.turno.chiaveMancante.rimedio1SenzaNome'),
          t('errori.turno.chiaveMancante.rimedio2'),
        ],
        tecnico: testo,
      };
    },
  },
  {
    /*
     * ⛔⛔⛔ 25/09/2026 sera — sessione dell'owner 65d5683b (un GGUF locale, «ciao»): la carta diceva «Il fornitore non ha
     *   accettato la richiesta» e nessun fornitore era stato chiamato — il server non aveva il motore llama.cpp. Curato il
     *   server (`CONDIZIONI_PRIMA_DELLA_RETE`, `src/runtime-owner-adapter.mjs`), qui arriva `LOCAL_RUNTIME_NOT_CONFIGURED`.
     * ⛔ Come la chiave mancante, è una CONFIGURAZIONE e non un guasto: riprovare non serve. E un solo rimedio, quello che
     *   si può verificare: il progetto non documenta come si installa il motore, e la carta non lo inventa.
     */
    id: 'motore-locale-assente',
    riconosce: (t) => /\bLOCAL_RUNTIME_NOT_CONFIGURED\b/.test(t) || /motore locale non è configurato/i.test(t),
    spiega: () => ({
      cosa: t('errori.turno.motoreLocaleAssente.cosa'),
      perche: t('errori.turno.motoreLocaleAssente.perche'),
      rimedi: [t('errori.turno.motoreLocaleAssente.rimedio1')],
    }),
  },
  {
    /*
     * Caso 1 dei tre veri: il modello della sintesi ha risposto senza il testo del riassunto o senza
     * dire se l'aveva finito. Non c'è niente da verificare, quindi il contesto scarta — e non è un
     * guasto del compito che stavi chiedendo.
     */
    id: 'contesto-sintesi-invalida',
    famiglia: 'contesto',
    riconosce: (t) => /\bCTX_SUMMARY_RESPONSE_INVALID\b/.test(t) || /sintesi non dichiara testo e stato finale|risposta di sintesi non leggibile|summary does not declare text and final state|unreadable summary response/i.test(t),
    spiega: (testo, codice) => ({
      cosa: COSA_CONTESTO(),
      perche: t('errori.turno.contestoSintesiInvalida.perche', { originali: ORIGINALI_INTATTI() }),
      rimedi: rimediContesto(t('errori.turno.contestoSintesiInvalida.rimedio')),
      tecnico: grezzoContesto(testo, codice),
    }),
  },
  {
    /*
     * Caso 2: la verifica delle citazioni. È il controllo che impedisce a un riassunto di INVENTARE —
     * ogni fonte deve ritrovarsi alla lettera in un messaggio originale — e qui non ne è stata
     * ritrovata nessuna. Un rifiuto motivato, non un guasto: va detto come tale.
     */
    id: 'contesto-citazioni',
    famiglia: 'contesto',
    riconosce: (t) => /\bCTX_INVALID_SOURCE\b/.test(t) || /citazione corrisponde agli originali|non riporta fonti verificabili/i.test(t),
    spiega: (testo, codice) => ({
      cosa: COSA_CONTESTO(),
      perche: t('errori.turno.contestoCitazioni.perche', { originali: ORIGINALI_INTATTI() }),
      rimedi: rimediContesto(t('errori.turno.contestoCitazioni.rimedio')),
      tecnico: grezzoContesto(testo, codice),
    }),
  },
  {
    /*
     * Caso 3: la sintesi troncata. ⛔ È l'UNICO caso in cui il motore ritenta da solo, e ritenta UNA
     * volta sola, chiedendo un riassunto della metà (il `catch` che rilancia `once(true)` soltanto
     * per `CTX_TRUNCATED_SUMMARY`). Quando questa carta arriva, quel ritentativo è già stato speso:
     * prometterne un altro sarebbe una bugia.
     */
    id: 'contesto-sintesi-troncata',
    famiglia: 'contesto',
    riconosce: (t) => /\bCTX_TRUNCATED_SUMMARY\b/.test(t) || /sintesi non è stata completata|non ha lasciato spazio alla sintesi|left no room for the summary/i.test(t),
    spiega: (testo, codice) => {
      // il numero dei token di ragionamento sta dentro l'errore quando c'è: si usa, non si butta
      const ragionamento = Number((/(\d+)\s*(?:token nel ragionamento|tokens on reasoning)/i.exec(testo) || [])[1]) || null;
      const originali = ORIGINALI_INTATTI();
      return {
        cosa: COSA_CONTESTO(),
        perche: ragionamento
          ? t('errori.turno.contestoTroncata.percheRagionamento', { n: numeroLocale(ragionamento), originali })
          : t('errori.turno.contestoTroncata.perche', { originali }),
        rimedi: rimediContesto(t('errori.turno.contestoTroncata.rimedio')),
        tecnico: grezzoContesto(testo, codice),
      };
    },
  },
  {
    /*
     * Tutti gli altri guasti del motore del contesto. ⛔ Riconosce SOLO dal codice `CTX_*`: una frase
     * italiana qualsiasi non diventa un guasto del contesto per il fatto di essere italiana.
     * Il messaggio del motore è già scritto per una persona — è lo stesso che la modale mostra sotto
     * lo stato del lavoro — quindi si riporta com'è, invece di dire «forma non ancora tradotta» su
     * un testo che si legge benissimo.
     */
    id: 'contesto',
    famiglia: 'contesto',
    riconosce: (t) => CODICE_CONTESTO.test(t),
    spiega: (testo, codice) => {
      const detto = testo.replace(CODICE_CONTESTO, '').replace(/^[\s:—-]+/u, '').trim();
      const nellaLingua = messaggioDelKernelNellaLingua(detto); // revisione K3: il motore scrive in inglese
      const frase = nellaLingua ?? (detto ? (/[.!?…]$/u.test(detto) ? detto : `${detto}.`) : t('errori.turno.contestoGenerico.nessunaParola'));
      return {
        cosa: COSA_CONTESTO(),
        perche: t('errori.turno.contestoGenerico.perche', { frase, originali: ORIGINALI_INTATTI() }),
        rimedi: rimediContesto(''),
        tecnico: grezzoContesto(testo, codice),
      };
    },
  },
  {
    id: 'contesto-pieno',
    // 25/09 sera: anche il motore locale pieno, che sale col suo codice e i numeri in italiano (runtime-owner-adapter.mjs)
    riconosce: (t) => /exceed_context_size|exceeds the available context size|context (?:size|length) exceeded|\bLOCAL_CONTEXT_EXCEEDED\b/i.test(t),
    spiega: (testo) => {
      const numeri = /\((\d+)\s*tokens?\)[^(]*\((\d+)\s*tokens?\)/i.exec(testo) || [];
      const chiesti = Number(numeri[1]) || null;
      const finestra = Number(numeri[2]) || Number((/n_ctx"?\s*:\s*(\d+)/i.exec(testo) || [])[1]) || null;
      return {
        cosa: t('errori.turno.contestoPieno.cosa'),
        perche: chiesti && finestra
          ? t('errori.turno.contestoPieno.percheMisura', { chiesti: numeroLocale(chiesti), finestra: numeroLocale(finestra) })
          : t('errori.turno.contestoPieno.perche'),
        rimedi: [
          t('errori.turno.contestoPieno.rimedio1'),
          t('errori.turno.contestoPieno.rimedio2'),
          t('errori.turno.contestoPieno.rimedio3'),
        ],
      };
    },
  },
  {
    /*
     * ⛔⛔ 27/09/2026 — sessione dell'owner ec3bc6c0: Spark-X2.5-4B, architettura `spark2_5`, motore llama.cpp b10517 che non la
     *   conosce («unknown model architecture: 'spark2_5'», misurato a mano). La carta diceva «si è chiuso dopo 0 s … failed to load
     *   model»: vero e inutile. Ora il supervisore dà `RUNTIME_ARCH_UNSUPPORTED` col nome e la build (owner «errore chiaro ora»).
     *   Sta PRIMA delle regole su «failed to load model», che altrimenti la prenderebbero.
     */
    id: 'architettura-sconosciuta',
    /* ⛔ K4b (07/10/2026): il server la scrive in inglese («…which the installed engine (llama.cpp bNNNN) cannot read…»);
       la forma italiana resta per le sessioni salvate prima. Il perché si COMPONE dai valori, nella lingua di chi guarda. */
    riconosce: (t) => /\bRUNTIME_ARCH_UNSUPPORTED\b|non sa leggere:?|cannot read: a newer engine|unknown model architecture/i.test(t),
    spiega: (testo) => ({
      cosa: t('errori.turno.architetturaSconosciuta.cosa'),
      perche: perchéArchitettura(testo),
      rimedi: [
        t('errori.turno.architetturaSconosciuta.rimedio1'),
        t('errori.turno.architetturaSconosciuta.rimedio2'),
      ],
    }),
  },
  {
    /*
     * ⛔⛔⛔ 25/09/2026 sera — sessione dell'owner eb5acb34: Qwen3.8-27B Q4 (16,7 GB) su una scheda da 16 GB. La regola qui sotto
     *   riconosceva «failed to load model» e diceva «non si è acceso in tempo, riprova»: falso, la scheda non aveva spazio e
     *   riprovare non cambia niente. Ora il supervisore dà `RUNTIME_OUT_OF_MEMORY` coi numeri del motore (decisione owner «carta
     *   vera»), e questa regola sta PRIMA. Il rimedio è quello di Hermes (`physics_check`): una quantizzazione più piccola.
     */
    id: 'modello-non-entra',
    riconosce: (t) => /\bRUNTIME_OUT_OF_MEMORY\b|non entra nella memoria della scheda|does not fit in the graphics card memory/i.test(t),
    spiega: (testo) => ({
      cosa: t('errori.turno.modelloNonEntra.cosa'),
      perche: t('errori.turno.modelloNonEntra.perche', { dettaglio: dettaglioMemoriaPiena(testo) }),
      rimedi: [
        t('errori.turno.modelloNonEntra.rimedio1'),
        t('errori.turno.modelloNonEntra.rimedio2'),
      ],
    }),
  },
  {
    /*
     * ⛔ 06/9, trovato riaprendo una sessione VERA dell'owner (0363607d) per verificare la cura:
     * l'errore non era nessuno dei due che mi aveva mostrato, era un terzo — «llama-server non e'
     * diventato pronto entro 36 s (modello di 12 GB)». La nota lo diceva onestamente («questa forma
     * non e' ancora tradotta»), ed e' proprio il segnale che serviva una regola in piu'.
     */
    id: 'runtime-non-pronto',
    riconosce: (t) => /llama-server non è diventato pronto|non è diventato pronto entro|runtime non pronto|failed to load model/i.test(t),
    spiega: (testo) => {
      const secondi = (/entro (\d+)\s*s/i.exec(testo) || [])[1];
      const taglia = (/modello di ([^)]+)\)/i.exec(testo) || [])[1];
      const forma = `${taglia ? 'Taglia' : ''}${secondi ? 'Attesa' : ''}`;
      return {
        cosa: t('errori.turno.runtimeNonPronto.cosa'),
        perche: t(`errori.turno.runtimeNonPronto.perche${forma}`, { taglia, secondi }),
        rimedi: [
          t('errori.turno.runtimeNonPronto.rimedio1'),
          t('errori.turno.runtimeNonPronto.rimedio2'),
          t('errori.turno.runtimeNonPronto.rimedio3'),
        ],
      };
    },
  },
  {
    /*
     * ⛔⛔⛔ 13/09, con la sessione dell'owner in mano: REINDIRIZZARE produceva una carta ROSSA —
     * «Il giro si è interrotto per un errore… apri Doctor». Non era successo niente di male: aveva
     * solo cambiato direzione. Sotto ci sono DUE difetti distinti, non uno.
     *
     *  1. Il riconoscitore cercava SOLO parole INGLESI («operation was aborted»), mentre il motore
     *     scrive in ITALIANO: `talosHarness.mjs` (≈8986) chiude con `⛔ interrotto su richiesta:
     *     <punto>.` e `agent-service.mjs` (≈169) lo manda come `RunError` con `code: 'fermato'`.
     *     Le due stringhe non si incontravano ⇒ MISURATO prima di curare, sulle tre frasi vere del
     *     kernel: `id: 'sconosciuto'`, tono `danger`, rimedio «apri Doctor». La colpa a chi legge.
     *
     *  2. Un reindirizzamento non è NEMMENO un fermo. Ma il kernel produce la stessa identica frase
     *     nei due casi, perché `session-registry.mjs` chiama `voce.controller.abort()` SENZA
     *     argomenti sia in `ferma()` (≈5188) sia in `reindirizza()` (≈4952): dal messaggio i due
     *     comandi non si distinguono, e nessuno sforzo su questo file può inventare la differenza.
     *     ⇒ Serve la PROVENIENZA, e la porta chi il comando lo conosce (vedi `spiegaErrore`).
     *
     * ⛔ Questa regola chiede DUE cose INSIEME — provenienza «reindirizzamento» E un esito che sia
     * davvero un fermo su richiesta. Un `fetch failed` capitato mentre un reindirizzamento era in
     * attesa resta un errore di rete, rosso: un guasto vero non si traveste da cambio di direzione.
     *
     * Ricerca 13/09/2026, prima di scrivere:
     * - MDN, «AbortSignal: reason property» (letto 13/09/2026): il motivo dell'annullamento è un
     *   valore qualunque che si passa ad `abort()`, e «if not explicitly set in those methods, it
     *   defaults to "AbortError" DOMException» ⇒ la provenienza ESISTE alla sorgente ed è gratis;
     *   oggi viene buttata, e i due comandi arrivano qui indistinguibili.
     * - AG-UI, «Events» (docs.ag-ui.com/concepts/events, letto 13/09/2026): `RunError` «signals
     *   failure during execution» e porta SOLO `message` e `code` — mentre un giro interrotto ha
     *   il suo posto in `RunFinished` con `outcome: { type: "interrupt" }`. Far uscire un cambio
     *   di direzione come `RunError` è fuori contratto, non solo brutto da vedere. ⛔ Quella cura
     *   sta nel kernel e nel registro: non è questo file, ed è dichiarata come dipendenza.
     */
    id: 'reindirizzato',
    famiglia: 'reindirizzato',
    riconosce: (t, codice, origine) => origine === ORIGINI.REINDIRIZZAMENTO && eFermoSuRichiesta(t, codice),
    spiega: (testo) => {
      const punto = puntoDiFermata(testo);
      return {
        cosa: t('errori.turno.reindirizzato.cosa'),
        perche: punto ? t('errori.turno.reindirizzato.perchePunto', { punto }) : t('errori.turno.reindirizzato.perche'),
        /* ⛔ Nessun rimedio, perché non c'è niente da rimediare: il lavoro riparte da solo sulla nuova direzione. Suggerire qualcosa qui direbbe che è andata storta. */
        rimedi: [],
        tecnico: testo,
      };
    },
  },
  {
    /*
     * C3 tappa 4 (09/10/2026, review Y-4B-2 del bugfixer) — una delega IN PAUSA chiude il giro con «⏸ paused on request: …» e
     *   `code: 'in-pausa'` (talosHarness.mjs, `puntoDiPausa`): la carta diceva «TALOS · errore» in rosso. Non è un guasto né una
     *   fine: è una pausa chiesta (dalla persona o dal padre), e si riprende dal menu della delega. Prima della regola del fermo,
     *   che non la conosce.
     */
    id: 'in-pausa',
    famiglia: 'in-pausa',
    riconosce: (t, codice) => codice === 'in-pausa' || /paused on request|in pausa su richiesta/u.test(t),
    spiega: (testo) => {
      const punto = /(?:paused on request|in pausa su richiesta):\s*(.+?)\s*\.?\s*$/u.exec(String(testo ?? '').split('\n')[0])?.[1] ?? null;
      return {
        cosa: t('errori.turno.inPausa.cosa'),
        perche: punto ? t('errori.turno.inPausa.perchePunto', { punto: puntoNellaLingua(punto) }) : t('errori.turno.inPausa.perche'),
        rimedi: [t('errori.turno.inPausa.rimedio1')],
      };
    },
  },
  {
    /*
     * ⛔⛔ 06/9, prova T05-D2: premi «Ferma», ed esce una carta ROSSA con «[internal-error] This
     * operation was aborted». Fermare un giro non è un guasto: è una cosa che hai chiesto tu, e
     * l'unica notizia è che è successa. La carta resta (serve a dire che il giro è finito lì), ma
     * dice il vero e non chiede di riprovare come se fosse andato storto qualcosa.
     */
    id: 'fermato-da-te',
    famiglia: 'fermato',
    /* ⛔ 13/09: qui c'erano SOLO le parole inglesi — vedi la regola sopra. Il codice `fermato` e l'italiano del motore valgono quanto l'`AbortError` del browser. */
    riconosce: (t, codice) => eFermoSuRichiesta(t, codice),
    spiega: (testo) => {
      /* Il motore dice DOVE si è fermato: si usa, non si butta — è la differenza fra «fermato» e «fermato mentre aspettavo la tua approvazione per "scrivi"». */
      const punto = puntoDiFermata(testo);
      return {
        cosa: t('errori.turno.fermato.cosa'),
        perche: punto ? t('errori.turno.fermato.perchePunto', { punto }) : t('errori.turno.fermato.perche'),
        rimedi: [t('errori.turno.fermato.rimedio1')],
      };
    },
  },
  /*
   * ⛔⛔ 25/09/2026 notte (sessione vera `c15ba17c…`, Gemini 3.8; decisione owner «come Hermes, in piccolo») — la risposta vuota
   *   di un modello di RETE, dopo la scala del kernel (una spinta, due ritentativi): `PROVIDER_EMPTY_RESPONSE`, con il motivo
   *   del fornitore nella frase quando c'è. Prima arrivava come «La risposta del fornitore si è interrotta.» (falso) e la carta
   *   generica qui sotto, scritta per i modelli locali, non avrebbe detto il vero nemmeno riconoscendola.
   * ⛔ Il rimedio «a pezzi» compare SOLO col motivo `MALFORMED_FUNCTION_CALL`, la causa nota (googleapis/js-genai #1619:
   *   un file intero in un argomento): senza quel motivo non lo sappiamo, e non lo si dice.
   */
  {
    id: 'risposta-vuota-dopo-tentativi',
    riconosce: (t, codice) => codice === 'PROVIDER_EMPTY_RESPONSE' || /ha risposto senza testo né attrezzi|answered with neither text nor tools/u.test(t),
    spiega: (tecnico) => {
      const motivo = /(?:motivo del fornitore|provider reason): ([^)]+)\)/u.exec(tecnico)?.[1]?.trim() ?? null;
      const malformata = /MALFORMED_FUNCTION_CALL/u.test(motivo ?? '');
      return {
        cosa: t('errori.turno.rispostaVuotaDopoTentativi.cosa'),
        perche: motivo
          ? t(malformata ? 'errori.turno.rispostaVuotaDopoTentativi.percheMalformata' : 'errori.turno.rispostaVuotaDopoTentativi.perche', { motivo })
          : t('errori.turno.rispostaVuotaDopoTentativi.percheSenzaMotivo'),
        rimedi: [
          t('errori.turno.rispostaVuotaDopoTentativi.rimedio1'),
          ...(malformata ? [t('errori.turno.rispostaVuotaDopoTentativi.rimedioFileLungo')] : []),
          t('errori.turno.rispostaVuotaDopoTentativi.rimedioAltroModello'),
        ],
      };
    },
  },
  /*
   * ⛔ 04/10/2026, BUG-E (owner, sessione `3eb5e436…`): il kernel chiude il giro quando il modello
   *   chiede lo stesso attrezzo con gli stessi argomenti più volte di fila (`fermatoPerRipetizione`,
   *   `talosHarness.mjs`, esito `ripetizione`), e la carta cadeva nel sacco «sconosciuto» con la
   *   frase «non è ancora tradotta»: nessuna regola la riconosceva. Qui si riconosce NELLE DUE
   *   FORME — l'inglese attuale (K3) e l'italiano delle storie salvate prima di K3 (le copie in
   *   `desktop/.prove/` la mostrano parola per parola) — con i parametri veri (quante volte, quale
   *   attrezzo) e il rimedio giusto: NON «riprova il giro» così com'è, ma cambiare modello o
   *   spezzare il compito, perché la ripetizione del decoder si ripresenta.
   */
  {
    id: 'ripetizione-identica',
    riconosce: (t) => /(?:the model asked \d+ times for the very same thing|il modello ha chiesto \d+ volte la stessa identica cosa)/iu.test(t),
    spiega: (tecnico) => {
      const volte = /(?:asked|ha chiesto) (\d+) (?:times|volte)/iu.exec(tecnico)?.[1] ?? '—';
      const attrezzo = /"([^"]+)"\s+(?:with the same arguments|con gli stessi argomenti)/iu.exec(tecnico)?.[1] ?? null;
      return {
        cosa: t('errori.turno.ripetizione.cosa'),
        perche: t('errori.turno.ripetizione.perche', { n: volte, attrezzo: attrezzo ?? '—' }),
        rimedi: [
          t('errori.turno.ripetizione.rimedio1'),
          t('errori.turno.ripetizione.rimedio2'),
        ],
      };
    },
  },
  {
    id: 'risposta-vuota',
    /*
     * ⛔ 13/09, in revisione: qui finisce ANCHE «⛔ la generazione si e fermata senza risposta e
     *   senza esaurire i giri.» (`comeSonoFinitiIGiri`), che viaggia con `code: 'fermato'` e che
     *   la stretta qui sopra ha tolto dalla famiglia dei fermi. È esattamente questo caso — il
     *   turno chiuso senza una parola — quindi ha già la sua carta, con la sua diagnosi: senza
     *   questa riga sarebbe caduto nel sacco generico, col rimedio «apri Doctor».
     */
    riconosce: (t) => /flusso SSE senza contenuto|senza contenuto ne tool_calls|SSE stream with neither content nor tool_calls|empty (?:response|stream)|la generazione si (?:e|è) fermata senza risposta|generation stopped without an answer/i.test(t),
    spiega: () => ({
      cosa: t('errori.turno.rispostaVuota.cosa'),
      perche: t('errori.turno.rispostaVuota.perche'),
      rimedi: [
        t('errori.turno.rispostaVuota.rimedio1'),
        t('errori.turno.rispostaVuota.rimedio2'),
        t('errori.turno.rispostaVuota.rimedio3'),
      ],
    }),
  },
  {
    id: 'giri-esauriti',
    riconosce: (_testo, codice) => codice === 'giri-esauriti',
    spiega: () => ({
      cosa: t('errori.turno.giriEsauriti.cosa'),
      perche: t('errori.turno.giriEsauriti.perche'),
      rimedi: [
        t('errori.turno.giriEsauriti.rimedio1'),
        t('errori.turno.giriEsauriti.rimedio2'),
      ],
    }),
  },
  {
    id: 'senza-canale-approvazione',
    riconosce: (testo) => /canale di approvazione|approvazione non disponibile|approval channel/i.test(testo),
    spiega: () => ({
      cosa: t('errori.turno.senzaCanaleApprovazione.cosa'),
      perche: t('errori.turno.senzaCanaleApprovazione.perche'),
      rimedi: [t('errori.turno.senzaCanaleApprovazione.rimedio1')],
    }),
  },
  /*
   * ⛔⛔ 24/09/2026 sera, bug dell'owner con la foto (sessione `65bf2ef2…`, gemini-3.8-flash): la carta diceva «Questa forma
   *   di errore non è ancora tradotta» sopra la frase «Troppo traffico presso il fornitore.», che è GIÀ italiana. Il server
   *   scrive otto frasi pubbliche per i guasti del fornitore, tutte col codice `PROVIDER_REQUEST_ERROR`
   *   (`src/runtime-owner-adapter.mjs`, `erroreFornitorePubblico`), e nessuna regola qui le riconosceva: cercavano solo le
   *   forme inglesi. Le frasi si riconoscono per intero, perché sono un contratto nostro, non testo di terzi.
   */
  {
    id: 'risposta-interrotta',
    riconosce: (t) => /La risposta del fornitore si è interrotta|The provider response was cut off/u.test(t),
    spiega: () => ({
      cosa: t('errori.turno.rispostaInterrotta.cosa'),
      perche: t('errori.turno.rispostaInterrotta.perche'),
      rimedi: [t('errori.turno.comune.riprovaIlGiro'), t('errori.turno.comune.altroModelloOFornitore')],
    }),
  },
  {
    id: 'credenziale-rifiutata',
    riconosce: (testo) => /Credenziale (?:rifiutata|non accettata) dal fornitore|Credential (?:rejected|not accepted) (?:by|from) the provider/u.test(testo),
    spiega: () => ({
      cosa: t('errori.turno.credenzialeRifiutata.cosa'),
      perche: t('errori.turno.credenzialeRifiutata.perche'),
      rimedi: [t('errori.turno.credenzialeRifiutata.rimedio1')],
    }),
  },
  {
    id: 'fornitore-rifiuto',
    riconosce: (testo) => /Il fornitore non ha accettato la richiesta|The provider did not accept the request/u.test(testo),
    spiega: () => ({
      cosa: t('errori.turno.fornitoreRifiuto.cosa'),
      perche: t('errori.turno.fornitoreRifiuto.perche'),
      rimedi: [t('errori.turno.comune.riprovaIlGiro'), t('errori.turno.comune.altroModelloOFornitore')],
    }),
  },
  {
    id: 'rete',
    riconosce: (t) => /ECONNREFUSED|ETIMEDOUT|fetch failed|network error|socket hang up|Connessione con il fornitore interrotta|Il fornitore non risponde|Il fornitore ha superato il tempo massimo|Connection with the provider interrupted|The provider is not responding|The provider exceeded the maximum time/iu.test(t),
    spiega: () => ({
      cosa: t('errori.turno.rete.cosa'),
      perche: t('errori.turno.rete.perche'),
      rimedi: [t('errori.turno.rete.rimedio1'), t('errori.turno.rete.rimedio2')],
    }),
  },
  {
    id: 'quota',
    riconosce: (t) => /\b429\b|rate.?limit|quota|insufficient (?:credit|balance)|Troppo traffico presso il fornitore|Credito non disponibile presso il fornitore|Too much traffic at the provider|Credit not available at the provider/iu.test(t),
    spiega: () => ({
      cosa: t('errori.turno.quota.cosa'),
      perche: t('errori.turno.quota.perche'),
      rimedi: [t('errori.turno.quota.rimedio1'), t('errori.turno.quota.rimedio2')],
    }),
  },
];

/*
 * ⛔ 06/9, owner con lo screenshot: nel riquadro «Attività non riuscita» comparivano gli argomenti
 * grezzi della chiamata (`{"titolo":"GPT Tokenizer Interactive Demo","html":"<!doctype html>…`) e il
 * rifiuto del kernel in inglese: `REFUSED. Empty html: nothing was created.`
 * Il rifiuto NON è un errore: è il kernel che ha detto di no, e chi legge deve capire cosa è
 * mancato. Qui si traduce; il testo originale resta accanto, perché è quello che si incolla in una
 * segnalazione.
 */
/* `detto` è la CHIAVE del dizionario (si dice con `t()` quando serve, nella lingua di allora). */
const RIFIUTI = [
  { prova: /empty html|html vuoto/i, detto: 'errori.turno.rifiuto.htmlVuoto' },
  { prova: /cartella is required|folder is required/i, detto: 'errori.turno.rifiuto.cartellaMancante' },
  { prova: /must be different from your own/i, detto: 'errori.turno.rifiuto.cartellaUguale' },
  { prova: /must be a string/i, detto: 'errori.turno.rifiuto.nonTesto' },
  { prova: /no delegation channel|delegation is not configured/i, detto: 'errori.turno.rifiuto.senzaDelega' },
  { prova: /not configured on this harness|no generator|no saver/i, detto: 'errori.turno.rifiuto.nonConfigurata' },
  { prova: /non ha un canale di approvazione|approval channel/i, detto: 'errori.turno.rifiuto.senzaApprovazione' },
  { prova: /too large|troppo grande/i, detto: 'errori.turno.rifiuto.troppoGrande' },
];

/*
 * ⛔ H-05 (owner 02/10/2026, «Voglio il +1»): il kernel non dice più REFUSED per tutto. REFUSED resta a sicurezza e permessi;
 *   ciò che non c'è è NOT FOUND, un testo da sostituire che compare più volte è AMBIGUOUS, un argomento sbagliato è INVALID.
 *   Sono tutti un NO dichiarato dal kernel, e ognuno si spiega con le sue parole. (NO CHANGE non è un no: non si spiega qui.)
 */
const PAROLE_DEL_NO = Object.freeze([
  { parola: /^REFUSED\b\.?\s*/i, tipo: 'rifiuto', detto: 'errori.turno.no.rifiuto' },
  { parola: /^NOT FOUND\b\.?\s*/i, tipo: 'non-trovato', detto: 'errori.turno.no.nonTrovato' },
  { parola: /^AMBIGUOUS\b\.?\s*/i, tipo: 'ambiguo', detto: 'errori.turno.no.ambiguo' },
  { parola: /^INVALID\b\.?\s*/i, tipo: 'non-valido', detto: 'errori.turno.no.nonValido' },
]);

/**
 * Un esito che comincia con REFUSED, NOT FOUND, AMBIGUOUS o INVALID è un NO dichiarato dal kernel, non un guasto.
 * @returns {{rifiutato:boolean, tipo:string|null, detto:string, tecnico:string}}
 */
export function spiegaRifiutoAttrezzo(esito) {
  const testo = String(esito ?? '').trim();
  const no = PAROLE_DEL_NO.find((p) => p.parola.test(testo));
  if (!no) return { rifiutato: false, tipo: null, detto: '', tecnico: testo };
  const resto = testo.replace(no.parola, '');
  const trovato = RIFIUTI.find((r) => r.prova.test(resto));
  return {
    rifiutato: true,
    tipo: no.tipo,
    detto: t(trovato ? trovato.detto : no.detto),
    tecnico: testo,
  };
}

/**
 * Traduce l'errore di un giro. Torna sempre qualcosa: se non riconosciamo la forma, lo diciamo
 * invece di inventare una causa.
 * @param {string} messaggio il testo del server
 * @param {string} [codice] il codice del server (`internal-error`, `giri-esauriti`, …)
 * @param {{origine?:string}} [contesto] da dove viene l'evento: `ORIGINI.STOP`, `ORIGINI.REINDIRIZZAMENTO`.
 *   ⛔ È l'unico modo di distinguere «ho fermato» da «ho cambiato direzione»: il messaggio del motore
 *   è lo stesso nei due casi. Assente = provenienza ignota, e si dice così invece di indovinarla.
 * @returns {{id:string, cosa:string, perche:string, rimedi:string[], tecnico:string, riconosciuto:boolean, origine:string|null}}
 */
/*
 * ⛔ Revisione K3 (03/10/2026) — I MESSAGGI DEL KERNEL NELLA LINGUA DELL'INTERFACCIA. Con K3 il kernel e l'adattatore scrivono
 *   i loro errori in INGLESE (sono testo anche per la CLI e per i log). La carta d'errore del giro li mostrava così com'erano
 *   (ramo «sconosciuto», e il «perché» della famiglia del contesto): con l'interfaccia in italiano la persona avrebbe letto
 *   l'inglese dove prima leggeva l'italiano. Qui la voce del dizionario (`errori.kernel.*`: l'italiano è la frase di prima,
 *   identica; l'inglese è quella di K3), riconosciuta nelle DUE forme, perché le storie salvate sono italiane.
 *   Un messaggio che non è qui resta com'è: mai una chiave grezza.
 */
const MESSAGGI_DEL_KERNEL = [
  { chiave: 'errori.kernel.sseOltreLimite', re: /^(?:SSE event over the size limit\.|Evento SSE oltre il limite\.)$/u },
  { chiave: 'errori.kernel.sseJsonNonValido', re: /^(?:SSE event with invalid JSON\.|Evento SSE con JSON non valido\.)$/u },
  { chiave: 'errori.kernel.sseNonValido', re: /^(?:Invalid SSE event\.|Evento SSE non valido\.)$/u },
  { chiave: 'errori.kernel.flussoSenzaFine', re: /^(?:The provider's stream finished without a final event\.|Flusso del fornitore concluso senza un evento finale\.)$/u },
  { chiave: 'errori.kernel.motoreLocaleRifiuta', re: /^(?:The local engine did not accept this request, not even as a plain chat\.|Il motore locale non ha accettato questa richiesta, nemmeno senza gli attrezzi\.)$/u },
  { chiave: 'errori.kernel.rispostaInutilizzabile', re: /^(?:The provider did not return a usable response\.|Il fornitore non ha restituito una risposta utilizzabile\.)$/u },
  { chiave: 'errori.kernel.rispostaIncompleta', re: /^(?:The provider did not complete the response\.|Il fornitore non ha completato la risposta\.)$/u },
  { chiave: 'errori.kernel.inattivoOltreLimite', re: /^(?:OpenRouter stayed idle past the configured limit\.|OpenRouter è rimasto inattivo oltre il limite configurato\.)$/u },
  { chiave: 'errori.kernel.motoreLocaleScollegato', re: /^(?:The local engine is not connected to this server\.|Il motore locale non è collegato a questo server\.)$/u },
  { chiave: 'errori.kernel.richiestaInterrotta', re: /^(?:The request to the provider was interrupted\.|La richiesta al fornitore è stata interrotta\.)$/u },
  { chiave: 'errori.kernel.fornitoreIrraggiungibile', re: /^(?:The provider could not be reached\.|Non è stato possibile raggiungere il fornitore\.)$/u },
  { chiave: 'errori.kernel.credenzialeNonAccettata', re: /^(?:Credential not accepted by the provider\.|Credenziale non accettata dal fornitore\.)$/u },
  { chiave: 'errori.kernel.accessoNegatoCredenziale', re: /^(?:Access denied: check the permissions of the credential and of the model\.|Accesso negato: controlla i permessi della credenziale e del modello\.)$/u },
  { chiave: 'errori.kernel.modelloNonTrovato', re: /^(?:Model or address not found: check the provider configuration\.|Modello o indirizzo non trovato: controlla la configurazione del fornitore\.)$/u },
  { chiave: 'errori.kernel.troppoTraffico', re: /^(?:Too much traffic at the provider\.|Troppo traffico presso il fornitore\.)$/u },
  { chiave: 'errori.kernel.credenzialeRifiutata', re: /^(?:Credential rejected by the provider\.|Credenziale rifiutata dal fornitore\.)$/u },
  { chiave: 'errori.kernel.endpointAutenticazione', re: /^(?:The endpoint requires you to sign in: check the configured address and access\.|L'endpoint richiede autenticazione: verifica indirizzo e accesso configurati\.)$/u },
  { chiave: 'errori.kernel.accessoNegato', re: /^(?:Access denied by the provider or the model: check the permissions\.|Accesso negato dal fornitore o dal modello: verifica i permessi\.)$/u },
  { chiave: 'errori.kernel.creditoNonDisponibile', re: /^(?:Credit not available at the provider\.|Credito non disponibile presso il fornitore\.)$/u },
  { chiave: 'errori.kernel.connessioneInterrotta', re: /^(?:Connection with the provider interrupted\.|Connessione con il fornitore interrotta\.)$/u },
  { chiave: 'errori.kernel.tempoMassimo', re: /^(?:The provider exceeded the maximum time\.|Il fornitore ha superato il tempo massimo\.)$/u },
  { chiave: 'errori.kernel.nonRisponde', re: /^(?:The provider is not responding\.|Il fornitore non risponde\.)$/u },
  { chiave: 'errori.kernel.rispostaInterrotta', re: /^(?:The provider response was cut off\.|La risposta del fornitore si è interrotta\.)$/u },
  { chiave: 'errori.kernel.budgetOccupato', re: /^(?:The budget is temporarily taken by requests in progress or just finished\.|Il budget è temporaneamente occupato da richieste in corso o appena concluse\.)$/u },
  { chiave: 'errori.kernel.limiteChiave', re: /^(?:The spending limit of the key has been reached\.|Il limite di spesa della chiave è stato raggiunto\.)$/u },
  { chiave: 'errori.kernel.richiestaCostosa', re: /^(?:The estimated cost of the request exceeds the available budget\.|Il costo stimato della richiesta supera il budget disponibile\.)$/u },
  { chiave: 'errori.kernel.limiteNonSpecificato', re: /^(?:The service rejected the request because of an unspecified spending limit\.|Il servizio ha rifiutato la richiesta per un limite di spesa non specificato\.)$/u },
  { chiave: 'errori.kernel.richiestaNonAccettata', re: /^(?:The provider did not accept the request\.|Il fornitore non ha accettato la richiesta\.)$/u },
  { chiave: 'errori.kernel.fallbackNonCollegato', re: /^(?:To continue with another provider, access, chat notices and usage recording are needed\.|Per continuare con un altro fornitore occorrono accessi, avvisi in chat e registrazione dei consumi\.)$/u },
  { chiave: 'errori.kernel.chiamataGiaInCorso', re: /^(?:A call of this session is already in progress\.|Una chiamata di questa sessione è già in corso\.)$/u },
  { chiave: 'errori.kernel.runtimeNonConfigurato', re: /^(?:The agent runtime is not configured for this installation\.|Il runtime agente non è configurato per questa installazione\.)$/u },
  { chiave: 'errori.kernel.runtimeNonDisponibile', re: /^(?:The agent runtime is not available\. Check the server configuration\.|Il runtime agente non è disponibile\. Controlla la configurazione del server\.)$/u },
  { chiave: 'errori.kernel.motoreNonLeggeOutput', re: /^(?:The engine of this installation does not read retained outputs yet\.|Il motore di questa installazione non legge ancora gli output conservati\.)$/u },
  { chiave: 'errori.kernel.motoreNonConservaOutput', re: /^(?:The engine of this installation does not retain command outputs yet\.|Il motore di questa installazione non conserva ancora gli output dei comandi\.)$/u },
  { chiave: 'errori.kernel.motoreNonApplicaAmbiente', re: /^(?:The engine of this installation does not apply the command environment choice yet\.|Il motore di questa installazione non applica ancora la scelta dell’ambiente dei comandi\.)$/u },
  { chiave: 'errori.kernel.motoreNonApplicaBarriera', re: /^(?:The engine of this installation does not apply the barrier before changes yet\.|Il motore di questa installazione non applica ancora la barriera prima delle modifiche\.)$/u },
  { chiave: 'errori.kernel.inattivoPerSecondi', re: /^(?:OpenRouter sent no activity for|OpenRouter non ha inviato attività per) (\d+) (?:seconds|secondi)\.$/u, parametri: (m) => ({ secondi: m[1] }) },
  { chiave: 'errori.kernel.nessunaRispostaEntro', re: /^(?:The provider did not respond within|Il fornitore non ha risposto entro) (\d+) (?:seconds|secondi)\.$/u, parametri: (m) => ({ secondi: m[1] }) },
  { chiave: 'errori.kernel.rispostaHttp', re: /^(?:The provider answered|Il fornitore ha risposto) HTTP (\d+)\.$/u, parametri: (m) => ({ stato: m[1] }) },
  { chiave: 'errori.kernel.nonRispondeStato', re: /^(?:The provider is not responding \(status|Il fornitore non risponde \(stato) ([^)]+)\)\.\s*([\s\S]*)$/u, parametri: (m) => ({ stato: /^(?:unknown|sconosciuto)$/u.test(m[1]) ? t('errori.kernel.statoSconosciuto') : m[1], dettaglio: m[2] }) },
  { chiave: 'errori.kernel.finestraLocale', re: /^(?:The conversation|La conversazione)(?: \((\d+) tokens?\))? (?:does not fit in the local model’s window|non entra nella finestra del modello locale)(?: \((\d+) tokens?\))?\.$/u, parametri: (m) => ({ conversazione: m[1] ? t('errori.kernel.quantiToken', { n: m[1] }) : '', finestra: m[2] ? t('errori.kernel.quantiToken', { n: m[2] }) : '' }) },
];
/** Il messaggio del kernel nella lingua corrente, o `null` se non è uno di quelli noti. */
export function messaggioDelKernelNellaLingua(messaggio) {
  const testo = String(messaggio ?? '').trim();
  for (const voce of MESSAGGI_DEL_KERNEL) {
    const m = voce.re.exec(testo);
    if (m) return t(voce.chiave, voce.parametri ? voce.parametri(m) : undefined);
  }
  return null;
}

export function spiegaErrore(messaggio, codice = '', contesto = {}) {
  const tecnico = String(messaggio ?? '').trim();
  const testo = `${codice} ${tecnico}`;
  /*
   * ⛔ 13/09 — la PROVENIENZA, quando chi chiama la conosce: `ORIGINI.STOP`, `ORIGINI.REINDIRIZZAMENTO`.
   * Non si deduce dal messaggio (i due comandi ne producono uno solo, identico), e una provenienza
   * sconosciuta resta `null`: non si indovina.
   */
  const origine = typeof contesto?.origine === 'string' && contesto.origine ? contesto.origine : null;
  for (const regola of REGOLE) {
    if (!regola.riconosce(testo, codice, origine)) continue;
    /*
     * ⛔ 09/9: il codice arriva anche a `spiega`. Serve alla famiglia contesto, che deve poterlo
     * mettere nel GREZZO (dove va) senza mostrarlo a schermo — e per questo una regola può dettare
     * il proprio `tecnico` invece di ereditare il messaggio nudo.
     */
    const s = regola.spiega(tecnico, codice);
    return { id: regola.id, famiglia: regola.famiglia ?? null, origine, ...s, tecnico: s.tecnico ?? tecnico, riconosciuto: true };
  }
  return {
    id: 'sconosciuto',
    famiglia: null,
    origine,
    cosa: t('errori.turno.sconosciuto.cosa'),
    /* Revisione K3: un messaggio noto del kernel si dice nella lingua dell'interfaccia; uno ignoto resta sotto, com'è arrivato. */
    perche: messaggioDelKernelNellaLingua(tecnico) ?? t('errori.turno.sconosciuto.perche'),
    rimedi: [t('errori.turno.comune.riprovaIlGiro'), t('errori.turno.sconosciuto.rimedio2')],
    tecnico,
    riconosciuto: false,
  };
}

/*
 * ⛔ 09/9 — come si VESTE la carta. Prima questa scelta viveva in `legacy/app.js` come un confronto
 * a mano (`spiegazione?.id === 'fermato-da-te'`): ogni famiglia nuova voleva una riga in più là
 * dentro, lontana dalle regole che la producono. Ora la decide la famiglia, qui.
 *
 * ⛔ La compattazione fallita NON porta il rosso del guasto: NN/g, «Hostile Patterns in Error
 * Messages» (30/10/2022) — lo stile dell'errore non si usa per ciò che non è un errore di chi
 * legge. Il giro si è comunque fermato, e la carta lo dice nel testo; ma il colpo d'occhio deve
 * separare «il contesto non si è compattato» da «la tua richiesta è andata storta».
 */
/* `badge` e `titolo` sono CHIAVI del dizionario: `vestizioneErrore` le dice con `t()` nella lingua di quel momento. */
const VESTIZIONI = {
  'limite-fornitore': { badge: 'errori.turno.vestizione.limiteFornitore.badge', titolo: 'errori.turno.vestizione.limiteFornitore.titolo', tono: 'warning' },
  'esito-fornitore-incerto': { badge: 'errori.turno.vestizione.esitoIncerto.badge', titolo: 'errori.turno.vestizione.esitoIncerto.titolo', tono: 'warning' },
  fermato: { badge: 'errori.turno.vestizione.fermato.badge', titolo: 'errori.turno.vestizione.fermato.titolo', tono: 'accent' },
  // C3 tappa 4: la pausa di una delega, ambra come «In pausa» nell'elenco e nel dettaglio dell'agente
  'in-pausa': { badge: 'errori.turno.vestizione.inPausa.badge', titolo: 'errori.turno.vestizione.inPausa.titolo', tono: 'warning' },
  /*
   * ⛔ 13/09 — un cambio di direzione non è un guasto E non è nemmeno una notizia: il giro riparte
   * da solo, e la persona lo vede ripartire. `silenziosa` dice a chi disegna che questa nota non
   * va mostrata affatto — la famiglia decide anche QUESTO, accanto alle frasi, invece di lasciare
   * un ramo `if` nel disegnatore (è così che «fermato-da-te» era rimasto l'unica eccezione).
   * ⛔ 13/09, sera — CHI DISEGNA HA IMPARATO A LEGGERLO: `appendStatusNote` esce prima di creare
   * la nota, e non colora il tick. Serviva anche quello: con `isError` il disegnatore chiamava
   * `aggiornaTickGiro({tono:'danger'})`, quindi il rosso aveva DUE manifestazioni e zittirne una
   * sola avrebbe lasciato l'altra — la stessa meta'-cura che questa famiglia esiste per evitare.
   */
  reindirizzato: { badge: 'errori.turno.vestizione.reindirizzato.badge', titolo: 'errori.turno.vestizione.reindirizzato.titolo', tono: 'accent', silenziosa: true },
  contesto: { badge: 'errori.turno.vestizione.contesto.badge', titolo: 'errori.turno.vestizione.contesto.titolo', tono: 'warning' },
};
const VESTIZIONE_ERRORE = { badge: 'errori.turno.vestizione.errore.badge', titolo: 'errori.turno.vestizione.errore.titolo', tono: 'danger' };

/**
 * Badge, titolo e tono della nota che mostra una spiegazione.
 * @param {{famiglia?:string|null}|null} spiegazione l'esito di `spiegaErrore`
 * @returns {{badge:string, titolo:string, tono:string}}
 */
export function vestizioneErrore(spiegazione) {
  const { badge, titolo, ...resto } = VESTIZIONI[spiegazione?.famiglia] ?? VESTIZIONE_ERRORE;
  return { badge: t(badge), titolo: t(titolo), ...resto };
}

/**
 * Il tono del tick del giro, preso dalla STESSA vestizione della carta.
 *
 * ⛔⛔ 13/09 sera — misurato dal DOM sul pacchetto servito: dopo uno stop chiesto dalla persona la
 *   carta diceva «Fermato» col tono d'accento, e il tick del giro era `--danger`. Il disegnatore
 *   colorava di rosso OGNI nota con `isError`, qualunque cosa dicesse la carta: la stessa bugia
 *   doppia curata la sera stessa per il reindirizzamento, rimasta sulla famiglia «fermato».
 * ⇒ Il tick segue la carta. Conosce quattro toni (`current`, `info`, `warning`, `danger`); l'accento
 *   non c'e' perche' un tick SENZA tono e' gia' l'accento (`--visibile` usa `--talos-accent`), cioe'
 *   lo stesso colore del badge «Fermato».
 * ⛔ Chi non riconosce la vestizione torna ROSSO, non muto: un guasto non si zittisce perche' manca
 *   un oggetto. Una guardia che non sa valutare deve negare, non tacere.
 * @param {{tono?:string}|null|undefined} vestizione l'esito di `vestizioneErrore`
 * @returns {'danger'|'warning'|'info'|null}
 */
export function tonoDelTick(vestizione) {
  const tono = vestizione?.tono;
  if (tono === 'accent') return null;
  if (tono === 'danger' || tono === 'warning' || tono === 'info') return tono;
  return 'danger';
}

/** La stessa spiegazione in una riga sola, per i posti stretti (elenco sessioni, riepiloghi). */
export function erroreInUnaRiga(messaggio, codice = '') {
  const s = spiegaErrore(messaggio, codice);
  return s.cosa;
}

/*
 * ⛔⛔ 03/10/2026 — GLI ERRORI DEL SERVER, DETTI NELLA LINGUA DELLA PERSONA (decisione owner «L'interfaccia, dal codice»).
 *
 * Il server manda un codice stabile e una frase INGLESE (`message`, `title`, `explanation`, `action`), più `params` se la frase
 * ha dei valori. Qui si sceglie il testo dal CODICE: `errori.<CODICE>.<parte>` nel dizionario (area `errori`).
 *
 * ⛔ Il dizionario sostituisce le parole del server SOLO quando quelle sono la forma standard che il dizionario traduce: la
 * frase inglese del server deve coincidere (dopo aver messo i `params`) con l'inglese della voce. Così:
 *   · una spiegazione che il server ha scritto apposta per il caso (il motivo vero di una sessione che non può ripartire,
 *     `SESSION_NOT_READY`) resta quella del server invece di essere coperta da quella generica;
 *   · lo stesso codice con due copie diverse (`QUERY_INVALID` nelle rotte generali e in quelle del contesto) trova la sua:
 *     la voce vale se è la SUA frase inglese a essere arrivata;
 *   · un server più nuovo del dizionario, o con una parola cambiata, mostra l'inglese del server — mai una chiave grezza e mai
 *     un'altra frase al posto di quella che il server ha detto. Una prova (`errori-del-server-nel-dizionario.test.mjs`)
 *     tiene l'inglese del server e quello del dizionario uguali, parola per parola.
 * Ripiego: le parole del server. Se non ne ha mandate, la voce del codice (se c'è) nella lingua corrente.
 */
const PARTI_DEL_PROBLEMA = Object.freeze(['message', 'title', 'explanation', 'action']);
/* I codici che il cliente fabbrica da sé (nessun server li manda): i loro messaggi sono voci del dizionario come le altre. */
const MESSAGGI_DEL_CLIENTE = Object.freeze(['LOCAL_REQUEST_FAILED', 'LOCAL_RESPONSE_INVALID']);

function chiaviCandidate(codice, parte) {
  const chiavi = [`errori.${codice}.${parte}`, `errori.contesto.${codice}.${parte}`];
  if (parte === 'message') return [...chiavi, ...MESSAGGI_DEL_CLIENTE.map((c) => `errori.${c}.message`)];
  /* Un codice senza copia sua riceve dal server quella di INTERNAL_ERROR; una rotta del contesto senza copia sua, quella predefinita. */
  return [...chiavi, `errori.contestoPredefinita.${parte}`, `errori.INTERNAL_ERROR.${parte}`];
}

/*
 * ⛔⛔ K2 (03/10/2026) — I MOTIVI. Un rifiuto del registro delle sessioni porta, oltre al `code`, un `reason` (kebab-case,
 * inglese: `session-running`, `compaction-in-progress`…) che distingue le frasi dello STESSO codice, e `params` coi valori.
 * La voce del dizionario è `errori.<CODICE>.<motivo_con_trattini_bassi>` (la forma delle chiavi, `FORMA_DELLA_CHIAVE`, non
 * ammette il trattino): `errori.SESSION_NOT_READY.compaction_in_progress`.
 *   · Se il problema porta un `reason`, si prova per prima la SUA voce.
 *   · Se non lo porta (un cliente che non lo copia: oggi `publicProblem` in `api-client.ts` lo scarta) o la sua voce manca, si
 *     provano tutte le voci dei motivi di quel codice: il confronto con la frase inglese del server resta il cancello, quindi
 *     nessuna frase ne copre un'altra. Se nessuna coincide, restano le parole del server — mai una chiave grezza.
 */
const SUFFISSI_DELLE_PARTI = new Set(PARTI_DEL_PROBLEMA);
const indiceDeiMotivi = new Map();

function chiaveDelMotivo(codice, motivo) { return `errori.${codice}.${String(motivo).replace(/-/g, '_')}`; }

function chiaviDeiMotivi(codice, motivo) {
  let tutte = indiceDeiMotivi.get(codice);
  if (!tutte) {
    const prefisso = `errori.${codice}.`;
    tutte = Object.keys(TESTI.en).filter((k) => k.startsWith(prefisso) && !k.slice(prefisso.length).includes('.') && !SUFFISSI_DELLE_PARTI.has(k.slice(prefisso.length)));
    indiceDeiMotivi.set(codice, tutte);
  }
  if (!motivo) return tutte;
  const sua = chiaveDelMotivo(codice, motivo);
  return [sua, ...tutte.filter((k) => k !== sua)];
}

/**
 * Il testo di un errore del server nella lingua corrente.
 * @param {{code?:string, message?:string, title?:string, explanation?:string, action?:string, params?:Record<string, string|number>, problem?:object}|null|undefined} errore
 *   un `ApiError` (porta il problema in `.problem`), il `problem` stesso o la busta `error` della risposta
 * @returns {{message:string, title:string, explanation:string, action:string}} mai una chiave grezza; stringa vuota se non c'è niente da dire
 * @example
 *   const { message } = testoErroreServer(errore); // «Query non valida» / «Invalid query», secondo la lingua
 */
export function testoErroreServer(errore) {
  const problema = errore && typeof errore.problem === 'object' && errore.problem ? errore.problem : (errore || {});
  const codice = String(problema.code ?? errore?.code ?? '');
  const params = problema.params && typeof problema.params === 'object' ? problema.params : undefined;
  const motivo = typeof (problema.reason ?? errore?.reason) === 'string' ? String(problema.reason ?? errore.reason) : '';
  const fuori = {};
  for (const parte of PARTI_DEL_PROBLEMA) {
    const server = String((parte === 'message' ? (problema.message ?? errore?.message) : problema[parte]) ?? '').trim();
    const propria = codice ? chiaviCandidate(codice, parte) : [];
    /* ⛔ Le voci dei MOTIVI (K2) entrano solo nel confronto con le parole del server, mai come ripiego: una frase di un motivo
       non è il `title` né l'`action` del codice. */
    const candidate = codice ? [...chiaviDeiMotivi(codice, motivo), ...propria] : [];
    let testo = null;
    if (server) {
      const chiave = candidate.find((k) => TESTI.en[k] !== undefined && interpola(TESTI.en[k], params) === server);
      testo = chiave ? t(chiave, params) : server;
    } else {
      const primaPropria = propria[0];
      testo = primaPropria && TESTI.en[primaPropria] !== undefined ? t(primaPropria, params) : '';
    }
    fuori[parte] = testo;
  }
  return fuori;
}
