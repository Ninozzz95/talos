import { after } from 'node:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProvaAttesa } from './rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔ DESK-TEMP-1, 23/09/2026 — una cartella di prova nasce GIÀ con la sua rimozione.
 *
 * Il difetto misurato: 11 file di test creavano cartelle con `mkdtemp` in TEMP e non le toglievano,
 * 55 cartelle a ogni giro della suite (prova: `tests/temp-nessun-residuo.test.mjs`).
 *
 * ⛔ Perché NON `t.after` al momento della creazione: misurato su Node 24.18, i ganci `t.after` girano
 *   nell'ORDINE DI REGISTRAZIONE. Una rimozione registrata quando la cartella nasce partirebbe PRIMA
 *   della chiusura del server o dell'osservatore che il test apre dopo, cioè con gli handle ancora
 *   aperti (EBUSY/EPERM su Windows). ⇒ Un solo gancio `after` a livello di FILE, registrato quando
 *   questo modulo viene caricato: parte dopo TUTTI i test del file e dopo i loro `t.after`.
 * ⛔ Il gancio si registra all'import (livello di modulo), non alla prima chiamata: `after()` chiamato
 *   dentro un test in corso si legherebbe a quel test.
 * ⚠️ Limite dichiarato dalla revisione del 23/09 notte (D2-c): perché il gancio nasce all'import, parte
 *   PRIMA di un eventuale `after` a livello di file scritto nel test stesso (gli import si valutano per
 *   primi). Oggi nessuno dei file che adottano questo aiuto ha un `after` di file; chi ne aggiunge uno
 *   che chiude un server lo chiude con `t.after` nel test, o la rimozione vede gli handle aperti.
 * La rimozione passa dall'aiuto di casa (`rimuovi-cartella-di-prova.mjs`): ritenta sui codici della corsa
 * (EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM) e lo dichiara con un avviso, come vuole BC09.
 * Fonti, 23/09/2026: Node 24 `fs.rmSync` (maxRetries 0 di default, ritenta solo sui cinque codici);
 * Node 24 `os.tmpdir()` (TEMP prima di TMP su Windows); ordine dei ganci misurato, non dedotto.
 */
const create = new Set();

/*
 * ⛔ D2-c, 24/09/2026 — OGNI cartella si tenta, anche dopo un errore. Prima il primo errore interrompeva
 *   il `for` e le cartelle successive restavano in TEMP senza che nessuno le nominasse. Ora gli errori si
 *   raccolgono, si dichiarano in UN avviso `CartellaDiProvaNonRimossa` con tutte le cartelle rimaste, e
 *   poi arrivano al chiamante come `AggregateError`: il gancio resta rosso come prima, ma non tace più
 *   sulle cartelle che non ha nemmeno tentato. (`AggregateError`: MDN, «represents several errors wrapped
 *   in a single error», `errors` è l'elenco — letto il 24/09/2026.)
 * `rimuovi` e `avvisa` sono iniettabili solo per la prova (`temp-nessun-residuo.test.mjs`, DESK-TEMP-3).
 */
export async function rimuoviTutteLeCartelle(cartelle, {
  rimuovi = rimuoviCartellaDiProvaAttesa,
  avvisa = (testo, tipo) => process.emitWarning(testo, tipo),
} = {}) {
  const falliti = [];
  for (const cartella of cartelle) {
    try { await rimuovi(cartella); } catch (errore) { falliti.push({ cartella, errore }); }
  }
  if (!falliti.length) return;
  const elenco = falliti.map(({ cartella, errore }) => `${cartella} (${errore?.code ?? errore?.message ?? errore})`).join('; ');
  avvisa(`cartelle di prova NON rimosse (${falliti.length} su ${cartelle.length}): ${elenco}`, 'CartellaDiProvaNonRimossa');
  throw new AggregateError(falliti.map(({ errore }) => errore), `cartelle di prova non rimosse: ${elenco}`);
}

/*
 * ⛔ La seconda passata. L'archivio delle sessioni RICREA la sua cartella a ogni scrittura
 *   (`src/session-store.mjs`, `registraRiga`: `mkdir` ricorsivo prima di ogni `appendFile`): una scrittura
 *   del registro arrivata dopo la fine del test resuscita la cartella appena tolta.
 * ⛔⛔ D2-b, 24/09/2026 — questa passata NON è più la cura, è il RILEVATORE. Prima aspettava 300 ms fissi
 *   e poi guardava: una corsa contro l'orologio (misurato dalla revisione: senza passata 2 cartelle
 *   restavano, con 0 ms 1, con 300 ms nessuna ma con due avvisi a ogni corsa). La cura vera sta in chi
 *   scrive: il test deve aspettare che la SUA coda di scrittura sia vuota prima di finire
 *   (`tempi-del-giro-sul-disco.test.mjs`, `aspettaScritture`). Da qui non si può: `src/session-store.mjs`
 *   non espone uno svuotamento della coda (`codeDiScrittura` è privata del modulo).
 *   ⇒ Qui si osserva per al più `OSSERVAZIONE_MASSIMA_MS`, a passi di `PASSO_MS`: una cartella rinata
 *   viene tolta E DICHIARATA con un avviso `CartellaDiProvaRisorta` — e il cancello
 *   `temp-nessun-residuo` diventa ROSSO su quell'avviso, così nessuno la scambia per un successo.
 */
const OSSERVAZIONE_MASSIMA_MS = 300;
const PASSO_MS = 25;

async function osservaRisorte(cartelle) {
  const risorte = new Set();
  for (let atteso = 0; atteso < OSSERVAZIONE_MASSIMA_MS; atteso += PASSO_MS) {
    await new Promise((fatto) => setTimeout(fatto, PASSO_MS));
    for (const cartella of cartelle) if (existsSync(cartella)) risorte.add(cartella);
  }
  return [...risorte];
}

after(async () => {
  const tutte = [...create].reverse();
  create.clear();
  const errori = [];
  try { await rimuoviTutteLeCartelle(tutte); } catch (errore) { errori.push(errore); }
  const risorte = await osservaRisorte(tutte);
  for (const cartella of risorte) {
    process.emitWarning(`cartella di prova ricreata dopo la fine dei test (scrittura tardiva): ${cartella}`, 'CartellaDiProvaRisorta');
  }
  try { await rimuoviTutteLeCartelle(risorte); } catch (errore) { errori.push(errore); }
  if (errori.length === 1) throw errori[0];
  if (errori.length) throw new AggregateError(errori.flatMap((e) => e.errors ?? [e]), 'cartelle di prova non rimosse');
});

/** Crea una cartella di prova in TEMP che verrà tolta alla fine del file di test. */
export function cartellaDiProva(prefisso) {
  const cartella = mkdtempSync(join(tmpdir(), prefisso));
  create.add(cartella);
  return cartella;
}

/** Come `cartellaDiProva`, per chi usa già l'API a promesse. */
export async function cartellaDiProvaAttesa(prefisso) {
  const cartella = await mkdtemp(join(tmpdir(), prefisso));
  create.add(cartella);
  return cartella;
}
