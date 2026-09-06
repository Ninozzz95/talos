/*
 * Il Browser a schede (K-I, 06/09) — la schermata `#schermoBrowser` del mockup riempita dai
 * dati veri. Due tipi di scheda:
 *   · «lettura»: una pagina letta dall'agente con l'attrezzo `naviga` — il testo che il modello
 *     ha ricevuto davvero, con indirizzo, ora e lunghezza (mai un'anteprima inventata);
 *   · «viva»: una pagina che la persona apre dentro TALOS scrivendo l'indirizzo — si mostra in
 *     una cornice quando il sito lo consente (il server legge le intestazioni: X-Frame-Options e
 *     `frame-ancestors`, MDN letto il 06/09/2026), altrimenti si dice perché e si propone di
 *     farla leggere all'agente.
 * Il componente RIEMPIE lo scheletro del mockup (stessi nodi, stesse classi), non lo ricrea:
 * la parità struttura/parole si misura sullo stesso DOM.
 *
 * Parità con Hermes Desktop (`right-rail/preview-browser-bar.tsx`, `terminals.ts`, letti il
 * 06/09/2026): indietro/avanti, ricarica, indirizzo modificabile con Invio/Esc, copia
 * dell'indirizzo, «Annota» che prepara un commento nel composer senza inviarlo, schede per
 * pagina con chiusura. Non pareggiato: l'annotazione di un ELEMENTO dentro la pagina viva
 * (Hermes inietta un overlay nella webview Electron; una cornice di un'altra origine non lo
 * permette) — registrato nel ledger.
 */

export const TESTI = Object.freeze({
  intestazione: 'Letture della sessione',
  riepilogoLetture: (n) => `Testo acquisito dall’agente · ${n} ${n === 1 ? 'pagina' : 'pagine'}`,
  riepilogoMisto: (letture, vive) => `${letture} ${letture === 1 ? 'lettura' : 'letture'} dell’agente · ${vive} ${vive === 1 ? 'pagina aperta' : 'pagine aperte'} da te`,
  riepilogoVuoto: 'Nessuna pagina ancora',
  posizioneLettura: (i, n) => `Lettura ${i} di ${n}`,
  posizioneViva: 'Pagina aperta da te · viva dentro TALOS',
  posizioneBloccata: 'Pagina aperta da te · non mostrabile qui',
  posizioneCaricamento: 'Apertura in corso…',
  limitiLetture: 'Copia testuale, senza navigazione interattiva. Le note locali si azzerano al ricaricamento.',
  limitiVive: 'Le letture sono copie testuali; una pagina aperta da te è viva dentro TALOS quando il sito lo consente. Le note restano in questo browser.',
  provenienzaAgente: 'Agente',
  provenienzaTu: 'Tu',
  cornicePronta: 'Pagina viva',
  chiediAllAgente: 'Chiedi all’agente di leggerla',
  nessunaScheda: 'Nessuna pagina letta',
});

export const MASSIMO_SCHEDE = 12;

