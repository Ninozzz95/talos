import { expect, test } from '@playwright/test';

/*
 * Revisione del blocco del 03/11 pomeriggio, D1 (S2): il no della PERSONA su una carta arriva dal nucleo come `DECLINED. …` (decisione 44,
 *   Tester R2-R4). L'interfaccia non conosceva la parola: la riga era VERDE e diceva «1 file scritto», il riassunto del giro «1 file
 *   modificato», i Processi «Non riuscito». La forma chiedeva «Non consentito», nel colore neutro, mai fra i riusciti né fra i falliti.
 * Il giro arriva come la storia di una sessione riaperta (stesse forme di `doppione-saltato.spec.mjs`) e passa da `app.js` come dal server.
 *   Il testo del no è quello del nucleo (`TESTO_DEL_NO` + la coda di `scrivi`, talosHarness.mjs), non inventato.
 * ⛔ Ogni richiesta non-GET si FERMA e si conta.
 */
const SEG = '#conversation .talos-activity--segment';
const DETTO_NO = 'DECLINED. The person said no to this. Do not ask again for it, by a card or a question, unless the person brings it up. Go on without it, or say in one line what you can do instead.';
const RIFIUTO = 'REFUSED. "segreti/a.txt" is inside a folder the person blocked. Nothing was written.';

const chiamata = (id, nome, argomenti, esito) => [
  { type: 'ToolCallStart', toolCallId: id, toolCallName: nome },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(argomenti) },
  { type: 'ToolCallResult', toolCallId: id, ...esito },
];

const giro = (esitoScrittura) => [
  { type: 'RunStarted', input: { consegna: 'Scrivi a.txt e leggi il package.' } },
  ...chiamata('n-1', 'leggi', { percorso: 'package.json' }, { content: '{ "name": "progetto" }' }),
  ...chiamata('n-2', 'scrivi', { percorso: 'a.txt', contenuto: 'ciao' }, esitoScrittura),
  ...chiamata('n-3', 'shell', { comando: 'npm install', descrizione: 'Installa le dipendenze' }, esitoScrittura.content.startsWith('DECLINED')
    ? { content: `${DETTO_NO} The command was not run.`, isError: false } : { content: 'REFUSED. the command is blocked by a rule. The command was not run.', isError: true }),
  { type: 'TextMessageStart', messageId: 'n-m1' },
  { type: 'TextMessageContent', messageId: 'n-m1', delta: 'Va bene, non scrivo niente.' },
  { type: 'TextMessageEnd', messageId: 'n-m1' },
  { type: 'RunFinished', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: 1 + i }));

async function apri(page, esitoScrittura, nome) {
  const conti = { nonGet: 0 };
  const sessione = `no-della-persona-${nome}`;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    const url = new URL(req.url());
    if (url.pathname === `/api/v1/sessions/${sessione}/events`) {
      const storia = [...giro(esitoScrittura), { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }];
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (url.pathname === `/api/v1/sessions/${sessione}/children`) return route.fulfill({ json: { ok: true, data: { figli: [] } } });
    if (url.pathname.startsWith(`/api/v1/sessions/${sessione}/tree`)) return route.fulfill({ json: { ok: true, data: { voci: [] } } });
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'No della persona', 'z-ai/glm-5.3-flash', { conclusa: true }), sessione);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  return conti;
}

test('NO-PERSONA-01 — il no della persona: «non consentito», pallino neutro, mai «1 file scritto» né fra gli errori', async ({ page }) => {
  const conti = await apri(page, { content: `${DETTO_NO} Nothing was written.`, isError: false }, 'si');
  const seg = page.locator(SEG).last();
  await expect(seg.locator('.talos-activity__descrizione')).toContainText('2 passi non consentiti');
  await expect(seg.locator('.talos-activity__descrizione')).not.toContainText(/scritt|modificat|comand/u);
  await expect(seg.locator('.talos-activity__errore')).toHaveText('');
  await seg.locator(':scope > .talos-activity__head').click();
  const righe = seg.locator('.talos-tool-row[data-tool-state="declined"]');
  await expect(righe).toHaveCount(2);
  await expect(righe.first().locator('.talos-dot')).not.toHaveClass(/talos-dot--(danger|warning|success)/u);
  await expect(righe.first()).toContainText('non consentito');
  await expect(seg.locator('.talos-tool-row[data-tool-state="error"]')).toHaveCount(0);
  await expect(seg.locator('.talos-tool-row[data-tool-state="complete"]')).toHaveCount(1); // la lettura resta riuscita
  /* i Processi: il comando negato è «negato da te», mai «Non riuscito» */
  const negato = await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.eventiAttrezzi
    .filter((e) => e.type === 'ToolCallResult' && e.toolCallId === 'n-3').map((e) => e.rifiutato));
  expect(negato).toEqual([true]);
  expect(conti.nonGet, 'nessuna scrittura verso il server').toBe(0);
});

test('NO-PERSONA-02, al contrario — un rifiuto di sicurezza (REFUSED) resta un errore, rosso', async ({ page }) => {
  await apri(page, { content: RIFIUTO, isError: true }, 'no');
  const seg = page.locator(SEG).last();
  await expect(seg.locator('.talos-activity__descrizione')).not.toContainText('non consentit');
  await seg.locator(':scope > .talos-activity__head').click();
  await expect(seg.locator('.talos-tool-row[data-tool-state="declined"]')).toHaveCount(0);
  /* la scrittura rifiutata resta rossa (il comando rifiutato ha la sua regola, dal codice d'uscita: qui non si guarda) */
  await expect(seg.locator('.talos-tool-row').nth(1)).toHaveAttribute('data-tool-state', 'error');
});
