/*
 * Review — l'elenco dei file scritti e il diff, come nel mockup.
 *
 * Settimo componente della Fase 2. Blocchi `ReviewPane`, `ReviewFileList`
 * (righe `talos-list-row`) e `DiffView` (testa, righe, piede). I dati sono le
 * voci di `state.realSession.reviewFiles` del monolite: per ogni percorso,
 * `code` = righe `[tipo, testo]` con tipo `add` | `del` | `ctx` (da
 * calcolaDiffRighe su prima/dopo dello StateDelta), `nuovo`, `simboliPersi`,
 * e — da questa fase — `giro` (il giro in cui è stato scritto).
 *
 * ⛔ Le ricevute firmate («Ricevuta a1f4…9c02») e Accetta/Scarta vogliono rotte
 * che il contratto congelato non ha: il badge si scrive solo se la voce porta
 * `ricevuta`, e i pulsanti `[data-richiede="fase3"]` restano nascosti finché
 * la rotta non esiste (mai un pulsante che non fa niente).
 *
 * Ricerca 05/09/2026: la review dell'agente come elenco di file con +/−, diff
 * per file e azioni per file (accetta/scarta) è il pattern di Copilot «Edits
 * Review» e di Cursor; Claude Code lo ha nel Code tab del desktop (+12 −1 con
 * diff cliccabile) e non nell'estensione VS Code (issue anthropics/claude-code
 * #33932). Il mockup è già a quel livello; qui i numeri sono veri.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

/** Righe aggiunte e tolte: dalla voce se il server le ha già contate, altrimenti da `code` ([tipo, testo]). */
export function contaDiff(voceOCode = []) {
  if (voceOCode && !Array.isArray(voceOCode) && Number.isFinite(voceOCode.aggiunte) && Number.isFinite(voceOCode.rimozioni)) {
    return { aggiunte: voceOCode.aggiunte, rimozioni: voceOCode.rimozioni };
  }
  const code = Array.isArray(voceOCode) ? voceOCode : (voceOCode?.code || []);
  let aggiunte = 0;
  let rimozioni = 0;
  for (const riga of code) {
    const tipo = Array.isArray(riga) ? riga[0] : riga?.tipo;
    if (tipo === 'add') aggiunte += 1;
    else if (tipo === 'del') rimozioni += 1;
  }
  return { aggiunte, rimozioni };
}

/** «3 file modificati · +112 −2», o «Nessuna modifica in questa sessione». */
export function riassuntoReview(voci = []) {
  if (voci.length === 0) return 'Nessuna modifica in questa sessione';
  let aggiunte = 0;
  let rimozioni = 0;
  for (const v of voci) { const c = contaDiff(v); aggiunte += c.aggiunte; rimozioni += c.rimozioni; }
  return `${voci.length} file modificat${voci.length === 1 ? 'o' : 'i'} · +${aggiunte} −${rimozioni}`;
}

/** Il sottotitolo di una riga: «giro 5 · scrittura con ricevuta a1f4…9c02», o «giro 5 · nuovo file». */
export function sottotitoloFile(voce = {}) {
  const pezzi = [];
  if (Number.isFinite(voce.giro)) pezzi.push(`giro ${voce.giro}`);
  if (voce.ricevuta) pezzi.push(`scrittura con ricevuta ${voce.ricevuta}`);
  else pezzi.push(voce.nuovo ? 'nuovo file' : 'file modificato');
  if (voce.simboliPersi?.length > 0) pezzi.push(`⚠ ${voce.simboliPersi.length} simbol${voce.simboliPersi.length === 1 ? 'o sparito' : 'i spariti'}`);
  return pezzi.join(' · ');
}

