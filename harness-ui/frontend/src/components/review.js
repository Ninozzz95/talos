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
 * per file e azioni per file (accetta/scarta) è un pattern diffuso fra gli
 * strumenti di editing assistito, con diff cliccabile nel pannello dedicato
 * di alcuni e non nell'estensione VS Code di altri. Il mockup è già a quel
 * livello; qui i numeri sono veri.
 *
 * ⭐ 17/09/2026, BC-63 — owner: «la scheda revisione deve avere lo stesso component tab di
 *   terminale (schede stile chrome)». Le linguette dei file non sono più il gruppo a pillole
 *   generico (`.talos-tabs__tab`) con la tastiera cablata a mano dentro `app.js`: sono il
 *   componente condiviso di `schede.js`, lo stesso che disegna il Terminale. Ciò che resta qui
 *   è ciò che è della Revisione — il nome del file, i contatori +A/−R, e le tre azioni del
 *   menu contestuale, che sono le uniche con un comportamento vero dietro.
 */

import { t } from './lingua.js';
import { accorciaPercorso, creaSchede } from './schede.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Il tetto di caratteri per l'etichetta di una linguetta quando nemmeno il nome del file basta. */
export const PERCORSO_SU_LINGUETTA = 34;

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

/**
 * ⭐⭐ BC-71 (b), 17/09/2026 — LO STESSO RIASSUNTO, PER LA TESTATA.
 *
 * Il terzo posto della testata porta SEMPRE la cartella e, dopo un separatore, il riassunto della
 * vista (regola del 06/09, `components/topbar.js`): a zero file non si aggiunge niente — «Nessuna
 * modifica in questa sessione» dentro uno slot monospazio da 11,5 px che si tronca non è una frase,
 * è un moncone.
 *
 * ⛔ Perché sta QUI e non in `app.js`: là c'era un secondo conteggio, `Number(v?.aggiunte || 0)`,
 *   che dava **zero** ogni volta che il server non aveva già contato le righe — cioè sempre, per una
 *   scrittura normale, dove il diff lo calcola il browser e la voce porta `code` e basta. Misurato
 *   sulla app viva prima della cura: due file scritti davvero, testata «2 file modificati», nessun
 *   `+` e nessun `−`. `contaDiff` sa già contare da `code`: una regola sola, non due.
 */
export function riassuntoReviewTestata(voci = []) {
  return voci.length === 0 ? '' : riassuntoReview(voci);
}

/**
 * ⭐⭐⭐ BC-80, 17/09/2026 — IL RIASSUNTO DOVE SI LEGGE DAVVERO.
 *
 * Nato dal «non curato» di BC-71 (b): dopo quella cura il riassunto era giusto — uno scrittore solo,
 * una regola di conteggio sola — e INVISIBILE. Misurato: la testata della Revisione è larga **748
 * px** a 1024×800 e non di più a 1440×900, e sotto i 900 px di contenitore `.talos-topbar__path` è
 * `display:none` (`index.css`). Un riassunto che nessuno vede è mezza cura.
 *
 * Decisione dell'owner (17/09, «approvo»): nella testata NON cede niente — titolo e azioni non hanno
 * un'altra porta. Il riassunto prende posto dentro il pannello della Revisione, in fondo alla riga
 * delle linguette, a destra, sempre visibile; la testata resta com'è.
 *
 * ⛔ Sta QUI e non in `components/schede.js`: quel componente è condiviso col Terminale, che non ha
 *   niente da riassumere, e una superficie non allarga un componente comune per un bisogno suo.
 * ⛔ E il testo esce da `riassuntoReviewTestata`: nessun secondo conteggio, nessuna seconda frase.
 *   È la stessa lezione di BC-71 (b), applicata prima di ripeterla.
 *
 * @param {HTMLElement|null} contenitore `.talos-review__schede`
 * @param {Array} voci i file scritti nella sessione
 */
