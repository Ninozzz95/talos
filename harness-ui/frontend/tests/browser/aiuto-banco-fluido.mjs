/*
 * ⭐ 22/10/2026 — GLI STRUMENTI DEL BANCO DELLO STREAMING FLUIDO (owner: «lo streaming del testo è molto scattoso … in
 *   conversazioni lunghe non deve scattare»). Un file solo, usato dal banco (`banco-streaming-fluido.spec.mjs`) e dalla sonda del
 *   giro vero sulla 4176: le due misure devono contare la STESSA cosa, o un confronto fra loro non vuol dire niente.
 *
 * ⛔ COSA SI MISURA, e perché proprio questo. Il 20/09/2026 la misura che l'owner chiamava «scattoso» era la CRESCITA VISIBILE
 *   PER FOTOGRAMMA (p50 0, p90 85, max 120 caratteri, metà dei fotogrammi a zero) mentre i fotogrammi restavano a 60 al secondo:
 *   lo scatto stava nel RITMO, e la sola distribuzione degli intervalli fra fotogrammi non lo vede. Qui si campionano a OGNI
 *   fotogramma tre lunghezze dello stesso messaggio:
 *     · `arrivato` — il testo grezzo ricevuto dal filo (`testoGrezzoMessaggi`);
 *     · `mostrato` — il testo grezzo che il renderer ha deciso di rivelare (`renderIncrementale.mostrato`);
 *     · `visibile` — i caratteri a schermo (`.assistant-copy` → `textContent`), cioè ciò che la persona vede crescere.
 *   Più gli ARRIVI con il loro orario (dal filo vero, o dal pilota del banco), così il RITARDO del testo a schermo rispetto al suo
 *   arrivo si misura carattere per carattere, non a occhio.
 * ⛔ Il LAVORO di un fotogramma si stima con la forma classica «rAF → messaggio dopo il disegno»: il campionatore parte in testa
 *   al fotogramma, e un `MessageChannel` postato lì gira dopo la fase di aggiornamento del disegno (stile, layout, pittura). La
 *   differenza contiene il nostro flush e il lavoro di layout che provoca. È una stima, ma è la STESSA nei due bracci di un A/B.
 */

