import { test, expect } from '@playwright/test';

/*
 * Owner 29/10/2026 sera: «se fermo la chat i sub agenti non si fermano, bisogna mettere un avviso se stoppare solo la chat o anche i
 * sub agenti». Bozzetto approvato («Sì, procedi»), contratto CONTRATTO-FERMA-TUTTE-2026-10-29:
 *  · con figlie al lavoro lo Stop apre un piccolo menu sopra di sé — «Ferma tutto» in evidenza, «Ferma solo la chat», «Ricorda la scelta»;
 *  · senza figlie al lavoro lo Stop resta immediato e il corpo è quello di sempre (nessun campo nuovo);
 *  · Esc chiede le stesse due cose nel velo «Fermo il giro?»;
 *  · l'evento durevole `talos.figlie-fermate` mette in chat «Fermati anche N agenti».
 * Scena rigiocata dal browser: le richieste che scriverebbero (lo stop) non arrivano MAI al server: si fermano qui e si contano.
 */
/*
 * Owner 29/10/2026 sera, «Stop anche a chat ferma» (bozzetto approvato, artefatto WDPW8bCzscCLThw73JssmZ v2). Trovato dal vivo sul 4174: la
 * chat avvia due agenti, risponde e il suo giro FINISCE; il compositore mostrava solo Invia e «Ferma tutto» non si raggiungeva.
 * Ora accanto a Invia c'è lo Stop «Ferma i N agenti»: li ferma SUBITO con la rotta di «Ferma tutto» (`figlie:'tutte'`), senza menu.
 * La riga in chat, con `chatFerma`, dice «Fermati N agenti» senza «anche». Ogni prova ha il suo verso contrario.
 */
const SESSIONE = 'sp-stop-chat-ferma';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const FINITA = [
  { type: 'RunStarted', threadId: 't', runId: 'r-1', input: { consegna: 'Dividi il lavoro fra due agenti' } },
  { type: 'RunFinished', threadId: 't', runId: 'r-1' },
];
const figlia = (sessionId, taskCorto, conclusa) => ({ sessionId, task: `Compito: ${taskCorto}`, taskCorto, conclusa, interrotta: false,
  avviataAlle: new Date().toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', collisioni: [], esitoDelega: conclusa ? 'concluso' : null,
  attivita: { file: [], fileTagliati: 0, attrezzoCorrente: conclusa ? null : 'leggi', chiamate: 1, passi: [], passiTagliati: 0 } });
const DUE_AL_LAVORO = [figlia('sc-f1', 'riassumi', false), figlia('sc-f2', 'conta', false), figlia('sc-f3', 'già fatta', true)];

async function apri(page, { figli = DUE_AL_LAVORO, eventi = FINITA, tema = 'light' } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const conto = { stop: [], altreScritture: [] };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    const m = percorso.match(new RegExp(`^/api/v1/sessions/${SESSIONE}/(.+)$`));
    if (m && req.method() === 'POST' && m[1] === 'stop') { conto.stop.push(req.postDataJSON()); return route.fulfill({ json: busta({ stopped: true, figlieFermate: 2 }) }); }
    if (req.method() !== 'GET') { conto.altreScritture.push(percorso); return route.abort(); }
    if (m) {
      if (m[1] === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...eventi.map((e, i) => ({ ...e, _sequenza: i + 1 })), CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (m[1] === 'children') return route.fulfill({ json: busta({ figli }) });
      if (m[1] === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Stop a chat ferma', 'prova/modello', { conclusa: true, modello: 'prova/modello' });
  }, SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('.talos-caricamento-cronologia')).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => (window.__talosHarnessUiRuntime.realSessionState.figli || []).length)).toBe(figli.length);
  return conto;
}
const fermaAgenti = (page) => page.locator('#fermaAgentiButton');

test('SAF-UI-01 chat ferma con 2 agenti al lavoro: accanto a Invia lo Stop «Ferma i 2 agenti», e il clic li ferma subito con figlie:tutte', async ({ page }) => {
  const conto = await apri(page);
  await expect(page.locator('.send-btn')).not.toHaveClass(/is-stop/);
  await expect(fermaAgenti(page)).toBeVisible();
  await expect(fermaAgenti(page)).toHaveAttribute('aria-label', 'Ferma i 2 agenti');
  await page.screenshot({ path: 'artifacts/stop-a-chat-ferma/chiaro.png' });
  await fermaAgenti(page).click();
  await expect.poll(() => conto.stop.length).toBe(1);
  expect(conto.stop[0]).toEqual({ figlie: 'tutte' });
  await expect(page.locator('#menuStop')).toBeHidden(); // niente menu: la chat è già ferma
  expect(conto.altreScritture).toEqual([]);
});

test('SAF-UI-02 AL CONTRARIO: senza agenti al lavoro lo Stop degli agenti non c\'è', async ({ page }) => {
  await apri(page, { figli: [figlia('sc-f3', 'già fatta', true)] });
  await expect(fermaAgenti(page)).toBeHidden();
});

test('SAF-UI-03 la riga in chat: con chatFerma «Fermati 2 agenti» (senza «anche»); AL CONTRARIO senza chatFerma la riga di sempre', async ({ page }) => {
  const evento = (chatFerma) => ({ type: 'CUSTOM', name: 'talos.figlie-fermate', value: { quante: 2, ids: ['sc-f1', 'sc-f2'], da: 'persona', ...(chatFerma ? { chatFerma: true } : {}) } });
  await apri(page, { eventi: [...FINITA, evento(true)], figli: [] });
  await expect(page.locator('#conversation')).toContainText('Fermati 2 agenti');
  await expect(page.locator('#conversation')).not.toContainText('Fermati anche');
  await apri(page, { eventi: [...FINITA, evento(false)], figli: [] });
  await expect(page.locator('#conversation')).toContainText('Fermati anche 2 agenti');
  // li ferma il MODELLO: il suo giro continua, quindi niente «anche» anche senza chatFerma
  await apri(page, { eventi: [...FINITA, { ...evento(false), value: { ...evento(false).value, da: 'modello' } }], figli: [] });
  await expect(page.locator('#conversation')).toContainText('Fermati 2 agenti');
  await expect(page.locator('#conversation')).toContainText('Fermati dal modello su richiesta');
  await expect(page.locator('#conversation')).not.toContainText('Fermati anche');
});

test('SAF-UI-04 tema scuro: lo Stop degli agenti è tondo come Invia e accanto a lui', async ({ page }) => {
  await apri(page, { tema: 'dark' });
  const [stop, invia] = await Promise.all([fermaAgenti(page).boundingBox(), page.locator('.send-btn').boundingBox()]);
  expect(Math.abs(stop.height - invia.height)).toBeLessThanOrEqual(1);
  expect(Math.abs((stop.y + stop.height / 2) - (invia.y + invia.height / 2))).toBeLessThanOrEqual(1);
  expect(stop.x + stop.width).toBeLessThanOrEqual(invia.x);
  await page.screenshot({ path: 'artifacts/stop-a-chat-ferma/scuro.png' });
});
