/**
 * mappa-cartelle.mjs — BLOCCO 4 del preambolo: la forma del progetto, senza l'inventario dei file.
 *
 * ── PERCHÉ ESISTE, e perché NON è l'elenco dei file ──────────────────────────────────────────
 *
 * Misurato l'11/09/2026 con `elenco-profondo.mjs` + `gitignore-elenco.mjs` (stesso stimatore del
 * prodotto, `costo-elenco.mjs` metodo «stimato», 3,5 byte/token):
 *   · `AVM/mobile` .... elenco dei file = 17.149 token, 1.500 percorsi, **TRONCATO** (l'albero ne
 *     ha 1.842: paghiamo 17k token per mostrarne il 30% e per dire al modello di non fidarsi);
 *   · `harness-ui/` ... elenco dei file = 7.267 token, 693 percorsi.
 * La mappa delle sole cartelle degli stessi due alberi sta fra i 1.400 e i 1.700 token ed è
 * **COMPLETA**: non mente mai, perché non c'è niente da troncare.
 *
 * ⛔ Nessuno dei quattro concorrenti letti nel codice l'11/09 (Codex, Claude Code 2.1.268, Hermes
 *    v0.21, DeepSeek harness) manda al modello un elenco di file: mandano `AGENTS.md`/`CLAUDE.md`
 *    e lasciano cercare. Loro possono: hanno ripgrep, glob, regex, paginazione e giri di fatto
 *    illimitati. Noi abbiamo `GIRI_MASSIMI = 24`, e il banco ha già misurato che **TALOS esaurisce
 *    i giri, non le capacità** ([[talos-esaurisce-i-giri-non-le-capacita]]: fallisce in 80 s
 *    mentre gli altri ne usano 332-630). La mappa delle cartelle è il nostro +1: toglie i giri di
 *    orientamento senza pagare l'inventario.
 *
 * RICERCA WEB, letta l'11/09/2026 PRIMA di scrivere (fonte + data + misura):
 *  1. Anthropic, «Effective context engineering for AI agents», 29/09/2025
 *     <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents> —
 *     verbatim: *«Folder hierarchies, naming conventions, and timestamps all provide important
 *     signals that help both humans and agents understand how and when to utilize information.»*
 *     La stessa pagina difende il «just in time» (identificatori leggeri + ricerca a runtime) MA
 *     ne dichiara il prezzo: *«there's a trade-off: runtime exploration is slower than retrieving
 *     pre-computed data»*, e indica come migliore una strategia IBRIDA — *«retrieving some data up
 *     front for speed, and pursuing further autonomous exploration at its discretion»*. Questo
 *     modulo è esattamente la metà «up front» di quell'ibrido, tenuta al minimo: la FORMA, non il
 *     contenuto.
 *  2. Chroma, «Context Rot: How Increasing Input Tokens Impacts LLM Performance», 14/07/2025
 *     <https://www.trychroma.com/research/context-rot> — 18 modelli di frontiera: *«a single
 *     distractor reduces performance relative to the baseline»*, e il degrado cresce con
 *     l'input. ⇒ 17.000 token di elenco troncato non sono solo un costo: sono **distrattori**.
 *
 * ── LE CINQUE DECISIONI ──────────────────────────────────────────────────────────────────────
 *
 * (1) SOLO CARTELLE, e il conteggio dei file per cartella. `src/ (104)` dice al modello dove sta
 *     il codice senza nominare un file. Il conteggio costa ~6 caratteri e risponde da solo alla
 *     domanda «dove guardo per prima»; senza, la mappa è un elenco di nomi tutti uguali.
 *
 * (2) COMPLETA, e se un tetto morde si taglia IN PROFONDITÀ e LO SI DICHIARA. Un tetto che taglia
 *     «le prime N cartelle in ordine alfabetico» produce una mappa che sembra intera e non lo è —
 *     la bugia che `elenco-profondo.mjs` esiste per non dire, rifatta in forma nuova. Tagliare in
 *     profondità ha una proprietà che il taglio alfabetico non ha: ciò che resta è **vero e
 *     chiuso** («fin qui l'albero è tutto, sotto non l'ho guardato»), non «vero a metà».
 *
 * (3) ORDINE DETERMINISTICO, imposto durante la camminata. Identica ragione di
 *     `elenco-profondo.mjs` decisione (3), e ora con la fonte primaria: Claude Platform Docs,
 *     «Prompt caching» (letto 11/09/2026, <https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching>)
 *     — *«Cache hits require 100% identical prompt segments»* e la lookup lavora sul **prefisso
 *     intero** fino al breakpoint, non sul singolo blocco. Un byte diverso alla posizione N
 *     invalida tutto da lì in poi. ⛔ Mai `localeCompare`: dipende dai dati ICU compilati in Node.
 *
 * (4) IL `.gitignore` SI RISPETTA, con lo STESSO filtro del camminatore dei file — e il filtro si
 *     INIETTA già costruito. ⛔ Non si accetta una `creaFiltro(radice)` da chiamare qui dentro:
 *     è esattamente il contratto che il 10/09 ha prodotto 25.163 token invece di 6.518, perché
 *     `creaFiltroGitignore` vuole `{radice}` e riceveva la stringa nuda, Node lanciava
 *     `ERR_INVALID_ARG_TYPE` e un `catch` messo lì per il «.gitignore illeggibile» lo scambiava per
 *     quello. Qui il filtro arriva già pronto: non c'è nessun contratto da sbagliare.
 *
 * (5) UNA CARTELLA VUOTA RESTA NELLA MAPPA. Esiste sul disco; nasconderla perché non ha file
 *     dentro farebbe concludere al modello che non c'è. Costa una riga.
 */
