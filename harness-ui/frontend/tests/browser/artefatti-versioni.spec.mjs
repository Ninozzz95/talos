import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';
import { aggiungiVersione, elencaVersioni, salvaVoce } from '../../../src/library-store.mjs';
import { CARTELLA_PROGETTI, nomeCartellaProgetto, percorsoCanonico } from '../../../src/cartella-dati-progetto.mjs';

/*
 * 24/10/2026 — ARTEFATTI CON VERSIONI (owner: «aggiorna la stessa», «la carta di ogni giro resta sulla sua versione», «vedere e
 * ripristinare», «si tengono tutte»; bozzetto approvato lo stesso giorno). Server di prova; la Libreria è quella VERA (seminata
 * con le funzioni del magazzino); le carte in chat sono quelle vere, dagli eventi `ArtifactCreated` con `versione`.
 * Le richieste non-GET si contano: le sole attese sono la sessione di prova (avvio) e il ripristino.
 */
test.describe.configure({ mode: 'serial' });
const MODELLO = 'z-ai/glm-5.3-flash';
const rootWorkspace = process.env.TALOS_HARNESS_UI_PROJECT_DIRS?.split(';')[0]?.trim() || tmpdir();
/* 25/10/2026 (prova dal vivo dal Pad): le cartelle create qui finivano nella PRIMA cartella dei progetti del server di prova
   (`TALOS-prova-remoto`) e non se ne andavano mai — decine di `<prefisso>-XXXXXX` che poi un modello leggeva come «tutti i file
   della cartella». Ognuna si toglie a fine file. Quella che Windows tiene ancora occupata (il terminale del server di prova è
   aperto lì dentro, e Playwright spegne il server DOPO ogni pulizia finale: `runner/tasks.ts`) la toglie la corsa dopo, insieme
   alle altre dello stesso prefisso rimaste da più di 30 minuti. */
const cartelleDaTogliere = [];
const prefissiDiProva = new Set();
const traccia = (cartella) => { cartelleDaTogliere.push(cartella); prefissiDiProva.add(basename(cartella).slice(0, -6)); return cartella; };
const togli = (cartella) => {
  try { rimuoviCartellaDiProva(cartella); }
  catch (e) { console.warn(`cartella di prova rimasta: ${cartella} (${e?.code ?? e})`); }
};
test.afterAll(() => {
  for (const cartella of cartelleDaTogliere.splice(0)) togli(cartella);
  const soglia = Date.now() - 30 * 60_000;
  let nomi = [];
  try { nomi = readdirSync(rootWorkspace); } catch { /* radice sparita: niente da togliere */ }
  for (const nome of nomi) {
    /* revisione del blocco 0.1.38: solo i sei caratteri che `mkdtemp` aggiunge, mai un nome qualunque che inizi col prefisso */
    if (![...prefissiDiProva].some((p) => nome.startsWith(p) && /^[A-Za-z0-9]{6}$/u.test(nome.slice(p.length)))) continue;
    const cartella = join(rootWorkspace, nome);
    try { if (statSync(cartella).isDirectory() && statSync(cartella).mtimeMs < soglia) togli(cartella); } catch { /* sparita intanto */ }
  }
});
const pagina = (titolo, colore) => `<!doctype html><html><body style="margin:0;background:${colore}"><h1>${titolo}</h1></body></html>`;
let sessione = null;
let cartella = null;
let voce = null;

test.beforeAll(async ({ playwright, baseURL }) => {
  test.setTimeout(120_000);
  cartella = traccia(mkdtempSync(join(rootWorkspace, 'artefatti-versioni-')));
  const api = await playwright.request.newContext({ baseURL });
  expect((await api.post('/api/v1/providers/openrouter/key', { data: { key: 'sk-artefatti-fixture' } })).ok()).toBe(true);
  const r = await api.post('/api/v1/sessions/custom', { data: { cartellaLibera: cartella, consegna: 'artefatti: non fare nulla', modello: MODELLO } });
  expect(r.ok()).toBe(true);
  sessione = (await r.json()).data.sessionId;
  await api.dispose();
});

