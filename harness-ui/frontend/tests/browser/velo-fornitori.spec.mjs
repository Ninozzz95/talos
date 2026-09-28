import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * I FORNITORI HANNO UNA PORTA SOLA — decisione owner del 23/09/2026 (notte)
 * ============================================================================
 * Questo file provava il velo «Fornitori e accessi» (`#veloFornitori`, 18/09/2026: le card vere
 * dentro il dialogo, «Salva chiave» che parte davvero, «Prova tutti»). L'owner ha deciso, con
 * tre risposte testuali:
 *   1. «Provider e accessi» nelle Impostazioni → «Toglierla del tutto»: da dieci sezioni a NOVE;
 *   2. il velo «Fornitori e accessi» → «Toglierla: porta al Model Lab»;
 *   3. il comando «providers» e l'azione `openProviders` aprivano «Account» — un difetto.
 * ⇒ Ogni strada porta a Impostazioni → Laboratorio modelli → scheda «Provider». Il file tiene il
 *   suo nome (è la storia di questa superficie) e ora prova il percorso NUOVO:
 *   (a) le Impostazioni hanno nove sezioni e nessuna «Provider e accessi»;
 *   (b) il comando «providers», l'azione della Home, «Collega un modello» e una sezione salvata
 *       `providers` atterrano TUTTI su Laboratorio modelli con la scheda «Provider» scelta e visibile;
 *   (c) il velo non esiste più nel documento.
 * ⛔ Ciò che il file proteggeva prima NON si perde: «Salva chiave», «Rimuovi chiave» e «Prova tutti»
 *   passano dallo STESSO gestore (`gestisciAzioneProvider`, `provaTuttiProvider`) sulla scheda
 *   «Provider», e lì le provano `lab-provider.spec.mjs` e `provider-card-vivo.spec.mjs`.
 *
 * Ricerca 23/09/2026: Jakob Nielsen (NN/g), «Reduce Redundancy: Decrease Duplicated Design
 * Decisions» — «User interface complexity increases when a single feature or hypertext link is
 * presented in multiple ways»; RFC 9110 §15.4.2 (301) — «any future references to this resource
 * ought to use one of the enclosed URIs», che è ciò che la sezione salvata `providers` deve fare.
 *
 * Ermetica: `/api/v1/providers` è intercettata, ogni richiesta non-GET è FERMATA e contata, e ogni
 * prova chiude con `expect(tentate).toEqual([])`: nessuna scrittura, sul banco o altrove.
 */

const FORNITORI = [
  { id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, supportsEndpoint: true, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
  { id: 'ollama', label: 'Ollama', requiresKey: false, keyConfigured: false, supportsEndpoint: true, endpoint: 'http://127.0.0.1:11434', endpointConfigured: true, timeoutSeconds: 60, execution: 'local' },
  { id: 'anthropic', label: 'Anthropic', requiresKey: true, keyConfigured: false, supportsEndpoint: true, endpoint: '', endpointConfigured: false, timeoutSeconds: 60, execution: 'cloud' },
];
const NOVE = ['appearance', 'chat', 'tools', 'memoria', 'privacy', 'models', 'costi', 'workspace', 'account'];
const CHIAVE_SEZIONE = 'talos.harness.desktop.settings.section.v1';
const FOTO = resolve(process.cwd(), 'artifacts', 'provider-unica-superficie-2026-09-23');

/** Apre l'app coi fornitori finti. `sezioneSalvata` simula chi aveva lasciato aperta una sezione. */
async function avvia(page, { sezioneSalvata = null, colorMode = 'dark' } = {}) {
  const tentate = [];
  /* PRIMA il blocco, POI le eccezioni: Playwright prova i gestori in ordine inverso. */
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  await page.route('**/api/v1/providers', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { items: FORNITORI }, meta: { schema: 'talos.harness-ui.api.v1' } }),
  }));
  await page.addInitScript(([chiave, sezione, modo]) => {
    /* Solo al PRIMO caricamento: un `addInitScript` rigira a ogni navigazione, e riscriverebbe la
       chiave che l'app ha appena migrato — la prova misurerebbe sé stessa. */
    if (sessionStorage.getItem('__provaAvviata')) return;
    sessionStorage.setItem('__provaAvviata', '1');
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: modo, themePreset: 'calm', themePresetVersione: 2 }, chat: {}, workspaces: {} }));
    if (sezione) window.localStorage.setItem(chiave, sezione);
  }, [CHIAVE_SEZIONE, sezioneSalvata, colorMode]);
  await page.goto('/');
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15_000 });
  return tentate;
}

