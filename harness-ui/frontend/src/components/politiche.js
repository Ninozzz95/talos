/*
 * Le quattro politiche di autonomia: UN posto solo dove il nome tecnico diventa nome umano.
 *
 * ⛔ 07/9 — nel prodotto ce n'erano TRE copie che non si somigliavano: il foglio Permessi mostrava
 * i valori grezzi del kernel («Read only», «Workspace write», «On request», «Full access») con le
 * descrizioni in inglese; la modale «Nuova sessione» aveva la sua mappa («Scrive qui»); l'intro del
 * primo avvio una terza («Scrive nel progetto»). Tre nomi per la stessa cosa, e uno era in inglese
 * proprio dove si decide la sicurezza.
 * ⇒ Regola dell'owner (04/9): mai nomi tecnici a schermo, la mappa in UN posto solo, e MAI toccare
 *   il valore che viaggia verso il kernel — quello resta `Read only` e compagni, byte per byte.
 *
 * Ricerca 07/09/2026: lo stato dell'arte separa l'etichetta a schermo dal valore di
 * configurazione — un concorrente ha RINOMINATO il modo «default» in
 * «Manual» su CLI, VS Code, JetBrains e desktop **tenendo il valore di configurazione invariato**
 * per hook e SDK, con il vecchio nome accettato come alias. È esattamente questa separazione:
 * l'etichetta è dell'interfaccia, il valore è del contratto.
 */

/** @typedef {{valore:string, nome:string, descrizione:string, nota:string, consigliata:boolean, rischio:'basso'|'medio'|'alto'|'massimo'}} Politica */

/** Le quattro, nell'ordine in cui si presentano: dal più prudente al più libero. */
/*
 * 03/10/2026, seconda ondata della lingua: nome, descrizione e nota stanno nel dizionario (inglese prima) e si leggono quando si
 *   mostrano, nella lingua corrente. I nomi sono gli stessi del piede della chat (`chat.foot.permission.*`). `valore` e `rischio`
 *   sono dati di logica e restano qui. Gli oggetti restano congelati: un getter senza setter rifiuta l'assegnazione.
 */
import { t } from './lingua.js';

/*
 * ⛔ Decisione owner 162 (04/11/2026, bozzetto `variante-scheda-permessi.html`, A): la stessa scelta aveva DUE serie di parole — la
 *   Nuova sessione diceva «Minimo rischio / Consigliato / Controllato / Alto rischio» (`varie.policy.*.note`), la pagina Permessi
 *   «rischio basso / rischio medio / rischio molto alto» (`modello.permissions.*`), e «Chiede prima» era «Controllato» di qua e
 *   «rischio medio» di là. Ora una serie sola, quella dei Permessi, ovunque; «Consigliato» è una pillola a parte, non un livello.
 *   Il tono è quello dei badge della pagina Permessi (success / warning / danger).
 */
const PAROLA_DEL_RISCHIO = Object.freeze({
  basso: { chiave: 'modello.permissions.lowRisk', tono: 'success' },
  medio: { chiave: 'modello.permissions.mediumRisk', tono: 'warning' },
  massimo: { chiave: 'modello.permissions.veryHighRisk', tono: 'danger' },
});
const politicaDa = (valore, chiave, rischio, { consigliata = false } = {}) => Object.freeze(Object.defineProperties({ valore, rischio, consigliata, tono: PAROLA_DEL_RISCHIO[rischio].tono }, {
  nome: { enumerable: true, get: () => t(`chat.foot.permission.${chiave}`) },
  descrizione: { enumerable: true, get: () => t(`varie.policy.${chiave}.description`) },
  nota: { enumerable: true, get: () => t(PAROLA_DEL_RISCHIO[rischio].chiave) },
}));
export const POLITICHE = Object.freeze([
  politicaDa('Read only', 'readOnly', 'basso'),
  politicaDa('Workspace write', 'workspaceWrite', 'medio', { consigliata: true }),
  politicaDa('On request', 'onRequest', 'medio'),
  politicaDa('Full access', 'fullAccess', 'massimo'),
]);

const PER_VALORE = new Map(POLITICHE.map((p) => [p.valore, p]));

/** La politica intera, o `null` se il valore non è dei nostri (non si inventa un nome). */
export function politica(valore) {
  return PER_VALORE.get(String(valore || '').trim()) || null;
}

/**
 * Il nome da mettere a schermo. ⛔ Se il valore non è conosciuto torna il valore stesso: meglio un
 * nome tecnico visibile che una bugia — e si vede subito che manca una riga qui.
 */
export function nomeUmanoPolitica(valore) {
  return politica(valore)?.nome || String(valore || '');
}

/** La descrizione da mettere sotto il nome. Vuota se il valore non è conosciuto. */
export function descrizionePolitica(valore) {
  return politica(valore)?.descrizione || '';
}

/** La parola del rischio («rischio basso», «rischio medio», «rischio molto alto»): la stessa della pagina Permessi (decisione 162). */
export function notaPolitica(valore) {
  return politica(valore)?.nota || '';
}

/** Le pillole del livello, nell'ordine in cui si mostrano: il rischio, poi «Consigliato» se lo è. Vuote per un valore sconosciuto. */
export function pillolePolitica(valore) {
  const p = politica(valore);
  if (!p) return [];
  return [{ testo: p.nota, tono: p.tono }, ...(p.consigliata ? [{ testo: t('modello.permissions.recommended'), tono: 'accent' }] : [])];
}

const testoSicuro = (s) => String(s).replace(/[&<>"]/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Le stesse pillole come badge piccoli del sistema di disegno, per i disegni a modello di `legacy/app.js`. */
export function pillolePoliticaHtml(valore) {
  return pillolePolitica(valore).map(({ testo, tono }) => `<span class="talos-badge talos-badge--${tono} talos-badge--sm">${testoSicuro(testo)}</span>`).join(' ');
}

/** I quattro valori nell'ordine di presentazione — per chi deve ciclare senza conoscere la forma. */
export function valoriPolitiche() {
  return POLITICHE.map((p) => p.valore);
}

/**
 * Vero quando la politica richiede una conferma esplicita prima di essere scelta.
 * Oggi solo l'accesso pieno: è l'unica che toglie i cancelli fuori dalla cartella.
 */
export function vuoleConferma(valore) {
  return politica(valore)?.rischio === 'massimo';
}
