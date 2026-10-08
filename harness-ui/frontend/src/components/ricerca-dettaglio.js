import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
import { testoDelCampo } from './testo-server.js';
/* Date e numeri nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
import { creaAvanzamentoRicerca } from './ricerca-avanzamento.js'; // 24/09/2026: barra + fase e conteggi
/*
 * ricerca-dettaglio.js — lotto L7: dove una ricerca approfondita si CONSULTA.
 *
 * Fonte del disegno: `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` §6.7 e §7 (L7).
 * Il guasto che chiude, con la foto dell'owner dietro: la sezione mostrava una scheda con
 * «Conclusa» e, sotto, la frase «La consultazione del rapporto e delle fonti non è ancora
 * disponibile qui» — cioè un elenco senza dentro, e un timbro verde su una ricerca che non
 * aveva prodotto nessun rapporto.
 *
 * ⛔ IL PRINCIPIO, uno solo: **una ricerca approfondita è un artefatto, non una conversazione.**
 *   Quello che si consulta è il rapporto e le sue prove; la sessione è solo il modo in cui è
 *   stato prodotto. Da qui discende tutto ciò che segue, compreso cosa NON si mostra.
 *
 * ⛔ COSA NON SI INVENTA MAI.
 *   1. `ultimoMessaggio` NON è il rapporto. È la cosa più importante di questo file: l'11/09 una
 *      ricerca vera è finita `done` con 290 byte di scusa del modello salvati in Libreria come se
 *      fossero il rapporto. Qui l'ultimo messaggio compare **solo** dentro «Come è andata», con
 *      la sua etichetta e la frase che dice cos'è; il pannello «Rapporto» non lo tocca nemmeno.
 *   2. «Conclusa» è **solo** per lo stato `done`. Gli stati nuovi (`senza-rapporto`,
 *      `bloccata-dal-permesso`, `giri-esauriti`) hanno una parola loro e una frase che dice COSA
 *      FARE, non solo cosa è successo.
 *   3. Se il record recintato del rapporto non si rilegge, il bilancio **non si stima**: si dice
 *      che non c'è e si mostra la prosa così com'è.
 *   4. Nessun pulsante promette una rotta che non esiste. ⭐ AGGIORNATO IL 12/09: le rotte di
 *      pausa, ripresa, ri-verifica ed eliminazione ci sono e l'owner le ha approvate
 *      (`.claude/RAPPORTO-RICERCA-L5-2026-09-12.md` §3), quindi le quattro azioni sono nel menu —
 *      ma la regola non cambia: ognuna compare solo negli stati in cui può davvero fare qualcosa,
 *      e solo se il chiamante ha passato la sua porta di rete.
 *
 * ⛔ COSA SI LEGGE DAL MOBILE, E PERCHÉ È RISCRITTO QUI.
 *   Il formato del rapporto è quello di `mobile/src/lib/research/researchReport.ts:79-152`
 *   (prosa + un record recintato ```talos-research-report con affermazioni, passaggi, verdetti e
 *   fonti) e i due formati di citazione sono quelli di `researchCitationExport.ts:80-118`.
 *   Il mobile è in TypeScript e NON è nel bundle del frontend desktop: `src/research/citations.mjs`
 *   (porto lato kernel) non è importabile da qui. Quindi la lettura del record e le due
 *   esportazioni sono riscritte in JS in questo file, **alla lettera**, coi loro test — e la
 *   memoria di questa lane dice che sul mobile si legge e non si scrive: nessun file del mobile è
 *   stato toccato.
 *
 * ⛔ LE SCHEDE (Rapporto · Affermazioni · Fonti · Piano · Come è andata) seguono il pattern W3C APG
 *   «Tabs», esempio ad attivazione automatica (w3.org/WAI/ARIA/apg/patterns/tabs, letto
 *   11/09/2026): `role="tablist"` con `aria-label`, ogni `role="tab"` con `aria-controls` e
 *   `aria-selected`, **un solo stop del Tab** (le non scelte hanno `tabindex="-1"`), frecce che
 *   spostano E attivano con ritorno circolare, Home/End agli estremi, e il pannello
 *   `role="tabpanel"` con `tabindex="0"` e `aria-labelledby` sulla sua scheda.
 *   Il menu «⋯» segue «Menu Button» (stessa fonte, stesso giorno): `aria-haspopup="menu"`, il
 *   fuoco sulla prima voce all'apertura, Esc che chiude e restituisce il fuoco — regia che vive
 *   già in `legacy/app.js` (`apriMenuAzioniLibreria`) e che qui si **inietta**, non si riscrive.
 *
 * ⛔ NIENTE ANIMAZIONI IN JS: `body.reduce-motion *` e `@media (prefers-reduced-motion) *` le
 *   spengono tutte con `!important` (lezione del 10/09, sei cure cadute su un componente sano).
 */

/* ----------------------------------------------------------------- gli stati, in parole vere */

/**
 * La parola dello stato, il tono, e **cosa fare**.
 *
 * ⛔ `cosaFare` non è un ornamento: gli stati nuovi nascono dal cancello di consegna (§6.5) e
 *   descrivono un guasto che una persona può rimediare. «Bloccata» da sola lascia fermi; «Bloccata:
 *   la sessione era in sola lettura, riprendila con il permesso giusto» no.
 */
export const STATI_RICERCA = new Map([
  /* ⛔ `parola` e `cosaFare` sono getter: si leggono a ogni uso, non alla creazione del modulo, così seguono il cambio di lingua. */
  ['running', { get parola() { return traduci('sezioni.research.status.running.word'); }, tono: 'info', get cosaFare() { return traduci('sezioni.research.status.running.next'); } }],
  ['paused', { get parola() { return traduci('sezioni.research.status.paused.word'); }, tono: 'warning', get cosaFare() { return traduci('sezioni.research.status.paused.next'); } }],
  /* ⛔ Questa frase la legge SOLO la scheda dell'elenco: nel dettaglio, su una conclusa, al suo
     posto va il bilancio. Quindi dice cosa fare DA LÌ — «qui sotto» in una scheda non è un posto. */
  ['done', { get parola() { return traduci('sezioni.research.status.done.word'); }, tono: 'success', get cosaFare() { return traduci('sezioni.research.status.done.next'); } }],
  /* ⛔ «Annullata» e non «Interrotta»: è la parola che la sezione usa da sempre e che il filtro
     del prodotto porta al plurale. Una parola sola per uno stato solo — due sinonimi in due
     schermate sono la prima crepa da cui una UI comincia a divergere. */
  ['cancelled', { get parola() { return traduci('sezioni.research.status.cancelled.word'); }, tono: '', get cosaFare() { return traduci('sezioni.research.status.cancelled.next'); } }],
  ['failed', { get parola() { return traduci('sezioni.research.status.failed.word'); }, tono: 'danger', get cosaFare() { return traduci('sezioni.research.status.failed.next'); } }],
  /* I tre stati nuovi del cancello di consegna. */
  ['senza-rapporto', { get parola() { return traduci('sezioni.research.status.noReport.word'); }, tono: 'warning', get cosaFare() { return traduci('sezioni.research.status.noReport.next'); } }],
  ['bloccata-dal-permesso', { get parola() { return traduci('sezioni.research.status.blocked.word'); }, tono: 'danger', get cosaFare() { return traduci('sezioni.research.status.blocked.next'); } }],
  ['giri-esauriti', { get parola() { return traduci('sezioni.research.status.outOfTurns.word'); }, tono: 'warning', get cosaFare() { return traduci('sezioni.research.status.outOfTurns.next'); } }],
]);

/** ⛔ Uno stato che non conosciamo NON diventa «Conclusa»: diventa «Stato non registrato». */
export function statoRicercaApprofondita(stato) {
  return STATI_RICERCA.get(stato) || {
    parola: traduci('sezioni.research.status.unknown.word'),
    tono: '',
    cosaFare: traduci('sezioni.research.status.unknown.next'),
  };
}

/**
 * ⭐⭐⭐⭐ BC-44 (12/09/2026) — «NON RIUSCITA» DICEVA LA COSA SBAGLIATA A CHI L'AVEVA PAGATA.
 *
 * Il fatto: la ricerca `dec896c0` ha lavorato sedici giri, tenuto 67 testi, scritto «Poi
 * deposito.», e il fornitore del modello ha chiuso la connessione. Questa tabella la timbrava
 * **«Non riuscita · Si è fermata su un errore. Riavviala dalla chat con la stessa domanda»** —
 * cioè consigliava di **ripagare venti minuti di lavoro** che stavano interi sul disco.
 *
 * ⛔ Non è un errore di parole: la ricerca NON ha fallito, è stata interrotta, e le due cose
 *   portano a due gesti diversi (rifarla / riprenderla). Da qui la coppia separata.
 * ⛔ Chi decide è il SERVER, con `riprendibile` + `motivoErrore.transitorio`: qui non si
 *   indovina niente da una stringa. Su una voce vecchia (senza quei campi) si cade sulla
 *   tabella di sempre — nessuna schermata cambia per le ricerche di ieri.
 * ⛔ E la parola non nomina il guasto tecnico («Upstream idle timeout exceeded» non è una cosa
 *   da leggere a schermo): la frase precisa arriva dal server in `motivo`, già in italiano, e
 *   `frasiVoce` la preferisce al `cosaFare` generico come fa per ogni altro stato.
 */
export const INTERROTTA_DAL_FORNITORE = Object.freeze({
  get parola() { return traduci('sezioni.research.status.providerInterrupted.word'); },
  tono: 'warning',
  get cosaFare() { return traduci('sezioni.research.status.providerInterrupted.next'); },
});

/** Lo stato di UNA VOCE — cioè con quello che il server dice di lei, non il solo nome dello stato. */
export function statoDellaVoce(voce) {
  if (voce?.stato === 'failed' && voce?.motivoErrore?.transitorio === true) return INTERROTTA_DAL_FORNITORE;
  return statoRicercaApprofondita(voce?.stato);
}

/** Solo `done` può dire «Conclusa»: la regola sta in una funzione, così un test può morderla. */
export function conclusaDavvero(stato) { return stato === 'done'; }

/**
 * QUESTA RICERCA HA UN RAPPORTO DA LEGGERE?
 *
 * ⛔⛔ 11/09/2026, foto dell'owner sul 4174, ricerca `d2a453a8`. Sulla stessa schermata:
 *   il timbro diceva «Senza rapporto», i filtri dicevano «Col rapporto 1 · Senza rapporto 0», il
 *   piede della scheda diceva «Col rapporto», e il pannello «Rapporto» stampava come rapporto i
 *   290 byte di scusa del modello. Quattro voci, tre in disaccordo con la quarta.
 *   La causa è una sola: filtro, piede e pannello guardavano `reportLibraryId` — cioè «c'è un file
 *   in Libreria» — mentre il timbro guarda lo STATO.
 *
 * ⇒ Quando le due domande sono in disaccordo vince lo STATO, e non è una preferenza: il cancello
 *   di consegna lato server ha GIÀ deciso che quel file non è un rapporto, ed è per questo che la
 *   ricerca è finita `senza-rapporto` invece che `done`. Un file depositato resta un file
 *   depositato: si mostra, con quel nome, e mai al posto del rapporto.
 * ⛔ Servono ENTRAMBE: un `done` senza file in Libreria non ha comunque niente da leggere — è
 *   l'anomalia che il piede della scheda chiama «Nessun rapporto» da sempre.
 */
export function haRapportoLeggibile(voce) {
  return conclusaDavvero(voce?.stato) && Boolean(voce?.reportLibraryId);
}

/* ------------------------------------------------ L5 (12/09): QUANDO un'azione può esistere */

/*
 * ⛔⛔⛔ 12/09/2026 — LE AZIONI DI SCRITTURA ARRIVANO, E LA REGOLA DI QUESTO FILE NON CAMBIA:
 *   «una voce del menu esiste solo se può davvero fare qualcosa». Fino a ieri qui c'era scritto
 *   «pausa, ripresa, ri-verifica ed eliminazione non sono qui (arrivano con L5, se l'owner approva
 *   le rotte)»: le rotte ci sono (`.claude/RAPPORTO-RICERCA-L5-2026-09-12.md` §3), l'owner le ha
 *   approvate, e la premessa che teneva fuori i pulsanti è caduta. Si riapre, e si scrive perché.
 *
 * ⛔ NASCOSTA o SPENTA? W3C APG «Menu and Menubar Pattern» (letta il 12/09/2026) dice che si può
 *   tenere una voce e marcarla `aria-disabled="true"` — «Disabled menu items are focusable but
 *   cannot be activated» — e MDN `aria-disabled` (stesso giorno) aggiunge la ragione per cui a
 *   volte conviene: una voce spenta resta SCOPRIBILE col Tab. ⇒ È una scelta vera, non una
 *   dimenticanza, e qui si sceglie di TOGLIERE. Il motivo è che «Metti in pausa» e «Riprendi» sono
 *   l'una l'inverso dell'altra sullo stesso oggetto: tenerle tutte e due, una sempre spenta,
 *   riempirebbe il menu di righe morte su OGNI ricerca — e lo stato è già scritto due centimetri
 *   più in alto, nel timbro. Un menu di quattro voci che cambia con lo stato non fa perdere
 *   nessuno; un menu di sei con due sempre grigie sì.
 *
 * ⛔⛔ «RIPRENDI» NON VALE SOLO SU `paused`, e NON È UNA LIBERTÀ CHE MI PRENDO: nel contratto lo
 *   stato `interrupted` **non esiste**. `statoVivo` (`research-orchestrator.mjs:393-397`) lo
 *   scrive così: se la sessione non c'è più o è `interrotta` ⇒ **`failed`**. Cioè una ricerca
 *   uccisa a metà da un riavvio del server si presenta come `failed`, ed è ESATTAMENTE il caso
 *   per cui il giornale di L4 e la cura di L5 §7 esistono. Offrire «Riprendi» solo su `paused`
 *   nasconderebbe l'azione proprio dove serve.
 * ⛔ E quando non si può davvero (giornale terminale: `done`/`cancelled`/`failed`), il server
 *   risponde **409** e la frase lo dice. Meglio un no onesto e raro che un'assenza muta.
 */
