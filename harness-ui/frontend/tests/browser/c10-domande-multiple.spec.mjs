import { test, expect } from '@playwright/test';

/*
 * C10 (owner 10/10/2026, coda Codex: «Ask multiSelect — array canonico, Altro, bozza isolata, conferma, tastiera») — la scheda delle
 *   domande con più schede aperte e con la scelta multipla, nel browser vero (un DOM finto non ha i gruppi dei radio).
 * ⛔ Il difetto trovato: il gruppo dei radio era `question-<id>` per TUTTO il documento. Due schede aperte insieme con lo stesso id
 *   (C2-Q: due figlie che chiedono nella conversazione del padre) facevano un gruppo solo, e la scelta nella seconda spariva dalla
 *   prima (HTML Standard, «radio button group»: stesso albero, nessun form, stesso nome).
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174): le risposte si intercettano e si contano, nessuna arriva a un registro.
 */
async function apri(page, sessione) {
  const corpi = [];
  await page.route(`**/api/v1/sessions/${sessione}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route(`**/api/v1/sessions/${sessione}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${sessione}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${sessione}/question`, async (route) => {
    corpi.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ json: { ok: true, data: { ok: true } } });
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Domande', 'qwen/qwen3.8-flash', { conclusa: false });
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9960, input: { consegna: 'chiedi' }, contesto: { cartella: 'C:\\p' } }, r.realSessionState.generation);
  }, sessione);
  return corpi;
}
const chiedi = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);
const scheda = (page, requestId) => page.locator(`[data-c="UserQuestionCard"][data-request-id="${requestId}"]`);

test('C10-GRUPPI: two open cards with the same question id keep their own choice, and each sends its own', async ({ page }) => {
  const corpi = await apri(page, 'c10-gruppi');
  const domande = [
    { id: 'scelta', question: 'Quale fornitore?', options: [{ label: 'Finto', description: 'Senza rete' }, { label: 'Sandbox', description: 'In rete' }] },
    { id: 'nota', question: 'Qualcosa da aggiungere?' },
  ];
  await chiedi(page, [
    { type: 'UserQuestionRequested', _sequenza: 9961, requestId: 'req-uno', questions: domande },
    { type: 'UserQuestionRequested', _sequenza: 9962, requestId: 'req-due', questions: domande },
  ]);
  const uno = scheda(page, 'req-uno');
  const due = scheda(page, 'req-due');
  await expect(page.locator('#userQuestionDock [data-c="UserQuestionCard"]')).toHaveCount(2);
  await uno.getByRole('radio', { name: 'Finto' }).click();
  await due.getByRole('radio', { name: 'Sandbox' }).click();
  /* il clic esplicito porta alla seconda domanda: si torna indietro e si guarda la prima scelta, che deve esserci ancora */
  await uno.getByRole('button', { name: 'Indietro' }).click();
  await expect(uno.getByRole('radio', { name: 'Finto' })).toBeChecked();
  /* la seconda scheda è già alla sua seconda domanda: i radio sono nascosti, si leggono per valore */
  await expect(due.locator('input[type=radio][value="Finto"]')).not.toBeChecked();
  await expect(due.locator('input[type=radio][value="Sandbox"]')).toBeChecked();
  if (process.env.TALOS_C10_FOTO) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const tema of ['light', 'dark']) {
      /* il tema si cambia come lo cambia il sistema: forzare `data-theme` a mano lasciava i controlli nativi in chiaro */
      await page.emulateMedia({ colorScheme: tema });
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(tema);
      await page.screenshot({ path: `${process.env.TALOS_C10_FOTO}/c10-due-schede-${tema}.png`, animations: 'disabled' });
    }
  }
  await uno.getByRole('button', { name: 'Avanti' }).click();
  await uno.getByRole('textbox').fill('nessuna');
  await uno.getByRole('button', { name: 'Rivedi risposte' }).click();
  await uno.getByRole('button', { name: 'Conferma e invia' }).click();
  await expect.poll(() => corpi.length).toBe(1);
  expect(corpi[0]).toEqual({ requestId: 'req-uno', status: 'answered', answers: { scelta: 'Finto', nota: 'nessuna' } });
  await expect(due.locator('input[type=radio][value="Sandbox"]')).toBeChecked();
});

test('C10-MULTI-TASTI: keys 1-9 toggle the choices of a multiple-choice question, and nothing is sent without the review', async ({ page }) => {
  const corpi = await apri(page, 'c10-tasti');
  await chiedi(page, [{ type: 'UserQuestionRequested', _sequenza: 9971, requestId: 'req-tasti', questions: [
    { id: 'controlli', question: 'Quali controlli lancio?', multiSelect: true, options: [
      { label: 'Test', description: 'Unità' }, { label: 'Lint', description: 'Stile' }, { label: 'Build', description: 'Pacchetto' }] },
  ] }]);
  const card = scheda(page, 'req-tasti');
  await card.getByRole('checkbox', { name: 'Test' }).focus();
  await page.keyboard.press('1');
  await page.keyboard.press('3');
  await expect(card.getByRole('checkbox', { name: 'Test' })).toBeChecked();
  await expect(card.getByRole('checkbox', { name: 'Build' })).toBeChecked();
  await page.keyboard.press('1');
  await expect(card.getByRole('checkbox', { name: 'Test' })).not.toBeChecked();
  await page.waitForTimeout(150);
  expect(corpi).toEqual([]);
  /* nel campo «Altro» un numero è testo, non una scelta */
  await card.getByRole('textbox', { name: 'Altra risposta' }).fill('');
  await card.getByRole('textbox', { name: 'Altra risposta' }).pressSequentially('2 volte');
  await expect(card.getByRole('checkbox', { name: 'Lint' })).not.toBeChecked();
  await card.getByRole('button', { name: 'Rivedi risposte' }).click();
  await expect(card).toContainText('Build, 2 volte');
  await card.getByRole('button', { name: 'Conferma e invia' }).click();
  await expect.poll(() => corpi.length).toBe(1);
  expect(corpi[0]).toEqual({ requestId: 'req-tasti', status: 'answered', answers: { controlli: ['Build', '2 volte'] } });
});

test('C10-MULTI-DOPPIONE: an «Other» equal to a selected choice is stopped at the review, never sent', async ({ page }) => {
  const corpi = await apri(page, 'c10-doppione');
  await chiedi(page, [{ type: 'UserQuestionRequested', _sequenza: 9981, requestId: 'req-doppione', questions: [
    { id: 'controlli', question: 'Quali controlli lancio?', multiSelect: true, options: [
      { label: 'Test', description: 'Unità' }, { label: 'Lint', description: 'Stile' }] },
  ] }]);
  const card = scheda(page, 'req-doppione');
  await card.getByRole('checkbox', { name: 'Test' }).check();
  await card.getByRole('textbox', { name: 'Altra risposta' }).fill('Test');
  await card.getByRole('button', { name: 'Rivedi risposte' }).click();
  await expect(card).toContainText('La risposta Altro duplica una scelta selezionata.');
  await expect(card.getByRole('button', { name: 'Conferma e invia' })).toBeDisabled();
  expect(corpi).toEqual([]);
});
