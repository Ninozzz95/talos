import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BC-80, 17/09/2026 — IL RIASSUNTO DELLA REVISIONE SI DEVE LEGGERE.
 *
 * Nato dal «non curato» che ho dichiarato chiudendo BC-71 (b): dopo quella cura il riassunto era
 * giusto — uno scrittore solo, una regola di conteggio sola — e INVISIBILE. Misurato allora: la
 * testata della Revisione è larga **748 px** a 1024×800 e non di più a 1440×900, e sotto i 900 px
 * di contenitore `.talos-topbar__path` è `display:none`.
 *
 * Decisione dell'owner (17/09, «approvo»): nella testata non cede niente; il riassunto prende posto
 * dentro il pannello, in fondo alla riga delle linguette, a destra, sempre visibile.
 *
 * ⛔ Qui si misura il RETTANGOLO, non la presenza nel DOM: è esattamente la differenza che ha fatto
 *   nascere questa riga. Un nodo con il testo giusto e `display:none` passerebbe una prova scritta
 *   sul `textContent`, ed è ciò che è successo.
 */

test.use({ locale: 'it-IT' });

async function apriConFile(page, { larghezza, altezza, tema, quantiFile }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/bc80-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(async (quanti) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc80-uno', 'workspace', 'BC80', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    let seq = 8000;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: seq += 1, input: { consegna: 'Scrivi qualche file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
    window.__bc80Scrivi = (percorso, prima, dopo) => {
      r.handleRealEvent({ type: 'StateDelta', _sequenza: seq += 1, delta: [{ op: prima === null ? 'add' : 'replace', path: `/file/${percorso}`, value: dopo, ...(prima === null ? {} : { prima }) }] }, g);
    };
    for (let i = 1; i <= quanti; i += 1) window.__bc80Scrivi(`src/file-${i}.mjs`, 'riga uno\nriga vecchia\n', 'riga uno\nriga due\nriga tre\n');
    r.executeCommand('review');
    await new Promise((x) => requestAnimationFrame(x));
  }, quantiFile);
  await page.waitForTimeout(300);
}

const MISURA = `(() => {
  const nodo = document.querySelector('#schermoReview [data-review-sommario]');
  if (!nodo) return { esiste: false };
  const r = nodo.getBoundingClientRect();
  const s = getComputedStyle(nodo);
  const lista = document.querySelector('#schermoReview .talos-schede__lista');
  const rl = lista?.getBoundingClientRect();
  return {
    esiste: true,
    testo: nodo.textContent.trim(),
    nascosto: nodo.hidden,
    /* «Si LEGGE» vuol dire: rettangolo vero, dentro la finestra, non trasparente, non coperto dalla
       striscia che scorre. Ognuna di queste è già stata la causa di un riassunto invisibile. */
    rett: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    display: s.display,
    opacita: Number(s.opacity),
    dentroLaFinestra: r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    /* ⛔ E il nodo non deve stare DENTRO la lista delle linguette: là ci vanno solo le schede. */
    dentroAlTablist: Boolean(nodo.closest('[role=tablist]')),
    aDestraDelleLinguette: rl ? Math.round(r.left) >= Math.round(rl.right) - 1 : null,
  };
})()`;

