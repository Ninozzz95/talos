import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔ C2b «Coordinazione» (owner 08/10/2026 sera; contratto `Downloads/handoff-talos-2026-09-27/C2B-CONTRATTO-2026-10-08.md`) — a
 *   schermo:
 *   - la sezione sua nel velo dei permessi, subito sotto la scelta dell'autonomia, con l'interruttore che scrive SOLO la chiave
 *     (`unisciPermessiPerAttrezzo: { delega_sottotask }`), e i tre casi in cui non si tocca (agente delegato, nessuna conversazione);
 *   - la carta d'avvio «Chiede di avviare un agente» col perché (spenta o tetto), coi tre pulsanti, e senza «Per questa sessione»
 *     dove non varrebbe (tetto; figlia con la radice spenta); «Per questa sessione» che la accende;
 *   - il segno «da solo / consentito da te» nel dettaglio dell'agente e nel diagramma;
 *   - una sessione NUOVA non eredita Coordinazione (owner, «spenta di serie»).
 * ⛔ EVENTI FINTI COL TESTO VERO DEL SERVER (lezione del 26/09): l'azione è quella di `verificaAvvioAgente` (talosHarness.mjs) più
 *   `sempreNonBasta` di `richiediApprovazione` (session-registry.mjs); il confine quello di `http-app.mjs:8185` (`value: null`); le
 *   figlie quelle di `snapshotFiglio` (subagent-orchestrator.mjs), con `avvio`.
 * ⛔ Server isolato di `playwright.config.mjs` sulla porta della sessione desktop (`TALOS_HARNESS_UI_TEST_PORT=4177`), mai il 4174;
 *   ogni scrittura è intercettata dalla prova. Foto ≥ 1920×1080 nei due temi (owner 29/09 e 11/09), testi in italiano e inglese.
 */

const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/c2b-coordinazione/', import.meta.url)));
async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
  /* la foto ad animazione FINITA: la prima tornata ritraeva la carta inglese a metà della sua comparsa, sbiadita. Solo le
     animazioni che finiscono (un orb infinito non risolverebbe mai), e al massimo 3 s */
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
    new Promise((ok) => setTimeout(ok, 3000)),
  ]));
  const byte = await page.screenshot();
  await writeFile(path.join(CARTELLA_FOTO, nome), byte);
}

const MADRE = 'c2b-madre';
const RADICE = 'c2b-radice';
const FIGLIA = 'c2b-figlia';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });
/** L'azione della carta d'avvio, come la costruisce `verificaAvvioAgente`. */
const AVVIO = (extra = {}) => ({ tipo: 'delega_sottotask', toolCallId: 'call-c2b-1', compito: 'Rileggi i test del registro e sistemali', coordinazione: { motivo: 'spenta' }, ...extra });
const riga = (sessionId, extra) => ({ sessionId, taskId: 'libero:default', avviataAlle: '2026-10-08T08:00:00.000Z', modello: 'z-ai/glm-5.3-flash', provider: 'cloud', padreId: null, profonditaDelega: 0, taskDelega: null, conclusa: false, ...extra });

async function manda(page, lista) {
  await page.evaluate((l) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of l) r.handleRealEvent(e, r.realSessionState.generation);
  }, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

