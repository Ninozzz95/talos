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
 *   4. Nessun pulsante promette una rotta che non esiste: pausa, ripresa, ri-verifica ed
 *      eliminazione non sono qui (arrivano con L5, se l'owner approva le rotte).
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
  ['running', { parola: 'In corso', tono: 'info', cosaFare: 'Sta cercando e leggendo. Il rapporto compare appena lo deposita.' }],
  ['paused', { parola: 'In pausa', tono: 'warning', cosaFare: 'È ferma a metà. Riprendila dalla conversazione della ricerca.' }],
  /* ⛔ Questa frase la legge SOLO la scheda dell'elenco: nel dettaglio, su una conclusa, al suo
     posto va il bilancio. Quindi dice cosa fare DA LÌ — «qui sotto» in una scheda non è un posto. */
  ['done', { parola: 'Conclusa', tono: 'success', cosaFare: 'Aprila per leggere il rapporto e il bilancio delle verifiche.' }],
  /* ⛔ «Annullata» e non «Interrotta»: è la parola che la sezione usa da sempre e che il filtro
     del prodotto porta al plurale. Una parola sola per uno stato solo — due sinonimi in due
     schermate sono la prima crepa da cui una UI comincia a divergere. */
  ['cancelled', { parola: 'Annullata', tono: '', cosaFare: 'È stata fermata prima del rapporto. Quello che aveva raccolto resta nelle Fonti.' }],
  ['failed', { parola: 'Non riuscita', tono: 'danger', cosaFare: 'Si è fermata su un errore. Riavviala dalla chat con la stessa domanda.' }],
  /* I tre stati nuovi del cancello di consegna. */
  ['senza-rapporto', { parola: 'Senza rapporto', tono: 'warning', cosaFare: 'È arrivata in fondo senza depositare un rapporto. Quello che ha raccolto resta nelle Fonti; per averne uno, riavviala.' }],
  ['bloccata-dal-permesso', { parola: 'Bloccata', tono: 'danger', cosaFare: 'La sessione era in sola lettura e non ha potuto consegnare. Riprendila con il permesso giusto.' }],
  ['giri-esauriti', { parola: 'Giri esauriti', tono: 'warning', cosaFare: 'Ha finito i giri a disposizione prima di concludere. Riavviala con una domanda più stretta.' }],
]);

