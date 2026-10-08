import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { eventoPerEsitoTool, runStarted, toolCallArgs, toolCallStart } from '../../../src/agui-events.mjs';
import { creaRicevutaOperazione } from '../../../src/kernel/talosHarness.mjs';

/*
 * ⛔⛔ C2 R6 (08/10/2026, contratto C2 §R6) — UN PERMESSO DATO PIÙ IN ALTO SI VEDE SULLA RIGA DELLA FIGLIA.
 *   Il sì «per la sessione» del padre ha coperto una scrittura della figlia senza domanda: la ricevuta del kernel porta
 *   `consentitoDa`, e la riga dell'attrezzo lo dice (badge neutro + frase al passaggio + nota in testa al dettaglio).
 * ⛔ EVENTI COL TESTO VERO DEL SERVER (lezione del 26/09): gli eventi li costruiscono le funzioni del server
 *   (`agui-events.mjs`) e la ricevuta `creaRicevutaOperazione` del kernel — la stessa che `agent-service.mjs` inoltra in
 *   `receipt`. Nessuna forma copiata a mano.
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174); ogni richiesta non-GET si ferma e si conta. Foto ≥ 1920×1080 nei
 *   due temi (owner 29/09 e 11/09); le larghezze strette si provano sul DOM, senza foto.
 */

const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/c2-r6-consentito-da/', import.meta.url)));
async function foto(page, nome, selettore = null) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
  const byte = await (selettore ? page.locator(selettore).screenshot() : page.screenshot());
  await writeFile(path.join(CARTELLA_FOTO, nome), byte);
}

