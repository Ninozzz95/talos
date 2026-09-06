/*
 * La lingua dei menu e delle superfici (B8 + P-i18n, 06/09) — la meccanica del mockup (H21): la
 * PREFERENZA («Segui il sistema», Italiano, English) e la LINGUA RISOLTA sono due cose; i dati
 * restano neutri.
 *
 * Due strade, una sola lingua:
 *   · i menu del template, marcati `data-t` (testo) e `data-ph` (placeholder), con chiavi astratte;
 *   · tutto ciò che il codice scrive a schermo, con `t('frase italiana')`: la chiave È la frase
 *     italiana (stile gettext/Lingui, lingui.dev «Explicit vs generated IDs», letto il
 *     06/09/2026); senza traduzione resta l'italiano, mai un vuoto. `tn(uno, molti, n)` sceglie la
 *     forma col plurale della lingua risolta (`Intl.PluralRules`, locize «i18n pluralization 2026»).
 * Il dizionario inglese sta in `src/i18n/en.js`, per categorie come Hermes Desktop (`i18n/en.ts`).
 *
 * Ricerca 06/09/2026: la scelta esplicita della persona vince sempre sul rilevamento automatico;
 * senza scelta si negozia da `navigator.languages`; `lang` sull'elemento radice dichiara la lingua
 * risolta (phrase.com, MDN Navigator.language, W3C i18n). Hermes ha lo stesso «Segui il sistema»
 * ma non lo ricorda al riavvio (issue #26665): qui la preferenza vive nello store dell'aspetto.
 */
import EN from '../i18n/en.js';

export const LINGUE = Object.freeze(['sistema', 'it', 'en']);
export const LINGUA_PREDEFINITA = 'it';
export const EVENTO_LINGUA = 'talos:lingua';

const DIZIONARI = Object.freeze({ en: EN });

/** I menu del template (chiavi astratte): l'italiano è la lingua di partenza, l'inglese sta nel dizionario. */
export const DIZIONARIO = Object.freeze({
  it: Object.freeze({
    nuova: 'Nuova', luoghi: 'Luoghi', altro: 'Altro', fissate: 'Fissate', sessioni: 'Sessioni', cerca: 'Cerca chat…',
    capability: 'Capability', board: 'Board', libreria: 'Libreria', memoria: 'Memoria', attivita: 'Attività',
    chat: 'Chat', terminale: 'Terminale', review: 'Review', browser: 'Browser', comandi: 'Comandi',
  }),
  en: EN.menu,
});

export const NOMI_LINGUA = Object.freeze({ it: 'italiano', en: 'English' });

/** La lingua risolta: la preferenza esplicita, altrimenti la prima lingua del browser che conosciamo, altrimenti l'inglese. */
export function risolviLingua(preferenza, lingueBrowser = []) {
  if (preferenza && preferenza !== 'sistema' && DIZIONARIO[preferenza]) return preferenza;
  const elenco = Array.isArray(lingueBrowser) ? lingueBrowser : [lingueBrowser];
  for (const voce of elenco) {
    const codice = String(voce || '').slice(0, 2).toLowerCase();
    if (DIZIONARIO[codice]) return codice;
  }
  return 'en';
}

/** «Segui il sistema (italiano)» — la preferenza e la lingua che ne risulta, insieme. */
export function etichettaLinguaRisolta(preferenza, risolta) {
  const nome = NOMI_LINGUA[risolta] || risolta;
  return preferenza === 'sistema' || !preferenza ? t('Segui il sistema ({lingua})', { lingua: t(nome) }) : nome;
}

/* ---------- t() e tn(): la lingua corrente ---------- */

let linguaCorrente = LINGUA_PREDEFINITA;
let indice = new Map();
let regolePlurale = new Intl.PluralRules(LINGUA_PREDEFINITA);

