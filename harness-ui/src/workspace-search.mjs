/*
 * ⛔⛔ PO-30, fetta 1 (17/09/2026) — CERCARE UN FILE IN TUTTA LA CARTELLA, non solo fra le cartelle già aperte.
 *
 * La scheda File cercava «fra i file già caricati»: l'albero si carica cartella per cartella, quindi un file in una
 * cartella mai aperta non si trovava, e per trovarlo bisognava già sapere dov'era. Il laboratorio dell'owner (PR #33)
 * ha una ricerca vera; questa è la sua metà di backend.
 *
 * Ricerca del 17/09/2026, e i vincoli che ne vengono:
 *  · VS Code esclude dalla ricerca ciò che sta in `.gitignore`, ed è la fonte di una lunga fila di segnalazioni
 *    (microsoft/vscode #41494, #43795, #83817, #156076, #270857): la gente cerca un file che SA che c'è e non lo trova.
 *    ⇒ Qui `.gitignore` NON si applica. Si saltano per NOME solo le due cartelle che renderebbero la ricerca inutile
 *      per mole — `.git` e `node_modules` — e la risposta DICE che le ha saltate, invece di tacere.
 *  · Su Windows una giunzione è vista da `readdir({withFileTypes})` come collegamento (misurato in questo repo il
 *    17/09, `plugin-registry.mjs`): i collegamenti non si seguono, così un anello non fa girare la camminata per sempre
 *    e la ricerca non esce dalla cartella della sessione.
 *  · Tutto ha un tetto, e quando il tetto morde la risposta porta `troncato: true`: un elenco tagliato che sembra
 *    completo è peggio di nessun elenco.
 */
import { readdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export class WorkspaceSearchError extends Error {
  constructor(message, code = 'QUERY_INVALID') { super(message); this.name = 'WorkspaceSearchError'; this.code = code; }
}

export const CARTELLE_SALTATE = Object.freeze(['.git', 'node_modules']);
export const LIMITI_RICERCA = Object.freeze({ risultati: 200, vociVisitate: 40_000, profondita: 24, millisecondi: 2_500, caratteriQuery: 256 });

/**
 * @param {{cartella:string, query:string}} input
 * @returns {Promise<{risultati:Array<{percorso:string,nome:string,cartella:boolean}>, troncato:boolean, motivo:string|null, saltate:string[], visitate:number}>}
 */
export async function cercaNelWorkspace({ cartella, query }, deps = {}) {
  const readdirFn = deps.readdirFn ?? readdir;
  const adessoFn = deps.adessoFn ?? (() => performance.now());
  const limiti = { ...LIMITI_RICERCA, ...(deps.limiti ?? {}) };
  if (typeof cartella !== 'string' || cartella.length === 0 || cartella.includes('\0') || !isAbsolute(cartella)) {
    throw new WorkspaceSearchError('Cartella della sessione non valida');
  }
  const ago = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (ago.length === 0) throw new WorkspaceSearchError('Scrivi che cosa cercare');
  if (ago.length > limiti.caratteriQuery || ago.includes('\0')) throw new WorkspaceSearchError('Ricerca troppo lunga', 'PAYLOAD_LIMIT');

  const radice = resolve(cartella);
  const inizio = adessoFn();
  const risultati = [];
  const saltate = new Set();
  let visitate = 0;
  let motivo = null;
  /* In ampiezza: i file vicini alla radice arrivano per primi, e sono quelli che di solito si cercano. */
  let livello = [{ assoluto: radice, relativo: '', profondita: 0 }];
  esterno: while (livello.length > 0) {
    const prossimo = [];
    for (const dove of livello) {
      let voci;
      try { voci = await readdirFn(dove.assoluto, { withFileTypes: true }); } catch { continue; } // una cartella che non si legge non ferma la ricerca
      voci.sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const voce of voci) {
        visitate += 1;
        if (visitate > limiti.vociVisitate) { motivo = 'la cartella è molto grande'; break esterno; }
        if ((visitate & 0xff) === 0 && adessoFn() - inizio > limiti.millisecondi) { motivo = 'la ricerca ha impiegato troppo'; break esterno; }
        if (voce.isSymbolicLink()) continue;
        const eCartella = voce.isDirectory();
        if (eCartella && CARTELLE_SALTATE.includes(voce.name)) { saltate.add(voce.name); continue; }
        const relativo = dove.relativo ? `${dove.relativo}/${voce.name}` : voce.name;
        if (relativo.toLowerCase().includes(ago)) {
          risultati.push({ percorso: relativo, nome: voce.name, cartella: eCartella });
          if (risultati.length >= limiti.risultati) { motivo = 'ci sono più risultati di quanti se ne mostrano'; break esterno; }
        }
        if (eCartella && dove.profondita + 1 <= limiti.profondita) prossimo.push({ assoluto: join(dove.assoluto, voce.name), relativo, profondita: dove.profondita + 1 });
      }
    }
    livello = prossimo;
  }
  /* Prima chi porta la parola nel NOME, poi chi la porta solo nel percorso; dentro ogni gruppo i percorsi più corti. */
  const nelNome = (r) => (r.nome.toLowerCase().includes(ago) ? 0 : 1);
  risultati.sort((a, b) => nelNome(a) - nelNome(b) || a.percorso.length - b.percorso.length || a.percorso.localeCompare(b.percorso, 'en'));
  return { risultati, troncato: motivo !== null, motivo, saltate: [...saltate].sort(), visitate };
}
