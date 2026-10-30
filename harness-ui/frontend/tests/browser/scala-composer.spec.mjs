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
async function misura(page, larghezza, { piano = false, spesa = false, reindirizza = false }) {
  await page.setViewportSize({ width: larghezza, height: 900 });
  await dueFotogrammi(page); // il ridimensionamento ridisegna il piede: prima si lascia finire (vedi D2 in p0bis-c)
  return page.evaluate(({ piano, spesa, reindirizza }) => {
    const composer = document.querySelector('#composerForm');
    // 11/10/2026 (owner): la pillola dei giri è uscita dal composer; al suo posto può accendersi la pastiglia del piano ChatGPT
    composer.querySelector('[data-piano-chatgpt]').hidden = !piano;
    const pc = composer.querySelector('[data-runtime-costo]');
    pc.hidden = !spesa; if (spesa) pc.querySelector('.talos-mono').textContent = '~$0,42';
    composer.querySelector('#redirectRunButton').hidden = !reindirizza;
    composer.querySelector('[data-open-sheet="model"] .talos-chip__label').textContent = 'glm-5.3-flash';
    composer.querySelector('[data-open-sheet="permissions"] .talos-chip__label').textContent = 'Scrive nel progetto';
    window.__talosHarnessUiRuntime.adattaScalaComposer();
    return window.__leggiBarraScala();
  }, { piano, spesa, reindirizza });
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
      piano: composer.querySelector('[data-piano-chatgpt]').hidden ? null : stato('[data-piano-chatgpt] .talos-chip__label'),
      sfonda: barra.scrollWidth > barra.clientWidth + 1,
    };
}

const COMBINAZIONI = [
  { nome: 'niente acceso' },
  { nome: 'piano ChatGPT', piano: true },
  { nome: 'Reindirizza', reindirizza: true },
  { nome: 'piano ChatGPT + Reindirizza', piano: true, reindirizza: true },
  { nome: 'piano ChatGPT + spesa', piano: true, spesa: true },
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
      if (m.piano?.tagliata) errori.push(`${dove}: «${m.piano.testo}» tagliata`);
      if (m.piano?.ceduta && !m.permesso.ceduta) errori.push(`${dove}: il piano ha ceduto prima del permesso`);
      if (m.piano?.ceduta && m.scala !== '4') errori.push(`${dove}: il piano cede solo al gradino 4, per ultimo`); // 27/10: il 3 è del ragionamento
      if (m.sfonda) errori.push(`${dove}: la barra sfonda`);
      // l'ordine: il permesso cede solo dopo «Terminale»; il modello si stringe solo quando gli altri due hanno già ceduto
      if (m.permesso.ceduta && !m.terminale.ceduta) errori.push(`${dove}: il permesso ha ceduto prima di «Terminale»`);
      if (m.modello.tagliata && !(m.permesso.ceduta && m.terminale.ceduta)) errori.push(`${dove}: «${m.modello.testo}» tagliato mentre c'era ancora da cedere`);
    }
  }
  expect(errori, errori.join('\n')).toEqual([]);
  expect(c.nonGet).toBe(0);
});

