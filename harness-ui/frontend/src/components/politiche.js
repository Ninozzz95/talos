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
 * Ricerca 07/09/2026 — Claude Code, «Choose a permission mode» (code.claude.com/docs/en/permission-modes)
 * e le note della v2.1.200 (3 luglio 2026): il concorrente ha RINOMINATO il modo «default» in
 * «Manual» su CLI, VS Code, JetBrains e desktop **tenendo il valore di configurazione invariato**
 * per hook e SDK, con il vecchio nome accettato come alias. È esattamente questa separazione:
 * l'etichetta è dell'interfaccia, il valore è del contratto.
 */

/** @typedef {{valore:string, nome:string, descrizione:string, nota:string, rischio:'basso'|'medio'|'alto'|'massimo'}} Politica */

/** Le quattro, nell'ordine in cui si presentano: dal più prudente al più libero. */
export const POLITICHE = Object.freeze([
  Object.freeze({
    valore: 'Read only',
    nome: 'Solo lettura',
    descrizione: 'Legge il progetto e lancia comandi che non cambiano niente. Ogni scrittura viene rifiutata.',
    nota: 'Minimo rischio',
    rischio: 'basso',
  }),
  Object.freeze({
    valore: 'Workspace write',
    nome: 'Scrive nel progetto',
    descrizione: 'Scrive solo dentro la cartella della sessione. Comandi e test passano dal cancello.',
    nota: 'Consigliato',
    rischio: 'medio',
  }),
  Object.freeze({
    valore: 'On request',
    nome: 'Chiede prima',
    descrizione: 'Ti chiede conferma prima di ogni azione che lascia traccia: scritture, comandi, rete.',
    nota: 'Controllato',
    rischio: 'medio',
  }),
  Object.freeze({
    valore: 'Full access',
    nome: 'Accesso pieno',
    descrizione: 'File e rete senza i cancelli ordinari. Solo se sai già cosa sta per fare.',
    nota: 'Alto rischio',
    rischio: 'massimo',
  }),
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

/** La nota di rischio a destra («Consigliato», «Alto rischio»…). */
export function notaPolitica(valore) {
  return politica(valore)?.nota || '';
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
