/*
 * PANNELLO DI DESTRA v2 — la scheda GIT nell'app vera. ⛔ La scheda è quella di OGGI (`creaSchedaGithub`, scheda-github.js NON
 * toccato): qui si provano solo le AGGIUNTE sopra di lei (MAPPA §0.2 e §3.5) — i +/− di ogni file dal server (G-05), «Dettagli del
 * repository» (la card Ambiente che lascia il Contesto, decisione owner 1) chiusa e ricordata, le pagine dei gruppi con tanti file,
 * e che la colonna non scorra a 1920×1080 (a 900×600 la scheda Git può scorrere: decisione owner 5a).
 * Il git della sessione è finto nel contenuto e con la forma delle buste vere; ogni richiesta che non legge si ferma e si conta.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const FOTO = join(import.meta.dirname, '..', '..', 'artifacts', 'pannello-git');
const SESSIONE = 'pngit-uno';
const busta = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });
const CONTESTO = { branch: 'feat/pannello-v2', worktree: 'r4-pannello', nonSalvate: 3, repoAnnidati: [] };
const voce = (percorso, x, y, tipo, extra = {}) => ({ percorso, x, y, tipo, staged: x !== ' ' && x !== '?', nonStaged: y !== ' ', conflitto: false, cartella: false, repoAnnidato: false, da: null, ...extra });

async function scena(page, { tema = 'dark', larghezza = 1920, altezza = 1080, molti = 0, lingua = 'it', contesto = CONTESTO, commit = 0, apriGit = true } = {}) {
  const conto = { nonGet: [], errori: [], letture: 0 };
  page.on('pageerror', (e) => { conto.errori.push(e.message); console.log('ERRORE-PAGINA', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } })); } catch { /* */ }
  }, { colorMode: tema, uiLanguage: lingua });
  const voci = [
    voce('src/app.js', ' ', 'M', 'modificato', { aggiunte: 2, rimozioni: 1 }),
    voce('README.md', 'M', ' ', 'modificato', { aggiunte: 5, rimozioni: 0 }),
    voce('logo.png', ' ', 'M', 'modificato', { aggiunte: null, rimozioni: null }),
    voce('note.txt', '?', '?', 'nonTracciato'),
    ...Array.from({ length: molti }, (_, i) => voce(`src/moduli/modulo-${String(i).padStart(2, '0')}.js`, ' ', 'M', 'modificato', { aggiunte: i + 1, rimozioni: i % 3 })),
  ];
  const stato = { radiceRepo: 'C:/progetto', prefisso: '', cartellaEradiceRepo: true, voci, riepilogo: { totale: voci.length, staged: 1, nonStaged: 0, nonTracciati: 1, conflitti: 0 }, base: { commit: 'abc1234def5678', breve: 'abc1234', soggetto: 'Primo commit' }, impronta: 'i-1', preparatiFuori: 0 };
  const eventi = [
    { type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Sistema il pannello' }, contesto, _sequenza: 1 },
    { type: 'RunFinished', threadId: 't', runId: 'r1', _sequenza: 2 },
    { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null, _sequenza: 3 },
  ];
  await page.routeWebSocket(/.*/u, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (req.method() !== 'GET') { conto.nonGet.push(p); return route.abort(); }
    if (p.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    if (p.startsWith(`/api/v1/sessions/${SESSIONE}/git/`)) {
      const azione = p.split('/').pop();
      if (azione === 'status') { conto.letture += 1; return route.fulfill(busta(stato)); }
      if (azione === 'branch') return route.fulfill(busta({ ramo: 'feat/pannello-v2', staccata: false }));
      if (azione === 'log') {
        const storia = Array.from({ length: commit }, (_, i) => { const h = String(i).padStart(4, '0').repeat(4); return { commit: h, breve: h.slice(0, 7), autore: 'Prova', data: new Date(Date.now() - i * 3_600_000).toISOString(), genitori: i === commit - 1 ? 0 : 1, padri: i === commit - 1 ? [] : [String(i + 1).padStart(4, '0').repeat(4)], soggetto: `Commit numero ${i}`, inviato: true }; });
        return route.fulfill(busta({ commit: storia, altri: false, ultimoMessaggio: '' }));
      }
      if (azione === 'stashes') return route.fulfill(busta({ accantonati: [] }));
      if (azione === 'sync') return route.fulfill(busta({ ramo: 'feat/pannello-v2', staccata: false, remoti: [], riferimento: null, avanti: 0, indietro: 0, riferimentoSparito: false, remotoPerInvio: null, ultimoRecupero: null, recuperoInCorso: false }));
      if (azione === 'branches') return route.fulfill(busta({ rami: [{ nome: 'feat/pannello-v2', commit: 'abc1234', riferimento: null, corrente: true }] }));
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'PNGIT', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  if (!apriGit) return conto;
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  return conto;
}
const scheda = (page) => page.locator('#railGithub');
const riga = (page, percorso) => page.locator(`#railGithub .talos-github-riga[data-percorso="${percorso}"]`);

test('PNGIT-B01 — i +/− del server accanto al nome; il file nuovo e il binario senza numeri (mai «+0»)', async ({ page }) => {
  const conto = await scena(page);
  await expect(riga(page, 'src/app.js').locator('.pn-git-diff')).toHaveText('+2−1');
  await expect(riga(page, 'README.md').locator('.pn-git-diff')).toHaveText('+5');
  await expect(riga(page, 'logo.png').locator('.pn-git-diff'), 'un binario non porta numeri').toHaveCount(0);
  await expect(riga(page, 'note.txt').locator('.pn-git-diff'), 'un file nuovo non porta numeri').toHaveCount(0);
  expect(conto.nonGet).toEqual([]);
});

test('PNGIT-B02 — «Dettagli del repository»: chiusa, sotto il ramo, con le quattro righe di oggi; aperta resta aperta al ricaricare', async ({ page }) => {
  await scena(page);
  const dettagli = scheda(page).locator('.pn-git-dettagli');
  await expect(dettagli).toHaveCount(1);
  const interruttore = dettagli.locator('.talos-github-gruppo__titolo');
  await expect(interruttore).toHaveAttribute('aria-expanded', 'false');
  await expect(dettagli.locator('.talos-kv')).toHaveCount(0);
  await interruttore.click();
  await expect(scheda(page).locator('.pn-git-dettagli .talos-github-gruppo__titolo')).toHaveAttribute('aria-expanded', 'true');
  const righe = scheda(page).locator('.pn-git-dettagli .talos-kv');
  await expect(righe).toHaveCount(4);
  await expect(righe.nth(0)).toContainText('feat/pannello-v2');
  await expect(righe.nth(1)).toContainText('r4-pannello');
  await expect(righe.nth(2)).toContainText('3');
  /* sta prima del confronto con l'ultimo commit (sotto il ramo e la sincronizzazione) */
  const ordine = await scheda(page).evaluate((n) => {
    const el = [...n.querySelector('.talos-github').children];
    return { dettagli: el.findIndex((x) => x.classList.contains('pn-git-dettagli')), base: el.findIndex((x) => x.classList.contains('talos-github__base')) };
  });
  if (ordine.base >= 0) expect(ordine.dettagli).toBeLessThan(ordine.base);
  await page.reload();
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'PNGIT', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect(scheda(page).locator('.pn-git-dettagli .talos-github-gruppo__titolo'), 'la piega aperta si ricorda').toHaveAttribute('aria-expanded', 'true');
});

test('PNGIT-B03 — 40 file modificati: il gruppo va a pagine e la colonna non scorre (1920×1080); la riga cercata a pagina 2 si raggiunge', async ({ page }) => {
  await scena(page, { molti: 40 });
  const barra = scheda(page).locator('[data-pager="git-modificati"]');
  await expect(barra).toBeVisible();
  await expect(barra).toContainText('di');
  const m = await scheda(page).evaluate((n) => ({ alto: n.scrollHeight, vista: n.clientHeight }));
  expect(m.alto, JSON.stringify(m)).toBeLessThanOrEqual(m.vista + 1);
  const nascoste = await scheda(page).locator('.talos-github-riga.pn-fuori-pagina').count();
  expect(nascoste, 'le righe fuori pagina restano nel DOM, nascoste').toBeGreaterThan(0);
  await barra.locator('[data-controllo^="pagina-dopo-"]').click();
  await expect(scheda(page).locator('[data-pager="git-modificati"] [role="status"]')).not.toContainText(/^1–/u);
});

test('PNGIT-B04 — una sessione senza ambiente: niente «Dettagli del repository» vuoto', async ({ page }) => {
  await scena(page, { contesto: null });
  await expect(scheda(page).locator('.pn-git-dettagli')).toHaveCount(0);
});

for (const [larghezza, altezza, tema] of [[1920, 1080, 'dark'], [1920, 1080, 'light'], [900, 600, 'dark'], [900, 600, 'light']]) {
  test(`PNGIT-FOTO ${larghezza}×${altezza} ${tema} — tanti file, le aggiunte sopra la scheda di oggi`, async ({ page }) => {
    await scena(page, { molti: 40, larghezza, altezza, tema });
    /* a 900×600 la fisarmonica può chiudere da sola i gruppi (resta la testa col conto): i numeri si guardano a 1920 */
    if (larghezza === 1920) await expect(riga(page, 'src/app.js').locator('.pn-git-diff')).toBeVisible();
    await scheda(page).locator('.pn-git-dettagli .talos-github-gruppo__titolo').click();
    await page.waitForTimeout(400);
    if (larghezza === 1920) {
      const m = await scheda(page).evaluate((n) => ({ alto: n.scrollHeight, vista: n.clientHeight }));
      expect(m.alto, JSON.stringify(m)).toBeLessThanOrEqual(m.vista + 1);
    }
    mkdirSync(FOTO, { recursive: true });
    await page.screenshot({ path: join(FOTO, `git-${tema}-${larghezza}x${altezza}.png`) });
  });
}

test('PNGIT-B05 — 30 commit: il grafo dei commit va a pagine (decisione owner), e «Successiva» porta ai più vecchi', async ({ page }) => {
  await scena(page, { commit: 30, larghezza: 1440, altezza: 900 });
  const titolo = scheda(page).locator('.talos-github-gruppo[data-gruppo="storia"] .talos-github-gruppo__titolo');
  if ((await titolo.getAttribute('aria-expanded')) !== 'true') { await titolo.focus(); await page.keyboard.press('Enter'); }
  const barra = scheda(page).locator('[data-pager="git-storia"]');
  await expect(barra).toBeVisible();
  await expect(barra).toContainText('30');
  const prima = scheda(page).locator('.talos-github-gruppo[data-gruppo="storia"] .talos-github-riga:not(.pn-fuori-pagina)').first();
  await expect(prima).toContainText('Commit numero 0');
  await barra.locator('[data-controllo^="pagina-dopo-"]').click();
  await expect(prima).not.toContainText('Commit numero 0');
});

/* ⭐ passo 7: il numero sulla scheda Git = i file da salvare dello stato letto per QUESTA sessione (senza stato, nessun numero) */
test('PNGIT-B06 — il conto sulla scheda Git: i file da salvare, una volta sola ciascuno; resta a scheda chiusa', async ({ page }) => {
  await scena(page);
  await page.locator('#railTabs [data-rail="processi"]').click();
  const tab = page.locator('#railTabs [data-rail="github"]');
  await expect(tab.locator('.talos-tabs__count')).toHaveText('4');
  await expect(tab).toHaveAttribute('aria-description', /4/u);
});

/* ⭐ Owner 29/10/2026 sera: il numero sulla scheda Git c'è SUBITO all'apertura della chat, senza aprire la scheda: UNA lettura leggera
   in sottofondo (una per sessione e cartella), nessun giro a ritmo. */
test('PNGIT-B07 — il numero sulla scheda Git c’è all’apertura della chat, con UNA lettura sola e la scheda mai aperta', async ({ page }) => {
  const conto = await scena(page, { apriGit: false });
  const tab = page.locator('#railTabs [data-rail="github"]');
  await expect(tab).toHaveAttribute('aria-selected', 'false');
  await expect(tab.locator('.talos-tabs__count')).toHaveText('4', { timeout: 8_000 });
  await page.waitForTimeout(2_500);
  expect(conto.letture, 'una lettura sola, niente giri a ritmo').toBe(1);
  /* AL CONTRARIO: un evento qualunque ridisegna la colonna e NON rilegge */
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'altro' }, _sequenza: 50 }, r.realSessionState.generation); });
  await page.waitForTimeout(1_000);
  expect(conto.letture).toBe(1);
  expect(conto.nonGet).toEqual([]);
});

/* …e la persona che apre la scheda Git subito dopo (entro 2 s) non fa partire una seconda lettura: la scheda usa quella leggera. */
test('PNGIT-B08 — aprire la scheda Git subito dopo l’apertura della chat: una lettura sola, condivisa', async ({ page }) => {
  const conto = await scena(page, { apriGit: false });
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(conto.letture, 'la scheda riusa la lettura dell’apertura').toBe(1);
  expect(conto.nonGet).toEqual([]);
});