for (const modo of ['light', 'dark']) {
  test.describe(`C2b Coordinazione · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    /**
     * La sessione MADRE aperta con `permessi` (le sue scelte per attrezzo). `elenco` = le righe di `GET /sessions`, `impostazioni` =
     * la risposta di `/settings` (o `{ status }` per un errore), `figli` = `/children`, `pending` = `/pending` della figlia.
     * `sessione: false` = nessuna conversazione aperta.
     */
    async function prepara(page, { permessi = {}, lingua = 'it', elenco = null, impostazioni = { updated: true }, figli = [], pending = null, sessione = true, conclusa = false, ritardoPrimaImpostazioneMs = 0 } = {}) {
      const traffico = { settings: [], approve: [], custom: [], scritture: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      /* ogni scrittura che la prova non risponde da sé si FERMA e si conta */
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      if (elenco) await page.route((url) => url.pathname === '/api/v1/sessions', (route) => (route.request().method() === 'GET'
        ? route.fulfill({ contentType: 'application/json', body: busta({ items: elenco() }) }) : route.fallback()));
      await page.route((url) => /\/sessions\/c2b-[^/]+\/events$/u.test(url.pathname), () => { /* aperto e muto (VELO-SPEC, 08/10/2026) */ });
      await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/children`), (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli }) }));
      await page.route((url) => url.pathname.endsWith(`/sessions/${FIGLIA}/pending`), (route) => route.fulfill({ contentType: 'application/json', body: busta({ pending }) }));
      await page.route((url) => /\/sessions\/[^/]+\/approve$/u.test(url.pathname), (route) => {
        traffico.approve.push({ path: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
        return route.fulfill({ contentType: 'application/json', body: busta({ ok: true }) });
      });
      await page.route((url) => /\/sessions\/[^/]+\/settings$/u.test(url.pathname), async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        traffico.settings.push({ path: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
        if (traffico.settings.length === 1 && ritardoPrimaImpostazioneMs > 0) await new Promise((ok) => setTimeout(ok, ritardoPrimaImpostazioneMs));
        return impostazioni.status
          ? route.fulfill({ status: impostazioni.status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: 'guasto di prova' } }) })
          : route.fulfill({ contentType: 'application/json', body: busta(impostazioni) });
      });
      await page.route('**/api/v1/sessions/custom', (route) => {
        traffico.custom.push(route.request().postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: busta({ sessionId: 'c2b-nuova' }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      if (sessione) {
        await page.evaluate(({ id, confine, permessiPerAttrezzo, conclusa }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', 'C2b coordinazione', 'z-ai/glm-5.3-flash', { conclusa, modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', permessiPerAttrezzo });
          r.handleRealEvent(confine, r.realSessionState.generation); // il confine che il server manda SEMPRE, anche a storia vuota
        }, { id: MADRE, confine: CONFINE, permessiPerAttrezzo: permessi, conclusa });
        await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
        await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      }
      return traffico;
    }
    async function apriVelo(page) {
      if (!(await page.locator('[data-open-sheet="permissions"]:visible').count())) await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
      await page.locator('[data-open-sheet="permissions"]:visible').first().click();
      await expect(page.locator('#veloPermessi')).toBeVisible();
      await page.locator('#veloPermessiCoordinazione').scrollIntoViewIfNeeded();
    }
    const sezione = (page) => page.locator('#veloPermessiCoordinazione');
    const interruttore = (page) => page.locator('#veloPermessiCoordinazioneInterruttore');
    const stato = (page) => page.locator('#veloPermessiCoordinazioneStato');
    const sotto = (page) => page.locator('#veloPermessiCoordinazioneSotto');
    const propria = (page) => page.locator('#conversation [data-c="ApprovalCard"]:not([data-figlia])');

    test('C2B-VELO-01 — la sezione sta subito sotto l\'autonomia, spenta di serie; l\'interruttore scrive SOLO la chiave e lo dice', async ({ page }) => {
      const traffico = await prepara(page, { permessi: { shell: 'chiedi' } });
      await apriVelo(page);
      // il posto: la riga «Coordinazione» è il primo elemento dopo la griglia dell'autonomia, e la sezione viene subito dopo
      expect(await page.evaluate(() => {
        const intestazione = document.querySelector('#veloPermessiScelte').nextElementSibling;
        return [intestazione.querySelector('.talos-eyebrow')?.textContent, intestazione.nextElementSibling?.id];
      })).toEqual(['Coordinazione', 'veloPermessiCoordinazione']);
      await expect(sezione(page).locator('.talos-list-row__title')).toHaveText('Il modello avvia agenti da solo');
      await expect(sotto(page)).toHaveText('Spenta: ti chiede prima, con una carta. Al massimo 20 agenti da solo in questa conversazione.');
      await expect(stato(page)).toHaveText('Spenta');
      await expect(interruttore(page)).not.toBeChecked();
      await expect(interruttore(page)).toBeEnabled();
      await foto(page, `c2b-velo-01-spenta-${modo}.png`);
      await interruttore(page).click();
      await expect.poll(() => traffico.settings.length).toBe(1);
      // la sola chiave, mai la mappa intera; e niente `rispettaNega`: è la scelta esplicita (C2-R7)
      expect(traffico.settings[0]).toEqual({ path: `/api/v1/sessions/${MADRE}/settings`, corpo: { unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' } } });
      await expect(stato(page)).toHaveText('Accesa');
      await expect(interruttore(page)).toBeChecked();
      await expect(page.locator('#regioneToast')).toContainText('Accesa: il modello avvia gli agenti da solo in questa conversazione.');
      await foto(page, `c2b-velo-01-accesa-${modo}.png`);
      await interruttore(page).click();
      await expect.poll(() => traffico.settings.length).toBe(2);
      expect(traffico.settings[1].corpo).toEqual({ unisciPermessiPerAttrezzo: { delega_sottotask: 'chiedi' } });
      await expect(stato(page)).toHaveText('Spenta');
      // chiusa e riaperta: lo stato è quello della sessione, non quello del controllo di prima
      await page.locator('#veloPermessi [data-chiudi="veloPermessi"]').first().click();
      await apriVelo(page);
      await expect(stato(page)).toHaveText('Spenta');
      expect(traffico.scritture, 'nessuna scrittura fuori da quelle che la prova risponde').toEqual([]);
    });

    test('C2B-VELO-01b — la stessa sezione in inglese (la sorgente)', async ({ page }) => {
      await prepara(page, { lingua: 'en', permessi: { delega_sottotask: 'sempre' } });
      await apriVelo(page);
      await expect(page.locator('#veloPermessiScelte').locator('xpath=following-sibling::*[1]').locator('.talos-eyebrow')).toHaveText('Coordination');
      await expect(sezione(page).locator('.talos-list-row__title')).toHaveText('The model starts agents on its own');
      await expect(sotto(page)).toHaveText('Off: it asks you first, with a card. At most 20 agents on its own in this conversation.');
      await expect(stato(page)).toHaveText('On');
      await expect(interruttore(page)).toBeChecked();
      await foto(page, `c2b-velo-01b-en-${modo}.png`);
    });

    test('C2B-VELO-02 — il server rifiuta: l\'interruttore torna dov\'era, la parola resta «Spenta», e lo si dice', async ({ page }) => {
      const traffico = await prepara(page, { impostazioni: { status: 500 } });
      await apriVelo(page);
      await interruttore(page).click();
      await expect.poll(() => traffico.settings.length).toBe(1);
      await expect(page.locator('#regioneToast')).toContainText('Scelta non applicata');
      await expect(interruttore(page)).not.toBeChecked();
      await expect(stato(page)).toHaveText('Spenta');
    });

    test('C2B-VELO-02b — l\'unione è in volo e la persona cambia subito un attrezzo: la mappa intera che segue porta Coordinazione', async ({ page }) => {
      const traffico = await prepara(page, { ritardoPrimaImpostazioneMs: 800 });
      await apriVelo(page);
      await interruttore(page).click();
      await expect.poll(() => traffico.settings.length).toBe(1);
      // mentre la prima risposta non è ancora tornata: «Comando nel terminale» su «Chiedi conferma»
      await page.locator('#veloPermessi [data-tool-permission-select="shell"]').selectOption('chiedi');
      await expect.poll(() => traffico.settings.length).toBe(2);
      expect(traffico.settings[1].corpo.permessiPerAttrezzo, 'la mappa intera riporterebbe il server a «spenta» in silenzio')
        .toEqual({ delega_sottotask: 'sempre', shell: 'chiedi' });
      await expect(stato(page)).toHaveText('Accesa');
    });

    test('C2B-VELO-03 — agente delegato: decide la conversazione principale, l\'interruttore non si tocca e dice lo stato vero', async ({ page }) => {
      const scena = { radice: { delega_sottotask: 'sempre' }, conRadice: true };
      await prepara(page, { elenco: () => [
        ...(scena.conRadice ? [riga(RADICE, { nome: 'Rifai il sito', permessiPerAttrezzo: scena.radice })] : []),
        riga(MADRE, { nome: null, padreId: RADICE, profonditaDelega: 1, taskDelega: 'C2b coordinazione', permessiPerAttrezzo: {} }),
      ] });
      await expect(page.locator(`.talos-session-item[data-real-session-id="${RADICE}"]`), 'premessa: l\'elenco è arrivato').toHaveCount(1);
      await apriVelo(page);
      await expect(interruttore(page)).toBeDisabled();
      await expect(interruttore(page)).toBeChecked();
      await expect(stato(page)).toHaveText('Accesa');
      await expect(sotto(page)).toHaveText('In un agente delegato decide la conversazione principale.');
      await foto(page, `c2b-velo-03-delega-${modo}.png`);
      // la radice spenta spegne anche la figlia (la stessa regola del server, `coordinazione.mjs`)
      scena.radice = { delega_sottotask: 'chiedi' };
      await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
      await page.locator('#veloPermessi [data-chiudi="veloPermessi"]').first().click();
      await apriVelo(page);
      await expect(stato(page)).toHaveText('Spenta');
      await expect(interruttore(page)).not.toBeChecked();
      // AL CONTRARIO: se un anello della catena non è nell'elenco, lo stato non si inventa
      scena.conRadice = false;
      await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
      await expect(page.locator(`.talos-session-item[data-real-session-id="${RADICE}"]`)).toHaveCount(0);
      await page.locator('#veloPermessi [data-chiudi="veloPermessi"]').first().click();
      await apriVelo(page);
      await expect(stato(page)).toHaveText('');
      await expect(interruttore(page)).toBeDisabled();
    });

    test('C2B-VELO-04 — nessuna conversazione: l\'interruttore è spento, non si tocca, e la riga dice quando si accende', async ({ page }) => {
      await prepara(page, { sessione: false });
      await apriVelo(page);
      await expect(interruttore(page)).toBeDisabled();
      await expect(stato(page)).toHaveText('Spenta');
      await expect(sotto(page)).toHaveText('Si accende quando la conversazione è partita.');
    });

    test('C2B-NUOVA-01 — una sessione NUOVA non porta Coordinazione da quella aperta; le altre scelte sì', async ({ page }) => {
      // la sessione di prima è conclusa: con un giro in corso il messaggio andrebbe in coda invece di aprire la nuova
      const traffico = await prepara(page, { permessi: { delega_sottotask: 'sempre', shell: 'chiedi' }, conclusa: true });
      await page.route('**/api/v1/workspace-browser**', (route) => route.fulfill({ contentType: 'application/json', body: busta({
        root: 'C:\\', path: 'C:\\', parent: null, items: [],
        recommended: [{ label: 'progetto-c2b', path: 'C:\\progetti\\progetto-c2b', kind: 'project', projectId: 'default' }],
      }) }));
      await page.locator('#newSessionBtn').click();
      await expect(page.locator('#workspaceChooserSubmit')).toBeEnabled();
      await page.locator('#workspaceChooserSubmit').click();
      await expect(page.locator('#conversation .talos-empty__title')).toHaveText('Cosa costruiamo in progetto-c2b?');
      /* si scrive coi tasti, come una persona: misurato l'08/10, qui `fill()` lascia il campo vuoto (il valore scritto da
         Playwright non sopravvive), mentre lo stesso testo battuto resta per tre secondi su tre */
      await page.locator('#composerInput').click();
      await page.keyboard.type('Controlla il progetto');
      await expect(page.locator('#composerInput')).toHaveValue('Controlla il progetto');
      await page.locator('#composerForm').evaluate((form) => form.requestSubmit());
      await expect.poll(() => traffico.custom.length, { message: `scritture fermate: ${JSON.stringify(traffico.scritture)}` }).toBe(1);
      expect(traffico.custom[0].permessiPerAttrezzo).toEqual({ shell: 'chiedi' });
    });

    test('C2B-CARTA-01 — la carta d\'avvio: cosa chiede, il compito, il perché; «Per questa sessione» la accende', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'c2b-req-1', azione: AVVIO(), _sequenza: 2 }]);
      await expect(propria(page)).toHaveCount(1);
      await expect(propria(page)).toContainText('Chiede di avviare un agente');
      await expect(propria(page)).toContainText('Vuole avviare un agente per questo compito:');
      await expect(propria(page)).toContainText('Rileggi i test del registro e sistemali');
      await expect(propria(page).locator('.talos-approval__motivo')).toHaveText('Chiede perché «Coordinazione» è spenta in questa sessione: accesa, il modello avvia gli agenti da solo.');
      await expect(propria(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Per questa sessione', 'Nega']);
      await foto(page, `c2b-carta-01-${modo}.png`);
      await propria(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings).toEqual([{ path: `/api/v1/sessions/${MADRE}/settings`, corpo: { unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' }, rispettaNega: true } }]);
      expect(traffico.approve[0]).toEqual({ path: `/api/v1/sessions/${MADRE}/approve`, corpo: { requestId: 'c2b-req-1', approvato: true } });
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'c2b-req-1', approvato: true, _sequenza: 3 }]);
      await expect(propria(page).locator('.talos-approval__esito')).toHaveCount(1);
      // l'interruttore della modale lo sa già, senza rileggere niente
      await apriVelo(page);
      await expect(stato(page)).toHaveText('Accesa');
      await expect(interruttore(page)).toBeChecked();
    });

    test('C2B-CARTA-01b — la stessa carta in inglese, con la cartella e il modello chiesti dalla persona', async ({ page }) => {
      await prepara(page, { lingua: 'en' });
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'c2b-req-en', azione: AVVIO({ cartella: 'C:\\progetti\\altro', modello: 'qwen/qwen3.8-flash' }), _sequenza: 2 }]);
      await expect(propria(page)).toContainText('Asks to start an agent');
      await expect(propria(page)).toContainText('It wants to start an agent in C:\\progetti\\altro for this task:');
      await expect(propria(page)).toContainText('qwen/qwen3.8-flash');
      await expect(propria(page).locator('.talos-approval__motivo')).toHaveText('It asks because “Coordination” is off in this session: with it on, the model starts agents on its own.');
      await foto(page, `c2b-carta-01b-en-${modo}.png`);
    });

    test('C2B-CARTA-02 — il tetto: il perché lo dice, e «Per questa sessione» non c\'è (non cambierebbe niente)', async ({ page }) => {
      await prepara(page, { permessi: { delega_sottotask: 'sempre' } });
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'c2b-req-tetto', azione: AVVIO({ coordinazione: { motivo: 'tetto' }, sempreNonBasta: true }), _sequenza: 2 }]);
      await expect(propria(page).locator('.talos-approval__motivo')).toHaveText('Chiede perché in questa conversazione sono già partiti 20 agenti da soli: è il massimo.');
      await expect(propria(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
      await foto(page, `c2b-carta-02-tetto-${modo}.png`);
    });

    test('C2B-CARTA-03 — la carta d\'avvio di una FIGLIA con la radice spenta: nel padre, senza «Per questa sessione», e la madre «aspetta te»', async ({ page }) => {
      const traffico = await prepara(page, {
        elenco: () => [riga(MADRE, { nome: 'C2b coordinazione', inAttesaDiscendente: true })],
        pending: { tipo: 'approvazione', requestId: 'c2b-req-figlia', azione: AVVIO({ sempreNonBasta: true }), inAttesaDa: new Date().toISOString(),
          perAttrezzo: {}, politica: { permessi: 'Workspace write', perAttrezzo: {} } },
      });
      await manda(page, [{ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: MADRE, parentId: MADRE, childId: FIGLIA, reason: 'updated', emittedAt: new Date().toISOString(),
        agent: { sessionId: FIGLIA, parentId: MADRE, padreId: MADRE, task: 'Dividi il lavoro', taskCorto: 'Dividi il lavoro', collisioni: [], conclusa: false, interrotta: false, esitoDelega: null, evidenzaDelega: null, approvalPendingCount: 1, operazioneCorrente: null, avvio: 'consentito' },
        operation: { kind: 'approval', status: 'waiting', label: 'Waiting for approval', toolName: 'delega_sottotask', requestId: 'c2b-req-figlia' } } }]);
      const carta = page.locator(`#conversation [data-c="ApprovalCard"][data-figlia="${FIGLIA}"]`);
      await expect(carta).toHaveCount(1);
      await expect(carta).toContainText('Chiede di avviare un agente');
      await expect(carta.locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
      await expect(page.locator(`.talos-session-item[data-real-session-id="${MADRE}"]`)).toContainText('aspetta te');
      await foto(page, `c2b-carta-03-figlia-${modo}.png`);
      await carta.getByRole('button', { name: 'Consenti una volta' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ path: `/api/v1/sessions/${FIGLIA}/approve`, corpo: { requestId: 'c2b-req-figlia', approvato: true, rispostoDa: MADRE } });
      expect(traffico.settings, 'un sì una volta non tocca le regole').toEqual([]);
    });

    test('C2B-SEGNO-01 — come è partito un agente: nel dettaglio e nel diagramma; senza il dato, niente', async ({ page }) => {
      const figlia = (id, compito, avvio) => ({ sessionId: id, task: `Compito: ${compito}`, taskCorto: compito, conclusa: false, interrotta: false,
        avviataAlle: new Date(Date.now() - 60_000).toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', collisioni: [], esitoDelega: null,
        attivita: { file: [], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1, passi: [], passiTagliati: 0 }, ...(avvio === undefined ? {} : { avvio }) });
      await prepara(page, { figli: [figlia('c2b-f-sola', 'sistema la guardia', 'da-solo'), figlia('c2b-f-consentita', 'controlla i test', 'consentito'), figlia('c2b-f-prima', 'vecchia delega')] });
      await manda(page, [
        { type: 'RunStarted', _sequenza: 4, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\c2b', modello: 'glm-5.3-flash' } },
        { type: 'ToolCallStart', toolCallId: 'd1', toolCallName: 'delega_sottotask', _sequenza: 5 },
        { type: 'ToolCallResult', toolCallId: 'd1', content: 'ok', _sequenza: 6 },
      ]);
      const rail = page.locator('#railTabs [data-rail="agenti"]');
      if (!(await rail.isVisible())) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
      await rail.click();
      const righe = page.locator('#railAgenti [data-c="AgentRow"]');
      await expect(righe, 'premessa: le figlie sono arrivate').toHaveCount(3);
      const fatti = page.locator('[data-c="DettaglioAgente"] .talos-agente__fatti');
      await righe.filter({ hasText: 'sistema la guardia' }).click();
      await expect(fatti).toContainText('Come è partito');
      await expect(fatti).toContainText('Da solo (Coordinazione)');
      await foto(page, `c2b-segno-01-dettaglio-${modo}.png`);
      await page.locator('[data-c="DettaglioAgente"]').getByRole('button', { name: 'Apri questo agente nel diagramma' }).click();
      const grafo = page.locator('[data-c="GrafoAgenti"]');
      await expect(grafo.locator('[data-nodo-id="c2b-f-sola"]')).toContainText('da solo');
      await expect(grafo.locator('[data-nodo-id="c2b-f-consentita"]')).toContainText('consentito da te');
      await expect(grafo.locator('[data-nodo-id="c2b-f-prima"]')).not.toContainText('da solo');
      await expect(grafo.locator('[data-nodo-id="c2b-f-prima"]')).not.toContainText('consentito da te');
      await foto(page, `c2b-segno-01-diagramma-${modo}.png`);
    });
  });
}