/** L'host e il percorso corto di un indirizzo, per le schede e la cronologia (mockup: «example.org/documentazione»). */
export function hostDaUrl(url) {
  try {
    const u = new URL(String(url));
    const percorso = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${u.host}${percorso}`;
  } catch { return String(url || ''); }
}

/** Il titolo di una lettura: la prima riga non vuota del testo (max 80), altrimenti l'host. */
export function titoloDaLettura(pagina) {
  if (pagina?.titolo) return pagina.titolo;
  const riga = String(pagina?.testo || '').split('\n').map((r) => r.trim()).find((r) => r.length > 0);
  if (riga) return riga.length > 80 ? `${riga.slice(0, 79)}…` : riga;
  return hostDaUrl(pagina?.url) || 'Pagina';
}

/** «localhost:5173» → «http://localhost:5173/»; «example.org/x» → https; una frase non è un indirizzo. */
export function urlApribile(testo) {
  const t = String(testo || '').trim();
  if (!t || /\s/.test(t)) return null;
  const conSchema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(t) ? `http://${t}` : `https://${t}`);
  try {
    const u = new URL(conSchema);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}

const oraRoma = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const giornoRoma = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit' });

/** «Agente · 05/09, 10:42 (Roma) · 365 caratteri» — la provenienza di una lettura, nel formato del mockup. */
export function formattaProvenienza(pagina) {
  const quando = pagina?.quando ? new Date(pagina.quando) : null;
  const chi = pagina?.origine === 'tu' ? TESTI.provenienzaTu : TESTI.provenienzaAgente;
  const parti = [chi];
  if (quando && !Number.isNaN(quando.getTime())) parti.push(`${giornoRoma.format(quando)}, ${oraRoma.format(quando)} (Roma)`);
  if (pagina?.tipo !== 'viva') parti.push(`${String(pagina?.testo || '').length} caratteri`);
  return parti.join(' · ');
}

/** «02 · Agente · 10:42» — la riga alta di una card della cronologia. */
export function etichettaCronologia(pagina, indice) {
  const quando = pagina?.quando ? new Date(pagina.quando) : null;
  const ora = quando && !Number.isNaN(quando.getTime()) ? oraRoma.format(quando) : '—';
  return `${String(indice + 1).padStart(2, '0')} · ${pagina?.origine === 'tu' ? TESTI.provenienzaTu : TESTI.provenienzaAgente} · ${ora}`;
}

/** Chi resta attiva quando si chiude la scheda in posizione `indice` (stessa regola del Terminale, Hermes `closeTerminal`). */
export function prossimaDopoChiusura(lista, indice) {
  const resto = lista.filter((_, i) => i !== indice);
  return (resto[indice] ?? resto[indice - 1]) ?? null;
}

const $ = (radice, sel) => radice.querySelector(sel);

/**
 * @param {HTMLElement} schermo `#schermoBrowser`
 * @param {{azioni:object}} opzioni azioni: seleziona(id) · chiudi(id) · apri(url) · rileggi(scheda) · annota(scheda) · copia(scheda) · apriFuori(scheda) · salvaNota(scheda, testo) · decidi(requestId, si)
 */
export function creaBrowser(schermo, { azioni = {} } = {}) {
  const el = {
    riepilogo: $(schermo, '#browserRiepilogo'), schede: $(schermo, '#browserSchede'),
    indietro: $(schermo, '[data-browser-demo="back"], [data-browser-action="back"]'), avanti: $(schermo, '[data-browser-demo="forward"], [data-browser-action="forward"]'),
    url: $(schermo, '#urlBrowser'), fuori: $(schermo, '[data-browser-demo="open"], [data-browser-action="open"]'),
    posizione: $(schermo, '#browserPosizione'), rileggi: $(schermo, '[data-browser-demo="reload"], [data-browser-action="reload"]'),
    annota: $(schermo, '[data-browser-demo="annotate"], [data-browser-action="annotate"]'), nota: $(schermo, '[data-browser-demo="note"], [data-browser-action="note"]'),
    copia: $(schermo, '[data-browser-demo="copy"], [data-browser-action="copy"]'),
    avviso: $(schermo, '#browserAvviso'), bloccato: $(schermo, '#browserBloccato'), caricamento: $(schermo, '#browserCaricamento'), vuoto: $(schermo, '#browserVuoto'),
    articolo: $(schermo, '#browserPagina'), titolo: $(schermo, '#browserTitolo'), provenienza: $(schermo, '#browserProvenienza'), testo: $(schermo, '#browserTesto'),
    editorNota: $(schermo, '#browserEditorNota'), notaInput: $(schermo, '#browserNotaInput'), notaSalvata: $(schermo, '#browserNotaSalvata'),
    live: $(schermo, '#browserLive'), cronologia: $(schermo, '.talos-browser__history-list'), limiti: $(schermo, '#browserLimiti'),
    consenti: $(schermo, '[data-action="consentiBrowser"]'), nega: $(schermo, '[data-action="negaBrowser"]'), annulla: $(schermo, '[data-action="annullaBrowser"]'),
    conservaNota: $(schermo, '[data-action="conservaNotaBrowser"]'), chiudiNota: $(schermo, '[data-action="chiudiNotaBrowser"]'),
    bloccatoTesto: $(schermo, '#browserBloccato p.talos-muted'),
  };
  let stato = { schede: [], attiva: null, note: {}, richiesta: null };
  const attiva = () => stato.schede.find((s) => s.id === stato.attiva) || null;
  const indiceAttiva = () => stato.schede.findIndex((s) => s.id === stato.attiva);

  /* --- gesti --- */
  el.indietro?.addEventListener('click', () => { const i = indiceAttiva(); if (i > 0) azioni.seleziona?.(stato.schede[i - 1].id); });
  el.avanti?.addEventListener('click', () => { const i = indiceAttiva(); if (i >= 0 && i < stato.schede.length - 1) azioni.seleziona?.(stato.schede[i + 1].id); });
  el.fuori?.addEventListener('click', () => { const s = attiva(); if (s) azioni.apriFuori?.(s); });
  el.rileggi?.addEventListener('click', () => { const s = attiva(); if (s) azioni.rileggi?.(s); });
  el.annota?.addEventListener('click', () => { const s = attiva(); if (s) azioni.annota?.(s); });
  el.copia?.addEventListener('click', () => { const s = attiva(); if (s) azioni.copia?.(s); });
  el.nota?.addEventListener('click', (e) => { e.stopPropagation(); const aperto = !el.editorNota.hidden; el.editorNota.hidden = aperto; el.nota.setAttribute('aria-expanded', String(!aperto)); if (!aperto) { const s = attiva(); el.notaInput.value = (s && stato.note[s.url]) || ''; el.notaInput.focus(); } });
  el.conservaNota?.addEventListener('click', () => { const s = attiva(); if (!s) return; azioni.salvaNota?.(s, el.notaInput.value.trim()); el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); el.nota?.focus(); });
  el.chiudiNota?.addEventListener('click', () => { el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); el.nota?.focus(); });
  el.consenti?.addEventListener('click', () => { if (stato.richiesta) azioni.decidi?.(stato.richiesta.requestId, true); });
  el.nega?.addEventListener('click', () => { if (stato.richiesta) azioni.decidi?.(stato.richiesta.requestId, false); });
  el.annulla?.addEventListener('click', () => { const s = attiva(); if (s) azioni.chiudi?.(s.id); });
  if (el.url) {
    el.url.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const u = urlApribile(el.url.value); if (u) { azioni.apri?.(u); el.url.blur(); } else { el.url.setAttribute('aria-invalid', 'true'); mostraAvviso('Non è un indirizzo: scrivi un sito (es. localhost:5173 o example.org).'); } }
      if (e.key === 'Escape') { e.preventDefault(); el.url.value = attiva()?.url || ''; el.url.removeAttribute('aria-invalid'); el.url.blur(); }
    });
    el.url.addEventListener('focus', () => el.url.select());
    el.url.addEventListener('input', () => el.url.removeAttribute('aria-invalid'));
  }
  el.schede?.addEventListener('click', (e) => {
    const tab = e.target.closest?.('[data-browser-tab]'); if (!tab) return;
    const id = tab.dataset.browserId;
    const sullaX = e.clientX > 0 && e.clientX >= tab.getBoundingClientRect().right - 24;
    if (sullaX || e.ctrlKey || e.metaKey) azioni.chiudi?.(id); else azioni.seleziona?.(id);
  });
  el.schede?.addEventListener('auxclick', (e) => { const tab = e.target.closest?.('[data-browser-tab]'); if (tab && e.button === 1) { e.preventDefault(); azioni.chiudi?.(tab.dataset.browserId); } });
  el.schede?.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('[data-browser-tab]'); if (!tab) return;
    const ids = stato.schede.map((s) => s.id); const i = ids.indexOf(tab.dataset.browserId);
    let prossima = null;
    if (e.key === 'ArrowRight') prossima = ids[(i + 1) % ids.length]; else if (e.key === 'ArrowLeft') prossima = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') prossima = ids[0]; else if (e.key === 'End') prossima = ids[ids.length - 1];
    else if (e.key === 'Delete') { e.preventDefault(); azioni.chiudi?.(tab.dataset.browserId); return; }
    else return;
    e.preventDefault(); if (prossima) { azioni.seleziona?.(prossima); el.schede.querySelector(`[data-browser-id="${CSS.escape(prossima)}"]`)?.focus(); }
  });
  el.cronologia?.addEventListener('click', (e) => { const voce = e.target.closest?.('[data-pagina-browser]'); if (voce) azioni.seleziona?.(voce.dataset.browserId); });

  function mostraAvviso(testo) { if (!el.avviso) return; el.avviso.textContent = testo || ''; el.avviso.hidden = !testo; }

  function renderizzaSchede() {
    if (!el.schede) return;
    const cornice = el.schede.closest('.talos-tabs'); if (cornice) cornice.hidden = stato.schede.length === 0; // senza schede la lista vuota disegnava una pillola (taccuino, browser-1.png)
    el.schede.replaceChildren();
    stato.schede.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'talos-tabs__tab'; b.type = 'button'; b.setAttribute('role', 'tab');
      b.dataset.browserTab = String(i); b.dataset.browserId = s.id;
      const sel = s.id === stato.attiva;
      b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1;
      b.textContent = titoloDaLettura(s);
      b.title = `${titoloDaLettura(s)} — ${s.url}`;
      el.schede.append(b);
    });
  }

  function renderizzaCronologia() {
    if (!el.cronologia) return;
    el.cronologia.replaceChildren();
    const letture = stato.schede.filter((s) => s.tipo !== 'viva');
    letture.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'talos-browser__entry'; b.type = 'button';
      b.dataset.paginaBrowser = String(i); b.dataset.browserId = s.id;
      if (s.id === stato.attiva) b.setAttribute('aria-current', 'page');
      const alto = document.createElement('span'); alto.className = 'talos-muted talos-browser__meta'; alto.textContent = etichettaCronologia(s, i);
      const forte = document.createElement('strong'); forte.textContent = titoloDaLettura(s);
      const basso = document.createElement('span'); basso.className = 'talos-muted talos-browser__meta'; basso.textContent = hostDaUrl(s.url);
      b.append(alto, forte, basso);
      el.cronologia.append(b);
    });
  }

  function renderizzaCornice(s) {
    if (!el.live) return;
    const vuole = s && s.tipo === 'viva' && s.stato !== 'bloccata';
    el.live.hidden = !vuole;
    if (!vuole) { el.live.replaceChildren(); return; }
    let frame = el.live.querySelector('iframe');
    if (!frame || frame.dataset.browserId !== s.id) {
      el.live.replaceChildren();
      frame = document.createElement('iframe');
      frame.dataset.browserId = s.id;
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.title = titoloDaLettura(s);
      frame.addEventListener('load', () => azioni.caricata?.(s.id));
      frame.src = s.url;
      el.live.append(frame);
    }
  }

  function renderizza() {
    const s = attiva();
    const letture = stato.schede.filter((x) => x.tipo !== 'viva').length;
    const vive = stato.schede.length - letture;
    if (el.riepilogo) el.riepilogo.textContent = stato.schede.length === 0 ? TESTI.riepilogoVuoto : (vive === 0 ? TESTI.riepilogoLetture(letture) : TESTI.riepilogoMisto(letture, vive));
    renderizzaSchede();
    const i = indiceAttiva();
    if (el.indietro) el.indietro.disabled = i <= 0;
    if (el.avanti) el.avanti.disabled = i < 0 || i >= stato.schede.length - 1;
    if (el.url && document.activeElement !== el.url) el.url.value = s?.url || '';
    if (el.fuori) el.fuori.disabled = !s || !/^https?:\/\//i.test(s.url);
    for (const b of [el.rileggi, el.annota, el.nota, el.copia]) if (b) b.disabled = !s;
    if (el.copia) el.copia.disabled = !s || s.tipo === 'viva';
    if (el.rileggi) el.rileggi.title = s?.tipo === 'viva' ? 'Ricarica la pagina nella cornice' : 'Prepara nel composer la richiesta di rileggere questa pagina';
    if (el.posizione) {
      el.posizione.textContent = !s ? '' : s.tipo === 'viva' ? (s.stato === 'caricamento' ? TESTI.posizioneCaricamento : s.stato === 'bloccata' ? TESTI.posizioneBloccata : TESTI.posizioneViva) : TESTI.posizioneLettura(stato.schede.filter((x) => x.tipo !== 'viva').indexOf(s) + 1, letture);
    }
    // stati
    const richiesta = stato.richiesta;
    if (el.bloccato) { el.bloccato.hidden = !richiesta; if (richiesta && el.bloccatoTesto) el.bloccatoTesto.textContent = `L’agente chiede di leggere ${richiesta.url}. La scelta vale per questa richiesta.`; }
    if (el.caricamento) el.caricamento.hidden = !(s && s.tipo === 'viva' && s.stato === 'caricamento');
    if (el.vuoto) el.vuoto.hidden = stato.schede.length > 0;
    // l'articolo resta per le note anche su una pagina viva: si nascondono solo testata e testo acquisito
    if (el.articolo) el.articolo.hidden = !s;
    const testata = el.titolo?.closest('header'); if (testata) testata.hidden = !s || s.tipo === 'viva';
    if (el.testo) el.testo.hidden = !s || s.tipo === 'viva';
    if (s && s.tipo !== 'viva') {
      if (el.titolo) el.titolo.textContent = titoloDaLettura(s);
      if (el.provenienza) el.provenienza.textContent = formattaProvenienza(s);
      if (el.testo) el.testo.textContent = s.testo || '';
    }
    mostraAvviso(s?.tipo === 'viva' && s.stato === 'bloccata' ? `${s.motivo || 'Il sito non consente di essere mostrato dentro TALOS'}. ${TESTI.chiediAllAgente}: usa «Rileggi».` : '');
    renderizzaCornice(s);
    // nota
    const nota = s ? stato.note[s.url] : '';
    if (el.notaSalvata) { el.notaSalvata.hidden = !nota; el.notaSalvata.textContent = nota ? `Nota: ${nota}` : ''; }
    if (!s || (el.editorNota && !el.editorNota.hidden && el.editorNota.dataset.browserId !== s.id)) { if (el.editorNota) el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); }
    if (el.editorNota && s) el.editorNota.dataset.browserId = s.id;
    renderizzaCronologia();
    const nav = el.cronologia?.closest('nav'); if (nav) nav.hidden = letture === 0; // niente «Cronologia · scegli una lettura» senza letture
    if (el.limiti) el.limiti.textContent = vive > 0 ? TESTI.limitiVive : TESTI.limitiLetture;
  }

  return {
    /** @param {{schede?:Array, attiva?:string|null, note?:object, richiesta?:object|null}} nuovo */
    aggiorna(nuovo) { stato = { ...stato, ...nuovo }; renderizza(); },
    fuocoSullaScheda() { el.schede?.querySelector('[aria-selected="true"]')?.focus(); },
    get stato() { return stato; },
  };
}