export function puoMettereInPausa(voce) { return voce?.stato === 'running'; }
/*
 * ⭐⭐⭐⭐ BC-44 (12/09/2026) — ADESSO LA RISPOSTA LA DÀ IL SERVER, e non è una raffinatezza.
 *
 * Questa riga offriva «Riprendi» su OGNI `failed`, col ragionamento — giusto allora — che un
 * riavvio del server si presenta proprio così. Ma il server, su metà di quei casi, rispondeva
 * **409 «non è nello stato giusto»**: un pulsante che promette ciò che nessuna rotta può
 * mantenere, esattamente ciò che questo file dichiara di non voler fare («una voce del menu
 * esiste solo se può davvero fare qualcosa»).
 *
 * ⇒ Da oggi la voce esposta porta `riprendibile`, che è la STESSA condizione che il cancello di
 *   `riprendi()` fa rispettare — una domanda, una risposta, un posto solo. ⛔ Quando il campo
 *   non c'è (una risposta di ieri, una pagina aperta durante un aggiornamento del server) si
 *   cade sulla regola di prima: un menu in meno sarebbe peggio di un 409 raro.
 */
export function puoRiprendere(voce) {
  if (typeof voce?.riprendibile === 'boolean') return voce.riprendibile;
  return voce?.stato === 'paused' || voce?.stato === 'failed';
}

/*
 * ⛔ La ri-verifica vuole un rapporto CON i passaggi citati: senza, non c'è niente da ritrovare
 *   nella pagina di oggi e la rotta risponde 409 col motivo (§3.4 del rapporto L5). Qui si guarda
 *   il solo segnale che l'elenco porta — «questa ricerca ha un rapporto leggibile» — e il resto lo
 *   dice il server. ⛔ Non si indovina la presenza dei passaggi da `bilancio`: una ricerca vecchia
 *   passata col ripiego in prosa ha un rapporto VERO e pagato e non ha i passaggi, e togliere la
 *   voce di menu a chi vuole provarci sarebbe decidere al posto suo su un dato che non abbiamo.
 */
export function puoRicontrollareLeFonti(voce) { return haRapportoLeggibile(voce); }

/**
 * L'ERRORE DEL SERVER, DETTO A UNA PERSONA — e detto per l'azione che ha premuto.
 *
 * ⛔ Il codice è l'unica parte VERA che esce da un 400/404/409: `public-problem.mjs` sostituisce il
 *   messaggio, e il motivo preciso (in inglese, perché scritto per il modello) resta nel registro
 *   diagnostico — non arriva qui. ⇒ La frase la scrive questo file, e la scrive DIVERSA per ogni
 *   azione, perché «non è nello stato giusto» non dice niente a chi ha appena premuto «Riprendi».
 * ⛔ Le due frasi del conflitto non sono inventate: sono i due soli rifiuti che il codice del
 *   server può produrre — `mettiInPausa` rifiuta ciò che non sta girando, `riprendi` rifiuta ciò
 *   che sta ancora girando oppure ha un giornale terminale (`research-orchestrator.mjs:989-1032`).
 */
export const AZIONI_RICERCA = new Map([
  ['pausa', { get verbo() { return traduci('sezioni.research.action.pause.verb'); }, get conflitto() { return traduci('sezioni.research.action.pause.conflict'); } }],
  ['ripresa', { get verbo() { return traduci('sezioni.research.action.resume.verb'); }, get conflitto() { return traduci('sezioni.research.action.resume.conflict'); } }],
  ['riverifica', { get verbo() { return traduci('sezioni.research.action.recheck.verb'); }, get conflitto() { return traduci('sezioni.research.action.recheck.conflict'); } }],
  ['elimina', { get verbo() { return traduci('sezioni.research.action.delete.verb'); }, get conflitto() { return traduci('sezioni.research.action.delete.conflict'); } }],
]);

export function paroleErroreRicerca(codice, azione) {
  const quale = AZIONI_RICERCA.get(azione) || { verbo: traduci('sezioni.research.action.fallback.verb'), conflitto: traduci('sezioni.research.action.fallback.conflict') };
  if (codice === 'RESEARCH_NOT_FOUND') return traduci('sezioni.research.error.notFound');
  if (codice === 'RESEARCH_CONFLICT' || codice === 'RESEARCH_RECHECK_UNAVAILABLE') return quale.conflitto;
  if (codice === 'NOT_FOUND') return traduci('sezioni.research.error.sessionClosed');
  if (codice === 'RESEARCH_INVALID' || codice === 'QUERY_INVALID') return traduci('sezioni.research.error.rejected');
  return traduci('sezioni.research.error.generic', { action: quale.verbo });
}

/*
 * ⛔ Niente SECONDI: `toLocaleString('it-IT')` scrive «11/09/2026, 20:56:46» e il terzo numero non
 *   dice niente a nessuno — in una riga di intestazione è solo rumore. Trovato guardando la foto.
 */
