/*
 * ⭐ FE-008 (owner 31/10/2026; forma del 03/11, OK di Performance, CLI e Mobile) — I PASSI: la lista del giro, sopra la riga viva.
 *
 * Il modello la scrive con `steps_update`, sempre intera, come `update_plan` di Codex (`codex-rs/protocol/src/plan_tool.rs:8-30`) e il modo
 * predefinito di `todo_list` di Hermes (`tools/todo_tool.py:38-54`). Il server tiene la revisione, per scartare gli aggiornamenti vecchi come
 * Hermes (`:1-4`), e gli orari, che il modello non dà mai. La lista resta della sessione.
 *
 * ⛔ Il costo vero sono i giri, non lo schema (Performance, 03/11): su H ogni richiesta fa 5,5-8 s. Per questo oltre i tetti si taglia e non si
 *   rifiuta, il risultato è corto, e la lista torna intera solo se il server l'ha cambiata.
 * ⛔ Il testo viene dal modello e può venire da una pagina letta: a schermo è solo testo. Qui niente stato: lo tengono il nucleo e il registro.
 * Questo file viaggia col pin del telefono (`harness-ui/src`) e lo importa anche il client: niente dipendenze da Node o dal registro dei fornitori.
 */
export const NOME_PASSI = 'steps_update';
export const EVENTO_PASSI = 'talos.passi.v1';
export const TETTI_PASSI = Object.freeze({ voci: 20, testo: 120, dopoCompattazione: 1_500 });

const STATI = new Set(['pending', 'in_progress', 'completed', 'cancelled']);
const SEGNI = Object.freeze({ pending: '[ ]', in_progress: '[>]', completed: '[x]', cancelled: '[~]' });
const FINITO = new Set(['completed', 'cancelled']);

export const statoPassiVuoto = () => ({ revisione: 0, voci: [] });

/**
 * Gli argomenti di `steps_update`, ridotti alla loro forma. Il modello non dà orari: dei campi in più non resta niente.
 * @param {unknown} argomenti
 * @returns {{ ok: true, voci: { testo: string, stato: string }[], cambiata: boolean } | { ok: false, messaggio: string }}
 */
export function leggiArgomentiPassi(argomenti) {
  const passi = argomenti?.steps;
  if (!Array.isArray(passi)) return { ok: false, messaggio: 'steps must be a list of { text, status }.' };
  const voci = [];
  for (const [i, passo] of passi.entries()) {
    if (typeof passo?.text !== 'string' || passo.text.trim() === '') return { ok: false, messaggio: `steps[${i}].text must be a non-empty string.` };
    if (!STATI.has(passo.status)) return { ok: false, messaggio: `steps[${i}].status must be one of ${[...STATI].join(', ')}.` };
    voci.push({ testo: passo.text.trim(), stato: passo.status });
  }
  let cambiata = voci.length > TETTI_PASSI.voci;
  const tenute = voci.slice(0, TETTI_PASSI.voci);
  let inCorso = false;
  for (const voce of tenute) {
    if (voce.testo.length > TETTI_PASSI.testo) { voce.testo = voce.testo.slice(0, TETTI_PASSI.testo); cambiata = true; }
    if (voce.stato === 'in_progress') {
      if (inCorso) { voce.stato = 'pending'; cambiata = true; }
      inCorso = true;
    }
  }
  return { ok: true, voci: tenute, cambiata };
}

const stessaLista = (a, b) => a.length === b.length && a.every((v, i) => v.testo === b[i].testo && v.stato === b[i].stato);

/**
 * La lista dopo un aggiornamento. Una lista uguale non cambia niente: stessa revisione, nessun evento. Gli orari si agganciano al testo uguale.
 * @param {{ revisione: number, voci: object[] }} stato
 * @param {{ voci: { testo: string, stato: string }[] }} letto
 * @param {number} ora millisecondi, del server
 */
export function applicaPassi(stato, letto, ora) {
  if (stessaLista(stato.voci, letto.voci)) return { stato, cambiata: false };
  const prima = new Map(stato.voci.map((v) => [v.testo, v]));
  const voci = letto.voci.map(({ testo, stato: s }) => {
    const vecchia = prima.get(testo);
    if (s === 'pending') return { testo, stato: s };
    if (s === 'in_progress') return { testo, stato: s, iniziatoAl: vecchia?.iniziatoAl ?? ora };
    return { testo, stato: s, ...(vecchia?.iniziatoAl ? { iniziatoAl: vecchia.iniziatoAl } : {}), finitoAl: vecchia?.finitoAl ?? ora };
  });
  return { stato: { revisione: stato.revisione + 1, voci }, cambiata: true };
}

/** «3 di 7 passi»: le voci annullate non contano. `null` = nessuna lista. */
export function riassuntoPassi(stato) {
  const voci = (stato?.voci ?? []).filter((v) => v.stato !== 'cancelled');
  return voci.length ? { fatti: voci.filter((v) => v.stato === 'completed').length, totale: voci.length } : null;
}

/** Il risultato per il modello: corto. La lista intera solo se il server l'ha cambiata, perché il modello deve sapere cosa è stato tenuto. */
export function esitoPassi(stato, letto) {
  const conto = riassuntoPassi(stato) ?? { fatti: 0, totale: 0 };
  const corto = `ok ${conto.fatti}/${conto.totale}`;
  if (!letto.cambiata) return corto;
  return `${corto}\nThe server changed your list (limits: ${TETTI_PASSI.voci} steps, ${TETTI_PASSI.testo} characters, one step in_progress). The list is now:\n`
    + stato.voci.map((v) => `${SEGNI[v.stato]} ${v.testo}`).join('\n');
}

/** Le voci non concluse, per il blocco dei fatti dopo una compattazione. Si calcola lì una volta sola: se cambiasse a ogni aggiornamento romperebbe la cache. */
export function testoPassiDopoCompattazione(stato) {
  const aperte = (stato?.voci ?? []).filter((v) => !FINITO.has(v.stato));
  if (!aperte.length) return '';
  const righe = ['Steps still open (your list before the summary):'];
  let lunghezza = righe[0].length;
  const riservati = 16;
  for (const [i, voce] of aperte.entries()) {
    const riga = `${SEGNI[voce.stato]} ${voce.testo}`;
    if (lunghezza + riga.length + 1 + riservati > TETTI_PASSI.dopoCompattazione) {
      righe.push(`+${aperte.length - i} more`);
      break;
    }
    righe.push(riga);
    lunghezza += riga.length + 1;
  }
  return righe.join('\n');
}

/** L'ultima lista del giornale, per ripartire dopo un riavvio. */
export function passiDaEventi(eventi) {
  for (let i = (eventi?.length ?? 0) - 1; i >= 0; i -= 1) {
    const e = eventi[i];
    if (e?.type === 'CUSTOM' && e.name === EVENTO_PASSI && Array.isArray(e.value?.voci)) return e.value;
  }
  return null;
}

/** Dove sta la lista durante un giro: il nucleo la scrive, il blocco dei fatti la legge. */
export function creaContenitorePassi(iniziale = null) {
  let stato = iniziale ?? statoPassiVuoto();
  return {
    leggi: () => stato,
    scrivi: (nuovo) => { stato = nuovo; },
    testoDopoCompattazione: () => testoPassiDopoCompattazione(stato),
  };
}
