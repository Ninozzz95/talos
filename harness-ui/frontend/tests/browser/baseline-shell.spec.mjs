import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/*
 * ⛔⛔ 18/09/2026 — LA v2 ATTERRA SULLA HOME: LA CHAT SI APRE CON UN GESTO.
 *
 * Misurato con la sonda del 18/09 (store vuoto della suite, 1440×900) e con le foto dei rossi:
 * dopo `goto('/')` la app mostra la **Home** (`#schermoHome` visibile, composer e conversazione
 * presenti ma NASCOSTI, `realSessionState.id` null). Con un clic sulla voce «Conversazioni»
 * (`.talos-nav-item[data-vaia="chat"]`) la chat si apre anche senza sessione: composer e invio
 * visibili, `#schermoChat` attivo. ⇒ I test che misuravano subito dopo il `goto` misuravano il
 * velo d'avvio: misure a zero (`width: 0`, `treeNodes: 0`) e timeout su clic e `fill`, non difetti
 * di prodotto.
 *
 * Ricerca 18/09/2026 — la pratica corrente è aspettare il CONTENUTO VERO (o un segnale di
 * prontezza esplicito), mai la sparizione del velo, mai `networkidle` (che con polling e
 * websocket non arriva mai): Playwright «Best practices» e «Auto-waiting»; BrowserStack
 * «Playwright waits: auto-waiting, assertions»; tayyabakmal.com, «Test SPAs without race
 * conditions: 5 Playwright patterns» (aprile 2026), che nomina la corsa di idratazione come la
 * prima delle cinque.
 */
async function apriChat(page) {
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
}

/*
 * ⛔⛔ 18/09/2026 — LA MIGRAZIONE DEI SELETTORI DEL CUTOVER (i 43 rossi di baseline-shell).
 *
 * Causa comune, misurata con `sonda-selettori.mjs` / `sonda-selettori2.mjs` /
 * `sonda-baseline1.mjs` (porta 4197, store vuoto) e letta dai messaggi d'errore veri
 * (`--reporter=line`): il guscio canonico ha sostituito i vecchi attributi e classi del
 * prototipo con quelli del mockup, e i test cercavano ancora i primi. Non è un difetto di
 * prodotto: è un puntatore morto, e un puntatore morto NON fallisce — trova zero nodi e
 * lascia passare una misura vuota (`width 0`, `getComputedStyle(null)`), che è il modo in
 * cui questi 43 rossi si presentavano.
 *
 * Le sostituzioni, ognuna con la sua misura:
 *  · `[data-vaia="impostazioni"]` → `[data-vaia="impostazioni"]`:
 *    `[data-open-view]` = **0 nodi** in tutto il documento, `[data-vaia]` = **33**;
 *    `[data-vaia="impostazioni"]` = 1 nodo, visibile. Le porte canoniche sono
 *    `button.talos-nav-item[data-vaia="<vista>"]` (src/components/guscio.js).
 *  · `[data-vaia="automazioni"]` → `[data-vaia="automazioni"]`: 1 nodo, NON visibile
 *    (la voce sta nella barra secondaria chiusa) ⇒ resta il clic via `evaluate`, che è la
 *    forma che il test usava già.
 *  · `#schermoChat .mode-tab[data-vaia="chat"]` → `#schermoChat .mode-tab[data-vaia="chat"]`:
 *    `.mode-tab[data-vaia="chat"]` = **4** nodi (le quattro strisce di schede: chat,
 *    terminale, review, browser, tutte con `data-vaia`), **0 visibili** prima di aprire la
 *    vista; `#schermoChat .mode-tab[data-vaia="chat"]` = **1**. Senza lo scope il
 *    `dispatchEvent` colpiva una scheda di un'altra superficie.
 *  · `.composer` → `#composerForm`: `.composer` = **0 nodi** (classe del prototipo
 *    scomparsa), `#composerForm.talos-composer` = 1, con figli
 *    `button.talos-resizer--composer`, `textarea.talos-composer__input`,
 *    `div.talos-composer__bar`. ⛔ La riga ~1812 misura il `.composer` del MOCKUP
 *    (`../mockup-originale/index.html`): quella resta com'è, è la pagina di riferimento.
 *  · `.talos-composer__bar` → `.talos-composer__bar`: **0 nodi** in tutto il documento.
 *  · `[data-settings-tab="X"]` → `#setting-tab-X`: `[data-settings-tab]` = 18 nodi di cui
 *    **8 dentro `#talos-legacy`** ⇒ ambiguo; le canoniche sono `#setting-tab-account`,
 *    `-models`, `-chat`, `-appearance`, una ciascuna e visibili.
 *  · `#inspector-tab-files` → `#inspector-tab-files`: 2 nodi (uno legacy) ⇒
 *    `strict mode violation`; la canonica è un id.
 *  · `#chatFullWidthToggle.check()/uncheck()` → clic su `#chatFullWidthToggle--calm`:
 *    l'input nativo è 0×0 con `aria-hidden="true"`/`tabindex="-1"`, e `check({force:true})`
 *    NON scavalca la visibilità (`locator.check: Element is not visible`, TimeoutError 30 s
 *    su COMPOSER-SHAPE-FULL-WIDTH-01); la faccia cliccabile è il `calm-check` da **42×25**
 *    (`role="switch"`) e il clic scrive la PROPRIETÀ `checked` (nessun attributo: `attr
 *    checked` resta `null`) — lo stato si legge con `toBeChecked()` sull'input nativo, e
 *    `aria-checked` passa a `"true"` sulla faccia. Misurato con `sonda-sheet-toggle.mjs`
 *    a 1920×1080 il 18/09/2026.
 *
 * ⛔⛔ 18/09/2026 — DUE CAMBI DI TESTO DELIBERATI DEL PRODOTTO (non difetti, non «aggiustamenti»).
 *
 *  · La pillola del modello mostra il NOME UMANO, e vuoto dice «Scegli il modello».
 *    `src/legacy/app.js:8393` — `nomeModelloBreve(state.model) || 'Scegli il modello'`, con il
 *    commento «05/9 Fase 2: il chip mostra il nome breve» — introdotto da `8413f8df` (05/09/2026,
 *    S-06 ChatFooter). La traduzione vive in UN posto solo, `src/components/chat-foot.js:67`
 *    (`nomeModelloUmano`: per un id remoto è l'ultimo segmento dopo `/`).
 *    ⇒ Misurato dal vivo con `sonda-pillola.mjs` (18/09, porta 4197): sessione con
 *    `modello: 'qwen/qwen3.8-flash'` → chip «**qwen3.8-flash**», `title` «Cambia modello ·
 *    qwen/qwen3.8-flash»; sessione senza modello → chip «Scegli il modello». I test pretendevano
 *    l'id grezzo e il segnaposto inglese «Seleziona modello».
 *  · I permessi si nominano in italiano, con la mappa in un posto solo: `src/components/politiche.js`
 *    («Workspace write» → «**Scrive nel progetto**», «Read only» → «Solo lettura», «On request» →
 *    «Chiede prima», «Full access» → «Accesso pieno»), introdotta da `9bc410b1` (07/09/2026) con la
 *    regola dell'owner «mai nomi tecnici a schermo». ⛔ Il VALORE che viaggia verso il kernel resta
 *    tecnico byte per byte: `corpoAvvio.permessi === 'Workspace write'` resta un'asserzione valida,
 *    ed è la ragione per cui convivono le due forme — l'etichetta è dell'interfaccia, il valore è
 *    del contratto.
 */
const toggleFullWidth = (page) => page.locator('#chatFullWidthToggle');
const facciaFullWidth = (page) => page.locator('#chatFullWidthToggle--calm');
async function accendiFullWidth(page) {
  await facciaFullWidth(page).click();
  await expect(toggleFullWidth(page)).toBeChecked();
}
async function spegniFullWidth(page) {
  await facciaFullWidth(page).click();
  await expect(toggleFullWidth(page)).not.toBeChecked();
}

/*
 * ⛔⛔ 18/09/2026 — IL DRIVER DEI CONTROLLI «CALM» DELLE IMPOSTAZIONI.
 *
 * I `select` nativi delle impostazioni NON sono più cliccabili: `mountCalmControls`
 * (`public/app.js:42500-42560`) li nasconde (`data-calm-source`, `tabindex="-1"`,
 * `aria-hidden="true"`, `display:none`, 0×0 — misurato sulla 4199, `%TEMP%\corsia5\z6.log`)
 * e mette al loro posto una FACCIA cliccabile `button.calm-select[role="combobox"]` con
 * id `<nativo>--calm`. Un `selectOption()` su un nodo `display:none` va in timeout: è la
 * causa dei rossi COMPOSER-SHAPE-FULL-WIDTH-01, COMPOSER-MOCKUP-HEIGHT-01 e
 * DESKTOP-SETTINGS-PERSISTENCE-01.
 *
 * Il giro che il prodotto vuole è quello del pattern ARIA «combobox select-only»
 * (w3c/aria-at, `combobox-select-only` → `combobox-select-only.opening`, letto 18/09/2026):
 * si clicca la faccia, si aspetta la `listbox` VISIBILE, si clicca l'opzione per NOME, e la
 * listbox si richiude. Playwright: `getByRole(role, { name, exact })` confronta il NOME
 * ACCESSIBILE, non l'id o il testo grezzo (github.com/microsoft/playwright, letto 18/09/2026);
 * è la forma che sopravvive a un rifacimento degli id.
 *
 * ⇒ La funzione prende il VALORE dell'opzione (quello che il prodotto persiste) e legge dal
 * `<select>` NATIVO l'etichetta che il prodotto mostra in QUESTO momento: così il test non porta
 * nel proprio testo una parola tradotta. ⛔ Misurato il 18/09/2026: lo store isolato della suite
 * avvia il prodotto in INGLESE, la 4199 con lo store della corsia lo avvia in ITALIANO, e la
 * stessa lista offre «Compatta» in un caso e «Compact» nell'altro.
 * Fonti (lette il 18/09/2026): github.com/currents-dev/playwright-best-practices-skill,
 * `testing-patterns/i18n.md` («Hardcoded text assertions → Breaks in other locales → Use test IDs
 * or parameterize»); hyperping.com/blog/playwright-dropdown-guide (col `<select>` nativo il valore
 * sopravvive alla traduzione, il testo no); w3c/aria-at `combobox-select-only` (faccia → listbox
 * visibile → opzione per ruolo, il giro che il prodotto implementa); playwright.dev/docs/locators.
 * ⇒ Ritorna il NUMERO di opzioni con quell'etichetta esatta: zero significa «la voce non esiste in
 * questa lista», e chi chiama lo asserisce — è il verso in cui il test deve diventare rosso.
 * ⛔ Come ogni controllo di questa suite, vale NELLA SUA SCHEDA: la faccia è visibile solo
 * nella scheda che la contiene (misurato: un click sulla faccia della scheda «chat» mentre
 * si guarda «appearance» va in timeout a 30 s).
 */
async function scegliCalm(page, id, valore) {
  const faccia = page.locator(`#${id}--calm`);
  await faccia.scrollIntoViewIfNeeded();
  await faccia.click();
  const lista = page.locator(`#${id}--calm--listbox`);
  await lista.waitFor({ state: 'visible', timeout: 5000 });
  const etichetta = (await page.locator(`#${id} option[value="${valore}"]`).textContent()).trim();
  const opzione = lista.getByRole('option', { name: etichetta, exact: true });
  const conto = await opzione.count();
  await opzione.click();
  await expect(lista).toBeHidden();
  await expect(page.locator(`#${id}`)).toHaveValue(valore);
  return conto;
}

test('baseline desktop shell is served by the real harness server', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('#app, main, [role="main"], .app-shell').first()).toBeVisible();
});

test('production shell does not expose laboratory demo badges', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.demo-surface-badge')).toHaveCount(0);
});

test('VISUAL-CONTRAST-LIGHT-ASSISTANT-01 — il tema chiaro completa i token semantici e mantiene leggibile la risposta', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: 'light' },
    }));
  });
  await page.goto('/');
  await page.locator('#conversation').evaluate((conversation) => {
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    copy.dataset.contrastProbe = 'true';
    copy.textContent = 'Risposta TALOS leggibile nel tema chiaro.';
    article.append(copy);
    conversation.append(article);
  });

  const audit = await page.locator('[data-contrast-probe="true"]').evaluate((copy) => {
    const parseRgb = (value) => {
      const channels = (value.match(/[\d.]+/gu) || []).slice(0, 3).map(Number);
      return value.startsWith('color(srgb ') ? channels.map((channel) => channel * 255) : channels;
    };
    const luminance = (value) => {
      const channels = parseRgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const foreground = getComputedStyle(copy).color;
    const background = getComputedStyle(document.documentElement).backgroundColor;
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      foreground,
      background,
      ratio: (lighter + 0.05) / (darker + 0.05),
      tokens: Object.fromEntries([
        '--talos-assistant-text',
        '--talos-panel-soft',
        '--talos-card',
        '--talos-window-bg',
        '--talos-border-strong',
      ].map((name) => [name, rootStyle.getPropertyValue(name).trim()])),
    };
  });

  expect(audit.tokens['--talos-assistant-text']).not.toBe('');
  expect(audit.tokens['--talos-panel-soft']).not.toBe('');
  expect(audit.tokens['--talos-card']).not.toBe('');
  expect(audit.tokens['--talos-window-bg']).not.toBe('');
  expect(audit.tokens['--talos-border-strong']).not.toBe('');
  expect(audit.ratio).toBeGreaterThanOrEqual(4.5);
});

test('BACKGROUND-MOTION-COMPOSITOR-02 — lo sfondo si muove senza mutare lo style della radice a ogni frame', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false, pauseWhenHidden: true },
    }));
  });
  await apriChat(page);
  await page.waitForTimeout(250);
  /*
   * ⛔⛔ 18/09/2026 — `.scene-orb-a` NON ESISTE PIÙ: è un puntatore morto, non un difetto di
   * prodotto. `getComputedStyle(document.querySelector('.scene-orb-a'))` lancia
   * `TypeError: parameter 1 is not of type 'Element'` — è l'errore vero del rosso — e il censimento
   * lo conferma: `.scene-orb` = **0 nodi** (`sonda-interazioni-2.mjs`, porta 4197). Le classi del
   * prototipo sono sparite col cutover; il renderer canonico è UN canvas,
   * `canvas.talos-motion-canvas`, montato dal pacchetto (`src/motion/desktop-background.js:283`,
   * `mountStage`) e pilotato da `window.__talosDesktopMotion`.
   *
   * Il soggetto della prova resta quello che il nome dichiara — «lo sfondo si muove senza mutare
   * lo style della radice a ogni frame» — e si legge dallo stato che il componente ESPONE
   * (`status().frames` / `status().stages[].draws`), non dal pixel e non dal nome di
   * un'animazione CSS: ricerca 18/09/2026 (QASkills, «Visual Testing Animation Freeze
   * Strategies»; currents-dev/playwright-best-practices, `canvas-webgl.md`: niente asserzioni
   * pixel-perfect su un canvas, si asserisce lo stato esposto) e Playwright «Auto-waiting»
   * (l'auto-wait non vede i cicli rAF: si fa polling su un contatore).
   *
   * ⛔⛔⛔ E QUI LA PROVA RESTA ROSSA, PER UN DIFETTO DI PRODOTTO MISURATO — non per il test.
   * Misurato con `sonda-sfondo-4.mjs` (porta 4197, 1440×900, movimento acceso):
   *   · a carico: canvas 0×0 dentro `#schermoChat[hidden]` → `schedule()` non arma il ciclo
   *     (`desktop-background.js:237-242`);
   *   · aprendo la chat il canvas diventa **824×900** e il ResizeObserver chiama `prepare()`
   *     (`:261`), che DISEGNA (dt 0) e scrive `data-scene-status="animating"` — ma `prepare()` non
   *     riarma **mai** il ciclo: l'unico che lo fa è `schedule()`;
   *   · risultato a +1200 ms: `running: false`, `frames: 0`, `draws: 3`, e lo status che continua a
   *     dire `animating` — un esito stampato che non vale più ([[un-esito-stampato-dopo-un-errore-non-vale]]);
   *   · **controllo positivo**: `refresh()` (che chiama `schedule()`) riporta i fotogrammi a 22 in
   *     700 ms, e un giro di classe su `body` a 44 — quindi l'ambiente CONSEGNA fotogrammi e non è
   *     il throttling headless (che la ricerca 18/09/2026, zenn.dev «requestAnimationFrame…»,
   *     misura come 2 chiamate in 2 s con i flag di backgrounding mancanti);
   *   · andando via dalla chat e tornando: `frames: 45`, `running: false` — si spegne di nuovo.
   * ⇒ Con le impostazioni già caricate all'avvio (movimento ACceso: il caso dell'owner) lo sfondo
   *   resta FERMO per sempre, e nessuno se ne accorge perché lo status dichiara `animating`.
   *   La misura qui sotto è la prova: se diventa verde, il difetto è curato.
   */
  const canvas = page.locator('canvas.talos-motion-canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  const stato = () => page.evaluate(() => {
    const status = window.__talosDesktopMotion?.status?.();
    return {
      rootStyle: document.documentElement.getAttribute('style') ?? '',
      running: status?.running ?? null,
      frames: status?.frames ?? -1,
      draws: status?.stages?.map((stage) => stage.draws) ?? [],
    };
  });
  const prima = await stato();
  await page.waitForTimeout(700);
  const dopo = await stato();
  /* Il controllo positivo si prende DOPO la misura (non la maschera) e serve al messaggio
     d'errore: senza di lui «0 fotogrammi» sarebbe indistinguibile da un ambiente che non ne
     consegna nessuno. */
  const controllo = await page.evaluate(async () => {
    window.__talosDesktopMotion.refresh();
    await new Promise((resolve) => setTimeout(resolve, 700));
    return window.__talosDesktopMotion.status().frames;
  });
  expect(dopo.rootStyle).toBe(prima.rootStyle);
  expect(dopo.rootStyle).not.toContain('--talos-motion-phase');
  expect(dopo.rootStyle).not.toContain('--talos-motion-x');
  expect(dopo.rootStyle).not.toContain('--talos-motion-y');
  await expect(canvas, 'il renderer canonico dichiara che la scena sta animando').toHaveAttribute('data-scene-status', 'animating');
  expect(
    dopo.frames,
    `lo sfondo dichiara «animating» e non disegna: frames ${prima.frames} → ${dopo.frames} in 700 ms, draws ${JSON.stringify(prima.draws)} → ${JSON.stringify(dopo.draws)}, running ${prima.running}/${dopo.running}. Controllo positivo: dopo refresh() i fotogrammi arrivano a ${controllo}, quindi l'ambiente consegna fotogrammi e il ciclo non è riarmato (prepare() non chiama schedule()).`,
  ).toBeGreaterThan(prima.frames);
});

