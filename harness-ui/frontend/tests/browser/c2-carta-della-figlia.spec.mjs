import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔⛔ C2 R4/R5 (07/10/2026, owner: «la carta della figlia nel padre», «aspetta, carta visibile») — LA DOMANDA DI PERMESSO DI
 *   UNA FIGLIA SI RISPONDE DAL PADRE. Il padre non si abbona al flusso della figlia: lo snapshot `talos.agenti` dice «in attesa»
 *   col `requestId`, una lettura di `GET /sessions/<figlia>/pending` porta la domanda, il POST va alla FIGLIA con `rispostoDa`, e
 *   lo stesso snapshot porta la risoluzione con l'esito.
 * ⛔ EVENTI FINTI COL TESTO VERO DEL SERVER (lezione del 26/09): la forma di `talos.agenti` è quella di
 *   `annunciaAgenteAgliAntenati` (session-registry.mjs), l'agente quella di `snapshotFiglio` (subagent-orchestrator.mjs) più
 *   `padreId`, la domanda quella di `domandaInAttesa`, la busta quella di `successEnvelope` (http-app.mjs).
 * ⛔ Server isolato di `playwright.config.mjs` (mai il 4174); ogni POST verso la figlia si intercetta: la prova non risponde a
 *   nessuna domanda vera. Foto ≥ 1920×1080 nei due temi (owner 29/09 e 11/09).
 */

const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/c2-carta-della-figlia/', import.meta.url)));
async function foto(page, nome, selettore = null) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
  const byte = await (selettore ? page.locator(selettore).screenshot() : page.screenshot());
  await writeFile(path.join(CARTELLA_FOTO, nome), byte);
  return byte;
}

const MADRE = 'c2-madre';
const FIGLIA = 'c2-figlia';
const REQ = 'c2-richiesta-1';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }; // come lo manda il server (http-app.mjs:8185)
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });

/** `snapshotFiglio` + `padreId`, come lo manda `snapshotAgente`. */
const agente = (extra = {}) => ({
  sessionId: FIGLIA, parentId: MADRE, padreId: MADRE, task: 'Rileggi i test e sistemali', taskCorto: 'Rileggi i test',
  collisioni: [], conclusa: false, interrotta: false, esitoDelega: null, evidenzaDelega: null,
  approvalPendingCount: 1, operazioneCorrente: null, ...extra,
});
/** Il CUSTOM di `annunciaAgenteAgliAntenati`, con l'operazione di `operazioneAgenteDaEvento`. */
const agenti = (operation, extraAgente = {}) => ({
  type: 'CUSTOM', name: 'talos.agenti',
  value: { version: 1, sessionId: MADRE, parentId: MADRE, childId: FIGLIA, reason: 'updated', emittedAt: new Date().toISOString(), agent: agente(extraAgente), operation },
});
const IN_ATTESA = { kind: 'approval', status: 'waiting', label: 'Waiting for approval', toolName: 'shell', requestId: REQ };
const risolta = (approvato) => ({ kind: 'approval', status: 'resolved', label: 'Approval resolved', toolName: null, requestId: REQ, approvato });
/**
 * `domandaInAttesa` per una domanda di shell, nella forma del server (C2-R4-bis): `perAttrezzo` = le scelte PROPRIE della figlia
 * (da cui parte «Per questa sessione»), `politica` = la politica della CATENA fotografata alla richiesta (da cui il perché).
 */
const PENDENTE = (extraAzione = {}, politica = { permessi: 'On request', perAttrezzo: { scrivi: 'chiedi' } }) => ({
  tipo: 'approvazione', requestId: REQ, azione: { tipo: 'shell', comando: 'npm install', ...extraAzione },
  inAttesaDa: new Date().toISOString(), perAttrezzo: { scrivi: 'chiedi' }, politica,
});

async function manda(page, lista) {
  await page.evaluate((l) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of l) r.handleRealEvent(e, r.realSessionState.generation);
  }, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

