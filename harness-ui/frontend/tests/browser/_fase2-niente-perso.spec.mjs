import { expect, test } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/*
 * ============================================================================
 * NIENTE SI PERDE — la rete della FASE 2, e non solo sua.
 * ============================================================================
 * Regola dell'owner, scritta a lettere maiuscole: «NON DOBBIAMO NASCONDERE O PERDERE NESSUNA
 * FUNZIONE ATTUALE DELLA APP». Fino a oggi quella regola era affidata all'attenzione; qui diventa
 * un cancello.
 *
 * ⭐ COME SI FA, e la fonte: è un **golden master** — si congela ciò che NON deve cambiare e si
 *   pretende **zero differenze** (fonte: `characterization-testing.md`,
 *   `github.com/vasilyu1983/AI-Agents-public/…/qa-refactoring/references/characterization-testing.md`,
 *   letto il 18/09/2026). Due regole di quella fonte sono scritte dentro questa prova:
 *   1. **il master si aggiorna SOLO quando il cambiamento è voluto**, e dopo aver guardato il diff;
 *   2. **un rosso non si accetta in silenzio**: se il master manca, si scrive un `.candidate.json`
 *      e si FALLISCE, invece di crearlo e dichiararsi verdi.
 *
 * ⛔ COSA SI CONGELA E COSA NO. La FASE 2 **cambia le forme di proposito**: un confronto esatto del
 *   DOM sarebbe rosso per costruzione. Si congela l'**identità** — gli `id`, i ganci `data-*`, le
 *   righe `[data-setting-row]` e il numero di controlli abilitati. Le forme possono cambiare;
 *   **l'identità no**, e il numero dei controlli può crescere ma **non calare**.
 *
 * ⛔ COSA FA DIVENTARE ROSSA QUESTA PROVA (provato, non dichiarato): si toglie un `id` da una
 *   sezione → elencato e rosso; si toglie una riga → rosso; si disabilita o si elimina un controllo
 *   → il conteggio cala e diventa rosso; si perde una sezione intera → rosso.
 */
const MASTER = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'fixtures', 'inventario-sezioni.json');

/* La stessa raccolta del master, parola per parola: se cambia una, cambiano tutte e due. */
const RACCOGLI = () => {
  const GANCI = ['data-settings-panel', 'data-setting-row', 'data-settings-tab', 'data-settings-group', 'data-settings-group-field', 'data-lab-scheda', 'data-model-lab-panel', 'data-action', 'data-vaia', 'data-c', 'data-testo-it'];
  const sezioni = {};
  for (const pan of document.querySelectorAll('#schermoImpostazioni [data-settings-panel]')) {
    const chiave = pan.dataset.settingsPanel;
    const id = [...pan.querySelectorAll('[id]')].map((n) => n.id).sort();
    const ganci = {};
    for (const g of GANCI) { const quanti = pan.querySelectorAll('[' + g + ']').length; if (quanti) ganci[g] = quanti; }
    const righe = [...pan.querySelectorAll('[data-setting-row]')].map((n) => n.dataset.settingRow).sort();
    const controlli = [...pan.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled).length;
    sezioni[chiave + (sezioni[chiave] ? '#' + Object.keys(sezioni).filter((k) => k.startsWith(chiave)).length : '')] = { id, ganci, righe, controlli };
  }
  return { sezioni };
};


/* ⛔ E SI ASPETTA CHE L'INVENTARIO SI STABILIZZI — non è un `waitForTimeout` di comodo: le carte
   dei fornitori e il dettaglio del modello si COSTRUISCONO dopo il montaggio, e una fotografia
   presa troppo presto registra meno id di quanti ne ha la superficie (misurato: la prima stesura
   di questa prova accusava 22 «id spariti» che erano solo non ancora disegnati). Si legge finché
   due letture di fila coincidono. */
async function inventarioStabile(page, leggi) {
  let prima = await page.evaluate(leggi);
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(400);
    const dopo = await page.evaluate(leggi);
    if (JSON.stringify(dopo) === JSON.stringify(prima)) return dopo;
    prima = dopo;
  }
  return prima;
}

async function apriImpostazioni(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
}

test('FASE2-NIENTE-PERSO · nessun id, nessun gancio, nessun controllo in meno', async ({ page }) => {
  test.setTimeout(60_000);
  /* ⛔ Un master assente NON si crea in silenzio: si scrive un candidato e si fallisce. */
  expect(existsSync(MASTER), `manca il golden master dell'identità (${MASTER}): rilanciare \`node artifacts/zoom-bar/inventario-identita.mjs\`, GUARDARE il diff e committarlo`).toBe(true);
  const master = JSON.parse(readFileSync(MASTER, 'utf8'));

  await apriImpostazioni(page);
  const vivo = await inventarioStabile(page, RACCOGLI);

  const mancanti = { sezioni: [], id: [], righe: [], calati: [] };
  for (const [chiave, atteso] of Object.entries(master.sezioni)) {
    const ora = vivo.sezioni[chiave];
    if (!ora) { mancanti.sezioni.push(chiave); continue; }
    const idOra = new Set(ora.id);
    for (const id of atteso.id) if (!idOra.has(id)) mancanti.id.push(`${chiave} → ${id}`);
    const righeOra = new Set(ora.righe);
    for (const r of atteso.righe) if (!righeOra.has(r)) mancanti.righe.push(`${chiave} → ${r}`);
    if (ora.controlli < atteso.controlli) mancanti.calati.push(`${chiave}: ${atteso.controlli} → ${ora.controlli}`);
  }

  if (mancanti.sezioni.length || mancanti.id.length || mancanti.righe.length || mancanti.calati.length) {
    writeFileSync(MASTER.replace(/\.json$/, '.attuale.json'), JSON.stringify(vivo, null, 1));
    console.log('FASE2-NIENTE-PERSO ' + JSON.stringify({ ...mancanti, id: mancanti.id.slice(0, 20), righe: mancanti.righe.slice(0, 20) }, null, 1));
  }
  expect(mancanti.sezioni, 'sezioni sparite').toEqual([]);
  expect(mancanti.id, 'id spariti — la regola è: nessuna funzione si perde').toEqual([]);
  expect(mancanti.righe, 'righe di impostazione sparite').toEqual([]);
  expect(mancanti.calati, 'controlli abilitati diminuiti in una sezione').toEqual([]);
});