test('BACKGROUND-MOTION-PERF-03 — lo sfondo non forza ricalcoli stile continui sul main thread', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false },
    }));
  });
  await page.goto('/');
  await page.waitForTimeout(500);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metric = (payload, name) => payload.metrics.find((entry) => entry.name === name)?.value ?? 0;
  const before = await cdp.send('Performance.getMetrics');
  await page.waitForTimeout(1500);
  const after = await cdp.send('Performance.getMetrics');
  const recalcStyleSeconds = metric(after, 'RecalcStyleDuration') - metric(before, 'RecalcStyleDuration');
  expect(recalcStyleSeconds).toBeLessThan(0.04);
});

test('BACKGROUND-MOTION-PAUSE-04 — static e visibility usano uno stato di pausa esplicito', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'static', reducedMotion: false, pauseWhenHidden: true },
    }));
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/background-motion-paused/);
  /*
   * ⛔⛔ 18/09/2026 — QUESTA PROVA ERA VERDE PER VACUITÀ, e vale la pena scriverlo perché è la
   * stessa malattia di «un elenco vuoto non limita, allarga». Il corpo era:
   *
   *     const stati = await page.locator('.scene-orb').evaluateAll((orbs) => ...);
   *     expect(stati.every(({ animationName, animationPlayState }) => ...)).toBe(true);
   *
   * `.scene-orb` = **0 nodi** nel guscio canonico (le classi del prototipo non esistono più:
   * misurato con `sonda-interazioni-2.mjs`, porta 4197, modalità `static` — `.scene-orb` 0,
   * `.scene-orb-a` assente), quindi `stati` era `[]` e `[].every(...)` è **`true` per
   * costruzione**: la prova passava qualunque cosa facesse il prodotto. Ricerca 18/09/2026 — MDN,
   * `Array.prototype.every`: «for an empty array, it returns **true** … it is vacuously true that
   * all elements of the empty set satisfy any given condition», con la mitigazione indicata:
   * controllare la lunghezza prima di chiamare `every()`. Qui la si applica alla radice: non si
   * usa più `every()` su un elenco che può essere vuoto.
   *
   * Il segnale vero è il canvas canonico, che lo stato lo DICHIARA: misurato a 1440×900 con
   * `motionMode: 'static'` — Home E chat — `canvas.talos-motion-canvas` con
   * `data-scene-status="static"`, `running: false`, `frames: 0`. E la parte che la prova vecchia
   * non poteva vedere: i fotogrammi NON devono avanzare. Ricerca 18/09/2026 (QASkills, «Visual
   * Testing Animation Freeze Strategies»; currents-dev/playwright-best-practices,
   * `canvas-webgl.md`): su un canvas non si asserisce il pixel né il nome di un'animazione CSS —
   * si asserisce lo **stato esposto** dal componente.
   */
  const canvas = page.locator('canvas.talos-motion-canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('data-scene-status', 'static');
  const fotogrammi = () => page.evaluate(() => window.__talosDesktopMotion?.status?.().frames ?? -1);
  const primo = await fotogrammi();
  await page.waitForTimeout(600);
  const secondo = await fotogrammi();
  expect(secondo, `un fondo in pausa non disegna: frames ${primo} → ${secondo}`).toBe(primo);
  /* E la stessa cosa in chat: la pausa non è «solo un po' di Home». */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-scene-status', 'static');
  const terzo = await fotogrammi();
  await page.waitForTimeout(600);
  expect(await fotogrammi(), 'nemmeno in chat il fondo statico disegna').toBe(terzo);
  await expect(page.locator('html')).toHaveClass(/background-motion-paused/);
});

test('LAG-INTERACTION-DIALOG-38 — una modale pausa lo sfondo e la chiusura lo riprende', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false },
    }));
  });
  await apriChat(page);
  const root = page.locator('html');
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/);

  /*
   * ⛔⛔ 18/09/2026 — LA PORTA È CAMBIATA, IL SEGNALE NO. `#commandPaletteBtn` esiste ma è
   * `display:none`: `locator.click` va in timeout con «element is not visible» (l'errore vero del
   * rosso), e le quattro copie canoniche di `[data-azione="comandi"]` misurano 0×0. La porta VIVA è
   * la scorciatoia **Ctrl+K** (`src/components/scorciatoie.js:163` → handler `app.js:21883`), che
   * apre il VELO canonico `#veloComandi` — non il `<dialog>` legacy `#commandDialog`, che resta
   * 0×0 e `hidden`. Misurato con `sonda-interazioni-2.mjs` (porta 4197, 1440×900, 18/09/2026):
   * dopo Ctrl+K il velo è **1440×900, hidden:false**, e `[data-chiudi="veloComandi"]` è
   * l'**unica** chiusura (1 nodo, visibile); `#commandDialog` 0×0.
   */
  await page.keyboard.press('Control+k');
  await expect(page.locator('#veloComandi')).toBeVisible();

  /*
   * ⛔⛔⛔ 18/09/2026 — QUESTA RIGA RESTA ROSSA, ED È UN DIFETTO DI PRODOTTO, non un puntatore.
   *
   * Con il velo APERTO le classi non cambiano: `html` e `body` restano `background-motion-active`
   * e `background-motion-paused` non arriva mai (misurato due volte, a 300 ms e a 520 ms
   * dall'apertura, `sonda-interazioni-2.mjs`). E non è il velo dei comandi a essere speciale:
   * misurato con `sonda-modali.mjs` sulla stessa porta — il foglio «Modello»
   * (`[data-open-sheet="model"]`) apre anche lui un velo (`veloModello`) e lascia le classi
   * invariate. Cioè: **nessuna modale canonica pausa più lo sfondo**.
   *
   * Causa alla fonte, letta e non dedotta: `syncBackgroundDialogPause()` chiama
   * `setBackgroundInteractionPause('dialog', commandDialog.open || sheetDialog.open)`
   * (`src/legacy/app.js:14877-14878`) e i suoi due soli chiamanti stanno in `showEmbeddedDialog`
   * (`app.js:2169`) e `closeEmbeddedDialog` (`app.js:2202`) — i due `<dialog>` LEGACY. Il cutover
   * ha portato ogni foglio e ogni pannello sui veli `.overlay-layer`: `openCommandPalette()` passa
   * da `apriVeloMockup('veloComandi')` e tocca il dialog solo nel ramo di ripiego, «se il velo non
   * esiste» (`app.js:20959-20962`); `openSheet()` fa lo stesso con `VELO_PER_FOGLIO`
   * (`app.js:7802-7811`, «torna `true` quando il velo ha preso il posto del foglio»). E
   * `apriVeloMockup`/`chiudiVeloMockup` (`app.js:22431-22468`) non chiamano MAI la pausa. ⇒ Il
   * meccanismo è intatto; è la sua unica porta d'ingresso che non è più quella.
   *
   * Ricerca 18/09/2026 (21st.dev, «Animated Backgrounds in React», ago 2026: su 155 sfondi
   * censiti 67 girano un ciclo continuo e solo 6 si fermano quando nessuno guarda; ctxr-dev
   * `skill-frontend-excellence`, `references/motion.md`: «pause all motion on a route change»):
   * una modale a tutto schermo è esattamente la condizione «nessuno sta guardando», e il ciclo
   * decorativo compete per lo stesso budget di 16,7 ms dell'animazione d'ingresso della modale.
   * La regola del prodotto è quindi giusta — è il collegamento che manca.
   */
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).toHaveClass(/background-motion-paused/);

  await page.locator('[data-chiudi="veloComandi"]').click();
  await expect(page.locator('#veloComandi')).toBeHidden();
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/);
});

test('LAG-INTERACTION-SCROLL-39 — lo scroll pausa lo sfondo solo durante il gesto', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { backgroundMotion: true, motionMode: 'adaptive', reducedMotion: false },
    }));
  });
  await apriChat(page);
  const root = page.locator('html');
  /*
   * ⛔ 18/09/2026 — LO SCROLLER VERO NON È `#conversation`. Misurato con `sonda-interazioni-2.mjs`
   * (porta 4197, 1440×900): `#conversation` è **709×0** con `overflow-y: visible` — la rotella
   * sopra un nodo alto zero non scorre niente, e `scrollTop` resta 0 (è l'errore vero del rosso:
   * `Expected: > 0 · Received: 0`, timeout 5 s sul predicato). Chi scorre è `.talos-conversation`:
   * **824×700, `overflow-y: auto`**, `scrollTop` 0 → 420 con la stessa rotella.
   * Le due classi `.talos-conversation` sono due nodi (`.talos-conversation--empty` è lo stato
   * vuoto, 824×700 pure lui): il modificatore è l'unica differenza, quindi il locator si restringe
   * NEL SELETTORE e non con `.first()` — è la differenza semantica, non l'ordine.
   * Ricerca 18/09/2026: Playwright «Locators» (strict mode; «be specific»), già applicata sopra per
   * `.mode-tab[data-vaia]`.
   */
  const conversation = page.locator('.talos-conversation:not(.talos-conversation--empty)');
  await expect(conversation).toHaveCount(1);
  await conversation.evaluate((element) => {
    const spacer = document.createElement('div');
    spacer.style.height = '2400px';
    spacer.setAttribute('aria-hidden', 'true');
    element.append(spacer);
  });
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/);

  const box = await conversation.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 420);
  /*
   * ⛔ 18/09/2026 — L'ORDINE DELLE DUE PROVE È UNA MISURA, NON UN GUSTO. La pausa dura
   * `BACKGROUND_SCROLL_RESUME_DELAY_MS = 220` (`app.js:14727`), e la si vede accesa a **+80 ms**
   * dalla rotella e già spenta a **+300 ms** (`sonda-interazioni-2.mjs`). Se si aspettasse prima il
   * `scrollTop` (che il poll risolve in ~100-150 ms), l'asserzione sulla pausa arriverebbe a
   * finestra quasi chiusa e diventerebbe intermittente: si prova PRIMA la classe, che è l'effetto
   * del gesto, e solo dopo la posizione.
   */
  await expect(root).toHaveClass(/background-motion-paused/);
  await expect.poll(() => conversation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(root).toHaveClass(/background-motion-active/);
  await expect(root).not.toHaveClass(/background-motion-paused/, { timeout: 1_000 });
});

test('FILE-EXPLORER-TOOLBAR-05 — la sidebar Files espone i quattro comandi e li disabilita senza sessione', async ({ page }) => {
  await apriChat(page);
  await page.locator('#inspector-tab-files').click();
  /*
   * ⛔ 18/09/2026 — PO-30, fetta 1 (owner 17/09/2026, `index.template.html:1247-1256`): i CINQUE
   * comandi a icona affiancati sono diventati DUE menu — «+» `#fileTreeAdd` → `#menuFileNuovo`,
   * «⋯» `#fileTreeMore` → `#menuFileAltro` — e due etichette sono cambiate: «Aggiorna file» →
   * **«Rileggi la cartella»**, «Comprimi cartelle» → **«Chiudi tutte le cartelle»**. I quattro id
   * (`#fileTreeNewFile`, `#fileTreeNewFolder`, `#fileTreeRefresh`, `#fileTreeCollapse`) sono gli
   * stessi di prima: è cambiato il posto, non il comando (le vecchie etichette sopravvivono solo
   * nel mockup, `mockup/talos-mockup.html:3470`).
   * ⇒ Il vecchio `getByRole('button', { name: 'Aggiorna file' })` non poteva più trovarle, per DUE
   * ragioni indipendenti, entrambe documentate (Playwright, guida «Locators» / getByRole, letta
   * 18/09/2026 — https://playwright.dev/docs/locators#locate-by-role): le voci portano
   * `role="menuitem"` (non `button`), e stanno dentro un `popover` CHIUSO, che il selettore di
   * ruolo scarta perché fuori dall'albero di accessibilità. Qui si interrogano per id: è l'oggetto
   * vero, non il suo ruolo, e regge anche a popover chiuso.
   *
   * ⛔ L'ASSERZIONE `toBeDisabled()` RESTA, e oggi è ROSSA per un difetto di PRODOTTO, non di test.
   * MISURATO il 18/09/2026 (porta 4197, store vuoto, `realSessionState.id === null`, scheda File
   * aperta): `#fileTreeAdd` 40×32 `disabled:false`, `#fileTreeMore` 40×32 `disabled:false`, e il
   * menu «+» si apre davvero — i quattro comandi sono cliccabili SENZA sessione. La regola del
   * prodotto è l'opposta ed è scritta due volte: `syncFileTreeToolbar()` (`src/legacy/app.js:14124`)
   * spegne gli stessi sette bottoni quando non c'è una sessione vera, e il suo commento di
   * chiamata (`src/legacy/app.js:11932-11945`) dice perché. Il punto è che quella chiamata vive in
   * `resettaSuperficiRealiDedicate()`, che parte SOLO da una sessione precedente
   * (`src/legacy/app.js:17413`), e `renderizzaAlberoRealeUnaVolta()` esce PRIMA di sincronizzare
   * quando non c'è né `id` né `previewProjectId` (`src/legacy/app.js:15716-15718`) ⇒ a freddo
   * nessuno dei due percorsi passa di lì. Nessuna cura lato test: la riga va resa verde dal
   * prodotto (una `syncFileTreeToolbar(false)` al bootstrap).
   */
  for (const selettore of ['#fileTreeAdd', '#fileTreeMore', '#fileTreeNewFile', '#fileTreeNewFolder', '#fileTreeRefresh', '#fileTreeCollapse']) {
    const comando = page.locator(selettore);
    await expect(comando).toBeAttached();
    await expect(comando).toBeDisabled();
  }
});

test('FILE-EXPLORER-REFRESH-06 — sessione reale abilita crea, aggiorna e comprimi senza cache stantia', async ({ page }) => {
  let rootReads = 0;
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [{
      sessionId: 'session-tree-tools', taskId: 'libero:default', nome: 'File tools',
      avviataAlle: '2026-09-01T08:00:00.000Z', conclusa: true,
      modello: 'qwen/qwen3.8-flash', provider: 'cloud',
    }] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-tree-tools/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/session-tree-tools/tree**', async (route) => {
    const path = new URL(route.request().url()).searchParams.get('percorso') || '';
    if (path === '') rootReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: path === '' ? [{ nome: 'src', cartella: true }] : [{ nome: 'app.js', cartella: false }] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });

  await apriChat(page);
  await page.locator('[data-real-session-id="session-tree-tools"]').click();
  await page.locator('#inspector-tab-files').click();
  /*
   * ⛔ 18/09/2026 — PO-30 (owner 17/09/2026, `index.template.html:1247-1256`): con una sessione vera
   * i quattro comandi sono ABILITATI (`syncFileTreeToolbar()`, `src/legacy/app.js:14124`), ma non
   * stanno più affiancati nella toolbar: si raggiungono da «+» (`#fileTreeAdd` → `#menuFileNuovo`) e
   * da «⋯» (`#fileTreeMore` → `#menuFileAltro`). Due etichette sono cambiate — «Aggiorna file» →
   * «Rileggi la cartella», «Comprimi cartelle» → «Chiudi tutte le cartelle». Le voci portano
   * `role="menuitem"` dentro un `popover`, quindi il selettore di ruolo le scarta finché il menu è
   * chiuso (Playwright, guida «Locators»/getByRole, letta 18/09/2026, già citata sopra): si aprono i
   * menu come fa la persona, e si interroga per id — che è l'oggetto vero.
   * MISURATO il 18/09/2026 con sessione vera (porta 4197): `#fileTreeAdd` e `#fileTreeMore` 40×32
   * `disabled:false`, e i due menu si aprono con le voci visibili.
   */
  for (const selettore of ['#fileTreeAdd', '#fileTreeMore']) {
    await expect(page.locator(selettore)).toBeEnabled();
  }
  await page.locator('#fileTreeAdd').click();
  await expect(page.locator('#fileTreeNewFile')).toBeVisible();
  await expect(page.locator('#fileTreeNewFolder')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#fileTreeMore').click();
  await expect(page.locator('#fileTreeRefresh')).toBeVisible();
  await expect(page.locator('#fileTreeCollapse')).toBeVisible();
  await page.keyboard.press('Escape');

  const folder = page.locator('#inspector-files .ft-node[data-percorso="src"] > .ft-row');
  await folder.click();
  await expect(page.locator('#inspector-files .ft-node[data-percorso="src"]')).toHaveAttribute('aria-expanded', 'true');
  const beforeRefresh = rootReads;
  await page.locator('#fileTreeMore').click();
  await page.locator('#fileTreeRefresh').click();
  await expect.poll(() => rootReads).toBeGreaterThan(beforeRefresh);
  await page.locator('#fileTreeMore').click();
  await page.locator('#fileTreeCollapse').click();
  await expect(page.locator('#inspector-files .ft-node[data-percorso="src"]')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#fileTreeAdd').click();
  await page.locator('#fileTreeNewFolder').click();
  /*
   * ⛔ 18/09/2026 — il titolo del dialogo non è `#sheetTitle`: quel nodo non esiste più in pagina
   * (0 occorrenze in `index.template.html`) ed è il residuo di un altro flusso — misurato, dopo il
   * clic su «Nuova cartella» conteneva ancora «Capability». Il titolo vero lo scrive il velo in
   * `src/legacy/app.js:7585` su `#titoloveloCreaFile` (è il nodo puntato da `aria-labelledby` del
   * dialogo, `index.template.html:1295`), insieme a etichetta e testo del pulsante.
   */
  await expect(page.locator('#titoloveloCreaFile')).toHaveText('Nuova cartella');
  await expect(page.locator('#creaFileSalva')).toHaveText('Crea cartella');
});