function dataOra(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return null;
  return d.toLocaleString(localeUI(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * L'articolo davanti a una data, in italiano: «l'8», «l'11», ma «il 10».
 *
 * ⛔ Sembra un dettaglio ed è la differenza fra una frase scritta e una frase generata: «Avviata il
 *   11/09/2026» lo scrive una macchina, «Avviata l'11/09/2026» lo scrive qualcuno. Si elide solo
 *   davanti a otto e undici, gli unici numeri di giorno che cominciano per vocale.
 */
export function articoloData(iso) {
  const d = iso ? new Date(iso) : null;
  const giorno = d && Number.isFinite(d.getTime()) ? d.getDate() : 0;
  /* La parola davanti alla data sta nel dizionario: in italiano «l’» o «il», in inglese «on». Lo spazio lo mette il codice, tranne dopo l’apostrofo. */
  const parola = traduci(giorno === 8 || giorno === 11 ? 'sezioni.research.dateArticle.elided' : 'sezioni.research.dateArticle.plain');
  return /[’']$/.test(parola) ? parola : `${parola} `;
}

/**
 * Quanto è durata, dall'avvio alla fine.
 *
 * ⛔ Si chiama «durata», non «lavoro»: dall'avvio alla fine passa anche il tempo in cui la ricerca
 *   aspettava, e chiamarlo lavoro sarebbe una misura che non abbiamo. Il disegno §6.7 scriveva
 *   «4 min 12 s di lavoro»; il dato che il server manda non lo sa.
 */
export function durataUmana(daISO, aISO) {
  const da = daISO ? Date.parse(daISO) : NaN;
  const a = aISO ? Date.parse(aISO) : NaN;
  if (!Number.isFinite(da) || !Number.isFinite(a) || a < da) return null;
  const secondi = Math.round((a - da) / 1000);
  if (secondi < 60) return `${secondi} s`;
  const minuti = Math.floor(secondi / 60);
  const resto = secondi % 60;
  if (minuti < 60) return resto ? `${minuti} min ${resto} s` : `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  const minutiResto = minuti % 60;
  return minutiResto ? `${ore} h ${minutiResto} min` : `${ore} h`;
}

/**
 * Le frasi di una voce dell'elenco, tutte insieme.
 *
 * ⛔ `motivo` viene dal server e vince sulla frase nostra quando c'è: il server sa PERCHÉ quella
 *   ricerca si è fermata, noi sappiamo solo cosa vuol dire quello stato in generale. Quando non
 *   c'è, si cade sul `cosaFare` — mai sul silenzio.
 * ⛔ `domanda` con ripiego su `titolo`: la rotta di ieri mandava `titolo`, quella di oggi manda
 *   `domanda`. Una sezione che legge un solo nome mostrerebbe «Ricerca senza titolo» su tutto
 *   l'archivio il giorno del cambio.
 */
export function frasiVoce(voce) {
  /* ⭐ BC-44 — `statoDellaVoce` e non `statoRicercaApprofondita`: una caduta transitoria ha una parola sua («Interrotta dal fornitore»), e la decide il server. */
  const stato = statoDellaVoce(voce);
  const grezza = typeof voce?.domanda === 'string' && voce.domanda.trim()
    ? voce.domanda.trim()
    : (typeof voce?.titolo === 'string' && voce.titolo.trim() ? voce.titolo.trim() : '');
  const motivoTradotto = testoDelCampo(voce, 'motivo');
  const motivo = typeof motivoTradotto === 'string' && motivoTradotto.trim() ? motivoTradotto.trim() : null;
  return {
    domanda: grezza || traduci('sezioni.research.noQuestion'),
    parola: stato.parola,
    tono: stato.tono,
    /* ⛔ Su `done` il motivo non si mostra: il server lo manda solo quando NON è done, e stamparlo
       lì sarebbe una spiegazione di un guasto che non c'è stato. */
    spiegazione: conclusaDavvero(voce?.stato) ? stato.cosaFare : (motivo || stato.cosaFare),
    avviata: dataOra(voce?.avviataAlle),
    conclusa: dataOra(voce?.conclusaAlle),
    durata: durataUmana(voce?.avviataAlle, voce?.conclusaAlle),
    haRapporto: Boolean(voce?.reportLibraryId),
    nome: typeof voce?.nome === 'string' && voce.nome.trim() ? voce.nome.trim() : null,
  };
}

/* ------------------------------------------------- il rapporto: prosa + record, o solo prosa */

const APERTURA_RECORD = '```talos-research-report';
const CHIUSURA_RECORD = '```';

/**
 * Legge un rapporto: la prosa per una persona, il record per il bilancio.
 *
 * ⛔ `record: null` invece di un recupero parziale, per la stessa ragione del mobile
 *   (`researchReport.ts:154-175`): mezzo record mostrerebbe verdetti accanto ad affermazioni che
 *   non sono le loro, e un timbro di verifica sbagliato è peggio di nessun timbro.
 * ⛔ `perche` dice perché non c'è, così la schermata non scrive «non disponibile» e basta.
 */
export function leggiDocumentoRapporto(testo) {
  const documento = typeof testo === 'string' ? testo : '';
  const inizio = documento.indexOf(APERTURA_RECORD);
  if (inizio < 0) {
    return { prosa: documento.trim(), record: null, perche: documento.trim() ? 'senza-record' : 'vuoto' };
  }
  const da = inizio + APERTURA_RECORD.length;
  const fine = documento.indexOf(CHIUSURA_RECORD, da);
  const prosa = documento.slice(0, inizio).trim();
  if (fine < 0) return { prosa, record: null, perche: 'record-troncato' };
  try {
    const letto = JSON.parse(documento.slice(da, fine));
    if (letto?.version !== 1 || !Array.isArray(letto.claims) || !Array.isArray(letto.sources)) {
      return { prosa, record: null, perche: 'record-di-un-altro-formato' };
    }
    return { prosa, record: { ...letto, judge: letto.judge ?? null }, perche: null };
  } catch {
    return { prosa, record: null, perche: 'record-illeggibile' };
  }
}

/**
 * Una mappa le cui voci sono CHIAVI del dizionario: ogni lettura le traduce nella lingua di quel momento.
 * ⛔ Una tabella di frasi a livello di modulo che tenesse le frasi stesse resterebbe nella lingua in cui il modulo è stato caricato.
 */
class MappaTradotta extends Map {
  get(chiave) { const voce = super.get(chiave); return voce === undefined ? undefined : traduci(voce); }
  * entries() { for (const [chiave, voce] of super.entries()) yield [chiave, traduci(voce)]; }
  * values() { for (const voce of super.values()) yield traduci(voce); }
  [Symbol.iterator]() { return this.entries(); }
  forEach(fn, quello) { for (const [chiave, voce] of this.entries()) fn.call(quello, voce, chiave, this); }
}

/** Perché il bilancio non c'è, detto a una persona. Mai «errore di parsing». */
export const PERCHE_SENZA_RECORD = new MappaTradotta([
  ['vuoto', 'sezioni.research.noRecord.empty'],
  ['senza-record', 'sezioni.research.noRecord.missing'],
  ['record-troncato', 'sezioni.research.noRecord.truncated'],
  ['record-di-un-altro-formato', 'sezioni.research.noRecord.otherFormat'],
  ['record-illeggibile', 'sezioni.research.noRecord.unreadable'],
]);

/* ------------------------------------------------------------------------------ il bilancio */

/**
 * ⛔ Cinque categorie, non quattro, e le contese **fuori** dalle parziali: è la decisione del
 *   mobile (`researchVerification.ts:518-543`) e la ragione è che «il mondo non concorda» non è
 *   «sostenuta con riserva». Mescolarle farebbe sembrare risolto ciò che è aperto.
 * ⛔ `nonVerificate` resta separata da `nonSostenute`: «non abbiamo controllato» e «abbiamo
 *   controllato e la fonte non lo dice» sono due ammissioni diverse.
 */
export function bilancioDaRecord(record) {
  const claims = Array.isArray(record?.claims) ? record.claims : [];
  const quante = (quale) => claims.filter((c) => c?.checks?.claimSupported === quale).length;
  return {
    totale: claims.length,
    sostenute: quante('yes'),
    inParte: quante('partial'),
    contese: quante('contested'),
    nonSostenute: quante('no'),
    /* Tutto ciò che non è uno dei quattro verdetti espliciti è «non verificata», compreso un
       record vecchio che quel campo non ce l'ha: non si conta come sostenuta per distrazione. */
    nonVerificate: claims.filter((c) => !['yes', 'partial', 'contested', 'no'].includes(c?.checks?.claimSupported)).length,
  };
}

/** I pezzi della barra, in ordine di lettura, col tono già scelto fra quelli che i temi hanno. */
export const PEZZI_BILANCIO = [
  { chiave: 'sostenute', get parola() { return traduci('sezioni.research.tally.supported'); }, tono: 'success' },
  { chiave: 'inParte', get parola() { return traduci('sezioni.research.tally.partly'); }, tono: 'warning' },
  { chiave: 'contese', get parola() { return traduci('sezioni.research.tally.contested'); }, tono: 'info' },
  { chiave: 'nonSostenute', get parola() { return traduci('sezioni.research.tally.notSupported'); }, tono: 'danger' },
  { chiave: 'nonVerificate', get parola() { return traduci('sezioni.research.tally.unverified'); }, tono: 'muted' },
];

/** La parola di un pezzo del bilancio: «1 contesa» al singolare, come in italiano si dice. */
const parolaDelPezzo = (pezzo, quante) => (pezzo.chiave === 'contese' && quante === 1 ? traduci('sezioni.research.tally.contestedOne') : pezzo.parola);

/** «9 sostenute · 2 in parte · 1 contesa · 3 non verificate» — solo le voci che esistono. */
export function frasiBilancio(bilancio) {
  if (!bilancio || !bilancio.totale) return traduci('sezioni.research.tally.none');
  const pezzi = PEZZI_BILANCIO
    .filter((p) => bilancio[p.chiave] > 0)
    .map((p) => `${bilancio[p.chiave]} ${parolaDelPezzo(p, bilancio[p.chiave])}`);
  return pezzi.join(' · ');
}

/** Il verdetto di un'affermazione, nelle parole del mobile (`researchReport.ts:67-77`). */
export function verdettoInParole(checks) {
  switch (checks?.claimSupported) {
    case 'yes': return { parola: traduci('sezioni.research.verdict.yes'), tono: 'success' };
    case 'partial': return { parola: traduci('sezioni.research.verdict.partial'), tono: 'warning' };
    case 'no': return { parola: traduci('sezioni.research.verdict.no'), tono: 'danger' };
    case 'contested': return { parola: traduci('sezioni.research.verdict.contested'), tono: 'info' };
    default: return { parola: traduci('sezioni.research.verdict.unverified'), tono: '' };
  }
}

/** Come la fonte è stata ottenuta: «pagina letta» o «solo estratto», mai una sigla. */
export function comeOttenuta(obtained) {
  if (obtained === 'page') return traduci('sezioni.research.obtained.page');
  if (obtained === 'snippet') return traduci('sezioni.research.obtained.snippet');
  return traduci('sezioni.research.obtained.unknown');
}

/* ------------------------------------------------------- le prove distinte (non gli indirizzi) */

/*
 * ⛔ Porto alla lettera di `mobile/src/lib/research/researchIndependence.ts:45-80`: la lista
 *   pubblica dei suffissi è un file da megabyte che cambia ogni settimana, e qui serve solo a non
 *   tagliare `bbc.co.uk` in `co.uk` — cioè a non far sembrare DIPENDENTI due prove indipendenti,
 *   che è l'errore peggiore dei due.
 */
const SUFFISSI_DI_SECONDO_LIVELLO = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.in', 'net.in', 'org.in', 'gov.in',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn',
  'co.za', 'org.za', 'gov.za',
  'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw',
  'gov.it', 'edu.it',
]);

/** Il dominio sotto cui la fonte è registrata, o `null`: un indirizzo illeggibile non fa gruppo. */
export function dominioRegistrabile(url) {
  let host;
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
  if (!host) return null;
  const parti = host.split('.').filter(Boolean);
  if (parti.length <= 2) return parti.join('.') || null;
  const ultimiDue = parti.slice(-2).join('.');
  return parti.slice(-(SUFFISSI_DI_SECONDO_LIVELLO.has(ultimiDue) ? 3 : 2)).join('.');
}

/**
 * «7 prove distinte su 14 indirizzi»: il numero che conta è quello dei GRUPPI.
 *
 * ⛔ Un indirizzo illeggibile fa gruppo **a sé** e non sparisce: toglierlo abbasserebbe il
 *   denominatore e farebbe sembrare la ricerca più solida di quanto sia.
 */
export function proveDistinte(sources) {
  const elenco = Array.isArray(sources) ? sources : [];
  const gruppi = new Map();
  elenco.forEach((fonte, indice) => {
    const chiave = dominioRegistrabile(fonte?.url) || `senza-dominio-${indice}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(indice);
  });
  const quanti = gruppi.size;
  const indirizzi = elenco.length;
  const frase = indirizzi === 0
    ? traduci('sezioni.research.proofs.none')
    : traduci('sezioni.research.proofs.summary', {
      proofs: tn('sezioni.research.proofs.distinctOne', 'sezioni.research.proofs.distinctMany', quanti),
      addresses: tn('sezioni.research.proofs.addressesOne', 'sezioni.research.proofs.addressesMany', indirizzi),
    });
  return { gruppi: quanti, indirizzi, frase, perIndice: gruppi };
}

/** Il gruppo di una fonte, per la riga: il dominio, o la parola che dice che non ce n'è uno. */
export function gruppoDellaFonte(fonte) {
  return dominioRegistrabile(fonte?.url) || traduci('sezioni.research.proofs.unreadableAddress');
}

/* ------------------------------------------------------------------- le citazioni da esportare */

/*
 * Porto di `mobile/src/lib/research/researchCitationExport.ts:80-118`, verbatim nella sostanza.
 * ⛔ Cosa NON esce, ed è una decisione di privacy del mobile che qui si rispetta: la domanda, il
 *   modello che ha giudicato, l'identificativo della ricerca e la chat. Una citazione descrive una
 *   PAGINA, non chi l'ha letta — e un file di bibliografia finisce in cartelle condivise.
 */

/** Le citazioni che escono: quattro campi, e nient'altro. */
export function citazioniDaRecord(record, letteAlle) {
  const quando = /^\d{4}-\d{2}-\d{2}/.exec(String(letteAlle ?? ''))?.[0] || '';
  return (Array.isArray(record?.sources) ? record.sources : []).map((fonte) => ({
    url: String(fonte?.url ?? ''),
    title: String(fonte?.title ?? ''),
    publishedAt: typeof fonte?.publishedAt === 'string' ? fonte.publishedAt : null,
    accessedAt: quando,
  }));
}

function anno(iso) {
  if (!iso) return null;
  return /^(\d{4})/.exec(String(iso).trim())?.[1] || null;
}

/** ⛔ Una graffa spaiata fa saltare la voce **in silenzio**: si toglie, non si scappa. */
function bibtexSicuro(testo) { return String(testo ?? '').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim(); }
/** In RIS ogni riga è un campo: un a capo dentro un valore spezza il record. */
function risSicuro(testo) { return String(testo ?? '').replace(/\s+/g, ' ').trim(); }

/** ⛔ Due chiavi uguali e il gestore ne butta una senza dirlo: la prima resta pulita, poi b, c… */
function chiaviDistinte(citazioni) {
  const viste = new Map();
  return citazioni.map((c) => {
    const host = dominioRegistrabile(c.url) || 'fonte';
    const base = `${host.replace(/[^a-z0-9]/gi, '')}${anno(c.publishedAt) ?? ''}`;
    const quante = viste.get(base) ?? 0;
    viste.set(base, quante + 1);
    return quante === 0 ? base : `${base}${String.fromCharCode(97 + quante)}`;
  });
}

export function bibtexDaCitazioni(citazioni) {
  const elenco = Array.isArray(citazioni) ? citazioni : [];
  if (elenco.length === 0) return '';
  const chiavi = chiaviDistinte(elenco);
  return elenco.map((c, i) => {
    const righe = [
      `  title = {${bibtexSicuro(c.title)}}`,
      `  url = {${String(c.url ?? '').trim()}}`,
      `  urldate = {${String(c.accessedAt ?? '').trim()}}`,
    ];
    const quando = anno(c.publishedAt);
    // ⛔ Un anno inventato è peggio di un anno mancante: chi cita si fida.
    if (quando) righe.splice(1, 0, `  year = {${quando}}`);
    // `@misc` è il tipo di una risorsa online: `@article` prometterebbe una rivista.
    return `@misc{${chiavi[i]},\n${righe.join(',\n')},\n}`;
  }).join('\n\n');
}

export function risDaCitazioni(citazioni) {
  const elenco = Array.isArray(citazioni) ? citazioni : [];
  if (elenco.length === 0) return '';
  return elenco.map((c) => {
    const righe = ['TY  - ELEC', `TI  - ${risSicuro(c.title)}`, `UR  - ${String(c.url ?? '').trim()}`];
    const quando = anno(c.publishedAt);
    if (quando) righe.push(`PY  - ${quando}`);
    righe.push(`Y2  - ${String(c.accessedAt ?? '').trim().replace(/-/g, '/')}`);
    // ⛔ `ER` chiude il record e la sua riga finisce con uno spazio: senza, i gestori non vedono la fine.
    righe.push('ER  - ');
    return righe.join('\n');
  }).join('\n\n');
}

/** Un nome di file che sopravvive a Windows e al disco di chi lo riceve. */
export function nomeFileRapporto(domanda, estensione) {
  const pulito = String(domanda ?? '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${pulito || 'ricerca'}.${estensione}`;
}

/* ------------------------------------------------------------------ il magazzino dei rapporti */

const MAGAZZINI = new WeakMap();

/**
 * Lo stato vivo della sezione: il testo dei rapporti già letti, e quale vista è aperta.
 *
 * ⛔ Vive per SCHERMO e non dentro il componente della sezione perché `montaSezione` ridisegna il
 *   dettaglio a ogni battuta nel campo di ricerca: senza un posto dove ricordare, ogni lettera
 *   digitata rifarebbe la stessa GET.
 */
export function magazzinoRicerche(schermo) {
  let magazzino = MAGAZZINI.get(schermo);
  if (!magazzino) {
    magazzino = {
      rapporti: new Map(), viste: new Map(), collegato: false,
      /* L5 (12/09): la scheda intera letta da `GET …/research/:id` (piano, passi, spesa, giornale)
         e l'esito dell'ultima ri-verifica, che il server NON persiste (rapporto L5 §6.2). */
      dettagli: new Map(), riverifiche: new Map(), orologio: null,
    };
    MAGAZZINI.set(schermo, magazzino);
  }
  /* Un magazzino nato prima di L5 (una sezione già montata) non ha le tre chiavi nuove. */
  if (!magazzino.dettagli) magazzino.dettagli = new Map();
  if (!magazzino.riverifiche) magazzino.riverifiche = new Map();
  return magazzino;
}

/* --------------------------------------- L5: la sezione che si aggiorna mentre la ricerca lavora */

/**
 * ⭐⭐⭐ 12/09/2026 — LA CARD CHE RESTAVA «IN CORSO» PER SEMPRE.
 *
 * Trovato nel giro vero L8 (foto `scratchpad/l8/fine-Rapporto.png`): la sessione figlia era
 * conclusa, il server rispondeva già `senza-rapporto`, e la scheda diceva ancora «In corso» finché
 * qualcuno non premeva «Aggiorna». Una schermata che mostra uno stato vecchio e non lo sa è la
 * stessa famiglia di guasto dell'elenco che diceva «Conclusa» sul dettaglio «bloccata».
 *
 * ⛔⛔ PERCHÉ UN OROLOGIO E NON UN EVENTO — misurato, non preferito. Gli eventi della sessione
 *   FIGLIA non arrivano al browser: ogni sessione ha il suo buffer e i suoi iscritti, e in
 *   `session-registry.mjs` non c'è una sola riga che inoltri gli eventi di una figlia al flusso
 *   della madre (cercato: nessun rinvio, e `elencaFigli` è del sotto-agente, non della ricerca).
 *   ⇒ Oggi, da questa pagina, l'unico modo VERO di sapere che una ricerca è finita è richiedere
 *   l'elenco. Dirlo qui, perché il giorno in cui la figlia inoltrerà la sua fine questa funzione
 *   diventi un ripiego invece di restare l'unica via.
 * ⛔ Si accende SOLO se c'è almeno una ricerca `running`, e si spegne da sé quando non ce n'è più:
 *   una pagina ferma non deve bussare al server per sempre. Una `paused` non cambia da sola —
 *   aspetta una persona — quindi non tiene acceso niente.
 * ⛔ Un solo orologio per schermo, riarmato a ogni disegno: `montaSezione` ridisegna a ogni lettera
 *   digitata nel campo di ricerca, e senza la cancellazione qui sopra una ricerca di otto lettere
 *   lascerebbe otto timer che bussano insieme.
 * ⛔ `avvia`/`ferma` iniettabili: un test che aspetta trenta secondi veri misura la macchina.
 */
export const INTERVALLO_RICERCHE_VIVE = 30_000;

/** Le ricerche che possono cambiare stato DA SOLE. Solo `running`: le altre aspettano una persona. */
export function ricercheInCorso(elenco) {
  return (Array.isArray(elenco) ? elenco : []).filter((r) => r?.stato === 'running');
}

export function governoRicercheVive(schermo, {
  elenco, aggiorna, intervallo = INTERVALLO_RICERCHE_VIVE,
  avvia = setTimeout, ferma = clearTimeout,
} = {}) {
  const magazzino = magazzinoRicerche(schermo);
  if (magazzino.orologio) { ferma(magazzino.orologio); magazzino.orologio = null; }
  const vive = ricercheInCorso(elenco).length;
  /* ⛔ `hidden` è la pagina non guardata: chi ha cambiato schermata non deve pagare richieste. */
  if (!vive || typeof aggiorna !== 'function' || schermo?.hidden === true) return { vive, acceso: false };
  magazzino.orologio = avvia(() => { magazzino.orologio = null; aggiorna(); }, intervallo);
  return { vive, acceso: true };
}

/* ------------------------------------------- L5: «le fonti dicono ancora questo?», detto onesto */

/*
 * ⛔⛔⛔ I QUATTRO STATI DI UNA FONTE RI-LETTA, e il quarto è il motivo per cui questa vista
 *   esiste. `non-misurabile` NON è «a posto»: vuol dire che il testo tenuto non era attribuibile a
 *   quell'indirizzo (`fonti/<sha256>.txt` prende il nome dal CONTENUTO, non dall'url) e che
 *   «intatta»/«cambiata» oggi non si possono dire — rapporto L5 §3.4. Il modulo che misura,
 *   chiamato senza quella mappa, risponderebbe `intact` su tutto: un timbro di verifica su una
 *   pagina che nessuno ha confrontato, cioè esattamente il falso che tutto il disegno esiste per
 *   togliere. ⇒ qui `non-misurabile` ha un tono NEUTRO e una frase che dice cosa manca.
 * ⛔ Nessun tono `success` su `irraggiungibile` per via dei `passaggiPersi: 0`: zero passaggi persi
 *   su una pagina che non si è aperta non è una buona notizia, è una non-notizia.
 */
export const STATI_FONTE_RIVERIFICA = new Map([
  ['intatta', { get parola() { return traduci('sezioni.research.recheck.intact.word'); }, tono: 'success', get spiega() { return traduci('sezioni.research.recheck.intact.explain'); } }],
  ['cambiata', { get parola() { return traduci('sezioni.research.recheck.changed.word'); }, tono: 'warning', get spiega() { return traduci('sezioni.research.recheck.changed.explain'); } }],
  ['irraggiungibile', { get parola() { return traduci('sezioni.research.recheck.unreachable.word'); }, tono: 'danger', get spiega() { return traduci('sezioni.research.recheck.unreachable.explain'); } }],
  ['non-misurabile', { get parola() { return traduci('sezioni.research.recheck.unmeasurable.word'); }, tono: '', get spiega() { return traduci('sezioni.research.recheck.unmeasurable.explain'); } }],
]);

export function statoFonteRiverifica(stato) {
  return STATI_FONTE_RIVERIFICA.get(stato) || { parola: traduci('sezioni.research.recheck.unknown.word'), tono: '', spiega: traduci('sezioni.research.recheck.unknown.explain') };
}

/**
 * Il bilancio della ri-verifica in una frase.
 *
 * ⛔ Il numero che conta e che è VERO oggi è `passaggiPersi`: una citazione che non risolve più
 *   alle parole che citava. Va per primo quando c'è, perché è l'unica cosa che una persona deve
 *   fare qualcosa per sapere. ⛔ E non si dice «tutto a posto» quando il misurabile è zero.
 */
export function frasiRiverifica(riverifica) {
  const b = riverifica?.bilancio || {};
  const fonti = Number(b.fonti) || 0;
  if (!fonti) return traduci('sezioni.research.recheck.noSources');
  const pezzi = [];
  if (b.passaggiPersi > 0) pezzi.push(tn('sezioni.research.recheck.lostOne', 'sezioni.research.recheck.lostMany', b.passaggiPersi));
  if (b.passaggiRitrovati > 0) pezzi.push(traduci('sezioni.research.recheck.found', { n: b.passaggiRitrovati }));
  if (b.cambiate > 0) pezzi.push(tn('sezioni.research.recheck.changedOne', 'sezioni.research.recheck.changedMany', b.cambiate));
  if (b.irraggiungibili > 0) pezzi.push(tn('sezioni.research.recheck.unreachableOne', 'sezioni.research.recheck.unreachableMany', b.irraggiungibili));
  if (b.nonMisurabili > 0) pezzi.push(traduci('sezioni.research.recheck.unmeasurable', { n: b.nonMisurabili }));
  const testa = tn('sezioni.research.recheck.headOne', 'sezioni.research.recheck.headMany', fonti);
  return pezzi.length ? `${testa}: ${pezzi.join(' · ')}` : testa;
}

export const VISTE = [
  { id: 'rapporto', get parola() { return traduci('sezioni.research.view.report'); } },
  { id: 'affermazioni', get parola() { return traduci('sezioni.research.view.claims'); } },
  { id: 'fonti', get parola() { return traduci('sezioni.research.view.sources'); } },
  { id: 'piano', get parola() { return traduci('sezioni.research.view.plan'); } },
  { id: 'andata', get parola() { return traduci('sezioni.research.view.howItWent'); } },
];

/* --------------------------------------------------------------------------- costruzione DOM */

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

function iconaSvg(doc, nome) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

function tag(doc, testo, tono) {
  const el = nodo(doc, 'span', 'td-tag', testo);
  if (tono) el.dataset.tone = tono;
  return el;
}

/**
 * La prosa del rapporto.
 *
 * ⛔ Si RIUSA il render della chat quando c'è: `legacy/app.js` lo inietta come `rendiMarkdown`
 *   (`renderizzaMarkdownSemplice`, riga 2267), e un secondo motore Markdown sarebbe una seconda
 *   cosa da tenere allineata alla prima. Senza iniezione — nel laboratorio, o prima
 *   dell'aggancio — si cade su una lettura strutturale minima: titoli, citazioni e paragrafi, che
 *   è quanto serve a non mostrare i cancelletti del Markdown a schermo. Nessun HTML da stringa.
 */
export function prosaInNodi(doc, prosa, rendiMarkdown, titoloGiaDetto = '') {
  const contenitore = nodo(doc, 'div', 'td-prosa-rapporto');
  if (typeof rendiMarkdown === 'function') {
    const reso = rendiMarkdown(String(prosa ?? ''));
    if (reso) { contenitore.append(reso); return contenitore; }
  }
  let paragrafo = [];
  const chiudi = () => {
    if (!paragrafo.length) return;
    /* ⛔ Le righe di un paragrafo si ricompongono con uno SPAZIO: nel file il testo va a capo a
       cento colonne, e tenere quegli a capo dava righe spezzate a metà frase a schermo (visto
       nella foto del rapporto senza record). */
    contenitore.append(nodo(doc, 'p', 'td-prose', paragrafo.join(' ')));
    paragrafo = [];
  };
  const normale = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('it');
  let primoTitolo = true;
  for (const riga of String(prosa ?? '').split('\n')) {
    const titolo = /^(#{1,6})\s+(.*)$/.exec(riga);
    if (titolo) {
      chiudi();
      /* ⛔ Il primo titolo del file è la DOMANDA, che sta già in cima al dettaglio: stamparlo di
         nuovo dava lo stesso titolo due volte, una sotto l'altra. */
      if (primoTitolo && titoloGiaDetto && normale(titolo[2]) === normale(titoloGiaDetto)) { primoTitolo = false; continue; }
      primoTitolo = false;
      const livello = Math.min(titolo[1].length + 1, 4); // h1 del file diventa h2 nel pannello
      contenitore.append(nodo(doc, `h${livello}`, '', titolo[2]));
      continue;
    }
    if (/^>\s?/.test(riga)) {
      chiudi();
      contenitore.append(nodo(doc, 'blockquote', 'td-passaggio', riga.replace(/^>\s?/, '')));
      continue;
    }
    if (!riga.trim()) { chiudi(); continue; }
    paragrafo.push(riga);
  }
  chiudi();
  return contenitore;
}

/** La barra del bilancio: proporzioni vere, coi quattro toni che i temi già hanno più il muto. */
export function barraBilancio(doc, bilancio) {
  const blocco = nodo(doc, 'div', 'td-bilancio');
  const barra = nodo(doc, 'div', 'td-bilancio-barra');
  barra.setAttribute('role', 'img');
  barra.setAttribute('aria-label', traduci("sezioni.research.tally.ariaLabel", { summary: frasiBilancio(bilancio) }));
  for (const pezzo of PEZZI_BILANCIO) {
    const quante = bilancio[pezzo.chiave] || 0;
    if (!quante) continue;
    const fetta = nodo(doc, 'i');
    fetta.dataset.tone = pezzo.tono;
    fetta.style.flexGrow = String(quante);
    barra.append(fetta);
  }
  blocco.append(barra);
  const voci = nodo(doc, 'div', 'td-bilancio-voci');
  for (const pezzo of PEZZI_BILANCIO) {
    const quante = bilancio[pezzo.chiave] || 0;
    if (!quante) continue;
    const voce = nodo(doc, 'span');
    const pallino = nodo(doc, 'i');
    pallino.dataset.tone = pezzo.tono;
    voce.append(pallino, doc.createTextNode(`${quante} ${parolaDelPezzo(pezzo, quante)}`));
    voci.append(voce);
  }
  blocco.append(voci);
  return blocco;
}

/* ----------------------------------------------------------------------------- le cinque viste */

function vistaRapporto(doc, voce, lettura, ctx, dettaglio) {
  const pezzi = [];
  const frasi = frasiVoce(voce);
  const deposito = testoDepositato(voce, lettura, dettaglio);
  if (!haRapportoLeggibile(voce)) {
    /*
     * ⛔ VISTO NELLA FOTO (`respinta_menu-dark-1440`, 12/09): «Questa ricerca non ha depositato un
     *   rapporto» stampato sopra ottomila byte di testo depositato. Vero alla lettera — quel testo
     *   un rapporto non è — e falso a leggerlo, perché nella stessa schermata c'è il contrario.
     *   ⇒ quando qualcosa è stato depositato si dice quello: ha depositato, e non ha passato il
     *   controllo. È la stessa frase, senza la parte che si contraddice da sola.
     */
    const respinto = deposito.genere === 'respinto';
    pezzi.push(nodo(doc, 'p', 'td-prose', respinto
      ? traduci('sezioni.research.report.rejected')
      : (conclusaDavvero(voce?.stato)
        ? traduci('sezioni.research.report.concludedNoReport')
        : traduci('sezioni.research.report.noReport'))));
    /* ⛔ La spiegazione sta già sotto il titolo quando la ricerca NON è conclusa: ripeterla qui la
       fa leggere due volte nella stessa schermata (visto nella foto a 1024 px). */
    if (conclusaDavvero(voce?.stato)) pezzi.push(nodo(doc, 'p', 'td-subtle', frasi.spiegazione));
    /*
     * ⛔⛔ IL FILE C'È, MA NON È IL RAPPORTO — la foto dell'11/09 sul 4174, ricerca `d2a453a8`:
     *   `senza-rapporto` con un `reportLibraryId` vero, e questo pannello stampava i 290 byte di
     *   scusa del modello come se fossero il rapporto («sotto c'è il testo così com'è stato
     *   scritto»). Il cancello di consegna aveva già respinto quel file: mostrarlo al posto del
     *   rapporto rifà lo stesso guasto un livello più in basso.
     * ⇒ Si mostra, perché nasconderlo lascerebbe la persona a chiedersi cosa c'è in Libreria — ma
     *   sotto il suo nome vero, «Ciò che è stato depositato», e come ALLEGATO: lo stesso trattamento
     *   che l'ultimo messaggio ha in «Come è andata».
     */
    /*
     * ⛔⛔ 12/09, LA FOTO DEL 4174 — la condizione era `frasi.haRapporto`, cioè «c'è una voce di
     *   LIBRERIA». Su una consegna respinta in Libreria non finisce niente: il testo sta nella
     *   cartella della ricerca e arriva come `contenutoRespinto` dalla rotta del dettaglio. ⇒ 8.953
     *   byte di lavoro pagato non comparivano da nessuna parte, e questo pannello diceva soltanto
     *   «non ha depositato un rapporto» — vero a metà, e la metà taciuta era tutto il lavoro.
     */
    if (frasi.haRapporto || deposito.genere === 'respinto') {
      pezzi.push(nodo(doc, 'h3', '', traduci('sezioni.research.report.filedHeading')));
      /* ⛔ VISTO NELLA FOTO (ric-scusa, chiaro, 1440): questa riga ripeteva parola per parola il
         motivo che il server manda e che sta già due righe sopra, sotto il titolo. Qui si dice
         solo CHE COS'È il file; il perché lo dice il motivo, una volta sola. */
      /* ⛔ E NEMMENO QUESTA RIGA PUÒ DIRE «in Libreria» SEMPRE: su una consegna respinta in
         Libreria non è finito niente — il testo vive nella cartella della ricerca. Dire dov'è una
         cosa è utile solo se è dove si dice. Due strade, due frasi. */
      pezzi.push(nodo(doc, 'p', 'td-subtle', frasi.haRapporto
        ? traduci('sezioni.research.report.filedFromLibrary')
        : traduci('sezioni.research.report.filedText')));
      if (deposito.genere === 'respinto') {
        pezzi.push(nodo(doc, 'blockquote', 'td-allegato', deposito.testo));
      } else if (lettura?.stato === 'pronto') {
        pezzi.push(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.filedEmpty')));
      } else if (lettura?.stato === 'errore') {
        const p = nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.filedOpenFailed', { reason: lettura.errore }));
        p.setAttribute('role', 'alert');
        pezzi.push(p);
      } else if (!ctx?.puoLeggere) {
        pezzi.push(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.inLibrary')));
      } else {
        pezzi.push(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.readingFiled')));
      }
    }
    /* ⛔ Il puntatore all'ultimo messaggio è qui, e dice cos'è: senza questa riga qualcuno andrebbe
       a cercarlo e lo scambierebbe per il rapporto — che è esattamente il guasto dell'11/09. */
    if (voce?.ultimoMessaggio) pezzi.push(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.lastMessageNote')));
    return pezzi;
  }
  /*
   * ⛔ TROVATO PRIMA DI CONSEGNARE, non da una foto: se nessuno inietta `leggiRapporto` (oggi
   *   `legacy/app.js` non lo passa ancora) la lettura non parte mai, e questo pannello restava su
   *   «Leggo il rapporto…» PER SEMPRE — un'attesa che non finisce è una bugia come «Conclusa» su
   *   una ricerca senza rapporto. Qui si dice com'è: il rapporto c'è, ed è in Libreria.
   *   La riga sparisce da sola il giorno in cui l'aggancio passa `leggiRapporto`.
   */
  if (!lettura && !ctx?.puoLeggere) {
    pezzi.push(nodo(doc, 'p', 'td-prose', traduci('sezioni.research.report.inLibraryNotice')));
    pezzi.push(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.notOpenableHere')));
    return pezzi;
  }
  if (!lettura || lettura.stato === 'caricando') {
    pezzi.push(nodo(doc, 'p', 'td-prose', traduci('sezioni.research.report.reading')));
    return pezzi;
  }
  if (lettura.stato === 'errore') {
    const p = nodo(doc, 'p', 'td-prose', traduci('sezioni.research.report.openFailed', { reason: lettura.errore }));
    p.setAttribute('role', 'alert');
    pezzi.push(p, nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.report.livesInLibrary')));
    return pezzi;
  }
  if (!lettura.record) {
    pezzi.push(nodo(doc, 'p', 'td-subtle', PERCHE_SENZA_RECORD.get(lettura.perche) || traduci('sezioni.research.noRecord.fallback')));
  }
  /*
   * ⛔ COL RECORD SI MOSTRA LA RISPOSTA, NON TUTTO IL FILE. Trovato guardando la foto: il file del
   *   rapporto è domanda + risposta + riga del bilancio + affermazioni + fonti, e questa schermata
   *   mostra già la domanda nel titolo, il bilancio nella barra, le affermazioni e le fonti nelle
   *   loro viste ⇒ stampare il file intero faceva leggere OGNI cosa due volte, e il titolo tre.
   *   Qui resta la risposta; il file intero esce com'è da «Esporta».
   *   Senza record non c'è niente da cui ricavare la risposta: si mostra tutto, che è quanto abbiamo.
   */
  const testo = lettura.record?.summary?.trim() ? lettura.record.summary : lettura.prosa;
  if (testo) pezzi.push(prosaInNodi(doc, testo, ctx?.rendiMarkdown, frasi.domanda));
  else pezzi.push(nodo(doc, 'p', 'td-prose', traduci('sezioni.research.noRecord.empty')));
  return pezzi;
}

function vistaAffermazioni(doc, voce, lettura) {
  if (!lettura?.record) {
    return [nodo(doc, 'p', 'td-prose', traduci('sezioni.research.claims.intro')),
      nodo(doc, 'p', 'td-subtle', lettura?.record === null && lettura?.perche ? (PERCHE_SENZA_RECORD.get(lettura.perche) || '') : traduci('sezioni.research.claims.noneYet'))];
  }
  const { claims = [], sources = [] } = lettura.record;
  if (!claims.length) return [nodo(doc, 'p', 'td-prose', traduci('sezioni.research.claims.none'))];
  return claims.map((entrata, indice) => {
    const verdetto = verdettoInParole(entrata?.checks);
    const blocco = nodo(doc, 'article', 'td-affermazione');
    const testa = nodo(doc, 'div', 'td-affermazione-testa');
    testa.append(nodo(doc, 'span', 'td-affermazione-numero', String(indice + 1)), tag(doc, verdetto.parola, verdetto.tono));
    blocco.append(testa, nodo(doc, 'p', 'td-affermazione-testo', entrata?.text || traduci('sezioni.research.claims.noText')));
    if (entrata?.checks?.supportReason) blocco.append(nodo(doc, 'p', 'td-subtle', testoDelCampo(entrata.checks, 'supportReason')));
    /*
     * ⛔ Il passaggio È la porzione citata: sul mobile nasce come `source.text.slice(span.from,
     *   span.to)` (`researchVerification.ts:424`), quindi non c'è niente da evidenziare dentro —
     *   il disegno §6.7 immaginava un'evidenziazione perché dava per scontato che qui arrivasse
     *   anche il testo INTERO della fonte, che il record non porta.
     */
    if (entrata?.passage) blocco.append(nodo(doc, 'blockquote', 'td-passaggio', entrata.passage));
    else blocco.append(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.claims.passageMissing')));
    const fonte = sources[(entrata?.sourceIndex ?? 0) - 1];
    const piede = nodo(doc, 'div', 'td-affermazione-piede');
    if (fonte) {
      const link = nodo(doc, 'a', '', fonte.title || fonte.url);
      link.href = fonte.url || '#';
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      piede.append(link, nodo(doc, 'span', 'td-subtle', comeOttenuta(fonte.obtained)));
    } else {
      piede.append(nodo(doc, 'span', 'td-subtle', traduci('sezioni.research.claims.sourceNeverGathered')));
    }
    if (entrata?.checks?.judge) piede.append(nodo(doc, 'span', 'td-subtle', traduci('sezioni.research.claims.judgedBy', { judge: entrata.checks.judge })));
    blocco.append(piede);
    /* Le contrarie, affiancate e mai mediate: una contesa si mostra con tutte e due le versioni. */
    for (const contraria of Array.isArray(entrata?.checks?.opposing) ? entrata.checks.opposing : []) {
      const box = nodo(doc, 'div', 'td-contraria');
      box.append(nodo(doc, 'span', 'td-subtle', traduci('sezioni.research.claims.opposing')));
      if (contraria?.passage) box.append(nodo(doc, 'blockquote', 'td-passaggio', contraria.passage));
      const link = nodo(doc, 'a', '', contraria?.title || contraria?.url || traduci('sezioni.research.sources.untitled'));
      link.href = contraria?.url || '#';
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      box.append(link);
      blocco.append(box);
    }
    return blocco;
  });
}

/* ════════════════════════════ L5-bis (12/09): LA SUITE DI ESPORTAZIONI ═══════════════════════ */

/*
 * ⛔⛔⛔ ORDINE DELL'OWNER, 12/09/2026: «la ricerca approfondita deve avere una suite di
 *   esportazioni COMPLETA». Nove uscite invece di tre, dietro UNA voce di menu.
 *
 * ⛔ PERCHÉ UN PANNELLO E NON UN SOTTOMENU. Il menu «⋯» di questo prodotto è uno solo — lo stesso
 *   dell'albero dei file, della Libreria e delle sezioni scrivibili (`apriMenuAzioniLibreria`) — e
 *   non ha i sottomenu: darglieli vorrebbe dire aggiungere a un componente CONDIVISO una regia di
 *   tastiera nuova (frecce che entrano ed escono, `aria-haspopup` annidato) per una sola famiglia
 *   di voci. E nove righe con tre toni di PDF in un menu a comparsa non si leggono. ⇒ una voce
 *   sola, «Esporta…», che apre il pannello di scelta — la seconda forma che l'ordine ammette.
 *
 * ⛔ IL NOME DEL FILE LO DECIDE IL SERVER, e non è un dettaglio: MDN «Content-Disposition» e
 *   «<a download>» (lette il 12/09/2026) dicono che, quando l'intestazione porta un `filename`,
 *   quello **vince** sull'attributo `download`. ⇒ qui `download` si mette SENZA valore (il browser
 *   prende il nome dall'intestazione) e il messaggio d'esito NON inventa un nome di file: dire «è
 *   in Ricerca.pdf» mentre sul disco è finito `rapporto-2026-09-12.pdf` è una bugia piccola e
 *   gratuita. Il messaggio nomina il FORMATO — che è anche il nome della voce premuta.
 */

/** Le nove uscite, nell'ordine dell'owner. `vuoleRecord` = senza il riepilogo non esiste. */
export const FORMATI_ESPORTAZIONE = [
  { chiave: 'md', formato: 'md', gruppo: 'documenti', etichetta: 'Markdown', get spiega() { return traduci('sezioni.research.export.format.md.explain'); } },
  { chiave: 'pdf-report', formato: 'pdf', tono: 'report', gruppo: 'documenti', get etichetta() { return traduci('sezioni.research.export.format.pdfReport.label'); }, get spiega() { return traduci('sezioni.research.export.format.pdfReport.explain'); } },
  { chiave: 'pdf-brief', formato: 'pdf', tono: 'brief', gruppo: 'documenti', get etichetta() { return traduci('sezioni.research.export.format.pdfBrief.label'); }, get spiega() { return traduci('sezioni.research.export.format.pdfBrief.explain'); } },
  { chiave: 'pdf-dossier', formato: 'pdf', tono: 'dossier', gruppo: 'documenti', get etichetta() { return traduci('sezioni.research.export.format.pdfDossier.label'); }, get spiega() { return traduci('sezioni.research.export.format.pdfDossier.explain'); } },
  { chiave: 'docx', formato: 'docx', gruppo: 'documenti', etichetta: 'Word', get spiega() { return traduci('sezioni.research.export.format.docx.explain'); } },
  { chiave: 'html', formato: 'html', gruppo: 'documenti', get etichetta() { return traduci('sezioni.research.export.format.html.label'); }, get spiega() { return traduci('sezioni.research.export.format.html.explain'); } },
  { chiave: 'json', formato: 'json', gruppo: 'dati', vuoleRecord: true, get etichetta() { return traduci('sezioni.research.export.format.json.label'); }, get spiega() { return traduci('sezioni.research.export.format.json.explain'); } },
  { chiave: 'bib', formato: 'bib', gruppo: 'dati', vuoleRecord: true, etichetta: 'BibTeX', get spiega() { return traduci('sezioni.research.export.format.bib.explain'); } },
  { chiave: 'ris', formato: 'ris', gruppo: 'dati', vuoleRecord: true, etichetta: 'RIS', get spiega() { return traduci('sezioni.research.export.format.ris.explain'); } },
  { chiave: 'fonti', formato: 'fonti', gruppo: 'dati', vuoleRecord: true, get etichetta() { return traduci('sezioni.research.export.format.sources.label'); }, get spiega() { return traduci('sezioni.research.export.format.sources.explain'); } },
  { chiave: 'copia', gruppo: 'appunti', get etichetta() { return traduci('sezioni.research.export.format.copy.label'); }, get spiega() { return traduci('sezioni.research.export.format.copy.explain'); } },
];

export const GRUPPI_ESPORTAZIONE = [
  { id: 'documenti', get parola() { return traduci('sezioni.research.export.group.documents'); } },
  { id: 'dati', get parola() { return traduci('sezioni.research.export.group.data'); } },
  { id: 'appunti', get parola() { return traduci('sezioni.research.export.group.clipboard'); } },
];

/** Il motivo per cui un'uscita non c'è. ⛔ Detto, non nascosto: sparire non insegna niente. */
export const MOTIVI_ESPORTAZIONE = {
  get senzaRapporto() { return traduci('sezioni.research.export.reason.noReport'); },
  get senzaRecord() { return traduci('sezioni.research.export.reason.noSummary'); },
  get senzaTesto() { return traduci('sezioni.research.export.reason.noText'); },
  /* ⛔ L'ultima frase detta in chat non è un documento, e un PDF che la impagina sarebbe un
     documento che finge di essere un rapporto. Si può copiare: è quello che vale. */
  get soloUltimoMessaggio() { return traduci('sezioni.research.export.reason.lastMessageOnly'); },
};

/**
 * Le nove uscite per QUESTA ricerca: quali si possono fare, e perché no.
 *
 * ⛔⛔ VOCI SPENTE, NON TOLTE — ed è l'opposto della scelta fatta per pausa/ripresa vent'righe più
 *   su, di proposito. Lì due voci alternative si scambiavano il posto e lo stato stava già nel
 *   timbro; qui l'elenco è un CATALOGO, e un catalogo da cui spariscono quattro righe fa credere
 *   che quelle uscite non esistano. W3C APG «Menu and Menubar Pattern» e MDN `aria-disabled`
 *   (lette il 12/09/2026): una voce spenta resta scopribile col Tab, e la funzionalità va
 *   soppressa a mano — che è quello che fa `montaPannelloEsportazioni`.
 * ⛔ Le quattro uscite di DATI muoiono col record, non col rapporto: è la stessa distinzione della
 *   rotta (409 per json/bib/ris/fonti, mentre md/html/pdf escono comunque «senza verifiche»).
 * ⛔ E quando il testo non è ancora stato letto NON si dichiara niente: `record` ignoto non è
 *   `record` assente. Le uscite di dati restano accese e decide il server.
 */
/**
 * ⛔⛔⛔ 12/09/2026, SECONDA FOTO SUL 4174 (`scratchpad/l8/dark-ricerca-menu.png`) — IL TESTO
 *   C'ERA, E IL MENU DICEVA DI NO.
 *
 * Sulla ricerca L8 `3029dea2` (`senza-rapporto`) il menu «⋯» aveva **due voci sole**: apri ed
 * elimina. Niente «Esporta…», niente «Copia». E sul disco c'erano **8.953 byte** di rapporto in
 * prosa, depositati e respinti dal cancello di consegna — cioè lavoro pagato che nessun comando
 * poteva tirare fuori.
 *
 * ⛔ LA CAUSA, e non è «una condizione troppo stretta»: questo file conosceva **una sola strada**
 *   per arrivare al testo di una ricerca — il file di Libreria, indirizzato da `reportLibraryId`.
 *   Quando il cancello respinge, in Libreria non finisce niente: il testo vive nella cartella della
 *   ricerca e la rotta del dettaglio lo espone come **`contenutoRespinto`** (L5 §4.2). Il menu
 *   guardava la porta sbagliata e concludeva che la stanza fosse vuota.
 *
 * ⇒ Le strade sono **tre**, e questa funzione le mette in fila una volta per tutte. Chi vuole il
 *   testo di una ricerca chiede QUI, e non deve più sapere da dove arriva.
 * ⛔ L'ordine conta ed è un ordine di VERITÀ, non di comodità: un rapporto accettato batte un testo
 *   respinto, e un testo respinto batte l'ultima frase detta in chat. Mai il contrario — è il
 *   guasto dell'11/09 (290 byte di scusa mostrati come rapporto) preso dall'altro lato.
 * ⛔ `suDisco` separa «il server ha un testo da impaginare» da «l'unica cosa che resta è una frase
 *   di chat»: la prima si può esportare in PDF, la seconda si può solo copiare. Un PDF dell'ultimo
 *   messaggio sarebbe un documento che finge di essere un rapporto.
 */
export function testoDepositato(voce, lettura = null, dettaglio = null) {
  const ricerca = dettaglio?.stato === 'pronto' ? dettaglio.ricerca : null;
  const letto = lettura?.stato === 'pronto';
  const daLibreria = letto ? String(lettura.prosa || lettura.testo || '').trim() : '';
  const accettato = String(ricerca?.contenutoRapporto ?? '').trim();
  const respinto = String(ricerca?.contenutoRespinto ?? '').trim();
  const ultimo = String(voce?.ultimoMessaggio ?? '').trim();
  if (haRapportoLeggibile(voce) && (daLibreria || accettato)) {
    return { testo: daLibreria || accettato, genere: 'rapporto', nome: traduci('sezioni.research.deposit.report'), suDisco: true };
  }
  if (respinto || daLibreria) {
    return { testo: respinto || daLibreria, genere: 'respinto', nome: traduci('sezioni.research.deposit.filedFile'), suDisco: true };
  }
  if (ultimo) return { testo: ultimo, genere: 'ultimo', nome: traduci('sezioni.research.deposit.lastMessage'), suDisco: false };
  return { testo: '', genere: null, nome: null, suDisco: false };
}

/**
 * IL SERVER HA UN TESTO DA IMPAGINARE? — domanda diversa da «noi ce l'abbiamo in mano».
 *
 * ⛔ Le due si confondono facilmente e sbagliano in due versi opposti. Un rapporto accettato che
 *   questa schermata non ha ancora letto **si esporta benissimo**: il file è sul disco del server,
 *   e spegnere il PDF perché il browser non ha ancora fatto una GET sarebbe decidere al posto di
 *   chi ha i dati. All'opposto, l'ultima frase detta in chat **ce l'abbiamo** e il server non ha
 *   nessun file da renderle attorno.
 */
export function serverHaTestoDaImpaginare(voce, lettura = null, dettaglio = null) {
  return haRapportoLeggibile(voce) || testoDepositato(voce, lettura, dettaglio).genere === 'respinto';
}

/** C'è qualcosa da tirare fuori da questa ricerca? ⛔ Una domanda sola, in un posto solo. */
export function haQualcosaDaEsportare(voce, lettura = null, dettaglio = null) {
  return serverHaTestoDaImpaginare(voce, lettura, dettaglio) || Boolean(testoDepositato(voce, lettura, dettaglio).testo);
}

/**
 * IL RECORD C'È, NON C'È, O NON LO SAPPIAMO — tre risposte, mai due.
 *
 * ⛔ `affermazioni: null` (non `[]`) è il modo in cui la rotta del dettaglio dice «non c'è un
 *   record»: L5 §4.2 lo scrive a lettere. `[]` sarebbe «record presente, nessuna affermazione».
 *   Confonderli spegnerebbe le esportazioni di dati su una ricerca che le ha.
 * ⛔ E quando nessuna delle due fonti ha parlato si torna `null`: «non lo sappiamo» non spegne
 *   niente, e decide il server col suo 409.
 */
export function recordDisponibile(lettura = null, dettaglio = null) {
  const ricerca = dettaglio?.stato === 'pronto' ? dettaglio.ricerca : null;
  if (lettura?.stato === 'pronto') return Boolean(lettura.record);
  if (ricerca) return Array.isArray(ricerca.affermazioni);
  return null;
}

export function esportazioniRicerca(voce, lettura = null, dettaglio = null) {
  const deposito = testoDepositato(voce, lettura, dettaglio);
  const impaginabile = serverHaTestoDaImpaginare(voce, lettura, dettaglio);
  const senzaRecord = recordDisponibile(lettura, dettaglio) === false;
  return FORMATI_ESPORTAZIONE.map((uscita) => {
    /* La copia è l'unica che non passa dal server: vive o muore col testo che abbiamo in mano. */
    if (uscita.chiave === 'copia') {
      return { ...uscita, disponibile: Boolean(deposito.testo), motivo: deposito.testo ? null : MOTIVI_ESPORTAZIONE.senzaTesto, testo: deposito.testo };
    }
    if (!impaginabile) {
      /* Due assenze diverse, due frasi diverse: «non c'è niente» e «c'è solo una frase di chat». */
      return { ...uscita, disponibile: false, motivo: deposito.testo ? MOTIVI_ESPORTAZIONE.soloUltimoMessaggio : MOTIVI_ESPORTAZIONE.senzaRapporto };
    }
    /*
     * ⛔ Un documento su un rapporto RESPINTO esce lo stesso — è il contratto della rotta
     *   (md/html/pdf comunque, 409 solo per i quattro di dati) ed è la cura della foto del 12/09.
     *   Ma non esce muto: «esce senza le verifiche» è la differenza fra un rapporto e un testo.
     */
    if (uscita.vuoleRecord && senzaRecord) return { ...uscita, disponibile: false, motivo: MOTIVI_ESPORTAZIONE.senzaRecord };
    const avvertenza = senzaRecord ? traduci('sezioni.research.export.warning.noVerification') : null;
    /* `senzaVerifiche` dice la cosa DAI DATI: chi disegna non deve confrontare il testo tradotto dell'avvertenza. */
    return { ...uscita, disponibile: true, motivo: null, avvertenza, senzaVerifiche: senzaRecord };
  });
}

/**
 * L'indirizzo della rotta di esportazione. ⛔ Scritto UNA volta, qui: un indirizzo ricomposto
 *   dentro un gestore di clic è un indirizzo che diverge al primo cambiamento del contratto.
 */
export function indirizzoEsportazione(sessionId, ricercaId, formato, tono = null, lingua = linguaCorrenteDiT()) {
  const base = `/api/v1/sessions/${encodeURIComponent(String(sessionId ?? ''))}/research/${encodeURIComponent(String(ricercaId ?? ''))}/esporta`;
  const query = new URLSearchParams({ formato: String(formato) });
  if (tono) query.set('tono', tono);
  /* ⛔ K4b (07/10/2026, owner): il file esce nella lingua dell'interfaccia. Il server conosce solo it/en: la pseudo-lingua
     del cancello e ogni altra valgono inglese, la lingua sorgente. */
  query.set('lingua', lingua === 'it' ? 'it' : 'en');
  return `${base}?${query.toString()}`;
}

/**
 * Il pannello di scelta: tre gruppi, una riga per uscita, il motivo sotto quelle spente.
 *
 * ⛔ `aria-disabled` e non `disabled`: MDN dice che il secondo toglie l'elemento dall'ordine del
 *   Tab, e una riga che sparisce dalla tastiera porta via anche il suo MOTIVO — cioè proprio
 *   l'informazione per cui la riga è rimasta. ⇒ resta raggiungibile, e il clic lo sopprime questa
 *   funzione (MDN: «Web developers must manually ensure such elements have their functionality
 *   suppressed»).
 */
export function montaPannelloEsportazioni(doc, elenco, { onScegli } = {}) {
  const pezzi = [];
  for (const gruppo of GRUPPI_ESPORTAZIONE) {
    const dentro = elenco.filter((u) => u.gruppo === gruppo.id);
    if (!dentro.length) continue;
    pezzi.push(nodo(doc, 'h3', 'td-esporta-gruppo', gruppo.parola));
    /*
     * ⛔ VISTO NELLA FOTO (`esporta_spente-dark-1440-modale`, 12/09): lo stesso motivo, lungo due
     *   righe, ripetuto QUATTRO volte di fila — un muro che si smette di leggere alla seconda, e
     *   che rubava alla riga lo spazio per dire che cos'è un BibTeX. ⇒ quando tutte le uscite
     *   spente di un gruppo hanno lo stesso motivo, si scrive UNA volta sotto il titolo del
     *   gruppo, e ogni riga tiene la sua descrizione: si impara lo stesso cosa si sta perdendo.
     */
    const motiviDistinti = [...new Set(dentro.filter((u) => !u.disponibile).map((u) => u.motivo))];
    const motivoDiGruppo = motiviDistinti.length === 1 ? motiviDistinti[0] : null;
    if (motivoDiGruppo) pezzi.push(nodo(doc, 'p', 'td-esporta-motivo', motivoDiGruppo));
    /* ⛔ Stessa cosa per l'avvertenza, e per lo stesso difetto visto nella stessa foto: «esce senza
       le verifiche» sei volte di fila è un motivo decorativo. Se vale per TUTTE le uscite accese
       del gruppo, si scrive una volta e i timbri sulle righe spariscono. */
    const avvertenzeDistinte = [...new Set(dentro.filter((u) => u.disponibile).map((u) => u.avvertenza ?? null))];
    const avvertenzaDiGruppo = avvertenzeDistinte.length === 1 && avvertenzeDistinte[0] ? avvertenzeDistinte[0] : null;
    if (avvertenzaDiGruppo) {
      const tuttiSenzaVerifiche = dentro.filter((u) => u.disponibile).every((u) => u.senzaVerifiche);
      pezzi.push(nodo(doc, 'p', 'td-esporta-motivo', tuttiSenzaVerifiche ? traduci('sezioni.research.export.warning.groupNoVerification') : traduci('sezioni.research.export.warning.groupGeneric', { warning: avvertenzaDiGruppo })));
    }
    for (const uscita of dentro) {
      const riga = nodo(doc, 'button', 'td-esporta-voce');
      riga.type = 'button';
      riga.dataset.uscita = uscita.chiave;
      riga.append(iconaSvg(doc, uscita.gruppo === 'appunti' ? 'copy' : 'download'));
      const testi = nodo(doc, 'span', 'td-esporta-testi');
      const titolo = nodo(doc, 'span', 'td-esporta-nome', uscita.etichetta);
      if (uscita.avvertenza && !avvertenzaDiGruppo) titolo.append(tag(doc, uscita.avvertenza, 'warning'));
      testi.append(titolo, nodo(doc, 'span', 'td-esporta-nota', uscita.disponibile || motivoDiGruppo ? uscita.spiega : uscita.motivo));
      riga.append(testi);
      if (uscita.disponibile) {
        riga.addEventListener('click', () => onScegli?.(uscita));
      } else {
        riga.setAttribute('aria-disabled', 'true');
        riga.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      }
      pezzi.push(riga);
    }
  }
  return pezzi;
}

/**
 * I passaggi di UNA fonte, in italiano vero.
 *
 * ⛔ VISTO NELLA FOTO (`riverifica-light-1440-pannello`, 12/09): qui c'era «Tutti i 2 passaggi
 *   citati sono ancora in questa pagina» e «1 su 1 passaggi citati non si ritrovano più» — cioè
 *   due frasi generate, non scritte. Con un passaggio solo la prima sarebbe diventata «Tutti i 1
 *   passaggi». È lo stesso difetto che `articoloData` cura sulle date: la differenza fra una
 *   frase che ha scritto qualcuno e una che ha montato una macchina.
 * ⛔ Quando TUTTI si sono persi non si dice «N su N»: si dice che non ne resta nessuno. Un
 *   rapporto le cui citazioni sono sparite tutte è una notizia diversa da «due su cinque».
 */
export function frasePassaggi(ritrovati, persi) {
  const ok = Number(ritrovati) || 0;
  const persiN = Number(persi) || 0;
  const totale = ok + persiN;
  if (!totale) return null;
  if (!persiN) {
    return ok === 1
      ? traduci('sezioni.research.passages.allOne')
      : traduci('sezioni.research.passages.allMany', { n: ok });
  }
  if (!ok) {
    return totale === 1
      ? traduci('sezioni.research.passages.noneOne')
      : traduci('sezioni.research.passages.noneMany', { n: totale });
  }
  return persiN === 1
    ? traduci('sezioni.research.passages.someOne', { total: totale })
    : traduci('sezioni.research.passages.someMany', { lost: persiN, total: totale });
}

/**
 * L'esito della ri-verifica, dentro la vista Fonti.
 *
 * ⛔ `role="status"` e non un toast e basta: WCAG 2.2 SC 4.1.3 «Status Messages» (letta il
 *   12/09/2026) chiede che il risultato di un'azione sia annunciabile **senza spostare il fuoco**,
 *   e distingue `status` (esito) da `alert` (guasto). Qui si fa così: l'esito è uno `status`, il
 *   guasto della rilettura un `alert`. Il fuoco resta dove la persona l'ha lasciato.
 * ⛔ L'avvertenza del server si stampa PER INTERO e sopra la tabella: è la riga che dice che metà
 *   della misura oggi non si può fare, e nasconderla in fondo la renderebbe decorativa.
 */
export function montaEsitoRiverifica(doc, stato) {
  const blocco = nodo(doc, 'div', 'td-riverifica');
  if (stato?.stato === 'in-corso') {
    blocco.setAttribute('role', 'status');
    blocco.append(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.recheckPanel.running')));
    return blocco;
  }
  if (stato?.stato === 'errore') {
    blocco.setAttribute('role', 'alert');
    blocco.append(nodo(doc, 'p', 'td-subtle', stato.errore));
    return blocco;
  }
  const esito = stato?.esito;
  if (!esito) return null;
  blocco.setAttribute('role', 'status');
  const testa = nodo(doc, 'div', 'td-riverifica-testa');
  testa.append(nodo(doc, 'strong', '', traduci('sezioni.research.recheckPanel.heading')));
  const quando = dataOra(esito.fattaAlle);
  if (quando) testa.append(nodo(doc, 'span', 'td-subtle', traduci('sezioni.research.recheckPanel.checkedOn', { article: articoloData(esito.fattaAlle), when: quando })));
  blocco.append(testa, nodo(doc, 'p', 'td-prose', frasiRiverifica(esito)));
  /* ⛔ L'avvertenza esiste solo quando `misurabile` è falso: stamparla sempre la farebbe ignorare. */
  if (esito.avvertenza) blocco.append(nodo(doc, 'p', 'td-subtle', testoDelCampo(esito, 'avvertenza')));
  if (esito.troncata) blocco.append(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.recheckPanel.truncated', { read: esito.fonti?.length ?? 0, total: esito.fontiTotali })));
  for (const fonte of Array.isArray(esito.fonti) ? esito.fonti : []) {
    const parole = statoFonteRiverifica(fonte?.stato);
    const riga = nodo(doc, 'div', 'td-riverifica-fonte');
    const alto = nodo(doc, 'div', 'td-riverifica-riga');
    alto.append(tag(doc, parole.parola, parole.tono));
    const link = nodo(doc, 'a', '', fonte?.titolo || fonte?.url || traduci('sezioni.research.sources.untitled'));
    link.href = fonte?.url || '#';
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    alto.append(link);
    riga.append(alto, nodo(doc, 'span', 'td-subtle', parole.spiega));
    /* ⛔ I passaggi si contano SOLO dove sono stati davvero guardati: su una pagina che non si apre
       «0 persi» sarebbe una rassicurazione ricavata da un'assenza di misura. */
    if (fonte?.stato !== 'irraggiungibile') {
      const frase = frasePassaggi(fonte?.passaggiRitrovati, fonte?.passaggiPersi);
      if (frase) riga.append(nodo(doc, 'span', 'td-subtle', frase));
    }
    blocco.append(riga);
  }
  return blocco;
}

function vistaFonti(doc, voce, lettura, ctx) {
  const esito = ctx?.riverifica ? montaEsitoRiverifica(doc, ctx.riverifica) : null;
  if (!lettura?.record) {
    return [esito, nodo(doc, 'p', 'td-prose', traduci('sezioni.research.sourcesView.intro'))];
  }
  const fonti = Array.isArray(lettura.record.sources) ? lettura.record.sources : [];
  if (!fonti.length) return [esito, nodo(doc, 'p', 'td-prose', traduci('sezioni.research.sourcesView.none'))];
  const prove = proveDistinte(fonti);
  /* ⛔ La regola si spiega solo quando MORDE: se ogni fonte è un gruppo a sé, dire «due pagine dello
     stesso dominio non fanno due prove» suona come un'accusa a un elenco che non ha quel difetto. */
  const pezzi = [esito, nodo(doc, 'p', 'td-subtle', prove.gruppi < prove.indirizzi
    ? traduci('sezioni.research.sourcesView.sameDomain', { summary: prove.frase })
    : traduci('sezioni.research.sourcesView.otherDomains', { summary: prove.frase }))];
  for (const fonte of fonti) {
    const riga = nodo(doc, 'div', 'td-source');
    const link = nodo(doc, 'a', '', fonte.title || fonte.url || traduci('sezioni.research.sources.untitled'));
    link.href = fonte.url || '#';
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    riga.append(link);
    riga.append(nodo(doc, 'span', '', fonte.url || traduci('sezioni.research.sourcesView.addressNotRecorded')));
    const dettagli = [
      fonte.publishedAt ? traduci('sezioni.research.sourcesView.declaredDate', { date: fonte.publishedAt }) : traduci('sezioni.research.sourcesView.dateNotDeclared'),
      comeOttenuta(fonte.obtained),
      traduci('sezioni.research.sourcesView.proofGroup', { group: gruppoDellaFonte(fonte) }),
    ].join(' · ');
    riga.append(nodo(doc, 'span', '', dettagli));
    pezzi.push(riga);
  }
  return pezzi;
}

/** «12,4k token · 3 ricerche · 7 pagine» — solo le voci che il server ha davvero contato. */
export function frasiSpesa(spesa) {
  if (!spesa) return null;
  const pezzi = [];
  const token = Number(spesa.tokens) || 0;
  if (token) pezzi.push(traduci('sezioni.research.spend.tokens', { value: token >= 1000 ? `${new Intl.NumberFormat(localeUI(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(token / 1000)}k` : token }));
  if (spesa.searches) pezzi.push(tn('sezioni.research.spend.searchesOne', 'sezioni.research.spend.searchesMany', spesa.searches));
  if (spesa.pages) pezzi.push(tn('sezioni.research.spend.pagesOne', 'sezioni.research.spend.pagesMany', spesa.pages));
  return pezzi.length ? pezzi.join(' · ') : null;
}

/*
 * Un passo del giornale, in parole. ⛔ Mai la sigla: `search`/`read`/`synthesise`/`verify` sono i
 *   quattro `TalosResearchStepKind` di `src/research/run.mjs:100` — nomi del contratto, non nomi
 *   per uno schermo (owner 04/09: niente nomi tecnici a schermo).
 * ⛔ I nomi NON sono stati indovinati: le due mappe qui sotto ricalcano, valore per valore, i
 *   `kind` e gli `state` dichiarati nel typedef di `run.mjs` (righe 100 e 111). Su questa vista
 *   oggi non arriva niente — `piano`/`passi` sono `[]` su tutti i dati veri — ed è proprio per
 *   questo che si copia dalla fonte invece di inventare: una vista che nessuno può ancora
 *   guardare è una vista che nessuno correggerà.
 */
export const PASSI_RICERCA = new MappaTradotta([
  ['search', 'sezioni.research.step.search'],
  ['read', 'sezioni.research.step.read'],
  ['synthesise', 'sezioni.research.step.synthesise'],
  ['verify', 'sezioni.research.step.verify'],
]);

/* ⛔ `interrupted` non è `failed`: «il processo è morto a metà» e «il passo ha sbagliato» sono due
   cose diverse, e la seconda accusa la ricerca di un guasto che non ha commesso. */
const ESITI_PASSO = new Map([
  ['pending', { get parola() { return traduci('sezioni.research.stepState.pending'); }, tono: '' }],
  ['running', { get parola() { return traduci('sezioni.research.stepState.running'); }, tono: 'info' }],
  ['done', { get parola() { return traduci('sezioni.research.stepState.done'); }, tono: 'success' }],
  ['failed', { get parola() { return traduci('sezioni.research.stepState.failed'); }, tono: 'danger' }],
  ['interrupted', { get parola() { return traduci('sezioni.research.stepState.interrupted'); }, tono: 'warning' }],
]);

function vistaPiano(doc, dettaglio) {
  const ricerca = dettaglio?.stato === 'pronto' ? dettaglio.ricerca : null;
  const piano = Array.isArray(ricerca?.piano) ? ricerca.piano : [];
  const passi = Array.isArray(ricerca?.passi) ? ricerca.passi : [];
  /*
   * ⛔⛔ LO STATO VUOTO RESTA, E RESTA ONESTO. Le due liste arrivano davvero dalla rotta del
   *   dettaglio (L5 §4.2), ma sui dati veri di oggi sono `[]` su ogni ricerca: i passi di raccolta
   *   li apre il kernel con `naviga`/`web_search`, che non passano dall'orchestratore. `[]` è un
   *   fatto, non un pannello mancante ⇒ qui si dice cosa manca e perché, mai un piano finto.
   * ⛔ E si distingue «non l'abbiamo chiesto» da «l'abbiamo chiesto e non c'è»: senza il dettaglio
   *   letto, la frase non può promettere che il piano non esista.
   */
  if (!piano.length && !passi.length) {
    return [
      nodo(doc, 'p', 'td-prose', ricerca
        ? traduci('sezioni.research.plan.noneDeclared')
        : traduci('sezioni.research.plan.comesWithNewEngine')),
      nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.plan.futureNote')),
    ];
  }
  const pezzi = [];
  if (piano.length) {
    pezzi.push(nodo(doc, 'h3', '', traduci('sezioni.research.plan.linesHeading')));
    for (const linea of piano) {
      const riga = nodo(doc, 'div', 'td-source');
      riga.append(nodo(doc, 'strong', '', linea?.question || linea?.domanda || traduci('sezioni.research.plan.lineWithoutQuestion')));
      /*
       * ⛔ `estimate` è quello che il pianificatore ha INDOVINATO, e `run.mjs:134` lo dice con
       *   queste parole: «Mai confuso con quello che è stato speso». Quindi l'etichetta dice
       *   «previsti», e lo speso vero sta in «Come è andata». Due numeri simili con un'etichetta
       *   sola sarebbero il modo più veloce di far leggere una stima come una misura.
       */
      const previsto = frasiSpesa(linea?.estimate);
      if (previsto) riga.append(nodo(doc, 'span', '', traduci('sezioni.research.plan.expected', { estimate: previsto })));
      pezzi.push(riga);
    }
  }
  if (passi.length) {
    pezzi.push(nodo(doc, 'h3', '', traduci('sezioni.research.plan.stepsHeading')));
    for (const passo of passi) {
      const riga = nodo(doc, 'div', 'td-source');
      const alto = nodo(doc, 'div', 'td-riverifica-riga');
      const esito = ESITI_PASSO.get(passo?.state) || { parola: traduci('sezioni.research.stepState.unknown'), tono: '' };
      alto.append(tag(doc, esito.parola, esito.tono));
      alto.append(nodo(doc, 'strong', '', PASSI_RICERCA.get(passo?.kind) || traduci('sezioni.research.step.fallback')));
      riga.append(alto);
      const dettagli = [frasiSpesa(passo?.spend), passo?.error ? traduci('sezioni.research.plan.stopped', { error: testoDelCampo(passo, 'error') }) : null].filter(Boolean);
      /* ⛔ `attempts` si scrive solo quando è più di uno: «1 tentativo» è rumore, «3 tentativi» è
         la ragione per cui quel passo è costato tre volte tanto. */
      if (passo?.attempts > 1) dettagli.push(traduci('sezioni.research.plan.attempts', { n: passo.attempts }));
      if (dettagli.length) riga.append(nodo(doc, 'span', '', dettagli.join(' · ')));
      pezzi.push(riga);
    }
  }
  return pezzi;
}

function vistaAndata(doc, voce, ctx, dettaglio) {
  const frasi = frasiVoce(voce);
  const ricerca = dettaglio?.stato === 'pronto' ? dettaglio.ricerca : null;
  const pezzi = [];
  const righe = nodo(doc, 'dl', 'td-andata');
  const riga = (etichetta, valore) => {
    if (!valore) return;
    righe.append(nodo(doc, 'dt', '', etichetta), nodo(doc, 'dd', '', valore));
  };
  riga(traduci('sezioni.research.went.status'), frasi.parola);
  /* 24/09/2026, decisione owner («Barra + fase e conteggi»): una ricerca in corso mostra a che punto è, prima dei fatti;
     l'avanzamento del dettaglio è il più fresco, altrimenti quello dell'elenco. */
  const avanzamento = voce?.stato === 'running' ? (ricerca?.avanzamento ?? voce?.avanzamento ?? null) : null;
  const bloccoAvanzamento = avanzamento ? creaAvanzamentoRicerca(doc, avanzamento) : null;
  if (bloccoAvanzamento) pezzi.push(bloccoAvanzamento);
  /* ⛔ Sotto il titolo la spiegazione c'è già, tranne che sulle concluse: qui si scrive solo quando
     lassù non c'è, o la stessa frase compare due volte nella stessa schermata. */
  if (conclusaDavvero(voce?.stato)) riga(traduci('sezioni.research.went.whatHappened'), frasi.spiegazione);
  riga(traduci('sezioni.research.went.started'), frasi.avviata || traduci('sezioni.research.went.dateNotRecorded'));
  /* ⛔ L'etichetta era «Conclusa», cioè la STESSA parola del timbro di stato: in una schermata su una
     ricerca bloccata compariva «Conclusa» accanto a un orario, e si legge come l'esito. Trovato dal
     test che pretende che quella parola non esista su una ricerca che conclusa non è. */
  riga(traduci('sezioni.research.went.finished'), frasi.conclusa || (voce?.stato === 'running' ? traduci('sezioni.research.went.notYet') : traduci('sezioni.research.went.notRecorded')));
  riga(traduci('sezioni.research.went.duration'), frasi.durata || null);
  riga(traduci('sezioni.research.went.conversationName'), frasi.nome);
  /*
   * ⭐ L5 (12/09) — LO SPESO E IL GIORNALE, dalla rotta del dettaglio. Non c'erano: la sezione
   *   leggeva solo l'elenco, che queste due cose non le manda.
   * ⛔ `giornale: null` è «questa ricerca non ha un giornale» (è nata prima dell'11/09), e va detto
   *   così: senza la riga, una ricerca senza giornale e una con un giornale vuoto si leggerebbero
   *   uguali — e sono la differenza fra «non si può riprendere» e «si può».
   * ⛔ `righeSaltate` si scrive SOLO quando c'è: «si è caricato» e «si è caricato per intero» non
   *   sono la stessa frase, ma stampare «0 righe saltate» su ogni ricerca sana è rumore.
   */
  if (ricerca) {
    riga(traduci('sezioni.research.went.spent'), frasiSpesa(ricerca.spesa) || traduci('sezioni.research.went.nothingMeasured'));
    if (ricerca.giornale) {
      const eventi = Number(ricerca.giornale.eventi) || 0;
      riga(traduci('sezioni.research.went.log'), tn('sezioni.research.went.logEventsOne', 'sezioni.research.went.logEventsMany', eventi));
      if (ricerca.giornale.righeSaltate > 0) {
        riga(traduci('sezioni.research.went.warning'), traduci('sezioni.research.went.skippedLines', { n: ricerca.giornale.righeSaltate }));
      }
    } else {
      riga(traduci('sezioni.research.went.log'), traduci('sezioni.research.went.noLog'));
    }
  }
  pezzi.push(righe);

  /*
   * ⛔⛔ L'ULTIMO MESSAGGIO È UN ALLEGATO, MAI IL RAPPORTO.
   *   L'11/09 una ricerca vera è finita `done` con 290 byte di scusa del modello («la sessione
   *   attuale è in modalità sola lettura…») salvati in Libreria e mostrati come rapporto. Qui
   *   quel testo compare solo dentro questa vista, con la sua etichetta, e la riga sotto dice cosa
   *   NON è. Il pannello «Rapporto» non lo legge nemmeno.
   */
  if (voce?.ultimoMessaggio) {
    pezzi.push(nodo(doc, 'h3', '', traduci('sezioni.research.went.lastMessageHeading')));
    pezzi.push(nodo(doc, 'p', 'td-subtle', traduci('sezioni.research.went.lastMessageNote')));
    pezzi.push(nodo(doc, 'blockquote', 'td-allegato', String(voce.ultimoMessaggio)));
  }
  if (voce?.padreId && typeof ctx?.onApriSessione === 'function') {
    pezzi.push(nodo(doc, 'h3', '', traduci('sezioni.research.went.startedFromHeading')));
    const b = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', traduci('sezioni.research.went.openSourceConversation'));
    b.type = 'button';
    b.addEventListener('click', () => ctx.onApriSessione({ id: voce.padreId }));
    pezzi.push(b);
  }
  return pezzi;
}

function contenutoVista(doc, id, voce, lettura, ctx, dettaglio) {
  switch (id) {
    case 'affermazioni': return vistaAffermazioni(doc, voce, lettura);
    case 'fonti': return vistaFonti(doc, voce, lettura, ctx);
    case 'piano': return vistaPiano(doc, dettaglio);
    case 'andata': return vistaAndata(doc, voce, ctx, dettaglio);
    default: return vistaRapporto(doc, voce, lettura, ctx, dettaglio);
  }
}

/* ------------------------------------------------------------------------- il menu delle azioni */

/**
 * Le voci del menu «⋯», nella forma che `apriMenuAzioniLibreria` (`legacy/app.js:13295`) già sa
 * disegnare: `{chiave, etichetta, icona, aziona, pericolo, separaPrima}`.
 *
 * ⛔ Sono più di due ⇒ menu overflow e tasto destro, mai bottoni affiancati (owner, 10/09).
 * ⛔ Una voce esiste solo se può davvero fare qualcosa: «Copia» ed «Esporta» compaiono quando il
 *   rapporto è stato letto, le citazioni quando il record ha almeno una fonte. Un menu che elenca
 *   ciò che non può fare è la stessa promessa vuota dei contatori che puntano a una pagina che non
 *   c'è.
 */
export function vociMenuRicerca(voce, ctx = {}) {
  const lettura = ctx.lettura || null;
  const pronto = lettura?.stato === 'pronto';
  const citazioni = pronto && lettura.record ? citazioniDaRecord(lettura.record, voce?.conclusaAlle || voce?.avviataAlle) : [];
  const voci = [];
  if (typeof ctx.onApriSessione === 'function' && voce?.id) {
    voci.push({ chiave: 'apri-conversazione', etichetta: traduci('sezioni.research.menu.openConversation'), icona: 'i-eye', aziona: () => ctx.onApriSessione({ id: voce.id }) });
  }
  /*
   * ⛔ TROVATO PER STRADA l'11/09, curando il pannello: il menu chiamava «rapporto» lo stesso file
   *   che il pannello aveva appena smesso di chiamare così. Su una ricerca che un rapporto non ce
   *   l'ha, le due voci restano — il file esiste e si copia — ma col suo nome vero.
   */
  /*
   * ⭐ 12/09 — LA SUITE. Quando il chiamante passa `onEsportazioni` (cioè quando c'è una sessione e
   *   quindi la rotta di esportazione esiste) le tre uscite scritte nel browser — Markdown, BibTeX,
   *   RIS — non stanno più nel menu: stanno nel pannello, insieme alle altre sei. Una famiglia in
   *   un posto solo. ⛔ Senza l'iniezione resta ESATTAMENTE il menu di ieri, e non è pigrizia: il
   *   laboratorio, i test e ogni chiamante senza sessione devono continuare a poter tirare fuori il
   *   testo che hanno già letto senza chiedere niente a nessuno.
   */
  /*
   * ⛔⛔ 12/09, LA FOTO DEL 4174: qui c'era `if (pronto && lettura.prosa)`, cioè «solo se il file di
   *   LIBRERIA è stato letto» — e su una ricerca respinta in Libreria non c'è niente. Risultato:
   *   8.953 byte sul disco e due voci di menu. Adesso si chiede a `testoDepositato`, che le tre
   *   strade le conosce tutte.
   */
  const deposito = testoDepositato(voce, lettura, ctx.dettaglio);
  const suite = typeof ctx.onEsportazioni === 'function' && haQualcosaDaEsportare(voce, lettura, ctx.dettaglio);
  if (deposito.testo) {
    voci.push({ chiave: 'copia', etichetta: traduci('sezioni.research.menu.copy', { name: deposito.nome }), icona: 'i-copy', aziona: () => ctx.onCopia?.(deposito.testo, voce) });
    /* ⛔ L'esportazione scritta nel browser resta solo dove la suite non c'è, e solo su un testo
       che il server saprebbe impaginare: dell'ultimo messaggio si fa una copia, non un file. */
    if (!suite && deposito.suDisco) voci.push({ chiave: 'esporta', etichetta: traduci('sezioni.research.menu.export', { name: deposito.nome }), icona: 'i-download', aziona: () => ctx.onEsporta?.(nomeFileRapporto(frasiVoce(voce).domanda, 'md'), deposito.testo, 'text/markdown') });
  }
  if (suite) {
    voci.push({ chiave: 'esporta-suite', etichetta: traduci('sezioni.research.menu.exportSuite'), icona: 'i-download', aziona: () => ctx.onEsportazioni(voce) });
  } else if (citazioni.length) {
    voci.push({ chiave: 'bibtex', etichetta: traduci('sezioni.research.menu.exportBibtex'), icona: 'i-doc', aziona: () => ctx.onEsporta?.(nomeFileRapporto(frasiVoce(voce).domanda, 'bib'), bibtexDaCitazioni(citazioni), 'application/x-bibtex') });
    voci.push({ chiave: 'ris', etichetta: traduci('sezioni.research.menu.exportRis'), icona: 'i-doc', aziona: () => ctx.onEsporta?.(nomeFileRapporto(frasiVoce(voce).domanda, 'ris'), risDaCitazioni(citazioni), 'application/x-research-info-systems') });
  }
  /*
   * ⭐⭐⭐ L5 (12/09) — LE QUATTRO AZIONI DI SCRITTURA. Stanno in fondo e dopo un separatore
   *   perché cambiano qualcosa: sopra c'è quello che si può fare senza conseguenze.
   * ⛔ Ognuna vuole DUE sì: la sua iniezione (senza rete non si disegna un comando che non può
   *   funzionare — la regola della riga di Libreria del 10/09) e lo stato giusto.
   * ⛔ Le etichette sono verbi, e sono gli stessi che compaiono nell'esito: si preme «Metti in
   *   pausa» e il messaggio dice «In pausa». Un'azione che cambia nome per strada fa perdere.
   * ⛔ «Controlla se le fonti dicono ancora questo» è lunga apposta: «Ri-verifica» non dice a
   *   nessuno che cosa succede, e questa azione ESCE IN RETE — chi la preme deve saperlo prima.
   */
  const scrivibili = [];
  if (typeof ctx.onPausa === 'function' && puoMettereInPausa(voce)) {
    scrivibili.push({ chiave: 'pausa', etichetta: traduci('sezioni.research.menu.pause'), icona: 'i-stop', aziona: () => ctx.onPausa(voce) });
  }
  if (typeof ctx.onRiprendi === 'function' && puoRiprendere(voce)) {
    scrivibili.push({ chiave: 'ripresa', etichetta: traduci('sezioni.research.menu.resume'), icona: 'i-play', aziona: () => ctx.onRiprendi(voce) });
  }
  if (typeof ctx.onRiverifica === 'function' && puoRicontrollareLeFonti(voce)) {
    scrivibili.push({ chiave: 'riverifica', etichetta: traduci('sezioni.research.menu.recheck'), icona: 'i-history', aziona: () => ctx.onRiverifica(voce) });
  }
  if (scrivibili.length) {
    scrivibili[0].separaPrima = true;
    voci.push(...scrivibili);
  }
  if (typeof ctx.onElimina === 'function' && voce?.id) {
    voci.push({ chiave: 'elimina', etichetta: traduci('sezioni.research.menu.delete'), icona: 'i-trash', pericolo: true, separaPrima: true, aziona: () => ctx.onElimina(voce) });
  }
  return voci;
}

/* --------------------------------------------------------------- il dettaglio, tutto assieme */

let contatoreIdentificativi = 0;

/**
 * Il dettaglio a cinque viste. Torna i nodi che `montaSezione` mette dentro `.td-detail-body`.
 *
 * @param {object} voce la ricerca, nella forma di `GET /api/v1/sessions/:id/research`
 * @param {object} ctx `{doc, magazzino, opzioni, ridisegna}`
 */
export function montaDettaglioRicerca(voce, ctx) {
  const doc = ctx.doc;
  const frasi = frasiVoce(voce);
  const magazzino = ctx.magazzino;
  const chiave = String(voce?.reportLibraryId ?? '');
  const lettura = chiave ? magazzino.rapporti.get(chiave) || null : null;
  /* L5: la scheda intera e l'esito dell'ultima ri-verifica, indicizzati per id della RICERCA (non
     per voce di Libreria: una ricerca senza rapporto ha comunque un piano e un giornale). */
  const dettaglio = magazzino.dettagli.get(String(voce?.id)) || null;
  const riverifica = magazzino.riverifiche.get(String(voce?.id)) || null;
  const pezzi = [];

  /* ---- testa: stato, quando, durata, e il menu ---- */
  const meta = nodo(doc, 'div', 'td-detail-meta');
  meta.append(tag(doc, frasi.parola, frasi.tono));
  if (frasi.avviata) meta.append(nodo(doc, 'span', '', traduci('sezioni.research.meta.started', { article: articoloData(voce?.avviataAlle), when: frasi.avviata })));
  if (frasi.durata) meta.append(nodo(doc, 'span', '', traduci('sezioni.research.meta.duration', { duration: frasi.durata })));
  const strumenti = nodo(doc, 'span', 'td-tools');
  const menu = nodo(doc, 'button', 'talos-button talos-button--secondary talos-icon-button');
  menu.type = 'button';
  menu.setAttribute('aria-haspopup', 'menu');
  menu.setAttribute('aria-label', traduci("sezioni.common.actionsFor", { name: frasi.domanda }));
  menu.append(iconaSvg(doc, 'more'));
  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.apriMenu?.(voce, { ancoraEl: menu });
  });
  strumenti.append(menu);
  meta.append(strumenti);
  pezzi.push(meta, nodo(doc, 'h2', '', frasi.domanda));

  /* ⛔ La frase dello stato sta in alto solo quando NON è conclusa: su una conclusa lo spazio va
     al bilancio, che è l'informazione vera. */
  if (!conclusaDavvero(voce?.stato)) pezzi.push(nodo(doc, 'p', 'td-subtle', frasi.spiegazione));

  /* ---- il bilancio, se il record c'è ---- */
  if (lettura?.stato === 'pronto' && lettura.record) {
    const bilancio = bilancioDaRecord(lettura.record);
    if (bilancio.totale) {
      pezzi.push(barraBilancio(doc, bilancio));
      const sotto = nodo(doc, 'p', 'td-subtle');
      const prove = proveDistinte(lettura.record.sources);
      sotto.textContent = lettura.record.judge
        ? traduci("sezioni.research.tally.verifiedBy", { judge: lettura.record.judge, summary: prove.frase })
        : traduci("sezioni.research.tally.notRun", { summary: prove.frase });
      pezzi.push(sotto);
    }
  }

  /* ---- le cinque viste ---- */
  contatoreIdentificativi += 1;
  const radice = `td-ric-${contatoreIdentificativi}`;
  /*
   * ⛔ Quale vista si apre per prima non è una preferenza: è dove c'è qualcosa da leggere. Su una
   *   ricerca senza rapporto «Rapporto» è tre righe che spiegano un'assenza, mentre «Come è andata»
   *   ha lo stato, il motivo, i tempi e l'ultimo messaggio. Chi ha già scelto una vista la ritrova.
   */
  /* ⛔ Il file in Libreria non basta ad aprire su «Rapporto»: su una `senza-rapporto` quel pannello
     è una spiegazione di un'assenza più un allegato, mentre «Come è andata» ha lo stato, il motivo,
     i tempi e l'ultimo messaggio. Si apre dove c'è da leggere. */
  const scelta = magazzino.viste.get(String(voce?.id)) || (haRapportoLeggibile(voce) ? 'rapporto' : 'andata');
  const lista = nodo(doc, 'div', 'td-segment td-viste');
  lista.setAttribute('role', 'tablist');
  lista.setAttribute('aria-label', traduci("sezioni.research.view.groupLabel"));
  const pannello = nodo(doc, 'div', 'td-vista');
  pannello.setAttribute('role', 'tabpanel');
  pannello.tabIndex = 0;
  pannello.id = `${radice}-pannello`;

  const schede = VISTE.map((vista) => {
    const b = nodo(doc, 'button', '', vista.parola);
    b.type = 'button';
    b.id = `${radice}-${vista.id}`;
    b.dataset.vista = vista.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', pannello.id);
    lista.append(b);
    return b;
  });

  function mostra(idVista, muoviIlFuoco = false) {
    magazzino.viste.set(String(voce?.id), idVista);
    for (const b of schede) {
      const attiva = b.dataset.vista === idVista;
      b.setAttribute('aria-selected', String(attiva));
      /* ⛔ Un solo stop del Tab su tutta la striscia: le schede non scelte escono dalla sequenza. */
      b.tabIndex = attiva ? 0 : -1;
      if (attiva && muoviIlFuoco) b.focus({ preventScroll: true });
    }
    pannello.setAttribute('aria-labelledby', `${radice}-${idVista}`);
    pannello.replaceChildren(...contenutoVista(doc, idVista, voce, lettura, {
      ...ctx.opzioni, riverifica, puoLeggere: typeof ctx.opzioni?.leggiRapporto === 'function',
    }, dettaglio).filter(Boolean));
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-vista]');
    if (b) mostra(b.dataset.vista);
  });
  lista.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const attuale = schede.findIndex((b) => b.getAttribute('aria-selected') === 'true');
    const prossima = e.key === 'Home' ? 0
      : e.key === 'End' ? schede.length - 1
        : (attuale + (e.key === 'ArrowRight' ? 1 : -1) + schede.length) % schede.length;
    // Attivazione automatica, come l'esempio W3C: la freccia sposta E apre.
    mostra(schede[prossima].dataset.vista, true);
  });
  mostra(VISTE.some((v) => v.id === scelta) ? scelta : 'rapporto');
  pezzi.push(lista, pannello);

  /* ---- la lettura del rapporto parte qui, una volta sola ---- */
  if (chiave && !lettura && typeof ctx.opzioni?.leggiRapporto === 'function') {
    magazzino.rapporti.set(chiave, { stato: 'caricando' });
    Promise.resolve()
      .then(() => ctx.opzioni.leggiRapporto(voce))
      .then((testo) => {
        const letto = leggiDocumentoRapporto(testo);
        magazzino.rapporti.set(chiave, { stato: 'pronto', testo: String(testo ?? ''), ...letto });
      })
      .catch((errore) => {
        magazzino.rapporti.set(chiave, { stato: 'errore', errore: errore?.message || traduci('sezioni.research.reasonNotRecorded') });
      })
      .then(() => ctx.ridisegna?.());
  }

  /*
   * ⭐ L5 — LA SCHEDA INTERA, una volta sola per ricerca aperta. Porta piano, passi, speso e
   *   giornale, che l'elenco non manda.
   * ⛔ Si chiede solo QUI, cioè solo quando una ricerca è stata aperta: chiederla per tutte
   *   all'apertura della sezione sarebbe una richiesta per riga, ed è la stessa ragione per cui
   *   l'elenco non porta i bilanci.
   * ⛔ Un fallimento NON diventa un'attesa infinita né un pannello vuoto: resta registrato, e le
   *   due viste che lo usano cadono sul loro stato onesto (che è quello di prima di L5).
   */
  const idRicerca = String(voce?.id ?? '');
  if (idRicerca && !dettaglio && typeof ctx.opzioni?.leggiDettaglio === 'function') {
    magazzino.dettagli.set(idRicerca, { stato: 'caricando' });
    Promise.resolve()
      .then(() => ctx.opzioni.leggiDettaglio(voce))
      .then((ricerca) => { magazzino.dettagli.set(idRicerca, ricerca ? { stato: 'pronto', ricerca } : { stato: 'errore', errore: traduci('sezioni.research.detailUnavailable') }); })
      .catch((errore) => { magazzino.dettagli.set(idRicerca, { stato: 'errore', errore: errore?.message || traduci('sezioni.research.reasonNotRecorded') }); })
      .then(() => ctx.ridisegna?.());
  }
  return pezzi;
}

/* ------------------------------------------------------ il tasto destro, per delega sull'elenco */

/**
 * Lo stesso menu del «⋯», alle coordinate del puntatore.
 *
 * ⛔ Per DELEGA sulla sezione e non scheda per scheda: `montaSezione` ricostruisce le schede a ogni
 *   ridisegno (una lettera nel campo di ricerca basta), e un ascoltatore messo su una scheda
 *   morirebbe con lei senza che nessuno se ne accorga. Una volta sola per schermo, e sopravvive.
 */
export function collegaTastoDestro(schermo, { trovaVoce, apriMenu }) {
  const magazzino = magazzinoRicerche(schermo);
  if (magazzino.collegato) return false;
  magazzino.collegato = true;
  schermo.addEventListener('contextmenu', (e) => {
    const scheda = e.target.closest?.('.td-card[data-item]');
    if (!scheda) return;
    const voce = trovaVoce(scheda.dataset.item);
    if (!voce) return;
    e.preventDefault();
    apriMenu(voce, { x: e.clientX, y: e.clientY });
  });
  return true;
}

/**
 * Il download di un testo generato nel browser.
 *
 * ⛔ Scritto qui e non riusato da `sezioni-adattatori.js` di proposito: quel file importa QUESTO,
 *   e importarlo di ritorno farebbe un anello fra i due moduli. Sei righe copiate valgono meno di
 *   un ciclo di import che si manifesta solo in certi ordini di caricamento.
 */
export function scaricaTesto(doc, nome, testo, mime = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([testo], { type: mime }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
