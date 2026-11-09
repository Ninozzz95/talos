/*
 * PANNELLO DI DESTRA v2 — la scheda CONTESTO nell'app vera (MAPPA §0.3 e §3.3). Scene rigiocate dal browser con la forma degli eventi
 * veri (`consumo-fornitore`, `talos.compattazione`, `talos.contesto-richiesta`); ogni richiesta che non legge si ferma e si conta.
 * Casi: storia nel tempo (C-05) col riassunto segnato e la sua parola (col modello / rapido), l'indice dei giri che porta al giro
 * (C-11) e che dice onestamente quando il giro non è a schermo, «Compatta ora» confermato nella testa (Annulla non scrive), le
 * righe di oggi delle card nelle due pieghe (niente perso), la card «Ambiente» che non c'è più (è in Git), 900×600 senza scorrere,
 * foto chiaro/scuro.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'pannello-contesto');
const MODELLO = 'prova/modello-contesto-v2';
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const consumo = (prompt) => ({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', provider: 'openrouter', model: MODELLO, usage: { prompt_tokens: prompt, completion_tokens: 400, total_tokens: prompt + 400 }, esito: 'completato' } });
const giro = (n, prompt) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${n}`, input: { consegna: `Passo numero ${n}` }, contesto: { branch: 'feat/x', worktree: 'wt', nonSalvate: 1, repoAnnidati: [] } },
  consumo(prompt),
  { type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: prompt, completion_tokens: 400, cached_tokens: 0, giri: 1 } }] },
  { type: 'TextMessageStart', messageId: `m-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m-${n}`, delta: `Fatto il passo ${n}.` },
  { type: 'TextMessageEnd', messageId: `m-${n}` },
  { type: 'RunFinished', threadId: 't', runId: `r-${n}` },
];
const RIASSUNTO = (ripiego) => ({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, motivo: 'soglia', at: '2026-10-29T09:00:00.000Z', tokenPrima: 140_000, tokenDopo: 22_000, coveredThrough: 4, ripiego, record: { at: '2026-10-29T09:00:00.000Z', riassunto: 'Riassunto di prova.', annullabile: false } } });
const RICHIESTA = { type: 'CUSTOM', name: 'talos.contesto-richiesta', value: { at: '2026-10-29T09:30:00.000Z', model: MODELLO, ripartizione: { categorie: [{ id: 'system', tokens: 4_200 }, { id: 'tools', tokens: 9_600 }, { id: 'mcp', tokens: 2_400 }, { id: 'conversation', tokens: 60_000 }] }, level1: { cleared: 3, shortened: 1 } } };
const CACHE = (motivo, tokenDaRileggere) => ({ type: 'CUSTOM', name: 'talos.cache-ricominciata', value: { schema: 'talos.cache-ricominciata.v1', threadId: 't', runId: 'r-2', giro: 1, motivo, tokenDaRileggere, at: '2026-10-29T09:31:00.000Z' } });
const numera = (ev) => ev.map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SCENE = {
  storia: (ripiego) => numera([...giro(1, 40_000), ...giro(2, 90_000), ...giro(3, 140_000), RIASSUNTO(ripiego), ...giro(4, 30_000), ...giro(5, 76_000), RICHIESTA]),
  vuota: () => numera([]),
  lunga: () => numera(Array.from({ length: 30 }, (_, i) => giro(i + 1, 20_000 + i * 1_000)).flat()),
  /* cache, punto 2 (owner 28/10): l'evento come lo scrive il server (`agent-service.mjs`, `talos.cache-ricominciata.v1`); il secondo vince */
  cache: () => numera([...giro(1, 40_000), CACHE('sistema', 39_000), ...giro(2, 90_000), CACHE('modello', 88_500), RICHIESTA]),
  cacheignota: () => numera([...giro(1, 40_000), CACHE('un-motivo-futuro', null)]),
  /* spesa dei riassunti (owner 30/10 sera, «Sì, così»): un riassunto col modello pagato 1.100 token (una riga consumo-di-servizio col suo
     id, come la scrive il server) e uno rapido senza modello, col suo id e nessuna riga ⇒ «nessun costo» */
  spesa: () => numera([...giro(1, 40_000), ...giro(2, 90_000), ...giro(3, 140_000),
    SERVIZIO('rias-000000000aaa-1', { prompt_tokens: 1_000, completion_tokens: 100 }),
    RIASSUNTO_CON_ID('rias-000000000aaa-1', false, '2026-10-29T09:00:00.000Z'),
    ...giro(4, 30_000), ...giro(5, 160_000),
    RIASSUNTO_CON_ID('rias-000000000aaa-2', true, '2026-10-29T09:20:00.000Z'),
    ...giro(6, 40_000), RICHIESTA]),
};
function SERVIZIO(idRiassunto, usage) {
  return { type: 'CUSTOM', name: 'consumo-di-servizio', value: { schema: 'talos.consumo-di-servizio.v1', scopo: 'riassunto', fonte: 'openrouter', modelloRemoto: MODELLO,
    usage, esito: 'completato', at: '2026-10-29T08:59:00.000Z', idRiassunto, inPrimoPiano: true } };
}
function RIASSUNTO_CON_ID(idRiassunto, ripiego, at) {
  const r = RIASSUNTO(ripiego);
  return { ...r, value: { ...r.value, at, idRiassunto, ...(ripiego ? { ragione: 'in-arrivo' } : {}), record: { ...r.value.record, at } } };
}