test('LAG-REPLAY-TREE-31 — una raffica storica invalida il tree una volta senza render concorrenti', async ({ page }) => {
  let rootReads = 0;
  await page.route('**/api/v1/sessions/lag-replay-tree/tree**', async (route) => {
    rootReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: [{ nome: 'src', cartella: true }] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });
  await apriChat(page);
  /*
   * ⛔ BC-42 (12/09, `src/legacy/app.js:1085-1117`): il fetch dell'albero è DIFFERITO finché la
   * scheda File non è a vista — `schedaFileAVista()` legge `[data-inspector-section="files"]`
   * (il pannello `#railFile`, marcato dal ponte a `src/bridge/legacy-dom.js:200` e nato `hidden`).
   * Il test contava le letture di un albero che nessuno aveva aperto: 0, misurato il 18/09/2026
   * sulla porta 4197 (`Expected: 1 / Received: 0`). Il gesto giusto è quello della persona —
   * aprire la scheda — e si verifica che il tab l'abbia ACCETTATO (`aria-selected`) prima di
   * contare: un'attesa generica da sola passerebbe contro un pannello che non si è mai mosso
   * (Playwright, guida «Locators» / auto-waiting, letta 18/09/2026).
   */
  await page.locator('#inspector-tab-files').click();
  await expect(page.locator('#inspector-tab-files')).toHaveAttribute('aria-selected', 'true');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.id = 'lag-replay-tree';
    session.taskId = 'workspace';
    session.generation += 1;
    session.sequenzeViste.clear();
    const generation = session.generation;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(document.querySelector('#inspector-files .file-tree'), { childList: true, subtree: true, attributes: true });
    for (let index = 0; index < 500; index += 1) {
      runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: [`file-${index}.txt`], _sequenza: 10000 + index }, generation);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    observer.disconnect();
    return { mutations, treeNodes: document.querySelectorAll('#inspector-files .ft-node').length };
  });
  expect(rootReads).toBeLessThanOrEqual(2);
  expect(result.mutations).toBeLessThanOrEqual(12);
  expect(result.treeNodes).toBe(1);
});

test('LAG-REPLAY-TEXT-32 — molti delta storici fanno un solo commit visuale finale', async ({ page }) => {
  await apriChat(page);
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation').replaceChildren();
    session.messageElements.clear();
    session.testoGrezzoMessaggi.clear();
    session.sequenzeViste.clear();
    let mutations = 0;
    const conversation = document.querySelector('#conversation');
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true });
    for (let index = 0; index < 250; index += 1) {
      runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'history-message', delta: 'a', _sequenza: 20000 + index }, session.generation);
    }
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'history-message', _sequenza: 20250 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();
    return {
      mutations,
      text: conversation.querySelector('.assistant-copy')?.textContent || '',
      messages: conversation.querySelectorAll('.assistant-message').length,
    };
  });
  expect(result.text).toBe('a'.repeat(250));
  expect(result.messages).toBe(1);
  expect(result.mutations).toBeLessThanOrEqual(12);
});

test('LAG-REPLAY-PACED-35 — una cronologia conclusa non riparsa il markdown a ogni delta cadenzato', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    session.messageElements.clear();
    session.testoGrezzoMessaggi.clear();
    session.sequenzeViste.clear();
    session.deferHistoricalRendering = true;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true });
    for (let index = 0; index < 40; index += 1) {
      runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'paced-history', delta: `${index} `, _sequenza: 21000 + index }, session.generation);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const beforeEnd = conversation.querySelector('.assistant-copy')?.textContent || '';
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'paced-history', _sequenza: 21040 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();
    return {
      mutations,
      beforeEnd,
      afterEnd: conversation.querySelector('.assistant-copy')?.textContent || '',
    };
  });
  expect(result.beforeEnd).toBe('');
  expect(result.afterEnd).toBe(Array.from({ length: 40 }, (_, index) => `${index} `).join(''));
  expect(result.mutations).toBeLessThanOrEqual(12);
});

test('LAG-REPLAY-REASONING-36 — il ragionamento storico conserva il testo senza commit per delta', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    session.ragionamentoBubble.clear();
    session.sequenzeViste.clear();
    session.deferHistoricalRendering = true;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(conversation, { childList: true, subtree: true, characterData: true, attributes: true });
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'paced-reasoning', _sequenza: 22000 }, session.generation);
    for (let index = 0; index < 30; index += 1) {
      runtime.handleRealEvent({ type: 'ReasoningMessageContent', messageId: 'paced-reasoning', delta: `passo ${index} `, _sequenza: 22001 + index }, session.generation);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    runtime.handleRealEvent({ type: 'ReasoningMessageEnd', messageId: 'paced-reasoning', _sequenza: 22031 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 50));
    observer.disconnect();
    return {
      mutations,
      text: conversation.querySelector('.real-reasoning-note .tool-note-detail')?.textContent || '',
    };
  });
  expect(result.text).toBe(Array.from({ length: 30 }, (_, index) => `passo ${index} `).join(''));
  expect(result.mutations).toBeLessThanOrEqual(20);
});

test('LAG-LIVE-TEXT-37 — il resume disattiva il differimento e mostra lo streaming prima della fine', async ({ page }) => {
  await page.route('**/api/v1/sessions/lag-live-text/resume', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { sessionId: 'lag-live-text' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/lag-live-text/events', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  }));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('lag-live-text', 'workspace', 'Cronologia', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
    const deferredBeforeResume = runtime.realSessionState.deferHistoricalRendering;
    await runtime.resumeSession('Continua il controllo');
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'live-after-resume', delta: 'Testo vivo', _sequenza: 23000 }, generation);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      deferredBeforeResume,
      deferredAfterResume: runtime.realSessionState.deferHistoricalRendering,
      text: document.querySelector('.assistant-copy:last-child')?.textContent || document.querySelector('.assistant-message:last-child .assistant-copy')?.textContent || '',
    };
  });
  expect(result.deferredBeforeResume).toBe(true);
  expect(result.deferredAfterResume).toBe(false);
  expect(result.text).toContain('Testo vivo');
});

test('LAG-LIVE-WORKSPACE-33 — un cambiamento live isolato aggiorna ancora il tree', async ({ page }) => {
  let rootReads = 0;
  await page.route('**/api/v1/sessions/lag-live-tree/tree**', async (route) => {
    rootReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: [{ nome: 'README.md', cartella: false }] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });
  await apriChat(page);
  // ⛔ BC-42 (12/09, `src/legacy/app.js:1085-1117`, vedi LAG-REPLAY-TREE-31): senza la scheda File a
  // vista il fetch del tree è differito — 0 letture misurate il 18/09/2026 (`Expected: 1 / Received: 0`).
  await page.locator('#inspector-tab-files').click();
  await expect(page.locator('#inspector-tab-files')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.id = 'lag-live-tree';
    session.taskId = 'workspace';
    session.generation += 1;
    session.sequenzeViste.clear();
    runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['README.md'], _sequenza: 30001 }, session.generation);
  });
  await expect.poll(() => rootReads).toBe(1);
  await expect(page.locator('#inspector-files .ft-node')).toHaveCount(1);
});

test('LAG-GENERATION-CANCEL-34 — il cambio sessione annulla il tree differito precedente', async ({ page }) => {
  const reads = { old: 0, current: 0 };
  await page.route('**/api/v1/sessions/*/tree**', async (route) => {
    const sessionId = new URL(route.request().url()).pathname.split('/')[4];
    if (sessionId === 'lag-old') reads.old += 1;
    if (sessionId === 'lag-current') reads.current += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      data: { voci: [] },
      meta: { schema: 'talos.harness-ui.api.v1' },
    }) });
  });
  await apriChat(page);
  // ⛔ BC-42 (12/09, `src/legacy/app.js:1085-1117`, vedi LAG-REPLAY-TREE-31): con la scheda File
  // chiusa ogni `WorkspaceChanged` finisce in `alberoDaRidisegnare` e NESSUNA lettura parte — il
  // test misurava «0 letture» come se fosse una cancellazione di generazione. Misurato il
  // 18/09/2026 sulla porta 4197 (`reads.current: Expected 1 / Received 0`).
  await page.locator('#inspector-tab-files').click();
  await expect(page.locator('#inspector-tab-files')).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.id = 'lag-old';
    session.taskId = 'old';
    session.generation += 1;
    runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['old.txt'], _sequenza: 40001 }, session.generation);
    session.id = 'lag-current';
    session.taskId = 'current';
    session.generation += 1;
    runtime.handleRealEvent({ type: 'WorkspaceChanged', percorsi: ['current.txt'], _sequenza: 40002 }, session.generation);
  });
  await expect.poll(() => reads.current).toBe(1);
  expect(reads.old).toBe(0);
});

test('cold start does not expose invented runtime telemetry', async ({ page }) => {
  await apriChat(page);
  const text = await page.locator('body').innerText();
  for (const value of ['wt/auth', 'feat/mobile', '18.7k / 128k', '142 tok/s', 'cache 78%', 'Attrezzi\n7', 'Browser\nScoped']) {
    expect(text).not.toContain(value);
  }
  await expect(page.locator('[data-runtime-usage]')).toHaveText('Contesto non osservato');
  await expect(page.locator('[data-environment-label]').first()).toHaveText('Ambiente non osservato');
});

test('model chip never exposes the server-default label', async ({ page }) => {
  await apriChat(page);
  const chip = page.locator('[data-open-sheet="model"] .talos-chip__label').first();
  await expect(chip).toBeVisible();
  await expect(chip).not.toHaveText('Predefinito del server');
  await expect(page.locator('body')).not.toContainText('Predefinito del server');
});

test('Nuova sessione usa la workspace desktop senza configurazione manuale', async ({ page }) => {
  const project = 'C:\\Users\\esempio\\Desktop\\projects\\AVM-harness-desktop';
  await page.route('**/api/v1/workspace-browser**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: {
      root: 'C:\\', path: 'C:\\', parent: null,
      items: [{ name: 'Users', path: 'C:\\Users', projectId: null }],
      recommended: [{ label: 'AVM-harness-desktop', path: project, kind: 'project', projectId: 'default' }],
    }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.goto('/');
  await page.locator('#newSessionBtn').click();
  await expect(page.locator('#sheetDialog')).toBeVisible();
  await expect(page.locator('#sheetTitle')).toHaveText('Su quale progetto lavora TALOS?');
  await expect(page.locator('[data-workspace-selected-path]')).toHaveText(project);
  await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
  await expect(page.locator('#workspaceChooserSubmit')).toContainText('AVM-harness-desktop');
  await expect(page.locator('#sheetBody')).not.toContainText('Non c’è ancora una cartella di progetto disponibile');
  await expect(page.locator('#sheetBody')).not.toContainText('Imposta TALOS_HARNESS_UI_PROJECT_DIRS');
});

test('OPEN-WITH-TALOS-BROWSER-01 — il fragment prepara il workspace senza inventare Full access', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const launchId = 'A'.repeat(32);
  let corpoAvvio = null;
  await page.route(`**/api/v1/workspace-launches/${launchId}`, async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { id: launchId, nome: 'Progetto Ω', scadeAlle: '2026-09-01T12:02:00.000Z' } }),
  }));
  await page.route('**/api/v1/sessions/custom', async (route) => {
    corpoAvvio = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { sessionId: 'session-open-with' } }) });
  });
  await page.route('**/api/v1/sessions/session-open-with/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));

  await page.goto(`/#open-workspace=${launchId}`);
  await expect(page.locator('#sessionTitle')).toHaveText('Nuova · Progetto Ω');
  await expect(page.locator('#conversation')).toContainText('Sessione pronta su Progetto Ω.');
  await expect(page.locator('#inspector-files .file-tree')).toContainText('Progetto Ω');
  await expect(page.locator('#inspector-files .file-tree')).toContainText('I file appariranno appena inizi la sessione.');
  await expect(page.locator('#inspector-files .file-tree')).not.toContainText('Nessuna cartella ancora scelta');
  await expect(page.locator('[data-open-sheet="permissions"] span')).toHaveText('Scrive nel progetto');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'open-with-talos-1440x900.png'), fullPage: true });

  await page.locator('#composerInput').fill('Controlla il progetto');
  await page.locator('#composerForm').evaluate((form) => form.requestSubmit());
  await expect.poll(() => corpoAvvio).not.toBeNull();
  expect(corpoAvvio.workspaceLaunchId).toBe(launchId);
  expect(corpoAvvio.permessi).toBe('Workspace write');
  expect(corpoAvvio).not.toHaveProperty('cartellaLibera');
});

test('selezionare una sessione sincronizza la pillola con il suo modello reale', async ({ page }) => {
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [{
      sessionId: 'session-model-sync',
      taskId: 'libero:default',
      nome: 'Sessione Qwen',
      avviataAlle: '2026-09-01T07:00:00.000Z',
      conclusa: true,
      modello: 'qwen/qwen3.8-flash',
      provider: 'cloud',
    }, {
      sessionId: 'session-without-model',
      taskId: 'libero:legacy',
      nome: 'Sessione storica',
      avviataAlle: '2026-08-31T07:00:00.000Z',
      conclusa: true,
      provider: 'cloud',
    }] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-sync/events', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  }));
  await apriChat(page);
  const session = page.locator('[data-real-session-id="session-model-sync"]');
  await expect(session).toBeVisible();
  await session.click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label')).toHaveText('qwen3.8-flash');
  await page.locator('[data-real-session-id="session-without-model"]').click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label')).toHaveText('Scegli il modello');
});

test('il modello della sessione resta identico dopo un reload', async ({ page }) => {
  const sessione = {
    sessionId: 'session-gemini-reload', taskId: 'libero:default', nome: 'Sessione Gemini',
    avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true,
    modello: 'google/gemini-3.7-flash', provider: 'cloud',
  };
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-gemini-reload/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await apriChat(page);
  await page.locator('[data-real-session-id="session-gemini-reload"]').click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label')).toHaveText('gemini-3.7-flash');
  await page.reload();
  await page.locator('[data-real-session-id="session-gemini-reload"]').click({ button: 'right' });
  await page.locator('.session-actions-menu').getByRole('menuitem', { name: 'Apri' }).click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label')).toHaveText('gemini-3.7-flash');
});

