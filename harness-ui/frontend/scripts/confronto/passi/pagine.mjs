/*
 * Gruppo 4 · Pagine — i Luoghi di TALOS (Capability, Board, Libreria, Memoria, Attività,
 * Impostazioni) contro le pagine equivalenti dell'app di riferimento (Capabilities, Artifacts, Messaging, Settings).
 * Per ogni pagina: 1 gesto per aprirla, quanti controlli premibili, quanti senza nome,
 * quante righe di dati, errori di pagina, e la foto affiancata.
 */
import { attesa } from '../guida.mjs';

const conta = async (p, sel) => p.locator(sel).filter({ visible: true }).count();
// nome accessibile VERO: aria-label, testo, placeholder, title, <label> associata o aria-labelledby (accname 1.2)
const senzaNome = (p, sel) => p.locator(sel).filter({ visible: true }).evaluateAll((els) => els.filter((e) => {
  const diretto = (e.getAttribute('aria-label') || e.innerText || e.getAttribute('placeholder') || e.getAttribute('title') || '').trim();
  const label = e.labels && e.labels.length ? e.labels[0].innerText.trim() : '';
  const by = e.getAttribute('aria-labelledby') ? (document.getElementById(e.getAttribute('aria-labelledby'))?.innerText || '').trim() : '';
  return !(diretto || label || by);
}).length);
const PREMIBILI = 'button, a[href], [role="button"], [role="tab"], input, select, textarea';

async function paginaTalos(p, vaia, selRighe) {
  const t0 = performance.now();
  await p.locator(`[data-vaia="${vaia}"]`).filter({ visible: true }).first().click();
  await attesa(900);
  const schermo = `#schermo${vaia.charAt(0).toUpperCase()}${vaia.slice(1)}`;
  const visibile = await p.locator(schermo).isVisible().catch(() => false);
  return { ms: Math.round(performance.now() - t0), visibile, controlli: await conta(p, `${schermo} ${PREMIBILI}`), senzaNome: await senzaNome(p, `${schermo} ${PREMIBILI}`), righe: await conta(p, `${schermo} ${selRighe}`) };
}
async function paginaHermes(p, nomePulsante, selRighe) {
  const t0 = performance.now();
  for (let i = 0; i < 2; i += 1) { await p.keyboard.press('Escape'); await attesa(100); } // chiude un dialogo lasciato aperto dal passo prima
  await p.locator(`button[aria-label^="${nomePulsante}"], button:has-text("${nomePulsante}")`).first().evaluate((el) => el.click());
  await attesa(1200);
  return { ms: Math.round(performance.now() - t0), visibile: true, controlli: await conta(p, `main ${PREMIBILI}, [role="main"] ${PREMIBILI}`), senzaNome: await senzaNome(p, `main ${PREMIBILI}, [role="main"] ${PREMIBILI}`), righe: await conta(p, selRighe) };
}
const giudizio = (t, h) => ({ esito: t.visibile && t.senzaNome === 0 ? 'PASS' : 'FAIL', nota: `TALOS ${t.ms} ms, ${t.controlli} controlli (${t.senzaNome} senza nome), ${t.righe} righe · Hermes ${h.ms} ms, ${h.controlli} controlli (${h.senzaNome} senza nome), ${h.righe} righe` });

export const PASSI = [
  { blocco: 'CapabilityScreen', nome: 'Capability ↔ Capabilities: attrezzi e skill, 1 gesto', talos: (p) => paginaTalos(p, 'capability', '[data-cap-list] [role="option"], .talos-list-row'), hermes: (p) => paginaHermes(p, 'Capabilities', '[role="row"], [data-slot="row"], li'), giudizio },
  { blocco: 'BoardScreen', nome: 'Board ↔ elenco sessioni: righe e filtri', talos: (p) => paginaTalos(p, 'board', 'tbody tr, [data-c="DataTable"] [role="row"]'), hermes: async (p) => ({ ms: 0, visibile: true, controlli: await conta(p, 'button[data-slot="row-button"]'), senzaNome: 0, righe: await conta(p, 'button[data-slot="row-button"]'), nota: 'Hermes non ha una Board: l\'elenco è la sidebar stessa' }), giudizio },
  { blocco: 'LibraryScreen', nome: 'Libreria ↔ Artifacts: gli artefatti prodotti', talos: (p) => paginaTalos(p, 'libreria', '.talos-list-row, [data-c="LibraryRow"]'), hermes: (p) => paginaHermes(p, 'Artifacts', '[role="row"], article, li'), giudizio },
  { blocco: 'MemoryScreen', nome: 'Memoria: le voci ricordate', talos: (p) => paginaTalos(p, 'memoria', '.talos-list-row, [data-c="MemoryRow"]'), hermes: async (p) => ({ ms: 0, visibile: false, controlli: 0, senzaNome: 0, righe: 0, nota: 'Hermes: la memoria non ha una pagina nella desktop 0.17 (è un file/skill)' }), giudizio },
  { blocco: 'TasksScreen', nome: 'Attività: la coda dei compiti', talos: (p) => paginaTalos(p, 'attivita', '.talos-list-row, [data-c="TaskRow"]'), hermes: async (p) => ({ ms: 0, visibile: false, controlli: 0, senzaNome: 0, righe: 0, nota: 'Hermes: niente pagina Attività; i cron stanno nella sidebar' }), giudizio },
  { blocco: 'SettingsScreen', nome: 'Impostazioni ↔ Settings: sezioni e controlli con nome', talos: (p) => paginaTalos(p, 'impostazioni', '#schermoImpostazioni [role="tab"]'), hermes: (p) => paginaHermes(p, 'Open settings', '[role="tab"], nav a, nav button'), giudizio },
];
