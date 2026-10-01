/*
 * ⛔⛔⛔ PO-06 (10/09/2026) — L'ESITO DI UN COMANDO, DETTO A UNA PERSONA.
 *
 * Il kernel consegna l'esito di un comando come UNA stringa, che comincia così:
 *     exit 0 [sandbox: wsl2]
 *     ciao
 * Fino a oggi quella riga finiva a schermo tal quale. Sono tre cose sbagliate insieme:
 *  1. «exit», «sandbox», «wsl2» sono nomi tecnici in un'interfaccia in italiano — l'owner li ha
 *     vietati esplicitamente il 04/09 («mai `web_search`, `tool_create` a schermo»);
 *  2. ⛔ `sandbox: wsl2` è un'informazione GRAVE travestita da dettaglio: quel comando NON è girato
 *     su Windows, è girato dentro Linux. Misurato il 10/09/2026 sulla macchina dell'owner: `!npm
 *     --version` risponde `11.16.0`, che è l'npm di Linux, non quello installato su Windows. Chi
 *     scrive un comando crede di parlare alla propria macchina: se non è così, si dice.
 *  3. `exit null` esce quando il comando è stato fermato allo scadere del tempo massimo (120 s), e
 *     arriva con esito «riuscito» e testo vuoto — cioè indistinguibile da un comando andato bene e
 *     muto. È una bugia, e va detta per quello che è.
 *
 * RICERCA 10/09/2026, prima di scrivere:
 *  · Anthropic, «Week 26 · June 22-26, 2026» (v2.1.186) e «Interactive mode»: la shell mode «shows
 *    real-time progress and output» e «adds the command and its output to the conversation context».
 *  · deepseek-harness #5584 e anthropics/claude-code #33265 (richieste aperte sullo streaming in
 *    pannello di chat), che sullo stato finale concordano: il blocco dell'output si CHIUDE con
 *    «execution status, exit code, and elapsed time» — i tre dati, dichiarati, non un testo grezzo.
 *  · Nushell, «Stdout, Stderr, and Exit Codes» e Boot.dev sui flussi POSIX: un comando può scrivere
 *    cose utili su stdout con uscita ≠ 0 e su stderr con uscita 0 ⇒ l'output aggregato si MOSTRA
 *    sempre per intero, e a portare il verdetto è il codice d'uscita, mai la presenza di testo.
 *
 * ⛔ Nessuna di queste funzioni tocca il DOM: sono pure, e hanno le loro prove.
 */

/** L'intestazione che il kernel antepone all'output. Il codice può mancare (`null`): vedi sotto. */
const INTESTAZIONE = /^exit (-?\d+|null)(?: \[sandbox: ([^\]]*)\])?\n?/u;

/**
 * Dove è girato davvero il comando, detto a una persona.
 * ⛔ Un livello che non conosciamo NON si traduce a caso: si restituisce `null` e chi disegna
 *   non scrive niente, invece di inventare un posto.
 */
