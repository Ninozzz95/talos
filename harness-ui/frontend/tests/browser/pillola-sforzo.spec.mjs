import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { filoRagionamentoDiretti, livelliRagionamentoDiretti } from '../../../src/model-destination.mjs';
import { filoRagionamentoCatalogo } from '../../../src/runtime-owner-adapter.mjs';

/*
 * ⛔ La pillola dello sforzo dice il vero (08/10/2026, segnalato dal bugfixer, etichette decise dall'owner).
 *   Prima `xhigh` si chiamava «Max» e il `max` del fornitore veniva ridotto a `xhigh` (`livelliEffortDelModello`): su un
 *   modello che dichiara tutti e due il max vero non si sceglieva, e l'etichetta non diceva cosa partiva.
 *   Ora: `xhigh` = «Molto alto» («Extra high»), `max` = «Max», e la pillola mostra solo i livelli che il modello dichiara.
 * Forme del server: il catalogo è quello di `GET /api/v1/models` (`reasoning.supportedEfforts`, in ordine decrescente come
 *   OpenRouter), la scrittura quella di `POST /api/v1/sessions/:id/settings` (`{reasoning:{effort}}`). Ogni altra scrittura si
 *   ferma e si conta.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/pillola-sforzo/', import.meta.url)));
const SID = 'sessione-sforzo';
const CATALOGO = [
  { id: 'anthropic/claude-opus-5', provider: 'anthropic', nome: 'Anthropic: Claude Opus 5',
    reasoning: { supportedEfforts: ['max', 'xhigh', 'high', 'medium', 'low'], defaultEffort: 'high', defaultEnabled: true, mandatory: false } },
  { id: 'x-ai/grok-4.6', provider: 'x-ai', nome: 'xAI: Grok 4.6',
    reasoning: { supportedEfforts: ['xhigh', 'high', 'medium', 'low'], defaultEffort: 'medium', defaultEnabled: true, mandatory: false } },
  { id: 'google/gemini-3.7-flash', provider: 'google', nome: 'Google: Gemini 3.7 Flash',
    reasoning: { supportedEfforts: ['high', 'medium', 'low'], defaultEffort: 'medium', defaultEnabled: true, mandatory: false } },
];

async function apri(page, { modello, effort = null, lingua = 'it', modo = 'light', diretti = false, catalogo = CATALOGO, filoCatalogo = false, pillola = true }) {
  const stato = { impostazioni: [], scritture: [] };
  const sessione = { sessionId: SID, taskId: 'libero:default', nome: 'Sforzo', avviataAlle: '2026-10-08T07:00:00.000Z', conclusa: true,
    modello, modelId: modello, provider: 'cloud', ...(effort ? { reasoning: { effort } } : {}) };
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } }));
  }, { colorMode: modo, uiLanguage: lingua });
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    stato.scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ json: { ok: true, data: { items: [sessione] } } }));
  await page.route(`**/api/v1/sessions/${SID}/events`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  /* A9: con `diretti` la risposta porta anche i livelli e il FILO delle sessioni dirette, calcolati dal server vero (gli stessi
     moduli che `http-app.mjs` serve), non scritti a mano. */
  const extra = diretti ? { livelliDiretti: livelliRagionamentoDiretti(), filoDiretti: filoRagionamentoDiretti() } : {};
  /* A9, seguito OpenRouter (09/10/2026): con `filoCatalogo` anche il filo delle voci del catalogo, dalla funzione vera del server. */
  if (filoCatalogo) extra.filoCatalogo = filoRagionamentoCatalogo(catalogo);
  await page.route('**/api/v1/models', (route) => route.fulfill({ json: { ok: true, data: { modelli: catalogo, daCache: true, ...extra } } }));
  await page.route(`**/api/v1/sessions/${SID}/settings`, (route) => {
    stato.impostazioni.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, data: { updated: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator(`[data-real-session-id="${SID}"]`).click();
  if (pillola) await apriMenu(page);
  return stato;
}
/* ⛔ 24/10/2026 (owner, bozzetto approvato): il livello è la pillola del compositore (`#pillRagionamento`) e il suo menu, non più il
   cursore nel riquadro del modello. Stesse attese di prima, lette da lì: la pillola dice il livello, il menu le righe, la scelta e la
   riga A9. Una scelta chiude il menu (si torna a scrivere, come Hermes): `scegli` lo riapre per le attese che seguono. */
