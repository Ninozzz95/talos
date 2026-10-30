/*
 * PANNELLO DI DESTRA v2 — la scheda CONTESTO nell'app vera (MAPPA §0.3 e §3.3). Scene rigiocate dal browser con la forma degli eventi
 * veri (`consumo-fornitore`, `talos.compattazione`, `talos.contesto-richiesta`); ogni richiesta che non legge si ferma e si conta.
 * Casi: storia nel tempo (C-05) col riassunto segnato e la sua parola (col modello / rapido), l'indice dei giri che porta al giro
 * (C-11) e che dice onestamente quando il giro non è a schermo, «Riassumi adesso» confermato nella testa (Annulla non scrive), le
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
const numera = (ev) => ev.map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SCENE = {
  storia: (ripiego) => numera([...giro(1, 40_000), ...giro(2, 90_000), ...giro(3, 140_000), RIASSUNTO(ripiego), ...giro(4, 30_000), ...giro(5, 76_000), RICHIESTA]),
  vuota: () => numera([]),
  lunga: () => numera(Array.from({ length: 30 }, (_, i) => giro(i + 1, 20_000 + i * 1_000)).flat()),
};

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
      if (m[2] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
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

test('PNCTX-04 — «Riassumi adesso» chiede conferma nella testa; Annulla non scrive niente', async ({ page }) => {
  const conto = await apri(page);
  await scheda(page).locator('[data-controllo="menu-testa"]').click();
  await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: 'Riassumi adesso' }).click();
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
