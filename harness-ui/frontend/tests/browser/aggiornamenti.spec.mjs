import { expect, test } from '@playwright/test';
import { copioneStato, statoPerLaPagina } from '../../../desktop/canale-aggiornamenti.mjs';

/*
 * 01/10/2026 — l'aggiornamento automatico a schermo (owner: banda sotto la barra del titolo; scheda «Aggiornamenti» in testa a
 * «Account, Doctor e backup»; preview esclusa). Lo stato lo manda il guscio con `executeJavaScript`: qui lo stesso copione,
 * costruito dalla stessa funzione del guscio (`desktop/canale-aggiornamenti.mjs`). `window.open` si registra invece di aprire.
 * Gira sul 4174: ogni richiesta non GET si ferma e si conta.
 */
const GETTONE = 'g'.repeat(48);
const ORA = '2026-10-01T21:30:00.000Z';
const PRONTO = statoPerLaPagina({ versioneAttuale: '0.1.20', stato: 'pronto', automatici: true, ultimoControllo: { quando: ORA, esito: 'pronto', errore: null },
  pronto: { versione: '0.1.21', pagina: 'https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.21' }, errore: null }, { attivo: true, gettone: GETTONE });

/* L'elenco delle sessioni lo decide la prova: sul 4174 vero una sessione dell'owner al lavoro cambierebbe cosa fa «Riavvia ora». */
const sessione = (id, campi) => ({ sessionId: id, taskId: 'libero:default', nome: id, avviataAlle: '2026-10-01T20:00:00.000Z', conclusa: true, interrotta: false, ...campi });
async function apri(page, tema = 'dark', lingua = 'it', sessioni = []) {
  const fermate = [];
  await page.route('**/api/**', (r) => { if (r.request().method() === 'GET') return r.fallback(); fermate.push(r.request().url()); return r.abort(); });
  await page.route('**/api/v1/sessions', (r) => (r.request().method() === 'GET' ? r.fulfill({ json: { ok: true, data: { items: sessioni } } }) : r.fallback()));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage, uiFontScale: 'default' }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* */ }
    window.__aperture = [];
    window.open = (url) => { window.__aperture.push(String(url)); return null; };
  }, { colorMode: tema, uiLanguage: lingua });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  return fermate;
}
const apriSezioneAccount = async (page) => {
  await page.evaluate(() => document.querySelector('[data-vaia="impostazioni"], [data-view="settings"]')?.click());
  await page.locator('#setting-tab-account').click();
};
const manda = (page, stato) => page.evaluate((copione) => { (0, eval)(copione); }, copioneStato(stato));
const aperture = (page) => page.evaluate(() => window.__aperture);

test('AGG-UI-01: nel browser non arriva niente dal guscio, e non nasce niente', async ({ page }) => {
  await apri(page);
  await expect(page.locator('#talosBandaAggiornamento')).toHaveCount(0);
  await expect(page.locator('[data-settings-card="account-aggiornamenti"]')).toHaveCount(0);
});