/** Il campionatore, da passare a `page.addInitScript` (gira nella pagina, prima dei suoi script). */
export function campionatoreInPagina() {
  if (window.__bancoFluido) return;
  const stato = { attivo: false, mid: null, fotogrammi: [], arrivi: [], fineFilo: {}, lunghi: [], loaf: [], lavori: [] };
  window.__bancoFluido = stato;

  /* Gli arrivi dal filo vero: l'app legge l'SSE con `source.onmessage = …`; il setter si avvolge e l'orario si prende PRIMA del
     gestore dell'app. Il pilota del banco sintetico registra da sé (`registraArrivo`). */
  const ES = window.EventSource;
  if (ES && !ES.__bancoFluido) {
    class EventSourceMisurato extends ES {
      set onmessage(gestore) {
        super.onmessage = typeof gestore === 'function'
          ? (messaggio) => { registraFilo(messaggio); return gestore.call(this, messaggio); }
          : gestore;
      }
      get onmessage() { return super.onmessage; }
    }
    EventSourceMisurato.__bancoFluido = true;
    window.EventSource = EventSourceMisurato;
  }
  function registraFilo(messaggio) {
    const t = performance.now();
    const dati = messaggio?.data;
    if (typeof dati !== 'string') return;
    if (dati.includes('"TextMessageContent"')) {
      try { const e = JSON.parse(dati); stato.arrivi.push({ t, mid: e.messageId, n: typeof e.delta === 'string' ? e.delta.length : 0 }); } catch { /* una riga illeggibile non è un arrivo */ }
    } else if (dati.includes('"TextMessageEnd"')) {
      try { const e = JSON.parse(dati); stato.fineFilo[e.messageId] = t; } catch { /* idem */ }
    }
  }
  stato.registraArrivo = (mid, n) => { stato.arrivi.push({ t: performance.now(), mid, n }); };
  stato.registraFine = (mid) => { stato.fineFilo[mid] = performance.now(); };

  try {
    new PerformanceObserver((lista) => { for (const v of lista.getEntries()) stato.lunghi.push({ t: v.startTime, d: v.duration }); }).observe({ type: 'longtask', buffered: false });
  } catch { /* non supportato: resta vuoto, e il rapporto lo dichiara */ }
  try {
    new PerformanceObserver((lista) => {
      for (const v of lista.getEntries()) stato.loaf.push({ t: v.startTime, d: v.duration, b: v.blockingDuration || 0, stile: v.styleAndLayoutStart ? (v.startTime + v.duration - v.styleAndLayoutStart) : 0 });
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch { /* idem */ }

  const canale = new MessageChannel();
  let inizioFotogramma = 0;
  canale.port1.onmessage = () => { if (stato.attivo) stato.lavori.push(Math.round((performance.now() - inizioFotogramma) * 100) / 100); };

  function bersaglio(rs) {
    if (stato.mid) return stato.mid;
    let ultimo = null;
    for (const [id, el] of rs.messageElements) if (el.classList?.contains('is-streaming')) ultimo = id;
    return ultimo;
  }
  function tick() {
    if (!stato.attivo) return;
    const t = performance.now();
    inizioFotogramma = t;
    canale.port2.postMessage(0);
    const rs = window.__talosHarnessUiRuntime?.realSessionState;
    const mid = rs ? bersaglio(rs) : null;
    if (mid) {
      const arrivato = rs.testoGrezzoMessaggi.get(mid)?.length ?? 0;
      const mostrato = rs.renderIncrementale?.get(mid)?.mostrato ?? 0;
      const copia = rs.messageElements.get(mid)?.querySelector('.assistant-copy');
      const visibile = copia ? copia.textContent.length : 0;
      stato.fotogrammi.push([Math.round(t * 100) / 100, mid, arrivato, mostrato, visibile]);
    } else {
      stato.fotogrammi.push([Math.round(t * 100) / 100, null, 0, 0, 0]);
    }
    requestAnimationFrame(tick);
  }
  stato.avvia = (mid = null) => {
    stato.mid = mid; stato.fotogrammi = []; stato.lavori = []; stato.lunghi = []; stato.loaf = [];
    if (mid) stato.arrivi = stato.arrivi.filter((a) => a.mid === mid);
    stato.attivo = true;
    requestAnimationFrame(tick);
  };
  stato.ferma = () => { stato.attivo = false; };
  stato.scarica = () => ({
    fotogrammi: stato.fotogrammi, arrivi: stato.arrivi, fineFilo: stato.fineFilo,
    lunghi: stato.lunghi, loaf: stato.loaf, lavori: stato.lavori,
    log: typeof window.talosStreamingLog === 'function' ? window.talosStreamingLog() : [],
  });
}

const quantile = (valori, q) => {
  if (!valori.length) return 0;
  const s = [...valori].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const tondo = (n, cifre = 1) => Math.round(n * 10 ** cifre) / 10 ** cifre;
export const distribuzione = (valori) => ({
  n: valori.length, p50: tondo(quantile(valori, 0.5)), p90: tondo(quantile(valori, 0.9)), p95: tondo(quantile(valori, 0.95)),
  p99: tondo(quantile(valori, 0.99)), max: tondo(valori.length ? Math.max(...valori) : 0),
});

/**
 * Dai campioni grezzi ai numeri del rapporto. `mid` è il messaggio misurato; la «finestra viva» va dal primo carattere visibile
 * a quando il testo ricevuto è tutto a schermo.
 */
export function analizza(grezzo, mid) {
  const fotogrammi = grezzo.fotogrammi.filter((f) => f[1] === mid);
  const arrivi = grezzo.arrivi.filter((a) => a.mid === mid);
  let cumulato = 0;
  const arriviCumulati = arrivi.map((a) => { cumulato += a.n; return { t: a.t, fino: cumulato }; });
  const totale = cumulato;
  const tFineFilo = grezzo.fineFilo?.[mid] ?? (arriviCumulati.at(-1)?.t ?? 0);
  const iPrimo = fotogrammi.findIndex((f) => f[4] > 0);
  const iCompleto = fotogrammi.findIndex((f) => totale > 0 && f[3] >= totale && f[2] >= totale);
  const vivi = iPrimo >= 0 ? fotogrammi.slice(iPrimo, iCompleto >= 0 ? iCompleto + 1 : undefined) : [];

  /* crescita visibile per fotogramma, e i fotogrammi fermi MENTRE c'era testo arrivato e non ancora mostrato */
  const crescite = [];
  let fermiConArretrato = 0;
  let conArretrato = 0;
  let pausaMax = 0;
  let pausaMaxConArretrato = 0;
  let ultimaCrescita = vivi[0]?.[0] ?? 0;
  let ultimaCrescitaConArretrato = ultimaCrescita;
  for (let i = 1; i < vivi.length; i += 1) {
    const [t, , arrivato, mostrato, visibile] = vivi[i];
    const d = visibile - vivi[i - 1][4];
    crescite.push(d);
    const arretrato = arrivato - mostrato > 0 || vivi[i - 1][2] - vivi[i - 1][3] > 0;
    if (arretrato) { conArretrato += 1; if (d <= 0) fermiConArretrato += 1; }
    if (d > 0) {
      pausaMax = Math.max(pausaMax, t - ultimaCrescita);
      ultimaCrescita = t;
      ultimaCrescitaConArretrato = t;
    } else if (!arretrato) {
      ultimaCrescitaConArretrato = t; // nessun arretrato: il silenzio è del fornitore, non nostro
    } else {
      pausaMaxConArretrato = Math.max(pausaMaxConArretrato, t - ultimaCrescitaConArretrato);
    }
  }
  const positive = crescite.filter((d) => d > 0);
  const medianaPos = quantile(positive, 0.5) || 1;

  /* ritardo a schermo: per ogni arrivo, il primo fotogramma in cui il renderer mostra fin lì */
  const ritardi = [];
  let j = 0;
  for (const a of arriviCumulati) {
    while (j < fotogrammi.length && (fotogrammi[j][0] < a.t || fotogrammi[j][3] < a.fino)) j += 1;
    if (j >= fotogrammi.length) break;
    ritardi.push(fotogrammi[j][0] - a.t);
  }
  /* coda dopo la fine del filo: quanto testo resta da mostrare e per quanto */
  const fCompleto = iCompleto >= 0 ? fotogrammi[iCompleto][0] : null;

  const intervalli = [];
  for (let i = 1; i < vivi.length; i += 1) intervalli.push(vivi[i][0] - vivi[i - 1][0]);
  const tInizio = vivi[0]?.[0] ?? 0;
  const tFine = vivi.at(-1)?.[0] ?? 0;
  const dentro = (x) => x.t >= tInizio && x.t <= tFine;

  /* il costo del render secondo il log del prodotto, per lunghezza del messaggio (deve restare PIATTO) */
  const render = (grezzo.log || []).filter((r) => r.evento === 'render' && r.messageId === mid);
  const perLunghezza = {};
  for (const r of render) {
    const fascia = `${Math.floor((r.testoLen || 0) / 5000) * 5}k`;
    (perLunghezza[fascia] ||= []).push(Number(r.durataMs) || 0);
  }

  return {
    caratteri: totale,
    arrivi: arrivi.length,
    durataFiloMs: arriviCumulati.length ? Math.round(arriviCumulati.at(-1).t - arriviCumulati[0].t) : 0,
    fotogrammiVivi: vivi.length,
    crescitaPerFotogramma: { ...distribuzione(crescite), zeri: crescite.filter((d) => d <= 0).length },
    salti: positive.filter((d) => d > 3 * medianaPos).length,
    fotogrammiFermiConArretrato: conArretrato ? tondo((fermiConArretrato / conArretrato) * 100) : 0,
    pausaVisibileMaxMs: tondo(pausaMax),
    pausaVisibileMaxConArretratoMs: tondo(pausaMaxConArretrato),
    ritardoMs: distribuzione(ritardi),
    codaDopoLaFineMs: fCompleto === null ? null : tondo(Math.max(0, fCompleto - tFineFilo)),
    intervalloFotogrammiMs: distribuzione(intervalli),
    lavoroFotogrammaMs: distribuzione(grezzo.lavori || []),
    longTask: { n: grezzo.lunghi.filter(dentro).length, totaleMs: Math.round(grezzo.lunghi.filter(dentro).reduce((s, x) => s + x.d, 0)) },
    loafOltre50: grezzo.loaf.filter(dentro).length,
    renderMs: { ...distribuzione(render.map((r) => Number(r.durataMs) || 0)), quanti: render.length },
    renderPerLunghezzaP95: Object.fromEntries(Object.entries(perLunghezza).map(([k, v]) => [k, tondo(quantile(v, 0.95), 2)])),
  };
}
