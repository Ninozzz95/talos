/** BC-49, contratto v1. Fonti e decisioni nel rapporto del 12/09/2026.
 * Checkpoint applicativi completi, mai frammenti di JSON del fornitore.
 * Il tetto riguarda gli argomenti, non promette una durata del ragionamento.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { percorsoGiornale, scriviRapporto } from '../research-store.mjs';

export const LIMITE_PARTE_RAPPORTO_BYTE = 4096;
const MASSIMO_PARTI = 512;
const code = new Map();
const impronta = testo => createHash('sha256').update(testo, 'utf8').digest('hex');
const ordinato = valore => Array.isArray(valore) ? valore.map(ordinato)
  : valore && typeof valore === 'object' ? Object.fromEntries(Object.keys(valore).sort().map(k => [k, ordinato(valore[k])])) : valore;
const serializza = valore => JSON.stringify(ordinato(valore));

function controlla(contenuto) {
  const { parte, testo, affermazioni, fonti } = contenuto;
  if (!parte || !Number.isSafeInteger(parte.indice) || parte.indice < 1 || parte.indice > MASSIMO_PARTI || typeof parte.ultima !== 'boolean') {
    return 'Part requires an integer index from 1 to 512 and ultima true or false.';
  }
  if (typeof testo !== 'string' || !Array.isArray(affermazioni) || !Array.isArray(fonti)) return 'Each part requires text and the claims and sources lists, even if empty.';
  if (affermazioni.some(a => !a || typeof a !== 'object' || Array.isArray(a) || typeof a.testo !== 'string' || !a.testo.trim()
    || !((typeof a.fonte === 'string' && a.fonte.trim()) || Number.isSafeInteger(a.fonte)))) return 'Each claim requires text and source; use its full URL.';
  if (fonti.some(f => !f || typeof f.url !== 'string' || !/^https?:\/\//i.test(f.url.trim()))) return 'Each source requires a full HTTP(S) URL.';
  if (Buffer.byteLength(JSON.stringify(contenuto), 'utf8') > LIMITE_PARTE_RAPPORTO_BYTE) return `Part exceeds ${LIMITE_PARTE_RAPPORTO_BYTE} bytes: split it before retrying with the same index.`;
  return null;
}

/** Replay rigoroso delle parti; gli altri eventi restano proprietà del motore L9/BC-44. */
export function rileggiPartiRapporto(eventi) {
  const parti = [];
  let conclusione = null;
  for (const evento of eventi) {
    if (evento?.kind === 'deposit_part') {
      const contenuto = evento.contenuto;
      if (!contenuto || controlla(contenuto) || evento.versione !== 1 || evento.indice !== contenuto.parte.indice
        || evento.impronta !== impronta(serializza(contenuto))) throw new Error('Part integrity cannot be verified: invalid journal digest or content.');
      const precedente = parti[evento.indice - 1];
      if (precedente) {
        if (precedente.impronta !== evento.impronta) throw new Error('Journal integrity: two different contents for the same part.');
        continue;
      }
      if (evento.indice !== parti.length + 1 || parti.at(-1)?.contenuto.parte.ultima || conclusione) throw new Error('Journal integrity: missing a part or deposit is already closed.');
      parti.push(evento);
    } else if (evento?.kind === 'deposit_finished') {
      if (!parti.at(-1)?.contenuto.parte.ultima || evento.ultimaImpronta !== parti.at(-1).impronta
        || !/^[a-f0-9]{64}$/.test(evento.impronta ?? '') || !evento.risultato?.ok) throw new Error('Deposit closure integrity cannot be verified.');
      conclusione = evento;
    }
  }
  return { parti, conclusione, prossimaParte: parti.length + 1 };
}

function assembla(parti) {
  return {
    testo: parti.map(p => p.contenuto.testo).join(''),
    affermazioni: parti.flatMap(p => p.contenuto.affermazioni),
    fonti: parti.flatMap(p => p.contenuto.fonti),
  };
}

