import { test, expect } from '@playwright/test';
/* 24/10/2026 — revisione avversaria a blocco 3, D-C2 (S3) e la riserva CO-M2: una carta «accendi» non riscrive MAI il ponte che la persona
   ha scelto altrove dopo la nascita della carta; e sulla carta «Accendi» del modello il server proprio scelto si scrive davvero.
   Rotte remote finte come in telefoni-chat.spec; ogni altra non-GET si ferma e si conta. Mai il Terminale. */
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const MODULI = { lato: 21, righe: Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => ((x * 7 + y * 3) % 5 < 2 ? '1' : '0')).join('')) };
test.use({ viewport: { width: 1920, height: 1080 } });

async function prepara(page, modo = 'dark') {
  const chiamate = []; const fermate = { nonGet: [] };
  await page.route('**/api/v1/**', (route) => { const r = route.request(); if (r.method() !== 'GET') { fermate.nonGet.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.abort(); } return route.continue(); });
  const banco = { conAttesa: false, acceso: true, sceltaFatta: true, relay: { modo: 'n0' } };
  await page.addInitScript((colorMode) => { try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } })); } catch { /* */ } }, modo);
  await page.route('**/api/v1/sessions/ponte-*/events', () => { /* aperto e muto */ });
  await page.route(/\/api\/v1\/remote(\/.*)?$/u, async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (req.method() !== 'GET') chiamate.push(`${req.method()} ${url.pathname} ${req.postData() ?? ''}`.trim());
    if (url.pathname === '/api/v1/remote/pair') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ gettone: 'G'.repeat(22), qr: 'talos-remote:1?pc=x&t=GGG', scadeAlle: Date.now() + 292_000, moduli: MODULI }) });
    if (url.pathname === '/api/v1/remote/pair/close') return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ chiuso: true }) });
    if (url.pathname === '/api/v1/remote/settings') {
      const c = JSON.parse(req.postData() ?? '{}');
      if (c.relay) { banco.relay = c.relay; banco.sceltaFatta = true; }
      if (typeof c.acceso === 'boolean') banco.acceso = c.acceso;
      return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ disponibile: true, acceso: banco.acceso, sceltaFatta: banco.sceltaFatta, relay: banco.relay, telefoni: [], attese: [] }) });
    }
    if (/^\/api\/v1\/remote\/pair\/[^/]+\/confirm$/u.test(url.pathname)) { banco.conAttesa = false; return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ telefono: { id: 'tel-pixel-10', nome: 'Pixel 10' } }) }); }
    return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({
      disponibile: true, acceso: banco.acceso, sceltaFatta: banco.sceltaFatta, relay: banco.relay, inLinea: [], telefoni: [],
      attese: banco.conAttesa ? [{ id: 'attesa-0001', nome: 'Pixel 10', piattaforma: 'Android 17', codice: '482913', scadeAlle: Date.now() + 60_000 }] : [],
      accoppiamento: { sbagliati: 0 },
    }) });
  });
  const risposte = [];
  await page.route('**/api/v1/sessions/ponte-*/approve', async (route) => { risposte.push(JSON.parse(route.request().postData() ?? '{}')); return route.fulfill({ contentType: 'application/json', body: INVOLUCRO({ ok: true }) }); });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Prova R5.14', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    r.handleRealEvent({ type: 'RunStarted', input: { consegna: 'collega il telefono' }, _sequenza: 1 }, r.realSessionState.generation);
  }, `ponte-${modo}`);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
  return { chiamate, banco, risposte, fermate };
}
const eventi = (page, lista) => page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent(e, r.realSessionState.generation); }, lista);

const scrittureDelPonte = (chiamate) => chiamate.filter((c) => c.startsWith('POST /api/v1/remote/settings'));

test('PONTE-REV3-01 — la carta della persona (/connect) nata a remoto spento: se intanto lo si accende altrove col server proprio, «Accendi» non lo tocca e va dritta al QR', async ({ page }) => {
  const { chiamate, banco, fermate } = await prepara(page);
  banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
  const campo = page.locator('#composerInput, textarea').first();
  await campo.fill('/connect');
  await campo.press('Enter');
  const carta = page.locator('[data-telefoni-accendi-persona]');
  await expect(carta).toBeVisible();
  banco.acceso = true; banco.sceltaFatta = true; banco.relay = { modo: 'proprio', url: 'https://mio.relay.example/?token=SEGRETO' };
  await carta.locator('[data-approva-una-volta]').click();
  await expect.poll(() => chiamate.some((c) => c.startsWith('POST /api/v1/remote/pair'))).toBe(true);
  expect(scrittureDelPonte(chiamate), '⛔ prima: {"relay":{"modo":"n0"},"acceso":true} — il server proprio e il suo gettone sparivano').toEqual([]);
  expect(banco.relay.modo).toBe('proprio');
  expect(fermate.nonGet).toEqual([]);
});

