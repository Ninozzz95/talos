/*
 * Gruppo 2 · Navigazione — sidebar, testata, palette, notifiche, colonne.
 * Selettori TALOS letti dal vivo il 06/09 (talos-selettori-nav.mjs); l'app di riferimento dal
 * vivo il 05/09 («Hide sidebar», «Search sessions», «New session Ctrl N», «Keyboard
 * shortcuts», «Open settings», «Show right sidebar», «Session actions»).
 */
import { attesa } from '../guida.mjs';

const T = {
  cerca: '#sessionSearch', nuova: '#newSessionBtn', collassa: '#sessionsCollapseBtn', palette: '#commandPaletteBtn',
  paletteDialogo: '#commandDialog', notifiche: '#notificationsBtn', dettagli: '.talos-topbar [data-azione="dettagli"], .desktop-context-toggle',
  sessioni: '[data-real-session-id]', schede: '.talos-topbar [role="tab"], .talos-topbar .talos-tabs__tab',
};
const H = {
  cerca: 'input[placeholder*="Search sessions" i], input[aria-label*="Search sessions" i]', nuova: 'button[aria-label^="New session"]',
  collassa: 'button[aria-label="Hide sidebar"], button[aria-label="Show sidebar"]', destra: 'button[aria-label="Show right sidebar"], button[aria-label="Hide right sidebar"]',
  sessioni: 'button[data-slot="row-button"]', azioniSessione: 'button[aria-label="Session actions"]',
};

const nomi = (loc) => loc.evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean));
const larghezzaSidebar = (p, sel) => p.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().width)).catch(() => null);

