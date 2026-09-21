import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ IL RESIZE DEL COMPOSER NON DEVE COSTARE UN LAYOUT PER OGNI MOVIMENTO DEL MOUSE.
 *   Owner, 20/09/2026: «quando faccio resize del composer lagga un sacco, indaga».
 *
 * ⛔ MISURATO SULLA PAGINA VERA, e prima della cura: durante un trascinamento di 41 movimenti la
 *   pagina ha fatto **36,2 letture di layout per movimento** (`getBoundingClientRect` +
 *   `getComputedStyle`), ognuna **dopo** che `applyComposerSize` aveva appena scritto **tre custom
 *   property su `:root`** — e una scrittura su `:root` invalida lo stile calcolato di TUTTO il
 *   documento. Il risultato è il classico *layout thrashing*: scrivo → leggo → scrivo → leggo, e il
 *   browser è costretto a rifare stile e layout a ogni evento, senza poterli fondere.
 *
 * ⭐ E il costo NON è un'opinione: nel codice di Hermes, che ha la stessa malattia e la stessa cura,
 *   il commento accanto alla soppressione porta la misura — `apps/desktop/src/components/pane-shell/
 *   geometry.ts:160-168`, letto il 20/09/2026: «Measured live (LoAF, real session): drag frames of
 *   **~68ms** with **style+layout=67ms** and no script ≥5ms; suppressing the writes recovered
 *   **14fps → 51fps**. The vars only align titlebar chrome — republishing once on release is
 *   visually identical.» E l'helper `rafCoalesce` (`apps/desktop/src/lib/raf-coalesce.ts:6`):
 *   «Coalesce a stream of values (pointermove positions, resize deltas) to one `apply` per animation
 *   frame, so a drag can't drive several layouts per frame.»
 *
 * ⇒ Questa prova difende TRE cose, e sono le tre che rendono il trascinamento fluido:
 *   1. **niente letture di layout per movimento** (si legge UNA volta, all'inizio del gesto);
 *   2. **niente scritture su `:root` durante il gesto** (si pubblicano UNA volta al rilascio);
 *   3. **e la maniglia segue comunque il cursore** — il composer cambia misura MENTRE si trascina.
 *      ⛔ Senza la 3, «non costa niente» si ottiene anche non disegnando: la prova sarebbe verde su
 *      un composer che non si ridimensiona affatto.
 */

test.use({ locale: 'it-IT' });

/** Installa i contatori. Si azzerano e si accendono solo dentro la finestra del gesto. */
const STRUMENTA = () => {
  const w = /** @type {any} */ (window);
  const rectOrig = Element.prototype.getBoundingClientRect;
  const gcsOrig = w.getComputedStyle;
  const setPropOrig = CSSStyleDeclaration.prototype.setProperty;
  w.__c = { rect: 0, gcs: 0, radice: 0, mosse: 0, attivo: false, larghezzeViste: new Set() };
  Element.prototype.getBoundingClientRect = function (...a) { if (w.__c.attivo) w.__c.rect += 1; return rectOrig.apply(this, a); };
  w.getComputedStyle = function (...a) { if (w.__c.attivo) w.__c.gcs += 1; return gcsOrig.apply(this, a); };
  /* ⛔ Si contano SOLO le scritture sulla RADICE: sono quelle che invalidano tutto il documento. */
  CSSStyleDeclaration.prototype.setProperty = function (nome, valore, ...resto) {
    if (w.__c.attivo && this === document.documentElement.style) w.__c.radice += 1;
    return setPropOrig.call(this, nome, valore, ...resto);
  };
  /* ⛔ Il contatore dei MOVIMENTI, che nella prima stesura non c'era: senza, il denominatore della
     misura è zero e la prova muore sulla sua premessa invece che sul difetto — e le altre due
     asserzioni non vengono nemmeno lette. */
  document.addEventListener('pointermove', () => { if (w.__c.attivo) w.__c.mosse += 1; }, true);
  w.__c.azzera = () => { w.__c.rect = 0; w.__c.gcs = 0; w.__c.radice = 0; w.__c.mosse = 0; w.__c.larghezzeViste = new Set(); };
};

async function apriChat(page) {
  /* ⛔ La stessa guardia delle sonde: se questa prova gira sul 4174 dell'owner (con
     `TALOS_HARNESS_UI_BASE_URL`), ogni richiesta non-GET si FERMA e si conta. Un resize è un gesto
     locale e non deve scrivere niente — ma la guardia lo rende vero per costruzione. */
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return route.continue();
    console.log(`FERMATE-SUL-4174 ${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    if (!r?.passaASessione) return;
    r.passaASessione('resize-composer', 'workspace', 'Resize', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
  });
  await page.waitForTimeout(400);
}

test('RESIZE-COMPOSER — il trascinamento non legge il layout a ogni movimento, e la maniglia segue', async ({ page }) => {
  await apriChat(page);
  await page.evaluate(STRUMENTA);

  const maniglia = await page.locator('#composerResizeHandle').boundingBox();
  expect(maniglia, 'la maniglia del composer non c\'è: la scena non si è formata').not.toBeNull();
  const partenza = { x: Math.round(maniglia.x + maniglia.width / 2), y: Math.round(maniglia.y + maniglia.height / 2) };
  const larghezzaPrima = await page.locator('#composerForm').evaluate((n) => Math.round(n.getBoundingClientRect().width));

  /* ⛔ Si campiona la larghezza DURANTE il gesto: è la prova che la maniglia segue il cursore. */
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const form = document.querySelector('#composerForm');
    w.__c.larghezzeViste = new Set();
    w.__c.campiona = () => { w.__c.larghezzeViste.add(Math.round(form.getBoundingClientRect().width)); };
    form.addEventListener('pointermove', w.__c.campiona, true);
  });

  await page.evaluate(() => { const w = /** @type {any} */ (window); w.__c.azzera(); w.__c.attivo = true; });
  await page.mouse.move(partenza.x, partenza.y);
  await page.mouse.down();
  /* ⛔ Si RIMPICCIOLISCE (maniglia verso destra e verso il basso), non si ingrandisce: il composer
     nasce già **al tetto** della colonna (`spazioDisponibileComposer() − 24`) ⇒ ingrandendo si
     sbatte contro il limite dopo 22 px e la prova misura un gesto che non si è mosso. Verso il
     basso ci sono 150 px di spazio vero. */
  for (let i = 1; i <= 30; i += 1) await page.mouse.move(partenza.x + i * 5, partenza.y + i * 2);
  const durante = await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const c = { ...w.__c, larghezzeViste: [...w.__c.larghezzeViste].filter((n) => n > 0).length };
    w.__c.attivo = false;
    return c;
  });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const dopo = await page.evaluate(() => {
    const radice = getComputedStyle(document.documentElement);
    return {
      larghezzaFinale: Math.round(document.querySelector('#composerForm').getBoundingClientRect().width),
      varLarghezza: radice.getPropertyValue('--composer-max-w').trim(),
      varAltezza: radice.getPropertyValue('--composer-canonical-h').trim(),
      /* ⛔ La chiave vera, da `app.js:20992` — non una indovinata. */
      salvato: (() => { try { return localStorage.getItem('talos-harness-composer-size-v1'); } catch { return null; } })(),
    };
  });
  console.log(`MISURA-RESIZE-COMPOSER = ${JSON.stringify({ larghezzaPrima, durante, dopo })}`);

  expect(durante.mosse, 'nessun pointermove ricevuto: il drag non è partito').toBeGreaterThan(10);

  /*
   * 1. NIENTE LETTURE DI LAYOUT PER MOVIMENTO. Non «poche»: il gesto non deve leggere il layout
   *    mentre scrive. La tolleranza è per le letture che il BROWSER o l'app fanno per conto loro
   *    (un `getComputedStyle` dell'anteprima di tema, il misuratore del testo): il numero che
   *    deve sparire è il `36,2 per movimento` misurato prima della cura.
   */
  const letturePerMovimento = (durante.rect + durante.gcs) / durante.mosse;
  expect(
    letturePerMovimento,
    `il trascinamento legge il layout ${letturePerMovimento.toFixed(1)} volte per movimento (${durante.rect} rect + ${durante.gcs} getComputedStyle su ${durante.mosse} movimenti): è il layout thrashing`,
  ).toBeLessThan(2);

  /*
   * 2. NIENTE SCRITTURE SU `:root` DURANTE IL GESTO. Ognuna invalida lo stile calcolato di tutto il
   *    documento: è il costo che Hermes misura in «style+layout=67ms» per fotogramma.
   */
  expect(
    durante.radice,
    `durante il trascinamento la pagina ha scritto ${durante.radice} volte le variabili su :root (misurate 3 per movimento): ogni scrittura invalida lo stile di tutto il documento`,
  ).toBe(0);

  /* 3. E LA MANIGLIA SEGUE LO STESSO: almeno tre larghezze distinte viste durante il gesto. */
  expect(
    durante.larghezzeViste,
    'il composer NON ha cambiato misura durante il trascinamento: la maniglia non segue il cursore, e «non costa niente» è vero solo perché non fa niente',
  ).toBeGreaterThanOrEqual(3);

  /* 4. Al rilascio la misura si pubblica e si ricorda. */
  expect(dopo.varLarghezza, 'al rilascio la variabile --composer-max-w non è pubblicata').toMatch(/^\d+(\.\d+)?px$/);
  expect(dopo.varAltezza, 'al rilascio la variabile --composer-canonical-h non è pubblicata').toMatch(/^\d+(\.\d+)?px$/);
  expect(Math.abs(dopo.larghezzaFinale - larghezzaPrima), 'il composer non si è ridimensionato affatto: la scena non prova niente').toBeGreaterThan(20);
  expect(dopo.salvato, 'la misura scelta non è stata ricordata').toContain(String(dopo.larghezzaFinale));
});