for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
  for (const tema of ['dark', 'light']) {
    test(`BC80 (${larghezza}x${altezza}, ${tema}) — con due file scritti il riassunto si legge`, async ({ page }) => {
      await apriConFile(page, { larghezza, altezza, tema, quantiFile: 2 });
      const m = await page.evaluate(MISURA);
      console.log(`MISURA-BC80 ${larghezza}x${altezza} ${tema} = ${JSON.stringify(m)}`);
      expect(m.esiste, 'la scena non si è formata: il nodo del riassunto non c’è').toBe(true);
      expect(m.testo, 'il riassunto dice quanti file e quante righe').toMatch(/^\d+ file modificat[oi] · \+\d+ −\d+$/u);
      expect(m.nascosto, 'con due file non è nascosto').toBe(false);
      expect(m.display, 'e non è spento dal CSS, che è come era sparito dalla testata').not.toBe('none');
      expect(m.opacita, 'e non è trasparente').toBeGreaterThan(0.5);
      expect(m.rett.w, 'ha una larghezza vera').toBeGreaterThan(40);
      expect(m.dentroLaFinestra, `il rettangolo esce dalla finestra: ${JSON.stringify(m.rett)}`).toBe(true);
      expect(m.dentroAlTablist, 'sta fuori dalla lista delle linguette (APG: lì dentro solo schede)').toBe(false);
      expect(m.aDestraDelleLinguette, 'e sta in fondo alla riga, a destra').toBe(true);
    });
  }
}

test('BC80 — si aggiorna al terzo file senza ricaricare, e sparisce quando non c’è più niente', async ({ page }) => {
  await apriConFile(page, { larghezza: 1440, altezza: 900, tema: 'dark', quantiFile: 2 });
  const due = await page.evaluate(MISURA);
  await page.evaluate(async () => {
    window.__bc80Scrivi('src/file-3.mjs', null, 'a\nb\nc\nd\n');
    await new Promise((x) => requestAnimationFrame(x));
  });
  await page.waitForTimeout(200);
  const tre = await page.evaluate(MISURA);
  console.log(`MISURA-BC80-TERZO = ${JSON.stringify({ due: due.testo, tre: tre.testo })}`);
  expect(due.testo).toContain('2 file modificati');
  expect(tre.testo, 'il terzo file cambia il riassunto senza ricaricare la pagina').toContain('3 file modificati');
  expect(tre.testo, 'e le righe aggiunte crescono con lui').not.toBe(due.testo);

  /* AL CONTRARIO: una sessione senza scritture non lascia appeso il riassunto di quella prima. */
  await page.evaluate(async () => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc80-vuota', 'workspace', 'Senza scritture', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
    r.executeCommand('review');
    await new Promise((x) => requestAnimationFrame(x));
  });
  await page.waitForTimeout(250);
  const vuoto = await page.evaluate(MISURA);
  console.log(`MISURA-BC80-VUOTO = ${JSON.stringify(vuoto)}`);
  expect(vuoto.testo, 'a zero file non si scrive niente').toBe('');
  expect(vuoto.nascosto, 'e il posto non resta occupato da uno spazio vuoto').toBe(true);
});

test('BC80 — con dodici linguette scorre la striscia, il riassunto resta', async ({ page }) => {
  await apriConFile(page, { larghezza: 1024, altezza: 800, tema: 'dark', quantiFile: 12 });
  const m = await page.evaluate(MISURA);
  const striscia = await page.evaluate(() => {
    const lista = document.querySelector('#schermoReview .talos-schede__lista');
    return { scorre: lista.scrollWidth > lista.clientWidth + 1, linguette: lista.querySelectorAll('[role=tab]').length };
  });
  console.log(`MISURA-BC80-DODICI = ${JSON.stringify({ ...m, ...striscia })}`);
  /* Le PREMESSE: dodici file, e la striscia che davvero non ci sta. Senza, questa prova misurerebbe
     una riga comoda e il vincolo della scheda resterebbe non verificato. */
  expect(striscia.linguette, 'la scena non si è formata: non ci sono dodici linguette').toBe(12);
  expect(striscia.scorre, 'la scena non si è formata: la striscia non ha bisogno di scorrere').toBe(true);
  expect(m.nascosto, 'il riassunto è ancora acceso').toBe(false);
  expect(m.dentroLaFinestra, `il riassunto è stato spinto fuori dalle linguette: ${JSON.stringify(m.rett)}`).toBe(true);
  expect(m.rett.w, 'e non è stato schiacciato a niente').toBeGreaterThan(40);
});
