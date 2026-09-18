import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/*
 * ⭐⭐⭐ P0/A — il terminale, misurato nel browser vero. 16/09/2026.
 *
 * Tre difetti dell'owner, una sola superficie:
 *  1. il pannello aperto dal composer era largo quanto il composer (768 px su 1440);
 *  2. la palette annunciava Ctrl+T / Ctrl+B / Ctrl+R, che il browser si prende (scheda nuova,
 *     preferiti, ricarica);
 *  3. dentro il terminale non si copiava e non si incollava.
 *
 * ⛔ Cosa questo file può e non può provare, detto prima:
 *  · la LARGHEZZA si misura in pixel qui, e solo qui: un test che legge il CSS non sa quanto è
 *    largo qualcosa. Il confronto è contro l'area principale VERA (`.talos-screen`), non contro un
 *    numero scritto a mano.
 *  · «premo Ctrl+T e non si apre una scheda» NON è dimostrabile da qui, ed è importante dirlo:
 *    Playwright manda i tasti alla pagina via CDP, quindi Chrome non aprirebbe una scheda nemmeno
 *    col difetto presente. Il conteggio delle pagine resta come controllo, ma non può smentire
 *    niente — la prova vera è che nessuna combinazione annunciata resti senza gestore, ed è la
 *    suite `tests/unit/scorciatoie-annunciate.test.mjs`, che legge il template.
 *  · copia e incolla passano invece da un giro COMPLETO: appunti veri del browser, xterm vera,
 *    shell vera del server di prova.
 *
 * ⛔ Il server di prova è quello di `playwright.config.mjs` (porta 4176, store vuoto): mai il 4174.
 * Per vedere le modifiche di questa corsia serve la build:
 *     npm --prefix harness-ui/frontend run build
 *     TALOS_HARNESS_UI_PUBLIC_DIR=<...>/harness-ui/frontend/dist \
 *       npx playwright test tests/browser/terminale-p0.spec.mjs --project=chromium-desktop
 */

const FOTO = fileURLToPath(new URL('../../artifacts/p0-A/', import.meta.url));

/*
 * ⛔ `locale: 'it-IT'` non è un vezzo: senza, il profilo di Playwright è `en-US`, la app risolve la
 *   lingua dal browser (`lingua.js`, `risolviLingua`) e le voci scritte dal codice escono in
 *   inglese — il test asserirebbe parole che l'owner non vede mai. Misurato in una foto di questa
 *   corsia: barra delle schede con «New», «Opened by you», «Same machine, no isolation».
 */
test.use({ permissions: ['clipboard-read', 'clipboard-write'], locale: 'it-IT' });

/** Apre la chat con un tema scelto e il pannello del terminale chiuso. */
async function apriApp(page, { tema = 'dark', larghezza = 1440, altezza = 900, tuttaLarghezza = false } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  /* ⛔ Il velo d'avvio e la finestra del primo avvio intercettano i clic: si salta l'introduzione e
     si aspetta che il velo sia STACCATO, non solo invisibile (stessa disciplina di baseline-shell). */
  /* ⛔ 16/09 — `chatFullWidth` si scrive nelle PREFERENZE SALVATE, non si accende dalla UI: è una
     riga di `appearance` (app.js, `DESKTOP_SETTINGS_KEY`), e la app la applica come classe
     `chat-full-width` sulla radice al primo disegno. Riprodurre lo stato dal profilo salvato è la
     stessa disciplina di [[non-consegnare-il-lavoro-a-meta-di-un-altro]]: un profilo vergine non
     dice nulla su come sta la app dell'owner. */
  await page.addInitScript(({ colorMode, chatFullWidth }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, chatFullWidth } }));
  }, { colorMode: tema === 'light' ? 'light' : 'dark', chatFullWidth: tuttaLarghezza });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  /*
   * ⛔⛔ 18/09/2026 — LA v2 ATTERRA SULLA HOME: LA CHAT SI APRE CON UN GESTO.
   * Misurato (sonda del 18/09 + le foto dei rossi): dopo lo stacco del velo la app mostra la Home;
   * `#pillTerminale` esiste nel DOM ma è **hidden** per 14 letture di fila («expected visible,
   * received hidden»), perché vive nel piede della CHAT. Con un clic su «Conversazioni»
   * (`.talos-nav-item[data-vaia="chat"]`) la chat si apre anche senza sessione e la pillola è
   * visibile. Ricerca 18/09/2026: si aspetta il CONTENUTO vero, mai la sparizione del velo né
   * `networkidle` — Playwright «Best practices», BrowserStack «Playwright waits»,
   * tayyabakmal.com «Test SPAs without race conditions» (aprile 2026).
   */
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(page.locator('#pillTerminale')).toBeVisible();
}

