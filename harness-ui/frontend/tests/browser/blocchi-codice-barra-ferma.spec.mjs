import { test, expect } from '@playwright/test';

/*
 * ⭐ 23/10/2026 sera (owner, bozzetto approvato: «come fa ChatGPT e Claude») — SUL CODICE LUNGO LA BARRA RESTA FERMA IN CIMA ALLA
 *   CHAT, con «Copia» e «⋯» (Esporta: file del linguaggio, Markdown, testo; Comprimi sopra le 40 righe). Provato dal vivo col piano
 *   ChatGPT (luna 6) sul 4174 attraverso uno specchio in sola lettura; qui la stessa cosa su scene rigiocate dal server finto (ogni
 *   richiesta non-GET si ferma e si conta).
 * ⛔ Il difetto trovato dal vivo e tenuto fermo qui: con `scroll-padding-top` sulla chat la barra ferma stava nella fascia riservata e
 *   il fuoco su «Copia» o «⋯» (Tab, Maiusc+Tab, focus da script) faceva saltare la chat di 411-822 px.
 */
const MODELLO = 'prova/modello-senza-catalogo';
const RIGHE = 150;
const CODICE = Array.from({ length: RIGHE }, (_, i) => `def passo_${i}(x):\n    return x * ${i}`).slice(0, RIGHE).join('\n');
const TESTO = `Ecco lo script:\n\n\`\`\`python demo.py\n${CODICE}\n\`\`\`\n\nFine della risposta.`;
const giro = (id, { chiuso = true } = {}) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${id}`, input: { consegna: 'Scrivi uno script lungo' } },
  { type: 'TextMessageStart', messageId: `m-${id}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m-${id}`, delta: chiuso ? TESTO : TESTO.slice(0, TESTO.indexOf('def passo_120')) },
  ...(chiuso ? [{ type: 'TextMessageEnd', messageId: `m-${id}` }, { type: 'RunFinished', threadId: 't', runId: `r-${id}` }] : []),
].map((e, i) => ({ ...e, _sequenza: i + 1 }));
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };

async function apri(page, tema, sessione, eventi, { conclusa = true } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'en' } }));
  }, tema);
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const m = new URL(req.url()).pathname.match(/\/api\/v1\/sessions\/(blocchi-[a-z0-9-]+)\/(events|metrics)$/);
    if (m && m[1] === sessione) {
      if (m[2] === 'metrics') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(({ sessione, modello, conclusa }) => {
    window.__talosHarnessUiRuntime.passaASessione(sessione, 'workspace', 'Codice lungo', modello, { conclusa, modello });
  }, { sessione, modello: MODELLO, conclusa });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  await expect(page.locator('#conversation .code-block')).toHaveCount(1, { timeout: 10_000 });
  return contatore;
}

/** A metà blocco: la barra deve stare sul bordo alto della chat, e il blocco sopra di lei. */
const aMeta = (page) => page.evaluate(async () => {
  const conv = document.querySelector('.talos-conversation');
  const b = conv.querySelector('.code-block');
  conv.scrollTop += b.getBoundingClientRect().top - conv.getBoundingClientRect().top + 900;
  await new Promise((ok) => setTimeout(ok, 200));
  const c = conv.getBoundingClientRect(); const t = b.querySelector('.code-block-head').getBoundingClientRect();
  /* 27/10/2026 (owner, «come Hermes»): la domanda della persona resta ferma in cima mentre si legge la risposta
     (`domanda-appiccicata.js`), e la barra del codice si ferma SOTTO la sua fascia, non dietro. Il «bordo alto» per la barra è
     quindi il fondo della fascia, se una domanda è ferma; il bordo dello scorrevole se non c'è. */
  const q = document.querySelector('#conversation > .talos-turn[data-domanda-corrente]');
  const fascia = q && getComputedStyle(q).position === 'sticky' && q.getBoundingClientRect().top < c.top
    ? q.getBoundingClientRect().top + (parseFloat(q.style.getPropertyValue('--talos-domanda-vista')) || 0) : null;
  return { scrollTop: conv.scrollTop, convTop: fascia ?? c.top, bordoScorrevole: c.top, testaTop: t.top, bloccoTop: b.getBoundingClientRect().top, fascia };
});
const scorrimento = (page) => page.evaluate(() => document.querySelector('.talos-conversation').scrollTop);

for (const tema of ['dark', 'light']) {
  test(`BLOCCHI-BARRA-01 (${tema}) — la barra resta ferma in cima mentre si scorre il codice; il fuoco col Tab su «⋯» e «Copia» NON fa saltare la chat`, async ({ page }) => {
    const c = await apri(page, tema, `blocchi-a-${tema}`, giro('a'));
    const m = await aMeta(page);
    expect(m.bloccoTop, 'premessa: il blocco è salito sopra la chat').toBeLessThan(m.bordoScorrevole);
    expect(m.fascia, 'premessa (27/10): la domanda del giro è ferma in cima').not.toBeNull();
    expect(Math.abs(m.testaTop - m.convTop), 'la barra sta sul bordo alto della chat, sotto la domanda ferma').toBeLessThanOrEqual(1);
    /* AL CONTRARIO del difetto trovato dal vivo: Maiusc+Tab dal codice al «⋯», poi a «Copia» — la chat non si muove */
    await page.evaluate(() => document.querySelector('.talos-conversation .code-block pre').focus({ preventScroll: true }));
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.talos-conversation .code-block-more')).toBeFocused();
    expect(await scorrimento(page), 'il fuoco sul «⋯» non fa scorrere').toBe(m.scrollTop);
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.talos-conversation .code-block-copy')).toBeFocused();
    expect(await scorrimento(page), 'il fuoco su «Copia» non fa scorrere').toBe(m.scrollTop);
    expect(c.nonGet).toBe(0);
  });

  test(`BLOCCHI-BARRA-02 (${tema}) — il «⋯»: tre scaricamenti e Comprimi; il file del linguaggio prende il nome dalla riga d'apertura e il testo grezzo; Esc rende il fuoco`, async ({ page }) => {
    const c = await apri(page, tema, `blocchi-b-${tema}`, giro('b'));
    await aMeta(page);
    const altro = page.locator('.talos-conversation .code-block-more');
    await altro.click();
    const menu = page.locator('#menuBloccoCodice');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.talos-context-menu__title')).toHaveText(`Python code · ${RIGHE * 2} lines`);
    await expect(menu.locator('[role=menuitem]')).toHaveText(['Download as .py', 'Download as Markdown (.md)', 'Download as text (.txt)', 'Collapse']);
    await expect(altro).toHaveAttribute('aria-expanded', 'true');
    const [scarico] = await Promise.all([page.waitForEvent('download'), menu.locator('[role=menuitem]').first().click()]);
    expect(scarico.suggestedFilename()).toBe('demo.py');
    const percorso = await scarico.path();
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(percorso, 'utf8')).toBe(CODICE);
    /* Esc chiude e rende il fuoco al «⋯» */
    await altro.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(altro).toBeFocused();
    /* Comprimi, poi «Show all» lo riapre */
    await altro.click();
    await menu.locator('[role=menuitem]', { hasText: 'Collapse' }).click();
    await expect(page.locator('.talos-conversation .code-block')).toHaveClass(/code-block--compresso/);
    expect(await page.locator('.talos-conversation .code-block').evaluate((b) => b.getBoundingClientRect().height)).toBeLessThan(420);
    await page.locator('.code-block-espandi__pulsante').click();
    await expect(page.locator('.talos-conversation .code-block')).not.toHaveClass(/code-block--compresso/);
    expect(c.nonGet).toBe(0);
  });
}

