/*
 * Gli allegati del composer: cosa si può attaccare a un messaggio, e quanto costa attaccarlo.
 *
 * Decisioni del 04/09: B4 «il + serve SOLO ad allegare» (il Capability hub esce dal composer),
 * B6 «allega tutte e quattro le cose: file del workspace · file dal disco · immagini · ultimo
 * screenshot», B7 «incolla E trascina, entrambi», B9 «ogni allegato dichiara quanto contesto costa,
 * in token stimati — è il nostro +1: nessun concorrente lo fa».
 *
 * ⛔ La stima è una STIMA, e si dice. Il conto vero lo fa il modello quando riceve il messaggio;
 * qui si risponde alla domanda che una persona si fa prima di premere invio: «questo allegato mi
 * mangia il contesto?». Meglio un numero dichiarato approssimato che nessun numero.
 *
 * Ricerca 06/09/2026, prima di scrivere:
 * - un'immagine vale circa `larghezza × altezza / 750` token, con un tetto intorno a 1.568;
 * - GPT-4o usa i riquadri: 85 token di base più 170 per ogni riquadro da 512 px;
 * - Gemini usa riquadri da 768 px a 258 token l'uno;
 * - per il testo la regola d'uso comune è ~4 caratteri per token sulle lingue latine;
 * - e il consiglio che vale per tutti: i byte di un'immagine bruciano la finestra in fretta, quindi
 *   dove si può si passa il PERCORSO invece del contenuto (assistant-ui, Macha AI, marzo 2026).
 * Fonti: mochify.app «LLM image token costs», tokencost.app «Vision API cost per image»,
 * jamesmcroft/openai-image-token-calculator, assistant-ui «File attachments».
 */

/** Le quattro vie del «+», nell'ordine in cui si usano (B6). */
/* 03/10/2026, seconda ondata della lingua: etichetta e aiuto si leggono dal dizionario (`chat.attachments.via.*`), nella lingua
   corrente; `id` e `icona` sono dati di logica. */
import { t, linguaCorrenteDiT } from './lingua.js';
/* Owner 03/10/2026 «ogni parola in inglese e italiano»: anche il numero del costo segue la lingua (1.3k / 1,3k). */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
const via = (id, icona) => Object.freeze(Object.defineProperties({ id, icona }, {
  etichetta: { enumerable: true, get: () => t(`chat.attachments.via.${id}.label`) },
  aiuto: { enumerable: true, get: () => t(`chat.attachments.via.${id}.help`) },
}));
export const VIE_ALLEGATO = Object.freeze([
  via('workspace', 'i-folder'),
  via('disco', 'i-file'),
  via('immagine', 'i-image'),
  via('schermata', 'i-camera'),
]);

/*
 * Decisione B8: «i tetti (quanti file, quanto grandi) scritti nel foglio, non scoperti sbattendoci».
 * Stanno qui perché sono dati, non frasi: il menu li scrive, la riga li fa rispettare, e la prova
 * unitaria li legge da un posto solo.
 */
export const TETTI_ALLEGATI = Object.freeze({
  quanti: 10,
  caratteriPerAllegato: 200_000, // ~50k token: oltre, un file da solo mangia mezza finestra
});

/** La frase che dichiara i tetti, quella che si legge PRIMA di sbatterci. */
export function frasiTetti() {
  return t('chat.attachments.limits', { count: TETTI_ALLEGATI.quanti, k: Math.round(TETTI_ALLEGATI.caratteriPerAllegato / 1000) });
}

/** Vero quando un allegato supera il tetto per file: non si rifiuta, si avvisa. */
export function allegatoPesante(allegato) {
  if (!allegato || allegato.tipo === 'immagine') return false;
  return Number(allegato.caratteri) > TETTI_ALLEGATI.caratteriPerAllegato;
}

const TETTO_IMMAGINE = 1568; // oltre questo il conto non sale più

/** ~4 caratteri per token: la regola d'uso sulle lingue latine. */
export function stimaTokenTesto(caratteri) {
  const n = Number(caratteri);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 4);
}

/**
 * I token di un'immagine, secondo la famiglia del modello scelto.
 * @param {number} larghezza in pixel
 * @param {number} altezza in pixel
 * @param {'claude'|'openai'|'gemini'|string} [famiglia]
 */
export function stimaTokenImmagine(larghezza, altezza, famiglia = 'claude') {
  const w = Number(larghezza); const h = Number(altezza);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  if (famiglia === 'openai') {
    const riquadri = Math.ceil(w / 512) * Math.ceil(h / 512);
    return 85 + 170 * riquadri;
  }
  if (famiglia === 'gemini') {
    const riquadri = Math.ceil(w / 768) * Math.ceil(h / 768);
    return 258 * Math.max(1, riquadri);
  }
  return Math.min(TETTO_IMMAGINE, Math.ceil((w * h) / 750));
}

