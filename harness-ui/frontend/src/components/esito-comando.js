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
  if (l === 'wsl2') return 'in Linux (WSL), non su Windows';
  if (l === 'none') return 'su Windows, senza isolamento';
  if (l === 'adb-shell-on-device') return 'sul telefono collegato';
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
  const verdetto = fermato
    ? 'Fermato: ha superato il tempo massimo'
    : riuscito ? 'Riuscito' : `Non riuscito · codice ${uscita}`;
  return { uscita, riuscito, fermato, dove: dovEGirato(livello), livello, output, verdetto };
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