/** Misura, in pixel veri, il pannello e l'area principale che lo contiene. */
async function misura(page) {
  return page.evaluate(() => {
    const pannello = document.getElementById('pannelloTerminale');
    const schermo = pannello?.closest('.talos-screen');
    const piede = pannello?.closest('.talos-chat-foot');
    const dedicata = document.querySelector('#schermoTerminale .talos-terminal, .talos-terminale-basso__ospite .talos-terminal');
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    /* ⛔ 16/09 — il respiro si LEGGE dal piede vivo, non si riscrive nel test: in `chat-full-width`
       vale `--talos-respiro-pieno`, che è un `clamp()` su una percentuale e cambia col viewport.
       Un test che se lo riscrivesse a mano proverebbe la propria aritmetica, non la app. */
    const stile = piede ? getComputedStyle(piede) : null;
    return {
      respiro: stile && { sinistro: Math.round(parseFloat(stile.paddingLeft)), destro: Math.round(parseFloat(stile.paddingRight)) },
      pienaLarghezza: document.documentElement.classList.contains('chat-full-width'),
      pannello: r(pannello) && { x: Math.round(r(pannello).x), w: Math.round(r(pannello).width) },
      schermo: r(schermo) && { x: Math.round(r(schermo).x), w: Math.round(r(schermo).width) },
      piede: r(piede) && { x: Math.round(r(piede).x), w: Math.round(r(piede).width) },
      terminaleDentro: r(dedicata) && { w: Math.round(r(dedicata).width) },
      nascosto: pannello?.hidden ?? null,
    };
  });
}

test('P0A-LARGHEZZA-1440: il pannello del terminale è largo quanto l’area principale, non quanto il composer', async ({ page }, info) => {
  await apriApp(page, { tema: 'dark', larghezza: 1440, altezza: 900 });
  const prima = await misura(page);
  expect(prima.nascosto).toBe(true);

  await page.click('#pillTerminale');
  await expect(page.locator('#pannelloTerminale')).toBeVisible();
  const dopo = await misura(page);

  /* ⛔ Il confronto è con l'area principale VERA: niente numeri scritti a mano, che a viewport
     diversa mentirebbero. `.talos-screen` è la colonna centrale del guscio (senza barra laterale
     né ispettore): è ciò che l'owner chiama «l'area principale». */
  expect(dopo.pannello.w).toBe(dopo.schermo.w);
  expect(dopo.pannello.x).toBe(dopo.schermo.x);
  /* e resta più largo del piede della chat, che è la misura che aveva prima della cura */
  expect(dopo.pannello.w).toBeGreaterThan(dopo.piede.w - 2);
  const nota = `1440 — pannello ${dopo.pannello.w}px, schermo ${dopo.schermo.w}px, piede ${dopo.piede.w}px`;
  info.annotations.push({ type: 'misura', description: nota });
  console.log(`[P0A misura] ${nota}`);
});

test('P0A-LARGHEZZA-1024: la stessa misura sul portatile, dove le colonne si stringono per prime', async ({ page }, info) => {
  await apriApp(page, { tema: 'dark', larghezza: 1024, altezza: 800 });
  await page.click('#pillTerminale');
  await expect(page.locator('#pannelloTerminale')).toBeVisible();
  const dopo = await misura(page);
  expect(dopo.pannello.w).toBe(dopo.schermo.w);
  expect(dopo.pannello.x).toBe(dopo.schermo.x);
  const nota = `1024 — pannello ${dopo.pannello.w}px, schermo ${dopo.schermo.w}px, piede ${dopo.piede.w}px`;
  info.annotations.push({ type: 'misura', description: nota });
  console.log(`[P0A misura] ${nota}`);
});

