import { t, tn } from './lingua.js';

/* Risultati del passo: byte e identità restano nel contratto del client, non nel dettaglio compatto. */
let prossimoId = 0;

const testoAmmesso = (mime) => {
  const tipo = String(mime ?? '').split(';', 1)[0].trim().toLowerCase();
  return tipo.startsWith('text/') || tipo === 'application/json' || tipo.endsWith('+json')
    || tipo === 'application/xml' || tipo.endsWith('+xml');
};

export function montaPannelloRisultati(host, { client, sorgente, onRitorno } = {}) {
  const d = host.ownerDocument;
  const el = (tag, classe, testo) => {
    const nodo = d.createElement(tag);
    if (classe) nodo.className = classe;
    if (testo != null) nodo.textContent = testo;
    return nodo;
  };
  const id = `talos-wfg-risultati-${++prossimoId}`;
  const pannello = el('aside', 'talos-wfg__result-panel');
  pannello.id = id;
  pannello.hidden = true;
  pannello.setAttribute('aria-label', t('agenti.results.panelLabel'));
  const testata = el('header', 'talos-wfg__result-head');
  const titolo = el('h3', null, t('agenti.results.panelLabel'));
  titolo.tabIndex = -1;
  const chiudi = el('button', 'talos-button talos-button--ghost talos-button--sm', t('agenti.results.close'));
  chiudi.type = 'button';
  testata.append(titolo, chiudi);
  const sommario = el('p', 'talos-wfg__result-summary');
  const regione = el('div', 'talos-wfg__result-scroll');
  regione.setAttribute('role', 'region');
  regione.setAttribute('aria-label', t('agenti.results.listLabel'));
  regione.tabIndex = 0;
  const elenco = el('ol', 'talos-wfg__outputs');
  regione.append(elenco);
  pannello.append(testata, sommario, regione);
  host.append(pannello);

  let dati = null, generazione = 0, morto = false, caricamento = null, errorePagina = '';
  const full = new Map();
  const dimensione = (ref) => Number.isSafeInteger(ref.bytes) && ref.bytes >= 0 ? tn('agenti.results.bytesOne', 'agenti.results.bytesMany', ref.bytes) : t('agenti.results.sizeUnknown');
  function valido() { return !morto && !pannello.hidden && dati; }
  function chiudiPannello({ restituisciFuoco = true } = {}) {
    if (pannello.hidden) return;
    generazione++;
    pannello.hidden = true;
    dati = null;
    caricamento = null;
    errorePagina = '';
    full.clear();
    if (restituisciFuoco) onRitorno?.();
  }
  chiudi.addEventListener('click', () => chiudiPannello());
  pannello.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    evento.stopPropagation();
    chiudiPannello();
  });

  async function leggiTutto(ref) {
    if (!valido() || caricamento || !testoAmmesso(ref.contentType)) return;
    const token = generazione, nodeId = dati.nodeId;
    caricamento = `full:${ref.resultId}`;
    disegna();
    let risultato;
    try { risultato = await client.output(sorgente, nodeId, ref.resultId); }
    catch (error) { risultato = { error: error?.message || t('agenti.results.readUnavailable') }; }
    if (!valido() || token !== generazione || dati.nodeId !== nodeId) return;
    full.set(ref.resultId, risultato?.resultId === ref.resultId || risultato?.error
      ? risultato : { error: t('agenti.results.resultIdentityMismatch') });
    caricamento = null;
    disegna();
    if (typeof full.get(ref.resultId)?.content === 'string') {
      const pre = [...elenco.querySelectorAll('.talos-wfg__output')]
        .find(item => item.dataset.resultId === ref.resultId)?.querySelector('.talos-wfg__output-full');
      pre?.focus();
    }
  }

  async function altraPagina() {
    if (!valido() || caricamento || !Number.isSafeInteger(dati.nextOutputOffset)) return;
    const token = generazione, nodeId = dati.nodeId, offset = dati.nextOutputOffset;
    caricamento = 'page'; errorePagina = ''; disegna();
    try {
      const pagina = await client.passo(sorgente, nodeId, { outputOffset: offset });
      if (!valido() || token !== generazione || dati.nodeId !== nodeId) return;
      if (pagina.nodeId && pagina.nodeId !== nodeId) throw Error(t('agenti.results.stepIdentityMismatch'));
      const esistenti = new Set(dati.outputs.map(ref => ref.resultId));
      dati.outputs.push(...(pagina.outputs ?? []).filter(ref => ref?.resultId && !esistenti.has(ref.resultId)));
      dati.nextOutputOffset = pagina.nextOutputOffset;
      dati.totalOutputs = pagina.totalOutputs;
    } catch (error) {
      if (!valido() || token !== generazione || dati.nodeId !== nodeId) return;
      errorePagina = error?.message || t('agenti.results.pageUnavailable');
    }
    caricamento = null;
    disegna();
  }

  function disegna() {
    if (!valido()) return;
    titolo.textContent = t('agenti.results.panelTitle', { nome: dati.label || dati.nodeId });
    sommario.textContent = t('agenti.results.summary', { totale: dati.totalOutputs, caricati: dati.outputs.length });
    const righe = [];
    for (const ref of dati.outputs) {
      if (!ref?.resultId) continue;
      const item = el('li', 'talos-wfg__output');
      item.dataset.resultId = ref.resultId;
      if (ref.isError) item.dataset.errore = 'true';
      item.append(el('strong', 'talos-wfg__output-id', ref.resultId));
      item.append(el('p', 'talos-wfg__output-meta', [ref.kind || t('agenti.results.kindFallback'), ref.contentType || t('agenti.results.typeUnknown'), dimensione(ref)].join(' · ')));
      if (ref.isError) item.append(el('p', 'talos-wfg__output-error', t('agenti.results.toolError')));
      const risultato = full.get(ref.resultId);
      if (typeof risultato?.content === 'string') {
        const completo = el('pre', 'talos-wfg__output-full', risultato.content);
        completo.tabIndex = -1;
        item.append(completo);
      } else if (risultato?.content === null) {
        item.append(el('p', 'talos-wfg__vuoto', t('agenti.results.binary')));
      } else {
        if (ref.preview) {
          item.append(el('p', 'talos-wfg__output-preview-label', ref.truncated ? t('agenti.results.previewTruncated') : t('agenti.results.preview')));
          item.append(el('pre', 'talos-wfg__output-preview', ref.preview));
        } else item.append(el('p', 'talos-wfg__vuoto', t('agenti.results.previewUnavailable')));
        if (risultato?.error) item.append(el('p', 'talos-wfg__output-error', t('agenti.results.readFailed', { motivo: risultato.error })));
        if (testoAmmesso(ref.contentType)) {
          const open = el('button', 'talos-wfg__link talos-wfg__output-open', risultato?.error ? t('agenti.results.retryRead') : t('agenti.results.showAll'));
          open.type = 'button';
          open.disabled = Boolean(caricamento);
          open.addEventListener('click', () => void leggiTutto(ref));
          item.append(open);
        }
      }
      const raw = el('a', 'talos-wfg__link talos-wfg__output-download', t('agenti.results.download'));
      raw.href = client.outputRawUrl(sorgente, dati.nodeId, ref.resultId);
      raw.setAttribute('download', '');
      item.append(raw);
      righe.push(item);
    }
    if (!righe.length) righe.push(el('li', 'talos-wfg__vuoto', t('agenti.results.none')));
    if (Number.isSafeInteger(dati.nextOutputOffset)) {
      const more = el('button', 'talos-wfg__link talos-wfg__output-more', t('agenti.results.showMore', { n: Math.max(0, dati.totalOutputs - dati.outputs.length) }));
      more.type = 'button'; more.disabled = Boolean(caricamento);
      more.addEventListener('click', () => void altraPagina());
      const footer = el('li', 'talos-wfg__output-footer');
      if (errorePagina) footer.append(el('p', 'talos-wfg__output-error', t('agenti.results.readFailed', { motivo: errorePagina })));
      footer.append(more);
      righe.push(footer);
    }
    elenco.replaceChildren(...righe);
  }

  return Object.freeze({
    elemento: pannello,
    apri(info) {
      if (morto || !info?.nodeId) return;
      generazione++;
      dati = { ...info, outputs: [...(info.outputs ?? [])], totalOutputs: Number.isSafeInteger(info.totalOutputs) ? info.totalOutputs : (info.outputs?.length ?? 0) };
      full.clear(); errorePagina = ''; caricamento = null;
      pannello.hidden = false;
      disegna();
      titolo.focus();
    },
    aggiorna(info) {
      if (!valido() || info?.nodeId !== dati.nodeId) return;
      const esistenti = new Set(dati.outputs.map(ref => ref.resultId));
      dati.outputs.push(...(info.outputs ?? []).filter(ref => ref?.resultId && !esistenti.has(ref.resultId)));
      dati.totalOutputs = Number.isSafeInteger(info.totalOutputs) ? info.totalOutputs : dati.totalOutputs;
      disegna();
    },
    apertoPer: () => valido() ? dati.nodeId : null,
    chiudi: chiudiPannello,
    distruggi() { morto = true; generazione++; pannello.remove(); },
  });
}
