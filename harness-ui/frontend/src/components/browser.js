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
 * Ricerca fatta prima di scrivere (letta il 06/09/2026): indietro/avanti, ricarica, indirizzo
 * modificabile con Invio/Esc, copia
 * dell'indirizzo, «Annota» che prepara un commento nel composer senza inviarlo, schede per
 * pagina con chiusura. Non pareggiato: l'annotazione di un ELEMENTO dentro la pagina viva
 * (una webview Electron può iniettare un overlay; una cornice di un'altra origine non lo
 * permette) — registrato nel ledger.
 */

import { t, tn } from './lingua.js';
import { renderizzaAnnotazioni, MASSIMO_ANNOTAZIONI } from './annotazioni.js';
import { sembraHtml, testoLeggibile, riassuntoPulizia } from './testo-pagina.js'; // 06/9 O-28: il sorgente di una pagina non si legge

export const TESTI = Object.freeze({
  intestazione: 'Letture della sessione',
  riepilogoLetture: (n) => tn('Testo acquisito dall’agente · {n} pagina', 'Testo acquisito dall’agente · {n} pagine', n),
  riepilogoMisto: (letture, vive) => `${tn('{n} lettura dell’agente', '{n} letture dell’agente', letture)} · ${tn('{n} pagina aperta da te', '{n} pagine aperte da te', vive)}`,
  riepilogoVuoto: 'Nessuna pagina ancora',
  posizioneLettura: (i, n) => t('Lettura {i} di {n}', { i, n }),
  posizioneViva: 'Pagina aperta da te · viva dentro TALOS',
  posizioneBloccata: 'Pagina aperta da te · non mostrabile qui',
  posizioneCaricamento: 'Apertura in corso…',
  /* ⛔ 07/9, guardando lo screenshot dopo un ricaricamento: «senza navigazione interattiva» era
     diventato falso — dentro una pagina viva ci si clicca, si scorre e si scrive. Una riga che
     descrive limiti che non esistono più fa credere che la funzione non ci sia. */
  limitiLetture: 'Le letture dell’agente sono copie testuali; una pagina che apri tu è viva e ci puoi navigare dentro. Le note restano in questo browser.',
  /* ⛔ 07/9 — «quando il sito lo consente» non è più vero: un sito che vieta la cornice ora si apre
     lo stesso, in un browser che TALOS pilota sul tuo computer. La riga diceva un limite che
     abbiamo tolto — e una promessa al ribasso invecchia peggio di una mancata. */
  limitiVive: 'Le letture sono copie testuali; una pagina che apri tu è viva dentro TALOS — se il sito vieta la cornice, la mostra un browser pilotato sul tuo computer. Le note restano qui.',
  provenienzaAgente: 'Agente',
  provenienzaTu: 'Tu',
  cornicePronta: 'Pagina viva',
  chiediAllAgente: 'Chiedi all’agente di leggerla',
  nessunaScheda: 'Nessuna pagina letta',
});

export const MASSIMO_SCHEDE = 12;

/** Un dev server sul computer della persona: la scheda passa dal proxy locale e si può annotare. */
export function localeAnnotabile(url) {
  try { const h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost'); } catch { return false; }
}
export const PROXY_BROWSER = '/api/v1/browser/proxy?url=';

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
  return hostDaUrl(pagina?.url) || t('Pagina');
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
  const chi = t(pagina?.origine === 'tu' ? TESTI.provenienzaTu : TESTI.provenienzaAgente);
  const parti = [chi];
  if (quando && !Number.isNaN(quando.getTime())) parti.push(`${giornoRoma.format(quando)}, ${oraRoma.format(quando)} (Roma)`);
  if (pagina?.tipo !== 'viva') parti.push(`${String(pagina?.testo || '').length} caratteri`);
  return parti.join(' · ');
}

