import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ A7 (bugfixer, 08/10/2026) — IL CAMBIO DI SCHEDA DEL TERMINALE BLOCCAVA LA PAGINA PER SECONDI. Owner: «in app desktop con
 *   moltissime schede aperte». Misurato sulla 4176 con 8 schede piene: 1-4,5 s di compito lungo a ogni cambio (clic p50 4,7 s).
 *   Profilo: a ogni cambio si spegneva il WebGL delle schede nascoste, xterm tornava al renderer DOM e ridisegnava DA NASCOSTA
 *   misurando la larghezza di ogni riga (WidthCache._measure, un ricalcolo della pagina per riga). Ora il WebGL resta acceso su
 *   ogni scheda montata, come VS Code e Hermes (use-agent-terminal.ts:151-166).
 * Le prove guardano la CAUSA, non il cronometro (un tempo su questa macchina condivisa balla): il WebGL acceso su tutte le
 * schede visitate, e nessuna riga del renderer DOM (`.xterm-rows > div`) nata in nessuna scheda.
 * Nessuna shell vera: le schede vengono da un GET finto, le WebSocket non arrivano al server, ogni non-GET si ferma.
 */
test.use({ locale: 'it-IT' });

const SID = 'a7-webgl-schede';
const SCHEDE = [SID, 'a7-scheda-2', 'a7-scheda-3'];
const sse = 'retry: 3600000\n' + [{ type: 'RunStarted', input: { consegna: 'prova' }, contesto: { cartella: 'C:\\p' } }, { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }]
  .map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

