import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { applicaAzione, validaAzione } from '../../../src/preferenze-modelli.mjs';

/*
 * 29/10/2026 — il selettore dei modelli rifatto dal bozzetto approvato dall'owner (`bozzetto-modelli/index.html`, pubblicato su
 *   claude.ai/artifact/YCCe4Aktz2uVwMgS6d5oJE). Ogni parte nuova ha la sua prova, e le parti che c'erano già restano provate da
 *   `selettore-modello-in-vista.spec.mjs` (riga in uso al centro, gruppo dell'autore aperto, si muove solo la lista).
 * Forme del server copiate dalle prove sorelle: catalogo di `GET /api/v1/models`, scrittura `POST /api/v1/sessions/:id/settings`;
 *   i modelli locali da `GET /api/v1/local-models` (`items`), i fornitori da `GET /api/v1/providers` del server di prova (store
 *   isolato, nessuna chiave: Anthropic, Gemini e OpenAI «non collegati»). Ogni altra scrittura si ferma e si conta.
 * Owner 29/10/2026 (domanda 2): Preferiti e Recenti stanno SUL SERVER (`GET/POST /api/v1/model-preferences`). Qui la rotta la
 *   serve un archivio in memoria per prova che usa le STESSE funzioni del server (`validaAzione`, `applicaAzione` di
 *   `src/preferenze-modelli.mjs`): due prove parallele non si sporcano a vicenda, e il contratto è quello vero.
 */
const FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/selettore-modelli-bozzetto/', import.meta.url)));
const SID = 'sessione-bozzetto';
const IN_USO = 'xiaomi/mimo-v2.6-flash';
const CATALOGO = [
  { id: 'xiaomi/mimo-v2.6-flash', provider: 'xiaomi', nome: 'Xiaomi: MiMo V2.6 Flash', contextLength: 262_144, prezzoPrompt: '0.0000001', prezzoCompletion: '0.0000003',
    inputModalities: ['text', 'image'], supportedParameters: ['tools', 'reasoning'], reasoning: { supportedEfforts: ['high', 'medium', 'low'] } },
  { id: 'xiaomi/mimo-v2.6', provider: 'xiaomi', nome: 'Xiaomi: MiMo V2.6', contextLength: 131_072, prezzoPrompt: '0.0000004', prezzoCompletion: '0.0000016',
    inputModalities: ['text'], supportedParameters: ['tools'] },
  { id: 'z-ai/glm-5.3-flash', provider: 'z-ai', nome: 'Z.ai: GLM 5.3 Flash', contextLength: 202_752, prezzoPrompt: '0.00000006', prezzoCompletion: '0.0000004',
    inputModalities: ['text'], supportedParameters: ['tools', 'reasoning'], reasoning: { supportedEfforts: ['max', 'high', 'low'] } },
  { id: 'z-ai/glm-5.3-air:free', provider: 'z-ai', nome: 'Z.ai: GLM 5.3 Air (free)', contextLength: 131_072, prezzoPrompt: '0', prezzoCompletion: '0',
    inputModalities: ['text'], supportedParameters: [] },
  { id: 'anthropic/claude-sonnet-5.5', provider: 'anthropic', nome: 'Anthropic: Claude Sonnet 5.5', contextLength: 1_000_000, prezzoPrompt: '0.000003', prezzoCompletion: '0.000015',
    inputModalities: ['text', 'image'], supportedParameters: ['tools', 'reasoning'], reasoning: { supportedEfforts: ['high', 'medium', 'low'] } },
  { id: 'meta-llama/llama-5-8b', provider: 'meta-llama', nome: 'Meta: Llama 5 8B', contextLength: 32_768, prezzoPrompt: '0.00000002', prezzoCompletion: '0.00000005',
    inputModalities: ['text'], supportedParameters: [] },
];

