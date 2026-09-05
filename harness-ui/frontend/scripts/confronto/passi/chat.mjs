/*
 * Gruppo 1 · Chat — gli stessi gesti su TALOS e su Hermes Desktop.
 * Nessun invio al modello: si misura la UI (gesti, tastiera, struttura, pixel),
 * i giri a pagamento sono una campagna a parte, dichiarata prima.
 *
 * Selettori di Hermes letti dal vivo il 05/09/2026 (hermes-esplora2.mjs):
 * composer = `div[role="textbox"]` («Message»), righe sessione = `button[data-slot="row-button"]`,
 * messaggio utente = `.group/user-message`, azioni composer = «Add context», «Model · …»,
 * «Voice dictation», «Read replies aloud», «Wake word», «Start voice conversation».
 */
import { attesa, tabFinoA } from '../guida.mjs';

const TESTO_LUNGO = 'Prima riga del messaggio di prova.\nSeconda riga, per vedere se il composer cresce.\nTerza riga: non invio niente.';

const T = {
  sessione: '[data-real-session-id]',
  composer: '#composerInput',
  invia: '#schermoChat .send-btn, #schermoChat [data-c="SendButton"]',
  azioniComposer: '#schermoChat .talos-composer__bar button, #schermoChat .talos-composer__bar .talos-badge',
  messaggioTalos: '#schermoChat .talos-message:not(.talos-message--user)',
  azioniMessaggio: '.talos-message__actions button',
  attivita: '#schermoChat .talos-activity [aria-expanded], #schermoChat .talos-activity > button',
  statusbar: '#schermoChat .talos-statusbar',
};
const H = {
  sessione: 'button[data-slot="row-button"]',
  composer: 'div[role="textbox"]',
  azioniComposer: 'form button, [data-slot="composer"] button',
  messaggioUtente: '[class*="user-message"]',
  attivita: 'button:has-text("Explored"), button:has-text("ran")',
};

const conta = (pagina, sel) => pagina.locator(sel).filter({ visible: true }).count();
const nomi = (pagina, sel) => pagina.locator(sel).filter({ visible: true }).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean));

