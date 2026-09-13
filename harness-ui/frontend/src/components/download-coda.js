/*
 * Coda dei download — la scheda «Download» del Model Lab nel linguaggio del mockup
 * (`#panel-download`): conteggi per stato, «Mostra solo attivi», una `DownloadRow` per
 * trasferimento con barra, misure (percento · ricevuti di totali · velocità · rimanente),
 * Pausa/Riprendi/Annulla, scheda d'errore con Riprova e Dettagli, riga «Completato» con
 * «Vedi modello».
 *
 * 06/09, B6.10. I dati sono gli stati di
 * `/api/v1/huggingface/downloads` (`hf-direct-transfer.mjs status()`: id, state
 * queued · running · verifying · paused · failed · ready · cancelled, progress, bytes,
 * totalBytes, reason, startedAt) più il manifest del download (repo, files). Velocità e
 * tempo rimanente li stima il chiamante fra due letture successive: il server non li dà,
 * e un numero inventato non si scrive.
 *
 * Ricerca 06/09/2026: gli stati utili di una coda sono queued · running · paused ·
 * failed · verifying · finished, con motivo del fallimento e «riprova» per singola voce;
 * dopo il download il file si verifica (sha256) prima di dichiararlo pronto
 * (AB Download Manager 2026, Vortex download management, Continuata docs).
 */
import { gb } from './modelli-installati.js';

export const STATI_DOWNLOAD = Object.freeze({
  queued: { etichetta: 'In coda', tono: '', attivo: true },
  running: { etichetta: 'In corso', tono: 'accent', attivo: true },
  verifying: { etichetta: 'Verifica del file', tono: 'accent', attivo: true },
  paused: { etichetta: 'In pausa', tono: 'warning', attivo: true },
  failed: { etichetta: 'Fallito', tono: 'danger', attivo: true },
  ready: { etichetta: 'Completato', tono: 'success', attivo: false },
  cancelled: { etichetta: 'Annullato', tono: '', attivo: false },
});

const MOTIVI = Object.freeze({
  PAUSED_BY_OWNER: 'Messo in pausa da te',
  NETWORK: 'La connessione si è interrotta',
  HASH_MISMATCH: "L'impronta del file non corrisponde",
  DISK_FULL: 'Spazio sul disco esaurito',
  HTTP_ERROR: 'Il server di Hugging Face ha risposto con un errore',
  CANCELLED: 'Annullato',
});
export function motivoUmano(reason) {
  if (!reason) return 'La connessione si è interrotta';
  const chiave = String(reason).toUpperCase().replace(/[^A-Z_]/g, '_');
  for (const [k, v] of Object.entries(MOTIVI)) if (chiave.includes(k)) return v;
  return String(reason);
}