import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
/* ⛔ UN SOLO contatore in tutto il repo: e' la regola scritta in testa a `costo-elenco.mjs`.
   Due stime diverse per la stessa cosa sono peggio di nessuna stima. */
import { costoDelTesto } from './costo-elenco.mjs';

export class MappaCartelleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MappaCartelleError';
    this.code = 'MAPPA_INVALIDA';
  }
}

/* ⛔ La stessa lista di `elenco-profondo.mjs`: due potature diverse per lo stesso albero
   darebbero al modello una mappa che non combacia con ciò che l'elenco/la ricerca trovano. */
export { CARTELLE_ESCLUSE_PREDEFINITE } from './elenco-profondo.mjs';
import { CARTELLE_ESCLUSE_PREDEFINITE } from './elenco-profondo.mjs';

/**
 * Profondità massima della mappa. 8 come `elenco-profondo.mjs`: i percorsi dei task del corpus
 * `storia` stanno a 4-6, e una mappa che si ferma a 3 li lascerebbe fuori — che è il difetto
 * misurato l'11/09 sullo spazio vero (`contestoDelProgetto` su `AVM/mobile` si ferma a 1500
 * percorsi/profondità 3 mentre i file dei task stanno a 4-6).
 */
export const PROFONDITA_MAPPA_PREDEFINITA = 8;

/**
 * Tetto sulle CARTELLE, non sui file. 2.000: misurato l'11/09, `AVM-harness-desktop` intero ne ha
 * 559 e `AVM/mobile` 215, cioè il tetto non morde su nessuno spazio reale che abbiamo. Esiste per
 * la cartella patologica (la scrivania dell'owner, un disco intero), dove morde e lo DICHIARA.
 */
export const TETTO_CARTELLE_PREDEFINITO = 2000;