for (const modo of ['light', 'dark']) {
  test.describe(`C2 carta della figlia nel padre · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, locale: 'it-IT', viewport: { width: 1920, height: 1080 } });

    /**
     * Prepara la madre; `figli` = ciò che rende `/children` (C2-08), `pending` = ciò che rende `/pending` della figlia,
     * `impostazioni` = ciò che rende `/settings` (C2-R7: `{ updated: true }` di sempre, o con `nonUniti`, come `http-app.mjs`),
     * `elenco` = le righe di `GET /sessions` (C2-R7: la riga della madre e delle antenate), lette al momento della richiesta.
     */
    async function prepara(page, { figli = [], pending = PENDENTE(), ritardoPendingMs = 0, impostazioni = { updated: true }, elenco = null, lingua = 'it' } = {}) {
      const traffico = { pending: 0, approve: [], settings: [], elenco: 0 };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      if (elenco) {
        await page.route((url) => url.pathname === '/api/v1/sessions', async (route) => {
          if (route.request().method() !== 'GET') return route.abort();
          traffico.elenco += 1;
          const { righe, ritardoMs = 0 } = elenco();
          if (ritardoMs > 0) await new Promise((ok) => setTimeout(ok, ritardoMs));
          return route.fulfill({ contentType: 'application/json', body: busta({ items: righe }) });
        });
      }
      /* Stream APERTO E MUTO, col confine mandato dalla prova subito dopo l'apertura (VELO-SPEC del bugfixer, 08/10/2026, come
         `c2q-domanda-della-figlia`). ⛔ C2-R7: col corpo che si chiudeva lo stream si riapriva di continuo («Collegato di nuovo» in
         tutte le foto) e ogni `onopen` ricaricava l'elenco (`app.js`, `source.onopen`): il mutante «l'attesa della figlia non
         ricarica l'elenco» restava vivo perché lo faceva la riconnessione al posto suo. */
      await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/events`), () => { /* resta pending: aperto e muto */ });
      await page.route((url) => url.pathname.endsWith(`/sessions/${MADRE}/children`), (route) => route.fulfill({ contentType: 'application/json', body: busta({ figli }) }));
      await page.route((url) => url.pathname.endsWith(`/sessions/${FIGLIA}/pending`), async (route) => {
        traffico.pending += 1;
        const corpo = busta({ pending: typeof pending === 'function' ? pending() : pending }); // la risposta è quella del momento della lettura
        if (ritardoPendingMs > 0) await new Promise((ok) => setTimeout(ok, ritardoPendingMs));
        return route.fulfill({ contentType: 'application/json', body: corpo });
      });
      await page.route((url) => /\/sessions\/[^/]+\/approve$/u.test(url.pathname), (route) => {
        traffico.approve.push({ path: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
        return route.fulfill({ contentType: 'application/json', body: busta({ ok: true }) });
      });
      await page.route((url) => /\/sessions\/[^/]+\/settings$/u.test(url.pathname), (route) => {
        traffico.settings.push({ path: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
        return route.fulfill({ contentType: 'application/json', body: busta(impostazioni) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'C2 carta della figlia', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
        r.handleRealEvent(confine, r.realSessionState.generation); // il confine che il server manda SEMPRE, anche a storia vuota
      }, { id: MADRE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      /* Da A1-R3 (ba0447613) anche una sessione IN CORSO si apre col velo, che il custode toglie al primo giro del suo intervallo
         (200 ms) dopo il confine. Senza questa attesa le foto ritraevano «Apro la cronologia…» e le prove misuravano una carta
         NASCOSTA (`getBoundingClientRect` funziona anche sotto `visibility:hidden`). Se il velo non si togliesse, qui sarebbe rosso. */
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      return traffico;
    }
    const carta = (page) => page.locator(`#conversation [data-c="ApprovalCard"][data-figlia="${FIGLIA}"]`);

    test('C2-CARTA-01 — la figlia chiede: la carta compare nel padre, dice chi chiede, e risponde ALLA FIGLIA con rispostoDa', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__chi')).toHaveText('L’agente «Rileggi i test» chiede');
      // il PERCHÉ è della figlia (Chiede prima), non della madre (Scrive nel progetto, la politica di serie)
      await expect(carta(page).locator('.talos-approval__motivo')).toContainText('Chiede prima');
      await expect(carta(page).locator('.talos-approval__motivo')).not.toContainText('Scrive nel progetto');
      await expect(carta(page)).toContainText('npm install');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Per questa sessione', 'Nega']);
      await foto(page, `c2-01-carta-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Consenti una volta' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ path: `/api/v1/sessions/${FIGLIA}/approve`, corpo: { requestId: REQ, approvato: true, rispostoDa: MADRE } });
      // l'esito lo scrive SOLO lo snapshot della risoluzione, come ApprovalResolved per le carte della madre
      await expect(carta(page).locator('.talos-approval__foot')).toHaveCount(1);
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      await expect(carta(page).locator('.talos-approval__foot')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__esito')).toHaveCount(1);
      await foto(page, `c2-01-risolta-${modo}.png`);
    });

    test('C2-CARTA-02 — il rigioco del silenzio non duplica la carta né rilegge la domanda (R5)', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await manda(page, [agenti(IN_ATTESA), agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      expect(traffico.pending, 'una lettura per richiesta nuova, mai una per rigioco').toBe(1);
    });

    test('C2-CARTA-03 — risposta data altrove (nella figlia): la carta si chiude con l\'esito vero, detto come altrove', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await manda(page, [agenti(risolta(false), { approvalPendingCount: 0 })]);
      await expect(carta(page).locator('.talos-approval__foot')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__esito')).toHaveCount(1);
      expect(traffico.approve.length, 'da qui non è partito niente').toBe(0);
    });

    /* C2 UNIONE (08/10/2026, owner «Sì, anche sul server»): la carta manda al server il SOLO attrezzo da unire
       (`unisciPermessiPerAttrezzo`), mai una mappa; che le altre regole della figlia restino com'erano lo prova il registro
       (`tests/c2-unione-permessi-per-attrezzo.test.mjs`, UNIONE-01…07). */
    test('C2-CARTA-04 — «Per questa sessione» UNISCE l\'attrezzo nelle impostazioni della FIGLIA, mai quelle del padre', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      // C2-R7: con `rispettaNega` — un «nega» della figlia messo dopo la nascita della carta resta (vince il «Nega»)
      expect(traffico.settings).toEqual([{ path: `/api/v1/sessions/${FIGLIA}/settings`, corpo: { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true } }]);
      expect(traffico.approve[0].path).toBe(`/api/v1/sessions/${FIGLIA}/approve`);
      // il «sempre» è stato scritto: sotto l'esito nessuna riga in più
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      await expect(carta(page).locator('.talos-approval__esito')).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__sempre-non-salvato')).toHaveCount(0);
    });

    /* C2-R7 (owner 08/10/2026 sera, «Vince il "Nega"»): la figlia ha messo «Nega» sul comando DOPO la nascita della carta. Il
       server non scrive il «sempre» e lo dice (`nonUniti`); il sì a QUESTA richiesta parte, e la carta lo spiega sotto l'esito. */
    test('C2-CARTA-16 — «Per questa sessione» davanti a un «Nega»: il sì vale solo per questa richiesta, e la carta lo dice', async ({ page }) => {
      const traffico = await prepara(page, { impostazioni: { updated: true, nonUniti: ['shell'] } });
      await manda(page, [agenti(IN_ATTESA)]);
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0].corpo).toEqual({ requestId: REQ, approvato: true, rispostoDa: MADRE });
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      const riga = carta(page).locator('.talos-approval__sempre-non-salvato');
      await expect(riga).toHaveText('Consentito solo per questa richiesta: la regola di «Comando nel terminale» è «Nega sempre», quindi «Per questa sessione» non è stato salvato.');
      await expect(riga).toBeVisible();
      // sotto l'esito, non al posto suo
      expect(await carta(page).evaluate((c) => [...c.children].filter((f) => /talos-approval__(esito|sempre-non-salvato)/u.test(f.className)).map((f) => f.className.includes('esito') ? 'esito' : 'riga'))).toEqual(['esito', 'riga']);
      await foto(page, `c2-16-solo-questa-richiesta-${modo}.png`);
    });

    test('C2-CARTA-16b — la stessa riga in inglese (la sorgente)', async ({ page }) => {
      const traffico = await prepara(page, { impostazioni: { updated: true, nonUniti: ['shell'] }, lingua: 'en' });
      await manda(page, [agenti(IN_ATTESA)]);
      await carta(page).getByRole('button', { name: 'For this session' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      await expect(carta(page).locator('.talos-approval__sempre-non-salvato')).toHaveText('Allowed for this request only: the rule for “Terminal command” is “Always deny”, so “For this session” was not saved.');
      await foto(page, `c2-16b-solo-questa-richiesta-en-${modo}.png`);
    });

    test('C2-CARTA-16c — al contrario: un «Nega» della risposta (o un sì «una volta») non porta la riga anche se il server avrebbe saltato', async ({ page }) => {
      const traffico = await prepara(page, { impostazioni: { updated: true, nonUniti: ['shell'] } });
      await manda(page, [agenti(IN_ATTESA)]);
      await carta(page).getByRole('button', { name: 'Consenti una volta' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings, 'un sì una volta non tocca le regole').toEqual([]);
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      await expect(carta(page).locator('.talos-approval__esito')).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__sempre-non-salvato')).toHaveCount(0);
    });

    /* C2-R7 (owner 08/10/2026 sera, «Sì, anche la sessione stessa»): la carta di QUESTA sessione unisce il solo attrezzo, con
       `rispettaNega`, invece di mandare la mappa intera da una copia locale (con due finestre un «nega» poteva sparire). Forme degli
       eventi da `agui-events.mjs` (righe 332 e 363). */
    test('C2-CARTA-18 — la carta della sessione STESSA: unione del solo attrezzo con rispettaNega, e la stessa riga se il server salta', async ({ page }) => {
      const traffico = await prepara(page, { impostazioni: { updated: true, nonUniti: ['shell'] } });
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'c2r7-propria-1', azione: { tipo: 'shell', comando: 'npm test' }, _sequenza: 2 }]);
      const propria = page.locator('#conversation [data-c="ApprovalCard"]:not([data-figlia])');
      await expect(propria).toHaveCount(1);
      await propria.getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings).toEqual([{ path: `/api/v1/sessions/${MADRE}/settings`, corpo: { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true } }]);
      expect(traffico.approve[0]).toEqual({ path: `/api/v1/sessions/${MADRE}/approve`, corpo: { requestId: 'c2r7-propria-1', approvato: true } });
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'c2r7-propria-1', approvato: true, _sequenza: 3 }]);
      await expect(propria.locator('.talos-approval__sempre-non-salvato')).toHaveText('Consentito solo per questa richiesta: la regola di «Comando nel terminale» è «Nega sempre», quindi «Per questa sessione» non è stato salvato.');
      await foto(page, `c2-18-propria-solo-questa-richiesta-${modo}.png`);
    });

    /* C2-R7 (owner 08/10/2026 sera, «Sì, la madre dice "aspetta te"»): la riga della madre dice «aspetta te» mentre una
       discendente aspetta la persona. ⛔ La barra mostra solo le sessioni RADICE (una delega non ha una riga sua: misurato nella
       prima stesura di questa prova, la riga della madre-figlia non c'era). Quindi due casi veri:
       - 17: la madre aperta È una radice ⇒ la sua riga lo dice SUBITO, dalle carte della figlia che ha già, anche con l'elenco lento;
       - 17b: la sessione aperta è una delega ⇒ la riga della RADICE (la nonna) lo legge dall'elenco (`inAttesaDiscendente`), che
         si ricarica quando la figlia entra in attesa o ne esce. */
    const NONNA = 'c2-nonna';
    const riga = (sessionId, extra) => ({ sessionId, taskId: 'libero:default', avviataAlle: '2026-10-08T08:00:00.000Z', modello: 'z-ai/glm-5.3-flash', provider: 'cloud', padreId: null, profonditaDelega: 0, taskDelega: null, ...extra });
    const rigaDi = (page, id) => page.locator(`.talos-session-item[data-real-session-id="${id}"]`);
    test('C2-CARTA-17 — la madre aperta (radice) dice «aspetta te» subito, anche con l\'elenco lento, e poi torna «in corso»', async ({ page }) => {
      const stato = { attende: false, ritardoMs: 0 };
      const traffico = await prepara(page, { elenco: () => ({ ritardoMs: stato.ritardoMs, righe: [
        riga(MADRE, { nome: 'C2 carta della figlia', conclusa: false, inAttesaDiscendente: stato.attende }),
      ] }) });
      await expect(rigaDi(page, MADRE)).toHaveAttribute('data-session-state', 'vivo');
      Object.assign(stato, { attende: true, ritardoMs: 4_000 });
      const letturePrima = traffico.elenco;
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      // prima che l'elenco torni (4 s): lo dice la riga viva
      await expect(rigaDi(page, MADRE)).toHaveAttribute('data-session-state', 'attesa', { timeout: 2_000 });
      await expect(rigaDi(page, MADRE)).toContainText('aspetta te');
      await expect.poll(() => traffico.elenco, { message: 'la figlia in attesa ricarica l\'elenco' }).toBeGreaterThan(letturePrima);
      await foto(page, `c2-17-madre-aspetta-te-${modo}.png`);
      // l'elenco è ancora lento: la riga viva torna «in corso» da sola, appena la carta si chiude
      await expect.poll(() => traffico.elenco, { timeout: 8_000 }).toBeGreaterThan(letturePrima);
      await page.waitForTimeout(4_500); // la lettura lenta dell'apertura è tornata: non può essere lei a riscrivere la riga dopo
      Object.assign(stato, { attende: false });
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      await expect(rigaDi(page, MADRE)).toHaveAttribute('data-session-state', 'vivo', { timeout: 2_000 });
      await expect(rigaDi(page, MADRE)).toContainText('in corso');
    });

    test('C2-CARTA-17b — la sessione aperta è una delega: la riga della RADICE dice «aspetta te» dall\'elenco, poi torna «conclusa»', async ({ page }) => {
      const stato = { attende: false };
      const traffico = await prepara(page, { elenco: () => ({ righe: [
        riga(NONNA, { nome: 'Rifai il sito', conclusa: true, ultimoEsito: 'successo', inAttesaDiscendente: stato.attende }),
        riga(MADRE, { nome: null, conclusa: false, padreId: NONNA, profonditaDelega: 1, taskDelega: 'C2 carta della figlia', inAttesaDiscendente: stato.attende }),
      ] }) });
      await expect(rigaDi(page, NONNA)).toHaveAttribute('data-session-state', 'successo');
      await expect(rigaDi(page, MADRE), 'premessa: una delega non ha una riga sua nella barra').toHaveCount(0);
      stato.attende = true;
      const letturePrima = traffico.elenco;
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await expect.poll(() => traffico.elenco, { message: 'la figlia in attesa ricarica l\'elenco' }).toBeGreaterThan(letturePrima);
      await expect(rigaDi(page, NONNA)).toHaveAttribute('data-session-state', 'attesa', { timeout: 5_000 });
      await expect(rigaDi(page, NONNA)).toContainText('aspetta te');
      await foto(page, `c2-17b-radice-aspetta-te-${modo}.png`);
      stato.attende = false;
      const lettureAttesa = traffico.elenco;
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]);
      await expect.poll(() => traffico.elenco, { message: 'la risposta ricarica l\'elenco' }).toBeGreaterThan(lettureAttesa);
      await expect(rigaDi(page, NONNA)).toHaveAttribute('data-session-state', 'successo', { timeout: 5_000 });
    });

    /* PERMESSI-SOSTITUITI (08/10/2026, bugfixer; riprodotto dal vivo sulla 4176): la rotta delle impostazioni SOSTITUISCE la mappa,
       e la carta partiva dalla fotografia presa alla sua nascita — un «nega» messo altrove nel frattempo spariva. La cura (a)
       rilegge prima di scrivere: la finestra si riduce a un giro di rete, non si chiude (la chiude solo il server, ETag + If-Match
       o un'unione per chiave: OpenStack API-SIG «etags», archman «Concurrency Control and ETags», letti l'08/10/2026). */
    test('C2-CARTA-15 — regole della figlia cambiate DOPO la nascita della carta: la carta non porta nessuna fotografia, unisce l\'attrezzo', async ({ page }) => {
      let regole = { scrivi: 'chiedi' };
      const traffico = await prepara(page, { pending: () => ({ ...PENDENTE(), perAttrezzo: regole }) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      regole = { scrivi: 'chiedi', prova: 'nega', document_create: 'chiedi' }; // altrove: le Impostazioni della figlia, un'altra scheda
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      // né la fotografia della nascita né quella riletta: con una mappa intera, una regola messa fra la lettura e la scrittura sparirebbe
      expect(traffico.settings).toEqual([{ path: `/api/v1/sessions/${FIGLIA}/settings`, corpo: { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true } }]);
    });

    test('C2-CARTA-15b — al contrario: se le regole vive non si possono leggere, il «sempre» NON si scrive e il sì parte lo stesso', async ({ page }) => {
      const traffico = await prepara(page);
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await page.route((url) => url.pathname.endsWith(`/sessions/${FIGLIA}/pending`), (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings, 'una fotografia vecchia non riscrive le regole della figlia').toEqual([]);
      expect(traffico.approve[0].path).toBe(`/api/v1/sessions/${FIGLIA}/approve`);
    });

    test('C2-CARTA-15c — al contrario: se la domanda non è più in attesa (risposta altrove), le regole non si riscrivono da zero', async ({ page }) => {
      let ancoraInAttesa = true;
      const traffico = await prepara(page, { pending: () => (ancoraInAttesa ? PENDENTE() : null) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      ancoraInAttesa = false; // qualcuno ha risposto nella figlia: `/pending` non porta più le sue regole
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings, 'una mappa con il solo «sempre» cancellerebbe tutte le altre regole della figlia').toEqual([]);
    });

    test('C2-CARTA-15d — al contrario: se la figlia ora aspetta una DOMANDA (senza regole nel corpo), le regole non si riscrivono', async ({ page }) => {
      let comeDomanda = false;
      const traffico = await prepara(page, { pending: () => (comeDomanda
        ? { tipo: 'domanda', requestId: 'c2-domanda-1', questions: [{ id: 'q', question: 'Proseguo?', options: [{ label: 'Sì' }] }] }
        : PENDENTE()) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      comeDomanda = true; // la carta di permesso è stata risolta altrove, e la figlia ora chiede qualcosa alla persona (C2-Q)
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings, 'una domanda non porta le regole: niente mappa riscritta').toEqual([]);
    });

    test('C2-CARTA-15e — al contrario: se la figlia ora aspetta un\'ALTRA richiesta di permesso, il «sempre» di questa non si scrive', async ({ page }) => {
      let altra = false;
      const traffico = await prepara(page, { pending: () => (altra ? { ...PENDENTE(), requestId: 'c2-req-2' } : PENDENTE()) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      altra = true; // questa è stata risolta altrove, e la figlia ne ha già chiesta un'altra: un «sempre» accompagna solo una risposta viva
      await carta(page).getByRole('button', { name: 'Per questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.settings, 'il «sempre» di una richiesta già chiusa non si scrive').toEqual([]);
      expect(traffico.approve[0].corpo).toEqual({ requestId: REQ, approvato: true, rispostoDa: MADRE });
    });

    test('C2-CARTA-05 — dove un «sempre» della figlia non può valere (C2-a), «Per questa sessione» non c\'è', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({ sempreNonBasta: true }) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
    });

    test('C2-CARTA-06 — riaprendo il padre con una figlia che aspetta ancora, la carta torna senza nessuno snapshot vivo (C2-08)', async ({ page }) => {
      const traffico = await prepara(page, { figli: [agente()] });
      await expect(carta(page)).toHaveCount(1);
      expect(traffico.pending).toBe(1);
    });

    test('C2-CARTA-08 — la lettura torna DOPO la risoluzione: nessuna carta orfana', async ({ page }) => {
      const traffico = await prepara(page, { ritardoPendingMs: 600 });
      await manda(page, [agenti(IN_ATTESA)]); // parte la lettura, che risponde fra 600 ms con la domanda ancora aperta
      await manda(page, [agenti(risolta(true), { approvalPendingCount: 0 })]); // nel frattempo la figlia ha avuto la risposta altrove
      await expect.poll(() => traffico.pending).toBe(1);
      await page.waitForTimeout(900);
      await expect(page.locator('#conversation [data-c="ApprovalCard"]')).toHaveCount(0);
    });

    test('C2-CARTA-07 — AL CONTRARIO: una figlia che non aspetta, o lo snapshot di un\'altra madre, non disegna niente', async ({ page }) => {
      const traffico = await prepara(page, { figli: [agente({ approvalPendingCount: 0 })], pending: null });
      await manda(page, [{ ...agenti(IN_ATTESA), value: { ...agenti(IN_ATTESA).value, sessionId: 'altra-madre', parentId: 'altra-madre', agent: { ...agente(), parentId: 'altra-madre', padreId: 'altra-madre' } } }]);
      await expect(page.locator('#conversation [data-c="ApprovalCard"]')).toHaveCount(0);
      expect(traffico.pending).toBe(0);
    });

    test('C2-CARTA-09 — il cancello sta nella CATENA (un antenato ha «Chiedi» sul comando, la figlia no): il perché lo dice', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({}, { permessi: 'Workspace write', perAttrezzo: { shell: 'chiedi' } }) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__motivo')).toContainText('Chiedi conferma');
      await expect(carta(page).locator('.talos-approval__motivo')).toContainText('Scrive nel progetto');
      await foto(page, `c2-09-cancello-nella-catena-${modo}.png`);
    });

    test('C2-CARTA-10 — AL CONTRARIO: senza la politica della catena (un server più vecchio) la carta non inventa un perché', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({}, null) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveCount(0);
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Per questa sessione', 'Nega']);
    });

    const FRASE_ROOT = 'Questo comando gira in Linux (WSL, Ubuntu) come root, e con i permessi di questa sessione nessuno lo approva.';
    test('C2-CARTA-11 — DUE RAMI: senza la politica restano le frasi VERE del kernel (qui la root in WSL)', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({ wslRoot: { distro: 'Ubuntu', utente: 'root', frase: FRASE_ROOT } }, null) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText(FRASE_ROOT);
    });

    test('C2-CARTA-12 — permessi illeggibili (`permessi: null`): nessuna frase sulla politica, mai «Permesso non scelto»', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({}, { permessi: null, perAttrezzo: { shell: 'chiedi' } }) });
      await manda(page, [agenti(IN_ATTESA)]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveCount(0);
      await expect(carta(page)).not.toContainText('Permesso non scelto');
    });

    /* CARTA-BADGE (08/10/2026, il bugfixer dal vivo sulla 4176): il nome è il compito delegato intero, e spingeva il badge della
       richiesta fuori dalla carta. Si misura la GEOMETRIA, non il codice. */
    const NOME_LUNGO = '[FIGLIA-C2A] Crea il file c2a-prova-figlia.txt con una riga di testo, usando l’attrezzo scrivi, e poi rileggilo per controllare che la riga ci sia davvero';
    /** La geometria del badge «chi chiede» e del badge della richiesta, dal DOM. */
    const misuraBadge = (page) => carta(page).evaluate((c) => {
      const scheda = c.getBoundingClientRect();
      const richiesta = c.querySelector('.talos-approval__head > .talos-badge--accent');
      const nome = c.querySelector('.talos-approval__chi-nome');
      const r = richiesta.getBoundingClientRect();
      // il nome comincia dove finisce «L’agente «»: niente spazio in più fra le due (il `gap` del badge stava fra figli separati)
      const prima = document.createRange();
      prima.selectNodeContents(nome.previousSibling);
      // la CODA dopo il nome («» chiede») resta dentro la frase: prima della cura cedeva lei, senza segno (review del bugfixer)
      const frase = nome.parentElement;
      const dopo = document.createRange();
      dopo.selectNodeContents(frase.lastChild);
      return { dentro: r.left >= scheda.left && r.right <= scheda.right + 0.5, intera: richiesta.scrollWidth <= richiesta.clientWidth + 1,
        troncato: nome.scrollWidth > nome.clientWidth, titolo: nome.title,
        attaccato: Math.abs(nome.getBoundingClientRect().left - prima.getBoundingClientRect().right) <= 1,
        coda: dopo.getBoundingClientRect().right <= frase.getBoundingClientRect().right + 0.5 && frase.scrollWidth <= frase.clientWidth + 1 };
    });
    const aLarghezza = async (page, width) => {
      await page.setViewportSize({ width, height: 1080 });
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    };
    test('C2-CARTA-13 — un nome lungo si accorcia lui: il badge della richiesta resta INTERO e dentro la carta, il nome intero nel suggerimento', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({ tipo: 'scrivi', percorso: 'c2a-prova-figlia.txt' }) });
      await manda(page, [agenti(IN_ATTESA, { taskCorto: NOME_LUNGO })]);
      await expect(carta(page)).toHaveCount(1);
      const atteso = { dentro: true, intera: true, troncato: true, titolo: NOME_LUNGO, attaccato: true, coda: true };
      expect(await misuraBadge(page)).toEqual(atteso);
      await foto(page, `c2-13-nome-lungo-${modo}.png`);
      // le larghezze strette si provano sul DOM, senza foto (regola dell'owner del 29/09): è lì che la carta si stringe davvero
      for (const width of [1280, 1024, 860]) {
        await aLarghezza(page, width);
        expect(await misuraBadge(page), `larghezza ${width}`).toEqual(atteso);
      }
    });
    test('C2-CARTA-14 — al contrario: un nome CORTO non cede, anche dove la carta è stretta (frase intera, senza «…»)', async ({ page }) => {
      await prepara(page, { pending: PENDENTE({ tipo: 'scrivi', percorso: 'c2a-prova-figlia.txt' }) });
      await manda(page, [agenti(IN_ATTESA, { taskCorto: 'sito' })]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__chi-nome')).toHaveText('sito');
      for (const width of [1920, 860]) {
        await aLarghezza(page, width);
        expect(await misuraBadge(page), `larghezza ${width}`).toEqual({ dentro: true, intera: true, troncato: false, titolo: 'sito', attaccato: true, coda: true });
      }
    });
  });
}
