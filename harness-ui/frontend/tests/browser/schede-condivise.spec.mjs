import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/*
 * ⭐⭐⭐ BC-63 — UN SOLO componente di schede, misurato nel browser vero. 17/09/2026.
 *
 * Owner 17/09: «la scheda revisione deve avere lo stesso component tab di terminale
 * (schede stile chrome)». Prima di questa corsia il progetto aveva TRE implementazioni:
 *  1. Terminale — `src/components/terminale.js`, `.talos-terminal__tab[role=tab]`;
 *  2. Browser   — `src/components/browser.js`, `.talos-tabstrip__scheda[role=tab]`;
 *  3. Revisione — `src/components/review.js`, `.talos-tabs__tab.talos-review__scheda`,
 *     cioè il gruppo a pillole generico, senza tastiera propria, senza menu contestuale
 *     e senza un tetto alla larghezza della linguetta.
 *
 * ⛔ Cosa questo file può e non può provare, detto prima:
 *  · la CONDIVISIONE si prova sulla classe comune `.talos-schede__tab` presente su tutte e due
 *    le superfici, e sul COMPORTAMENTO identico (frecce, Home/End, menu contestuale). Una prova
 *    che leggesse solo il CSS direbbe che due regole si somigliano, non che il codice è uno solo.
 *  · l'OVERFLOW si misura in pixel: `scrollWidth > clientWidth` sulla striscia, una riga sola
 *    (altezza della striscia confrontata con quella di una linguetta) e nessuna linguetta
 *    schiacciata sotto il minimo dichiarato.
 *  · il menu contestuale è aperto col tasto destro VERO (`button: 'right'`), non chiamando
 *    la funzione: è così che lo usa la persona.
 *
 * ⛔ Il server di prova è quello di `playwright.config.mjs` (store vuoto): mai il 4174.
 *     node scripts/build.mjs
 *     TALOS_HARNESS_UI_TEST_PORT=4182 TALOS_HARNESS_UI_PUBLIC_DIR="$PWD/dist" \
 *       npx playwright test tests/browser/schede-condivise.spec.mjs --project=chromium-desktop --workers=1
 */

test.use({ locale: 'it-IT', permissions: ['clipboard-read', 'clipboard-write'] });

const FOTO = fileURLToPath(new URL('../../artifacts/bc63/', import.meta.url));

/** Un percorso lungo davvero, come quelli di questo repo: è il caso che schiaccia le linguette. */
const PERCORSO_LUNGO = 'harness-ui/frontend/src/components/schede-condivise-di-revisione.js';

/**
 * Apre la app col tema scelto, l'introduzione saltata e nessuna sessione aperta.
 * ⛔ `addInitScript` gira in OGNI cornice, anche in una sandboxata dove `localStorage` lancia:
 *    si tocca solo dalla cornice principale e dentro `try/catch`, altrimenti il test vede un
 *    errore che la app non ha mai prodotto.
 */
/** Via i messaggi passeggeri: in una foto coprono l'angolo e non sono ciò che si deve guardare. */
async function viaITost(page) {
  await page.evaluate(() => { document.getElementById('regioneToast')?.replaceChildren(); });
}

async function apriApp(page, { tema = 'dark', larghezza = 1440, altezza = 900 } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try {
      localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode } }));
    } catch { /* finestra privata o quota: la app parte lo stesso col tema predefinito */ }
  }, { colorMode: tema === 'light' ? 'light' : 'dark' });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
}

/**
 * Riempie la Revisione con `quanti` file VERI passando dallo StateDelta, come farebbe il kernel:
 * nessuna scrittura a mano nel DOM, così ciò che si misura è il codice del prodotto.
 */