/**
 * ⛔⛔⛔ 12/09/2026 — IL TETTO CHE MANCAVA ERA IL TEMPO. Owner: «i modelli OpenRouter sono
 * estremamente lenti al primo messaggio, quasi un minuto». Misurato sui record `tempi-giro`: lo
 * stesso `glm-5.3-flash` risponde in 2,4 s sulla cartella `harness-ui`, in 4,2 s su
 * `AVM-harness-desktop`, in **34-42 s** sulla cartella `Desktop` — a OGNI invio distanziato più
 * di cinque minuti. E `contestoDelProgetto` da sola, su `Desktop`, costa **34.356 ms** per una
 * mappa che poi il tetto di token riduce a 998 token: trentaquattro secondi NOSTRI, spesi a
 * camminare `projects/` (decine di repo) prima ancora di chiamare il fornitore. Il tetto sulle
 * cartelle (2.000) non mordeva in tempo: su Windows ogni `readdir` costa millisecondi, e duemila
 * cartelle sono decine di secondi.
 * ⇒ Un tetto in TEMPO, dichiarato nel testo come gli altri due: ciò che si è letto entro il
 *   budget è vero e completo per quelle cartelle (camminata in ampiezza: sopravvive ciò che sta
 *   vicino alla radice); il resto «non l'ho guardato», e il modello ha `cerca`/`elenca` per
 *   scendere dove serve — è la forma «just in time» che Anthropic raccomanda («maintain
 *   lightweight identifiers… load data at runtime», Effective context engineering for AI agents,
 *   29/09/2025) e che Claude Code applica (il suo `/doctor` TOGLIE dal contesto «directory
 *   layouts» perché il modello li ricava con gli strumenti — docs «How Claude remembers your
 *   project», letta il 12/09/2026).
 * ⛔ 2.000 ms: sopra i 258 ms di `harness-ui/`, sotto i 3.438 ms di `AVM-harness-desktop` (che
 *   viene quindi tagliato in tempo: è il repo intero con worktree e `scratchpad/`, il caso
 *   patologico dichiarato l'11/09), e un ordine di grandezza sotto il primo token del modello.
 */
export const TEMPO_MASSIMO_MAPPA_MS = 2000;

const insiemeMinuscolo = (valore, predefinito) => {
  const grezzo = valore === undefined || valore === null ? predefinito : valore;
  const voci = grezzo instanceof Set ? [...grezzo] : Array.isArray(grezzo) ? grezzo : [grezzo];
  return new Set(voci.filter((v) => typeof v === 'string').map((v) => v.toLowerCase()));
};

const ordinaVoci = (voci) => [...voci].sort((a, b) => {
  const na = typeof a === 'string' ? a : a.name;
  const nb = typeof b === 'string' ? b : b.name;
  return na === nb ? 0 : na < nb ? -1 : 1;
});

/**
 * Cammina l'albero e restituisce SOLO le cartelle, con quanti file contengono (i propri, non
 * quelli dei figli) e a che livello stanno.
 *
 * @param {object} input
 * @param {string} input.radice
 * @param {number} [input.profonditaMax=8] — livello di una cartella: `src` è 1, `src/kernel` è 2
 * @param {number} [input.tettoCartelle=2000]
 * @param {string[]|Set<string>} [input.escludiCartelle]
 * @param {object} [input.fs] — `{readdir, realpath, stat}`, iniettabile come negli altri moduli
 * @param {(percorsoRelativo: string, info?: {cartella: boolean}) => boolean} [input.filtro]
 *   GIÀ COSTRUITO (vedi decisione 4). true = tieni.
 * @param {number} [input.tempoMassimoMs=2000] — il tetto in TEMPO (12/09): oltre, si smette di
 *   accodare e lo si dichiara. `Infinity` per le prove che vogliono l'albero intero.
 * @param {() => number} [input.orologio] — iniettabile per le prove (default `performance.now`)
 * @returns {Promise<{cartelle: {percorso:string, livello:number, file:number}[], fileTotali:number,
 *   troncato:boolean, motivoTroncamento:'cartelle'|'tempo'|null, msImpiegati:number,
 *   profonditaRaggiunta:number, illeggibili:number}>}
 */
