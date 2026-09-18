/*
 * Modelli installati — la scheda «Installati» del Model Lab nel linguaggio del
 * mockup (`#panel-installati`): riga per modello (`ListRow`), dettaglio
 * (`DetailPanel`), ricerca e filtro di stato, riga della memoria, verdetto «Entra».
 *
 * 06/09, B6.8: i dati sono quelli
 * del monolite — manifest di `/api/v1/local-models` (+ `name`), il motore locale
 * (cosa è caricato, RAM) e `state.modelLab.fit` (Map id → { esito } con
 * `memory.requiredBytes/availableBytes` come li scrive `local-runtime-probe.mjs`).
 * Le parole sono quelle del mockup, i numeri in it-IT con la virgola.
 *
 * Ricerca 06/09/2026: LM Studio «My Models» distingue modelli sul disco da modelli
 * caricati in memoria e li carica/scarica dalla stessa lista (lmstudio.ai/docs/cli,
 * datacamp LM Studio tutorial); qui lo stato è un badge per riga e un filtro.
 */

const GB = 1024 ** 3;
const numero = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
/** «5,2 GB» come nel mockup (GB decimali di 1024³, una cifra). */
export function gb(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${numero.format(n / GB)} GB`;
}
export function contestoK(token) {
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= 1_000_000 ? `${numero.format(n / 1_000_000)}M token` : `${Math.round(n / 1024)}k token`;
}

export const STATI_INSTALLATO = Object.freeze({
  caricato: { etichetta: 'Caricato', tono: 'accent' },
  disco: { etichetta: 'Sul disco', tono: '' },
  incompleto: { etichetta: 'Incompleto', tono: 'warning' },
  guasto: { etichetta: 'Non riuscito', tono: 'danger' },
});

/** Il verdetto «Entra», dall'esito del server. `null` se non ancora verificato. */
export function verdettoEntra(fit, runtime = {}) {
  const esito = fit?.esito;
  if (fit?.inCorso) return { chiave: 'attesa', etichetta: 'Verifica in corso…', tono: '', dettaglio: '' };
  if (fit?.errore) return { chiave: 'errore', etichetta: 'Verifica non riuscita', tono: 'danger', dettaglio: String(fit.errore) };
  if (!esito) return null;
  const richiesti = esito.memory?.requiredBytes;
  const disponibili = Number.isFinite(esito.memory?.availableBytes) ? esito.memory.availableBytes : runtime.allocabiliBytes;
  const ok = esito.state === 'compatible';
  if (ok && Number.isFinite(richiesti) && Number.isFinite(disponibili) && richiesti / disponibili >= 0.9) {
    return { chiave: 'stretto', etichetta: 'Entra stretto', tono: 'warning', dettaglio: `~${gb(richiesti)} richiesti su ${gb(disponibili)} allocabili` };
  }
  if (ok) return { chiave: 'entra', etichetta: 'Entra', tono: 'success', dettaglio: Number.isFinite(richiesti) ? `~${gb(richiesti)} di memoria con contesto ${contestoK(runtime.contestoStimaToken || 8192)}` : '' };
  if (esito.state === 'unknown') return { chiave: 'ignoto', etichetta: 'Non verificato', tono: '', dettaglio: 'Il server non ha potuto stimare la memoria.' };
  const mancano = Number.isFinite(richiesti) && Number.isFinite(disponibili) && richiesti > disponibili ? `: mancano ~${gb(richiesti - disponibili)}` : '';
  return { chiave: 'non-entra', etichetta: 'Non entra', tono: 'danger', dettaglio: Number.isFinite(richiesti) ? `~${gb(richiesti)} richiesti${mancano}` : '' };
}

function quantizzazione(percorso = '') {
  const m = String(percorso).match(/[._-](I?Q\d[A-Z0-9_]*|F16|BF16|F32)(?=[._-]|\.gguf$)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Tutto ciò che la riga e il dettaglio devono dire di un modello. */
export function datiModelloInstallato(modello = {}, { runtime = {}, fit = null } = {}) {
  const caricato = runtime.caricato && runtime.caricato === modello.id;
  const stato = caricato ? 'caricato' : modello.state === 'incomplete' ? 'incompleto' : modello.state === 'failed' ? 'guasto' : 'disco';
  const contesto = contestoK(modello.contextLength);
  const verdetto = verdettoEntra(fit, runtime);
  const q = quantizzazione(modello.files?.[0]?.path) || quantizzazione(modello.path); // il nome del FILE porta la quantizzazione; `path` può essere la cartella
  return {
    id: modello.id,
    nome: modello.name || modello.id || 'Modello',
    match: `${modello.name || ''} ${modello.id || ''} ${modello.repo || ''}`.toLowerCase().trim(),
    stato, etichettaStato: STATI_INSTALLATO[stato].etichetta, tonoStato: STATI_INSTALLATO[stato].tono,
    sotto: `${gb(modello.bytes)} sul disco${contesto ? ` · contesto massimo ${contesto}` : ''}`,
    sottoDue: verdetto?.dettaglio || '',
    verdetto,
    formato: q ? `GGUF · ${q}` : 'GGUF',
    dimensione: gb(modello.bytes),
    origine: modello.repo === 'local-upload' ? 'Importato dal computer' : 'Hugging Face',
    licenza: modello.license || 'Licenza non dichiarata',
    percorso: modello.path || '',
    caricato: Boolean(caricato),
  };
}

export function filtraInstallati(modelli = [], { query = '', stato = 'tutti', runtime = {} } = {}) {
  const q = String(query).trim().toLowerCase();
  return modelli.filter((m) => {
    const caricato = runtime.caricato && runtime.caricato === m.id;
    if (stato === 'caricato' && !caricato) return false;
    if (stato === 'disco' && caricato) return false;
    if (!q) return true;
    return [m.name, m.id, m.repo].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

function el(documentObj, tag, classe, testo) {
  const n = documentObj.createElement(tag);
  if (classe) n.className = classe;
  if (testo != null) n.textContent = testo;
  return n;
}
function icona(documentObj, nome, classe = 'i') {
  const svg = documentObj.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true');
  const use = documentObj.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`); svg.appendChild(use);
  return svg;
}
function badge(documentObj, testo, tono) {
  const b = el(documentObj, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo);
  b.dataset.c = 'Badge';
  return b;
}

