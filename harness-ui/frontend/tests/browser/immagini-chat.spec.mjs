import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const png = new PNG({ width: 16, height: 16 }); png.data.fill(255);
const bytes = PNG.sync.write(png);
const image = { id: 'e'.repeat(64), tipo: 'immagine', nome: 'prova.png', mimeType: 'image/png', byte: bytes.length, url: '/api/v1/chat-images/' + 'e'.repeat(64) };
const envelope = data => ({ ok: true, data });
async function apri(page, name = 'prima', closed = true) {
  await page.evaluate(({name, closed}) => window.__talosHarnessUiRuntime.passaASessione(`image-proof-${name}`, 'workspace', name, 'google/gemini-3.8-flash', { conclusa: closed, modello: 'google/gemini-3.8-flash' }), { name, closed });
}
async function events(page, events) { await page.evaluate(events => { const r = window.__talosHarnessUiRuntime; for (const event of events) r.handleRealEvent(event, r.realSessionState.generation); }, events); }
async function attach(page) {
  await page.getByRole('button', { name: 'Aggiungi contesto', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /Immagine Una foto/ }).click();
  await (await chooser).setFiles({ name: 'prova.png', mimeType: 'image/png', buffer: bytes });
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/sessions/image-proof-*/events', r => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/chat-images', r => r.fulfill({ json: envelope(image) }));
  await page.route('**/api/v1/chat-images/' + image.id, r => r.fulfill({ contentType: 'image/png', body: bytes }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await apri(page);
  await events(page, [{ type: 'RunStarted', input: { consegna: 'Ciao' } }, { type: 'RunFinished' }]);
});

