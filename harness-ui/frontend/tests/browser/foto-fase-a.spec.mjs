import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { preparaCartellaFoto } from '../aiuto/cartella-foto.mjs';

/*
 * LE FOTO DELLA FASE A (corsia frontend) — ogni superficie toccata, nei DUE temi, alle DUE misure
 * del desktop (1024×800 e 1440×900), con `locale: 'it-IT'`.
 *
 * ⛔ Non è un cancello: è il materiale con cui si guarda. Le foto NON entrano nel repository
 *   (BC-12): `preparaCartellaFoto` le mette in `frontend/artifacts/`, che `.gitignore` ignora.
 * ⛔ Qui si fotografa lo stato VERO della app (sessione viva, giro in corso, toast acceso dalla sua
 *   strada vera), non una scena costruita per essere bella.
 */

const MISURE = [[1024, 800], [1440, 900]];
const TEMI = ['dark', 'light'];

test.use({ locale: 'it-IT' });

async function apri(page, { larghezza, altezza, tema }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/fotoA-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
}

async function scatta(page, nome) {
  const cartella = await preparaCartellaFoto('fase-a-frontend');
  await writeFile(path.join(cartella, `${nome}.png`), await page.screenshot());
}

for (const [larghezza, altezza] of MISURE) {
  for (const tema of TEMI) {
    const suffisso = `${larghezza}x${altezza}-${tema}`;

    test(`FOTO BC-77 — il toast sopra il piede della chat (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('fotoA-uno', 'workspace', 'Fase A', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
        const g = r.realSessionState.generation;
        r.handleRealEvent({ type: 'RunStarted', _sequenza: 10, input: { consegna: 'Aggiorna il ledger con i numeri veri' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
        r.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1' }, g);
        r.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Sto leggendo i file del progetto e annoto le misure. '.repeat(6) }, g);
      });
      await expect(page.locator('#schermoChat .talos-chat-foot')).toBeVisible();
      await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });
      await page.locator('#regioneToast .talos-toast:not([data-demo])').first().waitFor({ state: 'visible', timeout: 10_000 });
      await page.waitForTimeout(200);
      await scatta(page, `bc77-toast-${suffisso}`);
    });

    test(`FOTO BC-77 — tre toast col terminale aperto e il composer pieno (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(() => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('fotoA-pila', 'workspace', 'Fase A', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
        const g = r.realSessionState.generation;
        r.handleRealEvent({ type: 'RunStarted', _sequenza: 10, input: { consegna: 'Scrivi un file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
        r.handleRealEvent({ type: 'StateDelta', _sequenza: 11, delta: [{ op: 'add', path: '/file/src/uno.mjs', value: 'a\nb\n' }] }, g);
        const campo = document.querySelector('#composerInput');
        if (campo) { campo.value = 'riga\n'.repeat(40); campo.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => document.querySelector('#pillTerminale')?.click());
      await page.waitForTimeout(500);
      await page.evaluate(() => { for (let i = 0; i < 3; i += 1) document.querySelector('#copyAllDiffs')?.click(); });
      await page.waitForTimeout(400);
      await scatta(page, `bc77-pila-${suffisso}`);
    });

    test(`FOTO BC-71 — la Revisione con due file scritti (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(async () => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('fotoA-due', 'workspace', 'Fase A', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
        const g = r.realSessionState.generation;
        let seq = 5000;
        r.handleRealEvent({ type: 'RunStarted', _sequenza: seq += 1, input: { consegna: 'Scrivi due file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
        r.handleRealEvent({ type: 'StateDelta', _sequenza: seq += 1, delta: [{ op: 'replace', path: '/file/src/session-registry.mjs', prima: 'riga uno\nriga vecchia\n', value: 'riga uno\nriga due\nriga tre\n' }] }, g);
        r.handleRealEvent({ type: 'StateDelta', _sequenza: seq += 1, delta: [{ op: 'add', path: '/file/tests/session-registry.test.mjs', value: 'import test from «node:test»;\ntest(«vive», () => {});\n' }] }, g);
        r.executeCommand('review');
        await new Promise((x) => requestAnimationFrame(x));
      });
      await page.waitForTimeout(250);
      await scatta(page, `bc71-revisione-${suffisso}`);
    });

    test(`FOTO BC-71 — il Browser con una lettura vera (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(async () => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('fotoA-tre', 'workspace', 'Fase A', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
        const g = r.realSessionState.generation;
        let seq = 6000;
        r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'f1', toolCallName: 'naviga', _sequenza: seq += 1 }, g);
        r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 'f1', delta: JSON.stringify({ url: 'https://esempio.test/guida' }), _sequenza: seq += 1 }, g);
        r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'f1', content: 'Guida introduttiva\n\nQuesto è il testo che l’agente ha ricevuto dalla pagina, riga per riga.', _sequenza: seq += 1 }, g);
        r.executeCommand('browser');
        await new Promise((x) => requestAnimationFrame(x));
      });
      await page.waitForTimeout(250);
      await scatta(page, `bc71-browser-${suffisso}`);
    });

    test(`FOTO BC-80 — il riassunto in fondo alla riga delle linguette (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(async () => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('fotoA-bc80', 'workspace', 'Fase A', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
        const g = r.realSessionState.generation;
        let seq = 9000;
        r.handleRealEvent({ type: 'RunStarted', _sequenza: seq += 1, input: { consegna: 'Scrivi tre file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
        for (const [percorso, prima, dopo] of [
          ['src/session-registry.mjs', 'riga uno\nriga vecchia\n', 'riga uno\nriga due\nriga tre\n'],
          ['tests/session-registry.test.mjs', null, 'import test from «node:test»;\ntest(«vive», () => {});\n'],
          ['src/http-app.mjs', 'a\nb\n', 'a\nb\nc\n'],
        ]) r.handleRealEvent({ type: 'StateDelta', _sequenza: seq += 1, delta: [{ op: prima === null ? 'add' : 'replace', path: `/file/${percorso}`, value: dopo, ...(prima === null ? {} : { prima }) }] }, g);
        r.executeCommand('review');
        await new Promise((x) => requestAnimationFrame(x));
      });
      await page.waitForTimeout(250);
      await scatta(page, `bc80-sommario-${suffisso}`);
    });

    test(`FOTO BC-78.2 — la barra laterale col taglio che dice «continua» (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.locator('#testataGruppoStrumenti').click();
      await page.waitForTimeout(300);
      await scatta(page, `bc78-2-barra-${suffisso}`);
    });

    test(`FOTO BC-78.3 — il dettaglio di Capability (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(() => { document.querySelector('[data-vaia="capability"]')?.click(); });
      await page.waitForTimeout(350);
      await page.evaluate(() => {
        let p = [...document.querySelectorAll('.talos-detail')].find((n) => n.offsetParent !== null)?.parentElement;
        while (p && p !== document.body) { if (p.scrollHeight > p.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(p).overflowY)) { p.scrollTop = p.scrollHeight; return; } p = p.parentElement; }
      });
      await page.waitForTimeout(200);
      await scatta(page, `bc78-3-capability-${suffisso}`);
    });

    test(`FOTO BC-68 — le schede del Browser e il menu contestuale condiviso (${suffisso})`, async ({ page }) => {
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(async () => {
        const r = window.__talosHarnessUiRuntime;
        r.passaASessione('fotoA-bc68', 'workspace', 'Fase A', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
        const g = r.realSessionState.generation;
        let seq = 7000;
        const titoli = ['Guida introduttiva', 'Registro dei processi', 'Note di rilascio'];
        titoli.forEach((titolo, i) => {
          const id = `f${i}`;
          r.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'naviga', _sequenza: seq += 1 }, g);
          r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ url: `https://esempio.test/${i}` }), _sequenza: seq += 1 }, g);
          r.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: `${titolo}\n\nIl testo della pagina.`, _sequenza: seq += 1 }, g);
        });
        r.executeCommand('browser');
        await new Promise((x) => requestAnimationFrame(x));
      });
      await page.waitForTimeout(250);
      await scatta(page, `bc68-browser-schede-${suffisso}`);
      await page.evaluate(async () => {
        const tab = document.querySelector('#browserSchede [role="tab"]');
        const r = tab.getBoundingClientRect();
        tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: Math.round(r.left + 20), clientY: Math.round(r.bottom) }));
        await new Promise((x) => requestAnimationFrame(x));
      });
      await page.waitForTimeout(200);
      await scatta(page, `bc68-menu-scheda-${suffisso}`);
    });

    test(`FOTO BC-70 — il pannello delle notifiche con due voci (${suffisso})`, async ({ page }) => {
      const base = { taskId: 'workspace', modello: 'qwen/qwen3.8-flash', interrotta: false, usage: null };
      const elenco = [
        { ...base, sessionId: 'f-aperta', nome: 'Aperta da sola', conclusa: false, inAttesaApprovazione: false, avviataAlle: '2026-09-17T12:00:00.000Z' },
        { ...base, sessionId: 'f-approvazione', nome: 'Rifattorizza il registro', conclusa: false, inAttesaApprovazione: true, avviataAlle: '2026-09-17T08:00:00.000Z' },
        { ...base, sessionId: 'f-conclusa', nome: 'Prove del terminale', conclusa: true, inAttesaApprovazione: false, avviataAlle: '2026-09-17T07:00:00.000Z' },
      ];
      await page.route('**/api/v1/sessions*', async (route) => {
        if (new URL(route.request().url()).pathname !== '/api/v1/sessions') return route.fallback();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: elenco }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      });
      await page.route('**/api/v1/sessions/*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
      await apri(page, { larghezza, altezza, tema });
      await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
      elenco[2].conclusa = true;
      elenco.push({ ...base, sessionId: 'f-interrotta', nome: 'Indice dei documenti', conclusa: false, interrotta: true, inAttesaApprovazione: false, avviataAlle: '2026-09-17T09:00:00.000Z' });
      await page.evaluate(() => window.__talosHarnessUiRuntime.aggiornaElencoSessioniReali());
      await page.locator('#notificationsBtn').click();
      await expect(page.locator('#pannelloNotifiche')).toBeVisible();
      await page.waitForTimeout(200);
      await scatta(page, `bc70-notifiche-${suffisso}`);
    });
  }
}