async function apri(page, { scena = 'storia', ripiego = false, tema = 'dark', larghezza = 1920, altezza = 1080, lingua = 'it' } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } })); } catch { /* */ }
  }, { colorMode: tema, uiLanguage: lingua });
  const conto = { nonGet: [], errori: [] };
  page.on('pageerror', (e) => conto.errori.push(e.message));
  const id = `pnctx-${scena}-a1`;
  const eventi = [...SCENE[scena](ripiego), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 999 }];
  await page.routeWebSocket(/.*/u, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (req.method() !== 'GET') { conto.nonGet.push(p); return route.abort(); }
    const m = p.match(/^\/api\/v1\/sessions\/(pnctx-[a-z]+-a1)\/([\w-]+)$/u);
    if (m) {
      /* la scena dall'id (`pnctx-<scena>-a1`): una prova può passare a un'altra chat nella stessa pagina (PNCTX-CACHE-03) */
      const scenaDellId = m[1].slice('pnctx-'.length, -'-a1'.length);
      const suoi = scenaDellId === scena || !SCENE[scenaDellId] ? eventi : [...SCENE[scenaDellId](false), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 999 }];
      if (m[2] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${suoi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (m[2] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
      if (m[2] === 'compaction-policy') return route.fulfill({ json: busta({ windowTokens: 200_000, triggerTokens: 150_000, warningTokens: 120_000, source: 'route-minimum' }) });
      if (m[2] === 'compaction-state') return route.fulfill({ json: busta({ record: { at: '2026-10-29T09:00:00.000Z', riassunto: 'Riassunto di prova.', indice: 'src/a.js' }, inCorso: false }) });
      if (m[2] === 'last-request') return route.fulfill({ json: busta({ ultimaRichiesta: null }) });
      if (m[2] === 'context') return route.fulfill({ status: 503, json: { ok: false, error: { code: 'CTX_NOT_ENABLED', message: 'off' }, meta: {} } });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(({ id, modello }) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Contesto v2', modello, { conclusa: true, modello }), { id, modello: MODELLO });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="contesto"]').click();
  await expect(page.locator('#railContesto .pn-testa')).toBeVisible();
  return conto;
}
const scheda = (page) => page.locator('#railContesto');

test('PNCTX-01 — il titolo sul limite che agisce, il grafico nel tempo con un punto per giro e il riassunto segnato', async ({ page }) => {
  const conto = await apri(page);
  await expect(scheda(page).locator('.pn-grande, .pn-testa h2, .pn-testa__titolo').first()).toContainText('%');
  const grafico = scheda(page).locator('svg[role="img"]').first();
  await expect(grafico).toHaveAttribute('aria-label', /5/u);
  await expect(grafico.locator('.pn-grafico__taglio')).toHaveCount(1);
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
});

test('PNCTX-02 — il riassunto dice «col modello», e un ripiego dice «rapido, senza modello» (mai l’uno al posto dell’altro)', async ({ page }) => {
  await apri(page);
  await expect(scheda(page).locator('[data-sezione="riassunti"]')).toContainText('col modello');
  await expect(scheda(page).locator('[data-sezione="riassunti"]')).not.toContainText('rapido');
  const pagina2 = await page.context().newPage();
  await apri(pagina2, { ripiego: true });
  await expect(scheda(pagina2).locator('[data-sezione="riassunti"]')).toContainText('rapido, senza modello');
  await pagina2.close();
});

test('PNCTX-03 — l’indice dei giri porta al giro (C-11): la chat scorre fino al numero; nessuna scrittura', async ({ page }) => {
  const conto = await apri(page, { scena: 'lunga', altezza: 700 });
  await scheda(page).locator('[data-controllo="piega-giri"]').click();
  const voce = scheda(page).locator('.pn-riga[data-chiave="giro-1"]');
  /* l'indice è a pagine, il più recente in cima: si sfoglia fino al primo giro */
  for (let i = 0; i < 60 && !(await voce.isVisible()); i += 1) await scheda(page).locator('[data-controllo="pagina-dopo-piega-giri"]').click();
  await expect(voce).toBeVisible();
  /* la chat porta a schermo il turno del giro scelto: si registra CHI viene portato in vista (la geometria della chat lunga dipende
     dalla finestra del rigioco; qui conta che il clic arrivi al turno giusto, col suo numero) */
  await page.evaluate(() => {
    window.__portati = [];
    const prima = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...a) { window.__portati.push(this.querySelector?.('.talos-turn-spine__n')?.textContent?.trim() ?? this.className); return prima.apply(this, a); };
  });
  await voce.click();
  await expect.poll(() => page.evaluate(() => window.__portati), { timeout: 3_000 }).toContain('1');
  expect(conto.nonGet).toEqual([]);
});

test('PNCTX-04 — «Compatta ora» chiede conferma nella testa; Annulla non scrive niente', async ({ page }) => {
  const conto = await apri(page);
  await scheda(page).locator('[data-controllo="menu-testa"]').click();
  await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: 'Compatta ora' }).click();
  const conferma = scheda(page).locator('.pn-conferma--testa');
  await expect(conferma).toBeVisible();
  await conferma.locator('[data-controllo="conferma-no"]').click();
  await expect(conferma).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(conto.nonGet).toEqual([]);
});

