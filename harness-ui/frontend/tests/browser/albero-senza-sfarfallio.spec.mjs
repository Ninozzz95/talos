import { test, expect } from '@playwright/test';

/*
 * Owner 28/10/2026: «la tab file a destra flickera come se si aggiornasse ogni tot».
 * Misurato sul 4174 con una sonda in sola lettura (GET soli, WebSocket chiusi): una conversazione sulla cartella Desktop, un file
 * scritto e cancellato ogni 2 s DENTRO una cartella chiusa ⇒ 1.896 mutazioni del DOM in 34 s, la lista dell'albero rifatta da capo
 * ogni secondo. Due cause in `legacy/app.js`: `WorkspaceChanged` buttava TUTTA la cache dei livelli e ridisegnava, e il disegno
 * metteva a schermo una lista VUOTA prima di riempirla (la riga sparisce e ricompare: lo sfarfallio).
 * Come VS Code (`explorerService.ts`, letto il 28/10/2026): i cambiamenti si raccolgono per 500 ms, e si reagisce solo a ciò che
 * tocca un elemento visibile e già letto. Qui si prova che cosa vede la persona: nessuna mutazione quando non cambia niente a
 * schermo, nessun fotogramma con l'albero vuoto quando cambia, fuoco, selezione e scorrimento che restano dove erano.
 * Le richieste dell'albero si rispondono qui (fulfill) da un disco finto; ogni non-GET si ferma e si conta.
 */
const SESSIONE = 'albero-sfarfallio';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;
const busta = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });
const bustaErrore = (status, code, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code, message, title: message }, meta: { schema: 'talos.api.v1' } }) });
const cartella = (nome) => ({ nome, cartella: true });
const file = (nome) => ({ nome, cartella: false });

function discoFinto(radice = [cartella('logs'), cartella('src'), file('README.md')]) {
  return {
    livelli: new Map([
      ['', radice],
      ['logs', [file('app.log')]],
      ['src', [cartella('deep'), file('app.js')]],
      ['src/deep', [file('uno.js')]],
    ]),
    letture: [],
  };
}

async function preparaPagina(page, { disco = discoFinto(), altezza = 900 } = {}) {
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: 1440, height: altezza });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    if (p.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (p === `/api/v1/sessions/${SESSIONE}/tree`) {
      const percorso = url.searchParams.get('percorso') ?? '';
      disco.letture.push(percorso);
      // una lettura si può TRATTENERE: la prova decide quando arriva (un ridisegno resta «in volo» intanto)
      if (disco.trattieni?.percorso === percorso) await disco.trattieni.promessa;
      const voci = disco.livelli.get(percorso);
      return route.fulfill(voci ? busta({ voci: voci.map((v) => ({ ...v })) }) : bustaErrore(400, 'QUERY_INVALID', 'Query non valida'));
    }
    if (p.startsWith(`/api/v1/sessions/${SESSIONE}/git/`)) return route.fulfill(bustaErrore(409, 'GIT_NOT_A_REPOSITORY', 'Questa cartella non è un repository git'));
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Albero', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate(() => { if (document.querySelector('#app')?.classList.contains('inspector-collapsed')) document.querySelector('[data-azione="dettagli"]')?.click(); });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect(nodo(page, 'README.md')).toBeVisible();
  return { contatore, disco };
}

const nodo = (page, percorso) => page.locator(`#alberoFile .ft-node[data-percorso="${percorso}"]`);
const apri = async (page, percorso, figlio) => {
  await nodo(page, percorso).locator(':scope > .ft-row').click();
  await expect(nodo(page, figlio)).toBeVisible();
};
const eventoVivo = (page, evento) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, evento);
const lettureDi = (disco, percorso) => disco.letture.filter((l) => l === percorso).length;

/** Da qui in poi si conta ciò che cambia nell'albero: le mutazioni, e il numero più basso di righe visto in un fotogramma. */
async function osservaAlbero(page) {
  await page.evaluate(() => {
    const c = document.querySelector('#alberoFile');
    const conta = () => c.querySelectorAll('.ft-node').length;
    const reg = { mutazioni: 0, minimo: conta(), fotogrammi: 0, fermo: false };
    window.__albero = reg;
    new MutationObserver((lista) => { reg.mutazioni += lista.length; reg.minimo = Math.min(reg.minimo, conta()); })
      .observe(c, { subtree: true, childList: true, attributes: true, characterData: true });
    const giro = () => { reg.minimo = Math.min(reg.minimo, conta()); reg.fotogrammi += 1; if (!reg.fermo) requestAnimationFrame(giro); };
    requestAnimationFrame(giro);
  });
}
const registro = (page) => page.evaluate(() => ({ ...window.__albero }));