/** L'atterraggio che tutte le strade devono dare, e NIENTE di meno. */
async function atterraSuProvider(page, perche) {
  await expect(page.locator('#schermoImpostazioni'), `${perche}: le Impostazioni non si sono aperte`).toBeVisible();
  await expect(page.locator('#setting-tab-models'), `${perche}: la sezione scelta non è Laboratorio modelli`).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#setting-tab-account'), `${perche}: è finito su Account (il difetto di prima)`).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#setting-panel-models'), `${perche}: il pannello del laboratorio non si vede`).toBeVisible();
  const scheda = page.locator('#modelLabCard [data-lab-scheda="providers"]');
  await expect(scheda, `${perche}: la scheda «Provider» non è quella scelta`).toHaveAttribute('aria-selected', 'true');
  await expect(scheda, `${perche}: la scheda «Provider» non si vede`).toBeInViewport();
  await expect(page.locator('#modelLabCard [data-model-lab-panel="providers"]'), `${perche}: il pannello dei fornitori non si vede`).toBeVisible();
  await expect(page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]'), `${perche}: le card dei fornitori non ci sono`).toHaveCount(FORNITORI.length);
  /* E nessun velo si è aperto al posto della scheda: la superficie è UNA. */
  await expect(page.locator('#veloFornitori')).toHaveCount(0);
}

async function foto(page, nome) {
  await mkdir(FOTO, { recursive: true });
  await page.screenshot({ path: resolve(FOTO, `${nome}.png`), fullPage: false, animations: 'disabled', caret: 'hide' });
}

async function apriImpostazioniDallaBarra(page) {
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible();
}

/** Il giro fallito per la chiave che manca, come lo manda il server: il ramo `RunError` VERO
    costruisce la carta con la sua porta. Nessuna sessione a pagamento, nessuna rete. */
async function giroSenzaChiave(page, sequenza) {
  await page.evaluate((seq) => {
    const r = window.__talosHarnessUiRuntime;
    document.querySelector('.talos-sidebar [data-vaia="chat"]')?.click();
    r.handleRealEvent({ type: 'RunError', code: 'PROVIDER_KEY_MISSING', message: 'PROVIDER_KEY_MISSING: Manca la chiave per OpenRouter.', _sequenza: seq }, r.realSessionState.generation);
  }, sequenza);
  return page.locator('#conversation .real-session-status').filter({ hasText: 'Manca la chiave per OpenRouter' });
}

test('VELO-FORNITORI-00 — il velo «Fornitori e accessi» non esiste più nel documento, e nessuno lo nomina', async ({ page }) => {
  const tentate = await avvia(page);
  const resti = await page.evaluate(() => ({
    velo: document.querySelectorAll('#veloFornitori').length,
    porte: document.querySelectorAll('[data-apre-velo="veloFornitori"]').length,
    liste: document.querySelectorAll('[data-velo-lista]').length,
    tendina: document.querySelectorAll('#providerLab').length,
    pannelloVecchio: document.querySelectorAll('#setting-panel-providers, #settingsProvidersPanel, #settingsProvidersList, [data-settings-tab="providers"]').length,
    esposto: typeof window.__talosHarnessUiRuntime?.apriVeloMockup,
  }));
  expect(resti).toEqual({ velo: 0, porte: 0, liste: 0, tendina: 0, pannelloVecchio: 0, esposto: 'undefined' });
  expect(tentate).toEqual([]);
});

test('VELO-FORNITORI-A — le Impostazioni hanno NOVE sezioni, e «Provider e accessi» non c\'è', async ({ page }) => {
  const tentate = await avvia(page);
  await apriImpostazioniDallaBarra(page);
  const nav = page.locator('#schermoImpostazioni [role="tablist"] [data-settings-tab]');
  await expect(nav).toHaveCount(9);
  expect(await nav.evaluateAll((n) => n.map((x) => x.dataset.settingsTab))).toEqual(NOVE);
  /* La colonna delle sezioni (e non ogni tablist: il laboratorio ha la SUA, con la scheda «Provider»). */
  await expect(page.locator('#schermoImpostazioni .settings-nav')).not.toContainText('Provider e accessi');
  await expect(page.locator('#setting-tab-providers')).toHaveCount(0);
  await expect(page.locator('[id^="setting-panel-"]')).toHaveCount(9);
  /* Il selettore della finestra stretta nasce dallo stesso elenco: nove anche lui. */
  expect(await page.locator('#settingsSectionSelect option').evaluateAll((o) => o.map((x) => x.value))).toEqual(NOVE);
  /* E la ricerca delle parole dei fornitori porta al laboratorio, mai a un vuoto. */
  await page.locator('#settingsSearch').fill('chiave');
  await expect(page.locator('#schermoImpostazioni [data-settings-result="models"]').first()).toBeVisible();
  await expect(page.locator('#schermoImpostazioni [data-settings-result="providers"]')).toHaveCount(0);
  await page.locator('#settingsSearch').fill('');
  expect(tentate).toEqual([]);
});

test('VELO-FORNITORI-B1 — il comando «providers» della palette porta al Laboratorio modelli → Provider, non ad Account', async ({ page }) => {
  const tentate = await avvia(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('#veloComandi')).toBeVisible();
  await page.locator('#cercaComando').fill('provider');
  const riga = page.locator('#veloComandi [data-command="providers"]');
  await expect(riga).toBeVisible();
  await riga.click();
  await atterraSuProvider(page, 'comando «providers»');
  expect(tentate).toEqual([]);
});

