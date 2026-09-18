import { test, expect } from '@playwright/test';

// Frontend di produzione, trasporto controllato: non è una prova di inferenza.
test.use({ channel: 'chrome' });
test.beforeEach(async ({ page }) => {
  /*
   * ⛔ 18/09/2026 — la rotta degli eventi resta PENDING, non `fulfill(body: '')`.
   *   Misurato con la sonda (CAMPI-129 + registro): `fulfill` con corpo vuoto CHIUDE lo stream,
   *   l'EventSource va in errore → `segnalaSse` → sorveglianza 'riconnessione' → contatto 'perso'
   *   → la striscia di stato diventa VISIBILE anche a fondo in vista (CB-20-bis: a contatto perso
   *   non tace) → +60px nel piede; il ping su /api/v1/health risponde 200 → 'ricollegato' →
   *   striscia nascosta −60px; l'EventSource riprova → ciclo ogni ~2 s (class toggle a t=3285,
   *   5294, 6289). La colonna conversazione si restringe e si allarga, lo scrollTop non si tocca
   *   (nessun follow: nessun evento nuovo) e il gap sale 5 → 35 → 60: il test falliva per un
   *   stato IMPOSSIBILE in produzione (server sano, SSE fallito per sempre — qui la ripresa
   *   riapre lo stream e il ciclo finisce). Handler che non risolve = richiesta PENDING = flusso
   *   aperto e muto: nessun `onerror`, contatto stabile 'collegato'. Gli eventi li porta
   *   `handleRealEvent`, il trasporto non deve dire niente.
   *   Fonti 18/09/2026: MDN «EventSource» (error solo su fallimento di connessione; una
   *   connessione aperta e silenziosa non emette nulla); Playwright «Route» (handler non
   *   risolto = richiesta pending); qaskills.sh «Mock a Server-Sent Events Stream in Playwright»
   *   (fulfill chiude la connessione; per tenerla aperta serve un handler che non settle).
   */
  await page.route('**/api/v1/sessions/chat-proof-*/events', () => { /* flusso aperto e muto: resta pending */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
});

async function apri(page, id = 'attiva', chiusa = false) {
  await page.evaluate(({ id, chiusa }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(`chat-proof-${id}`, 'workspace', 'Conversazione di prova', 'local:prova', { conclusa: chiusa, modello: 'local:prova' });
  }, { id, chiusa });
}
async function eventi(page, events) {
  await page.evaluate(events => {
    const r = window.__talosHarnessUiRuntime;
    for (const event of events) r.handleRealEvent(event, r.realSessionState.generation);
  }, events);
}
const avvio = { type: 'RunStarted', input: { consegna: 'Ciao, mi aiuti a controllare questo progetto?' } };

test('CHAT-ATTESA-01 — torno alla sessione prima del primo token e vedo ancora l’attesa', async ({ page }, testInfo) => {
  await apri(page);
  await eventi(page, [avvio, { type: 'ReasoningMessageStart', messageId: 'r1' }]);
  await expect(page.locator('#conversation .talos-waiting')).toBeVisible();
  await apri(page, 'altra', true);
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
  await apri(page);
  await eventi(page, [avvio]);
  await expect(page.locator('#conversation .talos-waiting')).toBeVisible();
  await eventi(page, [{ type: 'ReasoningMessageStart', messageId: 'r1' }]);
  await expect(page.locator('#conversation .talos-waiting')).toHaveAttribute('data-activity', 'reasoning');
  await page.screenshot({ path: testInfo.outputPath('attesa-ritrovata.png') });
  await eventi(page, [{ type: 'RunFinished' }]);
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
});

test('CHAT-ATTESA-02 — il testo precedente non cancella il ragionamento nuovo', async ({ page }) => {
  await apri(page);
  await eventi(page, [avvio,
    { type: 'TextMessageContent', messageId: 'precedente', delta: 'Ho letto il progetto. '.repeat(200) },
    { type: 'TextMessageEnd', messageId: 'precedente' },
    { type: 'ReasoningMessageStart', messageId: 'nuovo' },
  ]);
  await expect(page.locator('#conversation .talos-message__copy .assistant-copy')).not.toBeEmpty();
  // Attendiamo che si esauriscano anche i frame del testo precedente.
  await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('#conversation .talos-waiting')).toHaveAttribute('data-activity', 'reasoning');
  await eventi(page, [{ type: 'ReasoningMessageEnd', messageId: 'nuovo' },
    { type: 'TextMessageContent', messageId: 'risposta', delta: 'Ora ho finito.' }]);
  await expect(page.locator('#conversation .assistant-copy').last()).toContainText('Ora ho finito.');
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
});

test('CHAT-ATTESA-03 — lo storico interrotto non inventa una run attiva', async ({ page }) => {
  await apri(page, 'chiusa', true);
  await eventi(page, [avvio, { type: 'ReasoningMessageStart', messageId: 'r1' }, { type: 'ReasoningMessageEnd', messageId: 'r1' }]);
  await expect(page.locator('#conversation .talos-waiting')).toHaveCount(0);
});

for (const [width, height] of [[1440, 900], [1280, 900], [1024, 900], [1920, 1080], [2560, 1440], [3840, 2160]]) {
  test(`CHAT-RECUPERO-01 — nota dello storico recuperato una sola volta, ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await apri(page);
    const recupero = { type: 'StateDelta', _sequenza: 2, delta: [{ op: 'add', path: '/recuperoCronologia', value: { versioneGiro: 2, chiamate: 1 } }] };
    await eventi(page, [{ ...avvio, _sequenza: 1 }, recupero, recupero]);
    const nota = page.locator('.real-session-status').filter({ hasText: 'Storico recuperato' });
    await expect(nota).toHaveCount(1);
    await expect(nota).toBeVisible();
    await expect(nota).toContainText('1 chiamata incompleta');
    await page.screenshot({ path: testInfo.outputPath(`storico-recuperato-${width}.png`) });
    await apri(page, 'altra', true);
    await apri(page);
    await eventi(page, [{ ...avvio, _sequenza: 1 }, recupero, recupero]);
    await expect(nota).toHaveCount(1);
  });
  test(`CHAT-FONDO-01 — torno in fondo anche dopo la fine, ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: width === 1440 ? 'no-preference' : 'reduce' });
    await apri(page);
    const button = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
    await expect(button).toBeHidden();
    await eventi(page, [avvio, { type: 'TextMessageContent', messageId: 'lungo', delta: Array.from({ length: 70 }, (_, i) => `Paragrafo ${i + 1}: il progetto conserva la cronologia.\n\n`).join('') }, { type: 'TextMessageEnd', messageId: 'lungo' }, { type: 'RunFinished' }]);
    await expect(page.locator('#conversation .is-streaming')).toHaveCount(0, { timeout: 15000 });
    const scroller = page.locator('#schermoChat .talos-conversation');
    await scroller.hover();
    await page.mouse.wheel(0, -20000);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(36);
    expect(box.width).toBe(box.height);
    expect(await button.evaluate(b => { const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
    await test.step('CHAT-FONDO-HOVER-02 — puntatore fermo al bordo, nessun salto o lampeggio', async () => {
      const iniziale = await button.evaluate(b => {
        const s = getComputedStyle(b);
        return { color: s.backgroundColor, bordo: s.borderTopColor, icona: s.color };
      });
      await page.mouse.move(box.x + 3, box.y + box.height / 2);
      const campioni = await button.evaluate(async b => {
        const values = [];
        for (let i = 0; i < 45; i++) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          const r = b.getBoundingClientRect();
          const s = getComputedStyle(b);
          values.push({ x: r.x, y: r.y, hover: b.matches(':hover'), color: s.backgroundColor, bordo: s.borderTopColor, icona: s.color });
        }
        return values;
      });
      await page.screenshot({ path: testInfo.outputPath(`hover-fondo-${width}.png`) });
      expect(campioni.every(c => c.hover)).toBe(true);
      expect(Math.max(...campioni.map(c => Math.abs(c.x - box.x)))).toBeLessThan(0.5);
      expect(Math.max(...campioni.map(c => Math.abs(c.y - box.y)))).toBeLessThan(0.5);
      expect(new Set(campioni.slice(-10).map(c => c.color)).size).toBe(1);
      for (const c of campioni) {
        expect({ color: c.color, bordo: c.bordo, icona: c.icona }).toEqual(iniziale);
      }
      await page.mouse.move(0, 0);
    });
    await page.screenshot({ path: testInfo.outputPath(`torna-in-fondo-${width}.png`) });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toBeHidden();
    expect(await scroller.evaluate(e => e.scrollHeight - e.clientHeight - e.scrollTop)).toBeLessThanOrEqual(4);
    // Stesso controllo durante un nuovo turno: non dipende dalla striscia di stato.
    await eventi(page, [{ ...avvio, input: { consegna: 'Continua, per favore', seguito: true } }]);
    /*
     * ⛔ 18/09/2026 — il bound qui NON è il ≤4 della riga precedente, e non è una tolleranza allargata
     *   a comma: è una quantità DIVERSA. Al primo giro l'ultimo elemento è la bolla di testo e l'Enter
     *   la porta al fondo esatto: gap 0. Al secondo l'ultimo elemento è l'ATTEISA, e il follow
     *   (unico scrittore, 16/09 P0) la CENTRA: fondo bolla a clientHeight/2. Sotto la bolla restano il
     *   padding del suo .talos-turn (8px misurato: fondo turn 424.125 vs fondo attesa 416.125) e il
     *   subpixel: il distance-from-maxScroll misura 5, non 0 — per costruzione, non per un follow
     *   mancato. Bound = 8 (padding) + margine di subpixel, misurato stabile a 5 su tutte le larghezze.
     *   Ciò che il test pretende davvero (il fondo resta in vista, il pulsante non torna) è la
     *   toBeHidden qui sotto: la sua soglia è 24px.
     */
    await expect.poll(() => scroller.evaluate(e => e.scrollHeight - e.clientHeight - e.scrollTop), { timeout: 5000 }).toBeLessThanOrEqual(12);
    await expect(button).toBeHidden();
    await scroller.hover();
    await page.mouse.wheel(0, -20000);
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toBeHidden();
  });
}