test('AGG-UI-02: la banda dice che è pronto, sta sotto la barra, e i suoi tre comandi rispondono al guscio col gettone', async ({ page }) => {
  const fermate = await apri(page);
  await manda(page, PRONTO);
  const banda = page.locator('#talosBandaAggiornamento');
  await expect(banda).toBeVisible();
  await expect(banda.locator('.talos-banda-aggiornamento__testo')).toHaveText('TALOS 0.1.21 è pronto. Si installa quando chiudi l’app.');
  await expect(banda.locator('button')).toHaveText(['Novità', 'Riavvia ora', '']);
  expect(await page.evaluate(() => document.querySelector('#talosBandaAggiornamento').nextElementSibling?.classList.contains('talos-shell'))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--talos-workspace-bar-h').trim())).toBe('40px');
  await banda.getByRole('button', { name: 'Novità' }).click();
  await banda.getByRole('button', { name: 'Riavvia ora' }).click();
  await expect.poll(async () => (await aperture(page)).length, { message: 'nessuna sessione al lavoro: riavvia senza chiedere' }).toBe(2);
  await banda.getByRole('button', { name: 'Nascondi fino al prossimo avvio' }).click();
  await expect(banda).toBeHidden();
  expect(await aperture(page)).toEqual([
    'https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.21',
    `talos-desktop://aggiornamenti?azione=riavvia&gettone=${GETTONE}`,
    `talos-desktop://aggiornamenti?azione=nascondi&gettone=${GETTONE}`,
  ]);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-talos-banda-aggiornamento'))).toBe(false);
  expect(fermate).toEqual([]);
});

test('AGG-UI-03: con l interruttore spento la banda non promette l installazione alla chiusura; nascosta dal guscio resta nascosta', async ({ page }) => {
  await apri(page);
  await manda(page, { ...PRONTO, automatici: false });
  await expect(page.locator('.talos-banda-aggiornamento__testo')).toHaveText('TALOS 0.1.21 è pronto. Riavvia per installarlo.');
  await manda(page, { ...PRONTO, nascosto: true });
  await expect(page.locator('#talosBandaAggiornamento')).toBeHidden();
});

test('AGG-UI-04: la scheda in testa ad «Account, Doctor e backup» — versione, ultimo controllo, «Controlla ora», interruttore', async ({ page }) => {
  await apri(page);
  await manda(page, statoPerLaPagina({ versioneAttuale: '0.1.20', stato: 'aggiornato', automatici: true, ultimoControllo: { quando: new Date().toISOString(), esito: 'aggiornato', errore: null } }, { attivo: true, gettone: GETTONE }));
  const scheda = page.locator('[data-settings-card="account-aggiornamenti"]');
  await expect(scheda).toHaveCount(1);
  await apriSezioneAccount(page);
  expect(await page.evaluate(() => document.querySelector('#setting-panel-account').firstElementChild?.dataset.settingsCard)).toBe('account-aggiornamenti');
  /* La testata è la stessa della carta sorella («Configurazione e diagnostica»): stessa forma, stesso stile. */
  const forma = await page.evaluate(() => [...document.querySelectorAll('#setting-panel-account > [data-settings-card]')].map((c) => {
    const h = c.querySelector(':scope > [data-settings-group-head] > .settings-group__title'); const p = c.querySelector(':scope > p');
    return h && p ? [getComputedStyle(h).fontSize, getComputedStyle(h).fontWeight, getComputedStyle(p).color, getComputedStyle(p).fontSize] : null;
  }));
  expect(forma.length).toBe(2);
  /* Prima foto del 01/10: la descrizione di questa carta mostrava quella della sorella (`static-copy.ts` prendeva «la prima carta»). */
  await expect(scheda.locator(':scope > p')).toHaveText('Controlla all’avvio e ogni 4 ore; installa quando chiudi l’app.');
  await expect(page.locator('[data-settings-card="account-controls"] > p')).toHaveText('Controlli e configurazione dell’agente. Il backup non è disponibile da questa pagina.');
  expect(forma[0]).not.toBeNull();
  expect(forma[0]).toEqual(forma[1]);
  await expect(scheda.locator('[data-aggiornamenti-versione]')).toHaveText('TALOS 0.1.20');
  await expect(scheda.locator('[data-aggiornamenti-stato]')).toHaveText(/^Ultimo controllo oggi alle \d\d:\d\d: TALOS è aggiornato\.$/);
  await expect(scheda.getByRole('button', { name: 'Controlla ora' })).toBeVisible();
  await expect(scheda.getByRole('button', { name: 'Riavvia ora' })).toBeHidden();
  await expect(scheda.locator('#setting-aggiornamentiAutomatici')).toBeChecked();
  await page.evaluate(() => { const s = document.querySelector('#setting-aggiornamentiAutomatici'); s.click(); });
  await page.evaluate(() => document.querySelector('[data-settings-card="account-aggiornamenti"] [data-aggiornamenti-azioni] button').click());
  expect(await aperture(page)).toEqual([
    `talos-desktop://aggiornamenti?azione=automatici&acceso=0&gettone=${GETTONE}`,
    `talos-desktop://aggiornamenti?azione=controlla&gettone=${GETTONE}`,
  ]);
  await manda(page, PRONTO);
  await expect(scheda).toHaveCount(1, { timeout: 2000 });
  await expect(scheda.locator('[data-aggiornamenti-stato]')).toHaveText('TALOS 0.1.21 è pronto. Si installa quando chiudi l’app.');
  await expect(scheda.getByRole('button', { name: 'Controlla ora' })).toBeHidden();
  await expect(scheda.getByRole('button', { name: 'Riavvia ora' })).toBeVisible();
});

test('AGG-UI-05: nella preview la scheda dice che non si aggiorna da sola, senza comandi', async ({ page }) => {
  await apri(page);
  await manda(page, statoPerLaPagina({ versioneAttuale: '0.1.21' }, { attivo: false, motivoSpento: 'preview', gettone: GETTONE }));
  const scheda = page.locator('[data-settings-card="account-aggiornamenti"]');
  await expect(scheda.locator('[data-aggiornamenti-stato]')).toHaveText('Questa è una copia di prova: non si aggiorna da sola. Installa la versione nuova dal sito delle release.');
  await expect(scheda.locator('button:visible')).toHaveCount(0);
  await expect(scheda.locator('[data-setting-row="aggiornamentiAutomatici"]')).toBeHidden();
  await expect(page.locator('#talosBandaAggiornamento')).toBeHidden();
});

test('AGG-UI-06: in inglese banda e scheda parlano inglese', async ({ page }) => {
  await apri(page, 'dark', 'en');
  await manda(page, PRONTO);
  await expect(page.locator('.talos-banda-aggiornamento__testo')).toHaveText('TALOS 0.1.21 is ready. It installs when you close the app.');
  await expect(page.locator('#talosBandaAggiornamento button')).toHaveText(['What’s new', 'Restart now', '']);
  await apriSezioneAccount(page);
  const scheda = page.locator('[data-settings-card="account-aggiornamenti"]');
  await expect(scheda.locator('.settings-group__title')).toHaveText('Updates');
  await expect(scheda.locator('[data-aggiornamenti-etichetta]')).toHaveText('Automatic updates');
});

/* Owner 01/10/2026: «Riavvia ora» → «Chiede se c'è un giro in corso». Riavviare chiude il server e interrompe i giri aperti. */
test('AGG-UI-07: con una sessione al lavoro «Riavvia ora» chiede prima; «Annulla» non riavvia, «Riavvia lo stesso» sì', async ({ page }) => {
  const fermate = await apri(page, 'dark', 'it', [sessione('al-lavoro', { conclusa: false }), sessione('finita')]);
  await manda(page, PRONTO);
  const banda = page.locator('#talosBandaAggiornamento');
  await banda.getByRole('button', { name: 'Riavvia ora' }).click();
  const modale = page.getByRole('dialog');
  await expect(modale).toContainText('Riavviare TALOS adesso?');
  await expect(modale).toContainText('Una sessione sta lavorando: riavviare la interrompe.');
  await modale.getByRole('button', { name: 'Annulla' }).click();
  await expect(modale).toBeHidden();
  expect(await aperture(page)).toEqual([]);
  await expect(banda.getByRole('button', { name: 'Riavvia ora' })).toBeEnabled();
  await banda.getByRole('button', { name: 'Riavvia ora' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Riavvia lo stesso' }).click();
  expect(await aperture(page)).toEqual([`talos-desktop://aggiornamenti?azione=riavvia&gettone=${GETTONE}`]);
  expect(fermate).toEqual([]);
});

test('AGG-UI-08: AL CONTRARIO — sessioni concluse o interrotte non contano: si riavvia subito, senza domanda', async ({ page }) => {
  await apri(page, 'dark', 'it', [sessione('finita'), sessione('interrotta', { conclusa: false, interrotta: true })]);
  await manda(page, PRONTO);
  await page.locator('#talosBandaAggiornamento').getByRole('button', { name: 'Riavvia ora' }).click();
  await expect.poll(() => aperture(page)).toEqual([`talos-desktop://aggiornamenti?azione=riavvia&gettone=${GETTONE}`]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('AGG-UI-09: in inglese, con due sessioni al lavoro, dalla scheda delle Impostazioni', async ({ page }) => {
  await apri(page, 'dark', 'en', [sessione('a', { conclusa: false }), sessione('b', { conclusa: false })]);
  await manda(page, PRONTO);
  await apriSezioneAccount(page);
  await page.locator('[data-settings-card="account-aggiornamenti"]').getByRole('button', { name: 'Restart now' }).click();
  const modale = page.getByRole('dialog');
  await expect(modale).toContainText('Restart TALOS now?');
  await expect(modale).toContainText('2 sessions are working: restarting will interrupt them.');
  await expect(modale.locator('button')).toContainText(['Cancel', 'Restart anyway']);
});

/* Revisione Codex 02/10/2026, rilievo 3: banda e scheda hanno ciascuna «Riavvia ora»; mentre l'elenco delle sessioni arriva, un clic
   su tutti e due mandava due richieste. Qui l'elenco è lento apposta. */
test('AGG-UI-10: banda e scheda insieme — un riavvio solo, e i due pulsanti restano spenti finché la richiesta è partita', async ({ page }) => {
  await apri(page);
  let rilascia;
  const lento = new Promise((r) => { rilascia = r; });
  await page.route('**/api/v1/sessions', async (r) => {
    if (r.request().method() !== 'GET') return r.fallback();
    await lento;
    return r.fulfill({ json: { ok: true, data: { items: [] } } });
  });
  await manda(page, PRONTO);
  await apriSezioneAccount(page);
  const dellaBanda = page.locator('#talosBandaAggiornamento').getByRole('button', { name: 'Riavvia ora' });
  const dellaScheda = page.locator('[data-settings-card="account-aggiornamenti"]').getByRole('button', { name: 'Riavvia ora' });
  await dellaBanda.click();
  await expect(dellaScheda).toBeDisabled();
  await dellaScheda.click({ force: true });
  await manda(page, PRONTO); // un ridisegno non li riaccende
  await expect(dellaBanda).toBeDisabled();
  rilascia();
  await expect.poll(() => aperture(page)).toEqual([`talos-desktop://aggiornamenti?azione=riavvia&gettone=${GETTONE}`]);
  await page.waitForTimeout(300);
  expect(await aperture(page)).toHaveLength(1);
});

const CARTELLA_FOTO = process.env.TALOS_FOTO_DIR;
for (const [tema, lingua] of [['light', 'it'], ['dark', 'it'], ['dark', 'en']]) {
  test(`AGG-FOTO banda e scheda (${tema}, ${lingua})`, async ({ page }) => {
    test.skip(!CARTELLA_FOTO, 'solo su richiesta: TALOS_FOTO_DIR');
    await apri(page, tema, lingua);
    await manda(page, PRONTO);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${CARTELLA_FOTO}/aggiornamenti-banda-${tema}-${lingua}.png` });
    await apriSezioneAccount(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CARTELLA_FOTO}/aggiornamenti-scheda-${tema}-${lingua}.png` });
  });
}
for (const tema of ['light', 'dark']) {
  test(`AGG-FOTO conferma del riavvio (${tema})`, async ({ page }) => {
    test.skip(!CARTELLA_FOTO, 'solo su richiesta: TALOS_FOTO_DIR');
    await apri(page, tema, 'it', [sessione('al-lavoro', { conclusa: false })]);
    await manda(page, PRONTO);
    await page.locator('#talosBandaAggiornamento').getByRole('button', { name: 'Riavvia ora' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CARTELLA_FOTO}/aggiornamenti-conferma-${tema}.png` });
  });
}
