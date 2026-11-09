/*
 * Catalogo v2 nel browser (ledger G-C, scene 7 e 9, 05/11/2026): UIG-7.R1 il cursore e UIG-9.R1 metriche, confronto e diagramma.
 * ⛔ SCRITTA E NON LANCIATA da G-C (il brief vieta le corse browser in questo gruppo): la lancia il Tester o il Desktop.
 *   Il tema si cambia con `data-theme` sulla radice: se la corsa mostra che l'app lo legge altrove, va corretto QUI e detto.
 * Stessa strada di `blocchi-chat.spec.mjs`: gli eventi del server dati al gestore della pagina, nessun giro vero.
 */
import { expect, test } from '@playwright/test';

const ID = 'chat-blocchi-v2';
const RECINTO = (corpo) => `Ecco:\n\n\`\`\`talos-blocco\n${corpo}\n\`\`\`\n\nFine.`;
const CURSORE = 'root = Cursore("sconto", "Sconto sui modelli in rete", {id: "sconto", etichetta: "Sconto sui modelli in rete", min: 0, max: 60, passo: 5, valore: 30}, [{id: "voce", titolo: "Voce"}, {id: "spesa", titolo: "Spesa"}], [["Modelli in rete", 412], ["Elettricità", 180.5]], "spesa * (1 - sconto / 100)", "soldi")';
const METRICHE = 'root = Metriche("mese", "Ottobre", [{nome: "Spesa di ottobre con un nome lungo che deve restare intero", valore: 675.3, formato: "soldi", verso: "su", nota: "+12% su settembre"}, {nome: "Richieste", valore: 214}])';
const CONFRONTO = 'root = Confronto("dove", null, [{nome: "In rete", pro: ["Modelli più grandi", "Niente da installare"], contro: ["Costa a ogni richiesta"]}, {nome: "Locale", pro: ["Privato"]}, {nome: "Ibrido", pro: ["Il meglio dei due"], contro: ["Più da configurare"]}])';
const DIAGRAMMA = 'root = Diagramma("giro", "Il giro", [{id: "m", testo: "Messaggio"}, {id: "k", testo: "Kernel"}, {id: "t", testo: "Attrezzi"}, {id: "r", testo: "Risposta"}], [{da: "m", a: "k"}, {da: "k", a: "t", testo: "chiama"}, {da: "t", a: "k"}, {da: "k", a: "r"}])';

async function apri(page, tema) {
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(([id, t]) => {
    document.documentElement.dataset.theme = t;
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Blocchi v2', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, [ID, tema]);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
}
const giro = (page, testo) => page.evaluate(([id, t]) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of [
    { type: 'RunStarted', threadId: id, runId: 'r1' },
    { type: 'TextMessageStart', messageId: 'm1', role: 'assistant' },
    { type: 'TextMessageContent', messageId: 'm1', delta: t },
    { type: 'TextMessageEnd', messageId: 'm1' },
    { type: 'RunFinished', threadId: id, runId: 'r1', outcome: { type: 'success' } },
  ]) r.handleRealEvent(e, r.realSessionState.generation);
}, [ID, testo]);

test('UIG-7.R1 il cursore si muove col mouse e con le frecce, il risultato cambia, e muoverlo non manda NESSUNA richiesta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apri(page, 'light');
  await giro(page, RECINTO(CURSORE));
  const blocco = page.locator('#conversation .gu-cursore');
  await expect(blocco).toHaveCount(1);
  const totale = blocco.locator('.gu-totale');
  await expect(totale).toHaveText('Totale: 414,75 €');
  const richieste = [];
  page.on('request', (r) => { if (!r.url().includes('/events')) richieste.push(`${r.method()} ${r.url()}`); });
  const input = blocco.locator('input[type=range]');
  await input.focus();
  await page.keyboard.press('ArrowRight'); // passo 5: 30 → 35
  await expect(blocco.locator('output')).toHaveText('35');
  await page.keyboard.press('End');
  await expect(blocco.locator('output')).toHaveText('60');
  await expect(totale).toHaveText('Totale: 237,00 €');
  await page.keyboard.press('Home');
  await expect(totale).toHaveText('Totale: 592,50 €');
  const box = await input.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // a metà: 30
  await expect(blocco.locator('output')).toHaveText('30');
  await expect(totale).toHaveAttribute('aria-live', 'polite');
  expect(richieste, 'il conto è locale: zero richieste muovendo il cursore').toEqual([]);
});

for (const tema of ['light', 'dark']) {
  for (const larghezza of [1440, 1024]) {
    test(`UIG-9.R1 metriche, confronto e diagramma a ${larghezza} in tema ${tema}: nessun testo tagliato`, async ({ page }) => {
      await page.setViewportSize({ width: larghezza, height: 900 });
      await apri(page, tema);
      await giro(page, [METRICHE, CONFRONTO, DIAGRAMMA].map(RECINTO).join('\n\n'));
      await expect(page.locator('#conversation .gu-metriche')).toHaveCount(1);
      await expect(page.locator('#conversation .gu-confronto')).toHaveCount(1);
      await expect(page.locator('#conversation .gu-diagramma svg')).toHaveCount(1);
      /* nessun testo che scappa dal suo riquadro: scrollWidth > clientWidth è un taglio (o un trabocco) */
      const tagliati = await page.evaluate(() => [...document.querySelectorAll('#conversation .gu-metrica__k, #conversation .gu-metrica__v, #conversation .gu-confronto__nome, #conversation .gu-confronto__lista li, #conversation .gu-confronto__titolo')]
        .filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent));
      expect(tagliati).toEqual([]);
      /* il diagramma non esce dalla colonna della conversazione */
      const fuori = await page.evaluate(() => {
        const c = document.querySelector('#conversation .gu-diagramma');
        return c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflowX !== 'auto';
      });
      expect(fuori).toBe(false);
      /* il testo dei riquadri usa il colore del testo del tema, non quello della serie */
      const colori = await page.evaluate(() => {
        const v = getComputedStyle(document.querySelector('#conversation .gu-metrica__v')).color;
        const radice = getComputedStyle(document.documentElement).getPropertyValue('--talos-text').trim();
        return { v, radice };
      });
      expect(colori.radice).not.toBe('');
      await page.screenshot({ path: `test-results/uig-9-r1-${tema}-${larghezza}.png`, fullPage: false });
    });
  }
}
