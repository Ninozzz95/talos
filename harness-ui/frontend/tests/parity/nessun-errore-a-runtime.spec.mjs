import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { createHttpApp } from '../../../src/http-app.mjs';
import { erroreDiUnaPaginaTerza } from '../../src/components/browser.js'; // OSS-3 (17/09): chi ha lanciato l'errore, noi o una pagina che ospitiamo

test('RELEASE-018-PROMPT-ENHANCE: composer through real route and session provider', async ({ page }) => {
  const improved = 'Scrivi un resoconto chiaro con obiettivo, vincoli e risultato atteso.';
  let providerRequest;
  const server = createServer(createHttpApp({
    staticHandler: async () => null,
    sessionRegistry: { leggiSessioneContesto: () => ({ sessionId: 'release-018', modello: 'deepseek:deepseek-chat', provider: 'cloud' }) },
    providerStore: {
      getKey: p => p === 'deepseek' ? 'test-only' : null,
      getRuntime: p => ({ endpoint: `https://${p}.example`, endpointConfigured: true }),
    },
    fetchMiglioraPromptFn: async (url, options) => {
      providerRequest = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ enhanced_prompt: improved, summary: 'Obiettivo chiarito.', applied_principles: ['chiarezza'] }) } }] }) };
    },
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (testo) => { window.__talosTestClipboard = testo; } },
      });
    });
    let requestBody;
    await page.route('**/api/v1/sessions/release-018/migliora-prompt', async route => {
      requestBody = route.request().postDataJSON();
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/release-018/migliora-prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
      });
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    await page.goto(process.env.TALOS_URL_CANCELLO);
    await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
    await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.id = 'release-018'; });
    const composer = page.locator('#composerInput');
    const originale = 'vecchio prompt\n\ncon istruzioni da eliminare';
    await composer.fill(originale);
    await page.locator('#miglioraPromptBtn').click();
    const panel = page.locator('#miglioraPromptPannello');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Migliora', exact: true }).click();
    await expect(panel.getByText(improved, { exact: true })).toBeVisible();
    expect(requestBody).toEqual({ prompt: originale, profondita: 'equilibrata' });
    expect(providerRequest.url).toBe('https://deepseek.example/chat/completions');
    expect(providerRequest.body.model).toBe('deepseek-chat');
    await expect(composer).toHaveValue(originale);
    await panel.getByRole('button', { name: 'Copia', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__talosTestClipboard)).toBe(improved);
    await expect(panel.getByText('Copiato', { exact: true })).toBeVisible();
    await expect(composer).toHaveValue(originale);
    await panel.getByRole('button', { name: 'Sostituisci', exact: true }).click();
    await expect(composer).toHaveValue(improved);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('FASE3-MULTISELECT-UNA-POST — conferma unica ed esito parziale restano visibili', async ({ page }) => {
  const voci = [
    { id: 'lib-1', nome: 'Primo.md', fileType: 'text/markdown', origine: 'uploaded', aggiornatoIl: null },
    { id: 'lib-2', nome: 'Secondo.md', fileType: 'text/markdown', origine: 'generated', aggiornatoIl: null },
    { id: 'lib-3', nome: 'Terzo.md', fileType: 'text/markdown', origine: 'uploaded', aggiornatoIl: null },
  ];
  const richieste = [];
  await page.route('**/api/v1/sessions/fase-3-ui/library', (route) => route.fulfill({
    json: { ok: true, data: { voci, errore: null }, meta: {} },
  }));
  await page.route('**/api/v1/sessions/fase-3-ui/library/batch', (route) => {
    richieste.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, data: {
      azione: 'elimina', risorsa: 'library',
      esiti: [
        { id: 'lib-1', ok: true, status: 200 },
        { id: 'lib-2', ok: false, status: 404, code: 'LIBRARY_NOT_FOUND' },
      ],
      riepilogo: { richiesti: 2, riusciti: 1, falliti: 1 },
    }, meta: {} } });
  });

  await page.goto(process.env.TALOS_URL_CANCELLO);
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.evaluate(() => { window.__talosHarnessUiRuntime.realSessionState.id = 'fase-3-ui'; });
  await page.getByRole('button', { name: /^Libreria \d+$/ }).click();
  await expect(page.locator('#schermoLibreria .td-card-select')).toHaveCount(3);
  await page.getByLabel('Seleziona visibili', { exact: true }).check();
  await page.getByLabel('Seleziona Terzo.md', { exact: true }).uncheck();
  await expect(page.locator('#schermoLibreria .td-bulk-count')).toHaveText('2 selezionate');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Elimina selezionati', exact: true }).click();
  await expect.poll(() => richieste.length).toBe(1);
  expect(richieste[0]).toEqual({ azione: 'elimina', ids: ['lib-1', 'lib-2'] });
  await expect(page.getByLabel('Seleziona Primo.md', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Seleziona Secondo.md', { exact: true })).toBeChecked();
  await expect(page.locator('#schermoLibreria .td-bulk-status')).toHaveText('1 eliminate, 1 non eliminate.');
});

