/*
 * ⛔⛔ PO-30, fette 1-2 (18/09/2026) — CHE COSA HA FATTO UNA SESSIONE SUI FILE, letto dai suoi eventi.
 *
 * Il laboratorio dell'owner (PR #33) mostra, per ogni agente, i file coinvolti; e sulla riga di un file, chi lo sta
 * toccando. Nel laboratorio sono dati finti. Qui escono dagli eventi VERI che la sessione ha già emesso e che il registro
 * conserva: nessuno strato nuovo di raccolta, nessuna scrittura sul disco.
 *
 *  · una SCRITTURA è certa: è lo `StateDelta` con `path: '/file/<percorso>'` che il kernel emette dopo aver scritto davvero
 *    (`op: 'add'` = creato, altrimenti modificato);
 *  · una LETTURA è l'attrezzo `leggi` con il suo argomento `percorso`: gli argomenti arrivano a pezzi (`ToolCallArgs.delta`),
 *    si ricompongono per `toolCallId` e si leggono SOLO se sono JSON valido — un argomento a metà non è un percorso;
 *  · l'attrezzo «corrente» è l'ultimo `ToolCallStart` che non ha ancora il suo `ToolCallResult`.
 *
 * ⛔ Funzione PURA e con un tetto: una figlia che tocca migliaia di file non deve gonfiare la risposta della scheda Agenti.
 *   Oltre il tetto restano i più RECENTI, e `fileTagliati` dice quanti ne mancano: mai un elenco tagliato che sembra intero.
 * ⛔ I nomi degli attrezzi qui sotto sono quelli che riceve il MODELLO (contratto col kernel): si leggono, non si cambiano.
 */
export const ATTREZZI_CHE_LEGGONO = Object.freeze(['leggi']);
export const MASSIMO_FILE_PER_FIGLIA = 60;
export const MASSIMO_PASSI_PER_FIGLIA = 40;

/*
 * ⭐ 02/10/2026 — UN ACCUMULATORE, non un ricalcolo. Prima `riassuntoAttivitaSessione` rileggeva TUTTI gli eventi della sessione
 *   a ogni record della cronologia e a ogni rilettura delle figlie: O(n) per evento, O(n²) su una sessione lunga (misurato con il
 *   registro vero: 1,75 ms per giro all'inizio, 103 ms dopo 800 giri). Ora gli eventi si consumano UNA volta, in ordine, e il
 *   riassunto si legge quando serve. Il calcolo intero (`riassuntoAttivitaSessione`) passa dallo stesso accumulatore: una sola
 *   implementazione, quindi stesso risultato per costruzione.
 * ⛔ La semantica è quella di prima, esatta, anche nei casi strani (un id riusato, argomenti arrivati dopo l'esito, un secondo
 *   esito): gli argomenti restano accanto alla chiamata e si rileggono a ogni esito. Una versione che li liberava al primo esito
 *   dava risultati diversi su flussi con eventi tolti (prova di equivalenza su 2.000 flussi casuali, 02/10): scartata.
 */