/*
 * ⛔⛔ 16/09 — IL CASO CHE IL PRIMO GIRO AVEVA DICHIARATO E MAI MISURATO. Il foglio
 * `terminale-basso.css` affermava che in «chat a tutta larghezza» il pannello è «di fatto tutta
 * l'area principale»: nessuno l'aveva misurato, ed era falso di 98 px (726 contro 824 a 1440).
 * Questa è la misura che mancava, e da qui in poi quella frase o è vera o queste prove sono rosse.
 *
 * In quella modalità il piede ha `padding-left: ingombro + coda + respiro` e
 * `padding-right: respiro` (index.css, regola del 12/09), e il pannello li specchia tutti e tre.
 * Bersaglio dichiarato: VS Code, «Custom Layout» (letto il 16/09/2026), allineamento **Justify** —
 * «The panel spans the full width of the window».
 */
for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
  test(`P0A-LARGHEZZA-PIENA-${larghezza}: a «chat a tutta larghezza» il pannello è l'area principale, come fuori da quella modalità`, async ({ page }, info) => {
    await apriApp(page, { tema: 'dark', larghezza, altezza, tuttaLarghezza: true });
    const acceso = await page.evaluate(() => document.documentElement.classList.contains('chat-full-width'));
    expect(acceso, 'la modalità «chat a tutta larghezza» non si è accesa: la misura non direbbe niente').toBe(true);

    await page.click('#pillTerminale');
    await expect(page.locator('#pannelloTerminale')).toBeVisible();
    const m = await misura(page);
    const nota = `${larghezza} tutta larghezza — pannello ${m.pannello.w}px @x${m.pannello.x}, schermo ${m.schermo.w}px @x${m.schermo.x}, piede ${m.piede.w}px, respiro del piede ${m.respiro.sinistro}/${m.respiro.destro}`;
    info.annotations.push({ type: 'misura', description: nota });
    console.log(`[P0A misura] ${nota}`);

    expect(m.pannello.w).toBe(m.schermo.w);
    expect(m.pannello.x).toBe(m.schermo.x);
    /* ⛔ e il piede ha davvero il suo padding: senza questo controllo la prova sopra passerebbe
       anche se la modalità non facesse niente, cioè non potrebbe smentire nessuno. */
    expect(m.respiro.sinistro).toBeGreaterThan(0);
  });
}

test('P0A-LARGHEZZA-PIENA-BANDA: dove lo specchio della percentuale non è esatto il pannello rientra, e non esce MAI dall’area', async ({ page }, info) => {
  /*
   * ⛔ Il limite, scritto invece che nascosto. `--talos-respiro-pieno` è una PERCENTUALE, e un
   *   `100%` non vale lo stesso numero nel `padding` del piede e nel `margin` di un suo figlio: il
   *   blocco contenitore di un elemento statico è il **content box** dell'antenato, cioè già senza
   *   quel padding (MDN «margin» e MDN «Containing block», rilette il 16/09/2026).
   * ⇒ Lo specchio è esatto dove il `clamp` è saturo. Sweep di 26 larghezze (900→1920, passo 40,
   *   16/09, ricontato dal controllore): 19 esatte, 7 rientrate — la banda 1580→1820 px a passo 40 ne contiene sette, massimo 44 px per lato.
   * ⛔ Qui si misura la larghezza PEGGIORE trovata nello sweep (1660) e si tengono ferme le due
   *   cose che contano: il verso dell'errore (sempre in dentro) e il suo tetto (il `clamp`, 44 px
   *   per lato). Una prova che dichiarasse «esatto a ogni larghezza» sarebbe rossa, e sarebbe
   *   giusto che lo fosse.
   */
  await apriApp(page, { tema: 'dark', larghezza: 1660, altezza: 900, tuttaLarghezza: true });
  await page.click('#pillTerminale');
  await expect(page.locator('#pannelloTerminale')).toBeVisible();
  const m = await misura(page);
  const sinistra = m.pannello.x - m.schermo.x;
  const destra = (m.schermo.x + m.schermo.w) - (m.pannello.x + m.pannello.w);
  const nota = `1660 tutta larghezza — pannello ${m.pannello.w}px @x${m.pannello.x}, schermo ${m.schermo.w}px @x${m.schermo.x}, rientro ${sinistra}/${destra}`;
  info.annotations.push({ type: 'misura', description: nota });
  console.log(`[P0A misura] ${nota}`);

  expect(sinistra).toBeGreaterThanOrEqual(0);   // mai a sinistra dell'area principale
  expect(destra).toBeGreaterThanOrEqual(0);     // mai oltre il bordo destro
  expect(sinistra).toBe(destra);                // e se rientra, rientra simmetrico
  expect(sinistra).toBeLessThanOrEqual(44);     // il tetto è quello del `clamp` del respiro
});