async function apriRevisioneCon(page, percorsi) {
  await page.route('**/api/v1/sessions/bc63/events*', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.evaluate(async (elenco) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('bc63', 'workspace', 'BC-63 schede', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    elenco.forEach((percorso, i) => {
      const prima = `riga uno\nriga due\nriga tre\n`;
      const dopo = `riga uno\nriga due modificata ${i}\nriga tre\nriga quattro ${i}\n`;
      runtime.handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: `/file/${percorso}`, value: dopo, prima }], _sequenza: 63000 + i }, generation);
    });
    runtime.executeCommand('review');
    await new Promise((r) => requestAnimationFrame(r));
  }, percorsi);
  await expect(page.locator('#schermoReview')).toBeVisible();
}

/**
 * Apre il Terminale dal composer, che è la porta vera (P0/A, 16/09: il riquadro `.talos-terminal`
 * VIENE SPOSTATO dentro `#pannelloTerminale`, quindi cercarlo dentro `#schermoTerminale` lo trova
 * nel DOM ma nascosto — misurato in questa corsia il 17/09).
 */
async function apriTerminale(page) {
  await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('chat')); // la pillola vive nel piede della chat
  await expect(page.locator('#pillTerminale')).toBeVisible();
  await page.click('#pillTerminale');
  await expect(page.locator('#pannelloTerminale')).toBeVisible();
  await expect(page.locator('#pannelloTerminale .talos-terminal__tabs')).toBeVisible();
}

/** Le misure che dicono se la striscia scorre invece di andare a capo o di schiacciare. */
async function misuraStriscia(page, selettore) {
  return page.locator(selettore).evaluate((striscia) => {
    const lista = striscia.matches('[role=tablist]') ? striscia : striscia.querySelector('[role=tablist]');
    const scorrevole = lista || striscia;
    const linguette = [...scorrevole.querySelectorAll('[role=tab]')];
    const cimeDistinte = new Set(linguette.map((b) => Math.round(b.getBoundingClientRect().top)));
    return {
      classeStriscia: striscia.className,
      quante: linguette.length,
      scrollWidth: Math.round(scorrevole.scrollWidth),
      clientWidth: Math.round(scorrevole.clientWidth),
      scrollLeft: Math.round(scorrevole.scrollLeft),
      righe: cimeDistinte.size,
      larghezze: linguette.map((b) => Math.round(b.getBoundingClientRect().width)),
      classi: linguette.map((b) => b.className),
      tabIndex: linguette.map((b) => b.tabIndex),
      selezionate: linguette.map((b) => b.getAttribute('aria-selected')),
      titoli: linguette.map((b) => b.textContent.trim()),
      suggerimenti: linguette.map((b) => b.getAttribute('title') || ''),
    };
  });
}

test('BC63-CONDIVISO: la Revisione disegna la STESSA linguetta del componente condiviso (`.talos-schede__tab`)', async ({ page }) => {
  await apriApp(page);
  await apriRevisioneCon(page, ['src/uno.js', 'src/due.js', 'src/tre.js']);

  const revisione = await misuraStriscia(page, '#schermoReview .talos-review__schede');
  expect(revisione.quante, 'tre file scritti, tre linguette').toBe(3);
  for (const classe of revisione.classi) {
    expect(classe, 'la linguetta della Revisione è quella del componente condiviso').toContain('talos-schede__tab');
  }
  expect(revisione.classeStriscia, 'la striscia della Revisione è quella condivisa').toContain('talos-schede');
  for (const classe of revisione.classi) {
    expect(classe, 'la vecchia pillola generica non c’è più').not.toContain('talos-tabs__tab');
  }
});

