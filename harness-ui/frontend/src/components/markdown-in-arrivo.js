/*
 * ⭐⭐⭐ 22/10/2026 — IL MARKDOWN CHE STA ARRIVANDO: dove si può tagliare, fin dove si può mostrare, e come si disegna a metà.
 *
 * Owner, 22/10/2026: «voglio un'animazione estremamente veloce, ottimizzata, ma fluida e dinamica in base al testo dell'output».
 * Un ritmo a velocità costante (`ritmo-streaming.js`) mostra il testo un carattere alla volta: senza questo modulo farebbe vedere
 * la SINTASSI a metà — un `#` da solo prima che diventi titolo, un `**` prima che diventi grassetto, mezza intestazione di
 * tabella come testo con le barre, l'indirizzo di un collegamento che scorre lettera per lettera. Tre pezzi, tutti PURI (niente
 * DOM, provati in `tests/unit/markdown-in-arrivo.test.mjs`):
 *
 *   1. `avanzaScansione` — i CONFINI STABILI, trovati una riga alla volta e ricordati (prima `confineBlocchiStabili` rifaceva
 *      `split('\n')` di TUTTO il testo a ogni fotogramma: O(n) per fotogramma, O(n²) sulla risposta). Oltre alla riga vuota,
 *      chiude un blocco anche PRIMA di un recinto ``` e DOPO la sua chiusura, prima e dopo un titolo o un separatore, e prima di
 *      un'intestazione di tabella: così la coda ri-disegnata a ogni fotogramma è il blocco che sta crescendo, non tutto ciò che
 *      è venuto dopo l'ultima riga vuota (un recinto da 300 righe era tutto «coda»). Ogni taglio è uno in cui il renderer
 *      (`components/markdown.js`) chiude comunque il blocco precedente, quindi i due pezzi danno lo STESSO DOM del tutto-insieme
 *      — la stessa garanzia del 02/09, provata a ogni prefisso in `streaming-fluido.spec.mjs`.
 *   2. `confineDiRivelazione` — il punto fino a cui il ritmo può mostrare: mai a metà di un grafema (emoji composte, accenti
 *      combinati: `Intl.Segmenter`), mai a metà di un segno di blocco (`## `, `- `, `1. `, `> `), la riga del recinto e la riga
 *      di separazione intere, l'intestazione di una tabella insieme alla sua riga di separazione (prima di quella riga il testo
 *      non è ancora una tabella: si vedrebbe un paragrafo con le barre che poi diventa tabella), l'indirizzo di un collegamento in
 *      un colpo (non si vede: non deve costare tempo). Le righe di DATI di una tabella invece crescono cella per cella:
 *      trattenerle intere come fa Codex TUI (`streaming/table_holdback.rs`) qui, misurato il 22/10/2026 sul giro vero, dava pause
 *      fino a 366 ms e un ritardo di 397 ms, oltre il tetto dichiarato del ritmo. La tabella cresce sul posto
 *      (`aggiornaCodaSulPosto` in `legacy/app.js`: righe aggiunte in fondo, ridisegnata solo quella in corso); una colonna può
 *      ancora allargarsi mentre la sua cella più lunga arriva, ed è il prezzo dichiarato di questa scelta.
 *   3. `chiudiInArrivo` — la coda si disegna con i segni ancora aperti CHIUSI per finta (`**`, `` ` ``, `*`, `_`, un collegamento
 *      senza indirizzo): è la tecnica di Streamdown (pacchetto `remend`, «Unterminated Block Parsing», streamdown.ai/docs/termination,
 *      letto il 22/10/2026), qui ristretta all'ultima riga e mai dentro un recinto. A messaggio finito non si applica: il testo
 *      finale si disegna esattamente com'è, come lo ridisegna la storia.
 */

const SEGMENTATORE = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