test('P0A-UN-SOLO-TOGGLE: un clic sulla pill apre una volta sola, e un secondo clic chiude', async ({ page }) => {
  await apriApp(page);
  await page.evaluate(() => {
    globalThis.__talosCambiHidden = 0;
    const pannello = document.getElementById('pannelloTerminale');
    new MutationObserver((mutazioni) => { globalThis.__talosCambiHidden += mutazioni.length; })
      .observe(pannello, { attributes: true, attributeFilter: ['hidden'] });
  });
  await page.click('#pillTerminale');
  await expect(page.locator('#pannelloTerminale')).toBeVisible();
  expect(await page.evaluate(() => globalThis.__talosCambiHidden)).toBe(1);
  expect(await page.getAttribute('#pillTerminale', 'aria-expanded')).toBe('true');

  await page.click('#pillTerminale');
  await expect(page.locator('#pannelloTerminale')).toBeHidden();
  expect(await page.evaluate(() => globalThis.__talosCambiHidden)).toBe(2);
  /* ⛔ E il terminale è tornato a casa sua, non è rimasto dentro un pannello invisibile. */
  expect(await page.locator('#schermoTerminale .talos-terminal').count()).toBe(1);
});

test('P0A-SCORCIATOIE: la palette non annuncia più i tasti del browser, e quelli annunciati funzionano', async ({ page, context }) => {
  await apriApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#veloComandi')).toBeVisible();
  const annunciate = await page.$$eval('#veloComandi kbd, #veloComandi .talos-kbd', (nodi) => nodi.map((n) => n.textContent.trim()));
  for (const proibita of ['Ctrl T', 'Ctrl B', 'Ctrl R', '⌘T', '⌘B', '⌘R']) {
    expect(annunciate, `la palette annuncia ancora ${proibita}`).not.toContain(proibita);
  }
  expect(annunciate).toContain('Ctrl `'); // «Apri terminale» promette il tasto che esiste davvero
  await page.keyboard.press('Escape');

  /* ⛔ Controllo DEBOLE, e lo si dice: Playwright manda i tasti alla pagina, quindi Chrome non
     aprirebbe una scheda nemmeno col difetto presente. Resta perché una pagina in più qui vorrebbe
     dire che è la APP ad aprirla — quello sì che si vedrebbe. */
  for (const combo of ['Control+t', 'Control+b', 'Control+r']) await page.keyboard.press(combo);
  expect(context.pages().length).toBe(1);

  /* Il tasto annunciato, invece, deve fare quello che dice: Ctrl+` mostra il terminale. */
  await page.keyboard.press('Control+`');
  await expect(page.locator('#schermoTerminale')).toBeVisible();
});