const MENU = '#menuRagionamento';
const livello = (page) => page.locator('#pillRagionamento .talos-chip__label');
const notaMenu = (page) => page.locator(`${MENU} .talos-pillola-ragionamento__nota`);
const sceltaMenu = (page) => page.locator(`${MENU} [role="menuitemradio"][aria-checked="true"]`);
async function apriMenu(page) {
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
  if (!(await page.locator(MENU).count())) await page.locator('#pillRagionamento').click();
  await expect(page.locator(MENU)).toBeVisible();
}
const tacche = async (page) => { await apriMenu(page); return page.locator(`${MENU} [role="menuitemradio"]`).allTextContents(); };
async function scegli(page, indice) {
  await apriMenu(page);
  await page.locator(`${MENU} [role="menuitemradio"]`).nth(indice).click();
  await expect(page.locator(MENU), 'una scelta chiude il menu').toHaveCount(0);
  await apriMenu(page);
}
async function foto(page, nome) {
  await mkdir(FOTO, { recursive: true });
  // le tacche cambiano colore con una transizione: senza aspettarla la prima foto mostrava ancora «Alto» colorata
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
    new Promise((ok) => setTimeout(ok, 3000)),
  ]));
  await writeFile(path.join(FOTO, nome), await page.screenshot());
}