export async function costruisciMappaCartelle({
  radice,
  profonditaMax = PROFONDITA_MAPPA_PREDEFINITA,
  tettoCartelle = TETTO_CARTELLE_PREDEFINITO,
  tempoMassimoMs = TEMPO_MASSIMO_MAPPA_MS,
  orologio = () => performance.now(),
  escludiCartelle,
  fs,
  filtro,
} = {}) {
  if (typeof radice !== 'string' || radice.length === 0 || radice.includes('\0')) {
    throw new MappaCartelleError('La cartella di partenza non è valida');
  }
  if (filtro !== undefined && typeof filtro !== 'function') {
    throw new MappaCartelleError('Il filtro deve essere una funzione');
  }

  const disco = { readdir, realpath, stat, ...(fs ?? {}) };
  const escluse = insiemeMinuscolo(escludiCartelle, CARTELLE_ESCLUSE_PREDEFINITE);
  const profondita = Number.isFinite(profonditaMax) ? Math.trunc(profonditaMax) : PROFONDITA_MAPPA_PREDEFINITA;
  const tetto = Number.isFinite(tettoCartelle) ? Math.max(0, Math.trunc(tettoCartelle)) : TETTO_CARTELLE_PREDEFINITO;
  const tieni = (percorso, cartella) => (filtro ? filtro(percorso, { cartella }) !== false : true);

  const cartelle = [];
  let radiceFile = 0;
  let fileTotali = 0;
  let troncato = false;
  let motivoTroncamento = null;
  let profonditaRaggiunta = 0;
  let illeggibili = 0;
  const budgetMs = Number.isFinite(tempoMassimoMs) ? Math.max(0, tempoMassimoMs) : Infinity;
  const partenza = orologio();

  const radiceReale = await disco.realpath(radice).catch(() => radice);
  /* Ampiezza, come `elenco-profondo.mjs`: se il tetto morde, ciò che sopravvive è la roba vicina
     alla radice — `src/`, `tests/` — non il primo sottoalbero seguito fino in fondo. */
  const coda = [{ assoluto: radice, relativo: '', livello: 0, antenati: [radiceReale] }];

  while (coda.length > 0) {
    /* ⛔ Il tetto in tempo si guarda PRIMA di leggere la prossima cartella, non dopo: una lettura
       già iniziata si finisce (i suoi file vanno contati e la sua riga scritta), quella dopo no.
       Stessa disciplina del tetto sulle cartelle: si smette di camminare, non si butta il fatto. */
    if (orologio() - partenza > budgetMs) { troncato = true; motivoTroncamento = 'tempo'; break; }
    const corrente = coda.shift();
    let voci;
    try {
      voci = await disco.readdir(corrente.assoluto, { withFileTypes: true });
    } catch {
      /* Una cartella illeggibile si salta e si CONTA: tacere dichiarerebbe completa una mappa
         che non lo è — lo stesso principio di `elenco-profondo.mjs`. */
      illeggibili += 1;
      continue;
    }

    let fileQui = 0;
    const figli = [];
    let contate = 0;
    for (const voce of ordinaVoci(voci)) {
      /* ⛔ 12/09: una cartella sola puo' avere migliaia di voci (la radice di `Desktop`), e ognuna
         passa dal filtro: il tetto in tempo si guarda anche QUI, ogni 256 voci, o una cartella
         enorme lo scavalca da sola. Le voci gia' contate restano; il testo dichiara il taglio. */
      if ((contate++ & 255) === 255 && orologio() - partenza > budgetMs) { troncato = true; motivoTroncamento = 'tempo'; break; }
      const nome = typeof voce === 'string' ? voce : voce.name;
      const relativo = corrente.relativo ? `${corrente.relativo}/${nome}` : nome;
      const assoluto = join(corrente.assoluto, nome);

      let eCartella = Boolean(voce.isDirectory?.());
      let eFile = Boolean(voce.isFile?.());
      if (voce.isSymbolicLink?.()) {
        const informazioni = await disco.stat(assoluto).catch(() => null);
        if (!informazioni) { illeggibili += 1; continue; } // link rotto: onesto, non fatale
        eCartella = Boolean(informazioni.isDirectory?.());
        eFile = Boolean(informazioni.isFile?.());
      }

      if (eCartella) {
        if (escluse.has(nome.toLowerCase())) continue;
        if (!tieni(relativo, true)) continue;
        figli.push({ nome, relativo, assoluto, collegamento: Boolean(voce.isSymbolicLink?.()) });
        continue;
      }
      /* ⛔ Il conteggio passa dallo STESSO filtro dei file: se non lo facesse, `src/ (104)`
         conterebbe anche ciò che `git` ignora e il numero non combacerebbe con quello che il
         modello trova cercando. Un conteggio che non combacia è peggio di nessun conteggio. */
      if (!eFile) continue;
      if (!tieni(relativo, false)) continue;
      fileQui += 1;
    }

    fileTotali += fileQui;
    if (corrente.relativo !== '') {
      cartelle.push({ percorso: corrente.relativo, livello: corrente.livello, file: fileQui });
      if (corrente.livello > profonditaRaggiunta) profonditaRaggiunta = corrente.livello;
    } else {
      /* La radice non è una voce della mappa (si chiama come lo spazio di lavoro, già detto
         nell'intestazione), ma i suoi file contano nel totale e si dichiarano a parte. */
      radiceFile = fileQui;
    }

    if (corrente.livello + 1 > profondita) continue; // i figli starebbero fuori dalla profondità chiesta
    for (const figlio of figli) {
      /*
       * ⛔⛔ IL TETTO SMETTE DI ACCODARE, NON DI CAMMINARE — trovato da una prova al verso
       *   contrario l'11/09. La prima versione faceva `break` anche sul ciclo esterno: con un
       *   tetto raggiunto alla RADICE usciva una mappa **vuota**, che `testoMappaCartelle` poi
       *   dichiarava «nessuna sottocartella». Cioè, per colpa della guardia contro l'eccesso, la
       *   bugia esatta che questo modulo esiste per non dire — la stessa forma dell'errore che
       *   `elenco-profondo.mjs` racconta nella sua nota sugli anelli simbolici.
       * ⇒ Chi è già in coda si finisce di visitare (i suoi file vanno contati, e la sua riga
       *   scritta); ciò che non entra non entra, e il testo lo DICHIARA.
       */
      if (cartelle.length + coda.length >= tetto) { troncato = true; motivoTroncamento = 'cartelle'; break; }
      /* ⛔ 12/09: `realpath` era una chiamata di sistema PER OGNI cartella, e serve solo a chi può
         girare in tondo — un collegamento simbolico o una giunzione. Una cartella vera ha come
         percorso reale il suo percorso: si prende senza chiedere al disco. Su `Desktop` erano
         migliaia di chiamate in più per non scoprire niente. */
      const reale = figlio.collegamento ? await disco.realpath(figlio.assoluto).catch(() => figlio.assoluto) : figlio.assoluto;
      if (corrente.antenati.includes(reale)) continue; // ciclo: si torna su un ANTENATO del cammino
      coda.push({ assoluto: figlio.assoluto, relativo: figlio.relativo, livello: corrente.livello + 1, antenati: [...corrente.antenati, reale] });
    }
  }

  /* ⛔ La camminata è in AMPIEZZA (decisione 3: se il tetto morde sopravvive la roba vicina alla
     radice), ma il TESTO è un albero indentato: in ordine di ampiezza i figli non seguirebbero il
     loro genitore e l'indentazione mentirebbe. Si riordina qui, in profondità e per nome, con lo
     stesso confronto per unità di codice di `elenco-profondo.mjs` — mai `localeCompare`. */
  cartelle.sort(confrontaCartelle);

  return { cartelle, radiceFile, fileTotali, troncato, motivoTroncamento, msImpiegati: Math.round(orologio() - partenza), profonditaRaggiunta, illeggibili };
}