export function creaAccumulatoreAttivita() {
  const file = new Map(); // percorso -> { percorso, letto, scritto, creato, ultimoOrdine }
  const chiamate = new Map(); // toolCallId -> { nome, argomenti, chiusa }
  let ordine = 0;
  let attrezzoCorrente = null;
  /* I PASSI: la linea del tempo della sezione «Eventi» del dettaglio. Compatta — che cosa, su che file, quando — e con un tetto:
     restano gli ultimi, e `passiTagliati` dice quanti ne mancano. Niente testo del modello, niente argomenti grezzi. */
  const passi = [];
  let passiTotali = 0;
  const aggiungiPasso = (passo) => { passiTotali += 1; passi.push(passo); if (passi.length > MASSIMO_PASSI_PER_FIGLIA) passi.shift(); };
  const quando = (evento) => (typeof evento?.at === 'string' ? evento.at : null);
  const tocca = (percorso, campi) => {
    if (typeof percorso !== 'string') return;
    const pulito = percorso.trim().replace(/\\/g, '/').replace(/^\.\//, '');
    if (pulito === '' || pulito.includes('\0') || pulito.length > 1024) return;
    const voce = file.get(pulito) ?? { percorso: pulito, letto: false, scritto: false, creato: false, ultimoOrdine: 0 };
    ordine += 1;
    file.set(pulito, { ...voce, ...campi, ultimoOrdine: ordine });
  };
  function aggiungi(evento) {
    if (!evento || typeof evento !== 'object') return;
    if (evento.type === 'ToolCallStart' && typeof evento.toolCallId === 'string') {
      chiamate.set(evento.toolCallId, { nome: String(evento.toolCallName ?? ''), argomenti: '', chiusa: false });
      attrezzoCorrente = evento.toolCallId;
    } else if (evento.type === 'ToolCallArgs' && chiamate.has(evento.toolCallId) && typeof evento.delta === 'string') {
      const chiamata = chiamate.get(evento.toolCallId);
      if (chiamata.argomenti.length < 64 * 1024) chiamata.argomenti += evento.delta;
    } else if (evento.type === 'ToolCallResult' && chiamate.has(evento.toolCallId)) {
      const chiamata = chiamate.get(evento.toolCallId);
      chiamata.chiusa = true;
      let argomenti = null;
      try { argomenti = JSON.parse(chiamata.argomenti); } catch { argomenti = null; }
      const bersaglio = typeof argomenti?.percorso === 'string' ? argomenti.percorso : (typeof argomenti?.path === 'string' ? argomenti.path : null);
      aggiungiPasso({ tipo: 'attrezzo', attrezzo: chiamata.nome, percorso: bersaglio ? bersaglio.trim().replace(/\\/g, '/').slice(0, 1024) : null, quando: quando(evento) });
      if (attrezzoCorrente === evento.toolCallId) attrezzoCorrente = null;
      if (ATTREZZI_CHE_LEGGONO.includes(chiamata.nome) && argomenti && typeof argomenti === 'object') tocca(argomenti.percorso ?? argomenti.path, { letto: true });
    } else if (evento.type === 'StateDelta' && Array.isArray(evento.delta)) {
      for (const operazione of evento.delta) {
        if (typeof operazione?.path !== 'string' || !operazione.path.startsWith('/file/')) continue;
        tocca(operazione.path.slice('/file/'.length), operazione.op === 'add' ? { scritto: true, creato: true } : { scritto: true });
      }
    } else if (evento.type === 'RunStarted') {
      aggiungiPasso({ tipo: 'avvio', attrezzo: null, percorso: null, quando: quando(evento) });
    } else if (evento.type === 'RunFinished' || evento.type === 'RunError') {
      aggiungiPasso({ tipo: evento.type === 'RunError' ? 'errore' : 'fine', attrezzo: null, percorso: null, quando: quando(evento) });
      attrezzoCorrente = null; // un giro chiuso non ha un attrezzo «in corso», nemmeno se l'esito non è mai arrivato
    }
  }
  function riassunto({ massimoFile = MASSIMO_FILE_PER_FIGLIA } = {}) {
    const tutti = [...file.values()].sort((a, b) => b.ultimoOrdine - a.ultimoOrdine);
    const tetto = Math.max(1, Number(massimoFile) || MASSIMO_FILE_PER_FIGLIA);
    return {
      file: tutti.slice(0, tetto).map(({ percorso, letto, scritto, creato }) => ({ percorso, letto, scritto, creato })),
      fileTagliati: Math.max(0, tutti.length - tetto),
      attrezzoCorrente: attrezzoCorrente ? (chiamate.get(attrezzoCorrente)?.nome || null) : null,
      chiamate: chiamate.size,
      passi: passi.slice(),
      passiTagliati: Math.max(0, passiTotali - MASSIMO_PASSI_PER_FIGLIA),
    };
  }
  /* I contatori senza gli elenchi: quello che un record della cronologia porta a ogni attrezzo (decisione owner 02/10). */
  function contatori() {
    return { compatta: true, chiamate: chiamate.size, numeroFile: file.size,
      attrezzoCorrente: attrezzoCorrente ? (chiamate.get(attrezzoCorrente)?.nome || null) : null,
      passi: passi.length ? [passi.at(-1)] : [], passiTagliati: Math.max(0, passiTotali - 1) };
  }
  return { aggiungi, riassunto, contatori };
}

export function riassuntoAttivitaSessione(eventi = [], opzioni = {}) {
  const accumulatore = creaAccumulatoreAttivita();
  for (const evento of Array.isArray(eventi) ? eventi : []) accumulatore.aggiungi(evento);
  return accumulatore.riassunto(opzioni);
}

/*
 * L'accumulatore di una sessione viva, tenuto accanto alla sua voce (WeakMap: muore con lei, non entra in nessun JSON). Consuma
 * solo gli eventi nuovi; se `voce.eventi` è stato SOSTITUITO (togliere un messaggio crea un array nuovo) o accorciato, riparte
 * da capo. Nessuno modifica `voce.eventi` sul posto: si aggiunge in coda o si sostituisce (verificato il 02/10 con una ricerca
 * di splice/shift/pop/assegnazioni per indice in `src/`).
 */
const accumulatoriPerVoce = new WeakMap();
function accumulatoreDellaVoce(voce) {
  const eventi = Array.isArray(voce?.eventi) ? voce.eventi : [];
  let stato = accumulatoriPerVoce.get(voce);
  if (!stato || stato.eventi !== eventi || stato.consumati > eventi.length) {
    stato = { eventi, consumati: 0, accumulatore: creaAccumulatoreAttivita() };
    if (voce && typeof voce === 'object') accumulatoriPerVoce.set(voce, stato);
  }
  for (; stato.consumati < eventi.length; stato.consumati += 1) stato.accumulatore.aggiungi(eventi[stato.consumati]);
  return stato.accumulatore;
}
export function attivitaDellaVoce(voce, opzioni = {}) { return accumulatoreDellaVoce(voce).riassunto(opzioni); }
export function contatoriAttivitaDellaVoce(voce) { return accumulatoreDellaVoce(voce).contatori(); }
