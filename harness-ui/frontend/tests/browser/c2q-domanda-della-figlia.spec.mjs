import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔ C2-Q (08/10/2026, owner 07/10 sera, contratto C2 §5: «`domandeDeiFigli` acceso sul desktop, stesso canale della carta») —
 *   LA DOMANDA DI UNA FIGLIA ALLA PERSONA SI RISPONDE DAL PADRE. Come la carta di permesso (C2 R4): lo snapshot `talos.agenti` dice
 *   «question waiting» col `requestId`, una lettura di `/pending` porta la domanda (`tipo:'domanda'`), la carta delle domande
 *   compare nel dock del padre con la riga «chi chiede», il POST va alla FIGLIA con `rispostoDa`, e lo snapshot `resolved` (con
 *   l'esito, mai le risposte) la chiude.
 * ⛔ EVENTI FINTI COL TESTO VERO DEL SERVER (lezione del 26/09): `talos.agenti` è quello di `annunciaAgenteAgliAntenati` con
 *   l'operazione di `operazioneAgenteDaEvento` (C2-Q: etichette inglesi, `requestId`, `esito`), la domanda quella di
 *   `domandaInAttesa`, la busta quella di `successEnvelope`.
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174); ogni POST si intercetta: la prova non risponde a nessuna domanda
 *   vera. Foto ≥ 1920×1080 nei due temi (owner 29/09 e 11/09).
 */

const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/c2q-domanda-della-figlia/', import.meta.url)));
async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
  await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
}

const MADRE = 'c2q-madre';
const FIGLIA = 'c2q-figlia';
const REQ = 'c2q-domanda-1';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });

/** `snapshotFiglio` + `padreId`, come lo manda `snapshotAgente` (con `questionPendingCount` di CLI 6b). */
const agente = (extra = {}) => ({
  sessionId: FIGLIA, parentId: MADRE, padreId: MADRE, task: 'Scegli il fornitore dei pagamenti', taskCorto: 'Scegli il fornitore',
  collisioni: [], conclusa: false, interrotta: false, esitoDelega: null, evidenzaDelega: null,
  approvalPendingCount: 0, questionPendingCount: 1, operazioneCorrente: null, ...extra,
});
const agenti = (operation, extraAgente = {}) => ({
  type: 'CUSTOM', name: 'talos.agenti',
  value: { version: 1, sessionId: MADRE, parentId: MADRE, childId: FIGLIA, reason: 'updated', emittedAt: new Date().toISOString(), agent: agente(extraAgente), operation },
});
const IN_ATTESA = { kind: 'question', status: 'waiting', label: 'Waiting for your answer', toolName: null, requestId: REQ };
const risolta = (esito) => ({ kind: 'question', status: 'resolved', label: 'Question resolved', toolName: null, requestId: REQ, esito });
/** `domandaInAttesa` per una domanda della figlia, nella forma del server. */
const DOMANDA = {
  tipo: 'domanda', requestId: REQ, toolCallId: 'c1',
  questions: [{ id: 'fornitore', question: 'Quale fornitore uso per i test dei pagamenti?', why: 'Decide se i test vanno in rete.',
    options: [{ label: 'Finto', description: 'Veloce e senza rete', recommended: true }, { label: 'Sandbox', description: 'Reale, più lento' }] }],
};

async function manda(page, lista) {
  await page.evaluate((l) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of l) r.handleRealEvent(e, r.realSessionState.generation);
  }, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