export function dovEGirato(livello) {
  const l = String(livello ?? '').trim();
  /*
   * ⛔⛔ IL KERNEL SCRIVE UN'ETICHETTA, NON UN LIVELLO — e questa funzione confrontava il livello
   *   ESATTO. Misurato il 20/09/2026 (revisore avversario, poi rifatto da me in node):
   *     `etichettaSandbox('none')` → `none (cmd.exe nativo: stesso utente e stessi privilegi…)`
   *     `etichettaSandbox('wsl2')` → `wsl2 (namespace Linux: filesystem e processi separati)`
   *   ⇒ `l === 'none'` non è mai vero, e **`dovEGirato` restituiva `null` per tutte e tre le forme
   *     vere**: il «dove» non è arrivato a schermo da quando esiste `etichettaSandbox`, cioè dalla
   *     cura del BLOCCO 6 — la stessa che ha reso l'etichetta esplicativa. Una cura che rompe il
   *     lettore di un'altra.
   *   ⛔ E la conseguenza era grossa: PO-06 esiste per dire che «quel comando NON è girato su Windows,
   *     è girato dentro Linux… chi scrive un comando crede di parlare alla propria macchina: se non è
   *     così, si dice». Quella frase era **inerte**.
   *   ⇒ Si legge il livello **prima della parentesi**, che è la forma vera; e resta `null` per un
   *     livello che non conosciamo, invece di inventare un posto.
   */
  const nome = l.split('(')[0].trim();
  if (nome === 'wsl2') {
    /* ⛔ F009 (owner 01/10/2026, «esito e foglio della shell») — l'etichetta dice con che utente: si porta a schermo, perché
       «come root» è proprio ciò che la persona deve sapere. Le etichette di prima (senza utente) restano lette com'erano. */
    const utente = /\(Linux in WSL come ([a-z_][a-z0-9_-]{0,31}\$?);/iu.exec(l)?.[1];
    if (utente) return `in Linux (WSL) come ${utente}, non su Windows`;
    if (/\(Linux in WSL con un utente non verificato;/u.test(l)) return 'in Linux (WSL), con un utente non verificato';
    return 'in Linux (WSL), non su Windows';
  }
  if (nome === 'none') return 'su Windows, senza isolamento';
  if (nome === 'adb-shell-on-device') return 'sul telefono collegato';
  return null;
}

/**
 * Legge l'esito grezzo del kernel e ne ricava le parti che servono a disegnarlo.
 *
 * @param {string} grezzo
 * @returns {{uscita:number|null, riuscito:boolean, fermato:boolean, dove:string|null,
 *            livello:string|null, output:string, verdetto:string}}
 */
export function leggiEsitoComando(grezzo) {
  const testo = String(grezzo ?? '');
  const trovato = INTESTAZIONE.exec(testo);
  if (!trovato) {
    /* Nessuna intestazione: non è un esito di comando — si restituisce tutto come output, mai un
       verdetto inventato su un testo che non abbiamo capito. */
    return { uscita: null, riuscito: false, fermato: false, dove: null, livello: null, output: testo, verdetto: '' };
  }
  const uscita = trovato[1] === 'null' ? null : Number(trovato[1]);
  const livello = trovato[2] ? trovato[2].trim() : null;
  const output = testo.slice(trovato[0].length);
  /*
   * ⛔ `exit null` = fermato allo scadere del tempo massimo (misurato il 10/09: `sleep 300` torna
   *   dopo 120.082 ms con codice `null` e testo vuoto). Il kernel lo annuncia come RIUSCITO: è la
   *   bugia peggiore dell'intera catena, perché un comando fermato a metà sembra uno finito bene.
   *   Qui non si può ripararla alla fonte (il kernel è di un'altra lane), ma si può smettere di
   *   ripeterla.
   */
  const fermato = uscita === null;
  const riuscito = uscita === 0;
  /*
   * ⛔⛔ LA CAUSA NON SI INVENTA — 20/09/2026, trovato dal revisore avversario e riverificato da me
   *   alle righe del kernel.
   *   Qui c'era `'Fermato: ha superato il tempo massimo'`. È **falsa su una delle due strade**: sulla
   *   strada Windows il kernel NORMALIZZA i suoi esiti prima di scriverli —
   *   `talosHarness.mjs:4867`, `codiceFinale = fermatoSuRichiesta ? USCITA_FERMATO_SU_RICHIESTA :
   *   fermatoDalTempo ? 124 : codice` — quindi un codice **nullo** da quella strada non può essere il
   *   tempo massimo: è un `close(code = null)`, cioè un processo **ucciso da un segnale**. La riga
   *   avrebbe detto «ha superato il tempo massimo» su un comando ammazzato.
   *   ⇒ Si dice il fatto che sappiamo — **non ha restituito un codice** — e non la causa, che da qui
   *     non si può distinguere. Se un domani il kernel dichiarerà la causa nel testo, si tornerà a
   *     nominarla: `TALOS` la sa, questa funzione no.
   */
  const verdetto = fermato
    ? 'Fermato: il comando non ha restituito un codice d\'uscita'
    : riuscito ? 'Riuscito' : `Non riuscito · codice ${uscita}`;
  return { uscita, riuscito, fermato, dove: dovEGirato(livello), livello, output, verdetto };
}

/**
 * La riga d'esito da MOSTRARE sotto il blocco di un comando, o `null` quando non dice niente.
 *
 * ⛔ «SI DICHIARA L'ECCEZIONE, NON LA REGOLA» — owner 20/09/2026, «applica la quarta strada»,
 *   decisa dalla 5×5×5×5 in `.claude/RICERCA-5x5x5x5-RIGA-ESITO-2026-09-20.md`. Tre fonti dicono la
 *   stessa cosa: Hermes mostra il codice **solo** se `failed && exitCode !== 0`
 *   (`status-row.tsx:143`, letto il 20/09) e nel suo codice scrive che un codice ≠ 0 da solo è un
 *   **segnale debole** (`grep` esce 1 quando non trova); Claude Code dichiara `(unsandboxed)` **solo
 *   quando il sandbox non si applica**; MCP tiene `isError` per i soli errori di esecuzione.
 *   ⇒ Un esito RIUSCITO non si scrive: non aggiunge niente che la riga dell'attrezzo non dica già,
 *     e timbrato su ogni comando rende invisibile proprio il caso che conta.
 *
 * ⛔ E QUANDO SI SCRIVE, SI SCRIVE NELLE PAROLE DI CASA: `exit 1` e `[sandbox: none]` sono **nomi
 *   tecnici**, vietati a schermo dal 04/09 (è la ragione per cui esiste `dovEGirato`). Il verdetto e
 *   il posto sono già detti da `verdetto` e `dove`: qui si mettono insieme, e basta.
 *
 * ⛔⛔ E VALE SOLO PER UN **COMANDO** — chi chiama lo deve sapere, perché dal testo non si distingue.
 *   La testata la scrive il kernel, ma la scrive per `shell` e `prova`; l'esito di un `leggi` è il
 *   **contenuto grezzo del file**, e un file che comincia con `exit 1` è indistinguibile da un esito.
 *   Il testimone affidabile è il **nome dell'attrezzo**, e sta al chiamante: questa funzione non può
 *   indovinarlo. (Difetto misurato il 20/09/2026: su un `leggi` toglieva la prima riga del file e
 *   dichiarava un verdetto di comando su una lettura, col pallino della riga che diceva il contrario.)
 *
 * ⛔ Passa dal CONTRATTO, non da una regex nuova: `(-?\d+|null)` è la forma vera — `exit null` esce
 *   quando il comando è stato fermato dal tempo massimo e `exit -1` è un codice negativo legittimo.
 *   Una quarta regola più stretta delle altre due (`qui` e `talosHarness.test.mjs`) perdeva
 *   esattamente quei due casi, e con essi l'unica riga che li dichiarava.
 */
export function rigaEsitoDaMostrare(grezzo) {
  const esito = leggiEsitoComando(grezzo);
  if (!esito.verdetto || esito.riuscito) return null;
  return rigaDiStatoComando(esito);
}

/**
 * Il testo dell'esito SENZA l'intestazione del kernel — riuscito o no.
 * ⛔ Una regola sola per il blocco: se la riga dell'esito si mostra a parte, il testo non la porta
 *   più dentro, altrimenti lo stesso comando si legge in due modi a seconda del ramo che lo disegna.
 */
export function senzaIntestazione(grezzo) {
  return leggiEsitoComando(grezzo).output;
}

/**
 * La riga di stato da mettere sotto l'output: verdetto, dove è girato, quanto ci ha messo.
 * ⛔ `millisecondi` si scrive solo se lo sappiamo davvero: un tempo assente non diventa «0 ms»
 *   (stesso difetto già pagato oggi con la dimensione di un allegato, dove `Number(null)` faceva
 *   comparire «0 byte» al posto di un dato mancante).
 */
export function rigaDiStatoComando(esito, millisecondi = null) {
  const parti = [esito.verdetto];
  if (esito.dove) parti.push(esito.dove);
  if (typeof millisecondi === 'number' && Number.isFinite(millisecondi) && millisecondi >= 0) {
    parti.push(millisecondi < 1000 ? `${Math.round(millisecondi)} ms` : `${(millisecondi / 1000).toFixed(1)} s`);
  }
  return parti.filter(Boolean).join(' · ');
}

/*
 * ⛔⛔ L'ESITO DI UN ATTREZZO CHE DICHIARA DI ESSERE FALLITO — 26/09/2026, difetto (11) delle foto del 25/09 (giro vero
 *   GLM sul 4174): una proposta di workflow RESPINTA dal server appariva nella conversazione identica a una riuscita.
 *   Il kernel scrive `workflow_plan_propose failed [WORKFLOW_DEFINITION_INVALID]: …` (`talosHarness.mjs:10646-10651`), e la
 *   regola della chat riconosceva solo gli esiti che COMINCIANO con `REFUSED.`/`ERROR`/`FAILED`. Misurato nel kernel: 37
 *   esiti hanno la forma `<attrezzo> failed…` (note, attività, memoria, libreria, ricerche, Officina, domanda, piano, proposta),
 *   più due con un nome diverso da quello dell'attrezzo: `search failed` (`web_search`) e `delegation failed`
 *   (`delega_sottotask`). Tutti arrivavano a schermo col pallino verde.
 * ⭐ Hermes decide sui CAMPI (`isError`, `success:false`, `ok:false`, chiavi d'errore: `lib/tool-result-summary.ts:375-381`,
 *   clone `65ad529` del 23/09): il nostro `ToolCallResult` non ha un campo d'errore (`agui-events.mjs`), e l'esito è una
 *   stringa. ⇒ Si legge il CONTRATTO del kernel, stretto: il nome dell'attrezzo (o il suo alias), ` failed`, un codice
 *   facoltativo fra parentesi quadre, i due punti. Un file letto che PARLA di un fallimento non è una lettura fallita.
 * ⛔ Una regola sola per chat e pannello della figlia (`conversazione-figlia.js`, `esitoDaContenuto`).
 */
const ALIAS_ESITO_FALLITO = Object.freeze({ web_search: ['search'], delega_sottotask: ['delegation'] });
const INIZIO_FALLITO = /^(?:REFUSED\.|ERROR\b|ERRORE\b|FAILED\b|FALLITO\b|NON RIUSCITO\b)/i;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Vero se l'esito testuale di un attrezzo (non `shell`, non `prova`: hanno il loro contratto) dichiara un fallimento.
 * @param {string} nome l'id tecnico dell'attrezzo
 * @param {string} testo l'esito grezzo
 */
export function esitoDichiaraFallimento(nome, testo) {
  const t = String(testo ?? '').trim();
  if (INIZIO_FALLITO.test(t)) return true;
  const nomi = [String(nome ?? ''), ...(ALIAS_ESITO_FALLITO[nome] ?? [])].filter(Boolean);
  return nomi.some((n) => new RegExp(`^${escapeRegex(n)} failed(?: \\[[A-Z0-9_]+\\])?:`, 'u').test(t));
}

/*
 * ⭐ 27/09/2026, decisione owner 47 — UNA DOMANDA DEL MODELLO RESPINTA PER LA FORMA NON È UN GUASTO. Nella sessione 56066b64
 *   glm-5.3-flash ha mandato `ask_user_question` due volte in una forma che il contratto rifiuta (`why` mancante, poi un campo
 *   in più), e al terzo tentativo la domanda è arrivata: l'owner ha visto due errori rossi per una cosa che il modello aveva
 *   corretto da solo. L'esito `ask_user_question failed [QUERY_INVALID]: …` (`talosHarness.mjs`, porta del modello) si
 *   mostra come riga DISCRETA con il motivo in parole; il testo del kernel resta nel dettaglio, per le segnalazioni.
 * ⇒ Qui si riconosce il caso e si traduce il motivo del contratto (`src/user-question-contract.mjs`) in una frase breve.
 *   Solo `QUERY_INVALID`: `QUESTION_ALREADY_PENDING` e gli altri restano quello che sono.
 * @returns {null | { frase: string, parametri?: object }} la frase è una chiave di traduzione (italiano), o null
 */
export function motivoDomandaDaCorreggere(nome, testo) {
  if (nome !== 'ask_user_question') return null;
  const m = /^ask_user_question failed \[QUERY_INVALID\]:\s*(.*)$/su.exec(String(testo ?? '').trim());
  if (!m) return null;
  const motivo = m[1];
  if (/\.why è obbligatorio/u.test(motivo)) return { frase: 'mancava il perché' };
  let n = /options deve contenere da (\d+) a (\d+) opzioni/u.exec(motivo);
  if (n) return { frase: 'servono da {min} a {max} opzioni', parametri: { min: Number(n[1]), max: Number(n[2]) } };
  n = /questions deve contenere da (\d+) a (\d+) domande/u.exec(motivo);
  if (n) return { frase: 'servono da {min} a {max} domande', parametri: { min: Number(n[1]), max: Number(n[2]) } };
  if (/opzioni duplicate/u.test(motivo)) return { frase: 'c’erano scelte doppie' };
  if (/id domanda duplicato/u.test(motivo)) return { frase: 'c’erano domande doppie' };
  if (/supera il limite/u.test(motivo)) return { frase: 'un testo era troppo lungo' };
  return { frase: 'la forma non era valida' };
}