async function apri(page, { modo = 'dark', lingua = 'en', preferiti = [], recenti = [], locali = [], localiPreferiti = [], localiRecenti = [], rifiutaStelle = false } = {}) {
  const stato = { impostazioni: [], scritture: [], preferenze: { preferiti: [...preferiti], recenti: [...recenti] }, azioni: [] };
  const sessione = { sessionId: SID, taskId: 'libero:default', nome: 'Bozzetto', avviataAlle: '2026-10-29T07:00:00.000Z', conclusa: true,
    modello: IN_USO, modelId: IN_USO, provider: 'cloud' };
  await page.addInitScript(({ colorMode, uiLanguage, modelliPreferiti, modelliRecenti }) => {
    if (sessionStorage.getItem('seme-fatto')) return; // un ricaricamento non rimette il seme: si vede cosa ha salvato la app
    sessionStorage.setItem('seme-fatto', '1');
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage },
      chat: { model: 'xiaomi/mimo-v2.6-flash', modelliPreferiti, modelliRecenti } }));
  }, { colorMode: modo, uiLanguage: lingua, modelliPreferiti: localiPreferiti, modelliRecenti: localiRecenti });
  await page.route('**/api/**', (rotta) => {
    const r = rotta.request();
    if (r.method() === 'GET') return rotta.fallback();
    stato.scritture.push(`${r.method()} ${new URL(r.url()).pathname}`);
    return rotta.abort();
  });
  await page.route('**/api/v1/sessions', (route) => route.fulfill({ json: { ok: true, data: { items: [sessione] } } }));
  await page.route(`**/api/v1/sessions/${SID}/events`, (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `retry: 3600000\ndata: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n` }));
  await page.route('**/api/v1/models', (route) => route.fulfill({ json: { ok: true, data: { modelli: CATALOGO, daCache: true } } }));
  await page.route('**/api/v1/local-models', (route) => route.fulfill({ json: { ok: true, data: { items: locali } } }));
  await page.route('**/api/v1/model-preferences', (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { ok: true, data: stato.preferenze } });
    try {
      const azione = validaAzione(req.postDataJSON());
      stato.azioni.push(azione);
      if (rifiutaStelle && azione.azione === 'preferito') throw Object.assign(new Error('full'), { code: 'MODEL_FAVOURITES_FULL' });
      stato.preferenze = applicaAzione(stato.preferenze, azione);
      return route.fulfill({ json: { ok: true, data: stato.preferenze } });
    } catch (e) {
      return route.fulfill({ status: e.code === 'MODEL_FAVOURITES_FULL' ? 409 : 400, json: { ok: false, error: { code: e.code } } });
    }
  });
  await page.route(`**/api/v1/sessions/${SID}/settings`, (route) => {
    stato.impostazioni.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, data: { updated: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator(`[data-real-session-id="${SID}"]`).click();
  return stato;
}
const velo = (page) => page.locator('#veloModello');
const lista = (page) => velo(page).locator('.model-picker-list');
const riga = (page, id) => lista(page).locator(`.model-picker-option[data-model-value="${id}"]`);
async function apriSelettore(page) {
  await page.locator('[data-open-sheet="model"]').click();
  await expect(velo(page)).toBeVisible();
  await expect(riga(page, IN_USO).first()).toBeVisible();
}
const salvato = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1') || '{}').chat || {});

test.use({ viewport: { width: 1920, height: 1080 } });

test('SEL-BOZZ-01 — in testata il modello IN USO: nome · contesto · $in → $out', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await expect(velo(page).locator('.talos-dialog__header .model-picker-in-use')).toHaveCount(1);
  await expect(velo(page).locator('.talos-dialog__header .talos-eyebrow')).toHaveCount(0); // owner 29/10: via «Session», come il bozzetto
  await expect(velo(page).locator('.model-picker-in-use strong')).toHaveText('MiMo V2.6 Flash · 262k · $0.10 → $0.30');
  // AL CONTRARIO: riaperto il velo, la pillola non si raddoppia (il velo si rimonta a ogni apertura)
  await page.keyboard.press('Escape');
  await apriSelettore(page);
  await expect(velo(page).locator('.model-picker-in-use')).toHaveCount(1);
  await expect(velo(page).locator('.talos-dialog__footer .model-picker-footer')).toHaveCount(1);
  expect(s.scritture).toEqual([]);
});

test('SEL-BOZZ-02 — riga: id sotto il nome, capacità vere, contesto, prezzo d’ingresso E d’uscita, «Free» solo sui gratis', async ({ page }) => {
  await apri(page);
  await apriSelettore(page);
  const r = riga(page, IN_USO).last();
  await expect(r.locator('.model-picker-option-name strong')).toHaveText('MiMo V2.6 Flash');
  await expect(r.locator('.model-picker-option-name small')).toHaveText(IN_USO);
  await expect(r.locator('[data-capacita="ragiona"]')).toHaveAttribute('data-ha', 'true');
  await expect(r.locator('[data-capacita="vede"]')).toHaveAttribute('data-ha', 'true');
  await expect(r.locator('[data-capacita="attrezzi"]')).toHaveAttribute('data-ha', 'true');
  await expect(r.locator('.model-picker-option-ctx')).toHaveText('262k');
  await expect(r.locator('.model-picker-option-price')).toHaveText('$0.10 → $0.30');
  await expect(r.locator('.model-picker-free')).toHaveCount(0);
  const altra = riga(page, 'xiaomi/mimo-v2.6');
  await expect(altra.locator('[data-capacita="ragiona"]')).toHaveAttribute('data-ha', 'false');
  await expect(altra.locator('[data-capacita="vede"]')).toHaveAttribute('data-ha', 'false');
  // il gruppo dell'autore porta il nome umano, non la sigla in maiuscolo
  await expect(velo(page).locator('.model-picker-group-header[aria-expanded="true"] .model-picker-group-name')).toHaveText('Xiaomi');
  await expect(velo(page).locator('.model-picker-group-name', { hasText: 'Z.ai' })).toHaveCount(1);
  await velo(page).locator('.model-picker-group-header', { hasText: 'Z.ai' }).click();
  const gratis = riga(page, 'z-ai/glm-5.3-air:free');
  await expect(gratis.locator('.model-picker-free')).toHaveText('Free');
  await expect(gratis.locator('.model-picker-option-price')).toHaveText('—');
});

test('SEL-BOZZ-03 — filtri per capacità: si sommano, e «Clear search and filters» riporta tutto', async ({ page }) => {
  await apri(page);
  await apriSelettore(page);
  const chip = (f) => velo(page).locator(`.model-picker-chip[data-filtro="${f}"]`);
  await chip('vede').click();
  await expect(chip('vede')).toHaveAttribute('aria-pressed', 'true');
  await expect(velo(page).locator('.model-picker-group-name').first()).toHaveText('Results');
  await expect(lista(page).locator('.model-picker-option')).toHaveCount(2); // MiMo Flash e Sonnet vedono le immagini
  await chip('gratis').click();
  await expect(lista(page).locator('.model-picker-option')).toHaveCount(0);
  await expect(lista(page).locator('.model-picker-empty h3')).toHaveText('No model matches');
  await lista(page).getByRole('button', { name: 'Clear search and filters' }).click();
  await expect(chip('vede')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip('gratis')).toHaveAttribute('aria-pressed', 'false');
  await expect(velo(page).locator('.model-picker-search input')).toBeFocused();
  await expect(velo(page).locator('.model-picker-group-name', { hasText: 'Results' })).toHaveCount(0);
  // AL CONTRARIO: un filtro solo lascia passare chi ce l'ha, non chi non ce l'ha
  await chip('gratis').click();
  await expect(lista(page).locator('.model-picker-option')).toHaveCount(1);
  await expect(riga(page, 'z-ai/glm-5.3-air:free')).toHaveCount(1);
});

test('SEL-BOZZ-04 — ordine: più economici prima e contesto più grande prima', async ({ page }) => {
  await apri(page);
  await apriSelettore(page);
  const ordine = () => lista(page).locator('.model-picker-option').evaluateAll((rs) => rs.map((r) => r.dataset.modelValue));
  await velo(page).locator('.model-picker-sort select').selectOption('prezzo');
  expect((await ordine())[0]).toBe('z-ai/glm-5.3-air:free');
  expect((await ordine()).at(-1)).toBe('anthropic/claude-sonnet-5.5');
  await velo(page).locator('.model-picker-sort select').selectOption('contesto');
  expect((await ordine())[0]).toBe('anthropic/claude-sonnet-5.5');
  expect((await ordine()).at(-1)).toBe('meta-llama/llama-5-8b');
});

test('SEL-BOZZ-05 — la stella: Preferiti in cima, salvati SUL SERVER (owner 29/10), e restano dopo un ricaricamento', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await expect(velo(page).locator('[data-sezione="preferiti"]')).toHaveCount(0);
  const r = riga(page, 'xiaomi/mimo-v2.6');
  await r.hover();
  await r.locator('.model-picker-star').click();
  await expect(velo(page).locator('[data-sezione="preferiti"] .model-picker-group-name')).toHaveText('Favourites');
  await expect(velo(page).locator('[data-sezione="preferiti"] .model-picker-option')).toHaveCount(1);
  await expect(riga(page, 'xiaomi/mimo-v2.6').last().locator('.model-picker-star')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => s.preferenze.preferiti).toEqual(['xiaomi/mimo-v2.6']);
  expect(s.azioni.at(-1)).toEqual({ azione: 'preferito', modello: 'xiaomi/mimo-v2.6', attivo: true });
  expect((await salvato(page)).modelliPreferiti ?? []).toEqual([]); // niente più nelle impostazioni locali
  // la stella non sceglie il modello
  await expect(velo(page).locator('.model-picker-in-use strong')).toContainText('MiMo V2.6 Flash');
  await page.reload();
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await page.locator(`[data-real-session-id="${SID}"]`).click();
  await apriSelettore(page);
  await expect(velo(page).locator('[data-sezione="preferiti"] .model-picker-option')).toHaveCount(1);
  // AL CONTRARIO: tolta la stella, la sezione sparisce e la lista salvata si svuota
  await velo(page).locator('[data-sezione="preferiti"] .model-picker-star').click();
  await expect(velo(page).locator('[data-sezione="preferiti"]')).toHaveCount(0);
  await expect.poll(() => s.preferenze.preferiti).toEqual([]);
});