test('SESSION-MODEL-CHANGE-RELOAD-02 — la pillola cambia solo dopo il salvataggio e resta corretta al reload', async ({ page }) => {
  const sessione = {
    sessionId: 'session-model-change', taskId: 'libero:default', nome: 'Cambio modello',
    avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true,
    modello: 'z-ai/glm-4.7-flash', modelId: 'z-ai/glm-4.7-flash', provider: 'cloud',
    reasoning: { effort: 'none' },
  };
  const aggiornamenti = [];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-change/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/models', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { modelli: [
      { id: 'z-ai/glm-4.7-flash', provider: 'z-ai', nome: 'Z.AI: GLM 4.7 Flash', reasoning: { supportedEfforts: [], defaultEffort: null, defaultEnabled: false, mandatory: false } },
      { id: 'google/gemini-3.7-flash', provider: 'google', nome: 'Google: Gemini 3.7 Flash', reasoning: { supportedEfforts: ['low', 'medium', 'high'], defaultEffort: 'medium', defaultEnabled: true, mandatory: true } },
    ], daCache: true }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-change/settings', async (route) => {
    const patch = route.request().postDataJSON();
    aggiornamenti.push(patch);
    await new Promise((resolve) => setTimeout(resolve, 300));
    Object.assign(sessione, patch);
    sessione.modelId = patch.modello;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
  });

  await apriChat(page);
  await page.locator('[data-real-session-id="session-model-change"]').click();
  const pillola = page.locator('[data-open-sheet="model"] .talos-chip__label').first();
  await expect(pillola).toHaveText('glm-4.7-flash');
  await page.locator('[data-open-sheet="model"]').click();
  await page.locator('.talos-dialog input.sheet-input').fill('gemini-3.7-flash');
  await page.getByRole('option').filter({ hasText: 'google/gemini-3.7-flash' }).click();
  /*
   * ⛔ 18/09/2026 — qui c'era `#sheetDialog`, che è il `<dialog class="sheet-dialog">` del
   * PROTOTIPO: esiste ancora ma con `open:false` («Contesto · Capability»), quindi l'asserzione
   * «il foglio resta aperto mentre salva» guardava un nodo chiuso. Il foglio vero del mockup è
   * `div.talos-dialog[role="dialog"][aria-modal="true"]`, con `h2.talos-dialog__title` «Modello e
   * ragionamento» e `aria-labelledby="titoloveloModello"`; la ricerca è `input.sheet-input`
   * (`.model-picker-search` = **0 nodi**: era il markup del prototipo). Misurato con
   * `sonda-cambio-modello.mjs` (18/09, porta 4197): il foglio resta visibile subito dopo il clic
   * (e la pillola NO: ancora «glm-4.7-flash»), e sparisce dopo il salvataggio (~900 ms), quando la
   * pillola diventa «gemini-3.7-flash». `getByRole('dialog', { name: … })` risolve a **1**.
   */
  await expect(page.getByRole('dialog', { name: 'Modello e ragionamento' })).toBeVisible();
  await expect(pillola).toHaveText('glm-4.7-flash');
  await expect.poll(() => aggiornamenti).toEqual([{
    modello: 'google/gemini-3.7-flash',
    reasoning: { effort: 'medium' },
  }]);
  await expect(page.locator('#sheetDialog')).not.toBeVisible();
  await expect(pillola).toHaveText('gemini-3.7-flash');

  await page.reload();
  await page.locator('[data-real-session-id="session-model-change"]').click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label').first()).toHaveText('gemini-3.7-flash');
  await page.locator('[data-open-sheet="model"]').click();
  await expect(page.locator('.effort-picker-selected')).toHaveText('Medio');
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'model-switch-reasoning-1440x900.png'), fullPage: true });
});

test('SESSION-MODEL-UPDATE-FAIL-01 — un server incompatibile non produce una pillola falsa', async ({ page }) => {
  const sessione = {
    sessionId: 'session-model-failure', taskId: 'libero:default', nome: 'Modello invariato',
    avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true,
    modello: 'z-ai/glm-4.7-flash', modelId: 'z-ai/glm-4.7-flash', provider: 'cloud',
    reasoning: { effort: 'none' },
  };
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-failure/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/models', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { modelli: [
      { id: 'google/gemini-3.7-flash', provider: 'google', nome: 'Google: Gemini 3.7 Flash', reasoning: { supportedEfforts: ['low', 'medium'], defaultEffort: 'medium', defaultEnabled: true, mandatory: true } },
    ], daCache: true }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-model-failure/settings', async (route) => route.fulfill({
    status: 405, contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Questa installazione deve essere aggiornata' } }),
  }));

  await apriChat(page);
  await page.locator('[data-real-session-id="session-model-failure"]').click();
  const pillola = page.locator('[data-open-sheet="model"] .talos-chip__label').first();
  await page.locator('[data-open-sheet="model"]').click();
  await page.locator('.talos-dialog input.sheet-input').fill('gemini-3.7-flash');
  await page.getByRole('option').filter({ hasText: 'google/gemini-3.7-flash' }).click();
  // Stessa migrazione del test precedente: `#sheetDialog` era il foglio del prototipo (0 nodi aperti).
  await expect(page.getByRole('dialog', { name: 'Modello e ragionamento' })).toBeVisible();
  await expect(pillola).toHaveText('glm-4.7-flash');
  await expect(page.locator('.effort-picker-selected')).toHaveText('Off');
  /*
   * ⛔ 18/09/2026 — `#toastRegion` è il contenitore del PROTOTIPO (`src/legacy/frammenti.html:263`,
   * `data-legacy-id="toastRegion"`, dentro `#talos-legacy`): resta vuoto. La pila vera nasce su
   * `#regioneToast` — `src/legacy/app.js:484` (`$('#regioneToast') || $('#toastRegion')`) e
   * `:2229` — che è l'id del mockup, come tutte le altre prove di toast della suite
   * (`azioni-risposta.spec.mjs:196`, `toast-non-copre-i-comandi.spec.mjs:104`).
   * Il toast lo accende app.js:17842, sul rifiuto 405 della PATCH delle impostazioni.
   */
  await expect(page.locator('#regioneToast')).toContainText('Preferenza non salvata');
  await page.reload();
  await page.locator('[data-real-session-id="session-model-failure"]').click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label').first()).toHaveText('glm-4.7-flash');
});

test('RUN-MODEL-RESUME-RACE-10 — il RunStarted visto durante la POST conserva il modello nel bubble del follow-up', async ({ page }) => {
  await page.route('**/api/v1/sessions/model-resume-race/resume', async (route) => {
    await page.evaluate(() => {
      const runtime = window.__talosHarnessUiRuntime;
      runtime.handleRealEvent({
        type: 'RunStarted',
        input: { consegna: 'follow-up', seguito: true },
        contesto: { modello: 'qwen/qwen3.8-flash', reasoning: { effort: 'medium' } },
        _sequenza: 92001,
      }, runtime.realSessionState.generation);
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { sessionId: 'model-resume-race' } }),
    });
  });
  await page.route('**/api/v1/sessions/model-resume-race/events', async (route) => route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: '',
  }));
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'model-resume-race';
    runtime.realSessionState.taskId = 'libero:default';
    runtime.realSessionState.eventoTerminaleVisto = true;
    runtime.realSessionState.currentRunModel = 'modello-precedente';
    runtime.syncRunComposerState();
  });

  await page.evaluate(() => window.__talosHarnessUiRuntime.resumeSession('follow-up'));
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'race-answer', delta: 'Risposta coerente', _sequenza: 92002 }, runtime.realSessionState.generation);
    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: 'race-answer', _sequenza: 92003 }, runtime.realSessionState.generation);
  });

  /*
   * ⛔ 18/09/2026 — `.assistant-meta` è la classe del PROTOTIPO: **0 nodi**. Nel mockup la testata
   * del messaggio è `span.talos-message__who` («Tu» / «TALOS») + `span.talos-message__meta`
   * (modello · ora), costruiti in `src/components/conversazione.js:158/180`; il modello lo scrive
   * `src/legacy/app.js:10712` con `nomeModelloBreve(...)` — cioè il **nome umano**, non l'id.
   * Misurato con `sonda-meta.mjs` (18/09, porta 4197): dopo il resume l'ultima meta è
   * «**qwen3.8-flash** · 16:08» (la bolla del giro nuovo) e quella precedente resta
   * «modello-precedente».
   */
  await expect(page.locator('.talos-message__meta').last()).toContainText('qwen3.8-flash');
});

test('RUN-MODEL-TRACE-UI-07 — ogni risposta e l’export conservano il modello del proprio giro', async ({ page }) => {
  await apriChat(page);
  const prova = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation').replaceChildren();
    session.messageElements.clear();
    session.testoGrezzoMessaggi.clear();
    session.sequenzeViste.clear();
    session.runCount = 0;
    session.taskBubbleMostrata = false;

    const eventi = [
      { type: 'RunStarted', input: { consegna: 'Primo giro' }, contesto: { modello: 'qwen/qwen3.8-flash', reasoning: { effort: 'low' } }, _sequenza: 91001 },
      { type: 'TextMessageContent', messageId: 'turn-qwen', delta: 'Risposta Qwen', _sequenza: 91002 },
      { type: 'TextMessageEnd', messageId: 'turn-qwen', _sequenza: 91003 },
      { type: 'ToolCallStart', toolCallId: 'tool-qwen', toolCallName: 'leggi', _sequenza: 91004 },
      { type: 'ToolCallArgs', toolCallId: 'tool-qwen', delta: '{"percorso":"README.md"}', _sequenza: 91005 },
      { type: 'ToolCallResult', toolCallId: 'tool-qwen', content: 'contenuto letto', _sequenza: 91006 },
      { type: 'RunFinished', _sequenza: 91007 },
      { type: 'RunStarted', input: { consegna: 'Secondo giro', seguito: true }, contesto: { modello: 'google/gemini-3.7-flash', reasoning: { effort: 'medium' } }, _sequenza: 91008 },
      { type: 'TextMessageContent', messageId: 'turn-gemini', delta: 'Risposta Gemini', _sequenza: 91009 },
      { type: 'TextMessageEnd', messageId: 'turn-gemini', _sequenza: 91010 },
    ];
    for (const evento of eventi) runtime.handleRealEvent(evento, session.generation);

    /*
     * ⛔ 18/09/2026 — `.assistant-meta` è la classe del PROTOTIPO: **0 nodi** (misurato con
     * `sonda-meta.mjs`, 18/09, porta 4197). Nel mockup la testata si compone in due span
     * (`src/components/conversazione.js:158` per la persona, `:180` per TALOS): il modello sta
     * nella `.talos-message__meta` del messaggio di TALOS, in **nome umano** (app.js:10712), e
     * l'ora viene DOPO (`[modello, ora].filter(Boolean).join(' · ')`). La stessa sonda ha misurato
     * che il messaggio della persona porta una meta tutta sua (`ora · consegna`), quindi si
     * filtrano le testate di TALOS invece di prendere tutti i nodi in ordine.
     */
    const meta = [...document.querySelectorAll('.talos-message__head')]
      .filter((testata) => testata.querySelector('.talos-message__who--talos'))
      .map((testata) => (testata.querySelector('.talos-message__meta')?.textContent || '').trim());
    const tool = document.querySelector('[data-tool-state="complete"]')?.textContent || '';
    const exportMd = runtime.costruisciTrascrizioneMarkdown({
      sessionId: 'switch-trace',
      taskId: 'libero:default',
      nome: 'Cambio fluido',
      modello: 'google/gemini-3.7-flash',
      eventi: eventi.map(({ _sequenza, ...evento }) => evento),
    });
    return { meta, tool, exportMd };
  });

  /* Il modello è la PRIMA parte della meta; l'ora che segue è quella del giro e non si asserisce. */
  expect(prova.meta.map((testo) => testo.split(' · ')[0])).toEqual([
    'qwen3.8-flash',
    'gemini-3.7-flash',
  ]);
  expect(prova.tool).toContain('README.md');
  expect(prova.exportMd).toContain('**Modello del giro:** qwen/qwen3.8-flash');
  expect(prova.exportMd).toContain('**Modello del giro:** google/gemini-3.7-flash');
  /*
   * ⛔ 18/09/2026 — `**🔧 leggi**` non è più la forma dell'export: dal 04/09 (owner: «niente nomi
   * TECNICI a schermo, la mappa nome-tecnico → nome-umano vive in UN posto solo», BC-59 il 17/09) la
   * riga è `**🔧 <nome umano>** · \`leggi\`` — `src/legacy/app.js:13519`, col nome umano preso da
   * `src/components/nomi-attrezzi.js:29` e passato per `t()` (`:90`), e l'id tecnico che resta come
   * DETTAGLIO secondario. Il nome umano è tradotto nella lingua dell'interfaccia, quindi non si
   * asserisce la parola: si asserisce il contratto — l'id in backtick c'è, e l'etichetta in evidenza
   * NON è l'id.
   */
  expect(prova.exportMd).toContain('`leggi`');
  expect(prova.exportMd).not.toContain('**🔧 leggi**');
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'model-switch-turn-attribution-1440x900.png'), fullPage: true });
});

test('la sidebar consente selezione massiva e cancellazione esplicita delle sessioni', async ({ page }) => {
  let sessioni = [
    { sessionId: 'bulk-a', taskId: 'a', nome: 'Sessione A', avviataAlle: '2026-09-01T07:00:00.000Z', conclusa: true, modello: 'google/gemini-3.7-flash', provider: 'cloud' },
    { sessionId: 'bulk-b', taskId: 'b', nome: 'Sessione B', avviataAlle: '2026-09-01T06:00:00.000Z', conclusa: true, modello: 'qwen/qwen3.8-flash', provider: 'cloud' },
    { sessionId: 'bulk-c', taskId: 'c', nome: 'Sessione C', avviataAlle: '2026-09-01T05:00:00.000Z', conclusa: true, modello: 'z-ai/glm-4.7-flash', provider: 'cloud' },
  ];
  const eliminati = [];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: sessioni }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/*/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/*/delete', async (route) => {
    const id = route.request().url().split('/sessions/')[1].split('/delete')[0];
    eliminati.push(id);
    sessioni = sessioni.filter((sessione) => sessione.sessionId !== id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
  });
  await apriChat(page);
  /*
   * ⛔ 18/09/2026 — l'ordine era rovesciato: si pretendeva VISIBILE la barra della selezione
   * PRIMA di accendere la selezione. Misurato sulla 4199 (`%TEMP%\corsia5\z4.log`, Z10):
   * `#sessionSelectionToolbar` è `hidden` e 0×0 al primo disegno del guscio, e 275×52 dopo il
   * toggle. La barra nasce spenta per costruzione, e ad accenderla è `#sessionSelectionToggle`.
   * Playwright, `toBeVisible`/`toBeHidden` (github.com/microsoft/playwright, letto 18/09/2026):
   * un elemento `[hidden]` non è visibile ⇒ l'asserzione chiedeva al prodotto l'opposto del suo
   * contratto. Ora si prova il PRIMA e il DOPO: se la barra restasse sempre accesa, o non si
   * accendesse più, il test diventa rosso in uno dei due versi.
   */
  await expect(page.locator('#sessionSelectionToolbar')).toBeHidden();
  await page.locator('#sessionSelectionToggle').click();
  await expect(page.locator('#sessionSelectionToolbar')).toBeVisible();
  await page.locator('[data-session-select="bulk-a"]').check();
  await page.locator('[data-session-select="bulk-b"]').check();
  await expect(page.locator('#sessionSelectionCount')).toHaveText('2 selezionate');
  /*
   * ⛔ 18/09/2026 — `#sessionSelectionDelete` NON ESISTE PIÙ, e non è una regressione: è un cambio
   * di prodotto DELIBERATO e datato — `src/legacy/app.js:464-466`: «11/09 (lotto D) —
   * `#sessionSelectionDelete` non è più un bottone affiancato: «Elimina» è una voce del menu
   * overflow della selezione (`apriMenuSelezioneSessioni`), insieme a «Esporta» e «Copia gli
   * identificativi». Owner 10/09: più di due azioni non si affiancano.»
   * Misurato sulla 4199 col negozio isolato dei test (`%TEMP%\corsia5\diagnosi-1.log`): dentro
   * `#sessionSelectionToolbar` restano DUE bottoni, `#sessionSelectionSelectAll` («Seleziona
   * tutto») e `#sessionSelectionMore` (l'overflow, `aria-haspopup="menu"`, aria-label «Azioni su 2
   * sessioni selezionate») — il terzo non c'è.
   *
   * ⛔ E la conferma non è più `window.confirm` (il test lo sostituiva con una finta): è la modale
   * del mockup, un `<dialog class="td-modal">` VERO (`src/components/modale-td.js:63-85`), con la
   * conseguenza scritta in chiaro. Il titolo e l'etichetta del bottone portano il NUMERO
   * (`app.js:18006-18012`: «Eliminare 2 sessioni selezionate?», «Non si annulla da TALOS.»), e
   * misurato sulla 4199 il bottone di conferma si chiama esattamente «Elimina 2 sessioni», non
   * «Elimina»: `getByRole('button', { name: 'Elimina', exact: true })` dà `0`
   * (`%TEMP%\corsia5\diagnosi-4.log`). Playwright: `getByRole(role, { name, exact })` confronta il
   * nome accessibile (github.com/microsoft/playwright, letto 18/09/2026).
   * ⇒ Il giro è quello vero: overflow → «Elimina 2 sessioni» → modale → conferma.
   */
  await page.locator('#sessionSelectionMore').click();
  await page.getByRole('menuitem', { name: 'Elimina 2 sessioni', exact: true }).click();
  const conferma = page.getByRole('dialog');
  await expect(conferma).toBeVisible();
  await conferma.getByRole('button', { name: 'Elimina 2 sessioni', exact: true }).click();
  await expect.poll(() => eliminati.sort()).toEqual(['bulk-a', 'bulk-b']);
  await expect(page.locator('[data-real-session-id="bulk-a"]')).toHaveCount(0);
  await expect(page.locator('[data-real-session-id="bulk-b"]')).toHaveCount(0);
  await expect(page.locator('[data-real-session-id="bulk-c"]')).toBeVisible();
});

test('Doctor mostra la prontezza reale del runtime agente', async ({ page }) => {
  await apriChat(page);
  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-account').click();
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.locator('#sheetBody [data-control-action="doctor"]').click();
  await expect(page.locator('#sheetBody [data-doctor-status]')).not.toHaveText('Healthy');
});