async function apri(page) {
  const nonGet = [];
  page.on('request', (r) => { if (r.method() !== 'GET' && r.url().includes('/api/v1/')) nonGet.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'en' } })); } catch { /* */ }
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  return nonGet;
}
/* la voce si semina con le funzioni del magazzino, nella cartella dove il server tiene la Libreria del progetto: quella dei dati
   dell'app (PO-26, `<dati>/.workspaces/<nome>-<impronta>/`), calcolata con le funzioni del server (`cartella-dati-progetto.mjs`).
   30/10/2026: prima si seminava nel progetto e contava che il server, alla PRIMA lettura, ve la spostasse; da quando la foto del
   turno parte all'avvio del giro (perf/foto-in-anticipo) il progetto si tocca già all'avvio, lo spostamento avviene prima della
   semina e la voce restava dove il server non guarda più. Il server di prova ha i dati in `TALOS_PW_STORE_ISOLATO`
   (`playwright.config.mjs`, `TALOS_DESKTOP_DATA_DIR`). */
async function semina() {
  const dati = process.env.TALOS_PW_STORE_ISOLATO;
  expect(dati, 'la prova vuole il server di prova con la sua cartella dati').toBeTruthy();
  const base = join(dati, CARTELLA_PROGETTI, nomeCartellaProgetto(await percorsoCanonico(cartella)));
  voce = await salvaVoce({ cartella: base, nome: 'Sales by month.html', mediaType: 'text/html', origine: 'generated', modello: MODELLO, sessionId: sessione, sessionNome: 'Sales report', testo: pagina('v1', '#334') });
  await aggiungiVersione({ cartella: base, id: voce, testo: pagina('v2', '#363'), modello: MODELLO, sessionId: sessione, sessionNome: 'Sales report' });
  await aggiungiVersione({ cartella: base, id: voce, testo: pagina('v3', '#633'), modello: MODELLO, sessionId: 'altra', sessionNome: 'Q2 planning' });
  return base;
}

test('ARTEFATTI-VERSIONI-01 — chat: ogni carta resta sulla sua versione, «v1 of 3» con la striscia, «Show latest» e ritorno', async ({ page }) => {
  const nonGet = await apri(page);
  const base = await semina();
  expect((await elencaVersioni({ cartella: base, id: voce })).length).toBe(3);
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sales report', modello, { conclusa: true, modello }), [sessione, MODELLO]);
  await page.waitForTimeout(800);
  await page.evaluate((voceId) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
    let s = 5000;
    for (const v of [1, 2]) r.handleRealEvent({ type: 'ArtifactCreated', messageId: `a${v}`, id: `mem-${v}`, titolo: 'Sales by month', voceLibreriaId: voceId, versione: v, _sequenza: s++ }, r.realSessionState.generation);
  }, voce);
  const carte = page.locator('.talos-artifact');
  await expect(carte).toHaveCount(2, { timeout: 10_000 });
  const prima = carte.nth(0);
  await expect(prima.locator('.talos-artifact__versione')).toHaveText('v1 of 3');
  await expect(carte.nth(1).locator('.talos-artifact__versione')).toHaveText('v2 of 3');
  await expect(prima.locator('.talos-artifact__avviso')).toContainText('Updated later in “Q2 planning”: v3 is the latest.');
  /* il contenuto: la carta del giro 1 mostra la v1, non l'ultima */
  await expect(prima.frameLocator('iframe').locator('h1')).toHaveText('v1');
  await expect(carte.nth(1).frameLocator('iframe').locator('h1')).toHaveText('v2');
  const srcPrima = await prima.locator('iframe').getAttribute('src');
  await prima.locator('[data-artefatto-ultima]').click();
  await expect(prima.locator('.talos-artifact__versione')).toHaveText('v3 of 3 · latest');
  await expect(prima.locator('[data-artefatto-ultima]')).toHaveText('Back to v1');
  await expect.poll(() => prima.locator('iframe').getAttribute('src')).not.toBe(srcPrima);
  /* AL CONTRARIO: e si torna alla versione di quel giro */
  await prima.locator('[data-artefatto-ultima]').click();
  await expect(prima.locator('.talos-artifact__versione')).toHaveText('v1 of 3');
  expect(nonGet.filter((r) => !r.endsWith('/pagine'))).toEqual([]);
});