test('IMAGE-08 seguito mostra la foto fuori dalla bolla, apre il dialogo e ritorna al fuoco', async ({page}) => {
  let submitted;
  await page.route('**/api/v1/sessions/image-proof-prima/resume', r => { submitted = r.request().postDataJSON(); return r.fulfill({ json: envelope({sessionId:'image-proof-prima'}) }); });
  await attach(page);
  await expect(page.locator('.talos-image-card--compact')).toBeVisible();
  await page.getByRole('textbox', {name:'Messaggio', exact:true}).fill('Guarda questa foto per favore');
  await page.getByRole('textbox', {name:'Messaggio', exact:true}).press('Enter');
  const preview = page.locator('#conversation .talos-image-card');
  await expect(preview).toBeVisible();
  expect(submitted.immagini).toEqual([{id:image.id}]);
  expect(await preview.evaluate(el => !el.closest('.message-bubble'))).toBe(true);
  await preview.click();
  await expect(page.getByRole('dialog', {name:'Immagine: prova.png'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(preview).toBeFocused();
  await apri(page, 'altra'); await apri(page);
  await events(page, [{type:'RunStarted', input:{consegna:'Guarda questa foto per favore',immagini:[image]}},{type:'RunFinished'}]);
  await expect(preview).toBeVisible();
});

test('NATIVE-UI-01 la testata del giro atteso segue il modello attestato dal server', async ({page}) => {
  await events(page,[{type:'TextMessageContent',messageId:'old',delta:'Risposta precedente'},{type:'RunFinished'}]);
  await page.route('**/api/v1/sessions/image-proof-prima/resume', r => r.fulfill({json:envelope({sessionId:'image-proof-prima'})}));
  await page.getByRole('textbox',{name:'Messaggio',exact:true}).fill('Guarda di nuovo la foto');
  await page.getByRole('textbox',{name:'Messaggio',exact:true}).press('Enter');
  const headers = page.locator('#conversation [data-turno="talos"] .talos-message__meta');
  const old = await headers.first().textContent();
  await events(page,[{type:'RunStarted',input:{seguito:true,consegna:'Guarda di nuovo la foto'},contesto:{modello:'anthropic:claude-sonnet-5'}}]);
  await expect(headers.last()).toContainText('claude-sonnet-5');
  await expect(headers.first()).toHaveText(old);
});

test('NATIVE-UI-02 la scheda del fornitore diretto cerca e salva il modello scelto senza esporre la chiave', async ({page}) => {
  let saved;
  await page.route('**/api/v1/providers', r=>r.fulfill({json:envelope({items:[{id:'gemini',label:'Gemini',keyConfigured:true}]})}));
  await page.route('**/api/v1/providers/gemini/models', r=>r.fulfill({json:envelope({provider:'gemini',modelli:[{id:'gemini:gemini-3.8-flash',nome:'Gemini Flash',provider:'gemini',contextLength:1000000}]})}));
  await page.route('**/api/v1/sessions/image-proof-prima/settings',r=>{saved=r.request().postDataJSON();return r.fulfill({json:envelope({ok:true,...saved})});});
  await page.getByRole('button',{name:'gemini-3.8-flash',exact:true}).click();
  // ⛔ AGGIORNATA il 18/09/2026 — il difetto era della PROVA, non del prodotto.
  // «Diretti» non è più una scheda: l'owner l'11/09/2026 ha chiesto una tab PER FORNITORE
  // («diretti deve diventare per provider, quindi una tab dedicata per gemini openai e
  // anthropic»). Fonte nel prodotto: `src/components/fonti-modelli.js:5-8` e
  // `src/legacy/app.js:5779` («Diretti NON È PIÙ UNA SCHEDA: sono tre»).
  // Ricerca 18/09/2026 — playwright.dev/docs/api/class-locator: con `getByRole` il `name`
  // accetta una RegExp «to match the accessible name» e `exact` è IGNORATO quando la regex
  // c'è; la regex è la forma giusta quando il nome varia «following a predictable pattern»,
  // cioè qui, dove il conteggio fa parte del nome. Mai `.first()`/`.nth()`.
  // ⛔ Il nome accessibile della tab porta il CONTEGGIO («Gemini 1»): serve un prefisso,
  // non `exact` — che qui fallirebbe come falliva `/Diretti/`.
  await page.getByRole('tab',{name:/^Gemini/}).click();
  await page.getByRole('searchbox').fill('gemini');
  await page.getByRole('option',{name:/Gemini Flash gemini:gemini-3.8-flash/}).click();
  await expect.poll(()=>saved?.modello).toBe('gemini:gemini-3.8-flash');
  await expect(page.getByRole('button',{name:'gemini:gemini-3.8-flash',exact:true})).toBeVisible();
});

test('IMAGE-11 upload in corso blocca invio e non entra nella sessione successiva', async ({page}) => {
  let release; const pending = new Promise(resolve => release = resolve);
  await page.route('**/api/v1/chat-images', async r => { await pending; await r.fulfill({json:envelope(image)}); });
  await attach(page);
  await expect(page.getByRole('button',{name:'Invia',exact:true})).toBeDisabled();
  await apri(page,'seconda');
  release();
  await expect(page.getByRole('button',{name:'Invia',exact:true})).toBeEnabled();
  await expect(page.locator('.talos-image-card--compact')).toHaveCount(0);
});

test('IMAGE-12 risposta resume tardiva non riapre la sessione precedente', async ({page}) => {
  let release; const pending = new Promise(resolve => release = resolve);
  let arrived = false;
  await page.route('**/api/v1/sessions/image-proof-prima/resume', async r => { arrived = true; await pending; await r.fulfill({json:envelope({sessionId:'image-proof-prima'})}); });
  await page.getByRole('textbox',{name:'Messaggio',exact:true}).fill('Continuiamo?');
  await page.getByRole('textbox',{name:'Messaggio',exact:true}).press('Enter');
  await expect.poll(() => arrived).toBe(true);
  await apri(page,'seconda'); release();
  await expect.poll(() => page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.id)).toBe('image-proof-seconda');
  await expect(page.getByRole('heading',{name:'seconda',exact:true,level:1})).toBeVisible();
});

for (const via of ['Control+Enter','bivio']) test(`IMAGE-13 ${via} accoda anche i pixel`, async ({page}) => {
  let submitted;
  await page.route('**/api/v1/sessions/image-proof-prima/queue', r => { submitted = r.request().postDataJSON(); return r.fulfill({json:envelope({accodato:true,coda:1})}); });
  await apri(page,'altra');
  await apri(page,'prima',false);
  await events(page,[{type:'RunStarted',input:{consegna:'Aspetta un momento'}}]);
  await attach(page); await expect(page.locator('.talos-image-card--compact')).toBeVisible();
  const composer = page.getByRole('textbox',{name:'Messaggio',exact:true});
  await composer.fill('Poi guarda anche questa');
  await composer.press(via === 'bivio' ? 'Enter' : via);
  if (via === 'bivio') await page.locator('[data-bivio="accoda"]').click();
  await expect.poll(() => submitted?.immagini).toEqual([{id:image.id}]);
  await expect(page.locator('.talos-image-card--compact')).toHaveCount(0);
});