/** Una riga dell'elenco dei file. */
export function creaRigaFileReview(voce, { attiva = false, onApri, document: documentObj = globalThis.document } = {}) {
  const riga = el(documentObj, 'button', 'talos-list-row');
  riga.type = 'button';
  riga.setAttribute('aria-selected', String(Boolean(attiva)));
  riga.dataset.reviewFile = `real:${voce.path}`;
  const testo = el(documentObj, 'span', 'talos-list-row__text');
  testo.append(el(documentObj, 'span', 'talos-list-row__title talos-mono', voce.path), el(documentObj, 'span', 'talos-list-row__sub', sottotitoloFile(voce)));
  const aside = el(documentObj, 'span', 'talos-list-row__aside');
  const c = contaDiff(voce);
  aside.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus', `+${c.aggiunte}`));
  if (c.rimozioni > 0) aside.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus', `−${c.rimozioni}`)); // come nel mockup: «−0» non si scrive
  riga.append(testo, aside);
  if (typeof onApri === 'function') riga.addEventListener('click', onApri);
  return riga;
}

/** Riscrive il DiffView (testa, righe, avviso sui simboli) per la voce data; `null` = stato vuoto. */
export function aggiornaDiffReview(card, voce) {
  if (!card) return;
  const documentObj = card.ownerDocument;
  const testa = card.querySelector('.talos-review__diff-head');
  const diff = card.querySelector('.talos-diff');
  const avvisoVecchio = card.querySelector('.talos-review__avviso');
  if (avvisoVecchio) avvisoVecchio.remove();
  if (!voce) {
    if (testa) { testa.querySelector('.talos-truncate').textContent = '—'; for (const n of testa.querySelectorAll('.talos-badge, .talos-diff-num')) n.hidden = true; }
    if (diff) diff.replaceChildren(el(documentObj, 'div', 'talos-diff__line talos-diff__line--ctx', 'Nessun file scritto finora.'));
    return;
  }
  if (testa) {
    testa.querySelector('.talos-truncate').textContent = voce.path;
    const badge = testa.querySelector('.talos-badge');
    if (badge) { badge.hidden = !voce.ricevuta; if (voce.ricevuta) badge.textContent = `Ricevuta ${voce.ricevuta}`; }
    const c = contaDiff(voce);
    const piu = testa.querySelector('.talos-diff-num--plus');
    const meno = testa.querySelector('.talos-diff-num--minus');
    if (piu) { piu.hidden = false; piu.textContent = `+${c.aggiunte}`; }
    if (meno) { meno.hidden = c.rimozioni === 0; meno.textContent = `−${c.rimozioni}`; } // «−0» non si scrive
  }
  if (diff) {
    diff.replaceChildren(...(voce.code || []).map((riga) => {
      const tipo = Array.isArray(riga) ? riga[0] : riga?.tipo;
      const testo = Array.isArray(riga) ? riga[1] : riga?.testo;
      const classe = tipo === 'add' ? 'add' : tipo === 'del' ? 'del' : 'ctx';
      // il testo arriva già con il suo segno (e, dal monolite, col numero di riga): non si aggiunge niente
      return el(documentObj, 'div', `talos-diff__line talos-diff__line--${classe}`, testo ?? '');
    }));
  }
  if (voce.simboliPersi?.length > 0 && diff) {
    const avviso = el(documentObj, 'div', 'talos-system-note talos-review__avviso');
    avviso.setAttribute('data-c', 'SystemNote');
    avviso.append(el(documentObj, 'span', 'talos-badge talos-badge--warning talos-badge--sm', 'Attenzione'));
    const corpo = el(documentObj, 'div');
    corpo.append(el(documentObj, 'div', 'talos-system-note__title', `Questa riscrittura fa sparire ${voce.simboliPersi.length === 1 ? 'una funzione o classe' : `${voce.simboliPersi.length} funzioni o classi`} che c'erano prima`));
    corpo.append(el(documentObj, 'p', null, voce.simboliPersi.join(', ')));
    avviso.append(corpo);
    diff.before(avviso);
  }
}

/** Nasconde ciò che aspetta una rotta della Fase 3 (Accetta/Scarta/Apri nell'editor): mai un pulsante che non fa niente. */
export function nascondiAzioniFase3(radice) {
  for (const b of radice?.querySelectorAll('[data-richiede="fase3"]') || []) b.hidden = true;
}

export { SVG_NS };
