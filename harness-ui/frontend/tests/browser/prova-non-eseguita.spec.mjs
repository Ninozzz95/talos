import { expect, test } from '@playwright/test';

/*
 * Owner 03/10/2026, «Stato "non eseguito" (Consigliato)»: nella chat una prova NON ESEGUITA — nessuna suite, oppure il comando è
 *   partito e nessun test è stato eseguito (`NOT RUN:`) — era una riga ROSSA «non riuscito», mentre i Processi dicevano
 *   «Non eseguito». Non è né un successo né un fallimento: pallino d'attenzione, «non eseguito», mai contata fra gli errori.
 * Il giro arriva come la storia di una sessione riaperta (stesse forme di `lab/fixtures/attivita-compatta.js`: attrezzo, testo,
 *   `RunFinished` con l'esito) e passa da `app.js` come dal server.
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta.
 */
const SEG = '#conversation .talos-activity--segment';

/* I testi sono quelli del kernel (`talosHarness.mjs`, `messaggioNessunTestEseguito` e `messaggioProvaNonEseguita`), non inventati. */
const CASI = {
  zero: 'NOT RUN: NO_TESTS_RAN — the test command ran and exited 0, but no tests ran: this is not a pass. Create the suite or point the command at the folder that has one.\nThe runner said: ℹ tests 0',
  suite: 'NOT RUN: NO_TEST_SUITE_CONFIGURED — no test suite found in /progetto: package.json has no "test" script. No command was run, so there is no exit code; this is not a pass. No test runner was found in this folder either: create the tests first, or check the work another way.',
  rosso: 'exit 1\n✖ somma › due più due\nℹ tests 3\nℹ pass 2\nℹ fail 1',
};

const giro = (esito) => [
  { type: 'RunStarted', input: { consegna: 'Lancia i test e dimmi come vanno.' } },
  { type: 'ToolCallStart', toolCallId: 'p-l1', toolCallName: 'leggi' },
  { type: 'ToolCallArgs', toolCallId: 'p-l1', delta: JSON.stringify({ percorso: 'package.json' }) },
  { type: 'ToolCallResult', toolCallId: 'p-l1', content: '{ "name": "progetto" }' },
  { type: 'ToolCallStart', toolCallId: 'p-t1', toolCallName: 'prova' },
  { type: 'ToolCallArgs', toolCallId: 'p-t1', delta: '{}' },
  { type: 'ToolCallResult', toolCallId: 'p-t1', content: esito },
  { type: 'TextMessageStart', messageId: 'p-m1' },
  { type: 'TextMessageContent', messageId: 'p-m1', delta: 'Ecco come sono andati i test.' },
  { type: 'TextMessageEnd', messageId: 'p-m1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: 1 + i }));

async function apri(page, caso) {
  const conti = { nonGet: 0 };
  const sessione = `prova-non-eseguita-${caso}`;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${sessione}/events`) {
      const storia = [...giro(CASI[caso]), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (url.pathname === `/api/v1/sessions/${sessione}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${sessione}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Prova non eseguita', 'z-ai/glm-5.3-flash', { conclusa: true }), sessione);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  return conti;
}

for (const caso of ['zero', 'suite']) {
  test(`PROVA-NON-ESEGUITA — ${caso === 'zero' ? 'zero test eseguiti' : 'nessuna suite'}: «non eseguito» col pallino d'attenzione, mai fra gli errori`, async ({ page }) => {
    const conti = await apri(page, caso);
    const seg = page.locator(SEG).last();
    await expect(seg.locator('.talos-activity__descrizione')).toContainText('1 prova non eseguita');
    await expect(seg.locator('.talos-activity__errore')).toHaveText(''); // il conteggio rosso resta vuoto
    await expect(seg).not.toContainText(/non riuscit/u);
    /* aperto il segmento, la riga della prova porta lo stato e il pallino giusti */
    await seg.locator(':scope > .talos-activity__head').click();
    const riga = seg.locator('.talos-tool-row[data-tool-state="not-run"]');
    await expect(riga).toHaveCount(1);
    await expect(riga.locator('.talos-dot')).toHaveClass(/talos-dot--warning/u);
    await expect(riga).toContainText('non eseguito');
    expect(conti.nonGet, 'nessuna scrittura verso il server').toBe(0);
  });
}

test('PROVA-NON-ESEGUITA AL CONTRARIO — un test ROSSO resta un errore', async ({ page }) => {
  await apri(page, 'rosso');
  const seg = page.locator(SEG).last();
  await expect(seg.locator('.talos-activity__errore')).toContainText(/non riuscit/u);
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="error"]')).toHaveCount(1);
});