for (const modo of ['light', 'dark']) {
  test.describe(`Pillola dello sforzo · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    test('SFORZO-01 — un modello che dichiara max e xhigh: due livelli coi loro nomi, e «Max» manda max', async ({ page }) => {
      const s = await apri(page, { modello: 'anthropic/claude-opus-5', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto', 'Max']);
      await scegli(page, 5);
      await expect(livello(page)).toHaveText('Max');
      // la tacca colorata è quella scelta (la prima foto mostrava «Max» in testata e «Alto» colorata)
      await expect(sceltaMenu(page)).toHaveText('Max');
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'max' });
      // owner 08/10/2026: «leva lo shadow interno della modale» — il riquadro del modello sta in linea, senza ombra
      await page.keyboard.press('Escape');
      await page.locator('[data-open-sheet="model"]').click();
      await expect(page.getByRole('dialog').locator('.model-picker-panel').first()).toHaveCSS('box-shadow', 'none');
      await apriMenu(page);
      await foto(page, `sforzo-01-max-${modo}.png`);
      await scegli(page, 4);
      await expect(livello(page)).toHaveText('Molto alto');
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'xhigh' });
      expect(s.scritture, 'nessun\'altra scrittura').toEqual([]);
    });

    test('SFORZO-02 — un modello che arriva a xhigh: niente «Max»; una sessione salvata a xhigh dice «Molto alto»', async ({ page }) => {
      const s = await apri(page, { modello: 'x-ai/grok-4.6', effort: 'xhigh', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto']);
      await expect(livello(page)).toHaveText('Molto alto');
      expect(s.scritture).toEqual([]);
    });

    test('SFORZO-03 — al contrario: max salvato su un modello che arriva a high scende ad «Alto», mai più su', async ({ page }) => {
      await apri(page, { modello: 'google/gemini-3.7-flash', effort: 'max', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto']);
      await expect(livello(page)).toHaveText('Alto');
    });
  });
}

test('SFORZO-EN — in inglese (la sorgente): «Extra high» e «Max»', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', lingua: 'en' });
  expect(await tacche(page)).toEqual(['Off', 'Low', 'Medium', 'High', 'Extra high', 'Max']);
});

/*
 * ⛔ A9 (owner 09/10/2026, «la pillola mostra il livello INVIATO al fornitore, con una riga che spiega l'adattamento una volta
 *   sola»). Misurato il 09/10 su r4 col traduttore: su glm-5.3-flash «Molto alto» parte «max» (la pillola mostrava «Alto»),
 *   «Off» parte «low», e un modello Z.AI senza voce propria non riceve nessun livello.
 */
for (const modo of ['light', 'dark']) {
  test.describe(`A9 · il livello del filo · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });
    const nota = notaMenu;

    test('A9-PILLOLA-01 — «Molto alto» salvato su glm-5.3-flash: la pillola dice «Max», e la riga lo spiega', async ({ page }) => {
      const s = await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'xhigh', modo, diretti: true });
      expect(await tacche(page), 'niente «Off»: questo modello non si spegne (parte «low»)').toEqual(['Basso', 'Alto', 'Max']);
      await expect(livello(page)).toHaveText('Max');
      await expect(sceltaMenu(page)).toHaveText('Max');
      await expect(nota(page)).toBeVisible();
      await expect(nota(page)).toHaveText('Hai scelto «Molto alto»: questo modello riceve «Max».');
      await foto(page, `a9-01-xhigh-max-${modo}.png`);
      // una scelta fatta adesso è una di quelle che partono così come sono: la riga sparisce
      await scegli(page, 1);
      await expect(livello(page)).toHaveText('Alto');
      await expect(nota(page)).toBeHidden();
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'high' });
      expect(s.scritture, 'nessun’altra scrittura').toEqual([]);
    });

    test('A9-PILLOLA-02 — «Off» salvato su glm-5.3-flash: la pillola dice «Basso», quello che parte davvero', async ({ page }) => {
      const s = await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'none', modo, diretti: true });
      await expect(livello(page)).toHaveText('Basso');
      await expect(nota(page)).toHaveText('Hai scelto «Off»: questo modello riceve «Basso».');
      expect(s.scritture).toEqual([]);
    });

    /* owner 24/10/2026 (consigliata): un modello che non riceve nessun livello non ha la pillola — come il Mobile, Neon UI, assistant-ui,
       Hugging Face chat-ui e Hermes (`reasoning-pill.tsx:44-46`); «Mostra ragionamento» resta nel riquadro «Modello», solo per lui */
    test('A9-PILLOLA-03 — un modello Z.AI senza voce propria: niente pillola, e «Mostra ragionamento» resta nel riquadro «Modello»', async ({ page }) => {
      const s = await apri(page, { modello: 'zai:glm-9-prova', effort: 'high', modo, diretti: true, pillola: false });
      await expect(page.locator('[data-open-sheet="model"] .talos-chip__label').first()).toContainText('glm-9-prova'); // la sessione è aperta
      await expect(page.locator('#pillRagionamento')).toBeHidden();
      await page.locator('[data-open-sheet="model"]').click();
      await expect(page.getByRole('dialog').locator('#showReasoningToggle')).toBeVisible();
      await expect(page.getByRole('dialog').locator('.effort-picker')).toHaveCount(0);
      await foto(page, `a9-03-senza-pillola-${modo}.png`);
      expect(s.scritture).toEqual([]);
    });
  });
}

test('A9-PILLOLA-04 — AL CONTRARIO: un livello che parte com’è non porta la riga; OpenRouter resta com’era', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'high', diretti: true });
  await expect(livello(page)).toHaveText('Alto');
  await expect(notaMenu(page)).toBeHidden();
  await page.close();
});

/* Review A9 del desktop (09/10): «Off» salvato su groq gpt-oss — il modello ha altri livelli ma «Off» non parte (decide il
   fornitore). Era «Automatico» con la tacca «Alto» accesa e la riga «non riceve un livello»: una contraddizione a schermo. */
