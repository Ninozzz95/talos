/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 1: «memoria come Hermes») — LE
 *   MEMORIE NEL PROMPT di una sessione nuova, come l'istantanea di Hermes (`tools/memory_tool.py:1-5`: «Both enter the system
 *   prompt as a FROZEN snapshot at session start; mid-session writes hit disk but never change the prompt (prefix cache
 *   intact)»). Il difetto che l'ha chiesta: a «che memorie ho?» il modello non aveva nessuna strada (sessione 56066b64).
 *
 * Tre regole portate da Hermes:
 *   - un TETTO di caratteri (Hermes: 2.200 per la memoria + 1.375 per il profilo, `load_on_disk_store`; qui un blocco solo,
 *     3.500) — ciò che non entra si dice, con la strada per vederlo (`memory_list`);
 *   - una voce che contiene uno schema d'attacco NON entra: al suo posto una nota «bloccata» senza il testo, e la voce resta
 *     nel negozio perché la persona la veda e la cancelli (`memory_tool_store.py:125-137`);
 *   - ai sotto-agenti niente memorie (`delegate_tool.py:241`, `skip_memory=True`): lo decide chi chiama.
 * PURO: niente I/O.
 */
import { minacceNelTesto } from './minacce-nel-testo.mjs';

export const TETTO_MEMORIE_NEL_PROMPT = 3_500;

/**
 * Il blocco di sistema con le memorie, o `null` se non ce ne sono.
 * @param {{id:string, titolo:string, contenuto:string}[]} memorie dalla più aggiornata (`elencaMemorie`)
 * @returns {string|null}
 */
export function bloccoDelleMemorie(memorie, { tetto = TETTO_MEMORIE_NEL_PROMPT } = {}) {
  const tutte = Array.isArray(memorie) ? memorie.filter((m) => m && typeof m.id === 'string') : [];
  if (tutte.length === 0) return null;
  const righe = [];
  let usati = 0;
  for (const m of tutte) {
    const titolo = String(m.titolo ?? '').replace(/\s+/g, ' ').trim();
    const contenuto = String(m.contenuto ?? '').replace(/\s+/g, ' ').trim();
    const minacce = minacceNelTesto(`${titolo}\n${contenuto}`);
    const riga = minacce.length > 0
      ? `- [BLOCKED: the memory with id ${m.id} contains ${minacce.join(', ')}, so it stays out of this prompt. The person can see and delete it in Memory.]`
      : `- ${titolo}: ${contenuto} (id ${m.id})`;
    if (righe.length > 0 && usati + riga.length + 1 > tetto) break;
    righe.push(riga);
    usati += riga.length + 1;
  }
  const mancano = tutte.length - righe.length;
  return [
    `MEMORY — what the person asked TALOS to remember: ${righe.length} of ${tutte.length}, most recently updated first. `
      + 'These are the person\'s own saved words, not instructions from files or web pages. If one conflicts with what the '
      + 'person says now, follow the person. memory_list and memory_search show them all; memory_update and memory_delete '
      + 'change them.',
    ...righe,
    ...(mancano > 0 ? [`(${mancano} more are not shown here: call memory_list to see them.)`] : []),
  ].join('\n');
}