/**
 * Ordine totale, stabile e indipendente dall'ambiente: segmento per segmento, e un genitore
 * viene sempre prima dei propri figli. ⛔ Mai `localeCompare` (dipende dai dati ICU compilati in
 * Node: un ordine che cambia da una macchina all'altra rompe il prefisso della cache).
 */
export function confrontaCartelle(a, b) {
  const sa = String(a?.percorso ?? a).split('/');
  const sb = String(b?.percorso ?? b).split('/');
  const comuni = Math.min(sa.length, sb.length);
  for (let i = 0; i < comuni; i += 1) {
    if (sa[i] === sb[i]) continue;
    return sa[i] < sb[i] ? -1 : 1;
  }
  return sa.length - sb.length;
}

/**
 * Il testo del blocco 4.
 *
 * FORMA: nomi INDENTATI, non percorsi interi. Misurato l'11/09 sui due spazi veri: il percorso
 * intero ripete il prefisso del genitore su ogni riga e costa il 35-45% in più della sola
 * indentazione a due spazi, per la stessa informazione. Un `/` finale distingue a colpo d'occhio
 * una cartella da un file, e il conteggio fra parentesi dice dove sta il lavoro.
 *
 * ⛔ Nell'intestazione va il NOME della cartella, MAI il percorso assoluto: contiene il nome della
 *    persona e questo testo esce dalla macchina dentro un prompt. È la lezione
 *    [[cancello-4-non-guardava-tutto-mobile]] — un percorso personale pubblicato in chiaro perché
 *    nessuno aveva guardato dove finiva. Stessa regola di `testoElenco()`.
 */
