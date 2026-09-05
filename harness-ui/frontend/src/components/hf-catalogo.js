/*
 * Catalogo Hugging Face — la scheda «Hugging Face» del Model Lab nel linguaggio
 * del mockup (`#panel-hf`): righe dei repository (`ListRow`), dettaglio
 * (`DetailPanel`) con licenza e revisione, «Tutti i file», la scelta del file
 * (`talos-choice`, radiogroup: una voce per variante GGUF con dimensione e stima),
 * il callout per i repository con accesso richiesto, la stima e «Scarica sul computer».
 *
 * 06/09, B6.9 (coda di Astra, fatta da Claude). I dati sono quelli del monolite:
 * `/api/v1/huggingface/search` (repo, downloads, likes, gated, author, license,
 * pipelineTag), il dettaglio (files[{path,sizeBytes,sha256}], revision, readme,
 * images) e la stima per variante di `/api/v1/local-models/fit-estimate`
 * (state compatible · tight · blocked · unknown, memory.{requiredBytes,availableBytes}).
 *
 * Ricerca 06/09/2026: Hub API (huggingface.co/docs/hub/api) — search, author,
 * sort=downloads|likes|created|updated con direction -1; i repository «gated»
 * richiedono l'accesso con account (callout, non un download che fallisce).
 */
import { gb } from './modelli-installati.js';

const numero = new Intl.NumberFormat('it-IT');
export function conteggio(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  if (v >= 1_000_000) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1_000_000)} M`;
  if (v >= 1_000) return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(v / 1_000)} k`;
  return numero.format(v);
}

/** Le varianti: i file `-00001-of-00003.gguf` di uno stesso set stanno insieme. */
export function gruppiVarianti(files = []) {
  const gruppi = new Map();
  for (const f of files) {
    if (!/\.gguf$/i.test(f.path || '')) continue;
    const chiave = f.path.replace(/-\d{5}-of-\d{5}(?=\.gguf$)/iu, '');
    const g = gruppi.get(chiave) || []; g.push(f); gruppi.set(chiave, g);
  }
  return [...gruppi.entries()].map(([chiave, items]) => {
    items.sort((a, b) => a.path.localeCompare(b.path));
    const bytes = items.reduce((s, f) => s + Number(f.sizeBytes || 0), 0);
    const attesi = items[0].path.match(/-\d{5}-of-(\d{5})\.gguf$/iu)?.[1];
    return { chiave, file: items, bytes, incompleto: Boolean(attesi && Number(attesi) !== items.length), attesi: attesi ? Number(attesi) : items.length, senzaHash: items.some((f) => !f.sha256), quant: quantDaNome(items[0].path) };
  });
}
export function quantDaNome(percorso = '') {
  const nome = String(percorso).split('/').pop() || '';
  const m = nome.match(/[._-](I?Q\d[A-Z0-9_]*|F16|BF16|F32)(?=[._-]|\.gguf$)/i);
  return m ? m[1].toUpperCase() : nome.replace(/\.gguf$/i, '');
}

/** La stima di una variante in parole del mockup: «~8,1 GB di memoria · entra». */
export function descriviStima(stima, bytes) {
  if (!stima) return { testo: bytes ? `${gb(bytes)} da scaricare · non ancora misurato` : 'non ancora misurato', tono: '' };
  if (stima.inCorso) return { testo: 'Misuro su questo PC…', tono: '' };
  const richiesti = Number.isFinite(stima.memory?.requiredBytes) ? stima.memory.requiredBytes : bytes;
  const liberi = stima.memory?.availableBytes;
  if (stima.state === 'compatible') return { testo: `~${gb(richiesti)} di memoria · entra`, tono: 'success' };
  if (stima.state === 'tight') return { testo: `~${gb(richiesti)} di memoria · al limite`, tono: 'warning' };
  if (stima.state === 'blocked' && stima.reason === 'storage') return { testo: `${gb(bytes)} · non c'è spazio sul disco`, tono: 'danger' };
  if (stima.state === 'blocked') return { testo: `~${gb(richiesti)} · oltre la memoria allocabile`, tono: 'danger', liberi };
  return { testo: 'non misurabile su questa macchina', tono: '' };
}