test('BLOCCHI-BARRA-03 — mentre il blocco arriva «Copia» e «⋯» sono spenti e il tasto destro sulla barra non apre niente; la barra è ferma anche lì', async ({ page }) => {
  /* un giro VIVO (la sessione non è conclusa e il giro non è finito): il messaggio sta ancora arrivando. Un giro rimasto a metà in
     una sessione conclusa è invece una risposta troncata, e lì il blocco si accende (BLOCCHI-BARRA-05) */
  const c = await apri(page, 'dark', 'blocchi-c-dark', giro('c', { chiuso: false }), { conclusa: false });
  await expect(page.locator('.talos-conversation .code-block-more')).toBeDisabled();
  await expect(page.locator('.talos-conversation .code-block-copy')).toBeDisabled();
  const m = await aMeta(page);
  expect(Math.abs(m.testaTop - m.convTop)).toBeLessThanOrEqual(1);
  await page.locator('.talos-conversation .code-block-head').click({ button: 'right', position: { x: 120, y: 10 } });
  await expect(page.locator('#menuBloccoCodice')).toHaveCount(0);
  /* ⛔ revisione F3: «non apre niente» vuol dire NESSUN menu, nemmeno quello della risposta */
  await expect(page.locator('[role=menu]:visible')).toHaveCount(0);
  expect(c.nonGet).toBe(0);
});