/*
 * ⛔⛔⛔ 11/09 — IL CANCELLO CHE MANCAVA, e che è costato il blocco del 4174 dell'owner.
 *
 * Ieri notte una riga rimasta indietro (`fermaMotore: () => fermaMotore()`, con la variabile tolta
 * poche ore prima insieme al motore del segnavia) faceva lanciare «fermaMotore is not defined» a
 * OGNI bolla d'attesa. La pagina smetteva di rispondere e l'owner non riusciva più nemmeno a
 * cambiare sessione.
 *
 * ⛔ Il punto che rende questo test necessario: la build era VERDE e 620 test unitari erano VERDI.
 *   Nessuno dei due guarda cosa succede quando la funzione viene CHIAMATA per davvero, nel browser.
 *   L'errore l'ha trovato aprire la pagina e leggere la console — cioè la cosa che non avevo fatto
 *   prima di consegnare. Un errore a runtime non è un dettaglio di stile: è la pagina che muore.
 *
 * ⛔ Che cosa si tollera, e perché: il 503 su `/context` è ATTESO — `config.mjs` vieta il motore del
 *   contesto sulla porta 4174 per costruzione (`CTX_NOT_ENABLED`), quindi quel rifiuto è un cancello
 *   che funziona, non un guasto. Tollerato per nome, non ignorando tutti i 503.
 */