test('PONTE-REV3-02 — la carta del MODELLO «accendi e QR»: acceso altrove col server proprio prima del sì ⇒ nessuna scrittura, il sì parte', async ({ page }) => {
  const { chiamate, banco, risposte, fermate } = await prepara(page);
  banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
  await eventi(page, [{ type: 'ApprovalRequested', requestId: 'r-1', _sequenza: 2, azione: { tipo: 'remote_phone_pair', toolCallId: 'c-1', telefoni: 0, acceso: false, ponte: null } }]);
  const carta = page.locator('[data-request-id="r-1"]');
  await expect(carta).toBeVisible();
  banco.acceso = true; banco.sceltaFatta = true; banco.relay = { modo: 'proprio', url: 'https://mio.relay.example/' };
  await carta.locator('[data-approva-una-volta]').click();
  await expect.poll(() => risposte.length).toBe(1);
  expect(scrittureDelPonte(chiamate)).toEqual([]);
  expect(banco.relay.modo).toBe('proprio');
  expect(fermate.nonGet).toEqual([]);
});

test('PONTE-REV3-03 — due carte «accendi»: la prima sceglie il server proprio; la seconda (di serie gratuiti) NON lo sovrascrive, lo dice e resta aperta', async ({ page }) => {
  const { chiamate, banco, risposte, fermate } = await prepara(page);
  banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
  await eventi(page, [
    { type: 'ApprovalRequested', requestId: 'r-a', _sequenza: 2, azione: { tipo: 'remote_phone_pair', toolCallId: 'c-a', telefoni: 0, acceso: false, ponte: null } },
    { type: 'ApprovalRequested', requestId: 'r-b', _sequenza: 3, azione: { tipo: 'remote_control', toolCallId: 'c-b', acceso: true, ponte: null, telefoni: 0, inLinea: 0 } },
  ]);
  const a = page.locator('[data-request-id="r-a"]'); const b = page.locator('[data-request-id="r-b"]');
  await a.locator('[data-remoto-scelta="proprio"]').click();
  await a.locator('[data-remoto-url]').fill('https://mio.relay.example/?token=SEGRETO');
  await a.locator('[data-approva-una-volta]').click();
  await expect.poll(() => risposte.length).toBe(1);
  await b.locator('[data-approva-una-volta]').click();
  /* la frase di `remoto.chat.onCard.bridgeChanged` nelle due lingue: il banco parte nella lingua del sistema */
  await expect(b.locator('[data-telefoni-errore]')).toContainText(/changed elsewhere|cambiato altrove/u);
  expect(risposte.length, 'la seconda carta resta aperta: nessun sì partito').toBe(1);
  expect(banco.relay, '⛔ prima il ponte finale era n0').toEqual({ modo: 'proprio', url: 'https://mio.relay.example/?token=SEGRETO' });
  expect(scrittureDelPonte(chiamate)).toHaveLength(1);
  /* REV4-COL-1 (24/10/2026): dopo l'avviso la carta mostra il ponte vero (il server proprio), non più i gratuiti della sua nascita */
  await expect(b.locator('[aria-checked="true"][data-remoto-scelta]')).toHaveAttribute('data-remoto-scelta', 'proprio');
  /* AL CONTRARIO: guardata la carta, chi vuole davvero i gratuiti li sceglie QUI e preme di nuovo: la scelta si scrive */
  await b.locator('[data-remoto-scelta="n0"]').click();
  await b.locator('[data-approva-una-volta]').click();
  await expect.poll(() => risposte.length).toBe(2);
  expect(banco.relay).toEqual({ modo: 'n0' });
  expect(fermate.nonGet).toEqual([]);
});