test('BLOCCHI-BARRA-04 — revisione F1/F6-F10: il tasto destro sulla barra apre UN menu solo col fuoco dentro; frecce, Inizio, Fine, Tab; il tasto menu lo apre sotto il «⋯»; secondo clic e ridimensionamento chiudono; il fuoco dopo una voce', async ({ page }) => {
  const c = await apri(page, 'dark', 'blocchi-d-dark', giro('d'));
  await aMeta(page);
  const menu = page.locator('#menuBloccoCodice');
  const voci = menu.locator('[role=menuitem]');
  const altro = page.locator('.talos-conversation .code-block-more');
  /* F1: il tasto destro sulla barra non sale al messaggio — un menu solo, e il fuoco nel menu del codice (mai su «Ask again») */
  await page.locator('.talos-conversation .code-block-head').click({ button: 'right', position: { x: 120, y: 10 } });
  await expect(page.locator('[role=menu]:visible')).toHaveCount(1);
  await expect(menu).toBeVisible();
  await expect(voci.first()).toBeFocused();
  /* F8: il modello ARIA del menu */
  await page.keyboard.press('ArrowDown');
  await expect(voci.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(voci.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(voci.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(voci.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toBeHidden();
  await expect(page.locator('[role=menu]:visible')).toHaveCount(0);
  await expect(page.locator('.talos-conversation .code-block pre')).toBeFocused();
  /* F7: il tasto menu col fuoco sul «⋯» apre sotto il «⋯», allineato al suo bordo destro */
  await altro.focus();
  await page.keyboard.press('ContextMenu');
  await expect(menu).toBeVisible();
  const [r, m] = await Promise.all([altro.boundingBox(), menu.boundingBox()]);
  expect(Math.abs((m.x + m.width) - (r.x + r.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(m.y - (r.y + r.height + 6))).toBeLessThanOrEqual(2);
  await page.keyboard.press('Escape');
  /* F10: il secondo clic sullo stesso «⋯» chiude; ridimensionare chiude */
  await altro.click();
  await expect(menu).toBeVisible();
  await altro.click();
  await expect(menu).toBeHidden();
  await altro.click();
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 1900, height: 1080 });
  await expect(menu).toBeHidden();
  await page.setViewportSize({ width: 1920, height: 1080 });
  /* F9: il nome del menu si riscrive a ogni apertura */
  await page.evaluate(() => document.getElementById('menuBloccoCodice').setAttribute('aria-label', 'vecchio'));
  await altro.click();
  await expect(menu).toHaveAttribute('aria-label', 'Code actions');
  /* F6: dopo uno scaricamento il fuoco torna sul «⋯» */
  await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  await expect(altro).toBeFocused();
  /* F6 e F10: «Comprimi» da metà blocco riporta il blocco in vista e mette il fuoco su «Show all» */
  await aMeta(page);
  await altro.click();
  await voci.filter({ hasText: 'Collapse' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.code-block-espandi__pulsante')).toBeFocused();
  const vista = await page.evaluate(() => {
    const conv = document.querySelector('.talos-conversation').getBoundingClientRect();
    const b = document.querySelector('.talos-conversation .code-block').getBoundingClientRect();
    return { convTop: conv.top, convBottom: conv.bottom, top: b.top, bottom: b.bottom };
  });
  expect(vista.top).toBeGreaterThanOrEqual(vista.convTop - 1);
  expect(vista.bottom).toBeLessThanOrEqual(vista.convBottom + 1);
  expect(c.nonGet).toBe(0);
});

test('BLOCCHI-BARRA-05 — revisione F12: una risposta FINITA col recinto mai chiuso (troncata) accende «Copia» e «⋯»: non arriva più niente', async ({ page }) => {
  const troncato = [
    { type: 'RunStarted', threadId: 't', runId: 'r-e', input: { consegna: 'Scrivi uno script lungo' } },
    { type: 'TextMessageStart', messageId: 'm-e', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'm-e', delta: TESTO.slice(0, TESTO.indexOf('def passo_120')) },
    { type: 'TextMessageEnd', messageId: 'm-e' },
    { type: 'RunFinished', threadId: 't', runId: 'r-e' },
  ].map((e, i) => ({ ...e, _sequenza: i + 1 }));
  const c = await apri(page, 'dark', 'blocchi-e-dark', troncato);
  await expect(page.locator('.talos-conversation .code-block-copy')).toBeEnabled();
  await expect(page.locator('.talos-conversation .code-block-copy')).toHaveText('Copy');
  await expect(page.locator('.talos-conversation .code-block-more')).toBeEnabled();
  expect(c.nonGet).toBe(0);
});

test('BLOCCHI-BARRA-06 — revisione F12 dal vivo: il blocco arriva col recinto aperto, poi il messaggio finisce senza chiuderlo: «Copia» e «⋯» si accendono sul posto', async ({ page }) => {
  const c = await apri(page, 'dark', 'blocchi-f-dark', giro('f', { chiuso: false }), { conclusa: false });
  await expect(page.locator('.talos-conversation .code-block-copy')).toBeDisabled();
  const blocco = await page.locator('.talos-conversation .code-block').elementHandle();
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'TextMessageEnd', messageId: 'm-f', _sequenza: 4 }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunFinished', threadId: 't', runId: 'r-f', _sequenza: 5 }, r.realSessionState.generation);
  });
  await expect(page.locator('.talos-conversation .code-block-copy')).toBeEnabled();
  await expect(page.locator('.talos-conversation .code-block-copy')).toHaveText('Copy');
  await expect(page.locator('.talos-conversation .code-block-more')).toBeEnabled();
  /* sul posto: lo stesso blocco, non uno ridisegnato */
  expect(await blocco.evaluate((b) => b.isConnected)).toBe(true);
  expect(c.nonGet).toBe(0);
});