export const PASSI = [
  {
    blocco: 'SessionList', nome: 'cerca una sessione dalla casella (quante righe restano, quanti gesti)',
    talos: async (p) => { const prima = await p.locator(T.sessioni).filter({ visible: true }).count(); await p.locator(T.cerca).fill('sottrai'); await attesa(500); const dopo = await p.locator(T.sessioni).filter({ visible: true }).count(); await p.locator(T.cerca).fill(''); await attesa(300); return { prima, dopo, gesti: 2 }; },
    hermes: async (p) => { const prima = await p.locator(H.sessioni).filter({ visible: true }).count(); const c = p.locator(H.cerca).first(); await c.click(); await p.keyboard.type('difetto'); await attesa(600); const dopo = await p.locator(H.sessioni).filter({ visible: true }).count(); await p.keyboard.press('Control+A'); await p.keyboard.press('Delete'); await attesa(300); return { prima, dopo, gesti: 2 }; },
    giudizio: (t, h) => ({ esito: t.dopo < t.prima && t.dopo > 0 ? 'PASS' : 'FAIL', nota: `TALOS ${t.prima}→${t.dopo} righe · Hermes ${h.prima}→${h.dopo}` }),
  },
  {
    blocco: 'SessionItem', nome: 'quanti fatti dice una riga di sessione (stato, modello, giri, tempo)',
    talos: async (p) => { const r = p.locator(T.sessioni).first(); const testo = (await r.innerText()).replace(/\s+/g, ' ').trim(); return { testo: testo.slice(0, 120), fatti: (testo.match(/·/g) || []).length + 1, altezza: Math.round((await r.boundingBox()).height) }; },
    hermes: async (p) => { const r = p.locator(H.sessioni).first(); const testo = (await r.innerText()).replace(/\s+/g, ' ').trim(); return { testo: testo.slice(0, 120), fatti: 1 + (/\d+\s*[dhm]\b/.test(testo) ? 1 : 0), altezza: Math.round((await r.boundingBox()).height) }; },
    giudizio: (t, h) => ({ esito: t.fatti >= h.fatti ? 'PASS' : 'FAIL', nota: `TALOS ${t.fatti} fatti in ${t.altezza}px «${t.testo.slice(0, 60)}» · Hermes ${h.fatti} in ${h.altezza}px «${h.testo.slice(0, 50)}»` }),
  },
  {
    blocco: 'Sidebar', nome: 'comprimi la barra laterale (1 gesto) e riaprila: larghezza prima/dopo',
    talos: async (p) => { const sel = '.talos-sidebar'; const prima = await larghezzaSidebar(p, sel); await p.locator(T.collassa).click(); await attesa(500); const dopo = await larghezzaSidebar(p, sel); await p.locator(T.collassa).click(); await attesa(500); const riaperta = await larghezzaSidebar(p, sel); return { prima, dopo, riaperta, gesti: 1 }; },
    hermes: async (p) => { const sel = 'aside, [data-slot="sidebar"], nav'; const prima = await larghezzaSidebar(p, sel); await p.locator(H.collassa).first().click(); await attesa(600); const dopo = await larghezzaSidebar(p, sel); await p.locator(H.collassa).first().click(); await attesa(600); const riaperta = await larghezzaSidebar(p, sel); return { prima, dopo, riaperta, gesti: 1 }; },
    giudizio: (t, h) => ({ esito: t.dopo != null && t.dopo < t.prima && t.riaperta === t.prima ? 'PASS' : 'FAIL', nota: `TALOS ${t.prima}→${t.dopo}→${t.riaperta}px · Hermes ${h.prima}→${h.dopo}→${h.riaperta}px` }),
  },
  {
    blocco: 'CommandPalette', nome: 'Ctrl+K apre la palette: quante voci, la ricerca filtra, Esc chiude',
    talos: async (p) => { await p.keyboard.press('Control+K'); await attesa(400); const aperta = await p.locator(T.paletteDialogo + '[open]').count(); const voci = await p.locator(T.paletteDialogo + ' [role="option"], ' + T.paletteDialogo + ' button, ' + T.paletteDialogo + ' li').filter({ visible: true }).count(); await p.keyboard.type('sess'); await attesa(300); const filtrate = await p.locator(T.paletteDialogo + ' [role="option"], ' + T.paletteDialogo + ' button, ' + T.paletteDialogo + ' li').filter({ visible: true }).count(); await p.keyboard.press('Escape'); await attesa(300); const chiusa = (await p.locator(T.paletteDialogo + '[open]').count()) === 0; return { aperta: aperta > 0, voci, filtrate, chiusa }; },
    hermes: async (p) => { await p.keyboard.press('Control+K'); await attesa(500); const dialogo = p.locator('[role="dialog"], [cmdk-root], [data-slot="command"]').first(); const aperta = await dialogo.isVisible().catch(() => false); const voci = aperta ? await p.locator('[cmdk-item], [role="option"]').filter({ visible: true }).count() : 0; if (aperta) { await p.keyboard.type('sess'); await attesa(300); } const filtrate = aperta ? await p.locator('[cmdk-item], [role="option"]').filter({ visible: true }).count() : 0; await p.keyboard.press('Escape'); await attesa(300); const chiusa = !(await dialogo.isVisible().catch(() => false)); return { aperta, voci, filtrate, chiusa }; },
    giudizio: (t, h) => ({ esito: t.aperta && t.voci > 0 && t.filtrate <= t.voci && t.chiusa ? 'PASS' : 'FAIL', nota: `TALOS aperta:${t.aperta} ${t.voci}→${t.filtrate} voci, Esc chiude:${t.chiusa} · Hermes aperta:${h.aperta} ${h.voci}→${h.filtrate}, Esc:${h.chiusa}` }),
  },
  {
    blocco: 'Topbar', nome: 'i pulsanti della testata hanno un nome; le schede di sessione sono tab',
    talos: async (p) => { const b = p.locator('.talos-topbar button').filter({ visible: true }); const n = await nomi(b); const tot = await b.count(); return { pulsanti: tot, senzaNome: tot - n.length, schede: await p.locator(T.schede).filter({ visible: true }).count(), nomi: n }; },
    hermes: async (p) => { const b = p.locator('header button, [data-slot="titlebar"] button, .fixed button').filter({ visible: true }); const n = await nomi(b); const tot = await b.count(); return { pulsanti: tot, senzaNome: tot - n.length, schede: await p.locator('[role="tab"]').filter({ visible: true }).count(), nomi: n.slice(0, 12) }; },
    giudizio: (t, h) => ({ esito: t.senzaNome === 0 ? 'PASS' : 'FAIL', nota: `TALOS ${t.pulsanti} pulsanti, ${t.senzaNome} senza nome, ${t.schede} tab · Hermes ${h.pulsanti}, ${h.senzaNome} senza nome, ${h.schede} tab` }),
  },
  {
    blocco: 'Inspector', nome: 'nascondi e riapri la colonna di destra (1 gesto)',
    talos: async (p) => { const sel = '.talos-inspector, [data-c="Inspector"]'; const prima = await larghezzaSidebar(p, sel); await p.locator(T.dettagli).first().click(); await attesa(500); const dopo = await larghezzaSidebar(p, sel); await p.locator(T.dettagli).first().click(); await attesa(500); return { prima, dopo, riaperta: await larghezzaSidebar(p, sel) }; },
    hermes: async (p) => { const b = p.locator(H.destra).first(); const nome1 = await b.getAttribute('aria-label'); await b.click(); await attesa(600); const nome2 = await p.locator(H.destra).first().getAttribute('aria-label'); await p.locator(H.destra).first().click(); await attesa(600); return { prima: nome1, dopo: nome2, riaperta: await p.locator(H.destra).first().getAttribute('aria-label') }; },
    giudizio: (t) => ({ esito: t.prima != null && t.dopo !== t.prima && t.riaperta === t.prima ? 'PASS' : 'FAIL', nota: `TALOS ${t.prima}→${t.dopo}→${t.riaperta}px` }),
  },
  {
    blocco: 'NotificationPanel', nome: 'il pulsante delle notifiche dice quante ce ne sono, e si apre con 1 gesto',
    talos: async (p) => { const b = p.locator(T.notifiche); const nome = await b.getAttribute('aria-label'); await b.click(); await attesa(400); const aperto = await p.locator('#pannelloNotifiche:not([hidden]), [data-c="NotificationPanel"]:not([hidden])').count(); await p.keyboard.press('Escape'); return { nome, aperto: aperto > 0 }; },
    hermes: async (p) => { const b = p.locator('button[aria-label*="notification" i], button[aria-label*="Notifications" i]').first(); const c = await b.count(); if (!c) return { nome: null, aperto: false, nota: 'nessun pulsante notifiche' }; const nome = await b.getAttribute('aria-label'); await b.click(); await attesa(400); return { nome, aperto: true }; },
    giudizio: (t, h) => ({ esito: t.nome && /\d|nessuna/.test(t.nome) && t.aperto ? 'PASS' : 'FAIL', nota: `TALOS «${t.nome}» aperto:${t.aperto} · Hermes ${h.nome ? '«' + h.nome + '»' : 'nessun pulsante notifiche nella finestra'}` }),
  },
];
