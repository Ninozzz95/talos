/*
 * Cancello unico — classe 4: TESTO GREZZO A SCHERMO.
 *
 * ⛔ Il difetto vero da cui nasce, 06/9: nel riquadro «Attività non riuscita» comparivano gli
 * argomenti grezzi della chiamata — `{"titolo":"...","html":"<!doctype html>...` — e sotto il
 * rifiuto del kernel **in inglese**, «REFUSED. Empty html: nothing was created.». Nessun errore da
 * nessuna parte: la app funzionava. Semplicemente mostrava a una persona il suo diario interno.
 * Era lì da giorni e nessun test lo guardava, perché un test guarda i dati, non ciò che si legge.
 *
 * Queste funzioni sono PURE per un motivo preciso: chi raccoglie il testo (un browser, un dump del
 * DOM) è la parte fragile e lenta. Separata la raccolta dal giudizio, il giudizio si prova a costo
 * zero e AL CONTRARIO — che è l'unico modo in cui un cancello resta vivo invece di essere inerte.
 *
 * Ricerca 06/09/2026, e ha cambiato due scelte che avrei fatto a occhio:
 * · jwarby/i18n-lint e levkorsy/i18n-lint: la difesa dai falsi positivi sui nomi propri non è
 *   l'euristica, è una **lista di ammessi** dichiarata (`["API","OAuth","GitHub"]`). ⇒ qui la lista
 *   dell'inglese è POSITIVA (si segnala solo ciò che vi è scritto dentro), non negativa: una parola
 *   sconosciuta è innocente. È la scelta che costa qualche difetto non visto e zero falsi allarmi,
 *   e il contratto del cancello dice «zero falsi positivi tollerati».
 * · Brevetto USPTO 10929277, «Detecting hard-coded strings in source code»: le stringhe che non
 *   passano un controllo di ortografia si scartano, perché una cosa scritta male difficilmente è
 *   rivolta a una persona. ⇒ qui diventa `eIdentificatore()`: un pezzo con cifre, `_`, punti o una
 *   gobba camelCase NON è una parola inglese da tradurre — è un nome di cosa, e lo giudica un'altra
 *   regola. È così che `glm-5.3-flash`, `z-ai` e `web_search` non finiscono mai fra gli anglicismi.
 * · rakiabensassi, «The JSON Bleed»: il grezzo si riconosce da **firme di prefisso** note (oggetto
 *   annidato, campi con virgolette scappate, testo con un ruolo davanti), non provando a fare il
 *   parse — un frammento troncato come quello del difetto vero non è JSON valido, e un parser lo
 *   assolverebbe proprio nel caso in cui fa più danno.
 */

/**
 * Le parole inglesi che in una interfaccia italiana sono un difetto, non un prestito.
 * ⛔ Deliberatamente NON contiene: `file`, `email`, `link`, `web`, `server`, `browser`, `computer`,
 *    `chat`, `test`, `ok`, `no`, `online`, `password`. Sono parole dell'italiano parlato: metterle
 *    qui riempirebbe il rapporto di accuse a testo CORRETTO, e un rapporto che grida al lupo smette
 *    di essere letto — è il modo in cui muore un cancello, non un'ipotesi.
 * ⛔ E non contiene `new`, `open`, `start`: troppo vicine a nomi propri e a marchi.
 */
export const PAROLE_INGLESI_PREDEFINITE = Object.freeze([
  'loading', 'settings', 'cancel', 'submit', 'close', 'delete', 'save', 'search',
  'retry', 'failed', 'failure', 'success', 'warning', 'send', 'back', 'next',
  'previous', 'done', 'edit', 'copy', 'paste', 'undo', 'redo', 'refresh', 'reload',
  'username', 'enabled', 'disabled', 'running', 'pending', 'completed', 'cancelled',
  'canceled', 'error', 'errors', 'unknown', 'empty', 'created', 'updated', 'deleted',
  'request', 'response', 'please', 'wait', 'forbidden', 'unauthorized', 'timeout',
  'yesterday', 'today', 'tomorrow', 'nothing', 'something', 'wrong', 'sorry',
]);