const TIPI = { 'text-generation': 'Conversazione e codice', 'text2text-generation': 'Testo', 'image-text-to-text': 'Immagini e testo', 'automatic-speech-recognition': 'Voce', 'feature-extraction': 'Embedding' };

/** Cosa dice una riga di risultato. */
export function datiRepoHf(item = {}) {
  const [autore, nome] = String(item.repo || item.id || '').split('/');
  const conversione = Boolean(item.communityConversion) || /gguf$/i.test(autore || '') || /^(bartowski|unsloth|mradermacher|lmstudio-community|TheBloke|QuantFactory)$/i.test(autore || '');
  const fileGguf = Number.isFinite(item.ggufFiles) ? item.ggufFiles : null;
  const tipo = conversione ? 'Conversione della community' : (TIPI[item.pipelineTag] || 'Modello'); // chi ha convertito conta più del tipo: la licenza e la responsabilità sono sue
  const sub1 = `${tipo}${fileGguf != null ? ` · ${fileGguf === 1 ? '1 file' : `${fileGguf} file`}${conversione ? '' : ' compatibili'}` : ''}`;
  const sub2 = item.gated ? 'Verifica le condizioni prima del download' : (item.license ? `Licenza ${item.license}` : 'Licenza non dichiarata');
  return {
    id: item.repo || item.id, titolo: `${autore} / ${nome || ''}`.trim(), autore, match: String(item.repo || '').toLowerCase(),
    sub1, sub2,
    badge: item.gated ? { testo: 'Accesso richiesto', tono: 'warning' } : (conversione ? null : { testo: 'Autore del modello', tono: 'info' }),
    download: conteggio(item.downloads), likes: conteggio(item.likes), gated: Boolean(item.gated),
  };
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function icona(d, nome, classe = 'i') { const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true'); const use = d.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${nome}`); svg.appendChild(use); return svg; }
function badge(d, testo, tono) { const b = el(d, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo); b.dataset.c = 'Badge'; return b; }

export function creaRigaHf(dati, { selezionato = false, seleziona, document: d = globalThis.document } = {}) {
  const b = el(d, 'button', 'talos-list-row'); b.type = 'button'; b.dataset.c = 'ListRow'; b.dataset.hf = dati.id; b.dataset.author = dati.autore; b.setAttribute('aria-pressed', String(Boolean(selezionato)));
  const ic = el(d, 'span', 'talos-list-row__icon'); ic.appendChild(icona(d, 'i-files'));
  const testo = el(d, 'span', 'talos-list-row__text');
  const sub = el(d, 'span', 'talos-list-row__sub', dati.sub1); sub.appendChild(d.createElement('br')); sub.appendChild(d.createTextNode(dati.sub2));
  testo.append(el(d, 'span', 'talos-list-row__title', dati.titolo), sub);
  const aside = el(d, 'span', 'talos-list-row__aside'); if (dati.badge) aside.appendChild(badge(d, dati.badge.testo, dati.badge.tono));
  b.append(ic, testo, aside);
  if (typeof seleziona === 'function') b.addEventListener('click', () => seleziona(dati.id));
  return b;
}

/**
 * Il dettaglio del repository scelto. `stima` = Map chiaveVariante → esito (o { inCorso }).
 * `azioni` = { scarica(gruppo), misura(gruppi), tuttiFile(detail), scheda(detail), apri(detail) }.
 */
export function aggiornaDettaglioHf(aside, detail, { stima = new Map(), scelta = null, azioni = {}, document: d = globalThis.document } = {}) {
  if (!aside) return null;
  aside.replaceChildren();
  if (!detail) { aside.hidden = true; return null; }
  aside.hidden = false;
  const [autore, nome] = String(detail.repo || '').split('/');
  const h = el(d, 'h3', '', (nome || detail.repo || '').replace(/-GGUF$/i, '').replace(/-/g, ' ')); h.id = 'hfNome';
  const p = el(d, 'p', 'talos-detail__desc', `Pubblicato da ${autore || 'autore non dichiarato'} · formato GGUF`); p.id = 'hfAutore';
  const kv = (k, v, id) => { const r = el(d, 'div', 'talos-kv'); const val = el(d, 'span', 'talos-kv__v'); if (id) { const s = el(d, 'span', '', v); s.id = id; val.appendChild(s); } else val.textContent = v; r.append(el(d, 'span', 'talos-kv__k', k), val); return r; };
  const revisione = detail.revision ? `${String(detail.revision).slice(0, 12)} · verificata` : 'Da verificare prima del download';
  aside.append(h, p, kv('Licenza', detail.license || 'Non dichiarata', 'hfLicenza'), kv('Revisione', revisione), el(d, 'hr', 'talos-lab__rule'));
  const tutti = el(d, 'button', 'talos-button talos-button--secondary', 'Tutti i file'); tutti.id = 'hfTuttiFile'; tutti.type = 'button'; tutti.dataset.apreVelo = 'veloFileModello';
  if (azioni.tuttiFile) tutti.addEventListener('click', () => azioni.tuttiFile(detail));
  aside.append(tutti, el(d, 'h3', '', 'Scegli il file'));
  const gruppi = gruppiVarianti(detail.files);
  const scelto = gruppi.find((g) => g.chiave === scelta) || gruppi[0] || null;
  const radio = el(d, 'div', 'talos-stack'); radio.id = 'hfFileChoices'; radio.setAttribute('role', 'radiogroup'); radio.setAttribute('aria-label', 'File da scaricare');
  gruppi.forEach((g, i) => {
    const b = el(d, 'button', 'talos-choice'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(g === scelto)); b.dataset.hfFile = String(i); b.dataset.variante = g.chiave;
    const st = descriviStima(stima.get?.(g.chiave), g.bytes);
    b.append(el(d, 'span', 'talos-choice__title', `${g.quant} · ${gb(g.bytes)}${g.incompleto ? ` · set incompleto ${g.file.length}/${g.attesi}` : ''}`), el(d, 'span', 'talos-muted', g.senzaHash ? 'impronta sha256 assente: non si scarica' : st.testo));
    if (azioni.scegli) b.addEventListener('click', () => azioni.scegli(g.chiave));
    radio.appendChild(b);
  });
  if (!gruppi.length) radio.appendChild(el(d, 'p', 'talos-muted', 'Nessun file GGUF in questo repository.'));
  aside.appendChild(radio);
  const callout = el(d, 'div', 'talos-callout'); callout.id = 'hfAccesso'; callout.dataset.c = 'Callout'; callout.hidden = !detail.gated;
  const cb = el(d, 'div'); cb.append(el(d, 'b', '', "Serve l'accesso al repository"), el(d, 'p', '', 'Apri la pagina del modello, verifica le condizioni e richiedi accesso con il tuo account.')); callout.appendChild(cb);
  aside.appendChild(callout);
  const stimaP = el(d, 'p', 'talos-muted talos-lab__space'); stimaP.id = 'hfStima';
  const voce = scelto ? stima.get?.(scelto.chiave) : null;
  if (scelto && voce && !voce.inCorso && Number.isFinite(voce.memory?.requiredBytes)) {
    const m = el(d, 'span', 'talos-measure talos-measure--estimate', gb(voce.memory.requiredBytes)); m.dataset.c = 'Measure';
    stimaP.append(m, d.createTextNode(` necessari${Number.isFinite(voce.memory?.availableBytes) ? ` · ${gb(voce.memory.availableBytes)} allocabili liberando il modello attuale.` : '.'}`));
  } else stimaP.textContent = scelto ? (voce?.inCorso ? 'Misuro su questo PC…' : 'La misura pesa i file contro memoria e disco liberi adesso; la cache del contesto si somma dopo lo scaricamento.') : '';
  aside.appendChild(stimaP);
  const misura = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', voce && !voce.inCorso ? 'Rimisura su questo PC' : 'Misura su questo PC'); misura.type = 'button'; misura.dataset.c = 'Button'; misura.dataset.azione = 'misura'; misura.disabled = !gruppi.length || Boolean(voce?.inCorso);
  if (azioni.misura) misura.addEventListener('click', () => azioni.misura(gruppi));
  aside.appendChild(misura);
  const scarica = el(d, 'button', 'talos-button talos-button--primary talos-button--block'); scarica.id = 'hfScarica'; scarica.type = 'button'; scarica.dataset.action = 'download';
  scarica.textContent = scelto ? `Scarica sul computer · ${gb(scelto.bytes)}` : 'Scegli un file da scaricare';
  scarica.disabled = !scelto || scelto.incompleto || scelto.senzaHash || Boolean(detail.gated);
  if (azioni.scarica) scarica.addEventListener('click', () => scelto && azioni.scarica(scelto, detail));
  aside.appendChild(scarica);
  const scheda = el(d, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Leggi la scheda del modello'); scheda.type = 'button'; scheda.dataset.c = 'Button'; scheda.dataset.azione = 'scheda'; scheda.setAttribute('aria-expanded', 'false'); scheda.setAttribute('aria-controls', 'hfScheda');
  // stopPropagation: il pulsante ha aria-controls e la regia dei disclosure lo commuterebbe una seconda volta nello stesso clic
  if (azioni.scheda) scheda.addEventListener('click', (event) => { event.stopPropagation(); azioni.scheda(detail, scheda); });
  aside.appendChild(scheda);
  const cont = el(d, 'div', 'talos-card talos-card--pad talos-lab__space'); cont.id = 'hfScheda'; cont.hidden = true; aside.appendChild(cont);
  return scelto;
}

/** Riscrive lista, stato vuoto, «Carica altri» e dettaglio. Torna l'id scelto. */
export function aggiornaHf(panel, risultati = [], { selezionato = null, detail = null, stima, scelta, errore = null, caricamento = false, altri = false, seleziona, azioni = {}, document: d = globalThis.document } = {}) {
  if (!panel) return null;
  const lista = panel.querySelector('[data-hf-lista], #listaHf, #modelLabHfResults');
  const vuoto = panel.querySelector('[data-c="EmptyState"]');
  const bottoneAltri = panel.querySelector('#altriHf, #modelLabHfNextButtonControl');
  const aside = panel.querySelector('[data-c="DetailPanel"]');
  panel.setAttribute('aria-busy', String(Boolean(caricamento)));
  if (!lista) return null;
  const scelto = risultati.find((r) => (r.repo || r.id) === selezionato) || risultati[0] || null;
  if (errore) {
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', `Ricerca non disponibile: ${errore.message || errore}`)); if (vuoto) vuoto.hidden = true;
  } else if (caricamento && !risultati.length) {
    lista.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', 'Ricerca in corso…')); if (vuoto) vuoto.hidden = true;
  } else if (!risultati.length) {
    lista.replaceChildren(); if (vuoto) vuoto.hidden = false;
  } else {
    lista.replaceChildren(...risultati.flatMap((r) => [d.createTextNode('\n'), creaRigaHf(datiRepoHf(r), { selezionato: r === scelto, seleziona, document: d })]), d.createTextNode('\n'));
    if (vuoto) vuoto.hidden = true;
  }
  if (bottoneAltri) bottoneAltri.hidden = !altri;
  // senza risultati non resta un dettaglio di un repository che non è più in lista
  aggiornaDettaglioHf(aside, risultati.length ? detail : null, { stima, scelta, azioni, document: d });
  return scelto ? (scelto.repo || scelto.id) : null;
}

/** Sposta il pannello del mockup in `#modelLabHfPanel` con gli id che il monolite ascolta. */
export function montaHf(originale, canonico) {
  if (!originale || !canonico || originale.dataset.hfMontato) return;
  originale.replaceChildren(...canonico.children);
  originale.dataset.hfMontato = 'true';
  const ids = { cercaHf: 'modelLabHfSearch', autoreHf: 'modelLabHfAuthorControl', ordineHf: 'modelLabHfSortControl', tagHf: 'modelLabHfFiltersControl', listaHf: 'modelLabHfResults', altriHf: 'modelLabHfNextButtonControl' };
  for (const [prima, dopo] of Object.entries(ids)) {
    const n = originale.querySelector(`#${prima}`); if (!n) continue;
    for (const label of originale.querySelectorAll(`label[for="${prima}"]`)) label.htmlFor = dopo;
    n.id = dopo;
  }
  const lista = originale.querySelector('#modelLabHfResults'); if (lista) { lista.dataset.hfLista = ''; lista.replaceChildren(); }
  const aside = originale.querySelector('[data-c="DetailPanel"]'); if (aside) { aside.id = 'modelLabHfDetail'; aside.replaceChildren(); aside.hidden = true; }
  const altri = originale.querySelector('#modelLabHfNextButtonControl'); if (altri) altri.hidden = true;
}