export function aggiornaSommarioSchedeReview(contenitore, voci = []) {
  const nodo = contenitore?.querySelector('[data-review-sommario]');
  if (!nodo) return null;
  const testo = riassuntoReviewTestata(voci);
  nodo.textContent = testo;
  /* A zero file non si scrive niente: `hidden` invece di una stringa vuota, così la riga non tiene
     uno spazio per qualcosa che non c'è. */
  nodo.hidden = testo === '';
  nodo.title = testo;
  return testo;
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

/** L'id con cui una voce viaggia nel DOM e in `renderReviewFile` (invariato dal 05/09). */
export function chiaveFileReview(voce) {
  return `real:${voce.path}`;
}

/**
 * Il `title` di una linguetta: il percorso INTERO più il sottotitolo.
 * ⛔ Sulla linguetta c'è solo il NOME del file: il percorso completo deve restare raggiungibile da
 *    qualche parte, o mostrare il nome diventa una perdita di informazione invece di una scelta.
 */
export function suggerimentoFile(voce = {}) {
  return [voce.path, sottotitoloFile(voce)].filter(Boolean).join(' — ');
}

/**
 * Che cosa si scrive SULLA linguetta.
 *
 * ⛔ 17/09, trovato GUARDANDO UNA FOTO con dodici file (`artifacts/bc63/revisione-12-file-*.png`,
 *   primo giro): scrivendoci il percorso accorciato usciva «harness-ui/frontend/…schede.…» —
 *   `accorciaPercorso` tiene la RADICE, e con una radice di venti caratteri al nome del file
 *   restano le briciole. Cioè spariva proprio l'unica cosa che serve per scegliere una scheda.
 *
 * ⇒ Sulla linguetta va il NOME DEL FILE, come fanno gli editor a schede; il percorso intero sta
 *   nel `title` e nella testa del diff. La cartella madre si aggiunge SOLO quando due file
 *   scritti nella stessa sessione hanno lo stesso nome (`index.js` in due cartelle), perché lì il
 *   nome da solo non distingue niente — e se nemmeno quello basta si torna al percorso accorciato.
 */
export function etichettaFileReview(voce, tutte = [voce]) {
  const percorso = String(voce?.path ?? '');
  const pezzi = percorso.split('/').filter(Boolean);
  const nome = pezzi.at(-1) || percorso;
  const omonimi = tutte.filter((v) => v !== voce && String(v?.path ?? '').split('/').filter(Boolean).at(-1) === nome);
  if (omonimi.length === 0) return nome;
  const conCartella = pezzi.slice(-2).join('/');
  const ancoraOmonimi = omonimi.filter((v) => String(v?.path ?? '').split('/').filter(Boolean).slice(-2).join('/') === conCartella);
  return ancoraOmonimi.length === 0 ? conCartella : accorciaPercorso(percorso, PERCORSO_SU_LINGUETTA);
}

/**
 * Il contenuto di una SCHEDA di file (owner 05/09: «schede in alto e diff a piena larghezza
 * sotto, stile VS Code»): il nome del file in mono, +A e −R (−0 non si scrive).
 * Il sottotitolo (giro, ricevuta, simboli spariti) va nel `title` e nella testa del diff.
 */
export function riempiLinguettaFile(scheda, voce, tutte = [voce], documentObj = scheda.ownerDocument || globalThis.document) {
  scheda.append(el(documentObj, 'span', 'talos-mono', etichettaFileReview(voce, tutte)));
  const c = contaDiff(voce);
  scheda.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus', `+${c.aggiunte}`));
  if (c.rimozioni > 0) scheda.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus', `−${c.rimozioni}`));
  return scheda;
}

/**
 * Una SCHEDA di file da sola, fuori dal componente (resta per chi disegna un elenco statico).
 */
export function creaRigaFileReview(voce, { attiva = false, onApri, document: documentObj = globalThis.document } = {}) {
  const scheda = el(documentObj, 'button', 'talos-schede__tab talos-review__scheda');
  scheda.type = 'button';
  scheda.setAttribute('role', 'tab');
  scheda.setAttribute('aria-selected', String(Boolean(attiva)));
  scheda.tabIndex = attiva ? 0 : -1;
  scheda.dataset.reviewFile = chiaveFileReview(voce);
  scheda.title = suggerimentoFile(voce);
  riempiLinguettaFile(scheda, voce, [voce], documentObj);
  if (typeof onApri === 'function') scheda.addEventListener('click', onApri);
  return scheda;
}

/**
 * Le TESTI del menu contestuale della Revisione, in un posto solo (mai nomi tecnici a schermo).
 * ⛔ Sono tre e sono tutte VERE: «Apri il file» è lo stesso visualizzatore dell'albero Files
 *    (`apriFileAlbero`), le due copie passano da `copyText`. Non c'è «Chiudi le altre» perché
 *    nella Revisione una scheda NON si chiude: l'elenco è quello dei file scritti dalla sessione,
 *    e un comando che finge di toglierne uno sarebbe una funzione senza niente dietro.
 */
export const AZIONI_FILE = Object.freeze({
  apri: 'Apri il file',
  copiaPercorso: 'Copia il percorso',
  copiaDiff: 'Copia il diff di questo file',
});

/**
 * Le linguette dei file: lo STESSO componente del Terminale (`schede.js`), con il contenuto e le
 * azioni della Revisione.
 *
 * @param {HTMLElement} striscia `.talos-review__schede`
 * @param {object} opzioni
 * @param {{seleziona:Function, apri?:Function, puoAprire?:Function, copiaPercorso?:Function, copiaDiff?:Function}} opzioni.azioni
 */
export function creaSchedeReview(striscia, { azioni = {}, root = globalThis.document?.body } = {}) {
  return creaSchede(striscia, {
    root,
    chiave: 'reviewFile',
    classe: 'talos-schede__tab talos-review__scheda',
    idMenu: 'menuSchedaReview',
    etichettaMenu: 'Azioni sul file',
    scorre: true,
    identifica: chiaveFileReview,
    /* BC-68, 17/09: il DiffView è il pannello che la linguetta governa (uno solo, riusato). */
    controlla: () => 'pannelloRevisione',
    etichetta: etichettaFileReview,
    suggerimento: suggerimentoFile,
    contenuto: (scheda, voce, indice, tutte) => riempiLinguettaFile(scheda, voce, tutte),
    vociMenu: (voce) => [
      [t(AZIONI_FILE.apri), () => azioni.apri?.(voce), azioni.puoAprire ? Boolean(azioni.puoAprire(voce)) : true],
      [t(AZIONI_FILE.copiaPercorso), () => azioni.copiaPercorso?.(voce), true],
      [t(AZIONI_FILE.copiaDiff), () => azioni.copiaDiff?.(voce), (voce.code?.length ?? 0) > 0],
    ],
    azioni: { seleziona: (chiave) => azioni.seleziona?.(chiave) },
  });
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
    const giro = testa.querySelector('.talos-muted');
    if (giro) { giro.hidden = !Number.isFinite(voce.giro); if (Number.isFinite(voce.giro)) giro.textContent = `giro ${voce.giro}`; }
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
