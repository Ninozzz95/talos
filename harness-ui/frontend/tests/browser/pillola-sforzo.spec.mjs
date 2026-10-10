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

async function apri(page, { modello, effort = null, lingua = 'it', modo = 'light', diretti = false, catalogo = CATALOGO, filoCatalogo = false }) {
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
  await page.locator('[data-open-sheet="model"]').click();
  await expect(page.getByRole('dialog').locator('.effort-picker')).toBeVisible();
  return stato;
}
const tacche = (page) => page.getByRole('dialog').locator('.effort-picker-tick').allTextContents();
const scegli = (page, indice) => page.getByRole('dialog').locator('.effort-picker-range').evaluate((r, i) => {
  r.value = String(i); r.dispatchEvent(new Event('input', { bubbles: true }));
}, indice);
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
      await expect(page.locator('.effort-picker-selected')).toHaveText('Max');
      // la tacca colorata è quella scelta (la prima foto mostrava «Max» in testata e «Alto» colorata)
      await expect(page.getByRole('dialog').locator('.effort-picker-tick-selected')).toHaveText('Max');
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'max' });
      // owner 08/10/2026: «leva lo shadow interno della modale» — il riquadro del modello sta in linea, senza ombra
      await expect(page.getByRole('dialog').locator('.model-picker-panel').first()).toHaveCSS('box-shadow', 'none');
      await foto(page, `sforzo-01-max-${modo}.png`);
      await scegli(page, 4);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Molto alto');
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'xhigh' });
      expect(s.scritture, 'nessun\'altra scrittura').toEqual([]);
    });

    test('SFORZO-02 — un modello che arriva a xhigh: niente «Max»; una sessione salvata a xhigh dice «Molto alto»', async ({ page }) => {
      const s = await apri(page, { modello: 'x-ai/grok-4.6', effort: 'xhigh', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto']);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Molto alto');
      expect(s.scritture).toEqual([]);
    });

    test('SFORZO-03 — al contrario: max salvato su un modello che arriva a high scende ad «Alto», mai più su', async ({ page }) => {
      await apri(page, { modello: 'google/gemini-3.7-flash', effort: 'max', modo });
      expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto']);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Alto');
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
    const nota = (page) => page.getByRole('dialog').locator('.effort-picker-nota');

    test('A9-PILLOLA-01 — «Molto alto» salvato su glm-5.3-flash: la pillola dice «Max», e la riga lo spiega', async ({ page }) => {
      const s = await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'xhigh', modo, diretti: true });
      expect(await tacche(page), 'niente «Off»: questo modello non si spegne (parte «low»)').toEqual(['Basso', 'Alto', 'Max']);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Max');
      await expect(page.getByRole('dialog').locator('.effort-picker-tick-selected')).toHaveText('Max');
      await expect(nota(page)).toBeVisible();
      await expect(nota(page)).toHaveText('Hai scelto «Molto alto»: questo modello riceve «Max».');
      await foto(page, `a9-01-xhigh-max-${modo}.png`);
      // una scelta fatta adesso è una di quelle che partono così come sono: la riga sparisce
      await scegli(page, 1);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Alto');
      await expect(nota(page)).toBeHidden();
      await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'high' });
      expect(s.scritture, 'nessun’altra scrittura').toEqual([]);
    });

    test('A9-PILLOLA-02 — «Off» salvato su glm-5.3-flash: la pillola dice «Basso», quello che parte davvero', async ({ page }) => {
      const s = await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'none', modo, diretti: true });
      await expect(page.locator('.effort-picker-selected')).toHaveText('Basso');
      await expect(nota(page)).toHaveText('Hai scelto «Off»: questo modello riceve «Basso».');
      expect(s.scritture).toEqual([]);
    });

    test('A9-PILLOLA-03 — un modello Z.AI senza voce propria: nessun cursore, «Automatico», e la riga dice perché', async ({ page }) => {
      const s = await apri(page, { modello: 'zai:glm-9-prova', effort: 'high', modo, diretti: true });
      await expect(page.getByRole('dialog').locator('.effort-picker-range')).toHaveCount(0);
      await expect(page.locator('.effort-picker-selected')).toHaveText('Automatico');
      await expect(nota(page)).toHaveText('Questo modello non riceve un livello di ragionamento: decide il fornitore.');
      await foto(page, `a9-03-automatico-${modo}.png`);
      expect(s.scritture).toEqual([]);
    });
  });
}

test('A9-PILLOLA-04 — AL CONTRARIO: un livello che parte com’è non porta la riga; OpenRouter resta com’era', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'high', diretti: true });
  await expect(page.locator('.effort-picker-selected')).toHaveText('Alto');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toBeHidden();
  await page.close();
});

