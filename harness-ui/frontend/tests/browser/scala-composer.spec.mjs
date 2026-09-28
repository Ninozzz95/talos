import { test, expect } from '@playwright/test';

/*
 * Difetto (3) delle foto di Ask e del Piano, riverificato sul 4174 il 26/09 in sola lettura: a 1024 (composer 614 px) la
 * barra tagliava tre etichette coi puntini — «glm-5.3-fl…», «Scrive nel prog…», «Termin…». La scala ora si sceglie
 * MISURANDO (`components/scala-composer.js`): cede prima «Terminale», poi il permesso e «Sessione»; il modello si stringe
 * solo quando gli altri due hanno già ceduto. Ogni richiesta non-GET si ferma e si conta.
 */
const SESSIONE = 'scala-composer';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;

async function apri(page) {
  const contatore = { nonGet: 0 };
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Scala', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  // il lettore della barra vive NELLA pagina: così `misura` scrive, adatta e legge in una sola battuta
  await page.evaluate(`window.__leggiBarraScala = ${leggiBarra.toString()}`);
  return contatore;
}

const dueFotogrammi = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

/**
 * Accende le pillole come fa il prodotto, adatta la scala e legge la barra, tutto nella STESSA battuta: in una sessione in
 * corso il piede si ridisegna da solo e rimette `hidden` alle pillole che non hanno dati (la corsa di D2, `p0bis-c`).
 * La strada automatica (osservatori + un fotogramma) si prova a parte, in COMPOSER-SCALE-03, senza scrivere niente.
 */
async function misura(page, larghezza, { giri = null, spesa = false, reindirizza = false }) {
  await page.setViewportSize({ width: larghezza, height: 900 });
  await dueFotogrammi(page); // il ridimensionamento ridisegna il piede: prima si lascia finire (vedi D2 in p0bis-c)
  return page.evaluate(({ giri, spesa, reindirizza }) => {
    const composer = document.querySelector('#composerForm');
    const pg = composer.querySelector('[data-runtime-giri]');
    pg.hidden = giri === null; if (giri) pg.querySelector('.talos-mono').textContent = giri;
    const pc = composer.querySelector('[data-runtime-costo]');
    pc.hidden = !spesa; if (spesa) pc.querySelector('.talos-mono').textContent = '~$0,42';
    composer.querySelector('#redirectRunButton').hidden = !reindirizza;
    composer.querySelector('[data-open-sheet="model"] .talos-chip__label').textContent = 'glm-5.3-flash';
    composer.querySelector('[data-open-sheet="permissions"] .talos-chip__label').textContent = 'Scrive nel progetto';
    window.__talosHarnessUiRuntime.adattaScalaComposer();
    return window.__leggiBarraScala();
  }, { giri, spesa, reindirizza });
}

/** Legge la barra com'è adesso (nella pagina). */
function leggiBarra() {
    const composer = document.querySelector('#composerForm');
    const barra = composer.querySelector('.talos-composer__bar');
    const stato = (sel) => {
      const el = composer.querySelector(sel);
      const ceduta = getComputedStyle(el).position === 'absolute';
      return { ceduta, tagliata: !ceduta && el.scrollWidth > el.clientWidth + 1, testo: el.textContent };
    };
    return {
      composerW: Math.round(composer.getBoundingClientRect().width), scala: barra.dataset.scala ?? '0',
      modello: stato('[data-open-sheet="model"] .talos-chip__label'),
      permesso: stato('[data-open-sheet="permissions"] .talos-chip__label'),
      terminale: stato('#pillTerminale .talos-chip__label'),
      sfonda: barra.scrollWidth > barra.clientWidth + 1,
    };
}

const COMBINAZIONI = [
  { nome: 'niente acceso', giri: null },
  { nome: 'Giri 1', giri: '1' },
  { nome: 'Giri 24/24', giri: '24/24' },
  { nome: 'Giri 24/24 + Reindirizza', giri: '24/24', reindirizza: true },
  { nome: 'Giri 1 + spesa', giri: '1', spesa: true },
];

test('COMPOSER-SCALE-01 — da 1024 a 1440, in ogni combinazione di pillole, nessuna etichetta tagliata: si cede per stadi', async ({ page }) => {
  const c = await apri(page);
  const errori = [];
  for (const larghezza of [1024, 1120, 1200, 1280, 1360, 1440]) {
    for (const combo of COMBINAZIONI) {
      const m = await misura(page, larghezza, combo);
      const dove = `${larghezza} px (composer ${m.composerW}) · ${combo.nome} · stadio ${m.scala}`;
      if (m.permesso.tagliata) errori.push(`${dove}: «${m.permesso.testo}» tagliata`);
      if (m.terminale.tagliata) errori.push(`${dove}: «${m.terminale.testo}» tagliata`);
      if (m.sfonda) errori.push(`${dove}: la barra sfonda`);
      // l'ordine: il permesso cede solo dopo «Terminale»; il modello si stringe solo quando gli altri due hanno già ceduto
      if (m.permesso.ceduta && !m.terminale.ceduta) errori.push(`${dove}: il permesso ha ceduto prima di «Terminale»`);
      if (m.modello.tagliata && !(m.permesso.ceduta && m.terminale.ceduta)) errori.push(`${dove}: «${m.modello.testo}» tagliato mentre c'era ancora da cedere`);
    }
  }
  expect(errori, errori.join('\n')).toEqual([]);
  expect(c.nonGet).toBe(0);
});

test('COMPOSER-SCALE-02 — AL CONTRARIO: dove lo spazio c\'è, nessuno cede (1440, «Giri 1», niente spesa)', async ({ page }) => {
  const c = await apri(page);
  const m = await misura(page, 1440, { giri: '1' });
  expect(m.scala).toBe('0');
  expect(m.terminale.ceduta).toBe(false);
  expect(m.permesso.ceduta).toBe(false);
  expect(m.modello.tagliata).toBe(false);
  expect(c.nonGet).toBe(0);
});

test('COMPOSER-SCALE-03 — la strada AUTOMATICA: senza scrivere niente, 1280 (colonna destra aperta) cede, 1440 torna intero', async ({ page }) => {
  const c = await apri(page);
  /* A 1280 il composer è largo 530 px (misurato): con le etichette vere del prodotto qualcosa deve cedere. Nessuna scrittura
     nella barra e nessuna chiamata diretta: lavorano solo il ResizeObserver e il fotogramma di `collegaScalaComposer`. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await dueFotogrammi(page); await dueFotogrammi(page);
  const stretta = await page.evaluate(leggiBarra);
  expect(stretta.composerW, 'la prova vale solo se il composer è davvero stretto').toBeLessThan(560);
  expect(stretta.terminale.ceduta, 'a composer stretto «Terminale» cede da sé').toBe(true);
  expect(stretta.permesso.tagliata || stretta.terminale.tagliata).toBe(false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await dueFotogrammi(page); await dueFotogrammi(page);
  const larga = await page.evaluate(leggiBarra);
  expect(larga.scala, 'tornato largo, la scala torna a zero da sé').toBe('0');
  expect(larga.terminale.ceduta).toBe(false);
  expect(c.nonGet).toBe(0);
});