test('PNCTX-05 — niente perso: le righe di oggi delle card «Finestra del contesto» e «Compattazioni» nelle due pieghe, col perché del limite', async ({ page }) => {
  await apri(page);
  await scheda(page).locator('[data-controllo="piega-dettagli-finestra"]').click();
  const corpo = scheda(page).locator('.pn-piega:has([data-controllo="piega-dettagli-finestra"])');
  await expect(corpo.locator('.talos-kv')).not.toHaveCount(0);
  await expect(corpo.locator('[data-contesto-perche]')).toContainText('75%');
  await scheda(page).locator('[data-controllo="piega-dettagli-compattazioni"]').click();
  const comp = scheda(page).locator('.pn-piega:has([data-controllo="piega-dettagli-compattazioni"])');
  await expect(comp).toContainText('3 messe da parte · 1 accorciate');
  await expect(comp).toContainText('140k → 22k');
});

test('PNCTX-06 — la card «Ambiente» non è più nel Contesto (è in Git, «Dettagli del repository»)', async ({ page }) => {
  await apri(page);
  await expect(scheda(page).locator('[data-comprimibile="ambiente"]')).toHaveCount(0);
  await expect(scheda(page)).not.toContainText('Repo annidati');
});

test('PNCTX-07 — una conversazione senza misure: la frase onesta, nessun numero inventato', async ({ page }) => {
  await apri(page, { scena: 'vuota' });
  await expect(scheda(page).locator('.pn-vuoto')).toBeVisible();
  await expect(scheda(page).locator('.pn-testa__titolo'), 'il titolo non promette una percentuale').not.toContainText('%');
  await expect(scheda(page).locator('[data-c="TurnIndex"]'), 'senza giri, nessun indice vuoto').toHaveCount(0);
});

for (const [larghezza, altezza, tema] of [[1920, 1080, 'dark'], [1920, 1080, 'light'], [900, 600, 'dark'], [900, 600, 'light']]) {
  test(`PNCTX-FOTO ${larghezza}×${altezza} ${tema} — la colonna non scorre`, async ({ page }) => {
    await apri(page, { larghezza, altezza, tema });
    await page.waitForTimeout(500);
    const m = await scheda(page).evaluate((n) => ({ alto: n.scrollHeight, vista: n.clientHeight }));
    expect(m.alto, JSON.stringify(m)).toBeLessThanOrEqual(m.vista + 1);
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `contesto-${tema}-${larghezza}x${altezza}.png`) });
  });
}

