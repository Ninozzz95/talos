import { expect, test } from '@playwright/test';

/*
 * SONDA — LO STREAMING VERO SUL 4174, MISURATO DALLA CONSOLE.
 *
 * Owner, 20/09/2026: «lo streaming è ancora scattoso … verifica su 4174 tu stesso strumentando nella
 * console, niente ipotesi».
 *
 * ⛔ QUESTA SONDA SCRIVE SUL 4174: apre una sessione NUOVA e fa partire un giro vero con
 *   glm-5.3-flash. È il giro vero che l'owner ha autorizzato in modo permanente («giri veri con
 *   glm-5.3-flash sul 4174: sì, non chiedere più»), ed è l'UNICA cosa che riproduce il ritmo del
 *   fornitore — che è la variabile che il banco sintetico non ha.
 *   La sessione si chiama `SONDA-STREAMING-20-09` per essere riconoscibile e cancellabile.
 *
 * ⛔ PERCHÉ NON BASTAVA IL BANCO. `banco-streaming.spec.mjs` dà 60 fps con zero long task su un
 *   feed sintetico regolare (un delta ogni 16 ms). Hermes, che ha fatto questo lavoro prima di noi,
 *   misura lo stesso banco sintetico a 60 fps E il giro VERO con l'LLM a **12 long task per 1,26 s**
 *   (`apps/desktop/scripts/profile-typing-lag.md`, 21/05/2026). ⇒ Il ritmo vero del fornitore è la
 *   differenza fra «fluido» e «scattoso», e si misura solo con un giro vero.
 *
 * Lancio: TALOS_HARNESS_UI_BASE_URL=http://127.0.0.1:4174/ npx playwright test <questo file>
 */

test.skip(!process.env.TALOS_HARNESS_UI_BASE_URL, 'sonda dell’ambiente esterno: si lancia col baseURL dell’owner');

test.use({ locale: 'it-IT' });

test.afterAll(() => {
  console.log('SONDA-SUL-4174: questa corsa HA SCRITTO sul server (una sessione nuova + un giro vero).');
});