test('Nuova automazione comunica in linguaggio naturale quando non ci sono attività', async ({ page }) => {
  await page.route('**/api/v1/tasks', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await apriChat(page);
  await page.locator('[data-vaia="automazioni"]').evaluate((element) => element.click());
  await page.locator('[data-automation-action="new"]').evaluate((element) => element.click());
  await expect(page.locator('#sheetBody')).toContainText('Non ci sono ancora attività pronte');
  await expect(page.locator('#sheetBody')).not.toContainText('TASK_NOT_AVAILABLE');
});

test('desktop primary controls meet the 36 px hit-area gate', async ({ page }) => {
  await apriChat(page);
  /*
   * ⛔ 18/09/2026 — `.icon-btn` è morto: nel guscio canonico NON esiste più un solo bottone
   * visibile con quella classe. Misurato sulla 4199 (`%TEMP%\corsia5\z5.log`, Z13): il selettore
   * del test (`'.topbar-right .icon-btn, #redirectRunButton:not([hidden])'`) trova 4 nodi, tutti
   * del guscio legacy, tutti 0×0 e `visibile:false` (`offsetParent` nullo) ⇒ il cancello cadeva
   * su `size.width < 36` con `0`, cioè accusava della misura sbagliata il posto sbagliato: non
   * «un controllo troppo piccolo», ma «un contenitore che non esiste più».
   *
   * Il contenitore vivo è UNO: un solo nodo che porta sia `.talos-topbar__actions` sia
   * `.topbar-right` (178×40), e i suoi bottoni canonici visibili sono 5, TUTTI 40×40:
   * «Albero dei rami» · «Comandi (Ctrl K)» · «Context Manager» (`#compactSessionBtn`) ·
   * «Mostra o nascondi i dettagli» · «Riprendi» (`#resumeSessionBtn`). `#redirectRunButton`
   * esiste ancora ma vive nella barra della review, che qui è chiusa (0×0): resta nel selettore
   * col suo `:not([hidden])`, come prima.
   *
   * ⇒ Il filtro «solo i visibili» (`width > 0 && height > 0`) è lo STESSO che usa il cancello
   * delle impostazioni: la classe canonica è riusata anche dagli esemplari nascosti delle altre
   * schermate, e senza filtro si misurerebbero i cloni. La soglia resta 36, non si tocca.
   */
  const sizes = await page.locator('.talos-topbar__actions .talos-button, #redirectRunButton:not([hidden])').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.id, aria: element.getAttribute('aria-label'), width: rect.width, height: rect.height };
  }).filter(({ width, height }) => width > 0 && height > 0));
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, `${size.id || size.aria} width`).toBeGreaterThanOrEqual(36);
    expect(size.height, `${size.id || size.aria} height`).toBeGreaterThanOrEqual(36);
  }
});

test('settings controls meet the same desktop hit-area gate', async ({ page }) => {
  await apriChat(page);
  await page.locator('[data-vaia="impostazioni"]').click();
  /*
   * ⛔ 18/09/2026 — `.settings-card` è morto: misurato sulla 4199 (`%TEMP%\corsia5\z5.log`, Z14),
   * `.settings-card` esiste ancora in 8 nodi ma è il guscio legacy, `visibility` spenta, e i suoi
   * 11 bottoni sono tutti a 0×0 ⇒ il test cadeva su `expect(sizes.length).toBeGreaterThan(0)`
   * misurando ZERO controlli. Non era un cancello rosso: era un cancello che non guardava niente.
   * ⛔ E questa è la forma pericolosa, non quella comoda: un contenitore morto che un giorno
   * tornasse a dare un solo nodo a 36 px farebbe PASSARE il cancello su tutta la superficie.
   *
   * Il contenitore canonico è `.talos-settings` (1 nodo, 1084×1667). Il cancello, riportato lì
   * sopra, è ROSSO e i numeri sono veri: 19 controlli vivi sotto i 36 px — 13 interruttori
   * `button.calm-check[role="switch"]` a 42×25 (12 nella scheda «Aspetto», 1 in «Chat») e 6
   * bottoni `talos-button--sm` a 32 px di altezza nella scheda «Modelli». ⛔ Non si adatta la
   * misura per farla passare (sarebbe «adattare finché è verde»): la collisione è fra il
   * mockup — che disegna l'interruttore 42×25 — e la soglia di 36 di questo cancello, e la
   * decide l'owner. Qui la misura è dichiarata, non piegata.
   *
   * ⛔⛔ L'OWNER HA DECISO IL 18/09/2026: «come il mockup, sotto i 36px». E il numero non è
   *   scelto per far passare il test: **24 è il minimo di WCAG 2.5.8 «Target Size (Minimum)»,
   *   livello AA** — «the size of the target for pointer inputs is at least 24 by 24 CSS pixels».
   *   Fonte: W3C, `understanding/22/target-size-minimum` e la norma citata in ETSI EN 301 549,
   *   letti il 18/09/2026. Il mockup disegna l'interruttore alto **25** e i bottoni **32**: la
   *   soglia di 36 era **più stretta dello standard**, non più larga — e questa è la ragione per
   *   cui abbassarla non è un peggioramento.
   * ⛔ E il cancello NON smette di mordere: un controllo che scendesse sotto 24 lo trova rosso,
   *   col nome di chi è. Ciò che non fa più è pretendere da queste superfici una misura che il
   *   mockup non ha.
   * ⛔ DUE COSE CHE QUESTO CANCELLO CONTINUA A NON GUARDARE, dichiarate perché nessuno le creda
   *   coperte:
   *   1. **l'eccezione di spaziatura** della 2.5.8: un controllo sotto i 24 px PASSA se un
   *      cerchio di 24 px centrato su di lui non tocca nessun altro comando. Qui si misura solo
   *      la dimensione, quindi un bersaglio piccolo e isolato verrebbe bocciato a torto — e uno
   *      piccolo e appiccicato a un altro passerebbe se fosse grande. Serve l'occhio;
   *   2. **il tocco**: 44×44 è la misura sicura per il dito (WCAG 2.5.5, livello AAA). Queste
   *      superfici sono desktop col mouse, ma se un giorno arrivano su un tablet, 24 non basta.
   * ⛔ La soglia dell'ALTRO cancello (la barra della topbar, sopra) **resta 36**: quei bottoni
   *   sono 40×40 e non hanno niente a che vedere col mockup delle impostazioni.
   */
  const SOGLIA_IMPOSTAZIONI = 24;
  const sizes = await page.locator('.talos-settings button, .talos-settings input, .talos-settings select').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.id, tag: element.tagName, width: rect.width, height: rect.height };
  }).filter(({ width, height }) => width > 0 && height > 0));
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) {
    expect(size.width, `${size.tag}#${size.id} width`).toBeGreaterThanOrEqual(SOGLIA_IMPOSTAZIONI);
    expect(size.height, `${size.tag}#${size.id} height`).toBeGreaterThanOrEqual(SOGLIA_IMPOSTAZIONI);
  }
});

test('Model Lab filters have explicit names and hit areas', async ({ page }) => {
  await apriChat(page);
  await page.locator('button[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-models').click();
  /*
   * ⛔ 18/09/2026 — `#modelLabHfTab` non è più una porta: il click andava in timeout a 30 s
   * perché quella scheda del laboratorio legacy non è visibile. Misurato sulla 4199
   * (`%TEMP%\corsia5\z5.log`, Z16): la scheda viva è `#labSchedaModels` (90×38) e il suo
   * pannello `#labPannelloModels` è alto 1028 px.
   *
   * I tre filtri, misurati uno per uno con `count()` sul RUOLO e sul NOME ACCESSIBILE:
   * `searchbox` «Cerca nel catalogo» = 1 · `combobox` «Fornitore» = 1 ·
   * `combobox` «Ordina i modelli» = 1 (e «Contesto minimo in token» = 0: quel controllo non è
   * in questa scheda). Playwright `getByRole(role, { name })` confronta il nome accessibile, non
   * l'id né il testo grezzo (github.com/microsoft/playwright, letto 18/09/2026), ed è la forma
   * che regge anche se il laboratorio cambia gli id un'altra volta.
   * ⛔ `toHaveCount(1)` è il verso contrario dentro il test: un nome accessibile che sparisce, o
   * che si sdoppia, rende rosso qui invece di far passare una misura su un nodo qualsiasi.
   */
  await page.locator('#labSchedaModels').click();
  const cerca = page.getByRole('searchbox', { name: 'Cerca nel catalogo' });
  const fornitore = page.getByRole('combobox', { name: 'Fornitore' });
  const ordina = page.getByRole('combobox', { name: 'Ordina i modelli' });
  await expect(cerca).toHaveCount(1);
  await expect(fornitore).toHaveCount(1);
  await expect(ordina).toHaveCount(1);
  for (const [nome, controllo] of [['Cerca nel catalogo', cerca], ['Fornitore', fornitore], ['Ordina i modelli', ordina]]) {
    const box = await controllo.boundingBox();
    expect(box, `${nome} box`).not.toBeNull();
    expect(box.width, `${nome} width`).toBeGreaterThanOrEqual(36);
    expect(box.height, `${nome} height`).toBeGreaterThanOrEqual(36);
  }
});

test('laboratory opt-in keeps demo labels available for visual scenarios', async ({ page }) => {
  await page.goto('/#ui-lab');
  expect(await page.locator('.demo-surface-badge').count()).toBeGreaterThan(0);
});

test('long response content owns overflow locally without widening the page', async ({ page }) => {
  await apriChat(page);
  await page.evaluate(() => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    const article = document.createElement('article');
    article.className = 'message assistant-message';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Percorso estremamente lungo senza spazi '.repeat(80);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'const extremelyLongIdentifier = "' + 'x'.repeat(240) + '";';
    pre.appendChild(code);
    copy.append(paragraph, pre);
    article.appendChild(copy);
    conversation.appendChild(article);
  });
  const metrics = await page.evaluate(() => {
    const copy = document.querySelector('.assistant-copy');
    const code = copy?.querySelector('pre');
    return {
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      copyOverflow: Boolean(copy && copy.scrollWidth > copy.clientWidth + 1),
      codeOverflow: Boolean(code && code.scrollWidth > code.clientWidth + 1),
      codeWidth: code?.clientWidth ?? 0,
      codeScrollWidth: code?.scrollWidth ?? 0,
    };
  });
  expect(metrics.pageOverflow).toBe(false);
  expect(metrics.copyOverflow).toBe(false);
  expect(metrics.codeWidth).toBeGreaterThan(0);
  expect(metrics.codeScrollWidth).toBeGreaterThan(metrics.codeWidth);
});

/*
 * ⛔⛔ 13/09 sera — QUESTA PROVA FISSAVA IL COMPORTAMENTO VECCHIO, e l'owner l'ha cambiato apposta.
 *   Si chiamava «il ragionamento resta nascosto finché l'utente non attiva Mostra ragionamento». Dopo
 *   una ricerca (Hermes desktop, assistant-ui, AI SDK Elements, NN/g) la decisione è: il ragionamento
 *   non sparisce, si COMPRIME; di serie resta sempre compresso; l'interruttore dice se aprirlo mentre il
 *   modello scrive. Riscritta per dire la regola nuova, non allentata per far passare quella vecchia.
 */
test('RAGIONAMENTO-COMPRESSO — si comprime invece di sparire: riga chiusa di serie, aperta mentre scrive solo se lo chiedi', async ({ page }) => {
  /* ⛔ Il clic sul foglio «Modello» veniva intercettato prima dal velo d'avvio e poi dalla finestra del primo avvio: si salta l'introduzione e si aspetta che il velo sia rimosso. */
  await apriChat(page);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  const pulisci = () => page.evaluate(() => {
    const session = window.__talosHarnessUiRuntime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.ragionamentoBubble.clear();
  });
  const eventi = (lista) => page.evaluate((lista) => {
    const runtime = window.__talosHarnessUiRuntime;
    for (const evento of lista) runtime.handleRealEvent(evento, runtime.realSessionState.generation);
  }, lista);
  const nota = page.locator('.real-reasoning-note');
  const testa = nota.locator(':scope > .talos-activity__head');

  await pulisci();
  await eventi([{ type: 'ReasoningMessageStart', messageId: 'reasoning-toggle', _sequenza: 90001 }]);
  await expect(nota, 'un ragionamento senza testo non ha riga').toBeHidden();
  await eventi([{ type: 'ReasoningMessageContent', messageId: 'reasoning-toggle', delta: 'Dettaglio interno', _sequenza: 90002 }]);
  await expect(nota, 'al primo testo la riga compare, anche con l’interruttore spento').toBeVisible();
  await expect(testa, 'di serie resta compressa').toHaveAttribute('aria-expanded', 'false');
  await expect(testa).toContainText('Sta ragionando…');
  await eventi([{ type: 'ReasoningMessageEnd', messageId: 'reasoning-toggle', _sequenza: 90003 }]);
  await expect(testa).toContainText('Ha ragionato');
  await expect(testa, 'un ragionamento finito non dice più che sta ragionando').not.toContainText('Sta ragionando');

  await page.locator('[data-open-sheet="model"]').click();
  const toggle = page.locator('#showReasoningToggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAttribute('aria-label', 'Apri il ragionamento mentre scrive');
  await toggle.check();
  await expect(nota, 'accendere l’interruttore non fa sparire né riaprire un ragionamento già finito').toBeVisible();
  await expect(testa).toHaveAttribute('aria-expanded', 'false');

  await pulisci();
  await eventi([
    { type: 'ReasoningMessageStart', messageId: 'reasoning-live', _sequenza: 90011 },
    { type: 'ReasoningMessageContent', messageId: 'reasoning-live', delta: 'Leggo i file', _sequenza: 90012 },
  ]);
  await expect(testa, 'con l’interruttore acceso si apre mentre scrive').toHaveAttribute('aria-expanded', 'true');
  await eventi([{ type: 'ReasoningMessageEnd', messageId: 'reasoning-live', _sequenza: 90013 }]);
  await expect(testa, 'e si richiude da sola quando ha finito').toHaveAttribute('aria-expanded', 'false');
});

test('REASONING-INDICATOR-01 — il ragionamento nascosto mantiene un indicatore visibile e annunciato', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.ragionamentoBubble.clear();
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-live', _sequenza: 90011 }, session.generation);
  });
  /* ⛔ 13/09 sera — `.real-waiting-note` non esiste più (zero occorrenze nel monolite): questa prova era rossa anche col pacchetto di prima. L'attesa è `.talos-waiting`, con `role="status"` (`creaAttesa`). */
  const indicator = page.locator('.talos-waiting');
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute('role', 'status');
  await expect(indicator).toContainText('Ragionamento in corso');
  await expect(page.locator('.real-reasoning-note')).toBeHidden();
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'run-reasoning-indicator-1440x900.png'), fullPage: true });
});

test('REDUCED-MOTION-02 — l’indicatore resta leggibile e CALMO con movimento ridotto, mai fermo', async ({ page }) => {
  /*
   * ⛔⛔⛔ 02/9 — contratto CAMBIATO due volte in un colpo, per due ordini
   * espliciti dell'owner: la linea del mobile ORA deve esserci (prima
   * questo test ne pretendeva l'assenza), e sotto movimento ridotto il
   * loader NON deve essere spento (prima pretendeva `animation-name:
   * none`). Su questa macchina `prefers-reduced-motion` è vero a livello
   * di sistema, quindi quel "none" era esattamente ciò che l'owner vedeva
   * come "il logo di caricamento non è animato". Vedi il commento sul
   * loader in styles.css per la ricerca che regge la scelta: un
   * indicatore di stato essenziale si CALMA, non si congela.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-reduced', _sequenza: 90021 }, runtime.realSessionState.generation);
  });
  await expect(page.locator('.talos-waiting')).toContainText('Ragionamento in corso'); // ⛔ 13/09 sera: era `.real-waiting-note`, selettore morto, rossa anche col pacchetto di prima
  /*
   * ⛔ 13/09 sera — RESTA ROSSA, per una seconda ragione che non è del ragionamento, e la si scrive invece di
   *   inseguirla. Riparato il selettore, la prova arriva qui e trova 0 nodi `.talos-line-loader-node`: il
   *   segnavia a linee esiste ancora nel codice, ma l'attesa non lo usa più — `creaAttesa` disegna l'orb
   *   (`talos-assistant-orb`). Queste righe controllano l'animazione di un componente che in questo punto non
   *   c'è: vanno riscritte sull'orb da chi tocca l'attesa, non spente.
   */
  const punti = page.locator('.talos-line-loader-node');
  await expect(punti).toHaveCount(3);
  await expect(page.locator('.talos-line-loader-head, .run-activity-shimmer')).toHaveCount(0);
  await expect(page.locator('.talos-line-loader-sweep')).toHaveCount(1);
  for (const punto of await punti.all()) await expect(punto).toHaveCSS('animation-name', 'talosLineNodeFill');
  await expect(page.locator('.talos-line-loader-sweep')).toHaveCSS('animation-name', 'talosLineSweep');
  // ⛔ La prova che conta: il browser le sta DAVVERO eseguendo, e non a
  // durata zero (il modo in cui `animation:none` si traveste da animazione).
  const stato = await page.locator('.talos-line-loader').first().evaluate((el) => el.getAnimations({ subtree: true }).map((a) => ({ p: a.playState, d: a.effect?.getTiming().duration, i: a.effect?.getTiming().iterations })));
  expect(stato).toHaveLength(4);
  expect(stato.every((a) => a.p === 'running' && a.d > 100 && a.i === Infinity)).toBe(true);
});

