import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BANCO DI MISURA DELLO STREAMING — quanto costa, davvero, il percorso caldo.
 *
 * Owner, 20/09/2026: «nella app release lo streaming del testo è ancora un po' scattoso … facendo in
 * modo che sia fulminea». Il piano prevedeva un banco **prima** e **dopo** la cura: questo è il
 * banco.
 *
 * ⛔ PERCHÉ NON CI SI FIDA DELLA DIAGNOSI SCRITTA NEL PIANO. La ricognizione diceva che la coda
 *   markdown aperta è ri-parsata INTERA a ogni frame. Rileggendo il codice il 20/09/2026,
 *   `renderizzaMarkdownIncrementale` (`legacy/app.js:2486`) fa già la cosa giusta — parsata una
 *   volta del prefisso stabile, append incrementale, e ri-parsata della SOLA coda — e la prova
 *   `LAG-LIVE-INCREMENTAL-40` lo conferma: i blocchi chiusi NON vengono ricreati.
 *   ⇒ Il costo va **misurato**, non dedotto da una diagnosi che può essere invecchiata.
 *
 * ⛔ E si misura la cosa che l'owner chiama «scattoso»: la distribuzione degli INTERVALLI FRA I
 *   FOTOGRAMMI mentre il testo scorre, più i **long task** (il lavoro che supera i 50 ms e blocca il
 *   disegno). Non il tempo totale: quello dice quanto dura, non se si vede a strappi.
 *
 * ⛔ LA SCENA: un messaggio lungo (≈13.000 caratteri: intestazioni, paragrafi lunghi, una lista e un
 *   **fence aperto** che resta aperto fino alla fine, che è il caso peggiore dichiarato), inviato in
 *   delta da ~40 caratteri ogni 16 ms — cioè un fornitore veloce. Le tre modalità di animazione:
 *   `fade` (la predefinita), `typewriter`, `none`.
 */

async function apriChat(page) {
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
}

/* ⛔ Una FUNZIONE vera, non una stringa: con la stringa Playwright valuta l'espressione e
   restituisce l'oggetto funzione, che non è serializzabile — `undefined`, e la prova non misura
   niente (è successo: le tre modalità hanno stampato `undefined`). Le sonde di geometria potevano
   usare la stringa perché erano IIFE senza argomenti. */