/** La riga della lista, esattamente come nel mockup. */
export function creaRigaInstallata(dati, { selezionato = false, seleziona, document: documentObj = globalThis.document } = {}) {
  const b = el(documentObj, 'button', 'talos-list-row');
  b.type = 'button'; b.dataset.c = 'ListRow'; b.dataset.model = dati.id; b.dataset.match = dati.match; b.dataset.installedState = dati.stato;
  b.setAttribute('aria-pressed', String(Boolean(selezionato)));
  const ic = el(documentObj, 'span', 'talos-list-row__icon'); ic.appendChild(icona(documentObj, 'i-bolt'));
  const testo = el(documentObj, 'span', 'talos-list-row__text');
  const sub = el(documentObj, 'span', 'talos-list-row__sub', dati.sotto);
  if (dati.sottoDue) { sub.appendChild(documentObj.createElement('br')); sub.appendChild(documentObj.createTextNode(dati.sottoDue)); }
  testo.append(el(documentObj, 'span', 'talos-list-row__title', dati.nome), sub);
  const aside = el(documentObj, 'span', 'talos-list-row__aside');
  if (dati.stato === 'caricato' || dati.stato === 'incompleto' || dati.stato === 'guasto') aside.appendChild(badge(documentObj, dati.etichettaStato, dati.tonoStato));
  if (dati.verdetto) aside.appendChild(badge(documentObj, dati.verdetto.etichetta, dati.verdetto.tono));
  b.append(ic, testo, aside);
  if (typeof seleziona === 'function') b.addEventListener('click', () => seleziona(dati.id));
  return b;
}

/**
 * Il dettaglio (`DetailPanel` del mockup). `azioni` = { libera, verifica, rinomina, copia, elimina };
 * `nodoFit` (facoltativo) è il verdetto esteso del monolite, appeso sotto l'azione principale.
 */
