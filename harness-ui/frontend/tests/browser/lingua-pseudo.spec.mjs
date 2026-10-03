import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ STRATO 3 DEL CANCELLO DELLA LINGUA — la pseudo-lingua sul 4174 (owner 03/10/2026: «ci deve essere una guardia/cancello»).
 *   Con `#lingua=qps` ogni testo che passa dal dizionario esce come «⟦…⟧» (`components/lingua.js`, `pseudo`). Ciò che sulla
 *   pagina VISIBILE resta in chiaro non è passato dal dizionario: è un testo che in inglese resterebbe italiano, compresi quelli
 *   che i rilevatori del sorgente non vedono (parole singole, testi composti a runtime, file fuori dal cancello statico).
 *   Pseudo-localizzazione: simplelocalize e l10n.dev, letti il 03/10/2026.
 * Cricchetto, come gli altri strati: per ogni vista il numero di testi sfuggiti non sale sopra `lingua-pseudo-soglie.json`.
 *   Le soglie si riscrivono SOLO per abbassarle: `TALOS_LINGUA_PSEUDO_SCRIVI=1` con la prova.
 * NON contano, perché non sono interfaccia:
 *   - il contenuto della persona, letto dall'API: nomi delle sessioni (anche troncati con «…»), progetti, modelli;
 *   - il marchio «TALOS» e gli id dei modelli (`fornitore/modello`, `glm-5.3-flash`).
 * ⛔ Sul 4174 solo letture: ogni richiesta non-GET si FERMA e si conta, e ogni WebSocket si CHIUDE (03/10/2026 sera: un
 *   WebSocket del Terminale apre una shell vera, e una cartella sparita ha fatto cadere il server). Il Terminale non si apre mai.
 * ⭐ Viste di SESSIONE e DIALOGHI (03/10/2026 notte): oltre alla persona, non contano i contenuti che l'interfaccia mostra
 *   così come arrivano (`CONTENUTO`): la conversazione, l'indice dei giri (prefissi dei messaggi), le cartelle del disco nella
 *   scelta del workspace, la frase che un server MCP manda con la sua richiesta e i tasti; e i nomi propri
 *   uguali nelle due lingue (`NOMI_PROPRI`). Misurato prima di escludere: fuori da questi, nessun testo sfuggito.
 */
const FILE_SOGLIE = new URL('../../scripts/cancello/lingua-pseudo-soglie.json', import.meta.url);
const VISTE = ['home', 'dashboard', 'projects', 'library', 'notes', 'tasks', 'memory', 'research', 'automations', 'forge', 'settings'];
const MARCHIO_E_ID = [/^TALOS$/u, /^[\w.-]+\/[\w.:-]+$/u, /^[a-z0-9]+(?:[-.][a-z0-9]+)+$/u];
const VISTE_SESSIONE = ['sessione-chat', 'sessione-review', 'sessione-browser', 'dialogo-new', 'dialogo-permissions', 'dialogo-shortcuts'];
const CONTENUTO = ['#conversation p', '.talos-message__who', '.talos-message__meta', '#railContesto .talos-kv__k', '#workspaceChooserTree', '#workspaceChooser strong', 'kbd', '.talos-approval__why'].join(', ');
const NOMI_PROPRI = [/^GitHub$/u, /^Windows$/u, /^Linux \(WSL2\)$/u];

/** I testi visibili senza il segno della pseudo-lingua, tolti quelli della persona. Gira nella pagina. */
function sfuggitiNellaPagina({ dellaPersona, contenuto = null }) {
  const visibile = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const suo = (testo) => dellaPersona.some((v) => v === testo || (/(?:\.\.\.|…)$/u.test(testo) && v.startsWith(testo.replace(/(?:\.\.\.|…)$/u, '').trim())));
  const fuori = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const testo = n.data.replace(/\s+/gu, ' ').trim();
    if (!/\p{L}{2,}/u.test(testo) || /[⟦⟧]/u.test(testo) || suo(testo)) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !visibile(el)) continue;
    if (contenuto && el.closest(contenuto)) continue;
    fuori.add(testo);
  }
  return [...fuori];
}

async function apriInPseudo(page) {
  const conti = { nonGet: 0 };
  await page.route('**/api/v1/**', (route) => {
    if (route.request().method() !== 'GET') { conti.nonGet += 1; return route.abort(); }
    return route.fallback();
  });
  await page.routeWebSocket(/.*/u, (ws) => { conti.ws = (conti.ws ?? 0) + 1; ws.close(); });
  const errori = [];
  page.on('pageerror', (e) => errori.push(String(e)));
  await page.goto('/#lingua=qps');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await expect(page.locator('html')).toHaveAttribute('lang', 'qps');
  const elenco = await (await page.request.get('/api/v1/sessions')).json();
  const dellaPersona = [...new Set((elenco?.data?.items ?? []).flatMap((s) => [s.nome, s.progetto, s.modello, s.modelId, s.taskId]).filter((v) => typeof v === 'string' && v))];
  return { conti, errori, dellaPersona };
}