test('VELO-FORNITORI-B2 — «Provider e accessi» della Home (openProviders) porta al Laboratorio modelli → Provider', async ({ page }) => {
  const tentate = await avvia(page);
  const bottone = page.locator('#schermoHome').getByRole('button', { name: 'Provider e accessi', exact: true });
  await expect(bottone).toBeVisible();
  await bottone.click();
  await atterraSuProvider(page, 'azione della Home');
  expect(tentate).toEqual([]);
});

test('VELO-FORNITORI-B3 — «Collega un modello» sulla chiave mancante porta al Laboratorio modelli → Provider', async ({ page }) => {
  const tentate = await avvia(page);
  const nota = await giroSenzaChiave(page, 900001);
  await expect(nota).toHaveCount(1);
  /* Il rimedio scritto dice lo STESSO posto in cui porta il pulsante. */
  await expect(nota).toContainText('Impostazioni → Laboratorio modelli → Provider');
  const collega = nota.getByRole('button', { name: 'Collega un modello', exact: true });
  await expect(collega).toBeVisible();
  await collega.click();
  await atterraSuProvider(page, '«Collega un modello»');
  expect(tentate).toEqual([]);
});

test('VELO-FORNITORI-B4 — una sezione salvata `providers` si apre su Laboratorio modelli → Provider, e il ricordo si riscrive', async ({ page }) => {
  const tentate = await avvia(page, { sezioneSalvata: 'providers' });
  /* Il rinvio avviene all'avvio, quando le Impostazioni leggono la sezione salvata: la chiave vecchia
     viene riscritta subito (301), e non ricade su «Aspetto e movimento». */
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), CHIAVE_SEZIONE)).toBe('models');
  /* Si entra nelle Impostazioni dalla scorciatoia, che NON sceglie una sezione (a differenza della
     voce «Impostazioni» della barra, che per regola del 18/09 apre la prima). */
  await page.keyboard.press('Control+,');
  await atterraSuProvider(page, 'sezione salvata «providers»');
  /* Dopo il rinvio l'indirizzo vecchio non torna più: ricaricando, la chiave resta `models`. */
  await page.reload();
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15_000 });
  expect(await page.evaluate((k) => localStorage.getItem(k), CHIAVE_SEZIONE)).toBe('models');
  expect(tentate).toEqual([]);
});

/*
 * LE FOTO — due temi, due larghezze del desktop: il menu delle Impostazioni, e la scheda «Provider»
 * dopo il comando e dopo «Collega un modello». Una pagina NUOVA per ogni combinazione: `addInitScript`
 * si accumula a ogni navigazione, e il tema del giro prima resterebbe scritto nel giro dopo.
 */
test('VELO-FORNITORI-FOTO — nav, comando e «Collega un modello» nei due temi, a 1440×900 e 1024×800', async ({ page }) => {
  test.setTimeout(180_000);
  for (const modo of ['dark', 'light']) {
    for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
      const nuova = await page.context().newPage();
      await nuova.setViewportSize({ width: larghezza, height: altezza });
      const tentate = await avvia(nuova, { colorMode: modo });
      await apriImpostazioniDallaBarra(nuova);
      await nuova.waitForTimeout(400);
      await foto(nuova, `nav-${modo}-${larghezza}x${altezza}`);
      /* Ctrl K dentro le Impostazioni apre il cercatore DELLE IMPOSTAZIONI (INTELAIATURA-09): la palette
         dei comandi si apre da fuori, come farebbe una persona — dalla Home. */
      await nuova.locator('.talos-sidebar [data-vaia="home"]').click();
      await expect(nuova.locator('#schermoHome')).toBeVisible();
      /* ⛔ Si aspetta che le Impostazioni abbiano davvero finito di USCIRE: la classe `active` resta
         per la durata dell'animazione d'uscita (`setView` → `animateExit`), e in quella finestra il
         Ctrl K delle Impostazioni vince ancora. Misurato da questa prova al primo giro. */
      await expect(nuova.locator('#schermoImpostazioni')).not.toHaveClass(/(^|\s)active(\s|$)/);
      await nuova.keyboard.press('Control+k');
      await expect(nuova.locator('#veloComandi')).toBeVisible();
      await nuova.locator('#cercaComando').fill('provider');
      await nuova.locator('#veloComandi [data-command="providers"]').click();
      await atterraSuProvider(nuova, `foto comando ${modo} ${larghezza}`);
      await nuova.waitForTimeout(400);
      await foto(nuova, `comando-provider-${modo}-${larghezza}x${altezza}`);
      const nota = await giroSenzaChiave(nuova, 900101);
      const collega = nota.getByRole('button', { name: 'Collega un modello', exact: true });
      await expect(collega).toBeVisible();
      await foto(nuova, `nota-chiave-${modo}-${larghezza}x${altezza}`);
      await collega.click();
      await atterraSuProvider(nuova, `foto «Collega un modello» ${modo} ${larghezza}`);
      await nuova.waitForTimeout(400);
      await foto(nuova, `collega-provider-${modo}-${larghezza}x${altezza}`);
      expect(tentate).toEqual([]);
      await nuova.close();
    }
  }
});