const RIGA_RECINTO = /^\s*```/;
const RIGA_SEPARATORE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const RIGA_TITOLO = /^(#{1,6})\s+/;
const RIGA_CITAZIONE = /^ {0,3}>/;

/** La riga di separazione di una tabella GFM (la stessa regola di `components/markdown.js`). */
export function separatoreTabella(riga) {
  return typeof riga === 'string' && riga.includes('|') && riga.includes('-') && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(riga);
}

/** Quante celle conta il renderer in una riga con le barre (la stessa regola di `celle` in `components/markdown.js`). */
function celleDi(riga) {
  let t = riga.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').length;
}

/** Lo stato della scansione dei confini di UN messaggio. */
export function creaScansione() {
  return { pos: 0, dentroFence: false, confine: 0, citazioneNelBlocco: false, rigaPrecedente: null, impronta: '' };
}

/**
 * Porta la scansione fino a `limite` (escluso): esamina SOLO le righe complete (terminate da `\n`) che finiscono prima di
 * `limite` e che non aveva già visto. Restituisce il confine stabile: tutto ciò che sta prima è fatto di blocchi chiusi.
 * ⛔ Se il testo non continua quello già visto (un messaggio riscritto) la scansione riparte da zero: mai un confine che
 *   riguarda un altro testo. Il controllo è sull'ultima riga vista, O(lunghezza di una riga).
 */
export function avanzaScansione(s, testo, limite = testo.length) {
  /* l'impronta: gli ultimi caratteri prima del punto raggiunto. Un testo che li ha diversi non è la continuazione di quello visto */
  if (s.pos > testo.length || testo.slice(Math.max(0, s.pos - 48), s.pos) !== s.impronta) {
    Object.assign(s, creaScansione());
  }
  const fino = Math.min(limite, testo.length);
  while (s.pos < fino) {
    const a = testo.indexOf('\n', s.pos);
    if (a === -1 || a >= fino) break;
    const inizio = s.pos;
    const riga = testo.slice(inizio, a);
    const t = riga.trim();
    if (RIGA_RECINTO.test(riga)) {
      if (s.dentroFence) {
        s.dentroFence = false;
        s.confine = a + 1; // dopo la chiusura il recinto è finito
      } else {
        if (!s.citazioneNelBlocco) s.confine = inizio; // prima dell'apertura (una citazione non si spezza: il recinto la chiude da sé)
        s.dentroFence = true;
      }
      s.citazioneNelBlocco = false;
    } else if (!s.dentroFence) {
      if (t === '') {
        s.confine = a + 1;
        s.citazioneNelBlocco = false;
      } else if ((RIGA_TITOLO.test(riga) && !riga.includes('|')) || (RIGA_SEPARATORE.test(riga) && riga === riga.trimStart())) {
        /* ⛔ solo righe NON rientrate: «  ---» o «  ## x» dentro una voce d'elenco sono il seguito della voce, non un blocco */
        s.confine = a + 1; // un titolo e un separatore sono blocchi di una riga sola: chiudono prima e dopo
        s.citazioneNelBlocco = false;
      } else {
        if (RIGA_CITAZIONE.test(riga)) s.citazioneNelBlocco = true;
        /* l'intestazione di una tabella: la riga di separazione dopo di lei è già arrivata intera */
        if (!s.citazioneNelBlocco && /^\S/.test(riga) && celleDi(riga) > 1 && s.rigaPrecedente !== null && !s.rigaPrecedente.includes('|')) {
          const b = testo.indexOf('\n', a + 1);
          if (b !== -1 && b < fino && separatoreTabella(testo.slice(a + 1, b))) s.confine = inizio;
        }
      }
    }
    s.rigaPrecedente = riga;
    s.pos = a + 1;
  }
  s.impronta = testo.slice(Math.max(0, s.pos - 48), s.pos);
  return s.confine;
}

/** Il primo confine di grafema a `k` o dopo (mai dentro un'emoji composta o un accento combinato). */
export function confineGrafema(testo, k) {
  if (k <= 0 || k >= testo.length) return k;
  const prima = testo.charCodeAt(k - 1);
  const dopo = testo.charCodeAt(k);
  if (prima < 0x300 && dopo < 0x300) return k; // la via veloce: nessun segno combinante possibile
  if (SEGMENTATORE) {
    const da = Math.max(0, k - 24);
    const finestra = testo.slice(da, Math.min(testo.length, k + 48));
    for (const segmento of SEGMENTATORE.segment(finestra)) {
      const inizio = da + segmento.index;
      const fine = inizio + segmento.segment.length;
      if (inizio < k && fine > k) return Math.min(testo.length, fine);
      if (inizio >= k) break;
    }
    return k;
  }
  return prima >= 0xD800 && prima <= 0xDBFF ? k + 1 : k;
}

const SEGNO_TITOLO = /^#{1,6}[ \t]+/;
const SEGNO_VOCE = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/;
const SEGNO_CITAZIONE = /^(?: {0,3}>[ \t]?)+/;
/** Una riga incompleta che è ancora SOLO un segno in arrivo: non si sa ancora che cosa diventa. */
const SOLO_SEGNO = /^[ \t]*(?:#{1,6}|[-*+_=]{1,3}|\d{1,9}[.)]?|>+|`{1,3}|\|)$/;
/** Un collegamento in arrivo in fondo alla riga, testo e inizio dell'indirizzo: la forma che `chiudiInArrivo` riduce al solo testo. */
const COLLEGAMENTO_IN_ARRIVO = /\[([^\]\n]*)\]\([^)\s]*$/u;