test('A9-PILLOLA-05 — un livello che non parte, su un modello che ne ha altri: «Automatico», nessuna tacca accesa, e la riga lo dice', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = await apri(page, { modello: 'groq:openai/gpt-oss-20b', effort: 'none', diretti: true });
  expect(await tacche(page), 'niente «Off»: questo modello non lo riceve').toEqual(['Basso', 'Medio', 'Alto']);
  await expect(livello(page)).toHaveText('Auto'); // «Automatico» per intero nel suggerimento
  await expect(page.locator('#pillRagionamento')).toHaveAttribute('aria-label', /^Livello di ragionamento: Automatico/u);
  await expect(sceltaMenu(page)).toHaveCount(0);
  await expect(notaMenu(page)).toHaveText('Hai scelto «Off»: questo modello non lo riceve, decide il fornitore.');
  // una scelta fatta adesso accende la sua tacca e toglie la riga
  await scegli(page, 1);
  await expect(livello(page)).toHaveText('Medio');
  await expect(sceltaMenu(page)).toHaveText('Medio');
  await expect(notaMenu(page)).toBeHidden();
  await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'medium' });
});

/* ⛔ A9, seguito OpenRouter (09/10/2026): l'owner usa `z-ai/glm-5.3-flash` VIA OPENROUTER, e lì la pillola mostrava ancora il
   livello chiesto. Voci copiate dal catalogo vivo del 4174 (`GET /api/v1/models`, 09/10/2026). */
const CATALOGO_OR = [
  ...CATALOGO,
  { id: 'z-ai/glm-5.3-flash', provider: 'z-ai', nome: 'Z.ai: GLM 5.3 Flash',
    reasoning: { supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max', defaultEnabled: true, mandatory: true } },
  { id: 'openai/gpt-5-nano', provider: 'openai', nome: 'OpenAI: GPT-5 Nano',
    reasoning: { supportedEfforts: ['high', 'medium', 'low', 'minimal'], defaultEffort: 'medium', defaultEnabled: null, mandatory: true } },
];

test('A9-OR-PILLOLA-01 — «Off» salvato su glm-5.3-flash via OpenRouter: niente «Off», la pillola dice «Basso» e la riga lo spiega', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = await apri(page, { modello: 'z-ai/glm-5.3-flash', effort: 'none', catalogo: CATALOGO_OR, filoCatalogo: true });
  expect(await tacche(page), 'niente «Off»: questo modello non si spegne (parte «low»)').toEqual(['Basso', 'Alto', 'Max']);
  await expect(livello(page)).toHaveText('Basso');
  await expect(notaMenu(page)).toHaveText('Hai scelto «Off»: questo modello riceve «Basso».');
  await foto(page, 'a9-or-01-off-basso.png');
  expect(s.scritture).toEqual([]);
});

test('A9-OR-PILLOLA-02 — «Molto alto» salvato su gpt-5-nano via OpenRouter: la pillola dice «Alto», quello che parte', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'openai/gpt-5-nano', effort: 'xhigh', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(livello(page)).toHaveText('Alto');
  await expect(notaMenu(page)).toHaveText('Hai scelto «Molto alto»: questo modello riceve «Alto».');
});

test('A9-OR-PILLOLA-03 — AL CONTRARIO: un modello OpenRouter che si spegne tiene «Off», e un livello che parte com’è non porta la riga', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', effort: 'xhigh', catalogo: CATALOGO_OR, filoCatalogo: true });
  expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto', 'Max']);
  await expect(livello(page)).toHaveText('Molto alto');
  await expect(notaMenu(page)).toBeHidden();
});

test('A9-OR-PILLOLA-04 — AL CONTRARIO: la voce si cerca per id ESATTO, come il clamp del server — un id solo simile resta com’era', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // `zai:glm-5.3-flash` senza `filoDiretti`: il nome coincide con la voce OpenRouter, ma il server non la usa per questa sessione
  await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'none', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(notaMenu(page)).toBeHidden();
});