/* ⭐ passo 7: l'anello della finestra sulla scheda Contesto, anche a scheda chiusa; il numero dice la percentuale nel titolo */
test('PNCTX-08 — l’anello sulla scheda Contesto segue la finestra, anche quando la scheda è chiusa', async ({ page }) => {
  await apri(page);
  await page.locator('#railTabs [data-rail="processi"]').click();
  const tab = page.locator('#railTabs [data-rail="contesto"]');
  await expect(tab.locator('.pn-contatore')).toHaveCount(1);
  await expect(tab).toHaveAttribute('aria-description', /%/u);
});

test('PNCTX-CACHE-01 — la cache ripartita da capo: l’ULTIMA, col perché, l’ora e i token riletti, nelle due lingue; senza evento nessuna riga', async ({ page }) => {
  const conto = await apri(page, { scena: 'cache' });
  const nota = scheda(page).locator('[data-contesto-cache]');
  await expect(nota).toHaveCount(1);
  await expect(nota).toHaveText(/^La cache è ripartita da capo alle \d{2}[:.]\d{2}: è cambiato il modello\. ~88[.,]5k token riletti senza lo sconto della cache\.$/u);
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
  const inglese = await page.context().newPage();
  await apri(inglese, { scena: 'cache', lingua: 'en' });
  await expect(scheda(inglese).locator('[data-contesto-cache]')).toHaveText(/^The cache started over at \d{1,2}:\d{2}( ?[AP]M)?: the model changed\. ~88[.,]5k tokens read again without the cache discount\.$/u);
  await inglese.close();
  const senza = await page.context().newPage();
  await apri(senza);
  await expect(scheda(senza).locator('[data-contesto-cache]')).toHaveCount(0);
  await senza.close();
});

test('PNCTX-CACHE-02 — un motivo che questa versione non conosce si dice come tale; senza token, niente seconda frase', async ({ page }) => {
  await apri(page, { scena: 'cacheignota' });
  await expect(scheda(page).locator('[data-contesto-cache]')).toHaveText(/^La cache è ripartita da capo alle \d{2}[:.]\d{2}: per un motivo che questa versione non conosce\.$/u);
});

test('PNCTX-CACHE-03 — passando a un’altra chat la riga della cache di quella prima sparisce (è della conversazione, non dell’app)', async ({ page }) => {
  const conto = await apri(page, { scena: 'cache' });
  await expect(scheda(page).locator('[data-contesto-cache]')).toHaveCount(1);
  await page.evaluate(() => window.__talosHarnessUiRuntime.passaASessione('pnctx-storia-a1', 'workspace', 'Contesto v2 bis', 'prova/modello-contesto-v2', { conclusa: true, modello: 'prova/modello-contesto-v2' }));
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.id === 'pnctx-storia-a1' && window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(scheda(page).locator('[data-sezione="riassunti"]')).toContainText('col modello');
  await expect(scheda(page).locator('[data-contesto-cache]')).toHaveCount(0);
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
});

for (const tema of ['dark', 'light']) {
  test(`PNCTX-CACHE-FOTO 1920×1080 ${tema} — la riga della cache sotto la nota del riuso`, async ({ page }) => {
    await apri(page, { scena: 'cache', tema });
    await expect(scheda(page).locator('[data-contesto-cache]')).toBeVisible();
    await expect(page.locator('#conversation')).toContainText('Fatto il passo 2.'); // l'evento in mezzo alla storia non la ferma
    await expect(page.getByText('Apro la cronologia', { exact: false })).toBeHidden(); // la foto dopo il velo d'apertura
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `cache-ripartita-${tema}.png`) });
  });
}

/* Spesa dei riassunti (owner 30/10/2026 sera, «Sì, così» sul bozzetto; contratto in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO). */
/* ⛔ Il «numero in fondo alla chat» del bozzetto: nella pagina di oggi quell'elemento non c'è (`[data-runtime-usage]` è scritto da
   chat-foot.js ma nessun modello della pagina lo contiene, né qui né sul 4174) — dove deve andare il totale coi riassunti lo decide
   l'owner. Qui si prova la scheda Contesto. */