async function apri(page) {
  await page.routeWebSocket('**/api/v1/terminal/ws**', () => { /* nessuna shell vera */ });
  await page.route(`**/api/v1/sessions/${SID}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse }));
  await page.route(`**/api/v1/sessions/${SID}/children`, (route) => route.fulfill({ json: { ok: true, data: { figli: [] } } }));
  await page.route(`**/api/v1/sessions/${SID}/tree*`, (route) => route.fulfill({ json: { ok: true, data: { voci: [] } } }));
  await page.route(`**/api/v1/sessions/${SID}/terminals`, (route) => (route.request().method() === 'GET'
    ? route.fulfill({ json: { ok: true, data: { items: SCHEDE.map((terminalId, i) => ({ terminalId, cartella: 'C:\\p', origine: i === 0 ? 'prima-scheda' : 'persona' })) } } })
    : route.abort()));
  const scritture = [];
  await page.route('**/api/v1/**', (route) => {
    const r = route.request();
    if (r.method() !== 'GET') { scritture.push(`${r.method()} ${r.url()}`); return route.abort(); }
    return route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'A7', 'z-ai/glm-5.3-flash', { conclusa: true }), SID);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.keyboard.press('Control+Backquote');
  await expect(page.locator('#schermoTerminale [role=tab][data-terminale-id]')).toHaveCount(SCHEDE.length);
  return scritture;
}

const scheda = (page, id) => page.locator(`#schermoTerminale [role=tab][data-terminale-id="${id}"]`);
const stato = (page) => page.evaluate(() => {
  const t = window.__talosHarnessUiRuntime.statoTerminale();
  return {
    attiva: t.attiva,
    montate: [...t.schede.values()].filter((r) => r.term).map((r) => r.terminalId),
    conWebgl: [...t.schede.values()].filter((r) => r.webgl).map((r) => r.terminalId),
    righeDom: document.querySelectorAll('#realTerminalMount .xterm-rows > div').length,
    tele: document.querySelectorAll('#realTerminalMount canvas').length,
  };
});

async function visitaTutte(page) {
  for (const id of [...SCHEDE, ...SCHEDE]) {
    await scheda(page, id).click();
    await expect.poll(async () => (await stato(page)).attiva).toBe(id);
    await page.waitForTimeout(150); // il fit e il ridisegno della scheda partono al fotogramma dopo
  }
}

test('A7-01 — passando fra le schede il WebGL resta acceso su tutte, e il renderer DOM non nasce in nessuna', async ({ page }) => {
  const scritture = await apri(page);
  await expect.poll(async () => (await stato(page)).montate.length).toBe(1);
  test.skip((await stato(page)).conWebgl.length === 0, 'questo browser non ha WebGL: la prova non ha oggetto');
  await visitaTutte(page);
  const s = await stato(page);
  expect(s.montate.sort(), 'tutte e tre montate').toEqual([...SCHEDE].sort());
  expect(s.conWebgl.sort(), 'il WebGL di una scheda nascosta non si spegne').toEqual([...SCHEDE].sort());
  expect(s.righeDom, 'nessuna riga del renderer DOM: una scheda nascosta senza WebGL ridisegna da nascosta (secondi)').toBe(0);
  expect(scritture).toEqual([]);
});

test('A7-02 — chiusa una scheda, i fratelli ripuliscono l\'atlante TUTTI prima di ridisegnarsi (Hermes terminals.ts:11-27)', async ({ page }) => {
  await apri(page);
  test.skip((await stato(page)).conWebgl.length === 0, 'questo browser non ha WebGL: la prova non ha oggetto');
  await visitaTutte(page);
  await page.evaluate(() => {
    window.__a7 = [];
    for (const r of window.__talosHarnessUiRuntime.statoTerminale().schede.values()) {
      if (!r.webgl) continue;
      const pulisci = r.webgl.clearTextureAtlas.bind(r.webgl);
      r.webgl.clearTextureAtlas = () => { window.__a7.push(`pulisci ${r.terminalId}`); return pulisci(); };
      const ridisegna = r.term.refresh.bind(r.term);
      r.term.refresh = (a, b) => { window.__a7.push(`ridisegna ${r.terminalId}`); return ridisegna(a, b); };
    }
  });
  await scheda(page, SCHEDE[1]).click({ button: 'middle' }); // il clic centrale chiude (schede.js, `auxclick`)
  await expect.poll(async () => (await stato(page)).montate.sort()).toEqual([SCHEDE[0], SCHEDE[2]].sort());
  const log = await page.evaluate(() => window.__a7);
  const pulizie = log.filter((v) => v.startsWith('pulisci')).map((v) => v.split(' ')[1]).sort();
  expect(pulizie, 'ogni fratello vivo ripulisce l\'atlante').toEqual([SCHEDE[0], SCHEDE[2]].sort());
  const ultimaPulizia = log.map((v) => v.startsWith('pulisci')).lastIndexOf(true);
  const primoRidisegno = log.findIndex((v) => v.startsWith('ridisegna'));
  expect(primoRidisegno, 'e poi si ridisegnano').toBeGreaterThan(-1);
  expect(ultimaPulizia, 'prima TUTTE le pulizie, poi i ridisegni').toBeLessThan(primoRidisegno);
  expect((await stato(page)).righeDom).toBe(0);
});

/* Review del collega (08/10): la perdita del contesto spegneva l'addon da sé, senza il rinfresco a due fasi dei fratelli. Si perde
   il contesto di una scheda NASCOSTA (WEBGL_lose_context); l'addon aspetta 3 s un ripristino prima di dichiararla persa. */
test('A7-04 — una scheda nascosta perde il contesto WebGL: i fratelli vivi ripuliscono l\'atlante prima di ridisegnarsi', async ({ page }) => {
  await apri(page);
  test.skip((await stato(page)).conWebgl.length === 0, 'questo browser non ha WebGL: la prova non ha oggetto');
  await visitaTutte(page); // l'attiva è l'ultima, la prima resta nascosta
  const persa = await page.evaluate((id) => {
    window.__a7 = [];
    const t = window.__talosHarnessUiRuntime.statoTerminale();
    for (const r of t.schede.values()) {
      if (!r.webgl || r.terminalId === id) continue;
      const pulisci = r.webgl.clearTextureAtlas.bind(r.webgl);
      r.webgl.clearTextureAtlas = () => { window.__a7.push(`pulisci ${r.terminalId}`); return pulisci(); };
      const ridisegna = r.term.refresh.bind(r.term);
      r.term.refresh = (a, b) => { window.__a7.push(`ridisegna ${r.terminalId}`); return ridisegna(a, b); };
    }
    for (const c of t.schede.get(id).mount.querySelectorAll('canvas')) {
      const ext = c.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (ext) { ext.loseContext(); return true; }
    }
    return false;
  }, SCHEDE[0]);
  test.skip(!persa, 'questo browser non offre WEBGL_lose_context: la prova non ha oggetto');
  await expect.poll(async () => (await stato(page)).conWebgl.includes(SCHEDE[0]), { timeout: 8_000 }).toBe(false);
  const log = await page.evaluate(() => window.__a7);
  const pulizie = log.filter((v) => v.startsWith('pulisci')).map((v) => v.split(' ')[1]).sort();
  expect(pulizie, 'i fratelli vivi ripuliscono l\'atlante').toEqual([SCHEDE[1], SCHEDE[2]].sort());
  const ultimaPulizia = log.map((v) => v.startsWith('pulisci')).lastIndexOf(true);
  const primoRidisegno = log.findIndex((v) => v.startsWith('ridisegna'));
  expect(primoRidisegno, 'e poi si ridisegnano').toBeGreaterThan(-1);
  expect(ultimaPulizia, 'prima TUTTE le pulizie, poi i ridisegni').toBeLessThan(primoRidisegno);
});

test('A7-03 AL CONTRARIO — al cambio di sessione si smonta tutto: nessuna tela WebGL resta appesa', async ({ page }) => {
  await apri(page);
  test.skip((await stato(page)).conWebgl.length === 0, 'questo browser non ha WebGL: la prova non ha oggetto');
  await visitaTutte(page);
  expect((await stato(page)).tele).toBeGreaterThanOrEqual(SCHEDE.length);
  const ALTRA = 'a7-altra-sessione';
  await page.route(`**/api/v1/sessions/${ALTRA}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: sse }));
  await page.route(`**/api/v1/sessions/${ALTRA}/terminals`, (route) => (route.request().method() === 'GET'
    ? route.fulfill({ json: { ok: true, data: { items: [{ terminalId: ALTRA, cartella: 'C:\\p', origine: 'prima-scheda' }] } } })
    : route.abort()));
  await page.evaluate(() => { window.__teleVecchie = [...document.querySelectorAll('#realTerminalMount canvas')]; });
  await page.evaluate((s) => window.__talosHarnessUiRuntime.passaASessione(s, 'workspace', 'Altra', 'z-ai/glm-5.3-flash', { conclusa: true }), ALTRA);
  await expect.poll(async () => (await stato(page)).montate).not.toContain(SCHEDE[0]);
  const s = await stato(page);
  expect(s.conWebgl.filter((id) => SCHEDE.includes(id)), 'nessun WebGL della sessione di prima').toEqual([]);
  expect(await page.evaluate(() => window.__teleVecchie.filter((c) => c.isConnected).length), 'le tele di prima sono uscite dal documento').toBe(0);
  expect(await page.evaluate(() => document.querySelector('#realTerminalMount').children.length), 'restano solo i montaggi della sessione nuova').toBe(s.montate.length);
});
