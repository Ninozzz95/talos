import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ PO-27 punto 5 — IL BLOCCO CODICE DELLA SCHEDA DI APPROVAZIONE. 17/09/2026.
 *
 * Due difetti visti nelle foto del 17/09, tutti e due nel foglio (`styles/index.css`), nessuno nel
 * componente:
 *  1. il testo del comando cominciava 2 px più a sinistra di tutte le altre righe della scheda —
 *     `.talos-approval__codice` aveva `padding:10px 12px` mentre le sorelle usano il gutter della
 *     scheda (`--talos-approval-gutter`, 14px);
 *  2. nel tema CHIARO il fondo era un grigio pieno che stonava sul crema, perché la regola diceva
 *     `background: var(--talos-code-bg, …)` e `--talos-code-bg` NON È DEFINITO DA NESSUNA PARTE
 *     (misurato il 17/09: il token compare solo dentro dei `var(...)` con ripiego, mai in un
 *     `:root`) ⇒ vinceva sempre il ripiego `rgba(0,0,0,.18)`, che in un tema scuro passa e in uno
 *     chiaro è una macchia.
 *
 * ⛔ Il disallineamento si misura sul BORDO SINISTRO DEL TESTO, non su quello della scatola: due
 *   scatole diverse (una con bordo e padding, una senza) possono avere lo stesso `left` e mostrare
 *   il testo in due punti diversi. Si somma `left + border-left + padding-left`, e si pretende 0.
 * ⛔ Il fondo si prova contro il TOKEN calcolato del tema in corso, non contro un colore scritto
 *   qui: un colore atteso scritto a mano in una prova è una seconda verità che invecchia al primo
 *   ritocco della palette.
 */

const VIEWPORT = [{ nome: '1024x800', larghezza: 1024, altezza: 800 }, { nome: '1440x900', larghezza: 1440, altezza: 900 }];

async function apriApp(page, { tema, larghezza, altezza }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/po27cod-*/events*', (rotta) => rotta.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

/** Una scheda di approvazione VERA: la fa nascere l'evento del kernel, non una scrittura nel DOM. */
async function unaScheda(page) {
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('po27cod-uno', 'workspace', 'PO-27 approvazione', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generazione = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Guarda la configurazione' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }, _sequenza: 1 }, generazione);
    runtime.handleRealEvent({ type: 'ApprovalRequested', requestId: 'po27-app-1', azione: { tipo: 'shell', comando: 'npm run build -- --profilo=produzione' }, _sequenza: 2 }, generazione);
  });
  const scheda = page.locator('#conversation [data-c="ApprovalCard"]').first();
  await expect(scheda).toBeVisible();
  await expect(scheda.locator('.talos-approval__codice')).toBeVisible();
  return scheda;
}

/** `left + bordo + padding` = dove comincia davvero il testo, in pixel di pagina. */
const MISURA = `(selettore) => {
  const nodo = document.querySelector(selettore);
  const misura = nodo.getBoundingClientRect();
  const stile = getComputedStyle(nodo);
  return misura.left + parseFloat(stile.borderLeftWidth) + parseFloat(stile.paddingLeft);
}`;

for (const tema of ['dark', 'light']) {
  for (const viewport of VIEWPORT) {
    test(`PO27-COD-01 (${tema}, ${viewport.nome}) — il comando comincia ESATTAMENTE dove cominciano le altre righe`, async ({ page }) => {
      await apriApp(page, { tema, ...viewport });
      await unaScheda(page);
      const sinistraCodice = await page.evaluate(`(${MISURA})('.talos-approval__codice')`);
      const sinistraPerche = await page.evaluate(`(${MISURA})('.talos-approval__why')`);
      const scarto = Math.round((sinistraCodice - sinistraPerche) * 100) / 100;
      expect(scarto, `il blocco codice sporge di ${scarto} px rispetto alla riga «perché»`).toBe(0);
    });

    test(`PO27-COD-02 (${tema}, ${viewport.nome}) — il fondo viene dai token del tema, non da un ripiego`, async ({ page }) => {
      await apriApp(page, { tema, ...viewport });
      await unaScheda(page);
      const { fondo, atteso } = await page.evaluate(() => {
        const nodo = document.querySelector('.talos-approval__codice');
        const sonda = document.createElement('div');
        sonda.style.backgroundColor = 'var(--talos-panel-soft)';
        nodo.parentElement.append(sonda);
        const atteso = getComputedStyle(sonda).backgroundColor;
        sonda.remove();
        return { fondo: getComputedStyle(nodo).backgroundColor, atteso };
      });
      expect(fondo, `il fondo del blocco codice era ${fondo}`).toBe(atteso);
    });
  }
}