/* Owner 09/10/2026 («Automatico + riga»): sulla sessione vera dell'owner (glm via OpenRouter, nessuna scelta) la pillola diceva
   «Automatico» con la tacca «Alto» accesa, mentre partiva «max». */
test('A9-OR-AUTO-01 — nessuna scelta su glm-5.3-flash: «Automatico», nessuna tacca accesa, e la riga dice che parte «Max»', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = await apri(page, { modello: 'z-ai/glm-5.3-flash', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(livello(page)).toHaveText('Auto'); // «Automatico» per intero nel suggerimento
  await expect(page.locator('#pillRagionamento')).toHaveAttribute('aria-label', /^Livello di ragionamento: Automatico/u);
  await expect(sceltaMenu(page)).toHaveCount(0);
  await expect(notaMenu(page)).toHaveText('Senza una scelta questo modello riceve «Max».');
  // nel menu le tre righe che partono così come sono, nessuna segnata: la riga A9 dice che parte «Max»
  expect(await tacche(page)).toEqual(['Basso', 'Alto', 'Max']);
  await foto(page, 'a9-or-auto-glm.png');
  // una scelta fatta adesso accende la sua tacca e toglie la riga
  await scegli(page, 0);
  await expect(livello(page)).toHaveText('Basso');
  await expect(notaMenu(page)).toBeHidden();
  await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'low' });
});

test('A9-OR-AUTO-02 — AL CONTRARIO: nessuna scelta su un modello che senza scelta non riceve niente (opus): nessuna riga', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(livello(page)).toHaveText('Auto'); // «Automatico» per intero nel suggerimento
  await expect(page.locator('#pillRagionamento')).toHaveAttribute('aria-label', /^Livello di ragionamento: Automatico/u);
  await expect(notaMenu(page)).toBeHidden();
});

test('A9-OR-AUTO-EN — in inglese', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'z-ai/glm-5.3-flash', lingua: 'en', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(notaMenu(page)).toHaveText('With no choice, this model receives “Max”.');
});

test('A9-PILLOLA-EN — in inglese (la sorgente)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'xhigh', lingua: 'en', diretti: true });
  await expect(notaMenu(page)).toHaveText('You chose “Extra high”: this model receives “Max”.');
});

/*
 * ⭐ 24/10/2026 — la pillola del ragionamento nel compositore (owner, bozzetto approvato). Ricerca: W3C APG «Menu Button» e MDN
 *   `menuitemradio` (Invio/Spazio/↓ aprono col fuoco sulla scelta, ↑ sull'ultima, frecce e Home/Fine si muovono, Esc torna al
 *   pulsante); Hermes `reasoning-pill.tsx:74-80` (dopo una scelta si torna a SCRIVERE).
 */
test('PILLOLA-RAG-B1 — tastiera: ↓ apre sulla scelta, frecce e Fine si muovono, Esc torna alla pillola, Invio sceglie e si torna a scrivere', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = await apri(page, { modello: 'anthropic/claude-opus-5', effort: 'medium', pillola: false });
  const pillola = page.locator('#pillRagionamento');
  await expect(pillola).toHaveAttribute('aria-haspopup', 'menu');
  await expect(pillola).toHaveAttribute('aria-expanded', 'false');
  await pillola.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(MENU)).toBeVisible();
  await expect(pillola).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`${MENU} [role="menuitemradio"]:focus`)).toHaveText('Medio');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`${MENU} [role="menuitemradio"]:focus`)).toHaveText('Alto');
  await page.keyboard.press('End');
  await expect(page.locator(`${MENU} :focus`)).toHaveAttribute('role', 'menuitemcheckbox'); // l'ultima voce è «Mostra ragionamento»
  await page.keyboard.press('Escape');
  await expect(page.locator(MENU)).toHaveCount(0);
  await expect(pillola).toBeFocused();
  expect(s.impostazioni, 'Esc non sceglie niente').toEqual([]);
  // ↑ apre sull'ultima; poi Home e Invio sulla prima riga
  await page.keyboard.press('ArrowUp');
  await expect(page.locator(`${MENU} :focus`)).toHaveAttribute('role', 'menuitemcheckbox');
  await page.keyboard.press('Home');
  await expect(page.locator(`${MENU} :focus`)).toHaveText('Off');
  await page.keyboard.press('Enter');
  await expect(page.locator(MENU)).toHaveCount(0);
  await expect(page.locator('#composerInput'), 'dopo una scelta si torna a scrivere (Hermes)').toBeFocused();
  await expect(livello(page)).toHaveText('Off');
  await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'none' });
  expect(s.scritture).toEqual([]);
});

