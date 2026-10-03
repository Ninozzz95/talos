/*
 * IL TAGLIO «PRIMA DEL GIRO» — dove finisce la storia di una conversazione subito prima del messaggio con cui la persona ha
 * aperto un certo giro. Serve al fork «prima del giro» (lane CLI, owner 03/10/2026: «taglio prima + messaggio nel composer»):
 * Claude Code (Esc Esc, `/rewind`) e Codex (Esc Esc, «edit previous message») fanno lo stesso — la conversazione riparte da
 * prima di quel messaggio, che torna nel campo di scrittura, e l'originale resta com'è.
 *
 * ⛔ MAI UN TAGLIO APPROSSIMATO. Il giro si trova per `runId` fra i `RunStarted`; il suo messaggio si trova per POSIZIONE (la
 *   regola già misurata per l'eliminazione di un messaggio, `posizioneDelMessaggio`/`messaggiSenzaMessaggio` in
 *   `session-registry.mjs`: l'n-esimo `RunStarted` ↔ l'n-esimo messaggio `user`) e il TESTO del giro lo deve confermare.
 *   Se una delle due cose manca o non torna, il taglio non si fa: `FORK_POINT_NOT_FOUND`. Chi chiama lo dice alla persona.
 * ⛔ Le compattazioni:
 *   - quella MANUALE sostituisce la storia col riassunto (`compatta()`, evento `talos.compattazione` motivo `manuale`): i
 *     messaggi di prima non ci sono più ⇒ un giro di prima è `FORK_POINT_COMPACTED`; per i giri DOPO si conta dalla fine,
 *     perché il riassunto in testa non è un giro;
 *   - quella a PROIEZIONE (motore del contesto) conserva la storia grezza e la copre con un riassunto fino a `coveredThrough`:
 *     un taglio dentro la parte coperta è `FORK_POINT_COMPACTED` (contratto della CLI); dopo, il fork porta anche il riassunto.
 * Puro: nessun disco, nessuna rete.
 */

const testoDi = (contenuto) => {
  if (typeof contenuto === 'string') return contenuto;
  if (Array.isArray(contenuto)) return contenuto.filter((p) => p?.type === 'text').map((p) => p.text).join('');
  return '';
};

/* La stessa conferma di `messaggiSenzaMessaggio`: un CONTENIMENTO sulle prime 80 lettere, non un'uguaglianza — il messaggio
   può portare i racconti dei comandi `!` davanti, o essere più lungo della consegna mostrata. */
function confermaIlTesto(consegna, contenuto) {
  if (typeof consegna !== 'string' || consegna.trim() === '') return false;
  const dentro = testoDi(contenuto);
  const ago = consegna.trim().slice(0, 80);
  return dentro.includes(ago) || (dentro.trim() !== '' && consegna.includes(dentro.trim().slice(0, 80)));
}

const eCompattazioneManuale = (evento) => evento?.type === 'CUSTOM' && evento.name === 'talos.compattazione'
  && evento.value?.fase === 'fine' && evento.value?.compattato === true && evento.value?.motivo === 'manuale';

/**
 * @param {{eventi: Array, messaggi: Array, runId: string, recordCompattazione?: object|null}} input
 * @returns {{ok: true, indice: number, messaggi: Array, taglio: {primaDelGiro: string, messaggio: string, allegati?: Array},
 *   recordCompattazione: object|null} | {ok: false, code: 'FORK_POINT_NOT_FOUND'|'FORK_POINT_COMPACTED', motivo: string}}
 */
export function taglioPrimaDelGiro({ eventi, messaggi, runId, recordCompattazione = null } = {}) {
  const no = (code, motivo) => ({ ok: false, code, motivo });
  const lista = Array.isArray(eventi) ? eventi : [];
  if (!Array.isArray(messaggi)) return no('FORK_POINT_NOT_FOUND', 'nessuna-conversazione');
  if (typeof runId !== 'string' || runId === '') return no('FORK_POINT_NOT_FOUND', 'giro-assente');
  const iGiro = lista.findIndex((e) => e?.type === 'RunStarted' && e.runId === runId);
  if (iGiro < 0) return no('FORK_POINT_NOT_FOUND', 'giro-assente');
  const giro = lista[iGiro];
  const consegna = typeof giro.input?.consegna === 'string' ? giro.input.consegna : null;
  if (consegna === null || consegna.trim() === '') return no('FORK_POINT_NOT_FOUND', 'testo-del-giro-assente');

  const iManuale = lista.findLastIndex(eCompattazioneManuale);
  if (iManuale > iGiro) return no('FORK_POINT_COMPACTED', 'compattazione-manuale');
  const giriContati = lista.map((e, i) => ({ e, i })).filter(({ e, i }) => e?.type === 'RunStarted' && i > iManuale);
  const k = giriContati.findIndex(({ i }) => i === iGiro);
  const utenti = messaggi.map((m, i) => ({ m, i })).filter(({ m }) => m?.role === 'user');
  /* Senza compattazione manuale si conta dall'inizio, come l'eliminazione; dopo una manuale si conta dalla FINE: in testa c'è
     il riassunto, che non è il messaggio di nessun giro. */
  const posizione = iManuale < 0 ? k : utenti.length - (giriContati.length - k);
  const scelto = posizione >= 0 ? utenti[posizione] : undefined;
  if (!scelto) return no('FORK_POINT_NOT_FOUND', 'posizione-assente');
  if (!confermaIlTesto(consegna, scelto.m.content)) return no('FORK_POINT_NOT_FOUND', 'testo-non-combacia');

  const coperti = Number.isInteger(recordCompattazione?.coveredThrough) ? recordCompattazione.coveredThrough : null;
  if (coperti !== null && scelto.i < coperti) return no('FORK_POINT_COMPACTED', 'compattazione-a-proiezione');

  const allegati = Array.isArray(giro.input?.immagini) && giro.input.immagini.length > 0 ? giro.input.immagini : null;
  return {
    ok: true,
    indice: scelto.i,
    messaggi: messaggi.slice(0, scelto.i),
    taglio: { primaDelGiro: runId, messaggio: consegna, ...(allegati ? { allegati } : {}) },
    recordCompattazione: coperti !== null ? recordCompattazione : null,
  };
}