/**
 * Il «](» che sta a `apertura` nella riga chiude il testo di un collegamento? Sì se prima c'è un «[» aperto, senza «]» né a capo in
 * mezzo: la stessa forma del testo del collegamento nel renderer (`\[([^\]]+)\]`, `components/markdown.js`) e in
 * `COLLEGAMENTO_IN_ARRIVO`.
 * ⛔ 23/10/2026 sera (revisione avversaria di fbc96a282, F2): la domanda va fatta su QUEL «](», non sulla riga intera. Prima un «](»
 *   dentro un codice in linea faceva saltare fino alla prima «)» della riga (`(vedi sotto)`), oppure — se la riga finiva con un
 *   collegamento in arrivo più avanti — fino in fondo: salti visibili da 62-67 caratteri, più grandi dei pacchetti crudi.
 */
function chiudeIlTestoDiUnCollegamento(riga, apertura) {
  return /\[[^\]\n]*$/u.test(riga.slice(0, apertura));
}

/** La riga che comincia a `inizio` appartiene a una tabella già aperta sopra di lei? (le righe di dati, non l'intestazione) */
function rigaDentroTabella(testo, inizio) {
  let fine = inizio - 1; // il `\n` della riga sopra
  let righe = 0;
  while (fine > 0 && righe < 400) {
    const s = testo.lastIndexOf('\n', fine - 1) + 1;
    const riga = testo.slice(s, fine);
    if (!riga.includes('|') || riga.trim() === '') return false;
    if (separatoreTabella(riga)) return true; // risalendo per righe con la barra si è trovata la separazione
    fine = s - 1;
    righe += 1;
  }
  return false;
}

/**
 * Fin dove si può mostrare il testo `testo` (quello arrivato) se il ritmo propone `k`. Restituisce un indice che può essere
 * PIÙ AVANTI di `k` (un segno che non si vede passa in un colpo) o PIÙ INDIETRO (una riga che non si sa ancora che cosa sia
 * si tiene finché non arriva). `dentroFence`: la riga che contiene `k` sta dentro un recinto aperto (lo dice la scansione).
 * `finito`: il messaggio è chiuso, l'ultima riga è completa anche senza `\n`.
 */
