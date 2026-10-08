import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ Automazioni a due porte (owner 08/10/2026 notte: «le automazioni devono partire anche con richiesta al modello… stato
 *   dell'arte, Claude e Codex… massima UX e UI, senza compromessi»). A schermo:
 *   - la pagina: la riga v2 con l'orario in parole, il menu «⋯» e il tasto destro con le stesse voci (Esegui ora, Modifica, Apri
 *     la chat, Elimina con conferma), lo storico dei giri nel dettaglio, la scheda «Da guardare» col segna-letto e la campanella;
 *   - il foglio di modifica precompilato, che non manda il fuso;
 *   - la carta in chat quando il modello crea/cambia/accende/fa partire: la bozza in parole, Approva · Modifica · Annulla, e
 *     l'esito scritto da `ApprovalResolved` («Modificata e salvata da te», «Annullata»).
 * ⛔ EVENTI E VOCI COL TESTO VERO DEL SERVER (lezione del 26/09): la bozza e il diff sono l'uscita di `anteprimaCrea` /
 *   `anteprimaModifica` (automation-store.mjs, generati l'08/10 da `bozza-vera.mjs`), l'azione è quella che il kernel passa a
 *   `verificaAzioneAutomazione` (`{...anteprima.azione, tipo, toolCallId}`), lo storico quello di `giri()`.
 * ⛔ Server isolato della sessione desktop (4177), mai il 4174; ogni scrittura che la prova non risponde si ferma e si conta.
 *   Foto ≥ 1920×1080 nei due temi; testi in italiano e in inglese.
 */
const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/automazioni-v2/', import.meta.url)));
const MADRE = 'auto-madre';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1', generatedAt: new Date().toISOString() } });

const ISTRUZIONI = 'Leggi i commit di ieri e scrivimi in cinque righe cosa è cambiato.\nSe non è cambiato niente, non dirmi niente.';
const VOCE = (extra = {}) => ({ versione: 2, id: 'a1', nome: 'Rapporto mattutino', istruzioni: ISTRUZIONI, cartella: 'C:\\progetti\\talos',
  modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', coordinazione: false, pianificazione: { tipo: 'feriali', ora: '09:00' },
  fusoOrario: 'Europe/Rome', ripeti: null, eseguite: 3, attiva: true, origine: { tipo: 'chat', sessionId: MADRE },
  creataAlle: '2026-10-05T20:00:00.000Z', modificataAlle: '2026-10-05T20:00:00.000Z', ultimaEsecuzione: '2026-10-08T07:00:04.000Z',
  prossimaEsecuzione: '2026-10-09T07:00:00.000Z', inAttesaFinoA: null, giroInCorso: null, ...extra });
const GIRI = [
  { runId: 'r3', previstaAlle: '2026-10-08T07:00:00.000Z', partitaAlle: '2026-10-08T07:00:04.000Z', sessionId: 'auto-giro-3', esito: 'finita',
    finitaAlle: '2026-10-08T07:02:10.000Z', riassunto: 'Ieri 4 commit: il registro chiude i giri, due correzioni alla chat, un test nuovo per le automazioni.',
    daGuardare: true, letta: false },
  { runId: 'r2', previstaAlle: '2026-10-07T07:00:00.000Z', saltataAlle: '2026-10-07T09:12:00.000Z', esito: 'saltata', motivo: 'app-chiusa', daGuardare: false, letta: false },
  { runId: 'r1', previstaAlle: '2026-10-06T07:00:00.000Z', partitaAlle: '2026-10-06T07:00:02.000Z', sessionId: 'auto-giro-1', esito: 'finita',
    finitaAlle: '2026-10-06T07:01:00.000Z', riassunto: null, daGuardare: false, letta: false },
];
const POSTA = () => [{ automazioneId: 'a1', nome: 'Rapporto mattutino', ...GIRI[0] }];
/* `anteprimaCrea` per la carta del modello (generata dal codice vero, 08/10/2026) */
const BOZZA = { versione: 2, id: '6d825a75-d7d0-4346-80fd-462d817d2cc2', nome: 'Rapporto mattutino', istruzioni: ISTRUZIONI, cartella: 'C:\\progetti\\talos',
  modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', coordinazione: false, pianificazione: { tipo: 'feriali', ora: '09:00' }, fusoOrario: 'Europe/Rome',
  ripeti: null, eseguite: 0, attiva: true, origine: { tipo: 'interfaccia' }, creataAlle: '2026-10-08T20:00:00.000Z', modificataAlle: '2026-10-08T20:00:00.000Z',
  ultimaEsecuzione: null, prossimaEsecuzione: '2026-10-09T07:00:00.000Z', inAttesaFinoA: null, giroInCorso: null };
const DIFF = { prima: { istruzioni: ISTRUZIONI, pianificazione: { tipo: 'feriali', ora: '09:00' }, prossimaEsecuzione: '2026-10-09T07:00:00.000Z' },
  dopo: { istruzioni: 'Come prima, ma anche le PR aperte.', pianificazione: { tipo: 'feriali', ora: '10:30' }, prossimaEsecuzione: '2026-10-09T08:30:00.000Z' } };

async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
    new Promise((ok) => setTimeout(ok, 3000)),
  ]));
  await writeFile(path.join(CARTELLA_FOTO, nome), await page.screenshot());
}
async function manda(page, lista) {
  await page.evaluate((l) => { const r = window.__talosHarnessUiRuntime; for (const e of l) r.handleRealEvent(e, r.realSessionState.generation); }, lista);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

for (const modo of ['light', 'dark']) {
  test.describe(`Automazioni a due porte · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    test.use({ colorScheme: modo, viewport: { width: 1920, height: 1080 } });

    async function prepara(page, { lingua = 'it', elenco = [VOCE()], posta = POSTA(), sessione = false, giri = GIRI } = {}) {
      const s = { elenco: elenco.map((v) => ({ ...v })), posta: posta.map((v) => ({ ...v })), azioni: [], creazioni: [], approve: [], scritture: [] };
      await page.addInitScript(({ colorMode, uiLanguage }) => {
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } }));
      }, { colorMode: modo, uiLanguage: lingua });
      await page.route('**/api/**', (rotta) => {
        if (rotta.request().method() === 'GET') return rotta.fallback();
        s.scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
        return rotta.abort();
      });
      await page.route((url) => url.pathname === '/api/v1/automations', (route) => {
        if (route.request().method() === 'POST') {
          const corpo = route.request().postDataJSON();
          s.creazioni.push(corpo);
          const nuova = VOCE({ ...corpo, id: 'a2', eseguite: 0, ultimaEsecuzione: null, origine: { tipo: 'interfaccia' } });
          s.elenco.push(nuova);
          return route.fulfill({ contentType: 'application/json', body: busta(nuova) });
        }
        return route.fulfill({ contentType: 'application/json', body: busta({ items: s.elenco }) });
      });
      await page.route((url) => url.pathname === '/api/v1/automations/inbox', (route) => route.fulfill({ contentType: 'application/json', body: busta({ items: s.posta }) }));
      await page.route((url) => /^\/api\/v1\/automations\/[^/]+\/runs$/u.test(url.pathname), (route) => route.fulfill({ contentType: 'application/json',
        body: busta({ items: giri.map((g) => ({ ...g, letta: g.letta || !s.posta.some((p) => p.runId === g.runId) && g.daGuardare })) }) }));
      await page.route((url) => /^\/api\/v1\/automations\/[^/]+\/(esegui|ferma|modifica|elimina|toggle)$/u.test(url.pathname), (route) => {
        const [, id, azione] = /^\/api\/v1\/automations\/([^/]+)\/([a-z]+)$/u.exec(new URL(route.request().url()).pathname);
        s.azioni.push({ id, azione, corpo: route.request().postDataJSON() });
        if (azione === 'elimina') s.elenco = s.elenco.filter((v) => v.id !== id);
        if (azione === 'modifica') s.elenco = s.elenco.map((v) => (v.id === id ? { ...v, ...route.request().postDataJSON() } : v));
        if (azione === 'esegui') s.elenco = s.elenco.map((v) => (v.id === id ? { ...v, giroInCorso: { runId: 'r4', sessionId: 'auto-giro-4' } } : v));
        return route.fulfill({ contentType: 'application/json', body: busta(azione === 'esegui' ? { ok: true, runId: 'r4', sessionId: 'auto-giro-4' } : (s.elenco.find((v) => v.id === id) ?? { ok: true })) });
      });
      await page.route((url) => /^\/api\/v1\/automations\/[^/]+\/runs\/[^/]+\/letta$/u.test(url.pathname), (route) => {
        const [, id, runId] = /^\/api\/v1\/automations\/([^/]+)\/runs\/([^/]+)\/letta$/u.exec(new URL(route.request().url()).pathname);
        s.azioni.push({ id, azione: 'letta', runId });
        s.posta = s.posta.filter((p) => p.runId !== runId);
        return route.fulfill({ contentType: 'application/json', body: busta({ runId, letta: true }) });
      });
      await page.route((url) => /\/sessions\/auto-[^/]+\/events$/u.test(url.pathname), () => { /* aperto e muto */ });
      await page.route((url) => /\/sessions\/[^/]+\/approve$/u.test(url.pathname), (route) => {
        s.approve.push({ path: new URL(route.request().url()).pathname, corpo: route.request().postDataJSON() });
        return route.fulfill({ contentType: 'application/json', body: busta({ ok: true }) });
      });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
      if (sessione) {
        await page.evaluate(({ id, confine }) => {
          const r = window.__talosHarnessUiRuntime;
          r.passaASessione(id, 'workspace', 'Automazioni in chat', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write' });
          r.handleRealEvent(confine, r.realSessionState.generation);
        }, { id: MADRE, confine: CONFINE });
        await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
        // il velo «Apro la cronologia…» copriva la carta nella prima tornata di foto (08/10): si aspetta che sparisca
        await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
      } else {
        await page.locator('[data-vaia="automazioni"]').first().evaluate((el) => el.click());
        await expect(page.locator('#schermoAutomazioni [data-automation-action="new"]')).toBeEnabled();
      }
      return s;
    }
    /* ⛔⛔ Owner, 08/10/2026: la pagina Automazioni ha lo STESSO linguaggio di Libreria e Note — schede o righe, e il dettaglio in
       un pannello che si apre a DESTRA. Le prove guardano la scheda (`.td-card`) e il pannello (`.td-detail`) dell'impianto. */
    const scheda = (page, id = 'a1') => page.locator(`#schermoAutomazioni .td-card[data-item="${id}"]`);
    const pannello = (page) => page.locator('#schermoAutomazioni .td-detail');
    const menu = (page) => page.locator('.ft-actions-menu');
    /* Escape chiude il menu, e lo si VERIFICA: il menu aggancia il tasto al giro dopo l'apertura (apposta, perché il clic che
       lo apre non lo richiuda), quindi un Escape premuto nello stesso istante va perso — si ripete finché il menu sparisce. */
    const chiudiMenu = async (page) => expect(async () => { await page.keyboard.press('Escape'); await expect(menu(page)).toHaveCount(0, { timeout: 250 }); }).toPass({ timeout: 3000 });
    async function apriPannello(page, id = 'a1') {
      await scheda(page, id).locator('.td-card-open').click();
      await expect(pannello(page)).toBeVisible();
    }

    test('AUTO2-STRUTTURA-01 — la pagina È l’impianto di Note e Libreria: stessa barra, schede/righe, filtri, pannello a DESTRA', async ({ page }) => {
      const s = await prepara(page);
      const schermo = page.locator('#schermoAutomazioni');
      for (const pezzo of ['.td-section .td-workspace .td-master', '.td-intro', '.td-toolbar .td-search', '.td-toolbar .td-segment', '.td-filters', '.td-results']) {
        await expect(schermo.locator(pezzo).first(), pezzo).toBeVisible();
      }
      await expect(schermo.locator('[data-c="AutomationRow"]'), 'la vecchia riga che si espandeva non c’è più').toHaveCount(0);
      // le stesse classi della barra di Note: la stessa grammatica, non una somiglianza
      await page.locator('[data-vaia="note"]').first().evaluate((el) => el.click());
      const classiNote = await page.locator('#schermoNote .td-toolbar').evaluate((b) => [...b.children].map((c) => c.className.split(' ').filter((x) => x.startsWith('td-') || x.startsWith('talos-')).join('.')));
      await page.locator('[data-vaia="automazioni"]').first().evaluate((el) => el.click());
      const classiAuto = await schermo.locator('.td-toolbar').evaluate((b) => [...b.children].map((c) => c.className.split(' ').filter((x) => x.startsWith('td-') || x.startsWith('talos-')).join('.')));
      expect(classiAuto).toEqual(classiNote);
      // schede ↔ righe, come Note
      await schermo.locator('.td-segment [data-vista="elenco"]').click();
      await expect(schermo.locator('.td-results .td-list')).toBeVisible();
      await foto(page, `auto2-righe-${modo}.png`);
      await schermo.locator('.td-segment [data-vista="schede"]').click();
      await expect(schermo.locator('.td-results .td-grid')).toBeVisible();
      // il pannello si apre a DESTRA dell'elenco
      await apriPannello(page);
      const lati = await schermo.evaluate((n) => ({ elenco: n.querySelector('.td-master').getBoundingClientRect().left, pannello: n.querySelector('.td-detail').getBoundingClientRect().left }));
      expect(lati.pannello).toBeGreaterThan(lati.elenco + 200);
      /* ⛔ Owner 08/10/2026, scelta sulle foto piene: «Come Note» — le misure della variante di Note (`mockup-td.css`, blocco
         ATLAS F2, ora `:is([data-section="note"], [data-section="automazioni"])`): niente marchio, titolo 22, «Nuova
         automazione» piccola NELLA testata, dettaglio a scheda staccata (bordo e raggio 11), valori in parole non in monospazio */
      const misure = await schermo.evaluate((n) => {
        const cs = (s) => getComputedStyle(n.querySelector(s));
        const nuova = n.querySelector('[data-automation-action="new"]');
        return { marchio: cs('.td-intro-mark').display, titolo: cs('.td-intro h2').fontSize, raggio: cs('.td-detail').borderTopLeftRadius,
          bordo: cs('.td-detail').borderTopWidth, nuovaNellaTesta: nuova?.parentElement?.classList.contains('td-intro'),
          nuovaAlta: Math.round(nuova.getBoundingClientRect().height), valore: cs('.td-detail .talos-kv__v').fontFamily };
      });
      expect(misure).toMatchObject({ marchio: 'none', titolo: '22px', raggio: '11px', bordo: '1px', nuovaNellaTesta: true, nuovaAlta: 29 });
      expect(misure.valore).not.toMatch(/mono/iu);
      // finestra stretta col dettaglio aperto: l'elenco (e la testata) si nascondono, «Nuova automazione» passa nella barra in alto
      await page.setViewportSize({ width: 900, height: 900 });
      await expect(schermo.locator('.talos-topbar [data-automation-action="new"]')).toBeVisible();
      await page.setViewportSize({ width: 1920, height: 1080 });
      await expect(schermo.locator('.td-intro > [data-automation-action="new"]')).toBeVisible();
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-PAGINA-01 — la scheda: stato, non letti, orario in parole; il pannello: istruzioni, dove e come, Coordinazione, storico col perché', async ({ page }) => {
      const s = await prepara(page);
      await expect(scheda(page)).toContainText('Giorni feriali alle 09:00');
      await expect(scheda(page)).toContainText('Leggi i commit di ieri');
      await expect(scheda(page).locator('[data-auto-non-letti]')).toContainText('1');
      await foto(page, `auto2-schede-${modo}.png`);
      await apriPannello(page);
      const p = pannello(page);
      await expect(p.locator('h2')).toHaveText('Rapporto mattutino');
      await expect(p).toContainText('Se non è cambiato niente, non dirmi niente.');
      await expect(p).toContainText('C:\\progetti\\talos');
      await expect(p).toContainText('Scrive nel progetto');
      const storico = p.locator('[data-auto-storico]');
      await expect(storico.locator('[data-auto-giro]')).toHaveCount(3);
      await expect(storico.locator('[data-auto-giro="r2"]')).toContainText('Saltato: TALOS era chiuso a quell\'ora');
      // di un giro saltato si dice l'ora del giro mancato (le 09:00), non quella in cui il salto è stato scritto (le 11:12)
      const oraPrevista = await page.evaluate(() => new Date('2026-10-07T07:00:00.000Z').toLocaleString('it-IT', { hour: '2-digit', minute: '2-digit' }));
      await expect(storico.locator('[data-auto-giro="r2"] .talos-muted').first()).toContainText(oraPrevista);
      await expect(storico.locator('[data-auto-giro="r1"]')).toContainText('Niente da segnalare');
      await expect(storico.locator('[data-auto-giro="r2"] [data-auto-giro-apri]')).toHaveCount(0);
      // la Coordinazione nel pannello, con l'interruttore al bordo destro della sua riga
      const coord = await p.evaluate((n) => {
        const c = n.querySelector('[data-auto-coordinazione]').getBoundingClientRect(), r = n.querySelector('[data-auto-coordinazione-riga]').getBoundingClientRect();
        return r.right - c.right;
      });
      expect(coord).toBeLessThan(4);
      await foto(page, `auto2-pannello-${modo}.png`);
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-MENU-01 — «⋯», «Tutte le azioni» e tasto destro aprono le STESSE voci; Esegui ora scrive solo `esegui`; Elimina chiede prima', async ({ page }) => {
      const s = await prepara(page);
      await scheda(page).locator('[data-auto-menu]').click();
      await expect(menu(page)).toBeVisible();
      const voci = await menu(page).locator('[role="menuitem"]').evaluateAll((b) => b.map((x) => x.dataset.azione));
      expect(voci).toEqual(['esegui', 'modifica', 'pausa', 'chat', 'elimina']);
      await foto(page, `auto2-menu-${modo}.png`);
      await chiudiMenu(page);
      await scheda(page).click({ button: 'right' });
      await expect(menu(page)).toBeVisible();
      expect(await menu(page).locator('[role="menuitem"]').evaluateAll((b) => b.map((x) => x.dataset.azione))).toEqual(voci);
      await chiudiMenu(page);
      await apriPannello(page);
      await pannello(page).locator('[data-auto-tutte-le-azioni]').click();
      expect(await menu(page).locator('[role="menuitem"]').evaluateAll((b) => b.map((x) => x.dataset.azione))).toEqual(voci);
      await chiudiMenu(page);
      // l'azione principale del pannello
      await pannello(page).locator('[data-auto-azione-principale]').click();
      await expect.poll(() => s.azioni.map((a) => a.azione)).toEqual(['esegui']);
      expect(s.azioni[0]).toEqual({ id: 'a1', azione: 'esegui', corpo: {} });
      // durante il giro l'azione principale diventa «Ferma il giro», e così la prima voce del menu
      await expect(pannello(page).locator('[data-auto-azione-principale]')).toHaveText('Ferma il giro');
      await scheda(page).locator('[data-auto-menu]').click();
      await expect(menu(page).locator('[role="menuitem"]').first()).toHaveAttribute('data-azione', 'ferma');
      await chiudiMenu(page);
      // Elimina: prima la conferma, e senza conferma niente parte
      await scheda(page).locator('[data-auto-menu]').click();
      await menu(page).locator('[data-azione="elimina"]').click();
      const modale = page.getByRole('dialog').filter({ hasText: 'Eliminare «Rapporto mattutino»?' });
      await expect(modale).toBeVisible();
      await foto(page, `auto2-elimina-conferma-${modo}.png`);
      expect(s.azioni.map((a) => a.azione)).toEqual(['esegui']);
      await modale.getByRole('button', { name: 'Elimina', exact: true }).click();
      await expect.poll(() => s.azioni.map((a) => a.azione)).toEqual(['esegui', 'elimina']);
      await expect(scheda(page)).toHaveCount(0);
      expect(s.scritture).toEqual([]);
    });

    /* Nota 3 del bugfixer (08/10 notte): `creaRigaGiro` torna a tre pulsanti se chi la chiama passa `onProposta` senza `onMenuGiro`.
       Il componente è fissato da AUTO2-PROPOSTA (unit); qui si fissa il CHIAMANTE vero (app.js → pagina → riga): passa tutti e due. */
    test('AUTO2-PROPOSTA-PAGINA — nel pannello, una proposta in attesa: in riga solo Approva · Scarta, «Apri il giro» nel «⋯»', async ({ page }) => {
      const proposta = { prima: ISTRUZIONI, dopo: 'Come prima, ma anche le PR aperte.', minacce: [], stato: 'in-attesa', alle: '2026-10-08T07:02:10.000Z' };
      await prepara(page, { giri: [{ ...GIRI[0], proposta }, GIRI[1]] });
      await apriPannello(page);
      const riga = pannello(page).locator('[data-auto-giro="r3"]');
      await expect(riga.locator('[data-auto-proposta-decidi]')).toHaveCount(2);
      const inRiga = await riga.locator('.talos-automation__giro-azioni button').evaluateAll((bs) => bs.map((b) => b.dataset.autoPropostaDecidi ?? (b.dataset.autoGiroMenu !== undefined ? 'menu' : b.dataset.autoGiroApri !== undefined ? 'apri' : '?')));
      expect(inRiga).toEqual(['approva', 'scarta', 'menu']);
      await riga.locator('[data-auto-giro-menu]').click();
      await expect(menu(page)).toContainText('Apri il giro');
      await chiudiMenu(page);
    });

    test('AUTO2-POSTA-01 —«Da guardare» è un filtro col contatore; nel pannello «Segna come letto» scrive solo quello; la campanella conta il giro', async ({ page }) => {
      const s = await prepara(page, { elenco: [VOCE(), VOCE({ id: 'a3', nome: 'Pulizia settimanale', pianificazione: { tipo: 'settimanale', ora: '08:00', giorno: 1 } })] });
      await expect(page.locator('#notificationsBadge')).toHaveText('1');
      const filtro = page.locator('#schermoAutomazioni .td-filter[data-filtro="da-guardare"]');
      await expect(filtro.locator('small')).toHaveText('1');
      await filtro.click();
      await expect(page.locator('#schermoAutomazioni .td-card')).toHaveCount(1);
      await expect(scheda(page, 'a1')).toBeVisible();
      await foto(page, `auto2-da-guardare-${modo}.png`);
      await apriPannello(page);
      await pannello(page).locator('[data-auto-giro="r3"] [data-auto-giro-letto]').click();
      await expect.poll(() => s.azioni).toEqual([{ id: 'a1', azione: 'letta', runId: 'r3' }]);
      await expect(filtro.locator('small')).toHaveText('0');
      await expect(page.locator('#notificationsBadge')).toBeHidden();
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-FOGLIO-01 — Modifica dal pannello: il foglio precompilato, e il salvataggio manda la modifica senza il fuso', async ({ page }) => {
      const s = await prepara(page);
      await apriPannello(page);
      await pannello(page).locator('[data-auto-modifica]').click();
      const foglio = page.locator('#sheetBody [data-c="AutomationSheet"]');
      await expect(foglio.locator('[data-auto-foglio-nome]')).toHaveValue('Rapporto mattutino');
      await expect(foglio.locator('[data-auto-foglio-istruzioni]')).toHaveValue(ISTRUZIONI);
      await expect(foglio).toContainText('Usa glm-5.3-flash.');
      // le istruzioni nel carattere del testo, non nel monospazio di serie dei textarea
      expect(await foglio.locator('[data-auto-foglio-istruzioni]').evaluate((n) => getComputedStyle(n).fontFamily)).not.toMatch(/monospace/u);
      await foto(page, `auto2-foglio-modifica-${modo}.png`);
      await foglio.locator('[data-auto-foglio-nome]').fill('Rapporto delle 10');
      await foglio.getByRole('button', { name: 'Salva modifiche' }).click();
      await expect.poll(() => s.azioni.map((a) => a.azione)).toEqual(['modifica']);
      const corpo = s.azioni[0].corpo;
      expect(corpo).toMatchObject({ nome: 'Rapporto delle 10', istruzioni: ISTRUZIONI, cartella: 'C:\\progetti\\talos', permessi: 'Workspace write',
        coordinazione: false, ripeti: null, pianificazione: { tipo: 'feriali', ora: '09:00' } });
      expect(Object.hasOwn(corpo, 'fusoOrario')).toBe(false);
      await expect(page.locator('#sheetDialog')).toBeHidden();
      await expect(scheda(page)).toContainText('Rapporto delle 10');
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-VUOTO-01 — senza automazioni lo stato vuoto di casa, con «Nuova automazione» e l’invito a chiederla in chat', async ({ page }) => {
      await prepara(page, { elenco: [], posta: [] });
      const vuoto = page.locator('#schermoAutomazioni .td-empty');
      await expect(vuoto).toContainText('Ancora nessuna automazione');
      await expect(vuoto).toContainText('chiedila in qualunque chat');
      await vuoto.getByRole('button', { name: 'Nuova automazione' }).click();
      await expect(page.locator('#sheetBody [data-auto-foglio-nome]')).toBeVisible();
      await page.locator('#closeSheet').click(); // la «×» del foglio di casa
      await expect(page.locator('#sheetDialog')).toBeHidden();
      await foto(page, `auto2-vuoto-${modo}.png`);
      // affiancata: lo stato vuoto di Note, la stessa grammatica (owner: «stesso linguaggio visivo»)
      await page.locator('[data-vaia="note"]').first().evaluate((el) => el.click());
      await expect(page.locator('#schermoNote .td-empty, #schermoNote .td-results').first()).toBeVisible();
      await foto(page, `auto2-affiancata-note-${modo}.png`);
    });

    test('AUTO2-CARTA-01 — il modello crea: la bozza in parole, Approva manda un sì; l’esito lo scrive il server', async ({ page }) => {
      const s = await prepara(page, { sessione: true, posta: [] });
      // un percorso lungo SENZA SPAZI, della stessa forma di quello della prova dal vivo (08/10) che usciva dalla carta.
      // ⛔ Neutro: il cancello PERCORSO dell'export pubblico ferma `C:\Users\<owner>` (08/10, il primo era un percorso vero).
      const LUNGO = 'C:\\Users\\persona\\AppData\\Local\\Temp\\talos\\C--Users-persona-Desktop-progetti-esempio-harness-desktop\\0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9\\scratchpad\\prova-dal-vivo\\lavoro';
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'auto-req-1', azione: { bozza: { ...BOZZA, cartella: LUNGO }, tipo: 'automation_create', toolCallId: 'call-a1' }, _sequenza: 2 }]);
      const carta = page.locator('#conversation [data-c="ApprovalCard"][data-carta-automazione="automation_create"]');
      await expect(carta).toBeVisible();
      await expect(carta).toContainText('Il modello vuole creare questa automazione.');
      await expect(carta).toContainText('Giorni feriali alle 09:00');
      await expect(carta).toContainText('glm-5.3-flash');
      await expect(carta).not.toContainText('z-ai/');
      await expect(carta).not.toContainText('Workspace write');
      await expect(carta.getByRole('button', { name: 'Approva' })).toBeVisible();
      await expect(carta.getByRole('button', { name: 'Modifica' })).toBeVisible();
      await expect(carta.getByRole('button', { name: 'Annulla' })).toBeVisible();
      await expect(carta).not.toContainText('Per questa sessione');
      await expect(carta).toContainText('Finché non la spegni');
      // un percorso lungo va a capo DENTRO la carta e l'etichetta resta (dal vivo, 08/10: usciva dal bordo e «Cartella» spariva)
      const misure = await carta.evaluate((c) => {
        const riga = [...c.querySelectorAll('.talos-kv')].find((r) => r.textContent.includes('Cartella'));
        const r = c.getBoundingClientRect(), v = riga.querySelector('.talos-kv__v').getBoundingClientRect(), k = riga.querySelector('.talos-kv__k').getBoundingClientRect();
        return { dentro: v.right <= r.right + 0.5, etichetta: k.width };
      });
      expect(misure.dentro).toBe(true);
      expect(misure.etichetta).toBeGreaterThan(20);
      // le istruzioni nella carta sono un dato, non la risposta della chat: non prendono la misura del corpo dei messaggi
      expect(await carta.locator('.talos-automation__istruzioni-testo').evaluate((n) => getComputedStyle(n).fontSize)).toBe('13.5px');
      await carta.scrollIntoViewIfNeeded();
      await foto(page, `auto2-carta-crea-${modo}.png`);
      await carta.getByRole('button', { name: 'Approva' }).click();
      await expect.poll(() => s.approve.length).toBe(1);
      expect(s.approve[0]).toEqual({ path: `/api/v1/sessions/${MADRE}/approve`, corpo: { requestId: 'auto-req-1', approvato: true } });
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'auto-req-1', approvato: true, _sequenza: 3 }]);
      await expect(carta.locator('.talos-approval__esito')).toContainText('Approvato');
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-CARTA-02 — Modifica: il foglio con la bozza del modello; salvato, la carta risponde «modificata da te» col suo id', async ({ page }) => {
      const s = await prepara(page, { sessione: true, posta: [] });
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'auto-req-2', azione: { bozza: BOZZA, tipo: 'automation_create', toolCallId: 'call-a2' }, _sequenza: 2 }]);
      const carta = page.locator('#conversation [data-carta-automazione="automation_create"]');
      await carta.getByRole('button', { name: 'Modifica' }).click();
      const foglio = page.locator('#sheetBody [data-c="AutomationSheet"]');
      await expect(foglio.locator('[data-auto-foglio-nome]')).toHaveValue('Rapporto mattutino');
      await expect(foglio.locator('[data-auto-foglio-cartella]')).toHaveValue('C:\\progetti\\talos');
      // il `<select>` è ridisegnato dal tendina di casa (`calm-controls`): si sceglie come la persona, dal menu
      await foglio.locator('[data-auto-foglio-tipo] + .calm-control [role="combobox"]').click();
      await page.getByRole('option', { name: 'Ogni giorno', exact: true }).click();
      await expect(foglio.locator('[data-auto-foglio-tipo]')).toHaveValue('giornaliera');
      await foglio.getByRole('button', { name: 'Crea automazione' }).click();
      await expect.poll(() => s.approve.length).toBe(1);
      expect(s.creazioni).toHaveLength(1);
      expect(s.creazioni[0]).toMatchObject({ nome: 'Rapporto mattutino', modello: 'z-ai/glm-5.3-flash', pianificazione: { tipo: 'giornaliera', ora: '09:00' } });
      expect(s.approve[0].corpo).toEqual({ requestId: 'auto-req-2', approvato: false, automazioneModificata: 'a2' });
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'auto-req-2', approvato: false, motivo: 'modificata-dalla-persona', _sequenza: 3 }]);
      await expect(carta.locator('.talos-approval__esito')).toContainText('Modificata e salvata da te');
      await expect(carta.locator('.talos-approval__esito')).toHaveClass(/talos-approval__esito--si/u);
      await expect(page.locator('#sheetDialog')).toBeHidden(); // il foglio si chiude al salvataggio, non resta sopra la carta
      await foto(page, `auto2-carta-modificata-${modo}.png`);
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-CARTA-03 — Annulla dice «Annullata»; la carta di una modifica dice prima → dopo; riprendi ed esegui senza «Modifica»', async ({ page }) => {
      const s = await prepara(page, { sessione: true, posta: [] });
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'auto-req-3', _sequenza: 2,
        azione: { automazione: { id: 'a1', nome: 'Rapporto mattutino', fusoOrario: 'Europe/Rome' }, prima: DIFF.prima, dopo: DIFF.dopo, tipo: 'automation_update', toolCallId: 'call-a3' } }]);
      const modifica = page.locator('#conversation [data-carta-automazione="automation_update"]');
      await expect(modifica).toContainText('Il modello vuole cambiare «Rapporto mattutino».');
      await expect(modifica).toContainText('Giorni feriali alle 09:00 → Giorni feriali alle 10:30');
      await expect(modifica).toContainText('Come prima, ma anche le PR aperte.');
      await modifica.scrollIntoViewIfNeeded();
      await foto(page, `auto2-carta-modifica-${modo}.png`);
      await modifica.getByRole('button', { name: 'Annulla' }).click();
      await expect.poll(() => s.approve.length).toBe(1);
      expect(s.approve[0].corpo).toEqual({ requestId: 'auto-req-3', approvato: false });
      await manda(page, [{ type: 'ApprovalResolved', requestId: 'auto-req-3', approvato: false, _sequenza: 3 }]);
      await expect(modifica.locator('.talos-approval__esito')).toContainText('Annullata');
      await manda(page, [{ type: 'ApprovalRequested', requestId: 'auto-req-4', _sequenza: 4,
        azione: { automazione: { id: 'a1', nome: 'Rapporto mattutino', cartella: 'C:\\progetti\\talos', modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', coordinazione: false },
          contesto: 'Guarda anche la PR #51.', tipo: 'automation_run', toolCallId: 'call-a4' } }]);
      const esegui = page.locator('#conversation [data-carta-automazione="automation_run"]');
      await expect(esegui).toContainText('Il modello vuole far partire «Rapporto mattutino» adesso, in sottofondo.');
      await expect(esegui).toContainText('Guarda anche la PR #51.');
      await expect(esegui.getByRole('button', { name: 'Modifica' })).toHaveCount(0);
      expect(s.scritture).toEqual([]);
    });

    test('AUTO2-EN — in inglese (la sorgente): scheda, pannello e menu', async ({ page }) => {
      await prepara(page, { lingua: 'en' });
      await expect(scheda(page)).toContainText('Weekdays at 09:00');
      await expect(page.locator('#schermoAutomazioni .td-filter[data-filtro="da-guardare"]')).toContainText('To review');
      await scheda(page).locator('[data-auto-menu]').click();
      await expect(menu(page)).toContainText('Run now');
      await expect(menu(page)).toContainText('Open the chat it came from');
      await chiudiMenu(page);
      await apriPannello(page);
      await expect(pannello(page).locator('[data-auto-giro="r2"]')).toContainText('Skipped: TALOS was closed at that time');
      await expect(pannello(page)).toContainText('Where and how');
      await foto(page, `auto2-pannello-en-${modo}.png`);
    });
  });
}
