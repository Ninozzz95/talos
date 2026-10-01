import { expect, test } from '@playwright/test';

/*
 * ============================================================================
 * L'ACCESSO CON OPENROUTER DALL'APP DESKTOP — 01/10/2026
 * ============================================================================
 * Owner: «la app desktop non apre il browser per accedere a openrouter». Nell'app la finestra nuova si nega SEMPRE
 * (`desktop/main.mjs`, `setWindowOpenHandler`), quindi la finestra vuota che `avviaAccessoProvider` apre dentro il clic torna
 * `null` come col blocco dei popup, e l'app mostrava «Il browser ha bloccato la finestra» con un link che il guscio negava a
 * sua volta. Ora nell'app (riconosciuta da `navigator.windowControlsOverlay.visible`, come la barra del titolo) l'indirizzo
 * VERO si apre con `window.open`, che il guscio manda al browser del computer (`desktop/runtime.mjs`; nella finestra vera:
 * R01-GUSCIO). Nel browser resta il ripiego di sempre, il link.
 *
 * Qui la pagina vera del 4174, con il bundle servito da `public/`. `window.open` si sostituisce con un registro che torna
 * `null` (è ciò che torna sia nell'app sia col popup bloccato), e nell'app si dichiara la barra di Windows. La risposta di
 * `/inizia` è quella VERA del server (`openrouter-oauth.mjs` `apri` → `{ stato, indirizzo, modo, scadeTraMs }`, busta
 * `successEnvelope` di `http-app.mjs`), e non arriva mai al 4174: ogni non-GET si ferma e si conta.
 */

const INDIRIZZO = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2F127.0.0.1%3A4174%2Fapi%2Fv1%2Fauth%2Fopenrouter%2Fritorno%2FSTATO&code_challenge=SFIDA&code_challenge_method=S256';

async function premiAccedi(page, { app }) {
  const tentate = [];
  const inizi = [];
  /* PRIMA il blocco, POI l'eccezione: Playwright prova i gestori in ordine inverso (vedi lab-provider.spec.mjs). */
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  await page.route('**/api/v1/auth/openrouter/inizia', (route) => {
    inizi.push(route.request().method());
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { stato: 'STATO', indirizzo: INDIRIZZO, modo: 'browser', scadeTraMs: 600000 },
        meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } }),
    });
  });
  await page.addInitScript((nellApp) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it', uiFontScale: 'default' }, chat: {}, workspaces: {} }));
    window.__aperture = [];
    window.open = (...argomenti) => { window.__aperture.push(argomenti); return null; };
    if (nellApp) {
      Object.defineProperty(navigator, 'windowControlsOverlay', {
        configurable: true,
        value: { visible: true, getTitlebarAreaRect: () => new DOMRect(0, 0, 1200, 34), addEventListener() {}, removeEventListener() {} },
      });
    }
  }, app);
  await page.goto('/');
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
  });
  await page.click('#modelLabCard [data-lab-scheda="providers"]');
  const accedi = page.locator('#providerList [data-provider-id="openrouter"] [data-provider-action="oauth-start"]');
  await accedi.waitFor({ state: 'attached', timeout: 15000 });
  await accedi.evaluate((pulsante) => pulsante.click());
  const avviso = page.locator('#providerList [data-provider-id="openrouter"] [data-provider-feedback]');
  await expect(avviso).toContainText('Apri l’accesso', { timeout: 10000 });
  return { tentate, inizi, avviso, aperture: await page.evaluate(() => window.__aperture) };
}

test('OR-APP-01: nell app desktop l accesso a OpenRouter apre l indirizzo vero nel browser del computer', async ({ page }) => {
  const { tentate, inizi, avviso, aperture } = await premiAccedi(page, { app: true });
  expect(inizi).toEqual(['POST']);
  expect(aperture).toEqual([['', '_blank'], [INDIRIZZO, '_blank', 'noopener,noreferrer']]);
  await expect(avviso).toContainText('Accesso aperto nel browser del computer');
  await expect(avviso).not.toHaveClass(/is-error/);
  await expect(avviso).toHaveAttribute('role', 'status');
  await expect(avviso.locator('a')).toHaveAttribute('href', INDIRIZZO);
  /* Al ritorno dal browser la scheda si ricarica da sola (`aspettaRitornoAccesso`): senza, dopo un accesso riuscito direbbe
     ancora «Chiave mancante». Si conta la GET dei fornitori dopo il `focus` della finestra. */
  let ricariche = 0;
  page.on('request', (r) => { if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/v1/providers') ricariche++; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => ricariche, { timeout: 5000 }).toBeGreaterThan(0);
  expect(tentate, 'nessuna scrittura sul 4174').toEqual([]);
});

test('OR-APP-02: al contrario, nel browser col popup bloccato resta il link e non parte un secondo window.open', async ({ page }) => {
  const { tentate, inizi, avviso, aperture } = await premiAccedi(page, { app: false });
  expect(inizi).toEqual(['POST']);
  expect(aperture).toEqual([['', '_blank']]);
  await expect(avviso).toContainText('Il browser ha bloccato la finestra');
  await expect(avviso).toHaveClass(/is-error/);
  await expect(avviso).toHaveAttribute('role', 'alert');
  await expect(avviso.locator('a')).toHaveAttribute('href', INDIRIZZO);
  expect(tentate, 'nessuna scrittura sul 4174').toEqual([]);
});
