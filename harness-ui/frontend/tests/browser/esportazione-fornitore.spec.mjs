import { test, expect } from '@playwright/test';

/*
 * Decisione 14 (owner 08/10/2026 sera): il fornitore a valle che OpenRouter dichiara (`talos.fornitore-a-valle`, un CUSTOM
 * durevole) entra nel trascritto esportato come un fatto leggibile, non come «evento non riconosciuto» col JSON. Gli altri
 * CUSTOM restano dove erano: il `default` che non scarta niente. Stessa porta d'ingresso di `esportazione-ordine.spec.mjs`.
 */
async function esporta(page, eventi) {
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return page.evaluate((eventi) => window.__talosHarnessUiRuntime.costruisciTrascrizioneMarkdown({
    sessionId: 'esportazione-fornitore', taskId: 'libero:default', nome: 'Fornitore', modello: 'z-ai/glm-5.3-flash', eventi,
  }), eventi);
}
const turno = (custom) => [
  { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Ciao' } },
  custom,
  { type: 'TextMessageStart', messageId: 'm', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm', delta: 'RISPOSTA' },
  { type: 'TextMessageEnd', messageId: 'm' },
  { type: 'RunFinished', threadId: 't', runId: 'r' },
];

test('EXPORT-FORNITORE-01 — il fornitore a valle è una riga leggibile, non un evento sconosciuto col JSON', async ({ page }) => {
  const md = await esporta(page, turno({ type: 'CUSTOM', name: 'talos.fornitore-a-valle', value: { schema: 'talos.fornitore-a-valle.v1', threadId: 't', runId: 'r', giro: 1, fornitore: 'DeepInfra', modello: 'z-ai/glm-5.3-flash' } }));
  expect(md).toMatch(/_(Servita da|Served by) DeepInfra (su|on) OpenRouter\._/u);
  expect(md).not.toContain('talos.fornitore-a-valle');
  expect(md).not.toMatch(/Evento non riconosciuto|Unrecognized event/u);
});

test('EXPORT-FORNITORE-02 — AL CONTRARIO: un altro CUSTOM resta com\'era (riconoscibile, col suo JSON), e uno del fornitore senza nome pure', async ({ page }) => {
  const altro = await esporta(page, turno({ type: 'CUSTOM', name: 'talos.agenti', value: { schema: 'talos.agenti.v1', figlie: [] } }));
  expect(altro).toMatch(/Evento non riconosciuto `CUSTOM`|Unrecognized event `CUSTOM`/u);
  expect(altro).toContain('talos.agenti');
  const vuoto = await esporta(page, turno({ type: 'CUSTOM', name: 'talos.fornitore-a-valle', value: { fornitore: '   ' } }));
  expect(vuoto).not.toMatch(/Servita da|Served by/u);
  expect(vuoto).toContain('talos.fornitore-a-valle');
});