export function testoMappaCartelle(mappa, { radice = '' } = {}) {
  const nome = basename(String(radice ?? '').replace(/[\\/]+$/, '')) || 'la cartella di lavoro';
  const voci = Array.isArray(mappa?.cartelle) ? mappa.cartelle : [];

  if (voci.length === 0) {
    /* ⛔ «nessuna sottocartella» è un fatto VERO e utile (un progetto piatto esiste); «nessun
       file» invece si dice solo se davvero non ce ne sono, e in quel caso chi compone il preambolo
       decide di non mandare niente — vedi `contesto-del-progetto.mjs`. */
    return `Struttura di «${nome}»: nessuna sottocartella, ${mappa?.radiceFile ?? 0} file nella cartella principale.`;
  }

  const righe = [];
  righe.push(`Struttura di «${nome}» — ${voci.length} cartelle${mappa.troncato ? '' : ', albero COMPLETO'}. Fra parentesi quanti file contiene ognuna (i propri, non quelli delle sottocartelle).`);
  righe.push('I singoli file non sono elencati: usa `cerca` per trovarli per nome o per contenuto, e `elenca` per vedere cosa c\'è in una cartella precisa.');
  if (mappa.troncato && mappa.motivoTroncamento === 'tempo') {
    righe.push(`⚠ MAPPA INCOMPLETA — questa cartella è grande e leggerla tutta avrebbe fatto aspettare: mi sono fermato dopo ${voci.length} cartelle (profondità ${mappa.profonditaRaggiunta}). Quelle elencate sono vere; le altre non le ho guardate: cercale con \`cerca\` o \`elenca\` prima di dire che mancano.`);
  } else if (mappa.troncato) {
    righe.push(`⚠ MAPPA INCOMPLETA — mi sono fermato a ${voci.length} cartelle (profondità ${mappa.profonditaRaggiunta}): più in basso l'albero continua e non l'ho guardato.`);
  }
  if (mappa.illeggibili > 0) {
    righe.push(`(${mappa.illeggibili} cartelle non si sono lasciate leggere: quello che contengono non compare qui.)`);
  }
  righe.push('');
  righe.push(`${nome}/ (${mappa.radiceFile ?? 0})`);
  for (const voce of voci) {
    const foglia = voce.percorso.slice(voce.percorso.lastIndexOf('/') + 1);
    righe.push(`${'  '.repeat(voce.livello)}${foglia}/ (${voce.file})`);
  }
  if (mappa.troncato) {
    righe.push('');
    righe.push('⚠ Fine di una mappa INCOMPLETA: se una cartella non compare qui sopra non vuol dire che non esista — cercala prima di dire che manca.');
  }
  return righe.join('\n');
}