test('FILE-SFARFALLIO-01 — il caso dell\'owner: un file cambia ogni 250 ms dentro una cartella mai aperta ⇒ zero mutazioni, la cartella non si legge', async ({ page }) => {
  const { contatore, disco } = await preparaPagina(page);
  await apri(page, 'src', 'src/app.js');
  await page.waitForTimeout(300);
  const primaRadice = lettureDi(disco, '');
  await osservaAlbero(page);
  for (let i = 0; i < 6; i += 1) {
    // Windows segnala anche la cartella stessa quando un suo figlio nasce o muore
    await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['logs/app.log', 'logs'], _sequenza: 50_000 + i });
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1000);
  const reg = await registro(page);
  expect(reg.mutazioni, 'niente a schermo è cambiato: nessuna mutazione dell\'albero').toBe(0);
  expect(lettureDi(disco, 'logs'), 'una cartella mai aperta non si legge').toBe(0);
  const radice = lettureDi(disco, '') - primaRadice;
  expect(radice, 'la riga «logs» è nella radice: la radice si ricontrolla').toBeGreaterThanOrEqual(1);
  expect(radice, 'una volta per finestra di 500 ms, non una per evento').toBeLessThanOrEqual(4);
  expect(contatore.nonGet).toBe(0);
});

test('FILE-SFARFALLIO-02 — una cartella letta e poi chiusa non si rilegge mentre è chiusa; riaprendola mostra il file nuovo', async ({ page }) => {
  const { disco } = await preparaPagina(page);
  await apri(page, 'logs', 'logs/app.log');
  await nodo(page, 'logs').locator(':scope > .ft-row').click();
  await expect(nodo(page, 'logs/app.log')).toBeHidden();
  const prima = lettureDi(disco, 'logs');
  await osservaAlbero(page);
  disco.livelli.set('logs', [file('app.log'), file('nuovo.log')]);
  for (let i = 0; i < 4; i += 1) {
    await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['logs/nuovo.log'], _sequenza: 51_000 + i });
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(800);
  expect(lettureDi(disco, 'logs') - prima, 'chiusa: nessuno la guarda, non si legge').toBe(0);
  expect((await registro(page)).mutazioni, 'e a schermo non cambia niente').toBe(0);
  await nodo(page, 'logs').locator(':scope > .ft-row').click();
  await expect(nodo(page, 'logs/nuovo.log'), 'riaperta, è aggiornata').toBeVisible();
  expect(lettureDi(disco, 'logs') - prima).toBe(1);
});

test('FILE-SFARFALLIO-03 — al contrario, più in fondo: una cartella aperta dentro una chiusa si aggiorna quando la madre si riapre', async ({ page }) => {
  const { disco } = await preparaPagina(page);
  await apri(page, 'src', 'src/deep');
  await apri(page, 'src/deep', 'src/deep/uno.js');
  await nodo(page, 'src').locator(':scope > .ft-row').click();
  await expect(nodo(page, 'src/deep/uno.js')).toBeHidden();
  const prima = lettureDi(disco, 'src/deep');
  disco.livelli.set('src/deep', [file('uno.js'), file('due.js')]);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/deep/due.js'], _sequenza: 52_000 });
  await page.waitForTimeout(900);
  expect(lettureDi(disco, 'src/deep') - prima, 'nascosta dalla madre chiusa: non si legge').toBe(0);
  await nodo(page, 'src').locator(':scope > .ft-row').click();
  await expect(nodo(page, 'src/deep/due.js'), 'la madre riaperta mostra la figlia aggiornata').toBeVisible();
  await expect(nodo(page, 'src/deep/uno.js')).toBeVisible();
});