test('PNCTX-SPESA-01 — ogni riassunto dice quanto è costato (su una riga sua, mai tagliato), la testata il totale; nelle due lingue', async ({ page }) => {
  const conto = await apri(page, { scena: 'spesa' });
  const riassunti = scheda(page).locator('[data-sezione="riassunti"]');
  await expect(riassunti).toContainText('costato 1,1k token');
  await expect(riassunti).toContainText('nessun costo');
  await expect(riassunti.locator('.pn-sezione__titolo')).toContainText('2 · 1,1k token');
  /* il costo non si taglia: la sua riga sta per intero nella larghezza del pannello */
  const costi = riassunti.locator('[data-costo-riassunto]');
  await expect(costi).toHaveCount(2);
  for (const c of await costi.all()) expect(await c.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(true);
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
  const pagina2 = await page.context().newPage();
  await apri(pagina2, { scena: 'spesa', lingua: 'en' });
  const en = scheda(pagina2).locator('[data-sezione="riassunti"]');
  await expect(en).toContainText(/1[.,]1k tokens spent/u);
  await expect(en).toContainText('no cost');
  await pagina2.close();
});

test('PNCTX-SPESA-02 — al contrario: una chat di prima (riassunto senza id, nessuna riga di spesa) non dice nessun costo', async ({ page }) => {
  const conto = await apri(page, { scena: 'storia' });
  const riassunti = scheda(page).locator('[data-sezione="riassunti"]');
  await expect(riassunti).toContainText('col modello');
  await expect(riassunti).not.toContainText('costato');
  await expect(riassunti).not.toContainText('nessun costo');
  await expect(riassunti.locator('.pn-sezione__titolo')).not.toContainText('token');
  expect(conto.nonGet).toEqual([]);
});

for (const tema of ['dark', 'light']) {
  test(`PNCTX-SPESA-FOTO 1920×1080 ${tema} — la scheda Contesto coi costi dei riassunti`, async ({ page }) => {
    await apri(page, { scena: 'spesa', tema });
    await expect(scheda(page).locator('[data-sezione="riassunti"]')).toContainText('costato');
    await expect(page.getByText('Apro la cronologia', { exact: false })).toBeHidden();
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `spesa-riassunti-${tema}.png`) });
  });
}

/* Owner 30/10/2026 sera, con la foto: «troppo piccolo il grafico» — la tela fissa 300×98 restava piccola e centrata in un pannello largo. */
/* 31/10/2026 (foto del blocco sulla 4177, chiaro e scuro): dentro la finestra del Context Manager `.talos-dialog svg` dava il contorno
   delle icone (1,8) a ogni svg, e le etichette del grafico «Nel tempo» uscivano ingrossate. Controllo: nel pannello già senza. */
test('PNCTX-GRAFICO-03 — the chart labels have no inherited outline, in the panel and in the Context Manager window', async ({ page }) => {
  await apri(page);
  const tratti = (loc) => loc.evaluateAll((nodi) => nodi.map((n) => { const s = getComputedStyle(n); return `${s.stroke}|${s.strokeWidth}`; }));
  const nelPannello = await tratti(scheda(page).locator('.pn-grafico svg text'));
  expect(nelPannello.length, 'CONTROLLO: the panel draws labels').toBeGreaterThan(0);
  for (const t of nelPannello) expect(t.startsWith('none|'), `panel label outline: ${t}`).toBe(true);
  await page.locator('[data-azione="comprimi"]').first().click();
  const finestra = page.locator('#veloContesto');
  await expect(finestra).toBeVisible();
  const scritte = finestra.locator('.pn-grafico svg text');
  await expect(scritte.first(), 'the window draws the chart with its labels').toBeVisible();
  const nellaFinestra = await tratti(scritte);
  for (const t of nellaFinestra) expect(t.startsWith('none|'), `window label outline: ${t}`).toBe(true);
});