async function misura({ modo, turniPrima }) {
  const runtime = window.__talosHarnessUiRuntime;
  (window.__talosHarnessHost || document.documentElement).dataset.talosStreamingAnimation = modo;
  runtime.passaASessione('banco-stream', 'workspace', 'Banco', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
  const generation = runtime.realSessionState.generation;
  let seq = 40000;
  const invia = (delta, id) => runtime.handleRealEvent({ type: 'TextMessageContent', messageId: id, delta, _sequenza: seq += 1 }, generation);

  /*
   * ⛔ LA CONVERSAZIONE LUNGA, che è la scena che il primo giro NON aveva. Il costo di `scrollStreamingOutput`
   *   (due `getBoundingClientRect` più `scrollHeight` per fotogramma, `legacy/app.js:791`) dipende dalla
   *   GRANDEZZA del DOM, non dalla lunghezza del messaggio che sta scorrendo: in una chat con un solo
   *   messaggio quelle letture costano niente, in una con cinquanta costano quello che costano. Si
   *   costruiscono `turniPrima` turni CONCLUSI prima di misurare.
   */
  for (let t = 0; t < turniPrima; t += 1) {
    const id = 'prec-' + t;
    const pezzo = 'Turno ' + t + ': ' + 'una frase di riempimento con **grassetto** e `codice`. '.repeat(30);
    for (const d of (pezzo.match(/[\s\S]{1,80}/g) || [])) invia(d, id);
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: id, _sequenza: seq += 1 }, generation);
  }
  await new Promise((r) => setTimeout(r, 400));

  const mid = 'banco-1';
  /* la scena: ~13.000 caratteri, col fence aperto fino alla fine (il caso peggiore dichiarato) */
  const periodo = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ';
  const testa = [];
  for (let i = 0; i < 20; i += 1) testa.push('## Sezione ' + i + '\n\n' + periodo.repeat(5) + '\n\n- uno\n- due\n\n');
  const testo = testa.join('') + '```js\nfunction coda() {\n  return ' + '1 + '.repeat(200) + '0;\n}\n';
  const delta = testo.match(/[\s\S]{1,40}/g) || [];

  /* campionamento dei fotogrammi, e long task */
  const intervalli = [];
  let ultimo = performance.now();
  let vivo = true;
  const tick = () => { const ora = performance.now(); intervalli.push(ora - ultimo); ultimo = ora; if (vivo) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const lunghi = [];
  let osservatore = null;
  try { osservatore = new PerformanceObserver((l) => { for (const e of l.getEntries()) lunghi.push(Math.round(e.duration)); }); osservatore.observe({ entryTypes: ['longtask'] }); } catch { /* non supportato: resta vuoto, e si dichiara */ }

  const t0 = performance.now();
  /*
   * ⛔ IL CONTATORE CHE SERVE. Il pavimento di Hermes non riduce il costo di UN flush: riduce
   *   QUANTI flush ci sono, perché a 30-80 token/s un flush per fotogramma significa un commit e
   *   una ri-parsata markdown per OGNI token. La distribuzione dei fotogrammi, da sola, non lo vede:
   *   in una scena benigna resta a 60 fps in tutti e due i casi. Si contano quindi le RISCRITTURE
   *   del messaggio, con un osservatore sulle mutazioni del suo corpo.
   */
  let riscritture = 0;
  let osservatoreM = null;
  /*
   * ⛔⛔ E SI MISURA LA COSA CHE L'OWNER CHIAMA «SCATTOSO» DAVVERO: **quanti caratteri appaiono a
   *   ogni fotogramma**. Il ritmo (`avanzaRitmoStreaming`, `legacy/app.js:930`) fa
   *   `statoRender.mostrato = testo.length`: rivela TUTTO ciò che è arrivato, subito. Quindi il
   *   testo cresce seguendo gli SCATTI del fornitore — un burst da 200 caratteri è un salto — e la
   *   distribuzione degli intervalli fra fotogrammi NON lo vede, perché i fotogrammi restano a 60.
   *   ⇒ Si campiona la lunghezza del testo a ogni fotogramma e si guarda la distribuzione della
   *   CRESCITA. Se la crescita è a strappi, lo scatto è lì.
   */
  const crescite = [];
  let lunghezzaPrec = null;
  const passi = [];
  let mostratoPrec = null;
  let campionando = true;
  const campiona = () => {
    const c = runtime.realSessionState.messageElements.get(mid)?.querySelector('.assistant-copy');
    const n = c ? (c.textContent || '').length : null;
    if (n !== null) { if (lunghezzaPrec !== null) crescite.push(n - lunghezzaPrec); lunghezzaPrec = n; }
    /* il RIVELATO vero, che il ritmo controlla — separa il ritmo dal disegno del DOM */
    const sr = runtime.realSessionState.renderIncrementale?.get(mid);
    if (sr) { if (mostratoPrec !== null) passi.push(sr.mostrato - mostratoPrec); mostratoPrec = sr.mostrato; }
    if (campionando) requestAnimationFrame(campiona);
  };
  requestAnimationFrame(campiona);
  for (const d of delta) {
    invia(d, mid);
    /* ⛔ L'elemento del messaggio NASCE col primo delta: prenderlo prima darebbe `null` e il
       contatore resterebbe a zero per costruzione — misurato, ed era il caso. Si aggancia appena
       esiste. */
    if (!osservatoreM && typeof MutationObserver === 'function') {
      const c = runtime.realSessionState.messageElements.get(mid)?.querySelector('.assistant-copy');
      if (c) { osservatoreM = new MutationObserver((l) => { riscritture += l.length; }); osservatoreM.observe(c, { childList: true, subtree: true, characterData: true }); }
    }
    await new Promise((r) => setTimeout(r, 16));
  }
  const msInvio = performance.now() - t0;
  campionando = false;
  if (osservatoreM) osservatoreM.disconnect();
  runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: mid, _sequenza: seq += 1 }, generation);
  /*
   * ⛔ LA CODA SI ASPETTA FINO ALLA FINE, NON PER UN TEMPO FISSO. Il drenaggio del ritmo continua
   *   dopo la fine dello stream (è voluto) e il tetto per flush lo limita a ~900 caratteri al
   *   secondo: con la scena di questo banco (~13.600 caratteri alimentati a 2.500 al secondo) il
   *   recupero vuole secondi, e un'attesa fissa di 2 s misurava il banco, non la cura. Misurato:
   *   con 2 s fissi il testo risultava incompleto anche con la cura giusta.
   *   ⇒ Si aspetta che il RIVELATO raggiunga il testo arrivato, o che scada il tempo: è l'unica
   *   forma che dice la verità su «il testo si completa sempre».
   */
  const completato = await (async () => {
    const scadenza = performance.now() + 60000;
    while (performance.now() < scadenza) {
      const sr = runtime.realSessionState.renderIncrementale?.get(mid);
      const totale = runtime.realSessionState.testoGrezzoMessaggi?.get(mid)?.length ?? 0;
      if (sr && totale > 0 && sr.mostrato >= totale) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  })();
  vivo = false;
  if (osservatore) osservatore.disconnect();

  const copia = runtime.realSessionState.messageElements.get(mid)?.querySelector('.assistant-copy');
  const atteso = testo.replace(/[#*`\n-]/g, '').replace(/\s+/g, ' ').trim().length;
  const reso = (copia?.textContent || '').replace(/\s+/g, ' ').trim().length;
  const q = (a) => { const s = [...a].sort((x, y) => x - y); const at = (p) => Math.round((s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0) * 10) / 10; return { p50: at(0.5), p95: at(0.95), max: at(1) }; };
  const corpo = intervalli.slice(5);
  return {
    drenaggioCompleto: completato,
    caratteri: testo.length, delta: delta.length, msInvio: Math.round(msInvio), riscritture,
    percheLaModalita: { deferita: Boolean(runtime.realSessionState.deferHistoricalRendering), bodyReduce: document.body.classList.contains("reduce-motion"), rootReduce: document.documentElement.classList.contains("reduce-motion"), scelta: (window.__talosHarnessHost || document.documentElement).dataset.talosStreamingAnimation, mediaReduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches },
    passiRivelati: (() => { const s = [...passi].sort((a, b) => a - b); const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0; return { campioni: s.length, p50: at(0.5), p90: at(0.9), max: at(1), zeri: s.filter((v) => v === 0).length }; })(),
    crescitaCaratteri: (() => { const s = [...crescite].sort((a, b) => a - b); const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))] || 0; return { campioni: s.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: at(1), zeri: s.filter((v) => v === 0).length }; })(),
    fotogrammi: intervalli.length, intervalloMs: q(corpo),
    oltre50ms: corpo.filter((v) => v > 50).length,
    lunghi: { quanti: lunghi.length, totaleMs: lunghi.reduce((a, b) => a + b, 0), max: lunghi.length ? Math.max(...lunghi) : 0 },
    resoCaratteri: reso, attesoCaratteri: atteso, completo: atteso > 0 ? reso >= atteso * 0.98 : null,
  };
}