test('PONTE-REV3-04 (riserva CO-M2) — sulla carta «Accendi» del modello il server proprio scelto si scrive PRIMA del sì', async ({ page }) => {
  const { chiamate, banco, risposte, fermate } = await prepara(page);
  banco.acceso = false; banco.sceltaFatta = true; banco.relay = { modo: 'n0' };
  await eventi(page, [{ type: 'ApprovalRequested', requestId: 'r-on', _sequenza: 2, azione: { tipo: 'remote_control', toolCallId: 'c-on', acceso: true, ponte: 'n0', telefoni: 0, inLinea: 0 } }]);
  const carta = page.locator('[data-request-id="r-on"]');
  await carta.locator('[data-remoto-scelta="proprio"]').click();
  await carta.locator('[data-remoto-url]').fill('https://mio.relay.example/');
  await carta.locator('[data-approva-una-volta]').click();
  await expect.poll(() => risposte.length).toBe(1);
  expect(scrittureDelPonte(chiamate)).toEqual(['POST /api/v1/remote/settings {"relay":{"modo":"proprio","url":"https://mio.relay.example/"}}']);
  expect(fermate.nonGet).toEqual([]);
});

/* 24/10/2026 — revisione avversaria a blocco 4, REV4-COL-1 (S3): dopo «Il collegamento è stato cambiato altrove» la carta mostrava
   ancora la scelta della sua nascita («Server gratuiti di n0», che la persona non ha mai scelto) e il secondo «Accendi» la scriveva:
   il server proprio spariva. Ora la carta si sposta sul ponte di ADESSO; il secondo clic, senza altri tocchi, non scrive niente. */
test('PONTE-REV4-COL-1 — carta del modello: dopo l\'avviso la scelta mostrata è quella vera, e il secondo «Accendi» non riscrive il ponte', async ({ page }) => {
  const { chiamate, banco, risposte, fermate } = await prepara(page);
  banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
  await eventi(page, [{ type: 'ApprovalRequested', requestId: 'r-c', _sequenza: 2, azione: { tipo: 'remote_control', toolCallId: 'c-c', acceso: true, ponte: null, telefoni: 0, inLinea: 0 } }]);
  const carta = page.locator('[data-request-id="r-c"]');
  await expect(carta.locator('[aria-checked="true"][data-remoto-scelta]')).toHaveAttribute('data-remoto-scelta', 'n0');
  /* la persona sceglie il suo server dalla SCHERMATA, a remoto ancora spento */
  banco.relay = { modo: 'proprio', url: 'https://mio.relay.example/?token=SEGRETO' }; banco.sceltaFatta = true;
  await carta.locator('[data-approva-una-volta]').click();
  await expect(carta.locator('[data-telefoni-errore]')).toContainText(/changed elsewhere|cambiato altrove/u);
  await expect(carta.locator('[aria-checked="true"][data-remoto-scelta]'), '⛔ prima restava su n0').toHaveAttribute('data-remoto-scelta', 'proprio');
  await expect(carta.locator('[data-remoto-url]')).toHaveValue('');
  await expect(carta.locator('[data-remoto-url]')).toHaveAttribute('placeholder', /already set|già impostato/u);
  await carta.locator('[data-approva-una-volta]').click();
  await expect.poll(() => risposte.length).toBe(1);
  expect(scrittureDelPonte(chiamate), '⛔ prima: {"relay":{"modo":"n0"}} — il server proprio spariva').toEqual([]);
  expect(banco.relay).toEqual({ modo: 'proprio', url: 'https://mio.relay.example/?token=SEGRETO' });
  expect(fermate.nonGet).toEqual([]);
});

test('PONTE-REV4-COL-1b — carta della persona (/connect): dopo l\'avviso la scelta si sposta sul ponte vero; il secondo «Accendi» accende senza riscriverlo', async ({ page }) => {
  const { chiamate, banco, fermate } = await prepara(page);
  banco.acceso = false; banco.sceltaFatta = false; banco.relay = null;
  const campo = page.locator('#composerInput, textarea').first();
  await campo.fill('/connect');
  await campo.press('Enter');
  const carta = page.locator('[data-telefoni-accendi-persona]');
  await expect(carta).toBeVisible();
  banco.relay = { modo: 'proprio', url: 'https://mio.relay.example/' }; banco.sceltaFatta = true;
  const accendi = carta.locator('[data-approva-una-volta]');
  await accendi.click();
  await expect(carta.locator('[data-telefoni-errore]')).toContainText(/changed elsewhere|cambiato altrove/u);
  await expect(carta.locator('[aria-checked="true"][data-remoto-scelta]')).toHaveAttribute('data-remoto-scelta', 'proprio');
  await accendi.click();
  await expect.poll(() => chiamate.some((c) => c.startsWith('POST /api/v1/remote/pair'))).toBe(true);
  expect(scrittureDelPonte(chiamate).filter((c) => c.includes('"relay"')), '⛔ prima il secondo clic scriveva {"relay":{"modo":"n0"}}').toEqual([]);
  expect(banco.relay.modo).toBe('proprio');
  expect(fermate.nonGet).toEqual([]);
});