test('PNCTX-GRAFICO-01 — il grafico nel tempo occupa tutta la larghezza del pannello, senza scalare il testo; anche a pannello largo', async ({ page }) => {
  const conto = await apri(page);
  const misura = () => scheda(page).locator('.pn-grafico svg').first().evaluate((s) => {
    const r = s.getBoundingClientRect(); const box = s.parentElement.getBoundingClientRect(); const vb = s.viewBox.baseVal;
    return { largo: r.width, alto: r.height, box: box.width, vbW: vb.width, vbH: vb.height };
  });
  const a = await misura();
  expect(Math.abs(a.vbW - a.largo)).toBeLessThanOrEqual(3); // scala 1:1: il testo resta alla sua misura
  expect(a.largo).toBeGreaterThanOrEqual(a.box - 30); // niente bande vuote ai lati
  expect(Math.abs(a.vbH - a.alto)).toBeLessThanOrEqual(3);
  /* il pannello allargato (come nella foto dell'owner): il grafico lo segue */
  await page.locator('#railContesto').evaluate((n) => { n.closest('aside, .talos-rail, [data-rail-panel]')?.style.setProperty('width', '860px'); n.style.width = '860px'; });
  await expect.poll(async () => (await misura()).largo, { timeout: 3_000 }).toBeGreaterThan(a.largo + 200);
  /* 31/10/2026: il riquadro si allarga SUBITO (stile), il disegno al fotogramma dopo (osservatore della larghezza, `comune.js`). Si
     aspetta il disegno: misurare appena allargato è una gara di tempi (rossa 1 volta su 2 sotto carico, verde da sola). */
  /* suite del blocco 7, 31/10 mattina (sotto carico): l'attesa passava e la misura SUBITO DOPO cadeva in un ridisegno ancora in volo
     (scarto 796, il grafico nuovo non ancora misurato). Si tiene la misura che ha fatto passare l'attesa, non una seconda. */
  let b = null;
  await expect.poll(async () => { b = await misura(); return Math.abs(b.vbW - b.largo); }, { timeout: 3_000 }).toBeLessThanOrEqual(3);
  expect(Math.abs(b.vbW - b.largo)).toBeLessThanOrEqual(3);
  expect(b.alto).toBeGreaterThan(a.alto); // e cresce in altezza, entro il suo tetto
  expect(a.alto).toBeGreaterThanOrEqual(110 + 14); // anche nel pannello stretto, più alto dei 98 di prima
  /* 31/10/2026: il pannello ora si ridisegna anche al cambio di LARGHEZZA (osservatore di `comune.js`, soglia 20 px). La prova al
     contrario di un ciclo: a pannello fermo, per un secondo, nessun grafico nuovo nel pannello — e la foto si scatta su un disegno fermo
     (prima si rompeva con «Element is not attached», un ridisegno ancora in volo). */
  const ridisegni = await page.evaluate(() => new Promise((ok) => {
    const radice = document.querySelector('#railContesto');
    let nuovi = 0;
    const mo = new MutationObserver((lista) => { for (const m of lista) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches('.pn-grafico') || n.querySelector('.pn-grafico'))) nuovi++; });
    mo.observe(radice, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); ok(nuovi); }, 1000);
  }));
  expect(ridisegni, 'a pannello fermo il grafico non si ridisegna di continuo').toBe(0);
  mkdirSync(FOTO, { recursive: true });
  await scheda(page).locator('.pn-grafico').first().screenshot({ path: join(FOTO, 'grafico-pannello-largo-dark.png') });
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
});

/* 31/10/2026 (PNCTX-GRAFICO-01 rossa sotto carico nella suite del blocco barra-parola-cm): il disegno riusava la larghezza misurata la volta
   prima anche dopo un cambio del pannello. Si rende DETERMINISTICO il caso in cui il controllo dopo il disegno non può correggere: il
   grafico nascosto mentre il pannello si allarga (`clientWidth` 0), poi rimostrato senza un ridisegno. Con la misura vecchia lo scarto è
   di centinaia di pixel (la larghezza di prima); con la cura resta la stima del contenitore (qualche decina, le cornici delle sezioni). */
test('PNCTX-GRAFICO-02 — a panel widened while the chart could not be measured does not keep the old width', async ({ page }) => {
  const conto = await apri(page);
  const misura = () => scheda(page).locator('.pn-grafico svg').first().evaluate((s) => ({ largo: s.getBoundingClientRect().width, vbW: s.viewBox.baseVal.width }));
  const prima = await misura();
  expect(Math.abs(prima.vbW - prima.largo)).toBeLessThanOrEqual(3);
  await page.addStyleTag({ content: '.pn-grafico svg{display:none !important}', }).then((h) => h.evaluate((n) => { n.id = 'nascondiGrafico'; }));
  await page.locator('#railContesto').evaluate((n) => { n.closest('aside, .talos-rail, [data-rail-panel]')?.style.setProperty('width', '860px'); n.style.width = '860px'; });
  /* l'osservatore della larghezza ridisegna al fotogramma dopo: se ne aspettano tre */
  await page.evaluate(() => new Promise((ok) => { requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok))); }));
  await page.evaluate(() => document.getElementById('nascondiGrafico')?.remove());
  const dopo = await misura();
  expect(dopo.largo, 'the panel did widen').toBeGreaterThan(prima.largo + 200);
  expect(Math.abs(dopo.vbW - dopo.largo), 'drawn for the new panel, not for the old one').toBeLessThanOrEqual(80);
  expect(conto.nonGet).toEqual([]);
  expect(conto.errori).toEqual([]);
});
