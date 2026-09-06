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
 * - Claude conta un'immagine circa `larghezza × altezza / 750` token, con un tetto intorno a 1.568;
 * - GPT-4o usa i riquadri: 85 token di base più 170 per ogni riquadro da 512 px;
 * - Gemini usa riquadri da 768 px a 258 token l'uno;
 * - per il testo la regola d'uso comune è ~4 caratteri per token sulle lingue latine;
 * - e il consiglio che vale per tutti: i byte di un'immagine bruciano la finestra in fretta, quindi
 *   dove si può si passa il PERCORSO invece del contenuto (assistant-ui, Macha AI, marzo 2026).
 * Fonti: mochify.app «LLM image token costs», tokencost.app «Vision API cost per image»,
 * jamesmcroft/openai-image-token-calculator, assistant-ui «File attachments».
 */

/** Le quattro vie del «+», nell'ordine in cui si usano (B6). */
export const VIE_ALLEGATO = Object.freeze([
  { id: 'workspace', etichetta: 'File del progetto', aiuto: 'Scegli fra i file della cartella di questa sessione', icona: 'i-folder' },
  { id: 'disco', etichetta: 'File dal disco', aiuto: 'Un file qualunque del computer', icona: 'i-file' },
  { id: 'immagine', etichetta: 'Immagine', aiuto: 'Una foto o uno schema da guardare', icona: 'i-image' },
  { id: 'schermata', etichetta: 'Ultima schermata', aiuto: 'L’ultimo screenshot che hai scattato', icona: 'i-camera' },
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
  return `Fino a ${TETTI_ALLEGATI.quanti} allegati per messaggio · oltre ${Math.round(TETTI_ALLEGATI.caratteriPerAllegato / 1000)}k caratteri un file da solo pesa quanto mezza conversazione`;
}

/** Vero quando un allegato supera il tetto per file: non si rifiuta, si avvisa. */
export function allegatoPesante(allegato) {
  if (!allegato || allegato.tipo === 'immagine') return false;
  return Number(allegato.caratteri) > TETTI_ALLEGATI.caratteriPerAllegato;
}

const TETTO_IMMAGINE = 1568; // Claude: oltre questo il conto non sale più

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
  return `~${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace('.', ',')}k token`;
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