test('PILLOLA-RAG-B2 — «Mostra ragionamento» nel menu: cambia senza chiudere, la radice lo dice, e il clic fuori chiude', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5' });
  const mostra = page.locator(`${MENU} #showReasoningToggle`);
  await expect(mostra).toHaveAttribute('role', 'menuitemcheckbox');
  await expect(mostra, 'A14: di serie acceso').toHaveAttribute('aria-checked', 'true');
  await mostra.click();
  await expect(page.locator(MENU), 'l\'interruttore non chiude il menu').toBeVisible();
  await expect(mostra).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('html')).toHaveAttribute('data-mostra-ragionamento', 'no');
  await mostra.click();
  await expect(page.locator('html')).toHaveAttribute('data-mostra-ragionamento', 'si');
  // il menu sta sopra il centro del campo di testo: il clic «fuori» va nella conversazione
  await page.mouse.click(960, 200);
  await expect(page.locator(MENU), 'un clic fuori chiude').toHaveCount(0);
});

test('PILLOLA-RAG-B3 — il riquadro si chiama «Modello» e non ha più il ragionamento, quando la pillola c\'è', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', pillola: false });
  await page.locator('[data-open-sheet="model"]').click();
  const riquadro = page.getByRole('dialog', { name: 'Modello', exact: true });
  await expect(riquadro).toBeVisible();
  await expect(riquadro.locator('.effort-picker')).toHaveCount(0);
  await expect(riquadro.locator('#showReasoningToggle')).toHaveCount(0);
  await foto(page, 'pillola-rag-b3-riquadro-modello.png');
});

/* owner 24/10 (compositore unico chat/codice): la riga dei pulsanti del compositore non va mai a capo. Le larghezze strette si
   provano sul DOM (owner 29/09: niente foto sotto 1920×1080), anche col nome di modello più lungo del catalogo di prova. */
for (const modello of ['anthropic/claude-opus-5', 'z-ai/glm-5.3-flash']) {
  test(`PILLOLA-RAG-B4 — una riga sola di pulsanti a 1920, 1440, 1280 e 1024 (${modello})`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await apri(page, { modello, effort: 'xhigh', catalogo: CATALOGO_OR, filoCatalogo: true, pillola: false });
    await expect(page.locator('#pillRagionamento')).toBeVisible();
    for (const larghezza of [1920, 1440, 1280, 1024]) {
      await page.setViewportSize({ width: larghezza, height: 900 });
      await page.waitForTimeout(300);
      const misura = await page.evaluate(() => {
        const barra = document.querySelector('.talos-composer__bar');
        const pulsanti = [...barra.querySelectorAll(':scope > button, :scope > span')].filter((b) => b.getBoundingClientRect().height > 0 && getComputedStyle(b).display !== 'none');
        const centri = pulsanti.map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height / 2; });
        const fuori = pulsanti.filter((b) => b.getBoundingClientRect().right > barra.getBoundingClientRect().right + 1).length;
        return { righe: Math.round(Math.max(...centri) - Math.min(...centri)) <= 8 ? 1 : 2, fuori };
      });
      expect(misura, `${larghezza}px`).toEqual({ righe: 1, fuori: 0 });
    }
  });
}
