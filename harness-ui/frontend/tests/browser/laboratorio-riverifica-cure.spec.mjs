/*
 * RIVERIFICA DELLE CURE DELLA TERZA PASSATA (14/10/2026) — `ffabcbad4` toglie dal laboratorio dei componenti la pagina
 * WorkflowSpec (`lab/workflow-spec.js`, il suo banco in `lab/main.js`). Il brief: «che il laboratorio dei componenti si costruisca
 * e regga ancora». Il cancello vero (`playwright.componenti.config.mjs`) vuole due porte sue (4176 e 4177): qui il laboratorio
 * COSTRUITO (`node scripts/build-lab.mjs` ⇒ `dist-lab/`) si serve dentro il browser da `page.route` su un'origine finta, senza
 * aprire porte, e ogni componente si monta: niente errori di pagina, e il laboratorio dice di essere pronto.
 * «[REGGE]» = attaccato, ha retto.
 * ⛔ 15/10/2026 (bugfixer) — il prerequisito «`dist-lab/` costruito da questo albero» nella suite browser di serie NON c'era:
 *   nessuno costruisce il laboratorio prima di `playwright test` (`dist-lab/` è in `.gitignore`), ogni `goto` rispondeva 404,
 *   i 44 componenti aspettavano 15 s l'uno (660 s) e il tetto di 240 s chiudeva la pagina a metà: «Target page… has been
 *   closed». Rossa identica su 5793bd468 e su 2bd1b3e27. Ora la prova costruisce il laboratorio da sé, in una cartella
 *   temporanea che `assertSafeOutput` (scripts/build.mjs:21-28) ammette apposta per le prove (`talos-phase1-*`), e non tocca
 *   l'albero; il significato non cambia.
 */
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { buildLab } from '../../scripts/build-lab.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

let DIST_LAB = null;
test.beforeAll(async () => {
  test.setTimeout(180_000);
  DIST_LAB = await mkdtemp(path.join(tmpdir(), 'talos-phase1-riv-lab-'));
  await buildLab({ outputDir: DIST_LAB });
  await stat(path.join(DIST_LAB, 'index.html')); // senza l'indice la prova fallirebbe per il motivo sbagliato: si ferma qui
});
test.afterAll(async () => { if (DIST_LAB) await rimuoviCartellaDiProvaAttesa(DIST_LAB); }); // BC09: l'aiuto comune, mai una rimozione nuda
const ORIGINE = 'http://laboratorio.riverifica.invalid';
const TIPI = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const COMPONENTI = ['AttivitaCompatta', 'RuntimeCard', 'MemoryMeter', 'CatalogoModelli', 'FonteRicerca', 'SettingsNav', 'SettingRow', 'CheckCard', 'ToolList', 'AutomationRow', 'ForgeList', 'ReportRow', 'LibraryRow', 'TaskRow', 'MemoryRow', 'Board', 'EmptyState', 'Review', 'NotificationPanel', 'Inspector', 'Browser', 'Terminale', 'CodaDownload', 'CatalogoHf', 'ModelliInstallati', 'SezioneNote', 'SezioneMemoria', 'SezioneAttivita', 'SezioneLibreria', 'SezioneRicerca', 'SezioneProgetti', 'SezioneElenco', 'ThemeStudio', 'ScorciatoiaTemi', 'ModaleConferma', 'ToastAnnulla', 'Toast', 'ChatFooter', 'Conversazione', 'Topbar', 'WorkspaceFooter', 'NavItem', 'SessionItem', 'ControlliF1'];

async function servi(page) {
  const mancati = [];
  await page.routeWebSocket(/.*/u, (ws) => ws.close());
  await page.route(`${ORIGINE}/**`, async (route) => {
    const p = new URL(route.request().url()).pathname;
    const file = path.join(DIST_LAB, ...(p === '/' ? ['index.html'] : p.slice(1).split('/')));
    try { await route.fulfill({ status: 200, contentType: TIPI[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) }); }
    // le rotte `/api/…` le serve `scripts/serve-lab.mjs` (fixture della Libreria): qui contano solo i file del build che mancano
    catch { if (!p.startsWith('/api/')) mancati.push(p); await route.fulfill({ status: 404, body: '' }); }
  });
  return mancati;
}

test('RIV-LAB-01 [REGGE] — il laboratorio costruito senza la pagina WorkflowSpec si apre e monta i suoi 44 componenti, uno per uno, senza errori di pagina', async ({ page }) => {
  test.setTimeout(240_000);
  const mancati = await servi(page);
  const errori = []; page.on('pageerror', (e) => errori.push(`${page.url()} :: ${e.message}`));
  const esiti = [];
  for (const nome of COMPONENTI) {
    await page.goto(`${ORIGINE}/?componente=${nome}`);
    const pronto = await page.waitForFunction(() => document.documentElement.dataset.visualReady === 'true', null, { timeout: 15_000 }).then(() => true, () => false);
    esiti.push([nome, pronto]);
  }
  const nonPronti = esiti.filter(([, ok]) => !ok).map(([n]) => n);
  expect({ nonPronti, errori, mancati: [...new Set(mancati)] }).toEqual({ nonPronti: [], errori: [], mancati: [] });
  // AL CONTRARIO: il componente tolto non c'è più (e lo dice), non monta una pagina vuota in silenzio
  const erroreTolto = [];
  page.removeAllListeners('pageerror'); page.on('pageerror', (e) => erroreTolto.push(e.message));
  await page.goto(`${ORIGINE}/?componente=WorkflowSpec`);
  await expect.poll(() => erroreTolto.join(' | ')).toContain('componente di laboratorio sconosciuto: WorkflowSpec');
});
