import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * R-34 parte 2 (owner 30/10/2026 notte: bozzetto G0 della Frontend APPROVATO, con la nota dopo due no): la carta «chiamata scritta come
 *   testo». Un modello locale scrive la chiamata come testo, il nucleo la ricostruisce e chiede SEMPRE alla persona.
 * ⛔ Evento finto col testo VERO del server (lezione del 26/09): l'azione è quella di `talosHarness.mjs` (`verificaChiamataDalTesto`),
 *   la frase inglese è `FRASI_DI_PERMESSO['server.approval.callFromText']` con `{nome}` riempito dal nucleo con l'ID dell'attrezzo.
 * ⛔ Server di prova di `playwright.config.mjs`, mai il 4174; ogni scrittura si ferma e si conta. Foto 1920×1080 nei due temi.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/carta-dal-testo/', import.meta.url)));
const SESSIONE = 'dal-testo';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const CHIAVE = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef';
const frase = (nome) => ({
  frase: `The model wrote this tool call as text instead of calling the tool (${nome}). TALOS rebuilt it: run it?`,
  fraseChiave: 'server.approval.callFromText', fraseParams: { nome },
});
const SCRIVI = { tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-0123456789ab-1', nome: 'scrivi', semprePersona: true,
  argomenti: { percorso: 'note/riassunto.md', contenuto: '# Riassunto\n- Lunedì incontro col fornitore\n- Consegna spostata a venerdì' }, ...frase('scrivi') };
const SHELL = { tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-0123456789ab-2', nome: 'shell', semprePersona: true,
  argomenti: { comando: `curl -H "Authorization: Bearer ${CHIAVE}" https://example.com`, api_key: 'valore-qualunque' }, ...frase('shell') };