test('ARTEFATTI-VERSIONI-02 — Libreria: le versioni nel dettaglio, guardare la v1 e ripristinarla (diventa la v4)', async ({ page }) => {
  const nonGet = await apri(page);
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sales report', modello, { conclusa: true, modello }), [sessione, MODELLO]);
  await page.getByRole('button', { name: /^Library \d+$/u }).click();
  const schermo = page.locator('#schermoLibreria');
  await schermo.getByText('Sales by month.html').first().click();
  const versioni = schermo.locator('.td-lib-versioni .td-lib-versione');
  await expect(versioni).toHaveCount(3, { timeout: 10_000 });
  await expect(versioni.first()).toContainText('v3');
  await expect(versioni.first()).toContainText('Latest');
  await expect(versioni.first()).toContainText('from the chat “Q2 planning”');
  await expect(versioni.first()).toHaveAttribute('aria-current', 'true');
  await versioni.last().click();
  const banda = schermo.locator('.td-lib-banda');
  await expect(banda).toContainText('You are looking at v1');
  /* revisione a blocco 3 (24/10/2026, S4): le date relative del bozzetto — la v1 è nata oggi, nella prova */
  await expect(versioni.last()).toContainText(/Today \d{2}:\d{2}/u);
  await expect(banda).toContainText(/from today at \d{2}:\d{2}/u);
  await expect(schermo.locator('.td-lib-versione[data-versione="1"]')).toHaveAttribute('aria-current', 'true');
  /* AL CONTRARIO: «Back to latest» non scrive niente */
  await banda.getByRole('button', { name: 'Back to latest' }).click();
  await expect(banda).toHaveCount(0);
  expect(nonGet.filter((r) => r.includes('/restore'))).toEqual([]);
  await schermo.locator('.td-lib-versione[data-versione="1"]').click();
  const risposta = page.waitForResponse((r) => r.url().includes('/restore'));
  await schermo.locator('.td-lib-banda').getByRole('button', { name: 'Restore this version' }).click();
  const r = await risposta;
  expect(r.status(), await r.text()).toBe(200);
  await expect(schermo.locator('.td-lib-versioni .td-lib-versione')).toHaveCount(4, { timeout: 10_000 });
  await expect(schermo.locator('.td-lib-versione').first()).toContainText('restored from v1');
  await expect(schermo.locator('.td-lib-banda')).toHaveCount(0);
  expect(nonGet.filter((r) => r.includes('/restore'))).toEqual([`POST /api/v1/sessions/${sessione}/library/${voce}/versions/1/restore`]);
});

test('ARTEFATTI-VERSIONI-REV3-A2 — su «Show latest», quando nasce una versione più nuova, la cornice la RICARICA (non solo l\'etichetta)', async ({ page }) => {
  /* revisione a blocco 3 (24/10/2026, D-A2): l'etichetta diceva «v4 of 4 · latest» e la cornice mostrava ancora la v3.
     ⛔ Dopo l'apertura della sessione la Libreria vive nella cartella dati del server (dati fuori dal progetto), non più nella
     cartella seminata: il totale si chiede al server e la versione nuova nasce dal ripristino del server, dalla pagina. Gira
     dopo la -02, che si aspetta tre versioni: qui la più recente è la v4 (= testo della v1) e il ripristino della v2 fa la v5. */
  await apri(page);
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sales report', modello, { conclusa: true, modello }), [sessione, MODELLO]);
  await page.waitForTimeout(800);
  const evento = (v, s) => page.evaluate(([voceId, versione, seq]) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'ArtifactCreated', messageId: `b${versione}`, id: `mem-b${versione}`, titolo: 'Sales by month', voceLibreriaId: voceId, versione, _sequenza: seq }, r.realSessionState.generation);
  }, [voce, v, s]);
  const chiedi = (percorso, metodo = 'GET') => page.evaluate(async ([p, m]) => (await fetch(p, { method: m })).json(), [percorso, metodo]);
  const base = `/api/v1/sessions/${sessione}/library/${voce}/versions`;
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation); });
  await evento(1, 6000);
  const prima = page.locator('.talos-artifact').first();
  await prima.locator('[data-artefatto-ultima]').click();
  const totale = (await chiedi(base)).data.totale;
  expect(totale).toBe(4);
  await expect(prima.locator('.talos-artifact__versione')).toHaveText(`v${totale} of ${totale} · latest`);
  await expect(prima.frameLocator('iframe').locator('h1')).toHaveText('v1');
  /* nasce una versione nuova (il ripristino della v2), e la sua carta lo annuncia alle sorelle */
  const nuova = await chiedi(`${base}/2/restore`, 'POST');
  expect(nuova.data?.versione, JSON.stringify(nuova)).toBe(totale + 1);
  await evento(nuova.data.versione, 6001);
  await expect(prima.locator('.talos-artifact__versione')).toHaveText(`v${totale + 1} of ${totale + 1} · latest`);
  /* AL CONTRARIO del difetto: non basta l'etichetta, la cornice mostra davvero il testo della versione nuova */
  await expect(prima.frameLocator('iframe').locator('h1')).toHaveText('v2', { timeout: 10_000 });
});