export const PASSI = [
  {
    blocco: 'SessionItem', nome: 'apri la prima sessione dalla sidebar (1 gesto)',
    talos: async (p) => { const t0 = performance.now(); await p.locator(T.sessione).first().click(); await p.waitForSelector('#schermoChat .talos-turn, #conversation .talos-message', { timeout: 8000 }).catch(() => {}); return { gesti: 1, msFilo: Math.round(performance.now() - t0), turni: await conta(p, '#schermoChat [data-c="Turn"], #schermoChat .talos-turn') }; },
    hermes: async (p) => { const t0 = performance.now(); await p.locator(H.sessione).first().evaluate((el) => el.click()); await p.waitForSelector(H.messaggioUtente, { timeout: 8000 }).catch(() => {}); return { gesti: 1, msFilo: Math.round(performance.now() - t0), turni: await conta(p, H.messaggioUtente) }; },
    giudizio: (t, h) => ({ esito: t.turni > 0 && t.msFilo <= Math.max(h.msFilo * 1.5, 1500) ? 'PASS' : 'FAIL', nota: `filo in ${t.msFilo} ms (Hermes ${h.msFilo}), turni ${t.turni} vs ${h.turni}` }),
  },
  {
    blocco: 'Composer', nome: 'Tab dalla pagina fino al composer (quanti tasti)',
    talos: async (p) => { await p.evaluate(() => document.activeElement?.blur?.()); await p.locator('body').click({ position: { x: 700, y: 300 } }); const tab = await tabFinoA(p, () => document.activeElement?.id === 'composerInput'); return { tabAlComposer: tab }; },
    hermes: async (p) => { await p.evaluate(() => document.activeElement?.blur?.()); await p.mouse.click(900, 400); const tab = await tabFinoA(p, () => document.activeElement?.getAttribute('role') === 'textbox'); return { tabAlComposer: tab }; },
    giudizio: (t, h) => ({ esito: t.tabAlComposer != null && (h.tabAlComposer == null || t.tabAlComposer <= h.tabAlComposer) ? 'PASS' : 'FAIL', nota: `Tab: TALOS ${t.tabAlComposer ?? 'mai'} · Hermes ${h.tabAlComposer ?? 'mai'}` }),
  },
  {
    blocco: 'Composer', nome: 'scrivi tre righe: il composer cresce, il pulsante invia resta visibile',
    talos: async (p) => { const c = p.locator(T.composer); await c.click(); const prima = (await c.boundingBox()).height; await c.fill(TESTO_LUNGO); await attesa(300); const dopo = (await c.boundingBox()).height; const invia = await p.locator(T.invia).first().isVisible(); return { altezzaPrima: Math.round(prima), altezzaDopo: Math.round(dopo), inviaVisibile: invia }; },
    hermes: async (p) => { const c = p.locator(H.composer).first(); await c.click(); const prima = (await c.boundingBox()).height; await p.keyboard.type(TESTO_LUNGO.replace(/\n/g, ' ')); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('riga nuova'); await attesa(300); const dopo = (await c.boundingBox()).height; const invia = await p.locator('button[aria-label*="Send" i], button[type="submit"]').first().isVisible().catch(() => false); return { altezzaPrima: Math.round(prima), altezzaDopo: Math.round(dopo), inviaVisibile: invia }; },
    giudizio: (t, h) => ({ esito: t.altezzaDopo > t.altezzaPrima && t.inviaVisibile ? 'PASS' : 'FAIL', nota: `TALOS ${t.altezzaPrima}→${t.altezzaDopo}px invia:${t.inviaVisibile} · Hermes ${h.altezzaPrima}→${h.altezzaDopo}px invia:${h.inviaVisibile}` }),
  },
  {
    blocco: 'Composer', nome: 'le azioni del composer: quante, con che nome (tutte con un nome accessibile)',
    talos: async (p) => { await p.locator(T.composer).fill(''); const n = await nomi(p, T.azioniComposer); return { azioni: n.length, nomi: n, senzaNome: await p.locator(T.azioniComposer).filter({ visible: true }).evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') || e.innerText || '').trim()).length) }; },
    hermes: async (p) => { await p.keyboard.press('Control+A'); await p.keyboard.press('Delete'); const n = await nomi(p, H.azioniComposer); return { azioni: n.length, nomi: n, senzaNome: await p.locator(H.azioniComposer).filter({ visible: true }).evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') || e.innerText || '').trim()).length) }; },
    giudizio: (t, h) => ({ esito: t.senzaNome === 0 ? 'PASS' : 'FAIL', nota: `TALOS ${t.azioni} azioni (${t.senzaNome} senza nome) · Hermes ${h.azioni} (${h.senzaNome} senza nome)` }),
  },
  {
    blocco: 'MessageActions', nome: 'passa col mouse sull\'ultimo messaggio: quante azioni compaiono',
    talos: async (p) => { const m = p.locator(T.messaggioTalos).last(); if (!(await m.count())) return { azioni: 0, nomi: [], nota: 'nessun messaggio di TALOS nella sessione' }; await m.hover(); await attesa(300); const n = await m.locator(T.azioniMessaggio).evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean)); const visibili = await m.locator(T.azioniMessaggio).filter({ visible: true }).count(); return { azioni: n.length, visibiliAlPassaggio: visibili, nomi: n }; },
    hermes: async (p) => { const m = p.locator('[class*="assistant"], [class*="user-message"]').last(); await m.hover(); await attesa(400); const n = await nomi(p, '[class*="assistant"] button, [class*="user-message"] button'); return { azioni: n.length, nomi: n }; },
    giudizio: (t, h) => ({ esito: t.azioni >= 1 ? 'PASS' : 'FAIL', nota: `TALOS ${t.azioni} (${t.nomi.join(', ')}) · Hermes ${h.azioni} (${h.nomi.slice(0, 6).join(', ')})` }),
  },
  {
    blocco: 'ActivityBundle', nome: 'apri il riepilogo delle attività del giro (1 gesto) e leggi cosa mostra',
    talos: async (p) => { const a = p.locator(T.attivita).filter({ visible: true }).first(); if (!(await a.count())) return { presente: false }; const prima = await p.evaluate(() => document.body.innerText.length); await a.click(); await attesa(400); const dopo = await p.evaluate(() => document.body.innerText.length); return { presente: true, testoPrima: prima, testoDopo: dopo, righeAttrezzo: await conta(p, '#schermoChat [data-c="ToolRow"], #schermoChat .talos-tool-row') }; },
    hermes: async (p) => { const a = p.locator(H.attivita).first(); if (!(await a.count())) return { presente: false }; const prima = await p.evaluate(() => document.body.innerText.length); await a.click(); await attesa(400); const dopo = await p.evaluate(() => document.body.innerText.length); return { presente: true, testoPrima: prima, testoDopo: dopo }; },
    giudizio: (t, h) => ({ esito: t.presente && t.testoDopo > t.testoPrima ? 'PASS' : (t.presente ? 'FAIL' : 'NON MISURATO'), nota: `TALOS ${t.presente ? `+${t.testoDopo - t.testoPrima} caratteri, ${t.righeAttrezzo} righe attrezzo` : 'senza attività'} · Hermes ${h.presente ? `+${h.testoDopo - h.testoPrima} caratteri` : 'senza attività'}` }),
  },
  {
    blocco: 'StatusBar', nome: 'la barra di stato dice token, giri, cache e connessione',
    talos: async (p) => ({ testo: (await p.locator(T.statusbar).innerText()).replace(/\s+/g, ' ').trim() }),
    hermes: async (p) => ({ testo: await p.evaluate(() => { const t = document.body.innerText; const m = t.match(/\d[\d.,]*\s*k?\s*tokens?/i); return m ? m[0] : ''; }) }),
    giudizio: (t, h) => ({ esito: /token/.test(t.testo) && /giri/.test(t.testo) ? 'PASS' : 'FAIL', nota: `TALOS «${t.testo.slice(0, 70)}» · Hermes «${h.testo || 'nessun conteggio a schermo'}»` }),
  },
];
