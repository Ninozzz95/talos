/*
 * Il Browser a schede (K-I, 06/09) — la schermata `#schermoBrowser` del mockup riempita dai
 * dati veri. Due tipi di scheda:
 *   · «lettura»: una pagina letta dall'agente con l'attrezzo `naviga` — il testo che il modello
 *     ha ricevuto davvero, con indirizzo, ora e lunghezza (mai un'anteprima inventata);
 *   · «viva»: una pagina che la persona apre dentro TALOS scrivendo l'indirizzo — si mostra in
 *     una cornice quando il sito lo consente (il server legge le intestazioni: X-Frame-Options e
 *     `frame-ancestors`, MDN letto il 06/09/2026), altrimenti si dice perché e si propone di
 *     farla leggere all'agente.
 * Il componente RIEMPIE lo scheletro del mockup (stessi nodi, stesse classi), non lo ricrea:
 * la parità struttura/parole si misura sullo stesso DOM.
 *
 * Ricerca fatta prima di scrivere (letta il 06/09/2026): indietro/avanti, ricarica, indirizzo
 * modificabile con Invio/Esc, copia
 * dell'indirizzo, «Annota» che prepara un commento nel composer senza inviarlo, schede per
 * pagina con chiusura. Non pareggiato: l'annotazione di un ELEMENTO dentro la pagina viva
 * (una webview Electron può iniettare un overlay; una cornice di un'altra origine non lo
 * permette) — registrato nel ledger.
 */

import { t, tn, linguaCorrenteDiT } from './lingua.js';
import { renderizzaAnnotazioni, MASSIMO_ANNOTAZIONI } from './annotazioni.js';
import { sembraHtml, testoLeggibile, riassuntoPulizia } from './testo-pagina.js'; // 06/9 O-28: il sorgente di una pagina non si legge

export const TESTI = Object.freeze({
  intestazione: 'Letture della sessione',
  riepilogoLetture: (n) => tn('Testo acquisito dall’agente · {n} pagina', 'Testo acquisito dall’agente · {n} pagine', n),
  riepilogoMisto: (letture, vive) => `${tn('{n} lettura dell’agente', '{n} letture dell’agente', letture)} · ${tn('{n} pagina aperta da te', '{n} pagine aperte da te', vive)}`,
  riepilogoVuoto: 'Nessuna pagina ancora',
  posizioneLettura: (i, n) => t('Lettura {i} di {n}', { i, n }),
  posizioneViva: 'Pagina aperta da te · viva dentro TALOS',
  posizioneBloccata: 'Pagina aperta da te · non mostrabile qui',
  posizioneCaricamento: 'Apertura in corso…',
  /* ⛔ 07/9, guardando lo screenshot dopo un ricaricamento: «senza navigazione interattiva» era
     diventato falso — dentro una pagina viva ci si clicca, si scorre e si scrive. Una riga che
     descrive limiti che non esistono più fa credere che la funzione non ci sia. */
  limitiLetture: 'Le letture dell’agente sono copie testuali; una pagina che apri tu è viva e ci puoi navigare dentro. Le note restano in questo browser.',
  /* ⛔ 07/9 — «quando il sito lo consente» non è più vero: un sito che vieta la cornice ora si apre
     lo stesso, in un browser che TALOS pilota sul tuo computer. La riga diceva un limite che
     abbiamo tolto — e una promessa al ribasso invecchia peggio di una mancata. */
  limitiVive: 'Le letture sono copie testuali; una pagina che apri tu è viva dentro TALOS — se il sito vieta la cornice, la mostra un browser pilotato sul tuo computer. Le note restano qui.',
  provenienzaAgente: 'Agente',
  provenienzaTu: 'Tu',
  cornicePronta: 'Pagina viva',
  chiediAllAgente: 'Chiedi all’agente di leggerla',
  nessunaScheda: 'Nessuna pagina letta',
  /* ⭐ 16/09 — le facce dei sei stati. Nessun nome tecnico a schermo: «loading» è un nome per il
     codice, a chi guarda si dice che cosa sta succedendo e che cosa può fare adesso. */
  statoApro: 'Apertura in corso…',
  statoAproSotto: 'Se ci mette troppo puoi annullare: la scheda resta dov’è.',
  statoRiprovo: (tentativo, totale) => t('Non ha risposto: riprovo ({tentativo} di {totale})…', { tentativo, totale }),
  statoRiprovoSotto: 'Ogni tentativo aspetta un po’ di più del precedente.',
  statoNonRaggiunta: 'Non sono riuscito ad aprire questa pagina',
  statoAnnullata: 'Apertura annullata',
  statoAnnullataSotto: 'Hai chiuso la scheda mentre apriva: non è stato scritto niente.',
  statoRiposo: 'Questa pagina era a riposo: la sto ricaricando',
  statoRiposoSotto: 'Restano vive le ultime pagine che hai guardato; le altre si ricaricano quando ci torni.',
  statoVivaInPausa: 'Questa pagina è in pausa',
  riprova: 'Riprova',
  annulla: 'Annulla',
  /*
   * ⛔⛔ 16/09/2026, SECONDO GIRO DI RIPARAZIONE — «30 caratteri» IN UN PANNELLO INGLESE.
   * Stavano nel codice come pezzo di stringa attaccato a un numero (`${n} caratteri`), quindi
   * nessun dizionario poteva vederle e nessun cancello poteva accorgersene: si vedono nella foto
   * `artifacts/p0-B/browser-p0-stato-light-en.png`, sotto un titolo inglese. Qui diventano due
   * frasi di `TESTI` — cioè roba che `tests/unit/i18n-copertura.test.mjs` legge e di cui pretende
   * l'inglese — con il numero come segnaposto e il plurale scelto dalla lingua risolta.
   */
  caratteriUno: '{n} carattere',
  caratteriMolti: '{n} caratteri',
  annullaNavigazione: 'Annulla navigazione',
  /*
   * ⛔⛔ 16/09, GIRO DI RIPARAZIONE — LE ETICHETTE DELLA BARRA, trovate GUARDANDO la foto inglese.
   *   In una app tutta inglese la barra del Browser diceva «Rileggi · Pagina · Testo dell'agente ·
   *   Annota · Nota locale · Copia testo». Non era una dimenticanza del dizionario: quei testi sono
   *   scritti a mano nel modello HTML (`public/index.html`) e nessuno li traduce mai, perché non
   *   portano nessun marcatore. È la stessa malattia del motivo del server, in un altro punto
   *   della stessa schermata — e il cancello i18n non poteva vederla, perché guarda le TESTI dei
   *   componenti e quelle frasi non stavano in nessun componente.
   * ⇒ Le scrive il componente, a ogni disegno (quindi anche al cambio di lingua, che ridisegna).
   *   Il modello HTML resta com'è: non è un file di questa corsia, e il suo testo continua a valere
   *   come partenza per chi apre la pagina prima che il codice giri.
   */
  barraRileggi: 'Rileggi',
  barraAnnota: 'Annota',
  barraNota: 'Nota locale',
  barraCopia: 'Copia testo',
  barraModoPagina: 'Pagina',
  barraModoTesto: 'Testo dell’agente',
  unaVivaAllaVolta: 'La pagina pilotata è una alla volta: aprendone un’altra questa resta nella sua scheda e si riapre quando ci torni.',
  /*
   * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LE FRASI DEI GUASTI VIVONO QUI, non nel server.
   *
   * Bocciatura del controllore, con la prova: le foto consegnate mostravano il pannello col titolo
   * in inglese («I could not open this page») e il motivo in italiano («Il sito non ha risposto in
   * tempo (6 secondi)»), dentro una app per il resto tutta inglese. Il commit diceva quel difetto
   * riparato: le foto dicevano di no.
   *
   * ⛔ La causa era STRUTTURALE, non una riga dimenticata: il motivo lo COMPONEVA il server, con un
   *   numero interpolato dentro, e qui finiva dentro `t()` — un dizionario a chiavi fisse. La
   *   chiave «Il sito non ha risposto in tempo (6 secondi)» non ci sarà mai, né quella con 11.
   *
   * ⇒ Il server manda ciò che sa — un `genere` stabile e i suoi `dettagli` — e la frase si scrive
   *   QUI, con il numero come SEGNAPOSTO. Così la chiave è una sola per tutti i numeri, il cancello
   *   `tests/unit/i18n-copertura.test.mjs` la vede (legge le stringhe di TESTI) e pretende
   *   l'inglese, e una lingua nuova non richiede di toccare il server.
   * Ricerca 16/09/2026 — api-craft «Shall REST API error messages be internationalized?»:
   *   «locale-neutral errors with well-defined error values… allows the consumer to localize».
   */
  guastoTimeout: 'Il sito non ha risposto in tempo ({secondi} secondi)',
  guastoDns: 'Questo indirizzo non esiste',
  guastoRifiuto: 'Nessuno risponde a questo indirizzo',
  guastoCertificato: 'Il sito ha un certificato non valido',
  guastoRete: 'Non sono riuscito a raggiungere il sito',
  guastoIndirizzo: 'Questo non è un indirizzo che posso aprire',
  rifiutoDeny: 'Il sito vieta di essere mostrato dentro un altro sito',
  rifiutoSameOrigin: 'Il sito si mostra solo dentro le sue stesse pagine',
  rifiutoFrameAncestors: 'Il sito consente la cornice solo ad altri siti, non a TALOS',
  /* i rimedi: uno per genere, scelti perché portino a un gesto vero. Prima si sceglievano leggendo
     la frase italiana del server con quattro regex — in inglese non agganciavano niente. */
  rimedioIndirizzo: 'Controlla l’indirizzo.',
  rimedioCertificato: 'Il sito ha un certificato non valido: aprilo fuori da TALOS se ti fidi.',
  rimedioAspetta: 'Riprova fra un momento.',
  rimedioServizio: 'Controlla che il servizio sia acceso.',
  /* le parole degli stati sulla striscia: si ascoltano (sr-only), non si guardano soltanto */
  etichettaApre: 'in apertura',
  etichettaRiprova: 'sto riprovando',
  etichettaNonRaggiunta: 'non raggiunta',
  etichettaAnnullataBreve: 'annullata',
});

/**
 * La frase da mostrare per un guasto o un rifiuto, nella lingua di chi guarda.
 * ⛔ Il `motivo` del server NON si traduce e non si mostra: è diagnostica. Qui si compone dal
 *   `genere` (stabile) e dai `dettagli` (i parametri), che è l'unica forma traducibile.
 * @param {string|null|undefined} genere @param {{secondi?:number}} [dettagli]
 * @returns {string} '' se il genere è sconosciuto — meglio niente che una frase sbagliata
 */
export function frasePerGenere(genere, dettagli = {}) {
  switch (String(genere || '')) {
    case 'timeout': return t(TESTI.guastoTimeout, { secondi: Number(dettagli?.secondi ?? 0) });
    case 'dns': return t(TESTI.guastoDns);
    case 'rifiuto': return t(TESTI.guastoRifiuto);
    case 'certificato': return t(TESTI.guastoCertificato);
    case 'rete': return t(TESTI.guastoRete);
    case 'indirizzo': return t(TESTI.guastoIndirizzo);
    case 'xfo-deny': return t(TESTI.rifiutoDeny);
    case 'xfo-sameorigin': return t(TESTI.rifiutoSameOrigin);
    case 'frame-ancestors': return t(TESTI.rifiutoFrameAncestors);
    default: return '';
  }
}