/** La famiglia si ricava dall'identificatore del modello: una mappa sola, niente indovinelli sparsi. */
export function famigliaModello(id) {
  const s = String(id || '').toLowerCase();
  if (/claude|anthropic/.test(s)) return 'claude';
  if (/gpt|openai|o[1-9]-/.test(s)) return 'openai';
  if (/gemini|google/.test(s)) return 'gemini';
  return 'claude'; // il conto più prudente fra i tre sulle immagini grandi
}

/** «~1,3k token» — con la tilde, perché è una stima e non deve sembrare una misura. */
export function etichettaCosto(token) {
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1000) return `~${n} token`;
  const cifre = n < 10000 ? 1 : 0;
  return `~${new Intl.NumberFormat(localeUI(), { minimumFractionDigits: cifre, maximumFractionDigits: cifre }).format(Number((n / 1000).toFixed(cifre)))}k token`;
}

/**
 * Il costo di un allegato, qualunque sia la sua forma.
 * @param {{tipo:'testo'|'immagine', caratteri?:number, larghezza?:number, altezza?:number}} allegato
 * @param {string} [modello] l'identificatore del modello scelto
 */
export function costoAllegato(allegato, modello) {
  if (!allegato) return { token: 0, etichetta: '' };
  const token = allegato.tipo === 'immagine'
    ? stimaTokenImmagine(allegato.larghezza, allegato.altezza, famigliaModello(modello))
    : stimaTokenTesto(allegato.caratteri);
  return { token, etichetta: etichettaCosto(token) };
}

/** Quanto costano tutti insieme, per la riga sotto il composer. */
export function costoTotale(allegati = [], modello) {
  const token = (Array.isArray(allegati) ? allegati : []).reduce((somma, a) => somma + costoAllegato(a, modello).token, 0);
  return { token, etichetta: etichettaCosto(token) };
}

/** Il nome corto di un file, senza mai perdere l'estensione: è quella che dice cos'è. */
export function nomeBreveAllegato(percorso, massimo = 28) {
  const nome = String(percorso || '').split(/[\\/]/).pop() || '';
  if (nome.length <= massimo) return nome;
  const punto = nome.lastIndexOf('.');
  const estensione = punto > 0 ? nome.slice(punto) : '';
  const testa = nome.slice(0, Math.max(1, massimo - estensione.length - 1));
  return `${testa}…${estensione}`;
}

/*
 * ⛔⛔ 07/9, owner con lo screenshot: «gli allegati di questo messaggio non devono apparire nella
 * bolla ma fuori o nascosti — la bolla è riservata ai messaggi dell'utente». Aveva ragione due
 * volte. Nella sua bolla c'erano quattro parole («mm h ti ricorda qualcosa?») affogate in quattro
 * righe di URL e un «404: Not Found» che lui non aveva scritto: il messaggio vero diventava
 * illeggibile, e spariva la distinzione fra ciò che ha detto una persona e ciò che il sistema ha
 * aggiunto. Rileggendo una conversazione per capire cosa era stato chiesto, non si distingue più.
 *
 * Ricerca 07/09/2026 — shadcn/ui, «Components for Chat Interfaces» (giugno 2026): gli Attachment
 * sono componenti SEPARATI dai Bubble, «file attachments can be shown with the user profile and
 * timestamp OUTSIDE the chat bubble». La bolla rende la superficie del messaggio; gli allegati sono
 * oggetti a fianco, coi loro metadati e le loro azioni.
 *
 * ⛔ Ciò che si manda al MODELLO non cambia: il contenuto continua a viaggiare nel messaggio, che è
 *   quello che serve al giro. Cambia solo cosa si legge a schermo.
 */

/** Il tipo di allegato, detto come lo direbbe una persona. */
export function generePerLoSchermo(allegato) {
  /* C09 (10/10/2026, trovato rigiocando la bolla): queste parole stavano scritte in italiano qui dentro, fuori dal dizionario, e
     restavano italiane anche con l'interfaccia in inglese. */
  if (!allegato) return t('chat.attachments.genre.attachment');
  if (allegato.daBrowser) return t('chat.attachments.genre.page');
  if (allegato.tipo === 'immagine') return t('chat.attachments.genre.image');
  if (allegato.tipo === 'schermata') return t('chat.attachments.genre.screenshot');
  return t('chat.attachments.genre.file');
}