export function aggiornaDettaglioInstallato(aside, dati, { runtime = {}, azioni = {}, nodoFit = null, document: documentObj = globalThis.document } = {}) {
  if (!aside) return;
  aside.replaceChildren();
  if (!dati) { aside.hidden = true; return; }
  aside.hidden = false;
  const stato = el(documentObj, 'span'); stato.id = 'modelloStato';
  stato.appendChild(badge(documentObj, dati.caricato ? 'In uso nella chat' : dati.etichettaStato, dati.caricato ? 'accent' : dati.tonoStato));
  const nome = el(documentObj, 'h3', '', dati.nome); nome.id = 'modelloNome';
  const desc = el(documentObj, 'p', 'talos-detail__desc', 'Modello locale per conversazione e codice.'); desc.id = 'modelloDescrizione';
  const kv = (k, v, id) => { const r = el(documentObj, 'div', 'talos-kv'); const val = el(documentObj, 'span', 'talos-kv__v'); if (id) { const s = el(documentObj, 'span', '', v); s.id = id; val.appendChild(s); } else val.textContent = v; r.append(el(documentObj, 'span', 'talos-kv__k', k), val); return r; };
  aside.append(stato, nome, desc, kv('Formato', dati.formato), kv('File sul disco', dati.dimensione, 'modelloDimensione'), kv('Origine', dati.origine), kv('Licenza', dati.licenza, 'modelloLicenza'), el(documentObj, 'hr', 'talos-lab__rule'));
  aside.append(kv('Contesto della stima', contestoK(runtime.contestoStimaToken || 8192) || '8k token'), el(documentObj, 'p', 'talos-muted talos-lab__space', 'Stima con le impostazioni del motore attuale.'));
  const stima = el(documentObj, 'div', 'talos-lab__space');
  if (dati.verdetto) {
    stima.appendChild(badge(documentObj, dati.verdetto.etichetta, dati.verdetto.tono));
    stima.appendChild(documentObj.createTextNode(' '));
    const s = el(documentObj, 'span'); s.id = 'modelloStima';
    const richiesti = dati.verdetto.dettaglio.match(/~([\d.,]+ GB)/)?.[1];
    if (richiesti) { const m = el(documentObj, 'span', 'talos-measure talos-measure--estimate', richiesti); m.dataset.c = 'Measure'; s.append(m, documentObj.createTextNode(' richiesti')); } else s.textContent = dati.verdetto.dettaglio;
    stima.appendChild(s);
  } else {
    stima.appendChild(el(documentObj, 'span', 'talos-muted', 'Non ancora verificato su questa macchina.'));
  }
  aside.appendChild(stima);
  const azione = el(documentObj, 'button', 'talos-button talos-button--secondary talos-button--block'); azione.id = 'azioneModello'; azione.type = 'button';
  if (dati.caricato) { azione.dataset.action = 'memoria'; azione.textContent = 'Libera memoria'; if (azioni.libera) azione.addEventListener('click', () => azioni.libera(dati.id)); }
  else { azione.dataset.action = 'verifica'; azione.dataset.verifyFit = dati.id; azione.textContent = 'Verifica compatibilità'; if (azioni.verifica) azione.addEventListener('click', () => azioni.verifica(dati.id)); }
  aside.appendChild(azione);
  const effetto = el(documentObj, 'p', 'talos-muted talos-lab__space'); effetto.id = 'modelloEffetto';
  effetto.textContent = dati.caricato && Number.isFinite(runtime.usatiDalModelloBytes)
    ? `Libera ${gb(runtime.usatiDalModelloBytes)}. Conserva il file da ${dati.dimensione} sul disco.`
    : `Il file da ${dati.dimensione} resta sul disco finché non lo elimini.`;
  aside.appendChild(effetto);
  if (nodoFit) aside.appendChild(nodoFit);
  const cluster = el(documentObj, 'div', 'talos-cluster talos-lab__space');
  const pulsante = (testo, classe, nome, fn) => { const b = el(documentObj, 'button', classe, testo); b.type = 'button'; b.dataset.c = 'Button'; b.dataset.azione = nome; if (fn) b.addEventListener('click', () => fn(dati.id)); return b; };
  cluster.append(
    pulsante('Rinomina', 'talos-button talos-button--ghost talos-button--sm', 'rinomina', azioni.rinomina),
    pulsante('Copia percorso', 'talos-button talos-button--ghost talos-button--sm', 'copia', azioni.copia),
    pulsante('Elimina dal disco', 'talos-button talos-button--danger talos-button--sm', 'elimina', azioni.elimina),
  );
  aside.appendChild(cluster);
}

