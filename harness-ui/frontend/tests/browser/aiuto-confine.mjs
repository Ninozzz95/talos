import { expect } from '@playwright/test';

/*
 * ⛔ 08/10/2026 (bugfixer) — il CONFINE fra storia e presente, per le prove che aprono una sessione FINTA.
 *
 * Il server manda `talos.fine-rigiocata` a ogni flusso, subito dopo la storia (http-app.mjs, dopo `fineReplay()`). Dal 07/10
 * (013a30c2b, A1) e dall'08/10 (ba0447613, A1-R3) la chat si riapre dietro il velo per QUALUNQUE sessione, conclusa o in corso,
 * e il velo si toglie solo lì; anche la Revisione, rigiocata, resta «sporca» fino al confine (app.js, «si disegna una volta sola
 * al confine»). Una prova che risponde al flusso con un corpo vuoto non manda mai il confine: la chat resta `is-restoring`, la
 * rotella tiene il fondo, la Revisione non disegna. Misurato: ~60 rossi in dieci file, tutti per questo.
 *
 * ⛔ Il confine va nel FLUSSO, non iniettato a mano con `handleRealEvent`: l'apertura del flusso arriva dopo e rimette
 *   `inRigiocata` (`source.onopen`). È la forma di `ask-esito-incerto.spec.mjs` e `ask-ricevuta.spec.mjs`. `retry` lungo: il
 *   flusso chiuso non si riapre durante la prova.
 * ⇒ Uso: `page.route('**\/api/v1/sessions/<id>/events*', flussoConConfine)`, poi `passaASessione`, poi `attendiFineStoria(page)`,
 *   poi gli eventi della scena — che arrivano DAL VIVO, come un giro che continua dopo la riapertura.
 */
export const CONFINE = Object.freeze({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null });

export const flussoConConfine = (route) => route.fulfill({
  status: 200, contentType: 'text/event-stream', body: `retry: 3600000\ndata: ${JSON.stringify(CONFINE)}\n\n`,
});

export async function attendiFineStoria(page, { timeout = 15_000 } = {}) {
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout });
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/u, { timeout });
}
