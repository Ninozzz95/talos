import { test, expect } from '@playwright/test';

/*
 * ⛔ A11 punto b (bugfixer, 08/10/2026) — NELL'ESPORTAZIONE L'ORDINE È QUELLO IN CUI LE COSE COMPAIONO.
 *   Ogni blocco si scriveva al suo «End»: con glm-5.3-flash il messaggio si apre con uno spazio PRIMA del ragionamento e finisce
 *   DOPO, quindi nel file il testo stava sopra il ragionamento (in chat lo aveva curato A11, 3e2fd8170). Gli eventi qui sotto
 *   sono nella forma che il server rigioca (agui-events.mjs), nell'ordine misurato sul fornitore finto VUOTOPRIMA.
 */
async function esporta(page, eventi) {
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return page.evaluate((eventi) => window.__talosHarnessUiRuntime.costruisciTrascrizioneMarkdown({
    sessionId: 'esportazione-ordine', taskId: 'libero:default', nome: 'Ordine', modello: 'z-ai/glm-5.3-flash', eventi,
  }), eventi);
}
const posizione = (testo, pezzo) => { const i = testo.indexOf(pezzo); expect(i, `«${pezzo}» manca nell'esportazione`).toBeGreaterThanOrEqual(0); return i; };

test('EXPORT-ORDINE-01 — uno spazio, poi il ragionamento, poi il testo: nel file il ragionamento sta sopra', async ({ page }) => {
  const md = await esporta(page, [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Quanto fa 2+2?' } },
    { type: 'TextMessageStart', messageId: 'm', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'm', delta: ' ' },
    { type: 'ReasoningMessageStart', messageId: 'p' },
    { type: 'ReasoningMessageContent', messageId: 'p', delta: 'PENSIERO-UNO' },
    { type: 'TextMessageContent', messageId: 'm', delta: 'RISPOSTA-UNO' },
    { type: 'TextMessageEnd', messageId: 'm' },
    { type: 'ReasoningMessageEnd', messageId: 'p' }, // ⛔ DOPO il testo: è così che il server lo scrive (misurato sulla 4176)
    { type: 'RunFinished', threadId: 't', runId: 'r' },
  ]);
  expect(posizione(md, 'PENSIERO-UNO')).toBeLessThan(posizione(md, 'RISPOSTA-UNO'));
});

/*
 * L'ordine VERO di tre passi (ragionamento, testo, attrezzo), copiato dal giornale della 4176 col copione INTRECCIO del fornitore
 * finto: ogni ragionamento si chiude dopo il testo e dopo l'avvio dell'attrezzo del suo passo. Prima nel file usciva
 * R1, attrezzo, T2, R2, attrezzo, T3, R3: ogni testo sopra il proprio ragionamento.
 */
test('EXPORT-ORDINE-04 — tre passi nell\'ordine del server: ogni ragionamento sta sopra il suo testo e il suo attrezzo', async ({ page }) => {
  const pensa = (id, segno) => [{ type: 'ReasoningMessageStart', messageId: id }, { type: 'ReasoningMessageContent', messageId: id, delta: segno }];
  const md = await esporta(page, [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Lancia due comandi.' } },
    ...pensa('r1', 'PASSO-R1'),
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"comando":"echo uno"}' },
    { type: 'ReasoningMessageEnd', messageId: 'r1' },
    { type: 'ToolCallResult', toolCallId: 'c1', content: 'ESITO-C1' },
    ...pensa('r2', 'PASSO-R2'),
    { type: 'TextMessageStart', messageId: 't2', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 't2', delta: 'PASSO-T2' },
    { type: 'ToolCallStart', toolCallId: 'c2', toolCallName: 'shell' },
    { type: 'ToolCallArgs', toolCallId: 'c2', delta: '{"comando":"echo due"}' },
    { type: 'TextMessageEnd', messageId: 't2' },
    { type: 'ReasoningMessageEnd', messageId: 'r2' },
    { type: 'ToolCallResult', toolCallId: 'c2', content: 'ESITO-C2' },
    ...pensa('r3', 'PASSO-R3'),
    { type: 'TextMessageStart', messageId: 't3', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 't3', delta: 'PASSO-T3' },
    { type: 'TextMessageEnd', messageId: 't3' },
    { type: 'ReasoningMessageEnd', messageId: 'r3' },
    { type: 'RunFinished', threadId: 't', runId: 'r' },
  ]);
  const ordine = ['PASSO-R1', 'ESITO-C1', 'PASSO-R2', 'PASSO-T2', 'ESITO-C2', 'PASSO-R3', 'PASSO-T3'].map((pezzo) => posizione(md, pezzo));
  expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
});

test('EXPORT-ORDINE-02 — AL CONTRARIO: un testo VERO prima del ragionamento resta sopra; e l\'attrezzo sta dove è partito', async ({ page }) => {
  const md = await esporta(page, [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'Leggi il README.' } },
    { type: 'TextMessageStart', messageId: 'm', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'm', delta: 'TESTO-PRIMA' },
    { type: 'ReasoningMessageStart', messageId: 'p' },
    { type: 'ReasoningMessageContent', messageId: 'p', delta: 'PENSIERO-DOPO' },
    { type: 'ReasoningMessageEnd', messageId: 'p' },
    { type: 'ToolCallStart', toolCallId: 'c', toolCallName: 'leggi' },
    { type: 'ToolCallArgs', toolCallId: 'c', delta: '{"percorso":"README.md"}' },
    { type: 'TextMessageEnd', messageId: 'm' },
    { type: 'TextMessageStart', messageId: 'm2', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'm2', delta: 'TESTO-FINALE' },
    { type: 'ToolCallResult', toolCallId: 'c', content: 'ESITO-ATTREZZO' },
    { type: 'TextMessageEnd', messageId: 'm2' },
    { type: 'RunFinished', threadId: 't', runId: 'r' },
  ]);
  const ordine = ['TESTO-PRIMA', 'PENSIERO-DOPO', 'ESITO-ATTREZZO', 'TESTO-FINALE'].map((pezzo) => posizione(md, pezzo));
  expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
});

test('EXPORT-ORDINE-03 — un testo di soli spazi non lascia un «Assistente» vuoto, e un blocco mai chiuso resta fuori', async ({ page }) => {
  const md = await esporta(page, [
    { type: 'RunStarted', threadId: 't', runId: 'r', input: { consegna: 'x' } },
    { type: 'TextMessageStart', messageId: 'vuoto', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'vuoto', delta: '  ' },
    { type: 'TextMessageEnd', messageId: 'vuoto' },
    { type: 'TextMessageStart', messageId: 'aperto', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'aperto', delta: 'MAI-CHIUSO' },
    { type: 'TextMessageStart', messageId: 'vero', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'vero', delta: 'TESTO-VERO' },
    { type: 'TextMessageEnd', messageId: 'vero' },
    { type: 'RunFinished', threadId: 't', runId: 'r' },
  ]);
  expect(md).toContain('TESTO-VERO');
  expect(md).not.toContain('MAI-CHIUSO');
  expect(md).not.toContain('[object Object]');
  const linee = md.split('\n');
  const intestazioneAssistente = linee[linee.indexOf('TESTO-VERO') - 2];
  expect(linee.filter((riga) => riga === intestazioneAssistente).length, 'un solo blocco di testo: lo spazio non ne apre un altro').toBe(1);
});