/*
 * ⛔ 07/9, owner: «quella sopra deve diventare un sistema di schede, esattamente come fa un browser».
 * Un browser non scrive l'indirizzo sulla linguetta: scrive il TITOLO della pagina, e tiene lo stato
 * a parte. Le letture dell'agente cominciano col rigo «HTTP 200 · https://…», e quel rigo finiva tale
 * e quale sulla scheda: sette linguette che dicevano tutte «HTTP 200 · https://…», illeggibili
 * (screenshot dell'owner). Qui il rigo si smonta: il numero diventa una pillola — e solo se non è
 * 2xx, perché «tutto bene» non merita un'etichetta — e il nome viene dal `<title>` della pagina, che
 * nel testo acquisito c'è già e nessuno leggeva.
 */
const RIGO_STATO = /^\s*HTTP\s+(\d{3})\s*[·|-]\s*(\S+)\s*$/i;

/** Il numero di stato di una lettura, se il testo acquisito lo dichiara. @returns {number|null} */
export function statoHttpDiLettura(pagina) {
  const prima = String(pagina?.testo || '').split('\n', 1)[0];
  const m = RIGO_STATO.exec(prima);
  return m ? Number(m[1]) : null;
}

/** Il `<title>` di una pagina HTML, ripulito e accorciato. @returns {string} vuoto se non c'è. */
export function titoloDaHtml(grezzo) {
  const m = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(String(grezzo || ''));
  if (!m) return '';
  const testo = m[1].replace(/\s+/g, ' ').trim()
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return testo.length > 80 ? `${testo.slice(0, 79)}…` : testo;
}

/** Il nome di una scheda: il titolo vero se c'è, poi il `<title>` della pagina, poi host e percorso. */
/**
 * Una pagina si annota quando è NOSTRA: un dev server passato dal proxy (stessa origine) o una
 * pagina viva dentro il browser che TALOS pilota (il DOM lo leggiamo via CDP). Una lettura o una
 * cornice altrui no: di quelle non possiamo toccare il documento.
 */
export function paginaAnnotabile(s) {
  return Boolean(s && s.tipo === 'viva' && (s.proxata || s.viaVista === 'vivo') && s.stato !== 'bloccata');
}

export function titoloScheda(pagina) {
  if (pagina?.titolo) return pagina.titolo;
  const daHtml = titoloDaHtml(pagina?.testo);
  if (daHtml) return daHtml;
  return hostDaUrl(pagina?.url) || titoloDaLettura(pagina);
}

/** Chi resta attiva quando si chiude la scheda in posizione `indice` (stessa regola del Terminale). */
export function prossimaDopoChiusura(lista, indice) {
  const resto = lista.filter((_, i) => i !== indice);
  return (resto[indice] ?? resto[indice - 1]) ?? null;
}

const $ = (radice, sel) => radice.querySelector(sel);

/**
 * @param {HTMLElement} schermo `#schermoBrowser`
 * @param {{azioni:object}} opzioni azioni: seleziona(id) · chiudi(id) · apri(url) · rileggi(scheda) · annota(scheda) · copia(scheda) · apriFuori(scheda) · salvaNota(scheda, testo) · decidi(requestId, si)
 */
/*
 * `modoIniziale` esiste per il LABORATORIO: il mockup illustra lo stato «Testo dell'agente» (il testo
 * acquisito è il disegno che si può confrontare a pixel), mentre nel prodotto il modo predefinito è
 * «Pagina» — una pagina renderizzata non si confronta con un mockup statico. Un solo parametro, e la
 * differenza è dichiarata qui invece di essere nascosta in una condizione.
 */