test('BC63-CONDIVISO-TERMINALE: il Terminale disegna la stessa linguetta, e non ha perso le sue', async ({ page }) => {
  /* ⛔ Senza sessione e senza toccare la Revisione: la pillola del terminale vive nel piede della
     chat, e il riquadro `.talos-terminal` viene SPOSTATO dentro `#pannelloTerminale` (P0/A, 16/09)
     — cercarlo dentro `#schermoTerminale` lo trova nel DOM ma nascosto (misurato il 17/09). */
  await apriApp(page);
  await apriTerminale(page);
  const terminale = await page.locator('#pannelloTerminale .talos-terminal__tabs').evaluate((striscia) => ({
    classeStriscia: striscia.className,
    classi: [...striscia.querySelectorAll('[role=tab]')].map((b) => b.className),
    nuova: striscia.querySelectorAll('[data-terminale-nuova]').length,
    /* ⛔ BC-68, 17/09: il «+ Nuovo» NON è più `role="tab"` — con nessuna shell aperta questa
       striscia conteneva UNA cosa con quel ruolo ed era lui, cioè un lettore di schermo annunciava
       «scheda 1 di 1» su una striscia senza schede. Qui si pretende il contrario. */
    nuovaEUnaScheda: striscia.querySelector('[data-terminale-nuova]')?.getAttribute('role') === 'tab',
    nuovaHaAriaSelected: striscia.querySelector('[data-terminale-nuova]')?.hasAttribute('aria-selected'),
    badge: striscia.querySelectorAll('.talos-badge').length,
    /* «Una riga sola» si misura su TUTTO ciò che la striscia disegna (linguette, «+ Nuovo», badge),
       non sui soli `[role=tab]`: da quando il «+ Nuovo» non è più una scheda, contare i `role=tab`
       su una striscia senza shell aperte darebbe zero e la prova passerebbe a vuoto.
       ⛔ E non si contano i `top` distinti: elementi alti diversi, centrati nella stessa riga, hanno
       `top` diversi di un pixel — misurato, 2 «righe» su una barra che ne ha una. La domanda giusta
       è se si SOVRAPPONGONO tutti in verticale: il più basso dei bordi inferiori deve stare sotto il
       più alto dei bordi superiori. */
    unaRigaSola: (() => {
      const r = [...striscia.children].map((n) => n.getBoundingClientRect()).filter((q) => q.height > 0);
      return r.length > 0 && Math.min(...r.map((q) => q.bottom)) > Math.max(...r.map((q) => q.top));
    })(),
    quantiDisegnati: [...striscia.children].filter((n) => n.getBoundingClientRect().height > 0).length,
  }));
  expect(terminale.classeStriscia, 'la striscia del Terminale porta la classe condivisa').toContain('talos-schede');
  expect(terminale.classeStriscia, 'e tiene la sua, che porta i badge e la «×»').toContain('talos-terminal__tabs');
  expect(terminale.nuova, 'il «+ Nuovo» c’è ancora').toBe(1);
  expect(terminale.nuovaEUnaScheda, 'ma non è una scheda: è il comando che ne crea una').toBe(false);
  expect(terminale.nuovaHaAriaSelected, 'e non ha nulla da dire su una selezione che non ha').toBe(false);
  expect(terminale.badge, 'i badge della barra ci sono ancora').toBeGreaterThan(0);
  expect(terminale.quantiDisegnati, 'la premessa: la striscia disegna qualcosa').toBeGreaterThan(1);
  expect(terminale.unaRigaSola, 'una riga sola').toBe(true);
  for (const classe of terminale.classi) {
    expect(classe, 'anche il Terminale usa la linguetta condivisa').toContain('talos-schede__tab');
    expect(classe, 'senza perdere la propria').toContain('talos-terminal__tab');
  }
});