test('RUN-PRIMARY-STOP-03/RUN-QUEUE-04 — durante il run il primario ferma, Enter accoda e il testo abilita Reindirizza', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let stopCalls = 0;
  let queued = null;
  await page.route('**/api/v1/sessions/run-active/stop', async (route) => {
    stopCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { stopped: true } }) });
  });
  await page.route('**/api/v1/sessions/run-active/queue', async (route) => {
    queued = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, posizione: 1 } }) });
  });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.id = 'run-active';
    session.taskBubbleMostrata = false;
    session.runCount = 0;
    session.sequenzeViste.clear();
    runtime.handleRealEvent({
      type: 'RunStarted',
      input: { consegna: 'Controlla il flusso di salvataggio e correggi il test instabile.' },
      _sequenza: 90031,
    }, session.generation);
  });
  const primary = page.locator('.send-btn');
  await expect(primary).toHaveAttribute('aria-label', 'Interrompi risposta');
  await expect(page.locator('#redirectRunButton')).toBeHidden();
  await page.locator('#composerInput').fill('prima attendi il confine sicuro');
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'run-stop-redirect-composer-1440x900.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  await page.screenshot({ path: resolve(visualDir, 'run-stop-redirect-composer-1280x800.png'), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.locator('#redirectRunButton')).toBeVisible();
  await page.screenshot({ path: resolve(visualDir, 'run-stop-redirect-composer-1024x800.png'), fullPage: true });
  await page.locator('#composerInput').press('Enter');
  await expect.poll(() => queued).toEqual({ messaggio: 'prima attendi il confine sicuro' });
  await page.locator('.send-btn').click();
  await expect.poll(() => stopCalls).toBe(1);
});

test('RUN-REDIRECT-05 — Reindirizza usa la rotta prioritaria e non la coda', async ({ page }) => {
  let redirected = null;
  let queueCalls = 0;
  await page.route('**/api/v1/sessions/run-redirect/redirect', async (route) => {
    redirected = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, redirectId: 'd1' } }) });
  });
  await page.route('**/api/v1/sessions/run-redirect/queue', async (route) => {
    queueCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, posizione: 1 } }) });
  });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  await page.locator('#composerInput').fill('fermati e usa la nuova API');
  await page.locator('#redirectRunButton').click();
  await expect.poll(() => redirected?.messaggio).toBe('fermati e usa la nuova API');
  expect(redirected.redirectId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(queueCalls).toBe(0);
  await expect(page.locator('#composerInput')).toHaveValue('');
});

test('RUN-REDIRECT-FAILURE-06 — un rifiuto del server conserva il testo e riabilita Reindirizza', async ({ page }) => {
  await page.route('**/api/v1/sessions/run-redirect-failure/redirect', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'SESSION_NOT_READY' } }),
    });
  });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect-failure';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  const redirect = page.locator('#redirectRunButton');
  await input.fill('non perdere questa correzione');
  await redirect.click();
  await expect(input).toHaveValue('non perdere questa correzione');
  await expect(redirect).toBeEnabled();
  await expect(redirect).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.toast')).toContainText('Reindirizzamento non riuscito');
});

test('RUN-REDIRECT-STOP-RACE-16 — una cancellazione autoritativa prevale sul 200 tardivo e conserva il testo', async ({ page }) => {
  let richiestaVista = false;
  let sbloccaRisposta;
  const rispostaSospesa = new Promise((resolve) => { sbloccaRisposta = resolve; });
  await page.route('**/api/v1/sessions/run-redirect-race/redirect', async (route) => {
    richiestaVista = true;
    await rispostaSospesa;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { ok: true, redirectId: 'd-race' } }),
    });
  });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect-race';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  await input.fill('conserva questa correzione');
  await page.locator('#redirectRunButton').click();
  await expect.poll(() => richiestaVista).toBe(true);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunRedirectRequested', redirectId: 'd-race', testo: 'conserva questa correzione', _sequenza: 91601 }, generation);
    runtime.handleRealEvent({ type: 'RunRedirectCancelled', redirectId: 'd-race', reason: 'stop-richiesto', _sequenza: 91602 }, generation);
  });
  sbloccaRisposta();
  await expect(page.locator('#redirectRunButton')).not.toHaveAttribute('aria-busy', 'true');
  await expect(input).toHaveValue('conserva questa correzione');
  expect((await page.locator('.toast').allTextContents()).join(' ')).not.toContain('Reindirizzamento richiesto');
});

test('RUN-STOP-BEFORE-REDIRECT-20 — Stop invalida anche una richiesta redirect che il server non ha ancora registrato', async ({ page }) => {
  let redirectBody = null;
  let stopBody = null;
  let sbloccaRedirect;
  const redirectSospeso = new Promise((resolve) => { sbloccaRedirect = resolve; });
  await page.route('**/api/v1/sessions/run-stop-before-redirect/redirect', async (route) => {
    redirectBody = route.request().postDataJSON();
    await redirectSospeso;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true, redirectId: redirectBody.redirectId } }) });
  });
  await page.route('**/api/v1/sessions/run-stop-before-redirect/stop', async (route) => {
    stopBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { stopped: true } }) });
  });
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-stop-before-redirect';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  await input.fill('questa correzione non va più applicata');
  await page.locator('#redirectRunButton').click();
  await expect.poll(() => redirectBody).not.toBeNull();
  await page.locator('.send-btn').click();
  await expect.poll(() => stopBody).not.toBeNull();
  expect(stopBody.redirectId).toBe(redirectBody.redirectId);
  sbloccaRedirect();
  await expect(page.locator('#redirectRunButton')).not.toHaveAttribute('aria-busy', 'true');
  await expect(input).toHaveValue('questa correzione non va più applicata');
  expect((await page.locator('.toast').allTextContents()).join(' ')).not.toContain('Reindirizzamento richiesto');
});

test('RUN-REDIRECT-PENDING-17 — un redirect pendente non offre una seconda azione destinata al 409', async ({ page }) => {
  await apriChat(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-redirect-pending';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
  });
  const input = page.locator('#composerInput');
  const redirect = page.locator('#redirectRunButton');
  await input.fill('una sola correzione');
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'RunRedirectRequested', redirectId: 'd-pending', testo: 'una sola correzione', _sequenza: 91701 }, runtime.realSessionState.generation);
  });
  await expect(redirect).toBeVisible();
  await expect(redirect).toBeDisabled();
});

test('RUN-REDIRECT-NO-FLICKER-13 — il terminale del giro interrotto non trasforma Stop in Invia prima della ripartenza', async ({ page }) => {
  await page.goto('/');
  const state = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.realSessionState.id = 'run-no-flicker';
    runtime.realSessionState.eventoTerminaleVisto = false;
    runtime.syncRunComposerState();
    const generation = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunRedirectRequested', redirectId: 'd-no-flicker', testo: 'correggi', _sequenza: 90601 }, generation);
    runtime.handleRealEvent({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: 'fermato', _sequenza: 90602 }, generation);
    return {
      terminale: runtime.realSessionState.eventoTerminaleVisto,
      primary: document.querySelector('.send-btn')?.getAttribute('aria-label'),
      activity: document.querySelector('.run-activity-label')?.textContent,
    };
  });
  expect(state).toEqual({ terminale: false, primary: 'Interrompi risposta', activity: 'Reindirizzamento al prossimo punto sicuro…' });
});

test('TOOL-BATCH-HIDDEN-REASONING-01 — il ragionamento nascosto non spezza il gruppo dei comandi', async ({ page }) => {
  await page.goto('/');
  const batches = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    session.ragionamentoBubble.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-before', toolCallName: 'leggi', _sequenza: 90101 }, generation);
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-between', _sequenza: 90102 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-after', toolCallName: 'cerca', _sequenza: 90103 }, generation);
    return {
      /*
       * ⛔⛔ 13/09 sera — QUESTA GUARDIA NON GUARDAVA NIENTE. `.tool-batch` e `.real-tool-note` non esistono
       *   più nel monolite (zero occorrenze): era rossa col pacchetto di prima E con quello nuovo, con
       *   0 gruppi e 0 righe, cioè per un selettore morto e non per il difetto che nomina. Il gruppo oggi è
       *   la card `[data-c="ActivityBundle"]` (la nota del ragionamento è un bundle anche lei, e si esclude)
       *   e la riga è `.talos-tool-row`. Morde perché la prova sotto, VISIBILE-02, pretende 2 gruppi sugli
       *   stessi selettori: un selettore che non conta niente non passerebbe entrambe.
       */
      batches: document.querySelectorAll('#conversation [data-c="ActivityBundle"]:not(.real-reasoning-note)').length,
      rows: document.querySelectorAll('#conversation [data-c="ActivityBundle"]:not(.real-reasoning-note) .talos-tool-row').length,
      reasoningHidden: document.querySelector('.real-reasoning-note')?.hidden ?? false,
    };
  });
  expect(batches).toEqual({ batches: 1, rows: 2, reasoningHidden: true });
});

test('TOOL-BATCH-REASONING-VISIBILE-02 — un ragionamento CON testo fra due comandi è un confine: due gruppi, in ordine', async ({ page }) => {
  /*
   * ⛔ Il verso contrario della prova qui sopra, nata col ragionamento compresso (13/09 sera): senza testo
   *   il ragionamento non ha riga e non spezza il gruppo; con testo la riga c'è, e il comando che viene
   *   dopo deve stare SOTTO di lei, non risalire nel gruppo di prima.
   */
  await page.goto('/');
  const esito = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    session.ragionamentoBubble.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-before-v', toolCallName: 'leggi', _sequenza: 90151 }, generation);
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'reasoning-visible', _sequenza: 90152 }, generation);
    runtime.handleRealEvent({ type: 'ReasoningMessageContent', messageId: 'reasoning-visible', delta: 'Prima guardo il README.', _sequenza: 90153 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'tool-after-v', toolCallName: 'cerca', _sequenza: 90154 }, generation);
    const gruppi = [...document.querySelectorAll('#conversation [data-c="ActivityBundle"]:not(.real-reasoning-note)')];
    const nota = document.querySelector('.real-reasoning-note');
    const segue = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    return {
      batches: gruppi.length,
      reasoningHidden: nota?.hidden ?? true,
      ordine: segue(gruppi[0], nota) && segue(nota, gruppi[1]),
    };
  });
  expect(esito).toEqual({ batches: 2, reasoningHidden: false, ordine: true });
});

test('TOOL-LIFECYCLE-SAME-ROW-01 — start, argomenti ed esito aggiornano la stessa riga', async ({ page }) => {
  await apriChat(page);
  const result = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'read-one', toolCallName: 'leggi', _sequenza: 90201 }, generation);
    const before = document.querySelector('.real-tool-note');
    const start = {
      state: before?.dataset.toolState ?? null,
      busy: before?.getAttribute('aria-busy'),
      text: before?.querySelector('.tool-note-summary-text')?.textContent ?? '',
    };
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'read-one', delta: '{"percorso":"src/app.js"}', _sequenza: 90202 }, generation);
    const during = before?.querySelector('.tool-note-summary-text')?.textContent ?? '';
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'read-one', content: 'contenuto letto', _sequenza: 90203 }, generation);
    const after = document.querySelector('.real-tool-note');
    return {
      sameNode: before === after,
      start,
      during,
      end: {
        state: after?.dataset.toolState ?? null,
        busy: after?.getAttribute('aria-busy'),
        text: after?.querySelector('.tool-note-summary-text')?.textContent ?? '',
      },
    };
  });
  expect(result).toEqual({
    sameNode: true,
    start: { state: 'running', busy: 'true', text: 'Lettura file…' },
    during: 'Lettura di src/app.js…',
    end: { state: 'complete', busy: 'false', text: '1 file letto' },
  });
});

test('TOOL-DESCRIPTION-LIFECYCLE-04 — la descrizione del modello resta nella stessa riga dopo la conclusione', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apriChat(page);
  const result = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'described-shell', toolCallName: 'shell', _sequenza: 90211 }, generation);
    const row = document.querySelector('.real-tool-note');
    runtime.handleRealEvent({
      type: 'ToolCallArgs',
      toolCallId: 'described-shell',
      delta: JSON.stringify({ comando: 'node --test tests/config.test.mjs', descrizione: 'Verifica la configurazione del server' }),
      _sequenza: 90212,
    }, generation);
    const during = row?.querySelector('.tool-note-summary-text')?.textContent ?? '';
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'described-shell', content: 'exit 0\npass 7\nfail 0', _sequenza: 90213 }, generation);
    const after = document.querySelector('.real-tool-note');
    document.querySelector('.tool-batch-summary')?.click();
    after?.querySelector('.tool-note-summary')?.click();
    return {
      sameNode: row === after,
      during,
      final: after?.querySelector('.tool-note-summary-text')?.textContent ?? '',
      detail: after?.querySelector('.tool-note-detail')?.textContent ?? '',
      batch: document.querySelector('.tool-batch-summary .tool-note-summary-text')?.textContent ?? '',
    };
  });
  expect(result.sameNode).toBe(true);
  expect(result.during).toBe('Verifica la configurazione del server…');
  expect(result.final).toBe('Verifica la configurazione del server');
  expect(result.detail).toContain('comando: node --test tests/config.test.mjs');
  expect(result.detail).not.toContain('descrizione:');
  expect(result.batch).toBe('1 comando eseguito');
  await page.screenshot({ path: 'artifacts/tool-description-1440x900.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.screenshot({ path: 'artifacts/tool-description-1024x800.png', fullPage: true });
});

test('TOOL-BATCH-AGGREGATION-01 — cinque letture diventano un solo totale grammaticalmente corretto', async ({ page }) => {
  await apriChat(page);
  const summaries = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    const reset = () => {
      document.querySelector('#conversation')?.replaceChildren();
      session.sequenzeViste.clear();
      session.batchAttivo = null;
      session.ultimoBatchChiuso = null;
      session.toolCallNomi.clear();
    };
    const runReads = (count, sequenceBase) => {
      for (let index = 0; index < count; index += 1) {
        const id = `read-${sequenceBase}-${index}`;
        runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'leggi', _sequenza: sequenceBase + index * 3 }, session.generation);
        runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso: `src/${index}.js` }), _sequenza: sequenceBase + index * 3 + 1 }, session.generation);
        runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: 'ok', _sequenza: sequenceBase + index * 3 + 2 }, session.generation);
      }
      return {
        batches: document.querySelectorAll('.tool-batch').length,
        rows: document.querySelectorAll('.tool-batch .real-tool-note').length,
        summary: document.querySelector('.tool-batch-summary .tool-note-summary-text')?.textContent ?? '',
      };
    };
    reset();
    const singular = runReads(1, 90300);
    reset();
    const plural = runReads(5, 90400);
    return { singular, plural };
  });
  expect(summaries.singular).toEqual({ batches: 1, rows: 1, summary: '1 file letto' });
  expect(summaries.plural).toEqual({ batches: 1, rows: 5, summary: '5 file letti' });
});

test('TOOL-LIFECYCLE-ERROR-01 — l’errore conclude la riga e aggiorna il batch correlato', async ({ page }) => {
  await apriChat(page);
  const result = await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    document.querySelector('#conversation')?.replaceChildren();
    session.sequenzeViste.clear();
    session.batchAttivo = null;
    session.ultimoBatchChiuso = null;
    session.toolCallNomi.clear();
    const generation = session.generation;
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'old-shell', toolCallName: 'shell', _sequenza: 90501 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'old-shell', delta: '{"comando":"exit 1"}', _sequenza: 90502 }, generation);
    const oldRow = document.querySelector('.real-tool-note');
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'visible-boundary', delta: 'Continuo.', _sequenza: 90503 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'new-read', toolCallName: 'leggi', _sequenza: 90504 }, generation);
    runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'old-shell', content: 'exit 1\nfailed', _sequenza: 90505 }, generation);
    const batches = [...document.querySelectorAll('.tool-batch-summary .tool-note-summary-text')].map((node) => node.textContent);
    return {
      rowState: oldRow?.dataset.toolState ?? null,
      rowBusy: oldRow?.getAttribute('aria-busy'),
      rowText: oldRow?.querySelector('.tool-note-summary-text')?.textContent ?? '',
      batches,
    };
  });
  expect(result).toEqual({
    rowState: 'error',
    rowBusy: 'false',
    rowText: '1 comando fallito',
    batches: ['1 comando eseguito (1 errore)', 'Lettura di 1 file…'],
  });
});

async function triggerWaitingLoader(page) {
  await page.route('**/api/v1/sessions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { items: [] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { sessionId: 'waiting-loader-session' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
    });
  });
  await apriChat(page); // ⛔ 18/09/2026 — il loader vive NELLA chat: senza il gesto d'ingresso resta nascosto (vedi apriChat)
  await page.evaluate(() => {
    void window.__talosHarnessUiRuntime.startRealSession({
      id: 'waiting-loader-task',
      nome: 'Verifica loader',
      consegna: 'Verifica il movimento del loader.',
    });
  });
  const loader = page.locator('.real-waiting-note .talos-line-loader');
  await expect(loader).toBeVisible();
  return loader;
}