/**
 * Il consiglio che c'entra con QUEL guasto.
 * ⛔ 07/9, guardando lo screenshot di un dominio inesistente: il rimedio era «Chiedi all'agente di
 *   leggerla» — falso, un nome che non esiste non lo risolve nemmeno l'agente.
 * ⛔ 16/09: prima si sceglieva leggendo la frase italiana del server con quattro espressioni
 *   regolari. In inglese non agganciavano niente, e una parola cambiata nel server spegneva il
 *   rimedio in silenzio. Ora si sceglie dal genere, che è un codice e non una frase.
 * @param {string|null|undefined} genere
 */
export function rimedioPerGenere(genere) {
  switch (String(genere || '')) {
    case 'dns': case 'indirizzo': return t(TESTI.rimedioIndirizzo);
    case 'certificato': return t(TESTI.rimedioCertificato);
    case 'timeout': case 'rete': return t(TESTI.rimedioAspetta);
    case 'rifiuto': return t(TESTI.rimedioServizio);
    /* un rifiuto del sito non è un guasto: la via è farla leggere all'agente, e quella resta */
    default: return t('{invito}: usa «Rileggi».', { invito: t(TESTI.chiediAllAgente) });
  }
}

/**
 * La parola dello stato per chi ASCOLTA (WCAG 1.4.1: un lettore di schermo non annuncia i colori).
 * ⛔ Una scheda sana non ha etichetta: scriverla su ogni riga sarebbe rumore, non informazione.
 * @param {string} situazione uno di STATI_SCHEDA
 */
export function etichettaStatoScheda(situazione) {
  switch (situazione) {
    case 'loading': return t(TESTI.etichettaApre);
    case 'retrying': return t(TESTI.etichettaRiprova);
    case 'error': case 'unreachable': return t(TESTI.etichettaNonRaggiunta);
    case 'cancelled': return t(TESTI.etichettaAnnullataBreve);
    default: return '';
  }
}

/*
 * ⛔⛔⛔ 16/09/2026, GIRO DI RIPARAZIONE — LO STATO DI UNA LINGUETTA HA TRE CANALI, non uno.
 *
 * Bocciatura: il blocco CSS del 16/09 portava lo stato di una scheda non attiva col SOLO colore,
 * su un'icona `aria-hidden="true"`. Chi non distingue i colori non vedeva niente; chi usa un
 * lettore di schermo non sentiva niente. E il punto citava WCAG 1.4.1 come fonte: la regola era
 * citata e violata nello stesso blocco.
 *
 * Ricerca 16/09/2026 (testparty.ai «Guide to WCAG 1.4.1 — Use of Color», accessibility.chat
 * «Status Indicators Beyond Color Coding»): «screen readers don't announce colors… combine color
 * with text labels, icons, or patterns». ⇒ Tre canali insieme: il COLORE (già c'era), la FORMA
 * (un'icona diversa per stato — un orologio, un quadrato tratteggiato col punto interrogativo, una
 * croce) e il TESTO (`sr-only`, che si ascolta e si trova con una ricerca nella pagina).
 */
const ICONA_PER_STATO = Object.freeze({
  loading: '#i-clock',
  retrying: '#i-clock',
  error: '#i-ignoto',
  unreachable: '#i-ignoto',
  cancelled: '#i-x',
});

export const MASSIMO_SCHEDE = 12;

/*
 * ⭐⭐⭐ 16/09/2026, P0 corsia B — LA SCHEDA DIVENTA UNO STATO, NON UNA COINCIDENZA.
 *
 * Fino a ieri una scheda era «quello che si vede adesso»: il modo Pagina/Testo era UNA variabile
 * per tutto il browser, il caricamento si mostrava solo per le pagine vive, l'errore era una riga
 * sola in cima (`#browserAvviso`) e una lettura che stava interrogando il server non mostrava
 * niente — schermo vuoto, senza spiegazione. ⇒ Ogni scheda ha adesso il SUO stato, e ogni stato ha
 * la sua faccia. Sei, non uno:
 *   loading      sto aprendo (vale anche per una lettura dell'agente e per una cornice)
 *   loaded       c'è
 *   retrying     non ha risposto, sto riprovando (con quale tentativo e fra quanto)
 *   error        ha risposto di no: il motivo vero, e un rimedio che c'entra col motivo
 *   unreachable  non ci sono arrivato nemmeno riprovando
 *   cancelled    hai chiuso o hai cambiato pagina mentre apriva: niente scritture in ritardo
 *
 * Ricerca 16/09/2026 (per il vocabolario e per il fatto che «loading» non è un booleano):
 * TanStack Query «Query States» (pending/error/success + fetchStatus a parte), MDN «AbortController»
 * (un annullamento NON è un errore e non si racconta come tale), AWS Architecture Blog «Exponential
 * Backoff And Jitter» (il ritentativo è uno stato che si dichiara, non un silenzio).
 */
export const STATI_SCHEDA = Object.freeze(['loading', 'loaded', 'retrying', 'error', 'unreachable', 'cancelled']);

/**
 * Lo stato di UNA scheda, qualunque sia il suo tipo. Il modello che arriva da `legacy/app.js` parla
 * italiano (`stato: 'caricamento'|'pronta'|'ritento'|'bloccata'|'irraggiungibile'|'annullata'`);
 * qui si traduce nei sei nomi canonici, e le letture dell'agente — che uno stato non l'hanno mai
 * avuto — lo prendono da ciò che sta succedendo davvero (la domanda al server è in volo?).
 * @param {object|null} s
 * @returns {'loading'|'loaded'|'retrying'|'error'|'unreachable'|'cancelled'}
 */
export function statoDellaScheda(s) {
  if (!s) return 'loaded';
  switch (s.stato) {
    case 'caricamento': return 'loading';
    case 'ritento': return 'retrying';
    case 'annullata': return 'cancelled';
    case 'irraggiungibile': return 'unreachable';
    case 'bloccata': return 'error';
    default: break;
  }
  /* ⛔ Una LETTURA mentre chiede al server se il sito si lascia incorniciare: `incorniciabile` vale
     `null` (in volo, vedi `chiediCornice` in app.js) oppure non c'è ancora. Prima qui non si
     mostrava niente: la cornice arrivava dopo, e nel mezzo lo schermo era vuoto. */
  if (s.tipo !== 'viva' && s.incorniciabile === null) return 'loading';
  return 'loaded';
}

/*
 * ⛔ 16/09 — QUANTE CORNICI RESTANO VIVE INSIEME. Dal 16/09 l'iframe di una scheda non si
 *   ricostruisce più al cambio scheda (si nasconde), quindi le pagine restano caricate: è ciò che
 *   rende istantaneo tornare indietro, ed è anche memoria che non si libera più da sola.
 *   Con `MASSIMO_SCHEDE = 12` sarebbero dodici documenti vivi insieme.
 * Ricerca 16/09/2026 (Chromium «Process Model and Site Isolation»; Chrome for Developers «Tab
 * Discarding» e Memory Saver): una cornice di un'altra origine gira in un PROCESSO suo, 20-100 MB
 * l'uno, e Chrome stesso non tiene tutto — scarica i documenti meno usati di recente e li ricarica
 * quando ci torni. Stessa regola qui, e detta a schermo invece che di nascosto.
 * ⛔ Il numero non è a caso: quattro è il numero di schede che si alternano davvero mentre si
 *   lavora (una pagina, la sua documentazione, il dev server, una ricerca) — sopra quel numero si
 *   scarica la più vecchia, e la scheda lo DICE quando ci torni («era stata messa a riposo»).
 */
export const MASSIMO_CORNICI_VIVE = 4;

