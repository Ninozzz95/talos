import { expect, test } from '@playwright/test';

/*
 * 18/10/2026 — CONTROLLO REMOTO, la finestra del desktop (mockup v5 approvato dall'owner il 17/10). Le risposte di `/api/v1/remote…`
 * sono finte (stati del mockup): qui si prova l'interfaccia, il protocollo è provato nei test del server (remoto-*.test.mjs).
 *   · l'icona del telefono sta nella riga del marchio, PRIMA della campanella, e la campanella resta `#notificationsBtn` (il ponte
 *     del DOM prendeva il primo pulsante: il telefono diventava le notifiche, trovato con la prima foto);
 *   · prima volta → scelta del relay → QR coi moduli del server, «vale una volta», «cifrato da capo a capo» → codice in due gruppi
 *     → Invio = «Collega»;
 *   · «Telefoni collegati» sta in «Comportamento», subito dopo «Sicurezza e privacy».
 */
const ORA = Date.now();
const QR = { lato: 21, righe: Array.from({ length: 21 }, (_, y) => Array.from({ length: 21 }, (_, x) => ((x + y) % 2 ? '1' : '0')).join('')) };

async function fingiRemoto(page) {
  const stato = { fase: 'prima', chiamate: [] };
  const corpo = () => ({
    disponibile: true, acceso: stato.fase !== 'prima', relay: stato.fase === 'prima' ? null : { modo: 'n0' }, sceltaFatta: stato.fase !== 'prima',
    pcId: 'pc', inLinea: stato.fase === 'collegato' ? ['t1'] : [],
    telefoni: stato.fase === 'collegato' ? [{ id: 't1', nome: 'Pad di Nino', collegatoAlle: ORA, inLinea: true, percorso: { tipo: 'diretto', rttMs: 38 }, revocatoAlle: null }] : [],
    attese: stato.fase === 'conferma' ? [{ id: 'attesa-0001', nome: 'Pad di Nino', piattaforma: 'Android · app TALOS', codice: '482913', scadeAlle: ORA + 290_000 }] : [],
    accoppiamento: { sbagliati: 0 },
  });
  await page.route('**/api/v1/remote**', async (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname;
    stato.chiamate.push(`${r.method()} ${p}`);
    if (p === '/api/v1/remote') return route.fulfill({ json: { ok: true, data: corpo() } });
    if (p === '/api/v1/remote/settings') { stato.fase = 'qr'; return route.fulfill({ json: { ok: true, data: corpo() } }); }
    if (p === '/api/v1/remote/pair') return route.fulfill({ json: { ok: true, data: { gettone: 'g', qr: 'talos-remote:1?pc=pc&t=g&exp=1', scadeAlle: ORA + 299_000, moduli: QR } } });
    if (p.endsWith('/confirm')) { stato.fase = 'collegato'; return route.fulfill({ json: { ok: true, data: { telefono: { id: 't1', nome: 'Pad di Nino' } } } }); }
    if (p.endsWith('/close')) return route.fulfill({ json: { ok: true, data: { chiuso: true } } });
    if (p.endsWith('/reject')) return route.fulfill({ json: { ok: true, data: { rifiutato: true } } });
    return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND' } } });
  });
  return stato;
}

test('REMOTO-UI-01 — l\'icona del telefono sta prima della campanella, e la campanella resta la campanella', async ({ page }) => {
  await fingiRemoto(page);
  await page.goto('/');
  const brand = page.locator('.talos-brand');
  await expect(brand.locator('#telefoniRemoto')).toBeVisible();
  await expect(page.locator('#notificationsBtn')).toHaveAttribute('aria-controls', 'pannelloNotifiche');
  const ordine = await brand.locator('.talos-icon-button').evaluateAll((els) => els.map((e) => e.id));
  expect(ordine.indexOf('telefoniRemoto')).toBeLessThan(ordine.indexOf('notificationsBtn'));
});

test('REMOTO-UI-02 — prima volta, QR, codice, Invio = Collega: il pallino verde si accende', async ({ page }) => {
  const stato = await fingiRemoto(page);
  await page.goto('/');
  await page.locator('#telefoniRemoto').click();
  await expect(page.locator('[data-remoto-scelta="n0"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-remoto-scelta="proprio"]').click();
  await expect(page.locator('[data-remoto-url]')).toBeVisible();
  await page.locator('[data-remoto-scelta="n0"]').click();
  await expect(page.locator('[data-remoto-url]')).toBeHidden();
  await page.locator('[data-remoto-continua]').click();
  await expect(page.locator('.talos-remoto-qr__svg')).toBeVisible();
  await expect(page.locator('[data-remoto-scade]')).toContainText(/\d:\d\d/);
  expect(await page.locator('.talos-remoto-qr__punti').getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/);
  stato.fase = 'conferma';
  await expect(page.locator('[data-remoto-codice]')).toHaveText('482 913', { timeout: 5000 });
  await expect(page.getByText('Android · app TALOS')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-remoto-codice]')).toHaveCount(0);
  expect(stato.chiamate).toContain('POST /api/v1/remote/pair/attesa-0001/confirm');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-remoto-pallino]')).toBeVisible();
});

test('REMOTO-UI-03 — «Telefoni collegati» sta in Comportamento, subito dopo «Sicurezza e privacy»', async ({ page }) => {
  const stato = await fingiRemoto(page);
  stato.fase = 'collegato';
  await page.goto('/');
  await page.locator('[data-vaia="impostazioni"]').click();
  const voci = await page.locator('.settings-nav__group, .settings-nav__item').evaluateAll((els) => els.map((e) => e.dataset.settingsTab ?? `#${e.textContent.trim()}`));
  const iTel = voci.indexOf('telefoni');
  expect(voci[iTel - 1]).toBe('privacy');
  expect(voci.slice(0, iTel).filter((v) => v.startsWith('#'))).toHaveLength(1);
  await page.locator('[data-settings-tab="telefoni"]').click();
  await expect(page.locator('[data-remoto-telefono="t1"]')).toContainText('Pad di Nino');
  await expect(page.locator('[data-remoto-telefono="t1"]')).toContainText('38');
});

test('REMOTO-UI-04 — al contrario: col fuoco su «Rifiuta», Invio RIFIUTA e non collega', async ({ page }) => {
  const stato = await fingiRemoto(page);
  stato.fase = 'qr';
  await page.goto('/');
  await page.locator('#telefoniRemoto').click();
  await expect(page.locator('.talos-remoto-qr__svg')).toBeVisible();
  stato.fase = 'conferma';
  await expect(page.locator('[data-remoto-codice]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-remoto-collega]')).toBeFocused();
  await page.locator('[data-remoto-rifiuta]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-remoto-nuovo-qr]')).toBeVisible();
  expect(stato.chiamate).toContain('POST /api/v1/remote/pair/attesa-0001/reject');
  expect(stato.chiamate.some((c) => c.endsWith('/confirm'))).toBe(false);
});

test('REMOTO-UI-05 — con un telefono in linea, la pillola col suo nome sta nel piede del compositore; senza, non c\'è', async ({ page }) => {
  const stato = await fingiRemoto(page);
  stato.fase = 'collegato';
  await page.goto('/');
  const pillola = page.locator('[data-remoto-pillola]');
  await expect(pillola).toHaveAttribute('aria-label', /Pad di Nino/);
  await expect(page.locator('[data-remoto-pillola-nome]')).toHaveText('Pad di Nino');
  stato.fase = 'prima';
  await page.reload();
  await expect(page.locator('[data-remoto-pallino]')).toBeHidden();
  await expect(pillola).toBeHidden();
});
