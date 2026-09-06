/*
 * LA RIPARTIZIONE DELLA FINESTRA DI CONTESTO — decisione D26, e la stessa
 * misura che servirà a C5/C6 nella pagina Capability.
 *
 * Owner, D26: «Sezione Memoria e contesto con la ripartizione: quanto della
 * finestra prendono attrezzi, istruzioni e memoria PRIMA che tu scriva».
 * L'audit del 06/09 la dava ❌ assente.
 *
 * ⛔ Il numero NON è inventato qui: `/api/v1/tools` dichiara già
 * `tokenSchemaStimati` per ogni attrezzo (43 attrezzi, 7.454 token misurati su
 * questo server il 06/09). Questo modulo somma e divide, non stima.
 *
 * ⛔ E dichiara di essere una STIMA, come vuole H25: si pesa il testo dello
 * schema che il modello riceve, non i token che conterà il fornitore — due
 * tokenizzatori diversi danno due numeri diversi sullo stesso testo.
 *
 * Ricerca 06/09/2026 — perché questa misura merita una superficie:
 *  · Hermes Agent «Local Models» dichiara la finestra di contesto con cui un
 *    modello parte e fin dove può crescere («at least a 64K context window»):
 *    il contesto è un budget che si mostra, non un dettaglio interno;
 *  · la nostra lezione «L'APERTURA A GRADI» (11.483 → 505 token) dice che il
 *    costo degli attrezzi è la voce che cresce di nascosto: senza una riga che
 *    lo mostri, nessuno si accorge di quando raddoppia.
 */

/** Un totale leggibile: 7454 → «7.454». */
const NUM = new Intl.NumberFormat('it-IT');

/**
 * Somma i token di schema degli attrezzi, e conta quelli che non lo dichiarano.
 * ⛔ `senzaStima` non è un dettaglio: se dieci attrezzi su quarantatré non
 * dicono quanto pesano, il totale è di trentatré e va scritto.
 */
export function pesoAttrezzi(attrezzi = []) {
  let token = 0; let senzaStima = 0; const perCategoria = new Map();
  for (const a of attrezzi) {
    const v = Number(a?.tokenSchemaStimati);
    if (!Number.isFinite(v) || v < 0) { senzaStima += 1; continue; }
    token += v;
    const c = String(a?.categoria || 'altro');
    perCategoria.set(c, (perCategoria.get(c) || 0) + v);
  }
  return { token, senzaStima, contati: attrezzi.length - senzaStima, totale: attrezzi.length, perCategoria };
}

/**
 * La ripartizione della finestra. `finestra` è il contesto del modello scelto,
 * in token; `null` se non lo conosciamo.
 *
 * ⛔ Se la finestra non è dichiarata NON si sceglie un valore di comodo: si
 * torna `percentuale: null` e la superficie dirà «finestra non dichiarata».
 * Un 8% calcolato su una finestra inventata è peggio di nessun 8%.
 */
export function ripartizioneContesto({ attrezzi = [], finestra = null, istruzioniToken = null, memoriaToken = null } = {}) {
  const attr = pesoAttrezzi(attrezzi);
  /*
   * ⛔ Una voce che NON so misurare non entra nell'elenco: non ci entra come
   * zero. `Number(null)` vale 0 ed è finito, quindi il primo giro dal vivo
   * mostrava «Istruzioni di sistema · 0 token» — che si legge «le ho misurate e
   * pesano zero», mentre la verità è «non le ho misurate». Le istruzioni e i
   * ricordi li conosce il kernel, non questa pagina: finché non arrivano da lì,
   * la riga non si disegna.
   */
  const misurato = (v) => v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
  const voci = [{ id: 'attrezzi', nome: 'Attrezzi', token: attr.token, stima: true }];
  if (misurato(istruzioniToken)) voci.push({ id: 'istruzioni', nome: 'Istruzioni di sistema', token: Number(istruzioniToken), stima: true });
  if (misurato(memoriaToken)) voci.push({ id: 'memoria', nome: 'Ricordi', token: Number(memoriaToken), stima: true });
  const occupato = voci.reduce((s, v) => s + v.token, 0);
  const f = Number.isFinite(Number(finestra)) && Number(finestra) > 0 ? Number(finestra) : null;
  for (const v of voci) v.percentuale = f ? (v.token / f) * 100 : null;
  return {
    voci, occupato, finestra: f,
    // ⛔ le voci PROMESSE dal cappello della sezione che non si sono potute misurare: si dichiarano.
    mancanti: ['istruzioni', 'memoria'].filter((id) => !voci.some((v) => v.id === id)),
    percentuale: f ? (occupato / f) * 100 : null,
    libero: f ? Math.max(0, f - occupato) : null,
    attrezziSenzaStima: attr.senzaStima,
    attrezziContati: attr.contati,
    attrezziTotale: attr.totale,
  };
}

