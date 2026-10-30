import { expect, test } from '@playwright/test';

import { CONFINE, attendiFineStoria } from './aiuto-confine.mjs';

/*
 * Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file sia su
 *   mobile che su desktop». Il chip di un allegato DENTRO la cartella della sessione è un pulsante che apre il file nel lettore (lo
 *   stesso dell'albero dei file); una pagina e un percorso fuori dalla cartella restano etichette. Server finto: ogni non-GET si ferma
 *   e si conta, nessun modello.
 */

const ID = 'allegati-A';
const CSV = 'cliente,importo\nRossi,42.50\nVerdi,157.40\n';
const ok = (route, data) => route.fulfill({ status: 200, contentType: 'application/json', json: { ok: true, data } });

const CONTESTO = { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' };
function giro(n, allegati, contesto = CONTESTO) {
  const s = n * 10;
  return [
    { type: 'RunStarted', runId: `r${n}`, _sequenza: s + 1, input: { consegna: 'Leggi il CSV allegato.', seguito: n > 1, ...(allegati ? { bolla: { testo: 'Leggi il CSV allegato.', allegati } } : {}) }, contesto },
    { type: 'TextMessageStart', messageId: `m-r${n}`, _sequenza: s + 2 },
    { type: 'TextMessageContent', messageId: `m-r${n}`, delta: 'Il totale è 199,90.', _sequenza: s + 3 },
    { type: 'TextMessageEnd', messageId: `m-r${n}`, _sequenza: s + 4 },
    { type: 'RunFinished', runId: `r${n}`, _sequenza: s + 5 },
  ];
}
const storia = (allegati) => giro(1, allegati);

async function banco(page, allegati, { tema = 'dark', eventi: eventiDati = null } = {}) {
  const viste = { file: [], altri: [] };
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); } catch { /* privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET' && r.method() !== 'HEAD') { viste.altri.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.fulfill({ status: 404, contentType: 'application/json', json: { ok: false, error: { code: 'NOT_FOUND', message: 'finto' } } }); }
    return route.fallback();
  });
  await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET'
    ? ok(route, { items: [{ sessionId: ID, taskId: ID, nome: 'Allegati', conclusa: true, modello: 'qwen/qwen3.8-flash' }] }) : route.fallback()));
  const eventi = eventiDati ?? storia(allegati);
  await page.route(`**/api/v1/sessions/${ID}/events*`, (route) => route.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` }));
  await page.route(`**/api/v1/sessions/${ID}/export`, (route) => ok(route, { sessionId: ID, eventi }));
  await page.route(`**/api/v1/sessions/${ID}/file?*`, (route) => {
    viste.file.push(new URL(route.request().url()).searchParams.get('percorso'));
    return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: CSV });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, s, 'Allegati', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' }), ID);
  await attendiFineStoria(page);
  return viste;
}

const DAL_PAD = { tipo: 'file', nome: 'ordini-dal-pad.csv', percorso: 'allegati/ordini-dal-pad.csv', caratteri: 77 };

test('ALL-APRI-B01 il file mandato dal Pad si apre col clic sul chip, nel lettore dei file, col suo percorso nella cartella', async ({ page }) => {
  const viste = await banco(page, [DAL_PAD]);
  const chip = page.locator('#conversation .talos-allegati-chip__apri');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText('ordini-dal-pad.csv');
  await chip.click();
  await expect(page.locator('#railFileLettore')).toBeVisible();
  await expect(page.locator('#railFileLettore')).toContainText('Verdi');
  expect(viste.file).toContain('allegati/ordini-dal-pad.csv');
  expect(viste.altri, 'nessuna scrittura').toEqual([]);
});

test('ALL-APRI-B02 da tastiera: Tab arriva al chip e Invio lo apre', async ({ page }) => {
  const viste = await banco(page, [DAL_PAD]);
  const chip = page.locator('#conversation .talos-allegati-chip__apri');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#railFileLettore')).toContainText('Rossi');
  expect(viste.file).toContain('allegati/ordini-dal-pad.csv');
});

test('ALL-APRI-B03 un assoluto dentro la cartella si apre col percorso relativo; pagina e file fuori restano etichette', async ({ page }) => {
  const viste = await banco(page, [
    { tipo: 'file', nome: 'ordini.csv', percorso: 'C:/progetti/AVM/dati/ordini.csv', caratteri: 77 },
    { tipo: 'file', nome: 'segreto.txt', percorso: 'D:/altrove/segreto.txt', caratteri: 9 },
    { daBrowser: true, nome: 'Pagina aperta', percorso: 'https://example.com/a', caratteri: 100 },
  ]);
  await expect(page.locator('#conversation .talos-allegati-chip__uno')).toHaveCount(3);
  const apribili = page.locator('#conversation .talos-allegati-chip__apri');
  await expect(apribili, 'solo quello dentro la cartella è un pulsante').toHaveCount(1);
  await apribili.click();
  await expect(page.locator('#railFileLettore')).toContainText('Verdi');
  expect(viste.file).toEqual(['dati/ordini.csv']);
  expect(viste.file.some((p) => /segreto/u.test(p ?? ''))).toBe(false);
});

/* ---------------------------------------------------------------------------------------------------------------------------------
 * Revisione del blocco (26/10/2026), A-F1/A-F2: i file della chat stanno nella cartella di PARTENZA della sessione, che non è sempre
 *   la radice dei permessi, e la radice può cambiare a sessione aperta ⇒ il relativo si calcola al clic, contro la radice di adesso.
 * --------------------------------------------------------------------------------------------------------------------------------- */
test('ALL-APRI-B04 (A-F1) Accesso pieno da un progetto: radice = il disco, il file si chiede col percorso dalla radice vera', async ({ page }) => {
  const viste = await banco(page, null, { eventi: giro(1, [DAL_PAD], { cartella: 'C:\\', cartellaBase: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }) });
  await page.locator('#conversation .talos-allegati-chip__apri').click();
  await expect(page.locator('#railFileLettore')).toContainText('Verdi');
  expect(viste.file).toEqual(['progetti/AVM/allegati/ordini-dal-pad.csv']);
});

test('ALL-APRI-B05 (A-F2) la radice si allarga dopo la bolla: il chip del giro prima segue la radice di adesso', async ({ page }) => {
  const viste = await banco(page, null, { eventi: [
    ...giro(1, [DAL_PAD]),
    ...giro(2, null, { cartella: 'C:\\', cartellaBase: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }),
  ] });
  await page.locator('#conversation .talos-allegati-chip__apri').click();
  await expect(page.locator('#railFileLettore')).toContainText('Verdi');
  expect(viste.file).toEqual(['progetti/AVM/allegati/ordini-dal-pad.csv']);
});

test('ALL-APRI-B06 al contrario: la radice si restringe e il file ne resta fuori — nessuna lettura, un avviso che lo dice', async ({ page }) => {
  const viste = await banco(page, null, { eventi: [
    ...giro(1, [DAL_PAD]),
    ...giro(2, null, { cartella: 'C:\\progetti\\AVM\\src', cartellaBase: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }),
  ] });
  await page.locator('#conversation .talos-allegati-chip__apri').click();
  await expect(page.getByText(/no longer inside this session|non sta più nella cartella/u)).toBeVisible();
  expect(viste.file).toEqual([]);
});
