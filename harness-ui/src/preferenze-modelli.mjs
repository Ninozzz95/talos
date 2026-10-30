/*
 * Owner 29/10/2026 (domanda 2 del selettore dei modelli, «sul server, adesso, uguali su PC e dispositivo») — PREFERITI E USATI DI
 * RECENTE DEI MODELLI. Contratto: `Downloads/handoff-talos-2026-09-27/in-corso/CONTRATTO-PREFERITI-MODELLI-2026-10-29.md`.
 *
 * Stessa forma di `impostazioni-comandi.mjs` (file nella cartella dati del desktop, schema dichiarato, scrittura atomica, un file
 * illeggibile vale «vuoto» e lo dice). Le scritture sono AZIONI (stella sì/no, usato, importa) e non una lista intera da
 * sostituire: con due dispositivi che scrivono, la lista vecchia di uno cancellerebbe ciò che l'altro ha appena aggiunto (il «lost
 * update»; Jira JRACLOUD-78137 e archman.dev «Concurrency Control and ETags», letti il 29/10/2026). Nel processo le scritture
 * stanno in fila: due clic rapidi non si perdono.
 */
import { readFile } from 'node:fs/promises';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_PREFERENZE_MODELLI = 'talos.model-preferences.v1';
export const MASSIMO_PREFERITI = 50;
export const MASSIMO_RECENTI = 5;
const MASSIMO_IMPORTATI = 200;
const LUNGHEZZA_ID = 200;

const errore = (codice, messaggio) => Object.assign(new Error(messaggio), { code: codice });
const invalido = (messaggio) => errore('QUERY_INVALID', messaggio);

/** Un id di modello come lo manda il selettore: stringa 1-200, niente caratteri di controllo, niente spazi ai bordi. */
export function idModelloValido(valore) {
  return typeof valore === 'string' && valore.length > 0 && valore.length <= LUNGHEZZA_ID
    && valore === valore.trim() && !/[\u0000-\u001f\u007f]/u.test(valore);
}
const campiEsatti = (corpo, attesi) => {
  const chiavi = Object.keys(corpo);
  return chiavi.length === attesi.length && attesi.every((c) => Object.hasOwn(corpo, c));
};
const unione = (base, aggiunti, massimo) => [...new Set([...base, ...aggiunti])].slice(0, massimo);

/** Il corpo di una scrittura, controllato: torna l'azione pulita o lancia `QUERY_INVALID`. */
export function validaAzione(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw invalido('The body must be an object.');
  if (corpo.azione === 'preferito') {
    if (!campiEsatti(corpo, ['azione', 'modello', 'attivo']) || !idModelloValido(corpo.modello) || typeof corpo.attivo !== 'boolean') {
      throw invalido('A star is { azione: "preferito", modello, attivo: true|false }.');
    }
    return { azione: 'preferito', modello: corpo.modello, attivo: corpo.attivo };
  }
  if (corpo.azione === 'usato') {
    if (!campiEsatti(corpo, ['azione', 'modello']) || !idModelloValido(corpo.modello)) throw invalido('A choice is { azione: "usato", modello }.');
    return { azione: 'usato', modello: corpo.modello };
  }
  if (corpo.azione === 'importa') {
    const elenco = (v) => Array.isArray(v) && v.length <= MASSIMO_IMPORTATI && v.every(idModelloValido);
    if (!campiEsatti(corpo, ['azione', 'preferiti', 'recenti']) || !elenco(corpo.preferiti) || !elenco(corpo.recenti)) {
      throw invalido('An import is { azione: "importa", preferiti: string[], recenti: string[] } with at most 200 valid ids each.');
    }
    return { azione: 'importa', preferiti: [...corpo.preferiti], recenti: [...corpo.recenti] };
  }
  throw invalido('The action is "preferito", "usato" or "importa".');
}

/** Lo stato dopo un'azione già validata. Lancia `MODEL_FAVOURITES_FULL` sul 51° preferito. */
export function applicaAzione(stato, azione) {
  const { preferiti, recenti } = stato;
  if (azione.azione === 'preferito') {
    if (!azione.attivo) return { preferiti: preferiti.filter((m) => m !== azione.modello), recenti };
    if (preferiti.includes(azione.modello)) return stato;
    if (preferiti.length >= MASSIMO_PREFERITI) throw errore('MODEL_FAVOURITES_FULL', `At most ${MASSIMO_PREFERITI} favourite models.`);
    return { preferiti: [...preferiti, azione.modello], recenti };
  }
  if (azione.azione === 'usato') return { preferiti, recenti: [azione.modello, ...recenti.filter((m) => m !== azione.modello)].slice(0, MASSIMO_RECENTI) };
  return { preferiti: unione(preferiti, azione.preferiti, MASSIMO_PREFERITI), recenti: unione(recenti, azione.recenti, MASSIMO_RECENTI) };
}

function daTesto(testo) {
  const dato = JSON.parse(testo);
  const lista = (v, massimo) => {
    if (!Array.isArray(v) || !v.every(idModelloValido)) throw new Error('lists of model ids expected');
    return [...new Set(v)].slice(0, massimo);
  };
  if (!dato || typeof dato !== 'object' || Array.isArray(dato)) throw new Error('an object expected');
  return { preferiti: lista(dato.preferiti, MASSIMO_PREFERITI), recenti: lista(dato.recenti, MASSIMO_RECENTI) };
}

export function createPreferenzeModelli({ file, avvisa = (m) => console.warn(m) } = {}) {
  if (typeof file !== 'string' || !file) throw errore('MODEL_PREFERENCES_UNAVAILABLE', 'The model preferences file is required.');
  let corrente = null;
  let coda = Promise.resolve();
  async function carica() {
    if (corrente) return corrente;
    let testo = null;
    try { testo = await readFile(file, 'utf8'); } catch (e) {
      if (e?.code !== 'ENOENT') avvisa(`[model-preferences] ${file} cannot be read (${e?.code}): empty lists until it is saved again`);
    }
    if (testo === null) corrente = { preferiti: [], recenti: [] };
    else {
      try { corrente = daTesto(testo); } catch (e) {
        avvisa(`[model-preferences] ${file} is unreadable (${e?.message ?? e}): empty lists until it is saved again`);
        corrente = { preferiti: [], recenti: [] };
      }
    }
    return corrente;
  }
  const copia = (s) => ({ preferiti: [...s.preferiti], recenti: [...s.recenti] });
  return Object.freeze({
    async leggi() { await coda.catch(() => {}); return copia(await carica()); },
    /** Valida (subito, fuori dalla fila), poi applica in fila e salva. Torna lo stato intero dopo la scrittura. */
    applica(corpo) {
      let azione;
      try { azione = validaAzione(corpo); } catch (e) { return Promise.reject(e); }
      const giro = coda.catch(() => {}).then(async () => {
        const prossimo = applicaAzione(await carica(), azione);
        if (prossimo !== corrente) {
          await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_PREFERENZE_MODELLI, ...prossimo }, null, 2)}\n`);
          corrente = prossimo;
        }
        return copia(corrente);
      });
      coda = giro;
      return giro;
    },
  });
}