test('SEL-BOZZ-06 — nel velo il clic SEGNA, «Done» applica (sincronizzato col server) e il modello entra fra gli usati di recente', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await velo(page).locator('.model-picker-group-header', { hasText: 'Z.ai' }).click();
  await riga(page, 'z-ai/glm-5.3-flash').click();
  await expect(riga(page, 'z-ai/glm-5.3-flash')).toHaveAttribute('aria-selected', 'true');
  await expect(velo(page)).toBeVisible();
  expect(s.impostazioni).toEqual([]);
  await velo(page).locator('.talos-dialog__footer').getByRole('button', { name: 'Done' }).click();
  await expect(velo(page)).toBeHidden();
  await expect.poll(() => s.impostazioni.at(-1)?.modello).toBe('z-ai/glm-5.3-flash');
  await expect.poll(() => s.preferenze.recenti).toEqual(['z-ai/glm-5.3-flash']); // sul server, non nelle impostazioni locali
  expect((await salvato(page)).model).toBe('z-ai/glm-5.3-flash');
  await page.locator('[data-open-sheet="model"]').click();
  await expect(velo(page)).toBeVisible();
  await expect(velo(page).locator('[data-sezione="recenti"] .model-picker-group-name')).toHaveText('Recently used');
  await expect(velo(page).locator('.model-picker-in-use strong')).toContainText('GLM 5.3 Flash');
  expect(s.scritture).toEqual([]);
});