/** Un dev server sul computer della persona: la scheda passa dal proxy locale e si può annotare. */
export function localeAnnotabile(url) {
  try { const h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost'); } catch { return false; }
}
export const PROXY_BROWSER = '/api/v1/browser/proxy?url=';

/** L'host e il percorso corto di un indirizzo, per le schede e la cronologia (mockup: «example.org/documentazione»). */
export function hostDaUrl(url) {
  try {
    const u = new URL(String(url));
    const percorso = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${u.host}${percorso}`;
  } catch { return String(url || ''); }
}

/** Il titolo di una lettura: la prima riga non vuota del testo (max 80), altrimenti l'host. */
export function titoloDaLettura(pagina) {
  if (pagina?.titolo) return pagina.titolo;
  const riga = String(pagina?.testo || '').split('\n').map((r) => r.trim()).find((r) => r.length > 0);
  if (riga) return riga.length > 80 ? `${riga.slice(0, 79)}…` : riga;
  return hostDaUrl(pagina?.url) || t('Pagina');
}

/** «localhost:5173» → «http://localhost:5173/»; «example.org/x» → https; una frase non è un indirizzo. */
export function urlApribile(testo) {
  const t = String(testo || '').trim();
  if (!t || /\s/.test(t)) return null;
  const conSchema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(t) ? `http://${t}` : `https://${t}`);
  try {
    const u = new URL(conSchema);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

const oraRoma = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const giornoRoma = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' });

/*
 * ⛔ 08/9: quando la lettura è stata TAGLIATA, il numero che conta non è quanto l'agente ha
 *   ricevuto — è quanto NON ha ricevuto. Nella riga della lettura quel dato si troncava per primo
 *   («…(Roma) …», misurato a 1600), cioè spariva proprio quando la pagina era grande, che è
 *   l'unico caso in cui serve.
 *
 * Ricerca 08/09/2026 («Tool-Result Truncation: The Silent Bug That Makes Agents Lie», dev.to;
 * apxml «Strategies for Text Truncation»): una troncatura silenziosa porta l'agente a riassumere
 * con sicurezza cose che non ha mai visto ⇒ il rapporto va mostrato, non il solo ricevuto.
 *
 * Il kernel segna il taglio così: «… [N caratteri tolti nel mezzo: <motivo>] …».
 * @returns {{ricevuti:number, tolti:number, totale:number, tagliato:boolean}}
 */
export function quantoHaLetto(testo) {
  const s = String(testo || '');
  const ricevuti = s.length;
  let tolti = 0;
  for (const m of s.matchAll(/\[(\d+) caratteri tolti nel mezzo/g)) tolti += Number(m[1]) || 0;
  return { ricevuti, tolti, totale: ricevuti + tolti, tagliato: tolti > 0 };
}

/** «4,2k» — un numero grande si legge a colpo d'occhio, non si conta cifra per cifra. */
export function breve(n) {
  const v = Number(n) || 0;
  if (v < 1000) return String(v);
  const k = v / 1000;
  return `${k < 10 ? k.toFixed(1).replace('.', ',') : Math.round(k)}k`;
}

/*
 * ⛔ 16/09/2026 — un numero si scrive col separatore della LINGUA RISOLTA, non con uno fisso.
 *   Prima qui c'era `toLocaleString('it-IT')`: «12.345» dentro una app inglese, dove si scrive
 *   «12,345». Il codice della lingua (`it`, `en`) è già un tag BCP-47 valido, quindi non serve
 *   nessuna tabella di conversione: si passa quello che `t()` sta usando in questo momento.
 */
function numeroLocale(n) {
  const v = Number(n) || 0;
  try { return v.toLocaleString(linguaCorrenteDiT()); } catch { return String(v); }
}

/** «Agente · 05/09, 10:42 (Roma) · 365 caratteri» — la provenienza di una lettura, nel formato del mockup. */
export function formattaProvenienza(pagina) {
  const quando = pagina?.quando ? new Date(pagina.quando) : null;
  const chi = t(pagina?.origine === 'tu' ? TESTI.provenienzaTu : TESTI.provenienzaAgente);
  const parti = [chi];
  if (quando && !Number.isNaN(quando.getTime())) parti.push(`${giornoRoma.format(quando)}, ${oraRoma.format(quando)} (Roma)`);
  if (pagina?.tipo !== 'viva') {
    const quanti = String(pagina?.testo || '').length;
    parti.push(tn(TESTI.caratteriUno, TESTI.caratteriMolti, quanti, { n: numeroLocale(quanti) }));
  }
  return parti.join(' · ');
}

/*
 * ⛔ 07/9, owner: «quella sopra deve diventare un sistema di schede, esattamente come fa un browser».
 * Un browser non scrive l'indirizzo sulla linguetta: scrive il TITOLO della pagina, e tiene lo stato
 * a parte. Le letture dell'agente cominciano col rigo «HTTP 200 · https://…», e quel rigo finiva tale
 * e quale sulla scheda: sette linguette che dicevano tutte «HTTP 200 · https://…», illeggibili
 * (screenshot dell'owner). Qui il rigo si smonta: il numero diventa una pillola — e solo se non è
 * 2xx, perché «tutto bene» non merita un'etichetta — e il nome viene dal `<title>` della pagina, che
 * nel testo acquisito c'è già e nessuno leggeva.
 */
const RIGO_STATO = /^\s*HTTP\s+(\d{3})\s*[·|-]\s*(\S+)\s*$/i;

/** Il numero di stato di una lettura, se il testo acquisito lo dichiara. @returns {number|null} */
export function statoHttpDiLettura(pagina) {
  const prima = String(pagina?.testo || '').split('\n', 1)[0];
  const m = RIGO_STATO.exec(prima);
  return m ? Number(m[1]) : null;
}

/** Il `<title>` di una pagina HTML, ripulito e accorciato. @returns {string} vuoto se non c'è. */
export function titoloDaHtml(grezzo) {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(grezzo || ''));
  if (!m) return '';
  const testo = m[1].replace(/\s+/g, ' ').trim()
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return testo.length > 80 ? `${testo.slice(0, 79)}…` : testo;
}

/** Il nome di una scheda: il titolo vero se c'è, poi il `<title>` della pagina, poi host e percorso. */
/**
 * Una pagina si annota quando è NOSTRA: un dev server passato dal proxy (stessa origine) o una
 * pagina viva dentro il browser che TALOS pilota (il DOM lo leggiamo via CDP). Una lettura o una
 * cornice altrui no: di quelle non possiamo toccare il documento.
 */
export function paginaAnnotabile(s) {
  // ⛔ 16/09 — si annota ciò che è DAVVERO a schermo: non solo «non bloccata», ma caricata (una
  //   pagina che sta aprendo, che sta riprovando o annullata non ha niente da annotare).
  return Boolean(s && s.tipo === 'viva' && (s.proxata || s.viaVista === 'vivo') && statoDellaScheda(s) === 'loaded');
}

export function titoloScheda(pagina) {
  if (pagina?.titolo) return pagina.titolo;
  const daHtml = titoloDaHtml(pagina?.testo);
  if (daHtml) return daHtml;
  /*
   * ⛔ 08/09 — qui c'era `hostDaUrl(...) || titoloDaLettura(pagina)`, e l'host vince SEMPRE su un
   *   URL valido: `titoloDaLettura` non veniva mai raggiunta, era codice morto. Effetto a schermo:
   *   le schede di una LETTURA si chiamavano «example.org» e «example.org/documentazione» invece che
   *   col loro contenuto — due schede quasi identiche, e per riconoscerle bisognava aprirle.
   *   Il mockup le disegna col titolo («Pagina iniziale del progetto», «Registro dei processi»):
   *   trovato dal cancello di parità appena è tornato a girare, non da una lettura del codice.
   *
   * ⛔ Ma la prima cura era TROPPO LARGA, e un test l'ha respinta: per una pagina SCARICATA la prima
   *   riga è il rigo di stato («HTTP 415 · https://…»), e l'owner il 07/09 ha chiesto esattamente il
   *   contrario — «nome vero della pagina, e lo stato scritto solo quando non è 2xx». Mostrare quel
   *   rigo come nome della scheda era il difetto che quel giorno ha curato.
   * ⇒ Le due cose sono DIVERSE e vanno distinte, non mediate: una pagina scaricata porta il rigo di
   *   stato e allora vale l'host; un testo acquisito dall'agente non ce l'ha, e allora vale la sua
   *   prima riga. Il discriminante c'è già ed è misurabile: `statoHttpDiLettura`.
   */
  if (statoHttpDiLettura(pagina) === null) return titoloDaLettura(pagina);
  return hostDaUrl(pagina?.url) || titoloDaLettura(pagina);
}

/** Chi resta attiva quando si chiude la scheda in posizione `indice` (stessa regola del Terminale). */
export function prossimaDopoChiusura(lista, indice) {
  const resto = lista.filter((_, i) => i !== indice);
  return (resto[indice] ?? resto[indice - 1]) ?? null;
}

const $ = (radice, sel) => radice.querySelector(sel);

/**
 * @param {HTMLElement} schermo `#schermoBrowser`
 * @param {{azioni:object}} opzioni azioni: seleziona(id) · chiudi(id) · apri(url) · rileggi(scheda) · annota(scheda) · copia(scheda) · apriFuori(scheda) · salvaNota(scheda, testo) · decidi(requestId, si)
 */
/*
 * `modoIniziale` esiste per il LABORATORIO, e fino all'08/09 valeva `'testo'`: il mockup illustrava
 * lo stato «Testo dell'agente», perché una pagina renderizzata non si confronta a pixel con un
 * disegno statico.
 * ⛔ 08/09 quella premessa è CADUTA: l'owner ha chiesto «rimetti il pulsante pagina accanto a testo
 *   dell'agente» e il mockup adesso illustra «Pagina» premuto. Il laboratorio continuava a passare
 *   `'testo'`, quindi app e mockup mostravano premuti due pulsanti DIVERSI — ed è esattamente il
 *   rosso che il cancello di parità ha trovato appena è tornato a girare (era rotto dal commit
 *   `d706c8fe`, che ha cancellato il config a cui puntava senza togliere il riferimento).
 *   ⇒ `lab/main.js` passa `'pagina'`. Il parametro resta: la differenza fra prodotto e laboratorio
 *     si dichiara qui, non si nasconde in una condizione.
 */
export function creaBrowser(schermo, { azioni = {}, modoIniziale = 'pagina' } = {}) {
  const el = {
    riepilogo: $(schermo, '#browserRiepilogo'), schede: $(schermo, '#browserSchede'),
    indietro: $(schermo, '[data-browser-demo="back"], [data-browser-action="back"]'), avanti: $(schermo, '[data-browser-demo="forward"], [data-browser-action="forward"]'),
    url: $(schermo, '#urlBrowser'), fuori: $(schermo, '[data-browser-demo="open"], [data-browser-action="open"]'),
    posizione: $(schermo, '#browserPosizione'), rileggi: $(schermo, '[data-browser-demo="reload"], [data-browser-action="reload"]'),
    annota: $(schermo, '[data-browser-demo="annotate"], [data-browser-action="annotate"]'), nota: $(schermo, '[data-browser-demo="note"], [data-browser-action="note"]'),
    copia: $(schermo, '[data-browser-demo="copy"], [data-browser-action="copy"]'),
    avviso: $(schermo, '#browserAvviso'), bloccato: $(schermo, '#browserBloccato'), caricamento: $(schermo, '#browserCaricamento'), vuoto: $(schermo, '#browserVuoto'),
    articolo: $(schermo, '#browserPagina'), titolo: $(schermo, '#browserTitolo'), provenienza: $(schermo, '#browserProvenienza'), testo: $(schermo, '#browserTesto'),
    editorNota: $(schermo, '#browserEditorNota'), notaInput: $(schermo, '#browserNotaInput'), notaSalvata: $(schermo, '#browserNotaSalvata'),
    live: $(schermo, '#browserLive'), nuovaScheda: $(schermo, '#browserNuovaScheda'), limiti: $(schermo, '#browserLimiti'),
    consenti: $(schermo, '[data-action="consentiBrowser"]'), nega: $(schermo, '[data-action="negaBrowser"]'), annulla: $(schermo, '[data-action="annullaBrowser"]'),
    conservaNota: $(schermo, '[data-action="conservaNotaBrowser"]'), chiudiNota: $(schermo, '[data-action="chiudiNotaBrowser"]'),
    bloccatoTesto: $(schermo, '#browserBloccato p.talos-muted'),
    annotazioni: $(schermo, '#browserAnnotazioni'),
    modi: [...schermo.querySelectorAll('[data-browser-modo]')], // 06/9 O-28: Pagina / Testo dell'agente
  };
  /*
   * ⛔⛔⛔ 16/09/2026, ordine dell'owner (P0, punto 5): «ogni tab deve mantenere indipendentemente il
   *   proprio stato… Tab A → Pagina, B → Testo, C → Pagina; tornando su A deve restare Pagina;
   *   associato all'ID della singola tab; sopravvive a switch, re-render, aggiornamento contenuto,
   *   navigazione nella stessa tab, streaming, modifiche delle altre tab».
   *
   * ⛔ Questo RIBALTA la decisione dell'11/09 («al cambio scheda il modo torna sempre a pagina»),
   *   e va detto perché il capovolgimento non è un capriccio: quella cura curava il sintomo giusto
   *   con lo strumento sbagliato. Il difetto dell'11/09 era che `stato.modo` era UNA VARIABILE SOLA
   *   per tutto il browser — si trascinava dietro l'ultimo valore, e `modiScelti` copriva metà dei
   *   casi. Riazzerare quella variabile faceva sparire il trascinamento *e* la memoria della scheda.
   *   ⇒ La forma giusta non è «azzera», è «tienilo per scheda»: `modi[id]`, con `'pagina'` come
   *     nascita di ogni scheda nuova. Il trascinamento sparisce lo stesso (una scheda mai toccata
   *     nasce in «pagina», sempre), e la scelta di chi guarda non si perde più.
   *
   * Ricerca 16/09/2026: MDN «WebExtensions tabs» e Chrome «chrome.tabs» — lo stato per scheda si
   * tiene in una mappa indicizzata dall'ID della scheda, e l'ID dev'essere STABILE (di lì la
   * seconda metà di questa cura: gli id posizionali `lettura-<indice>` cambiavano significato ogni
   * volta che l'agente leggeva una pagina nuova).
   *
   * Le tre mappe, e perché sono tre:
   *   · `modi`        ciò che si VEDE per quella scheda (Pagina o Testo);
   *   · `modiChiesti` ciò che la PERSONA ha chiesto: disattiva il ripiego automatico al testo, e
   *                   vale solo per la scheda sua (prima era una variabile globale, quindi la
   *                   richiesta fatta su una scheda zittiva il ripiego su TUTTE le altre);
   *   · `riaperte`    freno anti-anello per la riapertura col browser pilotato (era già così).
   */
  let stato = {
    schede: [], attiva: null, note: {}, richiesta: null, annotazioni: {}, annotaAttivo: false,
    modoPredefinito: modoIniziale === 'testo' ? 'testo' : 'pagina',
    modi: {}, modiChiesti: {}, riaperte: new Set(), riposate: new Set(),
  };
  /** Il modo di UNA scheda: quello scelto per lei, o il predefinito — mai quello della scheda di prima. */
  const modoDi = (id) => (id && stato.modi[id]) || stato.modoPredefinito;
  const impostaModo = (id, m) => { if (id) stato.modi[id] = m; };
  const modoAttivo = () => modoDi(stato.attiva);
  const frameAttivo = () => el.live?.querySelector('iframe') || null;
  const dialogaConOverlay = (messaggio) => { try { frameAttivo()?.contentWindow?.postMessage({ fonte: 'talos-genitore', ...messaggio }, '*'); } catch { /* cornice non pronta */ } };
  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || m.fonte !== 'talos-annota') return;
    const f = frameAttivo(); if (!f || e.source !== f.contentWindow) return;
    const s = attiva(); if (!s || s.tipo !== 'viva') return;
    if (m.tipo === 'elemento') azioni.annotazione?.(s, m.fatto);
    else if (m.tipo === 'naviga' && m.url) azioni.apri?.(m.url, s.id);
    else if (m.tipo === 'esc') azioni.annota?.(s, false);
    else if (m.tipo === 'pronta') { if (m.titolo && !s.titolo) { s.titolo = m.titolo; renderizza(); } if (stato.annotaAttivo) dialogaConOverlay({ tipo: 'annota', attivo: true }); azioni.caricata?.(s.id); }
  });
  const attiva = () => stato.schede.find((s) => s.id === stato.attiva) || null;
  const indiceAttiva = () => stato.schede.findIndex((s) => s.id === stato.attiva);

  /* --- gesti --- */
  el.indietro?.addEventListener('click', () => { const i = indiceAttiva(); if (i > 0) azioni.seleziona?.(stato.schede[i - 1].id); });
  el.avanti?.addEventListener('click', () => { const i = indiceAttiva(); if (i >= 0 && i < stato.schede.length - 1) azioni.seleziona?.(stato.schede[i + 1].id); });
  el.fuori?.addEventListener('click', () => { const s = attiva(); if (s) azioni.apriFuori?.(s); });
  el.rileggi?.addEventListener('click', () => { const s = attiva(); if (s) azioni.rileggi?.(s); });
  /*
   * ⛔ 07/9, trovato dalla prova DA UMANO (C26): premendo «Annota» su una pagina VIVA non compariva
   *   nessuno spillo — il pulsante preparava una frase nel composer. Gli spilli erano previsti solo
   *   per una pagina PROXATA (un dev server locale), perché quando questo codice è nato la vista
   *   viva non esisteva. Una pagina che TALOS pilota si annota come qualunque altra: è anzi il caso
   *   più utile, perché è lì che si guarda un sito vero.
   */
  el.annota?.addEventListener('click', () => {
    const s = attiva(); if (!s) return;
    if (paginaAnnotabile(s)) azioni.annota?.(s, !stato.annotaAttivo); else azioni.annota?.(s);
  });
  el.copia?.addEventListener('click', () => { const s = attiva(); if (s) azioni.copia?.(s); });
  // 06/9 O-28: i due modi di guardare una lettura. Cambiare modo non ricarica niente: la cornice resta.
  for (const b of el.modi || []) {
    b.addEventListener('click', () => {
      /* ⛔ 07/9 lo switch era diventato UN pulsante solo, che doveva ALTERNARE; 08/9 l'owner ha
         rimesso «Pagina» accanto a «Testo dell'agente». Con due pulsanti torna una scelta, non un
         interruttore: premere quello già acceso non deve spegnerlo, o si finirebbe sull'altro modo
         senza averlo chiesto. L'alternanza resta viva solo se un giorno il compagno sparisce. */
      const suo = b.dataset.browserModo === 'testo' ? 'testo' : 'pagina';
      const opposto = suo === 'testo' ? 'pagina' : 'testo';
      const solo = (el.modi || []).length < 2;
      const scelto = modoAttivo() === suo ? (solo ? opposto : suo) : suo;
      /*
       * ⛔ 08/09/2026, owner: «quando clicco pagina la pagina non si ricarica». Riprodotto: su un
       *   sito che vieta la cornice, `corniceDellaLettura` rimetteva il modo a 'testo' a OGNI
       *   render, quindi il clic durava un istante e veniva annullato — un pulsante che non fa
       *   niente e non dice niente, che e' peggio di un pulsante assente.
       *
       * ⇒ Chiedere «Pagina» su una pagina che la cornice non puo' mostrare non e' una richiesta
       *   impossibile: e' esattamente il caso per cui esiste il browser pilotato. Si apre lei.
       */
      const lettura = attiva();
      if (scelto === 'pagina' && lettura && lettura.tipo !== 'viva' && lettura.incorniciabile === false && lettura.url) {
        // ⛔ 16/09 — la richiesta vale piu' del ripiego automatico, ma SOLO per la scheda sua: prima
        //   era una variabile globale e zittiva il ripiego su tutte le altre schede.
        if (lettura.id) { stato.modiChiesti[lettura.id] = 'pagina'; impostaModo(lettura.id, 'pagina'); }
        azioni.apri?.(lettura.url, lettura.id);
        return;
      }
      if (scelto === modoAttivo()) return;
      if (lettura?.id) stato.modiChiesti[lettura.id] = scelto;
      /* ⛔ 08/09/2026, owner: «se il pulsante pagina viene cliccato e cambio scheda mi va a
         visualizzazione sorgente, non deve succedere, deve ricordare la mia scelta». Io avevo
         scritto l'opposto di proposito — azzeravo la scelta al cambio scheda — e sbagliavo: e' una
         PREFERENZA, e si ricorda. Per scheda, cosi' due pagine diverse restano indipendenti.
         ⭐ 16/09: adesso è vero anche nella forma — la preferenza VIVE nella mappa per id, non in
         una variabile globale copiata nella mappa. */
      impostaModo(lettura?.id, scelto);
      if (scelto === 'testo') mostraAvviso('');
      renderizza();
    });
  }
  el.nota?.addEventListener('click', (e) => { e.stopPropagation(); const aperto = !el.editorNota.hidden; el.editorNota.hidden = aperto; el.nota.setAttribute('aria-expanded', String(!aperto)); if (!aperto) { const s = attiva(); el.notaInput.value = (s && stato.note[s.url]) || ''; el.notaInput.focus(); } });
  el.conservaNota?.addEventListener('click', () => { const s = attiva(); if (!s) return; azioni.salvaNota?.(s, el.notaInput.value.trim()); el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); el.nota?.focus(); });
  el.chiudiNota?.addEventListener('click', () => { el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); el.nota?.focus(); });
  el.consenti?.addEventListener('click', () => { if (stato.richiesta) azioni.decidi?.(stato.richiesta.requestId, true); });
  el.nega?.addEventListener('click', () => { if (stato.richiesta) azioni.decidi?.(stato.richiesta.requestId, false); });
  /* ⛔ 16/09 — «Annulla navigazione» faceva `chiudi`: chiudeva la scheda intera, cioè faceva una
     cosa diversa da quella scritta sul pulsante. Adesso ANNULLA l'apertura (la richiesta in volo
     viene interrotta davvero, vedi `annullaApertura` in app.js) e la scheda resta dov'è, in stato
     «annullata», con «Riprova». Chi vuole chiuderla ha la ✕ sulla linguetta. */
  el.annulla?.addEventListener('click', () => { const s = attiva(); if (!s) return; if (azioni.annullaApertura) azioni.annullaApertura(s); else azioni.chiudi?.(s.id); });
  if (el.url) {
    el.url.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const u = urlApribile(el.url.value); if (u) { azioni.apri?.(u); el.url.blur(); } else { el.url.setAttribute('aria-invalid', 'true'); mostraAvviso(t('Non è un indirizzo: scrivi un sito (es. localhost:5173 o example.org).')); } }
      if (e.key === 'Escape') { e.preventDefault(); el.url.value = attiva()?.url || ''; el.url.removeAttribute('aria-invalid'); el.url.blur(); }
    });
    el.url.addEventListener('focus', () => el.url.select());
    el.url.addEventListener('input', () => el.url.removeAttribute('aria-invalid'));
  }
  el.schede?.addEventListener('click', (e) => {
    // ⛔ 07/9 — prima la «X» era una MISURA: «sei negli ultimi 24 px della linguetta». Con una ✕
    //   vera il bersaglio è un elemento, e chi usa la tastiera o tocca lo schermo la trova come tutti.
    const x = e.target.closest?.('[data-browser-chiudi]');
    if (x) { e.preventDefault(); azioni.chiudi?.(x.dataset.browserChiudi); return; }
    const tab = e.target.closest?.('[data-browser-tab]'); if (!tab) return;
    const id = tab.dataset.browserId;
    if (e.ctrlKey || e.metaKey) azioni.chiudi?.(id); else azioni.seleziona?.(id);
  });
  /*
   * Il «+»: in un browser apre una scheda vuota col cursore nell'indirizzo. Qui non si crea una
   * scheda finta — si porta il fuoco nel campo e si svuota, così il primo tasto che premi scrive
   * l'indirizzo. La scheda nasce quando la pagina esiste, non prima.
   */
  el.nuovaScheda?.addEventListener('click', () => {
    if (!el.url) return;
    el.url.value = '';
    el.url.focus();
    el.url.removeAttribute('aria-invalid');
  });
  el.schede?.addEventListener('auxclick', (e) => { const tab = e.target.closest?.('[data-browser-tab]'); if (tab && e.button === 1) { e.preventDefault(); azioni.chiudi?.(tab.dataset.browserId); } });
  el.schede?.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('[data-browser-tab]'); if (!tab) return;
    const ids = stato.schede.map((s) => s.id); const i = ids.indexOf(tab.dataset.browserId);
    let prossima = null;
    if (e.key === 'ArrowRight') prossima = ids[(i + 1) % ids.length]; else if (e.key === 'ArrowLeft') prossima = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') prossima = ids[0]; else if (e.key === 'End') prossima = ids[ids.length - 1];
    else if (e.key === 'Delete') { e.preventDefault(); azioni.chiudi?.(tab.dataset.browserId); return; }
    else return;
    e.preventDefault(); if (prossima) { azioni.seleziona?.(prossima); el.schede.querySelector(`[data-browser-id="${CSS.escape(prossima)}"]`)?.focus(); }
  });

  function mostraAvviso(testo) { if (!el.avviso) return; el.avviso.textContent = testo || ''; el.avviso.hidden = !testo; }

  /*
   * La striscia delle schede, come in un browser: icona, titolo vero, la ✕ propria, e il «+» in coda
   * (nel markup, fuori dalla lista: dentro un `role="tablist"` non ci va altro che schede).
   * ⛔ 07/9 — prima era un `.talos-tabs__tab` con dentro l'etichetta della lettura, cioè «HTTP 200 ·
   *   https://…» ripetuto su ogni linguetta. Ricerca 07/09/2026 (Mobbin «Tab Bar UI», Eleken «Tabs UX
   *   best practices», Chrome «scrollable-tabstrip»): la scheda porta un nome riconoscibile, lo stato
   *   non si affida al solo colore, e quando non ci stanno più la striscia SCORRE invece di ridurre
   *   tutto a icone.
   */
  function renderizzaSchede() {
    if (!el.schede) return;
    const cornice = el.schede.closest('.talos-tabstrip');
    if (cornice) cornice.hidden = stato.schede.length === 0; // senza schede la lista vuota disegnava una pillola (taccuino, browser-1.png)
    el.schede.replaceChildren();
    const doc = el.schede.ownerDocument;
    stato.schede.forEach((s, i) => {
      const scheda = doc.createElement('div');
      scheda.className = 'talos-tabstrip__scheda';
      scheda.setAttribute('role', 'tab');
      scheda.dataset.browserTab = String(i); scheda.dataset.browserId = s.id;
      const sel = s.id === stato.attiva;
      scheda.setAttribute('aria-selected', String(sel)); scheda.tabIndex = sel ? 0 : -1;
      /* ⛔ 16/09 — lo stato sta su OGNI linguetta, non solo su quelle vive: una lettura che sta
         aprendo o che non si è raggiunta si deve riconoscere dalla striscia, senza aprirla.
         ⛔ `data-stato` (in italiano) NON si tocca: lo legge una regola di `.talos-tabstrip`, che è
         condivisa col Terminale. Il nome canonico va in un attributo suo, che si stila solo da
         dentro `#browserSchede`. */
      if (s.tipo === 'viva') scheda.dataset.stato = s.stato || 'pronta';
      const situazione = statoDellaScheda(s);
      scheda.dataset.statoScheda = situazione;

      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'i talos-tabstrip__icona'); svg.setAttribute('aria-hidden', 'true');
      const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
      /*
       * ⛔⛔ 16/09, GIRO DI RIPARAZIONE (WCAG 1.4.1) — la FORMA cambia con lo stato, non solo il
       *   colore. Prima l'icona era sempre la stessa e solo il CSS la coloriva: chi non distingue
       *   i colori non vedeva alcuna differenza fra una scheda aperta e una non raggiunta.
       *   Le forme sono già nello sprite e si distinguono anche in bianco e nero: un orologio
       *   (sto lavorando), un quadrato tratteggiato col punto interrogativo (non l'ho raggiunta),
       *   una croce (annullata).
       */
      use.setAttribute('href', ICONA_PER_STATO[situazione] || (s.tipo === 'viva' ? '#i-globe' : '#i-doc'));
      svg.append(use); scheda.append(svg);

      const nome = titoloScheda(s);
      const titolo = doc.createElement('span');
      titolo.className = 'talos-tabstrip__titolo'; titolo.textContent = nome;
      scheda.append(titolo);

      /*
       * ⛔⛔ Il terzo canale: la PAROLA. Un lettore di schermo non annuncia i colori e non legge la
       *   forma di un'icona `aria-hidden`; senza questa riga lo stato di una scheda non attiva era
       *   invisibile a chi ascolta e a chi cerca nella pagina. Si scrive solo quando c'è qualcosa
       *   da dire: su una scheda sana sarebbe rumore su ogni riga.
       */
      const parola = etichettaStatoScheda(situazione);
      if (parola) {
        const detto = doc.createElement('span');
        detto.className = 'sr-only'; detto.dataset.statoDetto = situazione;
        detto.textContent = ` (${parola})`;
        scheda.append(detto);
      }

      // lo stato si scrive solo quando c'è qualcosa da dire: 200 su sette schede non è informazione
      const http = statoHttpDiLettura(s);
      if (http !== null && (http < 200 || http >= 300)) {
        const pillola = doc.createElement('span');
        pillola.className = 'talos-tabstrip__stato'; pillola.textContent = String(http);
        scheda.append(pillola);
      }

      const chiudi = doc.createElement('button');
      chiudi.type = 'button'; chiudi.className = 'talos-tabstrip__chiudi'; chiudi.tabIndex = -1;
      chiudi.dataset.browserChiudi = s.id;
      chiudi.setAttribute('aria-label', t('Chiudi {titolo}', { titolo: nome }));
      const svgX = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgX.setAttribute('class', 'i'); svgX.setAttribute('aria-hidden', 'true');
      const useX = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
      useX.setAttribute('href', '#i-x'); svgX.append(useX); chiudi.append(svgX);
      scheda.append(chiudi);

      /* ⛔ 07/9, guardando lo screenshot: quando il nome della scheda è l'host, il fumetto diceva
         «www.iana.org/domains — https://www.iana.org/domains»: due volte la stessa cosa. */
      const indirizzoBreve = hostDaUrl(s.url) || s.url;
      scheda.dataset.tip = nome === indirizzoBreve ? s.url : `${nome} — ${s.url}`;
      scheda.dataset.tipLato = 'sotto'; // il fumetto va SOTTO: sopra copre la barra delle viste
      el.schede.append(scheda);
    });
    // la scheda attiva resta in vista quando la striscia scorre
    el.schede.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }


  /*
   * Il testo che ha letto l'agente. Se è il sorgente di una pagina si mostra ripulito (via codice,
   * stile, testa e navigazione) e il sorgente resta sotto, richiuso: è la verità che ha ricevuto il
   * modello, e non si nasconde. Se non è HTML si mostra com'è: non si tocca ciò che è già a posto.
   */
  function scriviTestoAcquisito(grezzo) {
    const contenitore = el.testo;
    if (!contenitore) return;
    contenitore.replaceChildren();
    if (!sembraHtml(grezzo)) { contenitore.textContent = grezzo; return; }
    const pulito = document.createElement('div');
    pulito.className = 'talos-browser__testo-pulito';
    pulito.textContent = testoLeggibile(grezzo);
    const dettaglio = document.createElement('details');
    dettaglio.className = 'talos-browser__sorgente';
    const riassunto = document.createElement('summary');
    const misure = riassuntoPulizia(grezzo);
    riassunto.textContent = misure
      ? t('Sorgente ricevuto dall’agente ({n} caratteri)', { n: numeroLocale(misure.caratteriPrima) })
      : t('Sorgente ricevuto dall’agente');
    const pre = document.createElement('pre');
    pre.className = 'talos-browser__text';
    pre.textContent = grezzo;
    dettaglio.append(riassunto, pre);
    contenitore.append(pulito, dettaglio);
  }

  function renderizzaCornice(s) {
    if (!el.live) return;
    /*
     * ⛔ 06/9, owner: «la pagina del browser va renderizzata in HTML vero, se no che cazzo di browser
     * è?». Aveva ragione: una lettura dell'agente mostrava soltanto il testo acquisito — cioè, per una
     * pagina vera, il SORGENTE con i meta e la navigazione. Ora la lettura si apre come pagina, dal suo
     * indirizzo vero; il testo che ha letto il modello resta il secondo modo, perché e' quello che lui
     * ha davvero visto e serve a capire cosa ha capito.
     * ⛔ Se il sito rifiuta di stare in una cornice (X-Frame-Options / CSP frame-ancestors) non
     * arriva nessun `load`: dopo l'attesa si passa da soli al testo, dicendo perché. Mai una cornice
     * bianca senza spiegazione.
     */
    /*
     * ⛔ 07/9 — una pagina che vive nel BROWSER PILOTATO non si incornicia: il suo schermo arriva
     *   come fotogrammi, e la cornice qui accanto disegnerebbe sopra il rettangolo grigio di sempre.
     *   Visto nello screenshot: GitHub si vedeva davvero, ma sotto l'iframe rotto che gli stava
     *   sopra. Chi ha `viaVista === 'vivo'` ha già il suo schermo altrove.
     */
    /*
     * ⛔⛔⛔ 16/09/2026, P0 corsia B punto 4(d) — L'IFRAME DI UNA SCHEDA NON SI RICOSTRUISCE PIÙ AL
     *   CAMBIO SCHEDA. Prima bastava `frame.dataset.browserId !== s.id` per fare `replaceChildren()`
     *   e creare un iframe nuovo: passando da A a B e tornando su A, la pagina A si RICARICAVA da
     *   zero — form svuotato, scorrimento perso, la rete ripercorsa. Un browser vero non lo fa.
     *
     * Ricerca 16/09/2026 (whatwg «keepalive attribute on iframe», thread del 2012 tuttora la fonte;
     * Richard Fu «Keeping iframes Running When Hidden»; W3C public-whatwg-archive, Erik Arvidsson):
     * SPOSTARE un iframe nell'albero lo ricarica (IE9 in poi e tutti i motori moderni), NASCONDERLO
     * no — al più il documento viene messo a riposo dalle ottimizzazioni del browser, ma resta quello.
     * ⇒ Le cornici restano tutte dentro `#browserLive`, una sola visibile. Nessuna si sposta.
     *
     * ⛔ E ciò che resta vivo occupa memoria (una cornice di un'altra origine è un PROCESSO suo,
     *   20-100 MB — Chromium «Process Model and Site Isolation»): oltre `MASSIMO_CORNICI_VIVE` si
     *   scarica la meno usata di recente, e quando ci si torna la scheda lo DICE invece di fingere.
     */
    const vuoleViva = s && s.tipo === 'viva' && statoDellaScheda(s) === 'loaded' && s.viaVista !== 'vivo';
    // la lettura si incornicia solo se il server ha detto che quel sito si lascia incorniciare (vedi `corniceDellaLettura`)
    const vuoleLettura = s && s.tipo !== 'viva' && modoDi(s.id) === 'pagina' && Boolean(s.url) && /^https?:/i.test(s.url) && s.incorniciabile !== false && s.incorniciabile !== null;
    const vuole = Boolean(vuoleViva || vuoleLettura);
    const cornici = [...el.live.querySelectorAll('iframe')];
    // ⭐ una sola visibile, le altre NASCOSTE e vive: `hidden` non tocca il documento dentro
    for (const c of cornici) c.hidden = !(vuole && c.dataset.browserId === s.id);
    el.live.hidden = !vuole;
    if (!vuole) return;
    let frame = cornici.find((c) => c.dataset.browserId === s.id) || null;
    if (frame) {
      frame.dataset.usata = String(Date.now()); // per l'ordine di scarico: la meno usata di recente se ne va per prima
      return;
    }
    /* ⛔ Il tetto si applica PRIMA di aggiungere: si scarica la cornice meno usata di recente, e la
       sua scheda se lo ricorda (`riposate`) per poterlo dire quando ci si torna. */
    const daScaricare = cornici
      .filter((c) => c.dataset.browserId !== s.id)
      .sort((a, b) => Number(a.dataset.usata || 0) - Number(b.dataset.usata || 0))
      .slice(0, Math.max(0, cornici.length + 1 - MASSIMO_CORNICI_VIVE));
    for (const vecchia of daScaricare) { stato.riposate.add(vecchia.dataset.browserId); vecchia.remove(); }
    frame = document.createElement('iframe');
    frame.dataset.browserId = s.id;
    frame.dataset.usata = String(Date.now());
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.title = titoloDaLettura(s);
    frame.addEventListener('load', () => azioni.caricata?.(s.id));
    frame.src = s.proxata ? `${PROXY_BROWSER}${encodeURIComponent(s.url)}` : s.url; // un dev server locale passa dal proxy: stessa origine, annotabile
    frame.dataset.proxata = String(Boolean(s.proxata));
    if (s.tipo !== 'viva') {
      frame.dataset.caricata = 'no';
      frame.addEventListener('load', () => { frame.dataset.caricata = 'si'; stato.riposate.delete(s.id); if (attiva()?.id === s.id) mostraAvviso(''); }, { once: true });
      // Rete di sicurezza: la domanda al server qui sopra copre il caso normale, ma una pagina può
      // fallire per altro (rete, redirect infinito). ⛔ Non è una guardia sull'X-Frame-Options: lì
      // Chrome manda `load` sulla propria pagina d'errore e questa attesa non scatta mai (07/9).
      /* ⛔⛔ 16/09 — il ripiego scrive il modo DELLA SUA SCHEDA, non quello del browser: prima
         `stato.modo = 'testo'` era globale, quindi una cornice che non si caricava buttava in
         «Testo» anche le schede che stavano benissimo. Ed è l'id catturato QUI a decidere, non
         quale scheda è attiva quando l'attesa scade. */
      const idSuo = s.id;
      setTimeout(() => {
        if (!frame.isConnected || frame.dataset.caricata === 'si') return;
        if (stato.modiChiesti[idSuo] === 'pagina') return; // chi ha chiesto la pagina non si vede rispondere col testo
        impostaModo(idSuo, 'testo');
        if (attiva()?.id === idSuo) mostraAvviso(t('Questo sito non si lascia mostrare dentro TALOS. Qui sotto c’è il testo che ha letto l’agente.'));
        renderizza();
      }, 4000);
    }
    el.live.append(frame);
  }

  /*
   * ⛔ 07/9, O-42 — owner (screenshot su github.com): al posto della pagina il rettangolo grigio
   *   dell'immagine rotta, mentre la lettura sopra diceva «HTTP 200 · 4116 caratteri»: il testo c'era,
   *   era la CORNICE a non mostrarlo. Il ripiego dopo quattro secondi non scattava, e misurando si
   *   vede perché: quando X-Frame-Options rifiuta, Chrome carica dentro la cornice la sua pagina di
   *   errore e spara un `load` regolare — la guardia lo legge come «caricata» e resta lì.
   * ⇒ Non si aspetta il fallimento: si prevede. Il server sa già leggere le intestazioni
   *   (`GET /api/v1/browser/incorniciabile`, in uso dal 06/9 per le pagine che apri tu): la stessa
   *   domanda si fa anche per una lettura dell'agente, PRIMA di incorniciare. Chi vieta la cornice va
   *   dritto al testo con una riga che dice perché.
   * @returns {string} l'avviso da mostrare, vuoto se non c'è niente da dire
   */
  function corniceDellaLettura(s) {
    if (!s || s.tipo === 'viva' || !s.url || !/^https?:/i.test(s.url)) return '';
    if (s.incorniciabile === undefined) { azioni.chiediCornice?.(s); return ''; }
    if (s.incorniciabile === null) return ''; // la domanda è in volo: lo stato «apertura in corso» lo dice il pannello
    if (s.incorniciabile !== false) return '';
    /* ⛔ Il ripiego al testo vale per l'APERTURA, non contro chi ha appena chiesto la pagina: senza
       questa condizione il clic su «Pagina» veniva annullato dal render successivo, per sempre.
       ⛔⛔ 16/09 — e vale SOLO PER QUESTA SCHEDA: `stato.modo`/`stato.modoChiesto` erano due
       variabili globali, quindi il ripiego di una scheda cambiava il modo di tutte le altre (e la
       richiesta «Pagina» fatta su una zittiva il ripiego dappertutto). Adesso si legge e si scrive
       per id, e una scheda che fallisce lascia le altre dov'erano. */
    if (modoDi(s.id) === 'pagina' && stato.modiChiesti[s.id] !== 'pagina') impostaModo(s.id, 'testo');
    return `${t(s.motivoCornice || 'Questo sito non si lascia mostrare dentro TALOS')}. ${t('Qui sotto c’è il testo che ha letto l’agente.')}`;
  }

  /*
   * ⛔⛔⛔ 16/09/2026, P0 corsia B punto 4(b) — LA MACCHINA A STATI SI VEDE, PER OGNI TIPO DI SCHEDA.
   *
   * Che cosa c'era prima, misurato sul file: `#browserCaricamento` si accendeva SOLO per una pagina
   * viva in stato «caricamento» (riga 552 della versione dell'11/09); una lettura dell'agente che
   * stava chiedendo al server se il sito si lascia incorniciare non mostrava NIENTE — schermo vuoto
   * finché la risposta non arrivava; e l'errore era una riga sola in cima, `#browserAvviso`, quindi
   * il guasto di una scheda si leggeva anche stando su un'altra.
   *
   * ⇒ Un pannello unico che racconta lo stato DELLA SCHEDA ATTIVA, con le azioni che servono in
   *   quello stato e niente parole tecniche. Il nodo lo crea il componente (nel mockup non esiste:
   *   il mockup disegna una schermata a regime, non i suoi guasti) e resta `hidden` quando la
   *   scheda è a posto — chi confronta con il disegno non vede una differenza in più.
   */
  let pannelloStato = null;
  function nodoStato() {
    if (pannelloStato?.isConnected) return pannelloStato;
    if (!el.live?.parentNode) return null;
    const doc = el.live.ownerDocument;
    const box = doc.createElement('div');
    box.id = 'browserStatoScheda';
    box.className = 'talos-browser__request talos-browser__stato';
    box.setAttribute('role', 'status');
    box.hidden = true;
    const titolo = doc.createElement('h3'); titolo.className = 'talos-browser__heading'; titolo.dataset.statoTitolo = '';
    const motivo = doc.createElement('p'); motivo.className = 'talos-muted'; motivo.dataset.statoMotivo = '';
    const rimedio = doc.createElement('p'); rimedio.className = 'talos-muted talos-browser__meta'; rimedio.dataset.statoRimedio = '';
    const cluster = doc.createElement('div'); cluster.className = 'talos-cluster';
    /* ⛔ Qui NON si scrivono le PAROLE dei due pulsanti: questa fabbrica gira una volta sola (la
       riga della cache, qui sopra) e un'etichetta scritta qui resterebbe per sempre nella lingua
       del primo disegno. Le scrive `renderizzaStato()`, a ogni disegno — vedi il blocco lì. */
    const riprova = doc.createElement('button'); riprova.type = 'button'; riprova.className = 'talos-button talos-button--primary talos-button--sm'; riprova.dataset.statoRiprova = '';
    const annulla = doc.createElement('button'); annulla.type = 'button'; annulla.className = 'talos-button talos-button--ghost talos-button--sm'; annulla.dataset.statoAnnulla = '';
    riprova.addEventListener('click', () => { const x = attiva(); if (x) azioni.riprova?.(x); });
    annulla.addEventListener('click', () => { const x = attiva(); if (x) azioni.annullaApertura?.(x); });
    cluster.append(riprova, annulla);
    box.append(titolo, motivo, rimedio, cluster);
    el.live.parentNode.insertBefore(box, el.live);
    pannelloStato = box;
    return box;
  }

  /** @param {object|null} s */
  function renderizzaStato(s) {
    const box = nodoStato();
    if (!box) return 'loaded';
    /*
     * ⛔⛔⛔ 16/09/2026, SECONDO GIRO DI RIPARAZIONE — LE ETICHETTE SI RISCRIVONO A OGNI DISEGNO.
     *
     * Bocciatura del controllore, riprodotta: app in italiano, scheda in `unreachable`, poi la
     * lingua cambiata A CALDO dalle Impostazioni (`#setting-uiLanguageSelect` → `en` + `change`).
     * Titolo, motivo e rimedio passavano all'inglese; i due pulsanti restavano «Riprova» e
     * «Annulla». Causa, misurata sul file: le loro parole le scriveva `nodoStato()` — una fabbrica
     * a CACHE, che gira una volta sola — mentre questa funzione riscriveva tutto il resto. Il nodo
     * sopravvive al cambio di lingua, quindi quelle due parole non venivano mai più toccate.
     *
     * ⇒ Stessa forma della barra (`renderizza()`, più sotto): chi disegna RILEGGE `t()` ogni volta,
     *   e il cambio di lingua è solo un altro disegno — la catena è viva, `app.js` aggancia
     *   `EVENTO_LINGUA` e richiama `renderizzaBrowser()`.
     * Ricerca prima di scrivere (letta il 16/09/2026): è il pattern canonico di i18next per il DOM
     *   senza framework — `i18next.on('languageChanged', updateContent)` dove `updateContent`
     *   rilegge `t()` per OGNI elemento invece di ricostruire i nodi (dev.to, «Using
     *   internationalization with i18n», walternascimentobarroso); il difetto opposto è noto in
     *   react-i18next (issue #1171): a `languageChanged` i nodi già resi non si ridisegnano da soli
     *   e restano nella lingua vecchia. ⛔ Le parole vanno scritte PRIMA di ogni uscita anticipata
     *   di questa funzione, altrimenti uno stato che ritorna presto le lascia indietro.
     */
    const bRiprova = box.querySelector('[data-stato-riprova]');
    const bAnnulla = box.querySelector('[data-stato-annulla]');
    if (bRiprova) bRiprova.textContent = t(TESTI.riprova);
    if (bAnnulla) bAnnulla.textContent = t(TESTI.annulla);
    const situazione = statoDellaScheda(s);
    const riposata = Boolean(s && stato.riposate.has(s.id));
    /*
     * ⭐ 16/09 — i due stati «sto lavorando» (loading, retrying) li racconta il nodo del mockup,
     *   `#browserCaricamento`, che esiste apposta e finora si accendeva solo per le pagine vive.
     *   Questo pannello prende gli altri: ciò che si è fermato, e ciò che era a riposo.
     */
    const lavora = situazione === 'loading' || situazione === 'retrying';
    if (el.caricamento) {
      el.caricamento.hidden = !lavora;
      /* ⛔ 16/09 — lo stato sta anche in un ATTRIBUTO, non solo nelle parole: le parole passano dal
         dizionario delle lingue e una prova che le legge dice rosso su un profilo inglese (misurato
         il 16/09: «Apertura in corso…» esce «Opening…»). Chi guarda legge la frase, chi misura legge
         l'attributo — e nessuno dei due dipende dall'altro. */
      el.caricamento.dataset.stato = lavora ? situazione : '';
      const suoTitolo = el.caricamento.querySelector('.talos-browser__heading');
      if (suoTitolo && lavora) suoTitolo.textContent = situazione === 'retrying' ? TESTI.statoRiprovo(Number(s?.tentativi || 0), Number(s?.tentativiMassimi || 0)) : t(TESTI.statoApro);
      const suoSotto = el.caricamento.querySelector('p.talos-muted');
      if (suoSotto && lavora) suoSotto.textContent = t(situazione === 'retrying' ? TESTI.statoRiprovoSotto : TESTI.statoAproSotto);
      /*
       * ⛔⛔ 16/09, GIRO DI RIPARAZIONE, trovato GUARDANDO la foto del tema chiaro in inglese e non
       *   da un conteggio verde: dentro un pannello tutto inglese («No answer: trying again (2 of
       *   3)…» / «Each attempt waits a little longer than the one before.») il pulsante diceva
       *   «Annulla navigazione». È la stessa malattia del motivo del server, in un posto diverso:
       *   il testo è scritto a mano nel modello HTML (`public/index.html`), che nessuno traduce.
       * ⇒ L'etichetta la scrive il componente, come tutto il resto del pannello. Il modello resta
       *   com'è (non è un file di questa corsia) e continua a valere come testo di partenza.
       */
      if (el.annulla && lavora) el.annulla.textContent = t(TESTI.annullaNavigazione);
    }
    /*
     * ⛔ 16/09, punto 4(f) — LA PAGINA PILOTATA È UNA ALLA VOLTA (assunzione approvata dall'owner
     *   per questa fase: il server tiene UNA scheda Chromium, `IDENTITA_BROWSER`). Prima, aprirne
     *   un'altra smontava quella di prima IN SILENZIO: si tornava sulla scheda e non c'era niente,
     *   senza una riga che dicesse perché. Adesso la scheda resta, se lo ricorda, e lo DICE — con
     *   il pulsante per riaprirla dov'era.
     */
    const vivaARiposo = Boolean(s?.vivaARiposo) && situazione === 'loaded';
    const parla = (!lavora && situazione !== 'loaded') || ((riposata || vivaARiposo) && !lavora);
    box.hidden = !parla;
    box.dataset.stato = (riposata || vivaARiposo) && situazione === 'loaded' ? 'riposo' : situazione;
    if (!parla) return situazione;
    if (vivaARiposo) {
      const h = box.querySelector('[data-stato-titolo]'); if (h) h.textContent = t(TESTI.statoVivaInPausa);
      const m = box.querySelector('[data-stato-motivo]'); if (m) { m.textContent = ''; m.hidden = true; }
      const r = box.querySelector('[data-stato-rimedio]'); if (r) { r.textContent = t(TESTI.unaVivaAllaVolta); r.hidden = false; }
      const ri = box.querySelector('[data-stato-riprova]'); if (ri) ri.hidden = false;
      const an = box.querySelector('[data-stato-annulla]'); if (an) an.hidden = true;
      return situazione;
    }
    const titolo = box.querySelector('[data-stato-titolo]');
    const motivo = box.querySelector('[data-stato-motivo]');
    const rimedio = box.querySelector('[data-stato-rimedio]');
    const riprova = box.querySelector('[data-stato-riprova]');
    const annulla = box.querySelector('[data-stato-annulla]');
    const tentativi = Number(s?.tentativi || 0);
    const massimi = Number(s?.tentativiMassimi || 0);
    /*
     * ⛔⛔ 16/09, GIRO DI RIPARAZIONE — la frase del guasto si COMPONE dal genere, non si traduce.
     *   Prima qui c'era `t(s.motivo)`: una frase già scritta dal server, con un numero dentro,
     *   passata a un dizionario a chiavi fisse. Non poteva funzionare per nessun numero e per
     *   nessuna lingua, ed è ciò che si vedeva nelle foto (titolo inglese, motivo italiano).
     * ⛔ `s.motivo` resta come ULTIMA rete quando il genere manca (un server più vecchio del
     *   frontend): in quel caso si mostra così com'è, senza fingere di averlo tradotto.
     */
    const detto = frasePerGenere(s?.genere, s?.dettagli) || (s?.genere ? '' : String(s?.motivo || ''));
    const testi = {
      loading: [t(TESTI.statoApro), '', t(TESTI.statoAproSotto)],
      retrying: [TESTI.statoRiprovo(tentativi, massimi), detto, t(TESTI.statoRiprovoSotto)],
      error: [t(TESTI.statoNonRaggiunta), detto || t('Il sito non consente di essere mostrato dentro TALOS'), rimedioPerGenere(s?.genere)],
      unreachable: [t(TESTI.statoNonRaggiunta), detto, rimedioPerGenere(s?.genere)],
      cancelled: [t(TESTI.statoAnnullata), '', t(TESTI.statoAnnullataSotto)],
      loaded: [t(TESTI.statoRiposo), '', t(TESTI.statoRiposoSotto)], // qui ci si arriva solo se la cornice era stata messa a riposo
    };
    const [t1, t2, t3] = testi[situazione] || testi.loaded;
    if (titolo) titolo.textContent = t1;
    if (motivo) { motivo.textContent = t2 || ''; motivo.hidden = !t2; }
    if (rimedio) { rimedio.textContent = t3 || ''; rimedio.hidden = !t3; }
    // ⛔ Le azioni dipendono dallo stato: «Riprova» non ha senso mentre sto già provando, e
    //   «Annulla» non ha senso su una cosa già ferma. Un pulsante che non fa niente è peggio di uno assente.
    if (riprova) riprova.hidden = !(situazione === 'error' || situazione === 'unreachable' || situazione === 'cancelled');
    if (annulla) annulla.hidden = !(situazione === 'loading' || situazione === 'retrying');
    return situazione;
  }

  function renderizza() {
    const s = attiva();
    /*
     * ⛔ 08/09/2026 — ricordare la scelta e non mostrarla non serve a niente: tornando su una
     *   scheda che aveva chiesto «Pagina», il modo era giusto ma a schermo non c'era ne' la
     *   cornice ne' la tela (misurato: telaVisibile false, testoVisibile false — uno schermo
     *   vuoto). Se la scelta e' «pagina» e quella pagina vuole il browser pilotato, si riapre.
     * ⛔ Una volta sola per scheda: `azioni.apri` fa ri-renderizzare, e senza questo freno sarebbe
     *   un anello che si richiama da solo.
     */
    if (s && s.tipo !== 'viva' && s.id && stato.modiChiesti[s.id] === 'pagina'
        && s.incorniciabile === false && s.url && !stato.riaperte.has(s.id)) {
      stato.riaperte.add(s.id);
      azioni.apri?.(s.url, s.id);
      return;
    }
    const avvisoCornice = corniceDellaLettura(s);
    const letture = stato.schede.filter((x) => x.tipo !== 'viva').length;
    const vive = stato.schede.length - letture;
    if (el.riepilogo) el.riepilogo.textContent = stato.schede.length === 0 ? t(TESTI.riepilogoVuoto) : (vive === 0 ? TESTI.riepilogoLetture(letture) : TESTI.riepilogoMisto(letture, vive));
    renderizzaSchede();
    /* ⛔ 16/09 — la barra parla la lingua di chi guarda. Si riscrive a ogni disegno, che è anche
       ciò che accade al cambio di lingua (`EVENTO_LINGUA` ridisegna le superfici del codice). */
    if (el.rileggi) el.rileggi.textContent = t(TESTI.barraRileggi);
    if (el.annota) el.annota.textContent = t(TESTI.barraAnnota);
    if (el.nota) el.nota.textContent = t(TESTI.barraNota);
    if (el.copia) el.copia.textContent = t(TESTI.barraCopia);
    for (const b of el.modi) b.textContent = t(b.dataset.browserModo === 'pagina' ? TESTI.barraModoPagina : TESTI.barraModoTesto);
    const i = indiceAttiva();
    if (el.indietro) el.indietro.disabled = i <= 0;
    if (el.avanti) el.avanti.disabled = i < 0 || i >= stato.schede.length - 1;
    if (el.url && document.activeElement !== el.url) el.url.value = s?.url || '';
    if (el.fuori) el.fuori.disabled = !s || !/^https?:\/\//i.test(s.url);
    for (const b of [el.rileggi, el.annota, el.nota, el.copia]) if (b) b.disabled = !s;
    if (el.copia) el.copia.disabled = !s || s.tipo === 'viva';
    if (el.rileggi) el.rileggi.title = t(s?.tipo === 'viva' ? 'Ricarica la pagina nella cornice' : 'Prepara nel composer la richiesta di rileggere questa pagina');
    if (el.posizione) {
      // ⛔ 16/09 — la riga di posizione legge lo stato canonico della scheda, non due valori scelti a mano
      const qui = statoDellaScheda(s);
      el.posizione.textContent = !s ? '' : s.tipo === 'viva'
        ? t(qui === 'loading' || qui === 'retrying' ? TESTI.posizioneCaricamento : (qui === 'error' || qui === 'unreachable' || qui === 'cancelled') ? TESTI.posizioneBloccata : TESTI.posizioneViva)
        : TESTI.posizioneLettura(stato.schede.filter((x) => x.tipo !== 'viva').indexOf(s) + 1, letture);
    }
    // stati
    const richiesta = stato.richiesta;
    if (el.bloccato) { el.bloccato.hidden = !richiesta; if (richiesta && el.bloccatoTesto) el.bloccatoTesto.textContent = t('L’agente chiede di leggere {url}. La scelta vale per questa richiesta.', { url: richiesta.url }); }
    // ⛔ 16/09 — `#browserCaricamento` non è più solo delle pagine vive: lo accende `renderizzaStato`
    //   per QUALUNQUE scheda che sta aprendo o riprovando (prima una lettura in attesa non diceva niente).
    if (el.vuoto) el.vuoto.hidden = stato.schede.length > 0;
    // l'articolo resta per le note anche su una pagina viva: si nascondono solo testata e testo acquisito
    if (el.articolo) el.articolo.hidden = !s;
    /* ⛔ 07/9 — la testata non è più un `header` sopra la pagina: è il pezzo piccolo dentro la riga
       dei modi (owner: «più piccolo, così la finestra del browser è più grande»). Si nasconde lo stesso
       su una pagina viva, dove il titolo lo dice già la scheda. */
    const testata = el.titolo?.closest('.talos-browser__testata'); if (testata) testata.hidden = !s || s.tipo === 'viva';
    const lettura = Boolean(s) && s.tipo !== 'viva';
    // i due modi valgono solo per una lettura dell'agente: una pagina viva e' gia' una pagina
    for (const b of el.modi || []) {
      b.hidden = !lettura;
      const suo = b.dataset.browserModo === modoDi(s?.id); // 16/09: il premuto è quello DI QUESTA scheda
      b.setAttribute('aria-pressed', String(suo));
      b.classList.toggle('talos-button--secondary', suo);
      b.classList.toggle('talos-button--ghost', !suo);
      /* ⛔ 08/9 — il rapporto sta SUL pulsante, non nella provenienza, perché lì si troncava per
         primo proprio quando la pagina era grande: «l'agente ha visto 4,2k di 39k» è il fatto che
         decide se fidarsi della sua risposta. Quando ha letto tutto, nessun numero: non c'è niente
         da avvertire, e un'etichetta sempre accesa smette di essere un avviso. */
      // il rapporto riguarda il testo ricevuto: sul pulsante «Pagina» non vuol dire niente
      if (b.dataset.browserModo !== 'testo') continue;
      const conto = b.querySelector('[data-browser-quanto]') || (() => {
        const e = document.createElement('span');
        e.dataset.browserQuanto = '';
        e.className = 'talos-browser__quanto';
        b.append(e);
        return e;
      })();
      const letto = lettura ? quantoHaLetto(s.testo) : { tagliato: false };
      conto.hidden = !letto.tagliato;
      if (letto.tagliato) {
        conto.textContent = `${breve(letto.ricevuti)} ${t('di')} ${breve(letto.totale)}`;
        b.title = t('La pagina è stata tagliata: l’agente ne ha ricevuta solo una parte. Aprila per vedere quale.');
      }
    }
    const modoQui = modoDi(s?.id);
    if (el.testo) el.testo.hidden = !lettura || modoQui === 'pagina';
    if (lettura) {
      if (el.titolo) el.titolo.textContent = titoloDaLettura(s);
      if (el.provenienza) el.provenienza.textContent = formattaProvenienza(s);
      if (el.testo && modoQui !== 'pagina') scriviTestoAcquisito(s.testo || '');
    }
    /*
     * ⛔⛔ 16/09 — l'errore di una scheda NON è più la riga globale in cima. `#browserAvviso` resta
     *   per ciò che riguarda il browser e non una scheda (un indirizzo scritto male, il ripiego al
     *   testo di una lettura che non si lascia incorniciare); il guasto di una scheda vive nel suo
     *   pannello, con il motivo VERO e il rimedio che c'entra con quel motivo.
     */
    /*
     * ⛔⛔ 16/09, trovato GUARDANDO LA FOTO del tema chiaro e non da un conteggio verde: lo stesso
     *   motivo usciva DUE VOLTE — nella riga in cima («Il sito non ha risposto in tempo (6
     *   secondi). Qui sotto c'è il testo…») e nel pannello dello stato, tre righe sotto. È la
     *   stessa malattia del 07/9 («quattro cose a schermo per lo stesso fatto»).
     * ⇒ Il confine è netto: quando la scheda si è FERMATA (guasto, non raggiunta, annullata) parla
     *   solo il suo pannello; la riga in cima resta per il ripiego al testo di una scheda SANA —
     *   cioè quando il sito ha risposto e ha detto di no alla cornice, che non è un guasto.
     */
    const situazione = statoDellaScheda(s);
    mostraAvviso(situazione === 'loaded' ? (avvisoCornice || '') : '');
    renderizzaStato(s);
    renderizzaCornice(s);
    // nota
    const nota = s ? stato.note[s.url] : '';
    if (el.notaSalvata) { el.notaSalvata.hidden = !nota; el.notaSalvata.textContent = nota ? t('Nota: {nota}', { nota }) : ''; }
    if (!s || (el.editorNota && !el.editorNota.hidden && el.editorNota.dataset.browserId !== s.id)) { if (el.editorNota) el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); }
    if (el.editorNota && s) el.editorNota.dataset.browserId = s.id;
    /* ⛔ 08/9, owner: «non ci deve essere nulla di sotto il riquadro del browser». La riga dei
       limiti non c'e' piu' nel markup; il codice regge un DOM che non la contiene. */
    if (el.limiti) el.limiti.textContent = t(vive > 0 ? TESTI.limitiVive : TESTI.limitiLetture);
    // il pannello dei commenti: solo su una pagina viva proxata
    /* ⛔ 07/9 — la stessa condizione stava scritta in DUE posti con due valori diversi: qui «solo
       proxata» e sul pulsante «proxata o viva». Risultato: il pulsante accendeva il modo e il
       pannello lo dichiarava spento, senza che nessuno dei due mentisse per conto proprio.
       Una condizione, un posto: chi la cambia non può dimenticarne metà. */
    const annotabile = paginaAnnotabile(s);
    if (el.annotazioni) {
      const lista = annotabile ? (stato.annotazioni[s.id] || []) : [];
      if (!annotabile) { el.annotazioni.hidden = true; } else {
        renderizzaAnnotazioni(el.annotazioni, {
          annotazioni: lista, attivo: stato.annotaAttivo,
          onAttiva: (on) => azioni.annota?.(s, on), onNota: (i, testo) => azioni.notaAnnotazione?.(s, i, testo), onTogli: (i) => { dialogaConOverlay({ tipo: 'togli', numero: i + 1 }); azioni.togliAnnotazione?.(s, i); },
          onSvuota: () => { dialogaConOverlay({ tipo: 'svuota' }); azioni.svuotaAnnotazioni?.(s); }, onInvia: () => azioni.inviaAnnotazioni?.(s),
        });
        /* ⛔ 08/9, owner: «non ci deve essere nulla di sotto il riquadro, non voglio nulla che
           disturbi». Il pannello dei commenti stava sempre a schermo, anche vuoto, e si prendeva
           una fetta di pagina per dire «Nessun commento». Ora compare solo quando c'e' qualcosa da
           mostrare o si sta annotando: quando serve, non prima. */
        el.annotazioni.hidden = lista.length === 0 && !stato.annotaAttivo;
      }
    }
    if (el.annota) { el.annota.setAttribute('aria-pressed', String(annotabile && stato.annotaAttivo)); el.annota.title = annotabile ? t('Segna gli elementi della pagina da cambiare: i commenti finiscono nel composer') : t('Prepara una bozza nella chat senza inviarla'); }
    dialogaConOverlay({ tipo: 'annota', attivo: annotabile && stato.annotaAttivo });
  }

  return {
    /** @param {{schede?:Array, attiva?:string|null, note?:object, richiesta?:object|null}} nuovo */
    aggiorna(nuovo) {
      /*
       * ⛔⛔⛔ 11/09/2026, owner: «quando faccio una ricerca web nel browser integrato, navigando
       *   nelle schede mi appare la visuale codice sorgente. Voglio che di default ci sia sempre
       *   la visuale a pagina, quella renderizzata, sempre, anche se cambio scheda mentre sono in
       *   modalità sorgente. Devo comunque poter passare al sorgente, ma la navigazione deve
       *   essere sempre in modalità pagina».
       *
       * ⛔ Il difetto era proprio queste righe, nella forma che avevano prima: si riprendeva la
       *   scelta della scheda di DESTINAZIONE, ma quando quella scheda non ne aveva una (`suo`
       *   null) non si toccava `stato.modo` — che restava quello della scheda di PARTENZA. Cioè:
       *   sorgente sulla scheda A, passo alla scheda B mai toccata, e B nasce in sorgente. Il modo
       *   non era «di quella scheda»: era una variabile sola che si trascinava dietro l'ultimo
       *   valore, e la mappa `modiScelti` copriva solo metà dei casi.
       *
       * ⇒ Il modo si RIAZZERA a «pagina» a ogni cambio scheda, sempre — anche se su questa scheda
       *   avevo scelto il sorgente poco fa. Il sorgente resta una scelta viva finché resti lì, mai
       *   uno stato che segue la navigazione: è la stessa cosa che fa un browser vero, dove
       *   `view-source:` è un'altra pagina e non una modalità appiccicata alla sessione (MDN /
       *   textslashplain «View-Source», letto l'11/09/2026 — la vista sorgente è un documento a
       *   parte, non un interruttore globale).
       *
       * ⛔ `modoChiesto` torna a `null`, NON a 'pagina': non è la stessa cosa. Una richiesta
       *   esplicita di «Pagina» disattiva il ripiego automatico al testo (vedi
       *   `corniceDellaLettura`), e su un sito che vieta la cornice questo lascerebbe una cornice
       *   vuota al posto del testo letto dall'agente — cioè peggio del difetto che si sta curando.
       *   Azzerandolo, il ripiego resta libero di scattare dove serve davvero.
       * ⭐ `modiScelti` resta, ma solo per quello che porta ancora informazione: una scheda che
       *   aveva chiesto «Pagina» su un sito non incorniciabile va riaperta col browser pilotato
       *   (la cura dell'08/09, poco sopra in `renderizza`). Una scelta «testo» invece non
       *   sopravvive più al cambio scheda, ed è esattamente ciò che l'owner ha chiesto.
       */
      if (nuovo && 'attiva' in nuovo && nuovo.attiva !== stato.attiva) {
        stato.riaperte.delete(nuovo.attiva); // tornandoci si puo' riaprire di nuovo
        /*
         * ⛔⛔⛔ 16/09/2026 — QUI NON SI RIAZZERA PIÙ NIENTE, ed è un ordine dell'owner che
         *   capovolge quello dell'11/09 riportato qui sopra: «ogni tab deve mantenere
         *   indipendentemente il proprio stato… tornando su A deve restare Pagina».
         * ⇒ Il riazzeramento non serve più perché la causa che lo rendeva necessario non c'è più:
         *   il modo non è una variabile sola che si trascina, è `modi[id]`, e una scheda mai
         *   toccata nasce col predefinito («pagina»). Il trascinamento che l'owner vedeva l'11/09
         *   è impossibile per COSTRUZIONE, non per un azzeramento che cancellava anche la memoria.
         */
      }
      stato = { ...stato, ...nuovo };
      /*
       * ⛔ 16/09 — LE MAPPE NON CRESCONO PER SEMPRE. Ogni cosa tenuta per id (il modo, la richiesta
       *   esplicita, i freni, le cornici vive) vale finché quella scheda esiste: quando la scheda se
       *   ne va, se ne vanno anche le sue righe. Prima l'unica memoria per id era `modiScelti`, che
       *   non veniva mai ripulita — e `browserChiuse`, dall'altra parte in app.js, cresceva a vita.
       */
      const vivi = new Set(stato.schede.map((x) => x.id));
      for (const mappa of [stato.modi, stato.modiChiesti]) for (const k of Object.keys(mappa)) if (!vivi.has(k)) delete mappa[k];
      for (const insieme of [stato.riaperte, stato.riposate]) for (const k of [...insieme]) if (!vivi.has(k)) insieme.delete(k);
      for (const c of el.live?.querySelectorAll('iframe') || []) if (!vivi.has(c.dataset.browserId)) c.remove();
      if (stato.annotaAttivo && stato.annotazioni && Object.values(stato.annotazioni).flat().length >= MASSIMO_ANNOTAZIONI) stato.annotaAttivo = false;
      renderizza();
    },
    fuocoSullaScheda() { el.schede?.querySelector('[aria-selected="true"]')?.focus(); },
    /*
     * ⛔ 11/09/2026 — L'APERTURA VIVE FUORI DA QUI, E PUÒ FALLIRE FUORI DA QUI.
     *
     * Chi apre un indirizzo è `azioni.apri`, che sta in `legacy/app.js` e fa una catena
     * asincrona (incorniciabile → cornice / proxy / browser pilotato). Se quella catena si rompe
     * PRIMA che una scheda esista, qui dentro non c'è niente da disegnare e la riga d'avviso —
     * l'unico posto dove questa schermata parla — resterebbe vuota: campo che accetta, schermo
     * che tace. Con questo, chi apre può dire perché non è nata nessuna scheda.
     * ⛔ Non è un `toast`: l'avviso appartiene a QUESTA schermata e resta finché serve.
     */
    avvisa(testo) { mostraAvviso(testo); },
    get stato() { return stato; },
  };
}