/** Le frasi: alcune si vedono solo intere, e a parole sciolte non le prenderebbe nessuna lista. */
export const FRASI_INGLESI_PREDEFINITE = Object.freeze([
  'something went wrong', 'try again', 'no results found', 'not found', 'sign in',
  'sign out', 'log in', 'log out', 'read more', 'show more', 'learn more',
  'coming soon', 'select an option', 'no data', 'internal server error',
]);

/**
 * Le firme del JSON. ⛔ Nessun `JSON.parse`: il difetto vero era **troncato**
 * (`{"titolo":"...","html":"<!doctype html>...`) e un parser lo direbbe innocente proprio quando fa
 * più danno — un frammento a metà è la forma tipica del grezzo che scappa da un contenitore.
 */
const FIRME_JSON = Object.freeze([
  // `{"chiave":` oppure `,"chiave":` oppure `[{"chiave":` — la firma del difetto vero.
  // ⛔ Dopo i due punti si pretende l'inizio di un VALORE JSON. Senza questo pezzo la frase
  //    italiana «ha risposto: "sì", "no": tutto qui» diventava un difetto — provata e bocciata.
  { nome: 'oggetto serializzato', re: /[{[,]\s*"[^"\n]{1,80}"\s*:\s*(?:"|\{|\[|-?\d|true\b|false\b|null\b)/ },
  // Un frammento che comincia direttamente dalla chiave, perché il contenitore l'ha tagliato prima.
  { nome: 'frammento di oggetto', re: /^\s*"[^"\n]{1,80}"\s*:\s*["[{\d-]/ },
  // Virgolette scappate: un oggetto già serializzato DENTRO un altro. Non capita mai in prosa.
  { nome: 'JSON dentro JSON', re: /\\"[^"\n]{0,80}\\"\s*:/ },
]);

/**
 * I valori che una persona non deve mai leggere, e che compaiono quando un dato manca: non sono
 * JSON, ma sono la stessa malattia — un'interfaccia che stampa la sua variabile invece del testo.
 * ⛔ Si confrontano con il testo INTERO ripulito, mai contenuti: «nullità» contiene `null`, e
 *    «Nan» è un cognome. Un confronto per contenimento qui produrrebbe accuse a testo giusto.
 */
const VALORI_CRUDI = Object.freeze(['[object object]', 'undefined', 'null', 'nan', '[object promise]']);

/**
 * Le firme di un messaggio del kernel non tradotto.
 * ⛔ `\bError\b\s*:` e non `Error:` e basta: l'italiano «Errore:» comincia con le stesse cinque
 *    lettere, e senza il confine di parola questo cancello accuserebbe ogni messaggio CORRETTO
 *    della app. È il primo falso positivo che ho scritto e tolto, ed è provato al contrario.
 */
const FIRME_ERRORE = Object.freeze([
  { nome: 'rifiuto del kernel non tradotto', re: /\bREFUSED\b/ },
  { nome: 'errore in inglese', re: /\b(?:[A-Z][A-Za-z]*)?Error\b\s*:/ },
  { nome: 'eccezione non catturata', re: /\b(?:Uncaught|Unhandled|Exception in thread)\b/ },
  { nome: 'traccia di pila', re: /\bat\s+[\w$.<>[\]]+\s*\([^)\n]*:\d+:\d+\)/ },
  { nome: 'traccia di pila Python', re: /Traceback \(most recent call last\)/ },
  { nome: 'codice errno di sistema', re: /\bE(?:NOENT|ACCES|PERM|CONNREFUSED|CONNRESET|ADDRINUSE|PIPE|TIMEDOUT|ISDIR|NOTDIR|EXIST|MFILE|NOTEMPTY|AGAIN)\b/ },
  { nome: 'eccezione della piattaforma', re: /\b(?:java|kotlin|android|com|org)\.[\w.]*Exception\b/ },
]);

/** Il testo pronto per i confronti: minuscolo di là, qui solo spazi normalizzati e bordi tagliati. */
function normalizza(testo) {
  return String(testo ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Un pezzo che NON è una parola di lingua ma un nome di cosa: cifre, `_`, punti, barre, chiocciole,
 * una gobba camelCase, o un trattino che unisce sigle troppo corte per essere parole (`z-ai`).
 * ⛔ È la regola che salva i nomi dei modelli (`glm-5.3-flash`, `qwen3.7-flash`) e i nomi propri
 *    tecnici dall'accusa di anglicismo. Senza, ogni riga della barra di stato sarebbe «inglese».
 */
function eIdentificatore(pezzo) {
  if (pezzo.length < 3) return true;
  if (/[\d_./\\@$]/.test(pezzo)) return true;
  if (/[a-z][A-Z]/.test(pezzo)) return true;
  if (pezzo.includes('-')) return pezzo.split('-').some((p) => p.length < 3 || /\d/.test(p));
  return false;
}

/** Le parole candidate a essere inglese: già scartati gli identificatori e le sigle. */
function paroleDi(testo) {
  return String(testo ?? '')
    .split(/[^\p{L}\p{N}_$@./\\-]+/u)
    .filter(Boolean)
    .filter((p) => !eIdentificatore(p))
    .map((p) => p.toLowerCase());
}

/** Dove comincia la prima firma di grezzo, o null. Serve all'estratto: un rapporto dice DOVE. */
function primaFirma(testo, firme) {
  const s = String(testo ?? '');
  for (const firma of firme) {
    const m = s.match(firma.re);
    if (m) return { indice: m.index ?? 0, nome: firma.nome, trovato: m[0] };
  }
  return null;
}

/** Un pezzo di testo intorno al punto colpevole: un rapporto che dice «c'è del JSON» non è usabile. */
function estrattoIntorno(testo, indice, ampiezza = 56) {
  const s = String(testo ?? '');
  const da = Math.max(0, (indice > 0 ? indice : 0) - Math.floor(ampiezza / 4));
  const a = Math.min(s.length, da + ampiezza);
  return `${da > 0 ? '…' : ''}${s.slice(da, a)}${a < s.length ? '…' : ''}`;
}

/** Il valore crudo si riconosce sul testo intero, non dentro una frase (vedi `VALORI_CRUDI`). */
function eValoreCrudo(pulito) {
  const basso = pulito.toLowerCase();
  return VALORI_CRUDI.includes(basso) || basso.includes('[object object]');
}

/** C'è dentro un oggetto serializzato, o un valore interno stampato al posto del testo? */
export function sembraJson(testo) {
  const pulito = normalizza(testo);
  if (!pulito) return false;
  if (eValoreCrudo(pulito)) return true;
  return primaFirma(pulito, FIRME_JSON) !== null;
}

/** C'è dentro un messaggio del kernel, un errno o una traccia di pila mai tradotti? */
export function sembraErroreGrezzo(testo) {
  const pulito = normalizza(testo);
  if (!pulito) return false;
  return primaFirma(pulito, FIRME_ERRORE) !== null;
}

/**
 * Le parole inglesi trovate. Lista POSITIVA per scelta (vedi la ricerca in testa): ciò che non è
 * dichiarato non viene accusato.
 * @param {string} testo
 * @param {{parole?:string[], frasi?:string[], consentite?:string[]}} [opzioni]
 *   `consentite` è l'ammissione dichiarata dei nomi propri, nella forma che usa i18n-lint.
 * @returns {string[]} in ordine — prima le frasi, poi le parole — senza ripetizioni
 */
export function paroleIngleseTrovate(testo, opzioni = {}) {
  const pulito = normalizza(testo);
  if (!pulito) return [];
  const consentite = new Set((opzioni.consentite ?? []).map((p) => String(p).toLowerCase()));
  const vocabolario = new Set((opzioni.parole ?? PAROLE_INGLESI_PREDEFINITE).map((p) => String(p).toLowerCase()));
  const frasi = (opzioni.frasi ?? FRASI_INGLESI_PREDEFINITE).map((f) => String(f).toLowerCase());
  const trovate = [];
  // Le frasi si cercano su un testo senza punteggiatura e con le sentinelle ai bordi, così
  // «Try again.» e «try again» sono la stessa cosa e «retry again» non diventa «try again».
  const disteso = ` ${pulito.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  for (const frase of frasi) {
    if (consentite.has(frase)) continue;
    if (disteso.includes(` ${frase} `)) trovate.push(frase);
  }
  for (const parola of paroleDi(pulito)) {
    if (consentite.has(parola) || !vocabolario.has(parola)) continue;
    // Una parola già dentro una frase segnalata non si conta due volte: sarebbe la stessa accusa.
    if (trovate.some((t) => t.includes(' ') && t.split(' ').includes(parola))) continue;
    if (!trovate.includes(parola)) trovate.push(parola);
  }
  return trovate;
}

/** Scorciatoia booleana, per chi vuole solo sapere se c'è dell'inglese. */
export function sembraInglese(testo, opzioni = {}) {
  return paroleIngleseTrovate(testo, opzioni).length > 0;
}

/**
 * I nomi tecnici degli attrezzi trovati nel testo.
 * ⛔ La lista arriva da FUORI e non si scrive qui dentro: gli attrezzi del kernel nascono e muoiono,
 *    e una lista incisa dentro un cancello diventa falsa il giorno dopo senza che nessuno lo sappia.
 * ⛔ Confronto a confine di identificatore, non `includes`: `web_search` non deve accusare una
 *    parola che lo contiene, e un nome breve non deve accusare mezza interfaccia.
 */
export function nomiTecniciTrovati(testo, nomiTecnici = []) {
  const s = String(testo ?? '');
  if (!s) return [];
  const basso = s.toLowerCase();
  const trovati = [];
  for (const nome of nomiTecnici ?? []) {
    const n = String(nome ?? '').trim();
    if (!n) continue;
    // ⛔ Si scorrono TUTTE le occorrenze, non solo la prima. Con `indexOf` da solo, un
    //    `web_search_v2` all'inizio della riga faceva rinunciare al `web_search` isolato che
    //    veniva dopo: la guardia contro il falso positivo creava un falso NEGATIVO, che è il
    //    modo in cui un cancello smette di mordere senza che nessuno se ne accorga.
    for (let i = basso.indexOf(n.toLowerCase()); i >= 0; i = basso.indexOf(n.toLowerCase(), i + 1)) {
      const prima = s[i - 1] ?? '';
      const dopo = s[i + n.length] ?? '';
      if (/[\p{L}\p{N}_]/u.test(prima) || /[\p{L}\p{N}_]/u.test(dopo)) continue;
      if (!trovati.includes(n)) trovati.push(n);
      break;
    }
  }
  return trovati;
}

/**
 * Un elemento è esente per costruzione se mostra codice di proposito, oppure se dichiara di essere
 * il dettaglio tecnico secondario.
 * ⛔ La regola dell'owner vieta che un nome tecnico sia l'ETICHETTA PRINCIPALE, non che esista: un
 *    riquadro «dettagli» che mostra `web_search` accanto a «Ricerca sul web» è ciò che vogliamo,
 *    non un difetto. Chi raccoglie lo dichiara — con `dettaglioTecnico:true` sull'elemento o con un
 *    pezzo di selettore in `selettoriDettaglio` — perché è lui che ha visto la pagina, non noi.
 * @returns {string|null} il perché dell'esenzione, così il rapporto può dirlo invece di tacere
 */
export function esenzioneDi(elemento, selettoriDettaglio = []) {
  if (elemento?.dentroCodice === true) return 'mostra codice di proposito';
  if (elemento?.dettaglioTecnico === true) return 'dettaglio tecnico dichiarato';
  const sel = String(elemento?.selettore ?? '');
  for (const pezzo of selettoriDettaglio) {
    if (pezzo && sel.includes(pezzo)) return `dettaglio tecnico dichiarato (${pezzo})`;
  }
  return null;
}

/**
 * Il cancello della classe 4.
 * @param {Array<{selettore:string, testo:string, dentroCodice?:boolean, dettaglioTecnico?:boolean}>} visibili
 *   il testo che una persona legge davvero, raccolto altrove (browser, dump del DOM).
 * @param {{nomiTecnici?:string[], parole?:string[], frasi?:string[], consentite?:string[], selettoriDettaglio?:string[]}} [opzioni]
 * @returns {Array<{classe:string, tipo:string, selettore:string, gravita:string, cosa:string, estratto:string}>}
 *   una riga per difetto, azionabile: dove, cosa, quanto pesa.
 */
export function testoGrezzo(visibili, opzioni = {}) {
  const lista = Array.isArray(visibili) ? visibili : [];
  const nomiTecnici = opzioni.nomiTecnici ?? [];
  const selettoriDettaglio = opzioni.selettoriDettaglio ?? [];
  const difetti = [];
  for (const elemento of lista) {
    // ⛔ Tutto si misura sul testo NORMALIZZATO, indice compreso: prendere l'indice da una stringa e
    //    l'estratto da un'altra darebbe un rapporto che punta al posto sbagliato — e un rapporto che
    //    punta al posto sbagliato si smette di credergli alla seconda volta.
    const pulito = normalizza(elemento?.testo);
    if (!pulito) continue;
    if (esenzioneDi(elemento, selettoriDettaglio)) continue;
    const selettore = String(elemento?.selettore ?? '(senza selettore)');

    const crudo = eValoreCrudo(pulito);
    const firmaJson = crudo ? null : primaFirma(pulito, FIRME_JSON);
    if (crudo || firmaJson) {
      difetti.push({
        classe: 'testo-grezzo',
        tipo: 'json',
        selettore,
        gravita: 'alta',
        cosa: crudo ? 'valore interno stampato al posto del testo' : `JSON a schermo (${firmaJson.nome})`,
        estratto: estrattoIntorno(pulito, firmaJson ? firmaJson.indice : 0),
      });
    }

    const firmaErrore = primaFirma(pulito, FIRME_ERRORE);
    if (firmaErrore) {
      difetti.push({
        classe: 'testo-grezzo',
        tipo: 'errore',
        selettore,
        gravita: 'alta',
        cosa: `messaggio non tradotto (${firmaErrore.nome})`,
        estratto: estrattoIntorno(pulito, firmaErrore.indice),
      });
    }

    const tecnici = nomiTecniciTrovati(pulito, nomiTecnici);
    if (tecnici.length) {
      difetti.push({
        classe: 'testo-grezzo',
        tipo: 'nome-tecnico',
        selettore,
        gravita: 'alta',
        cosa: `nome tecnico a schermo: ${tecnici.join(', ')}`,
        estratto: estrattoIntorno(pulito, pulito.toLowerCase().indexOf(tecnici[0].toLowerCase())),
      });
    }

    // ⛔ L'inglese si cerca SOLO in un testo che non è già stato accusato di essere grezzo: un JSON
    //    o una traccia di pila sono pieni di parole inglesi, e segnalarli anche come «inglese»
    //    raddoppierebbe il rapporto senza aggiungere niente. Un difetto, una riga.
    if (!crudo && !firmaJson && !firmaErrore) {
      const parole = paroleIngleseTrovate(pulito, opzioni);
      if (parole.length) {
        difetti.push({
          classe: 'testo-grezzo',
          tipo: 'inglese',
          selettore,
          gravita: 'media',
          cosa: `parole inglesi in una interfaccia italiana: ${parole.join(', ')}`,
          estratto: estrattoIntorno(pulito, 0, 80),
        });
      }
    }
  }
  return difetti;
}