/**
 * Riscrive il pannello: riga della memoria, placeholder della ricerca, lista, stato vuoto, dettaglio.
 * Torna l'id selezionato (o null).
 */
export function aggiornaInstallati(panel, modelli = [], opzioni = {}) {
  if (!panel) return null;
  const { query = '', stato = 'tutti', selezionato = null, runtime = {}, fit = new Map(), errore = null, caricamento = false, seleziona, azioni = {}, nodoFit, document: documentObj = globalThis.document } = opzioni;
  const lista = panel.querySelector('[data-installati-lista], #listaInstallati, #modelLabInstalledList');
  const vuoto = panel.querySelector('[data-c="EmptyState"]');
  const dettaglio = panel.querySelector('[data-c="DetailPanel"]');
  const cerca = panel.querySelector('input[type="search"]');
  const memoria = panel.querySelector('[data-installati-memoria]') || panel.querySelector('.talos-toolbar strong')?.parentElement;
  if (cerca) cerca.placeholder = `Cerca nei ${modelli.length} modelli installati…`;
  if (memoria) {
    const testi = memoria.querySelectorAll('strong, span:not(.talos-grow)');
    if (testi[0]) testi[0].textContent = Number.isFinite(runtime.ramTotaleBytes) ? `Questo computer · ${Math.round(runtime.ramTotaleBytes / GB)} GB di RAM` : 'Questo computer · RAM non misurata';
    if (testi[1]) testi[1].textContent = Number.isFinite(runtime.usatiDalModelloBytes) && runtime.caricato ? `${gb(runtime.usatiDalModelloBytes)} usati dal modello` : 'Nessun modello in memoria';
    if (testi[2]) testi[2].textContent = Number.isFinite(runtime.liberiBytes) ? `${gb(runtime.liberiBytes)} liberi` : 'RAM libera non misurata';
  }
  panel.setAttribute('aria-busy', String(Boolean(caricamento)));
  if (!lista) return null;
  if (errore) {
    lista.replaceChildren(el(documentObj, 'p', 'talos-card--pad talos-muted', `Modelli locali non disponibili: ${errore.message || errore}`));
    if (vuoto) vuoto.hidden = true;
    aggiornaDettaglioInstallato(dettaglio, null, { document: documentObj });
    return null;
  }
  const visibili = filtraInstallati(modelli, { query, stato, runtime });
  const scelto = visibili.find((m) => m.id === selezionato) || visibili[0] || null;
  // gli a-capo fra le righe sono quelli del sorgente del mockup: le PAROLE del cancello li vedono come spazi
  lista.replaceChildren(...visibili.flatMap((m) => [documentObj.createTextNode('\n'), creaRigaInstallata(datiModelloInstallato(m, { runtime, fit: fit.get?.(m.id) || null }), { selezionato: scelto?.id === m.id, seleziona, document: documentObj })]), documentObj.createTextNode('\n'));
  if (visibili.length === 0) {
    if (caricamento) lista.replaceChildren(el(documentObj, 'p', 'talos-card--pad talos-muted', 'Lettura dei modelli sul disco…'));
    else if (modelli.length === 0) lista.replaceChildren(el(documentObj, 'p', 'talos-card--pad talos-muted', 'Nessun modello sul computer: importa un .gguf o scaricane uno da Hugging Face.'));
    if (vuoto) vuoto.hidden = !(modelli.length > 0 && !caricamento);
  } else if (vuoto) vuoto.hidden = true;
  aggiornaDettaglioInstallato(dettaglio, scelto ? datiModelloInstallato(scelto, { runtime, fit: fit.get?.(scelto.id) || null }) : null, { runtime, azioni, nodoFit: scelto && nodoFit ? nodoFit(scelto.id) : null, document: documentObj });
  return scelto?.id || null;
}

