import { test, expect } from '@playwright/test';

/*
 * R-04 (ledger della revisione degli attrezzi, 12/10/2026; cura 17/10/2026): il trascritto esportato non mostra più
 * «Evento non riconosciuto `CUSTOM`» per la contabilità del giro. Come Codex (`transcript_export.rs:227-287`): ciò che la chat
 * disegna ha la sua frase, ciò che non disegna resta fuori e si conta in fondo; ciò che non si riconosce resta col suo JSON.
 * Stessa porta d'ingresso di `esportazione-fornitore.spec.mjs`: la funzione vera della app, sugli eventi veri.
 */
async function esporta(page, eventi) {
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return page.evaluate((eventi) => window.__talosHarnessUiRuntime.costruisciTrascrizioneMarkdown({
    sessionId: 'esportazione-interni', taskId: 'libero:default', nome: 'Interni', modello: 'z-ai/glm-5.3-flash', eventi,
  }), eventi);
}
const turno = (...custom) => [
  { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Ciao' } },
  ...custom,
  { type: 'TextMessageStart', messageId: 'm', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'm', delta: 'RISPOSTA' },
  { type: 'TextMessageEnd', messageId: 'm' },
  { type: 'RunFinished', threadId: 't', runId: 'r' },
];
const consumo = { type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', provider: 'openrouter', model: 'z-ai/glm-5.3-flash', usage: { prompt_tokens: 3183, completion_tokens: 157, total_tokens: 3340 }, costoDichiarato: null, esito: 'completato' } };
const misura = { type: 'CUSTOM', name: 'talos.context', value: { schema: 'talos.context.event.v1', id: 'usage-ab', sessionId: 'esportazione-interni', kind: 'context.usage.recorded', createdAt: '2026-10-12T10:00:00.000Z', payload: { operationId: 'op', usage: { input: 10 } } } };
const versione = { type: 'CUSTOM', name: 'talos.context', value: { schema: 'talos.context.event.v1', id: 'e1', sessionId: 'esportazione-interni', jobId: 'j', versionId: 'v1', kind: 'context.version.committed', createdAt: '2026-10-12T10:00:00.000Z', payload: { coveredThrough: 4 } } };
const inizio = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', giro: 50, tokenPrima: 200121, soglia: 200000, motivo: 'soglia' } };
const fine = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 50, compattato: true, tokenPrima: 200121, tokenDopo: 9998, misura: 'fornitore', coveredThrough: 391, at: '2026-10-04T10:09:28.580Z', modello: 'm', motivo: 'soglia' } };

test('EXPORT-INTERNI-01 — consumo e misura del contesto non sono più «evento non riconosciuto»: fuori, e contati in fondo', async ({ page }) => {
  const md = await esporta(page, turno(consumo, misura, consumo));
  expect(md).not.toMatch(/Evento non riconosciuto|Unrecognized event/u);
  expect(md).not.toContain('consumo-fornitore');
  expect(md).not.toContain('talos.context');
  expect(md).toMatch(/_Eventi interni non mostrati qui \(.*\): 3\. L’esportazione JSON li contiene tutti\._$/u);
  expect(md).toContain('RISPOSTA');
});

test('EXPORT-INTERNI-02 — la compattazione si dice con la frase della chat, nel punto in cui è avvenuta', async ({ page }) => {
  const md = await esporta(page, [...turno(inizio, fine), ...turno(versione)]);
  expect(md).toContain('_Conversazione compattata · 190.123 token risparmiati_');
  expect(md).toContain('_Contesto compattato_');
  expect(md).not.toMatch(/Evento non riconosciuto|Unrecognized event/u);
  // l'inizio non ha riga in chat: resta fuori e si conta
  expect(md).toMatch(/: 1\. L’esportazione JSON li contiene tutti\._$/u);
  // nel punto giusto: dopo la domanda del primo giro, prima della risposta
  const i = md.indexOf('Conversazione compattata'); const risposta = md.indexOf('RISPOSTA');
  expect(i).toBeGreaterThan(md.indexOf('Ciao'));
  expect(i).toBeLessThan(risposta);
});

test('EXPORT-INTERNI-03 — AL CONTRARIO: senza eventi interni non c\'è la riga in fondo, e uno sconosciuto resta col suo JSON', async ({ page }) => {
  const pulito = await esporta(page, turno());
  expect(pulito).not.toMatch(/Eventi interni non mostrati|Internal events not shown/u);
  const altro = await esporta(page, turno({ type: 'CUSTOM', name: 'talos.agenti', value: { schema: 'talos.agenti.v1', figlie: [] } }));
  expect(altro).toMatch(/Evento non riconosciuto `CUSTOM`/u);
  expect(altro).toContain('talos.agenti');
  expect(altro).not.toMatch(/Eventi interni non mostrati/u);
});