for (const [modo, turniPrima] of [['fade', 0], ['fade', 30], ['none', 30]]) {
  test(`BANCO-STREAMING (${modo}, ${turniPrima} turni prima) — costo del percorso caldo su uno stream da 13k caratteri`, async ({ page }) => {
    test.setTimeout(180000);
    await page.route('**/api/v1/sessions/banco-stream/events', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
    await apriChat(page);
    /* ⛔⛔ L'ARGOMENTO VA PASSATO COME OGGETTO, NON COME ARRAY: con l'array Playwright lo dà al
       PRIMO parametro, quindi `modo` diventava ["fade",0], la stringa risolta era "fade,0", e
       `modalitaAnimazioneStreaming` la scartava come sconosciuta ricadendo su NONE — cioè
       rivela-tutto. Il banco DICEVA «fade» e misurava «nessuna animazione»: una misura che non
       poteva smentirmi. Misurato: `scelta = "fade,0"`. */
    const esito = await page.evaluate(misura, { modo, turniPrima });
    console.log(`BANCO-STREAMING ${modo} turniPrima=${turniPrima} = ${JSON.stringify(esito)}`);
    /* ⛔ LE PREMESSE: se la scena non si è formata, i numeri non dicono niente. */
    expect(esito.caratteri, 'la scena non si è formata: il testo inviato è troppo corto').toBeGreaterThan(12000);
    expect(esito.delta, 'la scena non si è formata: nessun delta').toBeGreaterThan(200);
    expect(esito.resoCaratteri, 'niente è arrivato a schermo: lo stream non è stato reso').toBeGreaterThan(0);
    /* ⛔ E IL TESTO DEVE ESSERE COMPLETO: una cura che rende fluido perdendo testo non è una cura. */
    expect(esito.completo, `il testo a schermo non è completo: ${esito.resoCaratteri} caratteri resi su ~${esito.attesoCaratteri} attesi`).toBe(true);
  });
}
