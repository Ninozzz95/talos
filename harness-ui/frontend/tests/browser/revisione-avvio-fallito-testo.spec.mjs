/*
 * REVISIONE AVVERSARIA di b597e080e (15/10/2026 sera, bugfixer) — «una chat nuova che non parte tiene il testo, gli allegati e la
 * chat in attesa». «[REGGE]» = attaccato, ha retto. «[ROSSO]» = difetto mostrato.
 *
 * ⛔ Il server di prova (4176) eredita l'ambiente di chi lancia la suite, e `config.mjs:627` legge `OPENROUTER_API_KEY`: con una
 *   chiave nell'ambiente una POST /sessions/custom VERA farebbe partire un giro a pagamento. Quindi: la POST passa al server SOLO se
 *   `GET /api/v1/providers` dice che nessun fornitore ha una chiave (le prove si lanciano con le chiavi tolte dall'ambiente); se
 *   una chiave c'è, la POST si ABORTISCE e la prova lo dice. Ogni altra richiesta non-GET si ferma e si conta.
 *   Così l'errore che la chat riceve è quello VERO del server senza chiave, non una copia scritta qui.
 */
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

const png = new PNG({ width: 16, height: 16 }); png.data.fill(255);
const bytes = PNG.sync.write(png);
const SCRATCH = process.env.TALOS_REVISIONE_FOTO_DIR || null;