test('WAITING-LOADER-MOTION-01 — il loader reale è quello del mobile e avanza fra due fotogrammi', async ({ page }) => {
  /*
   * ⛔⛔⛔ 02/9 — contratto CAMBIATO per ordine diretto dell'owner: "usa
   * direttamente la stessa identica immagine animata del mobile... ci deve
   * essere una linea che attraversa i dot". La versione precedente di
   * questo test PRETENDEVA l'assenza dello sweep
   * (`.talos-line-loader-sweep` count 0) e una durata legata al token
   * `--motion-response-activity`: era la divergenza desktop congelata in
   * un test. Ora si prova la cosa vera — la linea ESISTE, e sweep + tre
   * nodi girano tutti all'infinito (4 animazioni, non 3).
   */
  const loader = await triggerWaitingLoader(page);
  await expect(page.locator('.run-activity-shimmer, .talos-line-loader-head')).toHaveCount(0);
  await expect(loader.locator('.talos-line-loader-track')).toHaveCount(1);
  await expect(loader.locator('.talos-line-loader-sweep')).toHaveCount(1);
  await expect(loader.locator('.talos-line-loader-node')).toHaveCount(3);
  const { animationState, geometria } = await loader.evaluate((element) => ({
    geometria: {
      viewBox: element.getAttribute('viewBox'),
      nodi: [...element.querySelectorAll('.talos-line-loader-node')].map((n) => n.getAttribute('cx')),
    },
    animationState: element.getAnimations({ subtree: true }).map((animation) => ({
      playState: animation.playState,
      duration: animation.effect?.getTiming().duration,
      iterations: animation.effect?.getTiming().iterations,
    })),
  }));
  expect(geometria.viewBox).toBe('0 0 96 16');
  expect(geometria.nodi).toEqual(['16', '48', '80']);
  expect(animationState).toHaveLength(4); // lo sweep + i tre nodi (la traccia è ferma per disegno)
  expect(animationState.every((animation) => animation.playState === 'running')).toBe(true);
  expect(animationState.every((animation) => animation.duration > 0)).toBe(true);
  expect(animationState.every((animation) => animation.iterations === Infinity)).toBe(true);
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'response-activity-dots-1440x900.png'), fullPage: true });
  const first = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  await page.waitForTimeout(480);
  const second = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  expect(first.width).toBe(second.width);
  expect(first.height).toBe(second.height);
  const changed = pixelmatch(first.data, second.data, null, first.width, first.height, { threshold: 0.05 });
  expect(changed).toBeGreaterThan(0);
});

test('WAITING-LOADER-REDUCED-MOTION-01 — ridurre il movimento CALMA il loader, non lo congela', async ({ page }) => {
  /*
   * ⛔ 02/9 — contratto CAMBIATO deliberatamente: la versione precedente di
   * questo test pretendeva `changed === 0` (congelamento totale) sotto
   * `prefers-reduced-motion: reduce`. Owner, dal vivo: "il logo di
   * caricamento non è animato" — su una macchina reale con quella
   * preferenza attiva a livello di sistema (misurato via CDP, non
   * presunto) il congelamento si vedeva come un loader rotto durante
   * un'attesa reale. Vedi il commento su `talosLineNodeBreath` in
   * styles.css: un "sto ancora lavorando" resta vivo (più calmo — sola
   * opacità, nessuno scale — non il pulse pieno) anche a movimento
   * ridotto, non zittito del tutto. Qui si prova solo "vivo", non
   * "quanto": il "più calmo del pulse pieno" è già provato a livello di
   * sorgente CSS in tests/response-activity-indicator.test.mjs
   * (RESPONSE-ACTIVITY-REDUCED-03, keyframe `talosLineNodeBreath` invece
   * di `talosLineNodePulse`) — misurato qui il 02/9: 93 pixel cambiati
   * su 480ms con la nuova keyframe, 0 con quella vecchia.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const loader = await triggerWaitingLoader(page);
  const first = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  await page.waitForTimeout(480);
  const second = PNG.sync.read(await loader.screenshot({ animations: 'allow' }));
  const changed = pixelmatch(first.data, second.data, null, first.width, first.height, { threshold: 0.05 });
  const nodeStyles = await loader.locator('.talos-line-loader-node').evaluateAll((nodes) => nodes.map((node) => ({
    stroke: getComputedStyle(node).stroke,
    strokeWidth: getComputedStyle(node).strokeWidth,
    opacity: getComputedStyle(node).opacity,
  })));
  expect(changed).toBeGreaterThan(0);
  expect(nodeStyles).toHaveLength(3);
  /*
   * ⛔ 02/9 — si guarda lo STROKE, non il fill: nel disegno del mobile i
   * nodi sono cerchi VUOTI (`fill: transparent`) che si riempiono solo
   * quando lo sweep li raggiunge — il fill trasparente è il loro stato
   * normale, non un nodo invisibile. Quello che deve essere sempre
   * visibile è il contorno.
   */
  expect(nodeStyles.every((node) => node.stroke !== 'none' && node.stroke !== 'rgba(0, 0, 0, 0)' && node.opacity !== '0')).toBe(true);
  const visualDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');
  await mkdir(visualDir, { recursive: true });
  await page.screenshot({ path: resolve(visualDir, 'response-activity-reduced-1440x900.png'), fullPage: true });
});

test('lo streaming porta l’ultimo output verso il centro della conversazione', async ({ page }) => {
  await apriChat(page);
  const metrics = await page.evaluate(async () => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    for (let i = 0; i < 18; i += 1) {
      const previous = document.createElement('article');
      previous.className = 'message assistant-message';
      previous.style.height = '90px';
      previous.textContent = `Output precedente ${i}`;
      conversation.appendChild(previous);
    }
    conversation.scrollTop = 0;
    const runtime = window.__talosHarnessUiRuntime;
    const session = runtime.realSessionState;
    session.sequenzeViste.clear();
    session.testoGrezzoMessaggi.clear();
    runtime.handleRealEvent({ type: 'TextMessageContent', messageId: 'stream-center', delta: 'Ultimo output in streaming', _sequenza: 90201 }, session.generation);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const output = conversation.querySelector('.assistant-message:last-child');
    const containerRect = conversation.getBoundingClientRect();
    const outputRect = output.getBoundingClientRect();
    return {
      targetCenter: outputRect.top + outputRect.height / 2 - containerRect.top,
      viewport: conversation.clientHeight,
      scrollTop: conversation.scrollTop,
    };
  });
  expect(metrics.scrollTop).toBeGreaterThan(0);
  expect(metrics.targetCenter).toBeGreaterThan(metrics.viewport * 0.4);
  expect(metrics.targetCenter).toBeLessThan(metrics.viewport * 0.6);
});

test('SESSION-SETTINGS-RELOAD-01 — permessi e override della sessione restano veri dopo il reload', async ({ page }) => {
  const sessione = {
    sessionId: 'session-settings-reload', taskId: 'libero:default', nome: 'Sessione persistente',
    avviataAlle: '2026-09-01T09:00:00.000Z', conclusa: true,
    modello: 'google/gemini-3.7-flash', reasoning: { effort: 'high' },
    permessi: 'Read only', permessiPerAttrezzo: { shell: 'nega' }, provider: 'cloud',
  };
  const aggiornamenti = [];
  await page.route('**/api/v1/sessions', async (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: [sessione] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.route('**/api/v1/sessions/session-settings-reload/events', async (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream', body: '',
  }));
  await page.route('**/api/v1/sessions/session-settings-reload/settings', async (route) => {
    const patch = route.request().postDataJSON();
    aggiornamenti.push(patch);
    Object.assign(sessione, patch);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { updated: true } }) });
  });
  await apriChat(page);
  await page.locator('[data-real-session-id="session-settings-reload"]').click();
  await expect(page.locator('[data-open-sheet="model"] .talos-chip__label')).toHaveText('gemini-3.7-flash');
  await page.locator('[data-open-sheet="permissions"]').first().click();
  /*
   * ⛔ 18/09/2026 — il foglio dei permessi del mockup NON usa la classe `active` del prototipo
   * (`src/legacy/app.js:7968` costruiva `sheet-option active`): le scelte sono `button.talos-choice`
   * (`index.template.html:1383-1386`), e lo stato attivo lo scrive il prodotto in due posti —
   * `is-attiva` e `aria-checked` — da `src/legacy/app.js:8520-8523` (D-10F, 11/09: «la scelta attiva
   * si vede»). Misurato con `sonda-permessi.mjs` (18/09, porta 4197) sul velo aperto, sessione con
   * `permessi: 'Read only'`: `[data-permission-choice]` = **4 nodi, uno per valore**,
   * `Read only` → classe `«talos-choice is-attiva»` e `aria-checked="true"`, gli altri tre
   * `«talos-choice»` e `aria-checked="false"`; `role="radio"` = 4.
   */
  await expect(page.locator('[data-permission-choice="Read only"]')).toHaveClass(/is-attiva/);
  await expect(page.locator('[data-permission-choice="Read only"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-tool-permission-select="shell"]')).toHaveValue('nega');
  await page.locator('[data-permission-choice="On request"]').click();
  await expect.poll(() => aggiornamenti.some((patch) => patch.permessi === 'On request')).toBe(true);
  await page.reload();
  await page.locator('[data-real-session-id="session-settings-reload"]').click();
  await page.locator('[data-open-sheet="permissions"]').first().click();
  await expect(page.locator('[data-permission-choice="On request"]')).toHaveClass(/is-attiva/);
  await expect(page.locator('[data-permission-choice="On request"]')).toHaveAttribute('aria-checked', 'true');
  /* Il verso opposto: chi era attivo PRIMA non lo è più — altrimenti la prova passerebbe anche
     con un `is-attiva` appiccicato a tutte e quattro. */
  await expect(page.locator('[data-permission-choice="Read only"]')).not.toHaveClass(/is-attiva/);
  await expect(page.locator('[data-tool-permission-select="shell"]')).toHaveValue('nega');
});

test('VIEW-TRANSITION-RACE-01 — una navigazione rapida non lascia la colonna centrale vuota', async ({ page }) => {
  await apriChat(page);

  for (let tentativo = 0; tentativo < 2; tentativo += 1) {
    await page.locator('[data-vaia="impostazioni"]').dispatchEvent('click');
    await page.locator('#schermoChat .mode-tab[data-vaia="chat"]').dispatchEvent('click');
    await page.waitForTimeout(400);

    const activeViews = page.locator('.view-pane.active');
    await expect(activeViews).toHaveCount(1);
    await expect(activeViews).toHaveAttribute('data-view', 'chat');
    /*
     * ⛔ 18/09/2026 — qui c'era `#conversation`, e il rosso era vero ma non un difetto di prodotto:
     * `#conversation` è la LISTA dei messaggi, e con la conversazione vuota misura **709×0** —
     * Playwright considera «hidden» un elemento con riquadro vuoto, quindi l'asserzione chiedeva
     * «c'è almeno un messaggio» mentre il test intende «la colonna centrale non è rimasta vuota».
     * Misurato con `sonda-baseline6.mjs` (18/09, porta 4197): la colonna `.talos-conversation` è
     * 824×700 e dentro c'è `#invitoPrimoAvvio` 736×324 («Da dove cominciamo?»).
     * ⇒ La colonna è la misura giusta per questo intento; la lista dei messaggi no.
     */
    await expect(page.locator('#schermoChat .talos-conversation')).toBeVisible();
    await expect(page.locator('#composerForm')).toBeVisible();
  }
});

test('SETTINGS-VIEW-ISOLATION-01 — impostazioni non lasciano trasparire chat e composer', async ({ page }) => {
  await apriChat(page);
  await page.locator('[data-vaia="impostazioni"]').dispatchEvent('click');
  await page.waitForTimeout(400);

  const activeViews = page.locator('.view-pane.active');
  await expect(activeViews).toHaveCount(1);
  await expect(activeViews).toHaveAttribute('data-view', 'settings');
  /*
   * ⛔ 18/09/2026 — `.settings-layout` esiste ancora ma vive DENTRO `#talos-legacy`, la scocca del
   * prototipo spenta: misura **0×0** anche a 1,5 s dall'apertura, e il selettore composto
   * `.view-pane[data-view="settings"] .settings-layout` non trova niente (la catena di quel nodo è
   * `#talos-legacy`, non una `.view-pane`). Misurato con `sonda-baseline4.mjs` (18/09, porta 4197):
   * la superficie canonica è `#schermoImpostazioni .talos-settings` (l'ha portata il cutover del
   * guscio) alta 1701 px, con le schede `#setting-tab-*`.
   */
  await expect(page.locator('#schermoImpostazioni .talos-settings')).toBeVisible();
  await expect(page.locator('#conversation')).not.toBeVisible();
  await expect(page.locator('#composerForm')).not.toBeVisible();
});

test('CHAT-FULL-WIDTH-01 — allarga solo messaggi e bolle, mai il composer', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriChat(page);

  const preparaMessaggi = async () => {
    await page.locator('#conversation').evaluate((conversation) => {
      conversation.replaceChildren();
      const user = document.createElement('article');
      user.className = 'message user-message';
      user.innerHTML = '<div class="message-bubble">Analizza l’intero workspace, confronta ogni dipendenza, verifica i contratti pubblici e prepara una risposta completa. Includi i rischi di regressione, le prove sintetiche, le verifiche reali e le fonti primarie consultate. Concludi con una consegna esplicita che renda misurabile la larghezza massima della bolla utente senza cambiare il composer.</div>';
      const assistant = document.createElement('article');
      assistant.className = 'message assistant-message';
      assistant.innerHTML = '<div class="assistant-copy"><p>Ho analizzato il workspace e raccolto evidenze sufficienti per misurare la risposta su tutta la larghezza disponibile della conversazione, senza modificare il composer.</p></div>';
      conversation.append(user, assistant);
    });
  };
  const misura = () => page.evaluate(() => {
    const conversation = document.querySelector('#conversation');
    const padding = getComputedStyle(conversation);
    const composer = document.querySelector('#composerForm');
    const composerStyle = getComputedStyle(composer);
    return {
      composer: composer.getBoundingClientRect().width,
      composerGeometry: {
        height: composer.getBoundingClientRect().height,
        minHeight: composerStyle.minHeight,
        borderRadius: composerStyle.borderRadius,
        padding: composerStyle.padding,
      },
      disponibile: conversation.clientWidth - Number.parseFloat(padding.paddingLeft) - Number.parseFloat(padding.paddingRight),
      utente: document.querySelector('.message-bubble').getBoundingClientRect().width,
      assistente: document.querySelector('.assistant-message').getBoundingClientRect().width,
    };
  });

  await preparaMessaggi();
  const prima = await misura();
  expect(prima.utente).toBeLessThanOrEqual(681);
  expect(prima.assistente).toBeLessThanOrEqual(761);

  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-chat').click();
  const toggle = toggleFullWidth(page);
  await expect(toggle).not.toBeChecked();
  await accendiFullWidth(page);
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  const estesa = await misura();
  expect.soft(Math.abs(estesa.composer - prima.composer), 'il composer non deve cambiare larghezza').toBeLessThanOrEqual(1);
  expect.soft(estesa.composerGeometry, 'il composer non deve cambiare forma').toEqual(prima.composerGeometry);
  expect.soft(estesa.utente, 'la bolla utente deve occupare la larghezza disponibile').toBeGreaterThan(prima.utente + 200);
  expect.soft(estesa.assistente, 'la risposta deve occupare la larghezza disponibile').toBeGreaterThan(prima.assistente + 200);
  expect.soft(Math.abs(estesa.utente - estesa.disponibile)).toBeLessThanOrEqual(1);
  expect.soft(Math.abs(estesa.assistente - estesa.disponibile)).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/chat-full-width/);
  await preparaMessaggi();
  const ricaricata = await misura();
  expect(Math.abs(ricaricata.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(ricaricata.composerGeometry).toEqual(prima.composerGeometry);
  expect(Math.abs(ricaricata.utente - ricaricata.disponibile)).toBeLessThanOrEqual(1);
  expect(Math.abs(ricaricata.assistente - ricaricata.disponibile)).toBeLessThanOrEqual(1);

  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-chat').click();
  await spegniFullWidth(page);
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  const ripristinata = await misura();
  expect(Math.abs(ripristinata.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(ripristinata.composerGeometry).toEqual(prima.composerGeometry);
  expect(ripristinata.utente).toBeLessThanOrEqual(681);
  expect(ripristinata.assistente).toBeLessThanOrEqual(761);
});

test('COMPOSER-SHAPE-FULL-WIDTH-01 — il toggle full width preserva ogni forma del composer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apriChat(page);
  const misuraComposer = () => page.locator('#composerForm').evaluate((composer) => {
    const style = getComputedStyle(composer);
    const rect = composer.getBoundingClientRect();
    return { width: rect.width, height: rect.height, minHeight: style.minHeight, borderRadius: style.borderRadius, padding: style.padding };
  });

  for (const forma of ['standard', 'classic', 'compact']) {
    await page.locator('[data-vaia="impostazioni"]').click();
    await page.locator('#setting-tab-chat').click();
    /*
     * ⛔ 18/09/2026 — `selectOption('#composerShapeSelect')` non poteva riuscire: il `select`
     * nativo è nascosto (`data-calm-source`, `display:none`, 0×0) e il vivo è la faccia
     * `#composerShapeSelect--calm`. Due difetti in una riga: la scheda era «appearance» mentre
     * la forma del composer vive in «chat» (contratto `impostazioni-campi.js:262`, `sezione:
     * "chat"`), e il nodo da guidare è la faccia, non il nativo.
     * L'etichetta è quella vera dell'opzione («Standard»/«Classica»/«Compatta»,
     * `impostazioni-campi.js:264-272`), presa dal contratto e non inventata.
     */
    expect(await scegliCalm(page, 'composerShapeSelect', forma), `forma ${forma}`).toBe(1);
    /* ⛔ 18/09/2026 — il ritorno alla chat non passa più dalla striscia delle schede: dalle
     * impostazioni è `visibile:false` e il clic su un nodo nascosto va in timeout a 30 s. La porta
     * viva è la voce di navigazione (misurato: 1 nodo visibile anche dalle impostazioni, e il clic
     * riporta la vista «chat» col composer visibile). */
    await page.locator('.talos-nav-item[data-vaia="chat"]').click();
    const prima = await misuraComposer();

    await page.locator('[data-vaia="impostazioni"]').click();
    await page.locator('#setting-tab-chat').click();
    const fullWidth = toggleFullWidth(page);
    if (await fullWidth.isChecked()) await spegniFullWidth(page);
    await accendiFullWidth(page);
    await page.locator('#schermoChat .mode-tab[data-vaia="chat"]').click();
    const dopo = await misuraComposer();
    expect(dopo, `forma ${forma}`).toEqual(prima);

    await page.reload();
    expect(await misuraComposer(), `forma ${forma} dopo reload`).toEqual(prima);
    await page.locator('[data-vaia="impostazioni"]').click();
    await page.locator('#setting-tab-chat').click();
    await spegniFullWidth(page);
    await page.locator('#schermoChat .mode-tab[data-vaia="chat"]').click();
  }
});

test('COMPOSER-MOCKUP-HEIGHT-01 — ogni forma desktop conserva l’altezza canonica del mockup', async ({ page, context }) => {
  const mockup = await context.newPage();
  await mockup.setViewportSize({ width: 1440, height: 900 });
  await mockup.goto(pathToFileURL(resolve(process.cwd(), '..', 'mockup-originale', 'index.html')).href);
  const altezzaMockup = await mockup.locator('.composer').evaluate((composer) => composer.getBoundingClientRect().height);
  expect(altezzaMockup).toBe(116);
  await mockup.close();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 800 }]) {
    await page.setViewportSize(viewport);
    await apriChat(page);
    for (const forma of ['standard', 'classic', 'compact']) {
      await page.locator('[data-vaia="impostazioni"]').click();
      /* ⛔ 18/09/2026 — stessa cura di COMPOSER-SHAPE-FULL-WIDTH-01, per la stessa misura
       * (misurato sulla 4199, `%TEMP%\corsia5\z6.log`): il `select` nativo è nascosto e la
       * forma vive nella scheda «chat» (`impostazioni-campi.js:262`), quindi si guida la
       * faccia `#composerShapeSelect--calm` con l'etichetta vera dell'opzione. */
      await page.locator('#setting-tab-chat').click();
      expect(await scegliCalm(page, 'composerShapeSelect', forma), `forma ${forma}`).toBe(1);
      await page.locator('.talos-nav-item[data-vaia="chat"]').click();

      const misura = await page.locator('#composerForm').evaluate((composer) => {
        const input = composer.querySelector('textarea');
        const toolbar = composer.querySelector('.talos-composer__bar');
        const rect = composer.getBoundingClientRect();
        return {
          height: rect.height,
          inputBottom: input.getBoundingClientRect().bottom,
          toolbarTop: toolbar.getBoundingClientRect().top,
        };
      });
      expect(Math.abs(misura.height - altezzaMockup), `${viewport.width}px · ${forma}`).toBeLessThanOrEqual(1);
      expect(misura.inputBottom, `${viewport.width}px · ${forma} · input`).toBeLessThanOrEqual(misura.toolbarTop + 1);

      await page.locator('#composerInput').fill('Prima riga\nSeconda riga');
      const multilinea = await page.locator('#composerForm').evaluate((composer) => ({
        height: composer.getBoundingClientRect().height,
        inputBottom: composer.querySelector('textarea').getBoundingClientRect().bottom,
        toolbarTop: composer.querySelector('.talos-composer__bar').getBoundingClientRect().top,
      }));
      expect(multilinea.height).toBeGreaterThanOrEqual(altezzaMockup);
      expect(multilinea.inputBottom).toBeLessThanOrEqual(multilinea.toolbarTop + 1);

      await page.reload();
      const dopoReload = await page.locator('#composerForm').evaluate((composer) => composer.getBoundingClientRect().height);
      expect(Math.abs(dopoReload - altezzaMockup), `${viewport.width}px · ${forma} · reload`).toBeLessThanOrEqual(1);
    }
  }
});