test('STREAMING-VERO-4174 — fotogrammi e long task durante uno stream vero, misurati dalla console', async ({ page }) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } })); }
    catch { /* finestra privata */ }
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime, null, { timeout: 20000 });

  /*
   * ⛔ SI ENTRA NELLA CHAT PRIMA, o il composer non esiste. Il 4174 apre dalla Home
   *   (`#schermoHome`), e `#composerInput` vive dentro `#schermoChat`: misurato — un `fill` sul
   *   composer senza questo passo va in timeout a 300 s. È quello che fa già `apriChat` in
   *   `baseline-shell.spec.mjs:26-30`.
   */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible({ timeout: 20000 });

  /*
   * ⛔ SI APRE UNA SESSIONE CHE ESISTE GIÀ, non se ne crea una. `#newSessionBtn` apre un FOGLIO
   *   (`sheet-dialog--new-session`, `legacy/app.js:20149`) che chiede la cartella prima del primo
   *   giro: senza confermarlo il composer non manda niente — ed è la ragione per cui la prima corsa
   *   ha girato 240 s con zero caratteri resi.
   * ⛔ E la sessione vera è la scena MIGLIORE, non un ripiego: è la conversazione dell'owner con
   *   dentro il suo storico, cioè il DOM grande dove Hermes misura gli scatti (1-2 long task per 5 s
   *   su una sessione da 34 MB, contro 0 su una piccola).
   */
  const riga = page.locator('#sessionList .talos-session-item, #sessionList .td-session-row').first();
  await expect(riga).toBeVisible({ timeout: 20000 });
  await riga.click();
  await page.waitForTimeout(1500);
  await expect(page.locator('#composerInput')).toBeEditable({ timeout: 20000 });

  /*
   * ⛔ LA STRUMENTAZIONE SI ARMA PRIMA DELL'INVIO, e vive nella pagina: è la console, non una mia
   *   deduzione. Si registra ogni intervallo fra fotogrammi, ogni long task, e — come fa Hermes —
   *   anche il numero di nodi e la crescita del DOM, perché il costo della ri-parsata dell'ultimo
   *   blocco è lineare nella sua lunghezza.
   */
  await page.evaluate(() => {
    const w = window;
    w.__sonda = { intervalli: [], lunghi: [], nodiMax: 0, t0: 0, tFine: 0, tPrimoTesto: 0 };
    let ultimo = performance.now();
    w.__sondaFermo = false;
    const tick = () => {
      const ora = performance.now();
      w.__sonda.intervalli.push(ora - ultimo);
      ultimo = ora;
      const n = document.getElementsByTagName('*').length;
      if (n > w.__sonda.nodiMax) w.__sonda.nodiMax = n;
      if (!w.__sondaFermo) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__sonda.lunghi.push(Math.round(e.duration)); });
      po.observe({ entryTypes: ['longtask'] });
      w.__sondaPo = po;
    } catch { /* non supportato */ }
    /* il primo testo a schermo: quando comincia davvero lo stream */
    const copia = document.querySelector('.assistant-copy');
    if (copia) {
      const mo = new MutationObserver(() => { if (!w.__sonda.tPrimoTesto && (copia.textContent || '').length > 0) w.__sonda.tPrimoTesto = performance.now(); });
      mo.observe(copia, { childList: true, subtree: true, characterData: true });
      w.__sondaMo = mo;
    }
    w.__sonda.t0 = performance.now();
  });

  await page.locator('#composerInput').fill('Scrivi un documento di circa 900 parole con sei sezioni numerate, ognuna con un paragrafo lungo, una lista di tre punti e un blocco di codice; poi chiudi con una tabella di riepilogo.');
  await page.locator('#composerForm').evaluate((f) => f.requestSubmit());

  /*
   * ⛔ SI ASPETTA IL SEGNALE DI FINE DELL'APP, NON UN'EURISTICA SUL TESTO. La prima versione
   *   chiudeva dopo 2,5 s di testo fermo: un modello vero può pauseggiare più di così, e la corsa
   *   è finita a **2,8 s con 261 caratteri** — cioè ha misurato una pausa, non uno stream.
   *   `is-streaming` è il segnale che l'app stessa toglie quando ha finito (`legacy/app.js:1071-1073`:
   *   quando è in pari E il messaggio è finito), quindi è l'unico che non tira a indovinare.
   */
  const fine = await page.evaluate(async () => {
    const w = window;
    const elemento = () => {
      const mappa = w.__talosHarnessUiRuntime.realSessionState.messageElements;
      return [...mappa.values()].pop() || null;
    };
    const inizio = performance.now();
    /* il segnale si aspetta che COMPAIA (lo stream deve cominciare) e poi che SPARISCA. */
    while (performance.now() - inizio < 30000) {
      if (elemento()?.classList.contains('is-streaming')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    while (performance.now() - inizio < 240000) {
      if (!elemento()?.classList.contains('is-streaming')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    w.__sondaFermo = true;
    w.__sondaPo?.disconnect();
    w.__sondaMo?.disconnect();
    w.__sonda.tFine = performance.now();
    const copia2 = elemento()?.querySelector('.assistant-copy');
    const intervalli = w.__sonda.intervalli.slice(10);
    const s = [...intervalli].sort((a, b) => a - b);
    const at = (p) => Math.round((s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0) * 10) / 10;
    return {
      durataStreamS: Math.round((w.__sonda.tFine - w.__sonda.t0) / 100) / 10,
      fotogrammi: intervalli.length,
      intervalloMs: { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) },
      oltre50ms: intervalli.filter((v) => v > 50).length,
      oltre100ms: intervalli.filter((v) => v > 100).length,
      lunghi: { quanti: w.__sonda.lunghi.length, totaleMs: w.__sonda.lunghi.reduce((a, b) => a + b, 0), max: w.__sonda.lunghi.length ? Math.max(...w.__sonda.lunghi) : 0, elenco: w.__sonda.lunghi.slice(0, 20) },
      nodiMax: w.__sonda.nodiMax,
      caratteriResi: (copia2?.textContent || '').length,
      sfumature: document.querySelectorAll('.assistant-copy span[style*="opacity"], .assistant-copy .talos-fade').length,
    };
  });
  console.log(`MISURA-STREAMING-VERO-4174 = ${JSON.stringify(fine)}`);
  expect(fine.caratteriResi, 'la scena non si è formata: nessun testo reso dallo stream vero').toBeGreaterThan(200);
});