test('SEL-BOZZ-07 — AL CONTRARIO: segnato e chiuso con Esc, il modello NON cambia e niente parte verso il server', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await riga(page, 'xiaomi/mimo-v2.6').click();
  await page.keyboard.press('Escape');
  await expect(velo(page)).toBeHidden();
  expect(s.impostazioni).toEqual([]);
  await apriSelettore(page);
  await expect(lista(page).locator('.model-picker-option[aria-selected="true"]')).toHaveAttribute('data-model-value', IN_USO);
});

test('SEL-BOZZ-08 — doppio clic sceglie e chiude', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await riga(page, 'xiaomi/mimo-v2.6').dblclick();
  await expect(velo(page)).toBeHidden();
  await expect.poll(() => s.impostazioni.at(-1)?.modello).toBe('xiaomi/mimo-v2.6');
});

test('SEL-BOZZ-09 — tastiera: Ctrl K va alla ricerca (la palette non si apre), ↓ ↑ scorrono le righe, Invio sceglie', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await velo(page).locator('.talos-dialog__footer').getByRole('button', { name: 'Done' }).focus();
  await page.keyboard.press('Control+K');
  await expect(velo(page).locator('.model-picker-search input')).toBeFocused();
  await expect(page.locator('#commandDialog[open], #veloComandi:not([hidden])')).toHaveCount(0);
  await page.keyboard.type('mimo');
  await page.keyboard.press('ArrowDown');
  await expect(riga(page, 'xiaomi/mimo-v2.6')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(riga(page, IN_USO)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(riga(page, 'xiaomi/mimo-v2.6')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(velo(page).locator('.model-picker-search input')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(velo(page)).toBeHidden();
  await expect.poll(() => s.impostazioni.at(-1)?.modello).toBe('xiaomi/mimo-v2.6');
});

test('SEL-BOZZ-10 — fonti in COLONNA: pallino, conto, «—» senza chiave, e lo stato vuoto con l’azione per collegarla', async ({ page }) => {
  await apri(page);
  await apriSelettore(page);
  const fonti = velo(page).locator('.model-picker-sources');
  await expect(fonti).toHaveAttribute('aria-orientation', 'vertical');
  await expect(velo(page).locator('.model-picker-sources-title')).toHaveText('Where it runs');
  await expect(fonti.locator('[data-picker-source="openrouter"] .model-picker-source-count')).toHaveText(String(CATALOGO.length));
  const anthropic = fonti.locator('[data-picker-source="anthropic"]');
  await expect(anthropic.locator('.model-picker-source-count')).toHaveText('—');
  await expect(anthropic.locator('.model-picker-source-dot')).toHaveAttribute('data-collegato', 'false');
  await expect(fonti.getByRole('tab', { name: 'Anthropic —', exact: true })).toHaveCount(1); // il pallino non entra nel nome della scheda
  // la colonna sta a sinistra dell'elenco, una scheda sotto l'altra
  const [a, b, l] = await Promise.all([fonti.locator('[role="tab"]').nth(0).boundingBox(), fonti.locator('[role="tab"]').nth(1).boundingBox(), lista(page).boundingBox()]);
  expect(b.y).toBeGreaterThan(a.y);
  expect(Math.abs(b.x - a.x)).toBeLessThan(2);
  expect(l.x).toBeGreaterThan(a.x + a.width - 1);
  // ↓ sulla colonna verticale passa alla scheda dopo
  await fonti.locator('[data-picker-source="openrouter"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(fonti.locator('[data-picker-source="locali"]')).toHaveAttribute('aria-selected', 'true');
  await anthropic.click();
  await expect(lista(page).locator('.model-picker-empty h3')).toHaveText('Anthropic is not connected');
  await lista(page).getByRole('button', { name: 'Connect Anthropic' }).click();
  await expect(velo(page)).toBeHidden();
  await expect(page.locator('#providerList')).toBeVisible();
});

test('SEL-BOZZ-11 — Locali vuoti: «Open Models lab» chiude il velo e apre il Laboratorio', async ({ page }) => {
  await apri(page);
  await apriSelettore(page);
  await velo(page).locator('[data-picker-source="locali"]').click();
  await expect(lista(page).locator('.model-picker-empty h3')).toHaveText('No local models yet');
  await lista(page).getByRole('button', { name: 'Open Models lab' }).click();
  await expect(velo(page)).toBeHidden();
  await expect(page.locator('[data-model-lab-panel="huggingface"]')).toBeVisible();
});

test('SEL-BOZZ-12 — Locali con un modello: si sceglie come prima (valore `local:`), con la nota del computer', async ({ page }) => {
  const s = await apri(page, { locali: [{ id: 'qwen3-8b-q4', name: 'Qwen3 8B', bytes: 5_000_000_000, state: 'ready' }] });
  await apriSelettore(page);
  await velo(page).locator('[data-picker-source="locali"]').click();
  const r = lista(page).locator('[data-model-picker-local="local:qwen3-8b-q4"]');
  await expect(r).toHaveCount(1);
  await expect(lista(page).locator('.model-picker-source-note')).toHaveCount(1);
  await r.dblclick();
  await expect.poll(() => s.impostazioni.at(-1)?.modello).toBe('local:qwen3-8b-q4');
});

test('SEL-BOZZ-13 — stretto (finestra a 700 px, il bozzetto sotto 720): le fonti diventano una riga che scorre, niente esce dal velo', async ({ page }) => {
  await apri(page);
  await page.setViewportSize({ width: 700, height: 900 }); // la app desktop non ha una vista telefono: si stringe la finestra a sessione aperta
  await apriSelettore(page);
  const fonti = velo(page).locator('.model-picker-sources');
  // la colonna si ridisegna a ogni catalogo che arriva: si misura quando i conti sono quelli finali
  await expect(fonti.locator('[data-picker-source="openrouter"] .model-picker-source-count')).toHaveText(String(CATALOGO.length));
  await expect(fonti.locator('[data-picker-source="anthropic"] .model-picker-source-count')).toHaveText('—');
  const [a, b] = await Promise.all([fonti.locator('[role="tab"]').nth(0).boundingBox(), fonti.locator('[role="tab"]').nth(1).boundingBox()]);
  expect(Math.abs(b.y - a.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x);
  expect(await fonti.evaluate((f) => getComputedStyle(f).overflowX)).toBe('auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const fuori = await velo(page).locator('.model-picker-option').evaluateAll((rs) => rs.filter((r) => r.scrollWidth > r.clientWidth + 1).length);
  expect(fuori).toBe(0);
  await mkdir(FOTO, { recursive: true });
  await writeFile(path.join(FOTO, 'selettore-stretto-700.png'), await page.screenshot());
});

for (const modo of ['light', 'dark']) {
  test(`SEL-BOZZ-FOTO — ${modo}: la vista del bozzetto a 1920×1080 (preferiti, recenti, gruppo in uso aperto)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: modo });
    await apri(page, { modo, preferiti: ['z-ai/glm-5.3-flash', 'anthropic/claude-sonnet-5.5'], recenti: ['z-ai/glm-5.3-flash', IN_USO, 'meta-llama/llama-5-8b'] });
    await apriSelettore(page);
    await expect(velo(page).locator('[data-sezione="preferiti"] .model-picker-option')).toHaveCount(2);
    await expect(velo(page).locator('[data-sezione="recenti"] .model-picker-option')).toHaveCount(2); // il preferito non si ripete
    // il modello in uso compare due volte (Usati di recente e il suo gruppo): si centra la copia NEL GRUPPO, l'ultima
    await expect(lista(page).locator('.model-picker-option[aria-selected="true"]')).toHaveCount(2);
    await expect.poll(() => lista(page).evaluate((l) => {
      const r = [...l.querySelectorAll('.model-picker-option[aria-selected="true"]')].at(-1);
      if (r.closest('[data-sezione]').dataset.sezione !== 'g-xiaomi') return 'copia sbagliata';
      if (l.scrollHeight <= l.clientHeight + 1) return 'la lista non scorre: si allunga e il velo la taglia';
      const a = l.getBoundingClientRect(); const b = r.getBoundingClientRect();
      const fondo = l.scrollTop + l.clientHeight >= l.scrollHeight - 1; // a fondo lista nessuna riga può centrarsi
      return fondo || Math.abs((b.top + b.height / 2) - (a.top + a.height / 2)) < 30 ? 'centrata' : 'fuori centro';
    })).toBe('centrata');
    // il passaggio del puntatore (stella visibile) su una riga GIÀ in vista: Playwright porterebbe in vista quella che gli si chiede, spostando la lista
    await riga(page, 'xiaomi/mimo-v2.6').last().hover();
    await mkdir(FOTO, { recursive: true });
    await writeFile(path.join(FOTO, `selettore-${modo}.png`), await page.screenshot());
  });
}

test('SEL-BOZZ-14 — la tendina di «New session» è lo stesso selettore: fonti in riga, un clic sceglie e chiude, niente verso il server', async ({ page }) => {
  const s = await apri(page);
  await page.locator('#newSessionBtn').click();
  const chooser = page.locator('#workspaceChooser');
  await expect(chooser).toBeVisible();
  const picker = chooser.locator('.model-picker').first();
  await picker.locator('.model-picker-trigger').click();
  await expect(picker.locator('.model-picker-panel')).toBeVisible();
  await expect(picker.locator('.model-picker-in-use')).toHaveCount(0); // la pillola «In use» è della testata del velo
  await expect(picker.locator('.model-picker-chip')).toHaveCount(5);
  await expect(picker.locator('.model-picker-option').first()).toBeVisible(); // si misura col catalogo arrivato, non sul «Loading…»
  // con barra, filtri e fonti in testa l'elenco deve restare leggibile: almeno quattro righe (prima della cura ne restava una, ~95 px)
  expect(await picker.locator('.model-picker-list').evaluate((l) => l.clientHeight)).toBeGreaterThanOrEqual(4 * 48);
  await mkdir(FOTO, { recursive: true });
  await writeFile(path.join(FOTO, 'selettore-tendina-nuova-sessione.png'), await page.screenshot());
  await picker.locator('.model-picker-search input').fill('llama');
  await picker.locator('.model-picker-option[data-model-value="meta-llama/llama-5-8b"]').click();
  await expect(picker.locator('.model-picker-panel')).toBeHidden();
  await expect(picker.locator('.model-picker-trigger-label')).toHaveText('meta-llama/llama-5-8b');
  expect(s.impostazioni).toEqual([]);
  expect(s.scritture).toEqual([]);
});

test('SEL-BOZZ-15 — migrazione una volta sola: le liste delle impostazioni locali vanno al server (unione) e da lì si svuotano', async ({ page }) => {
  const s = await apri(page, { preferiti: ['anthropic/claude-sonnet-5.5'], localiPreferiti: ['z-ai/glm-5.3-flash'], localiRecenti: ['meta-llama/llama-5-8b'] });
  await apriSelettore(page);
  await expect.poll(() => s.azioni.filter((a) => a.azione === 'importa').length).toBe(1);
  expect(s.azioni.find((a) => a.azione === 'importa')).toEqual({ azione: 'importa', preferiti: ['z-ai/glm-5.3-flash'], recenti: ['meta-llama/llama-5-8b'] });
  expect(s.preferenze).toEqual({ preferiti: ['anthropic/claude-sonnet-5.5', 'z-ai/glm-5.3-flash'], recenti: ['meta-llama/llama-5-8b'] });
  await expect.poll(async () => { const c = await salvato(page); return [c.modelliPreferiti, c.modelliRecenti]; }).toEqual([[], []]);
  await expect(velo(page).locator('[data-sezione="preferiti"] .model-picker-option')).toHaveCount(2);
  // AL CONTRARIO: riaperto, niente da importare — l'importazione non si ripete
  await page.keyboard.press('Escape');
  await apriSelettore(page);
  await expect(velo(page).locator('[data-sezione="preferiti"] .model-picker-option')).toHaveCount(2);
  expect(s.azioni.filter((a) => a.azione === 'importa').length).toBe(1);
});

test('SEL-BOZZ-16 — tastiera: F sulla riga a fuoco mette e toglie la stella (aria-pressed), il fuoco resta sulla riga', async ({ page }) => {
  const s = await apri(page);
  await apriSelettore(page);
  await velo(page).locator('.model-picker-search input').fill('mimo');
  await page.keyboard.press('ArrowDown');
  await expect(riga(page, 'xiaomi/mimo-v2.6')).toBeFocused();
  await page.keyboard.press('f');
  await expect.poll(() => s.preferenze.preferiti).toEqual(['xiaomi/mimo-v2.6']);
  await expect(riga(page, 'xiaomi/mimo-v2.6').locator('.model-picker-star')).toHaveAttribute('aria-pressed', 'true');
  await expect(riga(page, 'xiaomi/mimo-v2.6')).toBeFocused();
  await expect(velo(page).locator('.model-picker-search input')).toHaveValue('mimo'); // la F non è finita nella ricerca
  await page.keyboard.press('F');
  await expect.poll(() => s.preferenze.preferiti).toEqual([]);
  await expect(riga(page, 'xiaomi/mimo-v2.6').locator('.model-picker-star')).toHaveAttribute('aria-pressed', 'false');
  // AL CONTRARIO: nella ricerca la F è una lettera, non una stella
  await velo(page).locator('.model-picker-search input').focus();
  await page.keyboard.press('f');
  await expect(velo(page).locator('.model-picker-search input')).toHaveValue('mimof');
  expect(s.azioni.filter((a) => a.azione === 'preferito').length).toBe(2);
});

test('SEL-BOZZ-17 — il server rifiuta la stella (50 già pieni): la stella torna com’era e la app lo dice', async ({ page }) => {
  const s = await apri(page, { rifiutaStelle: true });
  await apriSelettore(page);
  const r = riga(page, 'xiaomi/mimo-v2.6');
  await r.hover();
  await r.locator('.model-picker-star').click();
  await expect(page.locator('.talos-toast').filter({ hasText: 'The star was not saved' })).toBeVisible();
  await expect(riga(page, 'xiaomi/mimo-v2.6').last().locator('.model-picker-star')).toHaveAttribute('aria-pressed', 'false');
  await expect(velo(page).locator('[data-sezione="preferiti"]')).toHaveCount(0);
  expect(s.preferenze.preferiti).toEqual([]);
});
