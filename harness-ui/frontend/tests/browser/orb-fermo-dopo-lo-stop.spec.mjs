import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ 24/09/2026 sera, bug dell'owner: «l'orb resta con il ring spinning animato anche quando premo stop mentre ragiona».
 * Lo Stop chiude il giro come `RunError` (codice `fermato`, `agent-service.mjs` `esitoInEventoFinale`) e il gestore dal vivo
 * non spegneva l'anello: le due righe stavano per sbaglio nell'esportazione (`costruisciTrascrizioneMarkdown`).
 * Nei due versi: mentre ragiona l'anello gira (la premessa), dopo lo Stop no; e lo stesso per un errore qualunque.
 */
async function apriChatCheRagiona(page) {
  await page.goto('/');
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.handleRealEvent({ type: 'ReasoningMessageStart', messageId: 'ragiona-stop', _sequenza: 91001 }, runtime.realSessionState.generation);
  });
  const anello = page.locator('#conversation .talos-message__head .talos-orb.working');
  await expect(anello, 'premessa: mentre ragiona l’anello gira').not.toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/talos-giro-vivo/u);
  return anello;
}

for (const [nome, evento] of [
  ['lo Stop', { type: 'RunError', code: 'fermato', message: '⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.' }],
  ['un errore del fornitore', { type: 'RunError', code: 'PROVIDER_REQUEST_ERROR', message: 'Troppo traffico presso il fornitore.' }],
]) {
  test(`ORB-STOPS-ON-RUN-ERROR: dopo ${nome} l’anello dell’orb non gira più e il marchio smette di respirare`, async ({ page }) => {
    const anello = await apriChatCheRagiona(page);
    await page.evaluate((e) => {
      const runtime = window.__talosHarnessUiRuntime;
      runtime.handleRealEvent({ ...e, _sequenza: 91002 }, runtime.realSessionState.generation);
    }, evento);
    await expect(anello).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/talos-giro-vivo/u);
    const animazioni = await page.locator('#conversation .talos-message__head .talos-orb').evaluateAll((orb) => orb
      .flatMap((o) => o.getAnimations({ subtree: true }))
      .filter((a) => a.animationName === 'talos-orb-spin' && a.playState === 'running').length);
    expect(animazioni, 'nessuna animazione dell’anello resta viva').toBe(0);
  });
}