for (const modo of ['light', 'dark']) {
  test.describe(`C2-Q domanda della figlia nel padre · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, locale: 'it-IT', viewport: { width: 1920, height: 1080 } });

    async function prepara(page, { figli = [], pending = DOMANDA } = {}) {
      const traffico = { pending: 0, risposte: [], scritture: [] };
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      await page.route('**/api/v1/**', (route) => {
        const r = route.request();
        if (r.method() !== 'GET' && r.method() !== 'HEAD') { traffico.scritture.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.abort(); }
        return route.fallback();
      });
      /* Stream APERTO E MUTO, col confine mandato dalla prova subito dopo l'apertura (VELO-SPEC del bugfixer, 08/10/2026): un corpo
         che si chiude fa riaprire lo stream di continuo («Collegato di nuovo» nelle prime foto), e ogni `onopen` rimette
         `inRigiocata=true` fino al confine successivo, cioè gli eventi della prova potevano valere come storia. */
      await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/events`), () => { /* resta pending: aperto e muto */ });
      await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/children`), (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli }) }));
      await page.route((url) => url.pathname.endsWith(`/sessions/${FIGLIA}/pending`), (route) => {
        traffico.pending += 1;
        return route.fulfill({ contentType: 'application/json', body: busta({ pending: typeof pending === 'function' ? pending() : pending }) });
      });
      await page.route((url) => /\/sessions\/[^/]+\/question$/u.test(url.pathname), (route) => {
        traffico.risposte.push({ path: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
        return route.fulfill({ contentType: 'application/json', body: busta({ ok: true }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'C2-Q domanda della figlia', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
        r.handleRealEvent(confine, r.realSessionState.generation); // il confine che il server manda SEMPRE, anche a storia vuota
      }, { id: MADRE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      return traffico;
    }
    const carta = (page) => page.locator(`[data-c="UserQuestionCard"][data-figlia="${FIGLIA}"]`);

    test('C2Q-CARTA-01 — la figlia chiede: la carta delle domande compare nel padre, dice chi chiede, e risponde ALLA FIGLIA con rispostoDa', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toBeVisible();
      await expect(carta(page).locator('.talos-approval__chi')).toHaveText('L’agente «Scegli il fornitore» chiede');
      // visto nella prima foto: accanto alla riga dell'agente il badge diceva anche «TALOS chiede» (due «chiede», domanda a TALOS)
      await expect(carta(page).locator('.talos-approval__head > .talos-badge--accent')).toHaveText('Domanda');
      await expect(carta(page)).not.toContainText('TALOS chiede');
      await expect(carta(page)).toContainText('Quale fornitore uso per i test dei pagamenti?');
      // la riga «chi chiede» è la prima della testata, come sulla carta di permesso
      expect(await carta(page).locator('.talos-approval__head > *').first().getAttribute('class')).toContain('talos-approval__chi');
      // geometria: la riga sta dentro la carta, col badge della domanda intero accanto
      const g = await carta(page).evaluate((c) => {
        const r = c.getBoundingClientRect(), chi = c.querySelector('.talos-approval__chi').getBoundingClientRect();
        const badge = c.querySelector('.talos-approval__head > .talos-badge--accent');
        return { dentro: chi.left >= r.left - 0.5 && chi.right <= r.right + 0.5, badgeIntero: badge.scrollWidth <= badge.clientWidth + 1, misurato: chi.width > 0 };
      });
      expect(g).toEqual({ dentro: true, badgeIntero: true, misurato: true });
      await foto(page, `c2q-01-carta-${modo}.png`);

      await carta(page).getByText('Finto', { exact: true }).click();
      await expect.poll(() => traffico.risposte.length).toBe(1);
      expect(traffico.risposte[0]).toEqual({ path: `/api/v1/sessions/${FIGLIA}/question`,
        corpo: { requestId: REQ, status: 'answered', answers: { fornitore: 'Finto' }, rispostoDa: MADRE } });
      // l'esito lo scrive lo snapshot della risoluzione, con l'esito e mai le risposte
      await manda(page, [agenti(risolta('answered'), { questionPendingCount: 0 })]);
      await expect(carta(page)).toHaveAttribute('data-state', 'resolved');
      await expect(carta(page)).toContainText('Finto', { timeout: 2_000 }); // chi ha risposto da qui ritrova la sua risposta
      await foto(page, `c2q-01-risolta-${modo}.png`);
      expect(traffico.scritture).toEqual([]);
    });

    test('C2Q-CARTA-02 — il rigioco dello snapshot non duplica la carta né rilegge la domanda', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await manda(page, [agenti(IN_ATTESA), agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      expect(traffico.pending, 'una lettura per domanda nuova, mai una per rigioco').toBe(1);
    });

    test('C2Q-CARTA-03 — risposta data ALTROVE: lo snapshot chiude la carta con l\'esito, e la carta non finge di aver risposto lei', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await manda(page, [agenti(risolta('skipped'), { questionPendingCount: 0 })]);
      await expect(carta(page)).toHaveAttribute('data-state', 'resolved');
      expect(traffico.risposte, 'nessun POST da qui').toEqual([]);
    });

    test('C2Q-CARTA-04 — riaprendo il padre, una figlia che aspetta ancora (`questionPendingCount`) ritrova la sua carta', async ({ page }) => {
      await prepara(page, { figli: [agente()] });
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__chi')).toHaveText('L’agente «Scegli il fornitore» chiede');
    });

    test('C2Q-CARTA-05 — AL CONTRARIO: una lettura che trova un PERMESSO disegna la carta di permesso, e una che non trova niente non disegna niente', async ({ page }) => {
      let pendente = null;
      await prepara(page, { pending: () => pendente });
      await manda(page, [agenti(IN_ATTESA)]);
      await page.waitForTimeout(150);
      await expect(carta(page)).toHaveCount(0);
      pendente = { tipo: 'approvazione', requestId: 'c2q-permesso-1', azione: { tipo: 'shell', comando: 'npm install' },
        inAttesaDa: new Date().toISOString(), perAttrezzo: {}, politica: { permessi: 'On request', perAttrezzo: {} } };
      await manda(page, [agenti({ kind: 'approval', status: 'waiting', label: 'Waiting for approval', toolName: 'shell', requestId: 'c2q-permesso-1' })]);
      await expect(page.locator(`#conversation [data-c="ApprovalCard"][data-figlia="${FIGLIA}"]`)).toHaveCount(1);
      await expect(carta(page)).toHaveCount(0);
    });
  });
}