/** ⛔ Uno stato che non conosciamo NON diventa «Conclusa»: diventa «Stato non registrato». */
export function statoRicercaApprofondita(stato) {
  return STATI_RICERCA.get(stato) || {
    parola: 'Stato non registrato',
    tono: '',
    cosaFare: 'Il server non dice a che punto è. Aggiorna la sezione, o riapri la conversazione della ricerca.',
  };
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

/*
 * ⛔ Niente SECONDI: `toLocaleString('it-IT')` scrive «11/09/2026, 20:56:46» e il terzo numero non
 *   dice niente a nessuno — in una riga di intestazione è solo rumore. Trovato guardando la foto.
 */
function dataOra(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return null;
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  return giorno === 8 || giorno === 11 ? 'l’' : 'il ';
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
  const stato = statoRicercaApprofondita(voce?.stato);
  const grezza = typeof voce?.domanda === 'string' && voce.domanda.trim()
    ? voce.domanda.trim()
    : (typeof voce?.titolo === 'string' && voce.titolo.trim() ? voce.titolo.trim() : '');
  const motivo = typeof voce?.motivo === 'string' && voce.motivo.trim() ? voce.motivo.trim() : null;
  return {
    domanda: grezza || 'Ricerca senza domanda',
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

/** Perché il bilancio non c'è, detto a una persona. Mai «errore di parsing». */
export const PERCHE_SENZA_RECORD = new Map([
  ['vuoto', 'Il file del rapporto è vuoto.'],
  ['senza-record', 'Questo rapporto non porta con sé il riepilogo delle verifiche: sotto c’è il testo così com’è stato scritto.'],
  ['record-troncato', 'Il riepilogo delle verifiche è troncato a metà: il bilancio non si può ricavare. Sotto c’è il testo così com’è.'],
  ['record-di-un-altro-formato', 'Il riepilogo delle verifiche è in un formato che questa versione non legge. Sotto c’è il testo così com’è.'],
  ['record-illeggibile', 'Il riepilogo delle verifiche non si rilegge. Ciò che è stato raccolto resta nelle Fonti.'],
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
  { chiave: 'sostenute', parola: 'sostenute', tono: 'success' },
  { chiave: 'inParte', parola: 'in parte', tono: 'warning' },
  { chiave: 'contese', parola: 'contese', tono: 'info' },
  { chiave: 'nonSostenute', parola: 'non sostenute', tono: 'danger' },
  { chiave: 'nonVerificate', parola: 'non verificate', tono: 'muted' },
];

/** «9 sostenute · 2 in parte · 1 contesa · 3 non verificate» — solo le voci che esistono. */
export function frasiBilancio(bilancio) {
  if (!bilancio || !bilancio.totale) return 'Nessuna affermazione registrata';
  const pezzi = PEZZI_BILANCIO
    .filter((p) => bilancio[p.chiave] > 0)
    .map((p) => `${bilancio[p.chiave]} ${p.chiave === 'contese' && bilancio[p.chiave] === 1 ? 'contesa' : p.parola}`);
  return pezzi.join(' · ');
}

/** Il verdetto di un'affermazione, nelle parole del mobile (`researchReport.ts:67-77`). */
export function verdettoInParole(checks) {
  switch (checks?.claimSupported) {
    case 'yes': return { parola: 'sostenuta dalla fonte', tono: 'success' };
    case 'partial': return { parola: 'sostenuta solo in parte', tono: 'warning' };
    case 'no': return { parola: 'NON sostenuta dalla fonte', tono: 'danger' };
    case 'contested': return { parola: 'contesa — le fonti non concordano', tono: 'info' };
    default: return { parola: 'non verificata', tono: '' };
  }
}

/** Come la fonte è stata ottenuta: «pagina letta» o «solo estratto», mai una sigla. */
export function comeOttenuta(obtained) {
  if (obtained === 'page') return 'pagina letta';
  if (obtained === 'snippet') return 'solo estratto dal motore di ricerca';
  return 'origine non registrata';
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
    ? 'Nessuna fonte registrata'
    : `${quanti} ${quanti === 1 ? 'prova distinta' : 'prove distinte'} su ${indirizzi} ${indirizzi === 1 ? 'indirizzo' : 'indirizzi'}`;
  return { gruppi: quanti, indirizzi, frase, perIndice: gruppi };
}

/** Il gruppo di una fonte, per la riga: il dominio, o la parola che dice che non ce n'è uno. */
export function gruppoDellaFonte(fonte) {
  return dominioRegistrabile(fonte?.url) || 'indirizzo non leggibile';
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
    magazzino = { rapporti: new Map(), viste: new Map(), collegato: false };
    MAGAZZINI.set(schermo, magazzino);
  }
  return magazzino;
}

export const VISTE = [
  { id: 'rapporto', parola: 'Rapporto' },
  { id: 'affermazioni', parola: 'Affermazioni' },
  { id: 'fonti', parola: 'Fonti' },
  { id: 'piano', parola: 'Piano' },
  { id: 'andata', parola: 'Come è andata' },
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
  barra.setAttribute('aria-label', `Bilancio delle verifiche: ${frasiBilancio(bilancio)}`);
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
    voce.append(pallino, doc.createTextNode(`${quante} ${quante === 1 && pezzo.chiave === 'contese' ? 'contesa' : pezzo.parola}`));
    voci.append(voce);
  }
  blocco.append(voci);
  return blocco;
}

/* ----------------------------------------------------------------------------- le cinque viste */

function vistaRapporto(doc, voce, lettura, ctx) {
  const pezzi = [];
  const frasi = frasiVoce(voce);
  if (!haRapportoLeggibile(voce)) {
    pezzi.push(nodo(doc, 'p', 'td-prose', conclusaDavvero(voce?.stato)
      ? 'Questa ricerca risulta conclusa, ma non ha depositato nessun rapporto.'
      : 'Questa ricerca non ha depositato un rapporto.'));
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
    if (frasi.haRapporto) {
      pezzi.push(nodo(doc, 'h3', '', 'Ciò che è stato depositato'));
      /* ⛔ VISTO NELLA FOTO (ric-scusa, chiaro, 1440): questa riga ripeteva parola per parola il
         motivo che il server manda e che sta già due righe sopra, sotto il titolo. Qui si dice
         solo CHE COS'È il file; il perché lo dice il motivo, una volta sola. */
      pezzi.push(nodo(doc, 'p', 'td-subtle', 'Il file che questa ricerca ha lasciato in Libreria. Non è il suo rapporto.'));
      if (lettura?.stato === 'pronto') {
        const deposto = (lettura.prosa || lettura.testo || '').trim();
        pezzi.push(deposto
          ? nodo(doc, 'blockquote', 'td-allegato', deposto)
          : nodo(doc, 'p', 'td-subtle', 'Il file depositato è vuoto.'));
      } else if (lettura?.stato === 'errore') {
        const p = nodo(doc, 'p', 'td-subtle', `Il file depositato non si apre: ${lettura.errore}`);
        p.setAttribute('role', 'alert');
        pezzi.push(p);
      } else if (!ctx?.puoLeggere) {
        pezzi.push(nodo(doc, 'p', 'td-subtle', 'È in Libreria, in questo progetto: da lì si apre e si scarica.'));
      } else {
        pezzi.push(nodo(doc, 'p', 'td-subtle', 'Leggo il file depositato…'));
      }
    }
    /* ⛔ Il puntatore all'ultimo messaggio è qui, e dice cos'è: senza questa riga qualcuno andrebbe
       a cercarlo e lo scambierebbe per il rapporto — che è esattamente il guasto dell'11/09. */
    if (voce?.ultimoMessaggio) pezzi.push(nodo(doc, 'p', 'td-subtle', 'L’ultima cosa che la ricerca ha detto in chat è in «Come è andata». Non è un rapporto.'));
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
    pezzi.push(nodo(doc, 'p', 'td-prose', 'Il rapporto di questa ricerca è depositato in Libreria, in questo progetto.'));
    pezzi.push(nodo(doc, 'p', 'td-subtle', 'Da questa schermata non si apre ancora: la Libreria lo scarica.'));
    return pezzi;
  }
  if (!lettura || lettura.stato === 'caricando') {
    pezzi.push(nodo(doc, 'p', 'td-prose', 'Leggo il rapporto…'));
    return pezzi;
  }
  if (lettura.stato === 'errore') {
    const p = nodo(doc, 'p', 'td-prose', `Il rapporto non si apre: ${lettura.errore}`);
    p.setAttribute('role', 'alert');
    pezzi.push(p, nodo(doc, 'p', 'td-subtle', 'Il file vive in Libreria, in questo progetto: da lì si scarica anche se qui non si apre.'));
    return pezzi;
  }
  if (!lettura.record) {
    pezzi.push(nodo(doc, 'p', 'td-subtle', PERCHE_SENZA_RECORD.get(lettura.perche) || 'Il riepilogo delle verifiche non c’è.'));
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
  else pezzi.push(nodo(doc, 'p', 'td-prose', 'Il file del rapporto è vuoto.'));
  return pezzi;
}

function vistaAffermazioni(doc, voce, lettura) {
  if (!lettura?.record) {
    return [nodo(doc, 'p', 'td-prose', 'Le affermazioni compaiono quando il rapporto porta con sé il riepilogo delle verifiche: il testo dell’affermazione, il passaggio della fonte da cui viene, e chi l’ha giudicata.'),
      nodo(doc, 'p', 'td-subtle', lettura?.record === null && lettura?.perche ? (PERCHE_SENZA_RECORD.get(lettura.perche) || '') : 'Questa ricerca non ne ha ancora uno.')];
  }
  const { claims = [], sources = [] } = lettura.record;
  if (!claims.length) return [nodo(doc, 'p', 'td-prose', 'Il rapporto non registra nessuna affermazione verificata.')];
  return claims.map((entrata, indice) => {
    const verdetto = verdettoInParole(entrata?.checks);
    const blocco = nodo(doc, 'article', 'td-affermazione');
    const testa = nodo(doc, 'div', 'td-affermazione-testa');
    testa.append(nodo(doc, 'span', 'td-affermazione-numero', String(indice + 1)), tag(doc, verdetto.parola, verdetto.tono));
    blocco.append(testa, nodo(doc, 'p', 'td-affermazione-testo', entrata?.text || 'Affermazione senza testo'));
    if (entrata?.checks?.supportReason) blocco.append(nodo(doc, 'p', 'td-subtle', entrata.checks.supportReason));
    /*
     * ⛔ Il passaggio È la porzione citata: sul mobile nasce come `source.text.slice(span.from,
     *   span.to)` (`researchVerification.ts:424`), quindi non c'è niente da evidenziare dentro —
     *   il disegno §6.7 immaginava un'evidenziazione perché dava per scontato che qui arrivasse
     *   anche il testo INTERO della fonte, che il record non porta.
     */
    if (entrata?.passage) blocco.append(nodo(doc, 'blockquote', 'td-passaggio', entrata.passage));
    else blocco.append(nodo(doc, 'p', 'td-subtle', 'Il passaggio citato non è stato ritrovato nel testo della fonte.'));
    const fonte = sources[(entrata?.sourceIndex ?? 0) - 1];
    const piede = nodo(doc, 'div', 'td-affermazione-piede');
    if (fonte) {
      const link = nodo(doc, 'a', '', fonte.title || fonte.url);
      link.href = fonte.url || '#';
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      piede.append(link, nodo(doc, 'span', 'td-subtle', comeOttenuta(fonte.obtained)));
    } else {
      piede.append(nodo(doc, 'span', 'td-subtle', 'Fonte citata ma mai raccolta.'));
    }
    if (entrata?.checks?.judge) piede.append(nodo(doc, 'span', 'td-subtle', `giudicata da ${entrata.checks.judge}`));
    blocco.append(piede);
    /* Le contrarie, affiancate e mai mediate: una contesa si mostra con tutte e due le versioni. */
    for (const contraria of Array.isArray(entrata?.checks?.opposing) ? entrata.checks.opposing : []) {
      const box = nodo(doc, 'div', 'td-contraria');
      box.append(nodo(doc, 'span', 'td-subtle', 'Una fonte dice il contrario'));
      if (contraria?.passage) box.append(nodo(doc, 'blockquote', 'td-passaggio', contraria.passage));
      const link = nodo(doc, 'a', '', contraria?.title || contraria?.url || 'fonte senza titolo');
      link.href = contraria?.url || '#';
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      box.append(link);
      blocco.append(box);
    }
    return blocco;
  });
}

function vistaFonti(doc, voce, lettura) {
  if (!lettura?.record) {
    return [nodo(doc, 'p', 'td-prose', 'Le fonti compaiono quando il rapporto porta con sé il riepilogo delle verifiche: indirizzo, data dichiarata, se la pagina è stata letta per intero, e a quale gruppo di prove appartiene.')];
  }
  const fonti = Array.isArray(lettura.record.sources) ? lettura.record.sources : [];
  if (!fonti.length) return [nodo(doc, 'p', 'td-prose', 'Il rapporto non registra nessuna fonte.')];
  const prove = proveDistinte(fonti);
  /* ⛔ La regola si spiega solo quando MORDE: se ogni fonte è un gruppo a sé, dire «due pagine dello
     stesso dominio non fanno due prove» suona come un'accusa a un elenco che non ha quel difetto. */
  const pezzi = [nodo(doc, 'p', 'td-subtle', prove.gruppi < prove.indirizzi
    ? `${prove.frase}: due pagine dello stesso dominio non fanno due prove.`
    : `${prove.frase}: ogni fonte viene da un dominio diverso.`)];
  for (const fonte of fonti) {
    const riga = nodo(doc, 'div', 'td-source');
    const link = nodo(doc, 'a', '', fonte.title || fonte.url || 'fonte senza titolo');
    link.href = fonte.url || '#';
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    riga.append(link);
    riga.append(nodo(doc, 'span', '', fonte.url || 'indirizzo non registrato'));
    const dettagli = [
      fonte.publishedAt ? `data dichiarata: ${fonte.publishedAt}` : 'data non dichiarata',
      comeOttenuta(fonte.obtained),
      `gruppo di prove: ${gruppoDellaFonte(fonte)}`,
    ].join(' · ');
    riga.append(nodo(doc, 'span', '', dettagli));
    pezzi.push(riga);
  }
  return pezzi;
}

function vistaPiano(doc) {
  /*
   * ⛔ Uno stato vuoto ONESTO, non un pannello finto. Il piano (linee di indagine, quanto ognuna
   *   ha portato, l'approvazione prima che parta) esiste sul mobile
   *   (`researchPlan.ts`) e arriva qui col porto del motore — lotto L3 del disegno, non fatto.
   *   Disegnarlo adesso con dati inventati sarebbe la stessa bugia che questo lotto sta togliendo.
   */
  return [
    nodo(doc, 'p', 'td-prose', 'Il piano arriva con il motore nuovo.'),
    nodo(doc, 'p', 'td-subtle', 'Quando una ricerca dichiarerà le sue linee di indagine, le troverai qui con quanto ognuna ha portato — e su una ricerca in corso sarà il posto dove approvarle o cambiarle prima che parta.'),
  ];
}

function vistaAndata(doc, voce, ctx) {
  const frasi = frasiVoce(voce);
  const pezzi = [];
  const righe = nodo(doc, 'dl', 'td-andata');
  const riga = (etichetta, valore) => {
    if (!valore) return;
    righe.append(nodo(doc, 'dt', '', etichetta), nodo(doc, 'dd', '', valore));
  };
  riga('Stato', frasi.parola);
  /* ⛔ Sotto il titolo la spiegazione c'è già, tranne che sulle concluse: qui si scrive solo quando
     lassù non c'è, o la stessa frase compare due volte nella stessa schermata. */
  if (conclusaDavvero(voce?.stato)) riga('Cosa è successo', frasi.spiegazione);
  riga('Avviata', frasi.avviata || 'data non registrata');
  /* ⛔ L'etichetta era «Conclusa», cioè la STESSA parola del timbro di stato: in una schermata su una
     ricerca bloccata compariva «Conclusa» accanto a un orario, e si legge come l'esito. Trovato dal
     test che pretende che quella parola non esista su una ricerca che conclusa non è. */
  riga('Finita', frasi.conclusa || (voce?.stato === 'running' ? 'non ancora' : 'non registrata'));
  riga('Durata', frasi.durata || null);
  riga('Nome della conversazione', frasi.nome);
  pezzi.push(righe);

  /*
   * ⛔⛔ L'ULTIMO MESSAGGIO È UN ALLEGATO, MAI IL RAPPORTO.
   *   L'11/09 una ricerca vera è finita `done` con 290 byte di scusa del modello («la sessione
   *   attuale è in modalità sola lettura…») salvati in Libreria e mostrati come rapporto. Qui
   *   quel testo compare solo dentro questa vista, con la sua etichetta, e la riga sotto dice cosa
   *   NON è. Il pannello «Rapporto» non lo legge nemmeno.
   */
  if (voce?.ultimoMessaggio) {
    pezzi.push(nodo(doc, 'h3', '', 'Ultimo messaggio della ricerca'));
    pezzi.push(nodo(doc, 'p', 'td-subtle', 'È l’ultima cosa che la ricerca ha detto in chat, non il suo rapporto.'));
    pezzi.push(nodo(doc, 'blockquote', 'td-allegato', String(voce.ultimoMessaggio)));
  }
  if (voce?.padreId && typeof ctx?.onApriSessione === 'function') {
    pezzi.push(nodo(doc, 'h3', '', 'Da dove è partita'));
    const b = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Apri la conversazione da cui è partita');
    b.type = 'button';
    b.addEventListener('click', () => ctx.onApriSessione({ id: voce.padreId }));
    pezzi.push(b);
  }
  return pezzi;
}

function contenutoVista(doc, id, voce, lettura, ctx) {
  switch (id) {
    case 'affermazioni': return vistaAffermazioni(doc, voce, lettura);
    case 'fonti': return vistaFonti(doc, voce, lettura);
    case 'piano': return vistaPiano(doc);
    case 'andata': return vistaAndata(doc, voce, ctx);
    default: return vistaRapporto(doc, voce, lettura, ctx);
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
    voci.push({ chiave: 'apri-conversazione', etichetta: 'Apri la conversazione', icona: 'i-eye', aziona: () => ctx.onApriSessione({ id: voce.id }) });
  }
  /*
   * ⛔ TROVATO PER STRADA l'11/09, curando il pannello: il menu chiamava «rapporto» lo stesso file
   *   che il pannello aveva appena smesso di chiamare così. Su una ricerca che un rapporto non ce
   *   l'ha, le due voci restano — il file esiste e si copia — ma col suo nome vero.
   */
  if (pronto && lettura.prosa) {
    const rapporto = haRapportoLeggibile(voce);
    const cosa = rapporto ? 'il rapporto' : 'il file depositato';
    voci.push({ chiave: 'copia', etichetta: `Copia ${cosa}`, icona: 'i-copy', aziona: () => ctx.onCopia?.(lettura.prosa, voce) });
    voci.push({ chiave: 'esporta', etichetta: `Esporta ${cosa}`, icona: 'i-download', aziona: () => ctx.onEsporta?.(nomeFileRapporto(frasiVoce(voce).domanda, 'md'), lettura.testo || lettura.prosa, 'text/markdown') });
  }
  if (citazioni.length) {
    voci.push({ chiave: 'bibtex', etichetta: 'Esporta le citazioni (BibTeX)', icona: 'i-doc', aziona: () => ctx.onEsporta?.(nomeFileRapporto(frasiVoce(voce).domanda, 'bib'), bibtexDaCitazioni(citazioni), 'application/x-bibtex') });
    voci.push({ chiave: 'ris', etichetta: 'Esporta le citazioni (RIS)', icona: 'i-doc', aziona: () => ctx.onEsporta?.(nomeFileRapporto(frasiVoce(voce).domanda, 'ris'), risDaCitazioni(citazioni), 'application/x-research-info-systems') });
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
  const pezzi = [];

  /* ---- testa: stato, quando, durata, e il menu ---- */
  const meta = nodo(doc, 'div', 'td-detail-meta');
  meta.append(tag(doc, frasi.parola, frasi.tono));
  if (frasi.avviata) meta.append(nodo(doc, 'span', '', `avviata ${articoloData(voce?.avviataAlle)}${frasi.avviata}`));
  if (frasi.durata) meta.append(nodo(doc, 'span', '', `durata ${frasi.durata}`));
  const strumenti = nodo(doc, 'span', 'td-tools');
  const menu = nodo(doc, 'button', 'talos-button talos-button--secondary talos-icon-button');
  menu.type = 'button';
  menu.setAttribute('aria-haspopup', 'menu');
  menu.setAttribute('aria-label', `Azioni su ${frasi.domanda}`);
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
        ? `Verificate da ${lettura.record.judge}, mai dal modello che ha scritto il rapporto · ${prove.frase}`
        : `Verifica non eseguita: nessun giudice indipendente era disponibile · ${prove.frase}`;
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
  lista.setAttribute('aria-label', 'Viste della ricerca');
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
    pannello.replaceChildren(...contenutoVista(doc, idVista, voce, lettura, { ...ctx.opzioni, puoLeggere: typeof ctx.opzioni?.leggiRapporto === 'function' }).filter(Boolean));
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
        magazzino.rapporti.set(chiave, { stato: 'errore', errore: errore?.message || 'motivo non registrato' });
      })
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