const fuoriDalMarchio = (testi) => testi.filter((t) => !MARCHIO_E_ID.some((re) => re.test(t)) && !NOMI_PROPRI.some((re) => re.test(t)));

/** Apre una vista di sessione o un dialogo; `false` se sul server non c'è una sessione da aprire. ⛔ Mai il Terminale. */
async function apriVistaDiSessione(page, vista) {
  const [tipo, nome] = vista.split('-');
  if (tipo === 'dialogo') { await page.evaluate((c) => window.__talosHarnessUiRuntime.executeCommand(c), nome); return true; }
  const riga = page.locator('.real-session-item[data-real-session-id]').first();
  if (!(await riga.count())) return false;
  if (!(await page.locator('#conversation').isVisible().catch(() => false))) await riga.click({ timeout: 8000 });
  await page.locator(`.talos-tabs__tab[data-vaia="${nome}"]:visible`).first().click({ timeout: 5000 });
  return true;
}

test.use({ viewport: { width: 1920, height: 1080 }, locale: 'en-US' });

test('LINGUA-3-PSEUDO: per ogni vista i testi sfuggiti al dizionario non salgono sopra la soglia', async ({ page }) => {
  test.setTimeout(120_000);
  const { conti, errori, dellaPersona } = await apriInPseudo(page);
  const oggi = {};
  const elenchi = {};
  for (const vista of VISTE) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate((c) => window.__talosHarnessUiRuntime.executeCommand(c), vista);
    await page.waitForTimeout(900);
    const testi = fuoriDalMarchio(await page.evaluate(sfuggitiNellaPagina, { dellaPersona }));
    oggi[vista] = testi.length;
    elenchi[vista] = testi;
  }
  for (const vista of VISTE_SESSIONE) {
    await page.keyboard.press('Escape').catch(() => {});
    if (!(await apriVistaDiSessione(page, vista))) { console.log(`${vista}: nessuna sessione sul server, vista non misurata`); oggi[vista] = 0; elenchi[vista] = []; continue; }
    await page.waitForTimeout(1200);
    const testi = fuoriDalMarchio(await page.evaluate(sfuggitiNellaPagina, { dellaPersona, contenuto: CONTENUTO }));
    oggi[vista] = testi.length;
    elenchi[vista] = testi;
  }
  const TUTTE = [...VISTE, ...VISTE_SESSIONE];
  if (process.env.TALOS_LINGUA_PSEUDO_SCRIVI === '1') {
    writeFileSync(FILE_SOGLIE, `${JSON.stringify({ nota: 'Strato 3 del cancello della lingua (owner 03/10/2026): testi visibili senza il segno della pseudo-lingua, per vista. Si abbassano, MAI si alzano. Obiettivo: zero.', viste: oggi }, null, 2)}\n`);
  }
  const soglie = JSON.parse(readFileSync(FILE_SOGLIE, 'utf8')).viste;
  const superati = TUTTE.filter((v) => oggi[v] > (soglie[v] ?? 0)).map((v) => `${v}: ${oggi[v]} sopra ${soglie[v] ?? 0} — ${elenchi[v].slice(0, 12).join(' | ')}`);
  const migliorati = TUTTE.filter((v) => oggi[v] < (soglie[v] ?? 0)).map((v) => `${v}: ${soglie[v]} → ${oggi[v]}`);
  if (migliorati.length) console.log(`soglie della pseudo-lingua da abbassare (TALOS_LINGUA_PSEUDO_SCRIVI=1):\n  ${migliorati.join('\n  ')}`);
  expect(superati, 'testi a schermo che non passano dal dizionario').toEqual([]);
  expect(errori).toEqual([]);
  expect(conti.nonGet).toBe(0);
  expect(conti.ws ?? 0, 'nessun WebSocket aperto (il Terminale non si apre mai)').toBe(0);
});

test('LINGUA-3-PSEUDO AL CONTRARIO: un testo scritto a mano nella pagina si vede, uno passato dal dizionario no', async ({ page }) => {
  const { dellaPersona } = await apriInPseudo(page);
  await page.evaluate(() => {
    const scritto = document.createElement('p'); scritto.id = 'provaSfuggito'; scritto.textContent = 'Testo scritto a mano senza dizionario';
    const tradotto = document.createElement('p'); tradotto.id = 'provaTradotto';
    tradotto.textContent = window.__talosHarnessUiRuntime ? '⟦Ópéñ⟧' : '';
    document.body.prepend(scritto, tradotto);
  });
  const testi = await page.evaluate(sfuggitiNellaPagina, { dellaPersona });
  expect(testi).toContain('Testo scritto a mano senza dizionario');
  expect(testi.some((t) => t.includes('Ópéñ'))).toBe(false);
  expect(fuoriDalMarchio(['TALOS', 'z-ai/glm-5.3-flash', 'glm-5.3-flash', 'Spazi di lavoro'])).toEqual(['Spazi di lavoro']);
});