test('FILE-SFARFALLIO-04 — un file a vista cambiato DENTRO (stesso elenco): una lettura del suo livello per raffica, zero mutazioni', async ({ page }) => {
  const { disco } = await preparaPagina(page);
  await page.waitForTimeout(300);
  const prima = lettureDi(disco, '');
  await osservaAlbero(page);
  for (let i = 0; i < 5; i += 1) await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['README.md'], _sequenza: 53_000 + i });
  await page.waitForTimeout(1200);
  expect(lettureDi(disco, '') - prima, 'cinque eventi di fila, un controllo solo').toBe(1);
  expect((await registro(page)).mutazioni, 'l\'elenco è lo stesso: l\'albero non si tocca').toBe(0);
});

test('FILE-SFARFALLIO-05 — un file nuovo in una cartella aperta compare, e in nessun fotogramma l\'albero si svuota', async ({ page }) => {
  const { disco } = await preparaPagina(page);
  await apri(page, 'src', 'src/app.js');
  await page.waitForTimeout(300);
  const righe = await page.locator('#alberoFile .ft-node').count();
  const prima = lettureDi(disco, 'src');
  await osservaAlbero(page);
  disco.livelli.set('src', [cartella('deep'), file('app.js'), file('nuovo.ts')]);
  for (let i = 0; i < 5; i += 1) await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/nuovo.ts', 'src'], _sequenza: 54_000 + i });
  await expect(nodo(page, 'src/nuovo.ts')).toBeVisible();
  await page.waitForTimeout(300);
  const reg = await registro(page);
  expect(reg.fotogrammi, 'la sonda dei fotogrammi ha girato davvero').toBeGreaterThan(5);
  expect(reg.minimo, `mai meno righe di prima (${righe}) in un fotogramma`).toBeGreaterThanOrEqual(righe);
  expect(lettureDi(disco, 'src') - prima, 'una raffica, una lettura della cartella').toBe(1);
});

test('FILE-SFARFALLIO-06 — dopo un cambiamento vero, fuoco, riga scelta e scorrimento restano dove erano', async ({ page }) => {
  const molti = Array.from({ length: 60 }, (_, i) => file(`f-${String(i).padStart(2, '0')}.md`));
  const { disco } = await preparaPagina(page, { disco: discoFinto([cartella('src'), file('README.md'), ...molti]), altezza: 700 });
  const riga = nodo(page, 'f-30.md').locator(':scope > .ft-row');
  await riga.scrollIntoViewIfNeeded();
  await riga.click();
  await expect(riga).toBeFocused();
  const scorrimento = await page.evaluate(() => {
    let n = document.querySelector('#alberoFile');
    while (n && !(n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))) n = n.parentElement;
    window.__scorrevole = n;
    return n ? n.scrollTop : null;
  });
  expect(scorrimento, 'l\'albero deve scorrere, o la prova dello scorrimento non dice niente').toBeGreaterThan(0);
  disco.livelli.set('', [...disco.livelli.get(''), file('zz-nuovo.md')]);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['zz-nuovo.md'], _sequenza: 55_000 });
  await expect(nodo(page, 'zz-nuovo.md')).toHaveCount(1);
  await page.waitForTimeout(200);
  const dopo = await page.evaluate(() => ({
    fuoco: document.activeElement?.closest?.('.ft-node')?.dataset.percorso ?? document.activeElement?.tagName,
    eRiga: document.activeElement?.classList?.contains('ft-row') ?? false,
    scelta: [...document.querySelectorAll('#alberoFile .ft-row.ft-selected')].map((r) => r.closest('.ft-node').dataset.percorso),
    scorrimento: window.__scorrevole.scrollTop,
  }));
  expect(dopo.fuoco, 'il fuoco resta sulla stessa riga').toBe('f-30.md');
  expect(dopo.eRiga).toBe(true);
  expect(dopo.scelta, 'la riga scelta resta scelta').toEqual(['f-30.md']);
  expect(Math.abs(dopo.scorrimento - scorrimento), 'lo scorrimento non salta').toBeLessThanOrEqual(1);
});