/**
 * Sposta il pannello del mockup dentro quello del monolite (stesso schema di
 * `montaCatalogoModelli`), rinominando i controlli con gli id che il monolite ascolta
 * (ricerca, importazione, lista) e aggiungendo progresso e annulla dell'importazione.
 *
 * ⛔ 18/09/2026 — IL TRAVASO REGGE ENTRAMBE LE DIREZIONI (corsia 3, il travaso neutro). Chi arriva
 * in `originale` può essere il markup CANONICO (come oggi: il mockup scende in Impostazioni) oppure
 * quello LEGACY (destinazione invertita: il laboratorio sale sulla schermata), e il secondo porta
 * GIÀ gli id che il monolite ascolta. ⇒ Gli id si rinominano solo se sono ancora quelli canonici, e
 * ogni nodo che manca si salta invece di far esplodere il montaggio.
 * ⛔ E il timbro di montaggio va su ENTRAMBE le radici: `ensureModelLabControls` (app.js) guarda
 * `dataset.installatiMontato` sul pannello che è stato SVUOTATO, e senza il timbro la sua
 * `insertBefore(controls, $('#modelLabInstalledList'))` esplode con `NotFoundError` — il nodo di
 * riferimento ora vive nell'altro pannello. È il crollo n. 3 del 18/09, riprodotto nella prova
 * `tests/browser/lab-montaggio-neutro.spec.mjs`.
 * Fonti consultate il 18/09/2026: MDN `Node.insertBefore` (`NotFoundError`: «the node before which
 * the new node is to be inserted is not a child of this node»); prassi del timbro `data-*`
 * controllato prima di scrivere, con l'elemento come perimetro.
 */
export function montaInstallati(originale, canonico, { document: documentObj = globalThis.document } = {}) {
  if (!originale || !canonico || originale.dataset.installatiMontato) return;
  originale.replaceChildren(...canonico.children);
  originale.dataset.installatiMontato = 'true';
  canonico.dataset.installatiMontato = 'true';
  const ids = { cercaInstallati: 'modelLabInstalledSearchControl', importaGguf: 'modelLabImportButton', fileGguf: 'modelLabImportInput', esitoImportazione: 'modelLabImportStatus', listaInstallati: 'modelLabInstalledList', filtroInstallati: 'modelLabInstalledStateFilter' };
  for (const [prima, dopo] of Object.entries(ids)) {
    const n = originale.querySelector(`#${prima}`) || originale.querySelector(`#${dopo}`); if (!n) continue;
    if (n.id !== prima) continue; // id già quello che il monolite ascolta: non c'è niente da rinominare
    for (const label of originale.querySelectorAll(`label[for="${prima}"]`)) label.htmlFor = dopo;
    n.id = dopo;
  }
  const lista = originale.querySelector('#modelLabInstalledList') || originale.querySelector('#listaInstallati'); if (lista) { lista.dataset.installatiLista = ''; lista.replaceChildren(); }
  const memoria = originale.querySelector('.talos-toolbar strong')?.parentElement; if (memoria) memoria.dataset.installatiMemoria = '';
  const esito = originale.querySelector('#modelLabImportStatus') || originale.querySelector('#esitoImportazione');
  if (esito && !originale.querySelector('#modelLabImportProgress')) {
    const progress = documentObj.createElement('progress'); progress.id = 'modelLabImportProgress'; progress.max = 100; progress.value = 0; progress.hidden = true; progress.className = 'talos-lab__meter';
    const annulla = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Annulla'); annulla.type = 'button'; annulla.id = 'modelLabImportCancelButton'; annulla.hidden = true;
    esito.after(progress, annulla);
  }
  aggiornaDettaglioInstallato(originale.querySelector('[data-c="DetailPanel"]') || originale.querySelector('#dettaglioInstallato'), null, { document: documentObj });
}