async function prepara(page, { ritardo = false, tema = null } = {}) {
  const traffico = { custom: [], risposte: [], altre: [], senzaChiave: null };
  let rilascia = () => {};
  const cancello = ritardo ? new Promise((ok) => { rilascia = ok; }) : Promise.resolve();
  await page.route('**/*', (route) => {
    const metodo = route.request().method();
    if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return route.fallback();
    traffico.altre.push(`${metodo} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  /* La foto si carica DAVVERO sul server di prova (store isolato, nessun costo): con un id inventato qui il server rifiuterebbe
     l'avvio per la foto che non trova («Errore interno», misurato) invece che per la chiave, e la prova misurerebbe un'altra cosa. */
  await page.route('**/api/v1/chat-images', (route) => (route.request().method() === 'POST' ? route.continue() : route.fallback()));
  await page.route('**/api/v1/sessions/custom', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    traffico.custom.push(route.request().postDataJSON());
    if (traffico.senzaChiave !== true) { traffico.risposte.push('ABORTITA: il server di prova ha una chiave'); return route.abort(); }
    await cancello;
    const risposta = await route.fetch();
    const corpo = await risposta.text();
    traffico.risposte.push(`${risposta.status()} ${corpo.slice(0, 400)}`);
    return route.fulfill({ response: risposta, body: corpo });
  });
  if (tema) {
    await page.addInitScript((modo) => {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it', uiFontScale: 'default' }, chat: {}, workspaces: {} }));
    }, tema);
  }
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  /* 15/10/2026 (suite intera): il server di prova è condiviso fra le spec e un'altra salva prima una chiave FINTA di OpenRouter nel
     portachiavi in memoria — la guardia su «tutti i fornitori» cadeva per l'ordine delle spec. La prova usa un fornitore che nessuna
     spec configura (DeepSeek) e guarda solo quello: il rifiuto per la chiave che manca è vero, e un giro pagato resta impossibile
     (col portachiavi `memoria` il server ignora le chiavi d'ambiente, `server.mjs` `ignoraSemiAmbiente`). */
  const fornitori = await (await page.request.get('/api/v1/providers')).json();
  const riga = (Array.isArray(fornitori?.data?.items) ? fornitori.data.items : []).find((r) => (r.id ?? r.provider) === 'deepseek');
  traffico.senzaChiave = Boolean(riga) && riga.keyConfigured !== true;
  expect(traffico.senzaChiave, 'DeepSeek must have no key on the test server').toBe(true);
  await apriChatNuova(page, 'progetto');
  return { traffico, rilascia };
}

async function apriChatNuova(page, nome) {
  await page.evaluate((nomeCartella) => window.__talosHarnessUiRuntime.avviaSessionePendente({ cartellaId: 'default', nomeCartella, modello: 'deepseek:deepseek-chat' }), nome);
  await expect(page.locator('#schermoChat')).toBeVisible();
  await expect(page.locator('#composerInput')).toBeVisible();
}

const composer = (page) => page.locator('#composerInput');
const notaFallita = (page) => page.locator('#conversation').getByText(/Avvio non riuscito/u);
const bolle = (page) => page.locator('#conversation [data-turno="utente"]');

async function invia(page, testo) {
  if (testo !== null) await composer(page).fill(testo);
  await composer(page).press('Enter');
}

async function allegaImmagine(page, nome = 'prova.png') {
  await page.getByRole('button', { name: 'Aggiungi contesto', exact: true }).click();
  const scelta = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Immagine Una foto/u }).click();
  await (await scelta).setFiles({ name: nome, mimeType: 'image/png', buffer: bytes });
}

test('AVVIO-REV-01 [REGGE] — due invii rifiutati: il testo torna tutte e due le volte, una bolla sola, la chat in attesa e il suo titolo', async ({ page }) => {
  const { traffico } = await prepara(page);
  await invia(page, 'Riassumi il README del progetto');
  await expect(notaFallita(page)).toBeVisible();
  await expect(composer(page)).toHaveValue('Riassumi il README del progetto');
  await expect(page.locator('[data-current-session-title]').first()).toHaveText('Nuova · progetto');
  // 15/10 (foto del bugfixer): «Avvio in corso» non resta accanto a «Avvio non riuscito» — la chiave del toast lo sostituisce
  await expect(page.locator('.talos-toast', { hasText: 'Avvio in corso' }), 'the «starting» toast is replaced by the failure').toHaveCount(0);
  await expect(page.locator('.talos-toast', { hasText: 'Avvio non riuscito' })).toHaveCount(1);
  await invia(page, null); // la persona preme di nuovo Invio
  await expect.poll(() => traffico.custom.length).toBe(2);
  await expect(notaFallita(page)).toHaveCount(1);
  await expect(composer(page)).toHaveValue('Riassumi il README del progetto');
  await expect(bolle(page), 'dopo il secondo tentativo una bolla sola').toHaveCount(1);
  expect(traffico.custom[1].consegna).toBe(traffico.custom[0].consegna);
  expect(traffico.altre, 'nessuna altra scrittura').toEqual([]);
  console.log(`[AVVIO-REV-01] risposta vera del server: ${traffico.risposte[0]} — nota: ${JSON.stringify(await notaFallita(page).first().textContent())}`);
});

test('AVVIO-REV-01b [ROSSO] — dopo il rifiuto la TESTATA della chat dice ancora «Compito libero · progetto»: il titolo nuovo va solo agli elementi `[data-current-session-title]`, non alla topbar', async ({ page }) => {
  await prepara(page);
  await invia(page, 'Riassumi il README del progetto');
  await expect(notaFallita(page)).toBeVisible();
  await expect(page.locator('[data-current-session-title]').first()).toHaveText('Nuova · progetto');
  const testate = await page.locator('.talos-topbar h1').evaluateAll((h) => h.map((n) => n.textContent));
  console.log(`[AVVIO-REV-01b] testate delle schermate: ${JSON.stringify(testate)}; riga dell'elenco: ${JSON.stringify(await page.locator('.talos-sidebar').getByText(/Nuova · progetto|in attesa/u).allTextContents())}`);
  await expect(page.locator('#schermoChat .talos-topbar h1'), 'la testata visibile della chat').toHaveText('Nuova · progetto');
});

test('AVVIO-REV-02 [ROSSO] — solo una foto, nessuna parola: dopo il rifiuto il compositore deve restare VUOTO, non dire una frase che la persona non ha scritto', async ({ page }) => {
  const { traffico } = await prepara(page);
  await allegaImmagine(page);
  await expect(page.locator('.talos-image-card--compact')).toHaveCount(1);
  await invia(page, null);
  await expect(notaFallita(page)).toBeVisible();
  console.log(`[AVVIO-REV-02] risposta vera del server: ${traffico.risposte[0]?.slice(0, 160)}`);
  await expect(page.locator('.talos-image-card--compact'), 'la foto torna').toHaveCount(1);
  const scritto = await composer(page).inputValue();
  console.log(`[AVVIO-REV-02] nel compositore dopo il rifiuto: ${JSON.stringify(scritto)}; consegna mandata: ${JSON.stringify(traffico.custom[0]?.consegna)}`);
  expect(scritto, 'la persona non ha scritto niente: nel campo è comparsa la consegna per il modello').toBe('');
});

test('AVVIO-REV-03 [REGGE] — la persona scrive altro mentre la richiesta è in volo: il suo testo nuovo non si sovrascrive', async ({ page }) => {
  const { traffico, rilascia } = await prepara(page, { ritardo: true });
  await invia(page, 'Primo testo');
  await expect.poll(() => traffico.custom.length).toBe(1);
  await composer(page).fill('Scritto nel frattempo');
  rilascia();
  await expect(notaFallita(page)).toBeVisible();
  await expect(composer(page)).toHaveValue('Scritto nel frattempo');
});

test('AVVIO-REV-04 [REGGE] — cambio di chat mentre la richiesta è in volo: niente torna nella chat nuova', async ({ page }) => {
  const { traffico, rilascia } = await prepara(page, { ritardo: true });
  await allegaImmagine(page);
  await expect(page.locator('.talos-image-card--compact')).toHaveCount(1);
  await invia(page, 'Testo della prima chat');
  await expect.poll(() => traffico.custom.length).toBe(1);
  await apriChatNuova(page, 'altro');
  rilascia();
  await expect.poll(() => traffico.risposte.length).toBe(1);
  await page.waitForTimeout(500); // il catch gira dopo la risposta: si lascia il tempo che servirebbe a un ripristino sbagliato
  await expect(composer(page)).toHaveValue('');
  await expect(page.locator('.talos-image-card--compact')).toHaveCount(0);
  await expect(notaFallita(page)).toHaveCount(0);
  await expect(page.locator('#schermoChat .talos-topbar h1')).toHaveText('Nuova · altro');
});

test('AVVIO-REV-05 [REGGE] — /goal in una chat nuova rifiutato: torna «/goal <testo>», e la chat resta in attesa (un secondo /goal riprova)', async ({ page }) => {
  const { traffico } = await prepara(page);
  await invia(page, '/goal Sistema i test rossi');
  await expect(notaFallita(page)).toBeVisible();
  await expect(composer(page)).toHaveValue('/goal Sistema i test rossi');
  await invia(page, null);
  await expect.poll(() => traffico.custom.length).toBe(2);
  expect(traffico.custom.map((c) => c.ferma)).toEqual([true, true]);
  await expect(composer(page)).toHaveValue('/goal Sistema i test rossi');
});

for (const tema of ['light', 'dark']) {
  test(`AVVIO-REV-FOTO — dopo il rifiuto, 1920×1080, tema ${tema}`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await prepara(page, { tema });
    await allegaImmagine(page);
    await expect(page.locator('.talos-image-card--compact')).toHaveCount(1);
    await invia(page, 'Riassumi il README del progetto');
    await expect(notaFallita(page)).toBeVisible();
    await page.waitForTimeout(400);
    if (SCRATCH) await page.screenshot({ path: `${SCRATCH}/avvio-fallito-${tema}.png` });
  });
}

test('AVVIO-REV-06 [REGGE] — testo e foto rifiutati due volte: la foto torna UNA volta sola, il testo è quello scritto', async ({ page }) => {
  const { traffico } = await prepara(page);
  await allegaImmagine(page);
  await expect(page.locator('.talos-image-card--compact')).toHaveCount(1);
  await invia(page, 'Guarda questa foto');
  await expect(notaFallita(page)).toBeVisible();
  await invia(page, null);
  await expect.poll(() => traffico.custom.length).toBe(2);
  await expect(notaFallita(page)).toHaveCount(1);
  await expect(page.locator('.talos-image-card--compact'), 'nessun doppione dopo due rifiuti').toHaveCount(1);
  await expect(composer(page)).toHaveValue('Guarda questa foto');
  expect(traffico.custom.map((c) => (c.immagini ?? []).length)).toEqual([1, 1]);
});
