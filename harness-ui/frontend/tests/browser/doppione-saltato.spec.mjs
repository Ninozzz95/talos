import { expect, test } from '@playwright/test';

/*
 * Owner 12/10/2026, con la foto (13 letture «non riuscito» e una carta d'errore): una copia identica che il kernel ha
 *   SCARTATO non è fallita, non è mai partita. L'evento lo dice con un campo (`duplicate: true`, accanto a `isError` e a
 *   `outcome: 'cancelled'`): la riga è discreta, col pallino neutro, e non entra nel conto degli errori.
 * Il giro arriva come la storia di una sessione riaperta (stesse forme di `prova-non-eseguita.spec.mjs`) e passa da `app.js`
 *   come dal server. Il testo dell'annullo è quello del kernel (`talosHarness.mjs`, `consumaFlussoSSE`), non inventato.
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta.
 */
const SEG = '#conversation .talos-activity--segment';
const ANNULLO = '⛔ Discarded: the model asked 3 times in a row for the very same thing ("leggi" with the same arguments) and kept going — I cannot tell it from a loop. This tool did not run.';

const lettura = (id, esito) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'leggi' },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso: 'package.json' }) },
  { type: 'ToolCallResult', toolCallId: id, ...esito },
];

const giro = (conIlCampo) => [
  { type: 'RunStarted', input: { consegna: 'Leggi il package e dimmi il nome.' } },
  ...lettura('d-1', { content: '{ "name": "progetto" }' }),
  ...lettura('d-2', { content: '{ "name": "progetto" }' }),
  ...lettura('d-3', { content: ANNULLO, isError: true, outcome: 'cancelled', ...(conIlCampo ? { duplicate: true } : {}) }),
  ...lettura('d-4', { content: ANNULLO, isError: true, outcome: 'cancelled', ...(conIlCampo ? { duplicate: true } : {}) }),
  { type: 'TextMessageStart', messageId: 'd-m1' },
  { type: 'TextMessageContent', messageId: 'd-m1', delta: 'Il progetto si chiama «progetto».' },
  { type: 'TextMessageEnd', messageId: 'd-m1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: 1 + i }));

async function apri(page, conIlCampo) {
  const conti = { nonGet: 0 };
  const sessione = `doppione-saltato-${conIlCampo ? 'si' : 'no'}`;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${sessione}/events`) {
      const storia = [...giro(conIlCampo), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (url.pathname === `/api/v1/sessions/${sessione}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${sessione}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Doppione saltato', 'z-ai/glm-5.3-flash', { conclusa: true }), sessione);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  return conti;
}

test('DOPPIONE-SALTATO-01 — le copie identiche scartate si dicono «doppioni saltati», col pallino neutro, mai fra gli errori', async ({ page }) => {
  const conti = await apri(page, true);
  const seg = page.locator(SEG).last();
  await expect(seg.locator('.talos-activity__descrizione')).toContainText('2 doppioni saltati');
  await expect(seg.locator('.talos-activity__errore')).toHaveText(''); // il conteggio rosso resta vuoto
  await expect(seg).not.toContainText(/non riuscit/u);
  await seg.locator(':scope > .talos-activity__head').click();
  const righe = seg.locator('.talos-tool-row[data-tool-state="duplicate"]');
  await expect(righe).toHaveCount(2);
  await expect(righe.first().locator('.talos-dot')).not.toHaveClass(/talos-dot--(danger|warning|success)/u);
  await expect(righe.first()).toContainText(/richiesta identica, saltata|doppione, saltato/u);
  await expect(seg.locator('.talos-tool-row[data-tool-state="error"]')).toHaveCount(0);
  await expect(seg.locator('.talos-tool-row[data-tool-state="complete"]')).toHaveCount(2); // le due eseguite restano riuscite
  expect(conti.nonGet, 'nessuna scrittura verso il server').toBe(0);
});

test('DOPPIONE-SALTATO-02, al contrario — un annullo SENZA il campo resta quello di prima (sessioni vecchie, altre cause)', async ({ page }) => {
  await apri(page, false);
  const seg = page.locator(SEG).last();
  await expect(seg).not.toContainText('doppioni saltati');
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="duplicate"]')).toHaveCount(0);
  /* Misurato il 12/10/2026: senza il campo queste righe erano contate fra i file LETTI («4 file letti») — il difetto che il
     campo cura. Qui si prova solo che a decidere è il campo, non il testo dell'annullo. */
  await expect(seg.locator('.talos-activity__descrizione')).not.toContainText('doppion');
});
