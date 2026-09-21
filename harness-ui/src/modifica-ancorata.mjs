/*
 * ⛔⛔⛔ PO-12 — L'ATTREZZO DI MODIFICA. Owner, 09/09/2026: «oltre alle modifiche file da terminale,
 * dare al modello un tool di edit esattamente come Claude Code da CLI, e praticamente come fanno
 * tutti gli altri». Approvato il 10/09 al posto della via A di D3, per la ragione scritta più sotto.
 *
 * IL PROBLEMA, misurato nel nostro kernel: l'unico attrezzo di scrittura è `scrivi`, che si dichiara
 * al modello così, verbatim: «Writes one file of the workspace, **replacing it entirely**. Read it
 * first: the whole content is required.» Quindi per cambiare una riga in un file di 2.000 il modello
 * ne rigenera 2.000, in uscita, dove i token costano di più; e il resto del file passa dalla sua
 * memoria invece che dal disco.
 * ⛔ E c'è la seconda metà, che è la ragione per cui questo pezzo viene PRIMA della prenotazione dei
 *   file (D3-A): con una riscrittura totale, due sotto-agenti che toccano lo stesso file si
 *   cancellano a vicenda PER COSTRUZIONE. Con una modifica ancorata al testo, la seconda fallisce da
 *   sola — nessuna dichiarazione da chiedere al modello, nessuna buona volontà su cui contare.
 *
 * RICERCA 10/09/2026, prima di scrivere:
 *  · Claude Code, attrezzo `Edit` (repovive.com; gist dell'implementazione interna): `old_string`
 *    deve comparire **esattamente una volta**; se compare più volte l'edit è respinto come ambiguo.
 *    La ragione, verbatim: «an ambiguous match on a common string like "return null" could corrupt
 *    logic in the wrong function… rather than silently picking one occurrence… the tool refuses to
 *    apply an ambiguous edit and surfaces the ambiguity back».
 *  · Hermes Agent v0.21, `tools/fuzzy_match.py` (letto nel sorgente): stessa unicità, ma il rifiuto
 *    ELENCA le posizioni trovate — «Found N matches… Provide more context to make it unique, or use
 *    replace_all=True. Matches: …» — e il matching ha strati di tolleranza sugli spazi.
 *  · Codex, `codex-rs/apply-patch/src/seek_sequence.rs` (letto nel sorgente): ⛔ NON ha nessun
 *    controllo di ambiguità — `seek_sequence` restituisce la PRIMA occorrenza e si ferma. È il
 *    comportamento più pericoloso dei tre, ed è quello che qui non si imita.
 *  · morphllm.com, «Error Editing File» e arxiv 2603.05344 («Building Effective AI Coding Agents»):
 *    cambiare SOLO l'attrezzo di modifica — senza toccare modello né prompt — ha migliorato 15 LLM
 *    di 5-14 punti percentuali sui banchi di coding, fino a 10× sui modelli più deboli, con **~20%
 *    di token di uscita in meno** perché smettono di bruciare giri in ritentativi. E i sistemi che
 *    funzionano meglio convergono su: strati di corrispondenza con ripieghi, messaggi d'errore
 *    AZIONABILI, e indirizzamento che tollera gli spazi — «none of which Claude Code's Edit tool
 *    currently implements».
 *
 * ⇒ Il nostro +1, che nessuno dei tre ha per intero: unicità obbligatoria (come Claude Code), il
 *   rifiuto che dice DOVE sono le altre occorrenze (come Hermes), i ripieghi sugli spazi (come
 *   Hermes) ma con la STRATEGIA DICHIARATA nell'esito — chi legge sa se ha corrisposto il testo
 *   esatto o una sua versione tollerata — e mai, in nessun caso, la prima occorrenza in silenzio.
 */

/** Le strategie, dalla più severa alla più tollerante. Nessuna di esse indovina: tutte confrontano. */
const STRATEGIE = Object.freeze([
  { nome: 'esatta', descrizione: 'il testo combacia carattere per carattere', normalizza: (t) => t },
  {
    nome: 'spazi-in-coda',
    descrizione: 'combacia ignorando gli spazi a fine riga',
    normalizza: (t) => t.split('\n').map((r) => r.replace(/[ \t]+$/u, '')).join('\n'),
  },
  {
    nome: 'rientro',
    descrizione: 'combacia ignorando il rientro a inizio riga',
    normalizza: (t) => t.split('\n').map((r) => r.replace(/^[ \t]+/u, '').replace(/[ \t]+$/u, '')).join('\n'),
  },
]);

/** Riga e colonna (da 1) di un indice dentro il testo. Serve a DIRE dove, non solo quante. */
export function posizioneDi(testo, indice) {
  const prima = String(testo).slice(0, indice);
  const riga = prima.split('\n').length;
  const colonna = indice - (prima.lastIndexOf('\n') + 1) + 1;
  return { riga, colonna };
}