test('COMPOSER-SCALE-02 — AL CONTRARIO: dove lo spazio c\'è, nessuno cede (1440, niente acceso; con la pastiglia del piano al più «Terminale»)', async ({ page }) => {
  const c = await apri(page);
  /* 11/10/2026: la pillola dei giri («Invio 1», ~70 px) è uscita; la pastiglia del piano è più larga (~109 px). Misurato a 1440 con la
     colonna destra aperta (composer 690, barra 660): con lei la barra chiede ~694 px e il nome del modello si taglierebbe, quindi
     «Terminale» cede all'icona — è la scala che fa il suo lavoro (stesso limite di COMPOSER-SCALE-03: «a 1440 al più Terminale»).
     Il verso contrario si prova dove lo spazio c'è davvero: la barra senza pastiglia.
     ⛔ 24/10/2026 — la pillola del ragionamento (owner, bozzetto approvato) aggiunge ~95 px. Misurato a 1440 con la pastiglia del
     piano (barra 660): al gradino 1 servono ~707 px (nome del modello 80/56, permesso 115/82), quindi cede anche il permesso
     (gradino 2), nell'ordine della scala: prima «Terminale», poi il permesso, che resta lo scudo col suo suggerimento; niente si
     taglia. Senza la pastiglia (qui sotto) tutto resta intero a 1440. */
  const conPiano = await misura(page, 1440, { piano: true });
  expect(Number(conPiano.scala), 'con la pastiglia del piano e la pillola del ragionamento, a 1440 al più cede anche il permesso').toBeLessThanOrEqual(2);
  if (conPiano.permesso.ceduta) expect(conPiano.terminale.ceduta, 'il permesso cede solo dopo «Terminale»').toBe(true);
  expect(conPiano.piano?.tagliata).toBe(false);
  expect(conPiano.modello.tagliata).toBe(false);
  /* 24/10/2026: con la pillola del ragionamento, a 1440 senza pastiglia cede «Terminale» (gradino 1, riconoscibile dall'icona); il
     permesso e il modello restano interi. Il verso «nessuno cede» si prova a 1920 (COMPOSER-SCALE-03, «1920 torna intero»). */
  const m = await misura(page, 1440, {});
  expect(Number(m.scala)).toBeLessThanOrEqual(1);
  expect(m.permesso.ceduta).toBe(false);
  expect(m.permesso.tagliata).toBe(false);
  expect(m.modello.tagliata).toBe(false);
  expect(c.nonGet).toBe(0);
});

test('COMPOSER-SCALE-03 — la strada AUTOMATICA: senza scrivere niente, 1280 (colonna destra aperta) cede, a 1440 al più «Terminale», 1920 torna intero', async ({ page }) => {
  const c = await apri(page);
  /* A 1280 il composer è largo 530 px (misurato): con le etichette vere del prodotto qualcosa deve cedere. Nessuna scrittura
     nella barra e nessuna chiamata diretta: lavorano solo il ResizeObserver e il fotogramma di `collegaScalaComposer`. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await dueFotogrammi(page); await dueFotogrammi(page);
  const stretta = await page.evaluate(leggiBarra);
  expect(stretta.composerW, 'la prova vale solo se il composer è davvero stretto').toBeLessThan(560);
  expect(stretta.terminale.ceduta, 'a composer stretto «Terminale» cede da sé').toBe(true);
  expect(stretta.permesso.tagliata || stretta.terminale.tagliata).toBe(false);
  /* C1 (owner 10/10/2026): il permesso dice cosa passa senza chiedere («Senza chiedere: file, comandi, documenti»), più lungo di
     «Scrive nel progetto». A 1440 con la colonna destra aperta cede per primo «Terminale», che resta riconoscibile dalla sua icona,
     e il permesso resta intero: è l'ordine della scala, e niente si taglia. Tutto intero da 1920, la larghezza delle foto dell'owner. */
  await page.setViewportSize({ width: 1440, height: 900 });
  await dueFotogrammi(page); await dueFotogrammi(page);
  const media = await page.evaluate(leggiBarra);
  expect(Number(media.scala), 'a 1440 al più cede «Terminale»').toBeLessThanOrEqual(1);
  expect(media.permesso.ceduta, 'il permesso resta intero a 1440').toBe(false);
  expect(media.permesso.tagliata || media.terminale.tagliata || media.modello.tagliata).toBe(false);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await dueFotogrammi(page); await dueFotogrammi(page);
  const larga = await page.evaluate(leggiBarra);
  expect(larga.scala, 'tornato largo, la scala torna a zero da sé').toBe('0');
  expect(larga.terminale.ceduta).toBe(false);
  expect(c.nonGet).toBe(0);
});