test('P0A-APPUNTI: nel terminale si copia e si incolla, e il tasto destro apre il menu nostro', async ({ page }) => {
  await apriApp(page);
  /*
   * ⛔ Prima la vista Terminale, POI il pannello — e non è un giro lungo per niente: senza sessione
   *   il pannello da solo chiede una scheda nuova, che senza sessione non si può aprire (il toast
   *   lo dice). La vista invece carica la scheda «standalone» che il server accetta, con la sua
   *   shell vera. Il pannello poi SPOSTA quella, che è esattamente ciò che fa nel prodotto.
   */
  await page.keyboard.press('Control+`');
  await expect(page.locator('#schermoTerminale .xterm').first()).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Control+`');
  await page.click('#pillTerminale');
  const corpo = page.locator('#pannelloTerminale .talos-terminal__mount .xterm').first();
  await expect(corpo).toBeVisible({ timeout: 15_000 });

  /* ⛔ Il tasto destro deve aprire il NOSTRO menu: è la prova che il cablaggio degli appunti è
     arrivato sulla xterm vera, non solo nei test del componente. */
  const menu = page.locator('#menuTerminale');
  await corpo.click({ button: 'right', position: { x: 60, y: 30 } });
  await expect(menu).toBeVisible();
  const voci = await menu.locator('[role="menuitem"]').allInnerTexts();
  expect(voci).toEqual(['Copia', 'Incolla', 'Seleziona tutto', 'Pulisci lo schermo']);
  await page.keyboard.press('Escape');

  /*
   * ⛔ Il contenuto del terminale NON si legge dal DOM: col renderer WebGL (acceso qui apposta, vedi
   *   `accendiWebglTerminale`) le righe sono pixel su una canvas e `.xterm-rows` è vuoto. Misurato
   *   in questa corsia: una prima versione di questo test aspettava per 20 s un testo che non
   *   sarebbe mai arrivato, con il prompt ben visibile nella foto. ⇒ Si legge dagli APPUNTI, che è
   *   poi la cosa che stiamo provando: «Seleziona tutto» + «Copia» passa da `getSelection()`, che
   *   non dipende dal renderer.
   */
  async function copiaTutto() {
    await corpo.click({ button: 'right', position: { x: 60, y: 30 } });
    await menu.locator('[role="menuitem"]', { hasText: 'Seleziona tutto' }).click();
    await corpo.click({ button: 'right', position: { x: 60, y: 30 } });
    const copia = menu.locator('[role="menuitem"]', { hasText: 'Copia' }).first();
    if (await copia.isDisabled()) { await page.keyboard.press('Escape'); return ''; }
    await copia.click();
    return page.evaluate(() => navigator.clipboard.readText());
  }

  /* La shell vera del server di prova scrive il suo prompt: è il testo su cui si prova il copia. */
  let copiato = '';
  await expect.poll(async () => { copiato = await copiaTutto(); return copiato.trim().length; }, { timeout: 25_000 }).toBeGreaterThan(0);
  expect(copiato).toContain('$');

  /*
   * Incolla: si mette negli appunti una stringa riconoscibile, si preme Ctrl+V, e la si ritrova
   * COPIANDO di nuovo il terminale. Giro completo: appunti veri → `term.paste` → buffer della
   * xterm → `getSelection()` → appunti veri.
   * ⛔ Nessun `\n`: il testo resta sulla riga di comando, non si lancia niente sulla macchina.
   */
  await page.evaluate(() => navigator.clipboard.writeText('TALOS-INCOLLA-OK'));
  await corpo.click({ position: { x: 60, y: 30 } });
  await page.keyboard.press('Control+v');
  await expect.poll(async () => (await copiaTutto()).includes('TALOS-INCOLLA-OK'), { timeout: 20_000 }).toBe(true);
});

/* ⛔ 16/09, secondo giro: le foto sono OTTO, non quattro — la modalità «chat a tutta larghezza»
   è cambiata in questo giro, e una superficie che cambia si guarda. Due temi, due larghezze, due
   modalità: la regola di casa dice tema chiaro E scuro, sempre tutti e due. */
test('P0A-FOTO: il pannello nei due temi, a 1440 e a 1024, nelle due modalità di larghezza', async ({ page }) => {
  await mkdir(FOTO, { recursive: true });
  for (const tuttaLarghezza of [false, true]) {
  for (const tema of ['dark', 'light']) {
    for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
      await apriApp(page, { tema, larghezza, altezza, tuttaLarghezza });
      /* ⛔ Prima la vista Terminale: così la foto mostra una SHELL VERA dentro il pannello. La
         prima versione di questa prova fotografava il pannello vuoto con il toast «Serve una
         sessione» sopra — vero, ma non è la cosa da guardare, ed è il difetto che l'owner ha già
         pagato una volta («una foto che non mostra la cosa non è una verifica»). */
      await page.keyboard.press('Control+`');
      await expect(page.locator('#schermoTerminale .xterm').first()).toBeVisible({ timeout: 20_000 });
      await page.keyboard.press('Control+`');
      await page.click('#pillTerminale');
      await expect(page.locator('#pannelloTerminale')).toBeVisible();
      /* ⛔ Puntatore E fuoco via dalla pill: il suggerimento («Apri il terminale qui sotto») compare
         anche col fuoco da tastiera — è giusto che lo faccia — e nella foto copriva il composer.
         Fotografare uno stato che nessuno guarda davvero è un modo di non guardare. */
      await page.mouse.move(Math.round(larghezza / 2), 120);
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.waitForTimeout(600); // il terminale si rimisura dopo lo spostamento
      const modo = tuttaLarghezza ? '-piena' : '';
      await page.screenshot({ path: `${FOTO}terminale-basso-${tema}-${larghezza}${modo}.png`, fullPage: false });
    }
  }
  }
});
