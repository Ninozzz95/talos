/*
 * La lingua dei menu (B8, 06/09) — la meccanica del mockup (H21): la PREFERENZA («Segui il
 * sistema», Italiano, English) e la LINGUA RISOLTA sono due cose; i dati restano neutri. Si
 * traducono SOLO gli elementi marcati `data-t` (testo) e `data-ph` (placeholder): la navigazione
 * dell'interfaccia. I contenuti (messaggi, file, log) restano come sono, e l'etichetta
 * dell'impostazione lo dice.
 *
 * Ricerca 06/09/2026: la scelta esplicita della persona vince sempre sul rilevamento automatico;
 * senza scelta si negozia da `navigator.languages`; `lang` sull'elemento radice dichiara la lingua
 * risolta (phrase.com «Detecting a user's locale», MDN Navigator.language, W3C i18n «Specifying
 * language in HTML»).
 */

export const LINGUE = Object.freeze(['sistema', 'it', 'en']);
export const LINGUA_PREDEFINITA = 'it';

export const DIZIONARIO = Object.freeze({
  it: Object.freeze({
    nuova: 'Nuova', luoghi: 'Luoghi', altro: 'Altro', fissate: 'Fissate', sessioni: 'Sessioni', cerca: 'Cerca chat…',
    capability: 'Capability', board: 'Board', libreria: 'Libreria', memoria: 'Memoria', attivita: 'Attività',
    chat: 'Chat', terminale: 'Terminale', review: 'Review', browser: 'Browser', comandi: 'Comandi',
  }),
  en: Object.freeze({
    nuova: 'New', luoghi: 'Places', altro: 'More', fissate: 'Pinned', sessioni: 'Sessions', cerca: 'Search chats…',
    capability: 'Capability', board: 'Board', libreria: 'Library', memoria: 'Memory', attivita: 'Tasks',
    chat: 'Chat', terminale: 'Terminal', review: 'Review', browser: 'Browser', comandi: 'Commands',
  }),
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
  return preferenza === 'sistema' || !preferenza ? `Segui il sistema (${nome})` : nome;
}

function primoTesto(el) {
  for (const nodo of el.childNodes) if (nodo.nodeType === 3 && nodo.data.trim()) return nodo;
  return null;
}

/**
 * Applica la lingua alla radice: `lang`, i testi `[data-t]` (solo il PRIMO nodo di testo, così un
 * badge di conteggio dentro la scheda «Terminale 2» resta) e i placeholder `[data-ph]`.
 * @returns {number} quanti elementi ha toccato
 */
export function applicaLingua(root, lingua) {
  const d = DIZIONARIO[lingua] || DIZIONARIO[LINGUA_PREDEFINITA];
  const radice = root.documentElement || root;
  radice.setAttribute('lang', lingua);
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
  return toccati;
}
