/*
 * Gruppo 3 · Sessione — Review, colonna di destra, albero dei rami.
 * TALOS: istanza con lo store del kernel vero (sessioni con file scritti), es.
 *   TALOS_CONFRONTO_URL=http://127.0.0.1:4182/ node scripts/confronto/confronto.mjs --gruppo=sessione
 * L'app di riferimento: la Review è un pannello della colonna destra (Ctrl+G), git-based
 * («No diffs» se il repo della sessione è pulito) — letto dal vivo il 06/09.
 * Terminale e Browser NON si misurano ancora: B1 e K-I sono di Astra, in coda.
 */
import { attesa } from '../guida.mjs';

const T = {
  sessione: '[data-real-session-id]', review: '[data-vaia="review"]', schede: '#schermoReview .talos-review__scheda',
  copia: '#copyAllDiffs', righe: '#schermoReview .talos-diff .talos-diff__line', vuoto: '#vuotoReview',
  inspectorTab: '.talos-inspector [role="tab"]', albero: 'button:has-text("albero dei rami")',
};
const nomi = (loc) => loc.evaluateAll((els) => els.map((e) => (e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean));

async function apriSessioneConFile(p) {
  const n = Math.min(6, await p.locator(T.sessione).count());
  for (let i = 0; i < n; i += 1) {
    await p.locator(T.sessione).nth(i).click(); await attesa(1200);
    if (await p.locator(T.schede).count() > 0) return i;
  }
  return -1;
}

export const PASSI = [
  {
    blocco: 'ReviewScreen', nome: 'apri la Review di una sessione con file scritti (1 gesto): schede, righe di diff, «Copia i diff»',
    talos: async (p) => { const i = await apriSessioneConFile(p); await p.locator(T.review).first().click(); await attesa(800); return { sessione: i, schede: await p.locator(T.schede).count(), righe: await p.locator(T.righe).count(), copiaAttivo: await p.locator(T.copia).filter({ visible: true }).first().isEnabled().catch(() => false), vuotoVisibile: await p.locator(T.vuoto).isVisible().catch(() => false) }; },
    hermes: async (p) => { await p.keyboard.press('Control+G'); await attesa(1000); const testo = await p.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.getBoundingClientRect().x > 1000 && el.getBoundingClientRect().width > 0).map((el) => el.textContent.trim()).filter(Boolean).slice(0, 12)); const azioni = await nomi(p.locator('button').filter({ visible: true })); return { pannello: testo, azioniReview: azioni.filter((n) => /stage|revert|refresh|view as/i.test(n)) }; },
    giudizio: (t, h) => ({ esito: t.schede > 0 && t.righe > 0 && t.copiaAttivo ? 'PASS' : 'FAIL', nota: `TALOS ${t.schede} file, ${t.righe} righe, copia:${t.copiaAttivo} · Hermes pannello «${(h.pannello || []).slice(0, 3).join(' / ')}» azioni: ${(h.azioniReview || []).join(', ')}` }),
  },
  {
    blocco: 'ReviewFileTabs', nome: 'frecce sulle schede dei file: la freccia destra passa al file dopo e il diff cambia',
    talos: async (p) => { const schede = p.locator(T.schede); const n = await schede.count(); if (n < 2) return { schede: n, nota: 'serve una sessione con due file' }; await schede.first().focus(); const prima = await p.locator('#schermoReview .talos-review__diff-head .talos-truncate').innerText(); await p.keyboard.press('ArrowRight'); await attesa(300); const dopo = await p.locator('#schermoReview .talos-review__diff-head .talos-truncate').innerText(); const fuoco = await p.evaluate(() => document.activeElement?.getAttribute('role')); return { schede: n, prima, dopo, fuocoSuTab: fuoco === 'tab' }; },
    hermes: async (p) => ({ nota: 'la Review di Hermes è un albero di file (View as list), non schede: non confrontabile 1:1' }),
    giudizio: (t) => ({ esito: t.schede < 2 ? 'NON MISURATO' : (t.prima !== t.dopo && t.fuocoSuTab ? 'PASS' : 'FAIL'), nota: t.schede < 2 ? t.nota : `«${t.prima}» → «${t.dopo}», fuoco su tab:${t.fuocoSuTab}` }),
  },
  {
    blocco: 'Inspector', nome: 'la colonna di destra: schede (Contesto · File · Agenti · Processi) e cosa dice il Contesto',
    talos: async (p) => { await p.locator('[data-vaia="chat"]').filter({ visible: true }).first().click(); await attesa(500); const tabs = await nomi(p.locator(T.inspectorTab).filter({ visible: true })); const kv = await p.locator('.talos-inspector .talos-kv').filter({ visible: true }).count(); return { schede: tabs, coppie: kv }; },
    hermes: async (p) => { const tabs = await nomi(p.locator('[role="tab"]').filter({ visible: true })); return { schede: tabs.filter((n) => n.length < 30), coppie: 0 }; },
    giudizio: (t, h) => ({ esito: t.schede.length >= 3 && t.coppie > 0 ? 'PASS' : 'FAIL', nota: `TALOS ${t.schede.join(' · ')} (${t.coppie} coppie chiave-valore) · Hermes tab: ${h.schede.join(' · ')}` }),
  },
  {
    blocco: 'BranchTree', nome: '«Apri l\'albero dei rami» esiste e ha un nome; in Hermes «BRANCH» è una scheda della sessione',
    talos: async (p) => ({ presente: await p.locator(T.albero).filter({ visible: true }).count() > 0 }),
    hermes: async (p) => ({ presente: await p.locator('[role="tab"]').filter({ hasText: /branch/i }).count() > 0 }),
    giudizio: (t, h) => ({ esito: t.presente ? 'PASS' : 'FAIL', nota: `TALOS pulsante:${t.presente} (BranchTree = Fase 3) · Hermes scheda BRANCH:${h.presente}` }),
  },
];