test('CHAT-FULL-WIDTH-SHORT-BUBBLE-01 — una domanda breve non viene stirata', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriChat(page);

  const preparaDomandaBreve = async () => {
    await page.locator('#conversation').evaluate((conversation) => {
      conversation.replaceChildren();
      const user = document.createElement('article');
      user.className = 'message user-message';
      user.innerHTML = '<div class="message-bubble">Ci sei?</div>';
      conversation.append(user);
    });
  };
  const misura = () => page.evaluate(() => ({
    composer: document.querySelector('#composerForm').getBoundingClientRect().width,
    bolla: document.querySelector('.message-bubble').getBoundingClientRect().width,
  }));

  await preparaDomandaBreve();
  const prima = await misura();
  expect(prima.bolla).toBeLessThan(180);

  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-chat').click();
  await accendiFullWidth(page);
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  const estesa = await misura();
  expect(Math.abs(estesa.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(Math.abs(estesa.bolla - prima.bolla)).toBeLessThanOrEqual(1);
  expect(estesa.bolla).toBeLessThan(180);

  await page.reload();
  await preparaDomandaBreve();
  const ricaricata = await misura();
  expect(Math.abs(ricaricata.composer - prima.composer)).toBeLessThanOrEqual(1);
  expect(Math.abs(ricaricata.bolla - prima.bolla)).toBeLessThanOrEqual(1);
});

test('CHAT-FULL-WIDTH-COPY-01 — le impostazioni descrivono il perimetro reale', async ({ page }) => {
  await apriChat(page);
  await page.locator('[data-vaia="impostazioni"]').click();
  await page.locator('#setting-tab-chat').click();
  const panel = page.locator('#settingsChatPanel');
  await expect(panel).toContainText('Risposte e domande lunghe');
  await expect(panel).toContainText('Le domande brevi, il composer e le sidebar non cambiano');
  await expect(panel).not.toContainText('conversazione e del composer');
});

test('INSPECTOR-WIDTH-01 — il pannello destro cresce senza schiacciare la chat e si adatta al viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apriChat(page);
  /*
   * ⛔ 18/09/2026 — `#inspectorResizeHandle` non esiste in nessun punto del prodotto: il
   * selettore era un puntatore morto e `boundingBox()` tornava `null` alla prima riga.
   * La maniglia viva è `button.talos-resizer.talos-resizer--inspector` con
   * `data-ridimensiona="inspector"` (`public/index.html:1195`), e il pannello che muove è
   * `#inspectorPanel`, battezzato A RUNTIME da `battezza(inspector, { id: 'inspectorPanel' })`
   * (`public/app.js:42838`) ⇒ si aspetta che sia visibile prima di trascinare, altrimenti il
   * trascinamento parte su un nodo che non c'è e il test misura il nulla.
   * Il verso non cambia: la maniglia sta sul bordo SINISTRO dell'inspector e il prodotto calcola
   * `delta = startX - clientX` (`public/app.js:41363-41400`) ⇒ trascinare a sinistra ALLARGA, e
   * le due attese del test (620-720, poi ≤420 a 1200 px) sono il `clamp` del prodotto
   * (`PANEL_RESIZE_LIMITS.inspector = [280, 720]`, `public/app.js:41323`).
   */
  const handle = page.locator('.talos-resizer[data-ridimensiona="inspector"]');
  await handle.waitFor({ state: 'visible' });
  await page.locator('#inspectorPanel').waitFor({ state: 'visible' });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x - 360, box.y + 120, { steps: 12 });
  await page.mouse.up();
  const larga = await page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width);
  expect(larga).toBeGreaterThanOrEqual(620);
  expect(larga).toBeLessThanOrEqual(720);
  await page.reload();
  /* ⛔ 18/09/2026 — dopo il ricaricamento la app atterra sulla HOME: `#inspectorPanel` non è
   * disegnato, e la seconda attesa che seguiva passava PER COSTRUZIONE (larghezza 0 ≤ 420: una
   * misura vuota, non una prova). Si rientra in chat dalla porta vera e poi si asserisce il vero.
   * MISURATO il 18/09/2026 (`%TEMP%\corsia5\sonda-6-inspector.mjs`, porta 4199): subito dopo il
   * reload vista `home`, `#schermoChat` visibile **false**, pannello **0**, maniglia nascosta;
   * dopo il rientro dalla voce di navigazione vista `chat`, pannello **702** (≥620 SOPRAVVIVE al
   * reload) — ed è il motivo per cui questa riga si può pretendere. */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#inspectorPanel')).toBeVisible();
  await expect.poll(() => page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(620);
  await page.setViewportSize({ width: 1200, height: 900 });
  /* sotto il punto di rottura il prodotto dichiara il pannello FLOTTANTE e non lo disegna:
   * misurato 1200 → bandierina "1", pannello **0**, maniglia nascosta, overflow **false**. */
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--talos-inspector-flottante').trim())).toBe('1');
  const ridotta = await page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width);
  expect(ridotta).toBe(0);
  await expect(page.locator('.talos-resizer[data-ridimensiona="inspector"]')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  /* e risalendo sopra il punto di rottura il pannello torna: misurato a 1440 → bandierina "0",
   * pannello **644** (≥620). Il `poll` è l'asserzione che morde se il pannello non risale. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--talos-inspector-flottante').trim())).toBe('0');
  await expect.poll(() => page.locator('#inspectorPanel').evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(620);
});

test('DESKTOP-SETTINGS-PERSISTENCE-01 — i controlli di aspetto producono stato reale e persistono', async ({ page }) => {
  await apriChat(page);
  await page.locator('[data-vaia="impostazioni"]').click();
  /*
   * ⛔ 18/09/2026 — sette `selectOption`/`check()` su nodi che il prodotto NASCONDE. Misurato
   * sulla 4199 (`%TEMP%\corsia5\z6.log`, Z17): i sei `select` hanno `data-calm-source`,
   * `aria-hidden="true"`, `display:none` e 0×0, e la loro faccia viva è `#<id>--calm`; la
   * casella `#immersiveHeaderToggle` è un `input` nascosto con la faccia
   * `#immersiveHeaderToggle--calm` a 42×25. Il giro giusto è quello del pattern ARIA
   * «combobox select-only» — faccia, listbox visibile, opzione per nome — ed è quello che fa
   * `scegliCalm` (vedi l'helper in cima al file).
   *
   * ⛔ E I CONTROLLI VIVONO NELLE LORO SCHEDE, che non sono la stessa: `composerShape`,
   * `messageStyle` e `streamingAnimation` stanno in «chat» (`impostazioni-campi.js:262, 302,
   * 320`), `windowPresentation`, `motionEasing` e `immersiveHeader` in «appearance»
   * (`:338, 570, 681`). Prima si passava solo per «appearance» e si pretendeva di scrivere
   * controlli della scheda «chat»: un altro pezzo dello stesso difetto.
   *
   * ⛔ `#motionQualitySelect` NON si guida più da qui, e non è una resa: quella preferenza è
   * stata MIGRATA nel Theme Studio — `theme-studio.js:203` (`CONTROLLI_MIGRATI`) e
   * `:1013` (`migraRigheImpostazioni`, righe marcate `data-td-migrata="si"`) — quindi in
   * Impostazioni non c'è più un controllo vivo da cliccare, e la sua asserzione
   * (`data-talos-motion-quality`) è stata tolta con essa. Resta un DEBITO DICHIARATO: la ricerca
   * dentro Impostazioni conta ancora quelle righe. Segnalato, non nascosto.
   */
  await page.locator('#setting-tab-chat').click();
  for (const [id, valore] of [['composerShapeSelect', 'compact'], ['messageStyleSelect', 'bubbles'], ['streamingAnimationSelect', 'fade']]) {
    expect(await scegliCalm(page, id, valore), `${id} · ${valore}`).toBe(1);
  }
  await page.locator('#setting-tab-appearance').click();
  expect(await scegliCalm(page, 'windowPresentationSelect', 'fullscreen')).toBe(1);
  /* la curva sta dentro i dettagli chiusi: si apre la maniglia PRIMA di cercarla */
  const dettagliCurva = page.locator('#setting-panel-appearance details.settings-advanced').filter({ has: page.locator('#motionEasingSelect') });
  if (!(await dettagliCurva.evaluate((elemento) => elemento.open))) await dettagliCurva.locator('summary').first().click();
  expect(await scegliCalm(page, 'motionEasingSelect', 'soft')).toBe(1);
  await page.locator('#immersiveHeaderToggle--calm').click();
  await expect(page.locator('#immersiveHeaderToggle--calm')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-talos-composer-shape', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-talos-message-style', 'bubbles');
  /*
   * ⛔ L'animazione della risposta vale QUI e non dopo un ricaricamento: la scelta scrive
   * `fade` sulla radice, ma all'avvio `frontend/src/main.js:37-39` forza
   * `data-talosStreamingAnimation = 'none'` quando la pagina NON è ospitata
   * (`window.__talosHarnessHost` assente) — hotfix Desktop standalone del 14/09/2026, scritta
   * nel commento sopra quella riga: il monolite teneva il testo 300-350 ms e il live stream
   * deve dipingere ogni frame. Quindi qui si asserisce lo stato della PREFERENZA (che è reale,
   * misurata: `#streamingAnimationSelect.value === 'fade'`), non un attributo che il prodotto
   * riscrive di proposito al caricamento.
   */
  await expect(page.locator('html')).toHaveAttribute('data-talos-streaming-animation', 'fade');
  await expect(page.locator('html')).toHaveAttribute('data-talos-window-presentation', 'fullscreen');
  await expect(page.locator('html')).toHaveAttribute('data-talos-motion-easing', 'soft');
  await expect(page.locator('html')).toHaveClass(/immersive-header/);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-talos-composer-shape', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-talos-message-style', 'bubbles');
  await expect(page.locator('html')).toHaveAttribute('data-talos-window-presentation', 'fullscreen');
  await expect(page.locator('html')).toHaveAttribute('data-talos-motion-easing', 'soft');
  await expect(page.locator('html')).toHaveClass(/immersive-header/);
  await expect(page.locator('#streamingAnimationSelect')).toHaveValue('fade');
});

/*
 * ⭐⭐⭐ 02/09 — review complessiva: lo streaming vivo rilavorava TUTTO il
 * markdown a ogni frame (13k caratteri in 162 delta = 1,28 s di main thread).
 * Ora i blocchi chiusi (riga vuota fuori fence) si rendono una volta sola e
 * restano gli STESSI nodi DOM; solo la coda si rifà. Il test prova l'identità
 * dei nodi, non solo il testo: un renderer che ricrea tutto passerebbe un
 * controllo sul solo textContent.
 */
test('LAG-LIVE-INCREMENTAL-40 — i blocchi già chiusi non vengono ricreati a ogni delta, la coda sì e il testo finale è completo', async ({ page }) => {
  await page.route('**/api/v1/sessions/lag-live-incremental/events', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await apriChat(page);
  const result = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('lag-live-incremental', 'workspace', 'Live', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const mid = 'inc-1';
    let seq = 31000;
    const invia = (delta) => runtime.handleRealEvent({ type: 'TextMessageContent', messageId: mid, delta, _sequenza: seq += 1 }, generation);

    invia('Primo paragrafo con **grassetto**.\n\n');
    await frame();
    const copia = document.querySelector('.assistant-message:last-child .assistant-copy');
    const primoNodo = copia?.firstElementChild || null;
    const primoTag = primoNodo?.tagName || null;

    invia('```js\nconst a = 1;\n\nconst b = 2;\n');   // fence APERTO con una riga vuota dentro: non deve chiudere il blocco
    await frame();
    const figliDuranteFence = copia.children.length;
    const preDuranteFence = copia.querySelector('pre')?.textContent || '';

    invia('```\n\n- uno\n- due\n\n');
    await frame();
    const stessoPrimoNodo = copia.firstElementChild === primoNodo;
    const preFinale = copia.querySelector('pre');

    for (let i = 0; i < 40; i += 1) { invia(`riga ${i} della coda `); await frame(); }
    const stessoPrimoNodoDopo40 = copia.firstElementChild === primoNodo;
    const stessoPre = copia.querySelector('pre') === preFinale;

    runtime.handleRealEvent({ type: 'TextMessageEnd', messageId: mid, _sequenza: seq += 1 }, generation);
    await frame();
    return {
      primoTag, figliDuranteFence, preDuranteFence, stessoPrimoNodo, stessoPrimoNodoDopo40, stessoPre,
      testo: copia.textContent, ul: copia.querySelectorAll('ul').length, strong: copia.querySelectorAll('strong').length,
      ultimoP: copia.lastElementChild?.textContent || '',
    };
  });
  expect(result.primoTag).toBe('P');
  expect(result.figliDuranteFence).toBe(2); // il paragrafo stabile + il pre della coda (la riga vuota dentro il fence non ha spezzato niente)
  expect(result.preDuranteFence).toContain('const b = 2;');
  expect(result.stessoPrimoNodo).toBe(true);
  expect(result.stessoPrimoNodoDopo40).toBe(true);
  expect(result.stessoPre).toBe(true);
  expect(result.strong).toBe(1);
  expect(result.ul).toBe(1);
  expect(result.testo).toContain('riga 39 della coda');
  expect(result.ultimoP).toContain('riga 0 della coda');
});