/**
 * Il TETTO DELLA MAPPA, in TOKEN — perche' un tetto sulle cartelle non e' un tetto sul costo.
 *
 * ⛔ MISURATO L'11/09/2026, ed e' il numero che ha fatto nascere questa funzione: col solo tetto
 *    sulle cartelle (2.000), lo spazio di lavoro «repo intero» (`AVM-harness-desktop`, 12.715 file
 *    e oltre 2.000 cartelle, worktree e `scratchpad/prove` compresi) produceva una mappa da
 *    **17.966 token** — cioe' il preambolo nuovo costava **+8,4% del vecchio** invece di meno.
 *    Una cura che peggiora il caso peggiore non e' una cura.
 * ⇒ 4.000 token: sotto, tutti gli spazi di lavoro veri misurati quel giorno (`harness-ui/` 358,
 *    `AVM/mobile` 3.937); sopra, solo gli alberi patologici, che e' esattamente dove deve mordere.
 *
 * ⛔ E si taglia IN PROFONDITA', non in ordine alfabetico. La differenza e' fra «fin qui l'albero
 *    e' TUTTO, sotto non l'ho guardato» — una verita' chiusa, su cui il modello puo' ragionare — e
 *    «ne ho mostrate le prime N», che sembra intero e non lo e'. E si DICHIARA.
 */
export const TETTO_TOKEN_MAPPA_PREDEFINITO = 4000;

/**
 * Rende la mappa dentro un tetto di token, togliendo un livello di profondita' alla volta.
 *
 * ⭐ NON ricammina l'albero: filtra le cartelle gia' raccolte. Sul repo intero la camminata costa
 *    3,5 s, e rifarla quattro volte per trovare la profondita' giusta sarebbe 14 s prima del primo
 *    token — il contrario di cio' che BC-07 sta cercando di ottenere.
 *
 * @returns {{testo:string, profonditaUsata:number, tagliataInProfondita:boolean, token:number}}
 */
export function mappaEntroIlTetto(mappa, { radice = '', tettoToken = TETTO_TOKEN_MAPPA_PREDEFINITO, stima } = {}) {
  const conta = typeof stima === 'function' ? stima : (t) => costoDelTesto(t, { metodo: 'stimato' }).token;
  const profonditaPiena = mappa?.profonditaRaggiunta ?? 0;

  for (let profondita = profonditaPiena; profondita >= 1; profondita -= 1) {
    const tagliata = profondita < profonditaPiena;
    const voci = tagliata ? mappa.cartelle.filter((c) => c.livello <= profondita) : mappa.cartelle;
    const testo = testoMappaCartelle(
      { ...mappa, cartelle: voci, troncato: Boolean(mappa.troncato) || tagliata, profonditaRaggiunta: profondita },
      { radice },
    );
    const token = conta(testo);
    if (token <= tettoToken || profondita === 1) {
      return { testo, profonditaUsata: profondita, tagliataInProfondita: tagliata, token };
    }
  }
  /* Nessuna cartella affatto: la mappa e' una riga sola, e non c'e' niente da tagliare. */
  const testo = testoMappaCartelle(mappa, { radice });
  return { testo, profonditaUsata: 0, tagliataInProfondita: false, token: conta(testo) };
}