function costruisciIndice(dizionario) {
  const mappa = new Map();
  for (const [categoria, voci] of Object.entries(dizionario || {})) {
    if (categoria === 'menu') continue; // chiavi astratte, non frasi
    for (const [chiave, valore] of Object.entries(voci)) mappa.set(chiave, valore);
  }
  return mappa;
}

/** Imposta la lingua corrente di `t()`/`tn()`. Torna la lingua davvero impostata. */
export function impostaLingua(lingua) {
  linguaCorrente = DIZIONARI[lingua] || lingua === LINGUA_PREDEFINITA ? lingua : LINGUA_PREDEFINITA;
  indice = linguaCorrente === LINGUA_PREDEFINITA ? new Map() : costruisciIndice(DIZIONARI[linguaCorrente]);
  try { regolePlurale = new Intl.PluralRules(linguaCorrente); } catch { regolePlurale = new Intl.PluralRules(LINGUA_PREDEFINITA); }
  return linguaCorrente;
}

export function linguaCorrenteDiT() { return linguaCorrente; }

export function interpola(frase, parametri) {
  if (!parametri) return frase;
  return String(frase).replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, nome) => (nome in parametri ? String(parametri[nome]) : tutto));
}

/** Traduce una frase italiana nella lingua corrente; senza traduzione resta l'italiano. */
export function t(frase, parametri) {
  const tradotta = linguaCorrente === LINGUA_PREDEFINITA ? frase : (indice.get(frase) ?? frase);
  return interpola(tradotta, parametri);
}

/** La forma singolare o plurale secondo la lingua corrente, con `{n}` già sostituito. */
export function tn(uno, molti, n, parametri) {
  const forma = regolePlurale.select(Number(n)) === 'one' ? uno : molti;
  return t(forma, { n, ...(parametri || {}) });
}

/** Le frasi di `frasi` senza traduzione nella lingua data — per il test di copertura. */
export function traduzioniMancanti(lingua, frasi) {
  const mappa = costruisciIndice(DIZIONARI[lingua]);
  return frasi.filter((frase) => !mappa.has(frase));
}

/* ---------- il template ---------- */

function primoTesto(el) {
  for (const nodo of el.childNodes) if (nodo.nodeType === 3 && nodo.data.trim()) return nodo;
  return null;
}

/**
 * Applica la lingua alla radice: `lang`, i testi `[data-t]` (solo il PRIMO nodo di testo, così un
 * badge di conteggio dentro la scheda «Terminale 2» resta), i placeholder `[data-ph]`, e la lingua
 * di `t()`. Avvisa chi disegna (`talos:lingua` sulla radice) così le superfici si ridisegnano.
 * @returns {number} quanti elementi ha toccato
 */
export function applicaLingua(root, lingua) {
  const d = DIZIONARIO[lingua] || DIZIONARIO[LINGUA_PREDEFINITA];
  const radice = root.documentElement || root;
  radice.setAttribute('lang', lingua);
  const cambiata = impostaLingua(lingua) !== undefined && lingua !== radice.dataset?.linguaApplicata;
  if (radice.dataset) radice.dataset.linguaApplicata = lingua;
  let toccati = 0;
  for (const el of root.querySelectorAll('[data-t]')) {
    const valore = d[el.getAttribute('data-t')];
    if (!valore) continue;
    const testo = primoTesto(el);
    if (testo) { const codaSpazio = /\s$/.test(testo.data) ? ' ' : ''; testo.data = valore + codaSpazio; } else el.textContent = valore;
    toccati += 1;
  }
  for (const el of root.querySelectorAll('[data-ph]')) {
    const valore = d[el.getAttribute('data-ph')];
    if (!valore) continue;
    el.placeholder = valore;
    toccati += 1;
  }
  if (cambiata && typeof radice.dispatchEvent === 'function' && typeof CustomEvent === 'function') radice.dispatchEvent(new CustomEvent(EVENTO_LINGUA, { detail: { lingua } }));
  return toccati;
}