/** Tutte le occorrenze di `ago` in `pagliaio`, senza sovrapposizioni. */
function occorrenze(pagliaio, ago) {
  const trovate = [];
  if (!ago) return trovate;
  let da = 0;
  for (;;) {
    const i = pagliaio.indexOf(ago, da);
    if (i < 0) return trovate;
    trovate.push(i);
    da = i + ago.length;
  }
}

export class ModificaError extends Error {
  constructor(message, code, dettagli = {}) {
    super(message);
    this.name = 'ModificaError';
    this.code = code;
    Object.assign(this, dettagli);
  }
}

/**
 * Sostituisce `vecchio` con `nuovo` dentro `contenuto`.
 * @returns {{contenuto:string, strategia:string, occorrenze:number, riga:number}}
 * @throws {ModificaError} e non applica NIENTE: un file si tocca solo quando si sa dove.
 */
export function modificaAncorata(contenuto, vecchio, nuovo, { tutte = false } = {}) {
  const testo = String(contenuto ?? '');
  const cerca = String(vecchio ?? '');
  const metti = String(nuovo ?? '');

  if (cerca === '') {
    throw new ModificaError('Il testo da sostituire è vuoto: dimmi che cosa cercare.', 'MODIFICA_VUOTA');
  }
  if (cerca === metti) {
    throw new ModificaError('Il testo nuovo è identico a quello vecchio: non c\'è niente da cambiare.', 'MODIFICA_IDENTICA');
  }
  /*
   * ⛔ Solo spazi: combacerebbe ovunque, e «ovunque» non è un'ancora. Hermes rifiuta lo stesso caso
   *   («old_string is only whitespace»), e per la stessa ragione.
   */
  if (cerca.trim() === '') {
    throw new ModificaError('Il testo da sostituire è fatto solo di spazi: serve qualcosa che lo distingua.', 'MODIFICA_SOLO_SPAZI');
  }

  for (const strategia of STRATEGIE) {
    /*
     * ⛔ Una strategia che cambia la LUNGHEZZA del testo non può dire dove sostituire nell'originale:
     *   si cerca sul testo normalizzato solo per CONTARE, e si applica sull'originale solo quando la
     *   normalizzazione non ha spostato niente (cioè sulla strategia esatta o quando il file non ha
     *   spazi da normalizzare). È la stessa trappola delle citazioni elise del Context Engine.
     */
    const testoN = strategia.normalizza(testo);
    const cercaN = strategia.normalizza(cerca);
    if (cercaN === '') continue;
    const trovate = occorrenze(testoN, cercaN);
    if (trovate.length === 0) continue;

    if (trovate.length > 1 && !tutte) {
      const dove = trovate.slice(0, 5).map((i) => {
        const p = posizioneDi(testoN, i);
        return `riga ${p.riga}`;
      });
      throw new ModificaError(
        `Quel testo compare ${trovate.length} volte (${dove.join(', ')}${trovate.length > 5 ? ', e altre' : ''}): `
        + 'aggiungi qualche riga intorno per renderlo unico, oppure chiedi di sostituirle tutte.',
        'MODIFICA_AMBIGUA',
        { occorrenze: trovate.length, righe: trovate.map((i) => posizioneDi(testoN, i).riga) },
      );
    }
    /*
     * ⛔ `tutte` vale solo sulla corrispondenza ESATTA: sostituire ovunque basandosi su una
     *   somiglianza è il modo più veloce di rovinare un file in molti punti insieme. Stessa guardia
     *   di Hermes («replace_all only applies to exact matches»).
     */
    if (tutte && strategia.nome !== 'esatta') {
      throw new ModificaError(
        'Non trovo quel testo esatto, e «tutte le occorrenze» vale solo sul testo esatto: '
        + 'rileggi il file e copia il punto com\'è.',
        'MODIFICA_TUTTE_NON_ESATTA',
      );
    }
    if (strategia.nome !== 'esatta' && testoN.length !== testo.length) {
      throw new ModificaError(
        `Ho trovato quel testo ${strategia.descrizione}, ma il file ha spazi che spostano le posizioni: `
        + 'rileggilo e copia il punto com\'è, spazi compresi.',
        'MODIFICA_POSIZIONE_INCERTA',
        { strategia: strategia.nome },
      );
    }

    const indice = trovate[0];
    const risultato = tutte
      ? testo.split(cerca).join(metti)
      : testo.slice(0, indice) + metti + testo.slice(indice + cerca.length);
    return {
      contenuto: risultato,
      strategia: strategia.nome,
      occorrenze: tutte ? trovate.length : 1,
      riga: posizioneDi(testo, indice).riga,
    };
  }

  /*
   * ⛔ Non trovato: il messaggio deve essere AZIONABILE (la ricerca del 10/09 dice che è ciò che fa
   *   smettere i cicli di ritentativo). Si dice che cosa fare, non solo che è andata male.
   */
  throw new ModificaError(
    'Non trovo quel testo nel file: rileggilo e copia il punto esatto da cambiare, con qualche riga intorno.',
    'MODIFICA_NON_TROVATA',
  );
}