/** «7.454 token su 131.072 · 5,7% della finestra», o la verità quando manca la finestra. */
export function frasiRipartizione(r) {
  if (!r) return 'Misura non ancora eseguita.';
  const base = `${NUM.format(r.occupato)} token occupati prima che tu scriva`;
  const quota = r.percentuale == null
    ? ' · finestra del modello non dichiarata, la percentuale non si può calcolare'
    : ` su ${NUM.format(r.finestra)} · ${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(r.percentuale)}% della finestra, ${NUM.format(r.libero)} liberi`;
  const mancanti = r.attrezziSenzaStima ? ` · ⛔ ${r.attrezziSenzaStima} attrezzi su ${r.attrezziTotale} non dichiarano quanto pesano: non sono in questo totale` : '';
  return `${base}${quota}${mancanti} (stima)`;
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }

/** Disegna la barra, le voci e la riga di testo dentro il pannello «Memoria e contesto». */
export function aggiornaContesto(pannello, ripartizione, { document: d = globalThis.document } = {}) {
  if (!pannello) return null;
  const barra = pannello.querySelector('#contestoRipartizione');
  const etichetta = pannello.querySelector('#contestoEtichetta');
  const voci = pannello.querySelector('#contestoVoci');
  if (etichetta) etichetta.textContent = frasiRipartizione(ripartizione);
  if (barra) {
    /*
     * ⛔ Senza finestra dichiarata la barra si NASCONDE, non si svuota: una
     * barra senza scala mentirebbe sulla proporzione, e una barra vuota lasciata
     * a schermo (visto in una foto del 06/09) sembra un grafico rotto.
     */
    const senzaScala = !ripartizione || ripartizione.percentuale == null;
    barra.hidden = senzaScala;
    if (senzaScala) barra.replaceChildren();
    else {
      barra.replaceChildren(...ripartizione.voci.map((v) => {
        const f = el(d, 'span', `talos-contesto__fetta talos-contesto__fetta--${v.id}`);
        f.dataset.fetta = v.id;
        f.style.width = `${Math.max(0, Math.min(100, v.percentuale))}%`;
        return f;
      }));
    }
  }
  if (voci) {
    if (!ripartizione) { voci.replaceChildren(); return ripartizione; }
    voci.replaceChildren(...ripartizione.voci.map((v) => {
      const riga = el(d, 'div', 'talos-contesto-voce');
      const punto = el(d, 'span', `talos-contesto-voce__punto talos-contesto__fetta--${v.id}`);
      const valore = v.percentuale == null
        ? `${NUM.format(v.token)} token`
        : `${NUM.format(v.token)} token · ${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v.percentuale)}%`;
      riga.append(punto, el(d, 'span', 'talos-contesto-voce__k', v.nome), el(d, 'span', 'talos-contesto-voce__v', valore));
      return riga;
    }));
    /*
     * ⛔ Il cappello della sezione promette attrezzi, istruzioni di sistema e
     * ricordi. Oggi solo gli attrezzi si misurano da qui: gli altri due li
     * conosce il kernel. Se la promessa resta e le righe no, chi guarda cerca
     * due voci che non arriveranno mai — e la superficie diventa una di quelle
     * che «promettono a schermo qualcosa che non succede». Quindi si dice.
     */
    const mancanti = ripartizione.mancanti || [];
    if (mancanti.length) {
      const nomi = mancanti.map((id) => (id === 'istruzioni' ? 'le istruzioni di sistema' : 'i ricordi')).join(' e ');
      voci.appendChild(el(d, 'p', 'talos-muted talos-contesto-mancanti', `Per ora ${nomi} non ${mancanti.length > 1 ? 'sono' : 'è'} misurabil${mancanti.length > 1 ? 'i' : 'e'} da questa pagina: ${mancanti.length > 1 ? 'li conosce' : 'lo conosce'} il motore, e non ${mancanti.length > 1 ? 'sono' : 'è'} nel totale qui sopra.`));
    }
  }
  return ripartizione;
}
