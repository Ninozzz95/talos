/*
 * BARRA-D — owner 30/10/2026 sera, bozzetto della Frontend «Barra di sinistra», variante D «Ripulita» («la D mi piace di più»):
 * «Spazi di lavoro» e «Strumenti» nascono CHIUSI e la scelta si ricorda; Home sempre visibile; le sessioni prendono quasi tutta
 * l'altezza; Home e Capability con le icone nuove dello sprite (`i-layout`, `i-layers`), così non sono più uguali a Bacheca e
 * Conversazioni. Riga della sessione invariata.
 *
 * ⛔ Riparte da una memoria VUOTA: `playwright.config.mjs` apre «Spazi di lavoro» per tutte le altre prove (scritte su quel gruppo
 *   aperto), qui si prova il valore di serie. Server isolato, nessuna scrittura: ogni richiesta non-GET si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { statoColCookie } from './fixtures/cookie-della-corsa.mjs';

test.use({ locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1920, height: 1080 }, storageState: statoColCookie('http://127.0.0.1/') }); // il gettone della corsa resta, la memoria della finestra no

async function apri(page, colore = 'light') {
  const nonGet = [];
  await page.addInitScript((c) => {
    try {
      if (!sessionStorage.getItem('barra-d-seminata')) {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: c, themePreset: 'forge', themePresetVersione: 2 } }));
        sessionStorage.setItem('barra-d-seminata', '1');
      }
    } catch { /* senza memoria la prova lo dice da sola */ }
  }, colore);
  await page.route('**/*', (route) => {
    const req = route.request();
    /* Fase 8 (D2): la memoria seminata qui sopra è una preferenza della finestra, che ne manda UNA copia al server. È la sola
       scrittura ammessa e risponde come il server (stessa forma di bolle-domanda e lingua-dal-vivo); ogni altra resta vietata. */
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/v1/app-settings/window') return route.fulfill({ json: { ok: true, data: { revisione: Number.MAX_SAFE_INTEGER } } });
    if (req.method() !== 'GET' && req.method() !== 'HEAD') { nonGet.push(`${req.method()} ${new URL(req.url()).pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="home"]')).toBeVisible();
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  return nonGet;
}

const icona = (page, vaia) => page.locator(`.talos-sidebar [data-vaia="${vaia}"] use`).getAttribute('href');

test('BARRA-D-01 — di serie i due gruppi sono chiusi, Home resta, le icone di Home e Capability non sono doppioni', async ({ page }) => {
  const nonGet = await apri(page);
  for (const [testata, gruppo] of [['#testataGruppoLavoro', '#gruppoLavoro'], ['#testataGruppoStrumenti', '#gruppoStrumenti']]) {
    await expect(page.locator(testata)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(gruppo)).toBeHidden();
  }
  await expect(page.locator('.talos-sidebar [data-vaia="home"]'), 'Home sempre visibile').toBeVisible();
  expect(await icona(page, 'home')).toBe('#i-house');
  expect(await icona(page, 'capability')).toBe('#i-blocks');
  expect(await icona(page, 'board'), 'la Bacheca tiene la sua').toBe('#i-grid');
  expect(await icona(page, 'chat'), 'le Conversazioni tengono la loro').toBe('#i-list');
  /* le sessioni hanno quasi tutta l'altezza: misurato, non a occhio. Con lo store vuoto delle prove l'elenco è corto, quindi si
     misura lo SPAZIO che resta loro: dalla testata delle sessioni al fondo della barra (prima la misura era l'altezza del blocco: 7%) */
  const quota = await page.evaluate(() => {
    const barra = document.querySelector('.talos-sidebar').getBoundingClientRect();
    const sessioni = document.querySelector('.talos-sidebar__sessions').getBoundingClientRect();
    return Math.round(((barra.bottom - sessioni.top) / barra.height) * 100);
  });
  expect(quota, `alle sessioni resta il ${quota}% della barra`).toBeGreaterThanOrEqual(55);
  expect(nonGet).toEqual([]);
});

test('BARRA-D-02 — la scelta si ricorda: aperto resta aperto dopo un ricaricamento, e richiuso resta chiuso', async ({ page }) => {
  await apri(page);
  await page.locator('#testataGruppoLavoro').click();
  await expect(page.locator('#gruppoLavoro')).toBeVisible();
  await expect(page.locator('.talos-sidebar [data-vaia="note"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('#testataGruppoLavoro'), 'aperto e ricaricato: resta aperto').toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#gruppoLavoro')).toBeVisible();
  await expect(page.locator('#testataGruppoStrumenti'), 'l’altro gruppo non si è mosso').toHaveAttribute('aria-expanded', 'false');
  await page.locator('#testataGruppoLavoro').click();
  await page.reload();
  await expect(page.locator('#testataGruppoLavoro'), 'richiuso e ricaricato: resta chiuso').toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#gruppoLavoro')).toBeHidden();
});

for (const colore of ['light', 'dark']) {
  test(`BARRA-D-FOTO — la barra ripulita, tema Forge ${colore === 'light' ? 'chiaro' : 'scuro'}, 1920×1080`, async ({ page }) => {
    await apri(page, colore);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `artifacts/barra-d/barra-d-${colore}.png`, clip: { x: 0, y: 0, width: 520, height: 1080 } });
  });
}

/* ───────────── Variante B «Menu a comparsa», la barra CHIUSA (owner 30/10/2026 sera) ───────────── */

async function chiudiBarra(page) {
  await page.locator('#sessionsCollapseBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'icone');
}
const striscia = (page, sel) => page.locator(`.talos-sidebar ${sel}`);

test('BARRA-B-01 — a barra chiusa restano nuova sessione, ricerca, Home, Sessioni, Spazi, Strumenti e Impostazioni; i gruppi non si spargono', async ({ page }) => {
  const nonGet = await apri(page);
  await page.locator('#testataGruppoLavoro').click(); // la persona aveva aperto «Spazi di lavoro» a barra aperta
  await chiudiBarra(page);
  for (const sel of ['[data-comparsa-nuova]', '[data-comparsa-cerca]', '[data-comparsa-apre="sessioni"]:not([data-comparsa-cerca])', '[data-comparsa-apre="lavoro"]', '[data-comparsa-apre="strumenti"]', '[data-vaia="home"]', '.talos-sidebar__foot [data-vaia="impostazioni"]']) {
    await expect(striscia(page, sel), sel).toBeVisible();
  }
  await expect(page.locator('#gruppoLavoro'), 'a barra chiusa il gruppo si vede solo nella sua comparsa').toBeHidden();
  await expect(page.locator('#gruppoStrumenti')).toBeHidden();
  await expect(striscia(page, '[data-vaia="home"]'), 'Home dice il suo nome passandoci sopra').toHaveAttribute('data-tip', 'Home');
  /* l'icona di «Spazi di lavoro» non è quella della Bacheca, che sta dentro la sua comparsa (Frontend 31/10: `i-sfondo`, provvisoria, FE-015) */
  const iconaSpazi = await striscia(page, '[data-comparsa-apre="lavoro"] use').getAttribute('href');
  expect(iconaSpazi).not.toBe(await icona(page, 'board'));
  await page.locator('#sessionsCollapseBtn').click();
  await expect(page.locator('#gruppoLavoro'), 'riaperta la barra, la scelta di prima è intatta').toBeVisible();
  await expect(striscia(page, '[data-comparsa-apre="lavoro"]'), 'a barra aperta la striscia non c’è').toBeHidden();
  expect(nonGet).toEqual([]);
});

test('BARRA-B-02 — Spazi di lavoro apre la comparsa coi nomi; Esc la chiude e il fuoco torna all’icona; la scelta della barra aperta non cambia', async ({ page }) => {
  await apri(page);
  await chiudiBarra(page);
  const icona = striscia(page, '[data-comparsa-apre="lavoro"]');
  await icona.click();
  await expect(icona).toHaveAttribute('aria-expanded', 'true');
  const gruppo = page.locator('#gruppoLavoro');
  await expect(gruppo).toBeVisible();
  await expect(gruppo.locator('.talos-nav-item__label').filter({ hasText: 'Note' })).toBeVisible();
  await expect(gruppo.locator('.talos-nav-item')).toHaveCount(8);
  const box = await gruppo.boundingBox();
  expect(box.x, 'accanto alla striscia, non sopra').toBeGreaterThanOrEqual(64);
  await page.keyboard.press('Escape');
  await expect(gruppo).toBeHidden();
  await expect(icona).toBeFocused();
  await expect(icona).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#testataGruppoLavoro'), 'la comparsa non tocca la scelta ricordata').toHaveAttribute('aria-expanded', 'false');
  await page.locator('#sessionsCollapseBtn').click();
  await expect(gruppo, 'e a barra aperta il gruppo resta chiuso').toBeHidden();
});

/* 31/10/2026, revisione del blocco (R1): Esc appartiene a chi ha il fuoco. Col fuoco fuori dalla barra (il menu «⋯» di una riga, la palette
   dei comandi, il compositore) Esc NON chiude la comparsa: prima la chiudeva da sopra, e il menu che aveva il fuoco restava aperto. */
test('BARRA-B-06 — Esc closes the pop-up only when focus is inside the bar; with focus elsewhere the pop-up stays and Esc goes on', async ({ page }) => {
  await apri(page);
  await chiudiBarra(page);
  await striscia(page, '[data-comparsa-apre="lavoro"]').click();
  await expect(page.locator('#gruppoLavoro')).toBeVisible();
  await page.evaluate(() => document.activeElement?.blur()); // il fuoco esce dalla barra (come verso un menu o la palette)
  const arrivato = await page.evaluate(() => new Promise((ok) => {
    const visto = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', visto); ok(true); } };
    document.addEventListener('keydown', visto);
    setTimeout(() => ok(false), 2000);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }));
  expect(arrivato, 'Esc reaches whoever has the focus').toBe(true);
  await expect(page.locator('#gruppoLavoro'), 'the pop-up is not closed from above').toBeVisible();
});

test('BARRA-B-03 — una voce scelta nella comparsa porta alla sezione e la comparsa si chiude; un clic fuori la chiude', async ({ page }) => {
  await apri(page);
  await chiudiBarra(page);
  await striscia(page, '[data-comparsa-apre="strumenti"]').click();
  await page.locator('#gruppoStrumenti [data-vaia="doctor"]').click();
  await expect(page.locator('#gruppoStrumenti')).toBeHidden();
  await expect(page.locator('#schermoDoctor')).toBeVisible();
  await striscia(page, '[data-comparsa-apre="lavoro"]').click();
  await expect(page.locator('#gruppoLavoro')).toBeVisible();
  await page.mouse.click(1200, 500);
  await expect(page.locator('#gruppoLavoro'), 'clic fuori: chiusa').toBeHidden();
});

test('BARRA-B-04 — la ricerca apre le Sessioni col campo già a fuoco; nuova sessione apre la stessa finestra della barra aperta', async ({ page }) => {
  await apri(page);
  await chiudiBarra(page);
  await striscia(page, '[data-comparsa-cerca]').click();
  await expect(page.locator('#sessionList')).toBeVisible();
  await expect(page.locator('#sessionSearch')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sessionList')).toBeHidden();
  await striscia(page, '[data-comparsa-nuova]').click();
  await expect(page.locator('#sheetDialog.sheet-dialog--new-session')).toBeVisible();
});

test('BARRA-B-05 — il segnale sulle Sessioni si accende quando una riga lavora, e si spegne quando smette', async ({ page }) => {
  await apri(page);
  await chiudiBarra(page);
  const segno = page.locator('[data-segnale-sessioni]');
  await expect(segno).toBeHidden();
  await page.evaluate(() => {
    const riga = document.createElement('div');
    riga.className = 'talos-session-item prova-viva';
    riga.innerHTML = '<span class="talos-dot talos-dot--sm talos-dot--live"></span>';
    document.querySelector('#sessionList').append(riga);
  });
  await expect(segno).toBeVisible();
  await page.evaluate(() => document.querySelector('.prova-viva').remove());
  await expect(segno).toBeHidden();
});

for (const colore of ['light', 'dark']) {
  test(`BARRA-B-FOTO — barra chiusa con Spazi di lavoro aperto, tema Forge ${colore === 'light' ? 'chiaro' : 'scuro'}, 1920×1080`, async ({ page }) => {
    await apri(page, colore);
    await chiudiBarra(page);
    await striscia(page, '[data-comparsa-apre="lavoro"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `artifacts/barra-d/barra-b-${colore}.png`, clip: { x: 0, y: 0, width: 520, height: 1080 } });
  });
}