/*
 * Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file». Hermes
 * lascia inerti i chip dei file nei messaggi inviati (`directive-text.tsx:524-536`: si attivano solo sessioni e link): qui si aprono nel
 * lettore, come dall'albero dei file.
 * ⛔ Revisione del blocco (26/10, A-F1/A-F2): un file della chat sta nella cartella di PARTENZA della sessione (`cartellaPerChatFile`,
 *   `session-registry.mjs`), che non è sempre la radice dei permessi (Accesso pieno da un progetto: radice = il disco); e la radice
 *   può cambiare a sessione aperta. ⇒ Il chip ricorda la DESTINAZIONE (assoluta quando si sa la base) e il percorso relativo si calcola
 *   AL CLIC, contro la radice di quel momento.
 */
const normaPercorso = (p) => String(p ?? '').trim().replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '');
const eAssoluto = (p) => /^(?:[A-Za-z]:\/|\/)/u.test(p);
const segmentiSani = (rel) => Boolean(rel) && !rel.startsWith('~') && !/^[A-Za-z]:/u.test(rel)
  && !rel.split('/').some((s) => s === '..' || s === '.' || s === '');

/** Dove sta il file di un allegato: un assoluto (dato, o la base + il relativo), un relativo nudo se la base non si sa, o '' (etichetta). */
export function destinazioneAllegato(allegato, { base = '' } = {}) {
  if (!allegato || allegato.daBrowser) return '';
  const p = normaPercorso(allegato.assoluto || allegato.percorso);
  if (!p || p.startsWith('//')) return '';
  if (eAssoluto(p)) return segmentiSani(p.replace(/^(?:[A-Za-z]:)?\//u, '')) ? p : '';
  if (!segmentiSani(p)) return '';
  const b = normaPercorso(base).replace(/\/+$/u, '');
  return b && eAssoluto(`${b}/`) ? `${b}/${p}` : p;
}

/** Il percorso dentro la radice di ADESSO con cui il lettore apre la destinazione, o '' se ne sta fuori (maiuscole indifferenti solo su Windows). */
export function relativoNellaRadice(destinazione, radice = '') {
  const d = normaPercorso(destinazione);
  if (!d) return '';
  if (!eAssoluto(d)) return segmentiSani(d) ? d : '';
  const r = normaPercorso(radice).replace(/\/+$/u, '');
  if (!r) return '';
  const windows = /^[A-Za-z]:/u.test(d);
  const dentro = windows ? d.toLowerCase().startsWith(`${r.toLowerCase()}/`) : d.startsWith(`${r}/`);
  if (!dentro) return '';
  const rel = d.slice(r.length + 1);
  return segmentiSani(rel) ? rel : '';
}

/** Comodità per le prove: il relativo con cui si aprirebbe adesso (base = radice se non detta). */
export function percorsoApribile(allegato, radice = '', base = '') {
  return relativoNellaRadice(destinazioneAllegato(allegato, { base: base || radice }), radice);
}

/**
 * La riga corta di un allegato per il chip sotto la bolla: genere, nome, e quanto pesa.
 * ⛔ Per una pagina il «nome» è il suo dominio, non l'URL intero: un chip che porta 90 caratteri di
 *    URL rifà, in piccolo, il difetto che stiamo curando.
 * `apribile` = la destinazione del file, se oggi sta dentro la radice (o la radice non si sa ancora): il clic la riporta relativa.
 */
export function chipAllegato(allegato, modello = '', { radice = '', base = '' } = {}) {
  if (!allegato) return null;
  const genere = generePerLoSchermo(allegato);
  let nome;
  if (allegato.daBrowser) {
    try { nome = new URL(allegato.percorso || allegato.nome || '').host || allegato.nome || ''; }
    catch { nome = nomeBreveAllegato(allegato.percorso || allegato.nome, 32); }
  } else {
    nome = nomeBreveAllegato(allegato.percorso || allegato.nome, 32);
  }
  const { etichetta } = costoAllegato(allegato, modello);
  const destinazione = destinazioneAllegato(allegato, { base: base || radice });
  const apribile = destinazione && (!radice || relativoNellaRadice(destinazione, radice)) ? destinazione : '';
  return { genere, nome, costo: etichetta, titolo: allegato.percorso || allegato.nome || '', apribile };
}

/** I chip di un messaggio, nell'ordine in cui sono stati allegati. */
export function chipDegliAllegati(allegati, modello = '', opzioni = {}) {
  return (Array.isArray(allegati) ? allegati : []).map((a) => chipAllegato(a, modello, opzioni)).filter(Boolean);
}