const MADRE = 'c2r6-madre';
const FIGLIA = 'c2r6-figlia';
const CONFINE_SSE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null })}\n\n`; // come lo manda il server (http-app.mjs:8185)
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });

/** Le due voci dell'elenco, coi campi che la barra e `nomeVivoDellaSessione` leggono (session-registry.mjs, `elencaSessioni`). */
const ELENCO = [
  { sessionId: MADRE, taskId: 'libero:default', nome: 'Rifai il sito', avviataAlle: '2026-10-08T08:00:00.000Z', conclusa: false, modello: 'z-ai/glm-5.3-flash', provider: 'cloud', padreId: null, profonditaDelega: 0, taskDelega: null },
  { sessionId: FIGLIA, taskId: 'libero:default', nome: null, avviataAlle: '2026-10-08T08:01:00.000Z', conclusa: true, modello: 'z-ai/glm-5.3-flash', provider: 'cloud', padreId: MADRE, profonditaDelega: 1, taskDelega: 'Aggiorna il README condiviso' },
];

/** Una scrittura fuori dal progetto, col suo esito e la ricevuta che il kernel firmerebbe. */
function scrittura(id, percorso, consentitoDa) {
  const receipt = creaRicevutaOperazione({
    azione: { tipo: 'scrivi', percorso }, toolCallId: id, contenutoScritto: '# Sito\n',
    esitoPermesso: { consentito: true, via: 'nessun-vincolo', ...(consentitoDa ? { consentitoDa } : {}) },
  });
  return [
    toolCallStart({ toolCallId: id, toolCallName: 'scrivi' }),
    toolCallArgs({ toolCallId: id, delta: JSON.stringify({ percorso, contenuto: '# Sito\n' }) }),
    eventoPerEsitoTool({ messageId: `m-${id}`, toolCallId: id, content: `Scritto ${percorso}`, receipt }),
  ];
}

const STORIA_FIGLIA = [
  runStarted({ threadId: FIGLIA, runId: 'r1', input: { consegnaCorta: 'Aggiorna il README condiviso' } }),
  ...scrittura('c1', '../sito-condiviso/README.md', { sessionId: MADRE, tipo: 'cartella' }),
  ...scrittura('c2', 'note.md', null),
  ...scrittura('c3', '../sito-condiviso/CHANGELOG.md', { sessionId: 'una-sessione-che-la-barra-non-conosce', tipo: 'cartella' }),
];

for (const modo of ['light', 'dark']) {
  test.describe(`C2 R6 permesso ereditato · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, locale: 'it-IT', viewport: { width: 1920, height: 1080 } });

    async function prepara(page) {
      const scritture = [];
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      await page.route('**/api/v1/**', (route) => {
        const r = route.request();
        if (r.method() !== 'GET' && r.method() !== 'HEAD') { scritture.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.abort(); }
        return route.fallback();
      });
      await page.route((url) => url.pathname === '/api/v1/sessions', (route) => route.fulfill({ contentType: 'application/json', body: busta({ items: ELENCO }) }));
      await page.route((url) => url.pathname === `/api/v1/sessions/${FIGLIA}/events`, (route) => route.fulfill({
        contentType: 'text/event-stream',
        body: STORIA_FIGLIA.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + CONFINE_SSE + 'retry: 600000\n\n',
      }));
      await page.route((url) => url.pathname === `/api/v1/sessions/${FIGLIA}/children`, (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli: [] }) }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      // il nome del padre viene dall'elenco: si aspetta che la barra l'abbia letto
      await page.locator(`[data-real-session-id="${MADRE}"]`).waitFor({ state: 'attached', timeout: 8000 });
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Aggiorna il README condiviso', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' });
      }, FIGLIA);
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      return scritture;
    }
    const righe = (page) => page.locator('#conversation .talos-tool-row');
    const segno = (riga) => riga.locator(':scope > .talos-tool-row__consentito-da');
    /* ⛔ Il gruppo degli attrezzi di un giro concluso nasce CHIUSO (`creaAttivita`, corpo `hidden`): la prima versione di questa
       spec misurava e fotografava righe chiuse, e la foto non mostrava nessun segno. Si apre, e si pretende che si VEDA. */
    async function apriGruppo(page) {
      const testa = page.locator('#conversation .talos-activity__head').first();
      if (await testa.getAttribute('aria-expanded') !== 'true') await testa.click();
      await expect(testa).toHaveAttribute('aria-expanded', 'true');
      await expect(righe(page).first()).toBeVisible();
    }

    test('C2-R6-01 — la scrittura coperta dal sì del padre porta il segno, col NOME del padre; le altre no o senza nome', async ({ page }) => {
      const scritture = await prepara(page);
      await expect(righe(page)).toHaveCount(3);
      await apriGruppo(page);
      const [coperta, propria, ignota] = [righe(page).nth(0), righe(page).nth(1), righe(page).nth(2)];

      await expect(segno(coperta)).toHaveCount(1);
      await expect(segno(coperta)).toBeVisible();
      await expect(segno(coperta)).toHaveText('Permesso ereditato');
      await expect(segno(coperta)).toHaveAttribute('title', 'Consentito da un permesso dato in «Rifai il sito».');
      await expect(segno(coperta)).toHaveAttribute('aria-label', 'Consentito da un permesso dato in «Rifai il sito».');
      // ⛔ AL CONTRARIO: il sì della figlia stessa non si attribuisce a nessuno
      await expect(segno(propria)).toHaveCount(0);
      // una sessione che la barra non conosce: la frase non inventa un nome e non stampa l'id
      await expect(segno(ignota)).toHaveAttribute('title', 'Consentito da un permesso dato in una sessione più in alto.');
      await expect(page.locator('#conversation')).not.toContainText('una-sessione-che-la-barra-non-conosce');
      await expect(page.locator('#conversation')).not.toContainText(MADRE);

      // geometria: il segno sta dentro la riga, prima del pallino, senza coprire il nome dell'attrezzo
      const g = await coperta.evaluate((r) => {
        const b = r.querySelector(':scope > .talos-tool-row__consentito-da').getBoundingClientRect();
        const nome = r.querySelector('.talos-tool-row__name').getBoundingClientRect();
        const dot = r.querySelector('.talos-dot').getBoundingClientRect();
        const riga = r.getBoundingClientRect();
        return { dentro: b.left >= riga.left - 0.5 && b.right <= riga.right + 0.5, primaDelPallino: b.right <= dot.left + 0.5, staccatoDalNome: b.left >= nome.right - 0.5, misurato: b.width > 0 && b.height > 0 };
      });
      expect(g).toEqual({ dentro: true, primaDelPallino: true, staccatoDalNome: true, misurato: true });
      await foto(page, `c2r6-01-righe-${modo}.png`);

      // il dettaglio aperto: la nota in testa, col carattere della chat (non il monospazio del corpo)
      await coperta.click();
      const nota = page.locator('#conversation .talos-tool-row__body > .talos-tool-row__nota-consentito-da').first();
      await expect(nota).toBeVisible();
      await expect(nota).toHaveText('Consentito da un permesso dato in «Rifai il sito».');
      const caratteri = await nota.evaluate((n) => ({ nota: getComputedStyle(n).fontFamily, corpo: getComputedStyle(n.parentElement).fontFamily }));
      expect(caratteri.nota).not.toEqual(caratteri.corpo);
      await foto(page, `c2r6-01-dettaglio-${modo}.png`);
      expect(scritture).toEqual([]);
    });

    test('C2-R6-02 — larghezze strette (DOM, senza foto): il segno non cede, non esce dalla riga e non copre il pallino', async ({ page }) => {
      await prepara(page);
      await apriGruppo(page);
      for (const larghezza of [1280, 1024, 860]) {
        await page.setViewportSize({ width: larghezza, height: 900 });
        await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
        const g = await righe(page).nth(0).evaluate((r) => {
          const s = r.querySelector(':scope > .talos-tool-row__consentito-da');
          const b = s.getBoundingClientRect();
          const dot = r.querySelector('.talos-dot').getBoundingClientRect();
          const riga = r.getBoundingClientRect();
          return { dentro: b.left >= riga.left - 0.5 && b.right <= riga.right + 0.5, primaDelPallino: b.right <= dot.left + 0.5, intero: s.scrollWidth <= s.clientWidth + 1, misurato: b.width > 0 && b.height > 0 };
        });
        expect(g, `a ${larghezza} px`).toEqual({ dentro: true, primaDelPallino: true, intero: true, misurato: true });
      }
    });
  });
}