export function creaBrowser(schermo, { azioni = {}, modoIniziale = 'pagina' } = {}) {
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
    live: $(schermo, '#browserLive'), nuovaScheda: $(schermo, '#browserNuovaScheda'), limiti: $(schermo, '#browserLimiti'),
    consenti: $(schermo, '[data-action="consentiBrowser"]'), nega: $(schermo, '[data-action="negaBrowser"]'), annulla: $(schermo, '[data-action="annullaBrowser"]'),
    conservaNota: $(schermo, '[data-action="conservaNotaBrowser"]'), chiudiNota: $(schermo, '[data-action="chiudiNotaBrowser"]'),
    bloccatoTesto: $(schermo, '#browserBloccato p.talos-muted'),
    annotazioni: $(schermo, '#browserAnnotazioni'),
    modi: [...schermo.querySelectorAll('[data-browser-modo]')], // 06/9 O-28: Pagina / Testo dell'agente
  };
  let stato = { schede: [], attiva: null, note: {}, richiesta: null, annotazioni: {}, annotaAttivo: false, modo: modoIniziale === 'testo' ? 'testo' : 'pagina' };
  const frameAttivo = () => el.live?.querySelector('iframe') || null;
  const dialogaConOverlay = (messaggio) => { try { frameAttivo()?.contentWindow?.postMessage({ fonte: 'talos-genitore', ...messaggio }, '*'); } catch { /* cornice non pronta */ } };
  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || m.fonte !== 'talos-annota') return;
    const f = frameAttivo(); if (!f || e.source !== f.contentWindow) return;
    const s = attiva(); if (!s || s.tipo !== 'viva') return;
    if (m.tipo === 'elemento') azioni.annotazione?.(s, m.fatto);
    else if (m.tipo === 'naviga' && m.url) azioni.apri?.(m.url, s.id);
    else if (m.tipo === 'esc') azioni.annota?.(s, false);
    else if (m.tipo === 'pronta') { if (m.titolo && !s.titolo) { s.titolo = m.titolo; renderizza(); } if (stato.annotaAttivo) dialogaConOverlay({ tipo: 'annota', attivo: true }); azioni.caricata?.(s.id); }
  });
  const attiva = () => stato.schede.find((s) => s.id === stato.attiva) || null;
  const indiceAttiva = () => stato.schede.findIndex((s) => s.id === stato.attiva);

  /* --- gesti --- */
  el.indietro?.addEventListener('click', () => { const i = indiceAttiva(); if (i > 0) azioni.seleziona?.(stato.schede[i - 1].id); });
  el.avanti?.addEventListener('click', () => { const i = indiceAttiva(); if (i >= 0 && i < stato.schede.length - 1) azioni.seleziona?.(stato.schede[i + 1].id); });
  el.fuori?.addEventListener('click', () => { const s = attiva(); if (s) azioni.apriFuori?.(s); });
  el.rileggi?.addEventListener('click', () => { const s = attiva(); if (s) azioni.rileggi?.(s); });
  /*
   * ⛔ 07/9, trovato dalla prova DA UMANO (C26): premendo «Annota» su una pagina VIVA non compariva
   *   nessuno spillo — il pulsante preparava una frase nel composer. Gli spilli erano previsti solo
   *   per una pagina PROXATA (un dev server locale), perché quando questo codice è nato la vista
   *   viva non esisteva. Una pagina che TALOS pilota si annota come qualunque altra: è anzi il caso
   *   più utile, perché è lì che si guarda un sito vero.
   */
  el.annota?.addEventListener('click', () => {
    const s = attiva(); if (!s) return;
    if (paginaAnnotabile(s)) azioni.annota?.(s, !stato.annotaAttivo); else azioni.annota?.(s);
  });
  el.copia?.addEventListener('click', () => { const s = attiva(); if (s) azioni.copia?.(s); });
  // 06/9 O-28: i due modi di guardare una lettura. Cambiare modo non ricarica niente: la cornice resta.
  for (const b of el.modi || []) {
    b.addEventListener('click', () => {
      const scelto = b.dataset.browserModo === 'testo' ? 'testo' : 'pagina';
      if (stato.modo === scelto) return;
      stato.modo = scelto;
      if (scelto === 'testo') mostraAvviso('');
      renderizza();
    });
  }
  el.nota?.addEventListener('click', (e) => { e.stopPropagation(); const aperto = !el.editorNota.hidden; el.editorNota.hidden = aperto; el.nota.setAttribute('aria-expanded', String(!aperto)); if (!aperto) { const s = attiva(); el.notaInput.value = (s && stato.note[s.url]) || ''; el.notaInput.focus(); } });
  el.conservaNota?.addEventListener('click', () => { const s = attiva(); if (!s) return; azioni.salvaNota?.(s, el.notaInput.value.trim()); el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); el.nota?.focus(); });
  el.chiudiNota?.addEventListener('click', () => { el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); el.nota?.focus(); });
  el.consenti?.addEventListener('click', () => { if (stato.richiesta) azioni.decidi?.(stato.richiesta.requestId, true); });
  el.nega?.addEventListener('click', () => { if (stato.richiesta) azioni.decidi?.(stato.richiesta.requestId, false); });
  el.annulla?.addEventListener('click', () => { const s = attiva(); if (s) azioni.chiudi?.(s.id); });
  if (el.url) {
    el.url.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const u = urlApribile(el.url.value); if (u) { azioni.apri?.(u); el.url.blur(); } else { el.url.setAttribute('aria-invalid', 'true'); mostraAvviso(t('Non è un indirizzo: scrivi un sito (es. localhost:5173 o example.org).')); } }
      if (e.key === 'Escape') { e.preventDefault(); el.url.value = attiva()?.url || ''; el.url.removeAttribute('aria-invalid'); el.url.blur(); }
    });
    el.url.addEventListener('focus', () => el.url.select());
    el.url.addEventListener('input', () => el.url.removeAttribute('aria-invalid'));
  }
  el.schede?.addEventListener('click', (e) => {
    // ⛔ 07/9 — prima la «X» era una MISURA: «sei negli ultimi 24 px della linguetta». Con una ✕
    //   vera il bersaglio è un elemento, e chi usa la tastiera o tocca lo schermo la trova come tutti.
    const x = e.target.closest?.('[data-browser-chiudi]');
    if (x) { e.preventDefault(); azioni.chiudi?.(x.dataset.browserChiudi); return; }
    const tab = e.target.closest?.('[data-browser-tab]'); if (!tab) return;
    const id = tab.dataset.browserId;
    if (e.ctrlKey || e.metaKey) azioni.chiudi?.(id); else azioni.seleziona?.(id);
  });
  /*
   * Il «+»: in un browser apre una scheda vuota col cursore nell'indirizzo. Qui non si crea una
   * scheda finta — si porta il fuoco nel campo e si svuota, così il primo tasto che premi scrive
   * l'indirizzo. La scheda nasce quando la pagina esiste, non prima.
   */
  el.nuovaScheda?.addEventListener('click', () => {
    if (!el.url) return;
    el.url.value = '';
    el.url.focus();
    el.url.removeAttribute('aria-invalid');
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

  function mostraAvviso(testo) { if (!el.avviso) return; el.avviso.textContent = testo || ''; el.avviso.hidden = !testo; }

  /*
   * La striscia delle schede, come in un browser: icona, titolo vero, la ✕ propria, e il «+» in coda
   * (nel markup, fuori dalla lista: dentro un `role="tablist"` non ci va altro che schede).
   * ⛔ 07/9 — prima era un `.talos-tabs__tab` con dentro l'etichetta della lettura, cioè «HTTP 200 ·
   *   https://…» ripetuto su ogni linguetta. Ricerca 07/09/2026 (Mobbin «Tab Bar UI», Eleken «Tabs UX
   *   best practices», Chrome «scrollable-tabstrip»): la scheda porta un nome riconoscibile, lo stato
   *   non si affida al solo colore, e quando non ci stanno più la striscia SCORRE invece di ridurre
   *   tutto a icone.
   */
  function renderizzaSchede() {
    if (!el.schede) return;
    const cornice = el.schede.closest('.talos-tabstrip');
    if (cornice) cornice.hidden = stato.schede.length === 0; // senza schede la lista vuota disegnava una pillola (taccuino, browser-1.png)
    el.schede.replaceChildren();
    const doc = el.schede.ownerDocument;
    stato.schede.forEach((s, i) => {
      const scheda = doc.createElement('div');
      scheda.className = 'talos-tabstrip__scheda';
      scheda.setAttribute('role', 'tab');
      scheda.dataset.browserTab = String(i); scheda.dataset.browserId = s.id;
      const sel = s.id === stato.attiva;
      scheda.setAttribute('aria-selected', String(sel)); scheda.tabIndex = sel ? 0 : -1;
      if (s.tipo === 'viva') scheda.dataset.stato = s.stato || 'pronta';

      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'i talos-tabstrip__icona'); svg.setAttribute('aria-hidden', 'true');
      const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', s.tipo === 'viva' ? '#i-globe' : '#i-doc'); // tua o letta dall'agente: si vede
      svg.append(use); scheda.append(svg);

      const nome = titoloScheda(s);
      const titolo = doc.createElement('span');
      titolo.className = 'talos-tabstrip__titolo'; titolo.textContent = nome;
      scheda.append(titolo);

      // lo stato si scrive solo quando c'è qualcosa da dire: 200 su sette schede non è informazione
      const http = statoHttpDiLettura(s);
      if (http !== null && (http < 200 || http >= 300)) {
        const pillola = doc.createElement('span');
        pillola.className = 'talos-tabstrip__stato'; pillola.textContent = String(http);
        scheda.append(pillola);
      }

      const chiudi = doc.createElement('button');
      chiudi.type = 'button'; chiudi.className = 'talos-tabstrip__chiudi'; chiudi.tabIndex = -1;
      chiudi.dataset.browserChiudi = s.id;
      chiudi.setAttribute('aria-label', t('Chiudi {titolo}', { titolo: nome }));
      const svgX = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgX.setAttribute('class', 'i'); svgX.setAttribute('aria-hidden', 'true');
      const useX = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
      useX.setAttribute('href', '#i-x'); svgX.append(useX); chiudi.append(svgX);
      scheda.append(chiudi);

      /* ⛔ 07/9, guardando lo screenshot: quando il nome della scheda è l'host, il fumetto diceva
         «www.iana.org/domains — https://www.iana.org/domains»: due volte la stessa cosa. */
      const indirizzoBreve = hostDaUrl(s.url) || s.url;
      scheda.dataset.tip = nome === indirizzoBreve ? s.url : `${nome} — ${s.url}`;
      scheda.dataset.tipLato = 'sotto'; // il fumetto va SOTTO: sopra copre la barra delle viste
      el.schede.append(scheda);
    });
    // la scheda attiva resta in vista quando la striscia scorre
    el.schede.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }


  /*
   * Il testo che ha letto l'agente. Se è il sorgente di una pagina si mostra ripulito (via codice,
   * stile, testa e navigazione) e il sorgente resta sotto, richiuso: è la verità che ha ricevuto il
   * modello, e non si nasconde. Se non è HTML si mostra com'è: non si tocca ciò che è già a posto.
   */
  function scriviTestoAcquisito(grezzo) {
    const contenitore = el.testo;
    if (!contenitore) return;
    contenitore.replaceChildren();
    if (!sembraHtml(grezzo)) { contenitore.textContent = grezzo; return; }
    const pulito = document.createElement('div');
    pulito.className = 'talos-browser__testo-pulito';
    pulito.textContent = testoLeggibile(grezzo);
    const dettaglio = document.createElement('details');
    dettaglio.className = 'talos-browser__sorgente';
    const riassunto = document.createElement('summary');
    const misure = riassuntoPulizia(grezzo);
    riassunto.textContent = misure
      ? t('Sorgente ricevuto dall’agente ({n} caratteri)', { n: misure.caratteriPrima.toLocaleString('it-IT') })
      : t('Sorgente ricevuto dall’agente');
    const pre = document.createElement('pre');
    pre.className = 'talos-browser__text';
    pre.textContent = grezzo;
    dettaglio.append(riassunto, pre);
    contenitore.append(pulito, dettaglio);
  }

  function renderizzaCornice(s) {
    if (!el.live) return;
    /*
     * ⛔ 06/9, owner: «la pagina del browser va renderizzata in HTML vero, se no che cazzo di browser
     * è?». Aveva ragione: una lettura dell'agente mostrava soltanto il testo acquisito — cioè, per una
     * pagina vera, il SORGENTE con i meta e la navigazione. Ora la lettura si apre come pagina, dal suo
     * indirizzo vero; il testo che ha letto il modello resta il secondo modo, perché e' quello che lui
     * ha davvero visto e serve a capire cosa ha capito.
     * ⛔ Se il sito rifiuta di stare in una cornice (X-Frame-Options / CSP frame-ancestors) non
     * arriva nessun `load`: dopo l'attesa si passa da soli al testo, dicendo perché. Mai una cornice
     * bianca senza spiegazione.
     */
    /*
     * ⛔ 07/9 — una pagina che vive nel BROWSER PILOTATO non si incornicia: il suo schermo arriva
     *   come fotogrammi, e la cornice qui accanto disegnerebbe sopra il rettangolo grigio di sempre.
     *   Visto nello screenshot: GitHub si vedeva davvero, ma sotto l'iframe rotto che gli stava
     *   sopra. Chi ha `viaVista === 'vivo'` ha già il suo schermo altrove.
     */
    const vuoleViva = s && s.tipo === 'viva' && s.stato !== 'bloccata' && s.viaVista !== 'vivo';
    // la lettura si incornicia solo se il server ha detto che quel sito si lascia incorniciare (vedi `corniceDellaLettura`)
    const vuoleLettura = s && s.tipo !== 'viva' && stato.modo === 'pagina' && Boolean(s.url) && /^https?:/i.test(s.url) && s.incorniciabile !== false;
    const vuole = vuoleViva || vuoleLettura;
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
      frame.src = s.proxata ? `${PROXY_BROWSER}${encodeURIComponent(s.url)}` : s.url; // un dev server locale passa dal proxy: stessa origine, annotabile
      frame.dataset.proxata = String(Boolean(s.proxata));
      if (s.tipo !== 'viva') {
        frame.dataset.caricata = 'no';
        frame.addEventListener('load', () => { frame.dataset.caricata = 'si'; mostraAvviso(''); }, { once: true });
        // Rete di sicurezza: la domanda al server qui sopra copre il caso normale, ma una pagina può
        // fallire per altro (rete, redirect infinito). ⛔ Non è una guardia sull'X-Frame-Options: lì
        // Chrome manda `load` sulla propria pagina d'errore e questa attesa non scatta mai (07/9).
        setTimeout(() => {
          if (!frame.isConnected || frame.dataset.caricata === 'si') return;
          stato.modo = 'testo';
          mostraAvviso(t('Questo sito non si lascia mostrare dentro TALOS. Qui sotto c’è il testo che ha letto l’agente.'));
          renderizza();
        }, 4000);
      }
      el.live.append(frame);
    }
  }

  /*
   * ⛔ 07/9, O-42 — owner (screenshot su github.com): al posto della pagina il rettangolo grigio
   *   dell'immagine rotta, mentre la lettura sopra diceva «HTTP 200 · 4116 caratteri»: il testo c'era,
   *   era la CORNICE a non mostrarlo. Il ripiego dopo quattro secondi non scattava, e misurando si
   *   vede perché: quando X-Frame-Options rifiuta, Chrome carica dentro la cornice la sua pagina di
   *   errore e spara un `load` regolare — la guardia lo legge come «caricata» e resta lì.
   * ⇒ Non si aspetta il fallimento: si prevede. Il server sa già leggere le intestazioni
   *   (`GET /api/v1/browser/incorniciabile`, in uso dal 06/9 per le pagine che apri tu): la stessa
   *   domanda si fa anche per una lettura dell'agente, PRIMA di incorniciare. Chi vieta la cornice va
   *   dritto al testo con una riga che dice perché.
   * @returns {string} l'avviso da mostrare, vuoto se non c'è niente da dire
   */
  function corniceDellaLettura(s) {
    if (!s || s.tipo === 'viva' || !s.url || !/^https?:/i.test(s.url)) return '';
    if (s.incorniciabile === undefined) { azioni.chiediCornice?.(s); return ''; }
    if (s.incorniciabile !== false) return '';
    if (stato.modo === 'pagina') stato.modo = 'testo';
    return `${t(s.motivoCornice || 'Questo sito non si lascia mostrare dentro TALOS')}. ${t('Qui sotto c’è il testo che ha letto l’agente.')}`;
  }

  function renderizza() {
    const s = attiva();
    const avvisoCornice = corniceDellaLettura(s);
    const letture = stato.schede.filter((x) => x.tipo !== 'viva').length;
    const vive = stato.schede.length - letture;
    if (el.riepilogo) el.riepilogo.textContent = stato.schede.length === 0 ? t(TESTI.riepilogoVuoto) : (vive === 0 ? TESTI.riepilogoLetture(letture) : TESTI.riepilogoMisto(letture, vive));
    renderizzaSchede();
    const i = indiceAttiva();
    if (el.indietro) el.indietro.disabled = i <= 0;
    if (el.avanti) el.avanti.disabled = i < 0 || i >= stato.schede.length - 1;
    if (el.url && document.activeElement !== el.url) el.url.value = s?.url || '';
    if (el.fuori) el.fuori.disabled = !s || !/^https?:\/\//i.test(s.url);
    for (const b of [el.rileggi, el.annota, el.nota, el.copia]) if (b) b.disabled = !s;
    if (el.copia) el.copia.disabled = !s || s.tipo === 'viva';
    if (el.rileggi) el.rileggi.title = t(s?.tipo === 'viva' ? 'Ricarica la pagina nella cornice' : 'Prepara nel composer la richiesta di rileggere questa pagina');
    if (el.posizione) {
      el.posizione.textContent = !s ? '' : s.tipo === 'viva' ? t(s.stato === 'caricamento' ? TESTI.posizioneCaricamento : s.stato === 'bloccata' ? TESTI.posizioneBloccata : TESTI.posizioneViva) : TESTI.posizioneLettura(stato.schede.filter((x) => x.tipo !== 'viva').indexOf(s) + 1, letture);
    }
    // stati
    const richiesta = stato.richiesta;
    if (el.bloccato) { el.bloccato.hidden = !richiesta; if (richiesta && el.bloccatoTesto) el.bloccatoTesto.textContent = t('L’agente chiede di leggere {url}. La scelta vale per questa richiesta.', { url: richiesta.url }); }
    if (el.caricamento) el.caricamento.hidden = !(s && s.tipo === 'viva' && s.stato === 'caricamento');
    if (el.vuoto) el.vuoto.hidden = stato.schede.length > 0;
    // l'articolo resta per le note anche su una pagina viva: si nascondono solo testata e testo acquisito
    if (el.articolo) el.articolo.hidden = !s;
    /* ⛔ 07/9 — la testata non è più un `header` sopra la pagina: è il pezzo piccolo dentro la riga
       dei modi (owner: «più piccolo, così la finestra del browser è più grande»). Si nasconde lo stesso
       su una pagina viva, dove il titolo lo dice già la scheda. */
    const testata = el.titolo?.closest('.talos-browser__testata'); if (testata) testata.hidden = !s || s.tipo === 'viva';
    const lettura = Boolean(s) && s.tipo !== 'viva';
    // i due modi valgono solo per una lettura dell'agente: una pagina viva e' gia' una pagina
    for (const b of el.modi || []) {
      b.hidden = !lettura;
      const suo = b.dataset.browserModo === stato.modo;
      b.setAttribute('aria-pressed', String(suo));
      b.classList.toggle('talos-button--secondary', suo);
      b.classList.toggle('talos-button--ghost', !suo);
    }
    if (el.testo) el.testo.hidden = !lettura || stato.modo === 'pagina';
    if (lettura) {
      if (el.titolo) el.titolo.textContent = titoloDaLettura(s);
      if (el.provenienza) el.provenienza.textContent = formattaProvenienza(s);
      if (el.testo && stato.modo !== 'pagina') scriviTestoAcquisito(s.testo || '');
    }
    /*
     * ⛔ 07/9, guardando lo screenshot di un dominio inesistente: il rimedio era «Chiedi all'agente
     *   di leggerla: usa Rileggi» — falso. Se il nome del sito non esiste, non può leggerla nemmeno
     *   l'agente: il consiglio manda a sbattere una seconda volta. Il rimedio dipende dal MOTIVO.
     */
    const rimedioPerIlMotivo = (motivo) => {
      const m = String(motivo || '');
      if (/non esiste|ERR_NAME/i.test(m)) return t('Controlla l’indirizzo.');
      if (/certificato|SSL|TLS/i.test(m)) return t('Il sito ha un certificato non valido: aprilo fuori da TALOS se ti fidi.');
      if (/non ha risposto in tempo|timed out/i.test(m)) return t('Riprova fra un momento.');
      if (/Nessuno risponde/i.test(m)) return t('Controlla che il servizio sia acceso.');
      return `${t(TESTI.chiediAllAgente)}: usa «Rileggi».`;
    };
    mostraAvviso(avvisoCornice || (s?.tipo === 'viva' && s.stato === 'bloccata' ? `${s.motivo || t('Il sito non consente di essere mostrato dentro TALOS')}. ${rimedioPerIlMotivo(s.motivo)}` : ''));
    renderizzaCornice(s);
    // nota
    const nota = s ? stato.note[s.url] : '';
    if (el.notaSalvata) { el.notaSalvata.hidden = !nota; el.notaSalvata.textContent = nota ? t('Nota: {nota}', { nota }) : ''; }
    if (!s || (el.editorNota && !el.editorNota.hidden && el.editorNota.dataset.browserId !== s.id)) { if (el.editorNota) el.editorNota.hidden = true; el.nota?.setAttribute('aria-expanded', 'false'); }
    if (el.editorNota && s) el.editorNota.dataset.browserId = s.id;
    if (el.limiti) el.limiti.textContent = t(vive > 0 ? TESTI.limitiVive : TESTI.limitiLetture);
    // il pannello dei commenti: solo su una pagina viva proxata
    /* ⛔ 07/9 — la stessa condizione stava scritta in DUE posti con due valori diversi: qui «solo
       proxata» e sul pulsante «proxata o viva». Risultato: il pulsante accendeva il modo e il
       pannello lo dichiarava spento, senza che nessuno dei due mentisse per conto proprio.
       Una condizione, un posto: chi la cambia non può dimenticarne metà. */
    const annotabile = paginaAnnotabile(s);
    if (el.annotazioni) {
      const lista = annotabile ? (stato.annotazioni[s.id] || []) : [];
      if (!annotabile) { el.annotazioni.hidden = true; } else {
        renderizzaAnnotazioni(el.annotazioni, {
          annotazioni: lista, attivo: stato.annotaAttivo,
          onAttiva: (on) => azioni.annota?.(s, on), onNota: (i, testo) => azioni.notaAnnotazione?.(s, i, testo), onTogli: (i) => { dialogaConOverlay({ tipo: 'togli', numero: i + 1 }); azioni.togliAnnotazione?.(s, i); },
          onSvuota: () => { dialogaConOverlay({ tipo: 'svuota' }); azioni.svuotaAnnotazioni?.(s); }, onInvia: () => azioni.inviaAnnotazioni?.(s),
        });
        el.annotazioni.hidden = false;
      }
    }
    if (el.annota) { el.annota.setAttribute('aria-pressed', String(annotabile && stato.annotaAttivo)); el.annota.title = annotabile ? t('Segna gli elementi della pagina da cambiare: i commenti finiscono nel composer') : t('Prepara una bozza nella chat senza inviarla'); }
    dialogaConOverlay({ tipo: 'annota', attivo: annotabile && stato.annotaAttivo });
  }

  return {
    /** @param {{schede?:Array, attiva?:string|null, note?:object, richiesta?:object|null}} nuovo */
    aggiorna(nuovo) { stato = { ...stato, ...nuovo }; if (stato.annotaAttivo && stato.annotazioni && Object.values(stato.annotazioni).flat().length >= MASSIMO_ANNOTAZIONI) stato.annotaAttivo = false; renderizza(); },
    fuocoSullaScheda() { el.schede?.querySelector('[aria-selected="true"]')?.focus(); },
    get stato() { return stato; },
  };
}
