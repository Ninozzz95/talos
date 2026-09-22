/**
 * frequent-dirs.mjs — owner, coda del piano `elegant-spinning-dongarra.md`:
 * "nella lista file quando si crea una sessione, bisogna mettere directory
 * più usate (tipo desktop downloads etc)". Solo LETTURA, solo suggerimenti:
 * questo file non decide se una cartella è AMMESSA — quello resta
 * `custom-task.mjs`/`avviaLibero` (permesso "Full access", vedi la sua doc
 * sul perché niente denylist), qui si limita a proporre percorsi VERI e
 * VERIFICATI, mai una scorciatoia verso il nulla.
 *
 * ⛔⛔⛔ 30/8, CORRETTO — owner dal vivo: "come mai non ho le cartelle più
 * usate?" La prima versione (28/8) calcolava SOLO dalle cartelle utente
 * standard di Windows (`os.homedir()`) — sempre le stesse tre, MAI la
 * cronologia reale, quindi mai davvero "più usate". Ora la fonte PRIMARIA
 * è `sessionRegistry.cartellePiuUsate()` (cronologia reale delle
 * sessioni, aggregata in `session-registry.mjs`); le tre cartelle
 * Windows standard restano SOLO il ripiego onesto per l'avvio a freddo
 * (zero sessioni mai partite) — vedi `cartelleFrequenti()` sotto.
 *
 * ⛔ Deliberatamente SEPARATO da `config.mjs#parseCartelleProgetto`: quella
 * è l'allowlist fissa dell'amministratore, validata fail-closed all'AVVIO
 * del server. Questa è un elenco DINAMICO, calcolato a ogni richiesta —
 * le due liste non si mescolano MAI: le cartelle frequenti sono solo
 * suggerimenti per il campo "Full access" (percorso a piacere), non una
 * seconda allowlist che aggirerebbe il permesso.
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { statSync } from 'node:fs';

/**
 * ⭐ Le stesse TRE cartelle che ogni file manager Windows mostra per
 * default nella barra laterale ("Quick access") — non inventate, sono i
 * nomi di cartella standard sotto il profilo utente su ogni installazione
 * Windows moderna. Il ripiego onesto per l'avvio a freddo (nessuna
 * cronologia reale ancora), MAI mescolate con essa — vedi doc di testa.
 */
const CANDIDATE = Object.freeze([
  { etichetta: 'Desktop', sottocartella: 'Desktop' },
  { etichetta: 'Download', sottocartella: 'Downloads' },
  { etichetta: 'Documenti', sottocartella: 'Documents' },
]);

/**
 * ⭐⭐⭐ 30/8 — owner dal vivo: "come mai non ho le cartelle più usate?"
 * Le tre cartelle Windows standard sopra NON erano mai state "più usate"
 * per davvero — erano SEMPRE le stesse, indipendentemente da cosa
 * l'owner avesse effettivamente aperto. Ora la fonte VERA
 * (`sessionRegistry.cartellePiuUsate()`, aggregata dalla cronologia reale
 * delle sessioni) ha priorità; le cartelle Windows standard restano
 * SOLO il ripiego onesto per l'avvio a freddo (zero sessioni mai
 * partite) — mai sparire del tutto, mai fingere una cronologia che non
 * c'è.
 *
 * @param {number} massimoRisultati — quante suggerirne al massimo (il campo è solo un aiuto, non un elenco esaustivo).
 * @returns {Array<{percorso:string, conteggio:number, ultimaVolta:string}>}
 */
function candidatiDaCronologia(sessionRegistry, massimoRisultati) {
  if (!sessionRegistry || typeof sessionRegistry.cartellePiuUsate !== 'function') return [];
  return sessionRegistry.cartellePiuUsate().slice(0, massimoRisultati);
}

function cartellaReale(percorso, statSyncFn) {
  try {
    return statSyncFn(percorso).isDirectory();
  } catch {
    return false;
  }
}

function cartelleStandard({ homedirFn, statSyncFn }) {
  const home = homedirFn();
  return CANDIDATE.flatMap(({ etichetta, sottocartella }) => {
    const percorso = join(home, sottocartella);
    return cartellaReale(percorso, statSyncFn) ? [{ etichetta, percorso }] : [];
  });
}

function chiavePercorso(percorso) {
  return resolve(percorso).replace(/[\\/]+$/, '').toLocaleLowerCase('en-US');
}

/**
 * @param {{homedirFn?: typeof homedir, statSyncFn?: typeof statSync, sessionRegistry?: {cartellePiuUsate: () => Array<{percorso:string, conteggio:number, ultimaVolta:string}>}}} [deps] — `sessionRegistry` opzionale: assente nei test che provano solo il ripiego Windows, sempre presente dal server reale (vedi http-app.mjs).
 * @returns {Array<{etichetta:string, percorso:string}>} — SOLO le cartelle che esistono
 *   davvero sul disco in questo momento, mai una candidata a occhio: una
 *   cartella cancellata dall'owner (Download standard, o una copia
 *   usa-e-getta del corpus benchmark ormai ripulita) non deve comparire
 *   come scorciatoia verso il nulla.
 */
export function cartelleFrequenti({ homedirFn = homedir, statSyncFn = statSync, sessionRegistry } = {}) {
  const MASSIMO = 6;
  const daCronologia = candidatiDaCronologia(sessionRegistry, MASSIMO);
  const trovate = [];
  for (const { percorso } of daCronologia) {
    if (!cartellaReale(percorso, statSyncFn)) continue;
    // ⭐ etichetta = nome dell'ultima cartella nel percorso ("qa-visiva-harness-2026-08-30" da ...\projects\qa-visiva-harness-2026-08-30), stesso principio di nomeCartella lato client (app.js, split su [\\/]).
    const etichetta = percorso.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || percorso;
    trovate.push({ etichetta, percorso });
  }
  if (trovate.length > 0) return trovate; // ⛔ cronologia reale disponibile: MAI mescolarla con Desktop/Downloads/Documenti sotto — quelle tre non sono "più usate", solo il ripiego a freddo.
  return cartelleStandard({ homedirFn, statSyncFn });
}

/**
 * Scelte rapide della workbench "Nuova sessione". A differenza del contratto
 * storico `cartelleFrequenti()` (che resta identico), qui l'owner ha bisogno
 * sia della cronologia vera sia delle cartelle standard realmente presenti.
 * L'unione è solo presentazione: non crea una allowlist e non modifica i
 * permessi della sessione.
 *
 * @returns {Array<{etichetta:string, percorso:string, tipo:'recent'|'known'}>}
 */
export function cartelleConsigliate({ homedirFn = homedir, statSyncFn = statSync, sessionRegistry } = {}) {
  const trovate = [];
  const viste = new Set();
  for (const { percorso } of candidatiDaCronologia(sessionRegistry, 6)) {
    if (!cartellaReale(percorso, statSyncFn)) continue;
    const chiave = chiavePercorso(percorso);
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    trovate.push({
      etichetta: percorso.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || percorso,
      percorso,
      tipo: 'recent',
    });
  }
  for (const { etichetta, percorso } of cartelleStandard({ homedirFn, statSyncFn })) {
    const chiave = chiavePercorso(percorso);
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    trovate.push({ etichetta, percorso, tipo: 'known' });
  }
  return trovate;
}