test('ARTEFATTI-VERSIONI-REV4-ART-1 — la versione nuova nasce PRIMA di «Show latest»: etichetta e cornice dicono la stessa versione', async ({ page }) => {
  /* revisione a blocco 4 (24/10/2026, REV4-ART-1, S3): il gestore del clic nasceva alla prima `disegnaVersioni` e ridisegnava con
     l'elenco di allora — «v5 of 5 · latest» a schermo mentre la cornice ricaricava la v6. Gira dopo la REV3-A2: la più recente è la
     v5 (= testo della v2); qui il ripristino della v3 fa la v6, PRIMA che la persona prema «Show latest». */
  const nonGet = await apri(page);
  await page.evaluate(([id, modello]) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sales report', modello, { conclusa: true, modello }), [sessione, MODELLO]);
  await page.waitForTimeout(800);
  const evento = (v, s) => page.evaluate(([voceId, versione, seq]) => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'ArtifactCreated', messageId: `c${versione}`, id: `mem-c${versione}`, titolo: 'Sales by month', voceLibreriaId: voceId, versione, _sequenza: seq }, r.realSessionState.generation);
  }, [voce, v, s]);
  const chiedi = (percorso, metodo = 'GET') => page.evaluate(async ([p, m]) => (await fetch(p, { method: m })).json(), [percorso, metodo]);
  const base = `/api/v1/sessions/${sessione}/library/${voce}/versions`;
  await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation); });
  await evento(1, 7000);
  const prima = page.locator('.talos-artifact').first();
  const totale = (await chiedi(base)).data.totale;
  expect(totale).toBe(5);
  await expect(prima.locator('.talos-artifact__versione')).toHaveText(`v1 of ${totale}`);
  /* la versione nuova nasce ORA (ripristino della v3) e la sua carta la annuncia: la nostra carta dice «v1 of 6» */
  const nuova = await chiedi(`${base}/3/restore`, 'POST');
  expect(nuova.data?.versione, JSON.stringify(nuova)).toBe(totale + 1);
  await evento(nuova.data.versione, 7001);
  await expect(prima.locator('.talos-artifact__versione')).toHaveText(`v1 of ${totale + 1}`);
  /* solo ADESSO la persona preme «Show latest» */
  await prima.locator('[data-artefatto-ultima]').click();
  await expect(prima.locator('.talos-artifact__versione')).toHaveText(`v${totale + 1} of ${totale + 1} · latest`);
  await expect(prima.frameLocator('iframe').locator('h1')).toHaveText('v3', { timeout: 10_000 });
  await expect(prima.locator('.talos-artifact__avviso')).toContainText(`${totale + 1}`);
  expect(nonGet.filter((r) => !/\/pagine$|\/restore$/u.test(r)), 'nessuna scrittura oltre le pagine e il ripristino').toEqual([]);
});
