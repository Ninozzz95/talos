/**
 * ⭐⭐⭐ PO-11 — DAL DIFF INTERO AI PEZZI CHE SI LEGGONO.
 *
 * Owner, 09/09: «quando un file viene modificato non c'è il diff direttamente nella chat: bisogna
 * farlo come Claude e il resto dei competitor».
 *
 * ## Che cosa mancava davvero, e che cosa no
 *
 * Il calcolo c'era già: `calcolaDiffRighe` (LCS) in `legacy/app.js` produce `[tipo, testo]` per OGNI
 * riga del file, e alimenta la Review. Ma «ogni riga» non è una resa: su un file di 2.000 righe con
 * una modifica sola, mostrarle tutte significa nascondere la modifica dentro il file.
 *
 * ⇒ Questo modulo fa l'unica cosa che mancava: raggruppa le righe in **pezzi** attorno ai
 *   cambiamenti, con qualche riga di contesto intorno.
 *
 * ## Letto nel codice dei concorrenti (10/09/2026), non a memoria
 *
 * `cline/apps/cli/src/tui/utils/diff.ts` — LCS uguale al nostro, e sopra `makeUnifiedDiff(…, ctx = 3)`:
 *  · da una riga cambiata si torna indietro di `ctx` righe;
 *  · si continua finché due gruppi di cambiamenti sono separati da **al più `ctx * 2`** righe di
 *    contesto — sotto quella soglia conviene unirli, perché due pezzi separati da quattro righe
 *    uguali si leggono peggio di un pezzo solo;
 *  · si chiude con altre `ctx` righe.
 * Stesso `ctx = 3` in git e in ogni strumento guardato. Non è un numero nostro: è la convenzione che
 * chi legge un diff ha già negli occhi.
 *
 * ## ⛔ Quello che facciamo diverso, e perché
 *
 * L'intestazione di un pezzo NON è `@@ -2245,7 +2245,9 @@`. Quella è la sintassi di `git diff`, e la
 * regola dell'owner sui nomi tecnici nella UI vale anche qui: chi legge la chat vuole sapere **dove**
 * sta guardando, non in quale formato. Il pezzo porta i numeri di riga di partenza e arrivo, e chi
 * disegna decide come dirlo a parole.
 */

/** Quante righe uguali si mostrano attorno a un cambiamento. La convenzione di git e di tutti. */
export const CONTESTO_PREDEFINITO = 3;

/**
 * ⛔ Il tetto è sulle righe MOSTRATE, non sul file: un file enorme con tre modifiche piccole si
 *   mostra per intero (sono tre pezzi corti), mentre un file medio riscritto da capo si taglia. È la
 *   grandezza giusta da limitare, perché è quella che il lettore deve attraversare.
 */
export const TETTO_RIGHE_PREDEFINITO = 240;

/**
 * Raggruppa le righe di un diff nei pezzi che vale la pena mostrare.
 *
 * @param {Array<[string, string]>} righe — `['add'|'del'|'ctx', testo]`, l'uscita di `calcolaDiffRighe`
 * @param {{contesto?: number, tetto?: number}} [opzioni]
 * @returns {{pezzi: Array<{daRiga: number, aRiga: number, righe: Array<{tipo: string, testo: string, numero: number|null}>}>,
 *            aggiunte: number, rimozioni: number, righeNascoste: number, pezziNascosti: number, tagliato: boolean}}
 */
export function raggruppaInHunk(righe = [], { contesto = CONTESTO_PREDEFINITO, tetto = TETTO_RIGHE_PREDEFINITO } = {}) {
  const vuoto = { pezzi: [], aggiunte: 0, rimozioni: 0, righeNascoste: 0, pezziNascosti: 0, tagliato: false };
  if (!Array.isArray(righe) || righe.length === 0) return vuoto;

  const ctx = Number.isFinite(contesto) && contesto >= 0 ? Math.floor(contesto) : CONTESTO_PREDEFINITO;

  /*
   * I numeri di riga sono quelli del file DOPO la scrittura, e una riga tolta NON ne ha uno: non
   * esiste più in quel file. Stessa scelta già fatta in `formattaRigheConNumero` — un numero
   * inventato per una riga che non c'è sarebbe una bugia piccola e quotidiana.
   */
  const numeri = [];
  let corrente = 0;
  for (const [tipo] of righe) {
    if (tipo === 'del') numeri.push(null);
    else { corrente += 1; numeri.push(corrente); }
  }

  const aggiunte = righe.filter(([t]) => t === 'add').length;
  const rimozioni = righe.filter(([t]) => t === 'del').length;
  if (aggiunte === 0 && rimozioni === 0) return { ...vuoto, pezzi: [] };

  const pezzi = [];
  let i = 0;
  while (i < righe.length) {
    if (righe[i][0] === 'ctx') { i += 1; continue; }

    const inizio = Math.max(0, i - ctx);
    let fine = i;
    while (fine < righe.length) {
      if (righe[fine][0] !== 'ctx') { fine += 1; continue; }
      /* Quante righe uguali di fila? Se sono poche, i due gruppi stanno meglio insieme. */
      let prossimo = fine;
      while (prossimo < righe.length && righe[prossimo][0] === 'ctx') prossimo += 1;
      if (prossimo < righe.length && prossimo - fine <= ctx * 2) fine = prossimo + 1;
      else break;
    }
    const finePezzo = Math.min(righe.length, fine + ctx);

    const dentro = [];
    for (let k = inizio; k < finePezzo; k += 1) dentro.push({ tipo: righe[k][0], testo: righe[k][1], numero: numeri[k] });
    const conNumero = dentro.filter((r) => r.numero !== null);
    pezzi.push({
      daRiga: conNumero.length ? conNumero[0].numero : null,
      aRiga: conNumero.length ? conNumero[conNumero.length - 1].numero : null,
      righe: dentro,
    });
    i = finePezzo;
  }

  /*
   * ⛔ Il taglio si dichiara, e si dichiara CON I NUMERI: «altre 3 modifiche, 412 righe» dice al
   *   lettore che cosa non sta vedendo. Un taglio silenzioso è il modo più rapido di far credere che
   *   un file sia cambiato meno di quanto è cambiato.
   */
  const tettoValido = Number.isFinite(tetto) && tetto > 0 ? Math.floor(tetto) : TETTO_RIGHE_PREDEFINITO;
  let mostrate = 0;
  const tenuti = [];
  let nascoste = 0;
  for (const pezzo of pezzi) {
    if (mostrate + pezzo.righe.length <= tettoValido || tenuti.length === 0) {
      tenuti.push(pezzo);
      mostrate += pezzo.righe.length;
    } else nascoste += pezzo.righe.length;
  }
  return {
    pezzi: tenuti,
    aggiunte,
    rimozioni,
    righeNascoste: nascoste,
    pezziNascosti: pezzi.length - tenuti.length,
    tagliato: tenuti.length < pezzi.length,
  };
}