test('FILE-SFARFALLIO-07 — mentre la persona rinomina una riga l\'albero non si ridisegna; finito, il file nuovo compare', async ({ page }) => {
  const { disco, contatore } = await preparaPagina(page);
  await nodo(page, 'README.md').locator(':scope > .ft-row').click();
  await page.keyboard.press('F2');
  const campo = nodo(page, 'README.md').locator('.ft-rename');
  await expect(campo).toBeFocused();
  await campo.fill('LEGGIMI');
  disco.livelli.set('', [...disco.livelli.get(''), file('nuovo.md')]);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['nuovo.md'], _sequenza: 56_000 });
  await page.waitForTimeout(1300);
  await expect(campo, 'il campo della rinomina non sparisce sotto le dita').toBeFocused();
  await expect(campo).toHaveValue('LEGGIMI');
  await expect(nodo(page, 'nuovo.md')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(nodo(page, 'nuovo.md'), 'finita la rinomina, il ridisegno rimasto in sospeso arriva').toBeVisible({ timeout: 3000 });
  expect(contatore.nonGet, 'Esc non rinomina niente').toBe(0);
});

test('FILE-SFARFALLIO-09 — una cartella portata via si porta via anche ciò che era letto sotto di lei: se torna, si rilegge', async ({ page }) => {
  const disco = discoFinto();
  disco.livelli.set('src/deep', [cartella('a'), file('uno.js')]);
  disco.livelli.set('src/deep/a', [file('vecchio.txt')]);
  await preparaPagina(page, { disco });
  await apri(page, 'src', 'src/deep');
  await apri(page, 'src/deep', 'src/deep/a');
  await apri(page, 'src/deep/a', 'src/deep/a/vecchio.txt');
  // la cartella se ne va (spostata fuori): il watcher dice solo il suo nome
  disco.livelli.set('src', [file('app.js')]);
  disco.livelli.delete('src/deep');
  disco.livelli.delete('src/deep/a');
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/deep'], _sequenza: 58_000 });
  await expect(nodo(page, 'src/deep')).toHaveCount(0);
  // e torna, con un altro contenuto: le cartelle restano aperte come le aveva lasciate la persona, e si leggono fresche
  disco.livelli.set('src', [cartella('deep'), file('app.js')]);
  disco.livelli.set('src/deep', [cartella('a')]);
  disco.livelli.set('src/deep/a', [file('nuovo.txt')]);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/deep'], _sequenza: 58_001 });
  await expect(nodo(page, 'src/deep/a/nuovo.txt')).toBeVisible();
  await expect(nodo(page, 'src/deep/a/vecchio.txt'), 'mai il contenuto di prima').toHaveCount(0);
});

test('FILE-SFARFALLIO-10 — una cartella aperta col clic MENTRE il ridisegno si costruisce fuori schermo resta aperta dopo lo scambio', async ({ page }) => {
  const { disco } = await preparaPagina(page);
  await apri(page, 'src', 'src/app.js');
  // a scheda chiusa cambia «src»: la sua lettura si dimentica, e la riapertura la rilegge — la tratteniamo per tenere il ridisegno in volo
  await page.locator('#railTabs [data-rail="github"]').click();
  disco.livelli.set('src', [cartella('deep'), file('app.js'), file('nuovo.ts')]);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/nuovo.ts'], _sequenza: 59_000 });
  await page.waitForTimeout(800);
  let sciogli = () => {};
  disco.trattieni = { percorso: 'src', promessa: new Promise((ok) => { sciogli = ok; }) };
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect.poll(() => lettureDi(disco, 'src') >= 2, { message: 'il ridisegno sta aspettando «src»' }).toBe(true);
  await nodo(page, 'logs').locator(':scope > .ft-row').click(); // sull'albero ancora a schermo
  await expect(nodo(page, 'logs/app.log')).toBeVisible();
  disco.trattieni = null;
  sciogli();
  await expect(nodo(page, 'src/nuovo.ts')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(nodo(page, 'logs/app.log'), 'la cartella aperta durante il ridisegno resta aperta').toBeVisible();
  await expect(nodo(page, 'logs')).toHaveAttribute('aria-expanded', 'true');
});

test('FILE-SFARFALLIO-08 — a scheda File chiusa non si legge niente; riaprendola il file nuovo c\'è (BC-42)', async ({ page }) => {
  const { disco } = await preparaPagina(page);
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railFile')).toBeHidden();
  const prima = disco.letture.length;
  disco.livelli.set('', [...disco.livelli.get(''), file('nuovo.md')]);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['nuovo.md'], _sequenza: 57_000 });
  await page.waitForTimeout(1000);
  expect(disco.letture.length - prima, 'nessuno guarda l\'albero: nessuna lettura').toBe(0);
  await page.locator('#railTabs [data-rail="file"]').click();
  await expect(nodo(page, 'nuovo.md')).toBeVisible();
});