for (const modo of ['light', 'dark']) {
  test.describe(`Carta «chiamata scritta come testo» · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, lingua = 'it') {
      const traffico = { approve: [], scritture: [], eventi: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        traffico.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, (rotta) => { traffico.eventi.push(rotta.request().url()); /* aperto e muto */ });
      await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/approve`, (route) => {
        traffico.approve.push(route.request().postDataJSON());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { ok: true }, meta: {} }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate(({ id, confine }) => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione(id, 'workspace', 'Carta dal testo', 'local:gemma-4-E2B', { conclusa: false, modello: 'local:gemma-4-E2B', permessi: 'Full access' });
        r.handleRealEvent(confine, r.realSessionState.generation);
      }, { id: SESSIONE, confine: CONFINE });
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
      await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      return traffico;
    }
    const manda = (page, eventi) => page.evaluate((lista) => {
      const r = window.__talosHarnessUiRuntime;
      for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
    }, eventi);
    const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
    async function foto(page, nome) {
      await mkdir(CARTELLA_FOTO, { recursive: true });
      await page.evaluate(() => Promise.race([
        Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
        new Promise((ok) => setTimeout(ok, 3000)),
      ]));
      await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
    }

    test('DAL-TESTO-CARTA-01 — la pagina dichiara la capacità; la carta dice cosa, il bersaglio, gli argomenti, il perché «sempre», e solo due scelte', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      expect(traffico.eventi.length).toBeGreaterThan(0);
      expect(new URL(traffico.eventi[0]).searchParams.get('capacita')).toBe('chiamata-dal-testo');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'dt-req-1', azione: SCRIVI, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText("Il modello ha scritto questa chiamata come testo invece di chiamare lo strumento");
      await expect(carta(page)).not.toContainText('(scrivi)'); // il nome umano, mai l'id
      await expect(carta(page).locator('.talos-approval__head')).toContainText('note/riassunto.md');
      const righe = carta(page).locator('[data-argomenti-dal-testo] .talos-kv');
      await expect(righe).toHaveCount(2);
      await expect(righe.nth(1)).toContainText('Consegna spostata a venerdì');
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText('Lo chiedo sempre, anche con Accesso pieno: un testo non parte mai da solo.');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Nega']);
      await foto(page, `dal-testo-scrivi-it-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Consenti una volta' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ requestId: 'dt-req-1', approvato: true });
      expect(traffico.scritture).toEqual([]);
    });

    test('DAL-TESTO-CARTA-02 — un comando sta nel blocco del codice, e i segreti non arrivano mai a schermo', async ({ page }) => {
      await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'dt-req-2', azione: SHELL, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page).locator('.talos-approval__codice')).toContainText('curl -H "Authorization: Bearer [redacted]"');
      await expect(carta(page).locator('[data-argomenti-dal-testo] .talos-kv')).toHaveCount(1); // il comando non si ripete nelle righe
      await expect(carta(page).locator('[data-argomenti-dal-testo]')).toContainText('[redacted]');
      expect(await carta(page).innerText()).not.toContain(CHIAVE);
      expect(await carta(page).innerText()).not.toContain('valore-qualunque');
      await foto(page, `dal-testo-shell-it-${modo}.png`);
    });

    test('DAL-TESTO-CARTA-03 — la riga dello strumento dice «dal testo» solo per una chiamata ricostruita', async ({ page }) => {
      await prepara(page, 'it');
      await manda(page, [
        { type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Riassumi' }, _sequenza: 2 },
        { type: 'ToolCallStart', toolCallId: 'daTesto-0123456789ab-1', toolCallName: 'scrivi', daTesto: true, _sequenza: 3 },
        { type: 'ToolCallStart', toolCallId: 'call-normale-1', toolCallName: 'leggi', _sequenza: 4 },
      ]);
      const segni = page.locator('#conversation .talos-tool-row__dal-testo');
      await expect(segni).toHaveCount(1);
      await expect(segni).toHaveText('dal testo');
      await expect(segni).toHaveAttribute('aria-label', 'Chiamata scritta dal modello come testo e ricostruita da TALOS.');
    });

    test('DAL-TESTO-CARTA-04 — dopo due no nello stesso giro, una nota sola, anche se l\'evento torna alla rigiocata', async ({ page }) => {
      await prepara(page, 'it');
      const ripresa = { type: 'CUSTOM', name: 'talos.chiamata-nel-testo', value: { giro: 1, tipo: 'chiamata-nel-testo', nome: 'scrivi', forma: 'xml', modello: 'local:gemma-4-E2B', esito: 'ripresa', motivo: 'gia-rifiutata' }, _sequenza: 7 };
      await manda(page, [{ type: 'RunStarted', threadId: 't', runId: 'r1', input: { consegna: 'Riassumi' }, _sequenza: 2 }, ripresa, ripresa]);
      const nota = page.locator('#conversation [data-dal-testo-basta]');
      await expect(nota).toHaveCount(1);
      await expect(nota).toContainText('Non te lo chiedo più in questo giro');
      await expect(nota).toContainText('Hai detto no due volte');
      // ⛔ al contrario: una ripresa per un altro motivo (argomenti illeggibili) resta nel giornale, nessuna nota
      await manda(page, [{ ...ripresa, value: { ...ripresa.value, motivo: 'argomenti', giro: 2 }, _sequenza: 9 }]);
      await expect(nota).toHaveCount(1);
      await foto(page, `dal-testo-nota-it-${modo}.png`);
    });

    test('DAL-TESTO-CARTA-06 — un contenuto lungo va a capo come l\'ha scritto il modello, e il blocco scorre invece di allungare la carta', async ({ page }) => {
      await prepara(page, 'it');
      const lungo = Array.from({ length: 40 }, (_, i) => `- riga ${i + 1} del riassunto`).join('\n');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'dt-req-6', azione: { ...SCRIVI, argomenti: { percorso: 'note/lungo.md', contenuto: lungo } }, _sequenza: 2 }]);
      const blocco = carta(page).locator('[data-argomenti-dal-testo]');
      await expect(blocco).toHaveCount(1);
      const misura = await blocco.evaluate((b) => ({ alto: b.clientHeight, pieno: b.scrollHeight, aCapo: getComputedStyle(b.querySelectorAll('.talos-kv__v')[1]).whiteSpace, em: parseFloat(getComputedStyle(b).fontSize) }));
      expect(misura.aCapo).toBe('pre-wrap');
      expect(misura.pieno).toBeGreaterThan(misura.alto); // scorre
      expect(misura.alto).toBeLessThanOrEqual(Math.ceil(14 * misura.em) + 1); // e non supera 14em
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveCount(2);
      await expect(carta(page).locator('.talos-approval__foot button').first()).toBeInViewport(); // i pulsanti restano raggiungibili
      await foto(page, `dal-testo-lungo-it-${modo}.png`);
    });

    test('DAL-TESTO-CARTA-05 — in inglese, lo stesso', async ({ page }) => {
      await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'dt-req-5', azione: SCRIVI, _sequenza: 2 }]);
      await expect(carta(page)).toContainText('The model wrote this tool call as text instead of calling the tool');
      await expect(carta(page)).not.toContainText('(scrivi)');
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText('TALOS always asks, even with Full access: text never runs on its own.');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Allow once', 'Deny']);
      await foto(page, `dal-testo-scrivi-en-${modo}.png`);
    });

    /* E1, decisione 121 (04/11/2026, testi del Frontend 11:47): la carta di un modello SENZA strumenti propri. Azione e frase inglese
       sono quelle del nucleo (`FRASI_DI_PERMESSO['server.approval.emulatedCall']`); la carta del testo normale qui sopra resta identica. */
    const EMULATA = { tipo: 'chiamata-dal-testo', emulata: true, toolCallId: 'emulata-0123456789ab', nome: 'scrivi', semprePersona: true,
      argomenti: SCRIVI.argomenti, frase: 'This model has no tools of its own: TALOS runs them for it, and asks first (scrivi). Run it?',
      fraseChiave: 'server.approval.emulatedCall', fraseParams: { nome: 'scrivi' } };

    test('E1-CARTA-01 — la carta emulata: la sua frase, il badge «emulato», il perché vero e la terza scelta che manda «strumento», senza nome', async ({ page }) => {
      const traffico = await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'em-req-1', azione: EMULATA, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(carta(page)).toContainText('Questo modello non ha strumenti propri: li fa funzionare TALOS, e chiede prima');
      await expect(carta(page)).not.toContainText('(scrivi)');
      await expect(carta(page).locator('.talos-approval__head')).toContainText('emulato');
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText('Lo chiedo prima di ogni azione, anche con Accesso pieno, finché non lo consenti per la sessione. Le letture dentro il progetto non chiedono.');
      await expect(carta(page).locator('[data-argomenti-dal-testo] .talos-kv')).toHaveCount(2);
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Consenti una volta', 'Per questo strumento in questa sessione', 'Nega']);
      await foto(page, `emulata-scrivi-it-${modo}.png`);
      await carta(page).getByRole('button', { name: 'Per questo strumento in questa sessione' }).click();
      await expect.poll(() => traffico.approve.length).toBe(1);
      expect(traffico.approve[0]).toEqual({ requestId: 'em-req-1', approvato: true, ambito: 'strumento' });
      expect(traffico.scritture).toEqual([]);
    });

    test('E1-CARTA-02 — in inglese, lo stesso', async ({ page }) => {
      await prepara(page, 'en');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'em-req-2', azione: EMULATA, _sequenza: 2 }]);
      await expect(carta(page)).toContainText('This model has no tools of its own: TALOS runs them for it, and asks first');
      await expect(carta(page).locator('.talos-approval__head')).toContainText('emulated');
      await expect(carta(page).locator('.talos-approval__motivo')).toHaveText('TALOS asks before every action, even with Full access, until you allow it for the session. Reading inside the project does not ask.');
      await expect(carta(page).locator('.talos-approval__foot button')).toHaveText(['Allow once', 'For this tool in this session', 'Deny']);
      await foto(page, `emulata-scrivi-en-${modo}.png`);
    });

    /* Revisione del Frontend (04/11 13:24, R1): dopo il sì per lo strumento la ricevuta dice la promessa del pulsante — le chiamate dopo
       di quello strumento non chiedono più — sulla carta e nella trascrizione. Al contrario: un no con lo stesso ambito resta «Negato». */
    const trascrizione = (page, eventi) => page.evaluate(({ lista, sessionId }) => window.__talosHarnessUiRuntime.costruisciTrascrizioneMarkdown({
      sessionId, taskId: 'libero:default', nome: 'Carta dal testo', modello: 'local:gemma-4-E2B', eventi: lista,
    }), { lista: eventi, sessionId: SESSIONE });
    for (const [lingua, bottone, ricevuta, riga, negato] of [
      ['it', 'Per questo strumento in questa sessione', 'Consentito per questo strumento in questa sessione', '_Approvazione CONCESSA per questo strumento in questa sessione._', 'Hai detto di no'], // d6e35bdd7 (decisione 89, 03/11): il no della persona dice «Hai detto di no», neutro
      ['en', 'For this tool in this session', 'Allowed for this tool in this session', '_Approval GRANTED for this tool in this session._', 'You said no'], // d6e35bdd7 (decisione 89, 03/11)
    ]) {
      test(`E1-CARTA-03 — ${lingua}: dopo il sì per lo strumento la ricevuta lo dice, sulla carta e nella trascrizione`, async ({ page }) => {
        const traffico = await prepara(page, lingua);
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'em-req-3', azione: EMULATA, _sequenza: 2 }]);
        await carta(page).getByRole('button', { name: bottone }).click();
        await expect.poll(() => traffico.approve.length).toBe(1);
        const risolta = { type: 'ApprovalResolved', requestId: 'em-req-3', approvato: true, ambito: 'strumento', _sequenza: 3 };
        await manda(page, [risolta]);
        await expect(carta(page).locator('.talos-approval__esito')).toHaveText(ricevuta);
        await foto(page, `emulata-ricevuta-${lingua}-${modo}.png`);
        const md = await trascrizione(page, [{ type: 'ApprovalRequested', requestId: 'em-req-3', azione: EMULATA }, risolta]);
        expect(md).toContain(riga);
        // ⛔ al contrario: un no con lo stesso ambito non promette niente
        const no = await trascrizione(page, [{ ...risolta, approvato: false }]);
        expect(no).not.toMatch(/strumento in questa sessione|tool in this session/u);
        expect(traffico.scritture).toEqual([]);
      });
      test(`E1-CARTA-04 — ${lingua}: al contrario, un no con ambito «strumento» resta un no`, async ({ page }) => {
        await prepara(page, lingua);
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'em-req-4', azione: EMULATA, _sequenza: 2 },
          { type: 'ApprovalResolved', requestId: 'em-req-4', approvato: false, ambito: 'strumento', _sequenza: 3 }]);
        await expect(carta(page).locator('.talos-approval__esito')).toContainText(negato);
        await expect(carta(page).locator('.talos-approval__esito')).not.toContainText(ricevuta);
      });
    }

    /* Revisione del Desktop D7, testi del Frontend (04/11 14:33): la nota del piede segue il pulsante — sulla carta emulata
       «Vale per tutta la sessione», come la carta del segreto consentibile; la carta del testo normale resta «Vale solo per questa richiesta». */
    for (const [lingua, sessione, unaVolta] of [
      ['it', 'Vale per tutta la sessione', 'Vale solo per questa richiesta'],
      ['en', 'Applies to the whole session', 'Applies only to this request'],
    ]) {
      test(`E1-CARTA-05 — ${lingua}: il piede della carta emulata dice la sessione; quello del testo normale resta «una volta»`, async ({ page }) => {
        await prepara(page, lingua);
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'em-req-5', azione: EMULATA, _sequenza: 2 }]);
        await expect(carta(page).locator('.talos-approval__foot-note')).toHaveText(sessione);
        // ⛔ al contrario: la carta del testo normale (due scelte) non promette la sessione
        await manda(page, [{ type: 'ApprovalRequested', requestId: 'dt-req-5', azione: SCRIVI, _sequenza: 3 }]);
        await expect(carta(page)).toHaveCount(2);
        await expect(carta(page).nth(1).locator('.talos-approval__foot-note')).toHaveText(unaVolta);
      });
    }

    /* Revisione del Desktop D6, testi del Frontend (04/11 14:33): una nota di sistema, UNA per conversazione, prima della prima carta
       emulata. Lo stato viene dalla storia (la colonna rifatta dagli eventi), non da una variabile della pagina: dopo una ricarica resta una. */
    const notaEmulata = (page) => page.locator('#conversation [data-emulata-nota]');
    const DUE_EMULATE = [
      { type: 'ApprovalRequested', requestId: 'em-req-6a', azione: EMULATA, _sequenza: 2 },
      { type: 'ApprovalRequested', requestId: 'em-req-6b', azione: { ...EMULATA, toolCallId: 'emulata-0123456789ac' }, _sequenza: 3 },
    ];
    for (const [lingua, testo] of [
      ['it', 'Questo modello non ha strumenti propri: le azioni le fa TALOS, e prima di ognuna te lo chiede.'],
      ['en', 'This model has no tools of its own: TALOS carries out its actions and asks you before each one.'],
    ]) {
      test(`E1-CARTA-06 — ${lingua}: due carte emulate, una nota sola prima della prima; ancora una dopo la ricarica`, async ({ page }) => {
        const traffico = await prepara(page, lingua);
        await manda(page, DUE_EMULATE);
        await expect(carta(page)).toHaveCount(2);
        await expect(notaEmulata(page)).toHaveCount(1);
        await expect(notaEmulata(page)).toContainText(testo);
        // prima della prima carta emulata, nell'ordine della colonna
        expect(await page.evaluate(() => {
          const nota = document.querySelector('#conversation [data-emulata-nota]');
          const prima = document.querySelector('#conversation [data-c="ApprovalCard"]');
          return Boolean(nota.compareDocumentPosition(prima) & Node.DOCUMENT_POSITION_FOLLOWING);
        })).toBe(true);
        await foto(page, `emulata-nota-${lingua}-${modo}.png`);
        // la ricarica: la colonna si rifà dalla storia (rigiocata), poi il confine
        await page.reload();
        await page.waitForFunction(() => window.__talosHarnessUiRuntime);
        await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
        await page.evaluate(({ id, lista, confine }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', 'Carta dal testo', 'local:gemma-4-E2B', { conclusa: false, modello: 'local:gemma-4-E2B', permessi: 'Full access' });
          for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
          r.handleRealEvent(confine, r.realSessionState.generation);
        }, { id: SESSIONE, lista: DUE_EMULATE, confine: CONFINE });
        await expect(carta(page)).toHaveCount(2);
        await expect(notaEmulata(page)).toHaveCount(1);
        // D10: dopo la ricarica la carta aperta è ancora una carta emulata viva, e la sua terza scelta manda ancora «strumento»
        await expect(carta(page).first().locator('.talos-approval__foot button')).toHaveText(lingua === 'it'
          ? ['Consenti una volta', 'Per questo strumento in questa sessione', 'Nega'] : ['Allow once', 'For this tool in this session', 'Deny']);
        await carta(page).first().getByRole('button', { name: lingua === 'it' ? 'Per questo strumento in questa sessione' : 'For this tool in this session' }).click();
        await expect.poll(() => traffico.approve.length).toBe(1);
        expect(traffico.approve[0]).toEqual({ requestId: 'em-req-6a', approvato: true, ambito: 'strumento' });
        expect(traffico.scritture).toEqual([]);
      });
    }
    test('E1-CARTA-07 — al contrario: una carta del testo normale non porta la nota', async ({ page }) => {
      await prepara(page, 'it');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'dt-req-7', azione: SCRIVI, _sequenza: 2 }]);
      await expect(carta(page)).toHaveCount(1);
      await expect(notaEmulata(page)).toHaveCount(0);
    });
  });
}