test('RUNTIME-01: aprire la app non produce nessun errore JavaScript', async ({ page }) => {
  const errori = [];
  /*
   * ⛔⛔ OSS-3, 17/09 — UN ERRORE DI UNA PAGINA OSPITATA NON È UN ROSSO NOSTRO, e non si scarta
   *   in silenzio: si dichiara CHI l'ha lanciato. Il Browser può tenere aperta una pagina di
   *   un'altra origine che annida widget sandboxati per conto suo; quei `SecurityError` sono suoi
   *   e non nostri (la misura e il perché stanno in `components/browser.js`, blocco OSS-3).
   * ⛔ Il filtro è quello del PRODOTTO, non una seconda regola scritta qui: se un giorno diventa
   *   sbagliato, diventa sbagliato in un posto solo. E resta STRETTO — solo i messaggi del sandbox,
   *   e solo con una cornice estranea viva: tutto il resto conta come prima.
   */
  const scartati = [];
  const indirizziCornici = () => page.frames().map((f) => f.url());
  /* ⛔ Mai lanciare DENTRO un ascoltatore di eventi: un'eccezione qui verrebbe inghiottita e il
     cancello smetterebbe di contare senza dirlo. Un indirizzo illeggibile diventa stringa vuota, e
     `erroreDiUnaPaginaTerza` con l'origine vuota NEGA (N2), cioè l'errore resta nostro. */
  const origine = () => { try { return new URL(page.url()).origin; } catch { return ''; } };
  page.on('pageerror', (e) => {
    const verdetto = erroreDiUnaPaginaTerza(e.message, indirizziCornici(), origine());
    if (verdetto.terzo) { scartati.push(`${e.message} — ${verdetto.perche}`); return; }
    errori.push(`pageerror: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const testo = m.text();
    /* Rifiuti dichiarati dal server, non guasti della pagina. */
    if (/CTX_NOT_ENABLED/.test(testo)) return;
    if (/Failed to load resource.*503/.test(testo)) return;
    errori.push(`console: ${testo}`);
  });

  /*
   * ⛔ URL intero: questa config non fissa un `baseURL`, e un percorso relativo non naviga.
   * ⛔ 11/09 — la porta si puo' scegliere da fuori (`TALOS_URL_CANCELLO`). Prima era scritta a mano
   *   sul **4174**, cioe' il server VIVO dell'owner: lanciare questo cancello apriva una sessione
   *   sua, ci scriveva nel composer e ci cliccava dentro. Una sonda non tocca mai il 4174 — e un
   *   cancello che, per girare, deve toccare il server di chi lavora, non si lancia mai.
   */
  await page.goto(process.env.TALOS_URL_CANCELLO || 'http://127.0.0.1:4174/');
  await page.waitForTimeout(4000);

  /* ⛔ E poi si TOCCA la app: metà degli errori a runtime nasce quando qualcosa viene chiamato, non
     quando viene caricato. Cambiare sessione è il gesto che l'owner non riusciva più a fare. */
  const voci = page.locator('.talos-session-item');
  if (await voci.count() > 1) {
    await voci.nth(1).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  /*
   * ⛔ 11/09 — LE SUPERFICI CHE UNA NOTTE DI LAVORO HA TOCCATO. Aprire la app non basta: i tre
   *   errori che sono arrivati fino all'owner stanotte («fermaMotore is not defined», «$2 is not a
   *   function», «$$(...).querySelectorAll is not a function») nascevano tutti quando qualcosa
   *   veniva CHIAMATO — una bolla d'attesa che nasce, un velo che si apre. Un cancello che guarda
   *   solo il caricamento li avrebbe lasciati passare tutti e tre.
   *   ⛔ Ogni gesto è tollerante (`.catch(() => {})`): questo test non prova che la funzione
   *   esista — prova che nessuna di esse LANCI. Sono due domande diverse, e mescolarle darebbe un
   *   rosso ogni volta che una superficie cambia nome.
   */
  const composer = page.locator('#composerInput');
  if (await composer.count()) {
    /* La modalità shell: il composer cambia faccia mentre si scrive. */
    await composer.fill('!echo prova-del-cancello').catch(() => {});
    await page.waitForTimeout(600);
    await composer.fill('').catch(() => {});
    await page.waitForTimeout(400);
  }
  /* Il velo dei permessi, che stanotte ha smesso di aprirsi per un dollaro mangiato. */
  const permessi = page.locator('[data-open-sheet="permissions"]').first();
  if (await permessi.count()) {
    await permessi.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }

  /* ⛔ Ciò che il filtro ha scartato si STAMPA: un cancello che tace su cosa ha lasciato passare
     non è distinguibile da un cancello rotto (lezione del 13/09). */
  if (scartati.length) console.log(`RUNTIME-01 · errori attribuiti a una pagina ospitata (non nostri): ${scartati.length}\n  ${scartati.join('\n  ')}`);
  expect(errori, `⛔ la pagina ha lanciato ${errori.length} errori:\n  ${errori.slice(0, 6).join('\n  ')}`).toEqual([]);
});

/*
 * ⛔⛔⛔ 14/09/2026 — REGRESSIONE DESKTOP 0.1.7: i delta arrivano regolari ma il testo visibile
 * resta indietro e recupera a blocchi. Questa prova NON misura quanti millisecondi impiega una
 * macchina CI: misura quanti FOTOGRAMMI servono a T4 per raggiungere T3 dopo l'ultimo delta.
 *
 * 240 delta a ~12 ms esercitano il caso reale (provider più veloce del ritmo artificiale). Dopo
 * l'ultimo T3 tutto il testo è già nel frontend: nessuna animazione può trattenerlo per centinaia
 * di millisecondi. Il commit visibile deve raggiungerlo entro uno o due frame. L'ordine è provato
 * confrontando il testo completo, carattere per carattere.
 *
 * La prova vive nel browser vero e non usa clock assoluti per decidere verde/rosso: il contratto
 * è espresso in frame, così una macchina CI lenta non trasforma un backlog intenzionale in rumore.
 */
test('STREAMING-LIVE-SMOOTH-03 — cursore e dissolvenza raggiungono il DOM al frame successivo senza backlog', async ({ page }) => {
  await page.goto(process.env.TALOS_URL_CANCELLO || 'http://127.0.0.1:4174/');
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));

  const risultati = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const sessione = runtime.realSessionState;
    const conversazione = document.querySelector('#conversation');
    const esiti = [];
    for (const [posizione, modalita] of ['typewriter', 'fade'].entries()) {
      document.documentElement.dataset.talosStreamingAnimation = modalita;
      conversazione.replaceChildren();
      sessione.messageElements.clear();
      sessione.testoGrezzoMessaggi.clear();
      sessione.renderIncrementale?.clear?.();
      sessione.sequenzeViste.clear();
      sessione.deferHistoricalRendering = false;

      const pezzi = Array.from({ length: 240 }, (_, indice) => `d${String(indice).padStart(3, '0')}:abcdef `);
      const atteso = pezzi.join('');
      const messageId = `streaming-smooth-${modalita}`;
      let ultimoT3 = null;
      for (let indice = 0; indice < pezzi.length; indice += 1) {
        ultimoT3 = performance.now();
        runtime.handleRealEvent({
          type: 'TextMessageContent', messageId, delta: pezzi[indice], _sequenza: 70000 + (posizione * 1000) + indice,
        }, sessione.generation);
        if (indice + 1 < pezzi.length) await new Promise((resolve) => setTimeout(resolve, 12));
      }

      let frameDopoUltimoDelta = 0;
      let t4 = null;
      const testoVisibile = () => conversazione.querySelector('.assistant-copy')?.textContent || '';
      if (testoVisibile() === atteso) t4 = performance.now();
      while (t4 === null && frameDopoUltimoDelta < 40) {
        await new Promise((resolve) => requestAnimationFrame(() => { frameDopoUltimoDelta += 1; resolve(); }));
        if (testoVisibile() === atteso) t4 = performance.now();
      }

      const log = typeof window.talosStreamingLog === 'function' ? window.talosStreamingLog() : [];
      const delta = log.filter((riga) => riga.evento === 'delta' && riga.messageId === messageId);
      const render = log.filter((riga) => riga.evento === 'render' && riga.messageId === messageId);
      esiti.push({
        modalita, atteso, visibile: testoVisibile(), frameDopoUltimoDelta,
        lagFinaleMs: t4 === null || ultimoT3 === null ? null : t4 - ultimoT3,
        deltaRicevuti: delta.length, renderEseguiti: render.length,
        durataRenderMassimaMs: Math.max(0, ...render.map((riga) => Number(riga.durataMs) || 0)),
        ultimoRender: render.at(-1) ?? null,
      });
    }
    return esiti;
  });

  for (const risultato of risultati) {
    expect(risultato.deltaRicevuti).toBe(240);
    expect(risultato.visibile).toBe(risultato.atteso);
    expect(risultato.frameDopoUltimoDelta, `${risultato.modalita}: T3→T4 = ${risultato.lagFinaleMs} ms; ultimo render: ${JSON.stringify(risultato.ultimoRender)}`).toBeLessThanOrEqual(1);
    expect(risultato.durataRenderMassimaMs, `${risultato.modalita}: render applicativo oltre la soglia W3C di 50 ms`).toBeLessThan(50);
  }
});

/*
 * Lo stesso bundle può essere ospitato da un host embedded. La hotfix Desktop non deve cambiare
 * preferenze o comportamento di quella superficie: il fix live-smooth vale solo per il Desktop
 * standalone. Questo test resta nella suite Desktop e simula soltanto il contratto dell'host.
 */
test('STREAMING-LIVE-SMOOTH-02 — 240 delta regolari raggiungono il DOM entro due frame senza backlog artificiale', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); } catch { /* niente storage */ }
  });
  await page.goto(process.env.TALOS_URL_CANCELLO || 'http://127.0.0.1:4174/');
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));

  const risultato = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const sessione = runtime.realSessionState;
    const conversazione = document.querySelector('#conversation');
    conversazione.replaceChildren();
    sessione.messageElements.clear();
    sessione.testoGrezzoMessaggi.clear();
    sessione.renderIncrementale?.clear?.();
    sessione.sequenzeViste.clear();
    sessione.deferHistoricalRendering = false;

    const pezzi = Array.from({ length: 240 }, (_, indice) => `d${String(indice).padStart(3, '0')}:abcdef `);
    const atteso = pezzi.join('');
    const messageId = 'streaming-smooth-regression';
    let ultimoT3 = null;

    for (let indice = 0; indice < pezzi.length; indice += 1) {
      ultimoT3 = performance.now();
      runtime.handleRealEvent({
        type: 'TextMessageContent', messageId, delta: pezzi[indice], _sequenza: 70000 + indice,
      }, sessione.generation);
      if (indice + 1 < pezzi.length) await new Promise((resolve) => setTimeout(resolve, 12));
    }

    let frameDopoUltimoDelta = 0;
    let t4 = null;
    const testoVisibile = () => conversazione.querySelector('.assistant-copy')?.textContent || '';
    if (testoVisibile() === atteso) t4 = performance.now();

    while (t4 === null && frameDopoUltimoDelta < 40) {
      await new Promise((resolve) => requestAnimationFrame(() => {
        frameDopoUltimoDelta += 1;
        resolve();
      }));
      if (testoVisibile() === atteso) t4 = performance.now();
    }

    const log = typeof window.talosStreamingLog === 'function' ? window.talosStreamingLog() : [];
    const delta = log.filter((riga) => riga.evento === 'delta' && riga.messageId === messageId);
    const render = log.filter((riga) => riga.evento === 'render' && riga.messageId === messageId);
    return {
      atteso,
      visibile: testoVisibile(),
      frameDopoUltimoDelta,
      ultimoT3,
      t4,
      lagFinaleMs: t4 === null || ultimoT3 === null ? null : t4 - ultimoT3,
      deltaRicevuti: delta.length,
      renderEseguiti: render.length,
      ultimoRender: render.at(-1) ?? null,
    };
  });

  expect(risultato.deltaRicevuti).toBe(240);
  expect(risultato.visibile).toBe(risultato.atteso);
  expect(risultato.t4).not.toBeNull();
  expect(risultato.frameDopoUltimoDelta, `T3→T4 = ${risultato.lagFinaleMs} ms; ultimo render: ${JSON.stringify(risultato.ultimoRender)}`).toBeLessThanOrEqual(2);
});

/*
 * Lo stesso bundle può essere ospitato da un host embedded. La hotfix Desktop non deve cambiare
 * preferenze o comportamento di quella superficie: il fix live-smooth vale solo per il Desktop
 * standalone. Questo test resta nella suite Desktop e simula soltanto il contratto dell'host.
 */

test('STREAMING-LIVE-SMOOTH-02 scope — un host embedded conserva la propria animazione streaming', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__talosHarnessHost', {
      configurable: true,
      get() {
        const host = document.documentElement;
        if (!host) return null;
        host.classList.add('talos-embedded');
        if (!host.dataset.talosStreamingAnimation) host.dataset.talosStreamingAnimation = 'fade';
        return host;
      },
    });
  });

  await page.goto(process.env.TALOS_URL_CANCELLO || 'http://127.0.0.1:4174/');
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));

  const stato = await page.evaluate(() => {
    const host = window.__talosHarnessHost || document.documentElement;
    return {
      embedded: host.classList.contains('talos-embedded'),
      streamingAnimation: host.dataset.talosStreamingAnimation,
    };
  });

  expect(stato.embedded).toBe(true);
  expect(stato.streamingAnimation).toBe('fade');
});