/* Review A9 del desktop (09/10): «Off» salvato su groq gpt-oss — il modello ha altri livelli ma «Off» non parte (decide il
   fornitore). Era «Automatico» con la tacca «Alto» accesa e la riga «non riceve un livello»: una contraddizione a schermo. */
test('A9-PILLOLA-05 — un livello che non parte, su un modello che ne ha altri: «Automatico», nessuna tacca accesa, e la riga lo dice', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = await apri(page, { modello: 'groq:openai/gpt-oss-20b', effort: 'none', diretti: true });
  expect(await tacche(page), 'niente «Off»: questo modello non lo riceve').toEqual(['Basso', 'Medio', 'Alto']);
  await expect(page.locator('.effort-picker-selected')).toHaveText('Automatico');
  await expect(page.getByRole('dialog').locator('.effort-picker-tick-selected')).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toHaveText('Hai scelto «Off»: questo modello non lo riceve, decide il fornitore.');
  // una scelta fatta adesso accende la sua tacca e toglie la riga
  await scegli(page, 1);
  await expect(page.locator('.effort-picker-selected')).toHaveText('Medio');
  await expect(page.getByRole('dialog').locator('.effort-picker-tick-selected')).toHaveText('Medio');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toBeHidden();
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
  await expect(page.locator('.effort-picker-selected')).toHaveText('Basso');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toHaveText('Hai scelto «Off»: questo modello riceve «Basso».');
  await foto(page, 'a9-or-01-off-basso.png');
  expect(s.scritture).toEqual([]);
});

test('A9-OR-PILLOLA-02 — «Molto alto» salvato su gpt-5-nano via OpenRouter: la pillola dice «Alto», quello che parte', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'openai/gpt-5-nano', effort: 'xhigh', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(page.locator('.effort-picker-selected')).toHaveText('Alto');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toHaveText('Hai scelto «Molto alto»: questo modello riceve «Alto».');
});

test('A9-OR-PILLOLA-03 — AL CONTRARIO: un modello OpenRouter che si spegne tiene «Off», e un livello che parte com’è non porta la riga', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', effort: 'xhigh', catalogo: CATALOGO_OR, filoCatalogo: true });
  expect(await tacche(page)).toEqual(['Off', 'Basso', 'Medio', 'Alto', 'Molto alto', 'Max']);
  await expect(page.locator('.effort-picker-selected')).toHaveText('Molto alto');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toBeHidden();
});

test('A9-OR-PILLOLA-04 — AL CONTRARIO: la voce si cerca per id ESATTO, come il clamp del server — un id solo simile resta com’era', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // `zai:glm-5.3-flash` senza `filoDiretti`: il nome coincide con la voce OpenRouter, ma il server non la usa per questa sessione
  await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'none', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toBeHidden();
});

/* Owner 09/10/2026 («Automatico + riga»): sulla sessione vera dell'owner (glm via OpenRouter, nessuna scelta) la pillola diceva
   «Automatico» con la tacca «Alto» accesa, mentre partiva «max». */
test('A9-OR-AUTO-01 — nessuna scelta su glm-5.3-flash: «Automatico», nessuna tacca accesa, e la riga dice che parte «Max»', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const s = await apri(page, { modello: 'z-ai/glm-5.3-flash', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(page.locator('.effort-picker-selected')).toHaveText('Automatico');
  await expect(page.getByRole('dialog').locator('.effort-picker-tick-selected')).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toHaveText('Senza una scelta questo modello riceve «Max».');
  // il cursore sta su «Max», dove arriva il filo, non sul ripiego «Alto» (tacche: Basso, Alto, Max)
  expect(await page.getByRole('dialog').locator('.effort-picker-range').inputValue()).toBe('2');
  await foto(page, 'a9-or-auto-glm.png');
  // una scelta fatta adesso accende la sua tacca e toglie la riga
  await scegli(page, 0);
  await expect(page.locator('.effort-picker-selected')).toHaveText('Basso');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toBeHidden();
  await expect.poll(() => s.impostazioni.at(-1)?.reasoning).toEqual({ effort: 'low' });
});

test('A9-OR-AUTO-02 — AL CONTRARIO: nessuna scelta su un modello che senza scelta non riceve niente (opus): nessuna riga', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'anthropic/claude-opus-5', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(page.locator('.effort-picker-selected')).toHaveText('Automatico');
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toBeHidden();
});

test('A9-OR-AUTO-EN — in inglese', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'z-ai/glm-5.3-flash', lingua: 'en', catalogo: CATALOGO_OR, filoCatalogo: true });
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toHaveText('With no choice, this model receives “Max”.');
});

test('A9-PILLOLA-EN — in inglese (la sorgente)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page, { modello: 'zai:glm-5.3-flash', effort: 'xhigh', lingua: 'en', diretti: true });
  await expect(page.getByRole('dialog').locator('.effort-picker-nota')).toHaveText('You chose “Extra high”: this model receives “Max”.');
});