export function confineDiRivelazione(testo, k, { dentroFence = false, finito = false } = {}) {
  const n = testo.length;
  if (k <= 0) return 0;
  /* anche arrivati in fondo al testo arrivato le regole valgono (un `**` o un `#` che chiude ciò che è arrivato non si sa
     ancora che cosa diventino); a messaggio finito invece tutto è intero */
  if (k >= n && finito) return n;
  k = Math.min(n, confineGrafema(testo, k));
  const s = testo.lastIndexOf('\n', k - 1) + 1;
  const a = testo.indexOf('\n', s);
  const completa = a !== -1 || finito;
  const e = a === -1 ? n : a;
  const riga = testo.slice(s, e);
  /* la riga del recinto (apertura o chiusura) è intera o niente: è cornice, non testo */
  if (RIGA_RECINTO.test(riga) || (!completa && /^\s*`{1,2}$/.test(riga))) return completa ? Math.min(n, e + 1) : s;
  if (dentroFence) return k;
  if (!completa && SOLO_SEGNO.test(riga)) return s;
  /* le righe di separazione (orizzontale o di tabella) intere */
  if (RIGA_SEPARATORE.test(riga.trim()) || separatoreTabella(riga)) return completa ? Math.min(n, e + 1) : s;
  /* LA TABELLA: l'intestazione si mostra insieme alla sua separazione (prima di lei sarebbe una riga di testo con le barre) */
  if (riga.includes('|')) {
    if (rigaDentroTabella(testo, s)) {
      /* una riga di DATI cresce cella per cella, come la scrive il modello: il renderer disegna le celle che ci sono e lascia
         vuote le altre, nessuna barra a schermo. Tenerla intera fino al suo `\n` (la prima forma, come la «holdback» di Codex
         TUI) fermava il testo per tutta la riga — misurato sul banco: pause fino a 366 ms dentro una tabella da 48 righe.
         Passa in un colpo solo la barra d'apertura. */
      const apre = /^\s*\|\s*/.exec(riga);
      if (apre && k < s + apre[0].length) k = Math.min(n, s + apre[0].length);
    } else if (/^\s*\|/.test(riga) || riga.split('|').length > 2) {
      if (!completa) return s; // forse un'intestazione: si saprà alla riga dopo
      const b = testo.indexOf('\n', e + 1);
      const dopo = testo.slice(e + 1, b === -1 ? n : b);
      if (separatoreTabella(dopo) && (b !== -1 || finito)) return Math.min(n, (b === -1 ? n : b + 1));
      if (b === -1 && !finito && /^\s*[|:-]*\s*$/.test(dopo)) return s; // la riga dopo sta arrivando e può essere la separazione
    }
  }
  /* i segni di blocco in testa alla riga passano interi */
  const segno = SEGNO_TITOLO.exec(riga) || SEGNO_VOCE.exec(riga) || SEGNO_CITAZIONE.exec(riga);
  if (segno && k < s + segno[0].length) k = s + segno[0].length;
  const dentro = k - s;
  /* un collegamento: l'indirizzo non si vede, quindi passa in un colpo */
  const apertura = riga.lastIndexOf('](', dentro - 1);
  if (apertura !== -1 && chiudeIlTestoDiUnCollegamento(riga, apertura)) {
    /* la parte che la coda nasconde (`COLLEGAMENTO_IN_ARRIVO`: niente «)» e niente spazi dopo «](») finisce alla prima «)» — l'indirizzo
       è chiuso — o al primo spazio — allora non era un indirizzo (CommonMark 0.31.2 §6.3 «Links», letto il 23/10/2026: una
       destinazione senza `<…>` «does not include ASCII control characters or space character»), e da lì in poi si vede. Fino a quel
       punto ogni carattere mostrato resterebbe nascosto: passa in un colpo.
       ⛔ 23/10/2026 sera (F2, scena FLUIDO-03-SPAZIO): fermarsi solo alla «)» rivelava uno per uno i caratteri prima dello spazio di
       un percorso già arrivato (`[il rapporto](C:/I miei…`), nascosti finché lo spazio non era a schermo: 67 ms di testo fermo in 2
       cadenze su 10 (simulate). */
    const fine = riga.slice(apertura + 2).search(/[)\s]/u);
    if (fine !== -1 && apertura + 2 + fine >= dentro) return s + apertura + 3 + fine;
    /* ⛔ 23/10/2026 (revisione del ramo, scena FLUIDO-03-LINK): la parentesi non è ancora arrivata. Prima qui ci si FERMAVA davanti a
       «](» finché non arrivava: con un indirizzo lungo il testo restava fermo fino a 0,7 s e un carattere aspettava quasi 1 s, oltre
       i 260 ms del contratto (owner 23/10). L'indirizzo arrivato non si vede comunque (`chiudiInArrivo` toglie «](…» dalla coda e
       lascia il testo), quindi passa tutto: come remend di Streamdown, che disegna `[testo](streamdown:incomplete-link)` senza
       fermare il flusso (vercel/streamdown `packages/remend/src/link-image-handler.ts:15-53`).
       ⛔ Revisione avversaria di 0d2f5a5d4 (23/10 sera): misurata sul testo VISIBILE, quella fermata era sui caratteri dell'indirizzo,
       che non si vedono — a schermo la pausa di ~0,7 s mentre arriva un indirizzo lungo c'è in tutte e due le versioni e non si può
       togliere (non c'è niente di visibile da mostrare). La cura vera era un'altra: un «](» che NON è un collegamento (dentro un codice
       in linea) teneva fermo il testo visibile 9,25 s, aspettando una «)» che non arriva. E il salto senza condizioni dipingeva segni
       isolati (`**`, `` ` ``) su quelle righe, perché tornava prima della regola dei segni. ⇒ Si salta SOLO quando QUESTO «](» chiude
       il testo di un collegamento e dopo non c'è ancora né «)» né spazio: esattamente la forma che `chiudiInArrivo` toglie dalla coda
       (la prova MD-ARRIVO-09 tiene i due versi); altrimenti la riga va al ritmo, segni compresi. */
    if (fine === -1 && !completa) return s + riga.length;
  }
  /* una fila di segni (`**`, `` ` ``, `__`, `~~`) non si spezza, e un segno che APRE non resta da solo in coda: si mostra
     insieme alla prima lettera che segue (così la chiusura finta di `chiudiInArrivo` ha qualcosa da chiudere), o si aspetta */
  const c = riga[dentro - 1];
  if (c === '*' || c === '_' || c === '`' || c === '~') {
    let inizioFila = dentro - 1;
    while (inizioFila > 0 && riga[inizioFila - 1] === c) inizioFila -= 1;
    let j = dentro;
    while (j < riga.length && riga[j] === c) j += 1;
    if (j >= riga.length) return completa ? s + j : s + inizioFila; // la fila è l'ultima cosa arrivata: non si sa ancora se apre
    if (/\S/.test(riga[j])) return s + j + 1; // apre: con la sua prima lettera
    return s + j; // seguita da uno spazio: non apre niente («2 * 3»)
  }
  return k;
}

/**
 * La coda del messaggio, pronta per essere disegnata mentre arriva: i segni aperti dell'ULTIMA riga si chiudono per finta.
 * `dentroFence`: la coda finisce dentro un recinto aperto (lì niente si tocca: è codice).
 */
export function chiudiInArrivo(coda, { dentroFence = false } = {}) {
  if (dentroFence || !coda) return coda;
  const a = coda.lastIndexOf('\n') + 1;
  let riga = coda.slice(a);
  if (!riga || RIGA_RECINTO.test(riga)) return coda;
  /* un collegamento senza indirizzo, o col testo a metà: resta il testo, senza parentesi */
  riga = riga.replace(COLLEGAMENTO_IN_ARRIVO, '$1').replace(/\[([^\]\n]*)\]$/u, '$1').replace(/\[([^\]\n]*)$/u, '$1');
  /* codice in linea: un apice aperto si chiude, e ciò che sta dentro non conta per gli altri segni */
  const apici = (riga.match(/`/g) || []).length;
  let fuoriCodice = riga.replace(/`[^`]*`/g, '');
  let chiusura = '';
  if (apici % 2 === 1) {
    fuoriCodice = fuoriCodice.slice(0, fuoriCodice.lastIndexOf('`'));
    chiusura = '`';
  }
  const forti = (fuoriCodice.match(/\*\*/g) || []).length;
  let finale = '';
  if (forti % 2 === 1 && /\*\*\S/.test(fuoriCodice.slice(fuoriCodice.lastIndexOf('**')))) finale += '**';
  const singoli = fuoriCodice.replace(/\*\*/g, '');
  const asterischi = (singoli.match(/\*/g) || []).length;
  if (asterischi % 2 === 1) {
    const ultimo = singoli.lastIndexOf('*');
    if (/\S/.test(singoli[ultimo + 1] || '') && (ultimo === 0 || /[\s(]/.test(singoli[ultimo - 1]))) finale = `*${finale}`;
  }
  const trattini = (singoli.match(/(?<![\p{L}\p{N}_])_(?![\s_])/gu) || []).length - (singoli.match(/(?<![\s_])_(?![\p{L}\p{N}_])/gu) || []).length;
  if (trattini > 0) finale = `_${finale}`;
  return coda.slice(0, a) + riga + chiusura + finale;
}