test('BC63-TASTIERA: frecce, Home ed End muovono E selezionano, con un solo tabstop (WAI-ARIA APG «Tabs», letto il 17/09/2026)', async ({ page }) => {
  await apriApp(page);
  await apriRevisioneCon(page, ['src/uno.js', 'src/due.js', 'src/tre.js']);
  const linguette = page.locator('#schermoReview .talos-review__schede [role=tab]');

  const prima = await misuraStriscia(page, '#schermoReview .talos-review__schede');
  expect(prima.tabIndex.filter((t) => t === 0).length, 'roving tabindex: un solo tabstop').toBe(1);
  expect(prima.selezionate.filter((s) => s === 'true').length, 'una sola selezionata').toBe(1);

  await linguette.nth(0).click();
  await expect(linguette.nth(0)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(linguette.nth(1), 'freccia destra seleziona la prossima').toHaveAttribute('aria-selected', 'true');
  await expect(linguette.nth(1)).toBeFocused();

  await page.keyboard.press('End');
  await expect(linguette.nth(2), 'End va all’ultima').toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(linguette.nth(0), 'dall’ultima si torna alla prima: le frecce CICLANO come nel Terminale').toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Home');
  await expect(linguette.nth(0), 'Home resta sulla prima').toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('ArrowLeft');
  await expect(linguette.nth(2), 'freccia sinistra dalla prima va all’ultima').toHaveAttribute('aria-selected', 'true');

  const dopo = await misuraStriscia(page, '#schermoReview .talos-review__schede');
  expect(dopo.tabIndex.filter((t) => t === 0).length, 'il tabstop resta uno solo dopo i movimenti').toBe(1);
});

test('BC63-SELEZIONE: la linguetta scelta cambia il diff sotto, e resta l’unica selezionata', async ({ page }) => {
  await apriApp(page);
  await apriRevisioneCon(page, ['src/uno.js', 'src/due.js', 'src/tre.js']);
  const linguette = page.locator('#schermoReview .talos-review__schede [role=tab]');
  await linguette.nth(1).click();
  await expect(page.locator('#schermoReview .talos-review__diff-head .talos-truncate')).toHaveText('src/due.js');
  const stato = await misuraStriscia(page, '#schermoReview .talos-review__schede');
  expect(stato.selezionate.filter((s) => s === 'true').length).toBe(1);
});

test('BC63-OVERFLOW: con 12 file la striscia SCORRE su una riga sola, e nessun nome è schiacciato', async ({ page }) => {
  await apriApp(page, { larghezza: 1024, altezza: 800 });
  /* ⛔ `a.js` c'è apposta: è il nome più corto che il prodotto possa ricevere, e serve a dire cosa
     misura davvero la riga sotto. */
  const percorsi = [PERCORSO_LUNGO, 'a.js', ...Array.from({ length: 10 }, (_, i) => `harness-ui/frontend/src/legacy/modulo-numero-${i + 1}.js`)];
  await apriRevisioneCon(page, percorsi);

  const m = await misuraStriscia(page, '#schermoReview .talos-review__schede');
  expect(m.quante, 'dodici file, dodici linguette').toBe(12);
  expect(m.righe, 'MAI a capo: una riga sola').toBe(1);
  expect(m.scrollWidth, 'la striscia scorre invece di stringere').toBeGreaterThan(m.clientWidth);
  /*
   * ⛔ R8 del revisore, 17/09: qui c'era `larghezza >= 96` per ogni linguetta. Misurava la FIXTURE,
   *   non il prodotto — nessuna regola di questo componente dichiara un minimo di 96 px
   *   (`min-width` sulle linguette della Revisione è 0), quindi quel numero passava perché i nomi
   *   di prova erano lunghi uguali, e sarebbe caduto per un file che si chiama `a.js` senza che
   *   nulla fosse rotto. Una soglia che descrive i dati della prova non prova niente.
   * ⇒ Ciò che conta davvero, e che si può negare: nessuna linguetta è STRETTA PIÙ del suo
   *   contenuto (cioè nessuna è stata schiacciata) e nessuna è stata tagliata con i puntini.
   */
  const contenute = await page.locator('#schermoReview .talos-review__schede [role=tab]').evaluateAll((tabs) => tabs.map((b) => {
    const nome = b.querySelector('.talos-mono');
    const tetto = parseFloat(getComputedStyle(b).maxWidth); // il tetto lo dichiara il CSS: la prova non lo riscrive
    const larghezza = b.getBoundingClientRect().width;
    return {
      testo: nome?.textContent || '',
      larghezza: Math.round(larghezza),
      alTetto: Number.isFinite(tetto) ? larghezza >= tetto - 1 : false,
      tagliato: nome ? nome.scrollWidth > nome.clientWidth + 1 : false,
    };
  }));
  /* ⛔ La regola, senza numeri inventati: se la linguetta NON tocca il tetto dichiarato dal CSS,
     allora lo spazio c'era e il nome non deve essere tagliato. Chi arriva al tetto può troncare —
     è la scelta, e il percorso intero resta nel `title`. Così l'asserzione non descrive la fixture
     (R8: `larghezza >= 96` passava perché i nomi di prova erano lunghi uguali) ma il prodotto. */
  for (const [i, c] of contenute.entries()) {
    if (c.alTetto) continue;
    expect(c.tagliato, `linguetta ${i} («${c.testo}», ${c.larghezza}px, sotto il tetto): c’era spazio e il nome è tagliato lo stesso`).toBe(false);
  }
  const corta = contenute.find((c) => c.testo === 'a.js');
  expect(corta, 'anche un nome cortissimo ha la sua linguetta').toBeTruthy();
  expect(corta.alTetto, '«a.js» non è certo al tetto: prova che il controllo qui sopra ha mordente').toBe(false);
  /* ⛔ Questa è la prova nata dalla FOTO del primo giro: col percorso accorciato la linguetta
     diceva «harness-ui/frontend/…schede.…», cioè spariva il nome del file — l'unica cosa che
     serve per scegliere una scheda. Adesso ci va il nome, e il percorso intero sta nel `title`. */
  expect(m.titoli[0], 'sulla linguetta c’è il NOME del file, per intero').toContain('schede-condivise-di-revisione.js');
  for (const [i, titolo] of m.titoli.entries()) {
    expect(titolo, `linguetta ${i}: nessun moncone coi puntini`).not.toContain('…');
  }
  expect(m.suggerimenti[0], 'il percorso COMPLETO resta nel suggerimento').toContain(PERCORSO_LUNGO);

  /* ⛔ Secondo difetto della stessa foto: le scritture arrivano mentre la Revisione è CHIUSA (è il
     caso normale), quindi la striscia è nascosta e non si può misurare; all'apertura la linguetta
     attiva restava fuori vista e a schermo se ne vedevano tre che non c'entravano col diff sotto. */
  const leggiStriscia = () => page.locator('#schermoReview .talos-review__schede').evaluate((striscia) => {
    const lista = striscia.querySelector('[role=tablist]');
    const attiva = lista.querySelector('[role=tab][aria-selected="true"]');
    const r = attiva?.getBoundingClientRect(); const c = lista.getBoundingClientRect();
    return {
      trovata: Boolean(attiva),
      dentro: attiva ? r.left >= c.left - 1 && r.right <= c.right + 1 : false,
      bordi: lista.dataset.bordi || '',
      maschera: getComputedStyle(lista).maskImage,
      scrollLeft: Math.round(lista.scrollLeft),
      massimo: Math.round(lista.scrollWidth - lista.clientWidth),
    };
  });
  const aDestra = await leggiStriscia();
  expect(aDestra.trovata, 'una linguetta è selezionata').toBe(true);
  expect(aDestra.dentro, 'la linguetta attiva è VISIBILE quando si apre la Revisione').toBe(true);
  /*
   * ⛔ R5 del revisore, 17/09: prima qui bastava «`data-bordi` non è vuoto». Quella riga passava
   *   anche col VERSO SBAGLIATO — una sfumatura a destra mentre lo spazio libero è a sinistra dice
   *   il contrario di ciò che c'è, e sarebbe peggio di nessuna sfumatura. Ora si asserisce il verso,
   *   calcolato dallo scorrimento, e che la maschera CSS esista davvero (un `data-` senza regola
   *   applicata è un attributo che non disegna niente).
   */
  const versoAtteso = (s) => (s.scrollLeft > 1 && s.scrollLeft < s.massimo - 1 ? 'entrambi' : s.scrollLeft > 1 ? 'sinistra' : 'destra');
  expect(aDestra.scrollLeft, 'la linguetta attiva è l’ultima: la striscia è scorsa fino in fondo').toBeGreaterThan(1);
  expect(aDestra.bordi, 'in fondo a destra la sfumatura sta a SINISTRA, dov’è il resto').toBe(versoAtteso(aDestra));
  expect(aDestra.maschera, 'la maschera è davvero applicata, non solo dichiarata').not.toBe('none');

  // la rotella scorre la striscia in orizzontale: senza, con dodici file le ultime sono irraggiungibili col mouse
  await page.locator('#schermoReview .talos-review__schede [role=tablist]').hover();
  await page.mouse.wheel(0, -200); // all'indietro: siamo in fondo a destra
  await expect.poll(async () => (await leggiStriscia()).scrollLeft, { message: 'la rotella scorre la striscia' }).toBeLessThan(aDestra.scrollLeft);
  const aMeta = await leggiStriscia();
  expect(aMeta.bordi, 'a metà strada la sfumatura è da entrambi i lati').toBe('entrambi');
  expect(aMeta.maschera, 'e la maschera resta applicata').not.toBe('none');

  /* Home riporta all'inizio: la prima linguetta si seleziona E la striscia la porta in vista. */
  await page.locator('#schermoReview .talos-review__schede [role=tab]').first().focus();
  await page.keyboard.press('Home');
  /* ⛔ Una lettura sola, non due: leggere `scrollLeft` in un giro e `bordi` in quello dopo lascia
     passare un ridisegno in mezzo, e la prova accusa il verso sbagliato per una corsa fra misure. */
  await expect.poll(async () => { const s = await leggiStriscia(); return `${s.scrollLeft}|${s.bordi}`; },
    { message: 'Home riporta all’inizio e la sfumatura passa a DESTRA, dov’è il resto' }).toBe('0|destra');
  expect((await leggiStriscia()).maschera, 'e la maschera è davvero applicata').not.toBe('none');
});

test('BC63-FUOCO: una scrittura che arriva mentre stai scegliendo con la tastiera NON ti toglie il fuoco', async ({ page }) => {
  /*
   * ⛔ R2 del revisore, 17/09, misurata: `renderizza()` fa `replaceChildren()` e il nodo che aveva
   *   il fuoco se ne va coi nodi vecchi — il fuoco cade su BODY. È il caso normale, non un caso
   *   limite: l'agente scrive un file mentre tu scegli una scheda con le frecce, la striscia si
   *   ridisegna, e la tastiera smette di rispondere senza che niente lo dica.
   */
  await apriApp(page);
  await apriRevisioneCon(page, ['src/uno.js', 'src/due.js', 'src/tre.js']);
  const linguette = page.locator('#schermoReview .talos-review__schede [role=tab]');
  await linguette.nth(0).click();
  await page.keyboard.press('ArrowRight');
  await expect(linguette.nth(1)).toBeFocused();

  // arriva una scrittura nuova: la striscia si ridisegna da capo
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/quattro.js', value: 'a\nb\n', prima: 'a\n' }], _sequenza: 63999 }, runtime.realSessionState.generation);
  });
  await expect.poll(async () => (await misuraStriscia(page, '#schermoReview .talos-review__schede')).quante,
    { message: 'il quarto file è arrivato' }).toBe(4);

  const dopo = await page.evaluate(() => {
    const attivo = document.activeElement;
    return { tag: attivo?.tagName, file: attivo?.dataset?.reviewFile || null };
  });
  expect(dopo.tag, 'il fuoco non è caduto sul corpo della pagina').toBe('BUTTON');
  expect(dopo.file, 'è rimasto sulla STESSA linguetta che stavi scegliendo').toBe('real:src/due.js');
  // e la tastiera funziona ancora da lì
  await page.keyboard.press('ArrowRight');
  await expect(linguette.nth(2), 'la freccia riparte dalla linguetta giusta').toBeFocused();
});