export function mbs(bytesAlSecondo) {
  const v = Number(bytesAlSecondo);
  if (!Number.isFinite(v) || v <= 0) return null;
  const mb = v / (1024 * 1024);
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB/s`;
}
export function rimanente(secondi) {
  const s = Number(secondi);
  if (!Number.isFinite(s) || s < 0) return null;
  if (s < 60) return 'meno di 1 min';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}
export function oraBreve(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Cosa dice una riga: nome del file, sottotitolo, stato, misure. `stima` = { bytesAlSecondo, secondiRimanenti }. */
export function datiDownload(item = {}, { stima = null } = {}) {
  const stato = STATI_DOWNLOAD[item.state] || { etichetta: String(item.state || 'sconosciuto'), tono: '', attivo: true };
  const file = item.request?.files?.[0]?.path || item.file || item.id;
  const nomeFile = String(file).split('/').pop();
  const repo = item.request?.repo || item.repo || '';
  const totale = Number.isFinite(item.totalBytes) ? item.totalBytes : (item.request?.bytes ?? item.bytes);
  const ricevuti = Number.isFinite(item.bytes) ? item.bytes : 0;
  const percento = Number.isFinite(item.progress) ? Math.max(0, Math.min(100, Math.round(item.progress))) : (totale ? Math.round((ricevuti / totale) * 100) : 0);
  const velocita = mbs(stima?.bytesAlSecondo);
  const resto = rimanente(stima?.secondiRimanenti);
  return {
    id: item.id, nomeFile, stato: item.state, etichettaStato: stato.etichetta, tono: stato.tono, attivo: stato.attivo,
    sotto: item.state === 'ready'
      ? `${gb(totale)} · completato${item.finishedAt ? ` alle ${oraBreve(item.finishedAt)}` : ''} · verifica del file riuscita`
      : `${repo ? `${repo.replace('/', ' / ')} · ` : ''}${item.state === 'failed' ? gb(totale) : 'Hugging Face'}`,
    percento, ricevuti: gb(ricevuti), totale: gb(totale), velocita, resto,
    errore: item.state === 'failed' ? { titolo: motivoUmano(item.reason), testo: `Ricevuti ${gb(ricevuti)}. Il modello non è ancora disponibile. Puoi riprovare dal punto salvato.`, dettagli: [item.reason, item.startedAt ? `avviato alle ${oraBreve(item.startedAt)}` : '', `ultimo blocco salvato: ${gb(ricevuti)}`].filter(Boolean).join(' · ') } : null,
  };
}

export function contaStati(items = []) {
  const c = { inCorso: 0, falliti: 0, completati: 0, inPausa: 0 };
  for (const i of items) { if (['queued', 'running', 'verifying'].includes(i.state)) c.inCorso += 1; else if (i.state === 'failed') c.falliti += 1; else if (i.state === 'ready') c.completati += 1; else if (i.state === 'paused') c.inPausa += 1; }
  return c;
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function badge(d, testo, tono) { const b = el(d, 'span', `talos-badge talos-badge--sm${tono ? ` talos-badge--${tono}` : ''}`, testo); b.dataset.c = 'Badge'; return b; }
function bottone(d, testo, classe, azione, fn) { const b = el(d, 'button', classe, testo); b.type = 'button'; b.dataset.c = 'Button'; b.dataset.action = azione; if (fn) b.addEventListener('click', fn); return b; }

/** La riga, esattamente come nel mockup (tre forme: in corso · fallito · completato). */
export function creaRigaDownload(dati, { azioni = {}, document: d = globalThis.document } = {}) {
  const art = el(d, 'article', 'talos-lab__download'); art.dataset.c = 'DownloadRow'; art.dataset.downloadId = dati.id; art.dataset.state = dati.stato;
  const testa = el(d, 'div', 'talos-toolbar');
  const titoli = el(d, 'div'); titoli.append(el(d, 'h3', 'talos-lab__heading', dati.nomeFile), el(d, 'p', 'talos-muted', dati.sotto));
  const statoWrap = el(d, 'span'); statoWrap.appendChild(badge(d, dati.etichettaStato, dati.tono));
  testa.append(titoli, dati.stato === 'ready' ? badge(d, dati.etichettaStato, dati.tono) : statoWrap);
  art.appendChild(testa);
  if (dati.stato === 'ready') {
    const piede = el(d, 'div', 'talos-toolbar');
    piede.append(el(d, 'span', 'talos-muted', 'Disponibile nei modelli installati.'), bottone(d, 'Vedi modello', 'talos-button talos-button--secondary talos-button--sm', 'vediModello', () => azioni.vediModello?.(dati.id)));
    art.appendChild(piede);
    return art;
  }
  if (dati.stato === 'failed') {
    const card = el(d, 'div', 'talos-check-card talos-check-card--danger talos-lab__space');
    card.appendChild(el(d, 'span', 'talos-check-card__stripe'));
    const corpo = el(d, 'div', 'talos-check-card__body');
    corpo.append(el(d, 'b', '', dati.errore.titolo), el(d, 'p', '', dati.errore.testo));
    const az = el(d, 'div', 'talos-check-card__actions');
    const dettagli = bottone(d, 'Dettagli', 'talos-button talos-button--ghost talos-button--sm', 'dettagli', null); dettagli.title = dati.errore.dettagli; dettagli.setAttribute('aria-label', `Dettagli: ${dati.errore.dettagli}`);
    dettagli.addEventListener('click', () => { const p = corpo.querySelector('[data-dettagli]'); if (p) { p.hidden = !p.hidden; return; } const n = el(d, 'p', 'talos-muted', dati.errore.dettagli); n.dataset.dettagli = ''; corpo.insertBefore(n, az); });
    az.append(bottone(d, 'Riprova', 'talos-button talos-button--secondary talos-button--sm', 'riprovaDownload', () => azioni.riprendi?.(dati.id)), dettagli);
    if (azioni.annulla) az.appendChild(bottone(d, 'Annulla', 'talos-button talos-button--ghost talos-button--sm', 'annulla', () => azioni.annulla(dati.id)));
    corpo.appendChild(az); card.appendChild(corpo); art.appendChild(card);
    return art;
  }
  const barra = el(d, 'progress', 'talos-lab__meter', `${dati.percento}%`); barra.max = 100; barra.value = dati.percento; barra.setAttribute('aria-label', `Download ${dati.nomeFile} · ${dati.percento} per cento`);
  art.appendChild(barra);
  const piede = el(d, 'div', 'talos-toolbar');
  const misure = el(d, 'span', 'talos-muted');
  misure.append(el(d, 'strong', '', `${dati.percento}%`), d.createTextNode(` · ${dati.ricevuti.replace(' GB', '')} di ${dati.totale}`));
  if (dati.velocita) misure.append(d.createTextNode(` · ${dati.velocita}`));
  if (dati.resto) { misure.append(d.createTextNode(' · ')); const m = el(d, 'span', 'talos-measure talos-measure--estimate', dati.resto); m.dataset.c = 'Measure'; misure.append(m, d.createTextNode(' rimasti')); }
  else if (dati.stato === 'verifying') misure.append(d.createTextNode(' · verifica dell\'impronta in corso'));
  else if (dati.stato === 'paused') misure.append(d.createTextNode(' · in pausa'));
  const cluster = el(d, 'div', 'talos-cluster');
  if (['queued', 'running'].includes(dati.stato)) cluster.appendChild(bottone(d, 'Pausa', 'talos-button talos-button--secondary talos-button--sm', 'pausa', () => azioni.pausa?.(dati.id)));
  if (dati.stato === 'paused') cluster.appendChild(bottone(d, 'Riprendi', 'talos-button talos-button--secondary talos-button--sm', 'riprendi', () => azioni.riprendi?.(dati.id)));
  const annulla = bottone(d, 'Annulla', 'talos-button talos-button--ghost talos-button--sm', 'annulla', () => azioni.annulla?.(dati.id)); annulla.dataset.apreVelo = 'veloAnnullaDownload';
  cluster.appendChild(annulla);
  piede.append(misure, cluster); art.appendChild(piede);
  return art;
}

/** Riscrive conteggi, filtro «solo attivi» e la coda. `stime` = Map id → { bytesAlSecondo, secondiRimanenti }. */
export function aggiornaCodaDownload(panel, items = [], { soloAttivi = false, stime = new Map(), azioni = {}, errore = null, document: d = globalThis.document } = {}) {
  if (!panel) return;
  const conteggi = panel.querySelector('.talos-count');
  const coda = panel.querySelector('[data-c="DownloadQueue"]');
  const c = contaStati(items);
  if (conteggi) {
    for (const b of conteggi.querySelectorAll('[data-c="Badge"]')) b.remove();
    const primo = conteggi.firstChild;
    const badges = [];
    if (c.inCorso) badges.push(badge(d, `${c.inCorso} in corso`, 'accent'));
    if (c.inPausa) badges.push(badge(d, `${c.inPausa} in pausa`, 'warning'));
    if (c.falliti) badges.push(badge(d, `${c.falliti} ${c.falliti === 1 ? 'fallito' : 'falliti'}`, 'danger'));
    if (c.completati) badges.push(badge(d, `${c.completati} ${c.completati === 1 ? 'completato' : 'completati'}`, 'success'));
    if (!items.length) badges.push(badge(d, 'Nessun download', ''));
    for (const b of badges) conteggi.insertBefore(b, primo);
    const filtro = conteggi.querySelector('[data-action="soloAttivi"]');
    if (filtro) { filtro.textContent = soloAttivi ? 'Mostra tutti' : 'Mostra solo attivi'; filtro.setAttribute('aria-pressed', String(soloAttivi)); }
  }
  if (!coda) return;
  if (errore) { coda.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', `Coda non disponibile: ${errore.message || errore}`)); return; }
  const visibili = items.filter((i) => !soloAttivi || (STATI_DOWNLOAD[i.state]?.attivo ?? true));
  if (!visibili.length) { coda.replaceChildren(el(d, 'p', 'talos-card--pad talos-muted', items.length ? 'Nessun download attivo.' : 'Nessun download: scegli un file da Hugging Face per cominciare.')); return; }
  coda.replaceChildren(...visibili.flatMap((i) => [d.createTextNode('\n'), creaRigaDownload(datiDownload(i, { stima: stime.get?.(i.id) || null }), { azioni, document: d })]), d.createTextNode('\n'));
}

/** Sposta il pannello del mockup in `#modelLabDownloadsPanel`; la lista del monolite diventa la coda. */
export function montaCodaDownload(originale, canonico) {
  if (!originale || !canonico || originale.dataset.downloadMontato) return;
  originale.replaceChildren(...canonico.children);
  originale.dataset.downloadMontato = 'true';
  const coda = originale.querySelector('[data-c="DownloadQueue"]'); if (coda) { coda.id = 'modelLabDownloadsList'; coda.replaceChildren(); }
}

/** Velocità e rimanente fra due letture: null se non c'è ancora una seconda lettura. */
export function stimaFraLetture(prima, dopo) {
  if (!prima || !dopo || dopo.state !== 'running') return null;
  const dt = (new Date(dopo.quando).getTime() - new Date(prima.quando).getTime()) / 1000;
  const db = Number(dopo.bytes) - Number(prima.bytes);
  if (!(dt > 0) || !(db > 0)) return null;
  const bytesAlSecondo = db / dt;
  const restanti = Math.max(0, Number(dopo.totalBytes) - Number(dopo.bytes));
  return { bytesAlSecondo, secondiRimanenti: restanti / bytesAlSecondo };
}
