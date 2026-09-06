/*
 * Le note: quello che TALOS ha annotato mentre lavorava.
 *
 * ⛔ 06/9, prova T14 — «Note» era una voce di menu con un contatore VIVO («Note 1», e la nota c'era
 * davvero sul disco, in `.notes-store/`) e NESSUNA pagina dietro: il clic finiva nella chat. Un
 * contatore che promette un luogo che non esiste è peggio di una voce assente, perché ti fa cercare
 * qualcosa che non c'è. La decisione C24 vuole Note e Attività separati: questa è la casa delle note.
 *
 * Forma presa da Granola (letta 06/09/2026, «the human always owns the document rather than the
 * agent»): la nota è un documento di chi la legge — l'agente la scrive, tu la cerchi, la copi e te
 * la porti via. Niente stati, niente flussi: appunti.
 */

/** Un titolo che non c'è non diventa «(senza titolo)»: diventa la prima riga del testo. */
export function titoloNota(nota) {
  const t = String(nota?.titolo ?? '').trim();
  if (t) return t;
  const prima = String(nota?.contenuto ?? '').split('\n').map((r) => r.trim()).find(Boolean);
  return prima ? prima.slice(0, 80) : 'Nota senza titolo';
}

/** «oggi 14:32», «ieri 09:10», poi la data: i tempi relativi valgono fino a 24 ore (decisione H26). */
export function quandoNota(quando, adesso = new Date()) {
  // ⛔ `new Date(null)` è il 1970, non «nessuna data»: senza questa guardia una nota senza data
  //    diceva «01/01 01:00» come se fosse vera. Misurato dalla prova, non previsto.
  if (quando === null || quando === undefined || quando === '') return '';
  const d = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(d.getTime())) return '';
  const ore = (adesso.getTime() - d.getTime()) / 3_600_000;
  const orario = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (ore < 0) return orario;
  if (ore < 24 && d.getDate() === adesso.getDate()) return `oggi ${orario}`;
  if (ore < 48) return `ieri ${orario}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${orario}`;
}

/** Il filtro della ricerca: titolo e testo, senza distinzione fra maiuscole e accenti mancanti. */
export function filtraNote(note, cerca) {
  const q = String(cerca ?? '').trim().toLowerCase();
  const lista = Array.isArray(note) ? note : [];
  if (!q) return lista;
  return lista.filter((n) => `${n?.titolo ?? ''} ${n?.contenuto ?? ''}`.toLowerCase().includes(q));
}

/** «2 note» / «1 nota» / «nessuna nota» — il plurale italiano non si costruisce con una `s`. */
export function sommarioNote(quante) {
  const n = Number(quante) || 0;
  if (n === 0) return 'nessuna nota';
  return n === 1 ? '1 nota' : `${n} note`;
}

/**
 * Disegna l'elenco. Nessuna innerHTML: il testo di una nota lo scrive un modello.
 * @param {HTMLElement} schermo lo `#schermoNote`
 * @param {Array} note dal server
 * @param {{cerca?:string, onCopia?:Function, adesso?:Date}} [opzioni]
 * @returns {number} quante ne sono state disegnate
 */
export function montaNote(schermo, note, { cerca = '', onCopia = null, adesso = new Date() } = {}) {
  if (!schermo) return 0;
  const d = schermo.ownerDocument || globalThis.document;
  const lista = schermo.querySelector('#elencoNote');
  const vuoto = schermo.querySelector('#noteVuote');
  const stato = schermo.querySelector('[data-note-stato]');
  const sommario = schermo.querySelector('[data-note-sommario]');
  const filtrate = filtraNote(note, cerca);
  if (stato) stato.textContent = cerca ? `${sommarioNote(filtrate.length)} su ${sommarioNote(Array.isArray(note) ? note.length : 0)}` : sommarioNote(filtrate.length);
  if (sommario) sommario.textContent = sommarioNote(Array.isArray(note) ? note.length : 0);
  if (!lista) return filtrate.length;
  lista.replaceChildren();
  for (const nota of filtrate) {
    const li = d.createElement('li');
    li.className = 'talos-note';
    const testa = d.createElement('div');
    testa.className = 'talos-note__testa';
    const titolo = d.createElement('span');
    titolo.className = 'talos-note__titolo';
    titolo.textContent = titoloNota(nota);
    const quando = d.createElement('span');
    quando.className = 'talos-note__quando';
    // ⛔ Il disco scrive `aggiornataAlle`/`creataAlle` (notes-store.mjs), e l'elenco è ordinato per la
    //    prima: la data che si legge deve essere quella per cui la nota sta in quel posto.
    quando.textContent = quandoNota(nota?.aggiornataAlle ?? nota?.quando ?? nota?.creataAlle ?? nota?.createdAt, adesso);
    testa.append(titolo, quando);
    const corpo = d.createElement('p');
    corpo.className = 'talos-note__corpo';
    corpo.textContent = String(nota?.contenuto ?? '');
    li.append(testa, corpo);
    if (typeof onCopia === 'function') {
      const azioni = d.createElement('div');
      azioni.className = 'talos-note__azioni';
      const copia = d.createElement('button');
      copia.type = 'button';
      copia.className = 'talos-button talos-button--ghost talos-button--sm';
      copia.textContent = 'Copia';
      copia.addEventListener('click', () => onCopia(nota));
      azioni.append(copia);
      li.append(azioni);
    }
    lista.append(li);
  }
  if (vuoto) vuoto.hidden = filtrate.length > 0;
  return filtrate.length;
}