test('BC63-FUOCO AL CONTRARIO: il fuoco NON si ruba a chi non stava nella striscia', async ({ page }) => {
  /* ⛔ Una cura che rimette il fuoco deve anche saper stare ferma: se durante la scrittura il fuoco
     era altrove (qui il campo del composer), la striscia non deve strapparglielo. */
  await apriApp(page);
  await apriRevisioneCon(page, ['src/uno.js', 'src/due.js']);
  await page.locator('#schermoReview .talos-review__schede [role=tab]').nth(0).click();
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/tre.js', value: 'a\nb\n', prima: 'a\n' }], _sequenza: 63998 }, runtime.realSessionState.generation);
  });
  await expect.poll(async () => (await misuraStriscia(page, '#schermoReview .talos-review__schede')).quante).toBe(3);
  const attivo = await page.evaluate(() => document.activeElement?.tagName);
  expect(attivo, 'nessuno aveva il fuoco nella striscia: la striscia non se lo prende').toBe('BODY');
});

test('BC63-MENU: il tasto destro sulla linguetta apre le azioni VERE del file (nessuna inventata)', async ({ page }) => {
  await apriApp(page);
  await apriRevisioneCon(page, ['src/uno.js', 'src/due.js']);
  await page.locator('#schermoReview .talos-review__schede [role=tab]').nth(0).click({ button: 'right' });
  const menu = page.locator('#menuSchedaReview[role=menu]');
  await expect(menu).toBeVisible();
  const voci = await menu.locator('[role=menuitem]').allTextContents();
  expect(voci, 'solo azioni con un comportamento dietro').toEqual(['Apri il file', 'Copia il percorso', 'Copia il diff di questo file']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

/*
 * Le foto. Terminale e Revisione nello STESSO tema e alla STESSA larghezza, così si guardano
 * affiancate: è l'unico modo di dire «è lo stesso componente» senza fidarsi di una classe CSS.
 * ⛔ Regola di casa: due temi e due larghezze, sempre tutti e quattro.
 */
test('BC63-FOTO: Terminale e Revisione affiancati, nei due temi e alle due larghezze, più la Revisione con 12 file', async ({ page }) => {
  await mkdir(FOTO, { recursive: true });
  const dodici = ['harness-ui/frontend/src/components/schede.js', ...Array.from({ length: 11 }, (_, i) => `harness-ui/frontend/src/legacy/modulo-numero-${i + 1}.js`)];
  for (const tema of ['dark', 'light']) {
    for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
      /* 1. il Terminale, che è il riferimento indicato dall'owner.
         ⛔ Con una shell VERA dentro, non a barra vuota: una foto del pannello vuoto non mostra
            nessuna linguetta, cioè non mostra la cosa da guardare (P0/A, 16/09, stessa lezione). */
      await apriApp(page, { tema, larghezza, altezza });
      await page.keyboard.press('Control+`');
      await expect(page.locator('#schermoTerminale .xterm, #pannelloTerminale .xterm').first()).toBeVisible({ timeout: 20_000 });
      await page.keyboard.press('Control+`');
      await apriTerminale(page);
      /* ⛔ Puntatore e fuoco via dalla pill: il suggerimento compare anche col fuoco da tastiera e
         nella foto copre il composer (difetto già pagato in P0/A, 16/09). */
      await page.mouse.move(Math.round(larghezza / 2), 120);
      await page.evaluate(() => document.activeElement?.blur?.());
      await viaITost(page);
      await expect(page.locator('#pannelloTerminale .talos-terminal__tabs')).toBeVisible();
      await page.screenshot({ path: `${FOTO}terminale-${tema}-${larghezza}.png` });

      // 2. la Revisione, stessa pagina, stesso tema, stessa larghezza
      await apriRevisioneCon(page, ['src/session-registry.mjs', 'tests/session-registry.test.mjs', 'src/http-app.mjs']);
      await page.mouse.move(Math.round(larghezza / 2), 120);
      await page.evaluate(() => document.activeElement?.blur?.());
      await viaITost(page);
      await page.screenshot({ path: `${FOTO}revisione-${tema}-${larghezza}.png` });

      // 3. la Revisione con DODICI file: il caso che decide se la striscia scorre o si rompe
      await apriApp(page, { tema, larghezza, altezza });
      await apriRevisioneCon(page, dodici);
      await page.mouse.move(Math.round(larghezza / 2), 120);
      await page.evaluate(() => document.activeElement?.blur?.());
      await viaITost(page);
      await page.screenshot({ path: `${FOTO}revisione-12-file-${tema}-${larghezza}.png` });
    }
  }
});