/** Un solo scrittore per ricerca nel processo che possiede la corsa; conferma dopo fsync. */
export async function depositaParteRapporto(argomenti, { leggiGiornaleFn, accodaEventoFn, leggiRapportoFn, valida, finalizza, clock }) {
  const { cartella, id, testo, affermazioni, fonti, parte, byteArgomenti } = argomenti;
  const contenuto = structuredClone({ testo, affermazioni, fonti, parte });
  const motivo = controlla(contenuto);
  if (motivo) return { ok: false, motivo };
  if (byteArgomenti !== undefined && (!Number.isSafeInteger(byteArgomenti) || byteArgomenti > LIMITE_PARTE_RAPPORTO_BYTE)) {
    return { ok: false, motivo: `Generated arguments exceed ${LIMITE_PARTE_RAPPORTO_BYTE} bytes. Split text and evidence; retry with the same index.` };
  }
  const chiave = `${resolve(cartella)}\0${id}`;
  const precedente = code.get(chiave) ?? Promise.resolve();
  const corrente = precedente.catch(() => {}).then(async () => {
    const { eventi } = await leggiGiornaleFn({ cartella, id, rigoroso: true });
    const stato = rileggiPartiRapporto(eventi);
    const hash = impronta(serializza(contenuto));
    const registrata = stato.parti[parte.indice - 1];
    if (registrata && registrata.impronta !== hash) return { ok: false, motivo: `Part ${parte.indice} is already recorded with different content. Do not rewrite it; next part: ${stato.prossimaParte}.` };
    if (!registrata && (parte.indice !== stato.prossimaParte || stato.parti.at(-1)?.contenuto.parte.ultima)) {
      return { ok: false, motivo: `Invalid order: next part ${stato.prossimaParte}. An already recorded closure must be retried identically.` };
    }
    const evento = registrata ?? {
      kind: 'deposit_part', versione: 1, at: clock().toISOString(), indice: parte.indice,
      impronta: hash, byte: byteArgomenti ?? Buffer.byteLength(JSON.stringify(contenuto), 'utf8'), contenuto,
    };
    const tutte = registrata ? stato.parti : [...stato.parti, evento];
    const unito = parte.ultima ? assembla(tutte) : null;
    if (unito) {
      const controllo = valida(unito);
      if (!controllo.ok) return controllo;
    }
    if (!registrata) await accodaEventoFn({ cartella, id, evento, separaRiga: true });
    if (!parte.ultima) return {
      ok: true, parziale: true, prossimaParte: tutte.length + 1,
      messaggio: `Part ${parte.indice} recorded (${evento.byte} bytes). Next part: ${tutte.length + 1}. Wait for this confirmation before continuing; the report will be ready only after the final part.`,
      contenutoRegistrato: `\n${JSON.stringify(evento)}\n`, percorsoRegistrato: percorsoGiornale(cartella, id),
    };
    if (stato.conclusione) {
      const documento = await leggiRapportoFn({ cartella, id });
      if (typeof documento !== 'string' || impronta(documento) !== stato.conclusione.impronta) throw new Error('Completed report does not match digest in journal: restore file before retrying.');
      return { ...stato.conclusione.risultato, documento, giaScritto: true };
    }
    const composto = await finalizza(unito);
    if (!composto.ok) return composto;
    await scriviRapporto({ cartella, id, testo: composto.documento });
    const risultato = Object.fromEntries(['ok', 'affermazioni', 'fonti', 'senzaPassaggio', 'bilancio', 'giudice'].filter(k => composto[k] !== undefined).map(k => [k, composto[k]]));
    await accodaEventoFn({ cartella, id, separaRiga: true, evento: {
      kind: 'deposit_finished', versione: 1, at: clock().toISOString(), ultimaImpronta: hash,
      impronta: impronta(composto.documento), byte: Buffer.byteLength(composto.documento, 'utf8'), risultato,
    } });
    return { ...composto, giaScritto: true };
  });
  code.set(chiave, corrente);
  try { return await corrente; }
  finally { if (code.get(chiave) === corrente) code.delete(chiave); }
}

/** La parte statica resta identica fra i giri; il progresso compare solo alla ripresa. */
export function consegnaPartiRapporto(eventi = []) {
  const stato = rileggiPartiRapporto(eventi);
  const istruzioni = [
    'Deposit the report progressively with research_deposit after each branch of the plan, one section at a time, without waiting for the end of the research.',
    'Always include parte:{indice:1,ultima:false}, then increment indice by one after each confirmation. This instruction supersedes any previous single deposit requests.',
    `Each call must contain at most ${LIMITE_PARTE_RAPPORTO_BYTE} UTF-8 bytes of total JSON arguments; aim for 3000 bytes, about 400 words between report text and evidence. Only one deposit call for each response: wait for confirmation before generating the next.`,
    'testo contains only the current section, with necessary newlines: server concatenates parts without adding separators. The first part includes the title; later parts complete conclusions and sources.',
    'Also distribute claims and sources across parts, without repeating previously sent ones; use exact URLs in fonte. Lists may be empty. Do not hoard all evidence into a single massive final call.',
    'To close, set ultima:true; if everything is already recorded, send testo:"", affermazioni:[], fonti:[] with the next index and ultima:true. Only then does the server assemble, verify, and publish the report.',
    'The final chat message is only a brief confirmation, never the report: this rule supersedes any previous instructions to write it as the last message.',
    'Do not regenerate confirmed parts and do not copy the full report. If a confirmation was lost, repeat the same index with the same contents. Write the report and messages for the user in Italian, without technical tool names.',
  ];
  if (stato.parti.length) {
    istruzioni.push(`Parts already recorded: ${stato.parti.length}. ${stato.parti.at(-1).contenuto.parte.ultima ? 'Do not add more parts.' : `Next part: ${stato.prossimaParte}.`} Confirmed contents are in the research journal; read them only if needed to continue, without resending them.`);
    if (stato.parti.at(-1).contenuto.parte.ultima) {
      istruzioni.push('The final part is already recorded: complete or recover the delivery by repeating EXACTLY this call, without any other prose:', JSON.stringify(stato.parti.at(-1).contenuto));
    }
  }
  return istruzioni.join('\n');
}
